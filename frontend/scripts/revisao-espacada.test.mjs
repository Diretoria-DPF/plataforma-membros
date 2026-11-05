/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// A3: "Para hoje" unificado, a Guia sugerindo o próximo passo e a revisão espaçada de erros entre módulos
// (Quiz + Atlas + Clínica), guardada só no aparelho. Cobre revisao-espacada.js, para-hoje.js, assistant-next.js,
// a fiação em learn-v2.js / home-v3.js / learning.js / engagement.js e o registro nos módulos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertSobDemanda, assertAntes } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const Lazy = require('../lazy-bundles.js');
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');

const Errors = require('../modulos/shared/quiz-errors.js');
const Review = require('../modulos/shared/revisao-espacada.js');
const ParaHoje = require('../para-hoje.js');
const Next = require('../assistant-next.js');
const V2 = require('../learn-v2.js');
const V3 = require('../home-v3.js');
const Core = (() => {
  const sandbox = { TextEncoder, JSON, Math, Object, Array, String, Number };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'modulos/clinica/clinic-core.js'), 'utf8'), sandbox, { filename: 'clinic-core.js' });
  return sandbox.window.ClinicCore;
})();

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-11-05T12:00:00Z');
const EMAIL = 'aluna@exemplo.com';

function memoria() {
  const dados = new Map();
  return { getItem: (k) => (dados.has(k) ? dados.get(k) : null), setItem: (k, v) => dados.set(k, String(v)), removeItem: (k) => dados.delete(k), dados };
}

/** Registra erros em vários módulos há 2 dias, para já estarem vencidos hoje. */
function aparelhoComErros(storage, email = EMAIL) {
  const antes = AGORA - 2 * DIA;
  const feitos = [
    ['farmacologia', 11, 'Farmacocinética', false], ['farmacologia', 12, 'Farmacodinâmica', false], ['farmacologia', 13, 'Farmacodinâmica', false],
    ['toxicologia', 5, 'Antídotos', false], ['anatomia', 'caso_femur', 'Fêmur', false], ['clinica', 'caso_tox_01', 'Intoxicação', false],
  ];
  feitos.forEach(([module, id, topic, correct]) => assert.equal(Review.record({ module, id, topic, correct, email, now: antes, storage }), true));
}

// ---------- quiz-errors.js aceita ids de texto (Atlas e Clínica) ----------

test('quiz-errors: id de texto é guardado, ordenado e quitado como o numérico; id inválido some', () => {
  let store = Errors.emptyStore('x');
  store = Errors.record(store, { module: 'anatomia', id: 'caso_a', topic: 'A', correct: false, now: AGORA });
  store = Errors.record(store, { module: 'anatomia', id: 'caso_b', topic: 'B', correct: false, now: AGORA });
  assert.deepEqual(Errors.ids(store, 'anatomia').sort(), ['caso_a', 'caso_b']);
  assert.equal(Errors.count(store, 'anatomia'), 2);
  const lido = Errors.parse(JSON.stringify(store), 'x');
  assert.equal(Errors.count(lido, 'anatomia'), 2);
  const lixo = Errors.parse({ items: { a: { module: 'm', id: '' }, b: { module: 'm', id: 'y'.repeat(81) }, c: { module: 'm', id: {} } } }, 'x');
  assert.equal(Errors.count(lixo), 0);
  for (let i = 0; i < 3; i++) store = Errors.record(store, { module: 'anatomia', id: 'caso_a', correct: true, now: AGORA + (i + 1) * 10 * DIA });
  assert.deepEqual(Errors.ids(store, 'anatomia'), ['caso_b']);
});

// ---------- revisao-espacada.js ----------

test('ownerTag é igual ao de quiz-offline-queue.js (mesmo dono nos dois lados)', () => {
  require('../modulos/shared/quiz-offline-queue.js');
  const Queue = globalThis.LaiftQuizQueue;
  assert.ok(Queue && typeof Queue.ownerTag === 'function');
  ['aluna@exemplo.com', ' ALUNA@Exemplo.com ', 'outra@x.org', ''].forEach((e) => assert.equal(Review.ownerTag(e), Queue.ownerTag(e)));
});

test('nomes: armazenamento <-> catálogo cobrem Quiz, Atlas e Clínica; módulo desconhecido não registra', () => {
  assert.equal(Review.catalogId('farmacologia'), 'farmaco');
  assert.equal(Review.catalogId('toxicologia'), 'toxico');
  assert.equal(Review.catalogId('anatomia'), 'anatomia');
  assert.equal(Review.catalogId('clinica'), 'clinica');
  assert.equal(Review.catalogId('laboratorio'), '');
  assert.equal(Review.storeName('farmaco'), 'farmacologia');
  assert.equal(Review.record({ module: 'laboratorio', id: 1, correct: false, email: EMAIL, storage: memoria() }), false);
  assert.equal(Review.record({ module: 'clinica', id: '', correct: false, email: EMAIL, storage: memoria() }), false);
});

