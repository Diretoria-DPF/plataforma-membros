/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aprendizado na Clínica (A5): linha do tempo, dicas progressivas, debrief por competência, plantão de 5 minutos,
// casos por nível e nota de gatilho (CLI-12). Regras puras em clinic-aprendizado.js; ligação em clinic-aprendizado-ui.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const eq = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
const LEARN_SRC = read('frontend/modulos/clinica/clinic-aprendizado.js');
const UI_SRC = read('frontend/modulos/clinica/clinic-aprendizado-ui.js');
const ENGINE_SRC = read('frontend/modulos/clinica/clinic-engine.js');
const PATIENTS_SRC = read('frontend/modulos/clinica/patients.js');
const HTML = read('frontend/modulos/clinica/index.html');

function load(src, file, extra) {
  const sandbox = Object.assign({ JSON, Math, Object, Array, String, Number }, extra || {});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return sandbox.window;
}
const Learn = load(LEARN_SRC, 'clinic-aprendizado.js').ClinicLearn;
const builtin = load(PATIENTS_SRC + '\nwindow.__casos = clinicalCases;', 'patients.js').__casos;

const caso = {
  id: 'x', dificuldade: 'Avançado', toxindrome: 'Colinérgica', vitalidadeInicial: 80,
  examesDisponiveis: [
    { id: 'e1', nome: 'Colinesterase', essencial: true },
    { id: 'e2', nome: 'Gasometria', essencial: true },
    { id: 'e3', nome: 'Tomografia', essencial: false },
  ],
};

// --- níveis -----------------------------------------------------------
test('nível do caso vem da dificuldade, sem acento, e o padrão é intermediário', () => {
  assert.equal(Learn.levelOf({ dificuldade: 'Avançado' }), 'avancado');
  assert.equal(Learn.levelOf({ dificuldade: 'Básico' }), 'basico');
  assert.equal(Learn.levelOf({ dificuldade: 'Intermediário' }), 'intermediario');
  assert.equal(Learn.levelOf({}), 'intermediario');
  assert.equal(Learn.levelOf(null), 'intermediario');
});

test('filtro por nível mantém a ordem e "todos" devolve uma cópia', () => {
  const lista = [{ id: 1, dificuldade: 'Avançado' }, { id: 2, dificuldade: 'Intermediário' }, { id: 3, dificuldade: 'Avançado' }];
  eq(Learn.filterByLevel(lista, 'avancado').map((c) => c.id), [1, 3]);
  eq(Learn.filterByLevel(lista, 'basico'), []);
  const todos = Learn.filterByLevel(lista, 'todos');
  eq(todos.map((c) => c.id), [1, 2, 3]);
  assert.notEqual(todos, lista);
  eq(Learn.countByLevel(lista), { basico: 0, intermediario: 1, avancado: 2 });
});

test('nível sugerido sobe com média alta, desce com média baixa e é nulo sem histórico', () => {
  assert.equal(Learn.suggestLevel([]), null);
  assert.equal(Learn.suggestLevel([{ nivel: 'Intermediário', media: 80 }]), 'avancado');
  assert.equal(Learn.suggestLevel([{ nivel: 'Avançado', media: 90 }]), 'avancado');
  assert.equal(Learn.suggestLevel([{ nivel: 'Intermediário', media: 40 }]), 'basico');
  assert.equal(Learn.suggestLevel([{ nivel: 'Intermediário', media: 60 }]), 'intermediario');
});

// --- plantão ----------------------------------------------------------
test('plantão escolhe caso aberto do nível, depois qualquer aberto, depois o primeiro', () => {
  const lista = [
    { id: 'a', dificuldade: 'Avançado' }, { id: 'b', dificuldade: 'Intermediário' }, { id: 'c', dificuldade: 'Intermediário' },
  ];
  assert.equal(Learn.pickPlantaoCase(lista, ['b'], 'intermediario').id, 'c');
  assert.equal(Learn.pickPlantaoCase(lista, ['b', 'c'], 'intermediario').id, 'a');
  assert.equal(Learn.pickPlantaoCase(lista, ['a', 'b', 'c'], 'intermediario').id, 'b');
  assert.equal(Learn.pickPlantaoCase(lista, [], 'todos').id, 'a');
  assert.equal(Learn.pickPlantaoCase([], [], 'todos'), null);
});

test('plantão dura 300 s e o restante nunca fica negativo', () => {
  assert.equal(Learn.PLANTAO_SEGUNDOS, 300);
  assert.equal(Learn.plantaoRemaining(0), 300);
  assert.equal(Learn.plantaoRemaining(59.9), 241);
  assert.equal(Learn.plantaoRemaining(999), 0);
  assert.equal(Learn.plantaoRemaining('x'), 300);
});

