/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * missao-semana.js — missão da semana e conquistas pessoais (A6), só no aparelho e só do próprio membro.
 *
 * Sem ranking, sem comparação entre pessoas e nada vai ao servidor: tudo fica em UMA chave do localStorage
 * (`laiftMissao`), com dono (hash local do e-mail) para não mostrar dados de outra conta no mesmo navegador.
 *
 *  - Missão: a cada semana (segunda a domingo, fuso de São Paulo) há uma tarefa por módulo ativo
 *    (`MISSION_MODULES`), com alvo de atividades. A missão termina sem culpa: semana não cumprida só sai da vista.
 *  - Conquistas: "Missão cumprida" (1, 3 e 5 semanas) e "Dominou <tema>" (volume mínimo + taxa de acerto).
 *    A regra de domínio (`MASTERY_MIN`, `MASTERY_RATE`) é provisória até a diretoria definir a oficial.
 *
 * API pura (recebe e devolve objetos novos):
 *   emptyStore(owner) · parse(raw, owner) · weekKey(now) · missionFor(weekKey)
 *   record(store, {module, topic, correct, now}) · status(store, now) · achievements(store) · paraHojeItem(store, now)
 * API com armazenamento (nunca lança, mesmo com localStorage bloqueado):
 *   createStore(storage, ownerFn) -> { record, status, achievements, paraHojeItem }
 *
 * Quem registra atividade chama `record` (hoje o quiz-engine; Atlas e Clínica entram em MISSION_MODULES quando
 * ligarem o registro). Quem monta o "Para hoje" chama `paraHojeItem`, que devolve um item pronto ou null.
 * Script clássico (global LaiftMissao) e, em Node, module.exports.
 */
