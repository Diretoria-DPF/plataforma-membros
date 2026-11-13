/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// LaiftReviewSeal (modulos/shared/laift-review-seal.js, CON-01): sem selo nem texto público de revisão; fica o
// "Reportar erro" pelo feedback existente (apiSubmitFeedback) e o estado interno de revisão (reviewState).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-review-seal.js'), 'utf8');

function makeNode(tag) {
  const node = {
    tag, className: '', type: '', textContent: '', children: [], attrs: {}, listeners: {},
    setAttribute(n, v) { node.attrs[n] = String(v); },
    getAttribute(n) { return node.attrs[n]; },
    appendChild(c) { node.children.push(c); return c; },
    addEventListener(t, fn) { (node.listeners[t] ||= []).push(fn); },
    click() { return Promise.all((node.listeners.click || []).map((fn) => fn({ target: node }))); },
  };
  return node;
}

let Seal;
let calls;
let confirmAnswer;
let apiReply;

function load({ withDialog = true, withApi = true } = {}) {
  calls = { confirm: [], alert: [], report: [] };
  const sandbox = { document: { createElement: makeNode } };
  sandbox.window = sandbox;
  if (withDialog) {
    sandbox.LaiftDialog = {
      confirm: async (msg, opts) => { calls.confirm.push([msg, opts]); return confirmAnswer; },
      alert: async (msg) => { calls.alert.push(msg); },
    };
  }
  if (withApi) {
    sandbox.LaiftApi = { reportContent: async (text) => { calls.report.push(text); return apiReply; } };
  }
  vm.runInNewContext(SRC, sandbox);
  Seal = sandbox.LaiftReviewSeal;
}

beforeEach(() => {
  confirmAnswer = false;
  apiReply = { success: true, message: 'Obrigado! Seu feedback foi enviado.' };
  load();
});

test('reviewState: revisor, status revisado ou aprovado -> reviewed', () => {
  assert.equal(Seal.reviewState({ reviewed_by: 'Dra. Ana' }), 'reviewed');
  assert.equal(Seal.reviewState({ reviewedBy: 'Dr. Bruno' }), 'reviewed');
  assert.equal(Seal.reviewState({ review: { by: 'Conselho' } }), 'reviewed');
  assert.equal(Seal.reviewState({ review: { status: 'reviewed' } }), 'reviewed');
  assert.equal(Seal.reviewState({ review: { status: 'approved' } }), 'reviewed');
});

test('reviewState: status de rascunho/legado/editorial -> unreviewed', () => {
  for (const status of ['auto-draft', 'legacy-unverified', 'editorial']) {
    assert.equal(Seal.reviewState({ review: { status } }), 'unreviewed', status);
  }
});

test('reviewState: sem dado de revisão é "unknown" por padrão e "unreviewed" quando o chamador assume (banco de questões)', () => {
  assert.equal(Seal.reviewState({ id: 1, question: 'q' }), 'unknown');
  assert.equal(Seal.reviewState({ id: 1, source: 'Goodman' }, { whenMissing: 'unreviewed' }), 'unreviewed');
  assert.equal(Seal.reviewState(null), 'unknown');
  assert.equal(Seal.reviewState({ reviewed_by: 'Dra. Ana' }, { whenMissing: 'unreviewed' }), 'reviewed');
});

test('sem selo nem texto público de revisão: a API não tem create e o código não traz o texto', () => {
  assert.equal(Seal.create, undefined);
  assert.doesNotMatch(SRC, /ainda não revisada|ainda não foi revisada|ⓘ|rascunho|IA/i);
});

test('report: confirma sem texto de revisão, envia pelo feedback existente com módulo/id/tópico, e agradece', async () => {
  const ctx = { kind: 'questão', module: 'Quiz de Farmacologia', id: 42, topic: 'Farmacodinâmica', excerpt: 'Qual é o antídoto?' };
  confirmAnswer = true;
  await Seal.report(ctx);
  assert.equal(calls.confirm.length, 1);
  assert.doesNotMatch(calls.confirm[0][0] + ' ' + calls.confirm[0][1].title, /revisad|rascunho|IA/i);
  assert.equal(calls.confirm[0][1].title, 'Reportar erro');
  assert.equal(calls.report.length, 1);
  const msg = calls.report[0];
  assert.match(msg, /^\[Erro de conteúdo\]/);
  assert.match(msg, /questão/);
  assert.match(msg, /Quiz de Farmacologia/);
  assert.match(msg, /42/);
  assert.match(msg, /Farmacodinâmica/);
  assert.match(msg, /Qual é o antídoto\?/);
  assert.ok(msg.length >= 3 && msg.length <= 600);
  assert.deepEqual(calls.alert, ['Obrigado! Seu feedback foi enviado.']);
});

