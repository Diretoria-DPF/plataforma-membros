/**
 * ui/pk-panel.js — painel PK/PD de um composto (PR 3.2, Bloco C).
 *
 * Abas [PK/PD] [Clínica] [Interações] (M1). PK/PD: resumo calculado por
 * js/core/pk-model.js (Cmax, Tmax, AUC, t½), parâmetros e dois gráficos
 * Chart.js — Cp(t) com Cmax e EC50 marcados, E(t) com 50% do Emax.
 * Clínica: indicações, efeitos adversos por frequência, contraindicações.
 * Interações: tabela com filtro por severidade. Sem Chart.js (offline), fica o resumo em texto — os números não
 * dependem do gráfico.
 */

const charts = [];

function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const d = abs >= 100 ? 0 : abs >= 10 ? 1 : digits;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

function destroyCharts() {
  while (charts.length) {
    const c = charts.pop();
    try { c.destroy(); } catch (e) { /* já destruído */ }
  }
}

function lineChart(Chart, canvas, { labels, data, label, color, yTitle, extra = [] }) {
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, tension: 0.25 }, ...extra] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: extra.length > 0, labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: {
        x: { title: { display: true, text: 'Tempo (h)' }, ticks: { maxTicksLimit: 7 } },
        y: { title: { display: true, text: yTitle }, beginAtZero: true },
      },
    },
  });
}

/** Índice da grade mais próximo de t (marcadores sobre o eixo de categorias). */
function nearestIndex(ts, t) {
  let best = 0;
  for (let i = 1; i < ts.length; i++) if (Math.abs(ts[i] - t) < Math.abs(ts[best] - t)) best = i;
  return best;
}

const FREQ_ORDER = ['muito comum', 'comum', 'incomum', 'rara', 'muito rara'];

/** Abas acessíveis (role=tablist): setas trocam de aba. */
function makeTabs(DOM, tabs) {
  const list = DOM.h('div', { className: 'pk-tabs', role: 'tablist', 'aria-label': 'Seções do composto', style: { display: 'flex', gap: '4px', overflowX: 'auto', margin: '6px 0 8px', borderBottom: '1px solid var(--laift-border)' } });
  const panels = [];
  const btns = tabs.map((t, i) => {
    const b = DOM.h('button', {
      type: 'button', role: 'tab', id: `pk-tab-${t.id}`, className: 'pk-tab', dataset: { pkTab: t.id },
      'aria-selected': i === 0 ? 'true' : 'false', 'aria-controls': `pk-tabpanel-${t.id}`, tabindex: i === 0 ? '0' : '-1',
      style: { flex: '0 0 auto', minHeight: '40px', padding: '6px 12px', border: 'none', borderBottom: i === 0 ? '3px solid var(--laift-primary)' : '3px solid transparent', background: 'none', color: 'var(--laift-text)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: i === 0 ? '700' : '400' },
      text: t.label,
    });
    const panel = DOM.h('div', { role: 'tabpanel', id: `pk-tabpanel-${t.id}`, className: 'pk-tabpanel', dataset: { pkPanel: t.id }, 'aria-labelledby': `pk-tab-${t.id}` });
    if (i !== 0) panel.hidden = true;
    panels.push(panel);
    return b;
  });
  const select = (i, focus) => {
    btns.forEach((b, j) => {
      const on = j === i;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
      b.style.borderBottom = on ? '3px solid var(--laift-primary)' : '3px solid transparent';
      b.style.fontWeight = on ? '700' : '400';
      panels[j].hidden = !on;
    });
    if (focus) btns[i].focus();
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => select(i, false));
    b.addEventListener('keydown', (ev) => {
      const k = ev.key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
      ev.preventDefault();
      const n = btns.length;
      select(k === 'Home' ? 0 : k === 'End' ? n - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + n) % n, true);
    });
    list.appendChild(b);
  });
  return { list, panels };
}

