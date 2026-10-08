/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * visual-qa.e2e.js — QA visual dos painéis principais, em claro e escuro e em
 * 375x812 (celular) e 1280x800 (desktop). Salva uma captura de cada painel em
 * frontend/scripts/e2e/.shots/ e verifica, em cada combinação:
 *  (a) sem rolagem horizontal da página;
 *  (b) sem erro de JavaScript (página e console; erros de CDN bloqueada ficam de fora);
 *  (c) alvos de toque >= 44x44 a 375 px: controles principais (nav, Lia, primários)
 *      reprovam; os demais viram AVISO;
 *  (d) nenhum .card/.list-item/.modal-box com borda sob a flag ux_v2;
 *  (e) com prefers-reduced-motion, o Início já mostra os valores finais (sem contagem);
 *  (f) axe-core, se estiver em node_modules: violações serious/critical viram AVISO.
 * Usa a mesma API simulada do harness (sem rede). Não altera código de produção.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const SHOTS_DIR = path.join(__dirname, '.shots');
const AXE_FILE = path.join(__dirname, '..', '..', 'node_modules', 'axe-core', 'axe.min.js');
const AXE_SRC = fs.existsSync(AXE_FILE) ? fs.readFileSync(AXE_FILE, 'utf8') : null;

const THEMES = ['light', 'dark'];
const THEME_SLUG = { light: 'claro', dark: 'escuro' };
const VIEWPORTS = [
  { label: '375x812', width: 375, height: 812 },
  { label: '1280x800', width: 1280, height: 800 },
];
const MOBILE_VIEWPORT = VIEWPORTS[0];
const TOUCH_MIN_PX = 44;
const SETTLE_MS = 900; // animações de entrada e contagem (count-up) terminam aqui
const DAY_MS = 24 * 60 * 60 * 1000;
const FINAL_KPIS = ['30', '2', '15', '72%'];
const LIA_MESSAGE_ID = '3f2b7c1e-9a4d-4e8b-8c1a-5d6e7f8a9b0c';
const FLAGS_ON = { ux_v2_enabled: true, chatbot_enabled: true, feedback_enabled: true };
const MEMBER_PANELS = [
  { id: 'panel-home', slug: 'inicio' },
  { id: 'panel-events', slug: 'eventos' },
  { id: 'panel-proposals', slug: 'propostas' },
  { id: 'panel-learn', slug: 'aprender' },
  { id: 'panel-profile', slug: 'perfil' },
];

// Erros de ambiente: bibliotecas de CDN abortadas de propósito (mesma lista do smoke)
// e requisições abortadas pelo harness (net::ERR_FAILED). Qualquer outro erro é falha.
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;
const ABORTED_REQUEST = /net::ERR_FAILED/;

const tally = { passed: 0, warnings: [] };

// ---------------------------------------------------------------------------
// Dados simulados da Worker (formatos iguais aos de home.e2e.js e assistant.e2e.js)
// ---------------------------------------------------------------------------
const inDays = (n) => new Date(Date.now() + n * DAY_MS).toISOString();
const VALUE = { activity: 3, events: 1, learning: 2, tasks: 0, study_hours: 0.5 };

