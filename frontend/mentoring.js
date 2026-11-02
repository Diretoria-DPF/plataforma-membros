/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mentoria entre membros (docs/mentoria.md; ROL-04), tela "Mentoria" do menu Participação, atrás da flag mentoring_enabled.
// Carregado SOB DEMANDA (pacote "mentoria" de lazy-bundles.js), só ao abrir a tela. Para quem busca mentoria: escolher
// um mentor, acompanhar o pedido e decidir se compartilha o progresso. Para quem mentora: interruptor de disponibilidade,
// pedidos recebidos, mentorados e o resumo que cada pessoa compartilhou. Só DOM seguro (createElement e textContent),
// sem innerHTML nem estilo inline (CSP). Quem decide de verdade é a Worker: vínculo, papel, flag e limites em cada chamada.
(function (root) {
  'use strict';

  var MSG_ID = 'msg-mentoring';
  var STYLE_HREF = 'mentoring.css';
  var STATUS_TEXT = {
    mentee: { pending: 'Aguardando resposta', active: 'Mentoria ativa', declined: 'Pedido recusado', ended: 'Encerrada' },
    mentor: { pending: 'Pedido recebido', active: 'Mentoria ativa', declined: 'Pedido recusado por você', ended: 'Encerrada' },
  };
  var MODULE_LABELS = { farmacologia: 'Farmacologia', toxicologia: 'Toxicologia', clinica: 'Clínica', laboratorio: 'Laboratório', anatomia: 'Anatomia' };
  var NO_CONNECTION_HINT = 'Para conversar, conecte-se com esta pessoa em Mensagens (pedido por nome de usuário).';
  var busy = false;
  var wired = false;
  var generation = 0;
  var focusAfter = null;
  var summaries = {};
  var current = null;

  function app() { return root.App; }
  function el(id) { return root.document.getElementById(id); }
  function token() { var s = app().getState(); return (s && s.sessionToken) || ''; }
  function say(message, kind) { app().setStatus(MSG_ID, message, kind || null); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function node(doc, tag, className, text) {
    var n = doc.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /** Frase curta do estado do vínculo para a pessoa da sessão (nunca só por cor). */
  function statusText(link) {
    var table = STATUS_TEXT[link && link.myRole === 'mentor' ? 'mentor' : 'mentee'];
    return (link && Object.prototype.hasOwnProperty.call(table, link.status)) ? table[link.status] : 'Situação desconhecida';
  }

  function pctText(value) { return typeof value === 'number' ? value + '% de acerto' : 'sem nota ainda'; }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /** Linhas legíveis do resumo agregado (a Worker já manda só o agregado). */
  function summaryLines(summary) {
    if (!summary || typeof summary !== 'object') return [];
    var lines = [
      'Acerto geral: ' + (typeof summary.accuracyPct === 'number' ? summary.accuracyPct + '%' : 'sem nota ainda'),
      'Questões respondidas: ' + (Number(summary.questionsAnswered) || 0),
      'Atividades concluídas: ' + (Number(summary.totalActivities) || 0),
    ];
    var streak = summary.streak || {};
    lines.push('Sequência: ' + plural(Number(streak.current) || 0, 'dia', 'dias') + ' (melhor: ' + plural(Number(streak.best) || 0, 'dia', 'dias') + ')');
    (Array.isArray(summary.modules) ? summary.modules : []).forEach(function (m) {
      var label = Object.prototype.hasOwnProperty.call(MODULE_LABELS, m.module) ? MODULE_LABELS[m.module] : null;
      if (label) lines.push(label + ': ' + plural(Number(m.attempts) || 0, 'atividade', 'atividades') + ', ' + pctText(m.accuracyPct));
    });
    return lines;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[data-mentoring-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute('data-mentoring-css', '1');
    doc.head.appendChild(link);
  }

  function run(promise, okMessage) {
    if (busy) return;
    busy = true;
    Promise.resolve(promise).then(function (res) {
      busy = false;
      if (!res || res.success !== true) { say((res && res.message) || 'Não foi possível concluir.', 'error'); return undefined; }
      return reload().then(function () { say(okMessage || res.message || 'Feito.', 'success'); });
    }).catch(function () { busy = false; say('Não foi possível concluir. Tente de novo.', 'error'); });
  }

  function button(label, ariaLabel, action, onClick) {
    var b = node(root.document, 'button', 'secondary mt-btn', label);
    b.type = 'button';
    b.setAttribute('aria-label', ariaLabel);
    b.setAttribute('data-action', action);
    b.addEventListener('click', onClick);
    return b;
  }

  function switchButton(label, ariaLabel, action, checked, onClick) {
    var b = button(label, ariaLabel, action, onClick);
    b.className += ' mt-switch';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', checked ? 'true' : 'false');
    return b;
  }

  function personName(link) { return (link.peer && link.peer.fullName) || 'esta pessoa'; }

  function afterAction(link, action, promise, okMessage) {
    focusAfter = { id: link.id, action: action };
    run(promise, okMessage);
  }

  function confirmEnd(link, message, okMessage) {
    app().openConfirm(message, function () {
      afterAction(link, 'end', app().callApi('apiMentoringEnd', token(), { id: link.id }), okMessage);
    });
  }

  function chatButton(link) {
    return button('Enviar mensagem', 'Enviar mensagem para ' + personName(link), 'chat', function () {
      var p = link.peer;
      if (root.LaiftMessaging && typeof root.LaiftMessaging.openConversationWithPeer === 'function') {
        root.LaiftMessaging.openConversationWithPeer({ id: p.id, fullName: p.fullName, username: p.username, avatarUrl: p.avatarUrl });
      }
    });
  }

  function menteeActions(link) {
    var who = personName(link);
    var out = [];
    if (link.status === 'pending' || link.status === 'active') {
      out.push(switchButton(link.shareProgress ? 'Compartilhando o progresso' : 'Compartilhar meu progresso',
        'Compartilhar meu progresso com ' + who, 'share', link.shareProgress, function () {
          afterAction(link, 'share', app().callApi('apiMentoringSetShare', token(), { id: link.id, share: !link.shareProgress }),
            link.shareProgress ? 'Compartilhamento desligado.' : 'Compartilhamento ligado.');
        }));
    }
    if (link.status === 'pending') {
      out.push(button('Cancelar pedido', 'Cancelar pedido de mentoria a ' + who, 'end', function () {
        confirmEnd(link, 'Cancelar o pedido de mentoria a ' + who + '?', 'Pedido cancelado.');
      }));
    }
    if (link.status === 'active') {
      out.push(button('Encerrar mentoria', 'Encerrar mentoria com ' + who, 'end', function () {
        confirmEnd(link, 'Encerrar a mentoria com ' + who + '? O compartilhamento do seu progresso termina.', 'Mentoria encerrada.');
      }));
      if (link.connected) out.push(chatButton(link));
    }
    return out;
  }

  function mentorActions(link) {
    var who = personName(link);
    var out = [];
    if (link.status === 'pending') {
      out.push(button('Aceitar', 'Aceitar pedido de ' + who, 'accept', function () {
        afterAction(link, 'accept', app().callApi('apiMentoringRespond', token(), { id: link.id, accept: true }), 'Mentoria aceita.');
      }));
      out.push(button('Recusar', 'Recusar pedido de ' + who, 'decline', function () {
        afterAction(link, 'decline', app().callApi('apiMentoringRespond', token(), { id: link.id, accept: false }), 'Pedido recusado.');
      }));
    }
    if (link.status === 'active') {
      if (link.shareProgress) {
        var open = Object.prototype.hasOwnProperty.call(summaries, link.id);
        var toggle = button(open ? 'Ocultar resumo' : 'Ver resumo de progresso', (open ? 'Ocultar' : 'Ver') + ' o resumo de progresso de ' + who, 'summary', function () {
          if (open) { delete summaries[link.id]; focusAfter = { id: link.id, action: 'summary' }; renderAll(); return; }
          loadSummary(link);
        });
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        out.push(toggle);
      }
      out.push(button('Encerrar mentoria', 'Encerrar mentoria com ' + who, 'end', function () {
        confirmEnd(link, 'Encerrar a mentoria com ' + who + '?', 'Mentoria encerrada.');
      }));
      if (link.connected) out.push(chatButton(link));
    }
    return out;
  }

  function loadSummary(link) {
    if (busy) return;
    busy = true;
    Promise.resolve(app().callApi('apiMentoringGetMenteeProgress', token(), { id: link.id })).then(function (res) {
      busy = false;
      if (!res || res.success !== true) { say((res && res.message) || 'Não foi possível carregar o resumo.', 'error'); return; }
      summaries[link.id] = res.summary;
      focusAfter = { id: link.id, action: 'summary' };
      renderAll();
      say('', null);
    }).catch(function () { busy = false; say('Não foi possível carregar o resumo.', 'error'); });
  }

  function summaryBlock(doc, link) {
    var box = node(doc, 'div', 'mt-summary');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Resumo de progresso de ' + personName(link));
    var ul = node(doc, 'ul', 'mt-summary__list');
    summaryLines(summaries[link.id]).forEach(function (line) { ul.appendChild(node(doc, 'li', null, line)); });
    box.appendChild(ul);
    box.appendChild(node(doc, 'p', 'muted mt-note', 'Resumo agregado, sem respostas individuais. Vale enquanto a pessoa mantiver o compartilhamento ligado.'));
    return box;
  }

  function rowFor(doc, link) {
    var li = node(doc, 'li', 'mt-row' + (link.status === 'declined' || link.status === 'ended' ? ' mt-row--off' : ''));
    li.setAttribute('data-id', link.id);
    var text = node(doc, 'div', 'mt-row__text');
    text.appendChild(node(doc, 'strong', 'mt-row__name', personName(link)));
    var meta = statusText(link);
    if (link.status === 'pending' || link.status === 'active') {
      if (link.myRole === 'mentee') meta += link.shareProgress ? ' · você compartilha o progresso' : ' · você não compartilha o progresso';
      else meta += link.shareProgress ? ' · compartilha o progresso com você' : ' · não compartilha o progresso';
    }
    text.appendChild(node(doc, 'small', 'mt-row__meta', meta));
    if (link.status === 'active' && !link.connected) text.appendChild(node(doc, 'small', 'mt-row__meta', NO_CONNECTION_HINT));
    li.appendChild(text);
    var actions = node(doc, 'div', 'mt-row__actions');
    (link.myRole === 'mentor' ? mentorActions(link) : menteeActions(link)).forEach(function (b) { actions.appendChild(b); });
    li.appendChild(actions);
    if (link.myRole === 'mentor' && link.status === 'active' && link.shareProgress && Object.prototype.hasOwnProperty.call(summaries, link.id)) {
      li.appendChild(summaryBlock(doc, link));
    }
    return li;
  }

  function mentorRow(doc, mentor, shareOnRequest) {
    var li = node(doc, 'li', 'mt-row');
    var text = node(doc, 'div', 'mt-row__text');
    text.appendChild(node(doc, 'strong', 'mt-row__name', mentor.fullName));
    if (mentor.username) text.appendChild(node(doc, 'small', 'mt-row__meta', '@' + mentor.username));
    li.appendChild(text);
    var actions = node(doc, 'div', 'mt-row__actions');
    if (mentor.linkStatus) {
      actions.appendChild(node(doc, 'span', 'mt-badge', mentor.linkStatus === 'active' ? 'Mentoria ativa' : 'Pedido enviado'));
    } else {
      actions.appendChild(button('Pedir mentoria', 'Pedir mentoria a ' + mentor.fullName, 'request', function () {
        focusAfter = { id: null, action: 'mentors' };
        run(app().callApi('apiMentoringRequest', token(), { mentorId: mentor.id, shareProgress: Boolean(shareOnRequest()) }), 'Pedido de mentoria enviado.');
      }));
    }
    li.appendChild(actions);
    return li;
  }

  function fill(listId, emptyId, items, build) {
    var ul = el(listId);
    clear(ul);
    items.forEach(function (item) { ul.appendChild(build(item)); });
    el(emptyId).classList.toggle('hidden', items.length > 0);
  }

  function restoreFocus() {
    var target = focusAfter;
    focusAfter = null;
    if (!target) return;
    var doc = root.document;
    var scope = target.id ? doc.querySelector('#panel-mentoring [data-id="' + target.id + '"]') : doc.getElementById('mentoring-mentors');
    var found = scope ? scope.querySelector('[data-action="' + target.action + '"]:not([disabled])') : null;
    if (!found) found = doc.getElementById('mentoring-title');
    if (found && typeof found.focus === 'function') found.focus();
  }

  /** Avisa a Mentoria v2 (mentoring-v2.js, só com a flag) de que a tela foi desenhada; sem ouvinte, não faz nada. */
  function notifyRendered() {
    try {
      if (root.document && typeof root.CustomEvent === 'function') root.document.dispatchEvent(new root.CustomEvent('laift:mentoring-render'));
    } catch (e) { /* só enfeite: a tela de sempre não depende disso */ }
  }

  function renderAll() {
    var data = current;
    if (!data) return;
    var doc = root.document;
    var off = data.overview.enabled === false;
    el('mentoring-off').classList.toggle('hidden', !off);
    el('mentoring-missing').classList.toggle('hidden', data.overview.tableMissing !== true);
    el('mentoring-body').classList.toggle('hidden', off || data.overview.tableMissing === true);
    if (off) { notifyRendered(); return; }
    var available = data.overview.available === true;
    var sw = el('btn-mentoring-available');
    sw.setAttribute('aria-checked', available ? 'true' : 'false');
    sw.textContent = available ? 'Estou disponível como mentor' : 'Não estou disponível como mentor';
    var asMentor = data.overview.asMentor || [];
    var showMentorCard = available || data.overview.hasMentorRole === true || asMentor.length > 0;
    el('mentoring-mentor-card').classList.toggle('hidden', !showMentorCard);
    fill('mentoring-as-mentee', 'mentoring-as-mentee-empty', data.overview.asMentee || [], function (l) { return rowFor(doc, l); });
    fill('mentoring-as-mentor', 'mentoring-as-mentor-empty', asMentor, function (l) { return rowFor(doc, l); });
    fill('mentoring-mentors', 'mentoring-mentors-empty', data.mentors || [], function (m) {
      return mentorRow(doc, m, function () { return el('mentoring-request-share').getAttribute('aria-checked') === 'true'; });
    });
    notifyRendered();
    restoreFocus();
  }

  function reload() {
    generation += 1;
    var mine = generation;
    return Promise.all([
      Promise.resolve(app().callApi('apiMentoringOverview', token())),
      Promise.resolve(app().callApi('apiMentoringListMentors', token())),
    ]).then(function (parts) {
      if (mine !== generation) return;
      var overview = parts[0];
      if (!overview || overview.success !== true) { say((overview && overview.message) || 'Não foi possível carregar a mentoria.', 'error'); return; }
      var mentors = parts[1] && parts[1].success === true && Array.isArray(parts[1].mentors) ? parts[1].mentors : [];
      Object.keys(summaries).forEach(function (id) {
        var still = (overview.asMentor || []).some(function (l) { return l.id === id && l.status === 'active' && l.shareProgress; });
        if (!still) delete summaries[id];
      });
      current = { overview: overview, mentors: mentors };
      renderAll();
    });
  }

  function wire() {
    if (wired) return;
    wired = true;
    el('btn-mentoring-available').addEventListener('click', function () {
      var next = el('btn-mentoring-available').getAttribute('aria-checked') !== 'true';
      focusAfter = { id: null, action: 'available' };
      run(app().callApi('apiMentoringSetAvailability', token(), { available: next }), next ? 'Você aparece como mentor disponível.' : 'Você não aparece mais como mentor disponível.');
    });
    var share = el('mentoring-request-share');
    share.addEventListener('click', function () {
      var on = share.getAttribute('aria-checked') !== 'true';
      share.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /** Abre a tela: estilos, controles (uma vez) e dados. */
  function load(appRef) {
    if (!appRef || !el('mentoring-body')) return Promise.resolve();
    ensureStyles(root.document);
    wire();
    summaries = {};
    say('Carregando...', 'info');
    return reload().then(function () { if (el(MSG_ID).getAttribute('data-kind') === 'info') say('', null); })
      .catch(function () { say('Não foi possível carregar a mentoria.', 'error'); });
  }

  /** Logout: solta respostas em voo e descarta o que estava na tela. */
  function reset() {
    generation += 1;
    summaries = {};
    current = null;
    focusAfter = null;
  }

  /** Os últimos dados desenhados ({ overview, mentors }), para a Mentoria v2 ler sem nova chamada à API. */
  function snapshot() { return current; }

  var api = { statusText: statusText, summaryLines: summaryLines, rowFor: rowFor, mentorRow: mentorRow, load: load, reset: reset, snapshot: snapshot };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftMentoring = api;
})(typeof self !== 'undefined' ? self : this);
