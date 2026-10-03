/**
 * quiz-select.js — sorteio e filtros do Quiz (Onda 3.5, B.2). Funções puras.
 * Cada rodada sorteia até 10 casos, do sistema e da dificuldade escolhidos,
 * com uma semente: a mesma semente e os mesmos filtros dão a mesma rodada
 * (retomada de sessão e testes).
 */

export const QUIZ_COUNT = 10;
export const DIFFICULTIES = Object.freeze(['facil', 'medio', 'dificil']);
export const DIFFICULTY_LABEL = Object.freeze({ facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' });
export const SYSTEM_LABEL = Object.freeze({
  cardiovascular: 'Cardiovascular', nervoso: 'Nervoso', respiratorio: 'Respiratório', digestorio: 'Digestório', urinario: 'Urinário',
  endocrino: 'Endócrino', linfatico: 'Linfático', esqueletico: 'Esquelético', muscular: 'Muscular', articular: 'Articular',
});

/** Embaralhamento determinístico (LCG) — o mesmo de sempre, agora compartilhado. */
export function shuffleWithSeed(arr, seed = 42) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** `?seed=123` fixa a rodada (testes); sem isso, sorteia. */
export function seedFromSearch(search) {
  const raw = new URLSearchParams(search || '').get('seed');
  const n = raw == null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 0x7fffffff ? n : null;
}
export function randomSeed(rng = Math.random) {
  return Math.floor(rng() * 0x7fffffff);
}

/** Sistemas e dificuldades que existem nos casos, com a contagem de cada um. */
export function availableFilters(all) {
  const sys = new Map();
  const diff = new Map();
  for (const c of all || []) {
    if (c && c.system) sys.set(c.system, (sys.get(c.system) || 0) + 1);
    if (c && DIFFICULTIES.includes(c.difficulty)) diff.set(c.difficulty, (diff.get(c.difficulty) || 0) + 1);
  }
  return {
    systems: [...sys.entries()].map(([id, count]) => ({ id, count, label: SYSTEM_LABEL[id] || id })).sort((a, b) => a.label.localeCompare(b.label, 'pt')),
    difficulties: DIFFICULTIES.filter((d) => diff.has(d)).map((id) => ({ id, count: diff.get(id), label: DIFFICULTY_LABEL[id] })),
  };
}

export function filterCases(all, { system = 'todos', difficulty = 'todas' } = {}) {
  return (all || []).filter((c) => c && (system === 'todos' || c.system === system) && (difficulty === 'todas' || c.difficulty === difficulty));
}

/** Rodada: filtra, embaralha pela semente e fica com até `count` casos. */
export function pickCases(all, { system = 'todos', difficulty = 'todas', count = QUIZ_COUNT, seed = 42 } = {}) {
  return shuffleWithSeed(filterCases(all, { system, difficulty }), seed).slice(0, count);
}
