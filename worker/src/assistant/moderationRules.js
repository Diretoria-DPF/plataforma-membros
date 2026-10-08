/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/moderationRules.js
 * Regras PURAS da moderação da Lia (ADR 0004): sem banco, sem relógio global
 * (o instante `now` vem de fora) e sem mutação (cada função devolve um estado novo).
 *
 * Estado: { level 0-3, until: Date|null, lastIncidentAt: Date|null, lastDecayAt: Date|null }
 *   0 normal · 1 alerta · 2 aviso sério · 3 suspensão de 24 h (até `until`).
 * - registerIncident: aplica o decaimento devido, sobe 1 nível (máx. 3); no 3, suspende por 24 h.
 * - decay: -1 nível a cada 30 dias sem incidente, até 0. O nível 3 só decai depois de a suspensão
 *   expirar E de 30 dias sem incidente. O relógio de cada degrau parte do último incidente ou do
 *   último decaimento aplicado.
 * - redeem: zera o nível na hora e NÃO mexe em lastIncidentAt/lastDecayAt (não reinicia o contador).
 */
import { MODERATION } from '../constants.js';
import { normalize } from './kb.js';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

export const EMPTY_STATE = Object.freeze({ level: 0, until: null, lastIncidentAt: null, lastDecayAt: null });

const toDate = (value) => (value ? new Date(value) : null);

export function normalizeState(row) {
  if (!row) return Object.assign({}, EMPTY_STATE);
  return {
    level: Number(row.level) || 0,
    until: toDate(row.until),
    lastIncidentAt: toDate(row.lastIncidentAt !== undefined ? row.lastIncidentAt : row.last_incident_at),
    lastDecayAt: toDate(row.lastDecayAt !== undefined ? row.lastDecayAt : row.last_decay_at),
  };
}

/** Desde quando contam os 30 dias do próximo degrau de decaimento. */
function decayAnchor(state) {
  const times = [state.lastIncidentAt, state.lastDecayAt].filter(Boolean).map((d) => d.getTime());
  return times.length ? Math.max(...times) : null;
}

export function decay(rawState, now) {
  const state = normalizeState(rawState);
  if (state.level <= 0) return state;
  const anchor = decayAnchor(state);
  if (anchor === null) return state;
  if (state.level >= MODERATION.MAX_LEVEL && state.until && state.until.getTime() > now.getTime()) return state; // ainda suspensa
  const steps = Math.floor((now.getTime() - anchor) / (MODERATION.DECAY_DAYS * DAY_MS));
  if (steps <= 0) return state;
  const level = Math.max(0, state.level - steps);
  return {
    level,
    until: level >= MODERATION.MAX_LEVEL ? state.until : null,
    lastIncidentAt: state.lastIncidentAt,
    lastDecayAt: new Date(anchor + steps * MODERATION.DECAY_DAYS * DAY_MS),
  };
}

export function registerIncident(rawState, now) {
  const decayed = decay(rawState, now);
  const level = Math.min(MODERATION.MAX_LEVEL, decayed.level + 1);
  return {
    level,
    until: level >= MODERATION.MAX_LEVEL ? new Date(now.getTime() + MODERATION.SUSPENSION_HOURS * HOUR_MS) : null,
    lastIncidentAt: new Date(now.getTime()),
    lastDecayAt: decayed.lastDecayAt,
  };
}

export function redeem(rawState) {
  const state = normalizeState(rawState);
  return { level: 0, until: null, lastIncidentAt: state.lastIncidentAt, lastDecayAt: state.lastDecayAt };
}

export function isSuspended(rawState, now) {
  const state = normalizeState(rawState);
  return state.level >= MODERATION.MAX_LEVEL && !!state.until && state.until.getTime() > now.getTime();
}

