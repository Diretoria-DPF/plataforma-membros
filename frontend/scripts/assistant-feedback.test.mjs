/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Micro-card "Isso te ajudou?" da Lia (frontend/assistant-feedback.js): validação do
// comentário, montagem do payload, máquina de estados (pura) e fiação de segurança.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const FB = require('../assistant-feedback.js');

const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

/** Atalho: estado inicial já com a resposta da Lia pronta para avaliar. */
const ready = () => FB.initialState({ enabled: true, messageId: UUID });

test('categorias e avaliações são exatamente as aceitas pelo Worker (constants.js FEEDBACK)', () => {
  assert.deepEqual(FB.CATEGORIES.map((c) => c.id), ['incorreta', 'incompleta', 'confusa', 'ofensiva', 'outra']);
  assert.deepEqual(FB.RATINGS, ['up', 'down']);
  assert.equal(FB.COMMENT_MAX, 500);
  FB.CATEGORIES.forEach((c) => assert.ok(c.label && c.label.length <= 40, 'rótulo curto: ' + c.id));
});

test('sanitizeMessageId: só UUID v4-like; qualquer outra coisa vira null', () => {
  assert.equal(FB.sanitizeMessageId(UUID), UUID);
  assert.equal(FB.sanitizeMessageId(UUID.toUpperCase()), UUID.toUpperCase());
  for (const bad of ['', 'abc', UUID + 'x', 'javascript:alert(1)', 12, null, undefined, {}, [UUID]]) {
    assert.equal(FB.sanitizeMessageId(bad), null, JSON.stringify(bad));
  }
});

test('feedbackEnabled: só com feedback_enabled exatamente verdadeiro', () => {
  assert.equal(FB.feedbackEnabled({ feedback_enabled: true }), true);
  assert.equal(FB.feedbackEnabled({ feedback_enabled: 'true' }), false);
  assert.equal(FB.feedbackEnabled({ feedback_enabled: 1 }), false);
  assert.equal(FB.feedbackEnabled({}), false);
  assert.equal(FB.feedbackEnabled(null), false);
});

test('commentLength conta pontos de código (como o servidor), não unidades UTF-16', () => {
  assert.equal(FB.commentLength('abc'), 3);
  assert.equal(FB.commentLength('😀😀'), 2);
  assert.equal(FB.commentLength(undefined), 0);
});

test('validateComment: vazio é válido, corta espaços, recusa acima de 500 pontos de código', () => {
  assert.deepEqual(FB.validateComment(''), { ok: true, value: '' });
  assert.deepEqual(FB.validateComment('   '), { ok: true, value: '' });
  assert.deepEqual(FB.validateComment('  útil  '), { ok: true, value: 'útil' });
  assert.equal(FB.validateComment('a'.repeat(500)).ok, true);
  assert.equal(FB.validateComment('😀'.repeat(500)).ok, true);
  const tooLong = FB.validateComment('a'.repeat(501));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /500/);
  assert.equal(FB.validateComment(42).ok, true, 'não-texto vira vazio');
  assert.equal(FB.validateComment(42).value, '');
});

test('commentCounter mostra "usados/500" para o contador visível', () => {
  assert.equal(FB.commentCounter(0), '0/500');
  assert.equal(FB.commentCounter(120), '120/500');
});

test('buildPayload: 👍 manda só messageId e rating; 👎 aceita categoria e comentário', () => {
  assert.deepEqual(FB.buildPayload({ messageId: UUID, rating: 'up' }), { ok: true, payload: { messageId: UUID, rating: 'up' } });
  assert.deepEqual(
    FB.buildPayload({ messageId: UUID, rating: 'down', category: 'incorreta', comment: ' errado ' }),
    { ok: true, payload: { messageId: UUID, rating: 'down', category: 'incorreta', comment: 'errado' } },
  );
  // comentário vazio não vai ao servidor
  assert.deepEqual(FB.buildPayload({ messageId: UUID, rating: 'down', category: '', comment: '  ' }), { ok: true, payload: { messageId: UUID, rating: 'down' } });
});

test('buildPayload recusa entrada inválida antes de sair do navegador', () => {
  assert.equal(FB.buildPayload({ messageId: 'nao-e-uuid', rating: 'up' }).ok, false);
  assert.equal(FB.buildPayload({ messageId: UUID, rating: 'meh' }).ok, false);
  assert.equal(FB.buildPayload({ messageId: UUID, rating: 'down', category: 'ofensivo-demais' }).ok, false);
  const long = FB.buildPayload({ messageId: UUID, rating: 'down', comment: 'x'.repeat(501) });
  assert.equal(long.ok, false);
  assert.match(long.error, /500/);
});

test('initialState: escondido sem flag ligada ou sem messageId; "ask" quando pode avaliar', () => {
  assert.equal(FB.initialState({ enabled: false, messageId: UUID }).phase, 'hidden');
  assert.equal(FB.initialState({ enabled: true, messageId: null }).phase, 'hidden');
  assert.equal(FB.initialState({ enabled: true, messageId: 'x' }).phase, 'hidden');
  assert.equal(ready().phase, 'ask');
});

