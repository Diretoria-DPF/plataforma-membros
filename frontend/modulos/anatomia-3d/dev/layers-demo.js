/**
 * layers-demo.js — demonstração do painel de camadas para testes
 */

// Importar o painel e os modules
import { createLayersPanel } from '../js/ui/layers-panel.js';
import { get as storeGet, set as storeSet, subscribe as storeSubscribe } from '../js/core/store.js';
import { on as busOn, emit as busEmit, EVENTS as BUS_EVENTS } from '../js/core/bus.js';

// ===== Setup: Bus simulado =====
const bus = {
  on: busOn,
  emit: busEmit,
  EVENTS: BUS_EVENTS,
};

// ===== Setup: Store real =====
const store = {
  get: storeGet,
  set: storeSet,
  subscribe: storeSubscribe,
};

// ===== Setup: Log global =====
window.__layersDemo = {
  events: [],
};

function logEvent(type, payload) {
  const event = { type, payload, timestamp: new Date().toISOString() };
  window.__layersDemo.events.push(event);

  const logEl = document.getElementById('events-log');
  if (logEl) {
    const item = document.createElement('div');
    item.className = 'demo-log-item';
    item.textContent = `[${event.timestamp.split('T')[1].slice(0, 8)}] ${type}: ${JSON.stringify(payload)}`;
    logEl.appendChild(item);
    logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
  }
}

// ===== Montar o painel =====
const container = document.getElementById('panel-mount');

try {
  // Inscrever no barramento para capturar eventos
  busOn(BUS_EVENTS.LAYER_SET, (payload) => {
    logEvent('LAYER_SET', payload);
  });

  // Criar o painel
  const panelInstance = createLayersPanel(container, {
    bus,
    store,
    unavailable: () => [], // Nenhuma camada indisponível por padrão
  });

  // Expor a instância global para testes
  window.__layersPanel = panelInstance;

  logEvent('INIT', { message: 'Painel montado com sucesso' });
} catch (err) {
  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.textContent = `Erro ao montar painel: ${err.message}`;
  container.appendChild(errorBox);

  logEvent('ERROR', { message: err.message, stack: err.stack });
  console.error(err);
}

// ===== Monitores adicionais =====
// Log de mudanças no store
store.subscribe(
  (s) => s.layers,
  (newLayers) => {
    logEvent('STORE_LAYERS_CHANGE', newLayers);
  }
);
