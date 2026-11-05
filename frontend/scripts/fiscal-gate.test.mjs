/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Portão (modulos/fiscal/fiscal-gate.js, A2): fila offline idempotente por token e cartão de resultado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Gate = require('../modulos/fiscal/fiscal-gate.js');

const NOW = 1_800_000_000_000;
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const QR_A = 'LAIFT:v3:11111111-1111-4111-8111-111111111111.eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.60000000.AbCdEfGhIjKlMnOpQrStUvWx';
const QR_B = 'LAIFT:v2:22222222-2222-4222-8222-222222222222.AbCdEfGhIjKlMnOpQrStUvWx';
const OFFLINE = { success: false, message: 'Falha de comunicação com o servidor.', networkUnavailable: true };

function make(responses, extra) {
  const sent = [];
  const results = [];
  const queue = Gate.createQueue(Object.assign({
    backend: Gate.createMemoryBackend(),
    now: () => NOW,
    owner: () => 'op1',
    send: async (item) => { sent.push(item); return responses.length ? responses.shift() : { success: true }; },
    onResult: (item, res) => results.push([item.qrPayload, res.success]),
  }, extra));
  return { queue, sent, results };
}

test('enqueue: ler o mesmo QR no mesmo evento duas vezes guarda uma só (idempotência por token)', async () => {
  const { queue } = make([]);
  assert.equal(await queue.enqueue(EVENT, QR_A, NOW - 1000), true);
  assert.equal(await queue.enqueue(EVENT, QR_A, NOW - 500), true);
  assert.equal(await queue.enqueue(EVENT, QR_B, NOW - 400), true);
  assert.equal(await queue.count(), 2);
});

test('enqueue: QR malformado, evento inválido ou leitura com mais de 12 h não entram', async () => {
  const { queue } = make([]);
  assert.equal(await queue.enqueue(EVENT, 'LAIFT:ID:a@b.com', NOW), false);
  assert.equal(await queue.enqueue('x', QR_A, NOW), false);
  assert.equal(await queue.enqueue(EVENT, QR_A, NOW - 13 * 3600_000), false);
  assert.equal(await queue.enqueue(EVENT, QR_A, NOW + 3600_000), false);
  assert.equal(await queue.count(), 0);
});

test('flush: envia em ordem de leitura com a hora da leitura e esvazia a fila', async () => {
  const { queue, sent, results } = make([]);
  await queue.enqueue(EVENT, QR_B, NOW - 1000);
  await queue.enqueue(EVENT, QR_A, NOW - 5000);
  const out = await queue.flush();
  assert.deepEqual(out, { sent: 2, dropped: 0, pending: 0 });
  assert.deepEqual(sent.map((s) => s.qrPayload), [QR_A, QR_B]);
  assert.equal(sent[0].scannedAt, NOW - 5000);
  assert.equal(await queue.count(), 0);
  assert.equal(results.length, 2);
});

test('flush: sem rede mantém tudo e para na primeira falha; recusa definitiva descarta o item', async () => {
  const a = make([OFFLINE]);
  await a.queue.enqueue(EVENT, QR_A, NOW - 5000);
  await a.queue.enqueue(EVENT, QR_B, NOW - 1000);
  assert.deepEqual(await a.queue.flush(), { sent: 0, dropped: 0, pending: 2 });
  assert.equal(a.sent.length, 1, 'parou na primeira falha de conexão');
  assert.equal(await a.queue.count(), 2);

  const b = make([{ success: false, message: 'O QR Code expirou' }, { success: true }]);
  await b.queue.enqueue(EVENT, QR_A, NOW - 5000);
  await b.queue.enqueue(EVENT, QR_B, NOW - 1000);
  assert.deepEqual(await b.queue.flush(), { sent: 1, dropped: 1, pending: 0 });
  assert.equal(await b.queue.count(), 0);
});

test('flush: o item de um operador não é enviado por outro no mesmo aparelho', async () => {
  const backend = Gate.createMemoryBackend();
  const one = make([], { backend, owner: () => 'op1' });
  const two = make([], { backend, owner: () => 'op2' });
  await one.queue.enqueue(EVENT, QR_A, NOW - 1000);
  assert.deepEqual(await two.queue.flush(), { sent: 0, dropped: 0, pending: 0 });
  assert.equal(two.sent.length, 0);
  assert.equal(await one.queue.count(), 1);
});

test('item corrompido no armazenamento é descartado ao ler', async () => {
  const backend = Gate.createMemoryBackend();
  await backend.put({ key: 'lixo', eventId: 'x', qrPayload: 'y', scannedAt: 1 });
  const { queue } = make([], { backend });
  assert.equal(await queue.count(), 0);
  assert.deepEqual(await backend.getAll(), []);
});

test('isTransient: só falha de conexão vale reenviar', () => {
  assert.equal(Gate.isTransient(OFFLINE), true);
  assert.equal(Gate.isTransient({ success: false, message: 'A requisição demorou demais.' }), true);
  assert.equal(Gate.isTransient({ success: false, message: 'O QR Code expirou' }), false);
  assert.equal(Gate.isTransient({ success: true }), false);
});

test('resultView: verde, amarelo e vermelho; avatar só https; papel em português', () => {
  const ok = Gate.resultView({ success: true, participant: { fullName: 'Ana Souza', role: 'member', avatarUrl: 'https://x.test/a.png', alreadyCheckedIn: false } });
  assert.deepEqual([ok.tone, ok.name, ok.role, ok.initials, ok.avatarUrl], ['ok', 'Ana Souza', 'Membro', 'AS', 'https://x.test/a.png']);
  const warn = Gate.resultView({ success: true, participant: { fullName: 'Ana', role: 'visitor', avatarUrl: 'javascript:alert(1)', alreadyCheckedIn: true } });
  assert.deepEqual([warn.tone, warn.avatarUrl, warn.title], ['warn', '', 'Já estava presente']);
  const bad = Gate.resultView({ success: false, message: 'O QR Code expirou' });
  assert.deepEqual([bad.tone, bad.title], ['error', 'O QR Code expirou']);
  assert.equal(Gate.resultView(null, true).tone, 'warn');
});

test('fiscal-gate.js e o engine: sem innerHTML, QR v3 reconhecido, scannedAt enviado, página carrega o script', () => {
  const gate = fs.readFileSync(path.join(frontend, 'modulos/fiscal/fiscal-gate.js'), 'utf8');
  const engine = fs.readFileSync(path.join(frontend, 'modulos/fiscal/fiscal-engine.js'), 'utf8');
  const html = fs.readFileSync(path.join(frontend, 'modulos/fiscal/index.html'), 'utf8');
  assert.doesNotMatch(gate, /innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.match(engine, /LAIFT:v3:/);
  assert.match(engine, /scannedAt = Date\.now\(\) \+ state\.clockOffset/);
  assert.ok(html.indexOf('<script src="fiscal-gate.js">') !== -1 && html.indexOf('<script src="fiscal-gate.js">') < html.indexOf('<script src="fiscal-engine.js">'));
  assert.match(html, /fiscal-gate\.css/);
});
