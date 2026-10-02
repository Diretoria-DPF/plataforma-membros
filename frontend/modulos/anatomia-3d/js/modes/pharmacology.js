/**
 * modes/pharmacology.js — Modo Farmacologia do Atlas v2
 *
 * Compostos: Cp(t)/E(t) pelo modelo puro (core/pk-model.js) com Chart.js.
 * Clínica: cenários com fonte (ui/scenario-panel.js), ex.: crise colinérgica.
 */

import { simulate } from '../core/pk-model.js';
import { renderPkPanel, disposePkPanel } from '../ui/pk-panel.js';
import { renderScenarioPanel } from '../ui/scenario-panel.js';

/**
 * Carrega um script clássico (<script src>) uma única vez e retorna Promise.
 * @param {string} src URL absoluta ou relativa
 * @param {Object} opts { integrity?: string }
 * @returns {Promise<void>}
 */
export function defaultLoadScript(src, opts = {}) {
  return new Promise((resolve, reject) => {
    // Impede carregamento duplicado — verifica se já existe script com o mesmo src
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    if (opts.integrity) {
      script.integrity = opts.integrity;
    }
    script.crossOrigin = 'anonymous';

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));

    document.head.appendChild(script);
  });
}

/**
 * Normaliza um composto para o formato v2 (PR 3.2, D2 — schema duplo).
 * v1 (legado): pk { route, vd, halfLife, dose, ka } sem PD nem fontes →
 * recebe F/PD padrão e fica marcado como "legacy-unverified" (o selo
 * avisa que os números não têm fonte). v2 passa como está.
 * @param {Object} c
 * @returns {Object}
 */
export function normalizeCompound(c) {
  if (!c || !c.pk) return c;
  if (c.pd) return c; // v2
  return {
    ...c,
    pk: { ...c.pk, F: c.pk.F != null ? c.pk.F : 0.75, tmax: c.pk.tmax != null ? c.pk.tmax : null },
    pd: { emax: 100, ec50: 1.25, hill: 1.5 },
    review: { status: 'legacy-unverified' },
    legacyDefaults: true,
  };
}

/**
 * Mapeia compound.pk para a forma esperada por PkEngine.simulateProtocol()
 * @param {Object} compound { id, nome, pk: { route, vd, halfLife, dose, ka }, targetSid? }
 * @returns {Object} { nome, pkData: { route, vd, halfLife, dose, ka, targetOrgan }, targetMesh }
 */
export function toPkProtocol(compound) {
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
      F: compound.pk.F != null ? compound.pk.F : 1,
      tmax: compound.pk.tmax != null ? compound.pk.tmax : null,
      targetOrgan: compound.targetSid || 'liver'
    },
    pd: compound.pd || null,
    targetMesh: compound.targetSid
  };
}

/**
 * Cria o modo Farmacologia
 * @param {Object} opts { bus, loadCompounds(), loadScript() }
 * @returns {Mode} implementação de Mode { id, label, icon, enter(), exit(), sheetContent() }
 */
