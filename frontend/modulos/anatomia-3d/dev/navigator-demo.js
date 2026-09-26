/**
 * navigator-demo.js — demo e testes do navegador
 */

import { createNavigator } from '../js/ui/navigator.js';
import * as realBus from '../js/core/bus.js';

// Logger para testes
const logEl = document.getElementById('demo-log');
const headerEl = document.getElementById('demo-header');
const logs = [];

function log(msg) {
  logs.push(msg);
  if (logs.length > 20) logs.shift();
  logEl.innerHTML = logs.map((l) => `<div class="log-line">${l}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// Usar o bus real da aplicação
const bus = {
  on: realBus.on,
  emit: realBus.emit,
  off: realBus.off,
};

// Índice em memória
let indexData = [];

// Carregador de fixture
async function loadFixture() {
  try {
    const res = await fetch('../data/atlas/fixtures/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    indexData = await res.json();
    log(`✓ Carregou ${indexData.length} estruturas`);
    return true;
  } catch (err) {
    log(`✗ Erro ao carregar fixture: ${err.message}`);
    headerEl.textContent = `Navigator Demo — ERRO: ${err.message}`;
    return false;
  }
}

// Montar navegador
async function main() {
  const ok = await loadFixture();
  if (!ok) return;

  // Interceptar a chamada ao módulo para injetar o bus mock
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    // Deixar fetch normal para o índice, mas interceptar imports se necessário
    return originalFetch.apply(this, args);
  };

  // Criar "bridge" para o módulo importado
  const navigator = createNavigator(
    document.getElementById('navigator-mount'),
    {
      bus: window.__AtlasBusForDemo,
      getIndex: () => indexData,
      isSystemAvailable: (systemId) => true,
      onSystemOpen: (systemId) => {
        log(`[onSystemOpen] ${systemId}`);
      },
    }
  );

  // Expor na janela para testes
  window.__navDemo = {
    navigator,
    logs,
    bus,
    indexData,
    log,
    // Simuladores para testes
    simulateExternalSelect(sid) {
      log(`[EXTERNAL_SELECT] ${sid}`);
      bus.emit(realBus.EVENTS.STRUCTURE_SELECT, { sid, source: 'search' });
    },
  };

  // Escutar STRUCTURE_SELECT
  bus.on(realBus.EVENTS.STRUCTURE_SELECT, (payload) => {
    log(`→ STRUCTURE_SELECT: sid=${payload.sid}, source=${payload.source}`);
  });

  headerEl.textContent = 'Navigator Demo (390×844) — Pronto!';
  log('✓ Navegador montado');
  log('use window.__navDemo para testar');
}

// Esperar o DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
