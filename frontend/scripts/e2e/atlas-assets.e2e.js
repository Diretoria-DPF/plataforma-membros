/**
 * atlas-assets.e2e.js — js/engine/{assets,registry,fallback}.js (WP05)
 * ---------------------------------------------------------------------------
 * Roda contra dev/assets-harness.html (não a casca do módulo — WP08/main.js
 * ainda não ligam tudo nesta onda). Confere, na ordem do relatório do WP05:
 *   1. carregar um sistema sob demanda baixa só o .lod1.glb daquele sistema;
 *   2. o Registry mapeia todo nó das fixtures para um sid de index.json;
 *   3. pick() no centro projetado de uma estrutura devolve o sid certo;
 *   4. setVisible/setOpacity funcionam;
 *   5. um sistema sem asset no manifesto fica indisponível, emite
 *      system:load:error e não gera erro de página;
 *   6. a reserva (fallback.js) carrega models/body.glb quando chamada;
 *   7. o sistema reprodutor troca de variante por sexo;
 *   8. zero violação de CSP.
 */
const path = require('path');
const fs = require('fs');
const { startApp, check } = require('./harness');

const MODULE_PATH = 'modulos/anatomia-3d';

module.exports = async function atlasAssets() {
  const app = await startApp({ role: 'member' });
  const violations = [];
  await app.context.exposeBinding('__e2eCspReport', (source, v) => violations.push(v));
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try {
        window.__e2eCspReport({ directive: e.effectiveDirective, blocked: e.blockedURI });
      } catch (err) { /* binding indisponível neste documento */ }
    });
  });

  const glbRequests = [];
  app.page.on('request', (req) => {
    const url = req.url();
    if (/\.glb($|\?)/.test(url)) glbRequests.push(url);
  });

  try {
    await app.page.goto(`${app.baseUrl}${MODULE_PATH}/dev/assets-harness.html`);
    await app.page.waitForFunction(() => !!window.__assetsHarness, null, { timeout: 15000 });
    // Espera o carregamento inicial (esqueletico+muscular, lod1 por padrão)
    // terminar antes de zerar o contador de requests do teste #1.
    await app.page.waitForFunction(() => {
      const h = window.__assetsHarness;
      return h.assetLoader.isLoaded('esqueletico') && h.assetLoader.isLoaded('muscular');
    }, null, { timeout: 15000 });

    // ------------------------------------------------------------------
    // 1) Carregar um sistema ainda não carregado baixa só o .lod1.glb dele
    // ------------------------------------------------------------------
    glbRequests.length = 0;
    await app.page.evaluate(() => window.__assetsHarness.assetLoader.loadSystem('nervoso'));
    const nervosoGlbs = glbRequests.filter((u) => u.includes('/models/'));
    check(
      nervosoGlbs.length === 1 && nervosoGlbs[0].endsWith('nervoso.lod1.glb'),
      `carregar "nervoso" sob demanda baixa só nervoso.lod1.glb (baixados: ${JSON.stringify(nervosoGlbs)})`
    );

    // ------------------------------------------------------------------
    // 3) pick() no centro projetado de uma estrutura devolve o sid certo
    // ------------------------------------------------------------------
    // Roda AQUI (só esqueletico+muscular carregados) de propósito: o
    // teste #1 já carregou "nervoso", e "za:cerebelo" (dentro do crânio,
    // ver data/atlas/fixtures/manifest.json) fica mais perto da câmera —
    // ganharia o raycast por oclusão, não por um bug de pick(). Descarrega
    // de novo aqui (o teste #2 recarrega "nervoso" já em seguida).
    await app.page.evaluate(() => window.__assetsHarness.assetLoader.unloadSystem('nervoso'));
    const pickResult = await app.page.evaluate(() => {
      const h = window.__assetsHarness;
      const ndc = h.projectSidToNDC('za:cranio');
      if (!ndc) return { ndc: null, sid: null };
      return { ndc, sid: h.registry.pick(ndc, h.engine.camera) };
    });
    check(!!pickResult.ndc, 'projectSidToNDC("za:cranio") devolve coordenadas de tela (a estrutura tem bbox)');
    check(pickResult.sid === 'za:cranio', `pick() no centro projetado do crânio devolve seu próprio sid (veio "${pickResult.sid}")`);

    // ------------------------------------------------------------------
    // 2) Registry mapeia todo nó das fixtures para um sid de index.json
    // ------------------------------------------------------------------
    const indexJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'modulos', 'anatomia-3d', 'data', 'atlas', 'fixtures', 'index.json'), 'utf8')
    );
    await app.page.evaluate(async () => {
      const h = window.__assetsHarness;
      await Promise.all(h.SYSTEM_IDS.filter((s) => s !== 'articular').map((s) => h.assetLoader.loadSystem(s)));
      await h.assetLoader.loadOrganDetail('fma:7088', { sex: 'M' });
    });
    // "reprodutor" só tem UMA variante registrada por vez (registerSystem
    // troca a anterior pela nova — mesmo comportamento do corpo real: um
    // sexo por vez, ver docs/ATLAS_UX_SPEC.md "Trocar sexo"). O sexo
    // carregado por último acima é 'M' (store.sex inicial, ver store.js) —
    // os sids exclusivos de 'F' ficam de fora desta checagem geral e são
    // cobertos à parte no teste #7 (troca de sexo).
    const femaleOnlySids = new Set(['za:ovario-direito', 'za:ovario-esquerdo', 'za:tuba-uterina-direita', 'za:tuba-uterina-esquerda', 'za:utero', 'za:vagina']);
    const expectedSids = indexJson.map((e) => e.sid).filter((sid) => !femaleOnlySids.has(sid));
    const missing = await app.page.evaluate((sids) => {
      const h = window.__assetsHarness;
      return sids.filter((sid) => !h.registry.getBySid(sid));
    }, expectedSids);
    check(missing.length === 0, `todo sid de index.json (variante masculina do reprodutor) está no Registry depois de carregar os sistemas (faltaram: ${JSON.stringify(missing)})`);

    // ------------------------------------------------------------------
    // 4) setVisible / setOpacity
    // ------------------------------------------------------------------
    const visOpacity = await app.page.evaluate(() => {
      const h = window.__assetsHarness;
      h.registry.setVisible('za:cranio', false);
      const afterHide = h.registry.getBySid('za:cranio').visible;
      h.registry.setVisible('za:cranio', true);
      const afterShow = h.registry.getBySid('za:cranio').visible;
      h.registry.setOpacity('za:cranio', 0.3);
      const afterOpacity = h.registry.getBySid('za:cranio').opacity;
      return { afterHide, afterShow, afterOpacity };
    });
    check(visOpacity.afterHide === false && visOpacity.afterShow === true, `setVisible alterna a visibilidade (${JSON.stringify(visOpacity)})`);
    check(Math.abs(visOpacity.afterOpacity - 0.3) < 1e-6, `setOpacity aplica o valor pedido (${visOpacity.afterOpacity})`);

    // ------------------------------------------------------------------
    // 5) Sistema sem asset no manifesto (fixtures não têm "articular")
    // ------------------------------------------------------------------
    const errorEvent = await app.page.evaluate(() => new Promise((resolve) => {
      const h = window.__assetsHarness;
      const off = h.bus.on(h.bus.EVENTS.SYSTEM_LOAD_ERROR, (payload) => {
        if (payload.system === 'articular') { off(); resolve(payload); }
      });
      h.assetLoader.loadSystem('articular');
    }));
    check(!!errorEvent, 'carregar "articular" (sem asset no manifesto de fixtures) emite system:load:error');
    const unavailableAfterError = await app.page.evaluate(() => window.__assetsHarness.store.get().unavailableSystems.includes('articular'));
    check(unavailableAfterError, 'store.unavailableSystems passa a incluir "articular"');

    // ------------------------------------------------------------------
    // 6) Reserva (fallback.js) carrega body.glb
    // ------------------------------------------------------------------
    const fallbackResult = await app.page.evaluate(async () => {
      const h = window.__assetsHarness;
      const ok = await h.fallback.activate();
      const skeleton = h.registry.getBySystem('esqueletico');
      const muscles = h.registry.getBySystem('muscular');
      const heart = h.registry.getBySid('za:coracao');
      return { ok, skeletonCount: skeleton.length, muscleCount: muscles.length, heartEsquematico: heart && heart.esquematico };
    });
    check(fallbackResult.ok, 'fallback.activate() resolve com sucesso (body.glb carregou)');
    check(fallbackResult.skeletonCount > 50, `a reserva registra dezenas de ossos reais do body.glb (${fallbackResult.skeletonCount})`);
    check(fallbackResult.muscleCount > 50, `a reserva registra dezenas de músculos reais do body.glb (${fallbackResult.muscleCount})`);
    check(fallbackResult.heartEsquematico === true, 'o coração procedural da reserva está marcado esquematico:true');

    // ------------------------------------------------------------------
    // 7) Sistema reprodutor troca de variante por sexo
    // ------------------------------------------------------------------
    const sexSwitch = await app.page.evaluate(async () => {
      const h = window.__assetsHarness;
      h.assetLoader.unloadSystem('reprodutor');
      await h.assetLoader.loadSystem('reprodutor', { sex: 'F' });
      const femaleOnly = { ovario: !!h.registry.getBySid('za:ovario-direito'), testiculo: !!h.registry.getBySid('za:testiculo-direito') };
      h.assetLoader.unloadSystem('reprodutor');
      await h.assetLoader.loadSystem('reprodutor', { sex: 'M' });
      const maleOnly = { ovario: !!h.registry.getBySid('za:ovario-direito'), testiculo: !!h.registry.getBySid('za:testiculo-direito') };
      return { femaleOnly, maleOnly };
    });
    check(sexSwitch.femaleOnly.ovario === true && sexSwitch.femaleOnly.testiculo === false, `sexo F carrega ovário (não testículo): ${JSON.stringify(sexSwitch.femaleOnly)}`);
    check(sexSwitch.maleOnly.testiculo === true && sexSwitch.maleOnly.ovario === false, `sexo M carrega testículo (não ovário): ${JSON.stringify(sexSwitch.maleOnly)}`);

    // ------------------------------------------------------------------
    // 8) CSP e erros de página
    // ------------------------------------------------------------------
    check(violations.length === 0, 'atlas-assets: nenhuma violação de CSP' + (violations.length ? ': ' + violations.map((v) => `${v.directive} ${v.blocked}`).join(' | ') : ''));
    check(app.errors.length === 0, 'atlas-assets: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
