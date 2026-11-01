/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// ROL-03 acabamentos: tela "Cargos na liga" do gestor (orgchart-edit.js), atualização do cargo logo após o MFA
// (App.refreshIdentity chamado por mfa.js) e denunciante oculto ao moderador na tela de denúncias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');
const require = createRequire(import.meta.url);
const Edit = require('../orgchart-edit.js');
const Roles = require('../roles-ui.js');
const Mfa = require('../mfa.js');

const card = (id, fullName) => ({ id, fullName });

test('flattenChart: a posição e a diretoria vêm da seção do organograma', () => {
  const people = Edit.flattenChart({
    presidente: [card('1', 'Ana')],
    coordenadores: [card('2', 'Beto')],
    directorates: {
      marketing: { diretor: card('3', 'Cris'), members: [card('4', 'Duda')] },
      cientifico: { diretor: null, members: [] },
    },
    membersWithoutDirectorate: [card('5', 'Eli')],
  });
  const by = Object.fromEntries(people.map((p) => [p.id, p]));
  assert.equal(people.length, 5);
  assert.deepEqual([by[1].leaguePosition, by[1].directorate], ['presidente', null]);
  assert.deepEqual([by[3].leaguePosition, by[3].directorate], ['diretor', 'marketing']);
  assert.deepEqual([by[4].leaguePosition, by[4].directorate], [null, 'marketing']);
  assert.deepEqual([by[5].leaguePosition, by[5].directorate], [null, null]);
});

test('flattenChart: resposta vazia ou torta não quebra', () => {
  assert.deepEqual(Edit.flattenChart(null), []);
  assert.deepEqual(Edit.flattenChart({ presidente: 'x', directorates: { marketing: null } }), []);
});

test('validateSelection espelha a regra do servidor', () => {
  assert.equal(Edit.validateSelection('', ''), '');
  assert.equal(Edit.validateSelection('presidente', ''), '');
  assert.equal(Edit.validateSelection('diretor', 'marketing'), '');
  assert.match(Edit.validateSelection('diretor', ''), /precisa estar vinculado/);
  assert.match(Edit.validateSelection('presidente', 'marketing'), /não pode estar vinculado/);
  assert.match(Edit.validateSelection('rei', ''), /inválido/);
  assert.match(Edit.validateSelection('', 'ti'), /inválida/);
});

test('o item do menu Gestão e o painel só valem para orgchart.edit e nunca para os outros cargos', () => {
  const html = read('index.html');
  assert.match(html, /data-panel="panel-gestao-orgchart" data-cap="orgchart\.edit" data-cap-cargo/);
  const attr = 'orgchart.edit';
  const gestor = { role: 'member', capabilities: ['orgchart.edit'] };
  assert.equal(Roles.isVisible(gestor, attr, true), true);
  for (const cargo of ['revisor_conteudo', 'moderador', 'curador', 'mentor']) {
    const caps = { revisor_conteudo: ['content.review', 'sim.review'], moderador: ['reports.moderate'], curador: ['library.curate'], mentor: ['mentoring.offer'] }[cargo];
    assert.equal(Roles.isVisible({ role: 'member', capabilities: caps }, attr, true), false, cargo);
  }
  assert.equal(Roles.isVisible({ role: 'member', capabilities: [] }, attr, true), false);
  assert.equal(Roles.isVisible({ role: 'admin', capabilities: [] }, attr, true), false); // admin usa o modo admin
});

test('arquivos novos: index.html (antes do app.js), build, precache e carregador do painel', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src="orgchart-edit.js"') > 0);
  assert.ok(html.indexOf('src="orgchart-edit.js"') < html.indexOf('src="app.js"'));
  assert.ok(read('sw.js').includes("'orgchart-edit.js'"));
  assert.ok(read('scripts/build.js').includes("'orgchart-edit.js'"));
  assert.match(read('app.js'), /'panel-gestao-orgchart': function \(\) \{ if \(window\.LaiftOrgChartEdit\)/);
  assert.match(html, /<section id="panel-gestao-orgchart" class="hidden">/);
  assert.doesNotMatch(read('orgchart-edit.js'), /\.innerHTML|\.style\./);
});

test('MFA: ao ativar ou desativar, mfa.js manda o app reler cargos e capacidades (sem recarregar)', () => {
  let calls = 0;
  Mfa.refreshIdentity({ refreshIdentity: () => { calls += 1; } });
  assert.equal(calls, 1);
  assert.doesNotThrow(() => Mfa.refreshIdentity({}));
  const mfa = read('mfa.js');
  assert.match(mfa, /refreshIdentity\(app\);\n\s+showRecoveryCodes/);
  assert.match(mfa, /if \(r\.success\) \{ refreshIdentity\(app\); load\(app, doc\); \}/);
  const app = read('app.js');
  assert.match(app, /refreshIdentity: refreshIdentity,/);
  assert.match(app, /function mergeServerProfile\(raw\)/);
});

test('denúncias: o moderador não vê o denunciante (reporterHidden), com texto próprio', () => {
  const app = read('app.js');
  assert.match(app, /if \(item\.reporterHidden\) return 'Oculto/);
});
