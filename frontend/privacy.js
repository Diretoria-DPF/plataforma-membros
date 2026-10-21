/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Direitos do titular (LGPD) no Perfil: baixar os próprios dados e pedir a exclusão da conta.
// Vale para qualquer pessoa logada (visitante, membro, admin); a autorização real é do servidor.
// O arquivo de dados é gerado no navegador (Blob) e não vai a terceiros. Nada é guardado no navegador.
// Sem HTML por texto (LaiftDom.h) e sem estilo inline (privacy.css). Funções puras testadas em Node
// (scripts/privacy.test.mjs). Expõe window.LaiftPrivacy.
(function (root) {
  'use strict';

  var REASON_MAX = 500;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var WARN_DAYS = 30;
  var STATUS_TEXT = { requested: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };

  // ---------- Funções puras ----------

  function toDate(value) {
    var d = value instanceof Date ? value : new Date(value);
    return isFinite(d.getTime()) ? d : null;
  }

  function pad(n) { return ('0' + n).slice(-2); }

  /** dd/mm/aaaa (UTC) de uma data ISO; vazio se inválida. */
  function formatDate(iso) {
    var d = iso ? toDate(iso) : null;
    if (!d) return '';
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }

  /** meus-dados-laift-AAAA-MM-DD.json (data UTC de generatedAt; sem data válida, a de agora). */
  function downloadFileName(generatedAt, now) {
    var d = (generatedAt && toDate(generatedAt)) || (now && toDate(now)) || new Date();
    return 'meus-dados-laift-' + d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + '.json';
  }

  /** Conteúdo do arquivo de dados: JSON legível. */
  function exportContent(res) {
    return JSON.stringify({ generatedAt: (res && res.generatedAt) || null, data: (res && res.data) || {} }, null, 2);
  }

  /** Dias inteiros até o prazo (arredondado para cima); negativo se vencido; null se a data é inválida. */
  function daysLeft(dueAt, now) {
    var due = dueAt ? toDate(dueAt) : null;
    var base = (now && toDate(now)) || new Date();
    if (!due) return null;
    return Math.ceil((due.getTime() - base.getTime()) / DAY_MS);
  }

  /** 'overdue' (vencido), 'soon' (menos de 30 dias) ou 'ok'. */
  function urgency(dueAt, now) {
    var d = daysLeft(dueAt, now);
    if (d === null) return 'ok';
    if (d < 0) return 'overdue';
    return d < WARN_DAYS ? 'soon' : 'ok';
  }

  /** "faltam 12 dias", "falta 1 dia", "vence hoje", "venceu há 3 dias". */
  function daysText(dueAt, now) {
    var d = daysLeft(dueAt, now);
    if (d === null) return '';
    if (d < 0) return 'venceu há ' + (-d) + (d === -1 ? ' dia' : ' dias');
    if (d === 0) return 'vence hoje';
    return d === 1 ? 'falta 1 dia' : 'faltam ' + d + ' dias';
  }

  function statusLabel(status) { return STATUS_TEXT[status] || String(status || ''); }

  /** Frase do estado do pedido de exclusão para a pessoa titular. */
  function requestSummary(request, now) {
    if (!request) return 'Você não tem pedido de exclusão em andamento.';
    var due = formatDate(request.dueAt);
    var when = formatDate(request.requestedAt);
    var left = daysText(request.dueAt, now);
    var parts = ['Pedido feito' + (when ? ' em ' + when : '') + '.'];
    if (due) parts.push('A exclusão será concluída até ' + due + (left ? ' (' + left + ')' : '') + '.');
    parts.push('Até lá, você pode cancelar.');
    return parts.join(' ');
  }

  /** Valida o motivo opcional e monta a carga da API. */
  function reasonPayload(reason) {
    var text = String(reason === undefined || reason === null ? '' : reason).trim();
    if (text.length > REASON_MAX) return { ok: false, message: 'O motivo passou de ' + REASON_MAX + ' caracteres.' };
    return { ok: true, payload: text ? { reason: text } : {} };
  }

  function remainingText(reason) {
    var n = REASON_MAX - String(reason || '').length;
    return n < 0 ? 'Passou ' + (-n) + ' caracteres do limite.' : 'Restam ' + n + ' caracteres.';
  }

  // ---------- Navegador ----------

  var ui = null; // { app, doc, root, state }

  function h(tag, attrs, children) { return root.LaiftDom.h(tag, attrs, children); }
  function token() { var s = ui.app.getState && ui.app.getState(); return (s && s.sessionToken) || ''; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function $(sel) { return ui.root.querySelector(sel); }

  function say(target, message, kind) {
    var live = $(target);
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

  function saveFile(name, text) {
    var doc = ui.doc;
    var win = doc.defaultView || root;
    var url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' }));
    var a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    win.setTimeout(function () { win.URL.revokeObjectURL(url); }, 1000);
  }

  function showNotes(notes) {
    var box = $('#pv-notes');
    clear(box);
    var list = (Array.isArray(notes) ? notes : []).filter(function (n) { return n; });
    box.hidden = list.length === 0;
    if (!list.length) return;
    box.appendChild(h('h5', null, 'Bom saber'));
    box.appendChild(h('ul', null, list.map(function (n) { return h('li', null, String(n)); })));
  }

  function exportData() {
    var btn = $('#pv-export');
    btn.disabled = true;
    say('#pv-export-live', 'Preparando seus dados…', 'info');
    call('apiPrivacyExportMyData').then(function (res) {
      btn.disabled = false;
      if (!res.success) { say('#pv-export-live', res.message || 'Não foi possível baixar seus dados.', 'error'); return; }
      var name = downloadFileName(res.generatedAt);
      try { saveFile(name, exportContent(res)); } catch (e) { say('#pv-export-live', 'Não foi possível gerar o arquivo neste aparelho.', 'error'); return; }
      showNotes(res.notes);
      say('#pv-export-live', 'Pronto. O arquivo ' + name + ' foi baixado.', 'success');
    });
  }

  function requestDeletion() {
    var out = reasonPayload($('#pv-reason').value);
    if (!out.ok) { say('#pv-delete-live', out.message, 'error'); return; }
    ui.app.openConfirm('Pedir a exclusão da sua conta? Ela será concluída em até 180 dias e, até lá, você pode cancelar.', function () {
      say('#pv-delete-live', 'Enviando o pedido…', 'info');
      call('apiPrivacyRequestDeletion', out.payload).then(function (res) {
        if (!res.success) { say('#pv-delete-live', res.message || 'Não foi possível enviar o pedido.', 'error'); return; }
        ui.state.request = res.request || null;
        renderDeletion();
        say('#pv-delete-live', res.message || 'Pedido de exclusão registrado.', 'success');
      });
    });
  }

  function cancelDeletion() {
    say('#pv-delete-live', 'Cancelando o pedido…', 'info');
    call('apiPrivacyCancelDeletion').then(function (res) {
      if (!res.success) { say('#pv-delete-live', res.message || 'Não foi possível cancelar o pedido.', 'error'); return; }
      ui.state.request = null;
      renderDeletion();
      say('#pv-delete-live', res.message || 'Pedido cancelado. Sua conta continua ativa.', 'success');
    });
  }

  function reasonForm() {
    var counter = h('p', { className: 'pv-hint', id: 'pv-reason-count' }, remainingText(''));
    var field = h('textarea', { id: 'pv-reason', rows: 3, maxlength: REASON_MAX, 'aria-describedby': 'pv-reason-count' });
    field.addEventListener('input', function () { counter.textContent = remainingText(field.value); });
    return h('div', { className: 'pv-form' }, [
      h('label', { for: 'pv-reason', className: 'pv-label' }, 'Motivo (opcional)'),
      field, counter,
      h('div', { className: 'pv-actions' }, [button('Pedir exclusão da minha conta', 'danger pv-danger', requestDeletion, { id: 'pv-request' })]),
    ]);
  }

  function renderDeletion() {
    var box = $('#pv-deletion');
    clear(box);
    var req = ui.state.request;
    if (req && req.status === 'requested') {
      box.appendChild(h('div', { className: 'pv-status pv-status--' + urgency(req.dueAt), id: 'pv-status' }, [
        h('p', { className: 'pv-status__title' }, 'Pedido de exclusão em andamento'),
        h('p', null, requestSummary(req)),
        h('div', { className: 'pv-actions' }, [button('Cancelar pedido', 'secondary', cancelDeletion, { id: 'pv-cancel' })]),
      ]));
      return;
    }
    box.appendChild(reasonForm());
  }

  function loadStatus() {
    say('#pv-delete-live', 'Verificando seu pedido…', 'info');
    return call('apiPrivacyGetDeletionStatus').then(function (res) {
      if (!res.success) {
        ui.state.request = null;
        renderDeletion();
        say('#pv-delete-live', res.message || 'Não foi possível verificar o pedido de exclusão.', 'error');
        return;
      }
      ui.state.request = res.request || null;
      renderDeletion();
      say('#pv-delete-live', '', '');
    });
  }

  function render() {
    clear(ui.root);
    ui.root.appendChild(h('div', { className: 'pv-card', id: 'pv-card' }, [
      h('h3', { id: 'pv-title' }, 'Meus dados e privacidade'),
      h('p', { className: 'muted' }, [
        'Pela LGPD, os dados são seus. Você pode baixar uma cópia ou pedir a exclusão da conta. Veja a ',
        h('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener' }, 'Política de Privacidade'),
        '.',
      ]),
      h('section', { className: 'pv-section', 'aria-labelledby': 'pv-h-export' }, [
        h('h4', { id: 'pv-h-export' }, 'Baixar meus dados'),
        h('p', { className: 'pv-hint' }, 'Gera um arquivo com o que a plataforma guarda sobre você. Ele é criado neste aparelho e não é enviado a ninguém.'),
        h('div', { className: 'pv-actions' }, [button('Baixar meus dados', 'secondary', exportData, { id: 'pv-export' })]),
        h('p', { className: 'pv-live status-msg', id: 'pv-export-live', role: 'status', 'aria-live': 'polite' }, ''),
        h('div', { className: 'pv-notes', id: 'pv-notes', hidden: true }),
      ]),
      h('section', { className: 'pv-section', 'aria-labelledby': 'pv-h-delete' }, [
        h('h4', { id: 'pv-h-delete' }, 'Excluir minha conta'),
        h('p', { className: 'pv-hint' }, 'A exclusão é concluída em até 180 dias. Enquanto isso, você pode cancelar o pedido.'),
        h('div', { id: 'pv-deletion' }),
        h('p', { className: 'pv-live status-msg', id: 'pv-delete-live', role: 'status', 'aria-live': 'polite' }, ''),
      ]),
    ]));
  }

  function load(app, doc) {
    var d = doc || root.document;
    var host = d.getElementById('privacy-root');
    if (!host) return Promise.resolve();
    ui = { app: app || root.App, doc: d, root: host, state: { request: null } };
    render();
    return loadStatus();
  }

  /** Some da tela com a sessão. */
  function reset() {
    if (!ui) return;
    clear(ui.root);
    ui.state = { request: null };
  }

  var api = {
    REASON_MAX: REASON_MAX, WARN_DAYS: WARN_DAYS, formatDate: formatDate, downloadFileName: downloadFileName, exportContent: exportContent,
    daysLeft: daysLeft, urgency: urgency, daysText: daysText, statusLabel: statusLabel, requestSummary: requestSummary,
    reasonPayload: reasonPayload, remainingText: remainingText, load: load, reset: reset,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftPrivacy = api;
})(typeof window !== 'undefined' ? window : globalThis);
