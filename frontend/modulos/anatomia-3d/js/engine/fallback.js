/**
 * fallback.js — reserva do Atlas v2 quando os assets novos faltam (Onda 1, WP05)
 * ---------------------------------------------------------------------------
 * Ativa quando `models/manifest.json` falta OU todo sistema do manifesto
 * terminou indisponível (`store.unavailableSystems` cobre `SYSTEM_IDS`
 * inteiro) — ver plano §3 "Se faltar algum asset". Decidir QUANDO chamar
 * `activate()` é responsabilidade de quem integra o motor (WP13/main.js),
 * por isso exportamos também `shouldFallback(state)`, um predicado puro
 * sobre `store.get()` que quem ligar os pacotes pode assinar.
 *
 * O que este arquivo faz:
 *   1. Carrega `models/body.glb` (Z-Anatomy, CC BY-SA, comprimido com
 *      Draco) — o mesmo arquivo do motor antigo (`js/three-engine.js`).
 *   2. Classifica cada malha por `extras.type` ('bone'/'muscle', ver
 *      `classifyRealMesh` em three-engine.js) e cria um `za:<slug>` a
 *      partir de `extras.name` (nome anatômico legível do nó), com
 *      desambiguação para pares esquerda/direita que compartilham o
 *      mesmo nome (ex.: dois nós "Hip bone" → `za:hip-bone`, `za:hip-bone-2`
 *      — GAP: o body.glb não rotula lateralidade, então esses sids não
 *      carregam `-esquerdo/-direito`; reportado ao orquestrador).
 *   3. Registra ossos e músculos no MESMO `Registry` dos sistemas normais
 *      (`registerSystem('esqueletico', ...)`/`registerSystem('muscular', ...)`)
 *      — "Tudo registrado pelo mesmo registry", como pedido.
 *   4. Reconstrói a camada procedural de órgãos (vísceras/vasos/nervoso/
 *      endócrino/reprodutor) a partir dos marcos ósseos REAIS, com a MESMA
 *      lógica de `computeAnatomicalLandmarks`/`buildOrganLayer` de
 *      `js/three-engine.js` (portada aqui, não importada — não somos donos
 *      daquele arquivo e não o alteramos; funções replicadas com a mesma
 *      matemática e os mesmos comentários de landmark). Cada estrutura
 *      procedural entra no Registry com `esquematico: true` (ver
 *      `Registry.getBySid(sid).esquematico`) — a UI (WP09) usa essa marca
 *      para a faixa "Modelo esquemático" da ficha (docs/ATLAS_UX_SPEC.md §13).
 *
 * Orçamento de draw calls (§17, 150 no celular): o body.glb tem 826 malhas
 * — usadas uma a uma (sem BatchedMesh, mesma escolha do Registry — ver
 * `js/engine/registry.js`), isto sozinho já passa de 150 draw calls.
 * ACEITO DE PROPÓSITO: este é o caminho de ÚLTIMO RECURSO (nunca é o
 * primeiro carregamento de um usuário com rede saudável); nunca travar >
 * nunca estourar o orçamento. Reportado ao orquestrador como limitação
 * conhecida, não corrigida nesta onda.
 */

import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/loaders/DRACOLoader.js';
import { SYSTEM_IDS } from '../core/contracts.js';

const DRACO_DECODER_PATH = new URL('../../vendor/three/libs/draco/', import.meta.url).href;

/**
 * Remove acentos/maiúsculas e troca tudo que não é [a-z0-9] por hífen —
 * mesma normalização usada pela busca (docs/ATLAS_UX_SPEC.md §6, NFD).
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text || 'estrutura')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'estrutura';
}

/**
 * Marcos ósseos usados para posicionar a camada procedural de órgãos —
 * cópia adaptada de `ORGAN_LANDMARK_PATTERNS`/`computeAnatomicalLandmarks`
 * em `js/three-engine.js` (não editamos aquele arquivo; a lógica é
 * replicada aqui com a mesma intenção).
 */
const LANDMARK_PATTERNS = Object.freeze({
  thorax: /^rib cage$/i,
  sternum: /sternum/i,
  spineCervical: /^cervical vertebrae$/i,
  spineThoracic: /^thoracic vertebrae$/i,
  spineLumbar: /^lumbar vertebrae$/i,
  pelvis: /^hip bone$/i,
  sacrum: /^sacrum$/i,
  skull: /frontal bone|parietal bone|occipital bone|temporal bone|sphenoid bone|ethmoid bone|mandible|maxilla|nasal bone|zygomatic bone|lacrimal bone|vomer|palatine bone|nasal concha/i,
});

