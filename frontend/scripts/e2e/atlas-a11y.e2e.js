/**
 * atlas-a11y.e2e.js — acessibilidade do Atlas v2 com axe-core (WCAG 2.x A/AA).
 * ---------------------------------------------------------------------------
 * Em celular (390×844) e desktop (1280×800), roda o axe nos estados que o
 * aluno mais vê: abertura, ficha aberta, folha de Ferramentas (celular) e
 * modo Quiz. Falha em violações de impacto "serious" ou "critical"; as
 * "moderate"/"minor" são listadas como aviso.
 *
 * O contexto ignora a CSP só para injetar o axe (a CSP do atlas proíbe
 * script inline) — a CSP em si é coberta por csp.e2e.js/atlas-responsive.
 */
const fs = require('fs');
const path = require('path');
const { check, loadPlaywright, startStaticServer } = require('./harness');

const AXE_SOURCE = fs.readFileSync(path.join(__dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
const ATLAS_PATH = 'modulos/anatomia-3d/index.html';
const HOST_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>host de teste</title></head>
<body style="margin:0;background:#000;">
<script>
  window.App = {
    getIdentity: function () { return { email: 'e2e@example.com', fullName: 'E2E', role: 'member' }; },
    getThemePreference: function () { return 'light'; },
    notifyActivity: function () {},
    callLearningApi: function () { return Promise.resolve({ success: false, message: 'sem worker no teste' }); },
  };
</script>
<iframe id="atlas-frame" title="Atlas" src="${ATLAS_PATH}" style="position:fixed;inset:0;border:0;width:100vw;height:100vh;display:block;"></iframe>
</body></html>`;

async function scan(frame, label) {
  await frame.addScriptTag({ content: AXE_SOURCE }).catch(() => {});
  const result = await frame.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      count: v.nodes.length,
    }));
  });
  const serious = result.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const minor = result.filter((v) => !serious.includes(v));
  for (const v of minor) console.log(`  · aviso ${label}: ${v.id} (${v.impact}, ${v.count}) — ${v.help} — ${v.targets.join(' | ')}`);
  check(serious.length === 0, `${label}: axe sem violações sérias/críticas${serious.length ? ': ' + serious.map((v) => `${v.id} (${v.count}) ${v.targets.join(' | ')}`).join(' ; ') : ''}`);
}

async function runAt(browser, baseUrl, viewport, mobile) {
  const label = `${viewport.width}×${viewport.height}`;
  const context = await browser.newContext({ viewport, bypassCSP: true, isMobile: mobile, hasTouch: mobile });
  try {
    const page = await context.newPage();
    await context.route(`${baseUrl}e2e-a11y-host.html`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST_HTML }));
    await page.goto(`${baseUrl}e2e-a11y-host.html`);
    const frame = await (await page.waitForSelector('#atlas-frame')).contentFrame();
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
    await frame.waitForTimeout(500);
    await scan(frame, `${label} abertura`);

    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:liver', source: 'search' });
    });
    await frame.waitForFunction(() => {
      const n = document.getElementById('organ-name');
      return n && n.textContent && n.textContent !== '---';
    }, null, { timeout: 15000 }).catch(() => {});
    await frame.waitForTimeout(500);
    await scan(frame, `${label} ficha aberta`);

    if (mobile) {
      await frame.click('#atlas-toolbar-tools');
      await scan(frame, `${label} Ferramentas`);
      await frame.click('.atlas-tools-backdrop', { position: { x: 20, y: 120 } });
    }

    await frame.evaluate(() => window.AtlasShell.setMode('quiz'));
    await frame.waitForSelector('#quizQuestionCard', { state: 'attached', timeout: 15000 }).catch(() => {});
    await frame.waitForTimeout(500);
    await scan(frame, `${label} Quiz`);
  } finally {
    await context.close();
  }
}

async function openHost(browser, baseUrl, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, bypassCSP: true, ...opts });
  const page = await context.newPage();
  await context.route(`${baseUrl}e2e-a11y-host.html`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST_HTML }));
  await page.goto(`${baseUrl}e2e-a11y-host.html`);
  const frame = await (await page.waitForSelector('#atlas-frame')).contentFrame();
  await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
  await frame.waitForTimeout(500);
  return { context, page, frame };
}

/** Só teclado: Tab alcança busca, barra e ficha; Enter ativa; Esc fecha. */
async function keyboardOnly(browser, baseUrl) {
  const { context, page, frame } = await openHost(browser, baseUrl, { width: 1280, height: 800 });
  try {
    await frame.evaluate(() => {
      window.AtlasShell.closeOnboarding && window.AtlasShell.closeOnboarding();
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:liver', source: 'search' });
      document.activeElement && document.activeElement.blur();
    });
    await frame.waitForTimeout(800);
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const where = await frame.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return '';
        if (a.closest('#atlas-search-slot, .atlas-search-box, .atlas-search')) return 'busca';
        if (a.closest('#atlas-toolbar')) return 'barra';
        if (a.closest('#atlas-inspector, #atlas-sheet')) return 'ficha';
        return a.id || a.className || a.tagName;
      });
      if (where) seen.add(where);
    }
    check(seen.has('busca') && seen.has('barra') && seen.has('ficha'),
      `só teclado: Tab alcança busca, barra e ficha (${[...seen].slice(0, 12).join(', ')})`);
    // Enter ativa (Camadas abre o painel) e Esc fecha o menu ⋯.
    await frame.focus('#atlas-toolbar-layers');
    await page.keyboard.press('Enter');
    const layersOpen = await frame.evaluate(() => document.getElementById('atlas-toolbar-layers').getAttribute('aria-pressed'));
    check(layersOpen === 'true', `só teclado: Enter em Camadas abre o painel (aria-pressed=${layersOpen})`);
    await frame.focus('#atlas-toolbar-more');
    await page.keyboard.press('Enter');
    const menuOpen = await frame.evaluate(() => !!document.querySelector('.atlas-dropdown'));
    await page.keyboard.press('Escape');
    const menuClosed = await frame.evaluate(() => !document.querySelector('.atlas-dropdown'));
    check(menuOpen && menuClosed, `só teclado: Enter abre o menu ⋯ e Esc fecha (${menuOpen}/${menuClosed})`);
  } finally {
    await context.close();
  }
}

/** Celular com "reduzir movimento": Esc fecha Ferramentas e nada anima. */
async function reducedMotion(browser, baseUrl) {
  const { context, page, frame } = await openHost(browser, baseUrl, { width: 390, height: 844 },
    { isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    await frame.evaluate(() => { window.AtlasShell.closeOnboarding && window.AtlasShell.closeOnboarding(); });
    await frame.click('#atlas-toolbar-tools');
    await page.keyboard.press('Escape');
    const closed = await frame.evaluate(() => document.getElementById('atlas-toolbar').dataset.toolsOpen);
    check(closed === 'false', `celular: Esc fecha a folha de Ferramentas (toolsOpen=${closed})`);
    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:liver', source: 'pick' });
    });
    await frame.waitForTimeout(150);
    const running = await frame.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().duration > 50)
      .map((a) => (a.effect.target && (a.effect.target.id || a.effect.target.className)) || '?'));
    check(running.length === 0, `com "reduzir movimento" nenhuma animação CSS longa roda (${running.join(', ') || 'nenhuma'})`);
  } finally {
    await context.close();
  }
}

/** Apresentação aberta e dica na tela (flags reais ligadas). */
async function onboardingAndHint(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { window.__atlasFlags = {}; }); // padrão real: tudo ligado
  try {
    const page = await context.newPage();
    await context.route(`${baseUrl}e2e-a11y-host.html`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST_HTML }));
    await page.goto(`${baseUrl}e2e-a11y-host.html`);
    const frame = await (await page.waitForSelector('#atlas-frame')).contentFrame();
    await frame.waitForFunction(() => {
      const d = document.getElementById('atlas-onboarding');
      return d && d.open;
    }, null, { timeout: 30000 });
    await scan(frame, '390×844 apresentação (tela 1)');
    await frame.locator('#atlas-onboarding .atlas-onb-primary').click();
    await scan(frame, '390×844 apresentação (tela 2)');
    await frame.locator('#atlas-onboarding .atlas-onb-skip').click();
    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:liver', source: 'pick' });
    });
    await frame.waitForSelector('.atlas-hint:not([hidden])', { timeout: 5000 });
    await scan(frame, '390×844 dica na tela');
  } finally {
    await context.close();
  }
}

module.exports = async function atlasA11y() {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  // Apresentação modal e dicas desligadas por padrão (como em harness.js
  // startApp); um contexto que queira testá-las define window.__atlasFlags.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (o) => {
    const c = await newContext(o);
    await c.addInitScript(() => { if (!window.__atlasFlags) window.__atlasFlags = { onboarding: false, hints: false }; });
    return c;
  };
  try {
    await runAt(browser, baseUrl, { width: 390, height: 844 }, true);
    await runAt(browser, baseUrl, { width: 1280, height: 800 }, false);
    await keyboardOnly(browser, baseUrl);
    await onboardingAndHint(browser, baseUrl);
    await reducedMotion(browser, baseUrl);
  } finally {
    await browser.close();
    server.close();
  }
};
