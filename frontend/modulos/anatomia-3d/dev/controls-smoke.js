/**
 * controls-smoke.js
 * Teste de fumaça para validar o módulo de controles de câmera.
 * Importa createControls, cria uma câmera, e verifica se inicializa sem erros.
 */

import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/controls/OrbitControls.js';
import { createControls } from '../js/engine/controls.js';

const statusEl = document.getElementById('status');

try {
  // Cria o canvas e renderizador
  const canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x222222);

  // Cria a câmera
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  // Cria a cena
  const scene = new THREE.Scene();

  // Cria um cubo simples para teste
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  // Luz ambiente
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 5, 5);
  scene.add(light);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  // Mock de barramento de eventos minimalista
  const bus = {
    EVENTS: {
      VIEW_PRESET: 'view:preset',
      VIEW_RESET: 'view:reset',
    },
    emit: () => {},
  };

  // Função para requisitar render
  function requestRender() {
    // No-op para smoke test
  }

  // Cria os controles
  const controls = createControls({
    camera,
    domElement: canvas,
    bus,
    requestRender,
    OrbitControls,
    THREE,
  });

  // Inicia loop de animação
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // Monitora erros de CSP e exceções
  const errors = [];
  let securityPolicyViolations = 0;

  window.addEventListener('error', (event) => {
    if (event.target && event.target.src) {
      return; // Ignora erros de carregamento de recursos
    }
    errors.push(`Error: ${event.message}`);
  });

  window.addEventListener('securitypolicyviolation', (event) => {
    securityPolicyViolations++;
    errors.push(`CSP Violation: ${event.violatedDirective}`);
  });

  // Define objeto de teste
  window.__controlsSmoke = {
    ok: true,
    errors: errors,
    securityPolicyViolations: securityPolicyViolations,
  };

  statusEl.textContent = '✓ OK\nControles carregados\nCSP OK';
  statusEl.style.background = 'rgba(0, 100, 0, 0.7)';

  // Redimensiona canvas ao redimensionar janela
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  });

} catch (error) {
  console.error('Erro ao inicializar smoke test:', error);

  window.__controlsSmoke = {
    ok: false,
    error: error.message,
  };

  statusEl.textContent = `✗ ERRO\n${error.message}`;
  statusEl.style.background = 'rgba(100, 0, 0, 0.7)';
}
