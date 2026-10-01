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
import { initSheet, setContent as setSheetContent, snapTo as snapSheetTo, getState as getSheetState } from './ui/sheet.js';
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
  // Try to load boot structures first (70% smaller, contains sid/names/system/layer/side)
  // Fall back to full structures.json if boot file 404s
  let structures = await fetchJson(`${CONTENT_BASE}generated/structures.boot.json`).catch(() =>
    fetchJson(`${CONTENT_BASE}generated/structures.json`)
  ).catch(() => []);

  const [legacyIndex] = await Promise.all([
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
  const fileCache = new Map();

  function loadContentFile(dir, system) {
    const key = `${dir}/${system}`;
    if (!fileCache.has(key)) {
      fileCache.set(key, fetchJson(`${CONTENT_BASE}${dir}/${system}.json`).catch(() => ({})));
    }
    return fileCache.get(key);
  }

  // Ficha = conteúdo gerado (content/<sistema>.json: Wikidata, Wikipédia PT,
  // células ASCT+B — chaveado pelo sid real) + ficha legada em PT
  // (legacy/content/<sistema>.json — chaveada pelo sid LEGADO, ligado pelo
  // nome em legacy-link.js). Antes só o legado era lido, e com o sid real:
  // nunca batia, e toda ficha mostrava "Sem descrição ainda".
  function legacyEntryFor(sid) {
    if (legacyBySid.has(sid)) return legacyBySid.get(sid);
    const legacySid = realToLegacySid.get(sid);
    return legacySid ? legacyBySid.get(legacySid) || null : null;
  }

  function mergeContent(gen, leg) {
    const merged = { ...(gen || {}), ...(leg || {}) }; // texto PT curado vence
    if (gen && leg) {
      merged.ids = { ...(gen.ids || {}), ...(leg.ids || {}) };
      const genCells = gen.histology && gen.histology.cells && gen.histology.cells.length;
      const legCells = leg.histology && leg.histology.cells && leg.histology.cells.length;
      if (genCells && !legCells) merged.histology = { ...(leg.histology || {}), ...gen.histology };
      if (!leg.summary_pt && gen.summary_pt) merged.summary_pt = gen.summary_pt;
      const seen = new Set();
      merged.sources = [...(leg.sources || []), ...(gen.sources || [])].filter((src) => {
        const k = JSON.stringify(src);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return merged;
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
      en: prettifyName(s.englishName),
      la: s.latinName || '',
    },
  }));
  const entryBySid = new Map(entries.map((e) => [e.sid, e]));
  const searchIndex = buildSearchIndex(entries);

  return {
    getIndex() {
      return entries;
    },
    getEntry(sid) {
      return entryBySid.get(sid) || null;
    },
    async getContent(sid) {
      if (contentCache.has(sid)) return contentCache.get(sid);
      const entry = bySid.get(sid) || null;
      const legacy = legacyEntryFor(sid);
      if (!entry && !legacy) return null;
      const [gen, leg] = await Promise.all([
        entry && entry.system ? loadContentFile('content', entry.system).then((f) => f[sid] || null) : null,
        legacy && legacy.system ? loadContentFile('legacy/content', legacy.system).then((f) => f[legacy.sid] || null) : null,
      ]);
      const content = gen || leg ? { ...mergeContent(gen, leg), draft: true, legacy } : null;
      contentCache.set(sid, content);
      return content;
    },
    search(query) {
      return search(searchIndex, query);
    },
  };
}

// Nomes crus do HRA vêm como "VH_M_papillary_muscle_of_heart_anterior":
// sem o prefixo do doador e com espaços, a busca e os rótulos ficam legíveis.
function prettifyName(raw) {
  const name = String(raw || '').replace(/^VH_[MF]_/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

const SIDE_PT = Object.freeze({ l: 'esquerdo', r: 'direito' });
const DEEP_LAYERS = new Set(['visceras', 'vasos', 'nervos', 'linfatico']);

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

  // Inércia do giro (enableDamping): OrbitControls só desacelera se
  // update() rodar a cada quadro. O decaimento é geométrico (nunca chega a
  // zero): para quando o deslocamento do quadro fica imperceptível
  // (< 0,02% da distância ao alvo), e o renderer volta a ficar parado.
  // Só roda entre um gesto ('start') e o fim da inércia — fora disso o
  // ticker não mexe na câmera (nada fica pedindo quadros com o 3D parado).
  const lastCamPos = camera.position.clone();
  // Teto de 1,2 s depois de soltar: em aparelho lento (poucos quadros por
  // segundo) o decaimento por quadro levaria dezenas de segundos.
  const INERTIA_MAX_MS = 1200;
  let inertiaActive = false;
  let gestureEndedAt = null;
  controlsApi.controls.addEventListener('start', () => { inertiaActive = true; gestureEndedAt = null; });
  controlsApi.controls.addEventListener('end', () => { gestureEndedAt = performance.now(); });
  addTicker(() => {
    if (!inertiaActive) return false;
    const changed = controlsApi.controls.update();
    const moved = camera.position.distanceTo(lastCamPos);
    lastCamPos.copy(camera.position);
    const timedOut = gestureEndedAt !== null && performance.now() - gestureEndedAt > INERTIA_MAX_MS;
    const stillMoving = !timedOut && changed && moved > camera.position.distanceTo(controlsApi.controls.target) * 2e-4;
    if (!stillMoving && gestureEndedAt !== null) inertiaActive = false;
    return stillMoving;
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
    addTicker,
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
    const base = entry.names.pt || entry.names.en || entry.names.la || sid;
    const side = SIDE_PT[entry.side];
    return side && !/(esquerd|direit)/i.test(base) ? `${base} (${side})` : base;
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

  // #atlas-inspector só existe (visualmente) em ≥600px (css/atlas.css) — no
  // celular o painel arrastável é a única superfície de conteúdo (ver
  // docs/ATLAS_UX_SPEC.md §1.1/§2). infocard.js sempre renderiza no mesmo
  // container fixo (#atlas-inspector); abaixo de 600px espelhamos o nó já
  // montado dentro do painel, senão tocar numa estrutura no celular não
  // mostrava nada (bug real: `<600px` some com o inspetor e ninguém troca
  // o conteúdo do painel pela ficha).
  const isMobileViewport = () => !window.matchMedia('(min-width: 600px)').matches;
  function buildSheetDefaultPeekNode() {
    // Mesma marcação do peek inicial em index.html (hint + #organ-hud
    // escondido) — usado para "voltar ao início" quando a seleção é limpa.
    const frag = document.createElement('div');
    const hud = document.createElement('div');
    hud.id = 'organ-hud';
    hud.className = 'hidden';
    const name = document.createElement('strong');
    name.id = 'organ-name';
    name.textContent = '---';
    hud.appendChild(name);
    frag.appendChild(hud);
    const hint = document.createElement('p');
    hint.id = 'atlas-sheet-hint';
    hint.className = 'atlas-sheet-hint';
    hint.textContent = 'Toque numa estrutura para começar';
    frag.appendChild(hint);
    return frag;
  }
  function buildSheetPeekNode(sid) {
    // Reaproveita os ids legados #organ-hud/#organ-name (LEGACY_COMPAT,
    // core/contracts.js) — mesmo padrão que js/ui/infocard.js já usa no
    // cabeçalho da ficha completa.
    const hud = document.createElement('div');
    hud.id = 'organ-hud';
    const name = document.createElement('strong');
    name.id = 'organ-name';
    name.textContent = labelFor(sid);
    hud.appendChild(name);
    return hud;
  }
  function syncInfocardToSheet(sid) {
    if (currentMode) return; // um modo já é dono do painel (ver enterMode).
    const el = infocard.getElement();
    if (isMobileViewport() && el) {
      setSheetContent(buildSheetPeekNode(sid), el, { label: 'Ficha da estrutura' });
      if (getSheetState().state === 'peek') snapSheetTo('half');
    }
  }

  async function renderInfocardFor(sid) {
    if (!sid) {
      infocard.clear();
      if (!currentMode && isMobileViewport()) {
        const emptyBody = document.createElement('div');
        setSheetContent(buildSheetDefaultPeekNode(), emptyBody, { label: 'Painel do Atlas' });
      }
      return;
    }
    const raw = contentStore.getEntry(sid);
    if (!raw) {
      infocard.clear();
      return;
    }
    const entry = {
      sid,
      names: { pt: labelFor(sid), en: raw.names.en || '', la: raw.names.la || '' },
      system: raw.system,
    };
    infocard.render(entry, undefined);
    syncInfocardToSheet(sid);
    const content = await contentStore.getContent(sid);
    infocard.render(entry, content);
    syncInfocardToSheet(sid);
  }

  on(EVENTS.STRUCTURE_SELECT, ({ sid }) => {
    renderInfocardFor(sid);
    const live = document.getElementById('atlas-live');
    if (live) live.textContent = sid ? `Selecionado: ${labelFor(sid)}` : 'Seleção removida.';
  });

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
      // assets.js já acrescenta o sistema a store.loadedSystems (sem repetir).
      await assetLoader.loadSystem(systemId);
    } catch (e) {
      storeSet({ unavailableSystems: [...storeGet().unavailableSystems, systemId] });
    } finally {
      loading.delete(systemId);
      requestRender();
    }
  }

  await Promise.all(DEFAULT_SYSTEMS.map(loadSystem));
  fitWholeBody();
  requestRender();

  // ---- Enquadramento: corpo inteiro centralizado ----
  // Sem isto a câmera-rig ficava com o centro padrão (0,0,0) — a altura dos
  // pés — e raio 1: o corpo aparecia cortado no alto da tela, e "Reset"/
  // vistas giravam em torno do chão.
  function fitWholeBody() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let count = 0;
    for (const rec of registry.iterate()) {
      const b = registry.getBBox(rec.sid);
      if (!b || b.min.some((v) => !Number.isFinite(v)) || b.max.some((v) => !Number.isFinite(v))) continue;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], b.min[i]);
        max[i] = Math.max(max[i], b.max[i]);
      }
      count++;
    }
    if (!count) return;
    cameraRig.setModelBounds({ min, max });
    // O plano de corte (Corte) se posiciona pela caixa do corpo — sem isto
    // xray-clip.js recusava todo corte ("setClip chamado sem setModelBox").
    if (xrayClip.setModelBox) xrayClip.setModelBox({ min, max });
    cameraRig.viewPreset('anterior', { animate: false });
  }

  // ---- Seleção vinda da busca/navegador/ficha: mostra e enquadra ----
  // A estrutura pode estar num sistema ainda não baixado (ex.: coração,
  // cardiovascular) ou numa camada desligada (Vísceras/Vasos): liga a
  // camada, carrega o sistema, reaplica o destaque e leva a câmera até ela.
  function showLayer(layer) {
    const layers = storeGet().layers;
    const layerState = layer && layers[layer];
    if (!layerState || layerState.visible) return;
    storeSet({ layers: { ...layers, [layer]: { ...layerState, visible: true } } });
    emit(EVENTS.LAYER_SET, { layer, visible: true, opacity: layerState.opacity });
  }
  async function revealAndFocus(sid) {
    const entry = contentStore.getEntry(sid);
    if (entry && entry.system && !assetLoader.isLoaded(entry.system)) await loadSystem(entry.system);
    if (storeGet().selectedSid !== sid) return; // o usuário já escolheu outra
    // A camada que vale é a do registro 3D (classificação por nó); a do
    // índice é só o palpite antes de o sistema carregar.
    const rec = registry.getBySid(sid);
    showLayer((rec && rec.layer) || (entry && entry.layer));
    if (rec && rec.visible === false) {
      registry.setVisible(sid, true);
    }
    // Estrutura profunda (órgão, vaso, nervo) atrás dos músculos: liga o
    // Raio-X para ela aparecer — o botão fica marcado e desliga com um toque.
    const st = storeGet();
    if (rec && DEEP_LAYERS.has(rec.layer) && !st.xray
        && ((st.layers.musculos && st.layers.musculos.visible) || (st.layers.pele && st.layers.pele.visible))) {
      emit(EVENTS.XRAY_SET, { enabled: true });
    }
    selection.refresh();
    engine.focusSid(sid, { animate: true });
  }
  on(EVENTS.STRUCTURE_SELECT, ({ sid, source }) => {
    if (sid && source !== 'pick' && source !== 'focus') revealAndFocus(sid);
  });

  // ---- Teclado: + / − aproximam e afastam ----
  document.addEventListener('keydown', (evt) => {
    const t = evt.target;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (evt.key === '+' || evt.key === '=') emit('view:zoom', { factor: 0.8 });
    else if (evt.key === '-' || evt.key === '_') emit('view:zoom', { factor: 1.25 });
  });

  // ---- Zoom pelos botões (+/−) e pelo teclado ----
  on('view:zoom', ({ factor }) => {
    const target = controlsApi.controls.target;
    const offset = camera.position.clone().sub(target);
    const dist = offset.length();
    const next = Math.min(Math.max(dist * factor, 0.15), 12);
    camera.position.copy(target).add(offset.multiplyScalar(next / dist));
    controlsApi.controls.update();
    requestRender();
  });

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
  // Trocas de modo em sequência, e só a última vale: antes, trocar rápido
  // (ou um modo que demora a entrar, como Fisiologia) fazia duas entradas
  // correrem juntas e o painel mostrava o conteúdo do modo ANTERIOR.
  let modeQueue = Promise.resolve();
  let modeRequest = 0;
  function enterMode(modeId) {
    const req = ++modeRequest;
    modeQueue = modeQueue
      .then(() => doEnterMode(modeId, req))
      .catch((e) => console.warn(`[atlas] falha ao trocar para o modo "${modeId}":`, e));
    return modeQueue;
  }

  function modeTitleNode(modeId, mode) {
    const def = MODES.find((m) => m.id === modeId);
    const title = document.createElement('strong');
    title.className = 'atlas-sheet-title';
    title.textContent = (def && def.label) || (mode && mode.label) || 'Modo do Atlas';
    return title;
  }

  function modeMessageNode(text) {
    const p = document.createElement('p');
    p.className = 'atlas-sheet-hint';
    p.textContent = text;
    return p;
  }

  async function doEnterMode(modeId, req) {
    if (req !== modeRequest) return; // já há um pedido mais novo na fila
    if (currentMode && currentMode.exit) {
      try { await currentMode.exit(); } catch (e) { console.warn('[atlas] erro ao sair do modo:', e); }
    }
    currentMode = null;
    if (modeId === 'explorar') {
      // Limpa o conteúdo do modo anterior (setSheetContent ignora null).
      setSheetContent(buildSheetDefaultPeekNode(), document.createElement('div'), { label: 'Painel do Atlas' });
      if (isMobileViewport()) snapSheetTo('peek');
      // Volta a mostrar a ficha da estrutura que já estava selecionada.
      const sid = storeGet().selectedSid;
      if (sid) renderInfocardFor(sid);
      return;
    }
    // Resposta imediata enquanto o modo carrega (antes o painel ficava com o
    // conteúdo do modo anterior ou vazio).
    setSheetContent(modeTitleNode(modeId), modeMessageNode('Carregando…'), { label: 'Modo do Atlas' });
    if (isMobileViewport() && getSheetState().state === 'peek') snapSheetTo('half');

    let mode = modeInstances.get(modeId);
    if (!mode && modeLoaders[modeId]) {
      try {
        mode = await modeLoaders[modeId]();
        modeInstances.set(modeId, mode);
      } catch (e) {
        console.warn(`[atlas] modo "${modeId}" indisponível:`, e);
        if (req === modeRequest) setSheetContent(modeTitleNode(modeId), modeMessageNode('Este modo não pôde ser aberto. Tente de novo.'), { label: 'Modo do Atlas' });
        return;
      }
    }
    if (!mode || req !== modeRequest) return;
    currentMode = mode;
    try {
      await mode.enter({ registry, assetLoader, engine, contentStore });
    } catch (e) {
      console.warn(`[atlas] erro ao entrar no modo "${modeId}":`, e);
      setSheetContent(modeTitleNode(modeId, mode), modeMessageNode('Este modo não pôde ser aberto. Tente de novo.'), { label: 'Modo do Atlas' });
      return;
    }
    if (req !== modeRequest) return; // o próximo pedido da fila faz o exit()
    const node = mode.sheetContent ? mode.sheetContent() : null;
    if (node) {
      setSheetContent(modeTitleNode(modeId, mode), node, { label: mode.label || 'Modo do Atlas' });
      // No celular o conteúdo do modo precisa aparecer sem arrastar o painel.
      if (isMobileViewport() && getSheetState().state === 'peek') snapSheetTo('half');
    }
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
