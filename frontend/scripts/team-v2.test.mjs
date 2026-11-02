/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Equipe v2 (team-v2.js, team-v2.css; flag team_v2_enabled): funções puras, fiação (pacote sob demanda, tela de sempre
// sem a flag) e regras do código e do CSS (sem innerHTML, sem estilo inline, tudo sob a flag).
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
const t2 = require('../team-v2.js');
const SRC = ler('team-v2.js');
const CSS = ler('team-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('tabLabel: contagem só em Pedidos e só quando há pedidos listados', () => {
  const ped = t2.TABS.find((t) => t.key === 'ped');
  const org = t2.TABS.find((t) => t.key === 'org');
  assert.equal(t2.tabLabel(ped, 2), 'Pedidos (2)');
  assert.equal(t2.tabLabel(ped, 0), 'Pedidos');
  assert.equal(t2.tabLabel(org, 5), 'Organograma');
});

test('countItems conta só article.list-item', () => {
  const lista = { querySelectorAll: (sel) => (sel === 'article.list-item' ? [1, 2, 3] : []) };
  assert.equal(t2.countItems(lista), 3);
  assert.equal(t2.countItems(null), 0);
});

test('abas: chaves únicas e todos os ids existem no index.html', () => {
  assert.equal(new Set(t2.TABS.map((t) => t.key)).size, t2.TABS.length);
  for (const t of t2.TABS) assert.ok(HTML.includes(`id="${t.childId}"`), t.childId);
});

test('mount sem o painel não faz nada', () => {
  assert.equal(t2.mount(null, { getElementById: () => null }), null);
  assert.doesNotThrow(() => t2.reset());
});

test('o script só apresenta: sem innerHTML, sem estilo inline, sem chamadas de API', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(!/callApi|apiSend|apiRespond|apiRemove/.test(SRC), 'as regras de conexão ficam no app.js');
});

test('textos: sem "grátis"', () => {
  for (const texto of [SRC, CSS]) assert.ok(!/gr[áa]tis/i.test(texto));
});

test('CSS: toda regra sob a flag, movimento reduzido, foco visível e fontes de 12 px ou mais', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.replace(/@media[^{]*\{/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const seletor of seletores) {
    for (const parte of seletor.split(',')) assert.ok(parte.trim().startsWith(':root[data-flag-team-v2-enabled]'), `fora da flag: ${parte.trim()}`);
  }
  assert.ok(CSS.includes('prefers-reduced-motion: reduce'));
  assert.ok(CSS.includes('focus-visible'));
  assert.ok(!/font-size:\s*(1[01]|[0-9])(\.\d+)?px/.test(CSS));
  assert.ok(/min-height: 44px/.test(CSS));
});

test('fiação: pacote sob demanda, flag no app.js e tela de sempre sem a flag', () => {
  assertSobDemanda('equipe2', 'team-v2.js');
  assert.ok(ler('scripts/build.js').includes("'team-v2.css'"));
  assert.ok(APP.includes('data-flag-team-v2-enabled'));
  assert.ok(APP.includes("withBundle('equipe2'"));
  assert.ok(/if \(teamV2On\(\)\) mountTeamV2\(\);\s*else if \(window\.LaiftTeamV2\) window\.LaiftTeamV2\.reset/.test(APP));
  assert.ok(!HTML.includes('team-v2'), 'o index.html não carrega nada de Equipe v2');
});
