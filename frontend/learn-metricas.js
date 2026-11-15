/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * learn-metricas.js — "Conquistas e métricas" do Aprender v2. Carregado SOB DEMANDA (pacote "metricas" de lazy-bundles.js)
 * quando a pessoa abre o bloco. Só usa dados que a tela já buscou (estatísticas, sequência, tópicos fracos); sem requisição nova,
 * sem telemetria, sem gravação. O modelo (buildModel) é puro; render monta o DOM por createElement/createElementNS.
 */
(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var DAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  var CENTENA_GOAL = 100;

  function plural(n, one, many) { return n === 1 ? one : many; }
  function count(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  function pct(v) { if (v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null; }

  /** Sete dias terminando hoje; os acesos são os últimos da sequência (a API informa só a sequência atual). */
  function weekSeries(streak, now) {
    var current = streak && streak.current > 0 ? Math.floor(streak.current) : 0;
    var endIndex = streak && streak.activeToday ? 6 : 5;
    var out = [];
    for (var i = 0; i < 7; i++) {
      var date = new Date(now.getTime() - (6 - i) * 86400000);
      var weekday = date.getDay();
      out.push({ initial: DAY_INITIALS[weekday], name: DAY_NAMES[weekday], on: i <= endIndex && i > endIndex - current, today: i === 6 });
    }
    return out;
  }

  /** Modelo puro. input: { stats, streak, modules:[{id,stat,name}], weak:[{id,title,sub}], now }. */
  function buildModel(input) {
    var stats = input && input.stats ? input.stats : null;
    var streak = input && input.streak ? input.streak : null;
    var now = input && input.now ? input.now : new Date();
    var answered = stats ? count(stats.questionsAnswered) : 0;
    var current = streak && streak.current > 0 ? Math.floor(streak.current) : 0;
    var best = Math.max(current, streak && streak.best > 0 ? Math.floor(streak.best) : 0);
    var byModule = stats && stats.byModule ? stats.byModule : {};
    var modules = (input && input.modules ? input.modules : []).map(function (m) {
      var data = byModule[m.stat];
      return { id: m.id, name: m.name, pct: data ? pct(data.accuracyPct) : null, attempts: data ? count(data.attempts) : 0 };
    }).filter(function (m) { return m.attempts > 0 || m.pct !== null; });
    var centenaUnlocked = !!(stats && Array.isArray(stats.badges) && stats.badges.some(function (b) { return b && b.id === 'centena' && b.unlocked; }));
    return {
      isEmpty: answered === 0 && current === 0 && !modules.length,
      streak: current, best: best, answered: answered,
      accuracy: stats ? pct(stats.accuracyPct) : null,
      week: weekSeries(streak, now),
      modules: modules,
      weak: input && input.weak ? input.weak : [],
      next: stats && !centenaUnlocked ? { label: 'Centena', done: Math.min(answered, CENTENA_GOAL), total: CENTENA_GOAL } : null,
    };
  }

  function weekSummary(week) {
    var days = week.filter(function (d) { return d.on; });
    var total = days.length;
    return total + ' ' + plural(total, 'dia', 'dias') + ' de estudo nos últimos 7 dias' + (total ? ' (' + days.map(function (d) { return d.name; }).join(', ') + ')' : '');
  }

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = text;
    return node;
  }

  function stat(doc, label, value) {
    var box = el(doc, 'div', 'l2-met__stat');
    box.appendChild(el(doc, 'b', '', value === null ? '—' : String(value)));
    box.appendChild(el(doc, 'small', '', label));
    return box;
  }

  function chart(doc, week) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 280 80');
    svg.setAttribute('class', 'l2-met__chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', weekSummary(week));
    week.forEach(function (d, i) {
      var rect = doc.createElementNS(SVG_NS, 'rect');
      var h = d.on ? 54 : 10;
      rect.setAttribute('x', String(i * 40 + 6)); rect.setAttribute('y', String(60 - h));
      rect.setAttribute('width', '28'); rect.setAttribute('height', String(h)); rect.setAttribute('rx', '3');
      rect.setAttribute('class', 'l2-met__col' + (d.on ? ' is-on' : ''));
      svg.appendChild(rect);
      var label = doc.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(i * 40 + 20)); label.setAttribute('y', '76'); label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'l2-met__lbl'); label.setAttribute('aria-hidden', 'true');
      label.textContent = d.initial;
      svg.appendChild(label);
    });
    return svg;
  }

  function weekTable(doc, week) {
    var details = el(doc, 'details', 'l2-met__table');
    details.appendChild(el(doc, 'summary', '', 'Ver em tabela'));
    var table = el(doc, 'table');
    table.appendChild(el(doc, 'caption', '', 'Estudo nos últimos 7 dias'));
    var head = el(doc, 'tr');
    ['Dia', 'Estudou'].forEach(function (t) { var th = el(doc, 'th', '', t); th.setAttribute('scope', 'col'); head.appendChild(th); });
    table.appendChild(head);
    week.forEach(function (d) {
      var tr = el(doc, 'tr');
      var th = el(doc, 'th', '', d.name + (d.today ? ' (hoje)' : '')); th.setAttribute('scope', 'row');
      tr.appendChild(th); tr.appendChild(el(doc, 'td', '', d.on ? 'Sim' : 'Não'));
      table.appendChild(tr);
    });
    details.appendChild(table);
    return details;
  }

  function bar(doc, value, label) {
    var track = el(doc, 'span', 'l2-bar');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', label);
    var fill = el(doc, 'i');
    fill.style.setProperty('--p', (value === null ? 0 : value) + '%');
    track.appendChild(fill);
    return track;
  }

  function emptyState(doc, onStart) {
    var box = el(doc, 'div', 'l2-met__empty');
    box.appendChild(el(doc, 'p', '', 'Suas métricas aparecem depois do primeiro quiz. Responda algumas questões de Farmacologia para começar.'));
    var button = el(doc, 'button', 'l2-met__btn', 'Fazer o primeiro quiz');
    button.type = 'button';
    button.addEventListener('click', onStart);
    box.appendChild(button);
    return box;
  }

  function moduleList(doc, modules) {
    var list = el(doc, 'ul', 'l2-met__list');
    modules.forEach(function (m) {
      var li = el(doc, 'li', 'l2-met__row');
      li.appendChild(el(doc, 'span', 'l2-met__name', m.name));
      li.appendChild(el(doc, 'strong', '', m.pct === null ? '—' : m.pct + '%'));
      li.appendChild(bar(doc, m.pct, m.pct === null ? 'Sem nota registrada em ' + m.name : 'Acerto de ' + m.pct + '% em ' + m.name));
      list.appendChild(li);
    });
    return list;
  }

  function weakList(doc, weak, openModule) {
    var list = el(doc, 'ul', 'l2-met__list');
    weak.forEach(function (w) {
      var li = el(doc, 'li', 'l2-met__row');
      var text = el(doc, 'span', 'l2-met__name');
      text.appendChild(el(doc, 'strong', '', w.title));
      text.appendChild(el(doc, 'small', '', w.sub));
      li.appendChild(text);
      var button = el(doc, 'button', 'l2-met__btn', 'Treinar');
      button.type = 'button';
      button.setAttribute('aria-label', 'Treinar ' + w.title);
      button.addEventListener('click', function () { openModule(w.id); });
      li.appendChild(button);
      list.appendChild(li);
    });
    return list;
  }

  /** Preenche `body` (já vazio). actions: { openModule(id), startFirst() }. */
  function render(doc, body, model, actions) {
    if (model.isEmpty) { body.appendChild(emptyState(doc, actions.startFirst)); return; }
    var stats = el(doc, 'div', 'l2-met__stats');
    stats.appendChild(stat(doc, plural(model.streak, 'dia seguido', 'dias seguidos'), model.streak));
    stats.appendChild(stat(doc, 'melhor sequência', model.best));
    stats.appendChild(stat(doc, 'questões resolvidas', model.answered));
    stats.appendChild(stat(doc, 'acerto geral', model.accuracy === null ? null : model.accuracy + '%'));
    body.appendChild(stats);

    body.appendChild(el(doc, 'h3', 'l2-met__h', 'Estudo nos últimos 7 dias'));
    body.appendChild(chart(doc, model.week));
    body.appendChild(weekTable(doc, model.week));

    if (model.modules.length) {
      body.appendChild(el(doc, 'h3', 'l2-met__h', 'Acerto por módulo'));
      body.appendChild(moduleList(doc, model.modules));
    }
    if (model.weak.length) {
      body.appendChild(el(doc, 'h3', 'l2-met__h', 'Temas para reforçar'));
      body.appendChild(weakList(doc, model.weak, actions.openModule));
    }
    if (model.next) {
      var p = Math.round((model.next.done * 100) / model.next.total);
      var next = el(doc, 'div', 'l2-met__next');
      next.appendChild(el(doc, 'p', '', 'Próxima conquista, ' + model.next.label + ': ' + model.next.done + ' de ' + model.next.total + ' questões.'));
      next.appendChild(bar(doc, p, model.next.label + ': ' + p + '% concluído'));
      body.appendChild(next);
    }
  }

  var api = { buildModel: buildModel, weekSeries: weekSeries, weekSummary: weekSummary, render: render };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftLearnMetricas = api;
})(typeof self !== 'undefined' ? self : this);