export const LEVEL_MESSAGES = {
  1: 'Alerta: vamos manter o respeito nas conversas. Posso continuar ajudando com a plataforma.',
  2: 'Aviso sério: mensagens ofensivas se repetiram. Se continuar, o chat será suspenso por 24 horas.',
  3: 'Chat suspenso por 24 horas por mensagens ofensivas repetidas. Se quiser, você pode pedir redenção explicando o que houve.',
};
export const SUSPENDED_MESSAGE = 'O chat com a Lia está suspenso até {until} (horário de Brasília). Você pode pedir redenção, explicando com sinceridade o que houve.';

// ---- Detecção de ofensa (texto PT-BR) ----
// Antes de casar, o texto passa por `moderationForms`: some o invisível (zero-width, bidi), tira acento,
// troca confusáveis (cirílico/grego) e leetspeak por letras, colapsa repetição ("iiidiota") e junta letras
// separadas por pontuação ("i.d.i.o.t.a"). Os termos são comparados nessas formas.
// - OFFENSIVE_TERMS: palavrões e insultos que não aparecem em perguntas legítimas; basta o termo.
// - DIRECTED_TERMS: palavras que também são assunto ou citação ("o que significa idiota?", "lixo" de
//   reciclagem): contam só com um alvo (você/seu/sua etc.) a até TARGET_WINDOW palavras de distância.
// Termo casado vai ao juiz LLM; se o juiz falhar, vale o termo (regra em moderationService.judgeOffense).
export const OFFENSIVE_TERMS = [
  'estupido', 'estupida', 'estupidos', 'estupidas', 'cretino', 'cretina', 'cretinos', 'cretinas',
  'otario', 'otaria', 'otarios', 'otarias', 'babaca', 'babacas', 'vagabundo', 'vagabunda', 'vagabundos', 'vagabundas',
  'desgraca', 'desgracas', 'merda', 'merdas', 'porra', 'porras', 'caralho', 'caralhos', 'puta', 'putas', 'fdp', 'vsf', 'vtnc',
  'arrombado', 'arrombada', 'arrombados', 'arrombadas', 'foder', 'fodase', 'foda se', 'vai se foder', 'filho da puta',
  'filhos da puta', 'vai tomar no cu', 'cala a boca', 'cala boca', 'cu', 'cus',
];
export const DIRECTED_TERMS = [
  'idiota', 'idiotas', 'idota', 'idotas', 'imbecil', 'imbecis', 'burro', 'burra', 'burros', 'burras',
  'retardado', 'retardada', 'retardados', 'retardadas', 'lixo', 'lixos',
];
const DIRECTED_SET = new Set(DIRECTED_TERMS);
const TARGET_WORDS = new Set(['voce', 'voces', 'vc', 'vcs', 'ce', 'tu', 'te', 'teu', 'teus', 'tua', 'tuas',
  'seu', 'seus', 'sua', 'suas', 'vosso', 'vossa', 'vossos', 'vossas']);
const TARGET_WINDOW = 5;

// Invisíveis e de formatação: soft hyphen, zero-width, marcas de direção (bidi), word joiner, BOM.
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// Controles C0/C1 (sem tab e quebra de linha): somem, para não separar uma palavra.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const COMBINING_RE = /\p{M}/gu;
const REPEATED_LETTER_RE = /(\p{L})\1{2,}/gu;
const PUNCT_BETWEEN_LETTERS_RE = /(\p{L})\s*[^\p{L}\p{N}\s]+\s*(?=\p{L})/gu;
const SPACED_LETTERS_RE = /(^|\s)(\p{L}(?:\s\p{L}){2,})(?=\s|$)/gu;
const NON_WORD_RE = /[^\p{L}\p{N}]+/gu;

