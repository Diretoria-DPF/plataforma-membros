/**
 * ui/pk-panel.js — painel PK/PD de um composto (PR 3.2, Bloco C).
 *
 * Mostra o resumo calculado por js/core/pk-model.js (Cmax, Tmax, AUC), os
 * parâmetros usados, as fontes do composto e dois gráficos Chart.js: Cp(t)
 * e E(t). Sem Chart.js (offline), fica o resumo em texto — os números não
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

function lineChart(Chart, canvas, { labels, data, label, color, yTitle }) {
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, tension: 0.25 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Tempo (h)' }, ticks: { maxTicksLimit: 7 } },
        y: { title: { display: true, text: yTitle }, beginAtZero: true },
      },
    },
  });
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

  const panel = LaiftDom.h('section', { id: 'pk-panel', className: 'pk-panel', 'aria-label': `Farmacocinética de ${compound.nome || compound.id}`, style: { marginTop: '12px', fontSize: '0.78rem', color: 'var(--laift-text)' } });
  LaiftDom.appendHtml(panel, LaiftDom.html`
    <h3 style="font-size:0.9rem; margin:0 0 6px;">${compound.nome || compound.id}</h3>
    ${legacy ? LaiftDom.html`<p class="pk-legacy" role="note" style="margin:0 0 6px; padding:6px 8px; border-radius:4px; background:var(--laift-warning-soft); border:1px solid var(--laift-warning);">Rascunho — parâmetros sem fonte verificada (F e PD padrão do modelo). Use só para entender a forma da curva.</p>` : ''}
    <p class="pk-summary" style="margin:0 0 4px; font-weight:600;">${summary}</p>
    <p class="pk-params" style="margin:0 0 2px; color:var(--laift-muted);">${params}</p>
    <p class="pk-pd" style="margin:0 0 6px; color:var(--laift-muted);">${pdText}</p>
    <p style="margin:0 0 6px; color:var(--laift-muted); font-size:0.72rem;">Modelo de um compartimento (absorção e eliminação de 1ª ordem) e efeito Emax/Hill sobre a concentração plasmática.</p>
  `);

  if (chart) {
    const mk = (id, label) => {
      const wrap = LaiftDom.h('div', { style: { height: '170px', margin: '6px 0', padding: '6px', borderRadius: '4px', border: '1px solid var(--laift-border)', background: 'var(--laift-surface-alt)' } });
      const canvas = LaiftDom.h('canvas', { id, role: 'img', 'aria-label': label });
      wrap.appendChild(canvas);
      panel.appendChild(wrap);
      return canvas;
    };
    const labels = sim.t.map((t) => fmt(t, 1));
    const cpCanvas = mk('pkCpCanvas', `Concentração plasmática ao longo do tempo. ${summary}`);
    const eCanvas = mk('pkEffectCanvas', `Efeito ao longo do tempo (modelo Emax/Hill). ${pdText}`);
    host.appendChild(panel);
    charts.push(lineChart(chart, cpCanvas, { labels, data: sim.cp, label: `Cp (${unit})`, color: '#38bdf8', yTitle: `Cp (${unit})` }));
    charts.push(lineChart(chart, eCanvas, { labels, data: sim.e, label: 'Efeito (%)', color: '#f59e0b', yTitle: 'Efeito (% do máximo)' }));
  } else {
    LaiftDom.appendHtml(panel, LaiftDom.html`<p class="pk-nochart" style="margin:6px 0; color:var(--laift-muted);">Gráfico indisponível sem conexão; os valores acima são calculados no aparelho.</p>`);
    host.appendChild(panel);
  }

  if (sources.length) {
    LaiftDom.appendHtml(panel, LaiftDom.html`
      <details class="pk-sources" style="margin-top:6px;">
        <summary style="cursor:pointer;">Fontes (${sources.length})</summary>
        <ul style="margin:4px 0 0; padding-left:18px;">${sources.map((s) => LaiftDom.html`<li>${s.field}: ${s.ref}</li>`)}</ul>
      </details>
    `);
  }
  return panel;
}

/** Para exit() do modo: destrói os gráficos abertos. */
export function disposePkPanel() {
  destroyCharts();
}