// --- nota de gatilho --------------------------------------------------
test('só o caso de ingestão voluntária entre os embutidos recebe a nota de gatilho', () => {
  const com = builtin.filter((c) => Learn.needsTriggerNote(c)).map((c) => c.id);
  eq(com, ['caso_tox_04']);
  assert.equal(Learn.needsTriggerNote(null), false);
  assert.equal(Learn.needsTriggerNote({ titulo: 'Tentativa de suicídio por fármaco' }), true);
  assert.equal(Learn.needsTriggerNote({ historicoAdmissao: 'Quadro de autoagressão recorrente' }), true);
});

test('a nota de gatilho indica o 188 e não usa diminutivos nem rótulos de revisão', () => {
  assert.match(Learn.TRIGGER_NOTE, /188/);
  assert.match(Learn.TRIGGER_NOTE, /192/);
  assert.doesNotMatch(Learn.TRIGGER_NOTE, /revisad|rascunho|\bIA\b/i);
});

// --- linha do tempo ---------------------------------------------------
test('a linha do tempo recebe eventos sem mutar a lista anterior e limita o tamanho', () => {
  const vazia = [];
  const a = Learn.addEvent(vazia, { t: 12.7, tipo: 'pergunta', rotulo: 'Quando começou?', vitalidade: 83.4 });
  eq(vazia, []);
  eq(a, [{ t: 12, tipo: 'pergunta', rotulo: 'Quando começou?', vitalidade: 83 }]);
  let lista = [];
  for (let i = 0; i < 80; i += 1) lista = Learn.addEvent(lista, { t: i, tipo: 'exame', rotulo: 'x' });
  assert.equal(lista.length, 60);
  assert.equal(lista[59].t, 79);
});

test('evento com tipo inválido vira início, rótulo longo é cortado e vitalidade ausente fica nula', () => {
  const [e] = Learn.addEvent([], { t: -5, tipo: 'qualquer', rotulo: 'a'.repeat(300) });
  assert.equal(e.tipo, 'inicio');
  assert.equal(e.t, 0);
  assert.ok(e.rotulo.length <= 80);
  assert.equal(e.vitalidade, null);
  assert.equal(Learn.formatClock(125), '02:05');
});

// --- dicas ------------------------------------------------------------
test('as dicas vão do geral ao específico e acabam na terceira', () => {
  const d1 = Learn.nextHint(caso, 0, { perguntas: 0, examesSolicitados: [] });
  assert.equal(d1.nivel, 1);
  assert.match(d1.texto, /anamnese/);
  const d1b = Learn.nextHint(caso, 0, { perguntas: 3 });
  assert.match(d1b.texto, /sinais vitais/);
  const d2 = Learn.nextHint(caso, 1, { examesSolicitados: ['e1'] });
  assert.equal(d2.nivel, 2);
  assert.match(d2.texto, /Gasometria/);
  const d2b = Learn.nextHint(caso, 1, { examesSolicitados: ['e1', 'e2'] });
  assert.match(d2b.texto, /laudos/);
  const d3 = Learn.nextHint(caso, 2, {});
  assert.equal(d3.nivel, 3);
  assert.match(d3.texto, /Colinérgica/);
  assert.equal(Learn.nextHint(caso, 3, {}), null);
});

test('a dica 3 não inventa síndrome quando o caso não tem ou diz "Outra"', () => {
  assert.doesNotMatch(Learn.nextHint({ toxindrome: 'Outra' }, 2, {}).texto, /síndrome/);
  assert.doesNotMatch(Learn.nextHint({}, 2, {}).texto, /síndrome/);
});

test('a dica 2 nunca cita exame que não é essencial', () => {
  const t = Learn.nextHint(caso, 1, { examesSolicitados: ['e1', 'e2'] }).texto;
  assert.doesNotMatch(t, /Tomografia/);
});

// --- competências -----------------------------------------------------
test('o debrief mede as cinco competências a partir das ações', () => {
  const r = Learn.buildCompetencies({
    caso, perguntas: 4, examesSolicitados: ['e1', 'e2'], vitalidadeInicial: 80, vitalidadeFinal: 60,
    desfecho: 'concluido', score: 82, dicas: 1,
  });
  const por = Object.fromEntries(r.competencias.map((c) => [c.id, c]));
  assert.equal(por.anamnese.valor, 100);
  assert.equal(por.exames.valor, 100);
  assert.equal(por.prioridade.valor, 75);
  assert.equal(por.raciocinio.valor, 82);
  assert.equal(por.autonomia.valor, 75);
  assert.equal(por.anamnese.nivel, 'consolidada');
  assert.equal(por.anamnese.sugestao, '');
  assert.equal(r.media, 86);
});

