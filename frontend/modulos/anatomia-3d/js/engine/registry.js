/**
 * registry.js — índice vivo de estruturas do Atlas v2 (Onda 2, WP-BATCH)
 * ---------------------------------------------------------------------------
 * Implementa a interface `Registry` de `js/core/contracts.js`: liga cada
 * `sid` a uma malha (ou instância de malha) da cena, a partir do mapa
 * `nodeToSid` que vem de `models/manifest.json` (ver `js/engine/assets.js`,
 * que chama `registerSystem`/`registerOrganDetail` aqui quando um GLB
 * termina de carregar).
 *
 * Estratégia de renderização — BatchedMesh por camada de material:
 * cada sistema carregado ainda entrega um nó glTF por estrutura anatômica
 * (sem malha compartilhada entre nós), mas em vez de manter uma
 * `THREE.Mesh` própria por estrutura na cena (1 draw call por estrutura —
 * ~900 no total dos sistemas padrão), agora cada geometria de estrutura é
 * inserida como uma "geometria única + 1 instância" dentro de um
 * `THREE.BatchedMesh` compartilhado por camada/variante de material (o
 * mesmo agrupamento que já existia para os materiais: pele, músculos,
 * esqueleto, vísceras, vasos-artéria, vasos-veia, nervos, linfático — ver
 * `classifyStructure`). Isso reduz o número de objetos desenhados de "1 por
 * estrutura" para "1 por camada" (orçamento de 150 draw calls, docs/
 * ATLAS_UX_SPEC.md §17), usando a extensão `WEBGL_multi_draw` (nativa no
 * Chromium/ANGLE) para emitir o batch inteiro numa única chamada.
 *
 * Seleção, visibilidade, raio-X e picking por instância usam a API nativa
 * do `BatchedMesh` (r186): `setVisibleAt`/`setColorAt` (cor E alfa, via
 * `THREE.Vector4`) para destaque/opacidade/fantasma por estrutura, e
 * `raycast()` (que devolve `intersect.batchId` = id da instância) para o
 * picking — sem precisar de material próprio por estrutura. O material do
 * batch fica branco (a cor real é 100% por instância, via
 * `batchingColorTexture`); isso também é o que torna o tema (claro/escuro)
 * e o realce de seleção baratos: não há mais "clonar material sob
 * demanda", só reescrever a cor/alfa da instância.
 *
 * `registerOrganDetail` (detalhe de órgão do HRA) continua com **malha por
 * estrutura** — não participa do orçamento de draw calls do carregamento
 * padrão (seu `root` nunca é anexado à cena principal por este módulo; ver
 * `AssetLoader.loadOrganDetail`) e o volume de estruturas por chamada é
 * pequeno, então o ganho de o rebatchar não compensa a complexidade extra
 * de gerência dum material próprio por camada convivendo com um batch
 * compartilhado. Mantém a estratégia "1 material por camada, clonado sob
 * demanda (copy-on-write) por estrutura" que o Registry já usava antes
 * deste WP.
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

// Margem de crescimento aplicada ao redimensionar um BatchedMesh de camada
// (instâncias/vértices/índices) além do exigido pelo lote atual — evita
// redimensionar a cada sistema carregado quando o próximo é parecido em
// tamanho (ver `ensureLayerBatch`).
const BATCH_GROWTH_FACTOR = 1.25;
const BATCH_MIN_INSTANCES = 16;
const BATCH_MIN_VERTICES = 256;

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
 * por estrutura), mas um GLB futuro pode agrupar sub-malhas sob um nó
 * (ex.: "costelas" com 12 ossos) sem que isso quebre o Registry — cada
 * sub-malha se torna sua própria geometria+instância no batch da camada,
 * todas marcadas com o mesmo `sid`.
 * @param {THREE.Object3D} node
 * @returns {THREE.Mesh[]}
 */
/**
 * Órgãos do HRA (sids "za:vh-*", nós "VH_M_*"/"VH_F_*") chegam no
 * referencial do corpo de referência do HRA, deslocado 0,81 m para baixo em
 * relação ao Z-Anatomy — o coração aparecia na altura do joelho e o fígado
 * na canela. Medido com as próprias malhas (mesma escala, mesmo eixo):
 *   - topo da face diafragmática do fígado (HRA): y = 0,43 → cúpula direita
 *     do diafragma (Z-Anatomy): y ≈ 1,24;
 *   - coração (HRA) y 0,42–0,52 → 1,23–1,33: apoiado no diafragma, abaixo
 *     do manúbrio (1,35), face anterior logo atrás do corpo do esterno.
 * TODO(pipeline): aplicar esta translação em tools/atlas-pipeline ao gerar
 * os GLBs e remover daqui.
 */
