/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Administração v2 (admin-v2.js, admin-v2.css; flag admin_v2_enabled): funções puras, fiação (pacote sob demanda, flag
// desligada por padrão, modo admin de sempre intacto) e regras do código e do CSS (sem innerHTML, sem estilo inline,
// tudo sob a flag, movimento reduzido, alvos de 44 px).
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
const a2 = require('../admin-v2.js');
const SRC = ler('admin-v2.js');
const CSS = ler('admin-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('orderTabs: ordem da barra, desconhecidas no fim na ordem recebida', () => {
  const out = a2.orderTabs([
    { panel: 'panel-admin-roles' }, { panel: 'panel-x' }, { panel: 'panel-admin-selection' }, { panel: 'panel-admin-dashboard' }, { panel: 'panel-admin-flags' }, { panel: 'panel-y' },
  ]).map((t) => t.panel);
  assert.deepEqual(out, ['panel-admin-dashboard', 'panel-admin-selection', 'panel-admin-flags', 'panel-admin-roles', 'panel-x', 'panel-y']);
  assert.deepEqual(a2.orderTabs(null), []);
});

test('toda seção da barra de sempre está na ordem da barra', () => {
  const grupo = /id="nav-group-admin"[\s\S]*?<\/nav>/.exec(HTML)[0];
  const ids = [...grupo.matchAll(/data-panel="(panel-admin-[a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15);
  for (const id of ids) {
    assert.ok(a2.TAB_ORDER.includes(id), `${id} falta na ordem`);
    assert.ok(HTML.includes(`<section id="${id}"`), `${id} deve existir no index.html`);
  }
});

test('chipValue e chipSpoken: carregando, indisponível e número', () => {
  assert.equal(a2.chipValue(undefined), '…');
  assert.equal(a2.chipValue(null), '—');
  assert.equal(a2.chipValue(3), '3');
  assert.equal(a2.chipValue(-2), '0');
  assert.equal(a2.chipSpoken('Exclusões', undefined), 'Exclusões: carregando');
  assert.equal(a2.chipSpoken('Exclusões', null), 'Exclusões: indisponível agora');
  assert.equal(a2.chipSpoken('Exclusões', 2), 'Exclusões: 2');
});

test('selectionPending, deletionsPending, proposalsPending: só o que a API devolve', () => {
  assert.equal(a2.selectionPending({ success: true, counts: { submitted: 1, in_review: 2, interview: 3, waitlist: 9 } }), 6);
  assert.equal(a2.selectionPending({ success: false }), null);
  assert.equal(a2.selectionPending(null), null);
  assert.equal(a2.deletionsPending({ success: true, items: [{}, {}] }), 2);
  assert.equal(a2.deletionsPending({ success: true }), null);
  assert.equal(a2.proposalsPending({ proposals_pending: 4 }), 4);
  assert.equal(a2.proposalsPending(null), null);
});

test('dirtyKeys e dirtyText', () => {
  const items = [{ key: 'a', enabled: true }, { key: 'b', enabled: false }, { key: 'c', enabled: false }];
  assert.deepEqual(a2.dirtyKeys(items, { a: false, b: false, c: true }), ['a', 'c']);
  assert.deepEqual(a2.dirtyKeys(items, {}), []);
  assert.equal(a2.dirtyText(0), 'Nenhuma alteração');
  assert.equal(a2.dirtyText(1), '1 alteração não salva');
  assert.equal(a2.dirtyText(3), '3 alterações não salvas');
});

test('flagMeta e filterFlags', () => {
  assert.equal(a2.flagMeta({ key: 'x', rolloutPct: 100, conditions: {} }), '');
  assert.equal(a2.flagMeta({ key: 'x', rolloutPct: 50, conditions: { role: 'admin' } }), 'Para 50% das pessoas · Com condições');
  assert.match(a2.flagMeta({ key: 'mfa_required', rolloutPct: 100 }), /reautenticação/);
  const items = [{ key: 'home_v2_enabled', description: 'Início' }, { key: 'x', description: 'Perfil novo' }];
  assert.equal(a2.filterFlags(items, 'perfil').length, 1);
  assert.equal(a2.filterFlags(items, '').length, 2);
});

test('mount sem o modo administrador não faz nada', () => {
  const doc = { querySelector: () => null, getElementById: () => null };
  assert.equal(a2.mount(null, doc), null);
  assert.doesNotThrow(() => a2.reset());
});

test('fiação: pacote admin2 sob demanda e app.js só monta com a flag', () => {
  assertSobDemanda('admin2', 'admin-v2.js');
  assert.ok(ler('scripts/build.js').includes("'admin-v2.css'"), 'build.js publica o CSS');
  assert.ok(/data-flag-admin-v2-enabled/.test(APP) && /withBundle\('admin2'/.test(APP));
  assert.ok(/LaiftAdminV2\.reset\(\)/.test(APP), 'flag desligada devolve o modo admin de sempre');
  assert.ok(/'panel-admin-flags'/.test(APP));
});

test('código: sem innerHTML, sem estilo inline, sem textos proibidos', () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(!/gr[áa]tis|\bLia\b/i.test(SRC + CSS));
});

test('CSS: tudo sob a flag, fontes de 12 px, alvos de 44 px e movimento reduzido', () => {
  const sem = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
  for (const bloco of sem.split('}')) {
    const sel = bloco.split('{')[0].trim();
    if (!sel) continue;
    for (const parte of sel.split(',')) assert.ok(/data-flag-admin-v2-enabled/.test(parte), `seletor sem a flag: ${parte.trim()}`);
  }
  assert.ok(/prefers-reduced-motion: reduce/.test(CSS));
  for (const m of CSS.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `fonte ${m[1]}px`);
  assert.ok(/\.adm2-tab \{[^}]*min-height: 44px/.test(CSS) && /\.adm2-back \{[^}]*min-height: 44px/.test(CSS));
});
