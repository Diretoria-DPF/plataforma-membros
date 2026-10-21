/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Correções da auditoria de frontend de 2026-10-20 (docs/auditoria/2026-10-20-frontend.md):
// F-09/F-10 (tempo limite, recarga sem rede, seletivo sem rede), F-08 (erro do QR no modal),
// F-07 (texto ao lado do botão acompanha o destino), F-11/F-12/F-13 (acessibilidade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const APP = read('app.js');
const HTML = read('index.html');

function loadApiFetch() {
  const start = APP.indexOf('// >>> api-fetch (puro)');
  const end = APP.indexOf('// <<< api-fetch (puro)');
  assert.ok(start >= 0 && end > start, 'bloco "api-fetch (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn { fetchJsonWithTimeout, apiTimeoutFor, restoreOutcome, API_MESSAGES, API_TIMEOUT_MS };`)();
}

const okResponse = (body) => ({ ok: true, json: () => Promise.resolve(body) });

test('F-09: chamada que responde devolve o JSON e leva o signal do AbortController', async () => {
  const { fetchJsonWithTimeout } = loadApiFetch();
  let seen = null;
  const data = await fetchJsonWithTimeout((url, init) => { seen = init; return Promise.resolve(okResponse({ success: true })); }, 'u', { method: 'POST' }, 1000, AbortController);
  assert.deepEqual(data, { success: true });
  assert.equal(seen.method, 'POST');
  assert.ok(seen.signal instanceof AbortSignal);
});

test('F-09: requisição presa estoura o tempo limite, aborta o fetch e explica em português', async () => {
  const { fetchJsonWithTimeout, API_MESSAGES } = loadApiFetch();
  let signal = null;
  const hang = (url, init) => { signal = init.signal; return new Promise(() => {}); };
  await assert.rejects(fetchJsonWithTimeout(hang, 'u', {}, 20, AbortController), (err) => err.kind === 'timeout' && err.message === API_MESSAGES.timeout);
  assert.equal(signal.aborted, true);
});

test('F-09: sem AbortController o tempo limite continua valendo', async () => {
  const { fetchJsonWithTimeout } = loadApiFetch();
  await assert.rejects(fetchJsonWithTimeout(() => new Promise(() => {}), 'u', {}, 20, null), (err) => err.kind === 'timeout');
});

test('F-09: falha de rede e HTTP de erro viram mensagens claras (nada de "Failed to fetch")', async () => {
  const { fetchJsonWithTimeout, API_MESSAGES } = loadApiFetch();
  await assert.rejects(fetchJsonWithTimeout(() => Promise.reject(new TypeError('Failed to fetch')), 'u', {}, 1000, AbortController),
    (err) => err.kind === 'network' && err.message === API_MESSAGES.network && !/Failed/.test(err.message));
  await assert.rejects(fetchJsonWithTimeout(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }), 'u', {}, 1000, AbortController), (err) => err.kind === 'http');
  await assert.rejects(fetchJsonWithTimeout(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('x')) }), 'u', {}, 1000, AbortController), (err) => err.kind === 'http');
});

