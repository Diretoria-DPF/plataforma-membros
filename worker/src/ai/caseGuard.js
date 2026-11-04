/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/caseGuard.js
 * Guardrails do gerador de casos clínicos (CLI-04). Funções PURAS, sem I/O e sem chamar modelo:
 *   - screenTopic: o tema livre digitado pela pessoa, ANTES de gastar cota e de ir ao modelo. Recusa instrução de
 *     prompt, dado pessoal, link, pedido fora do escopo clínico educativo e pedido perigoso (síntese, dano a outra
 *     pessoa, método de autoagressão). Reaproveita as regras I2, I3, I4 e I7 dos guardrails dos agentes.
 *   - screenGeneratedCase: a saída do modelo, DEPOIS da validação de forma (validators.js). Confere tamanhos mínimos,
 *     plausibilidade dos sinais vitais, ausência de link, HTML e e-mail, de conteúdo instrucional de autoagressão e de
 *     síntese; e troca qualquer dose numérica da conduta por "conforme protocolo vigente" (o caso gerado não tem
 *     fonte para a dose, então o número não pode ir adiante).
 * Regex lineares: sem quantificador aninhado, lacunas limitadas.
 */
import { cleanText } from './validators.js';
import { checkInput } from '../agents/guardrails/input.js';
import { fold, stripInvisible } from '../agents/guardrails/rules.js';

export const TOPIC_MAX_CHARS = 200;
export const DOSE_PLACEHOLDER_TEXT = 'conforme protocolo vigente';

const TOPIC_MESSAGES = Object.freeze({
  forma: 'Descreva o tema do caso em uma frase (ex.: intoxicação por paracetamol).',
  tamanho: 'O tema passou do limite de ' + TOPIC_MAX_CHARS + ' caracteres. Resuma em uma frase.',
  link: 'O tema não pode ter links, endereços de site nem e-mail. Descreva só o agravo clínico.',
  injecao: 'O tema deve descrever apenas um agravo de farmacologia ou toxicologia. Reescreva sem instruções.',
  dado_pessoal: 'O tema não pode ter dados pessoais. Descreva só o agravo clínico.',
  ofensa: 'Vamos manter o respeito. Reescreva o tema como um agravo clínico de estudo.',
  fora_de_escopo: 'Só gero casos de farmacologia e toxicologia clínica para estudo. Escolha um tema desses.',
  conteudo_perigoso: 'Não gero casos que peçam instruções de dano, síntese de substâncias ou métodos de autoagressão. Escolha um agravo clínico para estudo.',
});

const RULE_TO_REASON = Object.freeze({ I2: 'injecao', I3: 'dado_pessoal', I4: 'ofensa', I7: 'fora_de_escopo', I1: 'forma' });

// ---------------------------------------------------------------------------
// Padrões (texto já dobrado por `fold`: minúsculo, sem acento)
// ---------------------------------------------------------------------------
const LINK_RE = /(?:https?:|ftp:|www\.|\bt\.me\/|\b[a-z0-9-]{2,40}\.(?:com|net|org|gov|edu|br|io|ru|xyz|me|info|app|dev|ly)\b|[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}\.[a-z]{2,})/;
const HTML_RE = /<\/?\s*[a-z][^>]{0,80}>|&lt;\s*script|javascript:/i;

const SELF_HARM_CUE = /\b(?:me matar|se matar|nos matar|suicid\w{0,10}|tirar (?:a )?(?:minha|propria|sua) vida|autoextermin\w{0,8}|acabar com (?:a )?(?:minha|propria) vida)\b/;
const SELF_HARM_INSTRUCTION = /\b(?:como (?:se |me )?(?:matar|cometer|tirar)|passo a passo|melhor (?:metodo|forma|maneira)|metodo (?:de|para|mais|eficaz|infalivel)|quantidade (?:necessaria|suficiente)|dose (?:letal|fatal|suficiente|necessaria)|sem deixar rastro|sem (?:sentir )?dor|garantir (?:a )?morte|para morrer|pra morrer)\b/;

