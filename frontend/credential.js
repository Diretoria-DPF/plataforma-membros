/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Crachá virtual do membro: cartão com nome, papel, "membro desde", QR Code de
// presença ASSINADO pela Worker (apiLearnGetMyAttendanceQr). Com um evento aberto
// (ou inscrito) o QR é ROTATIVO (LAIFT:v3:<perfil>.<evento>.<janela>.<assinatura>,
// renovado a cada 30 s, com contagem regressiva); sem evento, o permanente
// (LAIFT:v2:<id>.<assinatura>) do crachá impresso. Ampliação do QR para o fiscal
// ler e "Salvar imagem" (PNG desenhado no próprio navegador; no modo rotativo o
// PNG sai SEM QR, porque ele expira em segundos). O QR é gerado localmente (vendor/qrcode-generator.js): nada vai a
// serviço de terceiros. Sem a credencial assinada, cai no formato provisório
// LAIFT:ID:<e-mail> e avisa; o fiscal então só preenche o e-mail para a presença
// manual, que o admin confirma — nunca registra direto. Nada é guardado no
// navegador. Qualquer elemento com [data-open-credential] abre o crachá.
// Expõe window.LaiftCredential; as funções puras são testadas em Node.
(function (root) {
  'use strict';

  var QR_LIB_SRC = 'vendor/qrcode-generator.js';
  var LOGO_SRC = 'modulos/cracha/laift-marca.png';
  var QR_V2_RE = /^LAIFT:v2:[0-9a-f-]{36}\.[A-Za-z0-9_-]{24}$/;
  var QR_V3_RE = /^LAIFT:v3:[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d{1,10}\.[A-Za-z0-9_-]{24}$/;
  var NOTE_ROTATING_SAVE = 'Salvar imagem guarda só o crachá, sem QR: o QR muda a cada 30 segundos e só vale na tela.';
  var NOTE_RENEW_FAIL = 'Sem conexão para renovar o QR. Tentando de novo...';
  var RETRY_MS = 5000;
  var MAX_EVENT_CHOICES = 5;
  var NOTE_OK = 'Apresente na portaria para registrar presença em eventos.';
  var NOTE_LEGACY = 'Credencial provisória: não foi possível obter a credencial assinada agora. Na portaria, a presença será confirmada pelo seu e-mail. Tente abrir de novo mais tarde.';
  var NOTE_LOADING = 'Gerando sua credencial...';
  var NOTE_ERROR = 'Não foi possível gerar o QR Code agora. Confira sua conexão, feche e abra o crachá de novo.';
  var ROLE_LABELS = { admin: 'Administrador', member: 'Membro', visitor: 'Visitante' };
  var FILE_NAME_MAX = 40;

  var requestId = 0;
  var qrLibPromise = null;
  var wired = false;
  var opener = null;
  var current = null; // { kind, name, role, since, qrDataUrl } da credencial aberta
  var pendingSince = ''; // "membro desde" que chegou antes do QR
  var tickTimer = null; // relógio da contagem regressiva do QR rotativo
  var rotation = null; // { eventId, title, offset, refreshAt, inFlight } do QR rotativo em exibição

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------
  function roleLabel(role) {
    return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? ROLE_LABELS[role] : ROLE_LABELS.visitor;
  }

  function initialsOf(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    var letters = words.slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
    return letters || 'L';
  }

  /** "03/2026" (mês/ano em UTC); vazio se a data não existe. */
  function formatMemberSince(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    var month = String(d.getUTCMonth() + 1);
    return (month.length < 2 ? '0' + month : month) + '/' + d.getUTCFullYear();
  }

  function fileNameFor(name) {
    var slug = String(name || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, FILE_NAME_MAX).replace(/-+$/, '');
    return 'cracha-laift-' + (slug || 'membro') + '.png';
  }

  /** Eventos para os quais o QR rotativo faz sentido: em andamento, ou publicados em que a pessoa está inscrita. */
  function pickEvents(res) {
    if (!res || !res.success || !Array.isArray(res.events)) return [];
    var list = res.events.filter(function (e) {
      return e && typeof e.id === 'string' && (e.status === 'in_progress' || (e.isRegistered === true && e.status === 'published'));
    });
    list.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
      return String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
    });
    return list.slice(0, MAX_EVENT_CHOICES);
  }

  /** Segundos inteiros até refreshAt (hora do servidor), dado o desvio relógio-do-servidor menos relógio-do-aparelho. */
  function secondsLeft(refreshAt, offset, nowMs) {
    return Math.max(0, Math.ceil((refreshAt - (nowMs + offset)) / 1000));
  }

  /** Só a credencial assinada vale como v2 (permanente) ou v3 (rotativo); sem ela, o formato provisório pelo e-mail (ou null). */
  function qrPayloadOf(res, identity) {
    if (res && res.success && typeof res.qrPayload === 'string') {
      if (QR_V3_RE.test(res.qrPayload)) return { payload: res.qrPayload, kind: 'v3' };
      if (QR_V2_RE.test(res.qrPayload)) return { payload: res.qrPayload, kind: 'v2' };
    }
    // TRA-10: o provisório NÃO leva o e-mail no QR (a imagem pode ser salva e compartilhada). Leva um identificador
    // opaco, sem relação com a conta; o fiscal lê o formato antigo (LAIFT:ID:<e-mail>) e este, e em nenhum registra.
    if (identity) return { payload: 'LAIFT:ID:' + opaqueId(), kind: 'legacy' };
    return null;
  }

  /** Identificador aleatório de 12 caracteres hexadecimais (nada da conta). */
  function opaqueId() {
    var bytes = new Uint8Array(6);
    var cryptoApi = root.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // ---------------------------------------------------------------------------
  // DOM (o modal já existe no index.html; aqui só se preenche e se liga)
  // ---------------------------------------------------------------------------
  function byId(doc, id) { return doc.getElementById(id); }

  function loadQrLib(doc) {
    if (root.qrcode) return Promise.resolve(root.qrcode);
    if (!qrLibPromise) {
      qrLibPromise = new Promise(function (resolve, reject) {
        var s = doc.createElement('script');
        s.src = QR_LIB_SRC;
        s.onload = function () { resolve(root.qrcode); };
        s.onerror = function () { qrLibPromise = null; reject(new Error('qr')); };
        doc.head.appendChild(s);
      });
    }
    return qrLibPromise;
  }

  function setZoom(doc, on) {
    var box = byId(doc, 'learn-credential-box');
    var btn = byId(doc, 'learn-credential-zoom');
    if (box) box.classList.toggle('credential-zoom', !!on);
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Reduzir QR' : 'Ampliar QR';
    }
  }

  function setAvatar(doc, name, avatarUrl) {
    var holder = byId(doc, 'learn-credential-avatar');
    if (!holder) return;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    if (typeof avatarUrl === 'string' && /^https:\/\//.test(avatarUrl)) {
      var img = doc.createElement('img');
      img.alt = '';
      img.src = avatarUrl;
      img.width = 64;
      img.height = 64;
      img.addEventListener('error', function () { holder.textContent = initialsOf(name); });
      holder.appendChild(img);
    } else {
      holder.textContent = initialsOf(name);
    }
  }

  function stopRotation(doc) {
    if (tickTimer) root.clearTimeout(tickTimer);
    tickTimer = null;
    rotation = null;
    var pick = doc && doc.getElementById('learn-credential-event');
    if (pick && pick.parentNode) pick.parentNode.removeChild(pick);
  }

  function close(doc) {
    requestId += 1; // respostas atrasadas deixam de valer
    stopRotation(doc);
    var modal = byId(doc, 'modal-learn-credential');
    if (modal) modal.classList.add('hidden');
    setZoom(doc, false);
    current = null;
    if (opener && doc.contains(opener) && opener.focus) opener.focus({ preventScroll: true });
    opener = null;
  }

  function trapTab(doc, evt) {
    var box = byId(doc, 'learn-credential-box');
    if (!box) return;
    var items = Array.prototype.filter.call(box.querySelectorAll('button'), function (b) { return !b.disabled; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (evt.shiftKey && doc.activeElement === first) { evt.preventDefault(); last.focus(); }
    else if (!evt.shiftKey && doc.activeElement === last) { evt.preventDefault(); first.focus(); }
  }

  // ---------------------------------------------------------------------------
  // Salvar imagem (PNG). Só texto e imagens do mesmo domínio: o desenho nunca
  // fica "contaminado" e não carrega dado de contato.
  // ---------------------------------------------------------------------------
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new root.Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('img')); };
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fitText(ctx, text, maxWidth, startPx, minPx, weight) {
    var px = startPx;
    ctx.font = weight + ' ' + px + 'px system-ui, sans-serif';
    while (px > minPx && ctx.measureText(text).width > maxWidth) {
      px -= 2;
      ctx.font = weight + ' ' + px + 'px system-ui, sans-serif';
    }
  }

  /** Desenha o cartão no canvas: só texto, o logo do mesmo domínio e o QR (nada de e-mail nem foto). */
  function drawCard(ctx, W, H, card, imgs) {
    var gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, '#08342d');
    gradient.addColorStop(1, '#0f6f62');
    ctx.fillStyle = gradient;
    roundRect(ctx, 0, 0, W, H, 48);
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    if (imgs[0]) ctx.drawImage(imgs[0], 48, 48, 96, 96);
    ctx.textAlign = 'left';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText('LAIFT', 164, 84);
    ctx.font = '400 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Farmacologia e Toxicologia', 164, 122);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(card.role.toUpperCase(), W - 48, 96);

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(W / 2, 330, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '700 96px system-ui, sans-serif';
    ctx.fillText(initialsOf(card.name), W / 2, 336);

    fitText(ctx, card.name, W - 120, 52, 28, '700');
    ctx.fillText(card.name, W / 2, 520);
    if (card.since) {
      ctx.font = '400 26px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('Membro desde ' + card.since, W / 2, 574);
    }

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 110, 630, 500, 500, 32);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '400 24px system-ui, sans-serif';
    if (imgs[1]) {
      ctx.drawImage(imgs[1], 140, 660, 440, 440);
      ctx.fillText('Apresente este QR na portaria do evento', W / 2, 1165);
    } else {
      // QR rotativo: não vai para a imagem (expira em segundos e copiá-lo não serviria).
      ctx.fillStyle = '#08342d';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.fillText('QR Code só na tela', W / 2, 800);
      ctx.font = '400 24px system-ui, sans-serif';
      ctx.fillText('Ele muda a cada 30 segundos.', W / 2, 850);
      ctx.fillText('Abra o crachá na plataforma', W / 2, 890);
      ctx.fillText('para mostrá-lo na portaria.', W / 2, 925);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('Crachá virtual LAIFT', W / 2, 1165);
    }
  }

  function saveImage(doc) {
    var card = current;
    if (!card || (card.kind !== 'v2' && card.kind !== 'v3')) return;
    if (card.kind === 'v2' && !card.qrDataUrl) return;
    var W = 720;
    var H = 1200;
    var canvas = doc.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    Promise.all([loadImage(LOGO_SRC).catch(function () { return null; }), card.kind === 'v3' ? Promise.resolve(null) : loadImage(card.qrDataUrl)]).then(function (imgs) {
      drawCard(ctx, W, H, card, imgs);

      canvas.toBlob(function (blob) {
        if (!blob) return;
        var url = root.URL.createObjectURL(blob);
        var a = doc.createElement('a');
        a.href = url;
        a.download = fileNameFor(card.name);
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 4000);
      }, 'image/png');
    }).catch(function () { /* sem imagem: o QR continua na tela */ });
  }

  // ---------------------------------------------------------------------------
  // Abertura
  // ---------------------------------------------------------------------------
  function wire(doc) {
    if (wired) return;
    wired = true;
    var modal = byId(doc, 'modal-learn-credential');
    byId(doc, 'learn-credential-close').addEventListener('click', function () { close(doc); });
    byId(doc, 'learn-credential-zoom').addEventListener('click', function () {
      setZoom(doc, !byId(doc, 'learn-credential-box').classList.contains('credential-zoom'));
    });
    byId(doc, 'learn-credential-save').addEventListener('click', function () { saveImage(doc); });
    modal.addEventListener('click', function (evt) { if (evt.target === modal) close(doc); });
    modal.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') { evt.stopPropagation(); close(doc); }
      else if (evt.key === 'Tab') trapTab(doc, evt);
    });
  }

  function showQrError(doc) {
    var note = byId(doc, 'learn-credential-note');
    note.textContent = NOTE_ERROR;
    note.classList.add('credential-note--error');
    byId(doc, 'learn-credential-qr').classList.add('hidden');
    byId(doc, 'learn-credential-zoom').disabled = true;
    byId(doc, 'learn-credential-save').disabled = true;
  }

  function open(app, doc) {
    var identity = app && app.getIdentity ? app.getIdentity() : null;
    if (!identity) return;
    wire(doc);
    var id = ++requestId;
    opener = doc.activeElement;
    current = null;
    pendingSince = '';
    stopRotation(doc);

    var name = identity.fullName || '';
    var role = roleLabel(identity.role);
    var qr = byId(doc, 'learn-credential-qr');
    qr.removeAttribute('src');
    qr.removeAttribute('data-qr-kind');
    qr.classList.remove('hidden');
    byId(doc, 'learn-credential-note').classList.remove('credential-note--error');
    byId(doc, 'learn-credential-zoom').disabled = false;
    byId(doc, 'learn-credential-name').textContent = name;
    byId(doc, 'learn-credential-email').textContent = identity.email || '';
    byId(doc, 'learn-credential-role').textContent = role;
    byId(doc, 'learn-credential-since').textContent = '';
    byId(doc, 'learn-credential-note').textContent = NOTE_LOADING;
    byId(doc, 'learn-credential-save').disabled = true;
    setAvatar(doc, name, null);
    setZoom(doc, false);
    byId(doc, 'modal-learn-credential').classList.remove('hidden');
    byId(doc, 'learn-credential-close').focus({ preventScroll: true });

    // Foto e "membro desde" são enfeite: se o perfil falhar, o crachá segue sem eles.
    app.callApi('apiGetMyProfile', (app.getState() && app.getState().sessionToken) || '').then(function (res) {
      if (id !== requestId || !res || !res.success || !res.profile) return;
      var since = formatMemberSince(res.profile.memberSince);
      byId(doc, 'learn-credential-since').textContent = since ? 'Membro desde ' + since : '';
      setAvatar(doc, name, res.profile.avatarUrl);
      if (current) current.since = since;
      else pendingSince = since;
    }, function () {});

    var token = (app.getState() && app.getState().sessionToken) || '';
    var eventsPromise = app.callApi('apiListEvents', token).then(pickEvents, function () { return []; });
    Promise.all([eventsPromise, loadQrLib(doc)]).then(function (results) {
      if (id !== requestId) return null;
      var events = results[0];
      var qrcode = results[1];
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      if (events.length) {
        startRotating(app, doc, id, identity, name, role, events, qrcode);
        return null;
      }
      return app.callLearningApi('apiLearnGetMyAttendanceQr').then(function (res) {
        if (id !== requestId) return;
        var chosen = qrPayloadOf(res, identity);
        if (!chosen) throw new Error('sem-email');
        var dataUrl = drawQr(qrcode, chosen.payload, qr);
        qr.setAttribute('data-qr-kind', chosen.kind);
        byId(doc, 'learn-credential-note').textContent = chosen.kind === 'v2' ? NOTE_OK : NOTE_LEGACY;
        current = { kind: chosen.kind, name: name, role: role, since: pendingSince, qrDataUrl: dataUrl };
        pendingSince = '';
        byId(doc, 'learn-credential-save').disabled = chosen.kind !== 'v2';
      });
    }).catch(function () {
      if (id !== requestId) return;
      // O erro fica no próprio modal: ele abre do Perfil, do Início, da Guia e do
      // onboarding, e um status no painel Aprender ficaria invisível.
      showQrError(doc);
    });
  }

  function drawQr(qrcode, payload, img) {
    var code = qrcode(0, 'M');
    code.addData(payload);
    code.make();
    var dataUrl = code.createDataURL(8, 4);
    img.src = dataUrl;
    return dataUrl;
  }

  // ---------------------------------------------------------------------------
  // QR rotativo: pede o QR do evento, mostra a contagem regressiva (hora do
  // servidor) e renova sozinho quando a janela acaba.
  // ---------------------------------------------------------------------------
  function startRotating(app, doc, id, identity, name, role, events, qrcode) {
    var qr = byId(doc, 'learn-credential-qr');
    var note = byId(doc, 'learn-credential-note');
    var state = { eventId: events[0].id, title: events[0].title || 'Evento', offset: 0, refreshAt: 0, inFlight: false, failed: false };
    rotation = state;
    if (events.length > 1) addEventPicker(doc, events, function (ev) {
      state.eventId = ev.id;
      state.title = ev.title || 'Evento';
      state.refreshAt = 0;
      fetchQr();
    });

    function paintNote() {
      var left = secondsLeft(state.refreshAt, state.offset, Date.now());
      note.textContent = state.failed
        ? NOTE_RENEW_FAIL
        : state.title + ': mostre este QR na portaria. Ele muda em ' + left + ' s. ' + NOTE_ROTATING_SAVE;
    }

    function schedule() {
      if (tickTimer) root.clearTimeout(tickTimer);
      tickTimer = root.setTimeout(function () {
        if (id !== requestId || rotation !== state) return;
        if (secondsLeft(state.refreshAt, state.offset, Date.now()) <= 0) fetchQr();
        else { paintNote(); schedule(); }
      }, 1000);
    }

    function fetchQr() {
      if (state.inFlight) return;
      state.inFlight = true;
      var wanted = state.eventId;
      app.callLearningApi('apiLearnGetMyAttendanceQr', { eventId: wanted }).then(function (res) {
        state.inFlight = false;
        if (id !== requestId || rotation !== state) return;
        if (wanted !== state.eventId) { fetchQr(); return; }
        var chosen = qrPayloadOf(res, null);
        if (!chosen || chosen.kind !== 'v3' || typeof res.refreshAt !== 'number') throw new Error('rotativo');
        drawQr(qrcode, chosen.payload, qr);
        qr.classList.remove('hidden');
        qr.setAttribute('data-qr-kind', 'v3');
        state.offset = typeof res.serverTime === 'number' ? res.serverTime - Date.now() : 0;
        state.refreshAt = res.refreshAt;
        state.failed = false;
        current = { kind: 'v3', name: name, role: role, since: current ? current.since : pendingSince, qrDataUrl: '' };
        pendingSince = '';
        byId(doc, 'learn-credential-save').disabled = false;
        paintNote();
        schedule();
      }).catch(function () {
        state.inFlight = false;
        if (id !== requestId || rotation !== state) return;
        state.failed = true;
        state.offset = 0;
        state.refreshAt = Date.now() + RETRY_MS;
        paintNote();
        schedule();
      });
    }

    fetchQr();
  }

  function addEventPicker(doc, events, onChange) {
    var note = byId(doc, 'learn-credential-note');
    var select = doc.createElement('select');
    select.id = 'learn-credential-event';
    select.className = 'credential-event';
    select.setAttribute('aria-label', 'Evento da credencial');
    events.forEach(function (ev) {
      var opt = doc.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.title || 'Evento';
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      var found = events.filter(function (e) { return e.id === select.value; })[0];
      if (found) onChange(found);
    });
    note.parentNode.insertBefore(select, note);
  }

  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('click', function (evt) {
      var trigger = evt.target && evt.target.closest ? evt.target.closest('[data-open-credential]') : null;
      if (trigger && root.App) open(root.App, root.document);
    });
  }

  var api = {
    roleLabel: roleLabel,
    initialsOf: initialsOf,
    formatMemberSince: formatMemberSince,
    fileNameFor: fileNameFor,
    qrPayloadOf: qrPayloadOf,
    pickEvents: pickEvents,
    secondsLeft: secondsLeft,
    open: function (app) { return open(app || root.App, root.document); },
    close: function () { return close(root.document); },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftCredential = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
