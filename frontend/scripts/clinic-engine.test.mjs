/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor da Clínica (frontend/modulos/clinica): regras puras (clinic-core.js), pausa real, ausência de fallbacks que
// inventam dado clínico (CLI-06), modais acessíveis (clinic-modal.js) e conteúdo público dos casos embutidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const CORE_SRC = read('frontend/modulos/clinica/clinic-core.js');
const MODAL_SRC = read('frontend/modulos/clinica/clinic-modal.js');
const ENGINE_SRC = read('frontend/modulos/clinica/clinic-engine.js');
const SIM_SRC = read('frontend/modulos/clinica/clinic-sim.js');
const PATIENTS_SRC = read('frontend/modulos/clinica/patients.js');
const HTML = read('frontend/modulos/clinica/index.html');
const CSS = read('frontend/modulos/shared/style.css');
const eq = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
const UNAVAILABLE = 'Esta função está indisponível agora. Tente de novo em instantes.';

function loadCore() {
  const sandbox = { TextEncoder, JSON, Math, Object, Array, String, Number };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CORE_SRC, sandbox, { filename: 'clinic-core.js' });
  return sandbox.window.ClinicCore;
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------
test('estado inicial vem do caso e é novo a cada chamada', () => {
  const Core = loadCore();
  const a = Core.newState({ vitalidadeInicial: 85, pacienciaInicial: 90 });
  eq(a, { vitality: 85, patience: 90, elapsedSeconds: 0, paused: false, outcome: 'EM_ANDAMENTO' });
  eq(Core.newState(null), { vitality: 100, patience: 100, elapsedSeconds: 0, paused: false, outcome: 'EM_ANDAMENTO' });
  assert.notEqual(Core.newState(null), Core.newState(null));
});

test('o relógio avança 1 s por tick e os medidores caem uma vez por minuto, sem mutar o estado anterior', () => {
  const Core = loadCore();
  const taxa = { vitalidadePorMinuto: 3, pacienciaPorMinuto: 1 };
  const inicial = Core.newState({ vitalidadeInicial: 85, pacienciaInicial: 90 });
  let st = inicial;
  for (let i = 0; i < 59; i += 1) st = Core.tick(st, taxa);
  assert.equal(st.elapsedSeconds, 59);
  assert.equal(st.vitality, 85);
  st = Core.tick(st, taxa);
  assert.equal(st.elapsedSeconds, 60);
  assert.equal(st.vitality, 82);
  assert.equal(st.patience, 89);
  assert.equal(inicial.elapsedSeconds, 0);
});

test('PAUSAR congela relógio e vitalidade; retomar continua do mesmo ponto (CLI-08)', () => {
  const Core = loadCore();
  const taxa = { vitalidadePorMinuto: 3, pacienciaPorMinuto: 1 };
  let st = Core.newState({ vitalidadeInicial: 85, pacienciaInicial: 90 });
  for (let i = 0; i < 90; i += 1) st = Core.tick(st, taxa);
  const antes = st;
  st = Core.pause(st);
  for (let i = 0; i < 600; i += 1) st = Core.tick(st, taxa);
  assert.equal(st.elapsedSeconds, antes.elapsedSeconds);
  assert.equal(st.vitality, antes.vitality);
  assert.equal(st.patience, antes.patience);
  assert.equal(Core.applyDecay(st, 50, 50), st, 'em pausa nada é descontado');
  assert.equal(Core.applyExam(st, { custoTempoMin: 30, impactoVitalidade: -10 }), st);
  st = Core.resume(st);
  st = Core.tick(st, taxa);
  assert.equal(st.elapsedSeconds, 91);
  assert.equal(st.vitality, antes.vitality);
});

