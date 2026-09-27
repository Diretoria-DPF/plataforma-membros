/**
 * registry.js — índice vivo de estruturas do Atlas v2 (Onda 1, WP05)
 * ---------------------------------------------------------------------------
 * Implementa a interface `Registry` de `js/core/contracts.js`: liga cada
 * `sid` a um (ou mais) `THREE.Mesh` da cena, a partir do mapa `nodeToSid`
 * que vem de `models/manifest.json` (ver `js/engine/assets.js`, que chama
 * `registerSystem`/`registerOrganDetail` aqui quando um GLB termina de
 * carregar — a ligação entre os dois pacotes não está em `contracts.js`,
 * então documentamos a convenção no relatório final do WP05).
 *
 * Estratégia de renderização — POR QUE malha-por-estrutura, não BatchedMesh:
 * cada fixture (e o pipeline real, ver plano §3 passo 2 "um nó por
 * estrutura") já entrega um nó glTF por estrutura anatômica, sem malha
 * compartilhada entre nós. `THREE.BatchedMesh` (novo no r186) exigiria
 * `addGeometry`/`setGeometryAt` por estrutura, geometria variável por
 * malha (não instâncias do mesmo geo), e sua API de cor/visibilidade por
 * instância (`setColorAt`/`setVisibleAt`) e de picking
 * (`raycast` sobre o batch, sem `intersectObjects` por sid direto) ainda
 * não foram validadas por nós como confiáveis dentro do orçamento desta
 * onda — o risco de picking errado ou de vazar seleção entre estruturas é
 * maior que o ganho de draw calls no tamanho atual dos sistemas (dezenas de
 * nós por GLB, não milhares). Por isso: **malha por estrutura**, com **um
 * `THREE.Material` compartilhado por camada** (ou por camada+variante, ver
 * `classifyStructure` — vasos usa duas variantes, artéria/veia) — isto já
 * mantém o número de instâncias de material baixo (uma por camada, não uma
 * por estrutura) sem herdar os riscos do BatchedMesh. Um material por sid é
 * clonado só sob demanda (copy-on-write) quando `setColor`/`setOpacity`/
 * `setHighlight` precisam de um valor que não é o da camada inteira.
 * `stats()` relata os draw calls medidos (via `engine.renderer.info`) para o
 * orçamento de 150 poder ser conferido nas fixtures — ver relatório do WP05.
 *
 * GAP de contrato (relatado ao orquestrador): `Registry.getBySid` em
 * `contracts.js` documenta que o retorno inclui "nomes" — este arquivo não
 * tem acesso a `data/atlas/index.json` (isso é `ContentStore`, outro
 * pacote/onda) e portanto não devolve nomes; devolve só o que o Registry
 * realmente possui (sid, system, layer, sexo, lod, nó, bbox).
 */

import * as THREE from '../../vendor/three/three.module.js';
import { EVENTS } from '../core/bus.js';
import { LAYER_IDS } from '../core/contracts.js';

// ============================================================================
// Heurística sistema → camada (aproximação documentada — ver GAP acima: o
// Registry não lê data/atlas/index.json, então não conhece a camada "oficial"
// de cada sid; deriva uma camada plausível a partir do sistema e, para o
// cardiovascular, do nome do nó). Confirmado contra data/atlas/fixtures/
// index.json (WP02): bate 100% para os 12 sistemas das fixtures.
// ============================================================================
const SYSTEM_LAYER_DEFAULT = Object.freeze({
  esqueletico: 'esqueleto',
  articular: 'esqueleto',
  muscular: 'musculos',
  tegumentar: 'pele',
  cardiovascular: 'vasos', // sobrescrito por nó para coração → visceras (ver classifyStructure)
  respiratorio: 'visceras',
  digestorio: 'visceras',
  urinario: 'visceras',
  reprodutor: 'visceras',
  endocrino: 'visceras',
  linfatico: 'linfatico',
  nervoso: 'nervos',
});

