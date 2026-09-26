/**
 * infocard-demo.js — Demo page for info card.
 *
 * Loads fixtures and renders the heart (fma:7088) with Playwright tests.
 */

import { createInfoCard } from '../js/ui/infocard.js';

// Simulação de um objeto de contrato de ações
const actionLog = [];

/**
 * Carrega um arquivo JSON.
 */
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Inicializa a demo.
 */
async function init() {
  const header = document.getElementById('demo-header');
  const mount = document.getElementById('infocard-mount');

  try {
    // Carrega os fixtures
    const indexData = await loadJson('../data/atlas/fixtures/index.json');
    const contentData = await loadJson('../data/atlas/fixtures/content/cardiovascular.json');

    // Encontra a entrada do coração (fma:7088)
    const heartEntry = indexData.find((e) => e.sid === 'fma:7088');
    if (!heartEntry) {
      throw new Error('Coração (fma:7088) não encontrado no index.json');
    }

    const heartContent = contentData['fma:7088'];
    if (!heartContent) {
      throw new Error('Conteúdo do coração não encontrado em cardiovascular.json');
    }

    // Cria a ficha
    const infocard = createInfoCard(mount, {
      onAction: (payload) => {
        console.log('[onAction]', payload);
        actionLog.push(payload);
      },
    });

    // Renderiza
    infocard.render(heartEntry, heartContent);

    // Atualiza o header
    header.textContent = `✓ Info Card Demo — Coração renderizado`;

    // Expõe a interface de testes para Playwright
    window.__infocardDemo = {
      ok: true,
      tabs: ['resumo', 'anatomia', 'histologia', 'clinica', 'referencias'],
      infocard,
      heartEntry,
      heartContent,
      actionLog,
    };

    console.log('[demo] Pronto. window.__infocardDemo =', window.__infocardDemo);
  } catch (err) {
    console.error('[demo] Erro:', err);
    header.textContent = `✗ Erro: ${err.message}`;
    window.__infocardDemo = { ok: false, error: err.message };
  }
}

// Aguarda o DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
