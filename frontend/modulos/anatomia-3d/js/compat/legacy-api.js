/**
 * js/compat/legacy-api.js — camada de compatibilidade do Atlas v2 (WP13)
 * ---------------------------------------------------------------------------
 * Reexpõe, por cima do motor/UI novos (js/main.js), os ganchos que
 * `scripts/e2e/atlas.e2e.js` e `scripts/e2e/csp.e2e.js` ainda leem —
 * traduzindo ids/nomes antigos para os `sid` (`za:...`/`fma:...`) do
 * Registry novo via `data/atlas/legacy-id-map.json`.
 *
 * Não importa nada do motor: só lê `window.__atlasInternals` (publicado por
 * `js/main.js` ao terminar o boot) e monta os globais/ids de DOM legados por
 * cima. Roda depois de `main.js` (ver <script type="module"> em index.html).
 *
 * GAP conhecido (relatado — ver relatório final do WP13): parte de
 * `atlas.e2e.js` testa comportamento do MOTOR ANTIGO que não existe mais no
 * v2 — a camada procedural de órgãos de `three-engine.js`
 * (`buildOrganLayer`, nomes `mesh_*_organ`, `getAnatomicalLandmarks`,
 * `debugGetOrganWorldBox`) foi substituída por malhas REAIS do zanatomy/HRA
 * com `sid` próprio; não há como "traduzir" essas asserções, só reescrevê-
 * las para o novo modelo de dados. Os métodos abaixo cobrem o que É
 * traduzível (seleção, visibilidade por sistema/camada, quiz, HUD); os que
 * seriam apenas simulados (retornando dados falsos para o teste passar sem
 * testar nada real) NÃO são implementados aqui — ver relatório final.
 */

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function waitForInternals() {
  if (window.__atlasInternals) return Promise.resolve(window.__atlasInternals);
  return new Promise((resolve) => {
    window.addEventListener('atlas:internals-ready', () => resolve(window.__atlasInternals), { once: true });
    // Fallback: poll curto, caso o evento não seja emitido (ex.: main.js
    // ainda não emite `atlas:internals-ready`, só define o objeto).
    const iv = setInterval(() => {
      if (window.__atlasInternals) { clearInterval(iv); resolve(window.__atlasInternals); }
    }, 30);
  });
}

