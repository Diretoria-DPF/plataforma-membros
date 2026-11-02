// Eventos v2 (flag events_v2_enabled; docs/eventos-v2.md): próximo evento em destaque, filtros (Todos, Minhas inscrições,
// Com vagas), cartões com Inscrever-se / Cancelar inscrição e o histórico de concluídos. Os dados e as ações são os de
// sempre: o app.js continua chamando apiListEvents, apiRegisterForEvent, apiCancelEventRegistration e
// apiListRecentCompletedEvents e entrega o resultado a este módulo, que só desenha. Carregado SOB DEMANDA (pacote
// "eventos2" de lazy-bundles.js). Só DOM seguro: createElement, createElementNS e textContent (nada de innerHTML).
// Expõe window.LaiftEventsV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var HOST_ID = 'events-v2';
  var PANEL_ID = 'panel-events';
  var STATUS_ID = 'events-v2-status';
  var STYLE_HREF = 'events-v2.css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var FILTERS = [['all', 'Todos'], ['mine', 'Minhas inscrições'], ['open', 'Com vagas']];
  var ICON_CHAT = 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 21 12z';

  // ---------- Funções puras ----------

  function plural(n, one, many) { return n === 1 ? one : many; }

  function toDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Dia e mês abreviado do evento ("07", "nov"); data inválida, traços. */
  function dayParts(iso) {
    var d = toDate(iso);
    if (!d) return { day: '--', month: '---' };
    return { day: (d.getDate() < 10 ? '0' : '') + d.getDate(), month: MONTHS[d.getMonth()] };
  }

  /** "sex · 19h" ou "sex · 19h30"; data inválida, vazio. */
  function whenText(iso) {
    var d = toDate(iso);
    if (!d) return '';
    var minutes = d.getMinutes();
    return WEEKDAYS[d.getDay()] + ' · ' + d.getHours() + 'h' + (minutes ? (minutes < 10 ? '0' : '') + minutes : '');
  }

  /** Eventos em ordem de data (cópia; datas inválidas vão para o fim). */
  function sortEvents(items) {
    return (Array.isArray(items) ? items : []).slice().sort(function (a, b) {
      var ta = toDate(a && a.eventDate); var tb = toDate(b && b.eventDate);
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.getTime() - tb.getTime();
    });
  }

  function isFull(item) { return !!item && item.capacity !== null && item.capacity !== undefined && item.spotsLeft === 0; }

  /** Estado do evento para a pessoa: 'registered' | 'full' | 'open'. */
  function eventState(item) {
    if (item && item.isRegistered) return 'registered';
    return isFull(item) ? 'full' : 'open';
  }

  /** Texto de vagas, só com os números reais (capacity e spotsLeft). */
  function spotsText(item) {
    if (!item || item.capacity === null || item.capacity === undefined) return 'Vagas ilimitadas';
    if (item.spotsLeft === 0) return 'Sem vagas';
    return item.spotsLeft + ' ' + plural(item.spotsLeft, 'vaga restante', 'vagas restantes');
  }

  /** Filtros: Todos, Minhas inscrições (isRegistered) e Com vagas (não lotado). */
  function filterEvents(items, filter) {
    var list = Array.isArray(items) ? items : [];
    if (filter === 'mine') return list.filter(function (item) { return item.isRegistered === true; });
    if (filter === 'open') return list.filter(function (item) { return !isFull(item); });
    return list.slice();
  }

  /** Próximo evento em destaque: o primeiro por data que ainda tem vaga (ou em que a pessoa está inscrita); senão, o primeiro. */
  function pickNext(items) {
    var sorted = sortEvents(items);
    for (var i = 0; i < sorted.length; i++) if (!isFull(sorted[i]) || sorted[i].isRegistered) return sorted[i];
    return sorted[0] || null;
  }

  /**
   * Ação do cartão: 'login' (sem sessão), 'cancel' (inscrito e ainda pode cancelar), 'none' (inscrito sem cancelar),
   * 'full' (sem vagas) ou 'register'. Mesmas regras de visibilidade da tela de sempre.
   */
  function actionKind(item, loggedIn, canCancel) {
    if (!loggedIn) return 'login';
    if (item.isRegistered) return canCancel ? 'cancel' : 'none';
    return isFull(item) ? 'full' : 'register';
  }

  // ---------- DOM seguro ----------

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = text;
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function button(doc, className, label, onClick) {
    var node = el(doc, 'button', className, label);
    node.setAttribute('type', 'button');
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  function chatIcon(doc) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ev2-ico');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICON_CHAT);
    svg.appendChild(path);
    return svg;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[data-events-v2-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute('data-events-v2-css', '1');
    doc.head.appendChild(link);
  }

  function openGuia() {
    var open = function () { if (root.LaiftAssistant && root.LaiftAssistant.open) root.LaiftAssistant.open(); };
    if (root.LaiftAssistant) { open(); return; }
    if (root.LaiftLazy) root.LaiftLazy.load('lia').then(open, open);
  }

  function tag(doc, text, kind) { return el(doc, 'span', 'ev2-tag' + (kind ? ' ev2-tag--' + kind : ''), text); }

  /** Selos de situação do evento (Em andamento, Inscrição confirmada, Sem vagas ou vagas restantes). */
  function statusTags(doc, item) {
    var state = eventState(item);
    var tags = [];
    if (item.status === 'in_progress') tags.push(tag(doc, 'Em andamento', 'live'));
    if (state === 'registered') tags.push(tag(doc, 'Inscrição confirmada', 'ok'));
    else if (state === 'full') tags.push(tag(doc, 'Sem vagas', 'warn'));
    else tags.push(tag(doc, spotsText(item)));
    return tags;
  }

  /** Botão (ou aviso) de inscrição conforme as regras de sempre; devolve um nó ou null. */
  function actionNode(ctx, item) {
    var doc = ctx.doc;
    var kind = actionKind(item, ctx.loggedIn, ctx.loggedIn && item.isRegistered ? ctx.canCancel(item) : false);
    var node = null;
    if (kind === 'login') return el(doc, 'span', 'ev2-muted', 'Faça login para se inscrever.');
    if (kind === 'none') return null;
    if (kind === 'full') {
      node = button(doc, 'ev2-btn ev2-btn--sec', 'Sem vagas');
      node.disabled = true;
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute('aria-label', 'Sem vagas: ' + item.title);
      return node;
    }
    var cancel = kind === 'cancel';
    node = button(doc, 'ev2-btn' + (cancel ? ' ev2-btn--sec' : ''), cancel ? 'Cancelar inscrição' : 'Inscrever-se', function () {
      if (cancel) ctx.onCancel(item.id); else ctx.onRegister(item.id);
    });
    node.setAttribute('aria-label', (cancel ? 'Cancelar inscrição: ' : 'Inscrever-se: ') + item.title);
    node.setAttribute('data-ev-id', String(item.id));
    return node;
  }

  function metaLine(item) {
    return [whenText(item.eventDate), item.location].filter(Boolean).join(' · ');
  }

  function dateTile(doc, iso) {
    var parts = dayParts(iso);
    var date = el(doc, 'div', 'ev2-date');
    date.setAttribute('aria-hidden', 'true');
    date.appendChild(el(doc, 'b', '', parts.day));
    date.appendChild(el(doc, 'span', '', parts.month));
    return date;
  }

  /** Cartão de evento da lista. */
  function buildCard(ctx, item) {
    var doc = ctx.doc;
    var card = el(doc, 'article', 'ev2-card' + (eventState(item) === 'full' ? ' is-full' : ''));
    var text = el(doc, 'div', 'ev2-text');
    text.appendChild(el(doc, 'h3', 'ev2-card__title', item.title));
    var when = ctx.formatDate ? ctx.formatDate(item.eventDate) : '';
    text.appendChild(el(doc, 'p', 'ev2-card__meta', [when, item.location].filter(Boolean).join(' · ')));
    if (item.description) text.appendChild(el(doc, 'p', 'ev2-card__desc', item.description));
    if (item.imageUrl && ctx.imageButton) text.appendChild(ctx.imageButton(item.imageUrl, item.title));
    var tags = el(doc, 'p', 'ev2-tags');
    statusTags(doc, item).forEach(function (t) { tags.appendChild(t); });
    text.appendChild(tags);
    card.appendChild(dateTile(doc, item.eventDate));
    card.appendChild(text);
    var action = actionNode(ctx, item);
    if (action) {
      var box = el(doc, 'div', 'ev2-actions');
      box.appendChild(action);
      card.appendChild(box);
    }
    return card;
  }

  /** Próximo evento em destaque. */
  function buildNext(ctx, item) {
    var doc = ctx.doc;
    var card = el(doc, 'article', 'ev2-next__card');
    card.setAttribute('aria-labelledby', 'ev2-next-title');
    var parts = dayParts(item.eventDate);
    card.appendChild(el(doc, 'span', 'ev2-kicker', 'Próximo evento · ' + parts.day + ' ' + parts.month));
    var title = el(doc, 'h2', 'ev2-next__title', item.title);
    title.id = 'ev2-next-title';
    card.appendChild(title);
    card.appendChild(el(doc, 'p', 'ev2-next__meta', [metaLine(item), spotsText(item)].filter(Boolean).join(' · ')));
    var tags = el(doc, 'p', 'ev2-tags');
    if (item.isRegistered) tags.appendChild(tag(doc, 'Inscrição confirmada', 'ok'));
    if (item.status === 'in_progress') tags.appendChild(tag(doc, 'Em andamento', 'live'));
    if (tags.firstChild) card.appendChild(tags);
    var action = actionNode(ctx, item);
    if (action) {
      if (action.tagName === 'BUTTON') action.className += ' ev2-btn--wide';
      card.appendChild(action);
    }
    return card;
  }

  // ---------- Montagem ----------

  var view = null; // { doc, host, slots, filter, ctx, events, chips }

  function buildHost(doc) {
    var host = el(doc, 'div', 'ev2');
    host.id = HOST_ID;
    var top = el(doc, 'header', 'ev2-top');
    var hello = el(doc, 'p', 'ev2-hello');
    hello.appendChild(el(doc, 'small', '', 'Liga'));
    hello.appendChild(el(doc, 'strong', '', 'Eventos'));
    var guia = button(doc, 'ev2-icon-btn', '', openGuia);
    guia.setAttribute('aria-label', 'Falar com a Guia');
    guia.appendChild(chatIcon(doc));
    top.appendChild(hello);
    top.appendChild(guia);
    var body = el(doc, 'div', 'ev2-body');
    var slots = {
      next: el(doc, 'section', 'ev2-next'),
      filters: el(doc, 'div', 'ev2-filters'),
      status: el(doc, 'p', 'ev2-status'),
      list: el(doc, 'section', 'ev2-section'),
      hist: el(doc, 'section', 'ev2-section'),
    };
    slots.next.setAttribute('aria-label', 'Próximo evento');
    slots.filters.setAttribute('role', 'group');
    slots.filters.setAttribute('aria-label', 'Filtrar eventos');
    slots.status.id = STATUS_ID;
    slots.status.setAttribute('role', 'status');
    slots.status.setAttribute('aria-live', 'polite');
    slots.list.setAttribute('aria-labelledby', 'ev2-h-list');
    var listHead = el(doc, 'h2', 'ev2-h', 'Próximos eventos');
    listHead.id = 'ev2-h-list';
    slots.list.appendChild(listHead);
    slots.listBody = el(doc, 'div', 'ev2-list');
    slots.list.appendChild(slots.listBody);
    slots.hist.setAttribute('aria-labelledby', 'ev2-h-hist');
    var histHead = el(doc, 'h2', 'ev2-h', 'Histórico');
    histHead.id = 'ev2-h-hist';
    slots.hist.appendChild(histHead);
    slots.hist.appendChild(el(doc, 'p', 'ev2-muted', 'Os últimos eventos concluídos pela liga.'));
    slots.histBody = el(doc, 'div', 'ev2-list');
    slots.hist.appendChild(slots.histBody);
    ['next', 'filters', 'status', 'list', 'hist'].forEach(function (name) { body.appendChild(slots[name]); });
    host.appendChild(top);
    host.appendChild(body);
    return { host: host, slots: slots };
  }

  /** Cria (uma vez) o contêiner da v2 no painel e marca o painel; a tela antiga some pelo CSS. */
  function mount(doc) {
    var panel = doc.getElementById(PANEL_ID);
    if (!panel) return null;
    ensureStyles(doc);
    if (view && view.doc === doc && doc.getElementById(HOST_ID)) { panel.setAttribute('data-v2', '1'); return view; }
    var built = buildHost(doc);
    var first = panel.firstElementChild;
    var after = first && first.tagName === 'H1' ? first.nextSibling : first;
    panel.insertBefore(built.host, after || null);
    view = { doc: doc, host: built.host, slots: built.slots, filter: 'all', ctx: null, events: [], chips: [] };
    FILTERS.forEach(function (pair) {
      var chip = button(doc, 'ev2-chip', pair[1], function () {
        view.filter = pair[0];
        if (view.ctx) paint();
        chip.focus();
      });
      chip.setAttribute('aria-pressed', String(pair[0] === 'all'));
      chip.setAttribute('data-filter', pair[0]);
      view.chips.push(chip);
      built.slots.filters.appendChild(chip);
    });
    panel.setAttribute('data-v2', '1');
    return view;
  }

  function setNode(slot, node) { clear(slot); if (node) slot.appendChild(node); }

  function emptyNode(doc, message) {
    return root.LaiftStates ? root.LaiftStates.createStateNode(doc, 'empty', { title: message }) : el(doc, 'p', 'ev2-muted', message);
  }

  /** Desenha destaque, filtros e lista com os eventos guardados; devolve o foco ao botão do mesmo evento. */
  function paint() {
    var doc = view.doc;
    var ctx = view.ctx;
    var active = doc.activeElement;
    var activeId = active && active.getAttribute ? active.getAttribute('data-ev-id') : null;
    var inNext = !!(activeId && view.slots.next.contains(active));
    var next = pickNext(view.events);
    setNode(view.slots.next, next ? buildNext(ctx, next) : null);
    view.slots.next.classList.toggle('hidden', !next);
    var filter = ctx.loggedIn || view.filter !== 'mine' ? view.filter : 'all';
    view.chips.forEach(function (chip) {
      var kind = chip.getAttribute('data-filter');
      chip.setAttribute('aria-pressed', String(kind === filter));
      chip.classList.toggle('hidden', kind === 'mine' && !ctx.loggedIn);
    });
    var items = sortEvents(filterEvents(view.events, filter));
    clear(view.slots.listBody);
    if (!view.events.length) view.slots.listBody.appendChild(emptyNode(doc, 'Não há eventos publicados no momento.'));
    else if (!items.length) view.slots.listBody.appendChild(emptyNode(doc, 'Nenhum evento neste filtro.'));
    else items.forEach(function (item) { view.slots.listBody.appendChild(buildCard(ctx, item)); });
    if (activeId) {
      var scope = inNext ? view.slots.next : view.slots.listBody;
      var target = scope.querySelector('[data-ev-id="' + activeId + '"]') || view.host.querySelector('[data-ev-id="' + activeId + '"]');
      if (target && target.focus) target.focus();
    }
  }

  /**
   * Mostra os eventos de apiListEvents. `ctx`: { doc, loggedIn, formatDate, canCancel(item), onRegister(id),
   * onCancel(id), imageButton(src, title) }, tudo vindo do app.js.
   */
  function renderEvents(ctx, events) {
    var v = mount(ctx.doc);
    if (!v) return false;
    v.ctx = ctx;
    v.events = Array.isArray(events) ? events : [];
    v.host.setAttribute('aria-busy', 'false');
    paint();
    return true;
  }

  /** Falha ao listar os eventos: estado de erro com nova tentativa. */
  function renderEventsError(doc, res, retry) {
    var v = mount(doc);
    if (!v) return false;
    v.events = [];
    v.ctx = null;
    v.host.setAttribute('aria-busy', 'false');
    setNode(v.slots.next, null);
    v.slots.next.classList.add('hidden');
    clear(v.slots.listBody);
    var message = res && res.message ? res.message : 'Confira a conexão e tente de novo.';
    v.slots.listBody.appendChild(root.LaiftStates
      ? root.LaiftStates.createStateNode(doc, 'error', { title: 'Não foi possível carregar os eventos', message: message, actionLabel: 'Tentar de novo', onAction: retry })
      : el(doc, 'p', 'ev2-muted', message));
    return true;
  }

  /** Estado de carregamento (esqueleto) enquanto a lista não chega. */
  function renderLoading(doc) {
    var v = mount(doc);
    if (!v) return false;
    v.host.setAttribute('aria-busy', 'true');
    if (!v.slots.listBody.firstChild && root.LaiftStates) v.slots.listBody.appendChild(root.LaiftStates.createSkeleton(doc, 3));
    return true;
  }

  function buildHistoryCard(doc, item, formatDate) {
    var card = el(doc, 'article', 'ev2-card is-past');
    var text = el(doc, 'div', 'ev2-text');
    text.appendChild(el(doc, 'h3', 'ev2-card__title', item.title));
    var meta = ['Realizado em: ' + (formatDate ? formatDate(item.eventDate) : ''), item.location ? 'Local: ' + item.location : ''];
    text.appendChild(el(doc, 'p', 'ev2-card__meta', meta.filter(Boolean).join(' · ')));
    if (item.description) text.appendChild(el(doc, 'p', 'ev2-card__desc', item.description));
    card.appendChild(dateTile(doc, item.eventDate));
    card.appendChild(text);
    card.appendChild(tag(doc, 'Concluído', 'gray'));
    return card;
  }

  /** Histórico (apiListRecentCompletedEvents): lista, vazio ou erro com nova tentativa. */
  function renderHistory(doc, res, formatDate, retry) {
    var v = mount(doc);
    if (!v) return false;
    var body = v.slots.histBody;
    clear(body);
    var ok = res && res.success !== false && Array.isArray(res.events);
    if (!ok) {
      body.appendChild(root.LaiftStates
        ? root.LaiftStates.createStateNode(doc, 'error', { title: 'Não foi possível carregar o histórico', message: (res && res.message) || 'Confira a conexão e tente de novo.', actionLabel: 'Tentar de novo', onAction: retry })
        : el(doc, 'p', 'ev2-muted', 'Não foi possível carregar o histórico.'));
      return true;
    }
    if (!res.events.length) { body.appendChild(emptyNode(doc, 'Ainda não há eventos concluídos no histórico.')); return true; }
    res.events.forEach(function (item) { body.appendChild(buildHistoryCard(doc, item, formatDate)); });
    return true;
  }

  function renderHistoryLoading(doc) {
    var v = mount(doc);
    if (v && !v.slots.histBody.firstChild && root.LaiftStates) v.slots.histBody.appendChild(root.LaiftStates.createSkeleton(doc, 2));
  }

  /** Flag desligada ou pacote sem uso: devolve a tela de sempre. */
  function reset(doc) {
    var host = doc && doc.getElementById(HOST_ID);
    var panel = doc && doc.getElementById(PANEL_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    if (panel) panel.removeAttribute('data-v2');
    view = null;
  }

  var api = {
    dayParts: dayParts, whenText: whenText, sortEvents: sortEvents, eventState: eventState, spotsText: spotsText,
    filterEvents: filterEvents, pickNext: pickNext, actionKind: actionKind, FILTERS: FILTERS,
    ensureStyles: ensureStyles, mount: mount, renderEvents: renderEvents, renderEventsError: renderEventsError,
    renderLoading: renderLoading, renderHistory: renderHistory, renderHistoryLoading: renderHistoryLoading, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftEventsV2 = api;
})(typeof self !== 'undefined' ? self : this);