(function (global) {
  'use strict';

  var KEY = 'laiftMissao';
  var VERSION = 1;
  var TIME_ZONE = 'America/Sao_Paulo';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var MAX_WEEKS = 12;
  var MAX_TOPICS = 100;
  var MAX_ACHIEVEMENTS = 200;
  var MASTERY_MIN = 10;
  var MASTERY_RATE = 0.8;
  var TASK_TARGET = 10;
  var MISSION_WEEKS = [1, 3, 5];
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /** Módulos que já registram atividade; a missão tem uma tarefa por módulo daqui. */
  var MISSION_MODULES = ['farmacologia', 'toxicologia'];
  var LABELS = { farmacologia: 'Farmacologia', toxicologia: 'Toxicologia', anatomia: 'Atlas 3D', clinica: 'Clínica virtual' };
  /** Id do módulo no catálogo (catalogo.js), usado por quem abre o módulo. */
  var PANEL_ID = { farmacologia: 'farmaco', toxicologia: 'toxico', anatomia: 'anatomia', clinica: 'clinica' };

  var dayFormat = typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    : null;

  function toMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && isFinite(value)) return value;
    var parsed = Date.parse(value);
    return isNaN(parsed) ? Date.now() : parsed;
  }

  /** "AAAA-MM-DD" no fuso de São Paulo. */
  function dayKey(ms) {
    if (dayFormat) return dayFormat.format(new Date(ms));
    return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function dayNumber(key) { return Math.round(Date.parse(key + 'T00:00:00Z') / DAY_MS); }

  /** Segunda-feira da semana de `now`, como "AAAA-MM-DD". */
  function weekKey(now) {
    var n = dayNumber(dayKey(toMs(now)));
    var weekday = new Date(n * DAY_MS).getUTCDay(); // 0 = domingo
    var back = (weekday + 6) % 7;
    return new Date((n - back) * DAY_MS).toISOString().slice(0, 10);
  }

  function emptyStore(owner) { return { v: VERSION, owner: owner || '', weeks: {}, topics: {}, earned: {}, weeksDone: [] }; }

  function isObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function whole(n) { return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  function parseWeeks(src, out) {
    if (!isObject(src)) return;
    Object.keys(src).forEach(function (wk) {
      if (!DATE_RE.test(wk) || !isObject(src[wk])) return;
      var counts = {};
      Object.keys(src[wk]).forEach(function (m) { if (LABELS[m] && whole(src[wk][m])) counts[m] = whole(src[wk][m]); });
      out[wk] = counts;
    });
  }

  function parseTopics(src, out) {
    if (!isObject(src)) return;
    Object.keys(src).forEach(function (k) {
      var t = src[k];
      if (!isObject(t) || !LABELS[t.module] || typeof t.topic !== 'string') return;
      out[k] = { module: t.module, topic: t.topic.slice(0, 120), n: whole(t.n), ok: whole(t.ok) };
    });
  }

  function parseEarned(src, out) {
    if (!isObject(src)) return;
    Object.keys(src).slice(0, MAX_ACHIEVEMENTS).forEach(function (id) {
      var e = src[id];
      if (isObject(e) && typeof e.label === 'string' && typeof e.at === 'string') {
        out[id] = { kind: e.kind === 'tema' ? 'tema' : 'missao', label: e.label.slice(0, 160), at: e.at };
      }
    });
  }

  /** Aceita texto JSON ou objeto; devolve sempre um store válido (lixo vira vazio). */
  function parse(raw, owner) {
    var data = raw;
    if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    var out = emptyStore(owner);
    if (!isObject(data)) return out;
    if (typeof data.owner === 'string') out.owner = data.owner;
    parseWeeks(data.weeks, out.weeks);
    parseTopics(data.topics, out.topics);
    parseEarned(data.earned, out.earned);
    if (Array.isArray(data.weeksDone)) out.weeksDone = data.weeksDone.filter(function (w) { return DATE_RE.test(w); }).slice(-MAX_WEEKS * 4);
    return out;
  }

  /** Tarefas da semana: uma por módulo ativo, na ordem rotacionada pela semana (igual em todo aparelho). */
  function missionFor(week) {
    var shift = Math.abs(Math.floor(dayNumber(week) / 7)) % MISSION_MODULES.length;
    return MISSION_MODULES.map(function (_, i) { return MISSION_MODULES[(i + shift) % MISSION_MODULES.length]; })
      .map(function (module) {
        return { module: module, target: TASK_TARGET, label: TASK_TARGET + ' atividades em ' + LABELS[module] };
      });
  }

  function keepFirst(map, limit, compare) {
    var keys = Object.keys(map);
    if (keys.length <= limit) return map;
    keys.sort(compare);
    var kept = {};
    keys.slice(0, limit).forEach(function (k) { kept[k] = map[k]; });
    return kept;
  }

  function weekProgress(weeks, week) {
    var counts = (weeks && weeks[week]) || {};
    var tasks = missionFor(week).map(function (t) {
      var done = Math.min(counts[t.module] || 0, t.target);
      return { module: t.module, label: t.label, target: t.target, done: done, complete: done >= t.target };
    });
    return { tasks: tasks, complete: tasks.length > 0 && tasks.every(function (t) { return t.complete; }) };
  }

  function addTopic(topics, earned, result, name, at) {
    var tk = result.module + ':' + name;
    var prev = topics[tk] || { module: result.module, topic: name, n: 0, ok: 0 };
    var t = { module: prev.module, topic: prev.topic, n: prev.n + 1, ok: prev.ok + (result.correct ? 1 : 0) };
    var nextTopics = Object.assign({}, topics);
    nextTopics[tk] = t;
    var nextEarned = earned;
    var id = 'tema:' + tk;
    if (!earned[id] && t.n >= MASTERY_MIN && t.ok / t.n >= MASTERY_RATE) {
      nextEarned = Object.assign({}, earned);
      nextEarned[id] = { kind: 'tema', label: 'Dominou ' + name + ' (' + LABELS[result.module] + ')', at: at };
    }
    return {
      topics: keepFirst(nextTopics, MAX_TOPICS, function (a, b) { return nextTopics[b].n - nextTopics[a].n; }),
      earned: nextEarned,
    };
  }

  function addWeekDone(weeksDone, earned, week, at) {
    if (weeksDone.indexOf(week) !== -1) return { weeksDone: weeksDone, earned: earned };
    var done = weeksDone.concat([week]);
    var next = Object.assign({}, earned);
    MISSION_WEEKS.forEach(function (n) {
      var id = 'missao-' + n;
      if (done.length >= n && !next[id]) {
        next[id] = { kind: 'missao', label: n === 1 ? 'Primeira missão da semana cumprida' : n + ' missões da semana cumpridas', at: at };
      }
    });
    return { weeksDone: done, earned: next };
  }

  /** @param {{module:string,topic?:string,correct:boolean,now?:number|string|Date}} result */
  function record(store, result) {
    var base = isObject(store) && isObject(store.weeks) ? store : emptyStore();
    if (!isObject(result) || !LABELS[result.module]) return base;
    var nowMs = toMs(result.now === undefined ? Date.now() : result.now);
    var at = new Date(nowMs).toISOString();
    var week = weekKey(nowMs);

    var weeks = Object.assign({}, base.weeks);
    var counts = Object.assign({}, weeks[week]);
    counts[result.module] = (counts[result.module] || 0) + 1;
    weeks[week] = counts;
    weeks = keepFirst(weeks, MAX_WEEKS, function (a, b) { return a < b ? 1 : -1; });

    var topics = base.topics;
    var earned = base.earned;
    var name = typeof result.topic === 'string' ? result.topic.trim().slice(0, 120) : '';
    if (name) {
      var withTopic = addTopic(topics, earned, result, name, at);
      topics = withTopic.topics;
      earned = withTopic.earned;
    }

    var weeksDone = base.weeksDone;
    if (weekProgress(weeks, week).complete) {
      var closed = addWeekDone(weeksDone, earned, week, at);
      weeksDone = closed.weeksDone;
      earned = closed.earned;
    }
    return Object.assign({}, base, { weeks: weeks, topics: topics, earned: earned, weeksDone: weeksDone });
  }

  function status(store, now) {
    var base = isObject(store) && isObject(store.weeks) ? store : emptyStore();
    var nowMs = toMs(now === undefined ? Date.now() : now);
    var week = weekKey(nowMs);
    var progress = weekProgress(base.weeks, week);
    return {
      weekKey: week,
      tasks: progress.tasks,
      complete: progress.complete,
      doneTotal: progress.tasks.reduce(function (s, t) { return s + t.done; }, 0),
      targetTotal: progress.tasks.reduce(function (s, t) { return s + t.target; }, 0),
      daysLeft: 7 - (dayNumber(dayKey(nowMs)) - dayNumber(week)),
      weeksDone: base.weeksDone.length,
    };
  }

  /** Conquistas do próprio membro, da mais recente para a mais antiga. */
  function achievements(store) {
    var earned = (store && store.earned) || {};
    return Object.keys(earned).map(function (id) {
      return { id: id, kind: earned[id].kind, label: earned[id].label, at: earned[id].at };
    }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
  }

  /** Item para o "Para hoje" (Aprender e Início): a próxima tarefa aberta da missão, ou null com a missão fechada. */
  function paraHojeItem(store, now) {
    var st = status(store, now);
    var next = st.tasks.filter(function (t) { return !t.complete; })[0];
    if (!next) return null;
    var left = next.target - next.done;
    return {
      kind: 'missao', icon: 'star', module: PANEL_ID[next.module] || next.module,
      title: 'Missão da semana',
      sub: left + (left === 1 ? ' atividade' : ' atividades') + ' em ' + LABELS[next.module] + ' · ' + st.doneTotal + ' de ' + st.targetTotal + ' no total',
    };
  }

  /** Etiqueta local da conta (FNV-1a de 32 bits do e-mail; a mesma do quiz). Não é enviada a ninguém. */
  function ownerTag(email) {
    var s = String(email || '').trim().toLowerCase();
    if (!s) return '';
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16);
  }

  function createStore(storage, ownerFn) {
    function owner() { try { return (ownerFn && ownerFn()) || ''; } catch (e) { return ''; } }

    function load() {
      var me = owner();
      var store;
      try { store = parse(storage ? storage.getItem(KEY) : null, me); } catch (e) { store = emptyStore(me); }
      if (store.owner && me && store.owner !== me) return emptyStore(me);
      if (!store.owner) store.owner = me;
      return store;
    }

    function save(store) {
      try { if (storage) storage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* sem armazenamento: segue sem */ }
    }

    return {
      record: function (result) { var next = record(load(), result); save(next); return next; },
      status: function (now) { return status(load(), now); },
      achievements: function () { return achievements(load()); },
      paraHojeItem: function (now) { return paraHojeItem(load(), now); },
    };
  }

  var api = {
    KEY: KEY, MAX_WEEKS: MAX_WEEKS, MAX_TOPICS: MAX_TOPICS, MASTERY_MIN: MASTERY_MIN, MASTERY_RATE: MASTERY_RATE,
    MISSION_MODULES: MISSION_MODULES, LABELS: LABELS,
    emptyStore: emptyStore, parse: parse, weekKey: weekKey, missionFor: missionFor, record: record,
    status: status, achievements: achievements, paraHojeItem: paraHojeItem, createStore: createStore, ownerTag: ownerTag,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LaiftMissao = api;
})(typeof self !== 'undefined' ? self : this);