test('exame não essencial desconta, óbito zera a prioridade e a nota ausente fica indisponível', () => {
  const r = Learn.buildCompetencies({
    caso, perguntas: 1, examesSolicitados: ['e1', 'e3'], vitalidadeInicial: 80, vitalidadeFinal: 0,
    desfecho: 'obito', score: null, dicas: 3,
  });
  const por = Object.fromEntries(r.competencias.map((c) => [c.id, c]));
  assert.equal(por.anamnese.valor, 25);
  assert.equal(por.exames.valor, 30);
  assert.equal(por.prioridade.valor, 0);
  assert.equal(por.raciocinio.valor, null);
  assert.equal(por.raciocinio.nivel, 'indisponivel');
  assert.equal(por.autonomia.valor, 25);
  assert.ok(por.exames.sugestao.length > 0);
  assert.equal(Learn.weakest(r.competencias).id, 'prioridade');
  assert.equal(Learn.weakest([]), null);
});

test('o histórico privado limita a 20 entradas e normaliza o nível', () => {
  let h = [];
  for (let i = 0; i < 30; i += 1) h = Learn.appendHistory(h, { caseId: `c${i}`, nivel: 'Avançado', media: 140 });
  assert.equal(h.length, 20);
  assert.equal(h[19].media, 100);
  assert.equal(h[19].nivel, 'avancado');
});

