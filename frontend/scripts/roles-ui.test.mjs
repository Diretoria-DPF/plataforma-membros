/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cargos funcionais na interface (ROL-03): data-cap (roles-ui.js), o menu Gestão, o crachá com os cargos e o painel
// Cargos do modo admin (admin-roles.js), mais o registro dos arquivos no index.html, no build e no precache do sw.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const roles = require('../roles-ui.js');
const adminRoles = require('../admin-roles.js');
const HTML = ler('index.html');

const gestor = { role: 'member', functionalRoles: ['gestor'], capabilities: ['events.manage', 'tasks.manage'] };
const admin = { role: 'admin', functionalRoles: [], capabilities: [] };
const membro = { role: 'member', functionalRoles: [], capabilities: [] };

test('hasCap: admin tem todas; membro só as dele; sem perfil, nenhuma', () => {
  assert.equal(roles.hasCap(admin, 'roles.grant'), true);
  assert.equal(roles.hasCap(gestor, 'events.manage'), true);
  assert.equal(roles.hasCap(gestor, 'reports.moderate'), false);
  assert.equal(roles.hasCap(membro, 'events.manage'), false);
  assert.equal(roles.hasCap(null, 'events.manage'), false);
  assert.equal(roles.hasCap({ role: 'member', capabilities: 'events.manage' }, 'events.manage'), false);
});

test('capAllowed: vários valores valem "qualquer um"; vazio, nunca', () => {
  assert.equal(roles.capAllowed(gestor, 'reports.moderate tasks.manage'), true);
  assert.equal(roles.capAllowed(gestor, 'reports.moderate content.review'), false);
  assert.equal(roles.capAllowed(admin, ''), false);
});

test('isVisible: data-cap-cargo esconde a cópia do menu Gestão para o admin', () => {
  assert.equal(roles.isVisible(admin, 'events.manage', true), false);
  assert.equal(roles.isVisible(admin, 'events.manage', false), true);
  assert.equal(roles.isVisible(gestor, 'events.manage', true), true);
});

test('badgeText: papel e cargos em português', () => {
  assert.equal(roles.badgeText(gestor), 'Membro · Gestor');
  assert.equal(roles.badgeText({ role: 'member', functionalRoles: ['revisor_conteudo', 'curador', 'xpto'] }), 'Membro · Revisor de conteúdo, Curador');
  assert.equal(roles.badgeText(admin), 'Administrador');
  assert.equal(roles.badgeText(null), '');
});

