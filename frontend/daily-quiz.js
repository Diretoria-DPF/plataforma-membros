/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Quiz do dia (ENG-03; docs/engajamento.md): 5 questões do banco de Farmacologia
// (modulos/quiz/questions.js), escolhidas pela data de America/Sao_Paulo (mesma semente,
// mesmo conjunto para todos). Sem ranking: o resultado só aparece para quem respondeu.
// Ao terminar grava uma tentativa comum (apiLearnSubmitQuizAttempt, tópico "Quiz diário"),
// que alimenta streak e meta no servidor. Janela <dialog>; texto vira textContent.
// Expõe window.LaiftDailyQuiz; em Node (testes) exporta as partes puras.
(function (root) {
  'use strict';

  var COUNT = 5;
  var BANK_PATH = 'modulos/quiz/questions.js';
  var TOPIC = 'Quiz diário';
  var LETTERS = ['A', 'B', 'C', 'D', 'E'];

  function engagement() {
    return typeof module !== 'undefined' && module.exports ? require('./engagement.js') : root.LaiftEngagement;
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  /** Mensagem final: sempre incentivadora, qualquer que seja o placar. */
  function resultText(correct, total) {
    var line = 'Você acertou ' + correct + ' de ' + total + ' ' + plural(total, 'questão', 'questões') + '.';
    if (correct === total) return line + ' Perfeito!';
    if (correct * 2 >= total) return line + ' Muito bom, siga assim!';
    return line + ' Cada questão ensina algo. Volte amanhã para mais um!';
  }

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(doc, className, label, onClick) {
    var b = el(doc, 'button', className, label);
    b.setAttribute('type', 'button');
    b.addEventListener('click', onClick);
    return b;
  }

  /** Uma questão: enunciado + alternativas (botões grandes). `onPick(index)` recebe a escolha. */
  function buildQuestionView(doc, question, position, total, onPick) {
    var box = el(doc, 'div', 'dq-question');
    box.appendChild(el(doc, 'p', 'muted dq-count', 'Questão ' + (position + 1) + ' de ' + total));
    box.appendChild(el(doc, 'h3', 'dq-text', question.question));
    var list = el(doc, 'div', 'dq-options');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Alternativas');
    var buttons = question.options.map(function (text, index) {
      var b = button(doc, 'dq-option', (LETTERS[index] || String(index + 1)) + ') ' + text, function () { onPick(index); });
      list.appendChild(b);
      return b;
    });
    box.appendChild(list);
    return { node: box, buttons: buttons };
  }

  /** Marca certa/errada sem depender só de cor (texto e aria-label também mudam). */
  function markAnswer(question, view, picked) {
    view.buttons.forEach(function (b, index) {
      b.disabled = true;
      if (index === question.correct) { b.className += ' dq-correct'; b.setAttribute('aria-label', b.textContent + ' (resposta certa)'); }
      else if (index === picked) { b.className += ' dq-wrong'; b.setAttribute('aria-label', b.textContent + ' (sua resposta)'); }
    });
  }

  function feedbackText(question, picked) {
    var head = picked === question.correct ? 'Isso aí!' : 'Quase! A resposta certa é a ' + (LETTERS[question.correct] || question.correct + 1) + '.';
    return question.explanation ? head + ' ' + question.explanation : head;
  }

  /** Banco de questões: usa o que já está na página ou carrega o arquivo do módulo uma vez. */
  function loadBank(doc) {
    var ready = function () { return typeof allQuestions !== 'undefined' && Array.isArray(allQuestions) ? allQuestions : null; }; // eslint-disable-line no-undef
    var present = ready();
    if (present) return Promise.resolve(present);
    return new Promise(function (resolve) {
      var script = doc.createElement('script');
      script.src = BANK_PATH;
      script.onload = function () { resolve(ready() || []); };
      script.onerror = function () { resolve([]); };
      doc.head.appendChild(script);
    });
  }

  function open(opts) {
    var doc = opts.doc;
    if (doc.getElementById('daily-quiz')) return Promise.resolve();
    var Eng = engagement();
    var dialog = el(doc, 'dialog', 'dq-dialog');
    dialog.id = 'daily-quiz';
    dialog.setAttribute('aria-labelledby', 'daily-quiz-title');
    var head = el(doc, 'div', 'dq-head');
    var title = el(doc, 'h2', 'dq-title', 'Quiz do dia');
    title.id = 'daily-quiz-title';
    head.appendChild(title);
    head.appendChild(button(doc, 'dq-close', 'Fechar', function () { dialog.close(); }));
    var body = el(doc, 'div', 'dq-body');
    dialog.appendChild(head);
    dialog.appendChild(body);
    dialog.addEventListener('close', function () { dialog.remove(); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    doc.body.appendChild(dialog);
    dialog.showModal();
    body.appendChild(el(doc, 'p', 'muted', 'Preparando as questões de hoje…'));

    var startedAt = Date.now();
    return loadBank(doc).then(function (bank) {
      var questions = Eng.pickDaily(bank, opts.eng.today, COUNT);
      body.textContent = '';
      if (!questions.length) {
        body.appendChild(el(doc, 'p', '', 'Não deu para carregar as questões agora. Tente de novo em instantes.'));
        return;
      }
      run(doc, body, questions, opts, startedAt);
    });
  }

  function run(doc, body, questions, opts, startedAt) {
    var E = engagement();
    var index = 0;
    var correct = 0;
    function showQuestion() {
      body.textContent = '';
      var question = questions[index];
      var view = buildQuestionView(doc, question, index, questions.length, function (picked) {
        if (picked === question.correct) correct += 1;
        markAnswer(question, view, picked);
        var note = el(doc, 'p', 'dq-feedback', feedbackText(question, picked));
        note.setAttribute('role', 'status');
        body.appendChild(note);
        var last = index === questions.length - 1;
        var next = button(doc, 'eng-btn eng-btn-primary dq-next', last ? 'Ver resultado' : 'Próxima', function () {
          if (last) finish(); else { index += 1; showQuestion(); }
        });
        body.appendChild(next);
        next.focus();
      });
      body.appendChild(view.node);
      if (view.buttons[0]) view.buttons[0].focus();
    }
    function finish() {
      body.textContent = '';
      body.appendChild(el(doc, 'p', 'dq-result', resultText(correct, questions.length)));
      var status = el(doc, 'p', 'muted', opts.eng.dailyQuizDone ? 'Revisão concluída.' : 'Salvando seu resultado…');
      status.setAttribute('role', 'status');
      body.appendChild(status);
      var saved = opts.eng.dailyQuizDone ? Promise.resolve({ success: true }) : submit(opts, correct, questions.length, startedAt);
      saved.then(function (res) {
        status.textContent = res && res.success ? (opts.eng.dailyQuizDone ? 'Revisão concluída.' : 'Resultado salvo.') : 'Não deu para salvar agora, mas você fez o quiz!';
        return E.fetchEngagement(opts.app, opts.token);
      }).then(function (fresh) {
        if (fresh) body.appendChild(E.buildStrip(doc, fresh, E.assemble(fresh).goal));
        body.appendChild(button(doc, 'eng-btn eng-btn-primary', 'Concluir', function () { doc.getElementById('daily-quiz').close(); }));
        if (opts.onFinished) opts.onFinished();
      });
    }
    showQuestion();
  }

  function submit(opts, correct, total, startedAt) {
    var seconds = Math.max(0, Math.min(86400, Math.round((Date.now() - startedAt) / 1000)));
    return opts.app.callApi('apiLearnSubmitQuizAttempt', opts.token, {
      module: 'farmacologia', mode: 'estudo', correct: correct, total: total, durationSeconds: seconds, topics: [TOPIC],
    }).then(function (res) { return res; }, function () { return { success: false }; });
  }

  var api = { resultText: resultText, buildQuestionView: buildQuestionView, markAnswer: markAnswer, feedbackText: feedbackText, open: open, TOPIC: TOPIC, COUNT: COUNT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftDailyQuiz = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
