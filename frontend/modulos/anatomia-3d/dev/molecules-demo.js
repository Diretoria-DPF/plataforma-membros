/**
 * molecules-demo.js — Demonstração do Modo Moléculas
 *
 * Monta o modo, seleciona a primeira proteína, e expõe
 * window.__molDemo para testes automatizados com Playwright.
 */

import { createMoleculesMode, createDefaultScriptLoader } from '../js/modes/molecules.js';

// Mock do bus (EventTarget minimalista)
const mockBus = {
  listeners: new Map(),
  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.off(evt, fn);
  },
  off(evt, fn) {
    const set = this.listeners.get(evt);
    if (set) set.delete(fn);
  },
  emit(evt, payload) {
    const set = this.listeners.get(evt);
    if (set) {
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[mockBus] erro em listener de "${evt}":`, err);
        }
      }
    }
  }
};

// Carrega lista de proteínas do JSON
async function loadProteins() {
  const res = await fetch('../data/atlas/proteins.json');
  if (!res.ok) throw new Error(`Falha ao carregar proteins.json: ${res.status}`);
  return res.json();
}

// Estado da demo
window.__molDemo = {
  ok: false,
  proteins: 0,
  viewerLoaded: false,
  fallbackShown: false,
  structureSelectEmitted: false
};

try {
  // Listener para estruture:select events (para teste)
  mockBus.on('structure:select', (evt) => {
    window.__molDemo.structureSelectEmitted = true;
  });

  // Cria o modo
  const mode = createMoleculesMode({
    bus: mockBus,
    loadProteins,
    loadScript: createDefaultScriptLoader()
  });

  // Entra no modo (sem context, já que é demo)
  await mode.enter({});

  // Gera o conteúdo da folha
  const sheetContent = mode.sheetContent();

  // Monta na página
  const sheetEl = document.getElementById('sheet');
  if (sheetEl && sheetContent) {
    // Usa replaceChildren() em vez de innerHTML para evitar violações CSP
    sheetEl.replaceChildren();
    sheetEl.appendChild(sheetContent);

    // Obtém a lista de proteínas
    const proteins = await loadProteins();
    window.__molDemo.proteins = proteins.length;

    // Simula clique em proteína que tem orgaoSid (para testar structure:select)
    // Procura pela primeira proteína com orgaoSid
    const proteinWithOrgao = proteins.find(p => p.orgaoSid);
    if (proteinWithOrgao) {
      const itemToClick = sheetEl.querySelector(`[data-pdb="${proteinWithOrgao.pdb}"]`);
      if (itemToClick) {
        itemToClick.click();
      }
    } else {
      // Fallback: clica no primeiro item
      const firstItem = sheetEl.querySelector('[data-pdb]:first-of-type');
      if (firstItem) {
        firstItem.click();
      }
    }

    // Detecta se a mensagem de fallback aparece (CDN bloqueado)
    // Espera até 12 s: ou o 3Dmol carrega, ou aparece o aviso de indisponível
    // (o carregador desiste em 10 s quando o CDN não responde).
    // A cor pode estar normalizada como rgb(248, 113, 113) ou #f87171
    const inicio = Date.now();
    const espera = setInterval(() => {
      // Procura por div contendo "indisponível" (mais robusto que selector de cor)
      const allDivs = Array.from(sheetEl.querySelectorAll('div'));
      let errorMsg = null;
      for (const div of allDivs) {
        if (div.textContent.includes('indisponível') && div.textContent.includes('RCSB')) {
          errorMsg = div;
          break;
        }
      }
      window.__molDemo.viewerLoaded = !!window.$3Dmol;
      window.__molDemo.fallbackShown = !!errorMsg;
      if (window.__molDemo.viewerLoaded || window.__molDemo.fallbackShown || Date.now() - inicio > 12000) {
        clearInterval(espera);
        window.__molDemo.ok = true;
      }
    }, 250);
  }
} catch (err) {
  console.error('[molecules-demo] Erro:', err);
  window.__molDemo.ok = false;
}
