/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * registry-helpers.js — peças puras do Registry (sem estado do motor)
 * ---------------------------------------------------------------------------
 * Extraído de `registry.js` (que passou do teto de 800 linhas): classificação
 * sistema → camada/material, alinhamento do HRA, geometria "limpa" para o
 * BatchedMesh, leitura de cores do tema e a convenção de peças ESPELHADAS.
 *
 * Peças espelhadas: o Z-Anatomy modela o lado esquerdo como cópia da malha do
 * direito com escala -1 em X (matriz-mundo com determinante < 0). O three só
 * inverte o sentido das faces (gl.frontFace) quando a matriz do OBJETO tem
 * determinante negativo — numa instância dentro de um batch comum isso não
 * acontece: as faces voltadas para a câmera eram descartadas, a peça era
 * desenhada "por dentro" enquanto o raycast acertava a face de fora (clique
 * sem destaque). Por isso cada camada tem um segundo BatchedMesh (chave com
 * sufixo `#m`) com `scale.x = -1` no próprio batch e a matriz de cada
 * instância pré-multiplicada pelo mesmo espelho: batch × instância continua
 * sendo a matriz original, nada muda de posição.
 */

import * as THREE from '../../vendor/three/three.module.js';
import { LAYER_IDS } from '../core/contracts.js';
import { isFasciaSid } from './fascia-rules.js';

// ============================================================================
// Heurística sistema → camada (aproximação documentada: o Registry não lê
// data/atlas/index.json, então deriva uma camada plausível a partir do
// sistema e, para o cardiovascular, do nome do nó). Confirmado contra
// data/atlas/fixtures/index.json: bate 100% para os 12 sistemas das fixtures.
// ============================================================================
export const SYSTEM_LAYER_DEFAULT = Object.freeze({
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
// câmaras/valvas — ficam na camada "visceras", não "vasos".
const HEART_NODE_PATTERN = /^coracao$|^atrio-|^ventriculo-|^valva-/;
// Nomes de nó que são veias (azul) dentro da camada "vasos" — o resto usa a
// cor de artéria (vermelho). Convenção de atlas impresso (UX spec §9).
const VEIN_NODE_PATTERN = /veia|jugular|cava/;

export const LAYER_COLOR_VAR = Object.freeze({
  pele: '--atlas-color-pele',
  fascias: '--atlas-color-fascias',
  musculos: '--atlas-color-musculos',
  esqueleto: '--atlas-color-esqueleto',
  visceras: '--atlas-color-visceras',
  'vasos-arteria': '--atlas-color-vasos-arteria',
  'vasos-veia': '--atlas-color-vasos-veia',
  nervos: '--atlas-color-nervos',
  linfatico: '--atlas-color-linfatico',
});

export const HIGHLIGHT_COLOR_VAR = '--atlas-color-highlight';
export const FALLBACK_COLOR = '#9aa5bb';
export const FALLBACK_HIGHLIGHT = '#4c8bf5';

/** Índice de cada camada em LAYER_IDS — só para `renderOrder` (estruturas mais
 * profundas ordenam depois, para a transparência do raio-X empilhar certo). */
export const LAYER_ORDER = Object.freeze(
  LAYER_IDS.reduce((acc, id, i) => {
    acc[id] = i;
    return acc;
  }, {})
);

// ---- Peças espelhadas ------------------------------------------------------
export const MIRROR_SUFFIX = '#m';
export const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);
export const isMirroredMatrix = (m) => m.determinant() < 0;
export const isMirrorKey = (key) => String(key).endsWith(MIRROR_SUFFIX);
export const baseKeyOf = (key) => (isMirrorKey(key) ? key.slice(0, -MIRROR_SUFFIX.length) : key);

/**
 * Matriz a gravar na instância do batch para que a posição final (mundo)
 * seja `world` deslocada por `offset` ([dx,dy,dz], em metros do mundo).
 * Batch normal: T(offset)·W. Batch espelhado (scale.x=-1): S·T(offset)·W.
 * Único ponto que constrói matrizes de instância (carga e "Separar peças").
 * @param {THREE.Matrix4} world matriz-mundo original da malha
 * @param {boolean} mirrored a instância mora no batch espelhado?
 * @param {ReadonlyArray<number>} [offset]
 * @param {THREE.Matrix4} [out]
 * @returns {THREE.Matrix4}
 */
export function instanceMatrixFor(world, mirrored, offset, out = new THREE.Matrix4()) {
  out.copy(world);
  if (offset && (offset[0] || offset[1] || offset[2])) {
    out.premultiply(new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]));
  }
  if (mirrored) out.premultiply(MIRROR_X);
  return out;
}

