/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * fiscal-gate.js — fila offline e cartão de resultado do portão (A2, TRA-09).
 *
 * 1) Fila offline: sem rede, a leitura do QR não se perde. Fica guardada (IndexedDB; se indisponível,
 *    em memória enquanto a aba durar) e é reenviada quando a rede volta. Idempotência por token: a chave
 *    do item é "<evento>|<QR lido>", então ler o mesmo QR duas vezes guarda UMA vez; no reenvio o servidor
 *    também é idempotente por (pessoa, evento) e responde "já estava presente".
 *    O instante da leitura (scannedAt) segue junto: o QR rotativo vale ~90 s e o servidor aceita a hora
 *    da leitura se tiver até 12 h (por isso a fila descarta itens com mais de 12 h).
 *    Privacidade: guarda só evento, QR lido (identificador do perfil + assinatura), hora e uma etiqueta
 *    do operador (para o item de um operador não ser enviado por outro no mesmo aparelho).
 *    Falha que não é de conexão (QR expirado, outro evento...) descarta o item: repetir não adiantaria.
 * 2) Cartão de resultado: verde (presença registrada), amarelo (já estava presente / aviso) ou vermelho
 *    (erro), com avatar (ou iniciais), nome e papel, fixo sobre o leitor. DOM só por createElement/textContent.
 *
 * Script clássico. Expõe window.LaiftGate (e module.exports nos testes).
 */
