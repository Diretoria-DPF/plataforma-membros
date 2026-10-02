/**
 * ui/scenario-panel.js — aba "Clínica" do modo Farmacologia (PR 3.2, Bloco C.3).
 *
 * Mostra um cenário de data/atlas/scenarios/<id>.json (schema/scenario.schema.json):
 * linha do tempo em minutos, fases ativas, sinais com o receptor envolvido e
 * a estrutura no 3D, e antídotos — ligar um antídoto risca os sinais que ele
 * reverte (pelo receptor), com o que NÃO reverte à vista.
 * Substitui a "crise" antiga do pk-engine.js (curvas inventadas em "ppm").
 */

export const RECEPTOR_LABEL = Object.freeze({
  muscarinico: 'Muscarínico',
  'nicotinico-muscular': 'Nicotínico (placa motora)',
  'nicotinico-ganglionar': 'Nicotínico (gânglios)',
  snc: 'Sistema nervoso central',
});

/** Fim da linha do tempo (min). */
export function scenarioEnd(scenario) {
  return Math.max(0, ...((scenario && scenario.fases) || []).map((f) => Number(f.fimMin) || 0));
}

/**
 * Estado do cenário no minuto t com os antídotos ligados.
 * @param {Object} scenario
 * @param {number} tMin
 * @param {string[]} [antidoteIds]
 * @returns {{ phases: Object[], signs: Array<Object & { phaseId: string, reverted: boolean, revertedBy: string[] }> }}
 */
export function scenarioState(scenario, tMin, antidoteIds = []) {
  const fases = (scenario && scenario.fases) || [];
  const end = scenarioEnd(scenario);
  const t = Number(tMin) || 0;
  // A última fase inclui o próprio fim (t = fim da linha do tempo).
  const phases = fases.filter((f) => t >= f.inicioMin && (t < f.fimMin || (t === end && f.fimMin === end)));
  const active = ((scenario && scenario.antidotos) || []).filter((a) => antidoteIds.includes(a.id));
  const signs = [];
  for (const f of phases) {
    for (const s of f.sinais || []) {
      const revertedBy = active.filter((a) => (a.reverte || []).includes(s.receptor)).map((a) => a.nome);
      signs.push({ ...s, phaseId: f.id, reverted: revertedBy.length > 0, revertedBy });
    }
  }
  return { phases, signs };
}

function fmtMin(m) {
  if (m < 1) return `${Math.round(m * 60)} s`;
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
}

/**
 * @param {HTMLElement} host
 * @param {Object} scenario
 * @param {{ onSelectSid?: (sid: string) => void }} [opts]
 * @returns {HTMLElement}
 */
