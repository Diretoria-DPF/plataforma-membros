/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tela de gestão dos Destaques da Liga (docs/destaques.md), para o admin e para quem tem a capacidade home.curate
// (cargo gestor): lista com interruptor exibir/ocultar, subir/descer, remover, "Adicionar destaque" (título, tipo, texto
// de apoio, link e data de saída opcionais) e aviso do teto de 8 visíveis. Os automáticos (próximos eventos, blog) são
// só mostrados, sem controles. Carregado sob demanda (pacote "destaques"). Só DOM seguro, sem innerHTML nem estilo
// inline. Quem decide de verdade é a Worker (capacidade, validação, limite e auditoria em cada chamada).
(function (root) {
  'use strict';

  var MSG_ID = 'msg-highlights';
  var VISIBLE_MAX = 8;
  var KIND_ORDER = ['aviso', 'evento', 'edital', 'blog', 'link'];
  var items = [];
  var visibleMax = VISIBLE_MAX;
  var busy = false;
  var wired = false;
  var focusAfter = null;
  var editingId = null;
  var generation = 0;

  function H() { return root.LaiftHighlights || (typeof require === 'function' ? require('./highlights.js') : null); }
  function app() { return root.App; }
  function el(id) { return root.document.getElementById(id); }
  function token() { var s = app().getState(); return (s && s.sessionToken) || ''; }
  function say(message, kind) { app().setStatus(MSG_ID, message, kind || null); }

  /** Frase curta da situação do item na Início (nunca só por cor ou posição). */
  function describe(item) {
    var parts = [H().kindLabel(item.kind)];
    if (item.endsAt) parts.push('sai em ' + H().shortDate(item.endsAt));
    else parts.push('sem data de saída');
    if (!item.isActive) parts.push('oculto');
    else if (!item.inWindow) parts.push('fora do período de exibição');
    else if (!item.visible) parts.push('acima do teto de ' + visibleMax + ', não aparece');
    return parts.join(' · ');
  }

  /** Aviso do teto: quantos aparecem agora e, se passar de 8 ativos, que só os primeiros da ordem valem. */
  function capText(list, visibleCount) {
    var active = list.filter(function (i) { return i.isActive && i.inWindow; }).length;
    var text = 'Aparecendo agora: ' + visibleCount + ' de ' + visibleMax + ' (o teto vale para o conjunto, com os automáticos).';
    if (active > visibleMax) text += ' Há ' + active + ' ativos: só os ' + visibleMax + ' primeiros da ordem aparecem.';
    return text;
  }

  /** Nova ordem (lista de ids) ao mover o item `index` por `delta`; null se não der. */
  function movedIds(list, index, delta) {
    var to = index + delta;
    if (index < 0 || to < 0 || to >= list.length) return null;
    var ids = list.map(function (i) { return i.id; });
    var moved = ids.splice(index, 1)[0];
    ids.splice(to, 0, moved);
    return ids;
  }

  /** ISO -> valor do campo de data (AAAA-MM-DD, dia local); vazio se não houver data. */
  function toDateInput(iso) {
    var d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Entrada do formulário -> corpo de apiAdminSaveHighlight, ou { error }. A Worker valida de novo. */
  function formInput(values) {
    var title = String(values.title || '').trim();
    if (!title) return { error: 'Informe o título do destaque.' };
    if (title.length > 120) return { error: 'O título pode ter no máximo 120 caracteres.' };
    var link = String(values.link || '').trim();
    if (link && !H().linkTarget(link)) return { error: 'O link precisa começar com / (página da plataforma) ou https://.' };
    var endsAt = '';
    if (values.end) {
      endsAt = H().endOfDayIso(values.end);
      if (!endsAt) return { error: 'Data de saída inválida.' };
      if (new Date(endsAt).getTime() <= Date.now()) return { error: 'A data de saída precisa ser futura.' };
    }
    return { input: { kind: values.kind, title: title, subtitle: String(values.subtitle || '').trim(), linkPath: link || null, endsAt: endsAt || null } };
  }

  function button(label, className, ariaLabel, onClick) {
    var b = H().node(root.document, 'button', className, label);
    b.type = 'button';
    if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
    b.addEventListener('click', onClick);
    return b;
  }

  function run(promise, okMessage, after) {
    if (busy) return;
    busy = true;
    Promise.resolve(promise).then(function (res) {
      busy = false;
      if (!res || res.success !== true) { say((res && res.message) || 'Não foi possível concluir.', 'error'); return undefined; }
      var message = okMessage || res.message || 'Feito.';
      return reload().then(function () { say(res.warning ? message + ' ' + res.warning : message, res.warning ? 'info' : 'success'); if (after) after(res); });
    }).catch(function () { busy = false; say('Não foi possível concluir. Tente de novo.', 'error'); });
  }

  function rowFor(item, index, list) {
    var doc = root.document;
    var li = H().node(doc, 'li', 'hl-row' + (item.visible ? '' : ' hl-row--off'));
    var text = H().node(doc, 'div', 'hl-row__text');
    text.appendChild(H().node(doc, 'strong', 'hl-row__title', item.title));
    text.appendChild(H().node(doc, 'small', 'hl-row__meta', describe(item)));
    var actions = H().node(doc, 'div', 'hl-row__actions');
    var sw = button(item.isActive ? 'Exibido' : 'Oculto', 'hl-switch secondary', 'Exibir na Início: ' + item.title, function () {
      focusAfter = { id: item.id, action: 'switch' };
      run(app().callApi('apiAdminSetHighlightActive', token(), { id: item.id, isActive: !item.isActive }), item.isActive ? 'Destaque ocultado.' : 'Destaque ligado.');
    });
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', item.isActive ? 'true' : 'false');
    sw.setAttribute('data-action', 'switch');
    var up = button('↑', 'secondary hl-icon-btn', 'Subir: ' + item.title, function () { move(list, index, -1, item.id, 'up'); });
    var down = button('↓', 'secondary hl-icon-btn', 'Descer: ' + item.title, function () { move(list, index, 1, item.id, 'down'); });
    up.disabled = index === 0;
    down.disabled = index === list.length - 1;
    up.setAttribute('data-action', 'up');
    down.setAttribute('data-action', 'down');
    var del = button('Remover', 'secondary hl-icon-btn', 'Remover: ' + item.title, function () {
      app().openConfirm('Remover o destaque "' + item.title + '"? Não dá para desfazer.', function () {
        focusAfter = { id: null, action: 'add' };
        run(app().callApi('apiAdminDeleteHighlight', token(), { id: item.id }), 'Destaque removido.');
      });
    });
    var editBtn = button('Editar', 'secondary hl-icon-btn', 'Editar: ' + item.title, function () { startEdit(item); });
    editBtn.setAttribute('data-action', 'edit');
    [sw, up, down, editBtn, del].forEach(function (b) { actions.appendChild(b); });
    li.setAttribute('data-id', item.id);
    li.appendChild(text);
    li.appendChild(actions);
    return li;
  }

  function move(list, index, delta, id, action) {
    var ids = movedIds(list, index, delta);
    if (!ids) return;
    focusAfter = { id: id, action: action };
    run(app().callApi('apiAdminReorderHighlights', token(), { ids: ids }), 'Ordem atualizada.');
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function restoreFocus() {
    if (!focusAfter) return;
    var target = focusAfter;
    focusAfter = null;
    var doc = root.document;
    var scope = target.id ? doc.querySelector('#highlights-list [data-id="' + target.id + '"]') : null;
    var node = scope ? scope.querySelector('[data-action="' + target.action + '"]:not([disabled])') : el('btn-highlight-add');
    if (!node && scope) node = scope.querySelector('[data-action="switch"]');
    if (node && typeof node.focus === 'function') node.focus();
  }

  function render(list, visibleCount, autos) {
    var ul = el('highlights-list');
    clear(ul);
    list.forEach(function (item, index) { ul.appendChild(rowFor(item, index, list)); });
    el('highlights-empty').classList.toggle('hidden', list.length > 0);
    el('highlights-cap').textContent = capText(list, visibleCount);
    var autoUl = el('highlights-auto-list');
    clear(autoUl);
    autos.forEach(function (item) {
      var li = H().node(root.document, 'li', 'hl-row hl-row--auto');
      var text = H().node(root.document, 'div', 'hl-row__text');
      text.appendChild(H().node(root.document, 'strong', 'hl-row__title', item.title));
      text.appendChild(H().node(root.document, 'small', 'hl-row__meta', 'Automático · ' + H().kindLabel(item.kind) + (item.subtitle ? ' · ' + item.subtitle : '')));
      li.appendChild(text);
      autoUl.appendChild(li);
    });
    el('highlights-auto-block').classList.toggle('hidden', autos.length === 0);
    restoreFocus();
  }

  function flagNote() {
    var on = root.document.documentElement.hasAttribute('data-flag-highlights-enabled');
    el('highlights-flag-note').classList.toggle('hidden', on);
  }

  function reload() {
    generation += 1;
    var mine = generation;
    return Promise.all([
      Promise.resolve(app().callApi('apiAdminListHighlights', token())),
      H().loadAutomatic(app(), token(), root),
    ]).then(function (parts) {
      if (mine !== generation) return;
      var res = parts[0];
      if (!res || res.success !== true) { say((res && res.message) || 'Não foi possível carregar os destaques.', 'error'); return; }
      items = Array.isArray(res.highlights) ? res.highlights : [];
      visibleMax = res.visibleMax || VISIBLE_MAX;
      el('highlights-missing').classList.toggle('hidden', res.tableMissing !== true);
      var manualVisible = Number(res.visibleCount) || 0;
      render(items, manualVisible + Math.min(parts[1].length, Math.max(0, visibleMax - manualVisible)), parts[1]);
    });
  }

  function formValues() {
    return { title: el('hl-title').value, kind: el('hl-kind').value, subtitle: el('hl-sub').value, link: el('hl-link').value, end: el('hl-end').value };
  }

  function toggleForm(open, keepFocus) {
    var form = el('highlight-form');
    var add = el('btn-highlight-add');
    form.classList.toggle('hidden', !open);
    add.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) el('hl-title').focus(); else if (!keepFocus) add.focus();
  }

  function setMode(id) {
    editingId = id;
    el('btn-highlight-save').textContent = id ? 'Salvar alterações' : 'Publicar destaque';
    el('btn-highlight-add').textContent = id ? 'Editando um destaque' : 'Adicionar destaque';
  }

  /** Abre o mesmo formulário de "Adicionar", preenchido com o item. */
  function startEdit(item) {
    setMode(item.id);
    el('hl-title').value = item.title || '';
    el('hl-kind').value = item.kind || 'aviso';
    el('hl-sub').value = item.subtitle || '';
    el('hl-link').value = item.linkPath || '';
    el('hl-end').value = toDateInput(item.endsAt);
    say('', null);
    toggleForm(true);
  }

  function closeForm(returnToItem) {
    var id = editingId;
    el('highlight-form').reset();
    setMode(null);
    var row = id && returnToItem ? root.document.querySelector('#highlights-list [data-id="' + id + '"] [data-action="edit"]') : null;
    toggleForm(false, Boolean(row));
    if (row) row.focus();
  }

  function onSubmit(event) {
    event.preventDefault();
    var parsed = formInput(formValues());
    if (parsed.error) { say(parsed.error, 'error'); return; }
    var id = editingId;
    var input = parsed.input;
    if (id) input.id = id;
    focusAfter = id ? { id: id, action: 'edit' } : { id: null, action: 'add' };
    run(app().callApi('apiAdminSaveHighlight', token(), input), id ? 'Destaque atualizado.' : 'Destaque adicionado.', function () {
      el('highlight-form').reset();
      setMode(null);
      toggleForm(false, true);
    });
  }

  function wire() {
    if (wired) return;
    wired = true;
    el('btn-highlight-add').addEventListener('click', function () {
      var opening = el('highlight-form').classList.contains('hidden') || editingId !== null;
      el('highlight-form').reset();
      setMode(null);
      toggleForm(opening);
    });
    el('btn-highlight-cancel').addEventListener('click', function () { closeForm(true); });
    el('highlight-form').addEventListener('submit', onSubmit);
  }

  /** Abre a tela: liga os controles (uma vez) e carrega a lista. */
  function load(appRef) {
    if (!appRef || !el('highlights-list')) return Promise.resolve();
    H().ensureStyles(root.document);
    wire();
    flagNote();
    say('Carregando...', 'info');
    return reload().then(function () { if (el(MSG_ID).getAttribute('data-kind') === 'info') say('', null); })
      .catch(function () { say('Não foi possível carregar os destaques.', 'error'); });
  }

  var api = { KIND_ORDER: KIND_ORDER, describe: describe, capText: capText, movedIds: movedIds, toDateInput: toDateInput, formInput: formInput, load: load };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftHighlightsManage = api;
})(typeof self !== 'undefined' ? self : this);