function dateList(range) {
  if (range === '6m') {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - (5 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  const n = range === '12m' ? 52 : Number(String(range).replace('d', ''));
  return Array.from({ length: n }, (_, i) => inDays(-(n - 1 - i)).slice(0, 10));
}

function timeseriesReply(metric, range) {
  const granularity = range === '6m' ? 'month' : range === '12m' ? 'week' : 'day';
  const value = VALUE[metric] || 0;
  return { success: true, range, granularity, series: dateList(range).map((date) => ({ date, value })) };
}

// Chaves do pacote de apiGetMyDashboardSeries (espelham DASHBOARD_SERIES da Worker).
const DASHBOARD_BUNDLE = [
  ['activity30d', 'activity', '30d'], ['events30d', 'events', '30d'], ['learning30d', 'learning', '30d'],
  ['tasks30d', 'tasks', '30d'], ['studyHours30d', 'study_hours', '30d'],
  ['events6m', 'events', '6m'], ['learning6m', 'learning', '6m'], ['tasks6m', 'tasks', '6m'],
];

/** Pacote do Início: o painel pede tudo numa chamada só (sem ela, todos os gráficos mostram erro). */
function dashboardReply() {
  const series = {};
  DASHBOARD_BUNDLE.forEach(([key, metric, range]) => {
    const reply = timeseriesReply(metric, range);
    series[key] = { range: reply.range, granularity: reply.granularity, series: reply.series };
  });
  return { success: true, series };
}

function homeSummary() {
  return {
    nextEvents: [
      { id: 'e1', title: 'Aula de Toxicologia', eventDate: inDays(1), location: 'Sala 2', isRegistered: true, spotsLeft: 3 },
      { id: 'e2', title: 'Simpósio', eventDate: inDays(9), location: null, isRegistered: false, spotsLeft: null },
    ],
    tasks: { myPendingCount: 2, availableCount: 1, next: { id: 't1', title: 'Revisar casos', dueDate: inDays(3) } },
    voting: { openCount: 2, pendingCount: 1, nextClosesAt: inDays(2) },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 3, pendingConnectionRequests: 1 },
  };
}

// Pacote de apiGetMyDashboardSeries (espelha DASHBOARD_SERIES da Worker).
const DASHBOARD_BUNDLE = [
  ['activity30d', 'activity', '30d'], ['events30d', 'events', '30d'], ['learning30d', 'learning', '30d'],
  ['tasks30d', 'tasks', '30d'], ['studyHours30d', 'study_hours', '30d'],
  ['events6m', 'events', '6m'], ['learning6m', 'learning', '6m'], ['tasks6m', 'tasks', '6m'],
];

function dashboardSeriesReply() {
  const series = {};
  DASHBOARD_BUNDLE.forEach(([key, metric, range]) => {
    const reply = timeseriesReply(metric, range);
    series[key] = { range: reply.range, granularity: reply.granularity, series: reply.series };
  });
  return { success: true, series };
}

function liaReply() {
  return {
    success: true,
    source: 'kb',
    reply: 'Os eventos abertos estão na tela Eventos. Confira datas e vagas antes de se inscrever.',
    actions: [{ type: 'navigate', target: 'panel-events', label: 'Eventos' }],
    suggestions: ['Meu crachá'],
    sources: [
      { source: 'Regulamento de eventos', section: 'Inscrições' },
      { source: 'Guia da plataforma', section: 'Eventos' },
    ],
    messageId: LIA_MESSAGE_ID,
  };
}

const ADMIN_HANDLERS = {
  apiAdminAiHealth: () => ({ success: true, configured: true, keys: [], usage24h: [], alerts: [], cache: { hits: 0, entries: 0 }, overallPct: 100 }),
  apiAdminAiMetrics: () => ({ success: true, days: 7, totals: {}, byDay: [], byCategory: [], rows: [], budget: null }),
  apiAdminAssistantStats: () => ({ success: true, totals: { questions: 0, helpful: 0, unhelpful: 0 }, byDay: [], rows: [] }),
  apiAdminListAssistantFeedback: () => ({ success: true, items: [], nextCursor: null }),
  apiAdminLearnAtlasTelemetry: () => ({ success: true, rows: [], totals: {} }),
  apiAdminLearnListPendingCases: () => ({ success: true, cases: [], items: [] }),
};

function memberHandlers() {
  return {
    apiGetFeatureFlags: () => ({ success: true, flags: FLAGS_ON }),
    apiGetHomeSummary: () => ({ success: true, summary: homeSummary() }),
    apiGetMyDashboardSeries: () => dashboardReply(),
    apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
    apiGetMyDashboardSeries: () => dashboardSeriesReply(),
    apiAssistantChat: () => liaReply(),
  };
}

function adminHandlers() {
  return Object.assign(memberHandlers(), ADMIN_HANDLERS);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function verify(condition, description) {
  if (condition) {
    tally.passed += 1;
    return;
  }
  check(false, description);
}

function warn(description) {
  tally.warnings.push(description);
}

function shotPath(theme, viewport, slug) {
  return path.join(SHOTS_DIR, `${THEME_SLUG[theme]}-${viewport.label}-${slug}.png`);
}

function watchConsole(app, qa) {
  app.page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ABORTED_REQUEST.test(text) || IGNORABLE.test(text)) return;
    qa.consoleErrors.push(text);
  });
}

function markErrors(app, qa) {
  return { pageErrors: app.errors.length, consoleErrors: qa.consoleErrors.length };
}

async function ensureAxe(page) {
  if (!AXE_SRC) return;
  const loaded = await page.evaluate(() => typeof window.axe === 'object' && window.axe !== null);
  if (!loaded) await page.evaluate(AXE_SRC);
}

