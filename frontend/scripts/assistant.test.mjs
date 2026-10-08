/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia (frontend/assistant.js): lista branca de destinos, histórico enviado,
// condição de exibição e fiação da página. O DOM é coberto pelo e2e assistant.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Lia = require('../assistant.js');

test('a lista de destinos do front é IGUAL à do Worker (assistant/targets.js)', async () => {
  const workerTargets = await import(pathToFileURL(path.join(root, 'worker', 'src', 'assistant', 'targets.js')).href);
  assert.deepEqual(Lia.ACTION_KEYS, workerTargets.ACTION_KEYS);
});

test('isAllowedAction: só tipo+destino da lista, nunca URL, script ou chave de protótipo', () => {
  assert.equal(Lia.isAllowedAction({ type: 'navigate', target: 'panel-events' }), true);
  assert.equal(Lia.isAllowedAction({ type: 'open_module', target: 'lab' }), true);
  assert.equal(Lia.isAllowedAction({ type: 'open_credential', target: 'credential' }), true);
  for (const bad of [
    { type: 'navigate', target: 'javascript:alert(1)' },
    { type: 'navigate', target: 'https://evil.example' },
    { type: 'navigate', target: 'panel-nao-existe' },
    { type: 'open_module', target: '__proto__' },
    { type: 'open_module', target: 'constructor' },
    { type: 'run_script', target: 'panel-events' },
    { type: 'navigate' },
    { target: 'panel-events' },
    null, undefined, 'navigate:panel-events', 42, [],
    { type: 'navigate', target: { toString: () => 'panel-events' } },
  ]) assert.equal(Lia.isAllowedAction(bad), false, JSON.stringify(bad));
});

test('sanitizeActions: descarta o inválido, repetidos e limita a 4; rótulo vira texto curto', () => {
  const out = Lia.sanitizeActions([
    { type: 'navigate', target: 'panel-events', label: 'Eventos' },
    { type: 'navigate', target: 'panel-events', label: 'Eventos de novo' },
    { type: 'navigate', target: 'https://evil.example', label: 'Clique' },
    { type: 'open_module', target: 'lab', label: 'x'.repeat(200) },
    { type: 'open_module', target: 'anatomia', label: 'Atlas 3D' },
    { type: 'open_module', target: 'farmaco', label: 'Farmacologia' },
    { type: 'open_module', target: 'toxico', label: 'Toxicologia' },
  ]);
  assert.equal(out.length, 4);
  assert.equal(out[0].label, 'Eventos');
  assert.ok(out[1].label.length <= 40);
  assert.deepEqual(Lia.sanitizeActions(null), []);
  assert.deepEqual(Lia.sanitizeActions('panel-events'), []);
});

test('pickHistory: só as últimas 5 perguntas da PESSOA, nunca as respostas da Lia', () => {
  const messages = [];
  for (let i = 1; i <= 8; i += 1) {
    messages.push({ role: 'user', text: 'pergunta ' + i });
    messages.push({ role: 'lia', text: 'resposta ' + i });
  }
  const history = Lia.pickHistory(messages);
  assert.equal(history.length, 5);
  assert.deepEqual(history[0], { role: 'user', text: 'pergunta 4' });
  assert.deepEqual(history[4], { role: 'user', text: 'pergunta 8' });
  assert.ok(history.every((h) => h.role === 'user'));
  assert.deepEqual(Lia.pickHistory([]), []);
});

test('shouldShow: só com a flag chatbot_enabled exatamente verdadeira', () => {
  assert.equal(Lia.shouldShow({ chatbot_enabled: true }), true);
  assert.equal(Lia.shouldShow({ chatbot_enabled: false }), false);
  assert.equal(Lia.shouldShow({ chatbot_enabled: 'true' }), false);
  assert.equal(Lia.shouldShow({}), false);
  assert.equal(Lia.shouldShow(null), false);
  assert.equal(Lia.shouldShow(undefined), false);
});

test('clip: corta no limite e ignora o que não é texto', () => {
  assert.equal(Lia.clip('abcdef', 3), 'abc');
  assert.equal(Lia.clip(null, 3), '');
  assert.equal(Lia.clip({}, 3), '');
});

test('assistant.js nunca converte texto em HTML e não guarda a conversa no navegador', () => {
  const src = read('frontend/assistant.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
});

test('o front não abre URL nem navega por endereço vindo da resposta', () => {
  const src = read('frontend/assistant.js');
  assert.doesNotMatch(src, /window\.open|location\.href|location\.assign|\.setAttribute\('href'/);
});

test('assistant.js está no index.html, na lista do build e no precache do service worker', () => {
  assert.match(read('frontend/index.html'), /<script src="assistant\.js" defer><\/script>/);
  assert.match(read('frontend/scripts/build.js'), /'assistant\.js'/);
  assert.match(read('frontend/sw.js'), /'assistant\.js'/);
});

test('sanitizeSources: no máximo 4 fontes, só texto curto, sem vazias', () => {
  const out = Lia.sanitizeSources([
    { source: 'Manual do aluno', section: '2.1 Crachá' },
    { source: '   ', section: 'vazia' },
    null,
    { section: 'sem fonte' },
    { source: 'a'.repeat(200), section: 's'.repeat(300) },
    { source: 'b' }, { source: 'c' }, { source: 'd' },
  ]);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { source: 'Manual do aluno', section: '2.1 Crachá' });
  assert.ok(out[1].source.length <= 80 && out[1].section.length <= 120);
  out.forEach((s) => {
    assert.equal(typeof s.source, 'string');
    assert.equal(typeof s.section, 'string');
  });
  assert.deepEqual(Lia.sanitizeSources(null), []);
  assert.deepEqual(Lia.sanitizeSources('Manual'), []);
});

test('fontes e avisos da Lia são texto: nenhum vira link, e o card de feedback é opcional', () => {
  const src = read('frontend/assistant.js');
  assert.doesNotMatch(src, /el\(doc, 'a'/);
  assert.doesNotMatch(src, /\.href\s*=/);
  // sem o módulo carregado, a Lia segue funcionando (sem card)
  assert.match(src, /root\.LaiftAssistantFeedback \|\| null/);
});

test('o app avisa a Lia ao entrar e ao sair da conta', () => {
  const app = read('frontend/app.js');
  assert.match(app, /LaiftAssistant/);
  assert.match(app, /LaiftAssistant\.refresh\(\)/);
  // entrar, sair e sessão expirada: nos três caminhos a conversa da conta anterior precisa sumir
  assert.ok((app.match(/LaiftAssistant\.refresh\(\)/g) || []).length >= 3, 'faltam chamadas de refresh em app.js');
});
