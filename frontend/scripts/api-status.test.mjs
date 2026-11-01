/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// OPS-06: o cliente pede status HTTP real, trata o corpo de erro igual ao de HTTP 200 e repete só leituras.
// Roda com: node --test frontend/scripts/api-status.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');
const HANDLERS = fs.readFileSync(path.join(frontend, '..', 'worker', 'src', 'handlers.js'), 'utf8');

function load() {
  const start = APP.indexOf('// >>> api-fetch (puro)');
  const end = APP.indexOf('// <<< api-fetch (puro)');
  assert.ok(start >= 0 && end > start);
  return new Function(`${APP.slice(start, end)}\nreturn { fetchJsonWithTimeout, fetchJsonWithRetry, isRetryableRead, API_RETRYABLE_READS, API_MESSAGES, API_STATUS_HEADER };`)();
}
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => (body === undefined ? Promise.reject(new SyntaxError('x')) : Promise.resolve(body)) });
const noWait = () => Promise.resolve();

test('corpo {success:false} em HTTP 4xx volta igual ao de HTTP 200 (sem exceção)', async () => {
  const { fetchJsonWithTimeout } = load();
  const body = { success: false, message: 'Evento não encontrado.' };
  const data = await fetchJsonWithTimeout(() => Promise.resolve(reply(404, body)), 'u', {}, 1000, AbortController);
  assert.deepEqual(data, body);
});

test('HTTP de erro sem corpo da API: 429 vira mensagem de limite; 5xx vira http; offline vira mensagem própria', async () => {
  const { fetchJsonWithTimeout, API_MESSAGES } = load();
  await assert.rejects(fetchJsonWithTimeout(() => Promise.resolve(reply(429, undefined)), 'u', {}, 1000, AbortController),
    (e) => e.kind === 'rate' && e.message === API_MESSAGES.rate && e.status === 429);
  await assert.rejects(fetchJsonWithTimeout(() => Promise.resolve(reply(502, undefined)), 'u', {}, 1000, AbortController),
    (e) => e.kind === 'http' && e.status === 502 && e.message === API_MESSAGES.http);
  await assert.rejects(fetchJsonWithTimeout(() => Promise.resolve(reply(500, { oi: 1 })), 'u', {}, 1000, AbortController), (e) => e.kind === 'http');
  assert.match(API_MESSAGES.rate, /muitas|aguarde/i);
  assert.match(API_MESSAGES.offline, /internet|conex/i);
});

test('leitura idempotente: repete UMA vez em falha de rede e em 5xx (com ou sem corpo)', async () => {
  const { fetchJsonWithRetry } = load();
  let calls = 0;
  const net = () => { calls++; return calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(reply(200, { success: true })); };
  assert.deepEqual(await fetchJsonWithRetry('apiListEvents', net, 'u', {}, 1000, AbortController, noWait), { success: true });
  assert.equal(calls, 2);
  calls = 0;
  const five = () => { calls++; return Promise.resolve(calls === 1 ? reply(503, { success: false, message: 'x' }) : reply(200, { success: true })); };
  assert.deepEqual(await fetchJsonWithRetry('apiListEvents', five, 'u', {}, 1000, AbortController, noWait), { success: true });
  assert.equal(calls, 2);
  calls = 0;
  const always = () => { calls++; return Promise.reject(new TypeError('x')); };
  await assert.rejects(fetchJsonWithRetry('apiListEvents', always, 'u', {}, 1000, AbortController, noWait), (e) => e.kind === 'network');
  assert.equal(calls, 2, 'no máximo 1 retentativa');
});

test('escrita NUNCA é repetida, nem em rede nem em 5xx; 4xx e timeout de leitura também não', async () => {
  const { fetchJsonWithRetry } = load();
  let calls = 0;
  const net = () => { calls++; return Promise.reject(new TypeError('x')); };
  await assert.rejects(fetchJsonWithRetry('apiSubmitProposal', net, 'u', {}, 1000, AbortController, noWait));
  assert.equal(calls, 1);
  calls = 0;
  const five = () => { calls++; return Promise.resolve(reply(500, { success: false, message: 'x' })); };
  await fetchJsonWithRetry('apiCastVote', five, 'u', {}, 1000, AbortController, noWait);
  assert.equal(calls, 1);
  calls = 0;
  const four = () => { calls++; return Promise.resolve(reply(404, { success: false, message: 'x' })); };
  await fetchJsonWithRetry('apiListEvents', four, 'u', {}, 1000, AbortController, noWait);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(fetchJsonWithRetry('apiListEvents', () => { calls++; return new Promise(() => {}); }, 'u', {}, 20, AbortController, noWait), (e) => e.kind === 'timeout');
  assert.equal(calls, 1);
});

test('a lista de leituras é explícita, existe no Worker e não contém escrita conhecida', () => {
  const { API_RETRYABLE_READS, isRetryableRead } = load();
  assert.ok(API_RETRYABLE_READS.length > 5);
  for (const name of API_RETRYABLE_READS) {
    assert.match(name, /^api(Get|List|Learn(Get|Library(List|Get|Search|PublicCatalog)))/, name);
    assert.ok(HANDLERS.includes(`  ${name}:`), `${name} não existe em API_REGISTRY`);
    assert.doesNotMatch(name, /Set|Submit|Send|Mark|Cast|Register|Login|Logout|Touch|Update|Delete|Admin/);
  }
  assert.equal(isRetryableRead('apiLogin'), false);
  assert.equal(isRetryableRead('apiListEvents'), true);
});

test('api() e a ponte dos módulos enviam o cabeçalho opt-in e tratam o corpo de erro', () => {
  const { API_STATUS_HEADER } = load();
  assert.equal(API_STATUS_HEADER, 'X-Laift-Status');
  assert.match(APP, /function api\(fnName\)[\s\S]{0,600}API_STATUS_HEADER/);
  assert.match(APP, /function callLearningApi[\s\S]{0,2600}API_STATUS_HEADER/);
  assert.doesNotMatch(APP.slice(APP.indexOf('function callLearningApi')).slice(0, 2600), /if \(!res\.ok\) throw new Error\('http'\)/);
});
