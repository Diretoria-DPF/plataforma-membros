/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-library-lote.js
 * Trabalho em lote da curadoria da Biblioteca (B3 enxuta), dentro da subaba "Artigos":
 *  1. "Importar lista de DOIs": até 150 linhas, uma chamada por vez a apiAdminLearnLibraryImport.
 *  2. "Gerar resumos": percorre a triagem e pede a apiAdminLearnLibraryGenerateSummary o resumo
 *     sugerido (flag library_ai_summary no servidor); "Gerar resumo" e "Aprovar resumo de IA" na edição.
 *  3. "Aprovar e publicar selecionados": para cada marcado, a MESMA sequência do curador à mão
 *     (área, se faltar → aprovar → registrar a revisão do resumo de IA → publicar). Clínicos ficam de fora.
 * Um painel de progresso (role=status) serve aos três: contagem, falhas com motivo, pausa no limite de
 * taxa do servidor ("Continuar"), "Cancelar" e "Tentar de novo as que falharam". Respostas de um
 * lote cancelado ou de antes do logout são ignoradas (contador de geração).
 *
 * admin-library.js chama queuePanel(null, ctx), itemSelector(item, ctx), editPanel(artigo, ctx) e reset().
 * Script clássico, carregado antes de admin-library.js. Sem HTML montado como texto e sem estilo inline: nós por LaiftDom.h,
 * texto como nó de texto, eventos por função (onClick/onInput/onChange).
 */
