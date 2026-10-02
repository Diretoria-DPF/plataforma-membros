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

/**
 * Barra de ferramentas no celular: 3 botões visíveis (Camadas, Isolar,
 * Ferramentas) e o painel "Ferramentas" com o resto, tudo dentro da tela.
 */
async function checkMobileToolbar(frame, label) {
  const visibleButtons = () => frame.evaluate(() => {
    const vw = window.innerWidth; const vh = window.innerHeight;
    return [...document.querySelectorAll('#atlas-toolbar button')]
      .filter((b) => b.offsetParent && window.getComputedStyle(b).visibility !== 'hidden')
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.id.replace('atlas-toolbar-', ''), inside: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh, w: r.width, h: r.height };
      });
  });
  const closed = await visibleButtons();
  check(closed.map((b) => b.id).sort().join(',') === 'isolate,layers,tools',
    `${label}: barra do celular mostra só Camadas, Isolar e Ferramentas (${closed.map((b) => b.id).join(',')})`);
  await frame.click('#atlas-toolbar-tools');
  const open = await visibleButtons();
  const outside = open.filter((b) => !b.inside || b.w < 44 || b.h < 44);
  check(open.length === 12 && outside.length === 0,
    `${label}: painel Ferramentas mostra os 9 extras dentro da tela, ≥44px (${open.length} botões; fora/pequenos: ${outside.map((b) => b.id).join(',') || 'nenhum'})`);
  await frame.click('#atlas-toolbar-xray');
  const afterAction = await frame.evaluate(() => document.getElementById('atlas-toolbar').dataset.toolsOpen);
  check(afterAction === 'false', `${label}: uma ação do painel (Raio-X) fecha o painel`);
  await frame.evaluate(() => window.AtlasShell.toggleXray());
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
      await checkMobileToolbar(frame, '390×844');

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
      await checkMobileToolbar(frame, '844×390');

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
      }));
      check(layout.sheetHidden, '820×1180: painel arrastável não é a superfície ativa (tablet usa o inspetor)');

      // A ficha (inspetor) abre como coluna ao selecionar uma estrutura.
      await frame.waitForFunction(() => window.__atlasModelState && window.__atlasModelState.ready, null, { timeout: 60000 });
      await frame.evaluate(() => {
        const I = window.__atlasInternals;
        const sid = [...I.registry.iterate()][0].sid;
        I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid, source: 'search' });
      });
      await frame.waitForFunction(() => window.getComputedStyle(document.getElementById('atlas-inspector')).display !== 'none', null, { timeout: 5000 }).catch(() => {});
      const withSel = await frame.evaluate(() => {
        const ins = document.getElementById('atlas-inspector').getBoundingClientRect();
        const cv = document.getElementById('atlas-canvas').getBoundingClientRect();
        return { insW: ins.width, overlap: cv.right > ins.left + 1 };
      });
      check(withSel.insW > 200, `820×1180: com seleção, a ficha abre como coluna (${Math.round(withSel.insW)}px)`);
      check(!withSel.overlap, '820×1180: a ficha não cobre o 3D (canvas termina onde ela começa)');

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
      check(cols.bodyDisplay === 'grid', '1440×900: casca vira grade de colunas (display: grid no <body>)');
      check(cols.leftW >= 200 && cols.leftW <= 340, `1440×900: navegador de estruturas aberto como coluna legível, veio ${Math.round(cols.leftW)}px`);
      check(cols.canvasX >= cols.leftRight - 1, '1440×900: canvas começa depois do navegador (três colunas)');

      // ☰ recolhe o navegador e o 3D ocupa a largura liberada.
      await frame.click('#atlas-nav-toggle');
      const collapsed = await frame.evaluate(() => ({
        leftDisplay: window.getComputedStyle(document.getElementById('atlas-left-panel')).display,
        canvasX: document.getElementById('atlas-canvas').getBoundingClientRect().x,
      }));
      check(collapsed.leftDisplay === 'none' && collapsed.canvasX < 20, `1440×900: ☰ recolhe o navegador e o 3D ocupa a largura toda (${JSON.stringify(collapsed)})`);

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
      // Sem seleção nem modo aberto, as zonas visíveis em 1920×1080 são:
      // topbar, navegador (coluna), canvas e mini toolbar
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

    // =====================================================================
    // 6. Viewport matrix (13 viewports) — responsivo sistemático.
    // =====================================================================
    const viewportMatrix = [
      { w: 320, h: 568, touch: true },   // iPhone SE
      { w: 360, h: 740, touch: true },   // Pixel 4a
      { w: 390, h: 844, touch: true },   // iPhone 14
      { w: 740, h: 360, touch: true },   // Landscape tablet
      { w: 844, h: 390, touch: true },   // iPhone landscape
      { w: 600, h: 960, touch: true },   // Tablet portrait
      { w: 820, h: 1180, touch: true },  // Tablet landscape
      { w: 1024, h: 768, touch: false }, // iPad
      { w: 1280, h: 800, touch: false }, // Small desktop
      { w: 1440, h: 900, touch: false }, // Desktop
      { w: 1920, h: 1080, touch: false },// Full HD
      { w: 2560, h: 1440, touch: false },// 2K
      { w: 3440, h: 1440, touch: false } // Ultrawide
    ];

    const matrixResults = [];

    // Cria o diretório de destino ANTES de tirar screenshots
    const fs = require('fs');
    const path = require('path');
    const screenshotBase = path.join(__dirname, '../../../docs/atlas-v2-shots/responsive');
    try {
      if (!fs.existsSync(screenshotBase)) {
        fs.mkdirSync(screenshotBase, { recursive: true });
      }
    } catch (e) {
      console.error(`[ERR] Failed to create screenshot directory: ${e.message}`);
    }

    for (const vp of viewportMatrix) {
      const vpKey = `${vp.w}x${vp.h}`;
      const result = { viewport: vpKey, checks: {} };

      try {
        const context = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          hasTouch: vp.touch,
          isMobile: vp.touch
        });
        const page = await context.newPage();
        await wireCspAndErrors(context, page, bucket);

        try {
          const frame = await openAtlasFrame(page, baseUrl);

          // Espera o modelo estar pronto (sheet no estado "peek" por padrão)
          await frame.waitForFunction(() => {
            const sheet = document.getElementById('atlas-sheet');
            return sheet && sheet.getAttribute('data-sheet-state') === 'peek';
          }, { timeout: 5000 }).catch(() => {
            // Se não conseguir, continua — pode estar hidden em telas grandes
          });

          // (a) Sem rolagem horizontal
          const scrollCheck = await frame.evaluate(() => {
            const se = document.scrollingElement;
            return {
              scrollWidth: se.scrollWidth,
              clientWidth: se.clientWidth,
              ok: se.scrollWidth <= se.clientWidth
            };
          });
          result.checks.a_noScroll = scrollCheck.ok;
          if (!scrollCheck.ok) {
            result.checks.a_reason = `scrollWidth ${scrollCheck.scrollWidth} > clientWidth ${scrollCheck.clientWidth}`;
          }

          // (b) Canvas visível ≥55% com sheet em "peek"
          const coverageCheck = await frame.evaluate(() => {
            const sheet = document.getElementById('atlas-sheet');
            const canvas = document.getElementById('atlas-canvas');
            const topbar = document.getElementById('atlas-topbar');
            const inspector = document.getElementById('atlas-inspector');
            const leftPanel = document.getElementById('atlas-left-panel');

            if (!sheet || !canvas) return { ok: false, reason: 'sheet ou canvas não encontrado' };

            const sheetState = sheet.getAttribute('data-sheet-state');
            if (sheetState !== 'peek' && sheetState !== null) {
              // Se o sheet tiver outro estado, tenta voltar para peek
              return { ok: false, reason: `sheet em estado "${sheetState}", esperava "peek"` };
            }

            const canvasRect = canvas.getBoundingClientRect();
            const viewportArea = window.innerWidth * window.innerHeight;

            // Calcula a área do canvas que é coberta por painéis opacos
            let coveredArea = 0;

            // Topbar (sempre topo)
            if (topbar) {
              const topbarRect = topbar.getBoundingClientRect();
              const topbarIntersect = Math.max(0, Math.min(canvasRect.bottom, topbarRect.bottom) - Math.max(canvasRect.top, topbarRect.top));
              if (topbarIntersect > 0) {
                coveredArea += canvasRect.width * topbarIntersect;
              }
            }

            // Sheet (pode estar em baixo, lateral ou hidden)
            if (sheet && sheet.style.display !== 'none') {
              const sheetRect = sheet.getBoundingClientRect();
              const intersectW = Math.max(0, Math.min(canvasRect.right, sheetRect.right) - Math.max(canvasRect.left, sheetRect.left));
              const intersectH = Math.max(0, Math.min(canvasRect.bottom, sheetRect.bottom) - Math.max(canvasRect.top, sheetRect.top));
              coveredArea += intersectW * intersectH;
            }

            // Inspector (painel direito, se visível)
            if (inspector && inspector.style.display !== 'none') {
              const inspectorRect = inspector.getBoundingClientRect();
              const intersectW = Math.max(0, Math.min(canvasRect.right, inspectorRect.right) - Math.max(canvasRect.left, inspectorRect.left));
              const intersectH = Math.max(0, Math.min(canvasRect.bottom, inspectorRect.bottom) - Math.max(canvasRect.top, inspectorRect.top));
              coveredArea += intersectW * intersectH;
            }

            // Left panel (painel esquerdo, se visível)
            if (leftPanel && leftPanel.style.display !== 'none') {
              const leftRect = leftPanel.getBoundingClientRect();
              const intersectW = Math.max(0, Math.min(canvasRect.right, leftRect.right) - Math.max(canvasRect.left, leftRect.left));
              const intersectH = Math.max(0, Math.min(canvasRect.bottom, leftRect.bottom) - Math.max(canvasRect.top, leftRect.top));
              coveredArea += intersectW * intersectH;
            }

            const canvasArea = canvasRect.width * canvasRect.height;
            const visibleCanvasArea = Math.max(0, canvasArea - coveredArea);
            const coverage = canvasArea > 0 ? visibleCanvasArea / viewportArea : 0;

            return {
              ok: coverage >= 0.55,
              coverage: Number.isFinite(coverage) ? coverage : 0,
              reason: (coverage >= 0.55) ? null : `coverage ${(coverage * 100).toFixed(1)}% < 55%`
            };
          });
          result.checks.b_coverage = coverageCheck.coverage;
          result.checks.b_ok = coverageCheck.ok;
          if (!coverageCheck.ok) {
            result.checks.b_reason = coverageCheck.reason;
          }

          // (c) Controles visíveis têm bounding rect dentro do viewport e ≥44×44px
          const controlsCheck = await frame.evaluate(() => {
            const selectors = ['#atlas-topbar button', '#atlas-toolbar button', '[data-action]'];
            const failures = [];
            const checked = [];

            // Função para detectar se um elemento é screen-reader only
            function isSrOnly(el) {
              const cs = window.getComputedStyle(el);
              // Verifica classes comuns
              if (el.classList.contains('sr-only') || el.classList.contains('visually-hidden')) {
                return true;
              }
              // Verifica clip-path
              if (cs.clipPath !== 'none') return true;
              // Verifica posição absoluta com tamanho ≤1px (common sr-only pattern)
              if (cs.position === 'absolute') {
                const rect = el.getBoundingClientRect();
                if (rect.width <= 1 && rect.height <= 1) return true;
              }
              return false;
            }

            for (const selector of selectors) {
              const els = document.querySelectorAll(selector);
              for (const el of els) {
                // Verifica se visível (display !== 'none', visibility !== 'hidden', etc)
                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;

                // Exclui elementos sr-only
                if (isSrOnly(el)) continue;

                const rect = el.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                // Exclui elementos com rect ≤2×2 (invisíveis ou praticamente invisíveis)
                if (rect.width <= 2 || rect.height <= 2) continue;

                // Verificações:
                // 1. Deve estar dentro do viewport (com 1px de tolerância)
                const insideViewport = rect.left >= -1 && rect.right <= vw + 1 && rect.top >= -1 && rect.bottom <= vh + 1;
                // 2. Deve ter >= 44×44 CSS px (com 1px de tolerância)
                const bigEnough = rect.width >= 43 && rect.height >= 43;

                checked.push({
                  selector: selector,
                  element: el.tagName,
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  left: Math.round(rect.left),
                  top: Math.round(rect.top),
                  right: Math.round(rect.right),
                  bottom: Math.round(rect.bottom)
                });

                if (!insideViewport || !bigEnough) {
                  failures.push({
                    selector,
                    element: el.tagName + (el.id ? '#' + el.id : ''),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    insideViewport,
                    bigEnough
                  });
                }
              }
            }

            return {
              ok: failures.length === 0,
              checked: checked.length,
              failures,
              reason: failures.length > 0 ? `${failures.length} controle(s) com problema` : null
            };
          });
          result.checks.c_controls = controlsCheck.ok;
          result.checks.c_checkedCount = controlsCheck.checked;
          if (!controlsCheck.ok) {
            result.checks.c_reason = controlsCheck.reason;
            result.checks.c_failures = controlsCheck.failures.slice(0, 3); // Primeiros 3
          }

          // (d) Zero erros de página (verificar bucket, que já está sendo preenchido)
          result.checks.d_noErrors = true; // Será verificado no final

          // Screenshot
          try {
            const basename = `${vp.w}x${vp.h}.png`;
            const fullPath = path.join(screenshotBase, basename);
            await page.screenshot({
              path: fullPath,
              type: 'png',
              scale: 'css'
            });
            result.screenshot = basename;
            result.screenshotPath = fullPath;
          } catch (e) {
            result.screenshot = `ERROR: ${e.message}`;
          }
        } finally {
          await context.close();
        }
      } catch (e) {
        result.error = e.message;
      }

      matrixResults.push(result);
    }

    // Relatório compacto em forma de tabela
    console.log('\n========= RESPONSIVE MATRIX RESULTS =========\n');
    console.log('Viewport      | (a) Scroll | (b) Cover% | (c) Ctrls | (d) Errors | Status');
    console.log('--------------|------------|------------|-----------|------------|--------');

    const failedViewports = [];
    for (const result of matrixResults) {
      const a = result.checks.a_noScroll ? 'PASS' : 'FAIL';
      const b = result.checks.b_coverage ? 'PASS' : 'FAIL';
      const c = result.checks.c_controls ? 'PASS' : 'FAIL';
      const d = result.checks.d_noErrors ? 'PASS' : 'FAIL';
      const status = (a === 'PASS' && b === 'PASS' && c === 'PASS' && d === 'PASS') ? '✓' : '✗';

      if (status === '✗') {
        failedViewports.push({
          viewport: result.viewport,
          failures: [a !== 'PASS' && 'scroll', b !== 'PASS' && 'coverage', c !== 'PASS' && 'controls', d !== 'PASS' && 'errors'].filter(Boolean)
        });
      }

      console.log(`${result.viewport.padEnd(13)}| ${a.padEnd(10)}| ${b.padEnd(10)}| ${c.padEnd(9)}| ${d.padEnd(10)}| ${status}`);
    }

    console.log('');

    // Assertions para matrix de viewports
    for (const result of matrixResults) {
      check(result.checks.a_noScroll, `${result.viewport}: sem rolagem horizontal`);
      check(result.checks.b_ok, `${result.viewport}: canvas visível ≥55% (${(result.checks.b_coverage * 100).toFixed(1)}%)`);
      check(result.checks.c_controls, `${result.viewport}: controles ≥44×44px e dentro do viewport (${result.checks.c_checkedCount || 0} verificados)`);
      check(result.checks.d_noErrors, `${result.viewport}: sem erros de página`);
    }

    if (failedViewports.length > 0) {
      console.log('Failed viewports:');
      for (const fw of failedViewports) {
        console.log(`  ${fw.viewport}: ${fw.failures.join(', ')}`);
      }
    } else {
      console.log('All viewports passed!');
    }

    check(bucket.violations.length === 0, `zero violações de CSP em todos os viewports${bucket.violations.length ? ': ' + bucket.violations.map((v) => `${v.directive} ${v.blocked}`).join(' | ') : ''}`);
    check(bucket.errors.length === 0, `zero erros de página em todos os viewports${bucket.errors.length ? ': ' + bucket.errors.join(' | ') : ''}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
};
