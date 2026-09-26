/**
 * selection.js — gerenciador de seleção de estruturas do Atlas v2 (Onda 1, WP02)
 * ---------------------------------------------------------------------------
 * Coordena a seleção de estruturas anatômicas: muda cor de destaque, emite
 * eventos, mantém sincronizado o estado do store, e reage a seleções de
 * outras fontes (busca, navegador, quiz) sem loops infinitos.
 *
 * @example
 *   import { on, emit, EVENTS } from '../core/bus.js';
 *   import { createSelection } from './selection.js';
 *   const selection = createSelection({ registry, bus, store, requestRender, focusSid });
 *   selection.select('fma:7088', 'pick');
 *   console.log(selection.getSelected()); // 'fma:7088'
 *   selection.dispose();
 */

import { EVENTS, on, off, emit } from '../core/bus.js';

/**
 * Cria um gerenciador de seleção de estruturas.
 * @param {Object} ctx
 * @param {Object} ctx.registry - Registry do Atlas (pick, setBBox, setColor)
 * @param {Object} ctx.bus - Barramento de eventos (on, emit)
 * @param {Object} ctx.store - Store do estado global (get, set)
 * @param {() => void} ctx.requestRender - Função para marcar próximo render
 * @param {(sid: string) => void} ctx.focusSid - Função para focar câmera em estrutura
 * @param {string} [ctx.highlightColor='#ffb020'] - Cor do destaque
 * @returns {Object} API de seleção
 */
export function createSelection({ registry, bus, store, requestRender, focusSid, highlightColor = '#ffb020' }) {
  // --- Estado interno ---
  let currentHighlightColor = highlightColor;
  let isSelecting = false; // Flag para guardar contra re-entrância

  // --- Utilitários ---

  /**
   * Seleciona uma estrutura ou limpa a seleção.
   * @param {(string|null)} sid
   * @param {string} [source='api']
   */
  function select(sid, source = 'api') {
    const prev = store.get().selectedSid;

    // Evita re-entrância: se já estamos no meio de um select para o mesmo sid,
    // ignora (a não ser que seja 'focus', que sempre processa)
    if (source !== 'focus' && sid === prev) {
      return;
    }

    // Guard contra re-entrância: se algo reagindo ao evento chamar select
    // novamente para o mesmo sid, não reentra.
    if (isSelecting) {
      return;
    }

    isSelecting = true;
    try {
      // Restaura a cor anterior
      if (prev !== null) {
        registry.setColor(prev, null);
      }

      // Aplica a cor nova
      if (sid !== null) {
        registry.setColor(sid, currentHighlightColor);
      }

      // Atualiza o store
      store.set({ selectedSid: sid });

      // Emite o evento
      emit(EVENTS.STRUCTURE_SELECT, { sid, source });

      // Marca para render
      requestRender();
    } finally {
      isSelecting = false;
    }
  }

  /**
   * Manipulador de eventos do controle/câmera (pick).
   * @param {Object} evt
   * @param {Object} evt.ndc - Ponto normalizado de tela {x, y}
   * @param {string} evt.kind - 'tap' ou 'focus'
   */
  function handlePick({ ndc, kind }) {
    const sid = registry.pick(ndc);

    if (kind === 'tap') {
      // Tap seleciona (ou limpa se vazio)
      select(sid, 'pick');
    } else if (kind === 'focus') {
      // Focus seleciona e chama focusSid
      if (sid) {
        select(sid, 'focus');
        focusSid(sid);
      }
    }
  }

  /**
   * Muda a cor de destaque e a reaplica à seleção atual.
   * @param {string} color - Cor em qualquer formato que setColor aceite
   */
  function setHighlightColor(color) {
    currentHighlightColor = color;
    const sid = store.get().selectedSid;
    if (sid) {
      registry.setColor(sid, color);
      requestRender();
    }
  }

  /**
   * Retorna o sid atualmente selecionado.
   * @returns {(string|null)}
   */
  function getSelected() {
    return store.get().selectedSid;
  }

  /**
   * Cancela todas as assinaturas e limpa recursos.
   */
  function dispose() {
    offExternalSelect();
  }

  // --- Listener para eventos de outras fontes (busca, navegador, quiz) ---

  let offExternalSelect = () => {};

  // Assina eventos de seleção de outras fontes, mas sem re-emitir
  offExternalSelect = on(EVENTS.STRUCTURE_SELECT, ({ sid, source }) => {
    // Ignora eventos que viemos de nós mesmos (source 'pick' ou 'api' aqui)
    // Responde apenas a eventos de outras fontes: 'search', 'navigator', 'quiz'
    if (source === 'pick' || source === 'api') {
      return;
    }

    // Aplica o destaque sem re-emitir
    const prev = store.get().selectedSid;
    if (prev !== null) {
      registry.setColor(prev, null);
    }
    if (sid !== null) {
      registry.setColor(sid, currentHighlightColor);
    }
    requestRender();
  });

  return {
    select,
    handlePick,
    setHighlightColor,
    getSelected,
    dispose,
  };
}

/**
 * Helper puro: gera string de anúncio para aria-live.
 * @param {(string|null)} label - Nome exibido da estrutura, ou null se limpa
 * @param {string} systemLabel - Nome do sistema anatômico
 * @returns {string} String em PT-BR adequado para aria-live
 */
export function announce(label, systemLabel) {
  if (label === null) {
    return 'Seleção limpa';
  }
  return `Selecionado: ${label} — ${systemLabel}`;
}
