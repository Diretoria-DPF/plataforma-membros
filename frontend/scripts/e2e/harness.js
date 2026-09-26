/**
 * harness.js
 * Base dos testes E2E locais (Playwright + Chromium). Não faz parte do deploy.
 *
 * - Serve frontend/dist/ (rode `npm run build` antes) num servidor estático
 *   em porta livre, com os mesmos MIME types de scripts/serve-dist.js.
 * - Simula a Worker: toda chamada a *.workers.dev é respondida por
 *   `workerHandlers[action](args, ctx)` ou por uma resposta padrão segura.
 * - Registra (e aborta) toda requisição a outro host em `calls.external`
 *   — os testes conferem por aí que nada além da Worker recebe POST nem
 *   o token de sessão.
 * - Aborta qualquer outro host externo (CDNs ficam indisponíveis — o teste
 *   precisa passar mesmo assim, como no ambiente de CI/sandbox).
 * - Registra chamadas e erros de página (de todos os frames).
 *
 * Uso típico num arquivo *.e2e.js desta pasta:
 *   const { startApp, check } = require('./harness');
 *   module.exports = async function () {
 *     const app = await startApp({ role: 'member' });
 *     try { await app.login(); ...; check(cond, 'descrição'); } finally { await app.close(); }
 *   };
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
};

function loadPlaywright() {
  const candidates = ['playwright', process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* tenta o próximo */ }
  }
  throw new Error('Playwright não encontrado. Instale (npm i -D playwright) ou defina PLAYWRIGHT_MODULE.');
}

function startStaticServer() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('frontend/dist/ não existe — rode `npm run build` antes dos testes E2E.');
  }
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(DIST, urlPath === '/' ? '/index.html' : urlPath);
    if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Respostas padrão da Worker — o suficiente para o app autenticado abrir sem erro. */
function defaultWorkerReply(action, args, ctx) {
  const p = ctx.profile;
  switch (action) {
    case 'apiLogin':
      return { success: true, sessionToken: ctx.sessionToken, profile: { fullName: p.fullName, role: p.role } };
    case 'apiGetMyProfile':
      return {
        success: true,
        profile: { fullName: p.fullName, username: p.username, email: p.email, role: p.role },
        preferences: { theme: ctx.theme, emailNotifications: true },
      };
    case 'apiGetMyMetrics':
      return {
        success: true,
        metrics: { eventsCount: 0, tasksCount: 0, tasksCompletedCount: 0, proposalsCount: 0, votesCount: 0, feedbackCount: 0 },
      };
    case 'apiLearnGetMyAttendanceQr':
      // Formato v2 (Fase 2) — assinatura fictícia, só precisa ter a forma certa.
      return { success: true, qrPayload: 'LAIFT:v2:00000000-0000-4000-8000-000000000000.AAAAAAAAAAAAAAAAAAAAAAAA' };
    case 'apiAdminDashboard':
      return {
        success: true,
        indicators: { active_members: 1, active_admins: 1, banned_accounts: 0, published_events: 0, proposals_pending: 0, proposals_voting: 0, tasks_open: 0 },
      };
    default:
      // Listas vazias cobrem os loaders de eventos/propostas/tarefas etc.
      return { success: true, events: [], proposals: [], tasks: [], requests: [], items: [], users: [], logs: [], reports: [], conversations: [], messages: [] };
  }
}

/**
 * @param {object} opts
 * @param {'visitor'|'member'|'admin'} [opts.role]
 * @param {object} [opts.profile]  sobrescreve { fullName, email, username }
 * @param {'light'|'dark'|'system'} [opts.theme]
 * @param {Object<string, Function>} [opts.workerHandlers]  action → (args, ctx) => resposta (ou Promise)
 * @param {object} [opts.viewport]  ex.: { width: 360, height: 740 } para celular
 */
async function startApp(opts = {}) {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const ctx = {
    sessionToken: 'e2e-session-token',
    theme: opts.theme || 'light',
    profile: Object.assign({ fullName: 'Ana Teste', email: 'ana@exemplo.com', username: 'ana', role: opts.role || 'member' }, opts.profile || {}),
  };
  const calls = { worker: [], external: [] };
  const errors = [];

  const browser = await chromium.launch();
  const mobile = opts.viewport && opts.viewport.width < 600;
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    hasTouch: !!mobile,
    isMobile: !!mobile,
  });

  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(baseUrl)) return route.continue();
    if (url.includes('.workers.dev')) {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* corpo inválido */ }
      const args = Array.isArray(body.args) ? body.args : [];
      calls.worker.push({ action: body.action, args });
      const handler = (opts.workerHandlers || {})[body.action];
      const reply = handler ? await handler(args, ctx) : defaultWorkerReply(body.action, args, ctx);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
    }
    // Qualquer outro host (CDNs, APIs públicas, backends antigos): registra
    // e aborta — o teste precisa passar sem rede, como no CI.
    calls.external.push({ url, method: req.method(), body: req.postData() || '' });
    return route.abort();
  });

  const page = await context.newPage();
  const trackErrors = (p, label) => p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  trackErrors(page, 'pagina');
  context.on('page', (p) => trackErrors(p, 'popup'));

  async function login() {
    await page.goto(baseUrl);
    await page.fill('#login-email', ctx.profile.email);
    await page.fill('#login-password', 'senha-de-teste-123');
    await page.click('#form-login button[type=submit]');
    await page.waitForSelector('#app-root:not(.hidden)');
  }

  async function showPanel(panelId) {
    await page.click(`#app-nav [data-panel="${panelId}"]`);
    await page.waitForSelector(`#${panelId}:not(.hidden)`);
  }

  /** Abre um módulo da área "Aprender" e devolve o Frame do iframe dele. */
  async function openModule(moduleId) {
    if (await page.locator('#panel-learn.hidden').count()) await showPanel('panel-learn');
    await page.click(`.learn-card[data-module="${moduleId}"]`);
    const el = await page.waitForSelector('.learn-frame:not(.hidden)');
    const frame = await el.contentFrame();
    await frame.waitForLoadState('load').catch(() => {});
    return frame;
  }

  async function close() {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { browser, context, page, baseUrl, ctx, calls, errors, login, showPanel, openModule, close };
}

/** Asserção simples: acumula falhas no processo e imprime ✔/✘. */
function check(condition, description) {
  if (condition) {
    console.log(`  ✔ ${description}`);
  } else {
    console.log(`  ✘ ${description}`);
    process.exitCode = 1;
  }
}

module.exports = { startApp, check, loadPlaywright };
