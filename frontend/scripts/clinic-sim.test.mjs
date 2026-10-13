/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Modo simulação (beta) da Clínica (frontend/modulos/clinica/clinic-sim.js, ADR 0009): só aparece se o servidor avisar,
// sorteia a semente no navegador, mantém os eixos ocultos até o debrief e só usa textContent. Inclui o motor
// (clinic-engine.js) rodando num DOM falso: sem o aviso do servidor o payload do chat/avaliação NÃO ganha campo novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Objetos criados dentro do vm têm outro Object.prototype: compara por JSON.
const eq = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SIM_SRC = read('frontend/modulos/clinica/clinic-sim.js');
const ENGINE_SRC = read('frontend/modulos/clinica/clinic-engine.js');
const PATIENTS_SRC = read('frontend/modulos/clinica/patients.js');
const HTML = read('frontend/modulos/clinica/index.html');

// ---------------------------------------------------------------------------
// DOM falso mínimo
// ---------------------------------------------------------------------------
function makeNode(tag, id) {
  const node = {
    tagName: String(tag).toUpperCase(), id: id || '', children: [], attrs: {}, dataset: {}, style: {},
    textContent: '', value: '', checked: false, disabled: false, className: '', listeners: {},
    classes: new Set(['hidden']),
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    remove() { if (this.parent) this.parent.removeChild(this); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
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

function allText(node) {
  return [node.textContent].concat((node.children || []).map(allText)).join(' ');
}

function makeDocument() {
  const byId = new Map();
  return {
    byId,
    readyState: 'complete',
    getElementById(id) { if (!byId.has(id)) byId.set(id, makeNode('div', id)); return byId.get(id); },
    createElement: (tag) => makeNode(tag),
    createTextNode: (text) => Object.assign(makeNode('#text'), { textContent: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
}

function loadSim(extra) {
  const document = makeDocument();
  const sandbox = Object.assign({ document, console: { log() {}, warn() {}, error() {} }, crypto: globalThis.crypto }, extra || {});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SIM_SRC + '\n;globalThis.__sim = ClinicSim;', sandbox, { filename: 'clinic-sim.js' });
  return { sim: sandbox.window.ClinicSim, document, sandbox };
}

const ON = { available: true, version: 'sim-v1' };

// ---------------------------------------------------------------------------
// Disponibilidade e interface
// ---------------------------------------------------------------------------
test('sem aviso do servidor nada aparece e nenhum parâmetro é enviado', () => {
  const { sim, document } = loadSim();
  assert.equal(sim.isAvailable(), false);
  sim.setAvailability(undefined);
  sim.setAvailability({ available: false, version: 'sim-v1' });
  sim.setAvailability({ available: true, version: 'sim-v9' });
  assert.equal(sim.isAvailable(), false);
  assert.ok(document.getElementById('simModeBox').classList.contains('hidden'));
  assert.equal(document.getElementById('simModeBox').children.length, 0);
  assert.equal(sim.onCaseStart('builtin', {}), false);
  eq(sim.extraFor(120), {});
});

test('com o aviso, o botão "Modo simulação (beta)" aparece (só texto) e começa desligado', () => {
  const { sim, document } = loadSim();
  assert.equal(sim.setAvailability(ON), true);
  const box = document.getElementById('simModeBox');
  assert.equal(box.classList.contains('hidden'), false);
  assert.match(allText(box), /Modo simulação \(beta\)/);
  assert.equal(sim.onCaseStart('builtin', {}), false);
  eq(sim.extraFor(0), {});
});

test('ligado o modo, o próximo caso sorteia uma semente inteira e a faixa fixa aparece', () => {
  const { sim, document } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  assert.equal(sim.onCaseStart('builtin', { dificuldade: 'Avançado' }), true);
  const banner = document.getElementById('simBanner');
  assert.equal(banner.textContent, 'Caso de treino. Não define conduta.');
  assert.equal(banner.classList.contains('hidden'), false);
  const { simulation } = sim.extraFor(125.9);
  assert.ok(Number.isInteger(simulation.seed) && simulation.seed >= 0 && simulation.seed <= 2147483647);
  assert.equal(simulation.version, 'sim-v1');
  assert.equal(simulation.elapsedSeconds, 125);
  assert.equal(simulation.difficulty, 'avancado');
  eq(simulation.events, []);
});

test('a semente é sorteada de novo a cada caso e fica estável durante o caso', () => {
  const { sim } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  const seeds = new Set();
  for (let i = 0; i < 8; i += 1) {
    sim.onCaseStart('builtin', {});
    const a = sim.extraFor(1).simulation.seed;
    assert.equal(sim.extraFor(500).simulation.seed, a);
    seeds.add(a);
  }
  assert.ok(seeds.size > 1);
});

test('o payload NUNCA leva os eixos: só a semente, a versão, o tempo e eventos', () => {
  const { sim } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  sim.onCaseStart('acervo', { dificuldade: 'Básico' });
  const { simulation } = sim.extraFor(10);
  eq(Object.keys(simulation).sort(), ['elapsedSeconds', 'events', 'seed', 'version']);
});

test('casos gerados na sessão (ia) não entram na simulação; acervo e embutidos sim', () => {
  const { sim } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  assert.equal(sim.onCaseStart('ia', {}), false);
  eq(sim.extraFor(5), {});
  assert.equal(sim.onCaseStart('acervo', {}), true);
  assert.equal(sim.onCaseStart('builtin', {}), true);
});

test('exames viram eventos válidos, sem repetição, e vão no payload', () => {
  const { sim } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  sim.onCaseStart('builtin', {});
  sim.noteExam('colinesterase');
  sim.noteExam('colinesterase');
  sim.noteExam('Gasometria Arterial!');
  eq(sim.extraFor(0).simulation.events, ['exam:colinesterase', 'exam:gasometria_arterial_']);
  sim.onCaseStart('builtin', {});
  eq(sim.extraFor(0).simulation.events, []);
});

test('tempo limitado a 6 h e nunca negativo; perder a disponibilidade desliga o modo', () => {
  const { sim } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  sim.onCaseStart('builtin', {});
  assert.equal(sim.extraFor(999999).simulation.elapsedSeconds, 21600);
  assert.equal(sim.extraFor(-4).simulation.elapsedSeconds, 0);
  sim.setAvailability(null);
  assert.equal(sim.onCaseStart('builtin', {}), false);
  eq(sim.extraFor(1), {});
});

test('endCase encerra a semente e esconde a faixa', () => {
  const { sim, document } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  sim.onCaseStart('builtin', {});
  sim.endCase();
  eq(sim.extraFor(1), {});
  assert.equal(document.getElementById('simBanner').classList.contains('hidden'), true);
});

// ---------------------------------------------------------------------------
// Debrief
// ---------------------------------------------------------------------------
test('o debrief revela os eixos e a nota por componente, só por textContent', () => {
  const { sim, document } = loadSim();
  assert.equal(sim.showDebrief({ axes: [] }), false); // fora de um caso simulado nada é revelado
  sim.setAvailability(ON);
  sim.setWanted(true);
  sim.onCaseStart('builtin', {});
  const ataque = '<img src=x onerror=alert(1)>';
  const ok = sim.showDebrief({
    axes: [{ axis: 'personality', axisLabel: 'Personalidade', value: 'ansioso', label: ataque }, { axis: 'recall', axisLabel: 'Recall do histórico', value: 'baixo', label: 'Baixo' }],
    components: { hipotese: 25, conduta: 20, processo: 15, comunicacao: 10 },
    weights: { hipotese: 30, conduta: 30, processo: 20, comunicacao: 20 },
  });
  assert.equal(ok, true);
  const box = document.getElementById('simDebrief');
  assert.equal(box.classList.contains('hidden'), false);
  const text = allText(box);
  assert.ok(text.includes('Personalidade: ' + ataque));
  assert.match(text, /Hipótese: 25 de 30/);
  assert.match(text, /Comunicação adaptada: 10 de 20/);
  assert.equal(sim.showDebrief(null), false);
});

test('novo caso limpa o debrief anterior', () => {
  const { sim, document } = loadSim();
  sim.setAvailability(ON);
  sim.setWanted(true);
  sim.onCaseStart('builtin', {});
  assert.equal(sim.showDebrief({ axes: [{ axisLabel: 'A', label: 'B' }] }), true);
  sim.onCaseStart('builtin', {});
  const box = document.getElementById('simDebrief');
  assert.equal(box.children.length, 0);
  assert.equal(box.classList.contains('hidden'), true);
});

test('o módulo não usa innerHTML nem eval', () => {
  assert.doesNotMatch(SIM_SRC, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
});

// ---------------------------------------------------------------------------
// Integração com o motor da clínica (DOM falso)
// ---------------------------------------------------------------------------
function loadEngine({ quotaResponse }) {
  const document = makeDocument();
  const calls = [];
  const sandbox = {
    document, console: { log() {}, warn() {}, error() {} }, crypto: globalThis.crypto, TextEncoder, JSON, Math,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, confirm: () => true,
    localStorage: { getItem: () => null, setItem() {} },
  };
  sandbox.window = sandbox;
  sandbox.LaiftApi = {
    call: async (action, input) => {
      calls.push({ action, input });
      if (action === 'apiLearnGetMyAiQuota') return quotaResponse;
      if (action === 'apiLearnClinicalChat') return { success: true, patientReply: 'Estou com falta de ar.' };
      if (action === 'apiLearnClinicalEvaluate') {
        return {
          success: true, saved: true, result: { score: 70, verdict: 'Bom', feedback: 'Parecer.', strengths: [], improvements: [] },
          simulation: { axes: [{ axisLabel: 'Personalidade', label: 'Ansioso' }], components: { hipotese: 20, conduta: 20, processo: 15, comunicacao: 15 }, weights: { hipotese: 30, conduta: 30, processo: 20, comunicacao: 20 } },
        };
      }
      return { success: false };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(PATIENTS_SRC, sandbox, { filename: 'patients.js' });
  vm.runInContext(SIM_SRC, sandbox, { filename: 'clinic-sim.js' });
  vm.runInContext(ENGINE_SRC, sandbox, { filename: 'clinic-engine.js' });
  return { engine: sandbox.window.ClinicEngine, sim: sandbox.window.ClinicSim, document, calls, sandbox };
}

const QUOTAS = { chat: { remaining: 5, limit: 5 }, evaluate: { remaining: 5, limit: 5 }, generateCase: { remaining: 5, limit: 5 } };

async function playOneCase(ctx) {
  await ctx.engine.refreshAiQuota();
  ctx.sim.setWanted(true);
  ctx.engine.startCase(vm.runInContext('clinicalCases[0]', ctx.sandbox));
  ctx.document.getElementById('patientQuestionInput').value = 'Quando começou?';
  await ctx.engine.submitPatientQuestion();
  ctx.document.getElementById('studentDiagnosisInput').value = 'Hipótese';
  ctx.document.getElementById('studentConductInput').value = 'Conduta';
  await ctx.engine.finalizeClinicalCase();
}

test('motor SEM aviso do servidor: chat e avaliação saem sem o campo simulation (comportamento de sempre)', async () => {
  const ctx = loadEngine({ quotaResponse: { success: true, aiConfigured: true, quotas: QUOTAS } });
  await playOneCase(ctx);
  const chat = ctx.calls.find((c) => c.action === 'apiLearnClinicalChat');
  const evaluate = ctx.calls.find((c) => c.action === 'apiLearnClinicalEvaluate');
  assert.ok(chat && evaluate);
  assert.equal('simulation' in chat.input, false);
  assert.equal('simulation' in evaluate.input, false);
  assert.equal(ctx.document.getElementById('simDebrief').children.length, 0);
});

test('motor COM aviso e modo ligado: chat e avaliação levam a mesma semente; o debrief aparece no fim', async () => {
  const ctx = loadEngine({ quotaResponse: { success: true, aiConfigured: true, quotas: QUOTAS, simulation: ON } });
  await playOneCase(ctx);
  const chat = ctx.calls.find((c) => c.action === 'apiLearnClinicalChat').input;
  const evaluate = ctx.calls.find((c) => c.action === 'apiLearnClinicalEvaluate').input;
  assert.equal(chat.simulation.version, 'sim-v1');
  assert.equal(chat.simulation.seed, evaluate.simulation.seed);
  assert.ok(Number.isInteger(chat.simulation.seed));
  assert.match(allText(ctx.document.getElementById('simDebrief')), /Personalidade: Ansioso/);
  assert.equal(ctx.sim.isActive(), false);
});

test('motor COM aviso mas modo desligado pela pessoa: nada é enviado', async () => {
  const ctx = loadEngine({ quotaResponse: { success: true, aiConfigured: true, quotas: QUOTAS, simulation: ON } });
  await ctx.engine.refreshAiQuota();
  ctx.engine.startCase(vm.runInContext('clinicalCases[0]', ctx.sandbox));
  ctx.document.getElementById('patientQuestionInput').value = 'Oi';
  await ctx.engine.submitPatientQuestion();
  assert.equal('simulation' in ctx.calls.find((c) => c.action === 'apiLearnClinicalChat').input, false);
});

test('a página da clínica carrega o clinic-sim.js antes do motor e tem os 3 pontos de encaixe', () => {
  assert.ok(HTML.indexOf('clinic-sim.js') > -1 && HTML.indexOf('clinic-sim.js') < HTML.indexOf('clinic-engine.js'));
  ['id="simModeBox"', 'id="simBanner"', 'id="simDebrief"'].forEach((marker) => assert.ok(HTML.includes(marker), marker));
});
