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

import { createRenderer, hasWebGL2 } from './engine/renderer.js';
import { createCameraRig } from './engine/camera-rig.js';
import { createControls, toNdc } from './engine/controls.js';
import { createAssetLoader } from './engine/assets.js';
import { createRegistry } from './engine/registry.js';
import { createVisibility } from './engine/visibility.js';
import { createSelection } from './engine/selection.js';
import { createXrayClip } from './engine/xray-clip.js';
import { createLabels } from './engine/labels.js';
import { createFallback } from './engine/fallback.js';

import { getSlot, registerPanel, initShell, showNotice, offerAction } from './ui/shell.js';
import { parseAtlasHash, readSession, writeSession, snapshotSession, dropUnknownSid, resumeAlreadyOffered, markResumeOffered } from './ui/session.js';
import { initSheet, setContent as setSheetContent, snapTo as snapSheetTo, getState as getSheetState } from './ui/sheet.js';
import { initFocusNav } from './ui/focus-nav.js';
import { buildSearchIndex, search } from './ui/search-index.js';
import { createSearchBox } from './ui/search-box.js';
import { createNavigator } from './ui/navigator.js';
import { groupEntries, sideLabel, contentCandidates } from './ui/structure-groups.js';
import { createInfoCard } from './ui/infocard.js';
import { createLayersPanel } from './ui/layers-panel.js';
import { linkLegacy } from './ui/legacy-link.js';
import { ATLAS_FLAGS } from './core/flags.js';
import { createProgressBar } from './ui/progress-bar.js';
import { createOnboarding, shouldShowOnboarding, isDeepLink, wasDismissedThisTab } from './ui/onboarding.js';
import { createHints } from './ui/hints.js';
import { createSlowDeviceWatcher, classifyDevice } from './ui/slow-device.js';

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

// Sistemas do primeiro carregamento (só o esqueleto ≈ 1 MB) — docs/ATLAS_V2_TAREFAS.md.
const DEFAULT_SYSTEMS = Object.freeze(['esqueletico']);
// Baixados em segundo plano logo depois do primeiro quadro (o esqueleto já
// dá o que tocar). Em conexão lenta ou com economia de dados ligada, só
// quando o usuário ligar a camada — antes os músculos (1,8 MB) entravam no
// primeiro carregamento e dobravam a espera no 3G.
const BACKGROUND_SYSTEMS = Object.freeze(['muscular']);
const BACKGROUND_DELAY_MS = 1500;

/** Conexão lenta ou economia de dados (Network Information API, quando existe). */
export function isConstrainedConnection(nav = (typeof navigator !== 'undefined' ? navigator : {})) {
  const c = nav && nav.connection;
  if (!c) return false;
  return !!c.saveData || /^(slow-2g|2g|3g)$/.test(String(c.effectiveType || ''));
}

// ============================================================================
// 1. Conteúdo (structures.json + legado PT) — ContentStore
// ============================================================================
/** Estruturas sem sid/sistema são descartadas; base vazia ou >5% inválida é erro. */
export function checkStructures(list, { required = true } = {}) {
  if (!Array.isArray(list) || list.length === 0) {
    if (!required) return [];
    throw new AtlasBootError('Base de estruturas indisponível.', 'generated/structures.boot.json vazio ou ausente');
  }
  const valid = list.filter((s) => s && typeof s.sid === 'string' && s.sid && typeof s.system === 'string' && s.system);
  const invalid = list.length - valid.length;
  if (invalid > 0) {
    console.error(`[atlas] ${invalid} de ${list.length} estruturas sem sid/sistema foram ignoradas`);
    if (required && invalid / list.length > 0.05) {
      throw new AtlasBootError('Base de estruturas corrompida.', `${invalid} de ${list.length} estruturas inválidas`);
    }
  }
  return valid;
}

/** Erro de inicialização com mensagem para o usuário (tela "Recarregar"). */
class AtlasBootError extends Error {
  constructor(userMessage, detail, hint) {
    super(`${userMessage} (${detail})`);
    this.userMessage = userMessage;
    this.hint = hint;
  }
}

/**
 * Tela de falha do atlas: mensagem clara + "Recarregar" no lugar de uma
 * tela vazia. Também usada quando o WebGL não volta (renderer.js).
 */
