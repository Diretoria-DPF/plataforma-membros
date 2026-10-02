/**
 * atlas-prod-check.js — mede o Atlas PUBLICADO (GitHub Pages), não o build local.
 * ---------------------------------------------------------------------------
 * Uso: ATLAS_BASE_URL=https://<org>.github.io/<repo>/ node scripts/e2e/atlas-prod-check.js
 * (roda no workflow .github/workflows/atlas-prod-check.yml — a sessão do
 * Claude não alcança *.github.io).
 *
 * O atlas exige a identidade da plataforma (window.App no host). Em vez de
 * fazer login, o script serve uma página-host falsa NA MESMA ORIGEM de
 * produção (Playwright intercepta só essa URL) que embute o atlas real num
 * iframe; todo o resto vem da rede de verdade.
 *
 * Mede, sem cache: (1) tempo até o esqueleto estar tocável sem throttle e em
 * "Fast 3G" (preset do DevTools); (2) cada arquivo da abertura com bytes
 * transferidos e content-encoding; (3) toda resposta >= 400, requisição que
 * falhou e violação de CSP, com a URL (crimes C8/C10 da Onda 3 — só
 * aparecem em produção). Escreve uma tabela em Markdown no stdout
 * e em $GITHUB_STEP_SUMMARY.
 */
const fs = require('fs');
const { loadPlaywright } = require('./harness');

const BASE = (process.env.ATLAS_BASE_URL || '').replace(/\/?$/, '/');
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1000 * 1000 / 8) * 0.9, uploadThroughput: (750 * 1000 / 8) * 0.9 };
const HOST_PATH = '__atlas-prod-check-host.html';
const HOST_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>prod-check</title></head>
<body style="margin:0"><script>
window.App = {
  getIdentity: function () { return { email: 'prod-check@example.com', fullName: 'Prod Check', role: 'member' }; },
  getThemePreference: function () { return 'light'; },
  notifyActivity: function () {},
  callLearningApi: function () { return Promise.resolve({ success: false }); },
};
</script><iframe id="f" title="Atlas" src="modulos/anatomia-3d/index.html" style="position:fixed;inset:0;border:0;width:100vw;height:100vh"></iframe></body></html>`;

async function run(browser, throttle) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await context.route(BASE + HOST_PATH, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST_HTML }));
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) await client.send('Network.emulateNetworkConditions', { ...throttle, connectionType: 'cellular3g' });
  const files = new Map();
  const problems = new Set();
  page.on('response', (r) => { if (r.status() >= 400) problems.add(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => {
    const err = (r.failure() && r.failure().errorText) || 'falhou';
    if (!/ERR_ABORTED/.test(err)) problems.add(`${err} ${r.url()}`);
  });
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.add(`CSP ${m.text().slice(0, 300)}`); });
  client.on('Network.responseReceived', ({ requestId, response }) => {
    if (!response.url.includes('/modulos/anatomia-3d/')) return;
    const enc = Object.entries(response.headers || {}).find(([k]) => k.toLowerCase() === 'content-encoding');
    files.set(requestId, { url: response.url, status: response.status, encoding: enc ? enc[1] : '-', transfer: 0 });
  });
  client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const f = files.get(requestId);
    if (f) f.transfer = encodedDataLength;
  });
  const t0 = Date.now();
  await page.goto(BASE + HOST_PATH);
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  let ready = null;
  try {
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && I.DEFAULT_SYSTEMS.every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 120000, polling: 200 });
    ready = Date.now() - t0;
  } catch (e) { /* fica null */ }
  const fatal = await frame.evaluate(() => (document.getElementById('atlas-fatal') || {}).textContent || '').catch(() => '');
  await context.close();
  return { ready, fatal, problems: [...problems], files: [...files.values()].filter((f) => f.transfer > 0) };
}

(async () => {
  if (!BASE.startsWith('http')) {
    console.error('Defina ATLAS_BASE_URL (ex.: https://diretoria-dpf.github.io/plataforma-membros/)');
    process.exit(2);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const plain = await run(browser, null);
  const slow = await run(browser, FAST_3G);
  await browser.close();

  const rows = plain.files.sort((a, b) => b.transfer - a.transfer);
  const total = rows.reduce((acc, f) => acc + f.transfer, 0);
  const lines = [
    `## Atlas em produção — ${BASE}`,
    '',
    `- Esqueleto tocável sem throttle: **${plain.ready === null ? 'NÃO carregou' : (plain.ready / 1000).toFixed(1) + ' s'}**${plain.fatal ? ` — tela de falha: "${plain.fatal}"` : ''}`,
    `- Esqueleto tocável em Fast 3G (DevTools): **${slow.ready === null ? 'NÃO carregou em 120 s' : (slow.ready / 1000).toFixed(1) + ' s'}** (meta < 15 s)`,
    `- Transferido até pronto: **${(total / 1024 / 1024).toFixed(2)} MB** (meta < 2 MB)`,
    '',
    '| KB transferidos | content-encoding | status | arquivo |',
    '|---:|---|---|---|',
    ...rows.slice(0, 20).map((f) => `| ${(f.transfer / 1024).toFixed(0)} | ${f.encoding} | ${f.status} | ${f.url.split('/modulos/anatomia-3d/')[1]} |`),
    '',
    '### Erros de rede e CSP',
    '',
    ...(plain.problems.length ? plain.problems.map((p) => `- ${p}`) : ['- nenhum']),
  ];
  const md = lines.join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  const ok = !plain.problems.length && plain.ready !== null && slow.ready !== null && slow.ready < 15000 && total < 2 * 1024 * 1024;
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
