/**
 * frontend/messaging.js
 * Estado e UI da mensageria E2EE (Fase 3f de docs/PLANO_FASE3_MENSAGERIA.md).
 * Módulo ES que usa frontend/msg-crypto.js para toda a criptografia e um
 * pequeno namespace compartilhado (`window.App`, exposto por frontend/app.js)
 * para as poucas coisas que precisa de lá: `state.sessionToken`, `callApi`,
 * os builders de DOM `h`/`text` (NUNCA innerHTML — ver nota de segurança
 * abaixo) e alguns utilitários (`setStatus`, `clearEl`, `formatDate`,
 * `openConfirm`, `showPanel`). `app.js` continua um script clássico; só
 * este arquivo e msg-crypto.js são módulos ES (ver frontend/index.html).
 *
 * ===========================================================================
 * SEGURANÇA — auditar isto antes de qualquer alteração:
 * ===========================================================================
 * - A chave privada (`identity.privateKey`, um CryptoKey NÃO extraível) e a
 *   frase-secreta digitada só existem em variáveis deste módulo, em
 *   memória. NUNCA são gravadas em localStorage/sessionStorage/cookie,
 *   NUNCA aparecem num payload de `callApi`, NUNCA em console.log.
 * - O que ESTE módulo grava em localStorage é só o fingerprint de chaves
 *   já vistas (TOFU, seção 3.7 do plano) — não é segredo, é só um número
 *   de conferência.
 * - Todo texto decifrado (corpo da mensagem, nome do remetente, etc.) é
 *   inserido no DOM só via `text()`/`h()` do bridge — nunca `innerHTML`.
 * - `resetMessagingState()` é chamada no logout e na expiração de sessão
 *   (registrada via `App().onSessionEnd`) e apaga tudo da memória.
 */