function renderClinica(DOM, host, compound) {
  const uses = Array.isArray(compound.clinicalUse) ? compound.clinicalUse : (compound.clinicalUse ? [compound.clinicalUse] : []);
  const ci = Array.isArray(compound.contraindications) ? compound.contraindications : [];
  const ae = Array.isArray(compound.adverseEffects) ? compound.adverseEffects : [];
  const groups = new Map();
  for (const a of ae) {
    const item = typeof a === 'string' ? { efeito: a, frequencia: 'outros' } : a;
    const k = item.frequencia || 'outros';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  const keys = [...groups.keys()].sort((a, b) => (FREQ_ORDER.indexOf(a) + 1 || 99) - (FREQ_ORDER.indexOf(b) + 1 || 99));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  DOM.appendHtml(host, DOM.html`
    <h4 style="font-size:0.8rem; margin:4px 0;">Indicações</h4>
    ${uses.length ? DOM.html`<ul class="pk-uses" style="margin:0 0 6px; padding-left:18px;">${uses.map((u) => DOM.html`<li>${u}</li>`)}</ul>` : DOM.html`<p style="color:var(--laift-muted);">Sem indicações cadastradas.</p>`}
    <h4 style="font-size:0.8rem; margin:8px 0 4px;">Efeitos adversos</h4>
    ${keys.length ? keys.map((k) => DOM.html`<div class="pk-ae-group"><strong style="font-size:0.74rem;">${cap(k)}</strong><ul style="margin:2px 0 6px; padding-left:18px;">${groups.get(k).map((x) => DOM.html`<li>${x.efeito}${x.doseDependente ? ' (dose-dependente)' : ''}</li>`)}</ul></div>`) : DOM.html`<p style="color:var(--laift-muted);">Sem efeitos cadastrados.</p>`}
    <h4 style="font-size:0.8rem; margin:8px 0 4px;">Contraindicações</h4>
    ${ci.length ? DOM.html`<ul class="pk-ci" style="margin:0; padding-left:18px;">${ci.map((c) => DOM.html`<li>${c}</li>`)}</ul>` : DOM.html`<p style="color:var(--laift-muted);">Sem contraindicações cadastradas.</p>`}
  `);
}

function renderInteracoes(DOM, host, compound) {
  const list = Array.isArray(compound.interactions) ? compound.interactions : [];
  if (!list.length) { DOM.appendHtml(host, DOM.html`<p style="color:var(--laift-muted);">Sem interações cadastradas.</p>`); return; }
  let filter = 'todas';
  const bar = DOM.h('div', { role: 'group', 'aria-label': 'Filtrar por severidade', className: 'pk-int-filter', style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' } });
  const tableWrap = DOM.h('div', { style: { overflowX: 'auto' } });
  const sevColor = { grave: 'var(--laift-danger, #b91c1c)', moderada: 'var(--laift-warning-text, #92400e)', leve: 'var(--laift-muted)' };
  const render = () => {
    const rows = list.filter((x) => filter === 'todas' || x.severidade === filter);
    DOM.clear(tableWrap);
    DOM.appendHtml(tableWrap, DOM.html`
      <table class="pk-int-table" style="width:100%; border-collapse:collapse; font-size:0.74rem;">
        <thead><tr><th scope="col" style="text-align:left; padding:4px; border-bottom:1px solid var(--laift-border);">Com</th><th scope="col" style="text-align:left; padding:4px; border-bottom:1px solid var(--laift-border);">Severidade</th><th scope="col" style="text-align:left; padding:4px; border-bottom:1px solid var(--laift-border);">Efeito</th></tr></thead>
        <tbody>${rows.map((x) => DOM.html`<tr data-sev="${x.severidade}"><td style="padding:4px; vertical-align:top;">${x.com}</td><td style="padding:4px; vertical-align:top; color:${sevColor[x.severidade] || 'inherit'}; font-weight:600;">${x.severidade}</td><td style="padding:4px; vertical-align:top;">${x.efeito}${x.mecanismo ? DOM.html`<div style="color:var(--laift-muted);">${x.mecanismo}</div>` : ''}</td></tr>`)}</tbody>
      </table>
      ${rows.length ? '' : DOM.html`<p style="color:var(--laift-muted);">Nenhuma interação com essa severidade.</p>`}
    `);
    bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sev === filter ? 'true' : 'false'));
  };
  for (const [sev, label] of [['todas', 'Todas'], ['moderada', 'Moderadas'], ['grave', 'Graves']]) {
    bar.appendChild(DOM.h('button', { type: 'button', dataset: { sev }, className: 'pk-int-btn', style: { minHeight: '36px', padding: '4px 10px', borderRadius: '999px', border: '1px solid var(--laift-border)', background: 'var(--laift-surface)', color: 'var(--laift-text)', cursor: 'pointer', fontSize: '0.74rem' }, text: label, onClick: () => { filter = sev; render(); } }));
  }
  host.append(bar, tableWrap);
  render();
}

/**
 * @param {HTMLElement} host painel da aba Compostos
 * @param {Object} compound composto normalizado (normalizeCompound)
 * @param {ReturnType<import('../core/pk-model.js').simulate>} sim
 * @param {{ chart?: Function|null }} [opts] construtor Chart (window.Chart) ou null
 * @returns {HTMLElement} o painel renderizado
 */
export function renderPkPanel(host, compound, sim, { chart = null } = {}) {
  destroyCharts();
  const old = host.querySelector('#pk-panel');
  if (old) old.remove();

  const pk = compound.pk || {};
  const pd = compound.pd || {};
  const unit = pk.concUnit || 'mg/L';
  const legacy = !!(compound.legacyDefaults || (compound.review && compound.review.status === 'legacy-unverified'));
  const iv = String(pk.route || '').toUpperCase() === 'IV';
  const summary = iv
    ? `Cmax ≈ ${fmt(sim.cmax)} ${unit} (bolus IV, t = 0) · AUC ≈ ${fmt(sim.auc)} ${unit}·h`
    : `Cmax ≈ ${fmt(sim.cmax)} ${unit} em Tmax ≈ ${fmt(sim.tmax, 1)} h · AUC ≈ ${fmt(sim.auc)} ${unit}·h`;
  const params = `Dose ${fmt(pk.dose)} ${pk.doseUnit || 'mg'} (${pk.route || 'ORAL'}) · F ${fmt(iv ? 1 : pk.F)} · ka ${iv ? '—' : fmt(pk.ka) + ' h⁻¹'} · t½ ${fmt(pk.halfLife, 1)} h · Vd ${fmt(pk.vd)} L`;
  const pdText = `Emax ${fmt(pd.emax)}% · EC50 ${fmt(pd.ec50)} ${unit} · Hill ${fmt(pd.hill)}${pd.efeito ? ` — ${pd.efeito}` : ''}`;
  const sources = (compound.sources || []).filter((s) => s && s.ref);

  const DOM = LaiftDom;
  const panel = DOM.h('section', { id: 'pk-panel', className: 'pk-panel', 'aria-label': `Composto: ${compound.nome || compound.id}`, style: { marginTop: '12px', fontSize: '0.78rem', color: 'var(--laift-text)' } });
  DOM.appendHtml(panel, DOM.html`
    <h3 style="font-size:0.9rem; margin:0 0 6px;">${compound.nome || compound.id}</h3>
    ${legacy ? DOM.html`<p class="pk-legacy" role="note" style="margin:0 0 6px; padding:6px 8px; border-radius:4px; background:var(--laift-warning-soft); border:1px solid var(--laift-warning);">Rascunho — parâmetros sem fonte verificada (F e PD padrão do modelo). Use só para entender a forma da curva.</p>` : ''}
  `);
  // M1 (PR 3.2): [PK/PD] [Clínica] [Interações] dentro do composto.
  const { list, panels } = makeTabs(DOM, [{ id: 'pkpd', label: 'PK/PD' }, { id: 'clinica', label: 'Clínica' }, { id: 'interacoes', label: 'Interações' }]);
  panel.appendChild(list);
  panels.forEach((p) => panel.appendChild(p));
  const [pkPanel, clinPanel, intPanel] = panels;
  const thalf = `t½ ${fmt(pk.halfLife, 1)} h`;
  DOM.appendHtml(pkPanel, DOM.html`
    <p class="pk-summary" style="margin:0 0 4px; font-weight:600;">${summary} · ${thalf}</p>
    <p class="pk-params" style="margin:0 0 2px; color:var(--laift-muted);">${params}</p>
    <p class="pk-pd" style="margin:0 0 6px; color:var(--laift-muted);">${pdText}</p>
    <p style="margin:0 0 6px; color:var(--laift-muted); font-size:0.72rem;">Modelo de um compartimento (absorção e eliminação de 1ª ordem) e efeito Emax/Hill sobre a concentração plasmática.</p>
  `);
  if (chart) {
    const mk = (id, label) => {
      const wrap = DOM.h('div', { style: { height: '180px', margin: '6px 0', padding: '6px', borderRadius: '4px', border: '1px solid var(--laift-border)', background: 'var(--laift-surface-alt)' } });
      const canvas = DOM.h('canvas', { id, role: 'img', 'aria-label': label });
      wrap.appendChild(canvas);
      pkPanel.appendChild(wrap);
      return canvas;
    };
    const labels = sim.t.map((t) => fmt(t, 1));
    const cpCanvas = mk('pkCpCanvas', `Concentração plasmática ao longo do tempo. ${summary}. Linha tracejada: EC50.`);
    const eCanvas = mk('pkEffectCanvas', `Efeito ao longo do tempo (modelo Emax/Hill). ${pdText}`);
    host.appendChild(panel);
    // Marcadores: ponto em (Tmax, Cmax) e EC50 tracejada no Cp; 50% do Emax no efeito.
    const iMax = nearestIndex(sim.t, sim.tmax);
    const cmaxPts = sim.t.map((_, i) => (i === iMax ? sim.cmax : null));
    const ec50 = Number(pd.ec50);
    const extraCp = [{ label: 'Cmax', data: cmaxPts, borderColor: '#0369a1', backgroundColor: '#0369a1', pointRadius: 5, showLine: false }];
    if (ec50 > 0) extraCp.push({ label: 'EC50', data: sim.t.map(() => ec50), borderColor: '#f59e0b', borderDash: [5, 4], borderWidth: 1, pointRadius: 0 });
    const half = Number(pd.emax) / 2;
    const extraE = half > 0 ? [{ label: '50% do Emax', data: sim.t.map(() => half), borderColor: '#94a3b8', borderDash: [5, 4], borderWidth: 1, pointRadius: 0 }] : [];
    charts.push(lineChart(chart, cpCanvas, { labels, data: sim.cp, label: `Cp (${unit})`, color: '#38bdf8', yTitle: `Cp (${unit})`, extra: extraCp }));
    charts.push(lineChart(chart, eCanvas, { labels, data: sim.e, label: 'Efeito (%)', color: '#f59e0b', yTitle: 'Efeito (% do máximo)', extra: extraE }));
  } else {
    DOM.appendHtml(pkPanel, DOM.html`<p class="pk-nochart" style="margin:6px 0; color:var(--laift-muted);">Gráfico indisponível sem conexão; os valores acima são calculados no aparelho.</p>`);
    host.appendChild(panel);
  }
  renderClinica(DOM, clinPanel, compound);
  renderInteracoes(DOM, intPanel, compound);

  if (sources.length) {
    DOM.appendHtml(panel, DOM.html`
      <details class="pk-sources" style="margin-top:6px;">
        <summary style="cursor:pointer;">Fontes (${sources.length})</summary>
        <ul style="margin:4px 0 0; padding-left:18px;">${sources.map((s) => DOM.html`<li>${s.field}: ${s.ref}</li>`)}</ul>
      </details>
    `);
  }
  return panel;
}

/** Para exit() do modo: destrói os gráficos abertos. */
export function disposePkPanel() {
  destroyCharts();
}
