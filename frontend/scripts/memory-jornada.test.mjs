/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Jornada de preferências da memória de estudo (T2, opção B): uma pergunta por tela, temas por área com "sugerido",
// nível, estilo, tamanho, objetivo e resumo. As regras puras ficam em memory-core.js; a tela, em memory.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Core = require('../memory-journey.js');
import { assertSobDemanda } from './lazy-wiring.mjs';

const TOPICS = [
  { slug: 'farmacocinetica', label: 'Farmacocinética' },
  { slug: 'antidotos', label: 'Antídotos' },
  { slug: 'farmacotecnica', label: 'Farmacotécnica' },
  { slug: 'anatomia-geral', label: 'Anatomia (geral)' },
  { slug: 'tema-novo-do-servidor', label: 'Tema novo' },
];

test('groupTopics: agrupa por área, mantém a ordem do servidor e marca os sugeridos', () => {
  const groups = Core.groupTopics(TOPICS, ['antidotos']);
  assert.deepEqual(groups.map((g) => g.label), ['Farmacologia', 'Toxicologia', 'Farmacotécnica', 'Anatomia', 'Outros temas']);
  assert.deepEqual(groups[1].topics, [{ slug: 'antidotos', label: 'Antídotos', suggested: true }]);
  assert.equal(groups[0].topics[0].suggested, false);
});

test('groupTopics: tema que o servidor acrescentar cai em "Outros temas" sem mexer na tela; área vazia não aparece', () => {
  const groups = Core.groupTopics([{ slug: 'imuno', label: 'Imunofarmacologia' }], []);
  assert.deepEqual(groups.map((g) => g.label), ['Outros temas']);
  assert.deepEqual(Core.groupTopics([], []), []);
});

test('suggestedFrom: sugere só temas que já têm nível guardado', () => {
  const items = [
    { kind: 'topic_level', slug: 'antidotos', level: 3 },
    { kind: 'study_pref', slug: 'formato', value: 'resumo' },
    { kind: 'goal', slug: 'prova' },
  ];
  assert.deepEqual(Core.suggestedFrom(items), ['antidotos']);
  assert.deepEqual(Core.suggestedFrom(null), []);
});

test('journeyPayloads: só itens do vocabulário; tema sem nível, preferência vazia e objetivo vazio não são gravados', () => {
  const p = { topics: ['antidotos', 'farmacocinetica'], levels: { antidotos: 4 }, formato: 'exemplos', ritmo: '', goal: 'prova' };
  assert.deepEqual(Core.journeyPayloads(p), [
    { kind: 'topic_level', slug: 'antidotos', level: 4 },
    { kind: 'study_pref', slug: 'formato', value: 'exemplos' },
    { kind: 'goal', slug: 'prova' },
  ]);
  assert.deepEqual(Core.journeyPayloads(Core.newPrefs()), []);
});

test('prefSteps: o passo de nível só existe quando há temas escolhidos; resumo é sempre o último', () => {
  assert.deepEqual(Core.prefSteps({ topics: [] }), ['topics', 'formato', 'ritmo', 'goal', 'summary']);
  assert.deepEqual(Core.prefSteps({ topics: ['antidotos'] }), ['topics', 'levels', 'formato', 'ritmo', 'goal', 'summary']);
});

test('newPrefs: nada pré-marcado', () => {
  assert.deepEqual(Core.newPrefs(), { step: 'topics', topics: [], levels: {}, formato: '', ritmo: '', goal: '' });
});

test('textos da jornada: sem diminutivo, sem exclamação e sem prometer conteúdo que não existe', () => {
  const all = JSON.stringify(Core.TEXT);
  assert.match(all, /Mais temas em breve/);
  assert.doesNotMatch(all, /inho\b|inha\b|!/);
  assert.equal(Object.keys(Core.TEXT.titles).length, 6);
});

test('memory.js: a ativação abre a jornada, só "Salvar e concluir" grava e há saída sem salvar', () => {
  const src = fs.readFileSync(path.join(frontend, 'memory.js'), 'utf8');
  assert.match(src, /prefs: journey\(\)\.newPrefs\(\)/);
  assert.match(src, /LaiftLazy\.load\('memory-journey'\)/);
  assert.match(src, /journey\(\)\.buildView\(/);
  assert.match(src, /function onFinishPrefs\(/);
  assert.match(src, /journey\(\)\.journeyPayloads\(/);
  assert.match(fs.readFileSync(path.join(frontend, 'memory-journey.js'), 'utf8'), /finishNoSave/);
  assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/);
});

test('memory-journey.js: pacote sob demanda (fora do index.html e do precache), sem innerHTML nem cores literais', () => {
  assertSobDemanda('memory-journey', 'memory-journey.js');
  const src = fs.readFileSync(path.join(frontend, 'memory-journey.js'), 'utf8');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|fetch\(|console\./);
  assert.ok(src.split(String.fromCharCode(10)).length < 800);
});
