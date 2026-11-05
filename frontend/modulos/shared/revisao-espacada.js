/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * revisao-espacada.js — revisão espaçada de erros ENTRE módulos (A3), guardada só no aparelho.
 *
 * Camada fina sobre quiz-errors.js (A1): os erros do Quiz (Farmacologia e Toxicologia), do Atlas 3D e da Clínica
 * ficam na MESMA chave do localStorage, com dono (hash local do e-mail), e este arquivo responde às perguntas da
 * plataforma: "quantos erros vencem hoje?", "em qual módulo?", "qual o próximo passo?". Nada vai ao servidor e
 * nenhum texto de questão, resposta ou caso é guardado (só o id e o tópico curto).
 *
 * Nomes: o armazenamento usa o nome do módulo em `apiLearn*` (farmacologia, toxicologia, clinica, anatomia); a
 * interface usa o id do catálogo (farmaco, toxico, clinica, anatomia). `catalogId` e `storeName` convertem.
 *
 * API pura (recebe o store de quiz-errors e devolve objetos novos):
 *   summarize(store, now) -> { total, due, modules: [{ id, store, name, due, pending }], next }
 *   dueText(summary)      -> frase curta ("5 erros para rever hoje"), '' quando não há nada
 * API com armazenamento (nunca lança; sem localStorage, devolve vazio):
 *   read({ email, now, storage })       -> summarize do aparelho
 *   record({ module, id, topic, correct, email, now, storage })  -> registra erro/acerto de um item
 *   ownerTag(email)                     -> mesma etiqueta de quiz-offline-queue.js
 * Script clássico (global LaiftReview) e, em Node, module.exports.
 */
(function (global) {
  'use strict';

  /** Módulos que alimentam a revisão: nome no armazenamento -> id do catálogo e nome exibido. */
  var MODULES = [
    { store: 'farmacologia', id: 'farmaco', name: 'Farmacologia' },
    { store: 'toxicologia', id: 'toxico', name: 'Toxicologia' },
    { store: 'anatomia', id: 'anatomia', name: 'Atlas 3D' },
    { store: 'clinica', id: 'clinica', name: 'Clínica virtual' },
  ];

  function find(field, value) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i][field] === value) return MODULES[i];
    return null;
  }

  function catalogId(storeName) { var m = find('store', storeName); return m ? m.id : ''; }
  function storeName(id) { var m = find('id', id); return m ? m.store : ''; }

  /** Etiqueta local da conta (FNV-1a de 32 bits do e-mail); igual a LaiftQuizQueue.ownerTag. Não é enviada a ninguém. */
  function ownerTag(email) {
    var s = String(email || '').trim().toLowerCase();
    if (!s) return '';
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16);
  }

  function errorsLib() {
    if (global.LaiftQuizErrors) return global.LaiftQuizErrors;
    return typeof require === 'function' ? require('./quiz-errors.js') : null;
  }

  function toMs(value) {
    if (value instanceof Date) return value.getTime();
    return typeof value === 'number' && isFinite(value) ? value : Date.now();
  }

  /** Resumo do que vence em `now`: total, por módulo e o módulo do próximo passo (o de mais erros vencidos). */
  function summarize(store, now) {
    var lib = errorsLib();
    var limit = toMs(now);
    var modules = MODULES.map(function (m) {
      return {
        id: m.id, store: m.store, name: m.name,
        due: lib ? lib.due(store, limit, m.store).length : 0,
        pending: lib ? lib.count(store, m.store) : 0,
      };
    });
    var due = modules.reduce(function (sum, m) { return sum + m.due; }, 0);
    var next = null;
    modules.forEach(function (m) { if (m.due > 0 && (!next || m.due > next.due)) next = m; });
    return { total: modules.reduce(function (sum, m) { return sum + m.pending; }, 0), due: due, modules: modules, next: next ? next.id : '' };
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  /** "5 erros para rever hoje"; vazio quando nada venceu. */
  function dueText(summary) {
    var n = summary && summary.due > 0 ? summary.due : 0;
    return n ? n + ' ' + plural(n, 'erro', 'erros') + ' para rever hoje' : '';
  }

  /** "Farmacologia 3 · Atlas 3D 2": só os módulos com erro vencido. */
  function dueBreakdown(summary) {
    var parts = ((summary && summary.modules) || []).filter(function (m) { return m.due > 0; })
      .map(function (m) { return m.name + ' ' + m.due; });
    return parts.join(' · ');
  }

  function openStore(opts) {
    var lib = errorsLib();
    var storage = opts && opts.storage !== undefined ? opts.storage : (global.localStorage || null);
    if (!lib || !storage) return null;
    var tag = ownerTag(opts && opts.email);
    try { return lib.createStore(storage, function () { return tag; }); } catch (e) { return null; }
  }

  /** Resumo do aparelho para a conta `email`. Sem conta, sem armazenamento ou com erro, devolve o resumo vazio. */
  function read(opts) {
    var lib = errorsLib();
    var now = toMs(opts && opts.now);
    var storage = opts && opts.storage !== undefined ? opts.storage : (global.localStorage || null);
    var tag = ownerTag(opts && opts.email);
    if (!lib || !storage || !tag) return summarize(null, now); // sem conta identificada, nada é mostrado (aparelho compartilhado)
    try {
      var raw = storage.getItem(lib.KEY);
      var store = lib.parse(raw, tag);
      if (store.owner && tag && store.owner !== tag) store = lib.emptyStore(tag);
      return summarize(store, now);
    } catch (e) { return summarize(null, now); }
  }

  /** E-mail da conta quando o código roda dentro de um módulo (iframe) da plataforma. */
  function identityEmail() {
    try { var id = global.LaiftIdentity && global.LaiftIdentity.get(); return (id && id.email) || ''; } catch (e) { return ''; }
  }

  /** Registra um erro ou acerto de `module` (nome do armazenamento) para o item `id`. Silencioso se algo falhar. */
  function record(opts) {
    if (!opts || !storeName(catalogId(opts.module)) || opts.id === undefined || opts.id === null || opts.id === '') return false;
    var store = openStore({ email: opts.email !== undefined ? opts.email : identityEmail(), storage: opts.storage });
    if (!store) return false;
    try {
      store.record({ module: opts.module, id: opts.id, topic: opts.topic || '', correct: !!opts.correct, now: toMs(opts.now) });
      return true;
    } catch (e) { return false; }
  }

  /** Ids vencidos de um módulo (nome do armazenamento), para montar a sessão de revisão dentro do módulo. */
  function dueIds(module, opts) {
    var store = openStore({ email: opts && opts.email !== undefined ? opts.email : identityEmail(), storage: opts && opts.storage });
    if (!store) return [];
    try { return store.due(toMs(opts && opts.now), module).map(function (it) { return it.id; }); } catch (e) { return []; }
  }

  var api = {
    MODULES: MODULES, catalogId: catalogId, storeName: storeName, ownerTag: ownerTag,
    summarize: summarize, dueText: dueText, dueBreakdown: dueBreakdown, read: read, record: record, dueIds: dueIds,
  };
  global.LaiftReview = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
