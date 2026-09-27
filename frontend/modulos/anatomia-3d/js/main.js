/**
 * js/main.js — orquestrador do Atlas v2 (Onda 2, WP13)
 * ---------------------------------------------------------------------------
 * Único ponto que conhece TODOS os pacotes (core, engine, ui, modes) e os
 * liga na casca estática de index.html (ex-v2.html — ver WP13). Nenhum
 * pacote individual importa outro fora do que os próprios contratos
 * (js/core/contracts.js) preveem; a fiação entre eles mora só aqui.
 *
 * `?fixtures=1` troca `models/manifest.json`/`data/atlas/generated/
 * structures.json` pelas fixtures pequenas em `data/atlas/fixtures/` (usado
 * pelos cenários de e2e que não precisam do corpo real).
 */
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/controls/OrbitControls.js';
import { on, off, emit, EVENTS } from './core/bus.js';
import { get as storeGet, set as storeSet, subscribe as storeSubscribe } from './core/store.js';
import { LAYERS, SYSTEMS, MODES, DEFAULT_MODE } from './core/contracts.js';

import { createRenderer } from './engine/renderer.js';
import { createCameraRig } from './engine/camera-rig.js';
import { createControls, toNdc } from './engine/controls.js';
import { createAssetLoader } from './engine/assets.js';
import { createRegistry } from './engine/registry.js';
import { createVisibility } from './engine/visibility.js';
import { createSelection } from './engine/selection.js';
import { createXrayClip } from './engine/xray-clip.js';
import { createLabels } from './engine/labels.js';
import { createFallback } from './engine/fallback.js';

import { getSlot, registerPanel, initShell } from './ui/shell.js';
import { initSheet, setContent as setSheetContent } from './ui/sheet.js';
import { initFocusNav } from './ui/focus-nav.js';
import { buildSearchIndex, search } from './ui/search-index.js';
import { createSearchBox } from './ui/search-box.js';
import { createNavigator } from './ui/navigator.js';
import { createInfoCard } from './ui/infocard.js';
import { createLayersPanel } from './ui/layers-panel.js';
import { linkLegacy } from './ui/legacy-link.js';

const params = new URLSearchParams(location.search);
const USE_FIXTURES = params.get('fixtures') === '1';
// Caminhos relativos à URL da página (index.html na raiz do módulo) — não
// ao arquivo js/main.js. `data/atlas/` já mora dentro deste módulo.
//
// `models/manifest.json` real: `asset.file` já vem com o prefixo
// "models/..." (relativo à raiz do módulo) — então o `baseUrl` do
// AssetLoader (que é prefixado a `asset.file`) tem que ser '' aqui; só a
// URL do próprio manifest.json é passada explicitamente a `loadManifest`.
// `data/atlas/fixtures/manifest.json`: `asset.file` já vem relativo à
// PRÓPRIA pasta de fixtures ("models/..."), então ali `baseUrl` é o
// caminho da pasta de fixtures mesmo (join dá "data/atlas/fixtures/models/...").
const MODELS_BASE = USE_FIXTURES ? 'data/atlas/fixtures/' : './';
const MANIFEST_URL = USE_FIXTURES ? undefined : 'models/manifest.json';
const CONTENT_BASE = USE_FIXTURES ? 'data/atlas/fixtures/' : 'data/atlas/';

// Sistemas carregados no primeiro load (≤5MB combinados) — ver plano §4.
const DEFAULT_SYSTEMS = Object.freeze(['esqueletico', 'muscular']);

