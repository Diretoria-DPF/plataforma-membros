/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// LaiftReviewSeal (modulos/shared/laift-review-seal.js, CON-01): selo ⓘ "ainda não revisada por profissional" em
// questões/fichas sem revisor, com explicação ao tocar e "Reportar erro" pelo feedback existente (apiSubmitFeedback).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-review-seal.js'), 'utf8');
const CSS = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-review-seal.css'), 'utf8');

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

test('create: revisada ou sem dado -> nenhum selo', () => {
  assert.equal(Seal.create({ reviewed_by: 'Dra. Ana' }, { kind: 'questão' }, { whenMissing: 'unreviewed' }), null);
  assert.equal(Seal.create({ id: 3 }, { kind: 'ficha' }), null);
});

test('create: botão ⓘ acessível, discreto, com rótulo e alvo para o diálogo', () => {
  const btn = Seal.create({ id: 3 }, { kind: 'questão' }, { whenMissing: 'unreviewed' });
  assert.equal(btn.tag, 'button');
  assert.equal(btn.type, 'button');
  assert.equal(btn.className, 'laift-review-seal');
  assert.equal(btn.textContent, 'ⓘ');
  assert.match(btn.attrs['aria-label'], /ainda não revisada por profissional/i);
  assert.equal(btn.attrs['aria-haspopup'], 'dialog');
});

test('toque abre a explicação com "Reportar erro"; Fechar não envia nada', async () => {
  const btn = Seal.create({ id: 3 }, { kind: 'questão', module: 'Quiz' }, { whenMissing: 'unreviewed' });
  confirmAnswer = false;
  await btn.click();
  assert.equal(calls.confirm.length, 1);
  assert.match(calls.confirm[0][0], /ainda não foi revisada por um profissional/i);
  assert.equal(calls.confirm[0][1].okLabel, 'Reportar erro');
  assert.equal(calls.confirm[0][1].cancelLabel, 'Fechar');
  assert.equal(calls.report.length, 0);
});

test('Reportar erro envia pelo feedback existente, com módulo/id/tópico, e agradece', async () => {
  const btn = Seal.create({ id: 42, topic: 'Farmacodinâmica', question: 'Qual é o antídoto?' }, { kind: 'questão', module: 'Quiz de Farmacologia', id: 42, topic: 'Farmacodinâmica', excerpt: 'Qual é o antídoto?' }, { whenMissing: 'unreviewed' });
  confirmAnswer = true;
  await btn.click();
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

test('buildReportMessage: corta trecho longo, remove quebras/controles e nunca passa de 600 caracteres', () => {
  const msg = Seal.buildReportMessage({ kind: 'ficha', module: 'Atlas', id: 'za:kidney-l', excerpt: `${'x'.repeat(900)}\n\u0007fim` });
  assert.ok(msg.length <= 600);
  assert.doesNotMatch(msg, /[\n\u0007]/);
});

test('falha do envio: mostra a mensagem do servidor, ou uma padrão', async () => {
  const btn = Seal.create({ id: 1 }, { kind: 'questão' }, { whenMissing: 'unreviewed' });
  confirmAnswer = true;
  apiReply = { success: false, message: 'Muitas tentativas. Aguarde.' };
  await btn.click();
  assert.deepEqual(calls.alert, ['Muitas tentativas. Aguarde.']);
  apiReply = null;
  await btn.click();
  assert.match(calls.alert[1], /não foi possível enviar/i);
});

test('sem a ponte (LaiftApi.reportContent), avisa sem quebrar', async () => {
  load({ withApi: false });
  const btn = Seal.create({ id: 1 }, { kind: 'questão' }, { whenMissing: 'unreviewed' });
  confirmAnswer = true;
  await btn.click();
  assert.equal(calls.report.length, 0);
  assert.match(calls.alert[0], /não foi possível enviar/i);
});

test('sem LaiftDialog, o selo não é criado (não há como explicar/reportar)', () => {
  load({ withDialog: false });
  assert.equal(Seal.create({ id: 1 }, { kind: 'questão' }, { whenMissing: 'unreviewed' }), null);
});

test('CSS: alvo >= 44px, glifo discreto (cor atenuada), foco visível; JS sem innerHTML/inline', () => {
  assert.match(CSS, /\.laift-review-seal \{[^}]*min-height: 44px/);
  assert.match(CSS, /\.laift-review-seal \{[^}]*min-width: 44px/);
  assert.match(CSS, /:focus-visible/);
  assert.doesNotMatch(SRC, /\.innerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
});

test('regra do dono: quiz, toxicologia e Atlas não carregam o selo de revisão (vista pública)', () => {
  for (const page of ['modulos/quiz/index.html', 'modulos/toxicologia/index.html', 'modulos/anatomia-3d/index.html']) {
    const html = fs.readFileSync(path.join(frontend, page), 'utf8');
    assert.doesNotMatch(html, /laift-review-seal/, page + ' ainda carrega o selo');
  }
  const card = fs.readFileSync(path.join(frontend, 'modulos/anatomia-3d/js/ui/infocard.js'), 'utf8');
  assert.doesNotMatch(card, /LaiftReviewSeal/);
});

test('ponte: laift-identity expõe reportContent e o app expõe submitContentReport sobre apiSubmitFeedback', () => {
  const ident = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-identity.js'), 'utf8');
  assert.match(ident, /reportContent/);
  assert.match(ident, /submitContentReport/);
  const app = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');
  assert.match(app, /submitContentReport:/);
  assert.match(app, /apiSubmitFeedback/);
});
