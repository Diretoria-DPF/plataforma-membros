/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Instantâneo da Biblioteca na CI: busca o catálogo público e grava recente.json (ou não grava nada).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buscar } from './fetch-biblioteca.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, 'fetch-biblioteca.mjs');
const reservaPath = path.join(here, '..', 'biblioteca', 'conteudo', 'reserva.json');
const API = 'https://api.laift.com.br/v1/';
const CORPO_OK = {
  success: true,
  enabled: true,
  generatedAt: '2026-10-10T12:00:00Z',
  topics: [{ slug: 'farmacologia', name: 'Farmacologia' }],
  items: [{ id: 'a1', title: 'Artigo de teste', authors: [], journal: 'Revista', year: 2024 }],
  campoExtraDaApi: 'não deve ir para o arquivo',
};

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblioteca-fetch-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Resposta falsa do fetch: `corpo` vira texto (string passa como está). */
function resposta({ status = 200, corpo }) {
  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  return { ok: status >= 200 && status < 300, status, text: async () => texto };
}

/** fetch falso que responde com `res` e guarda o pedido recebido. */
function fetchQueResponde(res) {
  const pedidos = [];
  const fetchImpl = async (url, opts) => {
    pedidos.push({ url, opts });
    return res;
  };
  return { fetchImpl, pedidos };
}

function arquivoDestino() {
  return path.join(dir, 'biblioteca', 'conteudo', 'recente.json');
}

test('resposta boa grava só versao, enabled, generatedAt, topics e items', async () => {
  const out = arquivoDestino();
  const { fetchImpl } = fetchQueResponde(resposta({ corpo: CORPO_OK }));

  const r = await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 5000 });

  assert.equal(r.gravado, true);
  const gravado = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(gravado).sort(), ['enabled', 'generatedAt', 'items', 'topics', 'versao']);
  assert.equal(gravado.versao, 1);
  assert.equal(gravado.enabled, true);
  assert.equal(gravado.generatedAt, CORPO_OK.generatedAt);
  assert.deepEqual(gravado.topics, CORPO_OK.topics);
  assert.deepEqual(gravado.items, CORPO_OK.items);
});

test('success false não grava, não lança e devolve o motivo', async () => {
  const out = arquivoDestino();
  const { fetchImpl } = fetchQueResponde(resposta({ corpo: { success: false, message: 'indisponível' } }));

  const r = await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 5000 });

  assert.equal(r.gravado, false);
  assert.equal(typeof r.motivo, 'string');
  assert.ok(r.motivo.length > 0);
  assert.equal(fs.existsSync(out), false);
});

test('HTTP 500 não grava, não lança e devolve o motivo', async () => {
  const out = arquivoDestino();
  const { fetchImpl } = fetchQueResponde(resposta({ status: 500, corpo: CORPO_OK }));

  const r = await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 5000 });

  assert.equal(r.gravado, false);
  assert.match(r.motivo, /500/);
  assert.equal(fs.existsSync(out), false);
});

test('JSON inválido não grava, não lança e devolve o motivo', async () => {
  const out = arquivoDestino();
  const { fetchImpl } = fetchQueResponde(resposta({ corpo: '<html>erro de gateway</html>' }));

  const r = await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 5000 });

  assert.equal(r.gravado, false);
  assert.ok(r.motivo.length > 0);
  assert.equal(fs.existsSync(out), false);
});

test('tempo esgotado não grava, não lança e devolve o motivo', async () => {
  const out = arquivoDestino();
  // fetch que só rejeita quando o sinal de tempo esgota: prova que o timeout chega ao pedido.
  const fetchImpl = (url, opts) =>
    new Promise((_, rejeita) => {
      opts.signal.addEventListener('abort', () => rejeita(opts.signal.reason));
    });

  const r = await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 20 });

  assert.equal(r.gravado, false);
  assert.ok(r.motivo.length > 0);
  assert.equal(fs.existsSync(out), false);
});

test('items que não é array não grava e devolve o motivo', async () => {
  const out = arquivoDestino();
  const { fetchImpl } = fetchQueResponde(resposta({ corpo: { ...CORPO_OK, items: { quebrado: true } } }));

  const r = await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 5000 });

  assert.equal(r.gravado, false);
  assert.ok(r.motivo.length > 0);
  assert.equal(fs.existsSync(out), false);
});

test('apiUrl que não é https recusa sem chamar a rede', async () => {
  const out = arquivoDestino();
  const { fetchImpl, pedidos } = fetchQueResponde(resposta({ corpo: CORPO_OK }));

  const r = await buscar({ apiUrl: 'http://api.laift.com.br/v1/', out, fetchImpl, timeoutMs: 5000 });

  assert.equal(r.gravado, false);
  assert.match(r.motivo, /https/);
  assert.equal(pedidos.length, 0);
  assert.equal(fs.existsSync(out), false);
});

test('o pedido é só a action pública, sem credencial e sem cookie', async () => {
  const out = arquivoDestino();
  const { fetchImpl, pedidos } = fetchQueResponde(resposta({ corpo: CORPO_OK }));

  await buscar({ apiUrl: API, out, fetchImpl, timeoutMs: 5000 });

  assert.equal(pedidos.length, 1);
  const { url, opts } = pedidos[0];
  assert.equal(url, API);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.body, '{"action":"apiLearnLibraryPublicCatalog","args":[]}');
  assert.equal(opts.credentials, 'omit');
  const cabecalhos = JSON.stringify(opts.headers || {}).toLowerCase();
  assert.doesNotMatch(cabecalhos, /cookie|authorization|token/);
});

test('reserva.json tem exatamente o conteúdo vazio desligado da versão 1', () => {
  const texto = fs.readFileSync(reservaPath, 'utf8');
  assert.equal(
    texto,
    '{"versao":1,"enabled":false,"generatedAt":"2026-10-10T00:00:00Z","topics":[],"items":[]}\n',
  );
});

test('CLI com URL insegura imprime o aviso da CI e sai com código 0', () => {
  const saida = execFileSync(
    process.execPath,
    [scriptPath, '--api', 'http://insegura.invalid/v1/', '--out', arquivoDestino()],
    { encoding: 'utf8' },
  );
  assert.match(saida, /::warning::Biblioteca: .+; o build usa a reserva\./);
});
