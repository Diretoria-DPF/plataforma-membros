/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Processo seletivo dentro da plataforma (painel "Processo seletivo"; docs/planos/PROCESSO-SELETIVO.md).
// A pessoa percorre: aceite, perfil, análise de cenário, perguntas de raciocínio, situações de conduta, revisão e envio.
// Tudo é validado de novo no servidor (Worker); aqui só se guia e se mostra. Sem innerHTML (LaiftDom.h) e sem
// estilo inline (selection.css). Nada é guardado no navegador: o rascunho vive no servidor, por perfil.
// As funções puras são testadas em Node (scripts/selection.test.mjs). Expõe window.LaiftSelection.
(function (root) {
  'use strict';

  var STEPS = [
    { id: 'intro', label: 'Aceite' },
    { id: 'profile', label: 'Perfil' },
    { id: 'scenario', label: 'Cenário' },
    { id: 'thinking', label: 'Seu raciocínio' },
    { id: 'conduct', label: 'Conduta' },
    { id: 'review', label: 'Revisão' },
  ];
  var STATUS_TEXT = {
    draft: 'Em andamento', submitted: 'Enviada', in_review: 'Em análise', interview: 'Entrevista', approved: 'Aprovado(a)',
    waitlist: 'Lista de espera', not_selected: 'Não selecionado(a) neste ciclo', withdrawn: 'Retirada', expired: 'Prazo encerrado',
  };
  var DAY_LABEL = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb' };
  var SHIFT_LABEL = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
  var DAY_MS = 24 * 60 * 60 * 1000;

  // ---------- Funções puras ----------

  function stepIndex(id) {
    for (var i = 0; i < STEPS.length; i += 1) if (STEPS[i].id === id) return i;
    return -1;
  }

  /** Dias inteiros que faltam (arredonda para cima); 0 se acabou ou a data é inválida. */
  function daysLeft(deadlineIso, nowMs) {
    var end = Date.parse(deadlineIso);
    if (!isFinite(end)) return 0;
    return Math.max(0, Math.ceil((end - nowMs) / DAY_MS));
  }

  /** dd/mm de uma data ISO (UTC). */
  function formatDay(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }

  /** "2026-11-05" -> "05/11". */
  function formatReviewDate(isoDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    return m ? m[3] + '/' + m[2] : '';
  }

  /** "Você tem 5 dias para concluir (até 25/10)" e variações. */
  function deadlineText(deadlineIso, nowMs) {
    var left = daysLeft(deadlineIso, nowMs);
    if (left <= 0) return 'O prazo desta inscrição terminou.';
    if (left === 1) return 'Último dia para concluir (até ' + formatDay(deadlineIso) + ').';
    return 'Você tem ' + left + ' dias para concluir (até ' + formatDay(deadlineIso) + ').';
  }

  /** Estado do contador de caracteres do texto livre. */
  function charInfo(length, max) {
    if (length > max) return { state: 'long', text: length + ' caracteres: passou do limite de ' + max };
    return { state: 'ok', text: length + ' de ' + max + ' caracteres' };
  }

  /** Linha do tempo do status depois do envio: concluída, atual ou futura. */
  function timeline(status) {
    var order = ['submitted', 'in_review', 'interview', 'result'];
    var labels = { submitted: 'Enviada', in_review: 'Em análise', interview: 'Entrevista', result: 'Resultado' };
    var at = { submitted: 0, in_review: 1, interview: 2, waitlist: 3, approved: 3, not_selected: 3 }[status];
    if (at === undefined) at = 0;
    return order.map(function (id, i) { return { id: id, label: labels[id], state: i < at ? 'done' : i === at ? 'current' : 'todo' }; });
  }

  /** Em qual tela abrir: rascunho vai para a etapa em que parou; o resto, para o andamento. */
  function initialView(application) {
    if (!application) return 'welcome';
    if (application.status === 'draft') return application.step === 'done' ? 'status' : application.step;
    return 'status';
  }

  /** A etapa `id` pode ser aberta pelo passo a passo? Só as já alcançadas; a revisão, só com tudo preenchido. */
  function canVisit(id, application) {
    if (!application || application.status !== 'draft') return false;
    var data = application.data || {};
    if (id === 'review') return !!(data.intro && data.profile && data.scenario && data.thinking && data.conduct);
    return stepIndex(id) <= stepIndex(application.step);
  }

  // ---------- Navegador ----------

  var ui = null; // { app, doc, root, state }

  function h(tag, attrs, children) { return root.LaiftDom.h(tag, attrs, children); }
  function token() { var s = ui.app.getState && ui.app.getState(); return (s && s.sessionToken) || ''; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function say(message, kind) {
    var live = ui.root.querySelector('.sel-live');
    if (!live) return;
    live.textContent = message || '';
    live.className = 'sel-live status-msg' + (kind ? ' ' + kind : '');
  }

  function call(action, payload) {
    var args = payload === undefined ? [action, token()] : [action, token(), payload];
    return ui.app.callApi.apply(ui.app, args).then(function (res) {
      return res || { success: false, message: 'Sem resposta. Tente de novo.' };
    }, function () { return { success: false, message: 'Sem conexão. Tente de novo.' }; });
  }

  /** Campo-isca: fica fora da tela e de leitores de tela; uma pessoa nunca o preenche. */
  function honeypot() {
    return h('div', { className: 'sel-ot', 'aria-hidden': 'true' }, [
      h('label', null, ['Não preencha este campo', h('input', { type: 'text', name: 'website', tabIndex: -1, autocomplete: 'off' })]),
    ]);
  }
  function honeyValue(formEl) { var f = formEl && formEl.querySelector('input[name="website"]'); return f ? f.value : ''; }

  function button(label, kind, onClick, extra) {
    return h('button', Object.assign({ type: 'button', className: kind || '', onClick: onClick }, extra || {}), label);
  }

  function field(label, control, hint, id) {
    return h('div', { className: 'sel-field' }, [
      h('label', { for: id, className: 'sel-label' }, label),
      control,
      hint ? h('p', { className: 'sel-hint', id: id + '-hint' }, hint) : null,
    ]);
  }

  function choices(name, type, options, selected, labelOf) {
    var picked = [].concat(selected || []);
    return h('div', { className: 'sel-choices', role: type === 'radio' ? 'radiogroup' : 'group' }, options.map(function (opt, i) {
      var value = typeof opt === 'string' ? opt : opt.id;
      var text = labelOf ? labelOf(opt) : (typeof opt === 'string' ? opt : opt.text);
      var id = name + '-' + i;
      return h('label', { className: 'sel-choice', for: id }, [
        h('input', { type: type, id: id, name: name, value: value, checked: picked.indexOf(value) !== -1 }),
        h('span', { className: 'sel-choice__text' }, text),
      ]);
    }));
  }

  function picked(container, name) {
    return Array.prototype.map.call(container.querySelectorAll('input[name="' + name + '"]:checked'), function (n) { return n.value; });
  }

  // ---------- Telas ----------

  function stepper(app, view) {
    var items = STEPS.map(function (s, i) {
      var current = s.id === view;
      var done = i < stepIndex(app.step);
      var attrs = { type: 'button', className: 'sel-step' + (current ? ' is-current' : '') + (done ? ' is-done' : ''), onClick: function () { go(s.id); } };
      if (current) attrs['aria-current'] = 'step';
      if (!canVisit(s.id, app)) attrs.disabled = true;
      return h('li', null, [h('button', attrs, [h('span', { className: 'sel-step__n' }, done ? '✓' : String(i + 1)), h('span', { className: 'sel-step__t' }, s.label)])]);
    });
    return h('nav', { className: 'sel-steps', 'aria-label': 'Etapas da inscrição' }, [h('ol', null, items)]);
  }

  function frame(title, intro, bodyNodes, view) {
    var app = ui.state.application;
    var draft = !!(app && app.status === 'draft');
    var head = [
      draft && view !== 'status' ? stepper(app, view) : null,
      h('h2', { className: 'sel-title', tabIndex: -1, id: 'sel-title' }, title),
      intro ? h('p', { className: 'sel-intro' }, intro) : null,
      draft && app.deadlineAt ? h('p', { className: 'sel-deadline' }, deadlineText(app.deadlineAt, Date.now())) : null,
    ];
    var live = h('p', { className: 'sel-live status-msg', role: 'status', 'aria-live': 'polite' }, '');
    // O corpo pode ser um nó ou uma lista de nós: achata aqui (LaiftDom.h só aceita um nível).
    return h('section', { className: 'sel-card', 'data-sel-step': view }, head.concat(bodyNodes, [live]));
  }

  function renderWelcome() {
    var ov = ui.state.overview || {};
    var review = formatReviewDate(ov.nextReviewOn);
    var points = [
      ['Leva cerca de 25 minutos', 'Você pode parar e voltar: o rascunho fica salvo.'],
      ['Seis etapas', 'Aceite, perfil, análise de cenário, seu raciocínio, situações de conduta e revisão.'],
      ['Sem eliminação automática', 'A IA ajuda a organizar a leitura; quem decide é a comissão.'],
      ['Prazo para concluir', 'Depois de começar, você tem ' + (ov.windowDays || 7) + ' dias. ' + (review ? 'Próxima análise da comissão: ' + review + '.' : 'A comissão analisa as inscrições em lotes.')],
    ];
    var days = ov.windowDays || 7;
    var how = [
      'Você já está com a conta criada: é só começar.',
      'São seis passos, no seu ritmo, no celular ou no computador.',
      'Seu rascunho fica salvo: você pode parar e voltar. O prazo é individual: ' + days + ' dias a partir do início.',
      'A comissão analisa as inscrições em lotes' + (review ? ' (próxima análise: ' + review + ')' : '') + '. A Guia ajuda em qualquer dúvida.',
    ];
    return frame('Entre para a LAIFT', 'Inscrição sempre aberta. Faça no seu ritmo, no celular ou no computador.', [
      h('div', { className: 'sel-how' }, [h('h3', { className: 'sel-how__t' }, 'Como funciona'), h('ol', { className: 'sel-how__l' }, how.map(function (t) { return h('li', null, t); }))]),
      h('ul', { className: 'sel-points' }, points.map(function (p) { return h('li', null, [h('strong', null, p[0]), h('span', null, p[1])]); })),
      ov.open === false ? h('p', { className: 'sel-notice' }, 'As inscrições estão fechadas no momento. Acompanhe @laift.liga.') : h('div', { className: 'sel-actions' }, [
        button('Começar inscrição', 'sel-primary', startJourney, { id: 'sel-start' }),
        h('a', { className: 'sel-link', href: 'edital.html', target: '_blank', rel: 'noopener noreferrer' }, 'Ler o edital'),
      ]),
    ], 'welcome');
  }

  function startJourney() {
    var startBtn = ui.root.querySelector('#sel-start');
    if (startBtn && startBtn.disabled) return; // clique duplo: uma chamada só
    if (startBtn) startBtn.disabled = true;
    say('Preparando sua inscrição…', 'info');
    call('apiSelectionStart').then(function (res) {
      if (startBtn) startBtn.disabled = false;
      if (!res.success) { say(res.message, 'error'); return; }
      adopt(res);
      go(initialView(res.application));
    });
  }

  function adopt(res) {
    if (res.application !== undefined) ui.state.application = res.application;
    if (res.content) ui.state.content = res.content;
  }

  function form(children, onSubmit) {
    var f = h('form', { className: 'sel-form', noValidate: true }, children.concat([honeypot()]));
    f.addEventListener('submit', function (evt) { evt.preventDefault(); onSubmit(f); });
    return f;
  }

  function saveAndNext(step, data, formEl) {
    say('Salvando…', 'info');
    var submitBtn = formEl && formEl.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    call('apiSelectionSaveStep', { step: step, data: data, website: honeyValue(formEl) }).then(function (res) {
      if (submitBtn) submitBtn.disabled = false;
      if (!res.success) { say(res.message, 'error'); return; }
      adopt(res);
      go(STEPS[Math.min(stepIndex(step) + 1, STEPS.length - 1)].id, (res.warnings || []).join(' '));
    });
  }

  function backButton(prev) { return button('Voltar', 'secondary', function () { go(prev); }); }
  function submitButton(label, id) { return h('button', { type: 'submit', className: 'sel-primary', id: id }, label); }

  function renderIntro() {
    var saved = (ui.state.application.data || {}).intro || {};
    var boxes = [
      ['acceptedEdital', 'Li e aceito o edital do processo seletivo.'],
      ['acceptedPrivacy', 'Concordo com o tratamento dos meus dados pela comissão para a seleção (Política de Privacidade).'],
      ['acceptedAiNotice', 'Entendi que uma IA organiza e resume as respostas para a comissão, mas não decide nem elimina ninguém, e que posso pedir revisão.'],
    ];
    var f = form([
      h('div', { className: 'sel-checks' }, boxes.map(function (b) {
        return h('label', { className: 'sel-choice' }, [h('input', { type: 'checkbox', name: b[0], checked: !!saved[b[0]] }), h('span', { className: 'sel-choice__text' }, b[1])]);
      })),
      h('p', { className: 'sel-hint' }, ['Nos campos de texto, não escreva dados de saúde, seus ou de terceiros. ', h('a', { href: 'edital.html', target: '_blank', rel: 'noopener noreferrer' }, 'Edital'), ' · ', h('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener noreferrer' }, 'Privacidade')]),
      h('div', { className: 'sel-actions' }, [submitButton('Aceitar e continuar')]),
    ], function (f2) {
      var data = {};
      boxes.forEach(function (b) { data[b[0]] = !!f2.querySelector('input[name="' + b[0] + '"]').checked; });
      saveAndNext('intro', data, f2);
    });
    return frame('Antes de começar', 'Três confirmações rápidas.', f, 'intro');
  }

  function renderProfile() {
    var c = ui.state.content;
    var p = (ui.state.application.data || {}).profile || {};
    var pick = h('option', { value: '' }, 'Escolha');
    var course = h('select', { id: 'sel-course', name: 'course' }, [pick].concat(c.courses.map(function (x) { return h('option', { value: x, selected: p.course === x }, x); })));
    var semester = h('select', { id: 'sel-semester', name: 'semester' }, [h('option', { value: '' }, 'Escolha')].concat(c.semesters.map(function (x) { return h('option', { value: x, selected: String(p.semester) === x }, x === 'concluido' ? 'Já concluí' : x + 'º semestre'); })));
    var institution = h('input', { id: 'sel-institution', name: 'institution', type: 'text', maxlength: c.limits.institution, value: p.institution || '', autocomplete: 'organization' });
    var hours = h('input', { id: 'sel-hours', name: 'hoursPerWeek', type: 'number', min: 1, max: c.limits.hoursMax, inputmode: 'numeric', value: p.hoursPerWeek ? String(p.hoursPerWeek) : '' });
    var motivation = h('textarea', { id: 'sel-motivation', name: 'motivation', rows: 3, maxlength: c.limits.motivation }, p.motivation || '');
    var f = form([
      field('Curso', course, null, 'sel-course'),
      field('Instituição', institution, null, 'sel-institution'),
      field('Semestre', semester, null, 'sel-semester'),
      h('fieldset', { className: 'sel-fieldset' }, [h('legend', null, 'Áreas de interesse (até ' + c.limits.areasMax + ')'), choices('areas', 'checkbox', c.areas, p.areas)]),
      field('Horas por semana que consegue dedicar', hours, 'Entre 1 e ' + c.limits.hoursMax + ' horas.', 'sel-hours'),
      h('fieldset', { className: 'sel-fieldset' }, [h('legend', null, 'Dias disponíveis'), choices('days', 'checkbox', c.days, p.days, function (d) { return DAY_LABEL[d]; })]),
      h('fieldset', { className: 'sel-fieldset' }, [h('legend', null, 'Turnos'), choices('shifts', 'checkbox', c.shifts, p.shifts, function (s) { return SHIFT_LABEL[s]; })]),
      field('Por que quer participar? (opcional)', motivation, 'No máximo ' + c.limits.motivation + ' caracteres. Sem e-mail, telefone ou dados de saúde.', 'sel-motivation'),
      h('div', { className: 'sel-actions' }, [backButton('intro'), submitButton('Salvar e continuar')]),
    ], function (f2) {
      saveAndNext('profile', {
        course: course.value, institution: institution.value, semester: semester.value, areas: picked(f2, 'areas'),
        hoursPerWeek: Number(hours.value), days: picked(f2, 'days'), shifts: picked(f2, 'shifts'), motivation: motivation.value,
      }, f2);
    });
    return frame('Seu perfil', 'Conte um pouco sobre você e sua disponibilidade.', f, 'profile');
  }

  function renderScenario() {
    var sc = ui.state.content.scenario;
    var saved = ((ui.state.application.data || {}).scenario || {}).text || '';
    var area = h('textarea', { id: 'sel-scenario', name: 'text', rows: 12, maxlength: sc.maxChars + 200, 'aria-describedby': 'sel-counter' }, saved);
    var counter = h('p', { className: 'sel-counter', id: 'sel-counter' }, '');
    function update() { var info = charInfo(area.value.length, sc.maxChars); counter.textContent = info.text; counter.className = 'sel-counter is-' + info.state; }
    area.addEventListener('input', update);
    update();
    var f = form([
      h('p', { className: 'sel-prompt' }, sc.prompt),
      h('ul', { className: 'sel-tips' }, sc.hints.map(function (t) { return h('li', null, t); })),
      field('Sua análise', area, null, 'sel-scenario'),
      counter,
      h('div', { className: 'sel-actions' }, [backButton('profile'), submitButton('Salvar e continuar')]),
    ], function (f2) {
      if (!area.value.trim()) { say('Escreva sua resposta para continuar.', 'error'); area.focus(); return; }
      saveAndNext('scenario', { text: area.value }, f2);
    });
    return frame('Análise de cenário', 'Mostre como você pensa. A resposta tem de ser sua.', f, 'scenario');
  }

  /** Perguntas abertas (raciocínio e conduta): um campo por pergunta, com contador e máximo. */
  function openQuestions(step, list, bodyOf, saved, prev, submitLabel) {
    var areas = {};
    var blocks = list.map(function (q, i) {
      var id = step + '-' + q.id;
      var area = h('textarea', { id: id, name: q.id, rows: 6, maxlength: q.max + 200, 'aria-describedby': id + '-counter' }, saved[q.id] || '');
      var counter = h('p', { className: 'sel-counter', id: id + '-counter' }, '');
      var update = function () { var info = charInfo(area.value.length, q.max); counter.textContent = info.text; counter.className = 'sel-counter is-' + info.state; };
      area.addEventListener('input', update);
      update();
      areas[q.id] = area;
      return h('div', { className: 'sel-question' }, [
        h('p', { className: 'sel-prompt' }, (i + 1) + '. ' + q.title),
        h('p', { className: 'sel-situation' }, bodyOf(q)),
        field('Sua resposta', area, 'Até ' + q.max + ' caracteres. Sem dados de saúde nem contatos.', id),
        counter,
      ]);
    });
    return form([
      h('div', { className: 'sel-questions' }, blocks),
      h('div', { className: 'sel-actions' }, [backButton(prev), submitButton(submitLabel)]),
    ], function (f2) {
      var answers = {};
      var bad = null;
      list.forEach(function (q) {
        var v = areas[q.id].value;
        answers[q.id] = v;
        if (!bad && !v.trim()) bad = q;
      });
      if (bad) { say('Escreva sua resposta para continuar.', 'error'); areas[bad.id].focus(); return; }
      saveAndNext(step, { answers: answers }, f2);
    });
  }

  function renderThinking() {
    var list = ui.state.content.thinking || [];
    var saved = (((ui.state.application.data || {}).thinking) || {}).answers || {};
    var f = openQuestions('thinking', list, function (q) { return q.prompt; }, saved, 'scenario', 'Salvar e continuar');
    return frame('Seu raciocínio', 'Sem certo ou errado: queremos entender como você pensa. Responda com suas palavras, em poucas linhas.', [f], 'thinking');
  }

  function renderConduct() {
    var list = ui.state.content.conduct || [];
    var saved = (((ui.state.application.data || {}).conduct) || {}).answers || {};
    var f = openQuestions('conduct', list, function (q) { return q.situation; }, saved, 'thinking', 'Salvar e revisar');
    return frame('Situações de conduta', 'Em cada situação, conte o que você faria e por quê. Não há resposta perfeita: vale a sua honestidade.', [f], 'conduct');
  }

  function summaryRow(label, value, step) {
    return h('li', { className: 'sel-sum' }, [h('span', { className: 'sel-sum__l' }, label), h('span', { className: 'sel-sum__v' }, value), button('Editar', 'link-btn', function () { go(step); })]);
  }

  function renderReview() {
    var d = ui.state.application.data || {};
    var p = d.profile || {};
    var f = form([
      h('ul', { className: 'sel-summary' }, [
        summaryRow('Aceite', 'Edital, privacidade e triagem por IA aceitos', 'intro'),
        summaryRow('Perfil', [p.course, p.institution, p.semester === 'concluido' ? 'concluído' : p.semester + 'º sem.', (p.hoursPerWeek || 0) + ' h/semana'].filter(Boolean).join(' · '), 'profile'),
        summaryRow('Análise de cenário', ((d.scenario || {}).text || '').length + ' caracteres', 'scenario'),
        summaryRow('Seu raciocínio', d.thinking ? 'Respondido' : 'Pendente', 'thinking'),
        summaryRow('Conduta', d.conduct ? 'Respondidas' : 'Pendentes', 'conduct'),
      ]),
      h('p', { className: 'sel-hint' }, 'Depois de enviar, não dá para editar. Você recebe um comprovante e acompanha o andamento aqui.'),
      h('div', { className: 'sel-actions' }, [backButton('conduct'), submitButton('Enviar inscrição', 'sel-send')]),
    ], function (f2) {
      ui.app.openConfirm('Enviar sua inscrição agora? Depois do envio você não poderá editar as respostas.', function () {
        say('Enviando…', 'info');
        call('apiSelectionSubmit', { website: honeyValue(f2) }).then(function (res) {
          if (!res.success) { say(res.message, 'error'); return; }
          adopt(res);
          go('status');
        });
      });
    });
    return frame('Revise e envie', 'Confira o resumo antes de enviar.', f, 'review');
  }

  function renderStatus() {
    var app = ui.state.application;
    if (!app) return renderWelcome();
    if (app.status === 'draft') {
      return frame('Inscrição em andamento', 'Continue de onde parou.', [h('div', { className: 'sel-actions' }, [button('Continuar inscrição', 'sel-primary', function () { go(app.step === 'done' ? 'review' : app.step); })])], 'status');
    }
    var body = [];
    if (app.receiptCode) body.push(h('p', { className: 'sel-receipt' }, ['Comprovante: ', h('strong', null, app.receiptCode)]));
    var review = formatReviewDate((ui.state.overview || {}).nextReviewOn);
    if (app.status === 'submitted' || app.status === 'in_review' || app.status === 'interview') {
      body.push(h('ol', { className: 'sel-timeline' }, timeline(app.status).map(function (t) { return h('li', { className: 'is-' + t.state }, t.label); })));
      body.push(h('p', { className: 'sel-hint' }, (review ? 'Próxima análise da comissão: ' + review + '. ' : '') + 'O resultado chega pela plataforma e por e-mail.'));
      if (app.status === 'submitted') body.push(h('div', { className: 'sel-actions' }, [button('Retirar inscrição', 'secondary', withdraw)]));
    } else {
      body.push(h('p', { className: 'sel-notice' }, 'Situação: ' + (STATUS_TEXT[app.status] || app.status) + '.'));
      if (app.status === 'expired' || app.status === 'withdrawn') body.push(h('div', { className: 'sel-actions' }, [button('Começar nova inscrição', 'sel-primary', startJourney)]));
    }
    return frame('Sua inscrição: ' + (STATUS_TEXT[app.status] || app.status), null, body, 'status');
  }

  function withdraw() {
    ui.app.openConfirm('Retirar a inscrição? Você poderá começar outra depois de alguns dias.', function () {
      call('apiSelectionWithdraw').then(function (res) {
        if (!res.success) { say(res.message, 'error'); return; }
        reload();
      });
    });
  }

  var VIEWS = { welcome: renderWelcome, intro: renderIntro, profile: renderProfile, scenario: renderScenario, thinking: renderThinking, conduct: renderConduct, review: renderReview, status: renderStatus };

  /** Avisa o Processo seletivo v2 (selection-v2.js, só com a flag) de que a tela foi desenhada; sem ouvinte, não faz nada. */
  function notifyRendered(view) {
    try {
      if (ui.doc && typeof root.CustomEvent === 'function') ui.doc.dispatchEvent(new root.CustomEvent('laift:selection-render', { detail: { view: view } }));
    } catch (e) { /* só enfeite: a jornada de sempre não depende disso */ }
  }

  function go(view, notice) {
    var app = ui.state.application;
    var target = VIEWS[view] ? view : 'welcome';
    if (target !== 'welcome' && target !== 'status' && !(app && app.status === 'draft')) target = app ? 'status' : 'welcome';
    ui.state.view = target;
    clear(ui.root);
    ui.root.appendChild(VIEWS[target]());
    notifyRendered(target); // antes do foco: a Seletivo v2 pode reposicionar nós
    var title = ui.root.querySelector('#sel-title');
    if (title && title.focus) title.focus();
    if (notice) say(notice, 'info');
  }

  var LOAD_NETWORK_MESSAGE = 'Não conseguimos falar com o servidor agora. Confira sua conexão e tente de novo.';
  var LOAD_DISABLED_MESSAGE = 'As inscrições não estão abertas na plataforma agora. Acompanhe @laift.liga.';

  /**
   * O que mostrar ao abrir o painel. Falha de rede ou do servidor NÃO é
   * "inscrições fechadas": vira erro com "Tentar de novo". Só enabled:false
   * (resposta real do servidor) diz que as inscrições não estão na plataforma.
   */
  function loadOutcome(overviewRes, mineRes) {
    var ov = overviewRes || {};
    if (!ov.success) return { kind: 'error', message: ov.networkUnavailable || !ov.message ? LOAD_NETWORK_MESSAGE : ov.message };
    if (mineRes && !mineRes.success && mineRes.networkUnavailable) return { kind: 'error', message: LOAD_NETWORK_MESSAGE };
    if (ov.enabled === false) return { kind: 'disabled', message: LOAD_DISABLED_MESSAGE };
    return { kind: 'ready', message: '' };
  }

  function renderLoadProblem(outcome) {
    clear(ui.root);
    var body = [h('h2', { className: 'sel-title', tabIndex: -1, id: 'sel-title' }, 'Processo seletivo')];
    if (outcome.kind === 'error') {
      body.push(h('p', { className: 'sel-notice status-msg error', role: 'alert' }, outcome.message));
      body.push(h('div', { className: 'sel-actions' }, [button('Tentar de novo', 'sel-primary', function () { reload(); }, { id: 'sel-retry' })]));
    } else {
      body.push(h('p', { className: 'sel-notice' }, outcome.message));
    }
    ui.root.appendChild(h('section', { className: 'sel-card', 'data-sel-load': outcome.kind }, body));
  }

  function reload() {
    clear(ui.root);
    ui.root.appendChild(h('p', { className: 'muted', role: 'status' }, 'Carregando…'));
    var ask = [call('apiSelectionOverview')];
    if (token()) ask.push(call('apiSelectionGetMine'));
    return Promise.all(ask).then(function (out) {
      var outcome = loadOutcome(out[0], out[1]);
      if (outcome.kind !== 'ready') { renderLoadProblem(outcome); return; }
      ui.state.overview = out[0];
      if (out[1] && out[1].success) adopt(out[1]); else ui.state.application = null;
      go(initialView(ui.state.application));
    });
  }

  function loadPanel(app, doc) {
    var d = doc || root.document;
    var host = d.getElementById('selection-root');
    if (!host) return Promise.resolve();
    ui = { app: app || root.App, doc: d, root: host, state: {} };
    return reload();
  }

  /** Estado da jornada ({ overview, application, content, view }) para a v2 desenhar sem nova chamada à API. */
  function snapshot() { return ui ? ui.state : null; }
  /** Abre uma etapa pelo mesmo caminho do passo a passo (go respeita as regras de acesso). */
  function openView(view) { if (ui) go(view); }

  var api = {
    snapshot: snapshot, openView: openView,
    STEPS: STEPS, STATUS_TEXT: STATUS_TEXT, stepIndex: stepIndex, daysLeft: daysLeft, deadlineText: deadlineText, charInfo: charInfo,
    timeline: timeline, initialView: initialView, canVisit: canVisit, formatReviewDate: formatReviewDate, loadOutcome: loadOutcome, load: loadPanel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftSelection = api;
})(typeof window !== 'undefined' ? window : globalThis);
