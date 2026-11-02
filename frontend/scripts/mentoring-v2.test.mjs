/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mentoria v2 (mentoring-v2.js, mentoring-v2.css; flag mentoring_v2_enabled): funções puras, fiação (pacote sob demanda,
// Mentoria de sempre intacta) e regras do código e do CSS (sem innerHTML, sem estilo inline, tudo sob a flag).
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
const m2 = require('../mentoring-v2.js');
const SRC = ler('mentoring-v2.js');
const CSS = ler('mentoring-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('initialOf: inicial maiúscula ou vazio', () => {
  assert.equal(m2.initialOf(' carla mendes'), 'C');
  assert.equal(m2.initialOf(null), '');
});

test('statsOf: números só do que a API devolveu; sem dados ou indisponível, nada', () => {
  assert.equal(m2.statsOf(null), null);
  assert.equal(m2.statsOf({ overview: { enabled: false } }), null);
  assert.equal(m2.statsOf({ overview: { tableMissing: true } }), null);
  const s = m2.statsOf({ overview: { available: true, asMentee: [{ status: 'active' }, { status: 'pending' }, { status: 'ended' }], asMentor: [{ status: 'pending' }, { status: 'pending' }, { status: 'active' }] } });
  assert.deepEqual(s, { active: 2, toAnswer: 2, sent: 1, available: true });
  assert.equal(m2.statsOf({ overview: {} }).available, null);
});

test('statItems: singular e plural; disponibilidade só quando conhecida', () => {
  const items = m2.statItems({ active: 1, toAnswer: 0, sent: 2, available: false });
  assert.deepEqual(items.map((i) => i.label || i.text), ['mentoria ativa', 'pedidos para responder', 'pedidos enviados', 'Não disponível como mentor']);
  assert.equal(m2.statItems({ active: 0, toAnswer: 0, sent: 0, available: null }).length, 3);
  assert.deepEqual(m2.statItems(null), []);
});

test('pillTone: situação conhecida ou neutra', () => {
  assert.equal(m2.pillTone('active'), 'ok');
  assert.equal(m2.pillTone('pending'), 'wait');
  assert.equal(m2.pillTone('qualquer'), 'off');
});

test('mount sem o painel não faz nada', () => {
  assert.equal(m2.mount(null, { getElementById: () => null }), null);
  assert.doesNotThrow(() => m2.reset());
});

test('cartões: todos os ids existem na Mentoria de sempre', () => {
  const painel = /<section id="panel-mentoring"[\s\S]*?<\/section>/.exec(HTML)[0];
  for (const c of m2.CARDS) assert.ok(painel.includes(`id="${c.childId}"`), c.childId);
  for (const l of m2.LISTS) assert.ok(painel.includes(`id="${l}"`), l);
});

test('fiação: pacote mentoria2 sob demanda; app.js só monta com a flag e reseta sem ela', () => {
  assertSobDemanda('mentoria2', 'mentoring-v2.js');
  assert.ok(ler('scripts/build.js').includes("'mentoring-v2.css'"));
  assert.ok(!ler('index.html').includes('mentoring-v2.css'));
  assert.match(APP, /data-flag-mentoring-v2-enabled/);
  assert.match(APP, /withBundle\('mentoria2'/);
  assert.match(APP, /LaiftMentoringV2\.reset\(\)/);
  assert.match(APP, /window\.LaiftMentoring\.load\(window\.App\); mountMentoringV2\(\)/);
});

test('código: sem innerHTML, sem estilo inline, sem eval, sem "grátis"', () => {
  assert.doesNotMatch(SRC, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|\.style\.|setAttribute\('style'/);
  assert.doesNotMatch(SRC, /gr[aá]tis/i);
});

test('CSS: toda regra sob a flag, movimento reduzido e sem fonte abaixo de 12 px', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.split('}').map((b) => b.split('{')[0].trim()).filter((s) => s && !s.startsWith('@'));
  for (const sel of seletores) for (const parte of sel.split(',')) assert.ok(parte.trim().includes('data-flag-mentoring-v2-enabled'), parte.trim());
  assert.match(CSS, /prefers-reduced-motion: reduce/);
  for (const m of CSS.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 12, m[0]);
  assert.match(CSS, /min-height: 44px/);
});

test('mentoring.js: o aviso de desenho existe e a API expõe snapshot', () => {
  const src = ler('mentoring.js');
  assert.match(src, /laift:mentoring-render/);
  assert.match(src, /snapshot: snapshot/);
});
