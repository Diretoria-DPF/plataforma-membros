/**
 * toolbar-demo.js — demonstração da toolbar
 */

(async () => {
  'use strict';

  // Importar o bus como módulo
  const busModule = await import('../js/core/bus.js');
  const { on, emit, EVENTS } = busModule;

  // Criar um store local para a demo
  const store = {
    state: {
      selectedSid: 'fma:7088',
      xray: false,
      isolation: { active: 'none', sid: null },
      clip: { plane: null, offset: null },
      labels: true,
    },
    get() {
      return this.state;
    },
    subscribe(selector, fn) {
      // Retorna um unsubscribe simples (a demo não precisa de reatividade real)
      return () => {};
    },
  };

  // Criar um bus wrapper que registra eventos
  const bus = {
    emit(eventName, payload) {
      // Registrar no log
      logEvent(eventName, payload);
      // Emitir no bus real
      emit(eventName, payload);
      // Atualizar estado local
      if (eventName === 'xray:set') store.state.xray = payload.enabled;
      else if (eventName === 'visibility:isolate') store.state.isolation = { active: 'isolate', sid: payload.sid };
      else if (eventName === 'visibility:reset') store.state.isolation = { active: 'none', sid: null };
      else if (eventName === 'clip:set') store.state.clip = payload;
      else if (eventName === 'structure:select') store.state.selectedSid = payload.sid;
    },
    on,
  };

  // Log global
  window.__toolbarDemo = { events: [] };

  function logEvent(eventName, payload) {
    const entry = { event: eventName, payload };
    window.__toolbarDemo.events.push(entry);
    console.log(`[Event] ${eventName}`, payload);

    // Mostrar no UI
    const logEl = document.getElementById('events-log');
    const entryEl = document.createElement('div');
    entryEl.className = 'log-entry';
    entryEl.innerHTML = `<strong>${eventName}</strong><br><small>${JSON.stringify(payload)}</small>`;
    logEl.appendChild(entryEl);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Montar a toolbar
  const toolbarContainer = document.getElementById('toolbar-mount');

  // Importar toolbar
  const toolbarScript = document.createElement('script');
  toolbarScript.src = '../js/ui/toolbar.js';
  toolbarScript.onload = () => {
    const toolbarDispose = window.createToolbar(toolbarContainer, {
      bus,
      store,
      EVENTS,
      onOpenLayers: () => logEvent('onOpenLayers', {}),
      onToggleFullscreen: () => logEvent('onToggleFullscreen', {}),
      onOpenCredits: () => logEvent('onOpenCredits', {}),
    });
  };
  document.body.appendChild(toolbarScript);

  // Importar context menu
  const contextMenuScript = document.createElement('script');
  contextMenuScript.src = '../js/ui/context-menu.js';
  contextMenuScript.onload = () => {
    const contextMenu = window.createContextMenu({
      bus,
      EVENTS,
      getLabel: (sid) => sid === 'fma:7088' ? 'Coração' : sid,
    });

    // Expor para teste programático
    window.__toolbarDemo.contextMenu = contextMenu;
  };
  document.body.appendChild(contextMenuScript);

  // Monitorar CSP violations
  window.addEventListener('securitypolicyviolation', (e) => {
    console.error('[CSP Violation]', e.violatedDirective, e.originalPolicy);
    window.__toolbarDemo.cspViolations = window.__toolbarDemo.cspViolations || [];
    window.__toolbarDemo.cspViolations.push({
      directive: e.violatedDirective,
      source: e.sourceFile,
    });
  });

  // Monitorar erros
  window.addEventListener('error', (e) => {
    console.error('[Error]', e.message);
    window.__toolbarDemo.errors = window.__toolbarDemo.errors || [];
    window.__toolbarDemo.errors.push(e.message);
  });

  // Registrar resultado final após delay
  setTimeout(() => {
    const result = {
      eventsCount: window.__toolbarDemo.events.length,
      events: window.__toolbarDemo.events,
      cspViolations: window.__toolbarDemo.cspViolations || [],
      errors: window.__toolbarDemo.errors || [],
      success: window.__toolbarDemo.events.length > 0 && !window.__toolbarDemo.cspViolations?.length,
    };
    window.__toolbarDemo.result = result;
    console.log('[Result]', JSON.stringify(result, null, 2));
  }, 100);
})();
