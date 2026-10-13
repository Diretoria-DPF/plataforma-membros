/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/vocabulary.js
 * Vocabulário CONTROLADO da memória de estudo (ADR 0007). É o que torna impossível guardar texto livre: tudo o que
 * entra na memória é (tipo, tema do vocabulário, nível 1–5, valor de lista fechada). Os temas vêm dos módulos de
 * Aprender (simulados de Farmacologia e Toxicologia, Anatomia) e ficam no nível de CONCEITO ou CLASSE, nunca de
 * paciente, doença de uma pessoa ou medicamento de alguém. Puro: sem I/O.
 *
 *   topic_level  nível de domínio do tema (1–5); vem de simulado (acertos) ou de autoavaliação do membro
 *   difficulty   tema com dúvida/dificuldade recorrente (nível = recorrência); vem de simulado ou de pergunta ao tutor
 *   study_pref   preferência de estudo (formato, profundidade, ritmo); definida pelo próprio membro
 *   goal         objetivo de estudo (prova, revisão, aprofundamento, monitoria); definido pelo próprio membro
 *
 * As palavras-chave só servem para MAPEAR o que o estudante escreveu a um tema; o texto nunca é guardado.
 */
import { MEMORY } from '../constants.js';

export const KINDS = Object.freeze(['topic_level', 'difficulty', 'study_pref', 'goal']);
export const SOURCES = Object.freeze(['quiz', 'tutor', 'member']);
export const DIFFICULTY_VALUES = Object.freeze(['dificil', 'confuso', 'duvida']);

/** Cada preferência com os valores permitidos. */
export const PREFERENCES = Object.freeze({
  formato: Object.freeze(['exemplos', 'resumo', 'passo_a_passo', 'analogias']),
  profundidade: Object.freeze(['basico', 'intermediario', 'avancado']),
  ritmo: Object.freeze(['curto', 'detalhado']),
});

export const GOALS = Object.freeze(['prova', 'revisao', 'aprofundamento', 'monitoria']);

/** Palavras que terminam em `$` casam a palavra inteira; as demais casam como início de palavra (radical). */
const TOPIC_DEFS = [
  ['farmacodinamica', 'Farmacodinâmica', ['farmacodinam', 'agonista', 'antagonista', 'afinidade', 'eficacia intrinseca', 'curva dose-resposta']],
  ['farmacocinetica', 'Farmacocinética', ['farmacocinet', 'biodisponibilidade', 'meia-vida', 'meia vida', 'clearance', 'depuracao', 'volume de distribuicao', 'primeira passagem']],
  ['sistema-nervoso-autonomo', 'Sistema nervoso autônomo', ['sistema nervoso autonomo', 'colinergic', 'adrenergic', 'muscarinic', 'nicotinic', 'simpatic', 'parassimpatic']],
  ['psicofarmacos', 'Psicofármacos', ['psicofarmac', 'antidepressiv', 'ansiolitic', 'antipsicotic', 'benzodiazep']],
  ['glicocorticoides', 'Glicocorticoides', ['glicocorticoid', 'corticoide', 'cortisol']],
  ['farmacologia-endocrina', 'Farmacologia endócrina', ['insulina', 'hipoglicemiant', 'hormonio tireoidiano', 'farmacologia endocrina']],
  ['diureticos', 'Diuréticos', ['diuretic', 'furosemida', 'tiazid']],
  ['dislipidemias', 'Dislipidemias', ['dislipidemia', 'estatina', 'hipolipemiante']],
  ['coagulacao', 'Coagulação', ['coagulacao', 'anticoagul', 'antiagregante', 'heparina', 'varfarina']],
  ['antimicrobianos', 'Antimicrobianos', ['antimicrobian', 'antibiotic', 'beta-lactam', 'resistencia bacteriana']],
  ['anti-hipertensivos', 'Anti-hipertensivos', ['anti-hipertensiv', 'anti hipertensiv', 'ieca$', 'bloqueador de angiotensina']],
  ['aines', 'AINEs', ['aines$', 'aine$', 'anti-inflamatorio', 'ciclooxigenase', 'cox-2', 'cox2$']],
  ['toxicocinetica', 'Toxicocinética', ['toxicocinet']],
  ['toxicodinamica', 'Toxicodinâmica', ['toxicodinam']],
  ['antidotos', 'Antídotos', ['antidoto', 'acetilcisteina', 'naloxona', 'flumazenil']],
  ['toxicologia-hepatica', 'Toxicologia hepática', ['hepatotoxic', 'lesao hepatica']],
  ['toxicologia-renal', 'Toxicologia renal', ['nefrotoxic', 'lesao renal']],
  ['interacoes-medicamentosas', 'Interações medicamentosas', ['interacao medicamentosa', 'interacoes medicamentosas', 'inducao enzimatica', 'inibicao enzimatica', 'citocromo']],
  ['reacoes-adversas', 'Reações adversas', ['reacao adversa', 'reacoes adversas', 'efeito colateral', 'efeitos colaterais', 'farmacovigilancia']],
  ['farmacotecnica', 'Farmacotécnica', ['farmacotecnica', 'formulacao', 'excipiente', 'emulsao']],
  // Temas gerais por módulo: só entram por sinal de simulado (sem palavras-chave: "farmacologia" aparece em tudo).
  ['farmacologia-geral', 'Farmacologia (geral)', []],
  ['toxicologia-geral', 'Toxicologia (geral)', []],
  ['anatomia-geral', 'Anatomia (geral)', []],
];

