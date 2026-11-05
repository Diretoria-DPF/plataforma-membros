/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * trilhas-core.js — regras puras de "Trilhas e desafios" do Atlas (A4).
 * Sem DOM e sem rede: trilhas guiadas (sequências de estruturas que já existem
 * no Atlas), "encontre a estrutura" e o desafio diário de 3 questões, que
 * muda por data (a mesma data dá o mesmo desafio em qualquer aparelho).
 * Nada daqui cria conteúdo: os itens vêm dos casos do Quiz e das estruturas
 * das trilhas. O progresso fica só neste aparelho (localStorage).
 */

import { shuffleWithSeed } from './quiz-select.js';

export const STORAGE_KEY = 'laift.atlas.trilhas.v1';
export const DAILY_COUNT = 3;
export const MIN_STEPS = 3;
export const MAX_STEPS = 10;
const MAX_DAYS = 90;
const SID_RE = /^[A-Za-z0-9:_.-]{1,120}$/;

const pad = (n) => String(n).padStart(2, '0');

/** Data local no formato AAAA-MM-DD. */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** O dia anterior de um AAAA-MM-DD (cálculo em UTC, sem horário de verão). */
export function previousDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

/** Hash de texto (FNV-1a) em 31 bits, para semear o sorteio do dia. */
export function hashString(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 0x7fffffff;
}

/**
 * Confere as trilhas contra o índice de estruturas (Map sid → entrada).
 * Devolve a lista de problemas em português; vazia quando está tudo certo.
 */
export function validateTrails(data, indexBySid) {
  const erros = [];
  if (!data || !Array.isArray(data.trilhas) || !data.trilhas.length) return ['sem trilhas'];
  const ids = new Set();
  for (const t of data.trilhas) {
    const nome = t && t.id ? t.id : '(sem id)';
    if (!t || typeof t.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(t.id)) erros.push(`${nome}: id ausente ou inválido`);
    else if (ids.has(t.id)) erros.push(`${nome}: id duplicado`);
    else ids.add(t.id);
    if (!t || typeof t.titulo !== 'string' || !t.titulo.trim()) erros.push(`${nome}: título vazio`);
    if (!t || typeof t.descricao !== 'string' || !t.descricao.trim()) erros.push(`${nome}: descrição vazia`);
    const passos = t && Array.isArray(t.passos) ? t.passos : [];
    if (passos.length < MIN_STEPS || passos.length > MAX_STEPS) erros.push(`${nome}: use entre ${MIN_STEPS} e ${MAX_STEPS} passos`);
    const vistos = new Set();
    for (const sid of passos) {
      if (typeof sid !== 'string' || !SID_RE.test(sid)) { erros.push(`${nome}: sid inválido`); continue; }
      if (vistos.has(sid)) erros.push(`${nome}: passo repetido (${sid})`);
      vistos.add(sid);
      if (!indexBySid.has(sid)) erros.push(`${nome}: estrutura inexistente no Atlas (${sid})`);
    }
  }
  return erros;
}

/**
 * Itens do desafio e do "encontre": cada um traz um `caso` no formato do Quiz
 * (`correctSid`/`correctSids`), então a mesma conferência (`isCorrect`) serve.
 * Casos listados em `excluded` ficam de fora (ex.: aguardando correção).
 */
export function buildItems({ cases = [], excluded = [], trails = [], labelOf, groupOf }) {
  const out = [];
  const seen = new Set();
  const skip = new Set(excluded);
  for (const c of cases) {
    if (!c || !c.id || skip.has(c.id) || !c.prompt_pt || !(c.correctSid || (c.correctSids && c.correctSids.length))) continue;
    const id = `caso:${c.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, tipo: 'caso', prompt: c.prompt_pt, caso: c });
  }
  for (const t of trails) {
    for (const sid of (t && t.passos) || []) {
      const id = `estrutura:${sid}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const group = groupOf ? groupOf(sid) : [sid];
      const sids = [...new Set([sid, ...(group || [])])];
      out.push({
        id, tipo: 'estrutura', sid, sistema: t.sistema || null,
        prompt: `Toque na estrutura: ${labelOf ? labelOf(sid) : sid}`,
        caso: { id, correctSid: sid, correctSids: sids },
      });
    }
  }
  return out;
}

