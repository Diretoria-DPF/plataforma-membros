/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * hero-ux2.e2e.js — QA visual do hero da Lia (frontend/hero.js) com ux_v2_enabled ligada.
 * O hero (#hero-lia) está na tela de entrada (#screen-welcome, index.html), não no painel Início:
 * a ficha previa panel-home, mas lá não há esse contêiner. Por isso medimos e fotografamos a entrada,
 * em claro e escuro, em 375x812 e 1280x800, com flags simuladas no harness (apiGetFeatureFlags).
 *  (a) matriz: #hero-lia montado e visível, html com data-flag-ux-v2-enabled, sem rolagem horizontal,
 *      retângulo dentro da janela, sem erro de página nem de console; axe só como aviso;
 *  (b) flag desligada (375 claro): #hero-lia oculto;
 *  (c) movimento reduzido (375 escuro): monta sem erro; registra se o hero ainda se move.
 * Sem rede; não altera código de produção.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const SHOTS_DIR = path.join(__dirname, '.shots');
const FLAGS_ON = { ux_v2_enabled: true, chatbot_enabled: true, feedback_enabled: true };
const FLAGS_OFF = { ux_v2_enabled: false, chatbot_enabled: true, feedback_enabled: true };
const THEMES = [{ theme: 'light', slug: 'claro' }, { theme: 'dark', slug: 'escuro' }];
const VIEWPORTS = [{ label: '375x812', width: 375, height: 812 }, { label: '1280x800', width: 1280, height: 800 }];
const MOBILE = VIEWPORTS[0];
const SETTLE_MS = 900;
const MOTION_SAMPLE_MS = 600;
const MOUNT_TIMEOUT_MS = 15000;
const SPLASH_TIMEOUT_MS = 8000;
// Erros de ambiente (mesma lista de visual-qa): CDNs abortadas de propósito e requisições abortadas pelo harness.
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;
const ABORTED_REQUEST = /net::ERR_FAILED/;

const tally = { passed: 0, warnings: [] };

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

/** Estado do hero dentro da página (função autocontida: é serializada). */
function readHero() {
  const hero = document.getElementById('hero-lia');
  const r = hero ? hero.getBoundingClientRect() : { left: 0, right: 0, width: 0, height: 0 };
  return {
    hidden: !hero || hero.classList.contains('hidden'),
    ariaHidden: hero ? hero.getAttribute('aria-hidden') : null,
    mounted: !!hero && hero.hasAttribute('data-hero-mounted'),
    children: hero ? hero.childElementCount : 0,
    focusable: hero ? hero.querySelectorAll('a[href],button,input,select,textarea,[tabindex]').length : 0,
    inWelcome: !!hero && !!hero.closest('#screen-welcome'),
    flag: document.documentElement.hasAttribute('data-flag-ux-v2-enabled'),
    overflow: document.scrollingElement.scrollWidth - window.innerWidth,
    rect: [r.left, r.right, r.width, r.height].map(Math.round),
    top: Math.round(r.top),
    innerWidth: window.innerWidth,
    bg: getComputedStyle(document.body).backgroundColor,
  };
}

/** Marcação do hero e animações em execução: para saber se ele ainda se move. */
function readMotion() {
  const hero = document.getElementById('hero-lia');
  if (!hero) return { html: '', running: 0 };
  const running = hero.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length;
  return { html: hero.outerHTML, running };
}

function watchConsole(app, consoleErrors) {
  app.page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ABORTED_REQUEST.test(text) || IGNORABLE.test(text)) return;
    consoleErrors.push(text);
  });
}