test('read: resume o que vence hoje por módulo e aponta o módulo com mais erros vencidos', () => {
  const storage = memoria();
  aparelhoComErros(storage);
  const r = Review.read({ email: EMAIL, now: AGORA, storage });
  assert.equal(r.due, 6);
  assert.equal(r.total, 6);
  assert.equal(r.next, 'farmaco');
  assert.deepEqual(r.modules.map((m) => [m.id, m.due]), [['farmaco', 3], ['toxico', 1], ['anatomia', 1], ['clinica', 1]]);
  assert.equal(Review.dueText(r), '6 erros para rever hoje');
  assert.equal(Review.dueBreakdown(r), 'Farmacologia 3 · Toxicologia 1 · Atlas 3D 1 · Clínica virtual 1');
});

test('read: erro de ontem ainda não venceu; acerto adia; nada vencido = resumo vazio sem próximo', () => {
  const storage = memoria();
  Review.record({ module: 'anatomia', id: 'caso_a', topic: 'A', correct: false, email: EMAIL, now: AGORA - 12 * 60 * 60 * 1000, storage });
  assert.equal(Review.read({ email: EMAIL, now: AGORA, storage }).due, 0, 'vence amanhã');
  assert.equal(Review.read({ email: EMAIL, now: AGORA + DIA, storage }).due, 1);
  const vazio = Review.read({ email: EMAIL, now: AGORA, storage });
  assert.equal(vazio.next, '');
  assert.equal(vazio.total, 1);
  assert.equal(Review.dueText(vazio), '');
  assert.equal(Review.dueText(null), '');
});

test('read: outra conta no mesmo aparelho não vê os erros; sem conta ou sem armazenamento, nada aparece', () => {
  const storage = memoria();
  aparelhoComErros(storage);
  assert.equal(Review.read({ email: 'outra@exemplo.com', now: AGORA, storage }).due, 0);
  assert.equal(Review.read({ email: '', now: AGORA, storage }).due, 0, 'sem conta identificada não mostra nada');
  assert.equal(Review.read({ email: EMAIL, now: AGORA, storage: null }).due, 0);
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(Review.read({ email: EMAIL, now: AGORA, storage: quebrado }).due, 0);
  assert.equal(Review.record({ module: 'clinica', id: 'x', correct: false, email: EMAIL, storage: quebrado }), true, 'falha de gravação é silenciosa');
});

test('dueIds: devolve os ids vencidos do módulo (texto no Atlas, número no Quiz)', () => {
  const storage = memoria();
  aparelhoComErros(storage);
  assert.deepEqual(Review.dueIds('anatomia', { email: EMAIL, now: AGORA, storage }), ['caso_femur']);
  assert.deepEqual(Review.dueIds('farmacologia', { email: EMAIL, now: AGORA, storage }).sort(), [11, 12, 13]);
  assert.deepEqual(Review.dueIds('anatomia', { email: 'outra@exemplo.com', now: AGORA, storage }), []);
  assert.deepEqual(Review.dueIds('anatomia', { email: EMAIL, now: AGORA - 5 * DIA, storage }), []);
});

test('o que é guardado: só módulo, id e tópico curto (nenhum texto de questão ou de resposta)', () => {
  const storage = memoria();
  Review.record({ module: 'clinica', id: 'caso_tox_01', topic: 'T'.repeat(500), correct: false, email: EMAIL, now: AGORA, storage });
  const bruto = JSON.parse(storage.getItem(Errors.KEY));
  const item = Object.values(bruto.items)[0];
  assert.deepEqual(Object.keys(item).sort(), ['due', 'id', 'last', 'module', 'streak', 'topic', 'wrong']);
  assert.ok(item.topic.length <= 120);
});

// ---------- para-hoje.js ----------

test('para-hoje: revisão vem primeiro, depois o quiz do dia, depois os extras; no máximo 4', () => {
  const storage = memoria();
  aparelhoComErros(storage);
  const review = Review.read({ email: EMAIL, now: AGORA, storage });
  const itens = ParaHoje.build({ dailyQuizDone: false }, review, [{ kind: 'simulado' }, { kind: 'caso' }, { kind: 'extra' }]);
  assert.deepEqual(itens.map((i) => i.kind), ['review', 'quiz', 'simulado', 'caso']);
  assert.equal(itens[0].module, 'farmaco');
  assert.equal(itens[0].title, 'Revisar 6 erros');
  assert.match(itens[0].sub, /Farmacologia 3/);
  assert.equal(ParaHoje.MAX_ITEMS, 4);
});

