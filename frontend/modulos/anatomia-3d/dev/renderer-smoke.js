/**
 * renderer-smoke.js
 * Teste de fumaça para validar o renderizador adaptativo com render-on-demand.
 * Cria um renderer, adiciona 3 cubos, renderiza uma vez e valida o resultado.
 */

import { createRenderer } from '../js/engine/renderer.js';
import { on, emit, EVENTS } from '../js/core/bus.js';

const statusEl = document.getElementById('status');
const containerEl = document.getElementById('container');

const errors = [];
let securityPolicyViolations = 0;

// Monitora erros
window.addEventListener('error', (event) => {
  // Ignora erros de carregamento de recursos (network/404 errors)
  if (event.target && event.target.src) {
    return;
  }
  errors.push(`Error: ${event.message}`);
});

// Monitora violações de CSP
window.addEventListener('securitypolicyviolation', (event) => {
  securityPolicyViolations++;
  errors.push(`CSP Violation: ${event.violatedDirective}`);
});

try {
  // Cria um mock do bus se necessário (para testes)
  const mockBus = {
    on: (evt, fn) => () => {},
    emit: () => {},
  };

  // Cria o renderer
  const {
    THREE,
    renderer,
    scene,
    camera,
    requestRender,
    getStats,
  } = createRenderer({
    container: containerEl,
    bus: mockBus,
  });

  // Adiciona 3 cubos para testar renderização
  const boxGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const materials = [
    new THREE.MeshPhongMaterial({ color: 0xff0000 }), // Vermelho
    new THREE.MeshPhongMaterial({ color: 0x00ff00 }), // Verde
    new THREE.MeshPhongMaterial({ color: 0x0000ff }), // Azul
  ];

  const boxes = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(boxGeometry, materials[i]);
    mesh.position.x = (i - 1) * 0.8;
    scene.add(mesh);
    boxes.push(mesh);
  }

  // Agenda uma renderização
  requestRender();

  // Aguarda 500ms para a renderização acontecer e depois coleta stats
  await new Promise((resolve) => {
    setTimeout(() => {
      const stats = getStats();

      window.__rendererSmoke = {
        ok: errors.length === 0 && securityPolicyViolations === 0,
        renders: stats.renders,
        drawCalls: stats.drawCalls,
        tier: stats.tier,
        triangles: stats.triangles,
        errors,
        securityPolicyViolations,
      };

      statusEl.textContent = `✓ OK
Renderer ${stats.tier}
Renders: ${stats.renders}
Draw calls: ${stats.drawCalls}
CSP OK`;
      statusEl.style.background = 'rgba(0, 100, 0, 0.7)';

      resolve();
    }, 500);
  });

} catch (error) {
  console.error('Erro ao inicializar renderer smoke test:', error);

  window.__rendererSmoke = {
    ok: false,
    error: error.message,
    errors,
    securityPolicyViolations,
  };

  statusEl.textContent = `✗ ERRO
${error.message}`;
  statusEl.style.background = 'rgba(100, 0, 0, 0.7)';
}