/** Abre a tela de entrada (sem login) com as flags dadas; espera o hero montar quando ele deve montar. */
async function openEntry({ theme, viewport, flags, reduced = false }) {
  const app = await startApp({ viewport, workerHandlers: { apiGetFeatureFlags: () => ({ success: true, flags }) } });
  const consoleErrors = [];
  watchConsole(app, consoleErrors);
  const { page } = app;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto(app.baseUrl);
  if (flags.ux_v2_enabled) {
    await page.waitForFunction(() => {
      const hero = document.getElementById('hero-lia');
      return !!hero && hero.hasAttribute('data-hero-mounted');
    }, null, { timeout: MOUNT_TIMEOUT_MS }).catch(() => null);
  }
  await page.waitForSelector('.splash', { state: 'detached', timeout: SPLASH_TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_MS);
  return { app, consoleErrors };
}

/** Verificações de cada combinação; devolve o estado medido. */
async function checkHero(app, consoleErrors, where) {
  const s = await app.page.evaluate(readHero);
  console.log(`  · ${where}: fundo do body ${s.bg}; hero [esq, dir, larg, alt] [${s.rect}], topo ${s.top} px; focalizáveis dentro do hero: ${s.focusable}`);
  verify(s.inWelcome, `${where}: #hero-lia fora da tela de entrada (#screen-welcome)`);
  verify(!s.hidden && s.mounted && s.children > 0, `${where}: #hero-lia não montou (oculto=${s.hidden}, montado=${s.mounted}, filhos=${s.children})`);
  // O hero é só decoração (sem texto e sem nada focável): aria-hidden="true" é o correto; o que não pode é ter foco dentro dele.
  verify(s.ariaHidden === 'true' && s.focusable === 0, `${where}: #hero-lia deve ser decorativo (aria-hidden="true" e 0 focalizáveis; aria-hidden=${s.ariaHidden}, focalizáveis=${s.focusable})`);
  verify(s.flag, `${where}: html sem data-flag-ux-v2-enabled`);
  verify(s.overflow <= 0, `${where}: rolagem horizontal (${s.overflow} px além da janela)`);
  verify(s.rect[0] >= 0 && s.rect[1] <= s.innerWidth && s.rect[2] > 0, `${where}: retângulo do hero [${s.rect}] fora da janela de ${s.innerWidth} px`);
  const all = app.errors.filter((e) => !IGNORABLE.test(e)).concat(consoleErrors);
  verify(all.length === 0, `${where}: erro de JavaScript: ${all.join(' | ')}`);
  return s;
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true, timeout: 60000 });
}

async function runMatrix() {
  for (const { theme, slug } of THEMES) {
    for (const vp of VIEWPORTS) {
      const where = `${slug}/${vp.label}`;
      const { app, consoleErrors } = await openEntry({ theme, viewport: vp, flags: FLAGS_ON });
      try {
        await checkHero(app, consoleErrors, where);
        await shoot(app.page, `hero-${slug}-${vp.label}`);
        const serious = await axeGate(app.page, `${where} (hero)`, { enforce: false });
        if (serious.length) warn(`${where}: axe serious/critical: ${serious.map((v) => v.id).join(', ')}`);
      } finally {
        await app.close();
      }
    }
  }
}

async function runFlagOff() {
  const where = 'claro/375x812 (flag desligada)';
  const { app, consoleErrors } = await openEntry({ theme: 'light', viewport: MOBILE, flags: FLAGS_OFF });
  try {
    const s = await app.page.evaluate(readHero);
    verify(s.hidden && !s.mounted && !s.flag, `${where}: #hero-lia deveria estar oculto (oculto=${s.hidden}, montado=${s.mounted}, flag=${s.flag})`);
    const all = app.errors.filter((e) => !IGNORABLE.test(e)).concat(consoleErrors);
    verify(all.length === 0, `${where}: erro de JavaScript: ${all.join(' | ')}`);
    await shoot(app.page, 'hero-flag-desligada');
  } finally {
    await app.close();
  }
}

async function runReducedMotion() {
  const where = 'escuro/375x812 (movimento reduzido)';
  const { app, consoleErrors } = await openEntry({ theme: 'dark', viewport: MOBILE, flags: FLAGS_ON, reduced: true });
  try {
    await checkHero(app, consoleErrors, where);
    const before = await app.page.evaluate(readMotion);
    await app.page.waitForTimeout(MOTION_SAMPLE_MS);
    const after = await app.page.evaluate(readMotion);
    await shoot(app.page, 'hero-escuro-375x812-reduzido');
    const changed = before.html !== after.html;
    const note = `animações em execução=${after.running}, marcação ${changed ? 'mudou' : 'estável'} em ${MOTION_SAMPLE_MS} ms`;
    if (changed || after.running > 0) warn(`${where}: o hero ainda se move (${note})`);
    else console.log(`  · ${where}: hero estático (${note})`);
  } finally {
    await app.close();
  }
}

module.exports = async function heroUx2() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  tally.passed = 0;
  tally.warnings = [];
  await runMatrix();
  await runFlagOff();
  await runReducedMotion();
  console.log(`\n  Resumo hero-ux2: ${tally.passed} verificações ok, ${tally.warnings.length} aviso(s).`);
  for (const w of tally.warnings) console.log(`  ⚠ AVISO: ${w}`);
};