export function createPharmacologyMode({ bus, loadCompounds, loadScenario = null, loadScript = defaultLoadScript }) {
  let compounds = [];
  let scenario = null;
  let currentCompound = null;
  let chartLoaded = false;
  let offStructureSelect = null;
  let offModeChange = null;

  // URL do Chart.js conforme index.html
  const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
  const CHART_JS_SRI = 'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ';

  /**
   * enter(ctx) — chamado ao entrar no modo
   * Carrega compostos e registra listeners do bus
   */
  async function enter(ctx) {
    // Carrega compostos
    try {
      compounds = await loadCompounds();
      if (!Array.isArray(compounds)) {
        compounds = [];
      } else {
        compounds = compounds.map(normalizeCompound);
      }
    } catch (err) {
      console.error('[pharmacology] Erro ao carregar compostos:', err);
      compounds = [];
    }

    // Cenário da aba Clínica (falha → aviso de indisponível na aba).
    if (typeof loadScenario === 'function') {
      try { scenario = await loadScenario(); } catch (err) { console.warn('[pharmacology] cenário indisponível:', err && err.message); scenario = null; }
    }

    // Listener: quando sair do modo, limpa
    offModeChange = bus.on('mode:change', ({ mode }) => {
      if (mode !== 'farmacologia') {
        exit();
      }
    });
  }

  /**
   * exit() — chamado ao sair do modo
   * Para simulações e libera recursos
   */
  function exit() {
    disposePkPanel();
    if (offStructureSelect) offStructureSelect();
    if (offModeChange) offModeChange();

    currentCompound = null;
  }

  /**
   * Cria um segmented control com abas Compostos | Crise
   * @returns {Node}
   */
  function createSegmentedControl() {
    const container = LaiftDom.h('div', {
      style: {
        display: 'flex',
        gap: '0',
        marginBottom: '12px',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid var(--laift-border)'
      }
    });

    const btnCompostos = LaiftDom.h('button', {
      className: 'tab-button active',
      dataset: { tab: 'compostos' },
      style: {
        flex: 1,
        padding: '8px',
        border: 'none',
        borderRight: '1px solid var(--laift-border)',
        background: 'var(--laift-surface-alt)',
        color: 'var(--laift-text)',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: '500'
      },
      text: 'Compostos'
    });

    const btnCrise = LaiftDom.h('button', {
      className: 'tab-button',
      dataset: { tab: 'crise' },
      style: {
        flex: 1,
        padding: '8px',
        border: 'none',
        background: 'var(--laift-surface-alt)',
        color: 'var(--laift-text)',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: '500'
      },
      text: 'Clínica'
    });

    container.appendChild(btnCompostos);
    container.appendChild(btnCrise);

    return container;
  }

  /**
   * Cria panel de Compostos (lista selecionável)
   * @returns {Node}
   */
  function createCompoundsPanel() {
    const panel = LaiftDom.h('div', { className: 'pharma-panel', dataset: { tab: 'compostos', hidden: false } });

    if (compounds.length === 0) {
      LaiftDom.setHtml(panel, LaiftDom.html`<p style="color: var(--laift-muted); font-size: 0.85rem;">Nenhum composto disponível.</p>`);
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
          border: '1px solid var(--laift-border)',
          background: 'var(--laift-surface-alt)',
          cursor: 'pointer',
          transition: 'all 0.2s',
          fontSize: '0.8rem'
        }
      });

      const title = LaiftDom.html`<div style="font-weight: 600; color: var(--laift-text); margin-bottom: 4px;">${compound.nome}</div>`;
      const mech = LaiftDom.html`<div style="font-size: 0.75rem; color: var(--laift-muted); margin-bottom: 6px;">${compound.mecanismo}</div>`;

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

    list.addEventListener('click', (e) => {
      if (e.target.closest('.compound-card')) {
        // já tratado acima
      }
    });

    panel.appendChild(list);
    return panel;
  }

  /**
   * Aba "Clínica" (PR 3.2, Bloco C.3): cenário com fonte
   * (data/atlas/scenarios/crise-colinergica.json) em ui/scenario-panel.js.
   * Substitui a "crise" do pk-engine.js legado (curvas sem fonte em "ppm").
   * @returns {Node}
   */
  function createCrisisPanel() {
    const panel = LaiftDom.h('div', { className: 'pharma-panel', dataset: { tab: 'crise', hidden: true }, style: { display: 'none' } });
    if (scenario) {
      renderScenarioPanel(panel, scenario, {
        onSelectSid: (sid) => { try { bus.emit('structure:select', { sid, source: 'api' }); } catch (e) { /* bus indisponível */ } },
      });
    } else {
      LaiftDom.setHtml(panel, LaiftDom.html`<p class="scenario-unavailable" style="color: var(--laift-muted); font-size: 0.85rem;">Cenário clínico indisponível no momento.</p>`);
    }
    return panel;
  }

  async function ensureChartJs() {
    if (chartLoaded) return true;
    try {
      await loadScript(CHART_JS_URL, { integrity: CHART_JS_SRI });
      chartLoaded = typeof window.Chart !== 'undefined';
    } catch (err) {
      console.warn('[pharmacology] Chart.js não disponível (offline?):', err.message);
    }
    return chartLoaded;
  }

  /**
   * Seleciona um composto e simula seu perfil PK/PD
   */
  async function selectCompound(compound, element) {
    currentCompound = compound;

    // Visual feedback
    document.querySelectorAll('.compound-card').forEach(el => {
      el.style.background = 'var(--laift-surface-alt)';
      el.style.borderColor = 'var(--laift-border)';
    });
    element.style.background = 'rgba(56, 189, 248, 0.1)';
    element.style.borderColor = '#38bdf8';

    // PR 3.2 (Bloco C): Cp(t) e E(t) pelo modelo puro (js/core/pk-model.js),
    // com F, ka e PD do próprio composto. O PkEngine legado trocava F pela
    // via e usava um PD fixo para todos; ele segue só na aba Crise.
    const container = document.querySelector('.pharma-panel[data-tab="compostos"]'); // o botão da aba também tem data-tab
    if (container) {
      await ensureChartJs();
      renderPkPanel(container, compound, simulate(compound), { chart: chartLoaded ? window.Chart : null });
    }
    if (typeof window.ApiCache !== 'undefined' && typeof window.ApiCache.registrarSimulacao === 'function') {
      try { window.ApiCache.registrarSimulacao(compound.nome || compound.id, (compound.pk && compound.pk.route) || 'ORAL'); } catch (e) { /* histórico é opcional */ }
    }

    // Emite evento para o 3D: destaca o órgão alvo
    if (compound.targetSid && bus) {
      try {
        bus.emit('structure:select', { sid: compound.targetSid, source: 'api' });
      } catch (err) {
        // bus não está disponível
      }
    }
  }

  /**
   * sheetContent() — retorna o Node para o painel arrastável
   */
  function sheetContent() {
    const container = LaiftDom.h('div', { style: { padding: '12px', overflowY: 'auto' } });

    const title = LaiftDom.html`<h2 style="color: var(--laift-text); margin-bottom: 12px; font-size: 1rem;">Farmacologia & Farmacocinética</h2>`;
    LaiftDom.appendHtml(container, title);

    const segmented = createSegmentedControl();
    container.appendChild(segmented);

    const compoundsPanel = createCompoundsPanel();
    const crisisPanel = createCrisisPanel();

    // Fallback text se Chart.js estiver offline
    if (!chartLoaded && compounds.length > 0) {
      const fallbackWrap = document.createElement('div');
      LaiftDom.setHtml(fallbackWrap, LaiftDom.html`<div style="padding: 8px; background: var(--laift-warning-soft); border: 1px solid var(--laift-warning); border-radius: 4px; color: var(--laift-text); font-size: 0.8rem; margin-bottom: 12px;">
        <strong>⚠️ Gráfico indisponível sem conexão</strong>
        <p style="margin: 4px 0 0 0;">Selecione um composto acima para ver detalhes. A simulação PK/PD requer Chart.js.</p>
      </div>`);
      compoundsPanel.insertBefore(fallbackWrap.firstElementChild, compoundsPanel.firstChild);
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
        b.style.background = 'var(--laift-surface-alt)';
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