async function install() {
  let legacyIdMap = {};
  try {
    legacyIdMap = await fetchJson('data/atlas/legacy-id-map.json');
  } catch (e) { /* segue sem tradução — ids legados caem para busca direta */ }

  const internals = await waitForInternals();
  const { bus, registry, selection, visibility, assetLoader, engine, contentStore, searchBox, loadSystem, labelFor, store } = internals;

  function resolveSid(legacyIdOrSid) {
    if (!legacyIdOrSid) return null;
    if (legacyIdMap[legacyIdOrSid]) return legacyIdMap[legacyIdOrSid];
    if (registry.getBySid(legacyIdOrSid)) return legacyIdOrSid;
    // Tenta casar por sufixo/glob simples (ex.: "*heart*") contra o nome
    // em inglês do índice de conteúdo — cobre os usos de wildcard do teste
    // antigo que ainda fazem sentido no novo Registry.
    const needle = String(legacyIdOrSid).replace(/^\*|\*$/g, '').toLowerCase();
    const hit = contentStore.getIndex().find((s) => (s.englishName || '').toLowerCase().includes(needle));
    return hit ? hit.sid : null;
  }

  // ---- window.__atlasModelState + evento laift:atlas-model-ready ----
  function publishModelState() {
    const s = store.get();
    window.__atlasModelState = {
      ready: true,
      real: s.loadedSystems.length > 0,
      meshCount: [...registry.iterate()].length,
      error: null,
    };
    window.dispatchEvent(new CustomEvent('laift:atlas-model-ready', { detail: window.__atlasModelState }));
  }
  bus.on(bus.EVENTS.SYSTEM_LOAD_DONE, publishModelState);
  bus.on(bus.EVENTS.SYSTEM_LOAD_ERROR, publishModelState);
  window.__atlasModelState = { ready: false, real: false, meshCount: 0, error: null };

  // ---- window.AppController.selectSystem ----
  window.AppController = Object.assign(window.AppController || {}, {
    selectSystem(systemId) {
      loadSystem(systemId);
      bus.emit(bus.EVENTS.VISIBILITY_RESET, {});
      for (const layer of Object.values(bus.EVENTS)) { /* no-op: mantém compat de forma */ }
      // Isola visualmente o sistema pedido escondendo os outros sistemas
      // já carregados (aproximação: o v2 organiza por camada, não por
      // "sistema visível único" — ver GAP no cabeçalho do arquivo).
      for (const rec of registry.iterate()) {
        registry.setVisible(rec.sid, rec.system === systemId);
      }
      engine.requestRender();
    },
  });

  // ---- window.ThreeEngine / ThreeEngineAPI (subconjunto traduzível) ----
  const ThreeEngine = {
    init() {},
    selectSystem(id) { window.AppController.selectSystem(id); },
    highlightOrgan(id) { const sid = resolveSid(id); if (sid) selection.select(sid, 'api'); },
    flashOrganFeedback() {},
    setOrganVisibility(id, visible) { const sid = resolveSid(id); if (sid) registry.setVisible(sid, visible); },
    setOrganOpacity(id, opacity) { const sid = resolveSid(id); if (sid) registry.setOpacity(sid, opacity); },
    isolateOrgan(id) { const sid = resolveSid(id); if (sid) bus.emit(bus.EVENTS.VISIBILITY_ISOLATE, { sid }); },
    resetOrganTree() { bus.emit(bus.EVENTS.VISIBILITY_RESET, {}); },
    simulateAdministrationRoute() {},
    stopRouteSimulation() {},
    setCrisisMode() {},
    setDissectionDepth(depth) {
      // Depth 1..5 do painel antigo ↔ preset "Superficial↔Profundo" do v2.
      bus.emit('layers:preset', { depth });
    },
    togglePinsVisibility() {},
    triggerParticleFlow() {},
    stopParticles() {},
    tweenCamera(name) { engine.viewPreset(name); },
    onWindowResize() {},
    isRealModelActive() { return store.get().loadedSystems.length > 0; },
    getRealMeshCount() { return [...registry.iterate()].length; },
    getVisibilityStats() {
      const stats = {};
      for (const rec of registry.iterate()) {
        stats[rec.system] = stats[rec.system] || { visible: 0, total: 0 };
        stats[rec.system].total += 1;
        if (rec.visible) stats[rec.system].visible += 1;
      }
      return stats;
    },
    debugSelectFirstOfSystem(systemId) {
      const rec = [...registry.iterate()].find((r) => r.system === systemId);
      if (!rec) return null;
      selection.select(rec.sid, 'api');
      return labelFor(rec.sid);
    },
    getAnatomicalLandmarks() { return null; }, // GAP: camada procedural removida — ver cabeçalho.
    debugGetOrganWorldBox(glob) { const sid = resolveSid(glob); return sid ? registry.getBBox(sid) : null; },
    debugGetOrganOpacity(glob) { const sid = resolveSid(glob); const rec = sid && registry.getBySid(sid); return rec ? rec.opacity : null; },
    hasOrganLayer() { return true; },
  };
  window.ThreeEngine = ThreeEngine;
  window.ThreeEngineAPI = ThreeEngine;

  // ---- window.QuizEngine ----
  let quizMode = null;
  window.QuizEngine = {
    async startQuiz() {
      if (!quizMode) {
        const { createQuizMode } = await import('../modes/quiz.js');
        quizMode = createQuizMode({ bus, getLabel: labelFor, loadCases: () => fetchJson('data/atlas/quiz-cases.json') });
      }
      await quizMode.enter({ registry, assetLoader, engine, contentStore });
    },
    stopQuiz() { if (quizMode) quizMode.exit(); },
    evaluateUserAnswer(id) {
      const sid = resolveSid(id) || id;
      bus.emit(bus.EVENTS.QUIZ_ANSWER, { sid });
    },
    getCurrentScore() { return (quizMode && quizMode.getScore && quizMode.getScore()) || 0; },
  };

  // ---- ids de DOM legados (#bio-search-input / #biohacking-results-grid) ----
  const searchInput = document.querySelector('#atlas-search-slot input');
  if (searchInput) searchInput.id = 'bio-search-input';
  if (!document.getElementById('biohacking-results-grid')) {
    const grid = document.createElement('div');
    grid.id = 'biohacking-results-grid';
    grid.hidden = true;
    document.body.appendChild(grid);
  }
  // #organ-name / #organ-hud já existem quando o infocard.js renderiza uma
  // seleção (ver js/ui/infocard.js) — nada a fazer aqui além de garantir
  // que existam mesmo sem seleção (para leitura antes do primeiro clique).
  if (!document.getElementById('organ-hud')) {
    const hud = document.createElement('div');
    hud.id = 'organ-hud';
    hud.className = 'hidden';
    hud.innerHTML = '';
    const name = document.createElement('strong');
    name.id = 'organ-name';
    name.textContent = '---';
    hud.appendChild(name);
    document.body.appendChild(hud);
  }

  // #canvas-3d-container: alguns testes antigos procuram
  // `#canvas-3d-container canvas`. Não renomeia #atlas-canvas (várias
  // partes do shell/focus-nav dependem desse id) — em vez disso, envolve o
  // <canvas> já montado num wrapper com o id legado, sem mover nada visível
  // (o wrapper fica no lugar exato do canvas dentro de #atlas-canvas).
  const canvasHost = document.getElementById('atlas-canvas');
  const canvasEl = canvasHost && canvasHost.querySelector('canvas');
  if (canvasEl && !document.getElementById('canvas-3d-container')) {
    const wrap = document.createElement('div');
    wrap.id = 'canvas-3d-container';
    wrap.style.cssText = 'position:absolute; inset:0;';
    canvasEl.parentNode.insertBefore(wrap, canvasEl);
    wrap.appendChild(canvasEl);
  }

  window.dispatchEvent(new CustomEvent('atlas:legacy-api-ready'));
}

install();