const MODULE_TOPIC = Object.freeze({ farmacologia: 'farmacologia-geral', toxicologia: 'toxicologia-geral', anatomia: 'anatomia-geral' });

export const TOPICS = Object.freeze(TOPIC_DEFS.reduce((acc, [slug, label]) => Object.assign(acc, { [slug]: Object.freeze({ slug, label }) }), {}));
const TOPIC_SLUGS = new Set(TOPIC_DEFS.map(([slug]) => slug));

const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** Minúsculas, sem acento. */
export function normalizeText(text) {
  return String(text === null || text === undefined ? '' : text).normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function keywordSource(word) {
  const exact = word.endsWith('$');
  const stem = escapeRe(exact ? word.slice(0, -1) : word).replace(/ /g, '\\s+');
  return '(?<![a-z0-9])' + stem + (exact ? '(?![a-z0-9])' : '');
}

const MATCHERS = TOPIC_DEFS.filter(([, , words]) => words.length)
  .map(([slug, , words]) => ({ slug, re: new RegExp('(?:' + words.map(keywordSource).join('|') + ')') }));

export const isTopic = (slug) => typeof slug === 'string' && TOPIC_SLUGS.has(slug);

/** Temas do vocabulário citados no texto (em ordem do vocabulário, no máximo `max`). Nada do texto é guardado. */
export function matchTopics(text, max = MEMORY.SIGNAL_TOPICS_MAX) {
  const normal = normalizeText(text).slice(0, 4000);
  if (!normal) return [];
  return MATCHERS.filter((m) => m.re.test(normal)).map((m) => m.slug).slice(0, max);
}

/** Tema geral do módulo do simulado, ou null. */
export const moduleTopic = (module) => MODULE_TOPIC[module] || null;

/** Nível 1–5 a partir do percentual de acertos de um simulado. */
export function levelFromAccuracy(correct, total) {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || correct < 0 || correct > total) return null;
  const pct = (correct / total) * 100;
  if (pct >= 90) return 5;
  if (pct >= 75) return 4;
  if (pct >= 55) return 3;
  if (pct >= 35) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Validação do que o MEMBRO define (nunca texto livre)
// ---------------------------------------------------------------------------
export class MemoryInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MemoryInputError';
  }
}

const MEMBER_KINDS = Object.freeze(['topic_level', 'study_pref', 'goal']);
const ALLOWED_KEYS = Object.freeze(['kind', 'slug', 'level', 'value']);
const fail = (message) => { throw new MemoryInputError(message); };
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null;

function assertShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Informe o que deseja guardar.');
  const extra = Object.keys(input).filter((k) => !ALLOWED_KEYS.includes(k) && input[k] !== undefined);
  if (extra.length) fail('Só é possível escolher itens da lista; texto livre não é aceito.');
  if (typeof input.kind !== 'string' || !MEMBER_KINDS.includes(input.kind)) fail('Tipo de item inválido.');
  if (typeof input.slug !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(input.slug)) fail('Escolha um item da lista.');
}

function level15(raw) {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 5) fail('O nível deve ser um número de 1 a 5.');
  return raw;
}

const BUILDERS = {
  topic_level(input) {
    if (!isTopic(input.slug)) fail('Tema fora da lista.');
    if (has(input, 'value')) fail('Este tipo de item não tem valor.');
    return { kind: 'topic_level', slug: input.slug, level: level15(input.level), value: null };
  },
  study_pref(input) {
    const allowed = PREFERENCES[input.slug];
    if (!allowed) fail('Preferência fora da lista.');
    if (has(input, 'level')) fail('Este tipo de item não tem nível.');
    if (typeof input.value !== 'string' || !allowed.includes(input.value)) fail('Valor fora da lista.');
    return { kind: 'study_pref', slug: input.slug, level: null, value: input.value };
  },
  goal(input) {
    if (!GOALS.includes(input.slug)) fail('Objetivo fora da lista.');
    if (has(input, 'level')) fail('Este tipo de item não tem nível.');
    if (has(input, 'value') && input.value !== 'ativo') fail('Valor fora da lista.');
    return { kind: 'goal', slug: input.slug, level: null, value: 'ativo' };
  },
};

/**
 * Valida um item definido pelo membro. Só aceita chaves conhecidas e valores da lista; qualquer outro campo
 * (nota, texto, observação) é recusado. Devolve o item normalizado com source 'member'. Lança MemoryInputError.
 */
export function validateMemberItem(input) {
  assertShape(input);
  return Object.assign(BUILDERS[input.kind](input), { source: 'member' });
}

/** O que o cliente vê para montar a tela (vocabulário aceito). */
export function vocabularyView() {
  return {
    topics: TOPIC_DEFS.map(([slug, label]) => ({ slug, label })),
    preferences: Object.keys(PREFERENCES).map((slug) => ({ slug, values: [...PREFERENCES[slug]] })),
    goals: [...GOALS],
  };
}

const KIND_LABEL = Object.freeze({ topic_level: 'nivel_no_tema', difficulty: 'duvida_recorrente', study_pref: 'preferencia', goal: 'objetivo' });

/** Forma enxuta que o tutor recebe como DADO (sem datas, ids ou origem). */
export function promptItem(item) {
  const topic = TOPICS[item.slug];
  return {
    tipo: KIND_LABEL[item.kind] || item.kind,
    tema: topic ? topic.label : item.slug,
    ...(item.level ? { nivel: item.level } : {}),
    ...(item.value && item.kind !== 'difficulty' ? { valor: item.value } : {}),
  };
}