test('exame soma minutos virtuais e desconta o impacto; vitalidade zerada vira óbito e congela', () => {
  const Core = loadCore();
  let st = Core.newState({ vitalidadeInicial: 20, pacienciaInicial: 90 });
  st = Core.applyExam(st, { custoTempoMin: 25, impactoVitalidade: -10, impactoPaciencia: -15 });
  assert.equal(st.elapsedSeconds, 1500);
  assert.equal(st.vitality, 10);
  assert.equal(st.patience, 75);
  st = Core.applyExam(st, { custoTempoMin: 5, impactoVitalidade: -10 });
  assert.equal(st.outcome, 'OBITO');
  assert.equal(Core.tick(st, { vitalidadePorMinuto: 1 }), st);
  const aband = Core.applyDecay(Core.newState({ pacienciaInicial: 5 }), 0, 9);
  assert.equal(aband.outcome, 'ABANDONO');
});

test('relógio formatado, níveis dos medidores e título do desfecho', () => {
  const Core = loadCore();
  assert.equal(Core.formatClock(0), '00:00');
  assert.equal(Core.formatClock(3725), '62:05');
  assert.equal(Core.formatClock(-4), '00:00');
  assert.equal(Core.vitalityLevel(80), 'status-healthy');
  assert.equal(Core.vitalityLevel(40), 'status-warning');
  assert.equal(Core.vitalityLevel(10), 'status-danger');
  assert.equal(Core.patienceLevel(60), 'status-patient');
  assert.equal(Core.outcomeTitle('obito'), 'Desfecho Crítico: Óbito');
  assert.equal(Core.outcomeTitle('abandono'), 'Desfecho: Abandono da Consulta');
  assert.equal(Core.outcomeTitle('concluido'), 'Atendimento Finalizado');
  assert.equal(Core.UNAVAILABLE_MESSAGE, UNAVAILABLE);
});

test('contexto do paciente: campos do caso, exames pelo nome, limite de bytes e sem mutar o caso', () => {
  const Core = loadCore();
  const caso = {
    paciente: { nome: 'Ana', idade: 40 }, queixaPrincipal: 'x'.repeat(9000),
    contextoOculto: { exposicaoReal: 'Exposição', temperamento: 'Calma' },
    examesDisponiveis: [{ id: 'ecg', nome: 'Eletrocardiograma' }],
  };
  const snapshot = JSON.stringify(caso);
  const ctx = Core.buildPatientContext(caso, ['ecg', 'outro'], { vitality: 71.6, patience: 50.2 });
  assert.equal(ctx.nome, 'Ana');
  assert.equal(ctx.idade, '40');
  assert.equal(ctx.vitalidadeAtual, 72);
  assert.deepEqual(ctx.examesJaLiberados, ['Eletrocardiograma', 'outro']);
  assert.ok(Core.byteLength(ctx) <= 4096 - 200);
  assert.equal(JSON.stringify(caso), snapshot);
});

test('gabarito enviado ao servidor: só diagnóstico, conduta e até 12 palavras-chave', () => {
  const Core = loadCore();
  assert.equal(Core.answerKeyForServer({}), undefined);
  const key = Core.answerKeyForServer({ gabaritoPreceptor: { diagnostico: 'D', conduta: 'C', palavrasChave: Array.from({ length: 20 }, (_, i) => 'p' + i), extra: 1 } });
  eq(Object.keys(key).sort(), ['conduta', 'diagnostico', 'palavrasChave']);
  assert.equal(key.palavrasChave.length, 12);
  assert.equal(Core.caseSourceOf({ caseSource: 'ia' }), 'ia');
  assert.equal(Core.caseSourceOf({ caseSource: 'outro' }), 'builtin');
});

