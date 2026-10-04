/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel "Início": mostra o que importa agora (próximos eventos, tarefas,
// votações, aprendizado e caixa de entrada) a partir de UMA chamada,
// apiGetHomeSummary. A regra de montagem dos cartões (buildCards) é pura e
// testada em Node; a renderização usa só createElement/textContent, nunca
// converte texto da API em HTML. Expõe window.LaiftHome.
(function (root) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var NEAR_DAYS = 6;

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toDate(iso) {
    if (iso === null || iso === undefined || iso === '') return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  /** "Bom dia, Maria" — só o primeiro nome; sem nome, só a saudação. */
  function greeting(fullName, now) {
    var hour = now.getHours();
    var salute = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    var first = String(fullName || '').trim().split(/\s+/)[0];
    return first ? salute + ', ' + first : salute;
  }

  /** hoje, amanhã, em N dias, ontem, há N dias ('' se a data for inválida). */
  function relativeDay(iso, now) {
    var date = toDate(iso);
    if (!date) return '';
    var diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff === -1) return 'ontem';
    return diff > 1 ? 'em ' + diff + ' dias' : 'há ' + (-diff) + ' dias';
  }

  /** "amanhã · 12:00" para datas próximas; "20 de out. · 12:00" para as distantes. */
  function formatWhen(iso, now) {
    var date = toDate(iso);
    if (!date) return '';
    var diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
    var day = diff >= -1 && diff <= NEAR_DAYS
      ? relativeDay(iso, now)
      : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    var time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return day + ' · ' + time;
  }

  function eventsCard(summary) {
    return {
      id: 'events',
      title: 'Próximos eventos',
      kind: 'list',
      items: (summary.nextEvents || []).map(function (e) {
        return { title: e.title, whenIso: e.eventDate, place: e.location || '', badge: e.isRegistered ? 'Inscrito' : null };
      }),
      emptyText: 'Nenhum evento à vista.',
      action: { label: 'Ver eventos', panel: 'panel-events' },
    };
  }

  function tasksCard(t, now) {
    var detail;
    if (t.next) {
      var rel = relativeDay(t.next.dueDate, now);
      detail = 'Próxima: ' + t.next.title + (rel ? ' — ' + rel : '');
    } else if (t.availableCount > 0) {
      detail = t.availableCount + ' ' + plural(t.availableCount, 'tarefa disponível', 'tarefas disponíveis') + ' para assumir.';
    } else {
      detail = 'Nenhuma tarefa por enquanto.';
    }
    return {
      id: 'tasks', title: 'Minhas tarefas', kind: 'metric',
      metric: String(t.myPendingCount), metricLabel: plural(t.myPendingCount, 'pendente', 'pendentes'),
      detail: detail, action: { label: 'Ver tarefas', panel: 'panel-tasks' },
    };
  }

  function votingCard(v, now) {
    var detail;
    if (v.pendingCount > 0) {
      var rel = relativeDay(v.nextClosesAt, now);
      detail = rel ? 'Encerra ' + rel + '.' : 'Votação aberta.';
    } else {
      detail = v.openCount > 0 ? 'Você já votou em tudo.' : 'Nenhuma votação aberta.';
    }
    return {
      id: 'voting', title: 'Votações', kind: 'metric',
      metric: String(v.pendingCount), metricLabel: 'para votar',
      detail: detail, action: { label: 'Votar', panel: 'panel-proposals' },
    };
  }

  function learningCard(l) {
    return {
      id: 'learning', title: 'Aprendizado', kind: 'metric',
      metric: l.accuracyPct === null || l.accuracyPct === undefined ? '—' : l.accuracyPct + '%',
      metricLabel: 'de acerto',
      detail: l.questionsAnswered + ' ' + plural(l.questionsAnswered, 'questão', 'questões') + ' · ' + l.unlockedBadges + ' de ' + l.totalBadges + ' selos',
      action: { label: 'Estudar', panel: 'panel-learn' },
    };
  }

  function inboxCard(i) {
    var detail;
    if (i.pendingConnectionRequests > 0) {
      detail = i.pendingConnectionRequests + ' ' + plural(i.pendingConnectionRequests, 'pedido de conexão', 'pedidos de conexão') + '.';
    } else {
      detail = i.unreadMessages > 0 ? 'Sem pedidos de conexão.' : 'Tudo em dia.';
    }
    return {
      id: 'inbox', title: 'Caixa de entrada', kind: 'metric',
      metric: String(i.unreadMessages), metricLabel: plural(i.unreadMessages, 'mensagem nova', 'mensagens novas'),
      detail: detail, action: { label: 'Abrir mensagens', panel: 'panel-messages' },
    };
  }

  /** Seções nulas no resumo (visitante) simplesmente não geram cartão. */
  function buildCards(summary, now) {
    var cards = [eventsCard(summary)];
    if (summary.tasks) cards.push(tasksCard(summary.tasks, now));
    if (summary.voting) cards.push(votingCard(summary.voting, now));
    if (summary.learning) cards.push(learningCard(summary.learning));
    if (summary.inbox) cards.push(inboxCard(summary.inbox));
    return cards;
  }

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderList(doc, card, now) {
    if (!card.items.length) return element(doc, 'p', 'muted', card.emptyText);
    var list = element(doc, 'ul', 'home-list');
    card.items.forEach(function (item) {
      var li = element(doc, 'li');
      var head = element(doc, 'div', 'home-list-head');
      head.appendChild(element(doc, 'strong', '', item.title));
      if (item.badge) head.appendChild(element(doc, 'span', 'badge', item.badge));
      li.appendChild(head);
      var when = formatWhen(item.whenIso, now);
      var meta = [when, item.place].filter(Boolean).join(' · ');
      if (meta) li.appendChild(element(doc, 'span', 'muted', meta));
      list.appendChild(li);
    });
    return list;
  }

  function renderMetric(doc, card) {
    var box = element(doc, 'div', 'home-metric');
    box.appendChild(element(doc, 'strong', 'home-metric-value', card.metric));
    box.appendChild(element(doc, 'span', 'home-metric-label', card.metricLabel));
    return box;
  }

  function renderCards(doc, host, cards, onNavigate, now) {
    cards.forEach(function (card) {
      var article = element(doc, 'article', 'card home-card home-card-' + card.id);
      article.appendChild(element(doc, 'h3', 'home-card-title', card.title));
      article.appendChild(card.kind === 'list' ? renderList(doc, card, now) : renderMetric(doc, card));
      if (card.detail) article.appendChild(element(doc, 'p', 'muted home-card-detail', card.detail));
      var button = element(doc, 'button', 'secondary', card.action.label);
      button.setAttribute('type', 'button');
      button.addEventListener('click', function () { onNavigate(card.action.panel); });
      article.appendChild(button);
      host.appendChild(article);
    });
  }

  function clear(node) {
    node.textContent = '';
  }

  /** Carrega e desenha o Início. `app` é window.App (callApi, getState, showPanel). */
  function load(app, doc) {
    var host = doc.getElementById('home-dashboard');
    if (!host) return Promise.resolve();
    var states = root.LaiftStates;
    var state = app.getState();
    var now = new Date();

    var greetingEl = doc.getElementById('home-greeting');
    if (greetingEl) greetingEl.textContent = greeting(state.profile && state.profile.fullName, now);

    clear(host);
    if (states) host.appendChild(states.createStateNode(doc, 'loading'));

    return app.callApi('apiGetHomeSummary', state.sessionToken || '').then(function (res) {
      clear(host);
      if (!res.success) {
        if (states) {
          host.appendChild(states.createStateNode(doc, 'error', {
            message: res.message,
            actionLabel: 'Tentar de novo',
            onAction: function () { load(app, doc); },
          }));
        }
        return;
      }
      renderCards(doc, host, buildCards(res.summary, now), function (panel) { app.showPanel(panel); }, now);
    });
  }

  var api = {
    greeting: greeting,
    relativeDay: relativeDay,
    buildCards: buildCards,
    renderCards: renderCards,
    load: load,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftHome = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
