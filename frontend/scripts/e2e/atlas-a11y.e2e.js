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

module.exports = async function atlasA11y() {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    await runAt(browser, baseUrl, { width: 390, height: 844 }, true);
    await runAt(browser, baseUrl, { width: 1280, height: 800 }, false);
  } finally {
    await browser.close();
    server.close();
  }
};
