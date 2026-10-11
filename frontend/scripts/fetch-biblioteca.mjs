/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Instantâneo da Biblioteca para a CI: busca o catálogo público e grava recente.json.
// Falha nunca derruba a CI: devolve o motivo e o build usa a reserva versionada.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ACAO = 'apiLearnLibraryPublicCatalog';
const TIMEOUT_PADRAO_MS = 15000;
const SAIDA_PADRAO = 'biblioteca/conteudo/recente.json';

function motivoDe(err) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'tempo esgotado';
  return (err && err.message) || String(err);
}

function urlHttps(texto) {
  try {
    const url = new URL(String(texto || ''));
    if (url.protocol !== 'https:') return { ok: false, motivo: 'a URL da API precisa ser https://' };
    return { ok: true, valor: url.href };
  } catch {
    return { ok: false, motivo: 'a URL da API é inválida' };
  }
}

/** Só estes campos vão para o arquivo; o que a API mandar a mais é descartado. */
export function validarCatalogo(json) {
  if (!json || typeof json !== 'object' || json.success !== true) {
    return { ok: false, motivo: 'API respondeu sem success:true' };
  }
  const { enabled, generatedAt, topics, items } = json;
  if (typeof enabled !== 'boolean' || typeof generatedAt !== 'string') {
    return { ok: false, motivo: 'formato inesperado (enabled ou generatedAt)' };
  }
  if (!Array.isArray(topics) || !Array.isArray(items)) {
    return { ok: false, motivo: 'topics ou items não é lista' };
  }
  return { ok: true, doc: { versao: 1, enabled, generatedAt, topics, items } };
}

async function lerCorpo(res) {
  if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}` };
  const texto = await res.text();
  try {
    return { ok: true, json: JSON.parse(texto) };
  } catch {
    return { ok: false, motivo: 'resposta não é JSON' };
  }
}

async function pedirCatalogo(apiUrl, fetchImpl, timeoutMs) {
  // AbortSignal.timeout() usa um cronômetro que não segura o processo vivo (unref): num
  // fetch pendurado o Node encerra o teste com a promessa pendente. setTimeout comum segura.
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(new DOMException('tempo esgotado', 'TimeoutError')), timeoutMs);
  try {
    const res = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: ACAO, args: [] }),
      credentials: 'omit',
      signal: controle.signal,
    });
    const corpo = await lerCorpo(res);
    if (!corpo.ok) return corpo;
    return validarCatalogo(corpo.json);
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Busca o catálogo e grava `out`. Nunca lança: devolve `{ gravado, motivo }`.
 * Em falha não toca em `out`, para que a CI use a reserva.
 */
export async function buscar({ apiUrl, out, fetchImpl = fetch, timeoutMs = TIMEOUT_PADRAO_MS } = {}) {
  const url = urlHttps(apiUrl);
  if (!url.ok) return { gravado: false, motivo: url.motivo };
  try {
    const pedido = await pedirCatalogo(url.valor, fetchImpl, timeoutMs);
    if (!pedido.ok) return { gravado: false, motivo: pedido.motivo };
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(pedido.doc)}\n`, 'utf8');
    return { gravado: true, motivo: '' };
  } catch (err) {
    return { gravado: false, motivo: motivoDe(err) };
  }
}

function lerArgumentos(argv) {
  const valor = (nome) => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    api: valor('--api') || process.env.BIBLIOTECA_API_URL || '',
    out: valor('--out') || SAIDA_PADRAO,
  };
}

async function executarCli() {
  const { api, out } = lerArgumentos(process.argv.slice(2));
  const resultado = await buscar({ apiUrl: api, out: path.resolve(out) });
  if (resultado.gravado) {
    console.log(`Biblioteca: instantâneo gravado em ${out}.`);
    return;
  }
  console.log(`::warning::Biblioteca: ${resultado.motivo}; o build usa a reserva.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await executarCli();
}
