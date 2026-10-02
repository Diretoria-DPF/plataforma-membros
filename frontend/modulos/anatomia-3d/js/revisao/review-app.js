/**
 * revisao/review-app.js — interface da ferramenta de revisão do conselho
 * (PR 3.2, C1). Lógica de onda/assinatura em review-core.js.
 */
import { ONDAS, SISTEMA_LABEL, collectFichas, contentHash, ondaDecision, markProblem, buildReviewMd } from './review-core.js';

const $ = (id) => document.getElementById(id);
const DATA = '../data/atlas/';
const state = { onda: null, fichas: [], marks: {}, hash: '', names: new Map(), obras: new Map() };

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'className') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c != null && c !== false) n.append(c);
  return n;
}

function storageKey() { return `atlas-revisao:onda-${state.onda}:${state.hash.slice(0, 16)}`; }
function save() {
  try { localStorage.setItem(storageKey(), JSON.stringify(state.marks)); } catch (e) { /* modo privado: segue sem salvar */ }
}
function restore() {
  try { const raw = localStorage.getItem(storageKey()); state.marks = raw ? JSON.parse(raw) || {} : {}; } catch (e) { state.marks = {}; }
}

async function loadRefs() {
  try {
    const f = await (await fetch(`${DATA}fontes.json`)).json();
    for (const o of f.obras || []) state.obras.set(o.id, `${o.titulo}${o.edicao ? `, ${o.edicao} ed.` : ''}`);
  } catch (e) { /* sem fontes.json: mostra o obraId */ }
  try {
    const s = await (await fetch(`${DATA}generated/structures.boot.json`)).json();
    const arr = Array.isArray(s) ? s : (s.structures || Object.values(s));
    for (const e of arr) if (e && e.sid) state.names.set(e.sid, e.namePt || e.englishName || e.sid);
  } catch (e) { /* sem nomes: mostra o sid */ }
}

const nameOf = (sid) => state.names.get(sid) || state.names.get(sid.replace(/-[lr]$/, '-r')) || state.names.get(sid.replace(/-[lr]$/, '-l')) || sid;

const FIELD_LABEL = {
  relations: 'Relações', vascularization: 'Vascularização', innervation: 'Inervação', lymph: 'Drenagem linfática',
  epithelium: 'Epitélio', tissues: 'Tecidos', cells: 'Células', function: 'Função',
};

function renderFicha(f, i) {
  const d = f.data;
  const card = el('article', { className: 'box ficha', id: `ficha-${i}`, 'data-sid': f.sid, 'aria-labelledby': `fh-${i}` });
  card.append(el('h2', { id: `fh-${i}`, text: `${i + 1}. ${nameOf(f.sid)}` }), el('div', { className: 'sid muted', text: `${f.sid} · ${f.file}` }));
  if (d.summary_pt) card.append(el('h3', { text: 'Resumo' }), el('p', { text: d.summary_pt }));
  for (const [grp, title] of [['anatomy', 'Anatomia'], ['histology', 'Histologia']]) {
    const g = d[grp];
    if (!g || typeof g !== 'object') continue;
    const dl = el('dl');
    for (const [k, v] of Object.entries(g)) {
      if (v == null || v === '') continue;
      dl.append(el('dt', { text: FIELD_LABEL[k] || k }), el('dd', { text: Array.isArray(v) ? v.join('; ') : String(v) }));
    }
    card.append(el('h3', { text: title }), dl);
  }
  if (Array.isArray(d.clinical) && d.clinical.length) {
    card.append(el('h3', { text: 'Clínica' }), el('ul', {}, d.clinical.map((c) => el('li', { text: typeof c === 'string' ? c : [c.title_pt, c.text_pt].filter(Boolean).join(': ') }))));
  }
  if (d.mnemonic_pt) card.append(el('h3', { text: 'Mnemônico' }), el('p', { text: d.mnemonic_pt }));
  if (Array.isArray(d.sources) && d.sources.length) {
    card.append(el('h3', { text: 'Fontes' }), el('ul', { className: 'sources' }, d.sources.map((s) => el('li', { text: `${s.field}: ${state.obras.get(s.obraId) || s.obraId} — ${s.ref}${s.exception ? ` (exceção: ${s.justificativa || ''})` : ''}` }))));
  }

  const mark = state.marks[f.sid] || {};
  const status = el('span', { className: 'state muted', 'aria-live': 'polite' });
  const ta = el('textarea', { 'aria-label': `Comentário sobre ${nameOf(f.sid)}`, placeholder: 'Comentário (obrigatório para ressalva ou reprovação)' });
  ta.value = mark.comment || '';
  const btn = (decision, label) => el('button', { type: 'button', 'data-decision': decision, 'aria-pressed': mark.decision === decision ? 'true' : 'false', text: label });
  const actions = el('div', { className: 'actions', role: 'group', 'aria-label': `Decisão sobre ${nameOf(f.sid)}` }, [btn('aprovar', 'Aprovar'), btn('comentar', 'Aprovar com ressalva'), btn('reprovar', 'Reprovar'), status]);
  const refresh = () => {
    const m = state.marks[f.sid];
    actions.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', m && m.decision === b.dataset.decision ? 'true' : 'false'));
    const p = m ? markProblem(m) : 'sem decisão';
    status.textContent = p ? p : '✓ marcada';
    status.className = `state ${p && m ? 'err' : 'muted'}`;
    updateProgress();
  };
  actions.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-decision]');
    if (!b) return;
    state.marks[f.sid] = { decision: b.dataset.decision, comment: ta.value };
    save();
    refresh();
    if (b.dataset.decision !== 'aprovar' && !ta.value.trim()) ta.focus();
  });
  ta.addEventListener('input', () => {
    const m = state.marks[f.sid] || { decision: null };
    state.marks[f.sid] = { ...m, comment: ta.value };
    save();
    refresh();
  });
  card.append(actions, ta);
  refresh();
  return card;
}