function showFatal(message, hint = 'Verifique a conexão e tente de novo.') {
  const { h } = window.LaiftDom;
  const prev = document.getElementById('atlas-fatal');
  if (prev) prev.remove();
  const reload = h('button', { type: 'button', className: 'atlas-fatal-reload' }, ['Recarregar']);
  reload.addEventListener('click', () => window.location.reload());
  const box = h('div', { id: 'atlas-fatal', className: 'atlas-fatal', role: 'alert' }, [
    h('p', { className: 'atlas-fatal-title' }, [message]),
    h('p', { className: 'atlas-fatal-hint' }, [hint]),
    reload,
  ]);
  document.body.appendChild(box);
  reload.focus();
}

async function createContentStore() {
  // Try to load boot structures first (70% smaller, contains sid/names/system/layer/side)
  // Fall back to full structures.json if boot file 404s
  // Os dois índices em paralelo (antes o legado só pedia depois do boot —
  // uma ida e volta a mais em rede lenta).
  const legacyIndexPromise = fetchJson(`${CONTENT_BASE}legacy/index.legacy.json`).catch(() => []);
  let structures = await fetchJson(`${CONTENT_BASE}generated/structures.boot.json`).catch(() =>
    fetchJson(`${CONTENT_BASE}generated/structures.json`)
  ).catch(() => []);
  // Sem a base de estruturas a busca, o navegador e os nomes ficam vazios —
  // antes isso acontecia em silêncio e o atlas parecia quebrado. As fixtures
  // (?fixtures=1) não têm generated/ e seguem sem a base.
  structures = checkStructures(structures, { required: !USE_FIXTURES });

  const legacyIndex = await legacyIndexPromise;

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
  // O vínculo com o legado casa UM sid por item (ex.: "za:kidney-l" → "Rins");
  // o outro lado ficava em inglês e virava outra linha na lista (C3). O nome
  // PT passa para todo sid do mesmo sistema com o mesmo nome em inglês.
  const ptByEnglish = new Map();
  for (const s of structures) {
    const pt = legacyNameBySid.get(s.sid);
    const key = `${s.system}|${prettifyName(s.englishName)}`;
    // Nome com lado ("… esquerdo") não serve para o outro lado.
    if (pt && !/esquerd|direit/i.test(pt) && !ptByEnglish.has(key)) ptByEnglish.set(key, pt);
  }
  const entries = structures.map((s) => ({
    ...s,
    names: {
      pt: legacyNameBySid.get(s.sid) || ptByEnglish.get(`${s.system}|${prettifyName(s.englishName)}`) || '',
      en: prettifyName(s.englishName),
      la: s.latinName || '',
    },
  }));
  const entryBySid = new Map(entries.map((e) => [e.sid, e]));
  const searchIndex = buildSearchIndex(entries);
  // Visão sem duplicatas (C3): uma entrada por estrutura, com todos os sids
  // (lados, versões M/F). O índice completo continua em getIndex() — seleção,
  // quiz e fichas precisam do sid de cada lado.
  const groups = groupEntries(entries);
  const groupBySid = new Map();
  for (const g of groups) for (const s of g.sids) groupBySid.set(s, g);

  return {
    getIndex() {
      return entries;
    },
    getEntry(sid) {
      return entryBySid.get(sid) || null;
    },
    getGroups() {
      return groups;
    },
    getGroup(sid) {
      return groupBySid.get(sid) || null;
    },
    async getContent(sid) {
      if (contentCache.has(sid)) return contentCache.get(sid);
      // A ficha gravada num lado (ou no sid sem lado) vale para o outro (A.2).
      const group = groupBySid.get(sid);
      let content = null;
      for (const candidate of contentCandidates(sid, group ? group.sids : [])) {
        const entry = bySid.get(candidate) || null;
        const legacy = legacyEntryFor(candidate);
        if (!entry && !legacy) continue;
        const [gen, leg] = await Promise.all([
          entry && entry.system ? loadContentFile('content', entry.system).then((f) => f[candidate] || null) : null,
          legacy && legacy.system ? loadContentFile('legacy/content', legacy.system).then((f) => f[legacy.sid] || null) : null,
        ]);
        if (gen || leg) {
          content = { ...mergeContent(gen, leg), draft: true, legacy };
          break;
        }
      }
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
let EMPTY_PEEK_TEMPLATE = null;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function boot() {
  // Estado vazio do peek, antes de qualquer conteúdo entrar nele.
  const peekEl = document.getElementById('atlas-sheet-peek');
  EMPTY_PEEK_TEMPLATE = peekEl ? peekEl.cloneNode(true) : document.createElement('div');
  document.body.dataset.peekV2 = String(ATLAS_FLAGS.peek);
  initShell();
  initSheet();
  initFocusNav();

  const canvasHost = document.getElementById('atlas-canvas');
  const bus = { on, off, emit, EVENTS };
  const storeApi = { get: storeGet, set: storeSet, subscribe: storeSubscribe };

  if (!hasWebGL2()) {
    throw new AtlasBootError(
      'Este aparelho ou navegador não tem WebGL 2, necessário para o 3D.',
      'WEBGL2_UNAVAILABLE',
      'Atualize o navegador (iOS 15+, Chrome/Firefox recentes) ou use outro aparelho.',
    );
  }
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

  // ---- Barra de carregamento (antes do 1º sistema, para pegar o START) ----
  const systemLabel = (id) => (SYSTEMS.find((x) => x.id === id) || { label: id }).label;
  if (ATLAS_FLAGS.progressBar) createProgressBar({ bus, assetLoader, systemLabel });

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
    addTicker,
    pulse: ATLAS_FLAGS.pulse,
    reducedMotion: prefersReducedMotion,
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
      groupOf: (sid) => labelGroupOf(sid),
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
      // Confirmação tátil curta (Android; o iOS não tem vibração — aceito).
      if (kind === 'tap' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(10); } catch (e) { /* bloqueado pelo navegador */ }
      }
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

  // Grupo do rótulo (C3/C5): lados e versões M/F dividem um rótulo, com o
  // nome base e o selo E/D. Montado na 1ª consulta (o índice já carregou).
  let labelGroups = null;
  function labelGroupOf(sid) {
    if (!labelGroups) {
      let index;
      try { index = contentStore.getIndex(); } catch { return null; } // índice ainda carregando
      labelGroups = new Map();
      for (const g of (contentStore.getGroups ? contentStore.getGroups() : groupEntries(index))) {
        const info = { key: g.key, name: g.name, sideText: sideLabel(g.sides) };
        for (const s of g.sids) labelGroups.set(s, info);
      }
    }
    return labelGroups.get(sid) || null;
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
      if (action === 'more') snapSheetTo('half');
    },
  });

  // ---- Histórico de estudo (Meu Estudo) e chip "Novo" ----
  // Antes o histórico só era gravado com o modo Meu Estudo aberto (quase
  // sempre vazio). Agora um único gravador registra cada ficha aberta; o
  // modo usa o mesmo armazenamento sem gravar de novo.
  const seenSids = new Set();
  let lastSelectSource = null;
  const newSids = new Set();
  on(EVENTS.STRUCTURE_SELECT, ({ sid, source }) => {
    lastSelectSource = source;
    if (!sid) return;
    if (!seenSids.has(sid)) newSids.add(sid); else newSids.delete(sid);
    seenSids.add(sid);
  });
  const studyStorePromise = import('./modes/study-store.js').then(async ({ createStudyStore }) => {
    const studyStore = createStudyStore();
    const { attachRecorder } = await import('./modes/study.js');
    attachRecorder(bus, studyStore);
    try {
      for (const h of await studyStore.listHistory()) if (h && h.type === 'select' && h.sid) seenSids.add(h.sid);
    } catch (e) { /* armazenamento indisponível: tudo conta como novo */ }
    return studyStore;
  }).catch(() => null);

  // #atlas-inspector só existe (visualmente) em ≥600px (css/atlas.css) — no
  // celular o painel arrastável é a única superfície de conteúdo (ver
  // docs/ATLAS_UX_SPEC.md §1.1/§2). infocard.js sempre renderiza no mesmo
  // container fixo (#atlas-inspector); abaixo de 600px espelhamos o nó já
  // montado dentro do painel, senão tocar numa estrutura no celular não
  // mostrava nada (bug real: `<600px` some com o inspetor e ninguém troca
  // o conteúdo do painel pela ficha).
  // Mesma condição do CSS que mostra o inspetor (grade ≥600×600): celular
  // deitado (ex.: 844×390) também usa o painel — antes a ficha não aparecia
  // em lugar nenhum nessa posição.
  const isMobileViewport = () => !window.matchMedia('(min-width: 600px) and (min-height: 600px)').matches;
  function buildSheetDefaultPeekNode() {
    // Mesma marcação do peek inicial em index.html (estado vazio + #organ-hud
    // escondido), clonada no boot — usado para "voltar ao início" quando a
    // seleção é limpa.
    const frag = document.createElement('div');
    for (const child of EMPTY_PEEK_TEMPLATE.childNodes) frag.appendChild(child.cloneNode(true));
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
    const rec = registry.getBySid(sid);
    const entry = {
      sid,
      names: { pt: labelFor(sid), en: raw.names.en || '', la: raw.names.la || '' },
      system: raw.system,
      layer: (rec && rec.layer) || raw.layer,
      side: raw.side,
      isNew: ATLAS_FLAGS.peek && newSids.has(sid),
    };
    newSids.delete(sid); // "Novo" só na primeira abertura
    infocard.render(entry, undefined);
    syncInfocardToSheet(sid);
    const content = await contentStore.getContent(sid);
    if (storeGet().selectedSid !== sid) return;
    infocard.render(entry, content);
    syncInfocardToSheet(sid);
    // Seleção pelo teclado (busca, navegador, link) no celular: o foco vai
    // para "Ver mais", que abre a ficha completa.
    if (isMobileViewport() && lastSelectSource && !['pick', 'focus', 'resume'].includes(lastSelectSource)) {
      const more = document.querySelector('#atlas-sheet .atlas-card-more');
      if (more) more.focus({ preventScroll: true });
    }
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
    getSex: () => storeGet().sex,
  });
  // Compat legado: js/compat/legacy-api.js dá o id #bio-search-input ao
  // campo real desta caixa (ver LEGACY_COMPAT em core/contracts.js).

  // ---- Navegador ----
  const navContainer = document.getElementById('atlas-left-panel');
  let navigatorApi = null;
  if (navContainer) {
    navigatorApi = createNavigator(navContainer, {
      bus,
      getIndex: () => contentStore.getIndex(),
      isSystemAvailable: (systemId) => assetLoader.isLoaded(systemId),
      onSystemOpen: (systemId) => { loadSystem(systemId); },
      getSex: () => storeGet().sex,
    });
  }

  // ---- Painel de camadas ----
  // Janela própria (C7, Onda 3): antes o painel entrava solto no <body>,
  // sem posição, e ficava atrás do canvas — só os interruptores apareciam.
  const layersPanelEl = window.LaiftDom.h('div', {
    className: 'atlas-layers-host', role: 'dialog', 'aria-label': 'Camadas',
  }, [
    window.LaiftDom.h('button', {
      type: 'button', className: 'atlas-layers-close', 'aria-label': 'Fechar camadas',
      'data-action': 'AtlasShell.toggleLayers', text: '×',
    }),
  ]);
  layersPanelEl.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && window.AtlasShell) window.AtlasShell.toggleLayers();
  });
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
  // opts.variant 'hra': o órgão detalhado do HRA do sistema (ver
  // js/engine/assets.js findAsset) — só quando uma estrutura "za:vh-*" é pedida.
  async function loadSystem(systemId, opts = {}) {
    const key = opts.variant === 'hra' ? `${systemId}#hra` : systemId;
    if (assetLoader.isLoaded(systemId, opts) || loading.has(key)) return;
    loading.add(key);
    try {
      // assets.js já acrescenta o sistema a store.loadedSystems (sem repetir).
      await assetLoader.loadSystem(systemId, opts);
    } catch (e) {
      if (!opts.variant) storeSet({ unavailableSystems: [...storeGet().unavailableSystems, systemId] });
    } finally {
      loading.delete(key);
      requestRender();
    }
  }

  // Aparelho fraco (CPU/memória): começa no nível gráfico baixo.
  if (classifyDevice() === 'weak-cpu' && rendererApi.setTier) {
    try { rendererApi.setTier('low'); } catch (e) { /* mantém o detectado */ }
  }
  // Avisos de demora/offline até o esqueleto chegar.
  const defaultsReady = () => DEFAULT_SYSTEMS.every((sys) => assetLoader.isLoaded(sys));
  const slowWatcher = ATLAS_FLAGS.slowDevice ? createSlowDeviceWatcher({
    isReady: defaultsReady,
    retry: () => DEFAULT_SYSTEMS.filter((sys) => !assetLoader.isLoaded(sys)).forEach((sys) => {
      storeSet({ unavailableSystems: storeGet().unavailableSystems.filter((x) => x !== sys) });
      loadSystem(sys).then(() => { if (defaultsReady()) { fitWholeBody(); requestRender(); slowWatcher.done(); } });
    }),
  }) : null;

  await Promise.all(DEFAULT_SYSTEMS.map(loadSystem));
  if (slowWatcher && defaultsReady()) slowWatcher.done();
  fitWholeBody();
  requestRender();

  // Demais sistemas da abertura: em segundo plano, ou só sob demanda.
  if (isConstrainedConnection()) {
    // A camada fica desligada (ligar baixa o sistema — ver LAYER_SET abaixo);
    // ligada sem o sistema, o botão diria "ligado" sem nada na tela.
    const layers = storeGet().layers;
    for (const sys of BACKGROUND_SYSTEMS) {
      const layer = sys === 'muscular' ? 'musculos' : null;
      if (layer && layers[layer] && layers[layer].visible) {
        storeSet({ layers: { ...storeGet().layers, [layer]: { ...layers[layer], visible: false } } });
        emit(EVENTS.LAYER_SET, { layer, visible: false, opacity: layers[layer].opacity });
      }
    }
  } else {
    const idle = typeof window.requestIdleCallback === 'function'
      ? (fn) => window.requestIdleCallback(fn, { timeout: 3000 })
      : (fn) => setTimeout(fn, 0);
    setTimeout(() => idle(() => BACKGROUND_SYSTEMS.forEach(loadSystem)), BACKGROUND_DELAY_MS);
  }

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
  async function revealAndFocus(sid, { focus = true } = {}) {
    const entry = contentStore.getEntry(sid);
    if (entry && entry.system && !assetLoader.isLoaded(entry.system)) await loadSystem(entry.system);
    // Estrutura do órgão detalhado do HRA ("za:vh-*"): carrega esse arquivo também.
    if (entry && entry.system && /^za:vh-/.test(sid) && !assetLoader.isLoaded(entry.system, { variant: 'hra' })) {
      await loadSystem(entry.system, { variant: 'hra' });
    }
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
    if (focus) engine.focusSid(sid, { animate: true });
  }
  on(EVENTS.STRUCTURE_SELECT, ({ sid, source }) => {
    // 'resume': a retomada de sessão revela sem mover a câmera (ela volta
    // para onde estava — ver resumeSession).
    if (sid && source !== 'pick' && source !== 'focus' && source !== 'resume') revealAndFocus(sid);
  });

  // ---- Quiz: a resposta precisa estar no corpo para ser tocada ----
  // Carrega os sistemas das malhas que contam como acerto e liga as camadas
  // delas (com Raio-X se forem profundas), sem selecionar nem mover a câmera
  // — isso entregaria a resposta.
  async function prepareQuizCase(caso) {
    const sids = [
      ...(Array.isArray(caso.correctSids) ? caso.correctSids : []),
      ...(Array.isArray(caso.correctSid) ? caso.correctSid : [caso.correctSid]),
    ].filter(Boolean);
    const systems = new Set(caso.correctSystem ? [caso.correctSystem] : []);
    for (const sid of sids) {
      const entry = contentStore.getEntry(sid);
      if (entry && entry.system) systems.add(entry.system);
    }
    await Promise.all([...systems].filter((sys) => !assetLoader.isLoaded(sys)).map(loadSystem));
    const layers = new Set();
    for (const sid of sids) {
      const rec = registry.getBySid(sid);
      const entry = contentStore.getEntry(sid);
      const layer = (rec && rec.layer) || (entry && entry.layer);
      if (layer) layers.add(layer);
    }
    if (caso.correctSystem === 'muscular') layers.add('musculos');
    layers.forEach(showLayer);
    const st = storeGet();
    if ([...layers].some((l) => DEEP_LAYERS.has(l)) && !st.xray
        && ((st.layers.musculos && st.layers.musculos.visible) || (st.layers.pele && st.layers.pele.visible))) {
      emit(EVENTS.XRAY_SET, { enabled: true });
    }
    requestRender();
  }

  // ---- Teclado: + / − aproximam e afastam ----
  document.addEventListener('keydown', (evt) => {
    const t = evt.target;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (evt.key === '+' || evt.key === '=') emit('view:zoom', { factor: 0.8 });
    else if (evt.key === '-' || evt.key === '_') emit('view:zoom', { factor: 1.25 });
  });

  // ---- WebGL que não voltou: oferece recarregar ----
  on('renderer:context-failed', () => showFatal('O 3D parou de responder neste aparelho.'));

  // ---- Integridade dos modelos: manifest e GLB de versões diferentes ----
  on(EVENTS.SYSTEM_LOAD_DONE, ({ system, integrity }) => {
    if (!integrity || !integrity.total) return;
    if (integrity.missing / integrity.total > 0.05) {
      console.error(`[atlas] ${integrity.missing} de ${integrity.total} estruturas de "${system}" não estão no arquivo 3D (manifest desatualizado)`);
      emit('atlas:integrity-warning', { system, missing: integrity.missing, total: integrity.total });
      showNotice(`Parte do sistema ${systemLabel(system)} não carregou (${integrity.missing} de ${integrity.total} estruturas).`);
    }
  });

  // ---- "Desfazer" do Centralizar (js/ui/shell.js): guarda e repõe a câmera ----
  on('view:capture', (out) => {
    if (!out) return;
    out.camera = {
      position: camera.position.toArray(),
      target: controlsApi.controls.target.toArray(),
    };
  });
  on('view:restore', ({ camera: cam } = {}) => {
    if (!cam || !Array.isArray(cam.position) || !Array.isArray(cam.target)) return;
    camera.position.fromArray(cam.position);
    controlsApi.controls.target.fromArray(cam.target);
    controlsApi.controls.update();
    requestRender();
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
    quiz: () => Promise.all([
      import('./modes/quiz.js'),
      fetchJson(`${CONTENT_BASE}sid-aliases.json`).catch(() => ({})),
    ]).then(([m, aliases]) => m.createQuizMode({
      bus, store: storeApi, getLabel: labelFor,
      loadCases: () => fetchJson(`${CONTENT_BASE}quiz-cases.json`),
      resolveSid: (sid) => (aliases && aliases[sid]) || sid,
      systemOf: (sid) => {
        const rec = registry.getBySid(sid);
        const entry = contentStore.getEntry(sid);
        return (entry && entry.system) || (rec && rec.system) || null;
      },
      prepareCase: prepareQuizCase,
      // Confetes: 20 em aparelho bom, 5 no nível gráfico baixo, nenhum com
      // "reduzir movimento" ou com a chave desligada.
      confettiCount: () => {
        if (!ATLAS_FLAGS.confetti || prefersReducedMotion()) return 0;
        return rendererApi.getTier && rendererApi.getTier() === 'low' ? 5 : 20;
      },
      reducedMotion: prefersReducedMotion,
    })),
    fisiologia: () => Promise.all([
      import('./modes/physiology.js'),
      // Âncoras legadas de routes/processes → estrutura real ou ponto 3D
      // (gerado por scripts/atlas/build-anchor-map.mjs a partir de
      // data/atlas/anchor-spec.json).
      fetchJson(`${CONTENT_BASE}generated/anchor-map.json`).catch(() => ({ anchors: {} })),
    ]).then(([m, anchorMap]) => {
      const anchors = (anchorMap && anchorMap.anchors) || {};
      const liveCenter = (sid) => {
        const bbox = sid ? registry.getBBox(sid) : null;
        if (!bbox) return null;
        return [0, 1, 2].map((i) => (bbox.min[i] + bbox.max[i]) / 2);
      };
      // sid real que a âncora representa (para selecionar/destacar), ou null.
      const resolveAnchorSid = (key) => {
        const entry = anchors[key];
        if (entry) return entry.sid || null;
        return contentStore.getEntry(key) ? key : null;
      };
      // Ponto 3D da âncora: a estrutura carregada (bbox ao vivo) ou o ponto
      // pré-calculado — que não depende de o sistema estar baixado.
      const getAnchorPoint = (key) => {
        const entry = anchors[key];
        return liveCenter(entry ? entry.sid : key) || (entry ? entry.point : null);
      };
      return m.createPhysiologyMode({
        bus,
        registry,
        engine,
        THREE,
        getLabel: labelFor,
        getBBoxCenter: getAnchorPoint,
        resolveAnchorSid,
        // Enquadra um ou mais pontos (trajeto inteiro ou o ponto do passo).
        focusPoints: (points) => {
          if (!points || !points.length) return;
          const pad = 0.06;
          const min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])) - pad);
          const max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])) + pad);
          // Trajeto atrás do plano do corpo (coluna, raízes): olha por trás.
          const meanZ = points.reduce((acc, p) => acc + p[2], 0) / points.length;
          cameraRig.focusBox({ min, max }, meanZ < -0.025 ? { direction: [0, 0.15, -1] } : {});
        },
        loadProcesses: () => fetchJson(`${CONTENT_BASE}processes.json`).then((list) => (list || []).map((p) => ({
          ...p,
          // Passos com âncora própria no mapa ("<processo>:<ordem>"): vários
          // processos repetiam a MESMA âncora em todos os passos.
          steps: (p.steps || []).map((st) => {
            const key = `${p.id}:${st.order}`;
            return anchors[key] ? { ...st, anchors: [{ ...((st.anchors || [])[0] || {}), sid: key }] } : st;
          }),
        }))),
        loadRoutes: () => fetchJson(`${CONTENT_BASE}routes.json`),
      });
    }),
    farmacologia: () => import('./modes/pharmacology.js').then((m) => m.createPharmacologyMode({ bus, loadCompounds: () => fetchJson(`${CONTENT_BASE}compounds.json`) })),
    moleculas: () => import('./modes/molecules.js').then((m) => m.createMoleculesMode({ bus, loadProteins: () => fetchJson(`${CONTENT_BASE}proteins.json`) })),
    estudo: () => import('./modes/study.js').then(async (m) => {
      const studyStore = (await studyStorePromise) || (await import('./modes/study-store.js')).createStudyStore();
      return m.createStudyMode({ bus, store: studyStore, getLabel: labelFor, recordOwnHistory: false });
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

  // Progresso do quiz a retomar no próximo enter() do Quiz (resumeSession).
  let pendingQuizResume = null;
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
    const resumeFrom = modeId === 'quiz' ? pendingQuizResume : null;
    if (modeId === 'quiz') pendingQuizResume = null;
    try {
      await mode.enter({ registry, assetLoader, engine, contentStore, resumeFrom });
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

  // ---- Retomar de onde parou + link direto (#sid=…&view=…) ----
  // A sessão (seleção, camadas, modo, câmera) é gravada com atraso a cada
  // mudança; ao abrir sem link, oferece "Continuar" por 10 s.
  const sessionStorageApi = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const tabStorageApi = (() => { try { return window.sessionStorage; } catch (e) { return null; } })();
  const savedSession = dropUnknownSid(readSession(sessionStorageApi), (sid) => !!contentStore.getEntry(sid));
  let sessionSaveTimer = null;
  const scheduleSessionSave = () => {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(() => {
      const view = {};
      emit('view:capture', view);
      const quizMode = storeGet().mode === 'quiz' ? modeInstances.get('quiz') : null;
      const quiz = quizMode && quizMode.getProgress ? quizMode.getProgress() : null;
      writeSession(sessionStorageApi, snapshotSession(storeGet(), view.camera, Date.now(), quiz));
    }, 500);
  };
  storeSubscribe((st) => st.selectedSid, scheduleSessionSave);
  storeSubscribe((st) => st.layers, scheduleSessionSave);
  storeSubscribe((st) => st.mode, scheduleSessionSave);
  controlsApi.controls.addEventListener('end', scheduleSessionSave);
  on(EVENTS.QUIZ_ANSWER, scheduleSessionSave);

  async function resumeSession(saved) {
    const layers = storeGet().layers;
    const next = { ...layers };
    for (const [id, visible] of Object.entries(saved.layers || {})) {
      if (next[id] && next[id].visible !== visible) next[id] = { ...next[id], visible };
    }
    storeSet({ layers: next });
    for (const id of Object.keys(next)) {
      if (next[id] !== layers[id]) emit(EVENTS.LAYER_SET, { layer: id, visible: next[id].visible, opacity: next[id].opacity });
    }
    if (saved.mode === 'quiz' && saved.quiz) pendingQuizResume = saved.quiz;
    if (saved.mode && saved.mode !== storeGet().mode) window.AtlasShell.setMode(saved.mode);
    if (saved.selectedSid && contentStore.getEntry(saved.selectedSid)) {
      emit(EVENTS.STRUCTURE_SELECT, { sid: saved.selectedSid, source: 'resume' });
      await revealAndFocus(saved.selectedSid, { focus: !saved.camera });
    }
    if (saved.camera) emit('view:restore', { camera: saved.camera });
  }

  function openFromHash() {
    const link = parseAtlasHash(window.location.hash);
    if (!link.sid || !contentStore.getEntry(link.sid)) return false;
    if (link.view) emit(EVENTS.VIEW_PRESET, { name: link.view });
    emit(EVENTS.STRUCTURE_SELECT, { sid: link.sid, source: 'link' });
    return true;
  }
  window.addEventListener('hashchange', openFromHash);
  if (!openFromHash() && savedSession && !resumeAlreadyOffered(tabStorageApi)) {
    markResumeOffered(tabStorageApi);
    const name = savedSession.selectedSid ? labelFor(savedSession.selectedSid) : null;
    offerAction(name ? `Continuar de onde parou? (${name})` : 'Continuar de onde parou?', 'Continuar',
      () => { resumeSession(savedSession); }, 10000);
  }

  // ---- Botão Voltar do celular (Android) ----
  // Cada "abertura" (ficha selecionada, painel em tela cheia) ganha uma
  // entrada no histórico marcada { atlas: true }; Voltar fecha o que estiver
  // aberto, do mais aberto para o menos: cheio → metade → espiar → limpa a
  // seleção. Se não houver nada a fechar numa entrada nossa, segue voltando
  // (nunca prende o aluno). O iframe divide o histórico com a aba, então o
  // Voltar da página da plataforma passa por aqui primeiro.
  let backDepth = 0;
  const pushBack = (kind) => {
    if (!isMobileViewport() || backDepth >= 3) return;
    try { history.pushState({ atlas: true, kind }, ''); backDepth += 1; } catch (e) { /* sandbox */ }
  };
  on(EVENTS.STRUCTURE_SELECT, ({ sid }) => { if (sid && backDepth === 0) pushBack('select'); });
  on(EVENTS.SHEET_SNAP, ({ state }) => { if (state === 'full' && backDepth < 2 && storeGet().selectedSid) pushBack('full'); });
  window.addEventListener('popstate', () => {
    if (backDepth > 0) backDepth -= 1;
    if (!isMobileViewport()) return;
    const sheetState = getSheetState().state;
    if (sheetState === 'full') { snapSheetTo('half'); return; }
    if (storeGet().selectedSid) {
      if (sheetState === 'half') snapSheetTo('peek');
      emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'back' });
      return;
    }
    if (history.state && history.state.atlas) history.back();
  });

  // ---- Apresentação (3 telas) e dicas contextuais ----
  let hints = null;
  const onboarding = createOnboarding({
    storage: sessionStorageApi,
    session: tabStorageApi,
    onQuiz: () => window.AtlasShell.setMode('quiz'),
    onClose: () => { if (hints) hints.flush(); },
  });
  window.AtlasShell.openOnboarding = () => onboarding.open({ replay: true });
  if (ATLAS_FLAGS.hints) {
    hints = createHints({ bus, store: storeApi, storage: sessionStorageApi, isOnboardingOpen: () => onboarding.isOpen() });
  }
  if (ATLAS_FLAGS.onboarding && shouldShowOnboarding(sessionStorageApi)
      && !isDeepLink(window.location.hash) && !wasDismissedThisTab(tabStorageApi)) {
    // 1,5 s depois do primeiro quadro: o aluno vê o corpo antes da apresentação.
    setTimeout(() => {
      if (!document.getElementById('atlas-fatal') && !isDeepLink(window.location.hash)) onboarding.open();
    }, 1500);
  }

  // ---- Expõe internals para a camada de compatibilidade legada ----
  window.__atlasInternals = {
    bus, store: storeApi, registry, assetLoader, engine,
    selection, visibility, contentStore, searchBox, loadSystem, labelFor, DEFAULT_SYSTEMS, BACKGROUND_SYSTEMS, flags: ATLAS_FLAGS,
    onboarding, getHints: () => hints, navigator: navigatorApi, labels,
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
  showFatal((e && e.userMessage) || 'O Atlas não conseguiu iniciar.', (e && e.hint) || undefined);
});
