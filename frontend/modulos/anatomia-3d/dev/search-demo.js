/**
 * search-demo.js — demo e testes da caixa de busca
 */

import { createSearchBox } from '../js/ui/search-box.js';
import * as realBus from '../js/core/bus.js';

// Logger para testes
const logEl = document.getElementById('demo-log');
const headerEl = document.getElementById('demo-header');
const logs = [];

function log(msg) {
  logs.push(msg);
  if (logs.length > 30) logs.shift();
  // Renderizar logs com LaiftDom.h em vez de innerHTML
  const { clear, h } = window.LaiftDom;
  clear(logEl);
  logs.forEach((l) => {
    const line = h('div', { className: 'log-line', text: l });
    logEl.appendChild(line);
  });
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
    headerEl.textContent = `Search Box Demo — ERRO: ${err.message}`;
    return false;
  }
}

// Montar componente
async function main() {
  const ok = await loadFixture();
  if (!ok) return;

  // Criar search box
  const searchBox = createSearchBox(
    document.getElementById('search-box-mount'),
    {
      bus,
      getIndex: () => indexData,
      onOpenSystem: (systemId) => {
        log(`[onOpenSystem] ${systemId}`);
      },
    }
  );

  // Expor na janela para testes
  window.__searchDemo = {
    searchBox,
    logs,
    bus,
    indexData,
    log,
    events: [],
  };

  // Escutar todos os eventos
  bus.on(realBus.EVENTS.STRUCTURE_SELECT, (payload) => {
    const event = { name: 'STRUCTURE_SELECT', ...payload };
    window.__searchDemo.events.push(event);
    log(`→ STRUCTURE_SELECT: sid=${payload.sid}, source=${payload.source}`);
  });

  headerEl.textContent = 'Search Box Demo (390×844) — Pronto!';
  log('✓ Search box montado');
  log('use window.__searchDemo para testar');
}

// Esperar o DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