// Parecidos com letras latinas (cirílico e grego) e leetspeak simples. Escritos em \u para o código
// não depender de qual alfabeto o editor usou.
const BASE_FOLD = new Map([
  ['\u0430', 'a'], ['\u0432', 'b'], ['\u0441', 'c'], ['\u0435', 'e'], ['\u0456', 'i'], ['\u0458', 'j'],
  ['\u043C', 'm'], ['\u043E', 'o'], ['\u0440', 'p'], ['\u0455', 's'], ['\u0443', 'y'], ['\u0445', 'x'],
  ['\u04BB', 'h'], ['\u0501', 'd'], ['\u0475', 'v'],
  ['\u03B1', 'a'], ['\u03B5', 'e'], ['\u03B9', 'i'], ['\u03BA', 'k'], ['\u03BD', 'v'], ['\u03BF', 'o'],
  ['\u03C1', 'p'], ['\u03C5', 'u'], ['\u03C7', 'x'],
  ['0', 'o'], ['1', 'i'], ['3', 'e'], ['4', 'a'], ['5', 's'], ['@', 'a'], ['$', 's'],
]);

// Mais confusáveis, por ponto de código (U+XXXX). Letras com acento (é, ç, ё, й, ї) não precisam estar
// aqui: o NFKD já as separa da marca, que é descartada. Cirílico: as idênticas às latinas ficam em
// BASE_FOLD; as demais seguem o som ("идиота" lê-se idiota). Onde há duas leituras, vale a mais comum
// em insulto escrito em PT-BR.
const EXTRA_FOLD_CODES = [
  // Cirílico: б г д з и к л н п т ф ш щ ъ ь э я є ґ
  [0x0431, 'b'], [0x0433, 'g'], [0x0434, 'd'], [0x0437, 'z'], [0x0438, 'i'], [0x043A, 'k'], [0x043B, 'l'],
  [0x043D, 'n'], [0x043F, 'p'], [0x0442, 't'], [0x0444, 'f'], [0x0448, 'w'], [0x0449, 'w'], [0x044A, 'b'],
  [0x044C, 'b'], [0x044D, 'e'], [0x044F, 'r'], [0x0454, 'e'], [0x0491, 'g'],
  // Grego: β γ δ η μ σ ς τ ω
  [0x03B2, 'b'], [0x03B3, 'y'], [0x03B4, 'd'], [0x03B7, 'n'], [0x03BC, 'u'], [0x03C3, 's'], [0x03C2, 's'],
  [0x03C4, 't'], [0x03C9, 'w'],
  // Latino estendido: ı ø đ ð ł ħ ŧ ƒ ß
  [0x0131, 'i'], [0x00F8, 'o'], [0x0111, 'd'], [0x00F0, 'd'], [0x0142, 'l'], [0x0127, 'h'], [0x0167, 't'],
  [0x0192, 'f'], [0x00DF, 'ss'],
];
const CHAR_FOLD = new Map([...BASE_FOLD, ...EXTRA_FOLD_CODES.map(([code, letter]) => [String.fromCodePoint(code), letter])]);

// Letras que valem por duas vogais: "ø" aparece no lugar de "o" ("føder") e de "u" ("pøta"). Quando o
// texto tem uma delas, as formas são geradas também com a segunda leitura.
const OSLASH = String.fromCodePoint(0x00F8);
const ALT_FOLD = new Map([[OSLASH, 'u']]);

/** Dobra o texto para comparar termos: sem invisível, sem acento, sem confusável, sem leet, sem repetição. */
function plainForModeration(message) {
  return message
    .replace(INVISIBLE_RE, '')
    .replace(CONTROL_RE, '')
    .normalize('NFKD')
    .replace(COMBINING_RE, '')
    .toLowerCase();
}

function foldForModeration(plain, useAlt) {
  const read = (ch) => (useAlt && ALT_FOLD.get(ch)) || CHAR_FOLD.get(ch) || ch;
  return Array.from(plain, read).join('').replace(REPEATED_LETTER_RE, '$1');
}

/** `spaced` (pontuação vira espaço) e `joined` (pontuação entre letras some; letras soltas se juntam). */
function formsOf(folded) {
  const spaced = folded.replace(NON_WORD_RE, ' ').trim();
  const joined = folded
    .replace(PUNCT_BETWEEN_LETTERS_RE, '$1')
    .replace(SPACED_LETTERS_RE, (_m, lead, run) => lead + run.replace(/\s/g, ''))
    .replace(NON_WORD_RE, ' ')
    .trim();
  return [spaced, joined];
}