const HARM_OTHERS = [
  /\b(?:envenenar|assassinar|intoxicar propositalmente)\b.{0,30}\b(?:alguem|pessoa|pessoas|marido|esposa|mulher|vizinh\w{1,3}|colega|chefe|crianca|idos\w{1,3}|animal)\b/,
  /\bmatar\b.{0,20}\b(?:alguem|uma pessoa|pessoas|o marido|a esposa)\b/,
  /\bsem (?:deixar rastros?|ser (?:descoberto|detectado|percebido))\b/,
];
const SYNTH_ACTION = /\b(?:fabric\w{1,8}|sintetiz\w{1,8}|cozinh\w{1,6}|extrair|produzir|preparar|obter)\b/;
const SYNTH_TARGET = /\b(?:veneno|drogas?|explosiv\w{1,3}|armas?|bombas?|metanfetamina|cocaina|crack|lsd|fentanil|gas toxico|arma quimica)\b/;
const SYNTH_STEPS = /\b(?:passo a passo|receita caseira|em casa|sem receita)\b/;

function isDangerousRequest(folded) {
  if (SELF_HARM_CUE.test(folded) && SELF_HARM_INSTRUCTION.test(folded)) return true;
  if (/\bdose (?:letal|fatal)\b.{0,30}\b(?:me|se) mat\w{1,3}\b/.test(folded)) return true;
  if (HARM_OTHERS.some((re) => re.test(folded))) return true;
  return SYNTH_ACTION.test(folded) && SYNTH_TARGET.test(folded) && (SYNTH_STEPS.test(folded) || /\b(?:como|passo|instruc\w{1,5}|tutorial)\b/.test(folded));
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------
function refuseTopic(reason) {
  return { ok: false, reason, message: TOPIC_MESSAGES[reason] || TOPIC_MESSAGES.forma };
}

/**
 * @param {unknown} rawTopic texto livre do cliente
 * @returns {{ ok: true, topic: string } | { ok: false, reason: string, message: string }}
 */
export function screenTopic(rawTopic) {
  if (typeof rawTopic !== 'string') return refuseTopic('forma');
  const topic = stripInvisible(cleanText(rawTopic)).replace(/\s+/g, ' ').trim();
  if (!topic) return refuseTopic('forma');
  if (topic.length > TOPIC_MAX_CHARS) return refuseTopic('tamanho');

  const folded = fold(topic);
  if (LINK_RE.test(folded)) return refuseTopic('link');

  const verdict = checkInput(topic, { maxChars: TOPIC_MAX_CHARS, rules: ['I2', 'I3', 'I4', 'I7'] });
  if (!verdict.ok) return refuseTopic(RULE_TO_REASON[verdict.rule] || 'forma');
  if (HTML_RE.test(topic)) return refuseTopic('link');

  if (isDangerousRequest(folded)) return refuseTopic('conteudo_perigoso');
  return { ok: true, topic };
}

// ---------------------------------------------------------------------------
// Doses: o caso gerado não traz fonte, então o número vira "conforme protocolo vigente"
// ---------------------------------------------------------------------------
const PLACEHOLDER = String.fromCharCode(0xE000);
const AMOUNT_RE = /\d+(?:[.,]\d+)?(?:\s?(?:a|até|ate|-|–|e)\s?\d+(?:[.,]\d+)?)?\s?(?:mg|mcg|µg|μg|ug|g|ml|ui|u|meq|mmol|comprimidos?|cápsulas?|capsulas?|ampolas?|gotas?|frascos?|doses?)(?:\s?\/\s?(?:kg|h|hora|min|dia)){0,3}(?![\p{L}\d])/giu;
const INTERVAL_RE = /\ba cada\s+\d+(?:[.,]\d+)?(?:\s?(?:a|até|ate|-|–)\s?\d+(?:[.,]\d+)?)?\s?(?:min(?:utos?)?|h(?:oras?)?|dias?)(?![\p{L}])/giu;
const SCHEDULE_RES = [/(?<![\d/])\d{1,2}\s?\/\s?\d{1,2}\s?h(?![\p{L}])/giu, /(?<!\d)\d{1,2}\s?x\s?(?:\/|ao|por)?\s?(?:dia|d)(?![\p{L}])/giu];
const PLACEHOLDER_RUN_RE = new RegExp(PLACEHOLDER + '(?:[\\s,;]*(?:e\\s+)?' + PLACEHOLDER + ')+', 'g');
const PLACEHOLDER_RE = new RegExp(PLACEHOLDER, 'g');

function redactWithCount(text) {
  let count = 0;
  const mark = () => { count += 1; return PLACEHOLDER; };
  let out = String(text).replace(AMOUNT_RE, mark).replace(INTERVAL_RE, mark);
  SCHEDULE_RES.forEach((re) => { out = out.replace(re, mark); });
  out = out.replace(PLACEHOLDER_RUN_RE, PLACEHOLDER).replace(PLACEHOLDER_RE, DOSE_PLACEHOLDER_TEXT);
  return { text: out, count };
}

/** Texto sem quantidades nem posologia de medicamento (cada uma vira "conforme protocolo vigente"). */
export function redactDoses(text) {
  return redactWithCount(text).text;
}

// ---------------------------------------------------------------------------
// Caso gerado
// ---------------------------------------------------------------------------
const MIN_LENGTHS = Object.freeze({ queixa: 8, historico: 20, exposicao: 15, diagnostico: 5, conduta: 20, laudo: 4 });
const VITAL_LIMITS = Object.freeze({ fc: [20, 300], fr: [4, 80], spo2: [30, 100], temp: [25, 45], glasgow: [3, 15] });

function collectStrings(value, out) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.keys(value).forEach((k) => collectStrings(value[k], out));
  return out;
}

