/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Fila offline do simulado (modulos/shared/quiz-offline-queue.js, MOB-02): grava antes de enviar, reenvia com a MESMA
// idempotencyKey, descarta o inválido/vencido, respeita teto e dono, e cai para memória se o IndexedDB falhar.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(frontend, 'modulos/shared/quiz-offline-queue.js'), 'utf8');
const ENGINE = fs.readFileSync(path.join(frontend, 'modulos/shared/quiz-engine.js'), 'utf8');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.runInNewContext(SRC, sandbox);
const Q = sandbox.window.LaiftQuizQueue;
const plain = (v) => JSON.parse(JSON.stringify(v));

const NOW = 1_800_000_000_000;
const PAYLOAD = { module: 'toxicologia', mode: 'prova', correct: 8, total: 10, durationSeconds: 420, topics: ['Antídotos'] };
const OFFLINE = { success: false, message: 'Falha de comunicação com o servidor.' };
let backend;
let sent;
let responses;
let seq;
let clock;

function makeQueue(extra) {
  return Q.create(Object.assign({
    backend,
    now: () => clock,
    uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    owner: () => 'dono1',
    send: async (body) => { sent.push(plain(body)); return responses.length ? responses.shift() : { success: true }; },
  }, extra));
}
const stored = async () => plain(await backend.getAll());

beforeEach(() => {
  backend = Q.createMemoryBackend();
  sent = [];
  responses = [];
  seq = 0;
  clock = NOW;
});

test('online e aceito: envia com idempotencyKey e não deixa nada na fila', async () => {
  const out = await makeQueue().submit(PAYLOAD);
  assert.equal(out.status, 'sent');
  assert.equal(sent.length, 1);
  assert.match(sent[0].idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await stored(), []);
});

test('sem rede: fica salvo (status queued) e o reenvio usa a MESMA chave', async () => {
  const q = makeQueue();
  responses.push(OFFLINE);
  const out = await q.submit(PAYLOAD);
  assert.equal(out.status, 'queued');
  const [item] = await stored();
  assert.equal(item.idempotencyKey, sent[0].idempotencyKey);
  assert.deepEqual(item.payload, PAYLOAD);

  const summary = plain(await q.flush());
  assert.deepEqual(summary, { sent: 1, kept: 0, dropped: 0 });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].idempotencyKey, sent[0].idempotencyKey);
  assert.deepEqual(await stored(), []);
});

test('flush ainda sem rede mantém tudo e para na primeira falha', async () => {
  const q = makeQueue();
  responses.push(OFFLINE, OFFLINE, OFFLINE);
  await q.submit(PAYLOAD);
  clock += 1000;
  await q.submit(Object.assign({}, PAYLOAD, { correct: 5 }));
  sent.length = 0;
  responses.push(OFFLINE);
  assert.deepEqual(plain(await q.flush()), { sent: 0, kept: 2, dropped: 0 });
  assert.equal(sent.length, 1, 'não insiste nos demais depois de uma falha de conexão');
  assert.equal((await stored()).length, 2);
});

test('recusa do servidor (não é falta de conexão) descarta o item: repetir não adiantaria', async () => {
  responses.push({ success: false, message: 'Total de questões inválido.' });
  const out = await makeQueue().submit(PAYLOAD);
  assert.equal(out.status, 'rejected');
  assert.deepEqual(await stored(), []);
});

test('envio que lança exceção conta como sem conexão', async () => {
  const q = makeQueue({ send: async () => { throw new Error('boom'); } });
  assert.equal((await q.submit(PAYLOAD)).status, 'queued');
  assert.equal((await stored()).length, 1);
});

test('payload fora do contrato não entra na fila (envia direto, sem reter lixo)', async () => {
  const out = await makeQueue().submit({ module: 'clinica', mode: 'prova', correct: 1, total: 1 });
  assert.equal(out.status, 'sent');
  assert.deepEqual(await stored(), []);
});

test('guarda só os campos permitidos: sem PII e sem campos extras', async () => {
  responses.push(OFFLINE);
  await makeQueue().submit(Object.assign({}, PAYLOAD, { email: 'a@b.c', fullName: 'Fulano', profileId: 'x', topics: ['ok', 7, 'x'.repeat(81)] }));
  const [item] = await stored();
  assert.deepEqual(Object.keys(item).sort(), ['idempotencyKey', 'owner', 'payload', 'queuedAt']);
  assert.deepEqual(Object.keys(item.payload).sort(), ['correct', 'durationSeconds', 'mode', 'module', 'topics', 'total']);
  assert.deepEqual(item.payload.topics, ['ok']);
  assert.equal(JSON.stringify(item).includes('a@b.c'), false);
});

test('idade máxima: item vencido é descartado sem enviar', async () => {
  const q = makeQueue();
  responses.push(OFFLINE);
  await q.submit(PAYLOAD);
  clock += Q.LIMITS.MAX_AGE_MS + 1;
  sent.length = 0;
  assert.deepEqual(plain(await q.flush()), { sent: 0, kept: 0, dropped: 0 });
  assert.equal(sent.length, 0);
  assert.deepEqual(await stored(), []);
});

