/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel "Cargos" do modo admin (ADR 0010, ROL-03). Lista quem tem cargo (apiAdminListRoles), busca uma pessoa
// (apiAdminListUsers) e concede ou retira (apiAdminGrantRole / apiAdminRevokeRole). Conceder e retirar pedem a senha
// de quem está no painel e, se houver, o código do autenticador (reautenticação no servidor). Só DOM seguro
// (App.h/App.text), sem innerHTML e sem estilo inline. Quem decide de verdade é a Worker.
(function (root) {
  'use strict';

  var ROLE_ORDER = ['gestor', 'revisor_conteudo', 'moderador', 'curador', 'mentor'];
  var ROLE_NAMES = {
    gestor: 'Gestor',
    revisor_conteudo: 'Revisor de conteúdo',
    moderador: 'Moderador',
    curador: 'Curador',
    mentor: 'Mentor',
  };
  var BASE_NAMES = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };
  var MSG_ID = 'msg-admin-roles';
  var CODE_RE = /^[0-9A-Za-z-]{0,20}$/;

  /** Cargos que a pessoa ainda não tem (na ordem fixa). Visitante não recebe cargo. */
  function availableToGrant(person) {
    if (!person || person.baseRole === 'visitor') return [];
    var held = Array.isArray(person.roles) ? person.roles : [];
    return ROLE_ORDER.filter(function (r) { return held.indexOf(r) === -1; });
  }

  /** Entrada da reautenticação: senha obrigatória; código opcional (só números/letras do autenticador ou de recuperação). */
  function stepUpInput(password, code) {
    var pass = typeof password === 'string' ? password : '';
    var c = typeof code === 'string' ? code.trim() : '';
    if (!pass) return { ok: false, message: 'Digite a sua senha para confirmar.' };
    if (!CODE_RE.test(c)) return { ok: false, message: 'O código do autenticador parece inválido.' };
    return c ? { ok: true, input: { password: pass, code: c } } : { ok: true, input: { password: pass } };
  }

  /** Pessoa vinda da busca de usuários no formato da lista de cargos (sem e-mail). */
  function personFromUser(user, knownRoles) {
    return { profileId: user.id, fullName: user.fullName || '', baseRole: user.role, roles: knownRoles || [] };
  }

  function roleName(role) { return ROLE_NAMES[role] || role; }

  var app = null;
  var bound = false;
  var generation = 0;
  var byId = {};

  function A() { return app || root.App; }
  function token() { var s = A().getState(); return s && s.sessionToken; }
  function $(id) { return root.document.getElementById(id); }
  function status(message, kind) { A().setStatus(MSG_ID, message, kind); }

  function readStepUp() {
    var pass = $('admin-roles-password');
    var code = $('admin-roles-code');
    return stepUpInput(pass ? pass.value : '', code ? code.value : '');
  }

  function clearStepUp() {
    var pass = $('admin-roles-password');
    var code = $('admin-roles-code');
    if (pass) pass.value = '';
    if (code) code.value = '';
  }

  function change(action, person, role) {
    var auth = readStepUp();
    if (!auth.ok) {
      status(auth.message, 'error');
      var pass = $('admin-roles-password');
      if (pass) pass.focus();
      return;
    }
    var input = Object.assign({ profileId: person.profileId, role: role }, auth.input);
    status(action === 'apiAdminGrantRole' ? 'Concedendo...' : 'Retirando...', 'info');
    A().callApi(action, token(), input).then(function (res) {
      var ok = !!(res && res.success);
      status((res && res.message) || (ok ? 'Feito.' : 'Não foi possível concluir.'), ok ? 'success' : 'error');
      if (!ok) return;
      clearStepUp();
      byId[person.profileId] = Object.assign({}, person, { roles: res.roles || person.roles });
      loadList();
      var results = $('admin-roles-search-results');
      if (results) A().clearEl(results);
    });
  }

  function renderPerson(person) {
    var h = A().h;
    var text = A().text;
    var held = (person.roles || []).map(function (role) {
      return h('li', { className: 'role-chip' }, [
        text('span', roleName(role)),
        h('button', {
          type: 'button', className: 'secondary role-chip__btn',
          'aria-label': 'Retirar o cargo ' + roleName(role) + ' de ' + (person.fullName || 'esta pessoa'),
          onclick: function () {
            A().openConfirm('Retirar o cargo ' + roleName(role) + ' de ' + (person.fullName || 'esta pessoa') + '?', function () {
              change('apiAdminRevokeRole', person, role);
            });
          },
        }, ['Retirar']),
      ]);
    });
    var options = availableToGrant(person);
    var select = h('select', { 'aria-label': 'Cargo para ' + (person.fullName || 'esta pessoa') },
      options.map(function (r) { return text('option', roleName(r), { value: r }); }));
    var grant = options.length ? h('div', { className: 'actions-row' }, [
      select,
      h('button', { type: 'button', className: 'admin-btn', onclick: function () { change('apiAdminGrantRole', person, select.value); } }, ['Conceder']),
    ]) : null;
    return h('div', { className: 'list-item role-person' }, [
      text('strong', person.fullName || 'Sem nome'),
      text('span', BASE_NAMES[person.baseRole] || person.baseRole || '', { className: 'badge' }),
      held.length ? h('ul', { className: 'role-chips' }, held) : text('p', 'Sem cargo.', { className: 'muted' }),
      grant,
    ]);
  }

  function loadList() {
    var gen = generation;
    A().callApi('apiAdminListRoles', token(), {}).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) { status((res && res.message) || 'Não foi possível carregar os cargos.', 'error'); return; }
      (res.people || []).forEach(function (p) { byId[p.profileId] = p; });
      A().renderList('admin-roles-list', res.people || [], renderPerson, 'Ninguém tem cargo ainda.');
    });
  }

  function search(term) {
    var gen = generation;
    var q = String(term || '').trim();
    if (q.length < 2) { status('Digite ao menos 2 letras do nome ou do e-mail.', 'error'); return; }
    status('Buscando...', 'info');
    A().callApi('apiAdminListUsers', token(), { search: q, page: 1 }).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) { status((res && res.message) || 'Não foi possível buscar.', 'error'); return; }
      status('', null);
      var people = (res.users || []).map(function (u) {
        var known = byId[u.id];
        return personFromUser(u, known ? known.roles : []);
      });
      A().renderList('admin-roles-search-results', people, renderPerson, 'Ninguém encontrado.');
    });
  }

  function bind() {
    if (bound) return;
    bound = true;
    var form = $('form-roles-search');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = $('admin-roles-search');
        search(input ? input.value : '');
      });
    }
  }

  function load(appRef) {
    if (appRef) app = appRef;
    if (!token()) return;
    bind();
    loadList();
  }

  /** Logout/expiração: descarta respostas pendentes e limpa o que estava na tela, inclusive a senha digitada. */
  function reset() {
    generation++;
    byId = {};
    clearStepUp();
    ['admin-roles-list', 'admin-roles-search-results'].forEach(function (id) {
      var el = $(id);
      if (el && A()) A().clearEl(el);
    });
    if (A() && root.document) status('', null);
  }

  var api = {
    ROLE_ORDER: ROLE_ORDER, availableToGrant: availableToGrant, stepUpInput: stepUpInput, personFromUser: personFromUser,
    load: load, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }
  root.LaiftAdminRoles = api;
})(typeof self !== 'undefined' ? self : this);
