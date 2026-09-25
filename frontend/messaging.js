/**
 * frontend/messaging.js
 * Estado e UI da mensageria E2EE (Fase 3f de docs/PLANO_FASE3_MENSAGERIA.md,
 * simplificada em 2026-09-25: sem frase-secreta — feedback direto do dono
 * da plataforma de que a fricção de senha estava afastando os membros do
 * uso real). Módulo ES que usa frontend/msg-crypto.js para toda a
 * criptografia e um pequeno namespace compartilhado (`window.App`, exposto
 * por frontend/app.js) para as poucas coisas que precisa de lá:
 * `state.sessionToken`, `callApi`, os builders de DOM `h`/`text` (NUNCA
 * innerHTML — ver nota de segurança abaixo) e alguns utilitários
 * (`setStatus`, `clearEl`, `formatDate`, `openConfirm`, `showPanel`).
 * `app.js` continua um script clássico; só este arquivo e msg-crypto.js
 * são módulos ES (ver frontend/index.html).
 *
 * ===========================================================================
 * SEGURANÇA — auditar isto antes de qualquer alteração:
 * ===========================================================================
 * - A chave privada (`identity.privateKey`, um CryptoKey NÃO extraível) é
 *   gerada por msg-crypto.js e persistida SÓ neste navegador, via
 *   IndexedDB (structured clone suporta guardar CryptoKey diretamente,
 *   sem nunca exportar os bytes). NUNCA vai para localStorage/cookie,
 *   NUNCA aparece num payload de `callApi`, NUNCA em console.log.
 * - Trade-off aceito explicitamente (pedido do dono da plataforma, que
 *   considerou a frase-secreta complicada demais): a identidade de
 *   mensageria fica ligada a ESTE navegador/aparelho. Limpar os dados do
 *   navegador ou trocar de aparelho perde o acesso ao histórico anterior
 *   (mesmo trade-off que já existia com "esqueci a frase", só que agora
 *   sem nenhuma fricção no dia a dia).
 * - O que ESTE módulo grava em localStorage é só o fingerprint de chaves
 *   já vistas (TOFU, seção 3.7 do plano) — não é segredo, é só um número
 *   de conferência.
 * - Todo texto decifrado (corpo da mensagem, nome do remetente, etc.) é
 *   inserido no DOM só via `text()`/`h()` do bridge — nunca `innerHTML`.
 * - `resetMessagingState()` é chamada no logout e na expiração de sessão
 *   (ver frontend/app.js) e apaga o estado em memória — a chave em
 *   IndexedDB continua lá (pertence ao navegador, não à sessão de login).
 */

