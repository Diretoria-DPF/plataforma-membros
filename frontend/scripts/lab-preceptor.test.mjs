/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Preceptor do laboratório (frontend/modulos/laboratorio/js/lab-preceptor.js): quando a Worker
// responde com degraded (IA indisponível, resposta aproximada do cache), o chat mostra um aviso
// com role="status" montado por textContent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const ENGINE_SRC = read('frontend/modulos/laboratorio/js/lab-preceptor.js');
const CHAT_SRC = read('frontend/modulos/laboratorio/js/script.js');
const AVISO = 'Resposta aproximada: a IA está indisponível agora.';

/**
 * Carrega o motor num contexto isolado (window === contexto). window.LaiftApi.call responde
 * com a resposta atual; setReply troca a resposta do mesmo contexto.
 */
function loadEngine(initialReply) {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  sandbox.window = sandbox;
  let reply = initialReply;
  sandbox.LaiftApi = { call: async () => reply };
  vm.createContext(sandbox);
  vm.runInContext(ENGINE_SRC, sandbox, { filename: 'lab-preceptor.js' });
  return { engine: sandbox.LabPreceptorEngine, setReply: (next) => { reply = next; } };
}

const PERGUNTA_LIVRE = 'explique a lei de Henry';

test('consultarPreceptorRemoto repassa degraded=true quando a Worker marca a resposta como aproximada', async () => {
  const { engine } = loadEngine({ success: true, answer: 'Resposta do acervo', cached: true, degraded: true });
  const result = await engine.consultarPreceptorRemoto(PERGUNTA_LIVRE, {}, () => 7, false, '');
  assert.equal(result.degraded, true);
  assert.equal(result.cached, true);
});

test('sem degraded na resposta, consultarPreceptorRemoto devolve degraded=false', async () => {
  const { engine } = loadEngine({ success: true, answer: 'Resposta nova', cached: false });
  const result = await engine.consultarPreceptorRemoto(PERGUNTA_LIVRE, {}, () => 7, false, '');
  assert.equal(result.degraded, false);
});

test('processarMensagem deixa ultimaRespostaDegradada=true para o chat exibir o aviso', async () => {
  const { engine } = loadEngine({ success: true, answer: 'Resposta do acervo', cached: true, degraded: true });
  const texto = await engine.processarMensagem(PERGUNTA_LIVRE, {}, () => 7, false);
  assert.equal(engine.ultimaRespostaDegradada, true);
  assert.match(texto, /Resposta do acervo/);
});

test('a flag é zerada a cada pergunta: resposta normal depois de uma degradada não mostra aviso', async () => {
  const { engine, setReply } = loadEngine({ success: true, answer: 'Primeira', cached: true, degraded: true });
  await engine.processarMensagem(PERGUNTA_LIVRE, {}, () => 7, false);
  assert.equal(engine.ultimaRespostaDegradada, true);
  setReply({ success: true, answer: 'Segunda', cached: false });
  await engine.processarMensagem(PERGUNTA_LIVRE, {}, () => 7, false);
  assert.equal(engine.ultimaRespostaDegradada, false);
});

test('o texto do aviso é exatamente o combinado e está exposto no motor', () => {
  const { engine } = loadEngine({ success: true, answer: 'x' });
  assert.equal(engine.AVISO_DEGRADADO, AVISO);
});

test('script.js monta o aviso como nó com role="status" e textContent, dentro da bolha do preceptor', () => {
  const start = CHAT_SRC.indexOf('window.enviarDuvidaLab = async function');
  const end = CHAT_SRC.indexOf('let alertaPressaoEmitido', start);
  const block = CHAT_SRC.slice(start, end);
  assert.match(block, /LabPreceptorEngine\.ultimaRespostaDegradada === true/);
  assert.match(block, /h\('div', \{ className: 'lab-chat-aviso', role: 'status', text: LabPreceptorEngine\.AVISO_DEGRADADO \}\)/);
  assert.doesNotMatch(block, /innerHTML/);
});
