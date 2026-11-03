/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * quiz-offline-queue.js — fila offline das tentativas de simulado (MOB-02).
 *
 * Sem rede, o resultado do simulado não se perde: fica numa fila local (IndexedDB; se indisponível,
 * em memória, enquanto a aba durar) e é reenviado quando a rede volta (evento `online`) e ao abrir
 * o módulo. Cada tentativa tem uma `idempotencyKey` (UUID) e o Worker ignora a repetição da mesma
 * chave, então reenviar nunca duplica o desempenho.
 *
 * Privacidade: só guarda o que o registro já envia (módulo, modo, acertos, total, duração e
 * tópicos) + a chave + a data de enfileiramento + uma etiqueta curta de dono (hash local do
 * e-mail, nunca enviada) para que a tentativa de uma conta não seja enviada por outra no mesmo
 * navegador. Limites: no máximo MAX_ITEMS itens e MAX_AGE_MS de idade; item malformado é
 * descartado ao ler. Falha de servidor que não é de conexão (validação etc.) descarta o item:
 * repetir não adiantaria.
 *
 * Script clássico. create(opts) e createIdbBackend(indexedDB)/createMemoryBackend() são expostos
 * em window.LaiftQuizQueue para os testes.
 */
(function (global) {
  'use strict';

  var MAX_ITEMS = 20;
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  var DB_NAME = 'laift-quiz-queue';
  var STORE = 'attempts';
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var MODULES = ['farmacologia', 'toxicologia', 'anatomia'];
  var TRANSIENT_RE = /falha de comunica|demorou demais|sess[aã]o indispon/i;

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  /** Gera UUID v4 (crypto.randomUUID, getRandomValues ou, em último caso, Math.random). */
  function uuid() {
    var c = global.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Array(16);
    if (c && typeof c.getRandomValues === 'function') {
      var arr = new Uint8Array(16);
      c.getRandomValues(arr);
      for (var i = 0; i < 16; i++) b[i] = arr[i];
    } else {
      for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** Valida e copia só os campos permitidos do registro. Devolve null se inválido. */
  function sanitizePayload(p) {
    if (!p || typeof p !== 'object') return null;
    if (MODULES.indexOf(p.module) === -1) return null;
    if (p.mode !== 'estudo' && p.mode !== 'prova') return null;
    if (!isInt(p.total) || p.total < 1 || p.total > 500) return null;
    if (!isInt(p.correct) || p.correct < 0 || p.correct > p.total) return null;
    var out = { module: p.module, mode: p.mode, correct: p.correct, total: p.total };
    if (p.durationSeconds !== undefined && p.durationSeconds !== null) {
      if (!isInt(p.durationSeconds) || p.durationSeconds < 0 || p.durationSeconds > 86400) return null;
      out.durationSeconds = p.durationSeconds;
    }
    var topics = [];
    if (Array.isArray(p.topics)) {
      for (var i = 0; i < p.topics.length && topics.length < 20; i++) {
        if (typeof p.topics[i] === 'string' && p.topics[i].length > 0 && p.topics[i].length <= 80) topics.push(p.topics[i]);
      }
    }
    out.topics = topics;
    // Desempenho por tópico (ENG-06): item malformado é descartado, nunca derruba o registro inteiro.
    var stats = [];
    if (Array.isArray(p.topicStats)) {
      for (var j = 0; j < p.topicStats.length && stats.length < 20; j++) {
        var t = p.topicStats[j];
        if (t && typeof t.topic === 'string' && t.topic.length > 0 && t.topic.length <= 80
            && isInt(t.total) && t.total >= 1 && t.total <= p.total && isInt(t.correct) && t.correct >= 0 && t.correct <= t.total) {
          stats.push({ topic: t.topic, correct: t.correct, total: t.total });
        }
      }
    }
    if (stats.length) out.topicStats = stats;
    return out;
  }

  /** Valida um item lido do armazenamento (pode ter sido corrompido/adulterado). */
  function sanitizeItem(item, now, maxAgeMs) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.idempotencyKey !== 'string' || !UUID_RE.test(item.idempotencyKey)) return null;
    if (!isInt(item.queuedAt) || now - item.queuedAt > maxAgeMs || item.queuedAt - now > 5 * 60 * 1000) return null;
    var payload = sanitizePayload(item.payload);
    if (!payload) return null;
    return {
      idempotencyKey: item.idempotencyKey,
      queuedAt: item.queuedAt,
      owner: typeof item.owner === 'string' ? item.owner.slice(0, 16) : '',
      payload: payload,
    };
  }

  // ---- Armazenamento --------------------------------------------------------
  function createMemoryBackend() {
    var map = {};
    return {
      kind: 'memory',
      getAll: function () { return Promise.resolve(Object.keys(map).map(function (k) { return map[k]; })); },
      put: function (item) { map[item.idempotencyKey] = item; return Promise.resolve(); },
      remove: function (key) { delete map[key]; return Promise.resolve(); },
    };
  }

  function createIdbBackend(idb) {
    var dbPromise = null;
    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
        var req;
        try { req = idb.open(DB_NAME, 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('idb')); };
        req.onblocked = function () { reject(new Error('idb bloqueado')); };
      });
      dbPromise.catch(function () { dbPromise = null; });
      return dbPromise;
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, mode);
          var request = fn(tx.objectStore(STORE));
          tx.oncomplete = function () { resolve(request && request.result); };
          tx.onerror = function () { reject(tx.error || new Error('idb')); };
          tx.onabort = function () { reject(tx.error || new Error('idb abortado')); };
        });
      });
    }
    return {
      kind: 'idb',
      getAll: function () { return run('readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); },
      put: function (item) { return run('readwrite', function (s) { return s.put(item); }); },
      remove: function (key) { return run('readwrite', function (s) { return s.delete(key); }); },
    };
  }

  /** Backend do navegador: IndexedDB se existir; com qualquer falha, memória (degradação segura). */
  function createDefaultBackend(idb) {
    var memory = createMemoryBackend();
    if (!idb) return memory;
    var real = createIdbBackend(idb);
    var broken = false;
    function guard(method, args) {
      if (broken) return memory[method].apply(memory, args);
      return real[method].apply(real, args).catch(function () {
        broken = true;
        return memory[method].apply(memory, args);
      });
    }
    return {
      kind: 'idb',
      getAll: function () { return guard('getAll', []); },
      put: function (item) { return guard('put', [item]); },
      remove: function (key) { return guard('remove', [key]); },
    };
  }

  /**
   * @param {object} opts
   * @param {object} opts.backend     { getAll, put, remove } (promessas)
   * @param {Function} opts.send      (payload com idempotencyKey) => Promise<{success, message}>
   * @param {Function} [opts.owner]   () => string — etiqueta da conta atual ('' se desconhecida)
   * @param {Function} [opts.now]     () => ms
   * @param {Function} [opts.uuid]
   */
  function create(opts) {
    var backend = opts.backend;
    var now = opts.now || function () { return Date.now(); };
    var newKey = opts.uuid || uuid;
    var owner = opts.owner || function () { return ''; };
    var maxItems = opts.maxItems || MAX_ITEMS;
    var maxAgeMs = opts.maxAgeMs || MAX_AGE_MS;
    var flushing = null;

    function isTransient(res) {
      return !res || (res.success !== true && TRANSIENT_RE.test(String(res.message || '')));
    }

    /** Lê tudo, descarta o inválido/vencido e aplica o teto (os mais antigos saem primeiro). */
    function load() {
      return backend.getAll().then(function (raw) {
        var t = now();
        var valid = [];
        var drops = [];
        (raw || []).forEach(function (item) {
          var clean = sanitizeItem(item, t, maxAgeMs);
          if (clean) valid.push(clean);
          else if (item && item.idempotencyKey !== undefined) drops.push(item.idempotencyKey);
        });
        valid.sort(function (a, b) { return a.queuedAt - b.queuedAt; });
        while (valid.length > maxItems) drops.push(valid.shift().idempotencyKey);
        return Promise.all(drops.map(function (k) { return backend.remove(k).catch(function () {}); })).then(function () { return valid; });
      }).catch(function () { return []; });
    }

    /** Tenta enviar um item: 'sent' | 'rejected' (servidor recusou) | 'transient' (sem conexão). */
    function attempt(item) {
      var body = Object.assign({}, item.payload, { idempotencyKey: item.idempotencyKey });
      return Promise.resolve().then(function () { return opts.send(body); }).then(function (res) {
        if (res && res.success === true) return { status: 'sent', res: res };
        if (isTransient(res)) return { status: 'transient', res: res };
        return { status: 'rejected', res: res };
      }, function () { return { status: 'transient', res: null }; }).then(function (out) {
        if (out.status === 'transient') return out;
        return backend.remove(item.idempotencyKey).catch(function () {}).then(function () { return out; });
      });
    }

    /**
     * Registra uma tentativa: grava na fila ANTES de enviar (não se perde se a aba fechar no meio) e
     * remove ao confirmar. Devolve { status: 'sent'|'queued'|'rejected', res }.
     */
    function submit(payload) {
      var clean = sanitizePayload(payload);
      var item = clean && { idempotencyKey: newKey(), queuedAt: now(), owner: owner(), payload: clean };
      if (!item) {
        // Fora do que a fila aceita: envia direto como antes (o servidor valida e responde).
        return Promise.resolve().then(function () { return opts.send(payload); }).then(function (res) {
          return { status: res && res.success === true ? 'sent' : 'rejected', res: res };
        }, function () { return { status: 'rejected', res: null }; });
      }
      return backend.put(item).catch(function () {}).then(function () {
        return attempt(item);
      }).then(function (out) {
        return out.status === 'transient' ? { status: 'queued', res: out.res } : out;
      });
    }

    /** Reenvia, em ordem, os itens da conta atual. Uma só passada por vez. */
    function flush() {
      if (flushing) return flushing;
      var summary = { sent: 0, kept: 0, dropped: 0 };
      var me = owner();
      flushing = load().then(function (items) {
        var chain = Promise.resolve();
        var stop = false;
        items.forEach(function (item) {
          chain = chain.then(function () {
            if (stop) { summary.kept++; return null; }
            if (item.owner !== me || !me) { summary.kept++; return null; }
            return attempt(item).then(function (out) {
              if (out.status === 'sent') summary.sent++;
              else if (out.status === 'rejected') summary.dropped++;
              else { summary.kept++; stop = true; }
            });
          });
        });
        return chain;
      }).then(function () { flushing = null; return summary; }, function () { flushing = null; return summary; });
      return flushing;
    }

    return { submit: submit, flush: flush, size: function () { return load().then(function (l) { return l.length; }); } };
  }

  /** Etiqueta local da conta (FNV-1a de 32 bits do e-mail). Não é enviada a ninguém. */
  function ownerTag(email) {
    var s = String(email || '').trim().toLowerCase();
    if (!s) return '';
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16);
  }

  global.LaiftQuizQueue = {
    create: create,
    createIdbBackend: createIdbBackend,
    createMemoryBackend: createMemoryBackend,
    createDefaultBackend: createDefaultBackend,
    sanitizePayload: sanitizePayload,
    sanitizeItem: sanitizeItem,
    ownerTag: ownerTag,
    uuid: uuid,
    LIMITS: { MAX_ITEMS: MAX_ITEMS, MAX_AGE_MS: MAX_AGE_MS },
  };
})(typeof window !== 'undefined' ? window : globalThis);
