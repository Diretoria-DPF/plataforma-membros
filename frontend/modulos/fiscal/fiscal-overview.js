/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * fiscal-overview.js — aba "Visão geral" da Portaria e ficha de presença do evento.
 *
 * Balanço de todos os membros (inscrições, presenças, percentual e tarefas), dos eventos e reuniões e das tarefas, num
 * período escolhido (30 dias, 90 dias ou tudo), e dois PDFs pela impressão do navegador ("Salvar como PDF"): o balanço
 * geral e a ficha nominal de presença de um evento (com coluna de assinatura em branco para conferência no papel).
 * Só nome, cargo e contagens: nunca e-mail nem telefone. DOM só com createElement/textContent e eventos só por
 * addEventListener (CSP). As funções puras são testadas em Node.
 */
(function (root) {
  'use strict';

  var PERIOD_LABELS = { 30: 'últimos 30 dias', 90: 'últimos 90 dias', 0: 'todo o período' };
  var SORTS = ['nome', 'presenca'];

  /** Rótulo do período em texto corrido. */
  function periodLabel(days) {
    return Object.prototype.hasOwnProperty.call(PERIOD_LABELS, days) ? PERIOD_LABELS[days] : PERIOD_LABELS[90];
  }

  /** "75%" ou "—" quando a pessoa ainda não tinha evento no período. */
  function formatPct(pct) {
    return typeof pct === 'number' && isFinite(pct) ? pct + '%' : '—';
  }

  /** Cópia ordenada (nunca altera a lista original): por nome, ou pela presença (maior % primeiro, sem dado no fim). */
  function sortMembers(rows, mode) {
    var list = (Array.isArray(rows) ? rows : []).slice();
    var byName = function (a, b) { return String(a.fullName).localeCompare(String(b.fullName), 'pt-BR'); };
    if (SORTS.indexOf(mode) === -1 || mode === 'nome') return list.sort(byName);
    return list.sort(function (a, b) {
      var pa = typeof a.pct === 'number' ? a.pct : -1;
      var pb = typeof b.pct === 'number' ? b.pct : -1;
      return pb - pa || b.present - a.present || byName(a, b);
    });
  }

  /** Data curta em pt-BR ("05/11/2026"); vazio se inválida. */
  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }

  function formatTime(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /** Texto do comparecimento de uma tarefa: "3 inscritos · 2 no evento ligado" ou só os inscritos. */
  function taskSummary(task) {
    var text = task.signups + (task.signups === 1 ? ' inscrito' : ' inscritos');
    if (task.linked && typeof task.signupsPresent === 'number') text += ' · ' + task.signupsPresent + ' no evento ligado';
    return text;
  }

  var api = {
    periodLabel: periodLabel, formatPct: formatPct, sortMembers: sortMembers, taskSummary: taskSummary,
    formatDate: formatDate, formatTime: formatTime,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (!root.document) return;

  var doc = root.document;
  var state = { days: 90, sort: 'nome', data: null, seq: 0 };
  var $ = function (id) { return doc.getElementById(id); };

  function el(tag, attrs, children) {
    var node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function engine() { return root.FiscalEngine || {}; }
  function say(message, kind) { if (engine().setStatus) engine().setStatus(message, kind); }

  function call(action, input) {
    if (!root.LaiftApi) return Promise.resolve({ success: false, message: 'Sessão indisponível.' });
    return root.LaiftApi.call(action, input);
  }

  function table(headers, rows, className) {
    var head = el('tr', {}, headers.map(function (h) { return el('th', { scope: 'col', text: h }); }));
    var body = rows.map(function (cells) {
      return el('tr', {}, cells.map(function (c) { return el('td', { text: c }); }));
    });
    return el('table', { className: className || 'fiscal-table' }, [el('thead', {}, [head]), el('tbody', {}, body)]);
  }

  function memberCells(m) {
    return [m.fullName, m.roleLabel, String(m.registered), String(m.present), formatPct(m.pct), String(m.tasks)];
  }

  function eventCells(e) {
    return [e.title, formatDate(e.eventDate), String(e.registered), String(e.present), formatPct(e.pct)];
  }

  function taskCells(t) {
    return [t.title, String(t.signups), t.linked && typeof t.signupsPresent === 'number' ? String(t.signupsPresent) : '—'];
  }

  var MEMBER_HEADERS = ['Nome', 'Cargo', 'Inscrições', 'Presenças', '% presença', 'Tarefas'];
  var EVENT_HEADERS = ['Evento ou reunião', 'Data', 'Inscritos', 'Presentes', '% presença'];
  var TASK_HEADERS = ['Tarefa', 'Inscritos', 'Compareceram ao evento ligado'];

  function renderMetrics(data) {
    var t = data.totals;
    var items = [
      [String(t.members), 'membros e participantes'],
      [String(t.events), 'eventos e reuniões'],
      [formatPct(t.pct), 'presença geral'],
      [String(t.tasks), 'tarefas'],
    ];
    var box = $('ovMetrics');
    clear(box);
    items.forEach(function (it) {
      box.appendChild(el('div', { className: 'fiscal-metric' }, [el('strong', { text: it[0] }), el('span', { text: it[1] })]));
    });
  }

  function fill(id, headers, rows, cells, emptyText) {
    var box = $(id);
    clear(box);
    box.appendChild(rows.length ? table(headers, rows.map(cells)) : el('p', { className: 'fiscal-empty', text: emptyText }));
  }

  function renderLists(data) {
    fill('ovMembers', MEMBER_HEADERS, sortMembers(data.members, state.sort), memberCells, 'Nenhuma pessoa no período.');
    fill('ovEvents', EVENT_HEADERS, data.events, eventCells, 'Nenhum evento ou reunião já realizado neste período.');
    fill('ovTasks', TASK_HEADERS, data.tasks, taskCells, 'Nenhuma tarefa neste período.');
  }

  function render(data) {
    state.data = data;
    renderMetrics(data);
    renderLists(data);
    $('ovStamp').textContent = 'Período: ' + periodLabel(data.days) + '. Atualizado às ' + formatTime(data.generatedAt) + '.';
  }

  /** Busca o balanço do período; descarta respostas de uma consulta já substituída. */
  function load() {
    var seq = ++state.seq;
    $('ovStamp').textContent = 'Carregando o balanço...';
    return call('apiAdminAttendanceOverview', { days: state.days }).then(function (res) {
      if (seq !== state.seq) return;
      if (!res || !res.success) { $('ovStamp').textContent = (res && res.message) || 'Não foi possível carregar o balanço.'; return; }
      render(res);
    });
  }

  function sheetBlock(title, content) {
    return el('section', { className: 'report-block' }, [el('h2', { text: title }), content]);
  }

  /** Folha do balanço geral, montada fora da tela e impressa pelo navegador. */
  function buildReport(data) {
    var t = data.totals;
    return el('div', { className: 'report-sheet' }, [
      el('h1', { text: 'Balanço de presença · LAIFT' }),
      el('p', { className: 'report-meta', text: 'Período: ' + periodLabel(data.days) + ' · emitido em ' + formatDate(data.generatedAt) + ' às ' + formatTime(data.generatedAt) }),
      el('p', { className: 'report-meta', text: t.members + ' pessoas · ' + t.events + ' eventos e reuniões · presença geral ' + formatPct(t.pct) }),
      sheetBlock('Membros', table(MEMBER_HEADERS, sortMembers(data.members, state.sort).map(memberCells), 'report-table')),
      sheetBlock('Eventos e reuniões', table(EVENT_HEADERS, data.events.map(eventCells), 'report-table')),
      sheetBlock('Tarefas', table(TASK_HEADERS, data.tasks.map(taskCells), 'report-table')),
    ]);
  }

  /** Folha da ficha de presença: lista nominal e coluna de assinatura em branco. */
  function buildSheet(res) {
    var rows = res.rows.map(function (r, i) {
      return [String(i + 1), r.fullName, r.roleLabel, r.present ? formatTime(r.checkedInAt) : 'ausente', ''];
    });
    return el('div', { className: 'report-sheet' }, [
      el('h1', { text: 'Ficha de presença' }),
      el('p', { className: 'report-meta', text: res.event.title + ' · ' + formatDate(res.event.eventDate) }),
      el('p', { className: 'report-meta', text: res.totals.registered + ' inscritos · ' + res.totals.present + ' presentes' }),
      table(['Nº', 'Nome', 'Cargo', 'Entrada', 'Assinatura'], rows, 'report-table report-table--sign'),
    ]);
  }

  function printSheet(node, message) {
    var area = $('printArea');
    clear(area);
    area.appendChild(node);
    if (engine().printArea) engine().printArea(message); else root.print();
  }

  function exportOverviewPdf() {
    say('Preparando o balanço...', 'loading');
    return call('apiAdminAttendanceOverview', { days: state.days, forExport: true }).then(function (res) {
      if (!res || !res.success) { say((res && res.message) || 'Não foi possível gerar o balanço.', 'error'); return; }
      state.data = res;
      printSheet(buildReport(res), 'Balanço pronto. Na janela de impressão, escolha “Salvar como PDF”.');
    });
  }

  function exportSheetPdf() {
    var select = $('fiscalEvent');
    var eventId = select ? select.value : '';
    if (!eventId) { say('Selecione um evento.', 'error'); return Promise.resolve(); }
    say('Preparando a ficha...', 'loading');
    return call('apiAdminAttendanceSheet', { eventId: eventId }).then(function (res) {
      if (!res || !res.success) { say((res && res.message) || 'Não foi possível gerar a ficha.', 'error'); return; }
      printSheet(buildSheet(res), 'Ficha pronta. Na janela de impressão, escolha “Salvar como PDF”.');
    });
  }

  function bind() {
    if (!$('paneOverview')) return;
    $('ovPeriod').addEventListener('change', function () { state.days = Number($('ovPeriod').value); load(); });
    $('ovSort').addEventListener('change', function () { state.sort = $('ovSort').value; if (state.data) renderLists(state.data); });
    $('ovRefresh').addEventListener('click', load);
    $('ovPdf').addEventListener('click', exportOverviewPdf);
    $('sheetPdf').addEventListener('click', exportSheetPdf);
  }

  root.FiscalOverview = { show: load };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind); else bind();
})(typeof window !== 'undefined' ? window : globalThis);
