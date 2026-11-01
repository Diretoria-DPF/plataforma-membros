/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cargo na liga para o gestor (ADR 0010, capacidade orgchart.edit), fora do modo admin: menu Gestão > "Cargos na liga".
// Lê o organograma (apiGetOrgChart, o mesmo do painel Equipe), lista as pessoas com o cargo atual e atualiza por
// apiAdminSetLeaguePosition (a Worker confere a capacidade e as regras de diretoria). Só DOM seguro (App.h/App.text),
// sem innerHTML e sem estilo inline. Mostrar a tela não é controle de acesso.
(function (root) {
  'use strict';

  var POSITION_LABELS = {
    coordenacao_geral: 'Coordenador Geral', presidente: 'Presidente', vice_presidente: 'Vice-Presidente',
    coordenador: 'Coordenador(a)', diretor: 'Diretor(a)',
  };
  var DIRECTORATE_LABELS = { marketing: 'Marketing', cientifico: 'Científico', administrativo: 'Administrativo', financeiro: 'Financeiro' };
  var MSG_ID = 'msg-gestao-orgchart';
  var LIST_ID = 'gestao-orgchart-list';
  var generation = 0;

  /** Organograma -> lista plana { id, fullName, leaguePosition, directorate } (a posição vem da seção do organograma). */
  function flattenChart(chart) {
    var out = [];
    function add(list, position, directorate) {
      (Array.isArray(list) ? list : []).forEach(function (p) {
        if (p && p.id) out.push({ id: p.id, fullName: p.fullName || '', leaguePosition: position, directorate: directorate });
      });
    }
    var c = chart || {};
    add(c.coordenacaoGeral, 'coordenacao_geral', null);
    add(c.presidente, 'presidente', null);
    add(c.vicePresidente, 'vice_presidente', null);
    add(c.coordenadores, 'coordenador', null);
    var dirs = c.directorates || {};
    Object.keys(DIRECTORATE_LABELS).forEach(function (key) {
      var d = dirs[key] || {};
      if (d.diretor) add([d.diretor], 'diretor', key);
      add(d.members, null, key);
    });
    add(c.membersWithoutDirectorate, null, null);
    return out;
  }

  /** Mesma regra do servidor: diretor exige diretoria; os outros cargos não aceitam diretoria. */
  function validateSelection(position, directorate) {
    var pos = position || null;
    var dir = directorate || null;
    if (pos && !Object.prototype.hasOwnProperty.call(POSITION_LABELS, pos)) return 'Cargo inválido.';
    if (dir && !Object.prototype.hasOwnProperty.call(DIRECTORATE_LABELS, dir)) return 'Diretoria inválida.';
    if (pos === 'diretor' && !dir) return 'O cargo de Diretor precisa estar vinculado a uma diretoria.';
    if (pos && pos !== 'diretor' && dir) return 'Este cargo não pode estar vinculado a uma diretoria específica.';
    return '';
  }

  function describe(person) {
    var parts = [];
    if (person.leaguePosition) parts.push(POSITION_LABELS[person.leaguePosition]);
    if (person.directorate) parts.push(DIRECTORATE_LABELS[person.directorate]);
    return parts.length ? parts.join(' · ') : 'Sem cargo de liderança';
  }

  function A() { return root.App; }
  function token() { var s = A().getState(); return s && s.sessionToken; }

  function options(labels, emptyLabel) {
    return [{ value: '', label: emptyLabel }].concat(Object.keys(labels).map(function (k) { return { value: k, label: labels[k] }; }));
  }

  function select(opts, current) {
    return A().h('select', {}, opts.map(function (o) {
      var el = A().text('option', o.label, { value: o.value });
      if (o.value === (current || '')) el.setAttribute('selected', 'selected');
      return el;
    }));
  }

  function renderPerson(person) {
    var h = A().h;
    var text = A().text;
    var positionSel = select(options(POSITION_LABELS, 'Sem cargo de liderança'), person.leaguePosition);
    var directorateSel = select(options(DIRECTORATE_LABELS, 'Sem diretoria'), person.directorate);
    var feedback = text('span', '', { className: 'status-msg' });
    var save = h('button', {
      type: 'button', className: 'admin-btn',
      onclick: function () {
        var problem = validateSelection(positionSel.value, directorateSel.value);
        if (problem) { feedback.textContent = problem; feedback.setAttribute('data-kind', 'error'); return; }
        A().callApi('apiAdminSetLeaguePosition', token(), person.id, {
          leaguePosition: positionSel.value || null, directorate: directorateSel.value || null,
        }).then(function (res) {
          feedback.textContent = (res && res.message) || 'Não foi possível atualizar.';
          feedback.setAttribute('data-kind', res && res.success ? 'success' : 'error');
          if (res && res.success) load(A());
        });
      },
    }, ['Atualizar cargo']);
    return h('article', { className: 'list-item' }, [
      text('h4', person.fullName),
      text('p', describe(person), { className: 'muted' }),
      h('div', { className: 'actions-row' }, [positionSel, directorateSel, save]),
      feedback,
    ]);
  }

  function load(appRef) {
    if (!appRef) return;
    generation += 1;
    var gen = generation;
    appRef.setStatus(MSG_ID, 'Carregando...', 'info');
    appRef.callApi('apiGetOrgChart', appRef.getState().sessionToken).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) { appRef.setStatus(MSG_ID, (res && res.message) || 'Não foi possível carregar.', 'error'); return; }
      appRef.setStatus(MSG_ID, '', null);
      appRef.renderList(LIST_ID, flattenChart(res.chart), renderPerson, 'Ninguém na liga ainda.');
    });
  }

  var api = {
    POSITION_LABELS: POSITION_LABELS, DIRECTORATE_LABELS: DIRECTORATE_LABELS,
    flattenChart: flattenChart, validateSelection: validateSelection, describe: describe, load: load,
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftOrgChartEdit = api;
})(typeof self !== 'undefined' ? self : this);
