/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Retorno pessoal (ENG-01, ENG-02, ENG-03; docs/engajamento.md): "Continuar de onde parou",
// sequência de dias, meta diária e botão do quiz do dia. Tudo é só do próprio membro, sem
// ranking. Streak e meta vêm do servidor (apiLearnGetEngagement, dia de America/Sao_Paulo);
// localStorage é só complemento e nunca bloqueia nada. Texto da API vira textContent.
// Expõe window.LaiftEngagement; em Node (testes) exporta as funções puras e os construtores.
(function (root) {
  'use strict';

  var TIME_ZONE = 'America/Sao_Paulo';
  var GOALS = [5, 10, 20];
  var DEFAULT_GOAL = 10;
  var KEY_LAST = 'laift_last_module';
  var KEY_GOAL = 'laift_daily_goal';
  var KEY_SEEN = 'laift_eng_seen';
  var DAY_MS = 24 * 60 * 60 * 1000;

  /** Módulo da Worker (learning_attempts.module) -> id do cartão em learning.js. */
  var MODULE_IDS = { farmacologia: 'farmaco', toxicologia: 'toxico', clinica: 'clinica', laboratorio: 'lab', anatomia: 'anatomia' };
  var MODULE_LABELS = { farmaco: 'Farmacologia', toxico: 'Toxicologia', clinica: 'Clínica virtual', lab: 'Laboratório virtual', anatomia: 'Anatomia e farmacocinética' };
  var ACTIVITY_LABELS = { quiz_estudo: 'simulado', quiz_prova: 'prova', caso_clinico: 'caso clínico', formulacao: 'formulação', simulacao_pk: 'simulação' };

  var dayFormat = typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    : null;

  function plural(n, one, many) { return n === 1 ? one : many; }

  /** "AAAA-MM-DD" no fuso de São Paulo (mesma regra do servidor). */
  function dateKey(date) {
    if (dayFormat) return dayFormat.format(date);
    return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function dayNumber(key) { return Math.round(Date.parse(key + 'T00:00:00Z') / DAY_MS); }

  // ---------- Quiz do dia: mesma semente, mesmo conjunto para todos ----------

  /** Hash FNV-1a de 32 bits da chave do dia. */
  function seedFromKey(key) {
    var h = 2166136261;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Gerador pseudoaleatório determinístico (mulberry32). */
  function makeRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** `count` questões do banco, escolhidas pela data. Ordena por id antes, para não depender da ordem do arquivo. */
  function pickDaily(questions, key, count) {
    var pool = (questions || []).filter(function (q) { return q && q.question && Array.isArray(q.options) && typeof q.correct === 'number'; });
    pool.sort(function (a, b) { return Number(a.id) - Number(b.id); });
    var random = makeRandom(seedFromKey(key));
    var picked = [];
    var n = Math.min(count, pool.length);
    for (var i = 0; i < n; i++) {
      var j = i + Math.floor(random() * (pool.length - i));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      picked.push(pool[i]);
    }
    return picked;
  }

  // ---------- Textos (sempre positivos, sem culpa) ----------

  function streakText(streak) {
    var cur = streak && streak.current ? streak.current : 0;
    var best = streak && streak.best ? streak.best : 0;
    if (cur > 0 && streak.activeToday) return cur + ' ' + plural(cur, 'dia seguido', 'dias seguidos') + '. Ótimo ritmo!';
    if (cur > 0) return cur + ' ' + plural(cur, 'dia seguido', 'dias seguidos') + '. Uma questão hoje continua a sequência.';
    if (best > 1) return 'Que tal recomeçar hoje? Seu recorde é de ' + best + ' dias.';
    return 'Uma questão hoje começa a sua sequência.';
  }

  function goalText(goal) {
    var done = goal.todayQuestions;
    if (goal.reached) return 'Meta de hoje cumprida: ' + done + ' ' + plural(done, 'questão', 'questões') + '. Parabéns!';
    return 'Hoje: ' + done + ' de ' + goal.target + ' ' + plural(goal.target, 'questão', 'questões') + '.';
  }

  function whenText(iso, now) {
    var t = Date.parse(iso || '');
    if (isNaN(t)) return '';
    var diff = dayNumber(dateKey(now)) - dayNumber(dateKey(new Date(t)));
    if (diff <= 0) return 'hoje';
    if (diff === 1) return 'ontem';
    return 'há ' + diff + ' dias';
  }

  // ---------- Armazenamento local (complemento; nunca lança) ----------

  function store() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function readJson(key) {
    try { var s = store(); return s ? JSON.parse(s.getItem(key)) : null; } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { var s = store(); if (s) s.setItem(key, JSON.stringify(value)); } catch (e) { /* sem armazenamento: segue sem */ }
  }

  function rememberModule(moduleId, now) {
    if (MODULE_LABELS[moduleId]) writeJson(KEY_LAST, { id: moduleId, at: (now || new Date()).toISOString() });
  }

  /** Meta efetiva: a do servidor quando salva lá; senão a escolhida neste aparelho; senão 10. */
  function effectiveGoal(serverGoal, local) {
    if (serverGoal && serverGoal.persisted && GOALS.indexOf(serverGoal.target) !== -1) return serverGoal.target;
    return GOALS.indexOf(local) !== -1 ? local : (serverGoal && GOALS.indexOf(serverGoal.target) !== -1 ? serverGoal.target : DEFAULT_GOAL);
  }

  /** Último módulo tocado: servidor e aparelho competem pelo mais recente. */
  function resolveLast(serverLast, localLast) {
    var fromServer = serverLast && MODULE_IDS[serverLast.module]
      ? { id: MODULE_IDS[serverLast.module], activity: serverLast.activity, at: serverLast.at } : null;
    var fromLocal = localLast && MODULE_LABELS[localLast.id] ? { id: localLast.id, activity: null, at: localLast.at } : null;
    if (!fromServer) return fromLocal;
    if (!fromLocal) return fromServer;
    return Date.parse(fromLocal.at) > Date.parse(fromServer.at || '') ? fromLocal : fromServer;
  }

  // ---------- DOM ----------

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

  function continueBlock(doc, last, now, onOpen) {
    var box = el(doc, 'div', 'eng-continue');
    box.appendChild(el(doc, 'h3', 'eng-title', 'Continuar de onde parou'));
    var detail = [MODULE_LABELS[last.id], ACTIVITY_LABELS[last.activity], whenText(last.at, now)].filter(Boolean).join(' · ');
    box.appendChild(el(doc, 'p', 'muted eng-detail', detail));
    box.appendChild(button(doc, 'eng-btn eng-btn-primary', 'Continuar', function () { onOpen(last.id); }));
    return box;
  }

  /** Quem nunca fez quiz: sem último módulo, sem recorde de sequência e sem questão hoje (ENG-04). */
  function isFirstQuizCandidate(data) {
    var eng = data && data.eng;
    if (!eng || data.last) return false;
    return !(eng.streak && eng.streak.best > 0) && !(eng.goal && eng.goal.todayQuestions > 0);
  }

  function firstQuizBlock(doc, onFirstQuiz) {
    var box = el(doc, 'div', 'eng-continue eng-first');
    box.appendChild(el(doc, 'h3', 'eng-title', 'Comece por um quiz'));
    box.appendChild(el(doc, 'p', 'muted eng-detail', '5 questões de Farmacologia, com explicação a cada resposta. Leva poucos minutos.'));
    box.appendChild(button(doc, 'eng-btn eng-btn-primary', 'Fazer o primeiro quiz', onFirstQuiz));
    return box;
  }

  function goalPicker(doc, current, onPick) {
    var group = el(doc, 'div', 'eng-goal-picker');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Meta diária de questões');
    GOALS.forEach(function (value) {
      var b = button(doc, 'eng-chip', String(value), function () { onPick(value); });
      b.setAttribute('aria-pressed', String(value === current));
      b.setAttribute('aria-label', value + ' questões por dia');
      group.appendChild(b);
    });
    return group;
  }

  /** Blocos de sequência e meta; `pop` liga a microinteração (CSS a desliga com movimento reduzido). */
  function rhythmBlock(doc, eng, goalValue, opts) {
    var box = el(doc, 'div', 'eng-rhythm');
    var streak = el(doc, 'p', 'eng-streak' + (opts.popStreak ? ' eng-pop' : ''));
    var flame = el(doc, 'span', 'eng-flame', '🔥');
    flame.setAttribute('aria-hidden', 'true');
    streak.appendChild(flame);
    streak.appendChild(el(doc, 'span', 'eng-streak-text', streakText(eng.streak)));
    var goal = { target: goalValue, todayQuestions: eng.goal.todayQuestions, reached: eng.goal.todayQuestions >= goalValue };
    var goalLine = el(doc, 'p', 'eng-goal-text' + (goal.reached && opts.popGoal ? ' eng-pop' : ''), goalText(goal));
    var bar = el(doc, 'progress', 'eng-progress');
    bar.setAttribute('max', String(goal.target));
    bar.setAttribute('value', String(Math.min(goal.todayQuestions, goal.target)));
    bar.setAttribute('aria-label', 'Progresso da meta diária');
    [streak, goalLine, bar].forEach(function (n) { box.appendChild(n); });
    if (opts.onGoal) {
      var legend = el(doc, 'p', 'muted eng-detail', 'Minha meta por dia:');
      box.appendChild(legend);
      box.appendChild(goalPicker(doc, goal.target, opts.onGoal));
    }
    return box;
  }

  function dailyBlock(doc, eng, onDaily, isPrimary) {
    var box = el(doc, 'div', 'eng-daily');
    box.appendChild(el(doc, 'h3', 'eng-title', 'Quiz do dia'));
    box.appendChild(el(doc, 'p', 'muted eng-detail', eng.dailyQuizDone
      ? 'Feito hoje. Amanhã tem um novo para todo mundo.'
      : '5 questões, as mesmas para todos hoje. Leva poucos minutos.'));
    box.appendChild(button(doc, 'eng-btn' + (eng.dailyQuizDone || !isPrimary ? '' : ' eng-btn-primary'), eng.dailyQuizDone ? 'Rever o quiz de hoje' : 'Fazer o quiz do dia', onDaily));
    return box;
  }

  /** Detecta o que mudou desde a última vez que o membro viu o painel (para a microinteração). */
  function changesSince(eng, goalValue) {
    var seen = readJson(KEY_SEEN) || {};
    var reached = eng.goal.todayQuestions >= goalValue;
    var sameDay = seen.day === eng.today;
    var change = {
      popStreak: eng.streak.activeToday && (!sameDay || !seen.active),
      popGoal: reached && (!sameDay || !seen.reached),
    };
    writeJson(KEY_SEEN, { day: eng.today, active: !!eng.streak.activeToday, reached: reached });
    return change;
  }

  /**
   * Painel completo da Início: continuar + ritmo + quiz do dia. `data` = { eng, last, goal };
   * qualquer parte pode faltar (API fora do ar): o que não há simplesmente não aparece.
   */
  function buildSection(doc, data, handlers, now) {
    var section = el(doc, 'section', 'home-retorno eng-panel');
    section.setAttribute('aria-label', 'Seu ritmo');
    if (data.last) section.appendChild(continueBlock(doc, data.last, now, handlers.onOpenModule));
    // Quem nunca fez quiz vê um único botão primário: o primeiro quiz (o do dia fica secundário).
    var firstQuiz = !!handlers.onFirstQuiz && isFirstQuizCandidate(data);
    if (firstQuiz) section.appendChild(firstQuizBlock(doc, handlers.onFirstQuiz));
    if (data.eng) {
      var change = changesSince(data.eng, data.goal);
      section.appendChild(rhythmBlock(doc, data.eng, data.goal, { popStreak: change.popStreak, popGoal: change.popGoal, onGoal: handlers.onGoal }));
      if (handlers.onDaily) section.appendChild(dailyBlock(doc, data.eng, handlers.onDaily, !firstQuiz));
    }
    return section.children && section.children.length === 0 ? null : section;
  }

  /** Faixa curta (fim do quiz, hub Aprender): só sequência e meta, sem botões. */
  function buildStrip(doc, eng, goalValue) {
    var strip = el(doc, 'div', 'eng-strip');
    strip.appendChild(rhythmBlock(doc, eng, goalValue, { popStreak: false, popGoal: false }));
    return strip;
  }

  // ---------- Carga (servidor + complemento local) ----------

  function fetchEngagement(app, token) {
    return app.callApi('apiLearnGetEngagement', token).then(function (res) {
      return res && res.success && res.engagement ? res.engagement : null;
    }, function () { return null; });
  }

  function saveGoal(app, token, value) {
    writeJson(KEY_GOAL, value);
    return app.callApi('apiLearnSetDailyGoal', token, { goal: value }).then(function () { return value; }, function () { return value; });
  }

  function assemble(eng) {
    return {
      eng: eng,
      goal: effectiveGoal(eng && eng.goal, readJson(KEY_GOAL)),
      last: resolveLast(eng && eng.last, readJson(KEY_LAST)),
    };
  }

  /** Abre o módulo no hub Aprender (o app.js já é dono da navegação). */
  function openModule(app, id) {
    app.showPanel('panel-learn');
    if (root.LaiftLearning && root.LaiftLearning.openModule) root.LaiftLearning.openModule(id);
  }

  /** "Fazer o primeiro quiz" (ENG-04): vai ao Aprender e abre o simulado de Farmacologia na questão 1. */
  function openFirstQuiz(app) {
    app.showPanel('panel-learn');
    if (root.LaiftLearning && root.LaiftLearning.openFirstQuiz) root.LaiftLearning.openFirstQuiz();
  }

  /**
   * Monta o painel de retorno dentro de `host`. Nunca lança nem bloqueia a Início: sem dados, não desenha nada.
   * `isCurrent()` descarta respostas de uma entrada que já foi trocada.
   */
  function mountHome(app, doc, host, token, isCurrent) {
    var now = new Date();
    function paint(eng) {
      if (!isCurrent()) return;
      while (host.firstChild) host.removeChild(host.firstChild);
      var data = assemble(eng);
      var section = buildSection(doc, data, {
        onOpenModule: function (id) { openModule(app, id); },
        onFirstQuiz: function () { openFirstQuiz(app); },
        onGoal: function (value) {
          saveGoal(app, token, value).then(function () { return fetchEngagement(app, token); }).then(function (fresh) {
            paint(fresh || eng);
          });
        },
        onDaily: eng && root.LaiftDailyQuiz ? function () {
          root.LaiftDailyQuiz.open({ app: app, doc: doc, token: token, eng: eng, goal: data.goal, onFinished: function () { fetchEngagement(app, token).then(paint); } });
        } : null,
      }, now);
      if (section) host.appendChild(section);
    }
    return fetchEngagement(app, token).then(paint, function () { paint(null); });
  }

  /** Hub Aprender: faixa de sequência e meta (volta a ser pedida a cada retorno ao hub, ex.: ao fim de um simulado). */
  function refreshHub(app, doc) {
    var host = doc.getElementById('learn-engagement');
    if (!host || !app || !app.getState) return Promise.resolve();
    var token = app.getState().sessionToken || '';
    return fetchEngagement(app, token).then(function (eng) {
      while (host.firstChild) host.removeChild(host.firstChild);
      if (eng) host.appendChild(buildStrip(doc, eng, effectiveGoal(eng.goal, readJson(KEY_GOAL))));
    });
  }

  var api = {
    dateKey: dateKey, seedFromKey: seedFromKey, pickDaily: pickDaily,
    streakText: streakText, goalText: goalText, whenText: whenText,
    effectiveGoal: effectiveGoal, resolveLast: resolveLast, rememberModule: rememberModule,
    buildSection: buildSection, isFirstQuizCandidate: isFirstQuizCandidate, openFirstQuiz: openFirstQuiz, buildStrip: buildStrip,
    fetchEngagement: fetchEngagement, assemble: assemble, mountHome: mountHome, refreshHub: refreshHub,
    GOALS: GOALS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftEngagement = api;
    // "Continuar de onde parou" também funciona sem rede: guarda o último módulo aberto neste aparelho.
    if (root.document && root.document.addEventListener) {
      root.document.addEventListener('laift:modulechange', function (event) {
        var id = event && event.detail && event.detail.module;
        if (id) rememberModule(id, new Date());
      });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
