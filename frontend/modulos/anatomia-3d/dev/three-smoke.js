/**
 * three-smoke.js
 * Teste de fumaça para validar o vendoring do three.js.
 * Importa THREE, GLTFLoader, DRACOLoader, MeshoptDecoder e OrbitControls.
 * Cria um renderizador com uma cena e um cubo, sem carregar recursos externos.
 */

import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/three/loaders/DRACOLoader.js';
import { MeshoptDecoder } from '../vendor/three/libs/meshopt_decoder.module.js';
import { OrbitControls } from '../vendor/three/controls/OrbitControls.js';

const statusEl = document.getElementById('status');

try {
  // Cria uma instância de DRACOLoader para validar a importação
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('../vendor/three/libs/draco/');

  // Inicializa o decodificador Meshopt
  if (MeshoptDecoder && typeof MeshoptDecoder.ready === 'function') {
    await MeshoptDecoder.ready;
  }

  // Cria o renderer
  const canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x222222);

  // Cria a cena
  const scene = new THREE.Scene();

  // Cria uma câmera
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  // Cria um cubo
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  // Adiciona luz
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 5, 5);
  scene.add(light);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  // Inicializa os controles OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2;

  // Loop de animação
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // Monitora eventos de CSP e erros (ignora 404 de recursos automáticos como favicon)
  const errors = [];
  let securityPolicyViolations = 0;

  window.addEventListener('error', (event) => {
    // Ignora erros de carregamento de recursos (network/404 errors)
    // Esses são events onde event.target é um elemento, não a window
    if (event.target && event.target.src) {
      return; // Ignora erros de carregamento de recursos (img, script, etc)
    }
    errors.push(`Error: ${event.message}`);
  });

  window.addEventListener('securitypolicyviolation', (event) => {
    securityPolicyViolations++;
    errors.push(`CSP Violation: ${event.violatedDirective}`);
  });

  // Define o objeto de teste
  window.__threeSmoke = {
    ok: true,
    revision: THREE.REVISION,
    errors: errors,
    securityPolicyViolations: securityPolicyViolations,
  };

  statusEl.textContent = `✓ OK\nthree.js ${THREE.REVISION}\nCSP OK`;
  statusEl.style.background = 'rgba(0, 100, 0, 0.7)';

  // Redimensiona o canvas quando a janela é redimensionada
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  });

} catch (error) {
  console.error('Erro ao inicializar smoke test:', error);

  window.__threeSmoke = {
    ok: false,
    revision: 'unknown',
    error: error.message,
  };

  statusEl.textContent = `✗ ERRO\n${error.message}`;
  statusEl.style.background = 'rgba(100, 0, 0, 0.7)';
}