// ============================================================================
// 1. Conteúdo (structures.json + legado PT) — ContentStore
// ============================================================================
async function createContentStore() {
  const [structures, legacyIndex] = await Promise.all([
    fetchJson(`${CONTENT_BASE}generated/structures.json`).catch(() => []),
    fetchJson(`${CONTENT_BASE}legacy/index.legacy.json`).catch(() => []),
  ]);

  const bySid = new Map();
  for (const s of structures) bySid.set(s.sid, s);

  // Link real structures to legacy content by name matching
  const realToLegacySid = linkLegacy(structures, legacyIndex);

  // Índice de nomes legados PT por sid (quando o mesmo sid existe nos dois
  // lados) — usado pela busca para preferir o nome em português.
  const legacyNameBySid = new Map();
  const legacyBySid = new Map();
  for (const entry of legacyIndex) {
    legacyBySid.set(entry.sid, entry);
    if (entry.names && entry.names.pt) legacyNameBySid.set(entry.sid, entry.names.pt);
  }

  // Also index legacy PT names by real structure sid (via name linking)
  for (const [realSid, legacySid] of realToLegacySid) {
    const legacyEntry = legacyBySid.get(legacySid);
    if (legacyEntry && legacyEntry.names && legacyEntry.names.pt) {
      legacyNameBySid.set(realSid, legacyEntry.names.pt);
    }
  }

  const contentCache = new Map();
  const contentFilePromises = new Map();

  function loadContentFile(system) {
    if (!contentFilePromises.has(system)) {
      contentFilePromises.set(system, fetchJson(`${CONTENT_BASE}legacy/content/${system}.json`).catch(() => ({})));
    }
    return contentFilePromises.get(system);
  }

  // Mantém todos os campos de structures.json (system, layer, englishName,
  // parentCollection, bbox, source...) e ACRESCENTA `names` — search-box.js/
  // navigator.js exigem entry.names.{pt,en,la} (ver buildSearchIndex), e
  // main.js/legacy-api.js já liam s.englishName/s.layer direto do índice.
  // Bug real encontrado ao verificar a busca com dados reais (não fixtures):
  // getIndex() devolvia `structures` cru (sem `.names`), então
  // buildSearchIndex(getIndex()) nunca indexava nada — toda busca (inclusive
  // "heart"/"coração") vinha vazia.
  const entries = structures.map((s) => ({
    ...s,
    names: {
      pt: legacyNameBySid.get(s.sid) || '',
      en: s.englishName || '',
      la: s.latinName || '',
    },
  }));
  const searchIndex = buildSearchIndex(entries);

  return {
    getIndex() {
      return entries;
    },
    getEntry(sid) {
      return bySid.get(sid) || null;
    },
    async getContent(sid) {
      const entry = bySid.get(sid);
      if (!entry) return null;
      if (contentCache.has(sid)) return contentCache.get(sid);
      const file = await loadContentFile(entry.system);
      const raw = file[sid] || null;
      // Try to get legacy content: first check if this sid maps to a legacy sid
      let legacy = legacyBySid.get(sid) || null;
      if (!legacy && realToLegacySid.has(sid)) {
        const legacySid = realToLegacySid.get(sid);
        legacy = legacyBySid.get(legacySid) || null;
      }
      const content = raw || legacy
        ? { ...raw, draft: true, legacy: legacy || null }
        : null;
      contentCache.set(sid, content);
      return content;
    },
    search(query) {
      return search(searchIndex, query);
    },
  };
}

function fetchJson(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  });
}

