/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cargos funcionais e capacidades em state.profile (app.js, ADR 0010): chegam em apiGetMyProfile, ficam só como
// listas de texto validadas e não liberam nada na interface; getIdentity() continua sem o token de sessão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function helpers() {
  const start = APP.indexOf('// >>> role-info (puro)');
  const end = APP.indexOf('// <<< role-info (puro)');
  assert.ok(start >= 0 && end > start, 'bloco "role-info (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn { withRoleInfo };`)();
}

test('withRoleInfo: copia cargos e capacidades válidos sem mexer no perfil original', () => {
  const { withRoleInfo } = helpers();
  const profile = Object.freeze({ id: 'x', role: 'member' });
  const out = withRoleInfo(profile, { functionalRoles: ['gestor'], capabilities: ['events.manage', 'tasks.manage'] });
  assert.deepEqual(out, { id: 'x', role: 'member', functionalRoles: ['gestor'], capabilities: ['events.manage', 'tasks.manage'], roleMfaPending: false });
  assert.notEqual(out, profile);
});

test('withRoleInfo: resposta sem os campos (servidor antigo) ou com lixo vira listas vazias ou filtradas', () => {
  const { withRoleInfo } = helpers();
  assert.deepEqual(withRoleInfo({}, {}), { functionalRoles: [], capabilities: [], roleMfaPending: false });
  assert.deepEqual(withRoleInfo({}, null), { functionalRoles: [], capabilities: [], roleMfaPending: false });
  const dirty = withRoleInfo({}, { functionalRoles: 'gestor', capabilities: ['ok.cap', 7, '<script>', 'Upper', null] });
  assert.deepEqual(dirty, { functionalRoles: [], capabilities: ['ok.cap'], roleMfaPending: false });
  assert.equal(withRoleInfo({}, { roleMfaPending: 'sim' }).roleMfaPending, false);
  assert.equal(withRoleInfo({}, { roleMfaPending: true }).roleMfaPending, true);
});

test('os dois caminhos de apiGetMyProfile guardam cargos e capacidades', () => {
  const hits = APP.match(/state\.profile = withRoleInfo\(state\.profile, res\.profile\);/g) || [];
  assert.equal(hits.length, 2);
});

test('app.js não decide por capacidade sozinho: delega a roles-ui.js (data-cap)', () => {
  assert.doesNotMatch(APP, /\.capabilities\.(indexOf|includes)\(|\.functionalRoles\.(indexOf|includes)\(/);
  assert.match(APP, /window\.LaiftRoles\.apply\(document, state\.profile\)/);
});

test('getIdentity continua sem o token de sessão', () => {
  const start = APP.indexOf('getIdentity: function ()');
  const body = APP.slice(start, APP.indexOf('},', start));
  assert.ok(start >= 0);
  assert.doesNotMatch(body, /sessionToken:|token:/);
});
