/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tela "Cursos" (Onda 1; docs/cursos-operacao.md): lista, ficha do curso, aula, prova (uma questão por tela),
// resultado e certificado imprimível com carga horária e QR de verificação. Fala com a Worker só pela ponte
// LaiftApi (o token nunca passa por aqui). Quem decide tudo é a Worker: nota, tentativas, prazo e certificado;
// a tela nunca recebe o gabarito. Só DOM seguro (createElement e textContent), sem innerHTML nem estilo inline.
(function (root) {
  'use strict';

  var doc = root.document;
  var Core = root.LaiftCursosCore;
  var view = doc.getElementById('cr-view');
  var titleEl = doc.getElementById('cr-title');
  var msgEl = doc.getElementById('cr-msg');
  var backBtn = doc.getElementById('cr-back');
  var backAction = null;
  var exam = null; // { attemptId, expiresAt, questions, answers, index, courseId }

  function api(action, input) {
    if (!root.LaiftApi) return Promise.resolve({ success: false, message: 'Abra os cursos pela plataforma.' });
    return root.LaiftApi.call(action, input || {});
  }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function button(text, cls, onClick) {
    var b = el('button', cls || 'cr-btn', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function say(text, kind) {
    msgEl.textContent = text || '';
    msgEl.className = 'cr-msg' + (text ? '' : ' hidden') + (kind ? ' cr-msg--' + kind : '');
  }

  function screen(title, back) {
    clear(view);
    say('');
    titleEl.textContent = title;
    backAction = back || null;
    backBtn.classList.toggle('hidden', !back);
    try { titleEl.focus({ preventScroll: false }); } catch (e) { /* foco opcional */ }
    root.scrollTo(0, 0);
  }

  backBtn.addEventListener('click', function () { if (backAction) backAction(); });

  function fail(res) { say((res && res.message) || 'Não foi possível carregar agora. Tente de novo.', 'erro'); }

  // ---------------------------------------------------------------------------------------------------------------
  // Lista
  // ---------------------------------------------------------------------------------------------------------------
  function showList() {
    screen('Cursos', null);
    view.appendChild(el('p', 'cr-muted', 'Carregando…'));
    Promise.all([api('apiLearnCourseList'), api('apiLearnCertificateListMine')]).then(function (out) {
      var res = out[0];
      var certs = out[1] && out[1].success ? out[1].certificates || [] : [];
      clear(view);
      if (!res || !res.success) { fail(res); return; }
      if (!res.enabled) { view.appendChild(el('p', 'cr-empty', 'Os cursos ainda não estão disponíveis.')); return; }
      if (!res.courses.length) { view.appendChild(el('p', 'cr-empty', 'Nenhum curso disponível por enquanto.')); return; }
      var list = el('ul', 'cr-list');
      res.courses.forEach(function (c) {
        var li = el('li', 'cr-card');
        var open = button('', 'cr-card__btn', function () { showCourse(c.id); });
        open.appendChild(el('span', 'cr-card__title', c.title));
        open.appendChild(el('span', 'cr-card__meta', Core.workloadText(c.workloadMinutes) + ' · ' + c.lessonCount + (c.lessonCount === 1 ? ' aula' : ' aulas')));
        var state = c.passed ? 'Aprovação registrada' : c.lessonsDone ? c.lessonsDone + ' de ' + c.lessonCount + ' aulas lidas' : 'Não iniciado';
        open.appendChild(el('span', 'cr-tag' + (c.passed ? ' cr-tag--ok' : ''), state));
        li.appendChild(open);
        list.appendChild(li);
      });
      view.appendChild(list);
      if (certs.length) {
        view.appendChild(el('h2', 'cr-sub', 'Meus certificados'));
        var cl = el('ul', 'cr-list');
        certs.forEach(function (cert) {
          var li = el('li', 'cr-card');
          var b = button('', 'cr-card__btn', function () { showCertificate(cert, showList); });
          b.appendChild(el('span', 'cr-card__title', cert.courseTitle));
          b.appendChild(el('span', 'cr-card__meta', Core.certStatusText(cert.status) + ' · ' + Core.dateText(cert.issuedAt)));
          li.appendChild(b);
          cl.appendChild(li);
        });
        view.appendChild(cl);
      }
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Ficha do curso
  // ---------------------------------------------------------------------------------------------------------------
  function showCourse(courseId) {
    screen('Curso', showList);
    api('apiLearnCourseGet', { courseId: courseId }).then(function (res) {
      if (!res || !res.success) { fail(res); return; }
      var c = res.course;
      titleEl.textContent = c.title;
      if (c.summary) view.appendChild(el('p', 'cr-lead', c.summary));
      var facts = el('ul', 'cr-facts');
      facts.appendChild(el('li', null, 'Carga horária: ' + Core.workloadText(c.workloadMinutes)));
      facts.appendChild(el('li', null, 'Nota mínima: ' + c.passPct + '%'));
      facts.appendChild(el('li', null, 'Tentativas: até ' + c.maxAttempts));
      if (c.validityMonths) facts.appendChild(el('li', null, 'Validade do certificado: ' + c.validityMonths + ' meses'));
      view.appendChild(facts);
      view.appendChild(el('h2', 'cr-sub', 'Aulas'));
      var ol = el('ol', 'cr-list');
      res.lessons.forEach(function (l) {
        var li = el('li', 'cr-card');
        var b = button('', 'cr-card__btn', function () { showLesson(courseId, l.position); });
        b.appendChild(el('span', 'cr-card__title', l.position + '. ' + l.title));
        b.appendChild(el('span', 'cr-tag' + (l.done ? ' cr-tag--ok' : ''), l.done ? 'Lida' : 'Cerca de ' + l.minMinutes + ' min'));
        li.appendChild(b);
        ol.appendChild(li);
      });
      view.appendChild(ol);
      var box = el('div', 'cr-box');
      box.appendChild(el('h2', 'cr-sub', 'Prova'));
      box.appendChild(el('p', null, Core.examText(res.exam)));
      if (Core.canStart(res.exam)) {
        box.appendChild(button(res.exam.state === 'em_andamento' ? 'Continuar a prova' : 'Começar a prova', 'cr-btn cr-btn--primary', function () { startExam(courseId); }));
      }
      if (res.exam && res.exam.state === 'aprovado') {
        box.appendChild(button('Meu certificado', 'cr-btn cr-btn--primary', function () { askCertificate(courseId); }));
      }
      view.appendChild(box);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Aula
  // ---------------------------------------------------------------------------------------------------------------
  function showLesson(courseId, position) {
    screen('Aula', function () { showCourse(courseId); });
    api('apiLearnCourseLesson', { courseId: courseId, position: position }).then(function (res) {
      if (!res || !res.success) { fail(res); return; }
      var l = res.lesson;
      titleEl.textContent = l.position + '. ' + l.title;
      var article = el('article', 'cr-lesson');
      article.appendChild(Core.renderMarkdown(doc, l.body));
      if (l.sources && l.sources.length) article.appendChild(el('p', 'cr-source', 'Fontes de apoio: ' + l.sources.join(', ') + '.'));
      view.appendChild(article);
      var nav = el('div', 'cr-actions');
      nav.appendChild(button(l.position < l.total ? 'Marcar como lida e seguir' : 'Marcar como lida', 'cr-btn cr-btn--primary', function (ev) {
        ev.currentTarget.disabled = true;
        api('apiLearnCourseMarkLesson', { courseId: courseId, position: l.position }).then(function (r) {
          if (!r || !r.success) { ev.currentTarget.disabled = false; fail(r); return; }
          if (l.position < l.total) showLesson(courseId, l.position + 1);
          else showCourse(courseId);
        });
      }));
      view.appendChild(nav);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Prova: uma questão por tela
  // ---------------------------------------------------------------------------------------------------------------
  function startExam(courseId) {
    screen('Prova', function () { showCourse(courseId); });
    api('apiLearnCourseExamStart', { courseId: courseId }).then(function (res) {
      if (!res || !res.success) { fail(res); return; }
      exam = { courseId: courseId, attemptId: res.attemptId, expiresAt: res.expiresAt, questions: res.questions, answers: res.questions.map(function () { return null; }), index: 0 };
      showQuestion();
    });
  }

  function showQuestion() {
    var q = exam.questions[exam.index];
    var total = exam.questions.length;
    screen('Questão ' + (exam.index + 1) + ' de ' + total, function () { showCourse(exam.courseId); });
    view.appendChild(el('p', 'cr-muted', 'Prazo: até ' + Core.dateTimeText(exam.expiresAt) + '.'));
    var form = el('form', 'cr-question');
    form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    var fs = el('fieldset');
    fs.appendChild(el('legend', 'cr-stem', q.stem));
    q.options.forEach(function (text, i) {
      var label = el('label', 'cr-option');
      var input = el('input');
      input.type = 'radio';
      input.name = 'resposta';
      input.value = String(i);
      input.checked = exam.answers[exam.index] === i;
      input.addEventListener('change', function () { exam.answers[exam.index] = i; });
      label.appendChild(input);
      label.appendChild(el('span', null, text));
      fs.appendChild(label);
    });
    form.appendChild(fs);
    view.appendChild(form);
    var nav = el('div', 'cr-actions');
    if (exam.index > 0) nav.appendChild(button('Anterior', 'cr-btn', function () { exam.index--; showQuestion(); }));
    if (exam.index < total - 1) nav.appendChild(button('Próxima', 'cr-btn cr-btn--primary', function () { exam.index++; showQuestion(); }));
    else nav.appendChild(button('Enviar respostas', 'cr-btn cr-btn--primary', submitExam));
    view.appendChild(nav);
    var blank = exam.answers.filter(function (a) { return a === null; }).length;
    if (exam.index === total - 1 && blank) view.appendChild(el('p', 'cr-muted', blank + (blank === 1 ? ' questão sem resposta conta como errada.' : ' questões sem resposta contam como erradas.')));
  }

  function submitExam(ev) {
    ev.currentTarget.disabled = true;
    api('apiLearnCourseExamSubmit', { attemptId: exam.attemptId, answers: exam.answers }).then(function (res) {
      if (!res || !res.success) { ev.currentTarget.disabled = false; fail(res); return; }
      showResult(res);
    });
  }

  function showResult(res) {
    var courseId = exam.courseId;
    screen('Resultado', function () { showCourse(courseId); });
    var box = el('div', 'cr-box ' + (res.passed ? 'cr-box--ok' : 'cr-box--warn'));
    box.appendChild(el('p', 'cr-score', res.scorePct + '% de acerto'));
    box.appendChild(el('p', null, res.passed ? 'Aprovação registrada.' : 'Ainda não foi desta vez. A nota mínima é ' + res.passPct + '%' + (res.criticalMissed ? ' e as questões de segurança precisam estar certas.' : '.')));
    box.appendChild(el('p', 'cr-muted', res.correctCount + ' de ' + res.total + ' questões certas.'));
    if (!res.passed) box.appendChild(el('p', null, Core.examText(res.exam)));
    view.appendChild(box);
    if (res.review && res.review.length) {
      view.appendChild(el('h2', 'cr-sub', 'Para estudar de novo'));
      var ul = el('ul', 'cr-list');
      res.review.forEach(function (r) {
        var li = el('li', 'cr-card cr-card--plain');
        li.appendChild(el('span', 'cr-card__title', r.stem));
        if (r.source) li.appendChild(el('span', 'cr-card__meta', 'Onde estudar: ' + r.source));
        ul.appendChild(li);
      });
      view.appendChild(ul);
    }
    var nav = el('div', 'cr-actions');
    if (res.passed) nav.appendChild(button('Meu certificado', 'cr-btn cr-btn--primary', function () { askCertificate(courseId); }));
    nav.appendChild(button('Voltar ao curso', 'cr-btn', function () { showCourse(courseId); }));
    view.appendChild(nav);
    exam = null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Certificado
  // ---------------------------------------------------------------------------------------------------------------
  function askCertificate(courseId) {
    screen('Meu certificado', function () { showCourse(courseId); });
    var box = el('div', 'cr-box');
    box.appendChild(el('p', null, 'O certificado traz o seu nome do perfil, o curso, a carga horária, a data e um código com QR para conferência.'));
    var label = el('label', 'cr-check');
    var input = el('input');
    input.type = 'checkbox';
    input.id = 'cr-consent';
    label.appendChild(input);
    label.appendChild(el('span', null, 'Permitir que qualquer pessoa com o código confira o certificado na página pública (sem isso, quem confere precisa digitar também o seu nome).'));
    box.appendChild(label);
    box.appendChild(button('Gerar certificado', 'cr-btn cr-btn--primary', function (ev) {
      ev.currentTarget.disabled = true;
      api('apiLearnCertificateIssue', { courseId: courseId, publicConsent: input.checked }).then(function (res) {
        if (!res || !res.success) { ev.currentTarget.disabled = false; fail(res); return; }
        showCertificate(res.certificate, function () { showCourse(courseId); });
      });
    }));
    view.appendChild(box);
  }

  function qrImage(url) {
    if (typeof root.qrcode !== 'function') return null;
    try {
      root.qrcode.stringToBytes = root.qrcode.stringToBytesFuncs['UTF-8'];
      var qr = root.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      var img = el('img', 'cr-qr');
      img.src = qr.createDataURL(4, 2);
      img.alt = 'QR para conferir o certificado';
      img.width = 120;
      img.height = 120;
      return img;
    } catch (e) { return null; }
  }

  function showCertificate(cert, back) {
    screen('Certificado', back);
    var url = Core.verifyUrl(root.location.origin, cert.code);
    var card = el('article', 'cr-cert');
    card.setAttribute('aria-label', 'Certificado');
    card.appendChild(el('p', 'cr-cert__org', 'LAIFT · Liga Acadêmica'));
    card.appendChild(el('h2', 'cr-cert__title', 'Certificado de conclusão'));
    card.appendChild(el('p', null, 'Certificamos que'));
    card.appendChild(el('p', 'cr-cert__name', cert.holderName));
    card.appendChild(el('p', null, 'concluiu o curso'));
    card.appendChild(el('p', 'cr-cert__course', cert.courseTitle));
    var facts = el('ul', 'cr-cert__facts');
    facts.appendChild(el('li', null, 'Carga horária: ' + Core.workloadText(cert.workloadMinutes)));
    facts.appendChild(el('li', null, 'Concluído em ' + Core.dateText(cert.issuedAt)));
    if (cert.validUntil) facts.appendChild(el('li', null, 'Válido até ' + Core.dateText(cert.validUntil)));
    facts.appendChild(el('li', null, 'Versão do curso: ' + cert.courseVersion));
    card.appendChild(facts);
    var foot = el('div', 'cr-cert__foot');
    var qr = qrImage(url);
    if (qr) foot.appendChild(qr);
    var codeBox = el('div');
    codeBox.appendChild(el('p', 'cr-cert__code', cert.code));
    codeBox.appendChild(el('p', 'cr-muted', 'Confira em ' + url.replace(/^https?:\/\//, '')));
    foot.appendChild(codeBox);
    card.appendChild(foot);
    if (cert.status !== 'valido') card.appendChild(el('p', 'cr-cert__status', 'Situação: ' + Core.certStatusText(cert.status)));
    view.appendChild(card);
    var nav = el('div', 'cr-actions no-print');
    nav.appendChild(button('Imprimir ou salvar em PDF', 'cr-btn cr-btn--primary', function () { root.print(); }));
    view.appendChild(nav);
  }

  showList();
})(window);
