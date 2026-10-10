/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * harness.js
 * Base dos testes E2E locais (Playwright + Chromium). Não faz parte do deploy.
 *
 * - Serve frontend/dist/ (rode `npm run build` antes) num servidor estático
 *   em porta livre, com os mesmos MIME types de scripts/serve-dist.js.
 * - Simula a Worker: toda chamada a *.workers.dev é respondida por
 *   `workerHandlers[action](args, ctx)` ou por uma resposta padrão segura.
 * - Com E2E_STACK=1 no ambiente, os erros de página vêm com a pilha.
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
const { gzipSync } = require('zlib');

const DIST = path.join(__dirname, '..', '..', 'dist');
// Id do perfil simulado. O cliente só sabe qual chave de "onboarding visto" usar com este id
// (frontend/onboarding.js: laift_onboarding_seen_<profileId>).
const E2E_PROFILE_ID = 'e2e00000-0000-4000-8000-000000000001';
const ONBOARDING_SEEN_PREFIX = 'laift_onboarding_seen_';

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

const TEXT_TYPES = new Set(['.js', '.mjs', '.json', '.css', '.html', '.svg', '.txt', '.csv']);
const compressionCache = new Map();

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
      const ext = path.extname(filePath).toLowerCase();
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const shouldGzip = TEXT_TYPES.has(ext) && acceptEncoding.includes('gzip');

      let responseBody = data;
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Vary': 'Accept-Encoding' };

      if (shouldGzip) {
        const stats = fs.statSync(filePath);
        const cacheKey = `${filePath}@${stats.mtime.getTime()}`;
        if (!compressionCache.has(cacheKey)) {
          compressionCache.set(cacheKey, gzipSync(data));
        }
        responseBody = compressionCache.get(cacheKey);
        headers['Content-Encoding'] = 'gzip';
      }

      res.writeHead(200, headers);
      res.end(responseBody);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Resumo da moderação da Lia: mesmo formato de worker/src/assistant/moderationGate.js
 * (adminAssistantModeration), com os campos por pessoa que o S1 adiciona. Nenhum texto de mensagem.
 */
function moderationSummary() {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
  return {
    success: true,
    windowDays: 90,
    incidents: {
      total: 7,
      byDetection: { terms: 5, llm: 2 },
      byLevelAfter: { 1: 3, 2: 2, 3: 2 },
    },
    people: [
      { profileId: 'a1b2c3d4-0000-4000-8000-000000000001', incidents: 3, maxLevel: 3, lastAt: ago(2), currentLevel: 3, suspendedUntil: new Date(Date.now() + DAY).toISOString(), lastDetection: 'llm', lastRedeemedAt: null, displayName: 'Maria Exemplo' },
      { profileId: 'e5f6a7b8-0000-4000-8000-000000000002', incidents: 2, maxLevel: 2, lastAt: ago(9), currentLevel: 1, suspendedUntil: null, lastDetection: 'terms', lastRedeemedAt: ago(5), displayName: 'João Teste' },
      { profileId: 'c9d0e1f2-0000-4000-8000-000000000003', incidents: 2, maxLevel: 1, lastAt: ago(30), currentLevel: 0, suspendedUntil: null, lastDetection: 'terms', lastRedeemedAt: null, displayName: 'Ana Modelo' },
    ],
    currentLevels: { 1: 1, 2: 0, 3: 1 },
    redemption: { accepted: 3, refused: 1, rate: 0.75 },
  };
}

