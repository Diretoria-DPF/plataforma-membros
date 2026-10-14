/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * registry-explode.js — deslocamento por estrutura (vista "Separar peças")
 * ---------------------------------------------------------------------------
 * A parte do Registry que mexe nas MATRIZES das instâncias dos BatchedMesh.
 * Sem custo quando a vista está desligada: nenhum estado é criado até o
 * primeiro `apply`, e `offsetOf` devolve `null`.
 *
 * Cada instância guarda a matriz-mundo ORIGINAL (`inst.world`) e se mora no
 * lote espelhado (`inst.mirrored`). A matriz gravada é sempre
 * `instanceMatrixFor(world, mirrored, offset)` (registry-helpers.js): nas
 * instâncias do lote `#m` o deslocamento é multiplicado pelo espelho (MIRROR_X),
 * senão a peça do lado esquerdo andaria para o lado errado. O raycast usa as
 * mesmas matrizes, então o clique acerta a peça na posição separada.
 */

import * as THREE from '../../vendor/three/three.module.js';
import { instanceMatrixFor, meanOffset, shiftBox } from './registry-helpers.js';

const ZERO = Object.freeze([0, 0, 0]);

/**
 * @param {{ getStructures: () => Map<string, Object>, requestRender?: () => void }} deps
 */
export function createInstanceOffsets({ getStructures, requestRender }) {
  /** @type {Map<string, number[]|number[][]>} sid → deslocamento aplicado */
  const applied = new Map();
  /** @type {Map<string, number[]>} sid → média (para a caixa/rótulos) */
  const means = new Map();

  const box = new THREE.Box3();

  /** Centro (mundo) de cada instância, em repouso. */
  function partCenters(rec) {
    const out = [];
    for (const inst of rec.instances) {
      const geometryId = inst.batch.userData.geometryIdByInstance.get(inst.instanceId);
      let ok = false;
      try {
        ok = geometryId !== undefined && !!inst.batch.getBoundingBoxAt(geometryId, box);
      } catch (err) { ok = false; }
      if (!ok || box.isEmpty()) continue;
      const c = box.clone().applyMatrix4(inst.world).getCenter(new THREE.Vector3());
      out.push([c.x, c.y, c.z]);
    }
    return out;
  }

  /**
   * Peças que podem se separar (estruturas em lote), com centro e partes.
   * @param {(sid: string) => ({min: number[], max: number[]}|null)} getRestBox caixa em repouso
   * @returns {Array<{sid: string, system: string, layer: string, visible: boolean, center: number[], box: {min: number[], max: number[]}, parts: number[][]}>}
   */
  function items(getRestBox) {
    const out = [];
    for (const rec of getStructures().values()) {
      if (!rec.instances || !rec.instances.length) continue;
      const b = getRestBox(rec.sid);
      if (!b) continue;
      const center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      out.push({ sid: rec.sid, system: rec.system, layer: rec.layer, visible: rec.visible, center, box: b, parts: partCenters(rec) });
    }
    return out;
  }

  function writeRec(rec, offset) {
    const per = Array.isArray(offset) && Array.isArray(offset[0]);
    rec.instances.forEach((inst, i) => {
      const off = offset ? (per ? (offset[i] || ZERO) : offset) : null;
      inst.batch.setMatrixAt(inst.instanceId, instanceMatrixFor(inst.world, inst.mirrored, off));
    });
  }

  /**
   * Aplica os deslocamentos (sid → [dx,dy,dz] ou lista por instância). Quem
   * não está no mapa volta à posição original. `null`/vazio desfaz tudo.
   * @param {Map<string, number[]|number[][]>|null} offsets
   */
  function apply(offsets) {
    const next = offsets || new Map();
    const structures = getStructures();
    for (const sid of new Set([...applied.keys(), ...next.keys()])) {
      const rec = structures.get(sid);
      if (!rec || !rec.instances) { applied.delete(sid); means.delete(sid); continue; }
      const off = next.get(sid) || null;
      writeRec(rec, off);
      if (off) { applied.set(sid, off); means.set(sid, meanOffset(off)); } else { applied.delete(sid); means.delete(sid); }
    }
    if (requestRender) requestRender();
  }

  /** Média do deslocamento atual de `sid` (ou `null` se está em repouso). */
  const offsetOf = (sid) => means.get(sid) || null;

  /** Caixa de `sid` considerando o deslocamento atual. */
  const shiftedBox = (sid, restBox) => shiftBox(restBox, offsetOf(sid));

  return { items, apply, offsetOf, shiftedBox, isActive: () => applied.size > 0 };
}