test('fluxo 👍: envia direto, agradece e some ao expirar', () => {
  const sending = FB.reduce(ready(), { type: 'rate', rating: 'up' });
  assert.equal(sending.phase, 'sending');
  assert.deepEqual(sending.payload, { messageId: UUID, rating: 'up' });
  const thanks = FB.reduce(sending, { type: 'sent' });
  assert.equal(thanks.phase, 'thanks');
  assert.equal(FB.reduce(thanks, { type: 'expire' }).phase, 'hidden');
});

test('fluxo 👎: abre o campo, valida e envia com categoria e comentário', () => {
  const detail = FB.reduce(ready(), { type: 'rate', rating: 'down' });
  assert.equal(detail.phase, 'detail');
  const filled = FB.reduce(FB.reduce(detail, { type: 'set', field: 'category', value: 'confusa' }), { type: 'set', field: 'comment', value: 'não entendi' });
  const sending = FB.reduce(filled, { type: 'submit' });
  assert.equal(sending.phase, 'sending');
  assert.deepEqual(sending.payload, { messageId: UUID, rating: 'down', category: 'confusa', comment: 'não entendi' });
});

test('submit com comentário grande demais fica no campo com mensagem de erro', () => {
  const state = FB.reduce(FB.reduce(FB.reduce(ready(), { type: 'rate', rating: 'down' }), { type: 'set', field: 'comment', value: 'z'.repeat(501) }), { type: 'submit' });
  assert.equal(state.phase, 'detail');
  assert.match(state.error, /500/);
});

test('enquanto envia, novos cliques são ignorados (sem envio duplo)', () => {
  const sending = FB.reduce(ready(), { type: 'rate', rating: 'up' });
  assert.equal(FB.reduce(sending, { type: 'rate', rating: 'down' }), sending);
  assert.equal(FB.reduce(sending, { type: 'submit' }), sending);
});

test('falha mantém o envio: "Tentar de novo" reenvia o mesmo payload', () => {
  const failed = FB.reduce(FB.reduce(ready(), { type: 'rate', rating: 'up' }), { type: 'failed', error: 'Sem conexão.' });
  assert.equal(failed.phase, 'error');
  assert.equal(failed.error, 'Sem conexão.');
  const retry = FB.reduce(failed, { type: 'retry' });
  assert.equal(retry.phase, 'sending');
  assert.deepEqual(retry.payload, { messageId: UUID, rating: 'up' });
});

test('falha sem mensagem do servidor usa o texto padrão em PT-BR', () => {
  const failed = FB.reduce(FB.reduce(ready(), { type: 'rate', rating: 'up' }), { type: 'failed' });
  assert.equal(failed.error, FB.DEFAULT_ERROR);
  assert.match(FB.DEFAULT_ERROR, /Tente de novo/);
});

test('"disabled" do servidor esconde o card a qualquer momento', () => {
  const sending = FB.reduce(ready(), { type: 'rate', rating: 'up' });
  assert.equal(FB.reduce(sending, { type: 'off' }).phase, 'hidden');
  assert.equal(FB.reduce(ready(), { type: 'off' }).phase, 'hidden');
});

test('cancelar o campo volta a perguntar e limpa o erro', () => {
  const withError = FB.reduce(FB.reduce(FB.reduce(ready(), { type: 'rate', rating: 'down' }), { type: 'set', field: 'comment', value: 'z'.repeat(501) }), { type: 'submit' });
  assert.ok(withError.error, 'precondição: o envio com erro de validação deixa a mensagem');
  const back = FB.reduce(withError, { type: 'cancel' });
  assert.equal(back.phase, 'ask');
  assert.equal(back.error, '');
});

test('reduce é imutável: o estado anterior não muda', () => {
  const before = Object.freeze(ready());
  const after = FB.reduce(before, { type: 'rate', rating: 'down' });
  assert.equal(before.phase, 'ask');
  assert.equal(after.phase, 'detail');
  assert.notEqual(before, after);
});

test('evento desconhecido não altera o estado', () => {
  const state = ready();
  assert.equal(FB.reduce(state, { type: 'coisa-nova' }), state);
});

test('assistant-feedback.js não converte texto em HTML, não guarda nada e não navega', () => {
  const src = read('frontend/assistant-feedback.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(src, /window\.open|location\.href|location\.assign/);
});

test('o CSS do card usa só tokens (sem cor fixa) e respeita prefers-reduced-motion', () => {
  const css = read('frontend/assistant-feedback.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'cor hexadecimal fixa');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
});

test('admin-ai.js: painel "Satisfação da Lia" usa só as ações do servidor e nunca innerHTML', () => {
  const src = read('frontend/admin-ai.js');
  for (const action of ['apiAdminAssistantStats', 'apiAdminListAssistantFeedback', 'apiAdminUpdateAssistantFeedback']) {
    assert.match(src, new RegExp(action), 'falta a ação ' + action);
  }
  // o cabeçalho cita "innerHTML" em texto; o que importa é o uso no código
  assert.doesNotMatch(src, /\.innerHTML\s*\+?=|insertAdjacentHTML\(|document\.write\(|\beval\(/);
});