/** Respostas padrão da Worker — o suficiente para o app autenticado abrir sem erro. */
function defaultWorkerReply(action, args, ctx) {
  const p = ctx.profile;
  switch (action) {
    case 'apiLogin':
      return { success: true, sessionToken: ctx.sessionToken, profile: { id: p.id, fullName: p.fullName, role: p.role } };
    case 'apiGetMyProfile':
      return {
        success: true,
        profile: { id: p.id, fullName: p.fullName, username: p.username, email: p.email, role: p.role },
        preferences: { theme: ctx.theme, emailNotifications: true },
      };
    case 'apiGetMyMetrics':
      return {
        success: true,
        metrics: { eventsCount: 0, tasksCount: 0, tasksCompletedCount: 0, proposalsCount: 0, votesCount: 0, feedbackCount: 0 },
      };
    case 'apiGetHomeSummary': {
      // Resumo vazio e válido; visitante não recebe as seções de membro.
      const isMember = p.role !== 'visitor';
      return {
        success: true,
        summary: {
          nextEvents: [],
          tasks: isMember ? { myPendingCount: 0, availableCount: 0, next: null } : null,
          voting: isMember ? { openCount: 0, pendingCount: 0, nextClosesAt: null } : null,
          learning: { accuracyPct: null, questionsAnswered: 0, totalActivities: 0, unlockedBadges: 0, totalBadges: 0 },
          inbox: isMember ? { unreadMessages: 0, pendingConnectionRequests: 0 } : null,
        },
      };
    }
    case 'apiMfaStatus':
      return { success: true, enabled: false, pendingEnrollment: false, recoveryCodesLeft: 0, required: false };
    case 'apiLearnGetMyAttendanceQr':
      // Formato v2 (Fase 2) — assinatura fictícia, só precisa ter a forma certa.
      return { success: true, qrPayload: 'LAIFT:v2:00000000-0000-4000-8000-000000000000.AAAAAAAAAAAAAAAAAAAAAAAA' };
    case 'apiAdminDashboard':
      return {
        success: true,
        indicators: { active_members: 1, active_admins: 1, banned_accounts: 0, published_events: 0, proposals_pending: 0, proposals_voting: 0, tasks_open: 0 },
      };
    case 'apiAdminAssistantModeration':
      return moderationSummary();
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
 * @param {object} [opts.atlasFlags] chaves do Atlas (js/core/flags.js); padrão desliga apresentação e dicas
 * @param {string[]} [opts.launchArgs]  flags extras do Chromium (ex.: câmera falsa para o leitor de QR)
 * @param {string[]} [opts.permissions]  permissões concedidas ao contexto (ex.: ['camera'])
 * @param {boolean} [opts.firstLogin]  true = primeira entrada da pessoa: o onboarding por papel aparece.
 *   Padrão false: o onboarding já vem marcado como visto (laift_onboarding_seen_<id>), para não bloquear a UI.
 */
async function startApp(opts = {}) {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const ctx = {
    sessionToken: 'e2e-session-token',
    theme: opts.theme || 'light',
    profile: Object.assign({ id: E2E_PROFILE_ID, fullName: 'Ana Teste', email: 'ana@exemplo.com', username: 'ana', role: opts.role || 'member' }, opts.profile || {}),
  };
  const calls = { worker: [], external: [] };
  const errors = [];

  const browser = await chromium.launch(opts.launchArgs ? { args: opts.launchArgs } : undefined);
  const mobile = opts.viewport && opts.viewport.width < 600;
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    hasTouch: !!mobile,
    isMobile: !!mobile,
    permissions: opts.permissions || undefined,
  });

  // Novidades do Atlas que se sobrepõem à tela (apresentação modal, dicas):
  // desligadas por padrão nos cenários e2e para não interceptarem cliques;
  // as suítes que testam essas telas passam `atlasFlags: {}` (padrão real)
  // ou as chaves que quiserem (js/core/flags.js lê window.__atlasFlags).
  // O Service Worker (flag `offline`) fica desligado nos cenários: ele atenderia
  // os arquivos do atlas antes das rotas dos testes. Só atlas-offline o liga.
  const atlasFlags = Object.assign({ offline: false, quizSetup: false }, opts.atlasFlags !== undefined ? opts.atlasFlags : { onboarding: false, hints: false });
  await context.addInitScript((flags) => { window.__atlasFlags = flags; }, atlasFlags);
  if (!opts.firstLogin) {
    // Onboarding visto antes do app carregar (o script só lê o storage ao entrar).
    await context.addInitScript((key) => {
      try { window.localStorage.setItem(key, '1'); } catch (err) { /* storage bloqueado: o diálogo aparece */ }
    }, ONBOARDING_SEEN_PREFIX + ctx.profile.id);
  }

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
  const trackErrors = (p, label) => p.on('pageerror', (e) => errors.push(`${label}: ${e.message}` + (process.env.E2E_STACK ? ' @ ' + e.stack : '')));
  trackErrors(page, 'pagina');
  context.on('page', (p) => trackErrors(p, 'popup'));

  async function login() {
    await page.goto(baseUrl);
    await page.fill('#login-email', ctx.profile.email);
    await page.fill('#login-password', 'senha-de-teste-123');
    await page.click('#form-login button[type=submit]');
    await page.waitForSelector('#app-root:not(.hidden)');
  }

  // Propostas, Tarefas, Mensagens e Equipe moram no menu (hambúrguer): abre o menu e escolhe o item.
  const MENU_PANELS = ['panel-proposals', 'panel-tasks', 'panel-messages', 'panel-orgchart'];

  async function showPanel(panelId) {
    if (MENU_PANELS.includes(panelId)) {
      await page.click('#app-menu-btn');
      await page.click(`#app-menu [data-panel="${panelId}"]`);
    } else {
      await page.click(`#app-nav [data-panel="${panelId}"]`);
    }
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

module.exports = { startApp, check, loadPlaywright, startStaticServer, moderationSummary, E2E_PROFILE_ID, ONBOARDING_SEEN_PREFIX };