/** Lado anatômico a partir do nome do nó (".r"/".l" do Z-Anatomy ou
 * "-direito/-esquerdo" das fixtures). `undefined` se não houver. */
export function sideOfNodeName(nodeName) {
  const name = String(nodeName);
  if (/(?:-direit[ao]|\.r)$/i.test(name)) return 'R';
  if (/(?:-esquerd[ao]|\.l)$/i.test(name)) return 'L';
  return undefined;
}

/**
 * Lê uma variável CSS `--atlas-color-*` do documento (tema ativo já
 * resolvido pelo navegador). Sem `document` (teste em Node) → fallback.
 * @param {string} cssVar
 * @param {string} fallback
 * @returns {string}
 */
export function readCssColor(cssVar, fallback) {
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

/**
 * Decide a camada + a chave de material (algumas camadas têm mais de uma
 * variante de cor, ex. vasos) para um nó de um sistema. As fáscias (fáscia,
 * retináculo, aponeurose, trato iliotibial) do sistema muscular saem da camada
 * "músculos" para a camada própria "fáscias" (regra em fascia-rules.js) — com
 * batch e material próprios, para a translucidez delas não afetar os músculos.
 * @param {string} system
 * @param {string} nodeName
 * @param {string} [sid]
 * @returns {{ layer: string, materialKey: string, colorVar: string|null }}
 */
export function classifyStructure(system, nodeName, sid) {
  if (system === 'cardiovascular') {
    if (HEART_NODE_PATTERN.test(nodeName)) {
      return { layer: 'visceras', materialKey: 'visceras', colorVar: LAYER_COLOR_VAR.visceras };
    }
    const isVein = VEIN_NODE_PATTERN.test(nodeName);
    const materialKey = isVein ? 'vasos-veia' : 'vasos-arteria';
    return { layer: 'vasos', materialKey, colorVar: LAYER_COLOR_VAR[materialKey] };
  }
  if (system === 'muscular' && sid && isFasciaSid(sid)) {
    return { layer: 'fascias', materialKey: 'fascias', colorVar: LAYER_COLOR_VAR.fascias };
  }
  const layer = SYSTEM_LAYER_DEFAULT[system] || 'visceras';
  return { layer, materialKey: layer, colorVar: LAYER_COLOR_VAR[layer] || null };
}

/** `renderOrder`-base de um batch a partir da chave de material (vasos-* →
 * vasos; sufixo de espelho removido). */
export function layerOrderOfKey(materialKey) {
  const base = baseKeyOf(materialKey);
  return LAYER_ORDER[base.startsWith('vasos') ? 'vasos' : base] || 0;
}

/**
 * Órgãos do HRA (sids "za:vh-*", nós "VH_M_*"/"VH_F_*") chegam no referencial
 * do corpo de referência do HRA, deslocado 0,81 m para baixo em relação ao
 * Z-Anatomy. Medido com as próprias malhas (mesma escala, mesmo eixo): topo
 * da face diafragmática do fígado y = 0,43 → 1,24; coração 0,42–0,52 →
 * 1,23–1,33. TODO(pipeline): aplicar em tools/atlas-pipeline e remover daqui.
 */
export const HRA_SID_RE = /^za:vh-/;
const HRA_TO_ZANATOMY_OFFSET = Object.freeze([0, 0.81, 0]);

export function alignHraNode(node) {
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

/**
 * Junta todas as malhas descendentes de `node` (inclusive ele mesmo): um GLB
 * pode agrupar sub-malhas sob um nó (ex.: "costelas" com 12 ossos); cada
 * sub-malha vira geometria+instância, todas com o mesmo `sid`.
 * @param {THREE.Object3D} node
 * @returns {THREE.Mesh[]}
 */
export function collectMeshes(node) {
  const meshes = [];
  node.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

/**
 * Extrai uma geometria "limpa" (só `position`/`normal`/índice) para inserir
 * num `THREE.BatchedMesh` de camada — evita que `_validateGeometry` rejeite
 * atributos extras (UV, tangente, skinning, cor) que variam entre o glTF real
 * e a contingência (`fallback.js`) quando dividem a mesma camada.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry|null}
 */
export function sanitizeGeometryForBatch(geometry) {
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
