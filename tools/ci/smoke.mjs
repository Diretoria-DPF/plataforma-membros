/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * smoke.mjs
 * Teste de fumaça de um ambiente publicado (staging ou produção). Confere:
 *   site  — a página inicial responde 200;
 *   csp   — há Content-Security-Policy (cabeçalho HTTP ou <meta http-equiv>);
 *   api   — POST {action:'apiGetFeatureFlags', args:[]} devolve JSON com success:true
 *           (a action é pública e não toca em dado de ninguém).
 *
 * Uso (as URLs vêm do ambiente, sem barra final obrigatória):
 *   SMOKE_SITE_URL=https://staging.laift.com.br \
 *   SMOKE_API_URL=https://staging-api.laift.com.br \
 *   node tools/ci/smoke.mjs --retry 6 --delay 30
 *
 * --retry N    tentativas (padrão 1); útil logo depois de um deploy
 * --delay S    segundos entre tentativas (padrão 5)
 * --timeout S  segundos por requisição (padrão 10)
 * Sai com código 1 se alguma verificação falhar na última tentativa.
 */
import { pathToFileURL } from 'node:url';

const CSP_META = /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?/i;
const DEFAULTS = { attempts: 1, delaySeconds: 5, timeoutSeconds: 10 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mensagemDe = (err) => (err && err.name === 'TimeoutError' ? 'tempo esgotado' : String((err && err.message) || err));

/** Lê um inteiro positivo de uma opção de linha de comando. */
function inteiroPositivo(nome, valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${nome} precisa ser um inteiro positivo (recebi "${valor}")`);
  return n;
}

/**
 * Converte argv e variáveis de ambiente nas opções de runSmoke.
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export function parseArgs(argv, env) {
  const opcoes = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, valor] = [argv[i], argv[i + 1]];
    if (flag === '--retry') opcoes.attempts = inteiroPositivo('--retry', valor);
    else if (flag === '--delay') opcoes.delaySeconds = inteiroPositivo('--delay', valor);
    else if (flag === '--timeout') opcoes.timeoutSeconds = inteiroPositivo('--timeout', valor);
    else throw new Error(`Opção desconhecida: ${flag}`);
  }
  return {
    siteUrl: env.SMOKE_SITE_URL,
    apiUrl: env.SMOKE_API_URL,
    attempts: opcoes.attempts,
    delayMs: opcoes.delaySeconds * 1000,
    timeoutMs: opcoes.timeoutSeconds * 1000,
  };
}

async function verificarSite(siteUrl, timeoutMs, fetchImpl) {
  try {
    const res = await fetchImpl(siteUrl, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    const corpo = await res.text();
    const site = res.status === 200
      ? { name: 'site', ok: true, detail: 'HTTP 200' }
      : { name: 'site', ok: false, detail: `HTTP ${res.status}` };
    const temCsp = Boolean(res.headers.get('content-security-policy')) || CSP_META.test(corpo);
    const csp = temCsp
      ? { name: 'csp', ok: true, detail: 'Content-Security-Policy presente' }
      : { name: 'csp', ok: false, detail: 'sem Content-Security-Policy (cabeçalho ou meta)' };
    return [site, csp];
  } catch (err) {
    const detail = mensagemDe(err);
    return [
      { name: 'site', ok: false, detail },
      { name: 'csp', ok: false, detail: `não verificado: ${detail}` },
    ];
  }
}

async function verificarApi(apiUrl, timeoutMs, fetchImpl) {
  try {
    const res = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'apiGetFeatureFlags', args: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const texto = await res.text();
    let json;
    try { json = JSON.parse(texto); } catch { return { name: 'api', ok: false, detail: `resposta não é JSON (HTTP ${res.status})` }; }
    return json && json.success === true
      ? { name: 'api', ok: true, detail: 'apiGetFeatureFlags respondeu success:true' }
      : { name: 'api', ok: false, detail: `apiGetFeatureFlags sem success:true (HTTP ${res.status})` };
  } catch (err) {
    return { name: 'api', ok: false, detail: mensagemDe(err) };
  }
}

/**
 * Roda as verificações, repetindo até passar ou esgotar as tentativas.
 * @param {{siteUrl?: string, apiUrl?: string, attempts?: number, delayMs?: number, timeoutMs?: number, fetchImpl?: typeof fetch}} opcoes
 * @returns {Promise<{ok: boolean, attempts: number, checks: {name: string, ok: boolean, detail: string}[]}>}
 */
export async function runSmoke({ siteUrl, apiUrl, attempts = 1, delayMs = 5000, timeoutMs = 10000, fetchImpl = fetch } = {}) {
  if (!siteUrl) throw new Error('SMOKE_SITE_URL ausente');
  if (!apiUrl) throw new Error('SMOKE_API_URL ausente');

  let resultado = { ok: false, attempts: 0, checks: [] };
  for (let tentativa = 1; tentativa <= attempts; tentativa += 1) {
    const [site, csp] = await verificarSite(siteUrl, timeoutMs, fetchImpl);
    const api = await verificarApi(apiUrl, timeoutMs, fetchImpl);
    const checks = [site, csp, api];
    resultado = { ok: checks.every((c) => c.ok), attempts: tentativa, checks };
    if (resultado.ok) return resultado;
    if (tentativa < attempts) await sleep(delayMs);
  }
  return resultado;
}

async function main() {
  const opcoes = parseArgs(process.argv.slice(2), process.env);
  const r = await runSmoke(opcoes);
  const linhas = r.checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`);
  process.stdout.write(`${linhas.join('\n')}\nTentativas: ${r.attempts}\n`);
  if (!r.ok) {
    process.stderr.write('Smoke test FALHOU.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${mensagemDe(err)}\n`);
    process.exitCode = 1;
  });
}
