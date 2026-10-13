/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cancelar a inscrição em um evento (app.js, renderEventItem): o botão só aparece para quem está inscrito e antes
// do início; pede confirmação (openConfirm, o diálogo acessível do app) e só então chama a API certa; recarrega a
// lista e mostra a mensagem do servidor. As funções moram em app.js (IIFE): a regra pura vem do bloco entre
// marcadores e o fluxo é executado com stubs, como em confirm-dialog.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function between(start, end) {
  const a = APP.indexOf(start);
  const b = APP.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado em app.js: ' + start);
  return APP.slice(a, b);
}

const canCancelRegistration = new Function(`${between('// >>> event-cancel (puro)', '// <<< event-cancel (puro)')}\nreturn canCancelRegistration;`)();
const NOW = Date.parse('2026-10-12T12:00:00Z');
const base = { id: 'e-1', status: 'published', isRegistered: true, eventDate: '2026-10-20T22:00:00Z' };

test('canCancelRegistration: só inscrito, evento publicado e hora no futuro', () => {
  assert.equal(canCancelRegistration(base, NOW), true);
  assert.equal(canCancelRegistration({ ...base, isRegistered: false }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, isRegistered: undefined }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, isRegistered: 'true' }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, status: 'in_progress' }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, eventDate: '2026-10-12T11:59:00Z' }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, eventDate: '2026-10-12T12:00:00Z' }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, eventDate: 'não é data' }, NOW), false);
  assert.equal(canCancelRegistration({ ...base, eventDate: null }, NOW), false);
  assert.equal(canCancelRegistration(null, NOW), false);
  assert.equal(canCancelRegistration(undefined, NOW), false);
});

test('renderEventItem: selo "Inscrição confirmada" + botão "Cancelar inscrição" só para inscrito que pode cancelar', () => {
  const at = APP.indexOf('function renderEventItem(item)');
  const body = APP.slice(at, APP.indexOf('function registerForEvent', at));
  const registered = body.slice(body.indexOf('} else if (item.isRegistered) {'), body.indexOf('} else if (item.spotsLeft === 0) {'));
  assert.match(registered, /\['Inscrição confirmada'\]/);
  assert.match(registered, /if \(canCancelRegistration\(item, Date\.now\(\)\)\)/);
  assert.match(registered, /\['Cancelar inscrição'\]/);
  assert.match(registered, /className: 'secondary'/);
  assert.match(registered, /confirmCancelRegistration\(item\.id\)/);
  // quem não está inscrito continua vendo "Inscrever-se"; o botão de cancelar não existe fora deste ramo
  assert.equal((body.match(/Cancelar inscrição/g) || []).length, 1);
  assert.match(body, /\['Inscrever-se'\]/);
});

/** Executa confirmCancelRegistration com stubs e devolve o que foi chamado, em ordem. */
async function runCancel({ confirmed = true, response = { success: true, message: 'Inscrição cancelada.' } } = {}) {
  const at = APP.indexOf('function confirmCancelRegistration(eventId)');
  const fnSource = APP.slice(at, APP.indexOf('\n  }\n', at) + 4);
  const calls = [];
  const state = { sessionToken: 'tok-membro' };
  const openConfirm = (message, onConfirm) => { calls.push(['confirm', message]); if (confirmed) onConfirm(); };
  const callApi = (name, token, arg) => { calls.push(['api', name, token, arg]); return Promise.resolve(response); };
  const loadEvents = () => { calls.push(['loadEvents']); return Promise.resolve(); };
  const setStatus = (id, message, kind) => calls.push(['status', id, message, kind]);
  new Function('openConfirm', 'callApi', 'loadEvents', 'setStatus', 'state', `${fnSource}\nconfirmCancelRegistration('e-1');`)(openConfirm, callApi, loadEvents, setStatus, state);
  await new Promise((resolve) => setImmediate(resolve));
  return calls;
}

test('confirmar: pergunta primeiro, chama apiCancelEventRegistration com o token e o id, recarrega e mostra a mensagem', async () => {
  const calls = await runCancel();
  assert.deepEqual(calls, [
    ['confirm', 'Cancelar sua inscrição neste evento?'],
    ['api', 'apiCancelEventRegistration', 'tok-membro', 'e-1'],
    ['loadEvents'],
    ['status', 'events-status', 'Inscrição cancelada.', 'success'],
  ]);
});

test('não confirmar: nenhuma chamada à API', async () => {
  assert.deepEqual(await runCancel({ confirmed: false }), [['confirm', 'Cancelar sua inscrição neste evento?']]);
});

test('o servidor recusa (já começou, presença registrada): a mensagem dele aparece como erro', async () => {
  const calls = await runCancel({ response: { success: false, message: 'O evento já começou ou terminou.' } });
  assert.deepEqual(calls[calls.length - 1], ['status', 'events-status', 'O evento já começou ou terminou.', 'error']);
});

test('a action existe no Worker e nada vem de innerHTML', () => {
  assert.match(fs.readFileSync(path.join(frontend, '..', 'worker', 'src', 'handlers.js'), 'utf8'), /apiCancelEventRegistration:/);
  const at = APP.indexOf('function confirmCancelRegistration');
  assert.doesNotMatch(APP.slice(at, at + 600), /innerHTML/);
});
