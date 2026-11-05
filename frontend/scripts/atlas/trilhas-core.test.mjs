/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * trilhas-core.test.mjs — trilhas guiadas, "encontre a estrutura" e desafio diário (A4).
 * Uso: node --test scripts/atlas/trilhas-core.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, DAILY_COUNT, dateKey, previousDateKey, hashString, validateTrails, buildItems, pickDaily,
  createProgressStore, listOptions, firstSentence,
} from '../../modulos/anatomia-3d/js/modes/trilhas-core.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    dump: () => data,
  };
}

const IDX = new Map([
  ['za:a', { sid: 'za:a', system: 'digestorio' }], ['za:b', { sid: 'za:b', system: 'digestorio' }],
  ['za:c', { sid: 'za:c', system: 'digestorio' }], ['za:d', { sid: 'za:d', system: 'cardiovascular' }],
]);
const TRAIL = { id: 'x', titulo: 'Trilha X', descricao: 'Texto.', sistema: 'digestorio', passos: ['za:a', 'za:b', 'za:c'] };

test('dateKey usa a data local e previousDateKey volta um dia (inclusive na virada do mês e do ano)', () => {
  assert.equal(dateKey(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  assert.equal(previousDateKey('2026-11-01'), '2026-10-31');
  assert.equal(previousDateKey('2026-01-01'), '2025-12-31');
  assert.equal(previousDateKey('2024-03-01'), '2024-02-29');
});

test('hashString é estável e cabe em 31 bits', () => {
  assert.equal(hashString('2026-11-05'), hashString('2026-11-05'));
  assert.notEqual(hashString('2026-11-05'), hashString('2026-11-06'));
  const h = hashString('qualquer');
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0x7fffffff);
});

test('validateTrails aceita trilha boa e aponta cada defeito', () => {
  assert.deepEqual(validateTrails({ trilhas: [TRAIL] }, IDX), []);
  const erros = validateTrails({ trilhas: [
    { ...TRAIL, id: '' },
    { ...TRAIL, id: 'y', passos: ['za:a', 'za:a', 'za:b'] },
    { ...TRAIL, id: 'z', passos: ['za:a', 'za:zz', 'za:b'] },
    { ...TRAIL, id: 'w', passos: ['za:a', 'za:b'] },
    { ...TRAIL, id: 'x' }, { ...TRAIL, id: 'x' },
  ] }, IDX);
  assert.ok(erros.some((e) => /id/.test(e)));
  assert.ok(erros.some((e) => /repetid/.test(e)));
  assert.ok(erros.some((e) => /za:zz/.test(e)));
  assert.ok(erros.some((e) => /entre 3 e 10/.test(e)));
  assert.ok(erros.some((e) => /duplicad/.test(e)));
  assert.ok(validateTrails(null, IDX).length > 0);
});

test('buildItems junta casos do quiz (sem os excluídos) e estruturas das trilhas, sem repetir', () => {
  const cases = [
    { id: 'c1', prompt_pt: 'Pergunta 1', correctSid: 'za:a', explanation_pt: 'Porque sim.' },
    { id: 'c2', prompt_pt: 'Pergunta 2', correctSid: 'za:d' },
    { id: 'c3', prompt_pt: '', correctSid: 'za:b' },
  ];
  const items = buildItems({ cases, excluded: ['c2'], trails: [TRAIL], labelOf: (s) => `Nome ${s}`, groupOf: (s) => [s, `${s}-r`] });
  const ids = items.map((i) => i.id);
  assert.deepEqual(ids, ['caso:c1', 'estrutura:za:a', 'estrutura:za:b', 'estrutura:za:c']);
  const est = items.find((i) => i.id === 'estrutura:za:b');
  assert.match(est.prompt, /Nome za:b/);
  assert.deepEqual(est.caso.correctSids, ['za:b', 'za:b-r']);
  assert.equal(items[0].caso.explanation_pt, 'Porque sim.');
});

test('pickDaily: 3 itens, mesma data = mesmo desafio, ordem de entrada não importa, datas diferentes variam', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}` }));
  const a = pickDaily(pool, '2026-11-05');
  assert.equal(a.length, DAILY_COUNT);
  assert.deepEqual(a.map((x) => x.id), pickDaily([...pool].reverse(), '2026-11-05').map((x) => x.id));
  assert.equal(new Set(a.map((x) => x.id)).size, a.length);
  const dias = new Set();
  for (let d = 1; d <= 20; d++) dias.add(pickDaily(pool, `2026-11-${String(d).padStart(2, '0')}`).map((x) => x.id).join());
  assert.ok(dias.size >= 10, `variação entre dias: ${dias.size}`);
  assert.deepEqual(pickDaily(pool.slice(0, 2), '2026-11-05').map((x) => x.id).sort(), ['i0', 'i1']);
  assert.deepEqual(pickDaily([], '2026-11-05'), []);
});

test('progresso: passos visitados, trilha concluída só com todos, sem duplicar', () => {
  const st = memoryStorage();
  const p = createProgressStore(st);
  assert.deepEqual(p.trail('x'), { visited: [], done: false });
  p.visit('x', 'za:a', 3);
  p.visit('x', 'za:a', 3);
  p.visit('x', 'za:b', 3);
  assert.deepEqual(p.trail('x'), { visited: ['za:a', 'za:b'], done: false });
  p.visit('x', 'za:c', 3);
  assert.equal(p.trail('x').done, true);
  assert.ok(STORAGE_KEY in st.dump());
  assert.equal(createProgressStore(st).trail('x').done, true, 'persiste no aparelho');
});

test('progresso: desafio diário guarda o dia, calcula sequência e não deixa refazer o dia', () => {
  const p = createProgressStore(memoryStorage());
  assert.equal(p.daily('2026-11-05'), null);
  assert.equal(p.streak('2026-11-05'), 0);
  p.recordDaily('2026-11-03', [true, false, true]);
  p.recordDaily('2026-11-04', [true, true, true]);
  assert.equal(p.streak('2026-11-04'), 2);
  assert.equal(p.streak('2026-11-05'), 2, 'hoje ainda não feito: a sequência de ontem continua');
  p.recordDaily('2026-11-05', [false, false, false]);
  assert.equal(p.streak('2026-11-05'), 3);
  assert.equal(p.streak('2026-11-07'), 0, 'pulou um dia');
  p.recordDaily('2026-11-05', [true, true, true]);
  assert.deepEqual(p.daily('2026-11-05').results, [false, false, false], 'o primeiro resultado do dia vale');
  assert.equal(p.daily('2026-11-05').correct, 0);
});

test('progresso: guarda só os últimos 90 dias e as contas do "encontre"', () => {
  const p = createProgressStore(memoryStorage());
  for (let i = 0; i < 100; i++) p.recordDaily(dateKey(new Date(2026, 0, 1 + i)), [true, true, true]);
  assert.equal(Object.keys(p.state().daily).length, 90);
  p.recordFind(true); p.recordFind(false); p.recordFind(true);
  assert.deepEqual(p.state().find, { tries: 3, hits: 2 });
});

test('progresso ignora armazenamento corrompido ou indisponível', () => {
  const ruim = memoryStorage({ [STORAGE_KEY]: '{nao e json' });
  assert.deepEqual(createProgressStore(ruim).trail('x'), { visited: [], done: false });
  const estranho = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ trails: { x: { visited: 'abc' } }, daily: { '2026-11-05': { results: 'x' } }, find: { tries: -4, hits: 'a' } }) });
  const p = createProgressStore(estranho);
  assert.deepEqual(p.trail('x'), { visited: [], done: false });
  assert.equal(p.daily('2026-11-05'), null);
  assert.deepEqual(p.state().find, { tries: 0, hits: 0 });
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  const q = createProgressStore(quebrado);
  q.visit('x', 'za:a', 3);
  assert.deepEqual(q.trail('x').visited, ['za:a'], 'segue em memória');
  assert.doesNotThrow(() => createProgressStore(null).recordFind(true));
});

test('listOptions: a resposta certa entre até 4 nomes distintos, sem repetir nome e estável pela semente', () => {
  const nome = (sid) => ({ 'za:a': 'Fígado', 'za:b': 'Estômago', 'za:c': 'Pâncreas', 'za:d': 'Baço', 'za:e': 'Estômago', 'za:a2': 'Fígado' }[sid] || '');
  const items = ['za:a', 'za:b', 'za:c', 'za:d', 'za:e'].map((sid) => ({ id: `estrutura:${sid}`, tipo: 'estrutura', sid, sistema: 'digestorio', caso: { correctSid: sid, correctSids: [sid] } }));
  const o = listOptions(items[0], items, nome, 3);
  assert.equal(o.length, 4);
  assert.equal(o.filter((x) => x.correct).length, 1);
  assert.equal(o.find((x) => x.correct).sid, 'za:a');
  assert.equal(new Set(o.map((x) => x.label)).size, 4, 'nomes distintos');
  assert.deepEqual(o, listOptions(items[0], items, nome, 3));
  const caso = { id: 'caso:k', tipo: 'caso', caso: { correctSid: 'za:a', correctSids: ['za:a', 'za:a2'], distractorSids: ['za:b', 'za:a2'] } };
  const oc = listOptions(caso, items, nome, 1);
  assert.ok(!oc.some((x) => x.sid === 'za:a2'), 'não sugere outra malha da resposta');
  assert.deepEqual(listOptions({ id: 'x', tipo: 'caso', caso: {} }, items, nome), []);
  assert.deepEqual(listOptions(items[0], [items[0]], nome), [], 'sem alternativas não há lista');
});

test('firstSentence corta no primeiro ponto final e limita o tamanho', () => {
  assert.equal(firstSentence('Primeira frase. Segunda frase.'), 'Primeira frase.');
  assert.equal(firstSentence(''), '');
  assert.equal(firstSentence(null), '');
  assert.ok(firstSentence('a'.repeat(500)).length <= 221);
});
