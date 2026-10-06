/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runSmoke, parseArgs } from './smoke.mjs';

const HTML_COM_CSP = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><title>LAIFT</title>';
const HTML_SEM_CSP = '<!doctype html><title>LAIFT</title>';

/** Sobe um servidor local e devolve a URL base e o fechamento. */
function servidor(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${srv.address().port}`,
        close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }),
      });
    });
  });
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => resolve(corpo));
  });
}

const apiOk = (recebidos) => async (req, res) => {
  const corpo = await lerCorpo(req);
  recebidos?.push({ method: req.method, corpo });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ success: true, flags: {} }));
};

async function comServidores({ site, api }, fn) {
  const s = await servidor(site);
  const a = await servidor(api);
  try { return await fn({ siteUrl: s.url, apiUrl: a.url }); }
  finally { await s.close(); await a.close(); }
}

const siteOk = (_req, res) => { res.setHeader('content-type', 'text/html'); res.end(HTML_COM_CSP); };
const porNome = (r, nome) => r.checks.find((c) => c.name === nome);

test('passa quando site, API e CSP estão corretos (CSP na meta)', async () => {
  await comServidores({ site: siteOk, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls });
    assert.equal(r.ok, true);
    assert.deepEqual(r.checks.map((c) => c.name), ['site', 'csp', 'api']);
    assert.ok(r.checks.every((c) => c.ok));
  });
});

test('aceita o CSP vindo só em cabeçalho HTTP', async () => {
  const site = (_req, res) => {
    res.setHeader('content-security-policy', "frame-ancestors 'self'");
    res.end(HTML_SEM_CSP);
  };
  await comServidores({ site, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls });
    assert.equal(r.ok, true);
  });
});

test('chama a API com POST {action: apiGetFeatureFlags, args: []}', async () => {
  const recebidos = [];
  await comServidores({ site: siteOk, api: apiOk(recebidos) }, async (urls) => {
    await runSmoke({ ...urls });
  });
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].method, 'POST');
  assert.deepEqual(JSON.parse(recebidos[0].corpo), { action: 'apiGetFeatureFlags', args: [] });
});

test('falha quando o site responde 500', async () => {
  const site = (_req, res) => { res.statusCode = 500; res.end('erro'); };
  await comServidores({ site, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls });
    assert.equal(r.ok, false);
    assert.equal(porNome(r, 'site').ok, false);
    assert.match(porNome(r, 'site').detail, /500/);
    assert.equal(porNome(r, 'api').ok, true, 'a API continua sendo verificada');
  });
});

test('falha quando a API não devolve success:true', async () => {
  const api = async (req, res) => {
    await lerCorpo(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'x' }));
  };
  await comServidores({ site: siteOk, api }, async (urls) => {
    const r = await runSmoke({ ...urls });
    assert.equal(r.ok, false);
    assert.equal(porNome(r, 'api').ok, false);
    assert.equal(porNome(r, 'site').ok, true);
  });
});

test('falha quando a API devolve algo que não é JSON', async () => {
  const api = async (req, res) => { await lerCorpo(req); res.end('<html>erro do proxy</html>'); };
  await comServidores({ site: siteOk, api }, async (urls) => {
    const r = await runSmoke({ ...urls });
    assert.equal(porNome(r, 'api').ok, false);
    assert.match(porNome(r, 'api').detail, /JSON/i);
  });
});

test('falha quando não há CSP nem em cabeçalho nem na meta', async () => {
  const site = (_req, res) => res.end(HTML_SEM_CSP);
  await comServidores({ site, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls });
    assert.equal(r.ok, false);
    assert.equal(porNome(r, 'csp').ok, false);
    assert.equal(porNome(r, 'site').ok, true);
  });
});

test('falha por tempo esgotado quando o servidor não responde', async () => {
  const site = () => { /* nunca responde */ };
  await comServidores({ site, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls, timeoutMs: 150 });
    assert.equal(r.ok, false);
    assert.equal(porNome(r, 'site').ok, false);
    assert.equal(porNome(r, 'csp').ok, false, 'sem corpo não dá para afirmar o CSP');
  });
});

test('repete até passar quando attempts > 1', async () => {
  let chamadas = 0;
  const site = (_req, res) => {
    chamadas += 1;
    if (chamadas < 3) { res.statusCode = 503; res.end('subindo'); return; }
    res.end(HTML_COM_CSP);
  };
  await comServidores({ site, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls, attempts: 5, delayMs: 10 });
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 3);
  });
});

test('desiste depois de todas as tentativas e devolve o último resultado', async () => {
  const site = (_req, res) => { res.statusCode = 503; res.end('fora'); };
  await comServidores({ site, api: apiOk() }, async (urls) => {
    const r = await runSmoke({ ...urls, attempts: 2, delayMs: 10 });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 2);
  });
});

test('recusa URLs ausentes com mensagem clara', async () => {
  await assert.rejects(() => runSmoke({ apiUrl: 'http://x' }), /SMOKE_SITE_URL/);
  await assert.rejects(() => runSmoke({ siteUrl: 'http://x' }), /SMOKE_API_URL/);
});

test('parseArgs lê o ambiente e as opções', () => {
  const o = parseArgs(['--retry', '4', '--delay', '2', '--timeout', '3'], {
    SMOKE_SITE_URL: 'https://staging.laift.com.br',
    SMOKE_API_URL: 'https://staging-api.laift.com.br',
  });
  assert.deepEqual(o, {
    siteUrl: 'https://staging.laift.com.br',
    apiUrl: 'https://staging-api.laift.com.br',
    attempts: 4,
    delayMs: 2000,
    timeoutMs: 3000,
  });
});

test('parseArgs usa padrões e rejeita número inválido', () => {
  const o = parseArgs([], { SMOKE_SITE_URL: 'a', SMOKE_API_URL: 'b' });
  assert.equal(o.attempts, 1);
  assert.equal(o.timeoutMs, 10000);
  assert.throws(() => parseArgs(['--retry', 'abc'], {}), /--retry/);
});
