/**
 * atlas.e2e.js — modelo 3D real do Atlas de Anatomia (frontend/modulos/
 * anatomia-3d/models/body.glb, Z-Anatomy/CC BY-SA, comprimido com Draco).
 *
 * Antes deste arquivo o GLTFLoader do módulo não tinha DRACOLoader — o
 * corpo real (extensionsRequired: KHR_draco_mesh_compression) nunca
 * carregava, e a página ficava sempre no manequim procedural (esferas e
 * cilindros com nomes mesh_*_organ). Este cenário roda com o espelho do npm
 * (three@0.128.0 de verdade) e confere que:
 *   1. o GLB real carrega (826+ malhas com nomes anatômicos, não mesh_*);
 *   2. um toggle de sistema esconde/mostra as malhas certas (esqueleto ↔
 *      músculos, e agora também um sistema de órgão, ex.: cardiovascular);
 *   3. clicar/selecionar uma estrutura (óssea ou um órgão) mostra nome +
 *      descrição no HUD;
 *   4. a camada procedural de órgãos (buildOrganLayer em three-engine.js)
 *      posiciona vísceras/vasos plausíveis dentro do esqueleto real (ex.:
 *      coração entre esterno e coluna, encéfalo dentro do crânio);
 *   5. o quiz 3D mira órgãos de verdade (não só ossos/músculos) e o layout
 *      (sem rolagem horizontal) funciona mesmo enquanto o modelo real ainda
 *      está carregando/decodificando;
 *   6. zero violação de CSP e zero erro de JavaScript.
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

    // ---- Camada de órgãos: posições plausíveis a partir dos marcos ósseos reais ----
    // buildOrganLayer() (three-engine.js) não usa coordenadas fixas de um
    // manequim genérico — ela mede esterno/tórax/coluna/quadril/crânio do
    // próprio GLB e posiciona os órgãos a partir daí. Confere aqui que o
    // resultado é anatomicamente plausível, não só "existe".
    const organAnatomy = await frame.evaluate(() => {
      const L = window.ThreeEngine.getAnatomicalLandmarks();
      const heart = window.ThreeEngine.debugGetOrganWorldBox('*heart*');
      const brain = window.ThreeEngine.debugGetOrganWorldBox('*brain*');
      const liver = window.ThreeEngine.debugGetOrganWorldBox('*liver*');
      const stomach = window.ThreeEngine.debugGetOrganWorldBox('*stomach*');
      return { hasLandmarks: !!L, landmarks: L, heart, brain, liver, stomach };
    });
    check(organAnatomy.hasLandmarks, 'buildOrganLayer() encontrou os marcos ósseos (esterno, tórax, coluna, quadril, crânio) no GLB real');
    if (organAnatomy.hasLandmarks) {
      const L = organAnatomy.landmarks;
      const heartCenterZ = organAnatomy.heart && (organAnatomy.heart.min[2] + organAnatomy.heart.max[2]) / 2;
      check(!!organAnatomy.heart, 'o coração existe como malha 3D dentro do corpo real');
      check(!!organAnatomy.heart
        && organAnatomy.heart.min[1] >= L.thorax.minY - 0.01 && organAnatomy.heart.max[1] <= L.thorax.maxY + 0.01
        && heartCenterZ > L.spineThoracic.minZ && heartCenterZ < L.sternum.maxZ,
        `o coração está entre o esterno e a coluna, dentro da altura da caixa torácica (z=${heartCenterZ})`);
      check(!!organAnatomy.brain
        && organAnatomy.brain.min[0] >= L.skull.minX - 0.005 && organAnatomy.brain.max[0] <= L.skull.maxX + 0.005
        && organAnatomy.brain.min[1] >= L.skull.minY - 0.005 && organAnatomy.brain.max[1] <= L.skull.maxY + 0.005
        && organAnatomy.brain.min[2] >= L.skull.minZ - 0.005 && organAnatomy.brain.max[2] <= L.skull.maxZ + 0.005,
        'o encéfalo está inteiramente dentro dos limites do crânio');
      check(!!organAnatomy.liver && !!organAnatomy.stomach && organAnatomy.liver.min[0] > organAnatomy.stomach.max[0],
        'o fígado (direita) e o estômago (esquerda) ficam em lados opostos da linha média');
    }

    // ---- Toggle de sistema: esconde/mostra as malhas certas ----
    // esqueletico/muscular/articular têm malha real neste GLB; os demais
    // sistemas (cardiovascular, respiratório, digestório...) agora têm a
    // camada procedural de órgãos (buildOrganLayer) — ver three-engine.js.
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

    // ---- Toggle de um sistema de órgãos (camada procedural) ----
    // Fixa a camada em 3 (esqueleto) antes: com a camada corrente em 5, o
    // esqueleto (camada 3) já fica escondido pela própria dissecção, e o
    // isolamento por sistema não seria a causa observada.
    const cardioOnly = await frame.evaluate(() => {
      window.ThreeEngine.setDissectionDepth(3);
      window.AppController.selectSystem('cardiovascular');
      return window.ThreeEngine.getVisibilityStats();
    });
    check((cardioOnly.cardiovascular && cardioOnly.cardiovascular.visible > 0) && (!cardioOnly.esqueletico || cardioOnly.esqueletico.visible === 0),
      'selecionar o sistema "Cardiovascular" mostra o coração/vasos e esconde o esqueleto' + JSON.stringify(cardioOnly));
    // Some estruturas de volta e confere que reaparecem (o toggle não é destrutivo).
    const backToAll = await frame.evaluate(() => { window.ThreeEngine.resetOrganTree(); return window.ThreeEngine.getVisibilityStats(); });
    check(backToAll.cardiovascular && backToAll.cardiovascular.visible > 0 && backToAll.esqueletico && backToAll.esqueletico.visible > 0,
      'resetOrganTree() volta a mostrar esqueleto e órgãos depois do isolamento por sistema' + JSON.stringify(backToAll));

    // ---- Clique num órgão mostra nome + descrição do bio-database.js ----
    const organHud = await frame.evaluate(() => {
      const nome = window.ThreeEngine.debugSelectFirstOfSystem('cardiovascular');
      return { nome: nome, descricao: (document.querySelector('#organ-hud [style*="max-height"]') || {}).textContent || '' };
    });
    check(!!organHud.nome && /cora/i.test(organHud.nome), `selecionar o sistema cardiovascular seleciona o coração ("${organHud.nome}")`);
    check(organHud.descricao.trim().length > 20, `clicar no coração mostra a descrição clínica do bio-database.js no HUD ("${organHud.descricao.trim().slice(0, 60)}…")`);

    // ---- Camadas de dissecção (Pele/Músculos/Esqueleto/Vasos/Vísceras) ----
    const layerSkeleton = await frame.evaluate(() => { window.ThreeEngine.setDissectionDepth(3); return window.ThreeEngine.getVisibilityStats(); });
    check((layerSkeleton.muscular ? layerSkeleton.muscular.visible : 0) === 0 && (layerSkeleton.esqueletico ? layerSkeleton.esqueletico.visible : 0) > 0,
      'camada "Esqueleto" (3/5) oculta os músculos e mostra os ossos' + JSON.stringify(layerSkeleton));
    const layerMuscle = await frame.evaluate(() => { window.ThreeEngine.setDissectionDepth(2); return window.ThreeEngine.getVisibilityStats(); });
    check((layerMuscle.muscular ? layerMuscle.muscular.visible : 0) > 0,
      'camada "Músculos" (2/5) volta a mostrar os músculos' + JSON.stringify(layerMuscle));
    // Camadas "Vasos" (4/5) e "Vísceras" (5/5): agora com a camada procedural
    // de órgãos (buildOrganLayer), a 4 deixa a aorta/veia cava (camada 4 no
    // bio-database.js) opacas e o coração (camada 5, mais profundo) translúcido
    // — "escondido" nessa camada não é invisível, é visto por transparência,
    // igual ao esqueleto sob os músculos (ver setDissectionDepth).
    const layerVasos = await frame.evaluate(() => {
      window.ThreeEngine.setDissectionDepth(4);
      return { aorta: window.ThreeEngine.debugGetOrganOpacity('*aorta*'), heart: window.ThreeEngine.debugGetOrganOpacity('*heart*') };
    });
    check(layerVasos.aorta === 1, `camada "Vasos" (4/5) deixa a aorta opaca (opacidade ${layerVasos.aorta})`);
    check(layerVasos.heart !== null && layerVasos.heart < 1, `camada "Vasos" (4/5) deixa o coração translúcido, mais profundo que a camada corrente (opacidade ${layerVasos.heart})`);

    const layerViscera = await frame.evaluate(() => { window.ThreeEngine.setDissectionDepth(5); return window.ThreeEngine.getVisibilityStats(); });
    const totalVisivelViscera = Object.values(layerViscera).reduce((acc, s) => acc + s.visible, 0);
    check(totalVisivelViscera > 0, 'camada "Vísceras" (5/5) mostra o esqueleto e os órgãos procedurais' + JSON.stringify(layerViscera));
    check((layerViscera.cardiovascular ? layerViscera.cardiovascular.visible : 0) > 0,
      'camada "Vísceras" (5/5) mostra o coração (não só o esqueleto)' + JSON.stringify(layerViscera));
    const heartOpacityFull = await frame.evaluate(() => window.ThreeEngine.debugGetOrganOpacity('*heart*'));
    check(heartOpacityFull === 1, `camada "Vísceras" (5/5) deixa o coração totalmente opaco (opacidade ${heartOpacityFull})`);

    // ---- Quiz 3D mira um órgão de verdade (não só ossos/músculos) ----
    const quizOrgan = await frame.evaluate(() => {
      window.ThreeEngine.setDissectionDepth(5);
      window.QuizEngine.startQuiz();
      // "caso_organofosforado" (1º caso) mira o coração (targetKey "*heart*").
      window.QuizEngine.evaluateUserAnswer('mesh_heart_organ');
      const fb = document.getElementById('quizFeedbackBox');
      const result = { texto: (fb && fb.textContent) || '', score: window.QuizEngine.getCurrentScore() };
      window.QuizEngine.stopQuiz();
      return result;
    });
    check(/acerto/i.test(quizOrgan.texto) && quizOrgan.score > 0, `o quiz reconhece um acerto ao apontar o coração real (score ${quizOrgan.score}, "${quizOrgan.texto.slice(0, 40)}…")`);

    // ---- CSP e erros de JavaScript ----
    check(violations.length === 0, 'atlas: nenhuma violação de CSP (Draco/WASM roda só com \'wasm-unsafe-eval\')' + (violations.length ? ': ' + violations.map((v) => `${v.directive} ${v.blocked}`).join(' | ') : ''));
    check(app.errors.length === 0, 'atlas: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