/** As 3 questões do dia: ordena por id (a ordem de entrada não pesa) e sorteia pela data. */
export function pickDaily(items, key, count = DAILY_COUNT) {
  const base = [...(items || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return shuffleWithSeed(base, hashString(key)).slice(0, count);
}

/** Sid que responde ao item (o primeiro aceito). */
export function answerSid(item) {
  const c = item && item.caso;
  if (!c) return null;
  if (Array.isArray(c.correctSid)) return c.correctSid[0] || null;
  return c.correctSid || (Array.isArray(c.correctSids) ? c.correctSids[0] : null) || null;
}

/**
 * Até 4 opções de nome para responder sem tocar no 3D: a certa e três que
 * não a confundem (do próprio caso ou de outras estruturas do mesmo sistema).
 * Nomes repetidos ficam de fora; sem ao menos 2 opções devolve lista vazia.
 */
export function listOptions(item, items, labelOf, seed = 1) {
  const correct = answerSid(item);
  if (!correct) return [];
  const accepted = new Set([correct, ...((item.caso && item.caso.correctSids) || [])]);
  const correctLabel = labelOf(correct);
  const used = new Set([correctLabel]);
  const others = (items || []).filter((i) => i.id !== item.id && i.tipo === 'estrutura');
  const sameSystem = others.filter((i) => item.sistema && i.sistema === item.sistema);
  const pool = [
    ...(((item.caso && item.caso.distractorSids) || [])),
    ...sameSystem.map((i) => i.sid),
    ...others.map((i) => i.sid),
  ];
  const picked = [];
  for (const sid of pool) {
    if (picked.length >= 3) break;
    const label = labelOf(sid);
    if (!label || used.has(label) || accepted.has(sid)) continue;
    used.add(label);
    picked.push({ sid, label, correct: false });
  }
  if (!picked.length) return [];
  return shuffleWithSeed([{ sid: correct, label: correctLabel, correct: true }, ...picked], seed);
}

/** Primeira frase de um texto, com no máximo 220 caracteres. */
export function firstSentence(text, max = 220) {
  if (typeof text !== 'string') return '';
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const i = t.search(/[.!?](\s|$)/);
  const frase = i >= 0 ? t.slice(0, i + 1) : t;
  return frase.length > max ? `${frase.slice(0, max).trimEnd()}…` : frase;
}

// --------------------------------------------------------------------------
// Progresso no aparelho
// --------------------------------------------------------------------------

function emptyState() {
  return { v: 1, trails: {}, daily: {}, find: { tries: 0, hits: 0 } };
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** Aceita só o formato esperado; o resto é descartado em silêncio. */
function normalize(raw) {
  const st = emptyState();
  if (!raw || typeof raw !== 'object') return st;
  if (raw.trails && typeof raw.trails === 'object') {
    for (const [id, t] of Object.entries(raw.trails)) {
      if (!t || !Array.isArray(t.visited)) continue;
      const visited = [...new Set(t.visited.filter((s) => typeof s === 'string' && SID_RE.test(s)))];
      st.trails[id] = { visited, total: count(t.total) };
    }
  }
  if (raw.daily && typeof raw.daily === 'object') {
    for (const [k, d] of Object.entries(raw.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d || !Array.isArray(d.results)) continue;
      const results = d.results.map((x) => x === true);
      st.daily[k] = { results, correct: results.filter(Boolean).length };
    }
  }
  if (raw.find && typeof raw.find === 'object') st.find = { tries: count(raw.find.tries), hits: count(raw.find.hits) };
  return st;
}

/**
 * Armazém do progresso. `storage` é um objeto com getItem/setItem (localStorage);
 * se faltar ou falhar, o progresso segue só em memória até a página fechar.
 */
export function createProgressStore(storage) {
  let state = null;
  const load = () => {
    if (state) return state;
    let raw = null;
    try {
      const txt = storage && storage.getItem(STORAGE_KEY);
      raw = txt ? JSON.parse(txt) : null;
    } catch (e) { raw = null; }
    state = normalize(raw);
    return state;
  };
  const save = () => {
    try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* cota cheia ou bloqueado: segue em memória */ }
  };

  return {
    state: () => load(),

    trail(id) {
      const t = load().trails[id];
      if (!t) return { visited: [], done: false };
      return { visited: [...t.visited], done: t.total > 0 && t.visited.length >= t.total };
    },

    visit(id, sid, total) {
      const st = load();
      const t = st.trails[id] || { visited: [], total: 0 };
      const visited = t.visited.includes(sid) ? t.visited : [...t.visited, sid];
      st.trails[id] = { visited, total: count(total) || t.total };
      save();
      return this.trail(id);
    },

    daily: (key) => load().daily[key] || null,

    recordDaily(key, results) {
      const st = load();
      if (st.daily[key]) return st.daily[key];
      const list = (results || []).map((x) => x === true);
      st.daily[key] = { results: list, correct: list.filter(Boolean).length };
      const keys = Object.keys(st.daily).sort();
      for (const old of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete st.daily[old];
      save();
      return st.daily[key];
    },

    /** Dias seguidos com o desafio feito, até hoje (ou até ontem, se hoje ainda não foi feito). */
    streak(key) {
      const days = load().daily;
      let k = days[key] ? key : previousDateKey(key);
      let n = 0;
      while (days[k]) { n++; k = previousDateKey(k); }
      return n;
    },

    recordFind(hit) {
      const st = load();
      st.find = { tries: st.find.tries + 1, hits: st.find.hits + (hit ? 1 : 0) };
      save();
      return st.find;
    },
  };
}