function elemento({ cap = null, cargo = false, hidden = true } = {}) {
  const classes = new Set(hidden ? ['hidden'] : []);
  return {
    textContent: '',
    getAttribute: (n) => (n === 'data-cap' ? cap : null),
    hasAttribute: (n) => n === 'data-cap-cargo' && cargo,
    classList: { contains: (c) => classes.has(c), toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
  };
}

function documento() {
  const itens = {
    eventos: elemento({ cap: 'events.manage', cargo: true }),
    denuncias: elemento({ cap: 'reports.moderate', cargo: true }),
    cartaoMetricas: elemento({ cap: 'metrics.read', hidden: false }),
  };
  const ids = { 'header-role-badge': elemento({ hidden: false }), 'gestao-mfa-aviso': elemento() };
  return {
    itens,
    ids,
    querySelectorAll: (sel) => (sel === '[data-cap]' ? Object.values(itens) : []),
    getElementById: (id) => ids[id] || null,
  };
}

test('apply: gestor vê o que o cargo libera, não vê o resto; o crachá mostra o cargo', () => {
  const doc = documento();
  roles.apply(doc, gestor);
  assert.equal(doc.itens.eventos.classList.contains('hidden'), false);
  assert.equal(doc.itens.denuncias.classList.contains('hidden'), true);
  assert.equal(doc.itens.cartaoMetricas.classList.contains('hidden'), true);
  assert.equal(doc.ids['header-role-badge'].textContent, 'Membro · Gestor');
  assert.equal(doc.ids['gestao-mfa-aviso'].classList.contains('hidden'), true);
});

test('apply: admin não vê o menu Gestão, mas vê os cartões; sem sessão tudo some', () => {
  const doc = documento();
  roles.apply(doc, admin);
  assert.equal(doc.itens.eventos.classList.contains('hidden'), true);
  assert.equal(doc.itens.cartaoMetricas.classList.contains('hidden'), false);
  roles.apply(doc, null);
  assert.equal(doc.itens.cartaoMetricas.classList.contains('hidden'), true);
});

test('apply: cargo privilegiado sem MFA mostra o aviso', () => {
  const doc = documento();
  roles.apply(doc, Object.assign({}, gestor, { roleMfaPending: true }));
  assert.equal(doc.ids['gestao-mfa-aviso'].classList.contains('hidden'), false);
});

test('index.html: menu Gestão com os painéis por capacidade, todos começando escondidos', () => {
  const inicio = HTML.indexOf('data-grupo="gestao"');
  assert.ok(inicio > 0, 'grupo Gestão ausente');
  const bloco = HTML.slice(inicio, HTML.indexOf('</section>', inicio));
  const itens = [...bloco.matchAll(/<button [^>]*>/g)].map((m) => m[0]);
  const mapa = itens.map((b) => [/data-panel="([^"]+)"/.exec(b)[1], /data-cap="([^"]+)"/.exec(b)[1]]);
  assert.deepEqual(mapa, [
    ['panel-admin-events', 'events.manage'],
    ['panel-admin-tasks', 'tasks.manage'],
    ['panel-admin-fiscal', 'attendance.manage'],
    ['panel-admin-proposals', 'proposals.review'],
    ['panel-admin-reports', 'reports.moderate'],
    ['panel-admin-ai', 'content.review assistant.feedback.moderate reports.moderate'],
    ['panel-admin-library', 'library.curate'],
  ]);
  itens.forEach((b) => {
    assert.match(b, /class="app-menu__item hidden"/);
    assert.match(b, /data-cap-cargo/);
  });
  assert.match(bloco, /id="gestao-mfa-aviso" class="gestao-aviso hidden"/);
});

test('index.html: painel de IA separa cartões por capacidade; casos para o revisor', () => {
  const painel = /<section id="panel-admin-ai"[\s\S]*?<\/section>/.exec(HTML)[0];
  const cartoes = [...painel.matchAll(/<div class="card"[^>]*>/g)].map((m) => m[0]);
  cartoes.forEach((c) => assert.match(c, /data-cap="/));
  assert.ok(cartoes.some((c) => c.includes('data-cap="content.review"')));
  assert.ok(cartoes.some((c) => c.includes('data-cap="assistant.feedback.moderate"')));
});

test('index.html: botão Cargos na barra do modo admin e o painel com reautenticação', () => {
  const barra = HTML.slice(HTML.indexOf('id="nav-group-admin"'), HTML.indexOf('</nav>', HTML.indexOf('id="nav-group-admin"')));
  assert.match(barra, /data-panel="panel-admin-roles"/);
  const painel = /<section id="panel-admin-roles"[\s\S]*?<\/section>/.exec(HTML);
  assert.ok(painel, 'painel Cargos ausente');
  assert.match(painel[0], /type="password" id="admin-roles-password" autocomplete="current-password"/);
  assert.match(painel[0], /id="admin-roles-code" inputmode="numeric"/);
  assert.match(painel[0], /id="msg-admin-roles" class="status-msg" role="status" aria-live="polite"/);
  assert.doesNotMatch(painel[0], /style=/);
});

test('arquivos novos entram no index.html, no build e no precache do sw; scripts antes do app.js', () => {
  const sw = ler('sw.js');
  const build = ler('scripts/build.js');
  ['roles-ui.js', 'admin-roles.js', 'roles.css'].forEach((f) => {
    assert.ok(sw.includes(`'${f}'`), f + ' fora do precache');
    assert.ok(build.includes(`'${f}'`), f + ' fora do build');
  });
  assert.match(HTML, /<link rel="stylesheet" href="roles\.css">/);
  assert.ok(HTML.indexOf('src="roles-ui.js"') < HTML.indexOf('src="app.js"'));
  assert.ok(HTML.indexOf('src="admin-roles.js"') < HTML.indexOf('src="app.js"'));
});

test('sem innerHTML nem estilo inline nos módulos novos', () => {
  ['roles-ui.js', 'admin-roles.js'].forEach((f) => {
    const src = ler(f);
    assert.doesNotMatch(src, /\.innerHTML|\.outerHTML|insertAdjacentHTML|\.style\./);
  });
});

test('admin-roles: cargos que faltam, sem cargo para visitante', () => {
  assert.deepEqual(adminRoles.availableToGrant({ baseRole: 'member', roles: ['gestor'] }), ['revisor_conteudo', 'moderador', 'curador', 'mentor']);
  assert.deepEqual(adminRoles.availableToGrant({ baseRole: 'visitor', roles: [] }), []);
  assert.deepEqual(adminRoles.availableToGrant({ baseRole: 'admin', roles: adminRoles.ROLE_ORDER.slice() }), []);
});

test('admin-roles: reautenticação exige a senha; o código é opcional e validado', () => {
  assert.deepEqual(adminRoles.stepUpInput('', ''), { ok: false, message: 'Digite a sua senha para confirmar.' });
  assert.deepEqual(adminRoles.stepUpInput('segredo', ''), { ok: true, input: { password: 'segredo' } });
  assert.deepEqual(adminRoles.stepUpInput('segredo', ' 123456 '), { ok: true, input: { password: 'segredo', code: '123456' } });
  assert.equal(adminRoles.stepUpInput('segredo', '<x>').ok, false);
});

test('admin-roles: pessoa da busca vira item da lista sem e-mail', () => {
  const p = adminRoles.personFromUser({ id: 'u1', fullName: 'Ana', email: 'ana@x.com', role: 'member' }, ['mentor']);
  assert.deepEqual(p, { profileId: 'u1', fullName: 'Ana', baseRole: 'member', roles: ['mentor'] });
});