// Nomes de nó (Z-Anatomy/fixtures, em pt-BR) que são o próprio coração/
// câmaras/valvas — ficam na camada "visceras", não "vasos", mesmo dentro do
// sistema cardiovascular (bate com data/atlas/fixtures/index.json).
const HEART_NODE_PATTERN = /^coracao$|^atrio-|^ventriculo-|^valva-/;
// Nomes de nó que são veias (cor azul) dentro da camada "vasos" — o resto
// (aorta, artérias) usa a cor de artéria (vermelho). Convenção de atlas
// impresso citada em docs/ATLAS_UX_SPEC.md §9.
const VEIN_NODE_PATTERN = /veia|jugular|cava/;

const LAYER_COLOR_VAR = Object.freeze({
  pele: '--atlas-color-pele',
  musculos: '--atlas-color-musculos',
  esqueleto: '--atlas-color-esqueleto',
  visceras: '--atlas-color-visceras',
  'vasos-arteria': '--atlas-color-vasos-arteria',
  'vasos-veia': '--atlas-color-vasos-veia',
  nervos: '--atlas-color-nervos',
  linfatico: '--atlas-color-linfatico',
});

const HIGHLIGHT_COLOR_VAR = '--atlas-color-highlight';
const FALLBACK_COLOR = '#9aa5bb';
const FALLBACK_HIGHLIGHT = '#4c8bf5';

/** Índice (0..6) de cada camada em LAYER_IDS — usado só para `renderOrder`
 * (estruturas mais profundas ordenam depois, para a transparência do raio-X
 * empilhar visualmente na ordem certa). */
const LAYER_ORDER = Object.freeze(
  LAYER_IDS.reduce((acc, id, i) => {
    acc[id] = i;
    return acc;
  }, {})
);

/**
 * Lê uma variável CSS `--atlas-color-*` do documento (tema ativo já
 * resolvido pelo navegador — ver `html[data-theme]`/`prefers-color-scheme`
 * em `css/tokens-atlas.css`). Sem `document` (ex.: teste em Node) devolve o
 * fallback.
 * @param {string} cssVar
 * @param {string} fallback
 * @returns {string}
 */