(function () {
  'use strict';

  var LIST_MAX = 150;
  var LINE_MAX = 300;
  var QUEUE_PAGES_MAX = 20;
  var AI_ORIGINS = ['ia', 'ia_editado'];
  var EDITABLE = ['em_triagem', 'aprovado'];
  var CLINICAL_SKIP = 'aguarda revisor clínico';
  var NO_TOPIC_SKIP = 'sem área (escolha uma área para os sem área)';
  var NOT_TRIAGE_SKIP = 'não está mais em triagem';
  var NO_SOURCE_SKIP = 'sem resumo original';
  var ERROR_FALLBACK = 'Não foi possível concluir. Tente de novo.';
  var RATE_RE = /muitas tentativas/i;
  var PUBLISHED_NOTE = 'O catálogo público só muda quando o site for atualizado à mão (Actions → Deploy do site → Run workflow).';
  var PAUSE_MESSAGES = {
    import: 'O servidor atingiu o limite de importações por hora. Espere alguns minutos e clique em "Continuar".',
    summary: 'O limite de resumos por IA foi atingido (por hora ou o teto do dia). Espere e clique em "Continuar".',
    publish: 'O servidor atingiu o limite de ações da curadoria por hora. Espere alguns minutos e clique em "Continuar".',
  };
  var JOB_TITLES = { import: 'Importação em lote', summary: 'Resumos por IA', publish: 'Aprovar e publicar' };
  var DONE_WORD = { import: 'importados', summary: 'resumos gerados', publish: 'publicados' };

  var gen = 0; // muda no cancelamento e no reset: respostas antigas são descartadas
  var appRef = null;
  var ctxRef = null;
  var panelBox = null;
  var editBox = null;
  var st = freshState();

  // ---------- Funções puras (testadas em scripts/admin-library-lote.test.mjs) ----------

  function freshState() {
    return { job: null, importText: '', importError: '', selected: {}, topic: '', edit: { busy: false, error: '', forId: null } };
  }

  function list(value) { return Array.isArray(value) ? value : []; }

  function errorText(res) {
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    return message || ERROR_FALLBACK;
  }

  /** Uma linha por identificador; apara, tira vazias e repetidas (sem diferenciar maiúsculas). */
  function parseIdentifierList(text) {
    var seen = {};
    var items = String(text || '').split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(function (line) {
        var key = line.toLowerCase();
        if (!line || seen[key]) return false;
        seen[key] = true;
        return true;
      });
    if (items.length === 0) return { items: [], error: 'Cole ao menos um DOI, PMID ou link (um por linha).' };
    if (items.length > LIST_MAX) return { items: [], error: 'Até ' + LIST_MAX + ' linhas por vez (a lista tem ' + items.length + ').' };
    var long = items.filter(function (line) { return line.length > LINE_MAX; });
    if (long.length) return { items: [], error: 'Há linha com mais de ' + LINE_MAX + ' caracteres.' };
    return { items: items, error: '' };
  }

  function isRateLimited(res) {
    return !!res && res.success !== true && (res.code === 'rate_limited' || RATE_RE.test(errorText(res)));
  }

  /** Resultado de uma chamada do lote: ok, já existia, pausa por limite, desligado ou falha. */
  function classify(res) {
    if (res && res.success === true) return { kind: 'ok' };
    if (isRateLimited(res)) return { kind: 'rate' };
    if (res && res.disabled === true) return { kind: 'disabled', message: errorText(res) };
    if (res && res.articleId) return { kind: 'dup' };
    return { kind: 'fail', message: errorText(res) };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function progressText(job) {
    var parts = [job.done + ' de ' + job.total + ' processados', job.ok + ' ' + DONE_WORD[job.kind]];
    if (job.kind === 'import') parts.push(plural(job.dup, 'já existia', 'já existiam'));
    parts.push(plural(job.failed.length, 'falhou', 'falharam'));
    if (job.skipped.length) parts.push(plural(job.skipped.length, 'ficou de fora', 'ficaram de fora'));
    return parts.join(' · ');
  }

  function isAiSummary(item) { return AI_ORIGINS.indexOf(item && item.summaryOrigin) !== -1; }

  function aiReviewPending(item) { return isAiSummary(item) && !!item.summaryText && !item.summaryReviewedAt; }

  /** Passos do curador para um artigo marcado, ou o motivo de ficar de fora do lote. */
  function publishPlan(item, fallbackTopic) {
    if (!item || item.status !== 'em_triagem') return { skip: NOT_TRIAGE_SKIP };
    if (item.isClinical === true) return { skip: CLINICAL_SKIP };
    var hasTopic = list(item.topics).length > 0;
    if (!hasTopic && !fallbackTopic) return { skip: NO_TOPIC_SKIP };
    var steps = (hasTopic ? [] : ['area']).concat(['aprovado']);
    if (aiReviewPending(item)) steps.push('revisar');
    steps.push('publicado');
    return { steps: steps };
  }

  /** Artigos da triagem que ainda não têm resumo: com resumo original vão ao modelo; sem, ficam de fora. */
  function summaryTargets(items) {
    var pending = list(items).filter(function (item) { return item && item.status === 'em_triagem' && !item.summaryText; });
    return {
      run: pending.filter(function (item) { return !!item.sourceAbstract; }),
      skip: pending.filter(function (item) { return !item.sourceAbstract; }),
    };
  }

  // ---------- Estado e API ----------

  function dom() { return window.LaiftDom; }
  function h(tag, attrs, children) { return dom().h(tag, attrs, children); }

  function token() {
    var state = appRef && appRef.getState ? appRef.getState() : null;
    return state && state.sessionToken;
  }

  function setSt(patch) { st = Object.assign({}, st, patch); }
  function setEdit(patch) { setSt({ edit: Object.assign({}, st.edit, patch) }); }
  function setJob(patch) { setSt({ job: Object.assign({}, st.job, patch) }); }

  /** Chamada do lote: só a resposta da geração atual conta. */
  function call(name, input, myGen) {
    var t = token();
    if (!t) return Promise.resolve(null);
    return appRef.callApi(name, t, input).then(function (res) { return myGen === gen ? res : null; });
  }

  function labelOf(item) { return item.title || item.doi || item.pmid || item.label || 'Artigo'; }

  function newJob(kind, units, skipped) {
    return {
      kind: kind, total: units.length, queue: units.slice(), done: 0, ok: 0, dup: 0,
      failed: [], skipped: skipped || [], running: true, paused: false, stopped: '', finished: false, retryUnits: [],
    };
  }

  // ---------- Execução (uma chamada por vez) ----------

  var WORKERS = { import: importOne, summary: summaryOne, publish: publishOne };

  function startJob(kind, units, skipped) {
    gen++;
    setSt({ job: newJob(kind, units, skipped) });
    renderPanel();
    step(gen);
  }

  function step(myGen) {
    var job = st.job;
    if (!job || myGen !== gen || !job.running || job.paused) return;
    if (job.queue.length === 0) { finish(); return; }
    var unit = job.queue[0];
    WORKERS[job.kind](unit, myGen).then(function (out) {
      if (myGen !== gen || !out) return;
      record(unit, out);
      renderPanel();
      step(myGen);
    });
  }

  function record(unit, out) {
    var job = st.job;
    if (out.kind === 'rate') { setJob({ paused: true }); return; }
    var rest = job.queue.slice(1);
    if (out.kind === 'disabled') { setJob({ queue: [], running: false, finished: true, stopped: out.message }); return; }
    var patch = { queue: rest, done: job.done + 1 };
    if (out.kind === 'ok') patch.ok = job.ok + 1;
    if (out.kind === 'dup') patch.dup = job.dup + 1;
    if (out.kind === 'skip') patch.skipped = job.skipped.concat([{ label: labelOf(unit), reason: out.message }]);
    if (out.kind === 'fail') {
      patch.failed = job.failed.concat([{ label: labelOf(unit), reason: out.message }]);
      patch.retryUnits = job.retryUnits.concat([unit]);
    }
    if (out.kind === 'ok' && job.kind === 'publish') dropSelected(unit.id);
    setJob(patch);
  }

  function dropSelected(id) {
    var next = Object.assign({}, st.selected);
    delete next[id];
    setSt({ selected: next });
  }

  function finish() {
    setJob({ running: false, finished: true });
    renderPanel();
    if (ctxRef && typeof ctxRef.refresh === 'function') ctxRef.refresh();
  }

  function importOne(unit, myGen) {
    return call('apiAdminLearnLibraryImport', { identifier: unit.label }, myGen).then(function (res) {
      return res === null ? null : classify(res);
    });
  }

  function summaryOne(unit, myGen) {
    return call('apiAdminLearnLibraryGenerateSummary', { id: unit.id }, myGen).then(function (res) {
      return res === null ? null : classify(res);
    });
  }

  var STEP_CALLS = {
    area: function (id, version, topic) { return ['apiAdminLearnLibraryUpdateArticle', { id: id, version: version, fields: { topics: [topic] } }, 'ao definir a área']; },
    aprovado: function (id, version) { return ['apiAdminLearnLibrarySetStatus', { id: id, version: version, to: 'aprovado' }, 'ao aprovar']; },
    revisar: function (id, version) { return ['apiAdminLearnLibraryReviewSummary', { id: id, version: version }, 'ao aprovar o resumo de IA']; },
    publicado: function (id, version) { return ['apiAdminLearnLibrarySetStatus', { id: id, version: version, to: 'publicado' }, 'ao publicar']; },
  };

  /** Encadeia os passos; cada resposta traz a versão nova do artigo para o passo seguinte. */
  function runSteps(unit, steps, version, myGen) {
    if (steps.length === 0) return Promise.resolve({ kind: 'ok' });
    var spec = STEP_CALLS[steps[0]](unit.id, version, unit.topic);
    return call(spec[0], spec[1], myGen).then(function (res) {
      if (res === null) return null;
      var out = classify(res);
      if (out.kind === 'rate') return out;
      if (out.kind !== 'ok') return { kind: 'fail', message: spec[2] + ': ' + (out.message || ERROR_FALLBACK) };
      return runSteps(unit, steps.slice(1), res.article.version, myGen);
    });
  }

  function publishOne(unit, myGen) {
    var steps = unit.steps;
    return runSteps(unit, steps, unit.version, myGen).then(function (out) {
      if (out && out.kind === 'rate') rememberProgress(unit, myGen);
      return out;
    });
  }

  /** Pausou no meio da sequência: o "Continuar" recomeça pelo artigo, relendo a versão na fila. */
  function rememberProgress(unit, myGen) {
    if (myGen !== gen || !st.job) return;
    var queue = st.job.queue.slice();
    queue[0] = Object.assign({}, unit, { needsReload: true });
    setJob({ queue: queue });
  }

  // ---------- Ações dos botões ----------

  function startImport() {
    if (st.job && st.job.running) return;
    var parsed = parseIdentifierList(st.importText);
    if (parsed.error) { setSt({ importError: parsed.error }); renderPanel(); return; }
    setSt({ importError: '' });
    startJob('import', parsed.items.map(function (line) { return { label: line }; }), []);
  }

  /** Lê a fila "em_triagem" inteira (páginas de 20) antes de gerar os resumos. */
  function collectTriage(myGen, page, acc) {
    return call('apiAdminLearnLibraryListQueue', { status: 'em_triagem', page: page }, myGen).then(function (res) {
      if (res === null) return null;
      if (!res || res.success !== true) return { error: errorText(res) };
      var items = acc.concat(list(res.items));
      var more = items.length < Number(res.total || 0) && list(res.items).length > 0 && page < QUEUE_PAGES_MAX;
      return more ? collectTriage(myGen, page + 1, items) : { items: items };
    });
  }

  function startSummaries() {
    if (st.job && st.job.running) return;
    gen++;
    var myGen = gen;
    setSt({ job: Object.assign(newJob('summary', [], []), { collecting: true }) });
    renderPanel();
    collectTriage(myGen, 1, []).then(function (out) {
      if (out === null || myGen !== gen) return;
      if (out.error) { setJob({ running: false, finished: true, collecting: false, stopped: out.error }); renderPanel(); return; }
      var targets = summaryTargets(out.items);
      var skipped = targets.skip.map(function (item) { return { label: labelOf(item), reason: NO_SOURCE_SKIP }; });
      startJob('summary', targets.run.map(function (item) { return { id: item.id, title: item.title }; }), skipped);
    });
  }

  function selectedItems() {
    return Object.keys(st.selected).map(function (id) { return st.selected[id]; });
  }

  function publishUnits() {
    var skipped = [];
    var units = [];
    selectedItems().forEach(function (item) {
      var plan = publishPlan(item, st.topic);
      if (plan.skip) skipped.push({ label: labelOf(item), reason: plan.skip });
      else units.push({ id: item.id, title: item.title, version: item.version, steps: plan.steps, topic: st.topic });
    });
    return { units: units, skipped: skipped };
  }

  function startPublish() {
    if (st.job && st.job.running) return;
    var count = selectedItems().length;
    if (!count || !appRef) return;
    appRef.openConfirm('Aprovar e publicar ' + plural(count, 'artigo selecionado', 'artigos selecionados') + '? Clínicos ficam de fora.', function () {
      var plan = publishUnits();
      startJob('publish', plan.units, plan.skipped);
    });
  }

  /** Continuar depois da pausa; um artigo do lote de publicação é relido para pegar a versão atual. */
  function resume() {
    var job = st.job;
    if (!job || !job.paused) return;
    setJob({ paused: false });
    renderPanel();
    var head = job.queue[0];
    if (job.kind === 'publish' && head && head.needsReload) { reloadHead(head, gen); return; }
    step(gen);
  }

  function reloadHead(head, myGen) {
    call('apiAdminLearnLibraryGetArticle', { id: head.id }, myGen).then(function (res) {
      if (res === null) return;
      var ok = !!res && res.success === true;
      var steps = ok ? remainingSteps(res.article, head.topic) : [];
      if (steps.length === 0) {
        record(head, { kind: 'fail', message: ok ? 'o estado do artigo mudou; confira na fila' : errorText(res) });
      } else {
        var queue = st.job.queue.slice();
        queue[0] = Object.assign({}, head, { version: res.article.version, steps: steps, needsReload: false });
        setJob({ queue: queue });
      }
      renderPanel();
      step(myGen);
    });
  }

  /** O que falta para um artigo já relido (pode ter parado depois de aprovar). */
  function remainingSteps(article, topic) {
    if (article.status === 'aprovado') return (aiReviewPending(article) ? ['revisar'] : []).concat(['publicado']);
    return publishPlan(article, topic).steps || [];
  }

  function cancel() {
    if (!st.job || !st.job.running) return;
    gen++;
    setJob({ running: false, paused: false, finished: true, stopped: 'Lote cancelado. O que já foi feito continua valendo.' });
    renderPanel();
    if (ctxRef && typeof ctxRef.refresh === 'function') ctxRef.refresh();
  }

  function retryFailed() {
    var job = st.job;
    if (!job || job.running || job.retryUnits.length === 0) return;
    startJob(job.kind, job.retryUnits, []);
  }

  function toggleSelected(item, checked) {
    var next = Object.assign({}, st.selected);
    if (checked) next[item.id] = item;
    else delete next[item.id];
    setSt({ selected: next });
    renderPanel();
  }

  function selectPage(checked) {
    var next = Object.assign({}, st.selected);
    list(ctxRef && ctxRef.items).forEach(function (item) {
      if (checked && item.status === 'em_triagem') next[item.id] = item;
      if (!checked) delete next[item.id];
    });
    setSt({ selected: next });
    if (ctxRef && typeof ctxRef.rerender === 'function') ctxRef.rerender();
  }

  // ---------- Desenho do painel do lote ----------

  function button(label, onClick, extra) {
    return h('button', Object.assign({ type: 'button', onClick: onClick }, extra || {}), [label]);
  }

  function isBusy() { return !!(st.job && st.job.running); }

  function importForm() {
    return h('div', null, [
      h('h3', null, ['Importar lista de DOIs']),
      h('label', { 'for': 'adm-lib-lote-lista' }, ['DOIs, PMIDs ou links (um por linha, até ' + LIST_MAX + ')']),
      h('textarea', {
        id: 'adm-lib-lote-lista', rows: 6, maxlength: LIST_MAX * (LINE_MAX + 2), autocomplete: 'off',
        'aria-describedby': st.importError ? 'adm-lib-lote-lista-erro' : null,
        onInput: function (e) { setSt({ importText: e.target.value }); },
      }, [st.importText]),
      st.importError ? h('p', { role: 'alert', className: 'state-message', id: 'adm-lib-lote-lista-erro' }, [st.importError]) : null,
      button('Importar', startImport, { disabled: isBusy() }),
    ]);
  }

  function summaryForm() {
    return h('div', null, [
      h('h3', null, ['Gerar resumos']),
      h('p', { className: 'muted' }, ['A IA sugere um resumo para cada artigo em triagem sem resumo. Nada vai ao ar sem a sua aprovação.']),
      button('Gerar resumos', startSummaries, { disabled: isBusy() }),
    ]);
  }

  function topicSelect() {
    var options = [h('option', { value: '', selected: st.topic === '' }, ['Nenhuma (os sem área ficam de fora)'])]
      .concat(list(ctxRef && ctxRef.topics).map(function (topic) {
        return h('option', { value: topic.slug, selected: st.topic === topic.slug }, [topic.name || topic.slug]);
      }));
    return h('div', null, [
      h('label', { 'for': 'adm-lib-lote-area' }, ['Área para os artigos sem área']),
      h('select', { id: 'adm-lib-lote-area', onChange: function (e) { setSt({ topic: e.target.value }); } }, options),
    ]);
  }

  function publishForm() {
    var count = selectedItems().length;
    return h('div', null, [
      h('h3', null, ['Aprovar e publicar selecionados']),
      h('p', { className: 'muted' }, ['Marque os artigos na fila "Em triagem". Para cada um: aprovar, aprovar o resumo de IA e publicar. Clínicos ficam para o revisor clínico.']),
      topicSelect(),
      h('div', { className: 'actions-row' }, [
        button('Marcar todos desta página', function () { selectPage(true); }, { disabled: isBusy() }),
        button('Desmarcar todos', function () { selectPage(false); }, { disabled: isBusy() }),
      ]),
      button('Aprovar e publicar selecionados (' + count + ')', startPublish, { disabled: isBusy() || count === 0 }),
    ]);
  }

  function reasonList(title, rows) {
    if (!rows.length) return null;
    return h('div', null, [
      h('h4', null, [title]),
      h('ul', null, rows.map(function (row) { return h('li', null, [row.label + ': ' + row.reason]); })),
    ]);
  }

  function jobControls(job) {
    var controls = [];
    if (job.paused) controls.push(button('Continuar', resume));
    if (job.running) controls.push(button('Cancelar', cancel));
    if (!job.running && job.retryUnits.length) controls.push(button('Tentar de novo as que falharam', retryFailed));
    return controls.length ? h('div', { className: 'actions-row' }, controls) : null;
  }

  function jobStatusLine(job) {
    if (job.collecting && job.running) return 'Lendo a fila de triagem…';
    if (job.stopped) return job.stopped;
    if (job.paused) return PAUSE_MESSAGES[job.kind];
    var text = progressText(job);
    if (job.finished) return 'Concluído. ' + text + (job.kind === 'publish' && job.ok ? '. ' + PUBLISHED_NOTE : '.');
    return text;
  }

  function jobNode() {
    var job = st.job;
    if (!job) return null;
    return h('div', { className: 'card' }, [
      h('h3', null, [JOB_TITLES[job.kind]]),
      h('progress', { max: Math.max(job.total, 1), value: job.done, 'aria-label': 'Progresso: ' + job.done + ' de ' + job.total }),
      h('p', { role: 'status', 'aria-live': 'polite' }, [jobStatusLine(job)]),
      jobControls(job),
      reasonList('Falhas', job.failed),
      reasonList('Ficaram de fora', job.skipped),
    ]);
  }

  function panelChildren() {
    return [h('h2', { id: 'adm-lib-lote-titulo' }, ['Trabalho em lote']), importForm(), summaryForm(), publishForm(), jobNode()];
  }

  function renderPanel() {
    if (!panelBox || !dom()) return;
    dom().clear(panelBox);
    panelChildren().forEach(function (child) { if (child) panelBox.appendChild(child); });
    if (isBusy()) panelBox.setAttribute('aria-busy', 'true');
    else panelBox.removeAttribute('aria-busy');
  }

  // ---------- Edição de um artigo ----------

  function canGenerate(article) {
    return EDITABLE.indexOf(article.status) !== -1 && !!article.sourceAbstract
      && (!article.summaryText || article.summaryOrigin === 'ia');
  }

  function canReview(article) {
    return EDITABLE.indexOf(article.status) !== -1 && aiReviewPending(article);
  }

  function generateFor(article) {
    if (st.edit.busy) return;
    var myGen = gen;
    setEdit({ busy: true, error: '' });
    renderEdit(article);
    call('apiAdminLearnLibraryGenerateSummary', { id: article.id, version: article.version }, myGen).then(function (res) {
      if (res === null) return;
      setEdit({ busy: false, error: '' });
      if (res.success === true) {
        var note = 'Resumo sugerido pela IA. Leia, ajuste se precisar e aprove o resumo antes de publicar.';
        ctxRef.open(article.id, res.clinical ? note + ' Ele cita conduta, dose ou interação: vai ao revisor clínico.' : note);
        return;
      }
      setEdit({ error: errorText(res) });
      renderEdit(article);
    });
  }

  function reviewFor(article) {
    if (st.edit.busy) return;
    var myGen = gen;
    setEdit({ busy: true, error: '' });
    renderEdit(article);
    call('apiAdminLearnLibraryReviewSummary', { id: article.id, version: article.version }, myGen).then(function (res) {
      if (res === null) return;
      setEdit({ busy: false, error: res.success === true ? '' : errorText(res) });
      if (res.success === true) { ctxRef.open(article.id, 'Resumo de IA aprovado. Agora o artigo pode ser publicado.'); return; }
      renderEdit(article);
    });
  }

  function originLine(article) {
    if (!isAiSummary(article) || !article.summaryText) return null;
    var who = article.summaryReviewerName ? 'aprovado por ' + article.summaryReviewerName : 'ainda não aprovado pela curadoria';
    var origin = article.summaryOrigin === 'ia_editado' ? 'Resumo gerado por IA e editado' : 'Resumo gerado por IA';
    return h('p', null, [h('span', { className: 'badge' }, [origin]), ' ' + who + '.']);
  }

  function editChildren(article) {
    var busy = st.edit.busy;
    return [
      h('h3', null, ['Resumo por IA']),
      originLine(article),
      canGenerate(article) ? button(article.summaryText ? 'Gerar outro resumo' : 'Gerar resumo', function () { generateFor(article); }, { disabled: busy }) : null,
      canReview(article) ? button('Aprovar resumo de IA', function () { reviewFor(article); }, { disabled: busy }) : null,
      busy ? h('p', { role: 'status' }, ['Aguardando o servidor…']) : null,
      st.edit.error ? h('p', { role: 'alert', className: 'state-message' }, [st.edit.error]) : null,
    ];
  }

  function renderEdit(article) {
    if (!editBox || !dom()) return;
    dom().clear(editBox);
    editChildren(article).forEach(function (child) { if (child) editBox.appendChild(child); });
  }

  // ---------- Interface para admin-library.js ----------

  function bind(ctx) {
    ctxRef = ctx || null;
    appRef = ctx && ctx.app ? ctx.app : appRef;
  }

  /** Primeiro argumento sem uso: admin-library.js chama todos como (arg, ctx). */
  function queuePanel(_unused, ctx) {
    bind(ctx);
    panelBox = h('section', { className: 'card', 'aria-labelledby': 'adm-lib-lote-titulo' }, []);
    renderPanel();
    return panelBox;
  }

  function itemSelector(item) {
    if (!item || item.status !== 'em_triagem') return null;
    var id = 'adm-lib-lote-sel-' + item.id;
    return h('div', null, [
      h('input', {
        type: 'checkbox', id: id, checked: Object.prototype.hasOwnProperty.call(st.selected, item.id),
        disabled: isBusy(),
        onChange: function (e) { toggleSelected(item, e.target.checked); },
      }),
      h('label', { 'for': id }, ['Selecionar para publicar']),
    ]);
  }

  function editPanel(article, ctx) {
    bind(ctx);
    if (!article) return null;
    editBox = h('div', null, []);
    if (st.edit.forId !== article.id) setSt({ edit: { busy: false, error: '', forId: article.id } });
    renderEdit(article);
    return editBox;
  }

  /** Logout: cancela o lote em andamento e esquece seleção e respostas pendentes. */
  function reset() {
    gen++;
    appRef = null;
    ctxRef = null;
    panelBox = null;
    editBox = null;
    st = freshState();
  }

  var api = { queuePanel: queuePanel, itemSelector: itemSelector, editPanel: editPanel, reset: reset };
  var pure = {
    parseIdentifierList: parseIdentifierList,
    classify: classify,
    progressText: progressText,
    publishPlan: publishPlan,
    summaryTargets: summaryTargets,
    LIST_MAX: LIST_MAX,
  };

  // Navegador: window.LaiftAdminLibraryLote. Node: module.exports, para scripts/admin-library-lote.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftAdminLibraryLote = api;
  }
})();