// ============================================================================
// 2. Boot
// ============================================================================
async function boot() {
  initShell();
  initSheet();
  initFocusNav();

  const canvasHost = document.getElementById('atlas-canvas');
  const bus = { on, off, emit, EVENTS };
  const storeApi = { get: storeGet, set: storeSet, subscribe: storeSubscribe };

  const rendererApi = createRenderer({ container: canvasHost, bus });
  const { THREE: T, renderer, scene, camera, requestRender, addTicker, setViewOffset, getStats } = rendererApi;

  scene.add(new T.AmbientLight(0xffffff, 0.7));
  const dirLight = new T.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  const controlsApi = createControls({
    camera,
    domElement: renderer.domElement,
    bus,
    requestRender,
    OrbitControls,
    THREE: T,
  });

  const cameraRig = createCameraRig({
    camera,
    controls: controlsApi.controls,
    addTicker,
    requestRender,
    setViewOffset,
    getViewport: () => ({ width: canvasHost.clientWidth, height: canvasHost.clientHeight }),
    bus,
  });

  const engine = {
    scene,
    camera,
    renderer,
    requestRender,
    setViewOffset,
    focusSid: (sid, opts) => {
      const bbox = registry.getBBox(sid);
      if (bbox && cameraRig.focusBox) cameraRig.focusBox(bbox, opts);
    },
    viewPreset: (name) => {
      if (cameraRig.viewPreset) cameraRig.viewPreset(name);
    },
  };

  const registry = createRegistry({ engine, bus });

  const assetLoader = createAssetLoader({
    bus,
    store: storeApi,
    baseUrl: MODELS_BASE,
    engine,
    registry,
  });

  const visibility = createVisibility({
    registry,
    bus,
    engine,
    getLayers: () => storeGet().layers,
  });

  const selection = createSelection({
    registry,
    bus,
    store: storeApi,
    requestRender,
    focusSid: (sid) => engine.focusSid(sid, { animate: true }),
  });

  const xrayClip = createXrayClip({ bus, store: storeApi, renderer, THREE: T, requestRender });

  let labels = null;
  try {
    labels = createLabels({
      container: canvasHost,
      camera,
      bus,
      registry,
      addTicker,
      requestRender,
      THREE: T,
      getLabel: (sid) => labelFor(sid),
    });
  } catch (e) {
    // js/engine/labels.js ainda pode exigir opções que este orquestrador
    // não previu — rótulos são um extra, nunca bloqueiam o boot do Atlas.
    console.warn('[atlas] labels indisponível:', e);
  }

  // ---- Picking (clique/tap) ----
  controlsApi.setPickHandler(({ ndc, kind }) => {
    const sid = registry.pick(ndc);
    if (sid) {
      selection.select(sid, 'pick');
      if (kind === 'focus') engine.focusSid(sid, { animate: true });
    } else if (kind === 'tap') {
      selection.select(null, 'pick');
    }
  });

  const contentStore = await createContentStore();

  // ---- Menu de contexto ----
  let contextMenu = null;
  if (typeof window.createContextMenu === 'function') {
    contextMenu = window.createContextMenu({
      bus,
      EVENTS,
      getLabel: (sid) => labelFor(sid),
    });
    controlsApi.setContextMenuHandler(({ client, ndc }) => {
      const sid = registry.pick(ndc);
      if (sid) contextMenu.open({ client, sid });
    });
  }

  function labelFor(sid) {
    const entry = contentStore.getEntry(sid);
    if (!entry) return sid;
    return entry.ptName || entry.englishName || entry.latinName || sid;
  }
  // ---- Ficha (infocard) — inspetor (tablet/desktop) e painel (celular) ----
  const infocard = createInfoCard(getSlot('inspector') || document.getElementById('atlas-inspector'), {
    onAction: ({ action, sid }) => {
      if (action === 'isolate') emit(EVENTS.VISIBILITY_ISOLATE, { sid });
      if (action === 'hide') emit(EVENTS.VISIBILITY_HIDE, { sid });
      if (action === 'ghost') emit(EVENTS.VISIBILITY_GHOST, { sid });
      if (action === 'focus') engine.focusSid(sid, { animate: true });
    },
  });

  async function renderInfocardFor(sid) {
    if (!sid) {
      infocard.clear();
      return;
    }
    const raw = contentStore.getEntry(sid);
    if (!raw) {
      infocard.clear();
      return;
    }
    const entry = {
      sid,
      names: { pt: raw.ptName || raw.englishName || raw.latinName || sid, en: raw.englishName || '' },
      system: raw.systemId,
    };
    infocard.render(entry, null);
    const content = await contentStore.getContent(sid);
    infocard.render(entry, content);
  }

  on(EVENTS.STRUCTURE_SELECT, ({ sid }) => { renderInfocardFor(sid); });

  // ---- Busca ----
  const searchBox = createSearchBox(getSlot('search') || document.getElementById('atlas-search-slot'), {
    bus,
    getIndex: () => contentStore.getIndex(),
    onOpenSystem: () => {},
  });
  // Compat legado: js/compat/legacy-api.js dá o id #bio-search-input ao
  // campo real desta caixa (ver LEGACY_COMPAT em core/contracts.js).

  // ---- Navegador ----
  const navContainer = document.getElementById('atlas-left-panel');
  if (navContainer) {
    createNavigator(navContainer, {
      bus,
      getIndex: () => contentStore.getIndex(),
      isSystemAvailable: (systemId) => assetLoader.isLoaded(systemId),
      onSystemOpen: (systemId) => { loadSystem(systemId); },
    });
  }

  // ---- Painel de camadas ----
  const layersPanelEl = document.createElement('div');
  const layersPanel = createLayersPanel(layersPanelEl, {
    bus,
    store: storeApi,
    unavailable: () => storeGet().unavailableSystems,
  });
  registerPanel('layers', layersPanelEl);

  // ---- Créditos ----
  let manifest = null;
  try {
    manifest = await assetLoader.loadManifest(MANIFEST_URL);
  } catch (e) {
    console.warn('[atlas] manifest indisponível:', e);
  }
  if (typeof window.createCredits === 'function') {
    const credits = window.createCredits({ manifest: manifest || {}, contentSources: [] });
    if (credits && credits.element) registerPanel('credits', credits.element);
  }

  // ---- Carregamento de sistemas ----
  const loading = new Set();
  async function loadSystem(systemId) {
    if (assetLoader.isLoaded(systemId) || loading.has(systemId)) return;
    loading.add(systemId);
    try {
      await assetLoader.loadSystem(systemId);
      storeSet({ loadedSystems: [...storeGet().loadedSystems, systemId] });
    } catch (e) {
      storeSet({ unavailableSystems: [...storeGet().unavailableSystems, systemId] });
    } finally {
      loading.delete(systemId);
      requestRender();
    }
  }

  await Promise.all(DEFAULT_SYSTEMS.map(loadSystem));
  requestRender();

  // Demais sistemas: sob demanda. Uma camada ligada pode precisar de
  // sistemas ainda não carregados — `structures.json` já traz `layer` por
  // estrutura, então basta achar quais sistemas têm alguma estrutura
  // daquela camada e carregá-los.
  const systemsByLayer = new Map();
  for (const s of contentStore.getIndex()) {
    if (!systemsByLayer.has(s.layer)) systemsByLayer.set(s.layer, new Set());
    systemsByLayer.get(s.layer).add(s.system);
  }
  on(EVENTS.LAYER_SET, ({ layer, visible }) => {
    if (!visible) return;
    const systems = systemsByLayer.get(layer);
    if (systems) systems.forEach(loadSystem);
  });

  // ---- Fallback (GLB indisponível) ----
  try {
    // Sem `bodyGlbUrl`: usa o padrão de createFallback (models/body.glb,
    // resolvido a partir de js/engine/fallback.js — sempre correto
    // independente de `?fixtures=1`, já que a reserva é sempre o body.glb
    // real, nunca a fixture).
    createFallback({ registry, engine });
  } catch (e) { /* fallback é um extra de robustez, nunca bloqueia o boot */ }

  // ---- Modos (carregados sob demanda ao trocar de modo) ----
  const modeInstances = new Map();
  const modeLoaders = {
    quiz: () => import('./modes/quiz.js').then((m) => m.createQuizMode({ bus, store: storeApi, getLabel: labelFor, loadCases: () => fetchJson(`${CONTENT_BASE}quiz-cases.json`) })),
    fisiologia: () => import('./modes/physiology.js').then((m) => m.createPhysiologyMode({
      bus,
      registry,
      engine,
      THREE,
      getLabel: labelFor,
      getBBoxCenter: (sid) => {
        const bbox = registry.getBBox(sid);
        if (!bbox) return null;
        const center = bbox.getCenter(new THREE.Vector3());
        return [center.x, center.y, center.z];
      },
      loadProcesses: () => fetchJson(`${CONTENT_BASE}processes.json`),
      loadRoutes: () => fetchJson(`${CONTENT_BASE}routes.json`),
    })),
    farmacologia: () => import('./modes/pharmacology.js').then((m) => m.createPharmacologyMode({ bus, loadCompounds: () => fetchJson(`${CONTENT_BASE}compounds.json`) })),
    moleculas: () => import('./modes/molecules.js').then((m) => m.createMoleculesMode({ bus, loadProteins: () => fetchJson(`${CONTENT_BASE}proteins.json`) })),
    estudo: () => import('./modes/study.js').then(async (m) => {
      const { createStudyStore } = await import('./modes/study-store.js');
      return m.createStudyMode({ bus, store: createStudyStore(), getLabel: labelFor });
    }),
  };

  let currentMode = null;
  async function enterMode(modeId) {
    if (currentMode && currentMode.exit) await currentMode.exit();
    currentMode = null;
    if (modeId === 'explorar') {
      setSheetContent(null, null, { label: 'Painel do Atlas' });
      return;
    }
    let mode = modeInstances.get(modeId);
    if (!mode && modeLoaders[modeId]) {
      try {
        mode = await modeLoaders[modeId]();
        modeInstances.set(modeId, mode);
      } catch (e) {
        console.warn(`[atlas] modo "${modeId}" indisponível:`, e);
        return;
      }
    }
    if (!mode) return;
    currentMode = mode;
    await mode.enter({ registry, assetLoader, engine, contentStore });
    const node = mode.sheetContent ? mode.sheetContent() : null;
    if (node) setSheetContent(null, node, { label: mode.label || 'Modo do Atlas' });
  }

  on(EVENTS.MODE_CHANGE, ({ mode }) => { enterMode(mode); });

  // ---- Expõe internals para a camada de compatibilidade legada ----
  window.__atlasInternals = {
    bus, store: storeApi, registry, assetLoader, engine,
    selection, visibility, contentStore, searchBox, loadSystem, labelFor, DEFAULT_SYSTEMS,
  };
  // Gancho de teste, só leitura — expõe as estatísticas do renderer
  // (draw calls, triângulos, contagem de frames renderizados) para os
  // cenários de e2e de desempenho (scripts/e2e/atlas-perf.e2e.js). Não
  // altera nada no motor; `getStats()` já existe em js/engine/renderer.js.
  window.__atlasPerf = Object.freeze({ getStats: () => rendererApi.getStats() });
  emit('atlas:ready', {});
}

// `type="module"` já executa depois do parsing do DOM (como `defer`), então
// não precisa esperar DOMContentLoaded.
boot().catch((e) => {
  console.error('[atlas] falha ao inicializar', e);
});