// --- ligação com a tela -----------------------------------------------
test('a página carrega os módulos novos antes do motor e sem script inline', () => {
  const posLearn = HTML.indexOf('src="clinic-aprendizado.js"');
  const posUi = HTML.indexOf('src="clinic-aprendizado-ui.js"');
  const posEngine = HTML.indexOf('src="clinic-engine.js"');
  assert.ok(posLearn > 0 && posUi > posLearn && posEngine > posUi);
  assert.doesNotMatch(HTML, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(HTML, /\son[a-z]+="/);
});

test('o motor chama a interface de aprendizado só se ela existir e o painel não usa innerHTML', () => {
  assert.match(ENGINE_SRC, /window\.ClinicLearnUI/);
  assert.doesNotMatch(UI_SRC, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('o texto público novo não traz rótulos de revisão nem de IA', () => {
  const html = HTML.replace(/<!--[\s\S]*?-->/g, '');
  const bloco = (id) => html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 700);
  const textos = [...UI_SRC.matchAll(/'([^'\n]{12,})'/g)].map((m) => m[1])
    .concat(['learnToolbar', 'triggerNote', 'plantaoBar', 'timelineList', 'btnHint'].map(bloco));
  for (const t of textos) assert.doesNotMatch(t, /\brevisad|rascunho|gerado por IA|\bIA\b/i, t);
});

// --- interface (DOM falso mínimo) ---------------------------------------
function makeDom(ids) {
  const mk = (tag, id) => {
    const n = {
      tag, id, children: [], attrs: {}, style: {}, listeners: {}, _text: '', className: '',
      classes: new Set(),
      get firstChild() { return this.children[0] || null; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); },
      appendChild(c) { this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
      click() { if (this.listeners.click) this.listeners.click(); },
    };
    n.classList = {
      add: (c) => n.classes.add(c), remove: (c) => n.classes.delete(c),
      toggle: (c, on) => { if (on) n.classes.add(c); else n.classes.delete(c); },
      contains: (c) => n.classes.has(c),
    };
    Object.defineProperty(n, 'textContent', {
      get() { return n._text + n.children.map((c) => c.textContent).join(''); },
      set(v) { n.children = []; n._text = String(v); },
    });
    return n;
  };
  const byId = Object.fromEntries(ids.map((id) => [id, mk('div', id)]));
  return {
    byId,
    document: {
      readyState: 'complete',
      getElementById: (id) => byId[id] || null,
      createElement: (t) => mk(t),
      createTextNode: (t) => { const n = mk('#text'); n._text = t; return n; },
      querySelector: (sel) => (sel.includes('fechamentoTab') ? byId.tabFechamento : null),
      addEventListener() {},
    },
  };
}

function loadUi() {
  const ids = ['levelFilter', 'btnPlantao5', 'levelHint', 'triggerNote', 'plantaoBar', 'timelineList', 'btnHint',
    'hintText', 'competencyDebrief', 'tabFechamento'];
  const dom = makeDom(ids);
  const store = {};
  const opened = [];
  const win = load(LEARN_SRC, 'clinic-aprendizado.js', {
    document: dom.document,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    clinicalCases: [{ id: 'a', dificuldade: 'Avançado' }],
  });
  win.ClinicEngine = {
    renderBedsGrid() {}, openBed: (c) => opened.push(c.id), getResolvedCases: () => [], getRequestedExams: () => [],
    getState: () => ({ elapsedSeconds: 30, vitality: 70 }),
  };
  vm.runInContext(UI_SRC, win, { filename: 'clinic-aprendizado-ui.js' });
  return { ui: win.ClinicLearnUI, dom, store, opened };
}

test('interface: nota de gatilho só aparece no caso sensível', () => {
  const { ui, dom } = loadUi();
  ui.onCaseStart({ id: 'z', titulo: 'Ingestão voluntária de analgésicos', vitalidadeInicial: 90 }, { elapsedSeconds: 0, vitality: 90 }, false);
  assert.equal(dom.byId.triggerNote.classes.has('hidden'), false);
  assert.match(dom.byId.triggerNote.textContent, /188/);
  ui.onCaseStart({ id: 'y', titulo: 'Picada de cobra' }, { elapsedSeconds: 0, vitality: 90 }, false);
  assert.equal(dom.byId.triggerNote.classes.has('hidden'), true);
});

test('interface: linha do tempo registra início, pergunta e exame, e dica avança até esgotar', () => {
  const { ui, dom } = loadUi();
  const c = { id: 'k', dificuldade: 'Avançado', toxindrome: 'Colinérgica', examesDisponiveis: [{ id: 'e1', nome: 'Colinesterase', essencial: true }] };
  ui.onCaseStart(c, { elapsedSeconds: 0, vitality: 80 }, false);
  ui.noteQuestion('Quando começou?', { elapsedSeconds: 20, vitality: 80 });
  ui.noteExam({ nome: 'Colinesterase' }, { elapsedSeconds: 320, vitality: 74 });
  const itens = dom.byId.timelineList.children.map((li) => li.textContent);
  assert.equal(itens.length, 3);
  assert.match(itens[1], /00:20.*Quando começou/);
  assert.match(itens[2], /05:20.*Colinesterase.*74%/);
  dom.byId.btnHint.click(); dom.byId.btnHint.click(); dom.byId.btnHint.click();
  assert.match(dom.byId.hintText.textContent, /^Dica 3/);
  assert.equal(dom.byId.btnHint.disabled, true);
  assert.equal(dom.byId.timelineList.children.length, 6);
});

test('interface: plantão abre o caso, conta só segundos reais e para na pausa', () => {
  const { ui, dom, opened } = loadUi();
  dom.byId.btnPlantao5.click();
  eq(opened, ['a']);
  ui.onCaseStart({ id: 'a', dificuldade: 'Avançado' }, { elapsedSeconds: 0, vitality: 90, paused: false }, false);
  assert.equal(dom.byId.plantaoBar.classes.has('hidden'), false);
  for (let i = 0; i < 100; i += 1) ui.onTick({ elapsedSeconds: i, vitality: 90, paused: false });
  assert.match(dom.byId.plantaoBar.textContent, /03:20/);
  for (let i = 0; i < 50; i += 1) ui.onTick({ elapsedSeconds: i, vitality: 90, paused: true });
  assert.match(dom.byId.plantaoBar.textContent, /03:20/);
  for (let i = 0; i < 300; i += 1) ui.onTick({ elapsedSeconds: i, vitality: 90, paused: false });
  assert.match(dom.byId.plantaoBar.textContent, /acabou/);
});

test('interface: debrief mostra cinco competências com textContent e guarda o histórico no aparelho', () => {
  const { ui, dom, store } = loadUi();
  const c = { id: 'k', dificuldade: 'Avançado', vitalidadeInicial: 80, examesDisponiveis: [] };
  ui.onCaseStart(c, { elapsedSeconds: 0, vitality: 80 }, false);
  ui.onResult({ score: 70 }, 'concluido', { caso: c, exams: [], state: { vitality: 60 } });
  const box = dom.byId.competencyDebrief;
  assert.equal(box.classes.has('hidden'), false);
  const lista = box.children.find((n) => n.className === 'competency-list');
  assert.equal(lista.children.length, 5);
  const hist = JSON.parse(store.laift_clinica_debriefs);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].nivel, 'avancado');
  ui.onResult(null, 'obito', { caso: c, exams: [], state: { vitality: 0 } });
  assert.match(box.textContent, /Indisponível/);
});
