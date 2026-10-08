/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-moderation.js
 * Seção "Moderação da Lia" do painel admin de IA (ADR 0004, risco O28). Mostra o que
 * apiAdminAssistantModeration já devolve: incidentes por tipo de detecção, pessoas com
 * incidente (nível atual e maior nível, data do último incidente, suspensão em curso, última
 * detecção e última redenção), pessoas hoje em cada nível, tentativas e taxa de redenção.
 * O servidor nunca manda texto de mensagem; aqui também não se mostra nome (minimização de
 * dados): a pessoa aparece só por um trecho curto do identificador.
 *
 * Script clássico, carregado depois de modulos/shared/safe-dom.js e antes de app.js, que
 * chama load(window.App) ao abrir o painel de IA e reset() no logout/sessão expirada.
 * Nada de innerHTML: todo nó nasce de LaiftDom.h e todo texto (inclusive a mensagem de erro
 * da API) entra como nó de texto. Os botões usam data-action (LaiftDom.delegateActions).
 *
 * A autorização real é do servidor (requireRole admin); esconder o painel é conveniência.
 */
(function () {
  'use strict';

  var CONTAINER_ID = 'admin-moderation';
  var CARD_ID = 'admin-moderation-card';
  var ACTION_RELOAD = 'LaiftAdminModeration.reload';
  var DEFAULT_WINDOW_DAYS = 90;
  var SHORT_ID_LENGTH = 8;
  var LEVELS = [1, 2, 3];
  var LEVEL_LABELS = {
    0: 'Nível 0 — normal',
    1: 'Nível 1 — alerta',
    2: 'Nível 2 — aviso sério',
    3: 'Nível 3 — suspensão de 24 h',
  };
  var DETECTION_LABELS = { terms: 'por termos', llm: 'pela análise automática' };
  var ERROR_TITLE = 'Não foi possível carregar a moderação da Lia.';
  // Regra do ADR 0004: aparece na tela para quem administra saber por que o nível sobe e desce.
  var RULE_LINES = [
    'O nível sobe a cada incidente: 1 é alerta, 2 é aviso sério e 3 é suspensão de 24 horas.',
    'O nível cai 1 ponto a cada 30 dias corridos sem novo incidente, até voltar a 0.',
    'A suspensão (nível 3) só começa a decair depois de terminar e de passarem 30 dias sem incidente.',
    'Redenção aceita zera o nível na hora e não reinicia a contagem dos 30 dias.',
  ];

  var generation = 0; // descarta respostas de pedidos antigos e de antes do logout
  var wired = false;
  var appRef = null;

  // ---------- Funções puras (testadas em scripts/admin-moderation.test.mjs) ----------

  function toCount(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  /** Contador com plural pt-BR: "1 pessoa", "2 pessoas", "0 pessoas". */
  function plural(value, one, many) {
    var count = toCount(value);
    return count.toLocaleString('pt-BR') + ' ' + (count === 1 ? one : many);
  }

  function levelLabel(level) {
    var key = toCount(level);
    return LEVEL_LABELS[key] || 'Nível ' + key;
  }

  /** A taxa vem como fração (0 a 1); sem tentativa ela é null e vira traço. */
  function percentLabel(rate) {
    return typeof rate === 'number' && isFinite(rate) ? Math.round(rate * 100) + '%' : '—';
  }

  /** Só o começo do identificador: quem administra distingue as contas sem ver o id inteiro. */
  function shortId(profileId) {
    var id = String(profileId || '');
    return id ? id.slice(0, SHORT_ID_LENGTH) : 'sem identificador';
  }

  function countsByLevel(source) {
    var src = source || {};
    return { 1: toCount(src[1]), 2: toCount(src[2]), 3: toCount(src[3]) };
  }

  /** Última detecção: só os dois valores do servidor; qualquer outro vira null (e some da tela). */
  function detectionOf(value) {
    return value === 'terms' || value === 'llm' ? value : null;
  }

  function detectionLabel(detection) {
    return Object.prototype.hasOwnProperty.call(DETECTION_LABELS, detection) ? DETECTION_LABELS[detection] : '';
  }

  /** Suspensão que ainda vale: data válida no futuro (uma data que já passou não vira "Suspensa até"). */
  function isActiveSuspension(until, now) {
    var ms = typeof until === 'string' ? Date.parse(until) : NaN;
    return !isNaN(ms) && ms > now;
  }

  /** Só o que a action devolve por pessoa; nome nunca entra (minimização de dados): a conta é o começo do id. */
  function normalizePerson(person) {
    var p = person || {};
    return {
      id: shortId(p.profileId),
      incidents: toCount(p.incidents),
      maxLevel: toCount(p.maxLevel),
      lastAt: p.lastAt || null,
      currentLevel: toCount(p.currentLevel),
      suspendedUntil: p.suspendedUntil || null,
      lastDetection: detectionOf(p.lastDetection),
      lastRedeemedAt: p.lastRedeemedAt || null,
    };
  }

  /** Resposta do servidor em formato fixo: campo ausente vira 0/vazio, nunca quebra a tela. */
  function normalizeSummary(res) {
    var r = res || {};
    var incidents = r.incidents || {};
    var detection = incidents.byDetection || {};
    var redemption = r.redemption || {};
    return {
      windowDays: toCount(r.windowDays) || DEFAULT_WINDOW_DAYS,
      total: toCount(incidents.total),
      byDetection: { terms: toCount(detection.terms), llm: toCount(detection.llm) },
      byLevelAfter: countsByLevel(incidents.byLevelAfter),
      currentLevels: countsByLevel(r.currentLevels),
      redemption: {
        accepted: toCount(redemption.accepted),
        refused: toCount(redemption.refused),
        rate: typeof redemption.rate === 'number' ? redemption.rate : null,
      },
      people: (Array.isArray(r.people) ? r.people : []).map(normalizePerson),
    };
  }

  function isEmptySummary(summary) {
    var attempts = summary.redemption.accepted + summary.redemption.refused;
    var anyoneModerated = LEVELS.some(function (level) { return summary.currentLevels[level] > 0; });
    return summary.total === 0 && summary.people.length === 0 && attempts === 0 && !anyoneModerated;
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

  function incidentsBox(summary) {
    var d = summary.byDetection;
    var after = LEVELS.map(function (level) { return 'nível ' + level + ': ' + summary.byLevelAfter[level]; }).join(' · ');
    return statBox(plural(summary.total, 'incidente', 'incidentes') + ' nos últimos ' + summary.windowDays + ' dias', [
      'Motivo: ' + plural(d.terms, 'detectado por termo ofensivo', 'detectados por termo ofensivo')
        + ' · ' + plural(d.llm, 'confirmado pela avaliação da IA', 'confirmados pela avaliação da IA'),
      'Nível atingido no incidente — ' + after,
    ]);
  }

  function redemptionBox(summary) {
    var r = summary.redemption;
    var attempts = r.accepted + r.refused;
    if (!attempts) return statBox('Redenção: sem tentativas no período', ['Taxa de redenção: —']);
    return statBox('Taxa de redenção: ' + percentLabel(r.rate), [
      plural(r.accepted, 'aceita', 'aceitas') + ' · ' + plural(r.refused, 'recusada', 'recusadas')
        + ' (' + plural(attempts, 'tentativa', 'tentativas') + ')',
    ]);
  }

  function currentLevelRows(summary) {
    return LEVELS.map(function (level) {
      return h('div', { className: 'list-item ai-usage-row' }, [
        h('strong', null, [levelLabel(level)]),
        h('div', { className: 'meta-row' }, [h('span', null, [plural(summary.currentLevels[level], 'pessoa', 'pessoas')])]),
      ]);
    });
  }

  /** "Nível atual: [selo]": o selo de perigo é só o reforço; o nome do nível sempre vai escrito. */
  function levelFact(label, level) {
    var badge = level >= LEVELS[LEVELS.length - 1] ? 'badge banned' : 'badge';
    return h('span', null, [label + ': ', h('span', { className: badge }, [levelLabel(level)])]);
  }

  /** Segunda linha: só o que existe (suspensão que ainda vale, última detecção e última redenção). */
  function personExtras(person, formatDate, now) {
    var facts = [];
    if (isActiveSuspension(person.suspendedUntil, now)) facts.push(h('span', null, ['Suspensa até ' + formatDate(person.suspendedUntil)]));
    var how = detectionLabel(person.lastDetection);
    if (how) facts.push(h('span', null, ['Última detecção: ' + how]));
    if (person.lastRedeemedAt) facts.push(h('span', null, ['Última redenção: ' + formatDate(person.lastRedeemedAt)]));
    return facts.length ? h('div', { className: 'meta-row' }, facts) : null;
  }

  function personRow(person, formatDate, now) {
    return h('div', { className: 'list-item ai-usage-row' }, [
      h('strong', null, ['Conta ' + person.id]),
      h('div', { className: 'meta-row' }, [
        levelFact('Nível atual', person.currentLevel),
        levelFact('Maior nível no período', person.maxLevel),
        h('span', null, [plural(person.incidents, 'incidente', 'incidentes')]),
        h('span', null, ['Último incidente: ' + formatDate(person.lastAt)]),
      ]),
      personExtras(person, formatDate, now),
    ]);
  }

  function peopleSection(summary, formatDate) {
    var now = Date.now();
    var rows = summary.people.length
      ? summary.people.map(function (person) { return personRow(person, formatDate, now); })
      : [h('p', { className: 'empty-state' }, ['Nenhuma pessoa com incidente no período.'])];
    return [h('h3', null, ['Pessoas com incidentes (as mais recentes primeiro)'])].concat(rows);
  }

  function rulesSection() {
    return [
      h('h3', null, ['Como funciona']),
      h('ul', { className: 'muted' }, RULE_LINES.map(function (line) { return h('li', null, [line]); })),
    ];
  }

  function summaryNodes(summary, formatDate) {
    if (isEmptySummary(summary)) {
      var empty = h('p', { className: 'empty-state', tabindex: '-1' }, ['Nenhum incidente de moderação nos últimos ' + summary.windowDays + ' dias.']);
      return [empty].concat(rulesSection());
    }
    var boxes = h('div', { className: 'stat-grid', tabindex: '-1' }, [incidentsBox(summary), redemptionBox(summary)]);
    var situation = [h('h3', null, ['Situação atual (pessoas em cada nível)'])].concat(currentLevelRows(summary));
    return [boxes].concat(situation, peopleSection(summary, formatDate), rulesSection());
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
    var formatDate = appRef && appRef.formatDate ? appRef.formatDate : String;
    mount(summaryNodes(normalizeSummary(res), formatDate), false);
  }

  /** Busca o resumo. Só a resposta do pedido mais recente (e de antes de um logout) é desenhada. */
  function load(app) {
    if (app) appRef = app;
    var token = sessionToken(appRef);
    if (!token || !dom()) return;
    wire();
    var mine = ++generation;
    showLoading();
    appRef.callApi('apiAdminAssistantModeration', token, {}).then(function (res) {
      if (mine !== generation) return;
      if (!res || res.success !== true) showError(res);
      else render(res);
    });
  }

  /** "Atualizar" e "Tentar de novo" (data-action): repete o pedido com a mesma ponte window.App. */
  function reload() { load(null); }

  /** Logout/expiração: descarta respostas pendentes e tira o resumo da tela. */
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
    plural: plural, levelLabel: levelLabel, percentLabel: percentLabel, shortId: shortId,
    normalizeSummary: normalizeSummary, isEmptySummary: isEmptySummary, errorMessage: errorMessage,
    isActiveSuspension: isActiveSuspension, detectionLabel: detectionLabel,
    RULE_LINES: RULE_LINES,
  };

  // Navegador: window.LaiftAdminModeration. Node: module.exports, para scripts/admin-moderation.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftAdminModeration = api;
  }
})();
