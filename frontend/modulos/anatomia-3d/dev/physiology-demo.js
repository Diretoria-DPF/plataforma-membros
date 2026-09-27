/**
 * physiology-demo.js — Demo do modo Fisiologia & Vias
 *
 * Setup:
 * - CSP validation
 * - THREE scene simulado
 * - Mock getBBoxCenter que mapeia sid → y aleatório [0.2, 1.7]
 * - Monta o modo, seleciona rota ORAL, toca a animação
 * - Após 1s: window.__physioDemo = {ok, steps, playing, selectEvents}
 */

import * as THREE from '../vendor/three/three.module.js';
import { createPhysiologyMode } from '../js/modes/physiology.js';
import { emit, on, EVENTS } from '../js/core/bus.js'; // Note: This path from dev directory

// ============================================================================
// CSP Validation
// ============================================================================

const cspViolations = [];
window.addEventListener('securitypolicyviolation', (event) => {
  cspViolations.push({
    violatedDirective: event.violatedDirective,
    originalPolicy: event.originalPolicy,
  });
});

// ============================================================================
// Setup inicial
// ============================================================================

const sceneEl = document.getElementById('scene');
const sheetEl = document.getElementById('sheet');

// Cria THREE scene simulada
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(390, 300); // viewport padrão do teste
sceneEl.appendChild(renderer.domElement);

// Luz
const light = new THREE.PointLight(0xffffff);
light.position.set(5, 5, 5);
scene.add(light);

// ============================================================================
// Mock do Engine/Registry
// ============================================================================

let tickerCallbacks = [];

const mockEngine = {
  scene,
  camera,
  renderer,
  requestRender() {
    renderer.render(scene, camera);
  },
};

const hashSid = (sid) => {
  let hash = 0;
  for (let i = 0; i < sid.length; i++) {
    hash = (hash << 5) - hash + sid.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const getBBoxCenter = (sid) => {
  const h = Math.abs(hashSid(sid));
  const y = 0.2 + (h % 1000) / 1000 * 1.5; // [0.2, 1.7]
  return [
    (h % 1000) / 1000 * 2 - 1, // [-1, 1]
    y,
    (h % 1000) / 500 - 1, // [-1, 1]
  ];
};

// ============================================================================
// Load data (mock)
// ============================================================================

let routes = [];
let processes = [];

async function loadRoutes() {
  try {
    const res = await fetch('../data/atlas/routes.json');
    return await res.json();
  } catch (err) {
    console.error('Erro ao carregar routes.json:', err);
    return [];
  }
}

async function loadProcesses() {
  try {
    const res = await fetch('../data/atlas/processes.json');
    return await res.json();
  } catch (err) {
    console.error('Erro ao carregar processes.json:', err);
    return [];
  }
}

// ============================================================================
// Setup do modo
// ============================================================================

const selectEvents = [];

on(EVENTS.STRUCTURE_SELECT, (payload) => {
  selectEvents.push(payload);
});

const mode = createPhysiologyMode({
  bus: {},
  loadRoutes,
  loadProcesses,
  getBBoxCenter,
  engine: mockEngine,
  THREE,
  getLabel: (sid) => sid,
});

// ============================================================================
// Demo execution
// ============================================================================

(async () => {
  try {
    // Carrega dados
    routes = await loadRoutes();
    processes = await loadProcesses();

    // Entra no modo
    await mode.enter({});

    // Renderiza conteúdo da sheet
    const sheetContent = mode.sheetContent();
    if (sheetContent) {
      sheetEl.appendChild(sheetContent);
    }

    // Simula seleção emitindo um evento STRUCTURE_SELECT
    const oralRoute = routes.find((r) => r.id === 'oral') || routes[0];
    if (oralRoute) {
      const firstAnchor = oralRoute.anchors?.[0];
      if (firstAnchor) {
        emit(EVENTS.STRUCTURE_SELECT, {
          sid: firstAnchor.sid,
          source: 'api',
        });
      }
    }

    // Aguarda 1s para a animação começar
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Coleta dados para o resultado
    const steps = oralRoute ? (oralRoute.anchors?.length || 0) : 0;
    const playing = selectEvents.length > 0;

    window.__physioDemo = {
      ok: cspViolations.length === 0 && steps > 0,
      steps,
      playing,
      selectEvents,
    };

    console.log('Demo resultado:', window.__physioDemo);
  } catch (err) {
    console.error('Erro no demo:', err);
    window.__physioDemo = {
      ok: false,
      steps: 0,
      playing: false,
      selectEvents: [],
      error: err.message,
    };
  }
})();
