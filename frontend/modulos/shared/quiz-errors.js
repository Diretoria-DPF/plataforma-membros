/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * quiz-errors.js — erros do Quiz guardados no aparelho (A1), prontos para a revisão espaçada (A3).
 *
 * Nada vai ao servidor: tudo fica em UMA chave do localStorage (`laiftQuizErrors`), com dono (hash local do
 * e-mail) para não mostrar os erros de outra conta no mesmo navegador. Cada erro é um item
 * `{ module, id, topic, wrong, streak, last, due }`:
 *   - errar cria ou atualiza o item (streak = 0, due = amanhã);
 *   - acertar um item existente soma à sequência e adia a revisão (1, 3, 7 dias); a 3ª sequência quita o item;
 *   - acertar algo que nunca foi errado não cria nada.
 *
 * API pura (recebe e devolve objetos novos):
 *   emptyStore(owner) · parse(raw, owner) · record(store, {module,id,topic,correct,now})
 *   pending(store, module?) · due(store, now, module?) · count(store, module?) · ids(store, module?)
 * API com armazenamento (nunca lança, mesmo com localStorage bloqueado):
 *   createStore(storage, ownerFn) -> { record, pending, due, count, ids, clear }
 *
 * Reuso na A3: `due(store, Date.now())` devolve o que já venceu; `createStore(...).ids('farmacologia')` basta
 * para montar a sessão. Atlas e Clínica podem usar outro `module` na mesma chave.
 * Script clássico (global LaiftQuizErrors) e, em Node, module.exports.
 */
(function (global) {
  'use strict';

  var KEY = 'laiftQuizErrors';
  var VERSION = 1;
  var MAX_ITEMS = 500;
  var MASTERED_STREAK = 3;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var INTERVAL_DAYS = [1, 3, 7];

  function emptyStore(owner) { return { v: VERSION, owner: owner || '', items: {} }; }

  function toMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && isFinite(value)) return value;
    var parsed = Date.parse(value);
    return isNaN(parsed) ? Date.now() : parsed;
  }

  function keyOf(module, id) { return String(module) + ':' + String(id); }

  function validItem(item) {
    return !!item && typeof item === 'object' && typeof item.module === 'string' && item.module
      && typeof item.id === 'number' && isFinite(item.id);
  }

  function cleanItem(item) {
    return {
      module: item.module,
      id: item.id,
      topic: typeof item.topic === 'string' ? item.topic.slice(0, 120) : '',
      wrong: typeof item.wrong === 'number' && item.wrong > 0 ? Math.floor(item.wrong) : 1,
      streak: typeof item.streak === 'number' && item.streak > 0 ? Math.floor(item.streak) : 0,
      last: typeof item.last === 'string' ? item.last : new Date(0).toISOString(),
      due: typeof item.due === 'string' ? item.due : new Date(0).toISOString(),
    };
  }

  /** Aceita texto JSON ou objeto; devolve sempre um store válido (lixo vira vazio). */
  function parse(raw, owner) {
    var data = raw;
    if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    var out = emptyStore(owner);
    if (!data || typeof data !== 'object') return out;
    if (typeof data.owner === 'string') out.owner = data.owner;
    var items = data.items && typeof data.items === 'object' && !Array.isArray(data.items) ? data.items : {};
    Object.keys(items).forEach(function (k) {
      if (validItem(items[k])) out.items[keyOf(items[k].module, items[k].id)] = cleanItem(items[k]);
    });
    return out;
  }

  function capItems(items) {
    var keys = Object.keys(items);
    if (keys.length <= MAX_ITEMS) return items;
    keys.sort(function (a, b) { return Date.parse(items[b].last) - Date.parse(items[a].last); });
    var kept = {};
    keys.slice(0, MAX_ITEMS).forEach(function (k) { kept[k] = items[k]; });
    return kept;
  }

  /** @param {{module:string,id:number,topic?:string,correct:boolean,now?:number|string|Date}} result */
  function record(store, result) {
    var base = store && store.items ? store : emptyStore();
    var items = Object.assign({}, base.items);
    var now = toMs(result.now === undefined ? Date.now() : result.now);
    var key = keyOf(result.module, result.id);
    var prev = items[key];
    if (result.correct) {
      if (!prev) return Object.assign({}, base, { items: items });
      var streak = prev.streak + 1;
      if (streak >= MASTERED_STREAK) { delete items[key]; return Object.assign({}, base, { items: items }); }
      var days = INTERVAL_DAYS[Math.min(streak, INTERVAL_DAYS.length - 1)];
      items[key] = Object.assign({}, prev, { streak: streak, last: new Date(now).toISOString(), due: new Date(now + days * DAY_MS).toISOString() });
    } else {
      items[key] = {
        module: result.module, id: result.id,
        topic: (result.topic || (prev && prev.topic) || '').slice(0, 120),
        wrong: prev ? prev.wrong + 1 : 1, streak: 0,
        last: new Date(now).toISOString(), due: new Date(now + INTERVAL_DAYS[0] * DAY_MS).toISOString(),
      };
    }
    return Object.assign({}, base, { items: capItems(items) });
  }

  function list(store, module) {
    var items = (store && store.items) || {};
    return Object.keys(items).map(function (k) { return items[k]; })
      .filter(function (it) { return !module || it.module === module; });
  }

  /** Todos os erros ainda não quitados, o mais recente primeiro. */
  function pending(store, module) {
    return list(store, module).sort(function (a, b) { return Date.parse(b.last) - Date.parse(a.last) || b.id - a.id; });
  }

  /** Só os que já venceram em `now` (o mais atrasado primeiro). */
  function due(store, now, module) {
    var limit = toMs(now);
    return list(store, module).filter(function (it) { return Date.parse(it.due) <= limit; })
      .sort(function (a, b) { return Date.parse(a.due) - Date.parse(b.due); });
  }

  function count(store, module) { return list(store, module).length; }
  function ids(store, module) { return pending(store, module).map(function (it) { return it.id; }); }

  function createStore(storage, ownerFn) {
    function owner() { try { return (ownerFn && ownerFn()) || ''; } catch (e) { return ''; } }

    function load() {
      var now = owner();
      var store;
      try { store = parse(storage ? storage.getItem(KEY) : null, now); } catch (e) { store = emptyStore(now); }
      if (store.owner && now && store.owner !== now) return emptyStore(now);
      return store;
    }

    function save(store) {
      try { if (storage) storage.setItem(KEY, JSON.stringify(Object.assign({}, store, { v: VERSION, owner: owner() || store.owner || '' }))); } catch (e) { /* sem espaço ou bloqueado: o quiz segue sem guardar */ }
    }

    return {
      record: function (result) { save(record(load(), result)); },
      pending: function (module) { return pending(load(), module); },
      due: function (now, module) { return due(load(), now === undefined ? Date.now() : now, module); },
      count: function (module) { return count(load(), module); },
      ids: function (module) { return ids(load(), module); },
      clear: function (module) {
        var store = load();
        var items = {};
        Object.keys(store.items).forEach(function (k) { if (module && store.items[k].module !== module) items[k] = store.items[k]; });
        save(Object.assign({}, store, { items: items }));
      },
    };
  }

  var api = {
    KEY: KEY, MAX_ITEMS: MAX_ITEMS, MASTERED_STREAK: MASTERED_STREAK, INTERVAL_DAYS: INTERVAL_DAYS,
    emptyStore: emptyStore, parse: parse, record: record, pending: pending, due: due, count: count, ids: ids,
    createStore: createStore,
  };
  global.LaiftQuizErrors = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
