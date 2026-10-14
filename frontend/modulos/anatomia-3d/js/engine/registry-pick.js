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
 *
 * Fáscias (decisão do dono, opção 2): quando o primeiro acerto é uma fáscia e
 * logo atrás há outra estrutura, o clique prefere a de baixo; a fáscia continua
 * selecionável — `pickCycle` alterna ao clicar de novo no mesmo ponto (regras
 * em fascia-rules.js).
 *
 * Estruturas quase transparentes (Raio-X, fantasma, camada em baixa opacidade)
 * deixam o clique passar: o que se vê através delas é o que se seleciona. Se
 * só houver transparentes sob o ponto, a mais próxima ainda é escolhida.
 */

import * as THREE from '../../vendor/three/three.module.js';
import { preferUnderFascia, createPickCycle } from './fascia-rules.js';

/** Empate de distância (superfícies coincidentes, < PICK_TIE_EPS): ganha a
 * camada mais profunda (A.10, Onda 3). */
export const PICK_TIE_EPS = 0.01;
/** Abaixo desta opacidade a estrutura é "de vidro" para o clique. */
export const SEE_THROUGH_OPACITY = 0.35;
export const PICK_LAYER_PRIORITY = Object.freeze({ visceras: 0, vasos: 1, nervos: 2, linfatico: 3, esqueleto: 4, musculos: 5, pele: 6, fascias: 7 });

/**
 * @param {{ engine: Object, getPickables: () => Object[], getRec: (sid: string) => (Object|undefined) }} deps
 * @returns {{ pick: Function, pickCycle: Function, setPreferUnderFascia: (on: boolean) => void }}
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

  let preferFascia = true;
  const cycle = createPickCycle();

  const opacityOfHit = (hit) => {
    const sid = sidOfHit(hit);
    const rec = sid && getRec(sid);
    return rec && typeof rec.opacity === 'number' ? rec.opacity : 1;
  };

  /** Acertos visíveis, do mais próximo ao mais longe, um por estrutura — as
   * opacas primeiro e, depois delas, as quase transparentes. */
  function orderedHits(point, camera) {
    const pickables = getPickables();
    if (!camera || !pickables.length) return [];
    raycaster.setFromCamera(point, camera);
    const seen = new Set();
    const solid = [];
    const faint = [];
    for (const hit of raycaster.intersectObjects(pickables, false).sort(compareHits)) {
      const sid = isClipped(hit) ? null : sidOfHit(hit);
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      const entry = { sid, distance: hit.distance, fascia: layerOfHit(hit) === 'fascias', point: [hit.point.x, hit.point.y, hit.point.z] };
      (opacityOfHit(hit) < SEE_THROUGH_OPACITY ? faint : solid).push(entry);
    }
    return solid.concat(faint);
  }

  // `camera` padrão = a câmera do motor: os chamadores (main.js, selection.js)
  // passam só o ponto — sem este padrão o pick devolvia null para TODO toque
  // (bug do WP13 até o hotfix C2).
  function pick(point, camera = engine && engine.camera) {
    const raw = orderedHits(point, camera);
    const ordered = preferUnderFascia(raw, { enabled: preferFascia });
    return ordered.length ? ordered[0].sid : null;
  }

  /** Como `pick`, mas clicar de novo no mesmo ponto alterna entre a estrutura
   * sob a fáscia e a própria fáscia. Só o toque/clique do corpo usa isto. */
  function pickCycle(point, camera = engine && engine.camera) {
    const raw = orderedHits(point, camera);
    const ordered = preferUnderFascia(raw, { enabled: preferFascia });
    const chosen = cycle.choose(point, raw, ordered);
    return chosen ? chosen.sid : null;
  }

  return { pick, pickCycle, setPreferUnderFascia: (on) => { preferFascia = !!on; cycle.reset(); } };
}
