/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Fila de pedidos de exclusão de conta (LGPD; só administradores; a autorização real é do servidor).
// Mostra só o primeiro nome, a data do pedido e o prazo; concluir apaga a conta de forma definitiva.
// Sem HTML por texto (LaiftDom.h) e sem estilo inline (privacy.css). Nada é guardado no navegador.
// As funções puras são testadas em Node (scripts/privacy.test.mjs). Expõe window.LaiftPrivacyAdmin.
(function (root) {
  'use strict';

  var Priv = (typeof require === 'function' && typeof module !== 'undefined') ? require('./privacy.js') : root.LaiftPrivacy;
  var TABS = [
    { status: 'requested', label: 'Em andamento' },
    { status: 'completed', label: 'Concluídas' },
    { status: 'cancelled', label: 'Canceladas' },
  ];
  var EMPTY = {
    requested: 'Nenhum pedido de exclusão em andamento.',
    completed: 'Nenhuma exclusão concluída ainda.',
    cancelled: 'Nenhum pedido cancelado.',
  };
  var CONFIRM_TEXT = 'Concluir a exclusão de "{name}"? Isso apaga a conta de forma definitiva e não pode ser desfeito.';

  // ---------- Funções puras ----------

  function countText(n) {
    if (n === 0) return 'Nenhum pedido neste filtro.';
    return n === 1 ? '1 pedido' : n + ' pedidos';
  }

  function emptyText(status) { return EMPTY[status] || EMPTY.requested; }

  function itemName(item) { return (item && item.label) || 'Sem nome'; }

  function confirmText(item) { return CONFIRM_TEXT.replace('{name}', itemName(item)); }

  /** Linha de datas: "Pedido em 01/10/2026 · prazo 30/03/2027 (faltam 160 dias)". */
  function dateLine(item, now) {
    var it = item || {};
    var parts = [];
    if (Priv.formatDate(it.requestedAt)) parts.push('Pedido em ' + Priv.formatDate(it.requestedAt));
    if (Priv.formatDate(it.dueAt)) {
      var left = it.status === 'requested' ? Priv.daysText(it.dueAt, now) : '';
      parts.push('prazo ' + Priv.formatDate(it.dueAt) + (left ? ' (' + left + ')' : ''));
    }
    return parts.join(' · ');
  }

  /** Destaque do prazo: só para pedidos em andamento. */
  function itemUrgency(item, now) {
    return item && item.status === 'requested' ? Priv.urgency(item.dueAt, now) : 'ok';
  }

  /** Quantos pedidos em andamento já venceram ou vencem em menos de 30 dias. */
  function urgentCount(items, now) {
    return (Array.isArray(items) ? items : []).filter(function (i) { return itemUrgency(i, now) !== 'ok'; }).length;
  }

  // ---------- Navegador ----------

  var ui = null; // { app, doc, root, state }

  function h(tag, attrs, children) { return root.LaiftDom.h(tag, attrs, children); }
  function token() { var s = ui.app.getState && ui.app.getState(); return (s && s.sessionToken) || ''; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function flat(list) { return list.filter(function (x) { return x !== null && x !== undefined && x !== false; }); }

  function say(message, kind) {
    var live = ui.root.querySelector('.pv-live');
    if (!live) return;
    live.textContent = message || '';
    live.className = 'pv-live status-msg';
    if (kind) live.setAttribute('data-kind', kind); else live.removeAttribute('data-kind');
  }

  function call(action, payload) {
    var args = payload === undefined ? [action, token()] : [action, token(), payload];
    return ui.app.callApi.apply(ui.app, args).then(function (res) {
      return res || { success: false, message: 'Sem resposta. Tente de novo.' };
    }, function () { return { success: false, message: 'Sem conexão. Tente de novo.' }; });
  }

  function button(label, kind, onClick, extra) {
    return h('button', Object.assign({ type: 'button', className: kind || '', onClick: onClick }, extra || {}), label);
  }

  function mount(node) { clear(ui.root); ui.root.appendChild(node); }

  function tabButton(tab, active) {
    return button(tab.label, 'pv-tab' + (active ? ' is-active' : ''), function () { ui.state.status = tab.status; reload(); },
      { 'aria-pressed': active ? 'true' : 'false', 'data-status': tab.status });
  }

  function itemRow(item) {
    var level = itemUrgency(item);
    var tags = flat([
      h('span', { className: 'pv-tag' }, Priv.statusLabel(item.status)),
      level === 'overdue' ? h('span', { className: 'pv-tag pv-tag--danger' }, 'Prazo vencido') : null,
      level === 'soon' ? h('span', { className: 'pv-tag pv-tag--warn' }, 'Prazo perto do fim') : null,
    ]);
    return h('li', { className: 'pv-row pv-row--' + level }, [
      h('div', { className: 'pv-row__info' }, [
        h('span', { className: 'pv-row__name' }, itemName(item)),
        h('span', { className: 'pv-row__meta' }, dateLine(item)),
        h('span', { className: 'pv-tags' }, tags),
      ]),
      item.status === 'requested'
        ? button('Concluir exclusão', 'danger pv-danger', function () { complete(item); }, { 'data-id': item.id, 'aria-label': 'Concluir exclusão de ' + itemName(item) })
        : null,
    ]);
  }

  function render() {
    var items = ui.state.items;
    var urgent = ui.state.status === 'requested' ? urgentCount(items) : 0;
    var tabs = TABS.map(function (t) { return tabButton(t, t.status === ui.state.status); });
    var list = items.length
      ? h('ul', { className: 'pv-list' }, items.map(itemRow))
      : h('p', { className: 'pv-empty' }, emptyText(ui.state.status));
    return h('section', { className: 'pv-card pv-admin', 'data-pv-view': 'list' }, flat([
      h('h2', { className: 'pv-heading', tabIndex: -1 }, 'Pedidos de exclusão de conta'),
      h('p', { className: 'pv-hint' }, 'Pela LGPD, cada pedido deve ser concluído em até 180 dias. Concluir apaga a conta de forma definitiva.'),
      h('div', { className: 'pv-tabs' }, tabs),
      h('p', { className: 'pv-count' }, countText(items.length) + (urgent ? ' · ' + urgent + ' com prazo vencido ou perto do fim' : '')),
      list,
      h('p', { className: 'pv-live status-msg', role: 'status', 'aria-live': 'polite' }, ''),
    ]));
  }

  function showError(message) {
    mount(h('section', { className: 'pv-card pv-admin' }, [
      h('p', { className: 'pv-error', role: 'alert' }, message || 'Não foi possível carregar os pedidos.'),
      button('Tentar de novo', 'secondary', function () { reload(); }, { id: 'pv-retry' }),
    ]));
  }

  function reload(notice) {
    if (!ui.state.items.length && !ui.state.loaded) mount(h('p', { className: 'pv-empty', role: 'status' }, 'Carregando…'));
    var wanted = ui.state.status;
    return call('apiAdminListDeletionRequests', { status: wanted }).then(function (res) {
      if (!res.success) { showError(res.message); return; }
      ui.state.items = Array.isArray(res.items) ? res.items : [];
      ui.state.loaded = true;
      var keep = ui.doc.activeElement && ui.doc.activeElement.classList && ui.doc.activeElement.classList.contains('pv-tab');
      mount(render());
      if (keep) { var active = ui.root.querySelector('.pv-tab.is-active'); if (active) active.focus(); }
      else { var t = ui.root.querySelector('.pv-heading'); if (t) t.focus(); }
      if (notice) say(notice.text, notice.kind);
    });
  }

  function complete(item) {
    ui.app.openConfirm(confirmText(item), function () {
      say('Concluindo a exclusão…', 'info');
      call('apiAdminCompleteDeletion', { id: item.id }).then(function (res) {
        if (!res.success) { say(res.message || 'Não foi possível concluir a exclusão.', 'error'); return; }
        reload({ text: res.message || 'Exclusão concluída.', kind: 'success' });
      });
    });
  }

  function load(app, doc) {
    var d = doc || root.document;
    var host = d.getElementById('privacy-admin-root');
    if (!host) return Promise.resolve();
    ui = { app: app || root.App, doc: d, root: host, state: { status: 'requested', items: [], loaded: false } };
    return reload();
  }

  /** Some da tela com a sessão. */
  function reset() {
    if (!ui) return;
    clear(ui.root);
    ui.state = { status: 'requested', items: [], loaded: false };
  }

  var api = {
    TABS: TABS, countText: countText, emptyText: emptyText, confirmText: confirmText, dateLine: dateLine,
    itemUrgency: itemUrgency, urgentCount: urgentCount, load: load, reset: reset,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftPrivacyAdmin = api;
})(typeof window !== 'undefined' ? window : globalThis);