// ---------------------------------------------------------------------------
// Leituras feitas dentro da página (funções autocontidas: são serializadas)
// ---------------------------------------------------------------------------
function readLayout() {
  const root = document.documentElement;
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  const describe = (el) => (el.id ? '#' + el.id : (el.className.toString().split(/\s+/)[0] || el.tagName.toLowerCase()));
  const borders = Array.from(document.querySelectorAll('.card, .list-item, .modal-box'))
    .filter((el) => el.getClientRects().length > 0)
    .filter((el) => {
      const style = getComputedStyle(el);
      return sides.some((side) => parseFloat(style['border' + side + 'Width']) > 0);
    })
    .map(describe);
  return {
    overflow: root.scrollWidth - root.clientWidth,
    theme: root.getAttribute('data-theme'),
    flag: root.hasAttribute('data-flag-ux-v2-enabled'),
    borders,
  };
}

function collectSmallTargets() {
  const CONTROLS = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox]';
  const PRIMARY = '#app-nav [data-panel], #app-nav button, #lia-launcher, .lia-send, #btn-logout, #btn-enter-admin-mode, [class*="primary"]';
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const small = [];
  document.querySelectorAll(CONTROLS).forEach((el) => {
    if (el.closest('.hidden, [hidden], [aria-hidden="true"]')) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return; // invisível ou escondido por clip
    if (r.width >= 44 && r.height >= 44) return;
    small.push({ d: label(el), w: Math.round(r.width), h: Math.round(r.height), primary: el.matches(PRIMARY) });
  });
  return small;
}

async function runAxeInPage() {
  const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0] ? v.nodes[0].target.join(' ') : '' }));
}

// ---------------------------------------------------------------------------
// Verificações por painel
// ---------------------------------------------------------------------------
function checkErrors(app, qa, mark, where) {
  const pageErrors = app.errors.slice(mark.pageErrors).filter((e) => !IGNORABLE.test(e));
  const consoleErrors = qa.consoleErrors.slice(mark.consoleErrors);
  const all = pageErrors.concat(consoleErrors);
  verify(all.length === 0, `${where}: erro de JavaScript: ${all.join(' | ')}`);
}

function describeTargets(list) {
  return list.slice(0, 6).map((t) => `"${t.d}" ${t.w}x${t.h}`).join('; ');
}

async function checkTargets(page, where) {
  const small = await page.evaluate(collectSmallTargets);
  const principal = small.filter((t) => t.primary);
  const others = small.filter((t) => !t.primary);
  verify(principal.length === 0, `${where}: controle principal abaixo de 44x44: ${describeTargets(principal)}`);
  if (others.length) warn(`${where}: ${others.length} controle(s) abaixo de 44x44 (não bloqueia): ${describeTargets(others)}`);
}

async function checkAxe(page, where) {
  if (!AXE_SRC) return;
  const serious = await page.evaluate(runAxeInPage);
  if (serious.length) {
    warn(`${where}: axe serious/critical: ${serious.map((v) => `${v.id} ${v.impact} x${v.nodes} (ex.: ${v.target})`).join('; ')}`);
  }
}

/** Confere layout, tema, flag, erros e alvos; devolve à captura o que foi medido. */
async function measure(app, qa, slug, mark) {
  const where = `${THEME_SLUG[qa.theme]}/${qa.vp.label}/${slug}`;
  const layout = await app.page.evaluate(readLayout);
  verify(layout.overflow <= 1, `${where}: rolagem horizontal da página (${layout.overflow}px além da largura)`);
  verify(layout.theme === qa.theme, `${where}: data-theme="${layout.theme}" em vez de "${qa.theme}"`);
  verify(layout.flag, `${where}: flag ux_v2 não aplicada (sem data-flag-ux-v2-enabled no html)`);
  verify(layout.borders.length === 0, `${where}: cards com borda sob ux_v2: ${layout.borders.join(', ')}`);
  checkErrors(app, qa, mark, where);
  if (qa.vp.width < 600) await checkTargets(app.page, where);
  await checkAxe(app.page, where);
}

async function captureView(app, qa, slug, mark) {
  await ensureAxe(app.page);
  await app.page.screenshot({ path: shotPath(qa.theme, qa.vp, slug), fullPage: true, timeout: 60000 });
  await measure(app, qa, slug, mark);
}

async function settle(page, panelId) {
  if (panelId === 'panel-home') await page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
  await page.waitForTimeout(SETTLE_MS);
}