const HRA_SID_RE = /^za:vh-/;
const HRA_TO_ZANATOMY_OFFSET = Object.freeze([0, 0.81, 0]);

function alignHraNode(node) {
  if (node.userData.hraAligned) return;
  const delta = new THREE.Vector3(...HRA_TO_ZANATOMY_OFFSET);
  if (node.parent) {
    // Deslocamento em coordenadas de mundo → espaço local do pai.
    const parentInv = new THREE.Matrix4().copy(node.parent.matrixWorld).invert();
    delta.applyMatrix3(new THREE.Matrix3().setFromMatrix4(parentInv));
  }
  node.position.add(delta);
  node.updateMatrixWorld(true);
  node.userData.hraAligned = true;
}

function collectMeshes(node) {
  const meshes = [];
  node.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

/**
 * Extrai uma geometria "limpa" (apenas `position`/`normal`/índice) de uma
 * malha de origem, para inserir num `THREE.BatchedMesh` de camada. Só esses
 * atributos importam para os materiais de camada (`MeshStandardMaterial`
 * sem textura) — normalizar assim evita que `BatchedMesh._validateGeometry`
 * rejeite uma geometria por ter (ou não ter) atributos extras (UV, tangente,
 * skinning, cor de vértice) que variam entre a origem real (glTF) e a de
 * contingência (`js/engine/fallback.js`, formas primitivas do three.js),
 * quando ambas acabam compartilhando a mesma camada/materialKey.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry|null}
 */
function sanitizeGeometryForBatch(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return null;
  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', position);
  let normal = geometry.getAttribute('normal');
  if (!normal) {
    geometry.computeVertexNormals();
    normal = geometry.getAttribute('normal');
  }
  if (normal) clean.setAttribute('normal', normal);
  const index = geometry.getIndex();
  if (index) clean.setIndex(index);
  return clean;
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
  /** @type {Map<string, { root: THREE.Object3D, sids: string[] }>} sid do
   * órgão-pai → grupo destacado do HRA (ver AssetLoader.loadOrganDetail) */
  const organDetailGroups = new Map();

  /** @type {Map<string, THREE.BatchedMesh>} materialKey → batch da camada
   * (compartilhado por todos os sistemas que usam essa camada/variante). */
  const layerBatches = new Map();
  /** @type {Map<string, {maxVertexCount: number, maxIndexCount: number}>}
   * materialKey → capacidade atual do batch (o próprio BatchedMesh não
   * expõe o máximo publicamente, só o não-usado — ver `ensureLayerBatch`). */
  const layerBatchCapacity = new Map();
  /** @type {Map<string, THREE.MeshStandardMaterial>} materialKey → material
   * branco compartilhado do batch (a cor real é por instância). */
  const layerMaterials = new Map();
  /** @type {Map<string, THREE.MeshStandardMaterial>} materialKey → material
   * (colorido) usado só por `registerOrganDetail`, clonado sob demanda por
   * estrutura (copy-on-write) como no Registry pré-batching. */
  const organMaterials = new Map();

  /** @type {(THREE.BatchedMesh|THREE.Mesh)[]} lista achatada para picking —
   * refeita a cada registro/remoção. */
  let pickables = [];
  const raycaster = new THREE.Raycaster();

  function rebuildPickables() {
    const set = new Set();
    for (const rec of structures.values()) {
      if (rec.instances) {
        for (const inst of rec.instances) set.add(inst.batch);
      } else if (rec.meshes) {
        for (const mesh of rec.meshes) set.add(mesh);
      }
    }
    pickables = Array.from(set);
  }

  /** @param {string} materialKey @returns {THREE.MeshStandardMaterial} */
  function getBatchMaterial(materialKey) {
    let mat = layerMaterials.get(materialKey);
    if (!mat) {
      // Branco: a cor visível de cada estrutura vem 100% da cor por
      // instância do BatchedMesh (`setColorAt`), nunca do material.
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true, // instâncias podem ter alfa < 1 (fantasma/opacidade)
      });
      mat.userData.materialKey = materialKey;
      layerMaterials.set(materialKey, mat);
    }
    return mat;
  }

  /**
   * @param {string} materialKey
   * @param {string|null} colorVar
   * @returns {THREE.MeshStandardMaterial}
   */
  function getOrganMaterial(materialKey, colorVar) {
    let mat = organMaterials.get(materialKey);
    if (!mat) {
      const color = colorVar ? readCssColor(colorVar, FALLBACK_COLOR) : FALLBACK_COLOR;
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
      mat.userData.atlasColorVar = colorVar;
      organMaterials.set(materialKey, mat);
    }
    return mat;
  }

  /**
   * Garante que existe um `THREE.BatchedMesh` para `materialKey` com espaço
   * livre suficiente para `addInstances` novas instâncias, somando
   * `addVertexCount`/`addIndexCount` vértices/índices — cria o batch (e o
   * adiciona à cena, uma única vez) se ainda não existir, ou o redimensiona
   * (com margem de crescimento) se já existir mas estiver perto do limite.
   * @param {string} materialKey
   * @param {number} addInstances
   * @param {number} addVertexCount
   * @param {number} addIndexCount
   * @returns {THREE.BatchedMesh}
   */
  function ensureLayerBatch(materialKey, addInstances, addVertexCount, addIndexCount) {
    let batch = layerBatches.get(materialKey);
    if (!batch) {
      const maxInstanceCount = Math.max(addInstances, BATCH_MIN_INSTANCES);
      const maxVertexCount = Math.max(addVertexCount, BATCH_MIN_VERTICES);
      const maxIndexCount = Math.max(addIndexCount, maxVertexCount * 2);
      batch = new THREE.BatchedMesh(maxInstanceCount, maxVertexCount, maxIndexCount, getBatchMaterial(materialKey));
      batch.name = `layer:${materialKey}`;
      batch.renderOrder = LAYER_ORDER[materialKeyToLayerGuess(materialKey)] || 0;
      // Sem custo de cull do objeto como um todo (boundingSphere só é
      // calculado se alguém chamar computeBoundingSphere()) — o cull por
      // instância (`perObjectFrustumCulled`, default true) já cobre o caso
      // que importa (estruturas fora da tela).
      batch.frustumCulled = false;
      batch.userData.sidByInstance = new Map();
      batch.userData.geometryIdByInstance = new Map();
      layerBatches.set(materialKey, batch);
      layerBatchCapacity.set(materialKey, { maxVertexCount, maxIndexCount });
      engine.scene.add(batch);
      return batch;
    }

    const neededInstances = batch.instanceCount + addInstances;
    if (neededInstances > batch.maxInstanceCount) {
      batch.setInstanceCount(Math.ceil(neededInstances * BATCH_GROWTH_FACTOR) + BATCH_MIN_INSTANCES);
    }

    if (addVertexCount > batch.unusedVertexCount || addIndexCount > batch.unusedIndexCount) {
      const cap = layerBatchCapacity.get(materialKey);
      const usedVertexCount = cap.maxVertexCount - batch.unusedVertexCount;
      const usedIndexCount = cap.maxIndexCount - batch.unusedIndexCount;
      const newMaxVertexCount = Math.max(
        cap.maxVertexCount,
        Math.ceil((usedVertexCount + addVertexCount) * BATCH_GROWTH_FACTOR) + BATCH_MIN_VERTICES
      );
      const newMaxIndexCount = Math.max(
        cap.maxIndexCount,
        Math.ceil((usedIndexCount + addIndexCount) * BATCH_GROWTH_FACTOR) + BATCH_MIN_VERTICES * 2
      );
      batch.setGeometrySize(newMaxVertexCount, newMaxIndexCount);
      cap.maxVertexCount = newMaxVertexCount;
      cap.maxIndexCount = newMaxIndexCount;
    }

    return batch;
  }

  // `renderOrder` por camada é só uma dica estética (raio-X/transparência
  // empilhando na ordem certa) — como o batch é por `materialKey` (que pode
  // ter um sufixo de variante, ex. "vasos-arteria"), extrai a camada-base
  // conhecida em `LAYER_ORDER` (que é indexado por `layer`, não por
  // `materialKey`); os materialKey "vasos-*" caem na camada "vasos".
  function materialKeyToLayerGuess(materialKey) {
    return materialKey.startsWith('vasos') ? 'vasos' : materialKey;
  }

  /**
   * Escreve a cor+alfa atualmente aplicada de `rec` (`rec.appliedColorHex`
   * + `rec.opacity`) em todas as instâncias do BatchedMesh que representam
   * essa estrutura. Único ponto de escrita de cor para estruturas
   * "batched" (registradas via `registerSystem`) — usado por `setColor`,
   * `setOpacity`, `setHighlight` e pelo refresh de tema.
   * @param {Object} rec
   */
  function writeInstanceColor(rec) {
    const color = new THREE.Color(rec.appliedColorHex);
    const vec = new THREE.Vector4(color.r, color.g, color.b, rec.opacity);
    for (const inst of rec.instances) {
      inst.batch.setColorAt(inst.instanceId, vec);
    }
  }

  /** Relê `--atlas-color-*` de todo mundo — estruturas batched (por
   * instância) e o material de detalhe de órgão — assinado em
   * `theme:change` (ver fim da função). */
  function refreshLayerColors() {
    let changed = false;
    for (const rec of structures.values()) {
      if (!rec.instances || !rec.colorVar) continue;
      if (rec.customColor !== null || rec.highlighted) continue; // não segue o tema
      const color = readCssColor(rec.colorVar, FALLBACK_COLOR);
      if (rec.baseColorHex !== color) {
        rec.baseColorHex = color;
        rec.appliedColorHex = color;
        writeInstanceColor(rec);
        changed = true;
      }
    }
    for (const mat of organMaterials.values()) {
      const cssVar = mat.userData.atlasColorVar;
      if (!cssVar) continue;
      const color = readCssColor(cssVar, FALLBACK_COLOR);
      if (mat.color.getStyle() !== color) {
        mat.color.set(color);
        changed = true;
      }
    }
    if (changed && engine.requestRender) engine.requestRender();
  }

  if (bus && typeof bus.on === 'function') {
    bus.on(EVENTS.THEME_CHANGE, refreshLayerColors);
  }

  /**
   * Garante que `rec.meshes[*].material` seja uma instância exclusiva desta
   * estrutura (clonada do material da camada na primeira escrita).
   * Idempotente. Só usado por estruturas de `registerOrganDetail` (não
   * batched — `rec.meshes`, não `rec.instances`).
   * @param {Object} rec
   */
  function ensureOwnMaterial(rec) {
    if (rec.ownMaterial) return rec.ownMaterial;
    const shared = rec.meshes[0] ? rec.meshes[0].material : getOrganMaterial(rec.materialKey, rec.colorVar);
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
   * `js/engine/assets.js` ao terminar `loadSystem`, ou por
   * `js/engine/fallback.js` com um grupo procedural). Cada malha das
   * estruturas entra como geometria+instância num `THREE.BatchedMesh`
   * compartilhado por camada/variante de material — `root` NUNCA é
   * anexado a `engine.scene` (só os batches de camada são; ver
   * `ensureLayerBatch`), então chamamos `root.updateMatrixWorld(true)`
   * uma vez aqui para capturar a matriz-mundo de cada nó antes dela virar
   * a matriz da instância no batch.
   * @param {string} system
   * @param {{ root: THREE.Object3D, nodeToSid: Record<string,string>, sex: string, lod: string, asset?: Object, esquematico?: boolean }} data
   */
  function registerSystem(system, { root, nodeToSid, sex, lod, esquematico, key } = {}) {
    if (!root || !nodeToSid) return;
    // `key`: o mesmo sistema pode ter mais de um arquivo (corpo Z-Anatomy +
    // órgão HRA, "cardiovascular#hra") — cada um registrado sob a própria
    // chave, sem apagar o outro.
    const regKey = key || system;
    unregisterSystem(regKey); // idempotente: troca por uma versão nova do mesmo arquivo
    root.updateMatrixWorld(true);

    // 1ª passada: resolve nó→malhas e classifica camada/material por sid.
    const pending = [];
    // Integridade (devolvida a quem carregou): nós do manifest sem par no GLB
    // indicam manifest e arquivo de versões diferentes.
    const integrity = { system, total: Object.keys(nodeToSid).length, missing: 0 };
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
        integrity.missing += 1;
        continue;
      }
      if (HRA_SID_RE.test(sid)) alignHraNode(node);
      const meshes = collectMeshes(node);
      if (!meshes.length) {
        // eslint-disable-next-line no-console
        console.warn(`[atlas/registry] nó "${nodeName}" (sid ${sid}) não tem nenhuma malha — ignorado.`);
        continue;
      }
      const { layer, materialKey, colorVar } = classifyStructure(system, nodeName);
      const side = /-direit[ao]$/.test(nodeName) ? 'R' : /-esquerd[ao]$/.test(nodeName) ? 'L' : undefined;
      pending.push({ sid, node, meshes, layer, materialKey, colorVar, side });
    }

    // 2ª passada: agrupa por materialKey para dimensionar/crescer cada
    // batch de camada de uma vez (uma única chamada de setInstanceCount/
    // setGeometrySize por camada, não uma por estrutura).
    const byMaterialKey = new Map();
    for (const item of pending) {
      if (!byMaterialKey.has(item.materialKey)) byMaterialKey.set(item.materialKey, []);
      byMaterialKey.get(item.materialKey).push(item);
    }

    const sids = new Set();
    for (const [materialKey, items] of byMaterialKey) {
      let addInstances = 0;
      let addVertexCount = 0;
      let addIndexCount = 0;
      const cleanGeoms = new Map(); // mesh → geometria limpa (evita computar 2x)
      for (const item of items) {
        for (const mesh of item.meshes) {
          const clean = sanitizeGeometryForBatch(mesh.geometry);
          if (!clean) continue;
          cleanGeoms.set(mesh, clean);
          addInstances += 1;
          addVertexCount += clean.getAttribute('position').count;
          addIndexCount += clean.getIndex() ? clean.getIndex().count : 0;
        }
      }
      if (addInstances === 0) continue;
      const batch = ensureLayerBatch(materialKey, addInstances, addVertexCount, addIndexCount);

      for (const item of items) {
        const instances = [];
        for (const mesh of item.meshes) {
          const clean = cleanGeoms.get(mesh);
          if (!clean) continue;
          let geometryId;
          let instanceId;
          try {
            geometryId = batch.addGeometry(clean);
            instanceId = batch.addInstance(geometryId);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[atlas/registry] falha ao inserir "${item.sid}" no batch "${materialKey}": ${err && err.message}`);
            continue;
          }
          batch.setMatrixAt(instanceId, mesh.matrixWorld);
          batch.userData.sidByInstance.set(instanceId, item.sid);
          batch.userData.geometryIdByInstance.set(instanceId, geometryId);
          instances.push({ batch, instanceId });
        }
        if (!instances.length) continue;

        const baseColorHex = item.colorVar ? readCssColor(item.colorVar, FALLBACK_COLOR) : FALLBACK_COLOR;
        const rec = {
          sid: item.sid, system, layer: item.layer, materialKey, colorVar: item.colorVar,
          sex, lod, node: item.node, side: item.side, esquematico: !!esquematico,
          visible: true, opacity: 1, highlighted: false,
          baseColorHex, customColor: null, appliedColorHex: baseColorHex, highlightPrevColorHex: null,
          instances, bboxCache: null,
        };
        structures.set(item.sid, rec);
        writeInstanceColor(rec);
        sids.add(item.sid);
      }
    }

    bySystem.set(regKey, sids);
    rebuildPickables();
    if (engine.requestRender) engine.requestRender();
    return integrity;
  }

  /**
   * Remove um sistema: retira as instâncias/geometrias desse sistema dos
   * batches de camada (`BatchedMesh.deleteGeometry` já cancela as
   * instâncias associadas) — os batches em si (e as estruturas de OUTROS
   * sistemas que compartilham a mesma camada) continuam intactos.
   * @param {string} system
   */
  function unregisterSystem(system) {
    const sids = bySystem.get(system);
    if (sids) {
      for (const sid of sids) {
        const rec = structures.get(sid);
        if (!rec) continue;
        if (rec.instances) {
          for (const inst of rec.instances) {
            const { batch, instanceId } = inst;
            const geometryId = batch.userData.geometryIdByInstance.get(instanceId);
            batch.userData.sidByInstance.delete(instanceId);
            batch.userData.geometryIdByInstance.delete(instanceId);
            if (geometryId !== undefined) {
              try {
                batch.deleteGeometry(geometryId);
              } catch (err) {
                // já removida (ex.: dupla chamada) — sem problema.
              }
            }
          }
        } else if (rec.meshes) {
          for (const mesh of rec.meshes) {
            if (mesh.geometry) mesh.geometry.dispose();
          }
          if (rec.ownMaterial) rec.ownMaterial.dispose();
        }
        structures.delete(sid);
      }
    }
    bySystem.delete(system);
    rebuildPickables();
    if (engine.requestRender) engine.requestRender();
  }

  /**
   * Registra um grupo destacado do HRA (detalhe de órgão) — NÃO entra na
   * cena principal (`engine.scene`); quem usa a vista "Detalhe do órgão"
   * decide onde/quando anexá-lo. Continua com malha própria por estrutura
   * (não usa os batches de camada — ver nota no cabeçalho do arquivo).
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
      const material = getOrganMaterial(materialKey, colorVar);
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
    // Detalhe de órgão fica fora de `bySystem` por padrão — só entra no
    // picking através de `rebuildPickables()` (que itera `structures`
    // inteiro), na próxima vez que qualquer chamada pública disparar um
    // rebuild; quem anexa `root` a uma cena visível decide isso.
    rebuildPickables();
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
    rebuildPickables();
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
    const out = [];
    for (const [key, sids] of bySystem) {
      if (key !== systemId && !key.startsWith(`${systemId}#`)) continue;
      for (const sid of sids) {
        const rec = structures.get(sid);
        if (rec) out.push(toPublic(rec));
      }
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
    if (rec.instances) {
      for (const inst of rec.instances) inst.batch.setVisibleAt(inst.instanceId, rec.visible);
    } else if (rec.meshes) {
      for (const mesh of rec.meshes) mesh.visible = rec.visible;
    }
    if (engine.requestRender) engine.requestRender();
  }

  // Batches de camada com alguma estrutura translúcida (Raio-X, fantasma,
  // opacidade da camada) param de escrever profundidade e desenham por
  // último — senão os músculos "transparentes" gravavam o z-buffer e
  // escondiam por completo o coração/fígado atrás deles.
  const translucentByBatch = new Map(); // BatchedMesh → Set<sid>
  function syncBatchTranslucency(rec, translucent) {
    for (const { batch } of rec.instances) {
      let set = translucentByBatch.get(batch);
      if (!set) { set = new Set(); translucentByBatch.set(batch, set); }
      if (translucent) set.add(rec.sid); else set.delete(rec.sid);
      const baseOrder = LAYER_ORDER[materialKeyToLayerGuess(batch.material.userData.materialKey)] || 0;
      batch.material.depthWrite = set.size === 0;
      batch.renderOrder = set.size === 0 ? baseOrder : 100 + baseOrder;
    }
  }

  /** @type {import('../core/contracts.js').Registry['setOpacity']} */
  function setOpacity(sid, opacity) {
    const rec = structures.get(sid);
    if (!rec) return;
    const value = Math.max(0, Math.min(1, opacity));
    rec.opacity = value;
    if (rec.instances) {
      writeInstanceColor(rec);
      syncBatchTranslucency(rec, value < 1);
    } else if (rec.meshes) {
      const mat = ensureOwnMaterial(rec);
      mat.opacity = value;
      mat.transparent = value < 1;
      // Orçamento de desempenho/UX §"Opacidade": depthWrite desliga com
      // transparência para o z-sort não "vazar" através de estruturas semi-
      // transparentes; renderOrder por camada garante a ordem visual (mais
      // profundo desenha depois) mesmo com depthWrite desligado.
      mat.depthWrite = value >= 1;
      for (const mesh of rec.meshes) mesh.renderOrder = value < 1 ? 100 + (LAYER_ORDER[rec.layer] || 0) : (LAYER_ORDER[rec.layer] || 0);
    }
    if (engine.requestRender) engine.requestRender();
  }

  /** @type {import('../core/contracts.js').Registry['setColor']} */
  function setColor(sid, color) {
    const rec = structures.get(sid);
    if (!rec) return;
    if (rec.instances) {
      rec.customColor = color;
      rec.appliedColorHex = color !== null ? color : rec.baseColorHex;
      writeInstanceColor(rec);
    } else if (rec.meshes) {
      if (color === null) {
        if (rec.ownMaterial) {
          const base = rec.colorVar ? readCssColor(rec.colorVar, FALLBACK_COLOR) : FALLBACK_COLOR;
          rec.ownMaterial.color.set(base);
        }
      } else {
        const mat = ensureOwnMaterial(rec);
        mat.color.set(color);
      }
    }
    if (engine.requestRender) engine.requestRender();
  }

  /**
   * Realce (independe de camada) — usado pela seleção (WP06) e pelo Quiz.
   * Guarda a cor anterior para restaurar exatamente ao desligar (não
   * assume que era a cor "de fábrica" da camada).
   * @param {string} sid
   * @param {boolean} on
   */
  function setHighlight(sid, on) {
    const rec = structures.get(sid);
    if (!rec) return;
    if (on === rec.highlighted) return;
    if (rec.instances) {
      if (on) {
        rec.highlightPrevColorHex = rec.appliedColorHex;
        rec.appliedColorHex = readCssColor(HIGHLIGHT_COLOR_VAR, FALLBACK_HIGHLIGHT);
        rec.highlighted = true;
      } else {
        rec.appliedColorHex = rec.highlightPrevColorHex || rec.appliedColorHex;
        rec.highlighted = false;
      }
      writeInstanceColor(rec);
    } else if (rec.meshes) {
      const mat = ensureOwnMaterial(rec);
      if (on) {
        rec.highlightPrevColor = '#' + mat.color.getHexString();
        mat.color.set(readCssColor(HIGHLIGHT_COLOR_VAR, FALLBACK_HIGHLIGHT));
        rec.highlighted = true;
      } else {
        if (rec.highlightPrevColor) mat.color.set(rec.highlightPrevColor);
        rec.highlighted = false;
      }
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
   * `contracts.js` `ScreenPoint`). `pickables` mistura `THREE.BatchedMesh`
   * (estruturas de `registerSystem`, várias por objeto — resolvidas via
   * `intersect.batchId` → sid, guardado em `batch.userData.sidByInstance`)
   * e `THREE.Mesh` individuais (`registerOrganDetail`, uma por objeto,
   * resolvida via `mesh.userData.sid` como antes). A visibilidade por
   * instância dentro de um batch já é respeitada pelo `BatchedMesh.raycast`
   * nativo; para malhas individuais, `Raycaster.intersectObjects` já
   * ignora objetos com `.visible === false`. Quando o material tem
   * `clippingPlanes` (plano de corte, WP06 `xray-clip.js`), descarta
   * acertos do lado "cortado" do plano.
   * @type {import('../core/contracts.js').Registry['pick']}
   */
  // `camera` padrão = a câmera do motor: os chamadores (main.js, selection.js)
  // passam só o ponto — sem este padrão o pick devolvia null para TODO toque
  // e nenhuma estrutura abria pelo corpo 3D (bug do WP13 até o hotfix C2).
  function pick(point, camera = engine && engine.camera) {
    if (!camera || !pickables.length) return null;
    raycaster.setFromCamera(point, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const hit of hits) {
      const planes = hit.object.material && hit.object.material.clippingPlanes;
      if (planes && planes.length) {
        const clipped = planes.some((plane) => plane.distanceToPoint(hit.point) < 0);
        if (clipped) continue;
      }
      let sid = null;
      if (hit.object.isBatchedMesh) {
        const map = hit.object.userData.sidByInstance;
        sid = map ? map.get(hit.batchId) : null;
      } else {
        sid = hit.object.userData && hit.object.userData.sid;
      }
      if (sid) return sid;
    }
    return null;
  }

  /**
   * Estatísticas para o orçamento de desempenho (docs/ATLAS_UX_SPEC.md §17
   * — até 150 draw calls no celular). Usa `renderer.info` (contagem real do
   * último frame, já refletindo o número de batches desenhados) quando
   * disponível; senão estima pelo nº de geometrias visíveis (1 batch pode
   * desenhar muitas geometrias numa única chamada, via `WEBGL_multi_draw`,
   * então essa estimativa é só um limite superior grosseiro).
   */
  function stats() {
    let visibleCount = 0;
    let meshCount = 0;
    for (const rec of structures.values()) {
      const count = rec.instances ? rec.instances.length : (rec.meshes ? rec.meshes.length : 0);
      meshCount += count;
      if (rec.visible) visibleCount += count;
    }
    const rendererInfo = engine.renderer && engine.renderer.info && engine.renderer.info.render;
    return {
      structures: structures.size,
      meshes: meshCount,
      visibleMeshes: visibleCount,
      materials: layerMaterials.size + organMaterials.size,
      drawCalls: rendererInfo ? rendererInfo.calls : visibleCount,
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
