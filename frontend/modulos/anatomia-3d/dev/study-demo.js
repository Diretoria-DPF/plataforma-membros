/**
 * study-demo.js — demonstração e verificação do modo "Meu estudo"
 *
 * Emite eventos, popula dados, e define window.__studyDemo com estado.
 */

import { createStudyStore } from '../js/modes/study-store.js';
import { createStudyMode, attachRecorder } from '../js/modes/study.js';

// Mini bus puro
const busListeners = new Map();

function on(evt, fn) {
  if (!busListeners.has(evt)) busListeners.set(evt, new Set());
  busListeners.get(evt).add(fn);
  return () => {
    busListeners.get(evt).delete(fn);
  };
}

function emit(evt, payload) {
  const set = busListeners.get(evt);
  if (!set) return;
  Array.from(set).forEach(fn => {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] erro ao emitir ${evt}:`, err);
    }
  });
}

const EVENTS = {
  STRUCTURE_SELECT: 'structure:select',
  QUIZ_ANSWER: 'quiz:answer',
};

const bus = { on, emit };

// =========================================================================

async function main() {
  const container = document.getElementById('sheet');

  try {
    // 1. Cria o store com IndexedDB real (não undefined)
    const store = createStudyStore();

    // 2. Cria o modo
    const mode = createStudyMode({ bus, store });

    // 3. Anexa o gravador (registra eventos automáticamente)
    attachRecorder(bus, store);

    // 4. Monta o modo
    const content = mode.sheetContent();
    container.appendChild(content);

    // 5. Emite 3 eventos de seleção
    emit(EVENTS.STRUCTURE_SELECT, { sid: 'coração', source: 'pick' });
    emit(EVENTS.STRUCTURE_SELECT, { sid: 'pulmão', source: 'search' });
    emit(EVENTS.STRUCTURE_SELECT, { sid: 'fígado', source: 'navigator' });

    // Aguarda um pouco
    await new Promise(r => setTimeout(r, 50));

    // 6. Fixa uma estrutura
    await store.togglePin({ sid: 'coração', label: 'Coração' });

    // 7. Escreve uma anotação
    await store.setNote('coração', 'Órgão principal do sistema cardiovascular\nBomba de sangue');

    // Aguarda mais um pouco
    await new Promise(r => setTimeout(r, 50));

    // 8. Coleta dados para verificação
    const history = await store.listHistory({});
    const pins = await store.listPins();
    const persistent = store.isPersistent();

    // Define o estado da demo
    window.__studyDemo = {
      ok: true,
      history: history.length,
      pins: pins.length,
      persistent,
    };

    console.log('Demo pronta:', window.__studyDemo);
  } catch (err) {
    window.__studyDemo = {
      ok: false,
      error: String(err),
    };
    console.error('Erro na demo:', err);
  }
}

main();