test('F-09: limite padrão de 20 s; Lia e reindexação da base têm mais tempo', () => {
  const { apiTimeoutFor, API_TIMEOUT_MS } = loadApiFetch();
  assert.equal(API_TIMEOUT_MS, 20000);
  assert.equal(apiTimeoutFor('apiGetMyProfile'), 20000);
  assert.ok(apiTimeoutFor('apiAssistantChat') > 20000);
  assert.ok(apiTimeoutFor('apiAdminReindexKb') > 20000);
  assert.match(APP, /function api\(fnName\) \{[\s\S]*?fetchJsonWithTimeout\([\s\S]*?apiTimeoutFor\(fnName\)/);
});

test('F-09: recarga sem rede não derruba a sessão; só a recusa do servidor volta ao login', () => {
  const { restoreOutcome } = loadApiFetch();
  assert.equal(restoreOutcome({ success: true, profile: {} }), 'ok');
  assert.equal(restoreOutcome({ success: false, networkUnavailable: true, message: 'x' }), 'retry');
  assert.equal(restoreOutcome({ success: false, message: 'Sessão inválida.' }), 'logout');
  assert.equal(restoreOutcome(null), 'logout');
  // A espera tenta de novo sozinha (timer e evento "online") e não apaga o cache.
  const wait = APP.slice(APP.indexOf('function waitToRetryRestore'), APP.indexOf('function waitToRetryRestore') + 1200);
  assert.match(wait, /addEventListener\('online', retry\)/);
  assert.doesNotMatch(wait, /clearSessionCache\(\)/);
});

test('F-10: seletivo — falha de rede não diz que as inscrições estão fechadas', () => {
  const Sel = require('../selection.js');
  const net = { success: false, networkUnavailable: true, message: 'Sem conexão com o servidor.' };
  const ok = { success: true, enabled: true, open: true };
  const outNet = Sel.loadOutcome(net, undefined);
  assert.equal(outNet.kind, 'error');
  assert.doesNotMatch(outNet.message, /não estão abertas/);
  assert.equal(Sel.loadOutcome(ok, net).kind, 'error', 'falha de rede ao ler a inscrição também é erro, não "comece do zero"');
  assert.equal(Sel.loadOutcome({ success: false, message: 'Erro interno.' }).message, 'Erro interno.');
  assert.equal(Sel.loadOutcome({ success: true, enabled: false }).kind, 'disabled');
  assert.equal(Sel.loadOutcome(ok, { success: true, application: null }).kind, 'ready');
  assert.equal(Sel.loadOutcome(ok, { success: false, message: 'Sessão inválida.' }).kind, 'ready');
  const src = read('selection.js');
  assert.match(src, /'Tentar de novo'/);
  assert.match(src, /startBtn\.disabled = true/, '"Começar inscrição" fica desabilitado durante a chamada');
});

test('F-08: erro do QR aparece dentro do modal do crachá, não no painel Aprender', () => {
  const src = read('credential.js');
  assert.doesNotMatch(src, /learn-status/);
  assert.match(src, /function showQrError[\s\S]*?learn-credential-note[\s\S]*?credential-note--error/);
  assert.match(HTML, /id="learn-credential-note" role="status" aria-live="polite"/);
  assert.match(read('ux.css'), /\.credential-note--error/);
});

test('F-07: texto ao lado do botão acompanha o destino (formulário externo x plataforma)', () => {
  const Liga = require('../liga.js');
  assert.match(Liga.textoApoio('plataforma'), /criar sua conta/);
  assert.doesNotMatch(Liga.textoApoio('formulario'), /criar sua conta|direto para a inscrição/);
  assert.match(Liga.textoApoio('formulario'), /formulário externo/);
  for (const page of ['edital.html', 'processo-seletivo.html']) {
    assert.match(read(page), /data-apoio-inscricao/, page);
  }
});

test('F-11: os três campos que só tinham placeholder ganharam rótulo acessível', () => {
  for (const id of ['connection-request-value', 'user-search-input', 'messaging-send-text']) {
    assert.match(HTML, new RegExp(`id="${id}" aria-label="[^"]+"`), id);
  }
});

test('F-12: fotos de evento são botões e o visualizador fecha com Esc e devolve o foco', () => {
  assert.doesNotMatch(APP, /h\('img', \{\s*className: 'event-image'[^}]*onclick/);
  assert.match(APP, /function eventImageButton[\s\S]*?h\('button'/);
  const lightbox = APP.slice(APP.indexOf('function onLightboxKeydown'), APP.indexOf('function eventImageButton'));
  assert.match(lightbox, /'Escape'/);
  assert.match(lightbox, /lightbox-close'\)\.focus\(\)/);
  assert.match(lightbox, /opener\.focus\(\)/);
});

test('F-13: "Voltar" do modo admin é o primeiro da faixa e fica preso à esquerda', () => {
  const nav = HTML.slice(HTML.indexOf('id="nav-group-admin"'));
  assert.ok(nav.indexOf('btn-exit-admin-mode') < nav.indexOf('data-panel="panel-admin-dashboard"'));
  assert.match(read('styles.css'), /\.nav-group-admin #btn-exit-admin-mode \{[^}]*position: sticky; left: 0/);
});