test('report: cancelar não envia nada', async () => {
  confirmAnswer = false;
  await Seal.report({ kind: 'questão', module: 'Quiz' });
  assert.equal(calls.report.length, 0);
});

test('buildReportMessage: corta trecho longo, remove quebras/controles e nunca passa de 600 caracteres', () => {
  const msg = Seal.buildReportMessage({ kind: 'ficha', module: 'Atlas', id: 'za:kidney-l', excerpt: `${'x'.repeat(900)}\n\u0007fim` });
  assert.ok(msg.length <= 600);
  assert.doesNotMatch(msg, /[\n\u0007]/);
});

test('falha do envio: mostra a mensagem do servidor, ou uma padrão', async () => {
  confirmAnswer = true;
  apiReply = { success: false, message: 'Muitas tentativas. Aguarde.' };
  await Seal.report({ kind: 'questão' });
  assert.deepEqual(calls.alert, ['Muitas tentativas. Aguarde.']);
  apiReply = null;
  await Seal.report({ kind: 'questão' });
  assert.match(calls.alert[1], /não foi possível enviar/i);
});

test('sem a ponte (LaiftApi.reportContent), avisa sem quebrar', async () => {
  load({ withApi: false });
  confirmAnswer = true;
  await Seal.report({ kind: 'questão' });
  assert.equal(calls.report.length, 0);
  assert.match(calls.alert[0], /não foi possível enviar/i);
});

test('sem LaiftDialog, report não quebra e não envia', async () => {
  load({ withDialog: false });
  await Seal.report({ kind: 'questão' });
  assert.equal(calls.report.length, 0);
});

test('integração: quiz e toxicologia carregam o script (sem folha de selo); motores usam só o report', () => {
  const need = [
    ['modulos/quiz/index.html', 'quiz-engine'],
    ['modulos/toxicologia/index.html', 'quiz-engine'],
  ];
  for (const [page, before] of need) {
    const html = fs.readFileSync(path.join(frontend, page), 'utf8');
    assert.doesNotMatch(html, /laift-review-seal\.css/, `${page} ainda carrega a folha do selo`);
    assert.match(html, /<script src="\.\.\/shared\/laift-review-seal\.js"><\/script>/, `${page} sem o script`);
    assert.ok(html.indexOf('laift-dialog.js') < html.indexOf('laift-review-seal.js'), `${page}: dialog antes do script`);
    if (before) assert.ok(html.indexOf('laift-review-seal.js') < html.search(new RegExp(`<script src="[^"]*${before}\\.js`)), `${page}: script antes do motor`);
  }
  const engine = fs.readFileSync(path.join(frontend, 'modulos/shared/quiz-engine.js'), 'utf8');
  // Regra do dono: o público não vê selo nem aviso de revisão nos quizzes; sobra só "Reportar erro".
  assert.doesNotMatch(engine, /LaiftReviewSeal\.create|whenMissing|laift-review-seal-row/);
  assert.match(engine, /LaiftReviewSeal\.report/);
  assert.match(engine, /text: 'Reportar erro'/);
  assert.doesNotMatch(engine, /revisad|rascunho|por IA/i);
  assert.doesNotMatch(SRC.slice(SRC.indexOf('function report'), SRC.indexOf('function create')), /revisad|\bIA\b|rascunho/);
  const card = fs.readFileSync(path.join(frontend, 'modulos/anatomia-3d/js/ui/infocard.js'), 'utf8');
  // Atlas: sem selo de revisão na ficha (regra do dono).
  assert.doesNotMatch(card, /LaiftReviewSeal/);
  assert.doesNotMatch(fs.readFileSync(path.join(frontend, 'modulos/anatomia-3d/index.html'), 'utf8'), /laift-review-seal/);
});

test('ponte: laift-identity expõe reportContent e o app expõe submitContentReport sobre apiSubmitFeedback', () => {
  const ident = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-identity.js'), 'utf8');
  assert.match(ident, /reportContent/);
  assert.match(ident, /submitContentReport/);
  const app = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');
  assert.match(app, /submitContentReport:/);
  assert.match(app, /apiSubmitFeedback/);
});