function readCssColor(cssVar, fallback) {
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

/**
 * Decide a camada + a chave de material (algumas camadas têm mais de uma
 * variante de cor, ex. vasos) para um nó de um sistema.
 * @param {string} system
 * @param {string} nodeName
 * @returns {{ layer: string, materialKey: string, colorVar: string }}
 */
function classifyStructure(system, nodeName) {
  if (system === 'cardiovascular') {
    if (HEART_NODE_PATTERN.test(nodeName)) {
      return { layer: 'visceras', materialKey: 'visceras', colorVar: LAYER_COLOR_VAR.visceras };
    }
    const isVein = VEIN_NODE_PATTERN.test(nodeName);
    const materialKey = isVein ? 'vasos-veia' : 'vasos-arteria';
    return { layer: 'vasos', materialKey, colorVar: LAYER_COLOR_VAR[materialKey] };
  }
  const layer = SYSTEM_LAYER_DEFAULT[system] || 'visceras';
  return { layer, materialKey: layer, colorVar: LAYER_COLOR_VAR[layer] || null };
}

/**
 * Junta todas as malhas descendentes de `node` (inclusive ele mesmo, se já
 * for uma malha) — nas fixtures/pipeline atual cada nó já É a malha (um nó
 * por estrutura, ver plano §3), mas um GLB futuro pode agrupar sub-malhas
 * sob um nó (ex.: "costelas" com 12 ossos) sem que isso quebre o Registry.
 * @param {THREE.Object3D} node
 * @returns {THREE.Mesh[]}
 */
function collectMeshes(node) {
  const meshes = [];
  node.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

/**
 * @param {{ engine: import('../core/contracts.js').Engine, bus: Object }} deps
 * @returns {import('../core/contracts.js').Registry}
 */
export function createRegistry({ engine, bus } = {}) {
  if (!engine || !engine.scene) throw new Error('createRegistry: engine.scene é obrigatório');

  /** @type {Map<string, Object>} sid → registro interno */
  const structures = new Map();
  /** @type {Map<string, Set<string>>} systemId → conjunto de sids */
  const bySystem = new Map();
  /** @type {Map<string, THREE.Object3D>} systemId → raiz do GLB na cena */
  const systemRoots = new Map();
  /** @type {Map<string, { root: THREE.Object3D, sids: string[] }>} sid do
   * órgão-pai → grupo destacado do HRA (ver AssetLoader.loadOrganDetail) */
  const organDetailGroups = new Map();
  /** @type {Map<string, THREE.MeshStandardMaterial>} materialKey → material
   * compartilhado por camada/variante (copy-on-write por estrutura). */
  const layerMaterials = new Map();
  /** @type {THREE.Mesh[]} lista achatada para picking — refeita a cada
   * registro/remoção (poucas centenas de malhas: refazer é barato). */
  let pickables = [];
  const raycaster = new THREE.Raycaster();

  function rebuildPickables() {
    pickables = [];
    for (const rec of structures.values()) {
      for (const mesh of rec.meshes) pickables.push(mesh);
    }
  }

  /**
   * @param {string} materialKey
   * @param {string|null} colorVar
   * @returns {THREE.MeshStandardMaterial}
   */
  function getLayerMaterial(materialKey, colorVar) {
    let mat = layerMaterials.get(materialKey);
    if (!mat) {
      const color = colorVar ? readCssColor(colorVar, FALLBACK_COLOR) : FALLBACK_COLOR;
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
      mat.userData.atlasColorVar = colorVar;
      layerMaterials.set(materialKey, mat);
    }
    return mat;
  }

  /** Relê `--atlas-color-*` de todos os materiais de camada já criados —
   * assinado em `theme:change` (ver fim da função). */
  function refreshLayerColors() {
    let changed = false;
    for (const mat of layerMaterials.values()) {
      const cssVar = mat.userData.atlasColorVar;
      if (!cssVar) continue;
      const color = readCssColor(cssVar, FALLBACK_COLOR);
      if (mat.color.getStyle() !== color) {
        mat.color.set(color);
        changed = true;
      }
    }
    // Estruturas com cor própria (setColor) não seguem o tema — só as que
    // ainda usam a cor "de fábrica" da camada precisam ser tocadas; como o
    // material em si já mudou de cor (é compartilhado), nada mais a fazer
    // aqui além de pedir um novo frame.
    if (changed && engine.requestRender) engine.requestRender();
  }

  if (bus && typeof bus.on === 'function') {
    bus.on(EVENTS.THEME_CHANGE, refreshLayerColors);
  }

  /**
   * Garante que `rec.meshes[*].material` seja uma instância exclusiva desta
   * estrutura (clonada do material de camada na primeira escrita). Idempotente.
   * @param {Object} rec
   */
  function ensureOwnMaterial(rec) {
    if (rec.ownMaterial) return rec.ownMaterial;
    const shared = rec.meshes[0] ? rec.meshes[0].material : getLayerMaterial(rec.materialKey, rec.colorVar);
    const own = shared.clone();
    own.transparent = shared.opacity < 1;
    for (const mesh of rec.meshes) mesh.material = own;
    rec.ownMaterial = own;
    return own;
  }

  /**
   * @param {THREE.Object3D} node
   * @returns {{ min: [number, number, number], max: [number, number, number] }}
   */
  function computeWorldBBox(node) {
    const box = new THREE.Box3().setFromObject(node);
    return {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    };
  }

  /** @param {Object} rec @returns {Object} metadados públicos (forma do Registry). */
  function toPublic(rec) {
    return {
      sid: rec.sid,
      system: rec.system,
      layer: rec.layer,
      sex: rec.sex,
      lod: rec.lod,
      side: rec.side,
      node: rec.node,
      esquematico: !!rec.esquematico,
      visible: rec.visible,
      opacity: rec.opacity,
      highlighted: rec.highlighted,
    };
  }

  /**
   * Registra as estruturas de um sistema recém-carregado (chamado por
   * `js/engine/assets.js` ao terminar `loadSystem`). Adiciona `root` à cena
   * do motor e liga cada entrada de `nodeToSid` a um registro interno.
   * @param {string} system
   * @param {{ root: THREE.Object3D, nodeToSid: Record<string,string>, sex: string, lod: string, asset?: Object, esquematico?: boolean }} data
   */
  function registerSystem(system, { root, nodeToSid, sex, lod, esquematico } = {}) {
    if (!root || !nodeToSid) return;
    unregisterSystem(system); // idempotente: troca por uma versão nova do mesmo sistema
    engine.scene.add(root);
    systemRoots.set(system, root);
    const sids = new Set();
    for (const [nodeName, sid] of Object.entries(nodeToSid)) {
      // GAP (relatado ao orquestrador — WP13): `THREE.GLTFLoader` sanitiza
      // o nome do nó ao carregar (remove "." — reservado para paths de
      // animação, ver PropertyBinding), então um nó como "Incus.l" chega
      // à cena como "Incusl" (grupo) com "Incus"/"Incus_1" como filhos
      // (um por primitiva do mesh) — nunca como "Incus.l" literal. O
      // manifesto (models/manifest.json) registra o nome ORIGINAL do
      // arquivo-fonte, então o pareamento exato falha para todo sid cujo
      // nó tem "." no nome. Tenta a versão sanitizada antes de desistir.
      const sanitized = nodeName.replace(/\s+/g, '_').replace(/\./g, '');
      const node = root.getObjectByName(nodeName) || root.getObjectByName(sanitized);
      if (!node) {
        // eslint-disable-next-line no-console
        console.warn(`[atlas/registry] nó "${nodeName}" (sid ${sid}) não encontrado no GLB de "${system}" — nodeToSid do manifest está desalinhado com o arquivo.`);
        continue;
      }
      const meshes = collectMeshes(node);
      if (!meshes.length) {
        // eslint-disable-next-line no-console
        console.warn(`[atlas/registry] nó "${nodeName}" (sid ${sid}) não tem nenhuma malha — ignorado.`);
        continue;
      }
      const { layer, materialKey, colorVar } = classifyStructure(system, nodeName);
      const material = getLayerMaterial(materialKey, colorVar);
      for (const mesh of meshes) {
        mesh.material = material;
        mesh.userData.sid = sid;
        mesh.renderOrder = LAYER_ORDER[layer] || 0;
      }
      const side = /-direit[ao]$/.test(nodeName) ? 'R' : /-esquerd[ao]$/.test(nodeName) ? 'L' : undefined;
      structures.set(sid, {
        sid, system, layer, materialKey, colorVar, sex, lod, node, meshes, side,
        esquematico: !!esquematico,
        visible: true, opacity: 1, highlighted: false, ownMaterial: null,
        bboxCache: null,
      });
      sids.add(sid);
    }
    bySystem.set(system, sids);
    rebuildPickables();
    if (engine.requestRender) engine.requestRender();
  }

  /**
   * Remove um sistema da cena e libera GPU (geometrias — os materiais só
   * são liberados se forem exclusivos da estrutura, nunca o material
   * compartilhado da camada, que outras estruturas ainda usam).
   * @param {string} system
   */
  function unregisterSystem(system) {
    const sids = bySystem.get(system);
    const root = systemRoots.get(system);
    if (sids) {
      for (const sid of sids) {
        const rec = structures.get(sid);
        if (!rec) continue;
        for (const mesh of rec.meshes) {
          if (mesh.geometry) mesh.geometry.dispose();
        }
        if (rec.ownMaterial) rec.ownMaterial.dispose();
        structures.delete(sid);
      }
    }
    if (root) {
      engine.scene.remove(root);
      systemRoots.delete(system);
    }
    bySystem.delete(system);
    rebuildPickables();
    if (engine.requestRender) engine.requestRender();
  }

  /**
   * Registra um grupo destacado do HRA (detalhe de órgão) — NÃO entra na
   * cena principal (`engine.scene`); quem usa a vista "Detalhe do órgão"
   * decide onde/quando anexá-lo. As subestruturas ficam disponíveis via
   * `getBySid`/`iterate` como qualquer outra, marcadas com o sid do órgão-
   * pai em `organDetailGroups` para quem precisar limpar depois.
   * @param {string} parentSid
   * @param {{ root: THREE.Object3D, nodeToSid: Record<string,string>, asset?: Object }} data
   */
  function registerOrganDetail(parentSid, { root, nodeToSid } = {}) {
    if (!root || !nodeToSid) return;
    unregisterOrganDetail(parentSid);
    const parentRec = structures.get(parentSid);
    const system = parentRec ? parentRec.system : 'hra';
    const sids = [];
    for (const [nodeName, sid] of Object.entries(nodeToSid)) {
      const node = root.getObjectByName(nodeName);
      if (!node) continue;
      const meshes = collectMeshes(node);
      if (!meshes.length) continue;
      const { layer, materialKey, colorVar } = classifyStructure(system, nodeName);
      const material = getLayerMaterial(materialKey, colorVar);
      for (const mesh of meshes) {
        mesh.material = material;
        mesh.userData.sid = sid;
      }
      structures.set(sid, {
        sid, system, layer, materialKey, colorVar, sex: parentRec ? parentRec.sex : 'U', lod: 'lod0',
        node, meshes, side: undefined, esquematico: false,
        visible: true, opacity: 1, highlighted: false, ownMaterial: null, bboxCache: null,
        organDetailOf: parentSid,
      });
      sids.push(sid);
    }
    organDetailGroups.set(parentSid, { root, sids });
    // Detalhe de órgão fica fora de `pickables`/`bySystem` por padrão — só
    // entra no picking se/quando o chamador anexar `root` a `engine.scene`
    // (nesse caso chama `rebuildPickables()` de novo através de qualquer
    // outra chamada pública, ou o chamador usa `iterate()`/`getBySid`
    // diretamente, que não dependem de `pickables`).
    return { root, sids };
  }

  /** @param {string} parentSid */
  function unregisterOrganDetail(parentSid) {
    const group = organDetailGroups.get(parentSid);
    if (!group) return;
    for (const sid of group.sids) {
      const rec = structures.get(sid);
      if (!rec) continue;
      for (const mesh of rec.meshes) {
        if (mesh.geometry) mesh.geometry.dispose();
      }
      if (rec.ownMaterial) rec.ownMaterial.dispose();
      structures.delete(sid);
    }
    if (group.root.parent) group.root.parent.remove(group.root);
    organDetailGroups.delete(parentSid);
  }

  // --------------------------------------------------------------------
  // API pública (Registry — js/core/contracts.js)
  // --------------------------------------------------------------------

  /** @type {import('../core/contracts.js').Registry['getBySid']} */
  function getBySid(sid) {
    const rec = structures.get(sid);
    return rec ? toPublic(rec) : null;
  }

  /** @type {import('../core/contracts.js').Registry['getBySystem']} */
  function getBySystem(systemId) {
    const sids = bySystem.get(systemId);
    if (!sids) return [];
    const out = [];
    for (const sid of sids) {
      const rec = structures.get(sid);
      if (rec) out.push(toPublic(rec));
    }
    return out;
  }

  /** @type {import('../core/contracts.js').Registry['getBBox']} */
  function getBBox(sid) {
    const rec = structures.get(sid);
    if (!rec) return null;
    if (!rec.bboxCache) rec.bboxCache = computeWorldBBox(rec.node);
    return rec.bboxCache;
  }

  /** @type {import('../core/contracts.js').Registry['setVisible']} */
  function setVisible(sid, visible) {
    const rec = structures.get(sid);
    if (!rec) return;
    rec.visible = !!visible;
    for (const mesh of rec.meshes) mesh.visible = !!visible;
    if (engine.requestRender) engine.requestRender();
  }

  /** @type {import('../core/contracts.js').Registry['setOpacity']} */
  function setOpacity(sid, opacity) {
    const rec = structures.get(sid);
    if (!rec) return;
    const value = Math.max(0, Math.min(1, opacity));
    rec.opacity = value;
    const mat = ensureOwnMaterial(rec);
    mat.opacity = value;
    mat.transparent = value < 1;
    // Orçamento de desempenho/UX §"Opacidade": depthWrite desliga com
    // transparência para o z-sort não "vazar" através de estruturas semi-
    // transparentes; renderOrder por camada garante a ordem visual (mais
    // profundo desenha depois) mesmo com depthWrite desligado.
    mat.depthWrite = value >= 1;
    for (const mesh of rec.meshes) mesh.renderOrder = value < 1 ? 100 + LAYER_ORDER[rec.layer] : LAYER_ORDER[rec.layer] || 0;
    if (engine.requestRender) engine.requestRender();
  }

  /** @type {import('../core/contracts.js').Registry['setColor']} */
  function setColor(sid, color) {
    const rec = structures.get(sid);
    if (!rec) return;
    if (color === null) {
      if (rec.ownMaterial) {
        const base = rec.colorVar ? readCssColor(rec.colorVar, FALLBACK_COLOR) : FALLBACK_COLOR;
        rec.ownMaterial.color.set(base);
      }
    } else {
      const mat = ensureOwnMaterial(rec);
      mat.color.set(color);
    }
    if (engine.requestRender) engine.requestRender();
  }

  /**
   * Realce (independe de camada) — usado pela seleção (WP06) e pelo Quiz.
   * Guarda a cor anterior do material próprio para restaurar exatamente ao
   * desligar (não assume que era a cor "de fábrica" da camada).
   * @param {string} sid
   * @param {boolean} on
   */
  function setHighlight(sid, on) {
    const rec = structures.get(sid);
    if (!rec) return;
    if (on === rec.highlighted) return;
    const mat = ensureOwnMaterial(rec);
    if (on) {
      rec.highlightPrevColor = '#' + mat.color.getHexString();
      mat.color.set(readCssColor(HIGHLIGHT_COLOR_VAR, FALLBACK_HIGHLIGHT));
      rec.highlighted = true;
    } else {
      if (rec.highlightPrevColor) mat.color.set(rec.highlightPrevColor);
      rec.highlighted = false;
    }
    if (engine.requestRender) engine.requestRender();
  }

  /** @type {import('../core/contracts.js').Registry['iterate']} */
  function iterate() {
    const values = structures.values();
    return {
      [Symbol.iterator]() {
        return {
          next() {
            const { value, done } = values.next();
            return done ? { value: undefined, done: true } : { value: toPublic(value), done: false };
          },
        };
      },
    };
  }

  /**
   * Raycast a partir de um ponto de tela normalizado ([-1,1], ver
   * `contracts.js` `ScreenPoint`). Ignora estruturas invisíveis e, quando o
   * material tem `clippingPlanes` (plano de corte, WP06 `xray-clip.js`),
   * descarta acertos do lado "cortado" do plano.
   * @type {import('../core/contracts.js').Registry['pick']}
   */
  function pick(point, camera) {
    if (!camera || !pickables.length) return null;
    raycaster.setFromCamera(point, camera);
    const visiblePickables = pickables.filter((m) => m.visible);
    const hits = raycaster.intersectObjects(visiblePickables, false);
    for (const hit of hits) {
      const planes = hit.object.material && hit.object.material.clippingPlanes;
      if (planes && planes.length) {
        const clipped = planes.some((plane) => plane.distanceToPoint(hit.point) < 0);
        if (clipped) continue;
      }
      const sid = hit.object.userData && hit.object.userData.sid;
      if (sid) return sid;
    }
    return null;
  }

  /**
   * Estatísticas para o orçamento de desempenho (docs/ATLAS_UX_SPEC.md §17
   * — até 150 draw calls no celular). Usa `renderer.info` (contagem real do
   * último frame) quando disponível; senão estima pelo nº de malhas
   * visíveis (1 malha ≈ 1 draw call nesta estratégia sem BatchedMesh).
   */
  function stats() {
    let visibleMeshes = 0;
    for (const mesh of pickables) if (mesh.visible) visibleMeshes += 1;
    const rendererInfo = engine.renderer && engine.renderer.info && engine.renderer.info.render;
    return {
      structures: structures.size,
      meshes: pickables.length,
      visibleMeshes,
      materials: layerMaterials.size,
      drawCalls: rendererInfo ? rendererInfo.calls : visibleMeshes,
      triangles: rendererInfo ? rendererInfo.triangles : undefined,
    };
  }

  return {
    getBySid,
    getBySystem,
    getBBox,
    setVisible,
    setOpacity,
    setColor,
    setHighlight,
    iterate,
    pick,
    stats,
    // Extensões usadas por js/engine/assets.js e js/engine/fallback.js —
    // não fazem parte da forma mínima checada por `isRegistry()`, mas
    // precisam ser públicas para a ligação entre pacotes funcionar.
    registerSystem,
    unregisterSystem,
    registerOrganDetail,
    unregisterOrganDetail,
  };
}