test('para-hoje: sem erro vencido ou sem engajamento, o item correspondente não existe', () => {
  assert.equal(ParaHoje.reviewItem(null), null);
  assert.equal(ParaHoje.reviewItem({ due: 0, next: '', modules: [] }), null);
  assert.equal(ParaHoje.quizItem(null), null);
  assert.deepEqual(ParaHoje.build(null, null, [{ kind: 'caso' }]).map((i) => i.kind), ['caso']);
  const um = ParaHoje.reviewItem({ due: 1, next: 'anatomia', modules: [{ id: 'anatomia', name: 'Atlas 3D', due: 1 }] });
  assert.equal(um.title, 'Revisar 1 erro');
});

test('Aprender v2 e Início v3 usam a MESMA lista de base (revisão e quiz do dia)', () => {
  const review = { due: 2, next: 'toxico', modules: [{ id: 'toxico', name: 'Toxicologia', due: 2 }] };
  const aprender = V2.todayItems({ dailyQuizDone: false }, review);
  const inicio = V3.todayItems({ nextEvents: [{ title: 'Aula', eventDate: '2026-11-06T22:00:00Z' }], voting: { pendingCount: 1 } }, { dailyQuizDone: false }, new Date(AGORA), review);
  assert.deepEqual(aprender.slice(0, 2), inicio.slice(0, 2));
  assert.deepEqual(aprender.map((i) => i.kind), ['review', 'quiz', 'simulado', 'caso']);
  assert.deepEqual(inicio.map((i) => i.kind), ['review', 'quiz', 'event', 'voting']);
});

test('sem revisão a lista é a de antes (nenhum item novo para quem não tem erros)', () => {
  assert.deepEqual(V2.todayItems({ dailyQuizDone: false }).map((i) => i.kind), ['quiz', 'simulado', 'caso']);
  assert.deepEqual(V2.todayItems(null, null).map((i) => i.kind), ['simulado', 'caso']);
  assert.deepEqual(V3.todayItems(null, { dailyQuizDone: true }, new Date(AGORA), null).map((i) => i.kind), ['quiz']);
});

// ---------- assistant-next.js (a Guia) ----------

test('Guia: o próximo passo abre o MÓDULO com mais erros a rever e o rótulo cabe no botão', () => {
  const storage = memoria();
  aparelhoComErros(storage);
  const passo = Next.step(Review.read({ email: EMAIL, now: AGORA, storage }));
  assert.equal(passo.action.type, 'open_module');
  assert.equal(passo.action.target, 'farmaco');
  assert.ok(passo.action.label.length <= 40, passo.action.label);
  assert.match(passo.text, /6 erros para rever hoje/);
  assert.match(passo.text, /Farmacologia/);
  assert.equal(Next.step(null), null);
  assert.equal(Next.step({ due: 0, next: '', modules: [] }), null);
});

test('Guia: forGreeting lê o aparelho da conta, passa pela lista branca e fica calada sem erros', () => {
  const storage = memoria();
  aparelhoComErros(storage);
  const salvo = globalThis.localStorage;
  globalThis.localStorage = storage;
  globalThis.LaiftReview = Review;
  try {
    const app = { getIdentity: () => ({ email: EMAIL }) };
    const Assistant = require('../assistant.js');
    const ok = Next.forGreeting(app, Assistant.sanitizeActions, AGORA);
    assert.equal(ok.actions.length, 1);
    assert.equal(ok.actions[0].target, 'farmaco');
    assert.equal(Next.forGreeting({ getIdentity: () => ({ email: 'outra@exemplo.com' }) }, Assistant.sanitizeActions, AGORA), null);
    assert.equal(Next.forGreeting({ getIdentity: () => null }, Assistant.sanitizeActions, AGORA), null, 'visitante');
    assert.equal(Next.forGreeting(app, () => [], AGORA), null, 'ação fora da lista branca não aparece');
    const msg = { role: 'lia', text: 'Oi.', suggestions: ['a'] };
    const dec = Next.decorate(msg, app, Assistant.sanitizeActions, AGORA);
    assert.match(dec.text, /^Oi\. Você tem 6 erros/);
    assert.equal(dec.actions[0].type, 'open_module');
    assert.deepEqual(msg, { role: 'lia', text: 'Oi.', suggestions: ['a'] }, 'a mensagem original não é alterada');
    assert.equal(Next.decorate(msg, { getIdentity: () => null }, Assistant.sanitizeActions, AGORA), msg);
  } finally {
    if (salvo === undefined) delete globalThis.localStorage; else globalThis.localStorage = salvo;
  }
});