/**
 * Formas do texto para casar termos: `spaced` e `joined` ("i.d.i.o.t.a", "i d i o t a"). Texto com
 * letra de leitura dupla (ø) ganha mais duas formas, com a segunda leitura.
 * @returns {string[]}
 */
export function moderationForms(message) {
  if (typeof message !== 'string') return [];
  const plain = plainForModeration(message);
  const forms = formsOf(foldForModeration(plain, false));
  return plain.includes(OSLASH) ? forms.concat(formsOf(foldForModeration(plain, true))) : forms;
}

function hasTargetNear(tokens, index) {
  return tokens.slice(Math.max(0, index - TARGET_WINDOW), index + TARGET_WINDOW + 1).some((t) => TARGET_WORDS.has(t));
}

function hasOffense(form) {
  const padded = ' ' + form + ' ';
  if (OFFENSIVE_TERMS.some((term) => padded.includes(' ' + term + ' '))) return true;
  const tokens = form.split(' ');
  return tokens.some((t, i) => DIRECTED_SET.has(t) && hasTargetNear(tokens, i));
}

export function containsOffensiveTerm(message) {
  return moderationForms(message).some(hasOffense);
}

/**
 * Histórico do cliente sem os turnos com termo ofensivo. A ofensa vai a julgamento só quando é a
 * mensagem ATUAL (portão do chat); um turno antigo não é punido de novo, mas também não chega ao LLM
 * nem à busca. Devolve uma lista nova.
 */
export function withoutOffensiveTurns(history) {
  return (Array.isArray(history) ? history : []).filter((turn) => !containsOffensiveTerm(turn && turn.text));
}

