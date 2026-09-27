/**
 * atlas-responsive.e2e.js — casca e layout responsivo do Atlas v2 (WP08)
 * ---------------------------------------------------------------------------
 * Cobre frontend/modulos/anatomia-3d/index.html (a casca do Atlas v2 — ver
 * docs/ATLAS_UX_SPEC.md e o relatório do WP08; o WP13 ligou v2.html como o
 * index.html definitivo do módulo, removendo o motor antigo).
 * Roda sobre o BUILD (frontend/dist/), como as demais suítes.
 *
 * modulos/shared/laift-identity.js exige uma "janela host" com
 * `window.App.getIdentity()` (senão redireciona ao login, como faria fora
 * da plataforma de verdade) — em vez de duplicar o servidor estático,
 * reusamos `startStaticServer()` de ./harness e servimos uma página-host
 * mínima por `route.fulfill` (sem escrever nenhum arquivo novo em disco):
 * ela define `window.App` e embute index.html num <iframe> da MESMA origem,
 * exatamente como frontend/index.html + learning.js fazem de verdade.
 */
const { check, loadPlaywright, startStaticServer } = require('./harness');

const ATLAS_PATH = 'modulos/anatomia-3d/index.html';

const HOST_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>host de teste</title></head>
<body style="margin:0;background:#000;">
<script>
  window.__e2eTheme = window.__e2eTheme || 'light';
  window.App = {
    getIdentity: function () { return { email: 'e2e@example.com', fullName: 'E2E', role: 'member' }; },
    getThemePreference: function () { return window.__e2eTheme; },
    notifyActivity: function () {},
    callLearningApi: function () { return Promise.resolve({ success: false, message: 'sem worker no teste' }); },
  };
</script>
<iframe id="atlas-frame" src="${ATLAS_PATH}" allow="fullscreen"
  style="position:fixed;inset:0;border:0;width:100vw;height:100vh;display:block;"></iframe>
