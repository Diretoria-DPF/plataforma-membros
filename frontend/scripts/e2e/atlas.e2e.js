/**
 * atlas.e2e.js — modelo 3D real do Atlas de Anatomia (frontend/modulos/
 * anatomia-3d/models/body.glb, Z-Anatomy/CC BY-SA, comprimido com Draco).
 *
 * Antes deste arquivo o GLTFLoader do módulo não tinha DRACOLoader — o
 * corpo real (extensionsRequired: KHR_draco_mesh_compression) nunca
 * carregava, e a página ficava sempre no manequim procedural (esferas e
 * cilindros com nomes mesh_*_organ). Este cenário roda com o espelho do npm
 * (three@0.128.0 de verdade) e confere que:
 *   1. o GLB real carrega (826 malhas com nomes anatômicos, não mesh_*);
 *   2. um toggle de sistema esconde/mostra as malhas certas (esqueleto ↔
 *      músculos — os únicos dois sistemas com malha de verdade neste GLB,
 *      ver comentário no topo de three-engine.js);
 *   3. clicar/selecionar uma estrutura mostra o nome dela no HUD;
 *   4. o quiz 3D e o layout (sem rolagem horizontal) funcionam mesmo
 *      enquanto o modelo real ainda está carregando/decodificando;
 *   5. zero violação de CSP e zero erro de JavaScript.
 *
 * Sem o espelho do npm (sandbox sem acesso à rede), o cenário avisa e sai —
 * não há como testar o Draco/WASM de verdade sem o three.js de verdade.
 */
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