(function () {
  'use strict';

  // Carregado como <script type="module">, então este arquivo roda numa
  // Promise pendente até o import resolver — mas todo o corpo abaixo só
  // referencia `MsgCrypto` dentro de funções chamadas depois, nunca no
  // topo do módulo, então a ordem de carregamento relativa a app.js não
  // importa (ver comentário equivalente sobre `window.App` mais abaixo).
  var MsgCrypto = null;
  var msgCryptoReady = import('./msg-crypto.js').then(function (mod) { MsgCrypto = mod; });

  // ===========================================================================
  // Bridge com app.js (script clássico, definido depois deste módulo no
  // documento, mas SEMPRE antes de qualquer interação do usuário — ver
  // frontend/index.html). Nunca acessado no topo do módulo, só dentro de
  // funções chamadas em resposta a eventos.
  // ===========================================================================
  function App() {
    if (!window.App) throw new Error('window.App ainda não está pronto (bug de ordem de carregamento).');
    return window.App;
  }

  // ===========================================================================
  // Constantes locais (algumas espelham worker/src/constants.js — ver
  // comentário em msg-crypto.js sobre por que precisam ser mantidas
  // manualmente em sincronia)
  // ===========================================================================
  var TOFU_STORAGE_KEY = 'pm_msg_tofu_v1';
  var CONVERSATION_POLL_FAST_MS = 5000;
  var CONVERSATION_POLL_SLOW_MS = 30000;
  var CONVERSATION_POLL_ESCALATE_AFTER_MS = 2 * 60 * 1000;
  var GLOBAL_SYNC_INTERVAL_MS = 30000;
  var UNLOCK_ATTEMPT_BASE_DELAY_MS = 800;

  // ===========================================================================
  // Estado em memória (tudo apagado por resetMessagingState)
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
  var unlockAttemptCount = 0;
  var sendMuteUntilTs = 0;
  var sendMuteTimer = null;
  var pendingPeerAfterUnlock = null; // peer que a UI tentou abrir antes de a identidade estar desbloqueada

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
    unlockAttemptCount = 0;
    sendMuteUntilTs = 0;
    if (sendMuteTimer) { clearTimeout(sendMuteTimer); sendMuteTimer = null; }
    pendingPeerAfterUnlock = null;
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
  // Tela de bloqueio: configuração (primeira vez) ou desbloqueio
  // ===========================================================================
  function showLockCard(show) {
    document.getElementById('messaging-lock-card').classList.toggle('hidden', !show);
    document.getElementById('messaging-main-card').classList.toggle('hidden', show);
  }

  function clearLockContent() {
    var app = App();
    app.clearEl(document.getElementById('messaging-lock-content'));
  }

  async function loadMessagingPanel() {
    await msgCryptoReady;
    var app = App();
    if (!MsgCrypto.isCryptoSupported()) {
      showLockCard(true);
      clearLockContent();
      document.getElementById('messaging-lock-content').appendChild(
        app.text('p', 'Seu navegador não é compatível com mensagens cifradas. Atualize o navegador para usar esta área.', { className: 'status-msg', 'data-kind': 'error' })
      );
      return;
    }
    if (identity) {
      showLockCard(false);
      showConversationsView();
      loadConversations();
      return;
    }
    showLockCard(true);
    clearLockContent();
    document.getElementById('messaging-lock-content').appendChild(app.text('p', 'Carregando...', { className: 'muted' }));

    var res = await app.callApi('apiGetMyMessagingKey', app.getState().sessionToken);
    if (!res.success) {
      clearLockContent();
      document.getElementById('messaging-lock-content').appendChild(app.text('p', res.message, { className: 'status-msg', 'data-kind': 'error' }));
      return;
    }
    if (res.hasKey) renderUnlockScreen(res);
    else renderSetupScreen(res);
  }

  function renderExplanationBlock() {
    var app = App();
    return app.h('div', { className: 'status-msg', 'data-kind': 'info', style: 'display:block; margin-bottom:14px;' }, [
      app.h('p', { style: 'margin:0 0 8px;' }, [app.h('strong', {}, ['Suas mensagens são cifradas de ponta a ponta.'])]),
      app.text('p', 'A liga (nem o servidor) consegue ler o conteúdo. A chave que protege suas mensagens é gerada a partir de uma frase-secreta que só existe no seu aparelho — ela NUNCA é enviada para o servidor.', { style: 'margin:0 0 8px;' }),
      app.text('p', 'Importante: essa frase NÃO é a sua senha de login. Se você esquecer a frase-secreta, não existe forma de recuperar o histórico de mensagens antigas — nem a liga consegue ajudar.', { style: 'margin:0;' }),
    ]);
  }

  function renderSetupScreen(myKeyRes) {
    var app = App();
    clearLockContent();
    var container = document.getElementById('messaging-lock-content');

    var passInput = app.h('input', { type: 'password', id: 'messaging-setup-pass', autocomplete: 'off', placeholder: 'Frase-secreta (mínimo 12 caracteres)' });
    var confirmInput = app.h('input', { type: 'password', id: 'messaging-setup-confirm', autocomplete: 'off', placeholder: 'Repita a frase-secreta' });
    var ackCheckbox = app.h('input', { type: 'checkbox', id: 'messaging-setup-ack' });
    var statusEl = app.h('div', { className: 'status-msg', role: 'alert', 'aria-live': 'polite' }, []);

    var generateBtn = app.h('button', {
      type: 'button', className: 'secondary',
      onclick: function () {
        var gen = MsgCrypto.generatePassphrase();
        passInput.value = gen.passphrase;
        confirmInput.value = gen.passphrase;
        statusEl.textContent = 'Frase gerada (~' + Math.round(gen.entropyBits) + ' bits). Anote-a num lugar seguro antes de continuar.';
        statusEl.setAttribute('data-kind', 'info');
      },
    }, ['Gerar frase para mim']);

    var submitBtn = app.h('button', { type: 'submit' }, ['Ativar mensagens cifradas']);

    var form = app.h('form', {
      onsubmit: function (evt) {
        evt.preventDefault();
        handleSetupSubmit(passInput.value, confirmInput.value, ackCheckbox.checked, myKeyRes.profileId, statusEl, submitBtn);
      },
    }, [
      app.h('label', { for: 'messaging-setup-pass' }, ['Frase-secreta', passInput]),
      app.h('label', { for: 'messaging-setup-confirm' }, ['Confirmar frase-secreta', confirmInput]),
      generateBtn,
      app.h('label', { style: 'display:flex; align-items:center; gap:8px; font-weight:normal; margin-top:10px;' }, [ackCheckbox, app.text('span', 'Entendo que, se eu esquecer esta frase, perco o acesso ao histórico de mensagens para sempre.')]),
      submitBtn,
      statusEl,
    ]);

    container.appendChild(renderExplanationBlock());
    container.appendChild(form);
  }

  async function handleSetupSubmit(passphrase, confirmPass, ackChecked, profileId, statusEl, submitBtn) {
    var app = App();
    if (!ackChecked) { statusEl.textContent = 'Marque que você entende que não há recuperação.'; statusEl.setAttribute('data-kind', 'error'); return; }
    if (passphrase !== confirmPass) { statusEl.textContent = 'As duas frases não coincidem.'; statusEl.setAttribute('data-kind', 'error'); return; }
    var strength = MsgCrypto.checkPassphraseStrength(passphrase);
    if (!strength.ok) { statusEl.textContent = strength.reason; statusEl.setAttribute('data-kind', 'error'); return; }

    submitBtn.disabled = true;
    statusEl.textContent = 'Derivando chave (pode levar 1-2 segundos)...';
    statusEl.setAttribute('data-kind', 'info');

    try {
      var saltBase64url = MsgCrypto.generateSaltBase64url();
      var iterations = await MsgCrypto.calibrateKdfIterations();
      var keyPair = await MsgCrypto.deriveIdentityKeyPair({ passphrase: passphrase, saltBase64url: saltBase64url, iterations: iterations, accountId: profileId });

      var publishRes = await app.callApi('apiPublishMessagingKey', app.getState().sessionToken, {
        algorithm: MsgCrypto.MSG_CRYPTO_CONFIG.ALGORITHM,
        publicKey: keyPair.publicKeyBase64url,
        kdfAlgorithm: MsgCrypto.MSG_CRYPTO_CONFIG.KDF_ALGORITHM,
        kdfIterations: iterations,
        kdfSalt: saltBase64url,
        expectedCurrentVersion: 0,
      });
      if (!publishRes.success) {
        statusEl.textContent = publishRes.message;
        statusEl.setAttribute('data-kind', 'error');
        submitBtn.disabled = false;
        return;
      }

      identity = { profileId: profileId, privateKey: keyPair.privateKey, publicKeyBase64url: keyPair.publicKeyBase64url, keyVersion: publishRes.keyVersion };
      showLockCard(false);
      showConversationsView();
      loadConversations();
      startGlobalSync();
      resumePendingPeerIfAny();
    } catch (err) {
      statusEl.textContent = (err && err.message) || 'Não foi possível ativar as mensagens cifradas.';
      statusEl.setAttribute('data-kind', 'error');
      submitBtn.disabled = false;
    }
  }

  function renderUnlockScreen(myKeyRes) {
    var app = App();
    clearLockContent();
    var container = document.getElementById('messaging-lock-content');

    var passInput = app.h('input', { type: 'password', id: 'messaging-unlock-pass', autocomplete: 'off', placeholder: 'Sua frase-secreta' });
    var statusEl = app.h('div', { className: 'status-msg', role: 'alert', 'aria-live': 'polite' }, []);
    var submitBtn = app.h('button', { type: 'submit' }, ['Desbloquear mensagens']);

    var forgotLink = app.h('button', {
      type: 'button', className: 'secondary',
      onclick: function () { confirmForgotPassphrase(myKeyRes); },
    }, ['Esqueci minha frase-secreta']);

    var form = app.h('form', {
      onsubmit: function (evt) {
        evt.preventDefault();
        handleUnlockSubmit(passInput.value, myKeyRes, statusEl, submitBtn);
      },
    }, [
      app.h('label', { for: 'messaging-unlock-pass' }, ['Frase-secreta', passInput]),
      submitBtn,
      statusEl,
    ]);

    container.appendChild(app.text('p', 'Digite a frase-secreta desta conta para abrir suas conversas neste aparelho.', { className: 'muted' }));
    container.appendChild(form);
    container.appendChild(app.h('div', { style: 'margin-top:14px;' }, [forgotLink]));
  }

  async function handleUnlockSubmit(passphrase, myKeyRes, statusEl, submitBtn) {
    var app = App();
    if (unlockAttemptCount > 0) {
      // Atraso crescente entre tentativas (seção 6 do plano): puramente no
      // cliente, não é rate limit do servidor.
      var delay = Math.min(UNLOCK_ATTEMPT_BASE_DELAY_MS * Math.pow(2, unlockAttemptCount - 1), 8000);
      statusEl.textContent = 'Aguarde um instante...';
      statusEl.setAttribute('data-kind', 'info');
      await new Promise(function (resolve) { setTimeout(resolve, delay); });
    }

    submitBtn.disabled = true;
    statusEl.textContent = 'Verificando frase-secreta...';
    statusEl.setAttribute('data-kind', 'info');

    try {
      var keyPair = await MsgCrypto.deriveIdentityKeyPair({
        passphrase: passphrase, saltBase64url: myKeyRes.kdf.salt, iterations: myKeyRes.kdf.iterations, accountId: myKeyRes.profileId,
      });
      if (keyPair.publicKeyBase64url !== myKeyRes.publicKey) {
        unlockAttemptCount++;
        statusEl.textContent = 'Frase-secreta incorreta.';
        statusEl.setAttribute('data-kind', 'error');
        submitBtn.disabled = false;
        return;
      }

      unlockAttemptCount = 0;
      identity = { profileId: myKeyRes.profileId, privateKey: keyPair.privateKey, publicKeyBase64url: keyPair.publicKeyBase64url, keyVersion: myKeyRes.keyVersion };
      showLockCard(false);
      showConversationsView();
      loadConversations();
      startGlobalSync();
      resumePendingPeerIfAny();
    } catch (err) {
      statusEl.textContent = (err && err.message) || 'Não foi possível desbloquear as mensagens.';
      statusEl.setAttribute('data-kind', 'error');
      submitBtn.disabled = false;
    }
  }

  function confirmForgotPassphrase(myKeyRes) {
    var app = App();
    app.openConfirm(
      'Se você esqueceu mesmo a frase, será preciso criar uma nova. As mensagens antigas cifradas com a frase anterior ficarão ilegíveis para você (o histórico continua acessível para quem já estava na conversa, do lado dele). Quer continuar?',
      function () {
        app.openConfirm(
          'Tem certeza? Esta ação não pode ser desfeita — o histórico antigo não volta a ficar legível para você.',
          function () { renderRotationScreen(myKeyRes); }
        );
      }
    );
  }

  function renderRotationScreen(myKeyRes) {
    var app = App();
    clearLockContent();
    var container = document.getElementById('messaging-lock-content');

    var passInput = app.h('input', { type: 'password', id: 'messaging-rotate-pass', autocomplete: 'off', placeholder: 'Nova frase-secreta' });
    var confirmInput = app.h('input', { type: 'password', id: 'messaging-rotate-confirm', autocomplete: 'off', placeholder: 'Repita a nova frase-secreta' });
    var statusEl = app.h('div', { className: 'status-msg', role: 'alert', 'aria-live': 'polite' }, []);
    var submitBtn = app.h('button', { type: 'submit' }, ['Criar nova frase e continuar']);

    var form = app.h('form', {
      onsubmit: function (evt) {
        evt.preventDefault();
        handleRotationSubmit(passInput.value, confirmInput.value, myKeyRes, statusEl, submitBtn);
      },
    }, [
      app.h('label', { for: 'messaging-rotate-pass' }, ['Nova frase-secreta', passInput]),
      app.h('label', { for: 'messaging-rotate-confirm' }, ['Confirmar nova frase-secreta', confirmInput]),
      submitBtn,
      statusEl,
    ]);

    container.appendChild(app.text('p', 'O histórico cifrado com a frase anterior não poderá mais ser aberto por você neste ou em nenhum outro aparelho.', { className: 'status-msg', 'data-kind': 'error', style: 'display:block; margin-bottom:12px;' }));
    container.appendChild(form);
  }

  async function handleRotationSubmit(passphrase, confirmPass, myKeyRes, statusEl, submitBtn) {
    var app = App();
    if (passphrase !== confirmPass) { statusEl.textContent = 'As duas frases não coincidem.'; statusEl.setAttribute('data-kind', 'error'); return; }
    var strength = MsgCrypto.checkPassphraseStrength(passphrase);
    if (!strength.ok) { statusEl.textContent = strength.reason; statusEl.setAttribute('data-kind', 'error'); return; }

    submitBtn.disabled = true;
    statusEl.textContent = 'Derivando nova chave...';
    statusEl.setAttribute('data-kind', 'info');

    try {
      var saltBase64url = MsgCrypto.generateSaltBase64url();
      var iterations = await MsgCrypto.calibrateKdfIterations();
      var keyPair = await MsgCrypto.deriveIdentityKeyPair({ passphrase: passphrase, saltBase64url: saltBase64url, iterations: iterations, accountId: myKeyRes.profileId });

      var publishRes = await app.callApi('apiPublishMessagingKey', app.getState().sessionToken, {
        algorithm: MsgCrypto.MSG_CRYPTO_CONFIG.ALGORITHM,
        publicKey: keyPair.publicKeyBase64url,
        kdfAlgorithm: MsgCrypto.MSG_CRYPTO_CONFIG.KDF_ALGORITHM,
        kdfIterations: iterations,
        kdfSalt: saltBase64url,
        expectedCurrentVersion: myKeyRes.keyVersion,
      });
      if (!publishRes.success) {
        statusEl.textContent = publishRes.message;
        statusEl.setAttribute('data-kind', 'error');
        submitBtn.disabled = false;
        return;
      }

      identity = { profileId: myKeyRes.profileId, privateKey: keyPair.privateKey, publicKeyBase64url: keyPair.publicKeyBase64url, keyVersion: publishRes.keyVersion };
      conversationKeyCache = {};
      showLockCard(false);
      showConversationsView();
      loadConversations();
      startGlobalSync();
    } catch (err) {
      statusEl.textContent = (err && err.message) || 'Não foi possível criar a nova frase-secreta.';
      statusEl.setAttribute('data-kind', 'error');
      submitBtn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var lockBtn = document.getElementById('btn-messaging-lock');
    if (lockBtn) lockBtn.addEventListener('click', function () {
      identity = null;
      conversationKeyCache = {};
      stopConversationPolling();
      loadMessagingPanel();
    });
    var backBtn = document.getElementById('btn-messaging-back');
    if (backBtn) backBtn.addEventListener('click', function () { showConversationsView(); });
    var sendForm = document.getElementById('form-messaging-send');
    if (sendForm) sendForm.addEventListener('submit', function (evt) { evt.preventDefault(); handleSendSubmit(); });
    var textArea = document.getElementById('messaging-send-text');
    if (textArea) textArea.addEventListener('input', function () { updateCharCounter(); });
  });

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
      ? app.h('img', { className: 'orgchart-avatar', src: item.peer.avatarUrl, alt: item.peer.fullName })
      : app.h('span', { className: 'orgchart-avatar-placeholder' }, [(item.peer.fullName || '?').charAt(0).toUpperCase()]);
    var unreadBadge = item.unreadCount > 0 ? app.h('span', { className: 'badge', style: 'margin-left:8px;' }, [String(item.unreadCount) + ' nova' + (item.unreadCount > 1 ? 's' : '')]) : null;

    return app.h('article', {
      className: 'list-item', style: 'cursor:pointer;',
      onclick: function () { openConversationWithPeer(item.peer); },
    }, [
      avatar,
      app.h('div', { style: 'flex:1;' }, [
        app.h('p', { style: 'margin:0; display:flex; align-items:center;' }, [app.h('strong', {}, [item.peer.fullName]), unreadBadge]),
        app.text('p', item.peer.username ? '@' + item.peer.username : '', { className: 'muted', style: 'margin:0; font-size:13px;' }),
        app.text('p', item.lastMessageAt ? app.formatDate(item.lastMessageAt) : 'Nenhuma mensagem ainda', { className: 'muted', style: 'margin:0; font-size:12px;' }),
      ]),
    ]);
  }

  // ===========================================================================
  // Abrir conversa — ponto de entrada usado também pelo botão "Enviar
  // mensagem" do modal de perfil de membro (app.js chama
  // window.LaiftMessaging.openConversationWithPeer via App()).
  // ===========================================================================
  async function openConversationWithPeer(peer) {
    await msgCryptoReady;
    var app = App();
    if (!MsgCrypto.isCryptoSupported()) { app.showPanel('panel-messages'); return; }
    if (!identity) {
      pendingPeerAfterUnlock = peer;
      app.showPanel('panel-messages');
      loadMessagingPanel();
      return;
    }

    app.showPanel('panel-messages');
    showLockCard(false);
    showThreadView();
    app.setStatus('messaging-thread-status', 'Abrindo conversa...', 'info');
    app.clearEl(document.getElementById('messaging-thread-list'));
    app.clearEl(document.getElementById('messaging-tofu-banner'));
    document.getElementById('messaging-thread-peer-name').textContent = peer.fullName || '';
    document.getElementById('messaging-thread-peer-sub').textContent = peer.username ? '@' + peer.username : '';

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
      app.setStatus('messaging-thread-status', 'Este contato ainda não ativou as mensagens cifradas.', 'info');
      document.getElementById('btn-messaging-send').disabled = true;
      return;
    }
    document.getElementById('btn-messaging-send').disabled = false;

    var tofu = await checkAndRecordTofu(peer.id, activeKey.keyVersion, activeKey.publicKey);
    await renderTofuBanner(tofu, peer, activeKey);

    app.setStatus('messaging-thread-status', '', null);
    await loadMessages(true);
    startConversationPolling();
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
  // Mensagens: carregar, decifrar, renderizar
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

  async function appendMessageToThread(msg) {
    if (messagesSeen[msg.id] || clientMessageIdsSeen[msg.clientMessageId]) return;
    messagesSeen[msg.id] = true;
    clientMessageIdsSeen[msg.clientMessageId] = true;

    var app = App();
    var isMine = identity && msg.senderId === identity.profileId;
    var decrypted = await decryptForDisplay(msg);
    var bodyEl;
    if (decrypted.ok) {
      bodyEl = app.text('p', decrypted.body, { style: 'margin:0; white-space:pre-wrap; word-break:break-word;' });
    } else if (decrypted.reason === 'old-key') {
      bodyEl = app.text('p', '(Mensagem cifrada com uma chave anterior — não é possível abrir neste aparelho.)', { className: 'muted', style: 'margin:0; font-style:italic;' });
    } else {
      bodyEl = app.text('p', '(Não foi possível decifrar esta mensagem.)', { className: 'muted', style: 'margin:0; font-style:italic;' });
    }

    var row = app.h('div', {
      style: 'align-self:' + (isMine ? 'flex-end' : 'flex-start') + '; max-width:80%; background:' + (isMine ? 'var(--primary-soft)' : 'var(--surface-alt)') + '; border-radius:12px; padding:8px 12px;',
    }, [
      bodyEl,
      app.text('p', app.formatDate(msg.createdAt), { className: 'muted', style: 'margin:4px 0 0; font-size:11px; text-align:right;' }),
    ]);
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
    var app = App();
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
      app.setStatus('messaging-thread-status', 'Este contato ainda não ativou as mensagens cifradas.', 'error');
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
  // Polling (seção "Polling" do plano): 5s com a conversa aberta e a aba
  // visível, recuando para 30s depois de 2min sem mensagem nova; volta a
  // 5s ao enviar/receber. Sincronização global a cada 30s para o badge.
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
    if (!currentConversation || document.hidden) { scheduleNextPoll(); return; }
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
      if (!document.hidden) refreshMessagesBadge();
    }, GLOBAL_SYNC_INTERVAL_MS);
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

  // ===========================================================================
  // Namespace público (chamado por app.js)
  // ===========================================================================
  window.LaiftMessaging = {
    loadMessagingPanel: loadMessagingPanel,
    openConversationWithPeer: openConversationWithPeer,
    refreshMessagesBadge: refreshMessagesBadge,
    resetMessagingState: resetMessagingState,
    hasUnlockedIdentity: function () { return !!identity; },
  };
})();