// ---------- Atlas e Clínica ----------

test('Atlas: reviewCases mantém a ordem dos ids, ignora repetidos e casos que não existem mais', async () => {
  const { reviewCases } = await import(pathToFileURL(path.join(raiz, 'modulos/anatomia-3d/js/modes/quiz.js')).href);
  const banco = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(reviewCases(banco, ['c', 'a', 'c', 'removido']).map((c) => c.id), ['c', 'a']);
  assert.deepEqual(reviewCases(banco, []), []);
  assert.deepEqual(reviewCases(null, ['a']), []);
  assert.deepEqual(reviewCases(banco, null), []);
});

test('Atlas: o quiz registra cada resposta na revisão e oferece "Revisar meus erros" no início', () => {
  const src = ler('modulos/anatomia-3d/js/modes/quiz.js');
  assert.match(src, /recordReview\(caso, correct\);\s*\n\s*emit\(EVENTS\.QUIZ_ANSWER/);
  assert.match(src, /module: 'anatomia', id: String\(caso\.id\)/);
  assert.match(src, /Revisar meus erros \(\$\{due\.length\}\)/);
  assert.doesNotMatch(src, /innerHTML/);
  const html = ler('modulos/anatomia-3d/index.html');
  assert.ok(html.indexOf('quiz-errors.js') > 0 && html.indexOf('quiz-errors.js') < html.indexOf('revisao-espacada.js'));
  assert.ok(html.indexOf('revisao-espacada.js') < html.indexOf('<script type="module" src="js/main.js"'), 'a revisão carrega antes do módulo do Atlas');
});

test('Clínica: só caso concluído com nota do preceptor >= 60 conta como acerto; registro só de caso do plantão', () => {
  assert.equal(Core.REVIEW_MIN_SCORE, 60);
  assert.equal(Core.reviewCorrect({ score: 60 }, 'concluido'), true);
  assert.equal(Core.reviewCorrect({ score: 59 }, 'concluido'), false);
  assert.equal(Core.reviewCorrect({ score: 95 }, 'obito'), false);
  assert.equal(Core.reviewCorrect({ score: 95 }, 'abandono'), false);
  assert.equal(Core.reviewCorrect({ score: 'x' }, 'concluido'), false);
  assert.equal(Core.reviewCorrect(null, 'concluido'), false);
  const engine = ler('modulos/clinica/clinic-engine.js');
  assert.match(engine, /registrarRevisao\(currentCase, Core\.reviewCorrect\(response\.result, outcome\)\)/);
  assert.match(engine, /caseSourceOf\(caso\) !== 'builtin'/);
  assert.match(engine, /Rever hoje/);
  const html = ler('modulos/clinica/index.html');
  assert.ok(html.indexOf('revisao-espacada.js') > 0 && html.indexOf('revisao-espacada.js') < html.indexOf('src="clinic-engine.js"'));
});

// ---------- fiação ----------

test('Quiz e Toxicologia abrem direto na revisão com #revisar-erros; learning.js e engagement.js expõem startReview/openReview', () => {
  ['modulos/quiz/app.js', 'modulos/toxicologia/app.js'].forEach((f) => assert.match(ler(f), /location\.hash === '#revisar-erros'[\s\S]*reviewMyErrors\(\)/, f));
  const learning = ler('learning.js');
  assert.match(learning, /function startReview\(id\)/);
  assert.match(learning, /mod\.path \+ '#revisar-erros'/);
  assert.match(learning, /startReview: startReview,/);
  assert.match(learning, /LaiftQuiz\.reviewMyErrors\(\)/);
  const engagement = ler('engagement.js');
  assert.match(engagement, /function openReview\(app, id\)/);
  assert.match(engagement, /openReview: openReview,/);
});

test('as telas ligam a revisão: item "review" abre o módulo certo; o resumo vem do aparelho da conta', () => {
  assert.match(ler('learn-v2.js'), /item\.kind === 'review'\) return function \(\) \{ ctx\.openReview\(item\.module\)/);
  assert.match(ler('learn-v2.js'), /ctx\.review = reviewSummary\(app\)/);
  assert.match(ler('home-v3.js'), /item\.kind === 'review'\) return function \(\) \{ engagementLib\(\)\.openReview\(ctx\.app, item\.module\)/);
  assert.match(ler('home-v3.js'), /ctx\.review = reviewSummary\(/);
  assert.match(ler('assistant.js'), /LaiftAssistantNext\.decorate\(msg, ui\.app, sanitizeActions\)/);
  const store = memoria();
  const antes = globalThis.LaiftReview;
  globalThis.LaiftReview = Review;
  const salvo = globalThis.localStorage;
  globalThis.localStorage = store;
  try {
    aparelhoComErros(store);
    const app = { getIdentity: () => ({ email: EMAIL }) };
    const agora = Date.now;
    Date.now = () => AGORA;
    try {
      assert.equal(V2.reviewSummary(app).due, 6);
      assert.equal(V3.reviewSummary(app).due, 6);
      assert.equal(V2.reviewSummary({ getIdentity: () => null }).due, 0);
    } finally { Date.now = agora; }
  } finally {
    if (antes === undefined) delete globalThis.LaiftReview; else globalThis.LaiftReview = antes;
    if (salvo === undefined) delete globalThis.localStorage; else globalThis.localStorage = salvo;
  }
});

test('pacotes sob demanda: o pacote "revisao" vem antes das telas e da Guia; o próximo passo da Guia antes do assistant.js', () => {
  assertSobDemanda('revisao', 'para-hoje.js');
  assertSobDemanda('lia', 'assistant-next.js');
  assertAntes('revisao', 'modulos/shared/quiz-errors.js', 'modulos/shared/revisao-espacada.js');
  assertAntes('lia', 'assistant-next.js', 'assistant.js');
  ['aprender2', 'inicio3'].forEach((pacote) => assert.deepEqual(Lazy.REQUIRES[pacote], ['revisao'], pacote));
  assert.deepEqual(Lazy.OPTIONAL_REQUIRES.lia, ['revisao'], 'a Guia só usa a revisão se ela chegar');
  [Lazy.REQUIRES, Lazy.OPTIONAL_REQUIRES].forEach((mapa) => Object.keys(mapa).forEach((pacote) => mapa[pacote].forEach((dep) => assert.ok(Lazy.BUNDLES[dep], `${dep} não existe`))));
});

test('carregador: pacote opcional que falha não impede o pedido; o exigido que falha impede', async () => {
  const falha = new Set(['b.js']);
  const doc = {
    body: { appendChild(node) { queueMicrotask(() => (falha.has(node.src) ? node.onerror() : node.onload())); } },
    createElement() { return { async: true }; },
  };
  const loader = Lazy.createLoader(doc, { base: ['b.js'], guia: ['g.js'], tela: ['t.js'] }, { tela: ['base'] }, { guia: ['base'] });
  assert.equal(await loader.load('guia'), 'guia');
  await assert.rejects(loader.load('tela'));
});

test('carregador: o pacote exigido baixa por inteiro antes do pedido, e uma vez só', async () => {
  const inseridos = [];
  const doc = {
    body: { appendChild(node) { inseridos.push(node.src); queueMicrotask(() => node.onload()); } },
    createElement() { return { async: true }; },
  };
  const loader = Lazy.createLoader(doc, { base: ['b1.js', 'b2.js'], tela: ['t.js'], outra: ['o.js'] }, { tela: ['base'], outra: ['base'] });
  await Promise.all([loader.load('tela'), loader.load('outra')]);
  assert.deepEqual(inseridos, ['b1.js', 'b2.js', 't.js', 'o.js']);
});

test('arquivos novos: sem innerHTML, sem script inline, sem rede, sem diminutivo; Guia no feminino; assistant.js < 760 linhas', () => {
  ['modulos/shared/revisao-espacada.js', 'para-hoje.js', 'assistant-next.js'].forEach((f) => {
    const src = ler(f);
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/, f);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, `${f} não pode falar com a rede`);
    assert.ok(src.startsWith('/*\n * Plataforma de Membros LAIFT'), `${f} sem o cabeçalho de licença`);
  });
  assert.doesNotMatch(ler('assistant-next.js'), /\b(?:o|do|ao|um) Guia\b/);
  assert.ok(ler('assistant.js').split('\n').length < 760);
  assert.match(ler('para-hoje.js'), /Revisar/);
});

test('a revisão é só local: nenhum dos arquivos novos usa a Worker, e o texto público não fala de revisado/IA/rascunho', () => {
  ['modulos/shared/revisao-espacada.js', 'para-hoje.js', 'assistant-next.js'].forEach((f) => {
    const src = ler(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /callLearningApi|LaiftApi|apiLearn|callApi/, f);
    const textos = [...src.matchAll(/'([^'\n]{12,})'/g)].map((m) => m[1]).join('\n');
    assert.doesNotMatch(textos, /rascunho|revisad[oa]s? por|por IA|não revisad/i, f);
  });
});