function firstNumber(text) {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(text || ''));
  return m ? Number(m[0].replace(',', '.')) : null;
}

function inRange(text, limits) {
  const n = firstNumber(text);
  return n === null || (n >= limits[0] && n <= limits[1]);
}

function vitalsPlausible(v) {
  if (!v || typeof v !== 'object') return false;
  if (!Object.keys(VITAL_LIMITS).every((k) => inRange(v[k], VITAL_LIMITS[k]))) return false;
  const pa = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(String(v.pa || ''));
  if (!pa) return true;
  const sys = Number(pa[1]);
  const dia = Number(pa[2]);
  return sys >= 40 && sys <= 300 && dia >= 20 && dia <= 200 && dia <= sys;
}

function longEnough(text, min) {
  return typeof text === 'string' && text.replace(/\s+/g, ' ').trim().length >= min;
}

function hasLetterOrDigit(text) {
  return /[\p{L}\d]/u.test(String(text || ''));
}

function structureProblem(c) {
  const gab = c.gabaritoPreceptor || {};
  const oculto = c.contextoOculto || {};
  if (!longEnough(c.queixaPrincipal, MIN_LENGTHS.queixa)) return 'queixa_curta';
  if (!longEnough(c.historicoAdmissao, MIN_LENGTHS.historico)) return 'historico_curto';
  if (!longEnough(oculto.exposicaoReal, MIN_LENGTHS.exposicao)) return 'exposicao_curta';
  if (!longEnough(gab.diagnostico, MIN_LENGTHS.diagnostico)) return 'diagnostico_curto';
  if (!longEnough(gab.conduta, MIN_LENGTHS.conduta)) return 'conduta_curta';
  const exams = Array.isArray(c.examesDisponiveis) ? c.examesDisponiveis : [];
  if (exams.some((e) => !longEnough(e && e.resultado, MIN_LENGTHS.laudo) || !hasLetterOrDigit(e.resultado))) return 'laudo_vazio';
  if (!vitalsPlausible(c.sinaisVitais)) return 'sinais_vitais_implausiveis';
  return null;
}

function textProblem(strings) {
  for (const s of strings) {
    const folded = fold(s);
    if (LINK_RE.test(folded) || HTML_RE.test(s)) return 'link_ou_marcacao';
    if (isDangerousRequest(folded)) return 'conteudo_perigoso';
  }
  return null;
}

/**
 * @param {object} generated caso já normalizado por validateGeneratedCase
 * @returns {{ ok: true, case: object, doseRedactions: number } | { ok: false, reason: string }}
 */
export function screenGeneratedCase(generated) {
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) return { ok: false, reason: 'nao_e_objeto' };
  const structure = structureProblem(generated);
  if (structure) return { ok: false, reason: structure };
  const text = textProblem(collectStrings(generated, []));
  if (text) return { ok: false, reason: text };

  const copy = JSON.parse(JSON.stringify(generated));
  const redacted = redactWithCount(copy.gabaritoPreceptor.conduta);
  copy.gabaritoPreceptor.conduta = redacted.text;
  return { ok: true, case: copy, doseRedactions: redacted.count };
}