(function (global) {
  'use strict';

  var MAX_ITEMS = 200;
  var MAX_AGE_MS = 12 * 60 * 60 * 1000;
  var DB_NAME = 'laift-gate-queue';
  var STORE = 'scans';
  var QR_MAX = 200;
  var TRANSIENT_RE = /falha de comunica|demorou demais|sess[aã]o indispon/i;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var QR_RE = /^LAIFT:v[23]:[0-9a-f-]{36}[A-Za-z0-9_.-]{20,}$/;
  var ROLE_LABELS = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };
  var RESULT_CLEAR_MS = 8000;

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function keyOf(eventId, qrPayload) { return eventId + '|' + qrPayload; }

  /** Resposta de falha de conexão (vale reenviar depois)? */
  function isTransient(res) {
    return !res || (res.success !== true && (res.networkUnavailable === true || TRANSIENT_RE.test(String(res.message || ''))));
  }

  /** Valida um item lido do armazenamento (pode ter sido corrompido). */
  function sanitizeItem(item, now) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.eventId !== 'string' || !UUID_RE.test(item.eventId)) return null;
    if (typeof item.qrPayload !== 'string' || item.qrPayload.length > QR_MAX || !QR_RE.test(item.qrPayload)) return null;
    if (!isInt(item.scannedAt) || now - item.scannedAt > MAX_AGE_MS || item.scannedAt - now > 5 * 60 * 1000) return null;
    return {
      key: keyOf(item.eventId, item.qrPayload),
      eventId: item.eventId,
      qrPayload: item.qrPayload,
      scannedAt: item.scannedAt,
      owner: typeof item.owner === 'string' ? item.owner.slice(0, 40) : '',
    };
  }

  // ---- Armazenamento --------------------------------------------------------
  function createMemoryBackend() {
    var map = {};
    return {
      kind: 'memory',
      getAll: function () { return Promise.resolve(Object.keys(map).map(function (k) { return map[k]; })); },
      put: function (item) { map[item.key] = item; return Promise.resolve(); },
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
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
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

  /** IndexedDB se existir; com qualquer falha, memória (degradação segura). */
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
   * @param {object} opts.backend   { getAll, put, remove } (promessas)
   * @param {Function} opts.send    ({eventId, qrPayload, scannedAt}) => Promise<resposta da Worker>
   * @param {Function} [opts.owner] () => string
   * @param {Function} [opts.now]   () => ms
   * @param {Function} [opts.onResult] (item, resposta) para cada item resolvido no reenvio
   */
  function createQueue(opts) {
    var backend = opts.backend;
    var now = opts.now || function () { return Date.now(); };
    var owner = opts.owner || function () { return ''; };
    var flushing = null;

    function load() {
      return backend.getAll().then(function (raw) {
        var t = now();
        var valid = [];
        var drops = [];
        (raw || []).forEach(function (item) {
          var clean = sanitizeItem(item, t);
          if (clean) valid.push(clean);
          else if (item && typeof item.key === 'string') drops.push(item.key);
        });
        valid.sort(function (a, b) { return a.scannedAt - b.scannedAt; });
        while (valid.length > MAX_ITEMS) drops.push(valid.shift().key);
        return Promise.all(drops.map(function (k) { return backend.remove(k).catch(function () {}); })).then(function () { return valid; });
      });
    }

    /** Guarda uma leitura sem rede. Ler o mesmo QR no mesmo evento de novo não duplica (mesma chave). */
    function enqueue(eventId, qrPayload, scannedAt) {
      var item = sanitizeItem({ eventId: eventId, qrPayload: qrPayload, scannedAt: scannedAt, owner: owner() }, now());
      if (!item) return Promise.resolve(false);
      return backend.getAll().then(function (all) {
        var exists = (all || []).some(function (x) { return x && x.key === item.key; });
        return exists ? true : backend.put(item).then(function () { return true; });
      }).catch(function () { return false; });
    }

    function count() {
      return load().then(function (items) {
        var mine = owner();
        return items.filter(function (i) { return i.owner === mine; }).length;
      }, function () { return 0; });
    }

    /** Reenvia em ordem. Para na primeira falha de conexão (o resto continua na fila). */
    function flush() {
      if (flushing) return flushing;
      flushing = load().then(function (items) {
        var mine = owner();
        var todo = items.filter(function (i) { return i.owner === mine; });
        var sent = 0;
        var dropped = 0;
        function next(index) {
          if (index >= todo.length) return Promise.resolve();
          var item = todo[index];
          return Promise.resolve(opts.send({ eventId: item.eventId, qrPayload: item.qrPayload, scannedAt: item.scannedAt })).then(function (res) {
            if (isTransient(res)) return undefined; // rede ainda fora: mantém o resto
            if (res && res.success === true) sent += 1; else dropped += 1;
            return backend.remove(item.key).then(function () {
              if (typeof opts.onResult === 'function') { try { opts.onResult(item, res); } catch (e) { /* tela falhou: a fila segue */ } }
              return next(index + 1);
            });
          });
        }
        return next(0).then(function () { return { sent: sent, dropped: dropped, pending: todo.length - sent - dropped }; });
      }).then(function (r) { flushing = null; return r; }, function () { flushing = null; return { sent: 0, dropped: 0, pending: 0 }; });
      return flushing;
    }

    return { enqueue: enqueue, count: count, flush: flush, load: load };
  }

  // ---- Cartão de resultado --------------------------------------------------
  function initialsOf(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase() || '?';
  }

  /** Dados puros do cartão: { tone: 'ok'|'warn'|'error', title, name, role, initials, avatarUrl }. */
  function resultView(res, queuedOffline) {
    if (queuedOffline) {
      return { tone: 'warn', title: 'Sem rede: leitura guardada', name: '', role: '', initials: '', avatarUrl: '' };
    }
    if (!res || res.success !== true) {
      return { tone: 'error', title: (res && res.message) || 'Não foi possível registrar a presença.', name: '', role: '', initials: '', avatarUrl: '' };
    }
    var p = res.participant || {};
    var url = typeof p.avatarUrl === 'string' && /^https:\/\//.test(p.avatarUrl) ? p.avatarUrl : '';
    return {
      tone: p.alreadyCheckedIn ? 'warn' : 'ok',
      title: p.alreadyCheckedIn ? 'Já estava presente' : (p.walkIn ? 'Presença registrada (entrada na porta)' : 'Presença registrada'),
      name: p.fullName || '',
      role: Object.prototype.hasOwnProperty.call(ROLE_LABELS, p.role) ? ROLE_LABELS[p.role] : '',
      initials: initialsOf(p.fullName),
      avatarUrl: url,
    };
  }

  var clearTimer = null;

  /** Mostra o cartão dentro de `host` (criado na primeira vez, antes do leitor). */
  function showResult(doc, anchor, view) {
    var host = doc.getElementById('gateResult');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'gateResult';
      host.className = 'gate-result hidden';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      anchor.parentNode.insertBefore(host, anchor);
    }
    while (host.firstChild) host.removeChild(host.firstChild);
    host.className = 'gate-result gate-result--' + view.tone;

    var avatar = doc.createElement('span');
    avatar.className = 'gate-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    if (view.avatarUrl) {
      var img = doc.createElement('img');
      img.alt = '';
      img.width = 64;
      img.height = 64;
      img.src = view.avatarUrl;
      img.addEventListener('error', function () { avatar.textContent = view.initials; });
      avatar.appendChild(img);
    } else if (view.initials) {
      avatar.textContent = view.initials;
    } else {
      avatar.classList.add('hidden');
    }
    var text = doc.createElement('span');
    text.className = 'gate-text';
    if (view.name) {
      var strong = doc.createElement('strong');
      strong.className = 'gate-name';
      strong.textContent = view.name;
      text.appendChild(strong);
    }
    var title = doc.createElement('span');
    title.className = 'gate-title';
    title.textContent = view.title + (view.role ? ' · ' + view.role : '');
    text.appendChild(title);
    host.appendChild(avatar);
    host.appendChild(text);

    if (clearTimer) global.clearTimeout(clearTimer);
    clearTimer = global.setTimeout(function () { host.classList.add('hidden'); }, RESULT_CLEAR_MS);
  }

  var api = {
    createQueue: createQueue,
    createMemoryBackend: createMemoryBackend,
    createIdbBackend: createIdbBackend,
    createDefaultBackend: createDefaultBackend,
    isTransient: isTransient,
    resultView: resultView,
    showResult: showResult,
    keyOf: keyOf,
    MAX_AGE_MS: MAX_AGE_MS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LaiftGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
