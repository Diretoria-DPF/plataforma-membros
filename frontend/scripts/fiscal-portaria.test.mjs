/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CR = String.fromCharCode(13);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').split(CR).join('');
const HTML = read('modulos/fiscal/index.html');
const JS = read('modulos/fiscal/fiscal-engine.js');
const CSS = read('modulos/fiscal/fiscal.css');
const BADGE = read('modulos/cracha/index.html');

test('Portaria: contador ao vivo, faixa de resultado e últimas entradas existem na tela', () => {
  for (const id of ['liveCount', 'liveBar', 'scanResult', 'scanResultTitle', 'scanResultDetail', 'recentList']) {
    assert.ok(HTML.includes('id="' + id + '"'), 'falta #' + id);
  }
  assert.ok(/id="scanResult"[^>]*role="status"/.test(HTML), 'resultado anunciado a leitores de tela');
});

test('Portaria: resultado grande com vibração, últimas entradas e contador atualizado por outros terminais', () => {
  assert.match(JS, /function showResult\(kind, title, detail\)/);
  assert.match(JS, /navigator\.vibrate/);
  assert.match(JS, /showResult\('error', 'Não registrado'/);
  assert.match(JS, /showResult\(p\.alreadyCheckedIn \? 'warning' : 'success'/);
  assert.match(JS, /function pushRecent\(/);
  assert.match(JS, /setInterval\(refreshCounts, REFRESH_COUNTS_MS\)/);
  assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(/.test(JS), 'DOM só com textContent');
});

test('Portaria: ids que o fluxo e os e2e usam continuam, e o secundário fica recolhido', () => {
  for (const id of ['scannerStart', 'scannerStop', 'manualEmail', 'manualSubmit', 'exportCsv', 'printBadges', 'listRegistered', 'fiscalEvent', 'status']) {
    assert.ok(HTML.includes('id="' + id + '"'), 'falta #' + id);
  }
  assert.equal((HTML.match(/<details class="fiscal-card fiscal-more">/g) || []).length, 3);
  assert.match(CSS, /\.fiscal-result\.is-success/);
  assert.match(CSS, /\.fiscal-result\.is-error/);
});

test('Estúdio de crachá: essencial à vista, personalização recolhida, ids do cracha.js preservados', () => {
  assert.match(BADGE, /<details class="group advanced">/);
  for (const id of ['nameInput', 'roleInput', 'photoFile', 'orgInput', 'idInput', 'photoUrl', 'qrInput', 'instructionsInput', 'bgColor', 'accentColor', 'textColor', 'showPhoto', 'showOrg', 'showRole', 'showQr', 'showInstructions', 'showId', 'flipBtn', 'printBtn']) {
    assert.ok(BADGE.includes('id="' + id + '"'), 'falta #' + id);
  }
  assert.ok(!/Matricula \/ token/.test(BADGE), 'rótulo confuso do QR foi trocado');
});

test('Portaria: duas abas, crachá individual com PDF e lote só sob pedido', () => {
  for (const id of ['tabPresenca', 'tabPessoas', 'paneAttendance', 'panePeople', 'badgePreviewCard', 'badgePreview', 'exportBadgePdf', 'openStudio', 'batchRegistered', 'batchPresent', 'printBadges']) {
    assert.ok(HTML.includes('id="' + id + '"'), 'falta #' + id);
  }
  assert.ok(/role="tablist"/.test(HTML) && /aria-controls="panePeople"/.test(HTML), 'abas acessíveis');
  assert.ok(/<summary>Criar vários crachás<\/summary>/.test(HTML), 'o lote fica recolhido');
  assert.match(JS, /badgeBtn\.addEventListener\('click', \(\) => showBadgePreview\(p\)\)/, 'o botão Crachá mostra um crachá, não abre o lote');
  assert.match(JS, /function exportPreviewPdf\(\)/);
  assert.match(JS, /Salvar como PDF/);
  assert.match(JS, /function selectForBatch\(onlyPresent\)/);
  assert.match(CSS, /\.badge-sheet\.is-single/);
});

test('Portaria: foto do perfil só por https, com iniciais de reserva, e o CSP libera só o R2 público', () => {
  assert.match(JS, /function badgeAvatar\(b, initial\)/);
  assert.match(JS, /\^https:/);
  assert.match(HTML, /img-src 'self' data: blob: https:\/\/pub-f449f2cc117b4cc3a34c374218ac2e99\.r2\.dev;/);
});

test('menu: o item vira Portaria', () => {
  const index = read('index.html');
  assert.ok(index.includes('<span>Portaria</span>'));
  assert.ok(index.includes('<span class="app-menu__titulo">Portaria</span>'));
});