export function renderScenarioPanel(host, scenario, { onSelectSid = () => {} } = {}) {
  const DOM = window.LaiftDom;
  const end = scenarioEnd(scenario);
  const fases = scenario.fases || [];
  let t = fases.length ? Number(fases[0].inicioMin) || 0 : 0;
  const on = new Set();

  const root = DOM.h('section', { className: 'scenario-panel', 'aria-label': scenario.nome, style: { fontSize: '0.8rem', color: 'var(--laift-text)' } });
  DOM.appendHtml(root, DOM.html`
    <h3 style="font-size:0.9rem; margin:0 0 6px;">${scenario.nome}</h3>
    <p style="margin:0 0 6px; color:var(--laift-muted);">${scenario.descricao}</p>
    <details style="margin:0 0 8px;"><summary style="cursor:pointer;">Agente: ${scenario.agente.nome}</summary><p style="margin:4px 0 0;">${scenario.agente.mecanismo}</p></details>
  `);

  // Linha do tempo: um botão por fase (pula para o início dela) + controle fino.
  const phaseNav = DOM.h('div', { className: 'scenario-phases', role: 'group', 'aria-label': 'Fases', style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' } });
  fases.forEach((f, i) => {
    phaseNav.appendChild(DOM.h('button', {
      type: 'button', className: 'scenario-phase-btn', dataset: { phase: f.id, start: String(f.inicioMin) },
      style: { minHeight: '44px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--laift-border)', background: 'var(--laift-surface-alt)', color: 'var(--laift-text)', cursor: 'pointer', fontSize: '0.72rem' },
      text: `${i + 1}. ${f.titulo}`,
    }));
  });
  root.appendChild(phaseNav);

  const sliderId = `scenario-t-${scenario.id}`;
  const sliderWrap = DOM.h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } });
  const label = DOM.h('label', { for: sliderId, style: { whiteSpace: 'nowrap' }, text: 'Tempo:' });
  const slider = DOM.h('input', { id: sliderId, type: 'range', className: 'scenario-time', min: '0', max: String(end), step: 'any', value: String(t), style: { flex: '1' } });
  const tOut = DOM.h('output', { for: sliderId, className: 'scenario-time-out', style: { minWidth: '56px', textAlign: 'right' } });
  sliderWrap.append(label, slider, tOut);
  root.appendChild(sliderWrap);

  const antWrap = DOM.h('fieldset', { className: 'scenario-antidotes', style: { border: '1px solid var(--laift-border)', borderRadius: '4px', padding: '6px 8px', margin: '0 0 8px' } });
  antWrap.appendChild(DOM.h('legend', { text: 'Antídotos' }));
  for (const a of scenario.antidotos || []) {
    const id = `scenario-ant-${a.id}`;
    const row = DOM.h('div', { style: { margin: '2px 0' } });
    const cb = DOM.h('input', { type: 'checkbox', id, className: 'scenario-antidote', dataset: { antidote: a.id } });
    row.append(cb, DOM.h('label', { for: id, style: { marginLeft: '6px', fontWeight: '600' }, text: a.nome }));
    const rev = (a.reverte || []).map((r) => RECEPTOR_LABEL[r] || r).join(', ') || '—';
    const no = (a.naoReverte || []).map((r) => RECEPTOR_LABEL[r] || r).join(', ') || '—';
    DOM.appendHtml(row, DOM.html`<div style="font-size:0.72rem; color:var(--laift-muted); margin-left:22px;">${a.mecanismo} Reverte: ${rev}. Não reverte: ${no}.${a.janela ? ` Janela: ${a.janela}.` : ''}${a.alvoTerapeutico ? ` Alvo: ${a.alvoTerapeutico}.` : ''}</div>`);
    antWrap.appendChild(row);
  }
  root.appendChild(antWrap);

  const live = DOM.h('div', { className: 'scenario-now', 'aria-live': 'polite' });
  root.appendChild(live);

  const sources = (scenario.sources || []).filter((x) => x && x.ref);
  if (sources.length) {
    DOM.appendHtml(root, DOM.html`<details class="scenario-sources" style="margin-top:8px;"><summary style="cursor:pointer;">Fontes (${sources.length})</summary><ul style="margin:4px 0 0; padding-left:18px;">${sources.map((x) => DOM.html`<li>${x.field}: ${x.ref}</li>`)}</ul></details>`);
  }

  function render() {
    const st = scenarioState(scenario, t, [...on]);
    tOut.textContent = fmtMin(t);
    slider.setAttribute('aria-valuetext', fmtMin(t));
    phaseNav.querySelectorAll('.scenario-phase-btn').forEach((b) => {
      const active = st.phases.some((p) => p.id === b.dataset.phase);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.style.borderColor = active ? 'var(--laift-primary)' : 'var(--laift-border)';
    });
    DOM.clear(live);
    if (!st.phases.length) {
      DOM.appendHtml(live, DOM.html`<p style="margin:0; color:var(--laift-muted);">Nenhuma fase neste minuto.</p>`);
      return;
    }
    for (const p of st.phases) {
      const signs = st.signs.filter((s) => s.phaseId === p.id);
      const box = DOM.h('div', { className: 'scenario-phase', dataset: { phase: p.id }, style: { padding: '6px 8px', border: '1px solid var(--laift-primary)', borderRadius: '4px', marginBottom: '6px', background: 'var(--laift-primary-soft)' } });
      DOM.appendHtml(box, DOM.html`
        <div style="font-weight:600;">${p.titulo} <span style="font-weight:400; color:var(--laift-muted);">(${fmtMin(p.inicioMin)}–${fmtMin(p.fimMin)})</span></div>
        <p style="margin:2px 0 4px;">${p.fisiopatologia}</p>
      `);
      const ul = DOM.h('ul', { style: { margin: '0 0 4px', paddingLeft: '18px' } });
      for (const s of signs) {
        const li = DOM.h('li', { className: 'scenario-sign', dataset: { receptor: s.receptor, reverted: s.reverted ? '1' : '0' } });
        const txt = `${s.nome} — ${RECEPTOR_LABEL[s.receptor] || s.receptor}${s.reverted ? ` (revertido por ${s.revertedBy.join(', ')})` : ''}`;
        if (s.sid) {
          li.appendChild(DOM.h('button', { type: 'button', className: 'scenario-sign-btn', dataset: { sid: s.sid }, style: { background: 'none', border: 'none', padding: '2px 0', color: 'var(--laift-primary)', cursor: 'pointer', textAlign: 'left', textDecoration: s.reverted ? 'line-through' : 'none' }, text: txt }));
        } else {
          li.appendChild(DOM.h('span', { style: { textDecoration: s.reverted ? 'line-through' : 'none' }, text: txt }));
        }
        ul.appendChild(li);
      }
      box.appendChild(ul);
      if (p.conduta) DOM.appendHtml(box, DOM.html`<p style="margin:0; font-size:0.74rem;"><strong>Conduta:</strong> ${p.conduta}</p>`);
      live.appendChild(box);
    }
  }

  slider.addEventListener('input', () => { t = Number(slider.value) || 0; render(); });
  phaseNav.addEventListener('click', (ev) => {
    const b = ev.target.closest('.scenario-phase-btn');
    if (!b) return;
    t = Number(b.dataset.start) || 0;
    slider.value = String(t);
    render();
  });
  antWrap.addEventListener('change', (ev) => {
    const cb = ev.target.closest('.scenario-antidote');
    if (!cb) return;
    if (cb.checked) on.add(cb.dataset.antidote); else on.delete(cb.dataset.antidote);
    render();
  });
  live.addEventListener('click', (ev) => {
    const b = ev.target.closest('.scenario-sign-btn');
    if (b && b.dataset.sid) onSelectSid(b.dataset.sid);
  });

  render();
  host.appendChild(root);
  return root;
}