test('teto de itens: os mais antigos saem primeiro', async () => {
  const q = makeQueue({ maxItems: 3 });
  for (let i = 0; i < 5; i++) {
    responses.push(OFFLINE);
    clock += 1000;
    await q.submit(Object.assign({}, PAYLOAD, { correct: i }));
  }
  sent.length = 0;
  responses.push(OFFLINE);
  await q.flush();
  const left = await stored();
  assert.equal(left.length, 3);
  assert.deepEqual(left.map((i) => i.payload.correct).sort(), [2, 3, 4]);
});

test('itens corrompidos ou adulterados são descartados ao ler', async () => {
  await backend.put({ idempotencyKey: 'nao-e-uuid', queuedAt: NOW, owner: 'dono1', payload: PAYLOAD });
  await backend.put({ idempotencyKey: '00000000-0000-4000-8000-0000000000aa', queuedAt: NOW, owner: 'dono1', payload: { module: 'x' } });
  await backend.put({ idempotencyKey: '00000000-0000-4000-8000-0000000000bb', queuedAt: 'ontem', owner: 'dono1', payload: PAYLOAD });
  const summary = plain(await makeQueue().flush());
  assert.deepEqual(summary, { sent: 0, kept: 0, dropped: 0 });
  assert.equal(sent.length, 0);
  assert.deepEqual(await stored(), []);
});

test('outra conta no mesmo navegador não envia a tentativa alheia', async () => {
  responses.push(OFFLINE);
  await makeQueue().submit(PAYLOAD);
  sent.length = 0;
  const other = makeQueue({ owner: () => 'dono2' });
  assert.deepEqual(plain(await other.flush()), { sent: 0, kept: 1, dropped: 0 });
  assert.equal(sent.length, 0);
  assert.equal((await stored()).length, 1);
  assert.equal(plain(await makeQueue({ owner: () => '' }).flush()).sent, 0, 'dono desconhecido também não envia');
});

test('flush simultâneo compartilha a mesma passada (sem envio em dobro)', async () => {
  const q = makeQueue();
  responses.push(OFFLINE);
  await q.submit(PAYLOAD);
  sent.length = 0;
  const [a, b] = await Promise.all([q.flush(), q.flush()]);
  assert.equal(sent.length, 1);
  assert.equal(a, b);
});

test('etiqueta do dono: estável, em minúsculas e vazia sem e-mail', () => {
  assert.equal(Q.ownerTag('Ana@Exemplo.com'), Q.ownerTag(' ana@exemplo.com '));
  assert.notEqual(Q.ownerTag('ana@exemplo.com'), Q.ownerTag('bia@exemplo.com'));
  assert.equal(Q.ownerTag(''), '');
  assert.equal(Q.ownerTag('ana@exemplo.com').includes('ana'), false);
});

test('uuid gerado sem crypto tem formato v4 válido', () => {
  assert.match(Q.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// ---- Backend IndexedDB (com um indexedDB falso mínimo) -------------------------------------------------
function fakeIndexedDB({ failOpen = false } = {}) {
  const data = new Map();
  const request = (run) => {
    const r = {};
    setImmediate(() => { try { r.result = run(); r.onsuccess && r.onsuccess(); } catch (e) { r.error = e; r.onerror && r.onerror(); } });
    return r;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {};
      const finish = () => setImmediate(() => setImmediate(() => tx.oncomplete && tx.oncomplete()));
      tx.objectStore = () => ({
        getAll: () => { finish(); const r = { result: [...data.values()] }; return r; },
        put: (v) => { data.set(v.idempotencyKey, JSON.parse(JSON.stringify(v))); finish(); return { result: v.idempotencyKey }; },
        delete: (k) => { data.delete(k); finish(); return { result: undefined }; },
      });
      return tx;
    },
  };
  return { data, open: () => (failOpen ? (() => { throw new Error('negado'); })() : request(() => db)) };
}

test('backend IndexedDB: grava, lê e remove', async () => {
  const idb = fakeIndexedDB();
  const be = Q.createIdbBackend(idb);
  await be.put({ idempotencyKey: 'k1', v: 1 });
  assert.equal((await be.getAll()).length, 1);
  await be.remove('k1');
  assert.deepEqual(await be.getAll(), []);
});

test('IndexedDB indisponível ou com erro: cai para memória e a fila continua funcionando', async () => {
  for (const idb of [undefined, null, fakeIndexedDB({ failOpen: true })]) {
    const be = Q.createDefaultBackend(idb);
    const q = makeQueue({ backend: be });
    responses.push(OFFLINE);
    assert.equal((await q.submit(PAYLOAD)).status, 'queued');
    assert.equal(plain(await q.flush()).sent, 1);
  }
});

test('motor: usa a fila, avisa de forma discreta, reenvia no online e sem alert/confirm nativo direto', () => {
  assert.match(ENGINE, /Salvo neste aparelho, será enviado quando houver internet\./);
  assert.match(ENGINE, /addEventListener\('online', flushPending\)/);
  assert.match(ENGINE, /queue\.submit\(payload\)/);
  assert.match(ENGINE, /\r?\n\s+flushPending\(\);\r?\n/, 'reenvia ao abrir o módulo');
});
