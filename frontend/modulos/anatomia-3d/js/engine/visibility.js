/**
 * visibility.js — motor de visibilidade do Atlas v2 (Onda 0, WP06)
 * ---------------------------------------------------------------------------
 * Gerencia visibilidade e opacidade de estruturas anatômicas com base em
 * camadas, isolamento, ocultação e efeito fantasma. Implementa a lógica de
 * precedência e converte eventos do barramento em operações no Registry.
 */

/**
 * Cria um gerenciador de visibilidade para estruturas.
 * @param {Object} ctx
 * @param {Object} ctx.registry - Registry do Atlas
 * @param {Object} ctx.bus - Barramento de eventos (on, emit)
 * @param {Object} ctx.engine - Motor 3D com requestRender()
 * @param {() => Object} ctx.getLayers - Retorna {[layerId]: {visible, opacity}}
 * @returns {Object} API de visibilidade
 */
export function createVisibility({ registry, bus, engine, getLayers }) {
  // --- Estado interno ---
  const hidden = new Set();      // sids ocultos
  const ghosted = new Set();     // sids em efeito fantasma
  let isolated = null;           // sid isolado ou null

  // --- Listeners do barramento ---
  const unsubscribers = [];

  // --- Utilitários ---

  /**
   * Aplica a lógica de precedência a uma estrutura.
   * @param {Object} s - Estrutura com {sid, layer}
   * @returns {{visible: boolean, opacity: number}}
   */
  function computeVisibility(s) {
    const layers = getLayers();
    const L = layers[s.layer] || { visible: true, opacity: 1 };

    // 1. Se oculto → invisível
    if (hidden.has(s.sid)) {
      return { visible: false, opacity: 0 };
    }

    // 2. Se isolado → visível apenas o isolado, com opacidade 1
    if (isolated !== null) {
      const isIsolated = s.sid === isolated;
      return {
        visible: isIsolated,
        opacity: isIsolated ? 1 : 0,
      };
    }

    // 3. Se fantasma → opacidade 0.12, independente da camada
    if (ghosted.has(s.sid)) {
      return { visible: true, opacity: 0.12 };
    }

    // 4. Seguir o estado da camada
    return { visible: L.visible, opacity: L.opacity };
  }

  /**
   * Recomputa e aplica visibilidade a todas as estruturas.
   */
  function applyAll() {
    for (const s of registry.iterate()) {
      const { visible, opacity } = computeVisibility(s);
      registry.setVisible(s.sid, visible);
      registry.setOpacity(s.sid, opacity);
    }
    engine.requestRender();
  }

  /**
   * Isola uma estrutura (só ela fica visível).
   * @param {string} sid
   */
  function isolate(sid) {
    isolated = sid;
    applyAll();
  }

  /**
   * Oculta uma estrutura.
   * @param {string} sid
   */
  function hide(sid) {
    hidden.add(sid);
    // Se o sid oculto era o isolado, limpar isolamento
    if (isolated === sid) {
      isolated = null;
    }
    applyAll();
  }

  /**
   * Alterna efeito fantasma de uma estrutura.
   * @param {string} sid
   */
  function ghost(sid) {
    if (ghosted.has(sid)) {
      ghosted.delete(sid);
    } else {
      ghosted.add(sid);
    }
    applyAll();
  }

  /**
   * Reseta todo o estado especial (hidden, ghosted, isolated).
   */
  function reset() {
    hidden.clear();
    ghosted.clear();
    isolated = null;
    applyAll();
  }

  /**
   * Retorna estatísticas de visibilidade.
   * @returns {{total: number, visible: number, hidden: number, ghosted: number, isolated: (string|null)}}
   */
  function getStats() {
    let total = 0;
    let visible = 0;
    let hiddenCount = 0;
    let ghostedCount = 0;

    for (const s of registry.iterate()) {
      total += 1;
      const { visible: isVisible } = computeVisibility(s);
      if (isVisible) {
        visible += 1;
      }
      if (hidden.has(s.sid)) {
        hiddenCount += 1;
      }
      if (ghosted.has(s.sid)) {
        ghostedCount += 1;
      }
    }

    return {
      total,
      visible,
      hidden: hiddenCount,
      ghosted: ghostedCount,
      isolated,
    };
  }

  /**
   * Desinscreve de todos os eventos do barramento.
   */
  function dispose() {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    unsubscribers.length = 0;
  }

  // --- Inscrições no barramento ---

  // Importa EVENTS de bus.js para garantir nomes corretos
  // (será resolvido em tempo de execução quando createVisibility for chamado)
  const busModule = bus;
  const { EVENTS, on } = busModule;

  unsubscribers.push(
    on(EVENTS.LAYER_SET, () => {
      applyAll();
    })
  );

  unsubscribers.push(
    on(EVENTS.VISIBILITY_ISOLATE, (payload) => {
      isolate(payload.sid);
    })
  );

  unsubscribers.push(
    on(EVENTS.VISIBILITY_HIDE, (payload) => {
      hide(payload.sid);
    })
  );

  unsubscribers.push(
    on(EVENTS.VISIBILITY_GHOST, (payload) => {
      ghost(payload.sid);
    })
  );

  unsubscribers.push(
    on(EVENTS.VISIBILITY_RESET, () => {
      reset();
    })
  );

  unsubscribers.push(
    on(EVENTS.SYSTEM_LOAD_DONE, () => {
      applyAll();
    })
  );

  // --- Retorna API pública ---
  return {
    applyAll,
    isolate,
    hide,
    ghost,
    reset,
    getStats,
    dispose,
  };
}