// ---- Injeção de prompt (chat, trechos do acervo e redenção) ----
// Tentativas de dar ordens à IA ou de embutir marcação. Textos normalizados (sem acento, minúsculos).
const INJECTION_TEXT = [
  /\b(ignore|ignorar|ignora|ignorem|desconsidere|esqueca)\b.{0,60}\b(instrucoes|instrucao|regras|prompt|anteriores|papel)\b/,
  /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules|previous|prompt)\b/,
  /\b(system prompt|prompt de sistema|prompt do sistema|developer mode|modo desenvolvedor|jailbreak)\b/,
  /\b(revele|revelar|mostre|mostrar|repita|exiba)\b.{0,30}\b(prompt|instrucoes internas|instrucoes do sistema)\b/,
];
// Marcação testada no texto original: tags, delimitadores de chat e pseudo-instruções.
const INJECTION_MARKUP = /<\s*\/?\s*(system|script|iframe|img|svg)\b|<\|im_|\[\[?\s*\/?\s*inst\b|\bsystem\s*:/i;

/** O texto tenta dar ordens à IA (ou embute marcação de prompt)? Invisíveis não quebram a palavra-chave. */
export function looksLikeInjection(message) {
  const clean = String(message).replace(INVISIBLE_RE, '');
  if (INJECTION_MARKUP.test(clean)) return true;
  const text = normalize(clean);
  return INJECTION_TEXT.some((re) => re.test(text));
}

// ---- Redenção: heurística de sinceridade ----
// Barra o que claramente não é um pedido de desculpas honesto ANTES de gastar o juiz. Quem aceita é só o
// juiz; aqui só se reprova. Texto sem sentido (letras aleatórias, repetição, só emoji, gritaria) e texto
// com ordem embutida para o juiz ("respondo SIM", "ignore as instruções") nunca chegam a ele.
const ACKNOWLEDGE = ['desculpa', 'desculpe', 'desculpas', 'perdao', 'errei', 'erro meu', 'me arrependo', 'arrependido', 'arrependida', 'lamento', 'nao vou repetir', 'nao vai se repetir', 'prometo', 'me comprometo', 'respeito', 'foi errado', 'agi mal', 'passei do limite', 'nao devia'];
const MIN_DISTINCT_WORDS = 8;
const MAX_TOP_WORD_SHARE = 0.4;    // uma palavra não pode ser mais de 40% do texto
const MIN_LETTER_SHARE = 0.6;      // letras / caracteres: barra emoji, símbolos e números soltos
const MAX_UPPER_SHARE = 0.6;       // acima disso é gritaria
const MIN_PLAUSIBLE_SHARE = 0.7;   // palavras que podem ser português
const MAX_WORD_LETTERS = 15;
const MIN_FUNCTION_WORDS = 2;      // palavras comuns distintas (de, que, não, eu...): texto real tem
// Palavras gramaticais comuns do PT-BR, já normalizadas (normalize() de kb.js).
const FUNCTION_WORDS = new Set(['a', 'o', 'e', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'ao',
  'com', 'por', 'para', 'pra', 'pelo', 'pela', 'que', 'se', 'me', 'te', 'eu', 'nao', 'mas', 'como', 'foi', 'fui', 'era', 'ser', 'vou', 'vai',
  'tenho', 'estou', 'estava', 'isso', 'esse', 'essa', 'meu', 'minha', 'mais', 'muito', 'agora', 'daqui', 'sempre', 'nunca', 'porque',
  'quando', 'sem', 'so', 'ja', 'tambem']);
const VOWEL_RE = /[aeiou]/;
const CONSONANT_RUN_RE = /[^aeiou0-9]{5,}/; // normalize() só deixa a-z e 0-9
const LETTER_RE = /\p{L}/gu;
const UPPER_RE = /\p{Lu}/gu;

const countMatches = (re, text) => (text.match(re) || []).length;
const fail = (reason) => ({ ok: false, reason });

/** Palavra que pode ser portuguesa: tem vogal, não é longa demais e não tem 5 consoantes seguidas. */
function isPlausibleWord(word) {
  return word.length <= MAX_WORD_LETTERS && VOWEL_RE.test(word) && !CONSONANT_RUN_RE.test(word);
}

function isRepetitive(tokens) {
  const counts = new Map();
  tokens.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  return counts.size < MIN_DISTINCT_WORDS || Math.max(...counts.values()) / tokens.length > MAX_TOP_WORD_SHARE;
}

function isGibberish(tokens) {
  const plausible = tokens.filter(isPlausibleWord).length;
  const functionWords = new Set(tokens.filter((t) => FUNCTION_WORDS.has(t))).size;
  return plausible / tokens.length < MIN_PLAUSIBLE_SHARE || functionWords < MIN_FUNCTION_WORDS;
}

function hasAcknowledgement(norm) {
  const padded = ' ' + norm + ' ';
  return ACKNOWLEDGE.some((k) => padded.includes(' ' + k + ' ') || padded.includes(' ' + k));
}

/** @returns {{ ok: boolean, reason?: string }} */
export function sincerityHeuristic(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (raw.length < MODERATION.REDEEM_MIN_CHARS) return fail('curto');
  if (raw.length > MODERATION.REDEEM_MAX_CHARS) return fail('longo');
  const letters = countMatches(LETTER_RE, raw);
  if (letters / raw.length < MIN_LETTER_SHARE) return fail('sem_letras');
  if (looksLikeInjection(raw)) return fail('instrucao');
  const norm = normalize(raw);
  const tokens = norm.split(' ').filter(Boolean);
  if (isRepetitive(tokens)) return fail('repetitivo');
  if (countMatches(UPPER_RE, raw) / letters > MAX_UPPER_SHARE) return fail('gritado');
  if (isGibberish(tokens)) return fail('sem_sentido');
  if (containsOffensiveTerm(raw)) return fail('ofensivo');
  if (!hasAcknowledgement(norm)) return fail('sem_reconhecimento');
  return { ok: true };
}
