/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-usage.js
 * Seção "Uso da plataforma" do painel admin (DAT-01; docs/analytics-minimo.md). Mostra o que apiAdminUsageStats já
 * devolve, só em agregado: pessoas ativas por dia/semana/mês (DAU, WAU, MAU), funil de ativação de quem se cadastrou nos
 * últimos 30 dias, retenção D1/D7/D30 por semana de cadastro e contadores por métrica. Nenhuma pessoa é identificada.
 *
 * Script clássico, carregado depois de modulos/shared/safe-dom.js e antes de app.js, que chama load(window.App) ao abrir
 * o painel do administrador e reset() no logout/sessão expirada. Nada de innerHTML: todo nó nasce de LaiftDom.h e todo
 * texto (inclusive a mensagem de erro da API) entra como nó de texto. Sem estilo inline (CSP): as barras são <meter>.
 * Os botões usam data-action (LaiftDom.delegateActions) e têm 44px de alvo (classe secondary).
 *
 * A autorização real é do servidor (capacidade metrics.read, só o admin); esconder o painel é conveniência.
 */
(function () {
  'use strict';

  var CONTAINER_ID = 'admin-usage';
  var CARD_ID = 'admin-usage-card';
  var ACTION_RELOAD = 'LaiftAdminUsage.reload';
  var ERROR_TITLE = 'Não foi possível carregar o uso da plataforma.';
  var DEFAULT_WINDOW_DAYS = 30;
  var RETENTION_KEYS = ['d1', 'd7', 'd30'];
  var RETENTION_LABELS = { d1: 'D1', d7: 'D7', d30: 'D30' };
  var METRIC_LABELS = {
    signup: 'Cadastros',
    email_confirmed: 'E-mails confirmados',
    dau: 'Pessoas ativas (soma dos dias)',
    quiz_completed: 'Simulados concluídos',
    case_completed: 'Casos clínicos concluídos',
    lia_message: 'Mensagens para a Lia',
  };
  var METRIC_ORDER = ['signup', 'email_confirmed', 'dau', 'quiz_completed', 'case_completed', 'lia_message'];

  var generation = 0; // descarta respostas de pedidos antigos e de antes do logout
  var wired = false;
  var appRef = null;

  // ---------- Funções puras (testadas em scripts/admin-usage.test.mjs) ----------

  function toCount(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  /** Contador com plural pt-BR: "1 pessoa", "2 pessoas", "0 pessoas". */
  function plural(value, one, many) {
    var count = toCount(value);
    return count.toLocaleString('pt-BR') + ' ' + (count === 1 ? one : many);
  }

  /** retained/eligible em porcentagem; sem ninguém medido ainda vira traço (nunca 0% enganoso). */
  function ratioLabel(entry) {
    var eligible = toCount(entry && entry.eligible);
    var retained = toCount(entry && entry.retained);
    if (!eligible) return '—';
    return Math.round((Math.min(retained, eligible) / eligible) * 100) + '% (' + Math.min(retained, eligible) + '/' + eligible + ')';
  }

  /** '2026-10-14' → '14/10'. Qualquer outra coisa volta como veio (vira só texto na tela). */
  function dayLabel(iso) {
    var match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return match ? match[2] + '/' + match[1] : String(iso || '');
  }

  function normalizeRetentionEntry(value) {
    var v = value || {};
    return { eligible: toCount(v.eligible), retained: toCount(v.retained) };
  }

  function normalizeRetention(list) {
    return (Array.isArray(list) ? list : []).map(function (week) {
      var w = week || {};
      var out = { week: String(w.week || ''), size: toCount(w.size) };
      RETENTION_KEYS.forEach(function (key) { out[key] = normalizeRetentionEntry(w[key]); });
      return out;
    });
  }

  function normalizeFunnel(value) {
    var f = value || {};
    return {
      signup: toCount(f.signup),
      confirmed: toCount(f.confirmed),
      firstQuiz: toCount(f.firstQuiz),
      returnedD1: normalizeRetentionEntry(f.returnedD1),
      returnedD7: normalizeRetentionEntry(f.returnedD7),
    };
  }

  function normalizeCounters(value) {
    var src = value && typeof value === 'object' ? value : {};
    var known = METRIC_ORDER.filter(function (key) { return Object.prototype.hasOwnProperty.call(src, key); });
    return known.map(function (key) { return { key: key, label: METRIC_LABELS[key], n: toCount(src[key]) }; });
  }

  /** Resposta do servidor em formato fixo: campo ausente vira 0/vazio, nunca quebra a tela. */
  function normalizeStats(res) {
    var r = res || {};
    var dau = (Array.isArray(r.dau) ? r.dau : []).map(function (row) { return { day: String((row && row.day) || ''), n: toCount(row && row.n) }; });
    return {
      windowDays: toCount(r.windowDays) || DEFAULT_WINDOW_DAYS,
      today: String(r.today || ''),
      dau: dau,
      dauToday: dau.length && dau[dau.length - 1].day === r.today ? dau[dau.length - 1].n : 0,
      wau: toCount(r.wau),
      mau: toCount(r.mau),
      retention: normalizeRetention(r.retention),
      funnel: normalizeFunnel(r.funnel),
      counters: normalizeCounters(r.counters),
    };
  }

  function isEmptyStats(stats) {
    return stats.mau === 0 && stats.funnel.signup === 0 && stats.counters.every(function (c) { return c.n === 0; });
  }

  function errorMessage(res) {
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    return message || 'Tente novamente em instantes.';
  }

  // ---------- DOM (só LaiftDom.h; texto sempre como nó de texto) ----------

  function dom() { return window.LaiftDom; }

  function h(tag, attrs, children) { return dom().h(tag, attrs, children); }

  function container() { return document.getElementById(CONTAINER_ID); }

  function sessionToken(app) {
    var state = app && app.getState ? app.getState() : null;
    return state && state.sessionToken;
  }

  function hasFocusInside(box) {
    var active = document.activeElement;
    return !!active && typeof box.contains === 'function' && box.contains(active);
  }

  /** Troca o conteúdo; se o foco estava dentro (ex.: no "Tentar de novo"), ele passa para o novo conteúdo. */
  function mount(nodes, busy) {
    var box = container();
    if (!box) return;
    var keepFocus = hasFocusInside(box);
    dom().clear(box);
    nodes.forEach(function (node) { box.appendChild(node); });
    if (busy) box.setAttribute('aria-busy', 'true');
    else box.removeAttribute('aria-busy');
    if (keepFocus && nodes[0] && typeof nodes[0].focus === 'function') nodes[0].focus({ preventScroll: true });
  }

  function stateNode(kind, role, title, message, withRetry) {
    var children = [h('p', { className: 'state-title' }, [title])];
    if (message) children.push(h('p', { className: 'state-message' }, [message]));
    if (withRetry) {
      children.push(h('button', { type: 'button', className: 'secondary', 'data-action': ACTION_RELOAD }, ['Tentar de novo']));
    }
    return h('div', { className: 'state state-' + kind, role: role, tabindex: '-1' }, children);
  }

  function showLoading() {
    mount([stateNode('loading', 'status', 'Carregando…', '', false)], true);
  }

  function showError(res) {
    mount([stateNode('error', 'alert', ERROR_TITLE, errorMessage(res), true)], false);
  }

  function statBox(title, lines) {
    var children = [h('strong', null, [title])];
    lines.forEach(function (line) { children.push(h('span', { className: 'muted' }, [line])); });
    return h('div', { className: 'ai-budget' }, children);
  }

  function activeBoxes(stats) {
    return h('div', { className: 'stat-grid', tabindex: '-1' }, [
      statBox(plural(stats.dauToday, 'pessoa ativa hoje', 'pessoas ativas hoje'), ['DAU']),
      statBox(plural(stats.wau, 'pessoa ativa em 7 dias', 'pessoas ativas em 7 dias'), ['WAU']),
      statBox(plural(stats.mau, 'pessoa ativa em ' + stats.windowDays + ' dias', 'pessoas ativas em ' + stats.windowDays + ' dias'), ['MAU']),
    ]);
  }

  function funnelRow(label, value) {
    return h('div', { className: 'list-item ai-usage-row' }, [
      h('strong', null, [label]),
      h('div', { className: 'meta-row' }, [h('span', null, [value])]),
    ]);
  }

  function funnelSection(stats) {
    var f = stats.funnel;
    return [
      h('h3', null, ['Funil de ativação (cadastros dos últimos ' + stats.windowDays + ' dias)']),
      funnelRow('Cadastrou', plural(f.signup, 'pessoa', 'pessoas')),
      funnelRow('Confirmou o e-mail', plural(f.confirmed, 'pessoa', 'pessoas')),
      funnelRow('Fez o primeiro simulado', plural(f.firstQuiz, 'pessoa', 'pessoas')),
      funnelRow('Voltou no dia seguinte (D1)', ratioLabel(f.returnedD1)),
      funnelRow('Voltou 7 dias depois (D7)', ratioLabel(f.returnedD7)),
    ];
  }

  function retentionTable(stats) {
    var head = h('tr', null, [h('th', { scope: 'col' }, ['Semana'])].concat(
      [h('th', { scope: 'col' }, ['Cadastros'])],
      RETENTION_KEYS.map(function (key) { return h('th', { scope: 'col' }, [RETENTION_LABELS[key]]); })
    ));
    var rows = stats.retention.map(function (week) {
      return h('tr', null, [h('th', { scope: 'row' }, [dayLabel(week.week)]), h('td', null, [String(week.size)])].concat(
        RETENTION_KEYS.map(function (key) { return h('td', null, [ratioLabel(week[key])]); })
      ));
    });
    return h('div', { className: 'ai-table-wrap' }, [
      h('table', { className: 'data-table' }, [
        h('caption', { className: 'sr-only' }, ['Retenção por semana de cadastro']),
        h('thead', null, [head]),
        h('tbody', null, rows),
      ]),
    ]);
  }

  function retentionSection(stats) {
    var body = stats.retention.length
      ? [retentionTable(stats)]
      : [h('p', { className: 'empty-state' }, ['Ainda não há cadastros nas últimas 8 semanas.'])];
    return [
      h('h3', null, ['Retenção por semana de cadastro']),
      h('p', { className: 'muted' }, ['Porcentagem de quem voltou exatamente 1, 7 e 30 dias depois do cadastro. Traço: ninguém da semana já completou esse prazo.']),
    ].concat(body);
  }

  function countersSection(stats) {
    var rows = stats.counters.map(function (c) { return funnelRow(c.label, c.n.toLocaleString('pt-BR')); });
    return [h('h3', null, ['Contadores dos últimos ' + stats.windowDays + ' dias'])].concat(
      rows.length ? rows : [h('p', { className: 'empty-state' }, ['Nenhum evento contado ainda.'])]
    );
  }

  /** Pessoas ativas por dia, em <meter> (sem estilo inline), dentro de um <details> para não alongar a tela. */
  function dauSection(stats) {
    var max = stats.dau.reduce(function (acc, row) { return Math.max(acc, row.n); }, 1);
    var rows = stats.dau.slice().reverse().map(function (row) {
      return h('div', { className: 'meta-row' }, [
        h('span', null, [dayLabel(row.day)]),
        h('meter', { min: '0', max: String(max), value: String(row.n), 'aria-label': 'Pessoas ativas em ' + dayLabel(row.day) }, []),
        h('span', null, [String(row.n)]),
      ]);
    });
    if (!rows.length) return [];
    return [h('details', null, [h('summary', null, ['Pessoas ativas por dia']), h('div', null, rows)])];
  }

  function statsNodes(stats) {
    if (isEmptyStats(stats)) {
      return [h('p', { className: 'empty-state', tabindex: '-1' }, ['Ainda não há dados de uso. Eles aparecem conforme as pessoas usam a plataforma.'])];
    }
    return [activeBoxes(stats)].concat(
      funnelSection(stats), retentionSection(stats), countersSection(stats), dauSection(stats)
    );
  }

  // ---------- Ciclo de vida ----------

  function wire() {
    if (wired) return;
    var card = document.getElementById(CARD_ID);
    if (!card) return;
    wired = true;
    dom().delegateActions(card, [ACTION_RELOAD]);
  }

  function render(res) {
    mount(statsNodes(normalizeStats(res)), false);
  }

  /** Busca o resumo. Só a resposta do pedido mais recente (e de antes de um logout) é desenhada. */
  function load(app) {
    if (app) appRef = app;
    var token = sessionToken(appRef);
    if (!token || !dom()) return;
    wire();
    var mine = ++generation;
    showLoading();
    appRef.callApi('apiAdminUsageStats', token).then(function (res) {
      if (mine !== generation) return;
      if (!res || res.success !== true) showError(res);
      else render(res);
    });
  }

  /** "Atualizar" e "Tentar de novo" (data-action): repete o pedido com a mesma ponte window.App. */
  function reload() { load(null); }

  /** Logout/expiração: descarta respostas pendentes e tira os números da tela. */
  function reset() {
    generation++;
    appRef = null;
    var box = container();
    if (!box || !dom()) return;
    dom().clear(box);
    box.removeAttribute('aria-busy');
  }

  var api = { load: load, reload: reload, reset: reset };
  var pure = {
    plural: plural, ratioLabel: ratioLabel, dayLabel: dayLabel, normalizeStats: normalizeStats,
    isEmptyStats: isEmptyStats, errorMessage: errorMessage,
  };

  // Navegador: window.LaiftAdminUsage. Node: module.exports, para scripts/admin-usage.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftAdminUsage = api;
  }
})();