/**
 * @param {Array<{ mesh: THREE.Object3D, displayName: string }>} boneEntries
 * @returns {Object|null} marcos resumidos (bbox mundo por chave), ou `null`
 *   se os marcos essenciais (tórax/quadril) não existirem.
 */
function computeLandmarks(boneEntries) {
  const boxes = {};
  boneEntries.forEach(({ mesh, displayName }) => {
    for (const key in LANDMARK_PATTERNS) {
      if (LANDMARK_PATTERNS[key].test(displayName)) {
        if (!boxes[key]) boxes[key] = new THREE.Box3();
        boxes[key].expandByObject(mesh);
      }
    }
  });
  if (!boxes.thorax || !boxes.pelvis) return null;
  const out = {};
  for (const key in boxes) {
    const box = boxes[key];
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    out[key] = {
      minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z,
      cx: c.x, cy: c.y, cz: c.z, sx: s.x, sy: s.y, sz: s.z,
    };
  }
  return out;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Geometrias unitárias compartilhadas (mesma ideia de `getOrganGeometries`
 * em three-engine.js) — escaladas por instância, nunca recriadas. */
const UNIT_GEOM = Object.freeze({
  sphere: new THREE.SphereGeometry(1, 16, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  torus: new THREE.TorusGeometry(1, 0.35, 8, 16),
});

/**
 * Cria a malha de um órgão procedural dentro de `group`, já com nome único
 * e entrada em `nodeToSid` (para `registry.registerSystem` encontrar via
 * `getObjectByName`). Réplica de `addOrganMesh` (three-engine.js), sem o
 * material customizado por opacidade — o Registry (WP05) já cuida disso
 * por camada.
 * @param {THREE.Group} group
 * @param {Record<string,string>} nodeToSid
 * @param {string} label pt-BR simples, só para o slug do sid.
 * @param {'sphere'|'box'|'cylinder'|'torus'} geomKey
 * @param {{x:number,y:number,z:number}} scale
 * @param {{x:number,y:number,z:number}} pos
 */
function addOrgan(group, nodeToSid, label, geomKey, scale, pos) {
  const mesh = new THREE.Mesh(UNIT_GEOM[geomKey]);
  const slug = slugify(label);
  let name = slug;
  let i = 2;
  while (nodeToSid[name]) { name = `${slug}-${i}`; i += 1; }
  mesh.name = name;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.scale.set(scale.x, scale.y, scale.z);
  group.add(mesh);
  nodeToSid[name] = `za:${name}`;
}

/**
 * Reconstrói vísceras/vasos/nervoso/endócrino/reprodutor plausíveis dentro
 * do esqueleto real, um grupo por sistema (para o Registry poder
 * `unregisterSystem` cada um independentemente). Réplica adaptada de
 * `buildOrganLayer` (three-engine.js) — mesma matemática, reorganizada em
 * grupos por sistema em vez de um único "OrganLayer".
 * @param {Object} L marcos de {@link computeLandmarks}.
 * @returns {Record<string, { group: THREE.Group, nodeToSid: Record<string,string> }>}
 */
function buildOrganSystems(L) {
  const out = {};
  function system(id) {
    if (!out[id]) out[id] = { group: new THREE.Group(), nodeToSid: {} };
    out[id].group.name = `fallback-organs:${id}`;
    return out[id];
  }

  const thorax = L.thorax;
  const pelvis = L.pelvis;
  const sternumZ = L.sternum ? L.sternum.cz : thorax.maxZ;
  const spineThoracicZ = L.spineThoracic ? L.spineThoracic.cz : thorax.minZ;
  const spineLumbarZ = L.spineLumbar ? L.spineLumbar.cz : pelvis.minZ;
  const thoraxHalfW = (thorax.maxX - thorax.minX) / 2;
  const pelvisHalfW = (pelvis.maxX - pelvis.minX) / 2;
  const abdomenHalfW = (thoraxHalfW + pelvisHalfW) / 2;
  const skull = L.skull;

  // --- Cardiovascular: coração + aorta/veia cava ---
  const cardio = system('cardiovascular');
  addOrgan(cardio.group, cardio.nodeToSid, 'coracao', 'sphere',
    { x: thorax.sx * 0.16, y: thorax.sy * 0.19, z: thorax.sz * 0.30 },
    { x: -thoraxHalfW * 0.32, y: lerp(thorax.minY, thorax.maxY, 0.35), z: lerp(spineThoracicZ, sternumZ, 0.55) });
  const vesselTopY = thorax.maxY;
  const vesselBottomY = pelvis.minY;
  const vesselZ = lerp(spineThoracicZ, spineLumbarZ, 0.5);
  addOrgan(cardio.group, cardio.nodeToSid, 'aorta', 'cylinder',
    { x: 0.018, y: vesselTopY - vesselBottomY, z: 0.018 },
    { x: -thoraxHalfW * 0.06, y: (vesselTopY + vesselBottomY) / 2, z: vesselZ + thorax.sz * 0.06 });
  addOrgan(cardio.group, cardio.nodeToSid, 'veia-cava', 'cylinder',
    { x: 0.018, y: vesselTopY - vesselBottomY, z: 0.018 },
    { x: thoraxHalfW * 0.06, y: (vesselTopY + vesselBottomY) / 2, z: vesselZ + thorax.sz * 0.06 });

  // --- Respiratório: pulmões + traqueia ---
  const resp = system('respiratorio');
  ['esquerdo', 'direito'].forEach((lado, i) => {
    const sign = i === 0 ? -1 : 1;
    addOrgan(resp.group, resp.nodeToSid, `pulmao-${lado}`, 'sphere',
      { x: thoraxHalfW * 0.44, y: thorax.sy * 0.46, z: thorax.sz * 0.46 },
      { x: sign * thoraxHalfW * 0.52, y: lerp(thorax.minY, thorax.maxY, 0.52), z: lerp(thorax.minZ, thorax.maxZ, 0.5) });
  });
  if (L.spineCervical) {
    const tracheaTopY = L.spineCervical.minY;
    const tracheaBottomY = lerp(thorax.minY, thorax.maxY, 0.65);
    addOrgan(resp.group, resp.nodeToSid, 'traqueia', 'cylinder',
      { x: 0.012, y: tracheaTopY - tracheaBottomY, z: 0.012 },
      { x: 0, y: (tracheaTopY + tracheaBottomY) / 2, z: lerp(spineThoracicZ, sternumZ, 0.7) });
  }

  // --- Digestório: estômago, fígado, pâncreas, intestinos ---
  const dig = system('digestorio');
  const abdomenTopY = thorax.minY;
  addOrgan(dig.group, dig.nodeToSid, 'estomago', 'sphere',
    { x: abdomenHalfW * 0.36, y: thorax.sy * 0.11, z: thorax.sz * 0.30 },
    { x: -abdomenHalfW * 0.5, y: abdomenTopY - thorax.sy * 0.16, z: lerp(spineThoracicZ, sternumZ, 0.55) });
  addOrgan(dig.group, dig.nodeToSid, 'figado', 'box',
    { x: abdomenHalfW * 0.85, y: thorax.sy * 0.20, z: thorax.sz * 0.55 },
    { x: abdomenHalfW * 0.5, y: abdomenTopY - thorax.sy * 0.10, z: lerp(spineThoracicZ, sternumZ, 0.6) });
  addOrgan(dig.group, dig.nodeToSid, 'pancreas', 'box',
    { x: abdomenHalfW * 0.75, y: thorax.sy * 0.055, z: thorax.sz * 0.16 },
    { x: -abdomenHalfW * 0.05, y: abdomenTopY - thorax.sy * 0.19, z: lerp(spineThoracicZ, sternumZ, 0.35) });
  addOrgan(dig.group, dig.nodeToSid, 'intestino-delgado', 'torus',
    { x: abdomenHalfW * 0.62, y: thorax.sy * 0.32, z: abdomenHalfW * 0.62 },
    { x: 0, y: lerp(pelvis.maxY, abdomenTopY, 0.32), z: lerp(spineThoracicZ, sternumZ, 0.55) });
  addOrgan(dig.group, dig.nodeToSid, 'colon', 'torus',
    { x: abdomenHalfW * 0.9, y: thorax.sy * 0.4, z: abdomenHalfW * 0.9 },
    { x: 0, y: lerp(pelvis.maxY, abdomenTopY, 0.22), z: lerp(spineThoracicZ, sternumZ, 0.5) });

  // --- Urinário: rins + adrenais + bexiga ---
  const uri = system('urinario');
  const kidneyY = abdomenTopY - thorax.sy * 0.05;
  const kidneyZ = lerp(spineThoracicZ, sternumZ, 0.22);
  ['esquerdo', 'direito'].forEach((lado, i) => {
    const sign = i === 0 ? -1 : 1;
    addOrgan(uri.group, uri.nodeToSid, `rim-${lado}`, 'sphere',
      { x: abdomenHalfW * 0.16, y: thorax.sy * 0.11, z: thorax.sz * 0.24 },
      { x: sign * abdomenHalfW * 0.55, y: kidneyY, z: kidneyZ });
  });
  addOrgan(uri.group, uri.nodeToSid, 'bexiga', 'sphere',
    { x: pelvisHalfW * 0.42, y: pelvis.sy * 0.22, z: pelvis.sz * 0.32 },
    { x: 0, y: lerp(pelvis.minY, pelvis.maxY, 0.25), z: lerp(pelvis.minZ, pelvis.maxZ, 0.65) });

  // --- Linfático: baço + timo ---
  const linf = system('linfatico');
  addOrgan(linf.group, linf.nodeToSid, 'baco', 'sphere',
    { x: abdomenHalfW * 0.16, y: thorax.sy * 0.11, z: thorax.sz * 0.16 },
    { x: -abdomenHalfW * 0.78, y: abdomenTopY - thorax.sy * 0.02, z: lerp(spineThoracicZ, sternumZ, 0.35) });
  if (L.sternum) {
    addOrgan(linf.group, linf.nodeToSid, 'timo', 'box',
      { x: thoraxHalfW * 0.22, y: thorax.sy * 0.09, z: thorax.sz * 0.14 },
      { x: 0, y: L.sternum.maxY, z: lerp(spineThoracicZ, sternumZ, 0.75) });
  }

  // --- Endócrino: tireoide ---
  if (L.spineCervical) {
    const endo = system('endocrino');
    addOrgan(endo.group, endo.nodeToSid, 'tireoide', 'box',
      { x: thoraxHalfW * 0.28, y: thorax.sy * 0.05, z: thorax.sz * 0.06 },
      { x: 0, y: L.spineCervical.minY, z: L.spineCervical.maxZ + thorax.sz * 0.14 });
  }

  // --- Nervoso: encéfalo + medula ---
  const nerv = system('nervoso');
  if (skull) {
    addOrgan(nerv.group, nerv.nodeToSid, 'encefalo', 'sphere',
      { x: skull.sx * 0.38, y: skull.sy * 0.30, z: skull.sz * 0.30 },
      { x: skull.cx, y: lerp(skull.minY, skull.maxY, 0.58), z: lerp(skull.minZ, skull.maxZ, 0.42) });
  }
  if (L.spineCervical) {
    const cordTopY = L.spineCervical.maxY;
    const cordBottomY = L.spineLumbar ? L.spineLumbar.minY : pelvis.maxY;
    addOrgan(nerv.group, nerv.nodeToSid, 'medula-espinhal', 'cylinder',
      { x: 0.012, y: cordTopY - cordBottomY, z: 0.012 },
      { x: 0, y: (cordTopY + cordBottomY) / 2, z: lerp(spineThoracicZ, spineLumbarZ, 0.5) });
  }

  // --- Reprodutor: próstata (placeholder único — ver GAP no relatório: o
  // fallback não distingue sexo, ao contrário do AssetLoader normal) ---
  const rep = system('reprodutor');
  addOrgan(rep.group, rep.nodeToSid, 'prostata', 'sphere',
    { x: pelvisHalfW * 0.16, y: pelvis.sy * 0.08, z: pelvis.sz * 0.14 },
    { x: 0, y: lerp(pelvis.minY, pelvis.maxY, 0.16), z: lerp(pelvis.minZ, pelvis.maxZ, 0.62) });

  return out;
}

/**
 * @param {import('../core/store.js')} state estado atual (`store.get()`).
 * @returns {boolean} `true` quando o fallback deveria assumir — todo
 *   sistema de `SYSTEM_IDS` está em `unavailableSystems` (ou nenhum jamais
 *   carregou). Quem integra os pacotes (WP13) chama isto depois de tentar
 *   `loadManifest`/`loadSystem` do sistema inicial.
 */
export function shouldFallback(state) {
  if (!state) return true;
  const unavailable = new Set(state.unavailableSystems || []);
  return SYSTEM_IDS.every((id) => unavailable.has(id));
}

/**
 * @param {{
 *   registry: import('../core/contracts.js').Registry,
 *   engine: import('../core/contracts.js').Engine,
 *   bodyGlbUrl?: string,
 * }} deps `bodyGlbUrl` default: "../models/body.glb" (relativo a este
 *   arquivo — é onde `models/body.glb` mora hoje, ver plano/contexto).
 */
export function createFallback({ registry, engine, bodyGlbUrl } = {}) {
  if (!registry) throw new Error('createFallback: registry é obrigatório');
  const url = bodyGlbUrl || new URL('../../models/body.glb', import.meta.url).href;

  let activePromise = null;
  let active = false;

  function buildLoader() {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    return gltfLoader;
  }

  /**
   * Carrega `body.glb`, classifica bone/muscle, registra os dois sistemas
   * reais e reconstrói a camada procedural de órgãos. Idempotente —
   * chamadas concorrentes compartilham a mesma promessa.
   * @returns {Promise<boolean>} `true` se ativou (mesmo parcialmente —
   *   ossos/músculos sempre existem no body.glb; a camada de órgãos só
   *   entra se os marcos ósseos essenciais forem encontrados).
   */
  function activate() {
    if (active) return Promise.resolve(true);
    if (activePromise) return activePromise;

    activePromise = (async () => {
      const gltfLoader = buildLoader();
      let gltf;
      try {
        gltf = await gltfLoader.loadAsync(url);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[atlas/fallback] models/body.glb não carregou — sem reserva possível:', err);
        activePromise = null;
        return false;
      }
      const root = gltf.scene;

      const bonesGroup = new THREE.Group();
      bonesGroup.name = 'fallback-esqueletico';
      const musclesGroup = new THREE.Group();
      musclesGroup.name = 'fallback-muscular';
      const boneNodeToSid = {};
      const muscleNodeToSid = {};
      /** @type {Array<{ mesh: THREE.Object3D, displayName: string }>} só ossos — usado pelos marcos. */
      const boneEntries = [];

      // Percorre o GLB UMA vez (mesma ideia de `indexRealModel` em
      // three-engine.js), classificando por `extras.type` do glTF.
      root.updateMatrixWorld(true);
      const meshNodes = [];
      root.traverse((child) => {
        if (child.isMesh) meshNodes.push(child);
      });
      for (const child of meshNodes) {
        const extras = child.userData || {};
        const type = extras.type;
        if (type !== 'bone' && type !== 'muscle') continue; // bursas/bainhas (ver classifyRealMesh) não entram na v2
        const displayName = extras.name || child.name || 'Estrutura';
        const targetMap = type === 'bone' ? boneNodeToSid : muscleNodeToSid;
        const slug = slugify(displayName);
        let unique = slug;
        let i = 2;
        while (targetMap[unique]) { unique = `${slug}-${i}`; i += 1; }
        // `attach` (em vez de `add`) preserva a transformação de mundo ao
        // trocar de pai — o nó vinha de uma cadeia profunda em `root`.
        (type === 'bone' ? bonesGroup : musclesGroup).attach(child);
        child.name = unique;
        targetMap[unique] = `za:${unique}`;
        if (type === 'bone') boneEntries.push({ mesh: child, displayName });
      }

      registry.registerSystem('esqueletico', { root: bonesGroup, nodeToSid: boneNodeToSid, sex: 'U', lod: 'lod0', esquematico: false });
      registry.registerSystem('muscular', { root: musclesGroup, nodeToSid: muscleNodeToSid, sex: 'U', lod: 'lod0', esquematico: false });

      const landmarks = computeLandmarks(boneEntries);
      if (landmarks) {
        const organSystems = buildOrganSystems(landmarks);
        for (const [system, { group, nodeToSid }] of Object.entries(organSystems)) {
          registry.registerSystem(system, { root: group, nodeToSid, sex: 'U', lod: 'lod0', esquematico: true });
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[atlas/fallback] marcos ósseos essenciais (tórax/quadril) não encontrados em body.glb — só esqueleto/músculos entraram na reserva.');
      }

      active = true;
      if (engine && engine.requestRender) engine.requestRender();
      return true;
    })();

    return activePromise;
  }

  function isActive() {
    return active;
  }

  return { activate, isActive, shouldFallback };
}
