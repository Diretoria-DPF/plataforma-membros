/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * registry-pick.js — picking (raycast) do Registry
 * ---------------------------------------------------------------------------
 * Raycast a partir de um ponto de tela normalizado ([-1,1], ver `contracts.js`
 * `ScreenPoint`). Os "pickables" misturam `THREE.BatchedMesh` (estruturas de
 * `registerSystem`, várias por objeto — resolvidas via `intersect.batchId` →
 * sid, guardado em `batch.userData.sidByInstance`) e `THREE.Mesh` individuais
 * (`registerOrganDetail`, resolvidas via `mesh.userData.sid`). A visibilidade
 * por instância dentro de um batch já é respeitada pelo
 * `BatchedMesh.raycast` nativo; `Raycaster.intersectObjects` ignora objetos
 * com `.visible === false`. Com plano de corte (`clippingPlanes`, WP06),
 * acertos do lado "cortado" são descartados.
 */

import * as THREE from '../../vendor/three/three.module.js';

/** Empate de distância (superfícies coincidentes, < PICK_TIE_EPS): ganha a
 * camada mais profunda (A.10, Onda 3). */
export const PICK_TIE_EPS = 0.01;
export const PICK_LAYER_PRIORITY = Object.freeze({ visceras: 0, vasos: 1, nervos: 2, linfatico: 3, esqueleto: 4, musculos: 5, pele: 6 });

/**
 * @param {{ engine: Object, getPickables: () => Object[], getRec: (sid: string) => (Object|undefined) }} deps
 * @returns {{ pick: (point: {x: number, y: number}, camera?: THREE.Camera) => (string|null) }}
 */
export function createPicker({ engine, getPickables, getRec }) {
  const raycaster = new THREE.Raycaster();

  function sidOfHit(hit) {
    if (hit.object.isBatchedMesh) {
      const map = hit.object.userData.sidByInstance;
      return map ? map.get(hit.batchId) : null;
    }
    return hit.object.userData && hit.object.userData.sid;
  }

  function layerOfHit(hit) {
    const sid = sidOfHit(hit);
    const rec = sid && getRec(sid);
    return rec ? rec.layer : null;
  }

  function compareHits(a, b) {
    if (Math.abs(a.distance - b.distance) < PICK_TIE_EPS) {
      const pa = PICK_LAYER_PRIORITY[layerOfHit(a)] ?? 10;
      const pb = PICK_LAYER_PRIORITY[layerOfHit(b)] ?? 10;
      if (pa !== pb) return pa - pb;
    }
    return a.distance - b.distance;
  }

  const isClipped = (hit) => {
    const planes = hit.object.material && hit.object.material.clippingPlanes;
    return !!(planes && planes.length && planes.some((plane) => plane.distanceToPoint(hit.point) < 0));
  };

  // `camera` padrão = a câmera do motor: os chamadores (main.js, selection.js)
  // passam só o ponto — sem este padrão o pick devolvia null para TODO toque
  // (bug do WP13 até o hotfix C2).
  function pick(point, camera = engine && engine.camera) {
    const pickables = getPickables();
    if (!camera || !pickables.length) return null;
    raycaster.setFromCamera(point, camera);
    const hits = raycaster.intersectObjects(pickables, false).sort(compareHits);
    for (const hit of hits) {
      if (isClipped(hit)) continue;
      const sid = sidOfHit(hit);
      if (sid) return sid;
    }
    return null;
  }

  return { pick };
}
