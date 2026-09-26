/**
 * dev/assets-harness.js — harness manual/E2E do carregador de assets (WP05)
 * ---------------------------------------------------------------------------
 * Cena mínima própria (WP04 ainda não publicou `js/engine/renderer.js`
 * nesta onda — ver aviso no topo do arquivo de tarefas do WP05; quando
 * existir, troque este bloco por `import { createRenderer } from
 * '../js/engine/renderer.js'` sem tocar no resto do arquivo, já que só
 * usamos o contrato `Engine` de `js/core/contracts.js`: `scene`, `camera`,
 * `renderer`, `requestRender`).
 *
 * Expõe `window.__assetsHarness` para `frontend/scripts/e2e/atlas-assets.e2e.js`
 * dirigir tudo sem depender de UI (cliques só existem para inspeção manual
 * no navegador).
 */
import * as THREE from '../vendor/three/three.module.js';
import { on, off, emit, EVENTS } from '../js/core/bus.js';
import * as store from '../js/core/store.js';
import { SYSTEM_IDS } from '../js/core/contracts.js';
import { createAssetLoader } from '../js/engine/assets.js';
import { createRegistry } from '../js/engine/registry.js';
import { createFallback, shouldFallback } from '../js/engine/fallback.js';

const bus = { on, off, emit };

// ---------------------------------------------------------------------------
// "Engine" mínimo — só o que Registry/AssetLoader realmente usam do
// contrato (`scene`, `camera`, `renderer`, `requestRender`); render sob
// demanda, como pede o orçamento de desempenho (§17: nunca um rAF
// incondicional).
// ---------------------------------------------------------------------------
const holder = document.getElementById('canvas-holder');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
holder.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2230);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
camera.position.set(0, 1.1, 2.6);
camera.lookAt(0, 1.1, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(2, 3, 2);
scene.add(sun);

let frameRequested = false;
function render() {
  frameRequested = false;
  const rect = holder.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}
function requestRender() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(render);
}
window.addEventListener('resize', requestRender);

/** @type {import('../js/core/contracts.js').Engine} */
const engine = {
  scene,
  camera,
  renderer,
  requestRender,
  setViewOffset() { /* fora do escopo do WP05 — ver js/engine/camera.js (WP04) */ },
  focusSid() { /* idem */ },
  viewPreset() { /* idem */ },
};

// ---------------------------------------------------------------------------
// Fiação Registry ↔ AssetLoader ↔ Fallback (ver GAP documentado no topo de
// js/engine/assets.js: contracts.js não fixa como os dois se ligam).
// ---------------------------------------------------------------------------
const registry = createRegistry({ engine, bus });
const baseUrl = new URL('../data/atlas/fixtures/', import.meta.url).href;
const assetLoader = createAssetLoader({ bus, store, baseUrl, engine, registry });
const fallback = createFallback({ registry, engine, bodyGlbUrl: new URL('../models/body.glb', import.meta.url).href });

// ---------------------------------------------------------------------------
// Log visível + console (para depuração manual) — sem innerHTML (mesma
// regra do resto do Atlas, ver modulos/shared/safe-dom.js).
// ---------------------------------------------------------------------------
const logList = document.getElementById('log');
function log(text, kind) {
  const li = document.createElement('li');
  if (kind) li.className = kind;
  li.textContent = text;
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
  // eslint-disable-next-line no-console
  console.log('[assets-harness]', text);
}

on(EVENTS.SYSTEM_LOAD_START, ({ system }) => log(`⏳ ${system}: carregando…`));
on(EVENTS.SYSTEM_LOAD_DONE, ({ system, lod, sex }) => log(`✔ ${system}: carregado (${lod}, sexo ${sex})`, 'ok'));
on(EVENTS.SYSTEM_LOAD_ERROR, ({ system, error }) => log(`✘ ${system}: ${error || 'indisponível'}`, 'err'));

// ---------------------------------------------------------------------------
// Botões — um por sistema de SYSTEM_IDS (contracts.js), sexo, 404 de
// propósito, detalhe de órgão e reserva.
// ---------------------------------------------------------------------------
const systemsFieldset = document.getElementById('systems-fieldset');
SYSTEM_IDS.forEach((sid) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = sid;
  btn.dataset.system = sid;
  btn.addEventListener('click', () => {
    assetLoader.loadSystem(sid).then((res) => {
      if (res) updateStats();
    });
  });
  systemsFieldset.appendChild(btn);
});

document.querySelectorAll('[data-action="sex"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sex = btn.dataset.value;
    store.set({ sex });
    document.getElementById('btn-sex-m').setAttribute('aria-pressed', String(sex === 'M'));
    document.getElementById('btn-sex-f').setAttribute('aria-pressed', String(sex === 'F'));
    log(`sexo → ${sex}`);
  });
});

document.querySelector('[data-action="load-articular"]').addEventListener('click', () => {
  assetLoader.loadSystem('articular');
});

document.querySelector('[data-action="load-organ-detail"]').addEventListener('click', async () => {
  await assetLoader.loadSystem('cardiovascular');
  const res = await assetLoader.loadOrganDetail('fma:7088', { sex: 'M' });
  log(res ? '✔ detalhe do órgão (coração) carregado' : '✘ detalhe do órgão indisponível', res ? 'ok' : 'err');
});

document.querySelector('[data-action="fallback"]').addEventListener('click', async () => {
  await fallback.activate();
  updateStats();
  log('reserva (body.glb) ativada', 'ok');
});

document.querySelector('[data-action="stats"]').addEventListener('click', updateStats);

function updateStats() {
  document.getElementById('stats').textContent = JSON.stringify(registry.stats(), null, 1);
}

// ---------------------------------------------------------------------------
// Carrega o manifesto e os dois sistemas iniciais (músculos + esqueleto —
// mesmo padrão de `store.layers` inicial) para a página já abrir com algo
// visível, como no Atlas de verdade.
// ---------------------------------------------------------------------------
assetLoader.loadManifest().then(() => {
  return Promise.all([assetLoader.loadSystem('esqueletico'), assetLoader.loadSystem('muscular')]);
}).then(() => {
  updateStats();
  requestRender();
}).catch((err) => log(`✘ manifest: ${err.message}`, 'err'));

requestRender();

// ---------------------------------------------------------------------------
// Ponto único de entrada para o E2E (frontend/scripts/e2e/atlas-assets.e2e.js)
// — nada de seletor de DOM frágil, tudo por aqui.
// ---------------------------------------------------------------------------
window.__assetsHarness = {
  bus: { on, emit, EVENTS },
  store,
  engine,
  registry,
  assetLoader,
  fallback,
  shouldFallback,
  SYSTEM_IDS,
  /**
   * Projeta o centro da bbox de `sid` em coordenadas normalizadas de tela
   * ([-1,1], mesmo espaço de `Registry.pick`) — usado pelo E2E para clicar
   * "no meio" de uma estrutura sem precisar calcular a projeção na mão.
   * @param {string} sid
   * @returns {{x:number,y:number}|null}
   */
  projectSidToNDC(sid) {
    const bbox = registry.getBBox(sid);
    if (!bbox) return null;
    const center = new THREE.Vector3(
      (bbox.min[0] + bbox.max[0]) / 2,
      (bbox.min[1] + bbox.max[1]) / 2,
      (bbox.min[2] + bbox.max[2]) / 2
    );
    center.project(camera);
    return { x: center.x, y: center.y };
  },
  requestRender,
};