// ---------------------------------------------------------------------------
// Motor com DOM falso
// ---------------------------------------------------------------------------
function makeNode(tag, id) {
  const node = {
    tagName: String(tag).toUpperCase(), id: id || '', children: [], attrs: {}, dataset: {}, style: {},
    textContent: '', value: '', disabled: false, className: '', listeners: {}, classes: new Set(['hidden']),
    get firstChild() { return this.children[0] || null; },
    get childNodes() { return this.children; },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    remove() { if (this.parent) this.parent.removeChild(this); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    scrollTop: 0, scrollHeight: 0,
  };
  node.classList = {
    add: (c) => node.classes.add(c),
    remove: (c) => node.classes.delete(c),
    toggle: (c, force) => { if (force === undefined ? !node.classes.has(c) : force) node.classes.add(c); else node.classes.delete(c); },
    contains: (c) => node.classes.has(c),
  };
  return node;
}
const allText = (node) => [node.textContent].concat((node.children || []).map(allText)).join(' ');

function loadEngine(apiHandler) {
  const byId = new Map();
  const document = {
    readyState: 'complete',
    getElementById(id) { if (!byId.has(id)) byId.set(id, makeNode('div', id)); return byId.get(id); },
    createElement: (tag) => makeNode(tag),
    createTextNode: (text) => Object.assign(makeNode('#text'), { textContent: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const alerts = [];
  const timers = { fn: null };
  const calls = [];
  const sandbox = {
    document, console: { log() {}, warn() {}, error() {} }, crypto: globalThis.crypto, TextEncoder, JSON, Math,
    setInterval: (fn) => { timers.fn = fn; return 1; }, clearInterval() { timers.fn = null; }, setTimeout: () => 1,
    confirm: () => true, alert: (m) => { alerts.push(String(m)); }, prompt: () => 'Intoxicação por Paracetamol',
    localStorage: { getItem: () => null, setItem() {} },
  };
  sandbox.window = sandbox;
  sandbox.LaiftApi = { call: async (action, input) => { calls.push({ action, input }); return apiHandler(action, input); } };
  vm.createContext(sandbox);
  [['patients.js', PATIENTS_SRC], ['clinic-sim.js', SIM_SRC], ['clinic-core.js', CORE_SRC], ['clinic-engine.js', ENGINE_SRC]]
    .forEach(([name, src]) => vm.runInContext(src, sandbox, { filename: name }));
  const tick = (n) => { for (let i = 0; i < n; i += 1) if (timers.fn) timers.fn(); };
  return { engine: sandbox.window.ClinicEngine, document, sandbox, alerts, calls, tick, firstCase: () => vm.runInContext('clinicalCases[0]', sandbox) };
}

test('Pausar NÃO reinicia o caso: relógio, medidores, exames e conversa voltam do mesmo ponto', async () => {
  const ctx = loadEngine(async () => ({ success: true, patientReply: 'Estou sem ar.' }));
  const caso = ctx.firstCase();
  ctx.engine.openBed(caso);
  ctx.tick(125);
  ctx.engine.requestExam('ecg');
  await ctx.engine.submitPatientQuestion(); // campo vazio: nada acontece
  ctx.document.getElementById('patientQuestionInput').value = 'Quando começou?';
  await ctx.engine.submitPatientQuestion();
  const antes = JSON.parse(JSON.stringify(ctx.engine.getState()));
  assert.ok(antes.elapsedSeconds > 125, 'o exame somou minutos virtuais');
  assert.ok(antes.vitality < caso.vitalidadeInicial, 'a vitalidade caiu com o tempo');

  await ctx.engine.returnToBeds();
  assert.equal(ctx.engine.isPausedFor(caso.id), true);
  assert.equal(ctx.engine.getState().paused, true);
  ctx.tick(300); // sem intervalo ativo: nada corre
  eq(ctx.engine.getState(), Object.assign({}, antes, { paused: true }));

  ctx.engine.openBed(caso);
  const depois = ctx.engine.getState();
  assert.equal(depois.paused, false);
  assert.equal(depois.elapsedSeconds, antes.elapsedSeconds);
  assert.equal(depois.vitality, antes.vitality);
  assert.equal(depois.patience, antes.patience);
  assert.equal(ctx.engine.isPausedFor(caso.id), false);
  assert.match(allText(ctx.document.getElementById('chatHistory')), /Estou sem ar/);
  assert.match(allText(ctx.document.getElementById('releasedExamsList')), /Eletrocardiograma/);
  ctx.tick(1);
  assert.equal(ctx.engine.getState().elapsedSeconds, antes.elapsedSeconds + 1);
});

test('sem IA o paciente NÃO responde por conta própria: mostra o aviso e não grava o turno (CLI-06)', async () => {
  const ctx = loadEngine(async () => ({ success: false, message: 'qualquer' }));
  ctx.engine.openBed(ctx.firstCase());
  const input = ctx.document.getElementById('patientQuestionInput');
  input.value = 'Tomou algum medicamento ou comprimido?';
  await ctx.engine.submitPatientQuestion();
  const chat = allText(ctx.document.getElementById('chatHistory'));
  assert.ok(chat.includes(UNAVAILABLE));
  assert.doesNotMatch(chat, /Tomei uns comprimidos|Estou me sentindo muito mal|simulad/);
  assert.equal(input.value, 'Tomou algum medicamento ou comprimido?', 'a pergunta volta ao campo');
  input.value = 'E agora?';
  await ctx.engine.submitPatientQuestion();
  const chatCalls = ctx.calls.filter((c) => c.action === 'apiLearnClinicalChat');
  assert.equal(chatCalls[1].input.history.length, 1, 'só a queixa inicial; nenhum turno inventado');
});

test('sem IA a geração de caso não cria paciente: só o aviso, e a lista de leitos não muda (CLI-06)', async () => {
  const ctx = loadEngine(async () => ({ success: false }));
  const antes = vm.runInContext('clinicalCases.length', ctx.sandbox);
  await ctx.engine.solicitarCasoProcedural();
  assert.deepEqual(ctx.alerts, [UNAVAILABLE]);
  assert.equal(vm.runInContext('clinicalCases.length', ctx.sandbox), antes);
  assert.equal(ctx.calls.some((c) => c.action === 'apiLearnClinicalGenerateCase'), true);
});

test('sem avaliação do servidor não há nota local nem leito "Concluído"; dá para tentar de novo', async () => {
  let evaluateOk = false;
  const ctx = loadEngine(async (action) => {
    if (action === 'apiLearnClinicalEvaluate') {
      return evaluateOk ? { success: true, saved: true, result: { score: 80, verdict: 'Bom', feedback: 'Parecer', strengths: [], improvements: [] } } : { success: false };
    }
    return { success: false };
  });
  const saved = [];
  ctx.sandbox.localStorage.setItem = (k, v) => saved.push([k, v]);
  ctx.engine.openBed(ctx.firstCase());
  ctx.document.getElementById('studentDiagnosisInput').value = 'Intoxicação por organofosforado';
  ctx.document.getElementById('studentConductInput').value = 'Atropina';
  await ctx.engine.finalizeClinicalCase();
  assert.deepEqual(ctx.alerts, [UNAVAILABLE]);
  assert.equal(saved.length, 0);
  assert.equal(ctx.document.getElementById('preceptorGrade').textContent, '');
  assert.equal(ctx.document.getElementById('submitCaseResolutionBtn').disabled, false);
  evaluateOk = true;
  await ctx.engine.finalizeClinicalCase();
  assert.equal(ctx.document.getElementById('preceptorGrade').textContent, '80');
  assert.equal(saved.length, 1);
});

test('o cartão do acervo não mostra selo de revisão e a tela não tem texto de revisado/rascunho', async () => {
  const lib = { success: true, cases: [{ id: 'abc', titulo: 'Caso X', toxindrome: 'Colinérgica', agentePrincipal: 'Agente', queixaPrincipal: 'Queixa', paciente: { nome: 'Ana', idade: 30 } }] };
  const ctx = loadEngine(async () => lib);
  await ctx.engine.carregarAcervoComunitario();
  const grid = allText(ctx.document.getElementById('communityBedsGrid'));
  assert.match(grid, /Caso X/);
  assert.doesNotMatch(grid, /[Rr]evisad|rascunho|✔/);
  assert.doesNotMatch(ENGINE_SRC + HTML, /[Rr]evisado|revisados|[Rr]ascunho|não revisad|por IA|gerado por IA/);
  assert.doesNotMatch(HTML, /conteúdo de estudo|não substitui/i);
});

test('o motor não usa innerHTML e a página tem os nomes e regiões de acessibilidade (CLI-10)', () => {
  const code = (src) => src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join(String.fromCharCode(10));
  assert.doesNotMatch(code(ENGINE_SRC + MODAL_SRC + CORE_SRC), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  assert.match(HTML, /id="preceptorModal"[^>]*aria-labelledby="preceptorModalTitle"/);
  assert.match(HTML, /id="instructionsModal"[^>]*aria-labelledby="instructionsTitle"/);
  assert.match(HTML, /id="modalRadarEpidemio"[^>]*aria-labelledby="radarTitle"/);
  assert.match(HTML, /id="chatHistory"[^>]*role="log"[^>]*aria-live="polite"/);
  assert.match(HTML, /<h3 id="caseOutcomeTitle"/);
  assert.match(HTML, /role="progressbar"[^>]*aria-label="Estabilidade clínica"/);
  assert.doesNotMatch(HTML, /<script(?![^>]*\ssrc=)[^>]*>/);
});

test('CSS do celular: grade com minmax(0,1fr), abas visíveis, monitor fixo ao rolar', () => {
  assert.match(CSS, /\.prontuario-grid \{[^}]*minmax\(0, 1fr\)/);
  assert.match(CSS, /\.clinic-workspace \{[^}]*overflow: clip/);
  assert.match(CSS, /\.patient-monitor \{\s*position: sticky;/);
  assert.match(CSS, /\.clinic-tabs \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

// ---------------------------------------------------------------------------
// Modais: Esc, foco preso e devolvido
// ---------------------------------------------------------------------------
function loadModal() {
  const listeners = {};
  const doc = {
    activeElement: null,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
    contains: () => true,
  };
  const focusable = (name) => ({ name, focus() { doc.activeElement = this; } });
  const mkModal = (items, cls) => {
    const node = {
      classes: new Set(cls), style: {}, attrs: {},
      classList: { add: (c) => node.classes.add(c), remove: (c) => node.classes.delete(c), contains: (c) => node.classes.has(c) },
      querySelectorAll: () => items, contains: (n) => items.includes(n), setAttribute(k, v) { node.attrs[k] = v; }, focus() { doc.activeElement = node; },
    };
    return node;
  };
  const sandbox = { document: doc, Array, Object };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(MODAL_SRC, sandbox, { filename: 'clinic-modal.js' });
  return { Modal: sandbox.window.ClinicModal, doc, listeners, focusable, mkModal };
}
const key = (k, extra) => Object.assign({ key: k, shiftKey: false, preventDefault() { this.prevented = true; } }, extra || {});

test('modal: abre com foco no primeiro item, prende o Tab, Esc fecha e devolve o foco a quem abriu', () => {
  const { Modal, doc, listeners, focusable, mkModal } = loadModal();
  const opener = focusable('abrir');
  const a = focusable('a');
  const b = focusable('b');
  const modal = mkModal([a, b], ['modal']);
  doc.activeElement = opener;
  Modal.open(modal);
  assert.equal(modal.classes.has('active'), true);
  assert.equal(doc.activeElement, a);
  assert.ok(listeners.keydown);

  doc.activeElement = b;
  const tab = key('Tab');
  listeners.keydown(tab);
  assert.equal(tab.prevented, true);
  assert.equal(doc.activeElement, a, 'Tab no último volta ao primeiro');
  const shiftTab = key('Tab', { shiftKey: true });
  listeners.keydown(shiftTab);
  assert.equal(doc.activeElement, b, 'Shift+Tab no primeiro vai ao último');

  const esc = key('Escape');
  listeners.keydown(esc);
  assert.equal(modal.classes.has('active'), false);
  assert.equal(doc.activeElement, opener);
  assert.equal(listeners.keydown, undefined);
});

test('modal tipo overlay (radar) usa display; Esc chama o onClose em vez de devolver o foco', () => {
  const { Modal, doc, listeners, focusable, mkModal } = loadModal();
  const close = focusable('fechar');
  const overlay = mkModal([close], ['modal-overlay']);
  let closed = 0;
  doc.activeElement = focusable('abrir');
  Modal.open(overlay, { onClose: () => { closed += 1; } });
  assert.equal(overlay.style.display, 'flex');
  listeners.keydown(key('Escape'));
  assert.equal(overlay.style.display, 'none');
  assert.equal(closed, 1);
  assert.equal(Modal.isOpen(overlay), false);
});
