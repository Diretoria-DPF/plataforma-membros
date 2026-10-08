/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// id do PRÓPRIO perfil em state.profile (app.js): vem de apiLogin, apiLoginMfa e apiGetMyProfile, só vale se for UUID
// em texto e nenhum caminho o apaga (login, login com MFA, restauração da sessão, carga do perfil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');
const APP = read('app.js');

const BLOCK_START = '// >>> profile-id (puro)';
const BLOCK_END = '// <<< profile-id (puro)';
function helpers() {
  const start = APP.indexOf(BLOCK_START);
  const end = APP.indexOf(BLOCK_END);
  assert.ok(start >= 0 && end > start, 'bloco "profile-id (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn { profileIdOf, profileFromResponse, mergeProfileId };`)();
}

const ID = '3f2b8c1a-9d4e-4f60-a7b5-123456789abc';
const OTHER_ID = '11111111-2222-4333-8444-555555555555';

// ---------- profileIdOf ----------

test('profileIdOf: só texto em formato UUID vale (maiúsculas ou minúsculas)', () => {
  const { profileIdOf } = helpers();
  assert.equal(profileIdOf(ID), ID);
  assert.equal(profileIdOf(ID.toUpperCase()), ID.toUpperCase());
});

test('profileIdOf: qualquer outra coisa vira undefined (número, objeto, texto solto, UUID com sobra)', () => {
  const { profileIdOf } = helpers();
  [undefined, null, 7, true, {}, [], [ID], '', 'abc', '123', ` ${ID}`, `${ID} `, `${ID}0`, ID.slice(1), ID.replace(/-/g, ''),
    '3f2b8c1a-9d4e-4f60-a7b5-123456789abg', '<script>alert(1)</script>', `${ID}\n`, { toString: () => ID }]
    .forEach((value) => assert.equal(profileIdOf(value), undefined, JSON.stringify(value)));
});

// ---------- profileFromResponse (login e login com MFA) ----------

test('profileFromResponse: copia nome, papel e o id válido, sem devolver o objeto cru da API', () => {
  const { profileFromResponse } = helpers();
  const raw = { id: ID, fullName: 'Ana Teste', role: 'member' };
  const profile = profileFromResponse(raw);
  assert.deepEqual(profile, { id: ID, fullName: 'Ana Teste', role: 'member' });
  assert.notEqual(profile, raw);
  profile.fullName = 'Outra';
  assert.equal(raw.fullName, 'Ana Teste', 'a cópia não altera a resposta');
});

test('profileFromResponse: id ausente ou inválido fica undefined; o resto do perfil segue igual', () => {
  const { profileFromResponse } = helpers();
  assert.equal(profileFromResponse({ fullName: 'Ana', role: 'member' }).id, undefined);
  assert.equal(profileFromResponse({ id: 42, fullName: 'Ana', role: 'member' }).id, undefined);
  assert.equal(profileFromResponse({ id: 'não-é-uuid', fullName: 'Ana', role: 'member' }).id, undefined);
  assert.equal(profileFromResponse({ id: 'não-é-uuid', fullName: 'Ana', role: 'member' }).fullName, 'Ana');
  assert.doesNotThrow(() => profileFromResponse(undefined));
  assert.equal(profileFromResponse(null).id, undefined);
});

// ---------- mergeProfileId (apiGetMyProfile) ----------

test('mergeProfileId: id válido da resposta entra no perfil (objeto novo, o anterior não muda)', () => {
  const { mergeProfileId } = helpers();
  const before = { fullName: 'Ana', role: 'member' };
  const after = mergeProfileId(before, { id: ID });
  assert.equal(after.id, ID);
  assert.equal(after.fullName, 'Ana');
  assert.equal('id' in before, false);
  assert.notEqual(after, before);
});

test('mergeProfileId: resposta sem id (servidor antigo) ou com id inválido NÃO apaga o id que já existia', () => {
  const { mergeProfileId } = helpers();
  const before = { id: ID, fullName: 'Ana', role: 'member' };
  assert.equal(mergeProfileId(before, { fullName: 'Ana' }).id, ID);
  assert.equal(mergeProfileId(before, { id: null }).id, ID);
  assert.equal(mergeProfileId(before, { id: 'x' }).id, ID);
  assert.equal(mergeProfileId(before, undefined).id, ID);
  assert.equal(mergeProfileId(before, { id: OTHER_ID }).id, OTHER_ID, 'id válido novo vale');
});

// ---------- caminhos em app.js ----------

test('login (e login com MFA, que chama finishLogin): o perfil do estado nasce de profileFromResponse', () => {
  assert.match(APP, /state\.profile = profileFromResponse\(res\.profile\);/);
  assert.doesNotMatch(APP, /state\.profile = res\.profile;/, 'o objeto cru da API não vai mais direto para o estado');
  assert.match(read('mfa.js'), /app\.finishLogin\(res\)/);
});

test('restauração da sessão: o perfil refeito de apiGetMyProfile leva o id (validado), junto com nome e papel', () => {
  assert.match(APP, /state\.profile = \{ id: profileIdOf\(res\.profile\.id\), fullName: res\.profile\.fullName, role: res\.profile\.role \};/);
});

test('loadProfileAndPreferences: depois de gravar e-mail e usuário, junta o id sem apagar o que havia', () => {
  const body = /function loadProfileAndPreferences\(\) \{[\s\S]*?\n  \}\n/.exec(APP);
  assert.ok(body, 'função encontrada');
  const order = ['state.profile.email = res.profile.email;', 'state.profile.username = res.profile.username;', 'state.profile = mergeProfileId(state.profile, res.profile);']
    .map((piece) => body[0].indexOf(piece));
  assert.ok(order.every((i) => i >= 0), 'os três passos existem');
  assert.ok(order[0] < order[2] && order[1] < order[2], 'o id entra por último, sobre o perfil já com e-mail e usuário');
});

test('o cache de sessão do navegador continua só com token e validade (nenhum dado novo é gravado)', () => {
  const save = /function saveSessionCache\(token\) \{[\s\S]*?\n  \}\n/.exec(APP);
  assert.ok(save);
  assert.match(save[0], /JSON\.stringify\(\{ token: token, expiresAt: Date\.now\(\) \+ SESSION_TTL_MS \}\)/);
  assert.doesNotMatch(save[0], /profile|id\b/);
  const usages = APP.match(/localStorage\.setItem\(/g) || [];
  assert.ok(usages.length >= 1);
});

test('sem console.log novo e sem o id em log, URL ou DOM: ele só vive em state.profile', () => {
  const block = APP.slice(APP.indexOf(BLOCK_START), APP.indexOf(BLOCK_END));
  assert.doesNotMatch(block, /console\./);
  assert.doesNotMatch(APP, /state\.profile\.id[^;\n]*(textContent|setAttribute|innerHTML|location|href|console)/);
});

// ---------- fluxo completo (as funções reais, encadeadas como app.js as chama) ----------

test('fluxo: login com id -> perfil sem id (servidor antigo) mantém -> perfil com id novo troca; restauração leva o id', () => {
  const { profileFromResponse, mergeProfileId, profileIdOf } = helpers();
  let profile = profileFromResponse({ id: ID, fullName: 'Ana', role: 'member' });
  profile.email = 'ana@exemplo.com';
  profile = mergeProfileId(profile, { fullName: 'Ana', email: 'ana@exemplo.com' });
  assert.equal(profile.id, ID);
  assert.equal(profile.email, 'ana@exemplo.com');
  profile = mergeProfileId(profile, { id: OTHER_ID });
  assert.equal(profile.id, OTHER_ID);
  const restored = { id: profileIdOf(OTHER_ID), fullName: 'Ana', role: 'member' };
  assert.deepEqual(restored, { id: OTHER_ID, fullName: 'Ana', role: 'member' });
  assert.equal({ id: profileIdOf('lixo'), fullName: 'Ana', role: 'member' }.id, undefined);
});