function updateProgress() {
  const total = state.fichas.length;
  const done = state.fichas.filter((f) => !markProblem(state.marks[f.sid])).length;
  $('progress-text').textContent = `${done} de ${total} marcadas`;
  $('progress-bar').style.width = total ? `${(100 * done) / total}%` : '0';
  const decision = done === total ? ondaDecision(state.fichas, state.marks) : null;
  $('sign-summary').textContent = decision
    ? `Todas as ${total} fichas marcadas. Resultado da onda: ${decision}.`
    : `Faltam ${total - done} fichas para habilitar a assinatura.`;
  $('btn-sign').disabled = !decision;
  $('btn-sign').textContent = `Assinar onda e baixar revisao-onda-${String(state.onda || 0).padStart(2, '0')}.md`;
}

async function loadFiles(fileList) {
  const files = [];
  const errors = [];
  for (const file of fileList) {
    try { files.push({ name: file.webkitRelativePath || file.name, json: JSON.parse(await file.text()) }); } catch (e) { errors.push(`${file.name}: não é um JSON válido`); }
  }
  const res = collectFichas(files);
  errors.push(...res.errors);
  if (res.onda) $('onda').value = String(res.onda);
  state.onda = Number($('onda').value);
  state.fichas = res.fichas;
  state.hash = await contentHash(res.fichas);
  restore();
  $('load-errors').replaceChildren(...errors.map((e) => el('li', { text: e })));
  $('load-status').textContent = `${res.fichas.length} fichas carregadas (${SISTEMA_LABEL[ONDAS[state.onda - 1]] || ''}).`;
  const host = $('fichas');
  host.replaceChildren(...res.fichas.map(renderFicha));
  $('progress').hidden = !res.fichas.length;
  $('assinar').hidden = !res.fichas.length;
  $('sign-result').hidden = true;
  updateProgress();
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sign() {
  $('sign-error').textContent = '';
  try {
    const md = buildReviewMd({
      onda: state.onda, fichas: state.fichas, marks: state.marks, hash: state.hash, nameOf,
      reviewer: $('rev-nome').value, registro: $('rev-registro').value, date: $('rev-data').value,
      generatedAt: new Date().toISOString(),
    });
    const name = `revisao-onda-${String(state.onda).padStart(2, '0')}.md`;
    download(name, md);
    $('md-out').textContent = md;
    $('sign-result').hidden = false;
    window.__lastReviewMd = md; // e2e
  } catch (e) {
    $('sign-error').textContent = `Não foi possível assinar: ${e.message}.`;
  }
}

function init() {
  $('onda').replaceChildren(...ONDAS.map((s, i) => el('option', { value: String(i + 1), text: `${String(i + 1).padStart(2, '0')} — ${SISTEMA_LABEL[s]}` })));
  $('rev-data').value = new Date().toISOString().slice(0, 10);
  $('files').addEventListener('change', (ev) => loadFiles([...ev.target.files]));
  $('onda').addEventListener('change', () => { state.onda = Number($('onda').value); if (state.fichas.length) { restore(); $('fichas').replaceChildren(...state.fichas.map(renderFicha)); updateProgress(); } });
  const drop = $('drop');
  drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); loadFiles([...ev.dataTransfer.files]); });
  $('btn-sign').addEventListener('click', sign);
  loadRefs();
}

init();
