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
const CHAR_FOLD = new Map([
  ['\u0430', 'a'], ['\u0432', 'b'], ['\u0441', 'c'], ['\u0435', 'e'], ['\u0456', 'i'], ['\u0458', 'j'],
  ['\u043C', 'm'], ['\u043E', 'o'], ['\u0440', 'p'], ['\u0455', 's'], ['\u0443', 'y'], ['\u0445', 'x'],
  ['\u04BB', 'h'], ['\u0501', 'd'], ['\u0475', 'v'],
  ['\u03B1', 'a'], ['\u03B5', 'e'], ['\u03B9', 'i'], ['\u03BA', 'k'], ['\u03BD', 'v'], ['\u03BF', 'o'],
  ['\u03C1', 'p'], ['\u03C5', 'u'], ['\u03C7', 'x'],
  ['0', 'o'], ['1', 'i'], ['3', 'e'], ['4', 'a'], ['5', 's'], ['@', 'a'], ['$', 's'],
]);

/** Dobra o texto para comparar termos: sem invisível, sem acento, sem confusável, sem leet, sem repetição. */
function foldForModeration(message) {
  const plain = message
    .replace(INVISIBLE_RE, '')
    .replace(CONTROL_RE, '')
    .normalize('NFKD')
    .replace(COMBINING_RE, '')
    .toLowerCase();
  return Array.from(plain, (ch) => CHAR_FOLD.get(ch) || ch).join('').replace(REPEATED_LETTER_RE, '$1');
}

/**
 * Duas formas do texto para casar termos: `spaced` (pontuação vira espaço) e `joined` (pontuação entre
 * letras some e letras soltas separadas por espaço se juntam: "i.d.i.o.t.a", "i d i o t a").
 * @returns {string[]}
 */
export function moderationForms(message) {
  if (typeof message !== 'string') return [];
  const folded = foldForModeration(message);
  const spaced = folded.replace(NON_WORD_RE, ' ').trim();
  const joined = folded
    .replace(PUNCT_BETWEEN_LETTERS_RE, '$1')
    .replace(SPACED_LETTERS_RE, (_m, lead, run) => lead + run.replace(/\s/g, ''))
    .replace(NON_WORD_RE, ' ')
    .trim();
  return [spaced, joined];
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

// ---- Redenção: heurística de sinceridade ----
const ACKNOWLEDGE = ['desculpa', 'desculpe', 'desculpas', 'perdao', 'errei', 'erro meu', 'me arrependo', 'arrependido', 'arrependida', 'lamento', 'nao vou repetir', 'nao vai se repetir', 'prometo', 'me comprometo', 'respeito', 'foi errado', 'agi mal', 'passei do limite', 'nao devia'];
const MIN_DISTINCT_WORDS = 8;

/** @returns {{ ok: boolean, reason?: string }} */
export function sincerityHeuristic(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (raw.length < MODERATION.REDEEM_MIN_CHARS) return { ok: false, reason: 'curto' };
  if (raw.length > MODERATION.REDEEM_MAX_CHARS) return { ok: false, reason: 'longo' };
  const norm = normalize(raw);
  if (new Set(norm.split(' ')).size < MIN_DISTINCT_WORDS) return { ok: false, reason: 'repetitivo' };
  if (containsOffensiveTerm(raw)) return { ok: false, reason: 'ofensivo' };
  const padded = ' ' + norm + ' ';
  if (!ACKNOWLEDGE.some((k) => padded.includes(' ' + k + ' ') || padded.includes(' ' + k))) return { ok: false, reason: 'sem_reconhecimento' };
  return { ok: true };
}