(function () {
  'use strict';

  var MsgCrypto = null;
  var msgCryptoReady = import('./msg-crypto.js').then(function (mod) { MsgCrypto = mod; });

  function App() {
    if (!window.App) throw new Error('window.App ainda não está pronto (bug de ordem de carregamento).');
    return window.App;
  }

  var TOFU_STORAGE_KEY = 'pm_msg_tofu_v1';
  var CONVERSATION_POLL_FAST_MS = 5000;
  var CONVERSATION_POLL_SLOW_MS = 45000;
  var CONVERSATION_POLL_ESCALATE_AFTER_MS = 2 * 60 * 1000;
  var GLOBAL_SYNC_INTERVAL_MS = 60000;
  // Preparação de escala (auditoria de 2026-09-25, item B1/B2): o Neon
  // Free suspende a compute após 5min sem consulta — mas polling nunca
  // para sozinho, então uma aba aberta e esquecida (visível, porém sem
  // ninguém usando) mantinha o banco acordado indefinidamente. Depois de
  // MESSAGING_IDLE_PAUSE_MS sem NENHUMA interação real (clique/tecla/
  // toque/scroll/movimento do mouse), os dois loops de polling abaixo
  // param de consultar o servidor — voltam sozinhos na próxima interação,
  // sem precisar recarregar a página.
  var MESSAGING_IDLE_PAUSE_MS = 10 * 60 * 1000;
  var lastUserActivityAt = Date.now();
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(function (evt) {
    document.addEventListener(evt, function () { lastUserActivityAt = Date.now(); }, { passive: true });
  });
  function isUserIdle() {
    return Date.now() - lastUserActivityAt > MESSAGING_IDLE_PAUSE_MS;
  }
  var IDB_NAME = 'laift-messaging';
  var IDB_STORE = 'identity-keys';

  // ===========================================================================
  // Estado em memória (tudo apagado por resetMessagingState, EXCETO a
  // chave em IndexedDB, que pertence ao navegador, não à sessão)
  // ===========================================================================
  /** { profileId, privateKey (CryptoKey não extraível), publicKeyBase64url, keyVersion } */
  var identity = null;
  var conversationKeyCache = {}; // "convId|myVer:peerVer" -> CryptoKey
  var peerKeysCache = {}; // peerProfileId -> { keys: [{keyVersion, algorithm, publicKey, active}], fetchedAt }
  var conversationsCache = []; // último resultado de apiListConversations
  var currentConversation = null; // { conversationId, peer: {id, fullName, username, avatarUrl} }
  var lastSeenMessageId = 0;
  var messagesSeen = {}; // dentro da conversa aberta: id -> true (dedupe)
  var clientMessageIdsSeen = {}; // clientMessageId -> true (dedupe de reenvio otimista + polling)

  var conversationPollTimer = null;
  var conversationPollIntervalMs = CONVERSATION_POLL_FAST_MS;
  var lastNewMessageAt = 0;
  var globalSyncTimer = null;
  var sendMuteUntilTs = 0;
  var sendMuteTimer = null;
  var pendingPeerAfterUnlock = null; // peer que a UI tentou abrir antes de a identidade estar pronta

  function resetMessagingState() {
    identity = null;
    conversationKeyCache = {};
    peerKeysCache = {};
    conversationsCache = [];
    currentConversation = null;
    lastSeenMessageId = 0;
    messagesSeen = {};
    clientMessageIdsSeen = {};
    stopConversationPolling();
    stopGlobalSync();
    sendMuteUntilTs = 0;
    if (sendMuteTimer) { clearTimeout(sendMuteTimer); sendMuteTimer = null; }
    pendingPeerAfterUnlock = null;
  }

  // ===========================================================================
  // IndexedDB — guarda o CryptoKey privado (não extraível) deste navegador,
  // uma entrada por profileId. structured clone suporta CryptoKey
  // diretamente: nunca exportamos os bytes para guardar isto.
  // ===========================================================================
  function openIdb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponível neste navegador.')); return; }
      var req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE, { keyPath: 'profileId' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Falha ao abrir IndexedDB.')); };
    });
  }

  function idbGet(profileId) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(profileId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('Falha ao ler chave local.')); };
      });
    });
  }

  function idbPut(record) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Falha ao gravar chave local.')); };
      });
    });
  }

  // ===========================================================================
  // TOFU — fingerprint de chaves já vistas (não é segredo, ver cabeçalho)
  // ===========================================================================
  function readTofuStore() {
    try {
      var raw = localStorage.getItem(TOFU_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function writeTofuStore(store) {
    try { localStorage.setItem(TOFU_STORAGE_KEY, JSON.stringify(store)); } catch (err) { /* indisponível — segue sem persistir */ }
  }

  /** Devolve {isFirstContact, keyChanged, fingerprint} e já grava a versão atual como "vista". */
  async function checkAndRecordTofu(peerProfileId, activeKeyVersion, activePublicKey) {
    var fingerprint = await MsgCrypto.computeFingerprint(activePublicKey);
    var store = readTofuStore();
    var prev = store[peerProfileId];
    var result;
    if (!prev) {
      result = { isFirstContact: true, keyChanged: false, fingerprint: fingerprint };
    } else if (prev.keyVersion !== activeKeyVersion || prev.fingerprint !== fingerprint) {
      result = { isFirstContact: false, keyChanged: true, fingerprint: fingerprint };
    } else {
      result = { isFirstContact: false, keyChanged: false, fingerprint: fingerprint };
    }
    store[peerProfileId] = { keyVersion: activeKeyVersion, fingerprint: fingerprint };
    writeTofuStore(store);
    return result;
  }

  // ===========================================================================
  // Preparar a identidade de mensageria: sem tela de senha nenhuma. Busca
  // a chave local (IndexedDB); se não existir, gera uma nova e publica.
  // Se já existir uma chave publicada no servidor sob outra versão (ex.:
  // usuário abriu em outro navegador antes), a local prevalece só se a
  // versão bater — senão, gera e publica uma nova (rotação), porque não há
  // como recuperar a privada de uma versão publicada de outro aparelho.
  // ===========================================================================
  async function ensureIdentityReady(myKeyRes) {
    var app = App();
    var profileId = myKeyRes.profileId;

    var local = null;
    try { local = await idbGet(profileId); } catch (err) { local = null; }

    if (local && myKeyRes.hasKey && local.keyVersion === myKeyRes.keyVersion && local.publicKeyBase64url === myKeyRes.publicKey) {
      identity = { profileId: profileId, privateKey: local.privateKey, publicKeyBase64url: local.publicKeyBase64url, keyVersion: local.keyVersion };
      return;
    }

    // Sem chave local válida para a versão ativa do servidor: gera uma
    // nova e publica (primeira vez = expectedCurrentVersion 0; rotação =
    // versão ativa atual, se houver).
    var keyPair = await MsgCrypto.generateIdentityKeyPair();
    var publishRes = await app.callApi('apiPublishMessagingKey', app.getState().sessionToken, {
      algorithm: MsgCrypto.MSG_CRYPTO_CONFIG.ALGORITHM,
      publicKey: keyPair.publicKeyBase64url,
      kdfAlgorithm: MsgCrypto.MSG_CRYPTO_CONFIG.KDF_ALGORITHM,
      expectedCurrentVersion: myKeyRes.hasKey ? myKeyRes.keyVersion : 0,
    });
    if (!publishRes.success) throw new Error(publishRes.message);

    await idbPut({ profileId: profileId, privateKey: keyPair.privateKey, publicKeyBase64url: keyPair.publicKeyBase64url, keyVersion: publishRes.keyVersion });
    identity = { profileId: profileId, privateKey: keyPair.privateKey, publicKeyBase64url: keyPair.publicKeyBase64url, keyVersion: publishRes.keyVersion };
  }

  function showPreparing(show, message) {
    var app = App();
    document.getElementById('messaging-preparing').classList.toggle('hidden', !show);
    document.getElementById('messaging-main-card').classList.toggle('hidden', show);
    if (show) {
      var el = document.getElementById('messaging-preparing');
      app.clearEl(el);
      el.appendChild(app.text('p', message || 'Preparando suas mensagens seguras...', { className: 'muted' }));
    }
  }

  // Promise da preparação de identidade em andamento (geração/publicação de
  // chave), se houver. Achado de produção (ref dcf9614d, 2026-09-25):
  // chamadas concorrentes a loadMessagingPanel() (dois cliques rápidos, dois
  // gatilhos de painel) cada uma via `identity` nulo e tentava gerar+publicar
  // sua PRÓPRIA chave nova — mesmo com a corrida corrigida no servidor
  // (pg_advisory_xact_lock em messagingKeyService.js), isso ainda gastava
  // cota do rate limit diário de publicação à toa. Reaproveitar a mesma
  // promise resolve na origem, sem depender só da trava do servidor.
  var identitySetupPromise = null;

  async function loadMessagingPanel() {
    await msgCryptoReady;
    var app = App();
    if (!MsgCrypto.isCryptoSupported()) {
      showPreparing(true, 'Seu navegador não é compatível com mensagens cifradas. Atualize o navegador para usar esta área.');
      return;
    }
    if (identity) {
      showPreparing(false);
      showConversationsView();
      loadConversations();
      startGlobalSync();
      resumePendingPeerIfAny();
      return;
    }

    showPreparing(true, 'Preparando suas mensagens seguras...');
    try {
      if (!identitySetupPromise) {
        identitySetupPromise = (async function () {
          var res = await app.callApi('apiGetMyMessagingKey', app.getState().sessionToken);
          if (!res.success) throw new Error(res.message);
          await ensureIdentityReady(res);
        })().finally(function () { identitySetupPromise = null; });
      }
      await identitySetupPromise;
      showPreparing(false);
      showConversationsView();
      loadConversations();
      startGlobalSync();
      resumePendingPeerIfAny();
    } catch (err) {
      showPreparing(true, (err && err.message) || 'Não foi possível preparar as mensagens seguras. Tente novamente.');
    }
  }

  // ===========================================================================
  // Conversas
  // ===========================================================================
  function showConversationsView() {
    document.getElementById('messaging-conversations-view').classList.remove('hidden');
    document.getElementById('messaging-thread-view').classList.add('hidden');
    stopConversationPolling();
    currentConversation = null;
  }

  function showThreadView() {
    document.getElementById('messaging-conversations-view').classList.add('hidden');
    document.getElementById('messaging-thread-view').classList.remove('hidden');
  }

  async function loadConversations() {
    var app = App();
    var res = await app.callApi('apiListConversations', app.getState().sessionToken);
    if (!res.success) { app.setStatus('messaging-status', res.message, 'error'); return; }
    app.setStatus('messaging-status', '', null);
    conversationsCache = res.conversations;
    app.renderList('messaging-conversations-list', res.conversations, renderConversationItem, 'Você ainda não tem nenhuma conversa. Abra o perfil de uma conexão e toque em "Enviar mensagem".');
  }

  function renderConversationItem(item) {
    var app = App();
    var avatar = item.peer.avatarUrl
      ? app.h('img', { className: 'chat-avatar', src: item.peer.avatarUrl, alt: item.peer.fullName })
      : app.h('span', { className: 'chat-avatar chat-avatar-placeholder' }, [(item.peer.fullName || '?').charAt(0).toUpperCase()]);
    var unreadBadge = item.unreadCount > 0 ? app.h('span', { className: 'badge', style: 'margin-left:8px;' }, [String(item.unreadCount) + ' nova' + (item.unreadCount > 1 ? 's' : '')]) : null;

    return app.h('article', {
      className: 'list-item chat-list-item', style: 'cursor:pointer;',
      onclick: function () { openConversationWithPeer(item.peer); },
    }, [
      avatar,
      app.h('div', { style: 'flex:1; min-width:0;' }, [
        app.h('p', { style: 'margin:0; display:flex; align-items:center;' }, [app.h('strong', {}, [item.peer.fullName]), unreadBadge]),
        app.text('p', item.peer.username ? '@' + item.peer.username : '', { className: 'muted', style: 'margin:0; font-size:13px;' }),
        app.text('p', item.lastMessageAt ? app.formatDate(item.lastMessageAt) : 'Nenhuma mensagem ainda', { className: 'muted', style: 'margin:0; font-size:12px;' }),
      ]),
    ]);
  }

  // ===========================================================================
  // Abrir conversa — ponto de entrada usado também pelo botão "Enviar
  // mensagem" do modal de perfil de membro (app.js chama
  // window.LaiftMessaging.openConversationWithPeer via App()). Abre e já
  // deixa pronto para digitar — sem nenhuma tela intermediária.
  // ===========================================================================
  async function openConversationWithPeer(peer) {
    await msgCryptoReady;
    var app = App();
    if (!MsgCrypto.isCryptoSupported()) { app.showPanel('panel-messages'); return; }
    if (!identity) {
      pendingPeerAfterUnlock = peer;
      app.showPanelSection('panel-messages');
      loadMessagingPanel();
      return;
    }

    app.showPanelSection('panel-messages');
    showPreparing(false);
    showThreadView();
    app.setStatus('messaging-thread-status', 'Abrindo conversa...', 'info');
    app.clearEl(document.getElementById('messaging-thread-list'));
    app.clearEl(document.getElementById('messaging-tofu-banner'));
    document.getElementById('messaging-thread-peer-name').textContent = peer.fullName || '';
    document.getElementById('messaging-thread-peer-sub').textContent = peer.username ? '@' + peer.username : '';
    var headerAvatar = document.getElementById('messaging-thread-peer-avatar');
    app.clearEl(headerAvatar);
    headerAvatar.appendChild(
      peer.avatarUrl
        ? app.h('img', { className: 'chat-avatar', src: peer.avatarUrl, alt: peer.fullName })
        : app.h('span', { className: 'chat-avatar chat-avatar-placeholder' }, [(peer.fullName || '?').charAt(0).toUpperCase()])
    );

    var openRes = await app.callApi('apiOpenConversation', app.getState().sessionToken, peer.id);
    if (!openRes.success) { app.setStatus('messaging-thread-status', openRes.message, 'error'); return; }

    var peerKeysRes = await app.callApi('apiGetPeerMessagingKeys', app.getState().sessionToken, peer.id);
    if (!peerKeysRes.success) { app.setStatus('messaging-thread-status', peerKeysRes.message, 'error'); return; }
    var activeKey = (peerKeysRes.keys || []).filter(function (k) { return k.active; })[0];
    peerKeysCache[peer.id] = { keys: peerKeysRes.keys, fetchedAt: Date.now() };

    currentConversation = { conversationId: openRes.conversationId, peer: peer };
    lastSeenMessageId = 0;
    messagesSeen = {};
    clientMessageIdsSeen = {};

    if (!activeKey) {
      app.setStatus('messaging-thread-status', 'Este contato ainda não abriu a área de mensagens.', 'info');
      document.getElementById('btn-messaging-send').disabled = true;
      return;
    }
    document.getElementById('btn-messaging-send').disabled = false;

    var tofu = await checkAndRecordTofu(peer.id, activeKey.keyVersion, activeKey.publicKey);
    await renderTofuBanner(tofu, peer, activeKey);

    app.setStatus('messaging-thread-status', '', null);
    await loadMessages(true);
    startConversationPolling();
    focusMessageInput();
  }

  function focusMessageInput() {
    var el = document.getElementById('messaging-send-text');
    if (el) el.focus();
  }

  async function renderTofuBanner(tofu, peer, activeKey) {
    var app = App();
    var banner = document.getElementById('messaging-tofu-banner');
    app.clearEl(banner);
    if (!tofu.isFirstContact && !tofu.keyChanged) return;

    var securityNumber = identity ? await MsgCrypto.computeSecurityNumber(identity.publicKeyBase64url, activeKey.publicKey) : tofu.fingerprint;
    var kind = tofu.keyChanged ? 'error' : 'info';
    var title = tofu.keyChanged ? 'A chave de segurança de ' + (peer.fullName || 'este contato') + ' mudou.' : 'Primeira conversa com ' + (peer.fullName || 'este contato') + '.';
    banner.appendChild(app.h('div', { className: 'status-msg', 'data-kind': kind, style: 'display:block;' }, [
      app.text('p', title, { style: 'margin:0 0 4px;' }),
      app.text('p', 'Número de segurança (confira fora do app se quiser ter certeza): ' + securityNumber, { style: 'margin:0; font-family: monospace; font-size:12px;' }),
    ]));
  }

  // ===========================================================================
  // Mensagens: carregar, decifrar, renderizar (bolhas estilo WhatsApp/Telegram)
  // ===========================================================================
  function conversationKeyCacheKey(convId, myVer, peerVer) {
    return convId + '|' + myVer + ':' + peerVer;
  }

  function findPeerPublicKeyForVersion(peerId, version) {
    var cached = peerKeysCache[peerId];
    if (!cached) return null;
    var match = cached.keys.filter(function (k) { return k.keyVersion === version; })[0];
    return match ? match.publicKey : null;
  }

  /** Devolve a CryptoKey de conversa certa para ESTA mensagem, ou null se não for mais possível derivar (própria chave já rotacionada). */
  async function getConversationKeyForMessage(msg) {
    if (!currentConversation || !identity) return null;
    var isMine = msg.senderId === identity.profileId;
    var myVersionInMsg = isMine ? msg.senderKeyVersion : msg.recipientKeyVersion;
    var peerVersionInMsg = isMine ? msg.recipientKeyVersion : msg.senderKeyVersion;
    if (myVersionInMsg !== identity.keyVersion) return null; // chave própria já rotacionada — não dá mais para derivar

    var cacheKey = conversationKeyCacheKey(currentConversation.conversationId, myVersionInMsg, peerVersionInMsg);
    if (conversationKeyCache[cacheKey]) return conversationKeyCache[cacheKey];

    var peerPub = findPeerPublicKeyForVersion(currentConversation.peer.id, peerVersionInMsg);
    if (!peerPub) return null;

    var key = await MsgCrypto.deriveConversationKey({
      privateKey: identity.privateKey, peerPublicKeyBase64url: peerPub, conversationId: currentConversation.conversationId,
      selfId: identity.profileId, selfKeyVersion: myVersionInMsg, peerId: currentConversation.peer.id, peerKeyVersion: peerVersionInMsg,
    });
    conversationKeyCache[cacheKey] = key;
    return key;
  }

  async function decryptForDisplay(msg) {
    try {
      var key = await getConversationKeyForMessage(msg);
      if (!key) return { ok: false, reason: 'old-key' };
      var result = await MsgCrypto.decryptMessage({
        conversationKey: key, iv: msg.iv, ciphertext: msg.ciphertext,
        aad: { conversationId: currentConversation.conversationId, senderId: msg.senderId, senderKeyVersion: msg.senderKeyVersion, recipientKeyVersion: msg.recipientKeyVersion, clientMessageId: msg.clientMessageId },
      });
      return { ok: true, body: result.body };
    } catch (err) {
      return { ok: false, reason: 'decrypt-failed' };
    }
  }

  async function loadMessages(initial) {
    var app = App();
    var res = await app.callApi('apiListMessages', app.getState().sessionToken, currentConversation.conversationId, {});
    if (!res.success) { app.setStatus('messaging-thread-status', res.message, 'error'); return; }
    var ordered = res.messages.slice().reverse(); // servidor devolve DESC quando sem cursor; queremos crescente para exibir
    for (var i = 0; i < ordered.length; i++) {
      await appendMessageToThread(ordered[i]);
    }
    if (ordered.length) {
      var lastMsg = ordered[ordered.length - 1];
      lastSeenMessageId = Math.max(lastSeenMessageId, lastMsg.id);
      markReadIfNeeded(lastMsg.id);
    }
    scrollThreadToBottom();
  }

  function markReadIfNeeded(lastReadId) {
    var app = App();
    app.callApi('apiMarkConversationRead', app.getState().sessionToken, currentConversation.conversationId, lastReadId).then(function () {
      refreshMessagesBadge();
    });
  }

  var lastRenderedSenderId = null; // agrupamento visual de mensagens consecutivas do mesmo remetente

  /**
   * Três ações de apagar, pedido explícito do dono da plataforma:
   * - "Apagar para mim": esconde só da MINHA visão (message_hides no
   *   servidor) — funciona em qualquer mensagem, minha ou do outro lado.
   * - "Apagar para todos": só disponível na PRÓPRIA mensagem, remove o
   *   conteúdo para os dois lados (tombstone). Nunca aparece em mensagem
   *   do outro participante — o backend também recusa, isto aqui é só UX.
   */
  function handleHideMessageForMe(msg, row) {
    var app = App();
    app.openConfirm('Apagar esta mensagem só para você? A outra pessoa continua vendo normalmente.', function () {
      app.callApi('apiHideMessageForMe', app.getState().sessionToken, currentConversation.conversationId, msg.id).then(function (res) {
        if (!res.success) { app.setStatus('messaging-thread-status', res.message, 'error'); return; }
        row.remove();
      });
    });
  }

  function handleDeleteMessageForEveryone(msg, bodyEl, actionsWrap) {
    var app = App();
    app.openConfirm('Apagar esta mensagem para todos? Ela deixa de aparecer também para a outra pessoa. Não pode ser desfeito.', function () {
      app.callApi('apiDeleteMessage', app.getState().sessionToken, currentConversation.conversationId, msg.id).then(function (res) {
        if (!res.success) { app.setStatus('messaging-thread-status', res.message, 'error'); return; }
        app.clearEl(bodyEl);
        bodyEl.appendChild(app.text('span', '(mensagem apagada)', { className: 'muted', style: 'font-style:italic;' }));
        if (actionsWrap) actionsWrap.remove();
      });
    });
  }

  function renderMessageActions(msg, isMine, row, bodyEl) {
    var app = App();
    var toggleBtn = app.h('button', { className: 'chat-bubble-menu-btn', type: 'button', 'aria-label': 'Opções da mensagem' }, ['⋯']);
    var actionsWrap = app.h('div', { className: 'chat-bubble-actions hidden' }, []);
    var hideBtn = app.h('button', {
      type: 'button', className: 'secondary',
      onclick: function () { handleHideMessageForMe(msg, row); },
    }, ['Apagar para mim']);
    actionsWrap.appendChild(hideBtn);
    if (isMine) {
      actionsWrap.appendChild(app.h('button', {
        type: 'button', className: 'secondary',
        onclick: function () { handleDeleteMessageForEveryone(msg, bodyEl, actionsWrap); },
      }, ['Apagar para todos']));
    }
    toggleBtn.addEventListener('click', function () { actionsWrap.classList.toggle('hidden'); });
    return [toggleBtn, actionsWrap];
  }

  async function appendMessageToThread(msg) {
    if (messagesSeen[msg.id] || clientMessageIdsSeen[msg.clientMessageId]) return;
    messagesSeen[msg.id] = true;
    clientMessageIdsSeen[msg.clientMessageId] = true;

    var app = App();
    var isMine = identity && msg.senderId === identity.profileId;
    var bodyEl;
    if (msg.deleted) {
      bodyEl = app.text('p', '(mensagem apagada)', { className: 'chat-bubble-text muted', style: 'font-style:italic;' });
    } else {
      var decrypted = await decryptForDisplay(msg);
      if (decrypted.ok) {
        bodyEl = app.text('p', decrypted.body, { className: 'chat-bubble-text' });
      } else if (decrypted.reason === 'old-key') {
        bodyEl = app.text('p', '(Mensagem cifrada com uma chave anterior — não é possível abrir neste aparelho.)', { className: 'chat-bubble-text muted', style: 'font-style:italic;' });
      } else {
        bodyEl = app.text('p', '(Não foi possível decifrar esta mensagem.)', { className: 'chat-bubble-text muted', style: 'font-style:italic;' });
      }
    }

    var grouped = lastRenderedSenderId === msg.senderId;
    lastRenderedSenderId = msg.senderId;

    var bubbleChildren = [bodyEl, app.text('span', app.formatDate(msg.createdAt), { className: 'chat-bubble-time' })];
    var bubble = app.h('div', { className: 'chat-bubble ' + (isMine ? 'chat-bubble-mine' : 'chat-bubble-theirs') }, bubbleChildren);
    var row = app.h('div', { className: 'chat-row ' + (isMine ? 'chat-row-mine' : 'chat-row-theirs') + (grouped ? ' chat-row-grouped' : '') }, [bubble]);

    if (!msg.deleted) {
      var actionEls = renderMessageActions(msg, isMine, row, bodyEl);
      bubble.appendChild(actionEls[0]);
      row.appendChild(actionEls[1]);
    }

    document.getElementById('messaging-thread-list').appendChild(row);
  }

  function scrollThreadToBottom() {
    var list = document.getElementById('messaging-thread-list');
    list.scrollTop = list.scrollHeight;
  }

  // ===========================================================================
  // Envio
  // ===========================================================================
  function updateCharCounter() {
    var textArea = document.getElementById('messaging-send-text');
    var counterEl = document.getElementById('messaging-char-counter');
    var max = MsgCrypto ? MsgCrypto.MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH : 2000;
    if (textArea.value.length > max) textArea.value = textArea.value.slice(0, max);
    counterEl.textContent = textArea.value.length + ' / ' + max;
  }

  function parseRetrySecondsFromMessage(message) {
    var minutesMatch = /em (\d+) minuto/.exec(message || '');
    if (minutesMatch) return parseInt(minutesMatch[1], 10) * 60;
    var secondsMatch = /em (\d+) segundo/.exec(message || '');
    if (secondsMatch) return parseInt(secondsMatch[1], 10);
    return 60;
  }

  function applySendMute(seconds) {
    var app = App();
    var btn = document.getElementById('btn-messaging-send');
    sendMuteUntilTs = Date.now() + seconds * 1000;
    btn.disabled = true;
    if (sendMuteTimer) clearTimeout(sendMuteTimer);
    sendMuteTimer = setTimeout(function () {
      btn.disabled = false;
      app.setStatus('messaging-thread-status', '', null);
    }, seconds * 1000);
  }

  async function handleSendSubmit() {
    var app = App();
    if (!currentConversation || !identity) return;
    if (Date.now() < sendMuteUntilTs) return;

    var textArea = document.getElementById('messaging-send-text');
    var plaintext = textArea.value.trim();
    if (!plaintext) return;
    if (plaintext.length > MsgCrypto.MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH) {
      app.setStatus('messaging-thread-status', 'Mensagem excede o limite de ' + MsgCrypto.MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH + ' caracteres.', 'error');
      return;
    }

    var recipientKeyVersion = findActivePeerKeyVersion(currentConversation.peer.id);
    if (!recipientKeyVersion) {
      app.setStatus('messaging-thread-status', 'Este contato ainda não abriu a área de mensagens.', 'error');
      return;
    }

    var sendBtn = document.getElementById('btn-messaging-send');
    sendBtn.disabled = true;
    var clientMessageId = (crypto.randomUUID ? crypto.randomUUID() : generateUuidFallback());

    try {
      var conversationKey = await getOrDeriveOutgoingConversationKey(recipientKeyVersion);
      var encrypted = await MsgCrypto.encryptMessage({
        conversationKey: conversationKey, plaintext: plaintext,
        aad: { conversationId: currentConversation.conversationId, senderId: identity.profileId, senderKeyVersion: identity.keyVersion, recipientKeyVersion: recipientKeyVersion, clientMessageId: clientMessageId },
      });

      var res = await app.callApi('apiSendMessage', app.getState().sessionToken, currentConversation.conversationId, {
        clientMessageId: clientMessageId, senderKeyVersion: identity.keyVersion, recipientKeyVersion: recipientKeyVersion, iv: encrypted.iv, ciphertext: encrypted.ciphertext,
      });

      if (!res.success) {
        app.setStatus('messaging-thread-status', res.message, 'error');
        if (/silenciad/.test(res.message || '')) applySendMute(parseRetrySecondsFromMessage(res.message));
        else sendBtn.disabled = false;
        return;
      }

      app.setStatus('messaging-thread-status', '', null);
      textArea.value = '';
      updateCharCounter();
      sendBtn.disabled = false;
      lastNewMessageAt = Date.now();
      conversationPollIntervalMs = CONVERSATION_POLL_FAST_MS;
      restartConversationPolling();

      await appendMessageToThread({
        id: res.messageId, senderId: identity.profileId, clientMessageId: clientMessageId, senderKeyVersion: identity.keyVersion,
        recipientKeyVersion: recipientKeyVersion, iv: encrypted.iv, ciphertext: encrypted.ciphertext, createdAt: res.createdAt,
      });
      lastSeenMessageId = Math.max(lastSeenMessageId, res.messageId);
      scrollThreadToBottom();
      focusMessageInput();
    } catch (err) {
      app.setStatus('messaging-thread-status', (err && err.message) || 'Não foi possível enviar a mensagem.', 'error');
      sendBtn.disabled = false;
    }
  }

  function generateUuidFallback() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function findActivePeerKeyVersion(peerId) {
    var cached = peerKeysCache[peerId];
    if (!cached) return null;
    var active = cached.keys.filter(function (k) { return k.active; })[0];
    return active ? active.keyVersion : null;
  }

  async function getOrDeriveOutgoingConversationKey(recipientKeyVersion) {
    var cacheKey = conversationKeyCacheKey(currentConversation.conversationId, identity.keyVersion, recipientKeyVersion);
    if (conversationKeyCache[cacheKey]) return conversationKeyCache[cacheKey];
    var peerPub = findPeerPublicKeyForVersion(currentConversation.peer.id, recipientKeyVersion);
    var key = await MsgCrypto.deriveConversationKey({
      privateKey: identity.privateKey, peerPublicKeyBase64url: peerPub, conversationId: currentConversation.conversationId,
      selfId: identity.profileId, selfKeyVersion: identity.keyVersion, peerId: currentConversation.peer.id, peerKeyVersion: recipientKeyVersion,
    });
    conversationKeyCache[cacheKey] = key;
    return key;
  }

  // ===========================================================================
  // Limpar conversa: esconde o histórico só da MINHA visão (sql/011,
  // low/high_cleared_before_id por participante) — a outra pessoa continua
  // vendo tudo normalmente do lado dela. Nada é apagado do banco aqui.
  // ===========================================================================
  function handleClearConversation() {
    var app = App();
    if (!currentConversation) return;
    app.openConfirm(
      'Limpar esta conversa apaga o histórico só da sua visão — ' + (currentConversation.peer.fullName || 'a outra pessoa') + ' continua vendo normalmente. Esta ação não pode ser desfeita. Quer continuar?',
      function () {
        var convId = currentConversation.conversationId;
        app.callApi('apiClearConversation', app.getState().sessionToken, convId).then(function (res) {
          if (!res.success) { app.setStatus('messaging-thread-status', res.message, 'error'); return; }
          app.clearEl(document.getElementById('messaging-thread-list'));
          messagesSeen = {};
          clientMessageIdsSeen = {};
          lastSeenMessageId = 0;
          lastRenderedSenderId = null;
          app.setStatus('messaging-thread-status', 'Conversa limpa.', 'success');
        });
      }
    );
  }

  // ===========================================================================
  // Polling: 5s com a conversa aberta e a aba visível, recuando para 30s
  // depois de 2min sem mensagem nova; volta a 5s ao enviar/receber.
  // Sincronização global a cada 30s para o badge.
  // ===========================================================================
  function stopConversationPolling() {
    if (conversationPollTimer) { clearTimeout(conversationPollTimer); conversationPollTimer = null; }
  }

  function restartConversationPolling() {
    stopConversationPolling();
    startConversationPolling();
  }

  function startConversationPolling() {
    stopConversationPolling();
    conversationPollIntervalMs = CONVERSATION_POLL_FAST_MS;
    lastNewMessageAt = Date.now();
    scheduleNextPoll();
  }

  function scheduleNextPoll() {
    conversationPollTimer = setTimeout(pollConversationOnce, conversationPollIntervalMs);
  }

  async function pollConversationOnce() {
    if (!currentConversation || document.hidden || isUserIdle()) { scheduleNextPoll(); return; }
    var app = App();
    try {
      var res = await app.callApi('apiListMessages', app.getState().sessionToken, currentConversation.conversationId, { afterId: lastSeenMessageId });
      if (res.success && res.messages && res.messages.length) {
        for (var i = 0; i < res.messages.length; i++) {
          await appendMessageToThread(res.messages[i]);
          lastSeenMessageId = Math.max(lastSeenMessageId, res.messages[i].id);
        }
        markReadIfNeeded(lastSeenMessageId);
        scrollThreadToBottom();
        lastNewMessageAt = Date.now();
        conversationPollIntervalMs = CONVERSATION_POLL_FAST_MS;
      } else if (Date.now() - lastNewMessageAt > CONVERSATION_POLL_ESCALATE_AFTER_MS) {
        conversationPollIntervalMs = CONVERSATION_POLL_SLOW_MS;
      }
    } catch (err) {
      // recuo simples em erro de rede — mantém o intervalo atual
    }
    scheduleNextPoll();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && currentConversation) {
      conversationPollIntervalMs = CONVERSATION_POLL_FAST_MS;
      lastNewMessageAt = Date.now();
    }
  });

  function stopGlobalSync() {
    if (globalSyncTimer) { clearInterval(globalSyncTimer); globalSyncTimer = null; }
  }

  function startGlobalSync() {
    stopGlobalSync();
    refreshMessagesBadge();
    globalSyncTimer = setInterval(function () {
      if (document.hidden || isUserIdle()) return;
      refreshMessagesBadge();
      // Se a tela de "Conversas" (lista) está aberta, atualiza ela também —
      // pedido explícito: "atualização automática... sem precisar alterar
      // de tela". Não mexe se uma conversa específica estiver aberta (essa
      // já tem seu próprio polling de 5s em startConversationPolling).
      var convView = document.getElementById('messaging-conversations-view');
      if (convView && !convView.classList.contains('hidden')) loadConversations();
    }, GLOBAL_SYNC_INTERVAL_MS);
  }

  /**
   * Chamado por app.js logo após o login (enterApp) — pedido explícito:
   * o contador de mensagens não lidas precisa atualizar sozinho mesmo sem
   * o usuário nunca ter entrado na aba "Mensagens". Não depende da
   * identidade de criptografia estar pronta (apiMessagingSync só conta
   * linhas, não decifra nada) — só do papel (visitante não tem acesso).
   */
  function startBackgroundSync() {
    var app = App();
    var profile = app.getState().profile;
    if (!profile || profile.role === 'visitor') return;
    startGlobalSync();
  }

  function refreshMessagesBadge() {
    var app = App();
    var state = app.getState();
    if (!state.sessionToken) return;
    app.callApi('apiMessagingSync', state.sessionToken).then(function (res) {
      var badge = document.getElementById('nav-badge-messages');
      if (!badge) return;
      if (!res.success || !res.unreadMessages) { badge.classList.add('hidden'); return; }
      badge.textContent = String(res.unreadMessages);
      badge.classList.remove('hidden');
    });
  }

  function resumePendingPeerIfAny() {
    if (pendingPeerAfterUnlock) {
      var peer = pendingPeerAfterUnlock;
      pendingPeerAfterUnlock = null;
      openConversationWithPeer(peer);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var backBtn = document.getElementById('btn-messaging-back');
    if (backBtn) backBtn.addEventListener('click', function () { showConversationsView(); });
    var clearBtn = document.getElementById('btn-messaging-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () { handleClearConversation(); });
    var sendForm = document.getElementById('form-messaging-send');
    if (sendForm) sendForm.addEventListener('submit', function (evt) { evt.preventDefault(); handleSendSubmit(); });
    var textArea = document.getElementById('messaging-send-text');
    if (textArea) {
      textArea.addEventListener('input', function () { updateCharCounter(); });
      // Enter envia, Shift+Enter quebra linha — como WhatsApp/Telegram no desktop.
      textArea.addEventListener('keydown', function (evt) {
        if (evt.key === 'Enter' && !evt.shiftKey) { evt.preventDefault(); handleSendSubmit(); }
      });
    }
  });

  // ===========================================================================
  // Namespace público (chamado por app.js)
  // ===========================================================================
  window.LaiftMessaging = {
    loadMessagingPanel: loadMessagingPanel,
    openConversationWithPeer: openConversationWithPeer,
    refreshMessagesBadge: refreshMessagesBadge,
    startBackgroundSync: startBackgroundSync,
    resetMessagingState: resetMessagingState,
    hasUnlockedIdentity: function () { return !!identity; },
  };
})();
