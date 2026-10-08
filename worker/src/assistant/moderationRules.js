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

// ---- Detecção de ofensa (termos PT-BR, texto normalizado: sem acento, minúsculo) ----
// Só termos que não aparecem em perguntas legítimas da plataforma (ex.: "lixo", "droga" ficam de fora).
export const OFFENSIVE_TERMS = [
  'idiota', 'imbecil', 'estupido', 'estupida', 'cretino', 'cretina', 'otario', 'otaria', 'babaca', 'burra', 'retardado', 'retardada',
  'vagabundo', 'vagabunda', 'desgraca', 'merda', 'porra', 'caralho', 'puta', 'fdp', 'vsf', 'vtnc', 'arrombado', 'arrombada',
  'foder', 'foda se', 'vai se foder', 'filho da puta', 'vai tomar no cu', 'cala a boca', 'cala boca', 'cu',
];

export function containsOffensiveTerm(message) {
  const padded = ' ' + normalize(message) + ' ';
  return OFFENSIVE_TERMS.some((term) => padded.includes(' ' + term + ' '));
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
