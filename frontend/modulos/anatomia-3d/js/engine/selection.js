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

import { EVENTS as DEFAULT_EVENTS, on as defaultOn, off as defaultOff, emit as defaultEmit } from '../core/bus.js';

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

  // Injeção de dependência do barramento com fallback aos módulos importados
  const onFn = (bus && typeof bus.on === 'function') ? bus.on.bind(bus) : defaultOn;
  const emitFn = (bus && typeof bus.emit === 'function') ? bus.emit.bind(bus) : defaultEmit;
  const events = (bus && bus.EVENTS) || DEFAULT_EVENTS;

  // --- Utilitários ---

  /**
   * Seleciona uma estrutura ou limpa a seleção.
   * @param {(string|null)} sid
   * @param {string} [source='api']
   */
  function select(sid, source = 'api') {
    const prev = store.get().selectedSid;

    // Evita re-entrância: se já estamos com o mesmo sid selecionado,
    // ignora (a não ser que seja 'focus', que sempre reprocessa o enquadramento)
    if (source !== 'focus' && sid === prev) {
      return;
    }

    if (isSelecting) {
      return;
    }

    isSelecting = true;
    try {
      // Restaura a cor anterior se era outra estrutura
      if (prev !== null && prev !== sid && registry?.setColor) {
        registry.setColor(prev, null);
      }

      // Aplica a nova cor de realce
      if (sid !== null && registry?.setColor) {
        registry.setColor(sid, currentHighlightColor);
      }

      // Atualiza o store canônico
      store.set({ selectedSid: sid });

      // Emite o evento para os demais módulos
      emitFn(events.STRUCTURE_SELECT, { sid, source });

      // Solicita novo frame de renderização
      if (typeof requestRender === 'function') {
        requestRender();
      }
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
    const sid = registry?.pick ? registry.pick(ndc) : null;

    if (kind === 'tap') {
      // Tap seleciona (ou desseleciona se clicou no vazio)
      select(sid, 'pick');
    } else if (kind === 'focus') {
      // Focus seleciona e centraliza a câmera na estrutura
      if (sid) {
        select(sid, 'focus');
        if (typeof focusSid === 'function') {
          focusSid(sid);
        }
      }
    }
  }

  /**
   * Muda a cor de destaque e a reaplica à seleção atual.
   * @param {string} color - Cor em formato aceito por setColor
   */
  function setHighlightColor(color) {
    currentHighlightColor = color;
    const sid = store.get().selectedSid;
    if (sid && registry?.setColor) {
      registry.setColor(sid, color);
      if (typeof requestRender === 'function') {
        requestRender();
      }
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
    if (typeof offExternalSelect === 'function') {
      offExternalSelect();
    }
  }

  // --- Listener para eventos de outras fontes (busca, navegador, quiz) ---

  // Assina eventos de seleção de outras fontes e sincroniza o estado sem re-emitir
  const offExternalSelect = onFn(events.STRUCTURE_SELECT, ({ sid, source }) => {
    // Evita loops se o evento partiu do próprio select interno
    if (isSelecting) {
      return;
    }

    // Ignora eventos que já foram tratados na origem direta
    if (source === 'pick' || source === 'api' || source === 'focus') {
      return;
    }

    const prev = store.get().selectedSid;
    if (sid === prev) {
      return;
    }

    isSelecting = true;
    try {
      // Atualiza cores no Registry 3D
      if (prev !== null && prev !== sid && registry?.setColor) {
        registry.setColor(prev, null);
      }
      if (sid !== null && registry?.setColor) {
        registry.setColor(sid, currentHighlightColor);
      }

      // Sincroniza o Store para notificar observadores (toolbar, breadcrumbs, etc.)
      store.set({ selectedSid: sid });

      if (typeof requestRender === 'function') {
        requestRender();
      }
    } finally {
      isSelecting = false;
    }
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
 * @param {string} [systemLabel] - Nome do sistema anatômico
 * @returns {string} String em PT-BR adequado para aria-live
 */
export function announce(label, systemLabel) {
  if (label === null) {
    return 'Seleção limpa';
  }
  if (!systemLabel) {
    return `Selecionado: ${label}`;
  }
  return `Selecionado: ${label} — ${systemLabel}`;
}
