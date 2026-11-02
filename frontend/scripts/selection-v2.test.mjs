/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Processo seletivo v2 (selection-v2.js, selection-v2.css; flag selection_v2_enabled): funções puras, fiação (pacote sob
// demanda, jornada de sempre intacta) e regras do código e do CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const s2 = require('../selection-v2.js');
const sel = require('../selection.js');
const SRC = ler('selection-v2.js');
const CSS = ler('selection-v2.css');
const APP = ler('app.js');

const rascunho = (step) => ({ status: 'draft', step });

test('etapas do v2 são as mesmas da jornada de sempre', () => {
  assert.deepEqual(s2.STEP_IDS, sel.STEPS.map((s) => s.id));
});

test('completedCount e progressPct: só rascunho conta; "done" = cinco de seis', () => {
  assert.equal(s2.completedCount(null), 0);
  assert.equal(s2.completedCount({ status: 'submitted', step: 'done' }), 0);
  assert.equal(s2.completedCount(rascunho('intro')), 0);
  assert.equal(s2.completedCount(rascunho('scenario')), 2);
  assert.equal(s2.completedCount(rascunho('done')), 5);
  assert.equal(s2.progressPct(rascunho('scenario')), 33);
  assert.equal(s2.progressPct(rascunho('done')), 83);
});

test('progressText e stepLabel', () => {
  assert.equal(s2.progressText(rascunho('profile')), '1 de 6 etapa concluída');
  assert.equal(s2.progressText(rascunho('scenario')), '2 de 6 etapas concluídas');
  assert.equal(s2.stepLabel('conduct'), 'Etapa 5 de 6');
  assert.equal(s2.stepLabel('status'), '');
});

test('stepItems: estados e acesso seguem canVisit de sempre', () => {
  const app = { status: 'draft', step: 'scenario', data: {} };
  const items = s2.stepItems(app, sel.canVisit);
  assert.deepEqual(items.map((i) => i.state), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
  assert.deepEqual(items.map((i) => i.canOpen), [true, true, true, false, false, false]);
});

test('howItems: prazo e data vêm do servidor; sem data, sem parêntese', () => {
  assert.match(s2.howItems(7, '05/11')[3], /próxima análise: 05\/11/);
  assert.doesNotMatch(s2.howItems(undefined, '')[3], /próxima análise/);
  assert.match(s2.howItems(10, '')[1], /10 dias/);
});

test('viewKey e showsNotice', () => {
  assert.equal(s2.viewKey('status', rascunho('intro')), 'status-draft');
  assert.equal(s2.viewKey('status', { status: 'submitted' }), 'status');
  assert.equal(s2.showsNotice('scenario'), true);
  assert.equal(s2.showsNotice('review'), false);
});

test('install sem selection não faz nada', () => {
  assert.equal(s2.install({}, null), false);
  assert.doesNotThrow(() => s2.reset());
});

test('fiação: pacote seletivo2 sob demanda; app.js espera o pacote só com a flag', () => {
  assertSobDemanda('seletivo2', 'selection-v2.js');
  assert.ok(ler('scripts/build.js').includes("'selection-v2.css'"));
  assert.ok(!ler('index.html').includes('selection-v2.css'));
  assert.match(APP, /data-flag-selection-v2-enabled/);
  assert.match(APP, /withBundle\('seletivo2'/);
  assert.match(APP, /'panel-selection': function \(\) \{ if \(window\.LaiftSelection\) selectionV2Ready\(\)\.then/);
  assert.match(ler('selection.js'), /laift:selection-render/);
});

test('regras de sempre continuam: sem mínimo de caracteres nem questões objetivas no v2', () => {
  assert.doesNotMatch(SRC, /innerHTML|insertAdjacentHTML|outerHTML|eval\(|setAttribute\('style'/);
  assert.doesNotMatch(SRC, /gr[aá]tis/i);
  assert.doesNotMatch(SRC, /minChars|type="radio"|mínimo de/);
});

test('CSS: toda regra sob a flag, movimento reduzido, fontes de 12 px ou mais', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.split('}').map((b) => b.split('{')[0].trim()).filter((s) => s && !s.startsWith('@'));
  for (const sel2 of seletores) for (const parte of sel2.split(',')) assert.ok(parte.trim().includes('data-flag-selection-v2-enabled'), parte.trim());
  assert.match(CSS, /prefers-reduced-motion: reduce/);
  for (const m of CSS.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 12, m[0]);
});