async function visitPanel(app, qa, panel) {
  const mark = markErrors(app, qa);
  await app.showPanel(panel.id);
  await settle(app.page, panel.id);
  await captureView(app, qa, panel.slug, mark);
}

// ---------------------------------------------------------------------------
// Fluxos: membro (painéis + Lia), admin (IA) e prova de movimento reduzido
// ---------------------------------------------------------------------------
async function liaFlow(app, qa) {
  const page = app.page;
  const mark = markErrors(app, qa);
  await app.showPanel('panel-home');
  await page.waitForSelector('#lia-launcher:not(.hidden)');
  verify(await page.locator('#lia-panel.hidden').count() === 1, `${THEME_SLUG[qa.theme]}/${qa.vp.label}/lia-fechada: painel da Lia deveria estar fechado`);
  await captureView(app, qa, 'lia-fechada', mark);

  const openMark = markErrors(app, qa);
  await page.click('#lia-launcher');
  await page.waitForSelector('#lia-panel:not(.hidden)');
  await page.fill('#lia-input', 'quais eventos estão abertos?');
  await page.press('#lia-input', 'Enter');
  await page.waitForSelector('#lia-log .lia-feedback', { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(SETTLE_MS);
  const where = `${THEME_SLUG[qa.theme]}/${qa.vp.label}/lia-aberta`;
  verify(await page.locator('#lia-log .lia-sources li').count() > 0, `${where}: resposta da Lia sem lista de fontes`);
  verify(await page.locator('#lia-log .lia-feedback').count() === 1, `${where}: micro-card de feedback não apareceu sob a resposta`);
  await captureView(app, qa, 'lia-aberta', openMark);
}

async function runMemberPanels(qa) {
  const app = await startApp({ role: 'member', theme: qa.theme, viewport: qa.vp, workerHandlers: memberHandlers() });
  try {
    watchConsole(app, qa);
    await app.login();
    await app.page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
    for (const panel of MEMBER_PANELS) await visitPanel(app, qa, panel);
    await liaFlow(app, qa);
  } finally {
    await app.close();
  }
}

async function runAdminPanel(qa) {
  const app = await startApp({ role: 'admin', theme: qa.theme, viewport: qa.vp, workerHandlers: adminHandlers() });
  try {
    watchConsole(app, qa);
    await app.login();
    await app.page.click('#btn-enter-admin-mode');
    await visitPanel(app, qa, { id: 'panel-admin-ai', slug: 'admin-ia' });
  } finally {
    await app.close();
  }
}

/** (e): com movimento reduzido, cada número do Início já nasce no valor final. */
async function reducedMotionCheck(theme) {
  const app = await startApp({ role: 'member', theme, viewport: MOBILE_VIEWPORT, workerHandlers: memberHandlers() });
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.login();
    await app.page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
    const samples = await app.page.evaluate(() => new Promise((resolve) => {
      const read = () => Array.from(document.querySelectorAll('#home-dashboard .home-kpi-value')).map((n) => n.textContent.trim()).join('|');
      const start = performance.now();
      const seen = [];
      const tick = () => {
        seen.push(read());
        if (performance.now() - start < 1200) requestAnimationFrame(tick);
        else resolve(seen);
      };
      tick();
    }));
    const final = FINAL_KPIS.join('|');
    const moving = samples.filter((s) => s !== final);
    verify(moving.length === 0, `${THEME_SLUG[theme]}/375x812/reduced-motion: o Início animou os números (valores intermediários: ${[...new Set(moving)].slice(0, 3).join(' ; ')})`);
  } finally {
    await app.close();
  }
}

async function runCombo(theme, vp) {
  const qa = { theme, vp, consoleErrors: [] };
  await runMemberPanels(qa);
  await runAdminPanel(qa);
}

module.exports = async function visualQa() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  tally.passed = 0;
  tally.warnings = [];
  if (!AXE_SRC) warn('axe-core não está em node_modules: verificação (f) pulada');
  // Um fluxo por tema (dois em paralelo; viewports em sequência). Mais paralelismo sobrecarrega o host
  // e estoura o tempo das capturas.
  await Promise.all(THEMES.map(async (theme) => {
    for (const vp of VIEWPORTS) await runCombo(theme, vp);
    await reducedMotionCheck(theme);
  }));
  console.log(`\n  Resumo visual-qa: ${tally.passed} verificações ok, ${tally.warnings.length} aviso(s).`);
  for (const w of tally.warnings) console.log(`  ⚠ AVISO: ${w}`);
};
