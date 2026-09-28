/**
 * pharmacology-demo.js — Demo standalone do modo Farmacologia
 *
 * Carrega compostos, monta a UI e verifica offline gracefully.
 * Define window.__pharmaDemo para verificação pelo playwright.
 */

(function() {
  'use strict';

  // Estado do demo
  window.__pharmaDemo = {
    ok: false,
    compounds: 0,
    chartLoaded: false,
    selectEvents: 0,
    error: null
  };

  /**
   * Barramento minimal para a demo
   */
  function createBus() {
    const listeners = new Map();
    return {
      on(evt, fn) {
        let set = listeners.get(evt);
        if (!set) {
          set = new Set();
          listeners.set(evt, set);
        }
        set.add(fn);
        return () => {
          if (set) set.delete(fn);
        };
      },
      emit(evt, payload) {
        if (evt === 'structure:select') {
          window.__pharmaDemo.selectEvents++;
        }
        const set = listeners.get(evt);
        if (!set) return;
        for (const fn of Array.from(set)) {
          try {
            fn(payload);
          } catch (err) {
            console.error('[bus] erro em listener:', err);
          }
        }
      }
    };
  }

  /**
   * Carrega compounds.json
   */
  function loadCompounds() {
    return fetch('../data/atlas/compounds.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('compounds.json não é um array');
        return data;
      });
  }

  /**
   * Implementação toPkProtocol (mesmo do pharmacology.js)
   */
  function toPkProtocol(compound) {
    if (!compound || !compound.pk) {
      throw new Error('toPkProtocol: compound.pk ausente');
    }
    return {
      nome: compound.nome || compound.id,
      pkData: {
        route: compound.pk.route || 'ORAL',
        vd: compound.pk.vd || 40,
        halfLife: compound.pk.halfLife || 4,
        dose: compound.pk.dose || 100,
        ka: compound.pk.ka || 1.5,
        targetOrgan: compound.targetSid || 'liver'
      },
      targetMesh: compound.targetSid
    };
  }

  /**
   * createPharmacologyMode inlined para demo
   */
  function createPharmacologyMode(opts) {
    const bus = opts.bus;
    const loadCompounds = opts.loadCompounds;
    const loadScript = opts.loadScript || defaultLoadScript;

    let compounds = [];
    let currentCompound = null;
    let chartLoaded = false;
    let pkEngineLoaded = false;
    let offModeChange = null;

    const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
    const CHART_JS_SRI = 'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ';

    async function enter(ctx) {
      try {
        compounds = await loadCompounds();
        if (!Array.isArray(compounds)) {
          compounds = [];
        }
      } catch (err) {
        console.error('[pharmacology] Erro ao carregar compostos:', err);
        compounds = [];
      }
    }

    function exit() {
      if (offModeChange) offModeChange();
      currentCompound = null;
    }

    function createSegmentedControl() {
      const container = LaiftDom.h('div', {
        style: {
          display: 'flex',
          gap: '0',
          marginBottom: '12px',
          borderRadius: '6px',
          overflow: 'hidden',
          border: '1px solid #334155'
        }
      });

      const btnCompostos = LaiftDom.h('button', {
        className: 'tab-button active',
        dataset: { tab: 'compostos' },
        style: {
          flex: 1,
          padding: '8px',
          border: 'none',
          borderRight: '1px solid #334155',
          background: '#1e293b',
          color: '#f1f5f9',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: '500'
        },
        textContent: 'Compostos'
      });

      const btnCrise = LaiftDom.h('button', {
        className: 'tab-button',
        dataset: { tab: 'crise' },
        style: {
          flex: 1,
          padding: '8px',
          border: 'none',
          background: '#1e293b',
          color: '#f1f5f9',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: '500'
        },
        textContent: 'Crise Toxicológica'
      });

      container.appendChild(btnCompostos);
      container.appendChild(btnCrise);

      return container;
    }

    function createCompoundsPanel() {
      const panel = LaiftDom.h('div', { dataset: { tab: 'compostos', hidden: false } });

      if (compounds.length === 0) {
        LaiftDom.setHtml(panel, LaiftDom.html`<p style="color: #94a3b8; font-size: 0.85rem;">Nenhum composto disponível.</p>`);
        return panel;
      }

      const list = LaiftDom.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

      for (const compound of compounds) {
        const item = LaiftDom.h('div', {
          className: 'compound-card',
          dataset: { compoundId: compound.id },
          style: {
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid #334155',
            background: '#1e293b',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '0.8rem'
          }
        });

        const title = LaiftDom.html`<div style="font-weight: 600; color: #f1f5f9; margin-bottom: 4px;">${compound.nome}</div>`;
        const mech = LaiftDom.html`<div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 6px;">${compound.mecanismo}</div>`;

        let badge = null;
        if (compound.review && compound.review.status === 'legacy-unverified') {
          badge = LaiftDom.html`<span style="display: inline-block; padding: 2px 6px; background: #fbbf24; color: #78350f; border-radius: 2px; font-size: 0.7rem; font-weight: 600;">Rascunho — não revisado</span>`;
        }

        LaiftDom.appendHtml(item, title);
        LaiftDom.appendHtml(item, mech);
        if (badge) LaiftDom.appendHtml(item, badge);

        item.addEventListener('click', () => selectCompound(compound, item));

        list.appendChild(item);
      }

      panel.appendChild(list);
      return panel;
    }

    function createCrisisPanel() {
      const panel = LaiftDom.h('div', { dataset: { tab: 'crise', hidden: true }, style: { display: 'none' } });

      const title = LaiftDom.html`<h3 style="color: #f1f5f9; margin-bottom: 10px; font-size: 0.9rem;">Simulação de Crise Colinérgica</h3>`;
      LaiftDom.appendHtml(panel, title);

      const controls = LaiftDom.h('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px' } });

      const btnStart = LaiftDom.h('button', {
        style: {
          flex: 1,
          padding: '8px',
          background: '#ef4444',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontSize: '0.8rem',
          cursor: 'pointer',
          fontWeight: '600'
        },
        textContent: '🚨 Iniciar Crise'
      });

      const btnStop = LaiftDom.h('button', {
        style: {
          flex: 1,
          padding: '8px',
          background: '#10b981',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontSize: '0.8rem',
          cursor: 'pointer',
          fontWeight: '600'
        },
        textContent: '🛑 Parar'
      });

      controls.appendChild(btnStart);
      controls.appendChild(btnStop);

      const hud = LaiftDom.h('div', {
        id: 'crisisTelemetryHUD',
        style: {
          padding: '8px',
          background: '#020617',
          border: '1px solid #334155',
          borderRadius: '4px',
          fontSize: '0.75rem',
          color: '#94a3b8',
          fontFamily: 'monospace'
        }
      });

      LaiftDom.setHtml(hud, LaiftDom.html`<span style="color: #94a3b8;">Aguardando iniciar...</span>`);

      panel.appendChild(controls);
      panel.appendChild(hud);

      return panel;
    }

    async function selectCompound(compound, element) {
      currentCompound = compound;

      // Visual feedback
      document.querySelectorAll('.compound-card').forEach(el => {
        el.style.background = '#1e293b';
        el.style.borderColor = '#334155';
      });
      element.style.background = 'rgba(56, 189, 248, 0.1)';
      element.style.borderColor = '#38bdf8';

      // Tenta carregar Chart.js
      if (!chartLoaded) {
        try {
          await loadScript(CHART_JS_URL, { integrity: CHART_JS_SRI });
          chartLoaded = true;
          window.__pharmaDemo.chartLoaded = true;
        } catch (err) {
          console.warn('[pharmacology] Chart.js não disponível (offline?):', err.message);
        }
      }

      // Emite evento
      if (bus) {
        bus.emit('structure:select', { sid: compound.targetSid, source: 'api' });
      }
    }

    function sheetContent() {
      const container = LaiftDom.h('div', { style: { padding: '12px', overflowY: 'auto' } });

      const title = LaiftDom.html`<h2 style="color: #f1f5f9; margin-bottom: 12px; font-size: 1rem;">Farmacologia & Farmacocinética</h2>`;
      LaiftDom.appendHtml(container, title);

      const segmented = createSegmentedControl();
      container.appendChild(segmented);

      const compoundsPanel = createCompoundsPanel();
      const crisisPanel = createCrisisPanel();

      // Update demo state with actual compound count
      window.__pharmaDemo.compounds = compounds.length;

      // Fallback text
      if (!chartLoaded && compounds.length > 0) {
        const fallbackDiv = LaiftDom.h('div', {
          style: {
            padding: '8px',
            background: '#78350f',
            borderRadius: '4px',
            color: '#fcd34d',
            fontSize: '0.8rem',
            marginBottom: '12px'
          }
        });
        const fallbackContent = LaiftDom.html`<strong>⚠️ Gráfico indisponível sem conexão</strong><p style="margin: 4px 0 0 0;">Selecione um composto acima para ver detalhes. A simulação PK/PD requer Chart.js.</p>`;
        LaiftDom.appendHtml(fallbackDiv, fallbackContent);
        compoundsPanel.insertBefore(fallbackDiv, compoundsPanel.firstChild);
      }

      container.appendChild(compoundsPanel);
      container.appendChild(crisisPanel);

      // Tab switching
      segmented.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-button');
        if (!btn) return;

        const tabName = btn.dataset.tab;
        segmented.querySelectorAll('.tab-button').forEach(b => {
          b.classList.remove('active');
          b.style.background = '#1e293b';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(56, 189, 248, 0.1)';

        compoundsPanel.style.display = tabName === 'compostos' ? 'block' : 'none';
        crisisPanel.style.display = tabName === 'crise' ? 'block' : 'none';
      });

      return container;
    }

    return {
      id: 'farmacologia',
      label: 'Farmacologia',
      icon: 'pill',
      enter,
      exit,
      sheetContent
    };
  }

  /**
   * defaultLoadScript
   */
  function defaultLoadScript(src, opts) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      if (opts && opts.integrity) {
        script.integrity = opts.integrity;
      }
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Inicializa a demo
   */
  async function init() {
    try {
      const bus = createBus();
      const mode = createPharmacologyMode({
        bus,
        loadCompounds,
        loadScript: defaultLoadScript
      });

      await mode.enter();

      const sheet = document.getElementById('sheet');
      const content = mode.sheetContent();
      if (content) {
        sheet.appendChild(content);
      }

      window.__pharmaDemo.compounds = Array.isArray(mode.sheetContent.compounds) ? mode.sheetContent.compounds.length : 0;

      // Seleciona o primeiro composto
      const firstCard = sheet.querySelector('[data-compound-id]');
      if (firstCard) {
        firstCard.click();
      }

      window.__pharmaDemo.ok = true;
      console.log('[DEMO] Inicialização bem-sucedida');
    } catch (err) {
      window.__pharmaDemo.error = err.message;
      console.error('[DEMO] Erro durante inicialização:', err);
    }
  }

  // Aguarda DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