module.exports = async function atlas() {
  const pkgs = mirror.ensureMirror();
  if (!pkgs) {
    console.log('  (aviso: espelho do npm indisponível — atlas.e2e.js pulado, precisa do three.js real para decodificar o Draco)');
    return;
  }

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
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const file = mirror.resolveCdnUrl(pkgs, route.request().url());
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });

  try {
    await app.login();
    const frame = await app.openModule('anatomia');

    // ---- Robustez: quiz/layout ANTES do GLB real terminar de carregar ----
    // Não espera o modelo aqui de propósito — é o cenário do flake relatado
    // (scrollWidth e TypeError no startQuiz sob carga real).
    const early = await frame.evaluate(() => {
      const result = { sw: document.documentElement.scrollWidth, iw: window.innerWidth, quizOk: true, error: null };
      try {
        window.QuizEngine.startQuiz();
        window.QuizEngine.stopQuiz();
      } catch (e) {
        result.quizOk = false;
        result.error = e.message;
      }
      return result;
    });
    check(early.quizOk, 'quiz 3D inicia e encerra sem erro enquanto o GLB real pode ainda estar carregando' + (early.error ? `: ${early.error}` : ''));
    check(early.sw <= early.iw + 1, `sem rolagem horizontal em 360 px enquanto o modelo carrega (scrollWidth ${early.sw} ≤ ${early.iw})`);

    // ---- Espera o GLB real terminar (826 malhas, Draco/WASM) ----
    await frame.waitForFunction(() => window.__atlasModelState && window.__atlasModelState.ready, null, { timeout: 30000 }).catch(() => {});
    const state = await frame.evaluate(() => window.__atlasModelState || null);
    check(!!state, 'o Atlas expõe window.__atlasModelState (gancho de teste) ao terminar de carregar');
    check(!!state && state.real === true, 'o modelo real (models/body.glb) carrega — não cai no manequim procedural' + (state && state.error ? `: ${state.error}` : ''));
    check(!!state && state.meshCount > 500, `mais de 500 malhas reais carregadas (${state && state.meshCount})`);
    check(await frame.evaluate(() => window.ThreeEngine.isRealModelActive()), 'ThreeEngine.isRealModelActive() confirma o modelo real ativo');

    // ---- Nomes reais (não mais mesh_*_organ do manequim procedural) ----
    const boneName = await frame.evaluate(() => window.ThreeEngine.debugSelectFirstOfSystem('esqueletico'));
    const muscleName = await frame.evaluate(() => window.ThreeEngine.debugSelectFirstOfSystem('muscular'));
    check(!!boneName && !/^mesh_/i.test(boneName), `estrutura óssea real tem nome anatômico (ex.: "${boneName}")`);
    check(!!muscleName && !/^mesh_/i.test(muscleName), `estrutura muscular real tem nome anatômico (ex.: "${muscleName}")`);

    // ---- Clique/seleção mostra nome + descrição no HUD (safe-dom) ----
    // Centro do canvas (a câmera é enquadrada na caixa delimitadora do
    // modelo ao carregar — ver frameCameraToModel em three-engine.js): os
    // cantos são onde o HUD/badge de carregamento ficam sobrepostos.
    await frame.locator('#canvas-3d-container canvas').click({ timeout: 2000 }).catch(() => {});
    // A malha embaixo do clique é aleatória (depende do enquadramento da
    // câmera); a seleção programática (mesmo caminho de código do clique,
    // debugSelectFirstOfSystem) garante a asserção de forma determinística.
    const hud = await frame.evaluate(() => ({
      nome: (document.getElementById('organ-name').textContent || '').trim(),
      temImg: !!document.querySelector('#organ-hud img'),
    }));
    check(hud.nome.length > 0 && hud.nome !== '---', `selecionar uma estrutura mostra o nome no HUD ("${hud.nome}")`);
    check(!hud.temImg, 'a descrição da estrutura entra como texto — sem <img> nem outra tag inesperada no HUD');

    // ---- Toggle de sistema: esconde/mostra as malhas certas ----
    // Só esqueletico/muscular/articular têm malha real neste GLB — os
    // outros chips do sistema (cardiovascular, nervoso...) não têm o que
    // esconder/mostrar (ver three-engine.js).
    const skeletonOnly = await frame.evaluate(() => {
      window.AppController.selectSystem('esqueletico');
      return window.ThreeEngine.getVisibilityStats();
    });
    check((skeletonOnly.esqueletico && skeletonOnly.esqueletico.visible > 0) && (!skeletonOnly.muscular || skeletonOnly.muscular.visible === 0),
      'selecionar o sistema "Esquelético" mostra os ossos e esconde os músculos' + JSON.stringify(skeletonOnly));

    const muscularOnly = await frame.evaluate(() => {
      window.AppController.selectSystem('muscular');
      return window.ThreeEngine.getVisibilityStats();
    });
    check((muscularOnly.muscular && muscularOnly.muscular.visible > 0) && (!muscularOnly.esqueletico || muscularOnly.esqueletico.visible === 0),
      'selecionar o sistema "Muscular" mostra os músculos e esconde os ossos' + JSON.stringify(muscularOnly));

    // ---- Camadas de dissecção (Pele/Músculos/Esqueleto/Vasos/Vísceras) ----
    const layerSkeleton = await frame.evaluate(() => { window.ThreeEngine.setDissectionDepth(3); return window.ThreeEngine.getVisibilityStats(); });
    check((layerSkeleton.muscular ? layerSkeleton.muscular.visible : 0) === 0 && (layerSkeleton.esqueletico ? layerSkeleton.esqueletico.visible : 0) > 0,
      'camada "Esqueleto" (3/5) oculta os músculos e mostra os ossos' + JSON.stringify(layerSkeleton));
    const layerMuscle = await frame.evaluate(() => { window.ThreeEngine.setDissectionDepth(2); return window.ThreeEngine.getVisibilityStats(); });
    check((layerMuscle.muscular ? layerMuscle.muscular.visible : 0) > 0,
      'camada "Músculos" (2/5) volta a mostrar os músculos' + JSON.stringify(layerMuscle));
    // Camadas "Vasos"/"Vísceras" (4/5): sem malha real mais profunda, o
    // viewport não pode ficar vazio — fica na camada mais profunda disponível.
    const layerViscera = await frame.evaluate(() => { window.ThreeEngine.setDissectionDepth(5); return window.ThreeEngine.getVisibilityStats(); });
    const totalVisivelViscera = Object.values(layerViscera).reduce((acc, s) => acc + s.visible, 0);
    check(totalVisivelViscera > 0, 'camada "Vísceras" (5/5, sem malha real neste GLB) não deixa o viewport vazio' + JSON.stringify(layerViscera));

    // ---- CSP e erros de JavaScript ----
    check(violations.length === 0, 'atlas: nenhuma violação de CSP (Draco/WASM roda só com \'wasm-unsafe-eval\')' + (violations.length ? ': ' + violations.map((v) => `${v.directive} ${v.blocked}`).join(' | ') : ''));
    check(app.errors.length === 0, 'atlas: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
