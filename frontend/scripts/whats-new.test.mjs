/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Novidades in-app (ENG-07): frontend/whats-new.js, uma vez por versão, com LaiftDialog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const WhatsNew = require('../whats-new.js');

const HIGHLIGHTS_ATTR = 'data-flag-highlights-enabled';

function memoryStorage({ throws = false } = {}) {
  const data = {};
  return {
    data,
    getItem(key) { if (throws) throw new Error('bloqueado'); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { if (throws) throw new Error('bloqueado'); data[key] = String(value); },
  };
}

function setup({ flags = [], storage = memoryStorage(), withDialog = true } = {}) {
  const doc = { documentElement: { hasAttribute: (name) => flags.includes(name) } };
  const shown = [];
  const win = withDialog ? { LaiftDialog: { alert: (message, opts) => { shown.push({ message, opts }); return Promise.resolve(); } } } : {};
  const api = WhatsNew.createWhatsNew(doc, win, WhatsNew.createSeenStore(storage));
  return { doc, api, shown, storage };
}

test('conteúdo: primeira entrada é a Guia, em feminino, e há diálogos acessíveis (sem selo)', () => {
  const [first] = WhatsNew.ENTRIES;
  assert.equal(first.id, 'guia');
  assert.match(first.text, /Guia/);
  assert.match(first.text, /\bEla\b/);
  const ids = WhatsNew.ENTRIES.map((e) => e.id);
  assert.ok(ids.includes('dialogos'));
  assert.ok(!ids.includes('selo'), 'a entrada de selo foi retirada (regra do dono)');
});

test('conteúdo: novidades de F-027 (demo, QR rotativo, Visão geral) estão no aviso', () => {
  const ids = WhatsNew.ENTRIES.map((e) => e.id);
  assert.ok(ids.includes('demo') && ids.includes('qr-rotativo') && ids.includes('visao-geral'));
  assert.equal(WhatsNew.VERSION, '2026-11-13');
});

test('conteúdo público: whats-new.js não traz selo, revisão, IA, rascunho nem [NV]', () => {
  const code = read('whats-new.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /selo|revis|rascunho|\[NV\]|ⓘ|inteligência artificial/i);
  assert.doesNotMatch(code, /\bIA\b/);
  for (const entry of WhatsNew.ENTRIES) {
    assert.doesNotMatch(entry.text, /selo|revis|rascunho|\[NV\]|ⓘ|\bIA\b|inteligência artificial/i, `${entry.id}: termo proibido`);
  }
});

test('conteúdo: texto curto, sem diminutivos nem dado pessoal, versão no formato AAAA-MM-DD', () => {
  assert.match(WhatsNew.VERSION, /^\d{4}-\d{2}-\d{2}$/);
  for (const entry of WhatsNew.ENTRIES) {
    assert.ok(entry.text.length <= 160, `${entry.id} longa demais (${entry.text.length})`);
    assert.doesNotMatch(entry.text, /\b\w+(zinh[oa]s?|inh[oa]s?)\b/i, `${entry.id}: diminutivo`);
    assert.doesNotMatch(entry.text, /@|\d{6,}/, `${entry.id}: dado pessoal`);
  }
});

test('destaques da Liga: entrada só aparece com a flag highlights_enabled ligada', () => {
  const off = setup();
  off.api.show();
  assert.ok(!off.shown[0].message.includes('Na Liga'));
  const on = setup({ flags: [HIGHLIGHTS_ATTR] });
  on.api.show();
  assert.ok(on.shown[0].message.includes('Na Liga'));
  assert.equal(WhatsNew.entriesFor(on.doc).length, WhatsNew.entriesFor(off.doc).length + 1);
});

test('maybeShow: abre uma vez por versão e grava a versão vista', async () => {
  const s = setup();
  assert.equal(s.api.maybeShow(), true);
  assert.equal(s.shown.length, 1);
  assert.equal(s.shown[0].opts.title, 'Novidades da plataforma');
  assert.equal(s.storage.data[WhatsNew.STORAGE_KEY], WhatsNew.VERSION);
  await Promise.resolve();
  assert.equal(s.api.maybeShow(), false, 'mesma versão: não reabre');
  assert.equal(s.shown.length, 1);
});

test('nova versão volta a aparecer para quem viu a anterior', () => {
  const s = setup({ storage: memoryStorage() });
  s.storage.setItem(WhatsNew.STORAGE_KEY, '2000-01-01');
  assert.equal(s.api.maybeShow(), true);
});

test('show: reabre sob demanda mesmo já visto ("Ver novidades"), mas não duplica enquanto está aberto', async () => {
  const s = setup();
  s.api.maybeShow();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(s.api.show(), true);
  assert.equal(s.api.show(), false, 'já aberto');
  assert.equal(s.shown.length, 2);
});

test('markSeen: marca sem exibir (quem acabou de ver o onboarding)', () => {
  const s = setup();
  s.api.markSeen();
  assert.equal(s.api.maybeShow(), false);
  assert.equal(s.shown.length, 0);
});

test('mensagem: uma linha com marcador por entrada (o diálogo preserva as quebras)', () => {
  const lines = WhatsNew.messageFor(WhatsNew.entriesFor({ documentElement: { hasAttribute: () => true } })).split('\n');
  assert.equal(lines.length, WhatsNew.ENTRIES.length);
  assert.ok(lines.every((line) => line.startsWith('• ')));
});

test('storage bloqueado: exibe mesmo assim e não lança; sem LaiftDialog não exibe e não lança', () => {
  const blocked = setup({ storage: memoryStorage({ throws: true }) });
  assert.equal(blocked.api.maybeShow(), true);
  assert.equal(setup({ withDialog: false }).api.maybeShow(), false);
  const nothing = WhatsNew.createWhatsNew({}, {}, WhatsNew.createSeenStore(null));
  assert.equal(nothing.maybeShow(), false);
});

test('fiação: pacote "novidades" (diálogo + script), CSS no index.html, app.js e Perfil', () => {
  const lazy = require('../lazy-bundles.js');
  assert.deepEqual(lazy.BUNDLES.novidades, ['modulos/shared/laift-dialog.js', 'whats-new.js']);
  const html = read('index.html');
  assert.ok(html.includes('href="modulos/shared/laift-dialog.css"'));
  assert.ok(!html.includes('whats-new.js'), 'não é eager');
  assert.match(html, /<button type="button" id="btn-whats-new"[^>]*>Ver novidades<\/button>/);
  const app = read('app.js');
  assert.match(app, /withBundle\('novidades'/);
  assert.match(app, /LaiftWhatsNew\.show\(\)/);
  assert.match(app, /showWhatsNew\(onboardingOpened\)/);
});

test('whats-new.js: sem innerHTML, eval, handler inline nem som', () => {
  const src = read('whats-new.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|eval\(|new Function|document\.write|onclick=|Audio/);
});