</body></html>`;

/**
 * Abre v2.html dentro do iframe-host acima, numa página já criada (a CSP/
 * erro precisam estar ligados ANTES de navegar — ver {@link wireCspAndErrors}
 * — por isso `page` chega pronta, nunca é criada aqui).
 */
async function openAtlasFrame(page, baseUrl) {
  await page.context().route(`${baseUrl}e2e-atlas-host.html`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST_HTML }));
  await page.goto(`${baseUrl}e2e-atlas-host.html`);
  const frameEl = await page.waitForSelector('#atlas-frame');
  const frame = await frameEl.contentFrame();
  await frame.waitForLoadState('load');
  await frame.waitForSelector('#atlas-canvas');
  return frame;
}

/** Liga um assinante de bus.js dentro do frame (mesma instância que shell.js/sheet.js usam). */
async function watchSheetSnaps(frame) {
  await frame.evaluate(() => {
    window.__e2eSheetSnaps = [];
    window.__e2ePickSnapDebug = [];
    return import('./js/core/bus.js').then((bus) => {
      bus.on(bus.EVENTS.SHEET_SNAP, (payload) => window.__e2eSheetSnaps.push(payload));
    });
  });
}

/** Liga a captura de CSP/erros ANTES de qualquer navegação nesta página/contexto. */
async function wireCspAndErrors(context, page, bucket) {
  await context.exposeBinding('__e2eCspReport', (source, v) => bucket.violations.push(v));
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try { window.__e2eCspReport({ directive: e.effectiveDirective, blocked: e.blockedURI }); } catch (err) { /* binding ainda não pronto */ }
    });
  });
  page.on('pageerror', (e) => bucket.errors.push(e.message));
}

/** Arrasta a alça do painel por `deltaY` px (negativo = abre), em passos pequenos (baixa velocidade). */
async function dragHandleBy(page, frame, deltaY, steps = 16) {
  const box = await frame.locator('#atlas-sheet-handle').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Dispara eventos pointer diretamente no frame (não via page.mouse, que não alcança o iframe)
  const pointerId = Math.random() * 10000 | 0;

  // Dispara pointerdown
  await frame.evaluate(([startX, startY, pId]) => {
    window.__e2eDragLog = [];
    const handle = document.getElementById('atlas-sheet-handle');
    window.__e2eDragLog.push(`pointerdown: clientY=${startY}`);
    // Registra o estado inicial antes do drag
    window.__e2eDragInitialState = {
      state: document.getElementById('atlas-sheet').getAttribute('data-sheet-state'),
      height: document.getElementById('atlas-sheet').getBoundingClientRect().height
    };
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: startX, clientY: startY, pointerId: pId, isPrimary: true,
      bubbles: true, cancelable: true
    }));
    try { handle.setPointerCapture(pId); } catch (e) {}
  }, [x, y, pointerId]);

  // Dispara pointermove em passos com delays
  const stepCount = steps * 2; // Aumenta passos para reduzir velocidade
  for (let i = 1; i <= stepCount; i++) {
    const currentY = y + (deltaY * i) / stepCount;
    await frame.evaluate(([startX, cy, pId]) => {
      const handle = document.getElementById('atlas-sheet-handle');
      window.__e2eDragLog.push(`pointermove: clientY=${cy}`);
      handle.dispatchEvent(new PointerEvent('pointermove', {
        clientX: startX, clientY: cy, pointerId: pId, isPrimary: true,
        bubbles: true, cancelable: true
      }));
    }, [x, currentY, pointerId]);
    await page.waitForTimeout(50);
  }

  // Dispara pointerup
  const result = await frame.evaluate(([startX, endY, pId]) => {
    const handle = document.getElementById('atlas-sheet-handle');
    window.__e2eDragLog.push(`pointerup: clientY=${endY}`);
    handle.dispatchEvent(new PointerEvent('pointerup', {
      clientX: startX, clientY: endY, pointerId: pId, isPrimary: true,
      bubbles: true, cancelable: true
    }));
    const snapDebugArray = window.__e2ePickSnapDebug;
    return { log: window.__e2eDragLog, state: document.getElementById('atlas-sheet').getAttribute('data-sheet-state'), snapDebugArray };
  }, [x, y + deltaY, pointerId]);

  // Log para diagnóstico
  if (result.log && result.log.length > 0) {
    console.log(`[DRAG] startY=${y}, endY=${y + deltaY}, deltaY=${deltaY}, steps=${stepCount}, final state=${result.state}`);
    console.log(`[DRAG] moves: first=${result.log[1]}, last=${result.log[result.log.length - 2]}`);
    if (result.snapDebugArray && result.snapDebugArray.length > 0) {
      const snap = result.snapDebugArray[result.snapDebugArray.length - 1];
      console.log(`[SNAP] startState=${snap.startState}, endHeight=${snap.endHeight}, velocity=${snap.velocity}, projected=${snap.projected}, target=${snap.target}, dist=${snap.dragDistance}`);
    }
  }

  // Aguarda a transição da altura (motion-sheet = 200ms)
  await page.waitForTimeout(250);
}

module.exports = async function atlasResponsive() {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const bucket = { violations: [], errors: [] };

  try {
    // =====================================================================
    // 1. Celular retrato (390×844) — sem rolagem, cobertura de 55%, arraste.
    // =====================================================================
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await wireCspAndErrors(context, page, bucket);
      const frame = await openAtlasFrame(page, baseUrl);
      await watchSheetSnaps(frame);

      const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(scroll.sw <= scroll.iw + 1, `390×844: sem rolagem horizontal na página-host (scrollWidth ${scroll.sw} ≤ ${scroll.iw})`);
      const frameScroll = await frame.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, oy: document.documentElement.scrollHeight > window.innerHeight + 1 }));
      check(frameScroll.sw <= frameScroll.iw + 1, `390×844: sem rolagem horizontal dentro do Atlas (scrollWidth ${frameScroll.sw} ≤ ${frameScroll.iw})`);
      check(!frameScroll.oy, '390×844: <body> do Atlas não tem overflow vertical de página (§0.4)');

      const coveragePeek = await frame.evaluate(() => {
        const r = document.getElementById('atlas-sheet').getBoundingClientRect();
        return 1 - r.height / window.innerHeight;
      });
      check(coveragePeek >= 0.549, `390×844: canvas visível ≥55% com o painel em "espiar" (${(coveragePeek * 100).toFixed(1)}%)`);

      await dragHandleBy(page, frame, -290); // peek(96) → perto de half(~380)
      let state = await frame.evaluate(() => document.getElementById('atlas-sheet').getAttribute('data-sheet-state'));
      check(state === 'half', `390×844: arraste lento da alça encaixa em "half" (veio "${state}")`);

      const coverageHalf = await frame.evaluate(() => {
        const r = document.getElementById('atlas-sheet').getBoundingClientRect();
        return 1 - r.height / window.innerHeight;
      });
      check(coverageHalf >= 0.549, `390×844: canvas visível ≥55% com o painel em "half" (${(coverageHalf * 100).toFixed(1)}%)`);

      await dragHandleBy(page, frame, -390); // half → perto de full(~760)
      state = await frame.evaluate(() => document.getElementById('atlas-sheet').getAttribute('data-sheet-state'));
      check(state === 'full', `390×844: arraste lento da alça encaixa em "full" (veio "${state}")`);

      await dragHandleBy(page, frame, 700); // full → com regra "sem pulo" (velocidade baixa), para em half
      state = await frame.evaluate(() => document.getElementById('atlas-sheet').getAttribute('data-sheet-state'));
      check(state === 'half', `390×844: arraste lento da alça com "sem pulo" encaixa em "half" (veio "${state}")`);

      const snaps = await frame.evaluate(() => window.__e2eSheetSnaps);
      check(snaps.length >= 3 && snaps.every((s) => typeof s.heightPx === 'number' && ['peek', 'half', 'full'].includes(s.state)),
        `390×844: cada encaixe emitiu sheet:snap com {state, heightPx} (${snaps.length} eventos)`);

      // Teclado: Enter na alça cicla half→full.
      await frame.locator('#atlas-sheet-handle').focus();
      await page.keyboard.press('Enter');
      state = await frame.evaluate(() => document.getElementById('atlas-sheet').getAttribute('data-sheet-state'));
      check(state === 'full', `390×844: Enter na alça cicla o estado (half→full, veio "${state}")`);
      await page.keyboard.press('Escape');
      state = await frame.evaluate(() => document.getElementById('atlas-sheet').getAttribute('data-sheet-state'));
      check(state === 'peek', `390×844: Esc na alça volta para "peek" (veio "${state}")`);

      await context.close();
    }

    // =====================================================================
    // 2. Celular paisagem (844×390) — painel lateral.
    // =====================================================================
    {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await wireCspAndErrors(context, page, bucket);
      const frame = await openAtlasFrame(page, baseUrl);

      const scroll = await frame.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(scroll.sw <= scroll.iw + 1, `844×390: sem rolagem horizontal (scrollWidth ${scroll.sw} ≤ ${scroll.iw})`);

      const shape = await frame.evaluate(() => {
        const r = document.getElementById('atlas-sheet').getBoundingClientRect();
        return { width: r.width, height: r.height, right: r.right, viewportW: window.innerWidth };
      });
      check(shape.height > shape.width, `844×390: painel é mais alto que largo (lateral, não inferior) — ${shape.width}×${shape.height}`);
      check(shape.right >= shape.viewportW - 2, `844×390: painel encostado na borda direita (right=${shape.right}, viewport=${shape.viewportW})`);

      await context.close();
    }

    // =====================================================================
    // 3. Tablet (820×1180) — inspetor + navegador em gaveta, sem sheet.
    // =====================================================================
    {
      const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await wireCspAndErrors(context, page, bucket);
      const frame = await openAtlasFrame(page, baseUrl);

      const scroll = await frame.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(scroll.sw <= scroll.iw + 1, `820×1180: sem rolagem horizontal (scrollWidth ${scroll.sw} ≤ ${scroll.iw})`);

      const layout = await frame.evaluate(() => ({
        sheetHidden: window.getComputedStyle(document.getElementById('atlas-sheet')).display === 'none',
        inspectorVisible: window.getComputedStyle(document.getElementById('atlas-inspector')).display !== 'none',
      }));
      check(layout.sheetHidden, '820×1180: painel arrastável não é a superfície ativa (tablet usa o inspetor)');
      check(layout.inspectorVisible, '820×1180: inspetor existe como região visível');

      await context.close();
    }

    // =====================================================================
    // 4. Desktop (1440×900) — três colunas.
    // =====================================================================
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await wireCspAndErrors(context, page, bucket);
      const frame = await openAtlasFrame(page, baseUrl);

      const scroll = await frame.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(scroll.sw <= scroll.iw + 1, `1440×900: sem rolagem horizontal (scrollWidth ${scroll.sw} ≤ ${scroll.iw})`);

      const cols = await frame.evaluate(() => {
        const left = document.getElementById('atlas-left-panel').getBoundingClientRect();
        const canvas = document.getElementById('atlas-canvas').getBoundingClientRect();
        return { bodyDisplay: window.getComputedStyle(document.body).display, leftW: left.width, canvasX: canvas.x, leftRight: left.right };
      });
      check(cols.bodyDisplay === 'flex', '1440×900: casca vira layout de colunas (display: flex no <body>)');
      check(cols.leftW > 0 && cols.leftW < 100, `1440×900: rail do navegador começa recolhido (~56px), veio ${cols.leftW}`);
      check(cols.canvasX >= cols.leftRight - 1, '1440×900: canvas começa depois do rail do navegador (três colunas)');

      await context.close();
    }

    // =====================================================================
    // 5. TV (1920×1080) — Tab/setas alcançam as zonas; foco visível.
    // =====================================================================
    {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
      const page = await context.newPage();
      await wireCspAndErrors(context, page, bucket);
      const frame = await openAtlasFrame(page, baseUrl);

      const scroll = await frame.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(scroll.sw <= scroll.iw + 1, `1920×1080: sem rolagem horizontal (scrollWidth ${scroll.sw} ≤ ${scroll.iw})`);

      // Foco inicial num ponto conhecido da topbar, depois passeia pelas zonas.
      await frame.locator('#atlas-mode-trigger').focus();
      const zonesSeen = new Set();
      const zoneOf = async () => frame.evaluate(() => {
        const sel = '#atlas-topbar, #atlas-left-panel, #atlas-canvas, #atlas-toolbar, #atlas-inspector, #atlas-sheet';
        const z = document.activeElement && document.activeElement.closest(sel);
        return z ? z.id : null;
      });
      zonesSeen.add(await zoneOf());
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('ArrowRight');
        const z = await zoneOf();
        if (z) zonesSeen.add(z);
      }
      // Sem seleção nem conteúdo do WP09 montado, as zonas visíveis em
      // 1920×1080 são: topbar, rail do navegador, canvas e mini toolbar
      // (o inspetor está colapsado a 0px e o painel arrastável não existe
      // em telas ≥600px — ver css/atlas.css).
      check(zonesSeen.has('atlas-topbar'), 'TV: seta direita alcança a zona da barra superior');
      check(zonesSeen.has('atlas-left-panel'), 'TV: seta direita alcança a zona do rail do navegador');
      check(zonesSeen.has('atlas-canvas'), 'TV: seta direita alcança a zona do canvas (mira central)');
      check(zonesSeen.has('atlas-toolbar'), 'TV: seta direita alcança a zona da mini barra de ferramentas');

      // O anel de foco visível vem de :focus-visible (laift-tokens.css,
      // ampliado para 4px em css/atlas.css só quando `(hover:none)` bate de
      // verdade — Playwright não garante emular essa feature de mídia a
      // partir de `hasTouch`, então aqui só confirmamos que HÁ anel visível
      // (não a largura exata) para não depender disso.
      const ring = await frame.evaluate(() => {
        const cs = window.getComputedStyle(document.activeElement);
        return { outlineWidth: parseFloat(cs.outlineWidth) || 0, outlineStyle: cs.outlineStyle };
      });
      check(ring.outlineStyle !== 'none' && ring.outlineWidth > 0,
        `TV: anel de foco visível no item focado (outline: ${ring.outlineStyle} ${ring.outlineWidth}px)`);

      await context.close();
    }

    check(bucket.violations.length === 0, `zero violações de CSP em todos os viewports${bucket.violations.length ? ': ' + bucket.violations.map((v) => `${v.directive} ${v.blocked}`).join(' | ') : ''}`);
    check(bucket.errors.length === 0, `zero erros de página em todos os viewports${bucket.errors.length ? ': ' + bucket.errors.join(' | ') : ''}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
};
