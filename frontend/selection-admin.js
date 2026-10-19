/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel da comissão do processo seletivo (só administradores; a autorização real é do servidor).
// Lista as inscrições em cartões, abre a ficha com as respostas e o resumo da IA e registra a decisão da comissão.
// Sem HTML por texto (LaiftDom.h) e sem estilo inline (selection-admin.css). Nada é guardado no navegador.
// As funções puras são testadas em Node (scripts/selection-admin.test.mjs). Expõe window.LaiftSelectionAdmin.
(function (root) {
  'use strict';

  var FILTERS = ['pending', 'waitlist', 'decided', 'appeal'];
  var STATUS_TEXT = {
    submitted: 'Enviada', in_review: 'Em análise', interview: 'Entrevista', waitlist: 'Lista de espera',
    approved: 'Aprovado(a)', not_selected: 'Não selecionado(a)',
  };
  var SIGNAL_TEXT = { saude: 'Possível dado de saúde: ler com atenção', injecao: 'Texto suspeito: ler com atenção' };
  var THINKING_LABEL = { t01: 'Seu projeto', t02: 'Informação duvidosa', t03: 'Aprender sozinho(a)', t04: 'Limite do que você sabe' };
  var CONDUCT_LABEL = { c01: 'Prazo em risco', c02: 'Dados de participantes', c03: 'Ferramentas de IA' };
  var DAY_LABEL = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb' };
  var SHIFT_LABEL = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
  var DECISIONS = [
    { id: 'in_review', label: 'Marcar em análise', confirm: null },
    { id: 'interview', label: 'Chamar para entrevista', confirm: null },
    { id: 'waitlist', label: 'Lista de espera', confirm: null },
    { id: 'approved', label: 'Aprovar', confirm: 'Aprovar esta inscrição? A pessoa será avisada do resultado.' },
    { id: 'not_selected', label: 'Não selecionar', confirm: 'Não selecionar esta inscrição neste ciclo? A pessoa será avisada do resultado.' },
  ];
  var LIMITS = { daysMin: 1, daysMax: 60, noteMax: 1000, vacanciesMax: 500 };

  // ---------- Funções puras ----------

  function num(value) { var n = Number(value); return isFinite(n) ? n : 0; }

  /** Os quatro cartões-contador do topo. */
  function counters(overview) {
    var c = (overview && overview.counts) || {};
    return [
      { filter: 'pending', label: 'Para analisar', value: num(c.submitted) + num(c.in_review) + num(c.interview) },
      { filter: 'waitlist', label: 'Lista de espera', value: num(c.waitlist) },
      { filter: 'decided', label: 'Decididas', value: num(c.approved) + num(c.not_selected) },
      { filter: 'appeal', label: 'Pedidos de revisão', value: num((overview || {}).appeals) },
    ];
  }

  function statusLabel(status) { return STATUS_TEXT[status] || String(status || ''); }

  /** dd/mm/aaaa (UTC) de uma data ISO; vazio se inválida. */
  function formatDate(iso) {
    var d = new Date(iso);
    if (!iso || !isFinite(d.getTime())) return '';
    return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear();
  }

  function signalLabels(signals) {
    return (Array.isArray(signals) ? signals : []).map(function (s) { return SIGNAL_TEXT[s]; }).filter(Boolean);
  }

  /** "Farmácia · 5º semestre" a partir do curso e do semestre. */
  function courseLine(item) {
    var sem = item && item.semester;
    var semText = sem === 'concluido' ? 'concluído' : sem ? sem + 'º semestre' : '';
    return [item && item.course, semText].filter(Boolean).join(' · ');
  }

  function listCountText(n) {
    if (n === 0) return 'Nenhuma inscrição neste filtro.';
    return n === 1 ? '1 inscrição' : n + ' inscrições';
  }

  function emptyText(filter) {
    return {
      pending: 'Nada para analisar agora.', waitlist: 'Ninguém na lista de espera.',
      decided: 'Ainda não há inscrições decididas.', appeal: 'Nenhum pedido de revisão.', all: 'Nenhuma inscrição ainda.',
    }[filter] || 'Nenhuma inscrição neste filtro.';
  }

  function oneOf(value, map) { return (map && map[value]) || value; }
  function textOf(value) {
    if (value && typeof value === 'object') return String(value.text || value.answer || '');
    return value === undefined || value === null ? '' : String(value);
  }

  /** Perfil em linhas legíveis. */
  function profileRows(profile) {
    var p = profile || {};
    var rows = [];
    function add(label, value) { if (value) rows.push({ label: label, text: value }); }
    add('Curso', p.course);
    add('Instituição', p.institution);
    add('Semestre', p.semester === 'concluido' ? 'Já concluiu' : p.semester ? p.semester + 'º semestre' : '');
    add('Áreas de interesse', (p.areas || []).join(', '));
    add('Horas por semana', p.hoursPerWeek ? p.hoursPerWeek + ' h' : '');
    add('Dias disponíveis', (p.days || []).map(function (d) { return oneOf(d, DAY_LABEL); }).join(', '));
    add('Turnos', (p.shifts || []).map(function (s) { return oneOf(s, SHIFT_LABEL); }).join(', '));
    add('Por que quer participar', p.motivation);
    return rows;
  }

  /** Respostas livres e de conduta em blocos {title, rows[]} com rótulos fixos. */
  function answerSections(answers) {
    var a = answers || {};
    var sections = [];
    var profile = profileRows(a.profile);
    if (profile.length) sections.push({ id: 'profile', title: 'Perfil', rows: profile });
    var scenario = textOf(a.scenario);
    if (scenario) sections.push({ id: 'scenario', title: 'Análise de cenário', rows: [{ label: '', text: scenario }] });
    var thinking = (a.thinking && a.thinking.answers) || {};
    var tRows = Object.keys(THINKING_LABEL).filter(function (id) { return textOf(thinking[id]); })
      .map(function (id) { return { label: THINKING_LABEL[id], text: textOf(thinking[id]) }; });
    if (tRows.length) sections.push({ id: 'thinking', title: 'Como a pessoa pensa', rows: tRows });
    var conduct = (a.conduct && a.conduct.answers) || {};
    var cRows = Object.keys(CONDUCT_LABEL).filter(function (id) { return textOf(conduct[id]); })
      .map(function (id) { return { label: CONDUCT_LABEL[id], text: textOf(conduct[id]) }; });
    if (cRows.length) sections.push({ id: 'conduct', title: 'Situações de conduta', rows: cRows });
    return sections;
  }

  /** Resumo da IA em linhas de texto (aceita itens como texto ou {label,note,text}). */
  function triageLines(list) {
    return (Array.isArray(list) ? list : []).map(function (x) {
      if (x && typeof x === 'object') return [x.label || x.title, x.note || x.text || x.detail].filter(Boolean).join(': ');
      return String(x || '');
    }).filter(Boolean);
  }

  function decisionOption(id) {
    for (var i = 0; i < DECISIONS.length; i += 1) if (DECISIONS[i].id === id) return DECISIONS[i];
    return null;
  }

  /** Valida o formulário de configurações e monta a carga da API. */
  function settingsPayload(v) {
    var windowDays = Number(v.windowDays);
    var batchEveryDays = Number(v.batchEveryDays);
    if (!Number.isInteger(windowDays) || windowDays < LIMITS.daysMin || windowDays > LIMITS.daysMax) {
      return { ok: false, message: 'O prazo individual deve ficar entre ' + LIMITS.daysMin + ' e ' + LIMITS.daysMax + ' dias.' };
    }
    if (!Number.isInteger(batchEveryDays) || batchEveryDays < LIMITS.daysMin || batchEveryDays > LIMITS.daysMax) {
      return { ok: false, message: 'O intervalo entre lotes deve ficar entre ' + LIMITS.daysMin + ' e ' + LIMITS.daysMax + ' dias.' };
    }
    var next = String(v.nextReviewOn || '').trim();
    if (next && (!/^\d{4}-\d{2}-\d{2}$/.test(next) || !isFinite(Date.parse(next + 'T00:00:00Z')))) {
      return { ok: false, message: 'A data da próxima análise não é válida.' };
    }
    var note = String(v.vacanciesNote || '').trim();
    if (note.length > LIMITS.vacanciesMax) return { ok: false, message: 'A observação de vagas passou de ' + LIMITS.vacanciesMax + ' caracteres.' };
    return { ok: true, payload: { isOpen: !!v.isOpen, windowDays: windowDays, batchEveryDays: batchEveryDays, nextReviewOn: next || null, vacanciesNote: note } };
  }

  // ---------- Navegador ----------

  var ui = null; // { app, doc, root, state }

  function h(tag, attrs, children) { return root.LaiftDom.h(tag, attrs, children); }
  function token() { var s = ui.app.getState && ui.app.getState(); return (s && s.sessionToken) || ''; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function flat(list) { return [].concat.apply([], list).filter(function (x) { return x !== null && x !== undefined && x !== false; }); }

  function say(message, kind) {
    var live = ui.root.querySelector('.sa-live');
    if (!live) return;
    live.textContent = message || '';
    live.className = 'sa-live status-msg' + (kind ? ' ' + kind : '');
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

  function liveRegion() { return h('p', { className: 'sa-live status-msg', role: 'status', 'aria-live': 'polite' }, ''); }

  function focusTitle() {
    var t = ui.root.querySelector('.sa-title');
    if (t && t.focus) t.focus();
  }

  // ----- Lista -----

  function counterCard(c, active) {
    return button([h('span', { className: 'sa-counter__n' }, String(c.value)), h('span', { className: 'sa-counter__l' }, c.label)], 'sa-counter' + (active ? ' is-active' : ''),
      function () { ui.state.filter = c.filter; reloadList(); }, { 'aria-pressed': active ? 'true' : 'false' });
  }

  function itemCard(item) {
    var sig = signalLabels(item.signals);
    var meta = [courseLine(item), formatDate(item.submittedAt) ? 'Enviada em ' + formatDate(item.submittedAt) : ''].filter(Boolean).join(' · ');
    var tags = flat([
      h('span', { className: 'sa-tag sa-tag--status' }, statusLabel(item.status)),
      item.appeal ? h('span', { className: 'sa-tag sa-tag--appeal' }, 'Pediu revisão') : null,
      item.hasTriage ? h('span', { className: 'sa-tag sa-tag--ai' }, 'Resumo da IA') : null,
    ].concat(sig.map(function (s) { return h('span', { className: 'sa-tag sa-tag--warn' }, s); })));
    return h('li', null, [h('button', { type: 'button', className: 'sa-item', onClick: function () { openDetail(item.id); } }, [
      h('span', { className: 'sa-item__name' }, item.name || 'Sem nome'),
      h('span', { className: 'sa-item__meta' }, meta),
      h('span', { className: 'sa-tags' }, tags),
    ])]);
  }

  function renderSettings(ov) {
    var s = ov.settings || {};
    var open = !!ui.state.settingsOpen;
    var panelId = 'sa-settings-body';
    var form = h('form', { className: 'sa-form', id: panelId, noValidate: true, hidden: !open }, [
      h('label', { className: 'sa-check' }, [h('input', { type: 'checkbox', name: 'isOpen', checked: !!s.isOpen }), h('span', null, 'Inscrições abertas')]),
      h('div', { className: 'sa-field' }, [h('label', { for: 'sa-window' }, 'Prazo individual (dias)'), h('input', { id: 'sa-window', name: 'windowDays', type: 'number', min: LIMITS.daysMin, max: LIMITS.daysMax, inputmode: 'numeric', value: String(s.windowDays || 7) })]),
      h('div', { className: 'sa-field' }, [h('label', { for: 'sa-batch' }, 'Intervalo entre lotes (dias)'), h('input', { id: 'sa-batch', name: 'batchEveryDays', type: 'number', min: LIMITS.daysMin, max: LIMITS.daysMax, inputmode: 'numeric', value: String(s.batchEveryDays || 15) })]),
      h('div', { className: 'sa-field' }, [h('label', { for: 'sa-next' }, 'Próxima análise'), h('input', { id: 'sa-next', name: 'nextReviewOn', type: 'date', value: s.nextReviewOn || '' })]),
      h('div', { className: 'sa-field' }, [h('label', { for: 'sa-vac' }, 'Observação de vagas'), h('textarea', { id: 'sa-vac', name: 'vacanciesNote', rows: 3, maxlength: LIMITS.vacanciesMax }, s.vacanciesNote || '')]),
      h('div', { className: 'sa-actions' }, [h('button', { type: 'submit', className: 'sa-primary', id: 'sa-save-settings' }, 'Salvar configurações')]),
    ]);
    form.addEventListener('submit', function (evt) { evt.preventDefault(); saveSettings(form); });
    var toggle = button('Configurações', 'secondary sa-toggle', function () { ui.state.settingsOpen = !ui.state.settingsOpen; form.hidden = !ui.state.settingsOpen; toggle.setAttribute('aria-expanded', String(ui.state.settingsOpen)); },
      { 'aria-expanded': String(open), 'aria-controls': panelId, id: 'sa-settings-toggle' });
    return h('section', { className: 'sa-settings' }, [toggle, form]);
  }

  function saveSettings(form) {
    var v = {
      isOpen: form.elements.isOpen.checked, windowDays: form.elements.windowDays.value, batchEveryDays: form.elements.batchEveryDays.value,
      nextReviewOn: form.elements.nextReviewOn.value, vacanciesNote: form.elements.vacanciesNote.value,
    };
    var out = settingsPayload(v);
    if (!out.ok) { say(out.message, 'error'); return; }
    say('Salvando…', 'info');
    call('apiSelectionCommitteeSettings', out.payload).then(function (res) {
      if (!res.success) { say(res.message || 'Não foi possível salvar.', 'error'); return; }
      var msg = res.message || 'Configurações salvas.';
      reloadList().then(function () { say(msg, 'success'); });
    });
  }

  function generateTriage() {
    say('Gerando resumos…', 'info');
    call('apiSelectionCommitteeTriage', {}).then(function (res) {
      if (!res.success) { say(res.message || 'Não foi possível gerar os resumos.', 'error'); return; }
      var msg = res.message || 'Resumos gerados.';
      reloadList().then(function () { say(msg, 'success'); });
    });
  }

  function renderList() {
    var ov = ui.state.overview;
    var filter = ui.state.filter;
    var items = ov.items || [];
    var cards = counters(ov).map(function (c) { return counterCard(c, c.filter === filter); });
    var list = items.length
      ? h('ul', { className: 'sa-list' }, items.map(itemCard))
      : h('p', { className: 'sa-empty' }, emptyText(filter));
    var head = flat([
      h('h2', { className: 'sa-title', tabIndex: -1 }, 'Processo seletivo: comissão'),
      h('div', { className: 'sa-counters' }, cards),
      h('div', { className: 'sa-bar' }, flat([
        h('p', { className: 'sa-count' }, listCountText(items.length)),
        ov.aiEnabled ? button('Gerar resumos pendentes', 'secondary', generateTriage, { id: 'sa-triage-all' }) : null,
      ])),
    ]);
    return h('section', { className: 'sa-card', 'data-sa-view': 'list' }, head.concat([list, renderSettings(ov), liveRegion()]));
  }

  // ----- Ficha -----

  function answerBlock(section) {
    var rows = section.rows.map(function (r) {
      return h('div', { className: 'sa-answer' }, flat([r.label ? h('dt', null, r.label) : null, h('dd', null, r.text)]));
    });
    return h('section', { className: 'sa-section' }, [h('h3', null, section.title), h('dl', { className: 'sa-answers' }, rows)]);
  }

  function triageBlock(a) {
    var t = a.triage;
    var notice = h('p', { className: 'sa-ai-note' }, 'A IA só resume; quem decide é a comissão.');
    if (!t) {
      return h('section', { className: 'sa-section sa-ai' }, flat([
        h('h3', null, 'Resumo da IA'), notice,
        h('p', { className: 'sa-hint' }, 'Esta inscrição ainda não tem resumo.'),
        ui.state.overview && ui.state.overview.aiEnabled ? button('Gerar resumo desta inscrição', 'secondary', function () { triageOne(a.id); }, { id: 'sa-triage-one' }) : null,
      ]));
    }
    var strengths = triageLines(t.strengths);
    var checks = triageLines(t.checks);
    return h('section', { className: 'sa-section sa-ai' }, flat([
      h('h3', null, 'Resumo da IA'), notice,
      t.summary ? h('p', { className: 'sa-summary' }, t.summary) : null,
      strengths.length ? h('h4', null, 'Pontos fortes') : null,
      strengths.length ? h('ul', null, strengths.map(function (s) { return h('li', null, s); })) : null,
      checks.length ? h('h4', null, 'Conferir na leitura') : null,
      checks.length ? h('ul', null, checks.map(function (s) { return h('li', null, s); })) : null,
    ]));
  }

  function triageOne(id) {
    say('Gerando resumo…', 'info');
    call('apiSelectionCommitteeTriage', { id: id }).then(function (res) {
      if (!res.success) { say(res.message || 'Não foi possível gerar o resumo.', 'error'); return; }
      openDetail(id, res.message || 'Resumo gerado.');
    });
  }

  function decide(a, decision, note) {
    var opt = decisionOption(decision);
    function run() {
      say('Registrando…', 'info');
      call('apiSelectionCommitteeDecide', { id: a.id, decision: decision, note: note }).then(function (res) {
        if (!res.success) { say(res.message || 'Não foi possível registrar a decisão.', 'error'); return; }
        var msg = res.message || 'Decisão registrada.';
        backToList().then(function () { say(msg, 'success'); });
      });
    }
    if (opt && opt.confirm) ui.app.openConfirm(opt.confirm, run); else run();
  }

  function renderDetail(a) {
    var sig = signalLabels(a.signals);
    var note = h('textarea', { id: 'sa-note', rows: 3, maxlength: LIMITS.noteMax }, a.decisionNote || '');
    var buttons = DECISIONS.map(function (d) {
      var kind = d.id === 'approved' ? 'sa-primary' : 'secondary';
      return button(d.label, kind, function () { decide(a, d.id, note.value); }, { 'data-decision': d.id, disabled: a.status === d.id });
    });
    var meta = [a.email, a.receiptCode ? 'Comprovante ' + a.receiptCode : '', formatDate(a.submittedAt) ? 'Enviada em ' + formatDate(a.submittedAt) : ''].filter(Boolean).join(' · ');
    var body = flat([
      button('Voltar para a lista', 'secondary sa-back', function () { backToList(); }, { id: 'sa-back' }),
      h('h2', { className: 'sa-title', tabIndex: -1 }, a.name || 'Sem nome'),
      h('p', { className: 'sa-item__meta' }, meta),
      h('p', { className: 'sa-tags' }, flat([h('span', { className: 'sa-tag sa-tag--status' }, statusLabel(a.status))].concat(sig.map(function (s) { return h('span', { className: 'sa-tag sa-tag--warn' }, s); })))),
      a.appealAt ? h('section', { className: 'sa-section sa-appeal' }, flat([
        h('h3', null, 'Pedido de revisão'), h('p', { className: 'sa-hint' }, 'Em ' + formatDate(a.appealAt)), a.appealNote ? h('p', null, a.appealNote) : null,
      ])) : null,
      triageBlock(a),
    ]).concat(answerSections(a.answers).map(answerBlock)).concat([
      h('section', { className: 'sa-section' }, [
        h('h3', null, 'Decisão da comissão'),
        h('label', { for: 'sa-note', className: 'sa-label' }, 'Observação interna (a pessoa não vê)'),
        note,
        h('div', { className: 'sa-actions' }, buttons),
      ]),
      liveRegion(),
    ]);
    return h('section', { className: 'sa-card', 'data-sa-view': 'detail' }, body);
  }

  function openDetail(id, notice) {
    mount(h('p', { className: 'sa-empty', role: 'status' }, 'Carregando ficha…'));
    return call('apiSelectionCommitteeGet', { id: id }).then(function (res) {
      if (!res.success || !res.application) {
        mount(h('section', { className: 'sa-card' }, [
          h('p', { className: 'sa-error', role: 'alert' }, (res && res.message) || 'Não foi possível abrir a inscrição.'),
          button('Voltar para a lista', 'secondary', function () { backToList(); }),
        ]));
        return;
      }
      ui.state.view = 'detail';
      mount(renderDetail(res.application));
      focusTitle();
      if (notice) say(notice, 'success');
    });
  }

  // ----- Carregamento -----

  function mount(node) { clear(ui.root); ui.root.appendChild(node); }

  function showError(message) {
    mount(h('section', { className: 'sa-card' }, [
      h('p', { className: 'sa-error', role: 'alert' }, message || 'Não foi possível carregar o painel.'),
      button('Tentar de novo', 'secondary', function () { reloadList(); }, { id: 'sa-retry' }),
    ]));
  }

  function reloadList() {
    var first = !ui.state.overview;
    if (first) mount(h('p', { className: 'sa-empty', role: 'status' }, 'Carregando…'));
    return call('apiSelectionCommitteeOverview', { filter: ui.state.filter }).then(function (res) {
      if (!res.success) { showError(res.message); return; }
      ui.state.overview = res;
      ui.state.view = 'list';
      var keepFocus = ui.doc.activeElement && ui.doc.activeElement.classList && ui.doc.activeElement.classList.contains('sa-counter');
      mount(renderList());
      if (!keepFocus) focusTitle();
      else { var active = ui.root.querySelector('.sa-counter.is-active'); if (active) active.focus(); }
    });
  }

  function backToList() { return reloadList(); }

  function loadPanel(app, doc) {
    var d = doc || root.document;
    var host = d.getElementById('selection-admin-root');
    if (!host) return Promise.resolve();
    ui = { app: app || root.App, doc: d, root: host, state: { filter: 'pending', overview: null, settingsOpen: false } };
    return reloadList();
  }

  /** Some da tela com a sessão (dados pessoais dos candidatos). */
  function reset() {
    if (!ui) return;
    clear(ui.root);
    ui.state = { filter: 'pending', overview: null, settingsOpen: false };
  }

  var api = {
    FILTERS: FILTERS, DECISIONS: DECISIONS, LIMITS: LIMITS, counters: counters, statusLabel: statusLabel, formatDate: formatDate,
    signalLabels: signalLabels, courseLine: courseLine, listCountText: listCountText, emptyText: emptyText, profileRows: profileRows,
    answerSections: answerSections, triageLines: triageLines, decisionOption: decisionOption, settingsPayload: settingsPayload,
    load: loadPanel, reset: reset,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftSelectionAdmin = api;
})(typeof window !== 'undefined' ? window : globalThis);
