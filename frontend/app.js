(function () {
  'use strict';

  // ===========================================================================
  // URL da API (backend em Cloudflare Workers — ver worker/). Não é segredo —
  // é o mesmo endereço público documentado no README; nenhuma credencial
  // trafega aqui, só o token de sessão opaco que o próprio backend emite
  // após login.
  // ===========================================================================
  var API_BASE_URL = 'https://plataforma-membros-api.diretoria-dpf.workers.dev';

  // ===========================================================================
  // Desestímulo cosmético a clique-direito / atalhos de DevTools.
  //
  // IMPORTANTE: isto NÃO é segurança e não deve ser tratado como tal. Não
  // existe forma de impedir de verdade a inspeção de uma página no
  // navegador do próprio usuário (desativar JS, outro navegador, ferramentas
  // de rede como o próprio "curl" continuam funcionando). Como não há nenhum
  // segredo no código do cliente — senha, hash, credencial de banco, tudo
  // fica só no servidor (Apps Script) — não há o que "vazar" mesmo com o
  // DevTools aberto. Isto existe apenas por pedido explícito, como
  // decoração/atrito leve, e pode ser removido a qualquer momento sem
  // qualquer impacto de segurança real.
  // ===========================================================================
  document.addEventListener('contextmenu', function (evt) { evt.preventDefault(); });
  document.addEventListener('keydown', function (evt) {
    var key = (evt.key || '').toUpperCase();
    var blocked =
      key === 'F12' ||
      (evt.ctrlKey && evt.shiftKey && (key === 'I' || key === 'J' || key === 'C')) ||
      (evt.metaKey && evt.altKey && (key === 'I' || key === 'J' || key === 'C')) ||
      (evt.ctrlKey && key === 'U');
    if (blocked) evt.preventDefault();
  });

  // ===========================================================================
  // Estado do cliente + cache de sessão
  //
  // Decisão de produto (revisitada em 2026-09-25): o token de sessão agora é
  // espelhado em localStorage com expiração própria de 30 minutos (mesmo TTL
  // que o servidor já aplica à sessão), para a pessoa continuar logada ao
  // atualizar a página ou fechar e voltar ao navegador. Isso troca uma
  // mitigação de profundidade contra XSS persistente (token só em memória)
  // por conveniência de uso — decisão consciente, não um descuido: o
  // servidor CONTINUA revalidando a sessão a cada chamada (nunca confia só
  // no que está salvo aqui), e o valor salvo nunca é a senha nem nada além
  // do token opaco + o horário em que expira. Ver docs/SECURITY.md.
  // ===========================================================================
  var SESSION_CACHE_KEY = 'pm_session';
  var SESSION_TTL_MS = 30 * 60 * 1000;
  var sessionExpiryTimer = null;

  var state = {
    sessionToken: null,
    profile: null, // { fullName, role }
  };

  function saveSessionCache(token) {
    try {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ token: token, expiresAt: Date.now() + SESSION_TTL_MS }));
    } catch (err) {
      // localStorage indisponível (modo privado, cookies bloqueados etc.) —
      // a plataforma continua funcionando, só sem persistir entre recargas.
    }
  }

  function readSessionCache() {
    try {
      var raw = localStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.token || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
        localStorage.removeItem(SESSION_CACHE_KEY);
        return null;
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function clearSessionCache() {
    try { localStorage.removeItem(SESSION_CACHE_KEY); } catch (err) { /* ignora */ }
    if (sessionExpiryTimer) { clearTimeout(sessionExpiryTimer); sessionExpiryTimer = null; }
  }

  /** Agenda o retorno automático à tela de login exatamente quando o cache expira, mesmo com a aba aberta o tempo todo. */
  function scheduleSessionExpiry(expiresAt) {
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    var msLeft = Math.max(0, expiresAt - Date.now());
    sessionExpiryTimer = setTimeout(function () {
      clearSessionCache();
      state.sessionToken = null;
      state.profile = null;
      document.getElementById('app-root').classList.add('hidden');
      document.getElementById('public-shell').classList.remove('hidden');
      showPublicScreen('screen-welcome');
      setStatus('msg-login', 'Sua sessão expirou. Faça login novamente.', 'info');
    }, msLeft);
  }

  // ===========================================================================
  // Utilitários de DOM seguros (nunca innerHTML com dado dinâmico)
  // ===========================================================================
  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined) return;
        if (key === 'className') el.className = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      } else {
        el.appendChild(child);
      }
    });
    return el;
  }

  function text(tag, value, attrs) {
    return h(tag, attrs, [String(value === null || value === undefined ? '' : value)]);
  }

  function setStatus(elId, message, kind) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = message || '';
    if (kind) el.setAttribute('data-kind', kind);
    else el.removeAttribute('data-kind');
  }

  function renderList(containerId, items, renderItem, emptyMessage) {
    var container = document.getElementById(containerId);
    if (!container) return;
    clearEl(container);
    if (!items || !items.length) {
      container.appendChild(h('p', { className: 'empty-state' }, [emptyMessage]));
      return;
    }
    items.forEach(function (item) {
      container.appendChild(renderItem(item));
    });
  }

  function formatDate(iso) {
    if (!iso) return 'Não informado';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pt-BR');
  }

  // ===========================================================================
  // Correção de bug real: um <input type="datetime-local"> devolve uma string
  // SEM fuso horário (ex.: "2026-09-25T14:30"). Enviar essa string crua para
  // o servidor é ambíguo — o motor JS do Worker interpreta "sem fuso" como
  // UTC, mas a pessoa escolheu esse horário no fuso LOCAL dela no navegador.
  // Isso fazia `new Date(valorCru)` no servidor gravar um horário até 3h
  // diferente do pretendido, fazendo votações/eventos/tarefas parecerem
  // fechados ou abertos na hora errada. `new Date(valorCru)` AQUI, no
  // navegador, interpreta corretamente como hora local (é o navegador que
  // sabe o fuso do usuário) — daí convertemos para ISO com fuso explícito
  // antes de mandar, o que remove a ambiguidade em qualquer lugar que leia.
  // ===========================================================================
  function localDateTimeToIso(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  }

  // ===========================================================================
  // Upload de imagem (avatar / capa de evento): lê o arquivo como data URL e
  // separa o prefixo "data:image/png;base64," do payload puro, que é o que o
  // backend espera (ver worker/src/services/mediaService.js). O limite de
  // 2MB/5MB aqui é só conveniência de UX — o servidor sempre revalida o
  // tamanho real nos bytes decodificados antes de gravar no R2.
  // ===========================================================================
  var MAX_AVATAR_FILE_BYTES = 2 * 1024 * 1024;
  var MAX_EVENT_IMAGE_FILE_BYTES = 5 * 1024 * 1024;

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma === -1 ? '' : result.slice(comma + 1));
      };
      reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      reader.readAsDataURL(file);
    });
  }

  function setAvatarPreview(imgId, placeholderId, src) {
    var img = document.getElementById(imgId);
    var placeholder = document.getElementById(placeholderId);
    if (!img) return;
    if (src) {
      img.src = src;
      img.classList.remove('hidden');
      if (placeholder) placeholder.classList.add('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      if (placeholder) placeholder.classList.remove('hidden');
    }
  }

  // ===========================================================================
  // Ponte com o servidor — API HTTP/JSON do Worker (worker/src/index.js).
  //
  // O Worker responde preflight CORS de verdade (diferente do Apps Script
  // antigo, que não tinha como), então aqui já dá pra usar
  // "application/json" normalmente — o navegador dispara um OPTIONS antes,
  // e o Worker responde com os cabeçalhos corretos restritos à origem
  // permitida (ver ALLOWED_ORIGINS em worker/wrangler.toml).
  // ===========================================================================
  function api(fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    return fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: fnName, args: args }),
    }).then(function (res) {
      if (!res.ok) throw new Error('Falha de comunicação com o servidor.');
      return res.json();
    });
  }

  function callApi(fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    return api.apply(null, [fnName].concat(args)).catch(function (err) {
      return { success: false, message: (err && err.message) || 'Falha de comunicação com o servidor.' };
    });
  }

  // ===========================================================================
  // Navegação entre telas públicas
  // ===========================================================================
  function showPublicScreen(id) {
    ['screen-welcome', 'screen-register', 'screen-forgot', 'screen-reset'].forEach(function (screenId) {
      var el = document.getElementById(screenId);
      if (el) el.classList.toggle('hidden', screenId !== id);
    });
  }

  document.querySelectorAll('[data-nav]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPublicScreen(btn.getAttribute('data-nav'));
    });
  });

  // ===========================================================================
  // Folhas decorativas (respeita prefers-reduced-motion)
  // ===========================================================================
  (function initLeaves() {
    var field = document.getElementById('leaf-field');
    if (!field) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var symbols = ['🍃', '🍂', '🌿'];
    for (var i = 0; i < 14; i++) {
      var leaf = document.createElement('span');
      leaf.className = 'leaf';
      leaf.textContent = symbols[i % symbols.length];
      leaf.style.left = Math.random() * 100 + '%';
      leaf.style.animationDuration = 12 + Math.random() * 10 + 's';
      leaf.style.animationDelay = Math.random() * 10 + 's';
      leaf.style.fontSize = 16 + Math.random() * 14 + 'px';
      field.appendChild(leaf);
    }
  })();

  // ===========================================================================
  // Preferências visuais (tema)
  // ===========================================================================
  function applyPreferences(prefs) {
    var root = document.documentElement;
    if (prefs && prefs.theme) root.setAttribute('data-theme', prefs.theme);
  }

  // ===========================================================================
  // Modal genérico de confirmação
  // ===========================================================================
  function openConfirm(message, onConfirm) {
    var overlay = document.getElementById('modal-confirm');
    var msgEl = document.getElementById('modal-confirm-message');
    var okBtn = document.getElementById('modal-confirm-ok');
    var cancelBtn = document.getElementById('modal-confirm-cancel');

    msgEl.textContent = message;
    overlay.classList.remove('hidden');

    function cleanup() {
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }
    function onOk() { cleanup(); onConfirm(); }
    function onCancel() { cleanup(); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  }

  function openImageLightbox(src, alt) {
    var overlay = document.getElementById('modal-image-lightbox');
    var img = document.getElementById('lightbox-image');
    img.src = src;
    img.alt = alt || '';
    overlay.classList.remove('hidden');
  }

  function closeImageLightbox() {
    document.getElementById('modal-image-lightbox').classList.add('hidden');
    document.getElementById('lightbox-image').removeAttribute('src');
  }

  document.getElementById('lightbox-close').addEventListener('click', closeImageLightbox);
  document.getElementById('modal-image-lightbox').addEventListener('click', function (evt) {
    if (evt.target.id === 'modal-image-lightbox') closeImageLightbox();
  });

  function openVoteComplementModal(onSubmit) {
    var overlay = document.getElementById('modal-vote-complement');
    var form = document.getElementById('form-vote-complement');
    var textarea = document.getElementById('vote-complement-text');
    var cancelBtn = document.getElementById('modal-vote-cancel');

    textarea.value = '';
    overlay.classList.remove('hidden');

    function cleanup() {
      overlay.classList.add('hidden');
      form.removeEventListener('submit', onFormSubmit);
      cancelBtn.removeEventListener('click', onCancel);
    }
    function onFormSubmit(evt) {
      evt.preventDefault();
      var value = textarea.value.trim();
      cleanup();
      onSubmit(value);
    }
    function onCancel() { cleanup(); }

    form.addEventListener('submit', onFormSubmit);
    cancelBtn.addEventListener('click', onCancel);
  }

  // ===========================================================================
  // Autenticação
  // ===========================================================================
  document.getElementById('form-login').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    setStatus('msg-login', 'Validando acesso...', 'info');

    callApi('apiLogin', email, password).then(function (res) {
      if (!res.success) { setStatus('msg-login', res.message, 'error'); return; }
      state.sessionToken = res.sessionToken;
      state.profile = res.profile;
      saveSessionCache(res.sessionToken);
      scheduleSessionExpiry(Date.now() + SESSION_TTL_MS);
      setStatus('msg-login', '', null);
      enterApp();
    });
  });

  var regAvatarPayload = null; // { base64, mimeType } — preenchido ao escolher um arquivo válido

  document.getElementById('reg-avatar-input').addEventListener('change', function (evt) {
    var file = evt.target.files && evt.target.files[0];
    regAvatarPayload = null;
    setAvatarPreview('reg-avatar-preview', 'reg-avatar-placeholder', null);
    setStatus('msg-reg-avatar', '', null);
    if (!file) return;

    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(file.type) === -1) {
      setStatus('msg-reg-avatar', 'Formato não suportado. Use JPEG, PNG, WEBP ou GIF.', 'error');
      evt.target.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setStatus('msg-reg-avatar', 'Imagem muito grande (máximo 2MB).', 'error');
      evt.target.value = '';
      return;
    }

    readFileAsBase64(file).then(function (base64) {
      regAvatarPayload = { base64: base64, mimeType: file.type };
      setAvatarPreview('reg-avatar-preview', 'reg-avatar-placeholder', 'data:' + file.type + ';base64,' + base64);
    }).catch(function (err) {
      setStatus('msg-reg-avatar', err.message, 'error');
    });
  });

  document.getElementById('form-register').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var payload = {
      fullName: document.getElementById('reg-name').value,
      username: document.getElementById('reg-username').value,
      email: document.getElementById('reg-email').value,
      phone: document.getElementById('reg-phone').value,
      linkedinUrl: document.getElementById('reg-linkedin').value,
      instagramHandle: document.getElementById('reg-instagram').value,
      education: document.getElementById('reg-education').value,
      interests: document.getElementById('reg-interests').value,
      password: document.getElementById('reg-password').value,
      validationPreference: document.getElementById('reg-validation').value,
      termsAccepted: document.getElementById('reg-terms').checked,
      privacyAccepted: document.getElementById('reg-privacy').checked,
    };
    if (regAvatarPayload) {
      payload.avatarBase64 = regAvatarPayload.base64;
      payload.avatarMimeType = regAvatarPayload.mimeType;
    }
    setStatus('msg-register', 'Enviando cadastro...', 'info');

    callApi('apiRegister', payload).then(function (res) {
      setStatus('msg-register', res.message, res.success ? 'success' : 'error');
      if (res.success) {
        document.getElementById('form-register').reset();
        regAvatarPayload = null;
        setAvatarPreview('reg-avatar-preview', 'reg-avatar-placeholder', null);
      }
    });
  });

  document.getElementById('form-forgot').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var email = document.getElementById('forgot-email').value;
    setStatus('msg-forgot', 'Enviando...', 'info');

    callApi('apiRequestPasswordReset', email).then(function (res) {
      setStatus('msg-forgot', res.message, res.success ? 'success' : 'error');
      if (res.success) document.getElementById('form-forgot').reset();
    });
  });

  document.getElementById('form-reset').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var pwd = document.getElementById('reset-password').value;
    var confirmPwd = document.getElementById('reset-password-confirm').value;

    if (pwd !== confirmPwd) {
      setStatus('msg-reset', 'As senhas não coincidem.', 'error');
      return;
    }

    setStatus('msg-reset', 'Salvando nova senha...', 'info');
    callApi('apiConfirmPasswordReset', window.APP_DEEP_LINK_TOKEN, pwd).then(function (res) {
      setStatus('msg-reset', res.message, res.success ? 'success' : 'error');
      if (res.success) {
        setTimeout(function () { showPublicScreen('screen-welcome'); }, 1500);
      }
    });
  });

  document.getElementById('btn-logout').addEventListener('click', function () {
    var token = state.sessionToken;
    state.sessionToken = null;
    state.profile = null;
    clearSessionCache();
    document.getElementById('app-root').classList.add('hidden');
    document.getElementById('public-shell').classList.remove('hidden');
    document.getElementById('form-login').reset();
    showPublicScreen('screen-welcome');
    if (token) callApi('apiLogout', token);
  });

  // ===========================================================================
  // Entrada no aplicativo autenticado
  // ===========================================================================
  function enterApp() {
    document.getElementById('public-shell').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');

    document.getElementById('header-user-name').textContent = state.profile.fullName || '';
    var badge = document.getElementById('header-role-badge');
    var roleLabels = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };
    badge.textContent = roleLabels[state.profile.role] || state.profile.role;
    badge.classList.remove('hidden', 'admin');
    if (state.profile.role === 'admin') badge.classList.add('admin');

    setupNavigationForRole(state.profile.role);
    // Sempre entra em modo membro, mesmo que uma sessão anterior nesta mesma
    // aba (outra pessoa, ou a mesma) tenha ficado em modo admin dedicado.
    document.getElementById('nav-group-member').classList.remove('hidden');
    document.getElementById('nav-group-admin').classList.add('hidden');
    document.getElementById('header-scope-label').textContent = 'Área do membro';
    showPanel('panel-home');
    loadProfileAndPreferences();
    refreshNavBadges();
  }

  /** Atualiza o "!" de votação aberta e o número de tarefas ativas na navegação inferior. Chamada no login e sempre que uma ação relevante (votar, aderir/concluir tarefa) muda esses números. */
  function refreshNavBadges() {
    if (!state.profile || state.profile.role === 'visitor') return;

    callApi('apiListOpenProposalsForVoting', state.sessionToken).then(function (res) {
      var votingBadge = document.getElementById('nav-badge-voting');
      var hasOpenVoting = res.success && res.proposals && res.proposals.some(function (p) { return !p.alreadyVoted; });
      votingBadge.classList.toggle('hidden', !hasOpenVoting);
    });

    callApi('apiListTasks', state.sessionToken).then(function (res) {
      var tasksBadge = document.getElementById('nav-badge-tasks');
      if (!res.success || !res.tasks) { tasksBadge.classList.add('hidden'); return; }
      var activeCount = res.tasks.filter(function (t) { return !t.alreadySignedUp; }).length;
      tasksBadge.textContent = String(activeCount);
      tasksBadge.classList.toggle('hidden', activeCount === 0);
    });
  }

  function setupNavigationForRole(role) {
    document.querySelectorAll('#app-nav [data-scope]').forEach(function (btn) {
      var scope = btn.getAttribute('data-scope');
      var visible = scope === 'all' || (scope === 'member' && (role === 'member' || role === 'admin')) || (scope === 'admin' && role === 'admin');
      btn.classList.toggle('hidden', !visible);
    });
  }

  document.querySelectorAll('#app-nav [data-panel]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPanel(btn.getAttribute('data-panel'));
    });
  });

  // ===========================================================================
  // Modo admin dedicado: a engrenagem troca a barra inferior inteira (e o
  // rótulo do cabeçalho) para as opções de administração, em vez de abrir
  // uma gaveta por cima — clicar em "Voltar" (mesma barra) restaura a
  // navegação de membro comum. É só uma troca de interface: a autorização
  // real de cada ação continua sempre validada no servidor.
  // ===========================================================================
  function setAdminMode(active) {
    document.getElementById('nav-group-member').classList.toggle('hidden', active);
    document.getElementById('nav-group-admin').classList.toggle('hidden', !active);
    document.getElementById('header-scope-label').textContent = active ? 'Área administrativa' : 'Área do membro';
    showPanel(active ? 'panel-admin-dashboard' : 'panel-home');
  }

  document.getElementById('btn-enter-admin-mode').addEventListener('click', function () { setAdminMode(true); });
  document.getElementById('btn-exit-admin-mode').addEventListener('click', function () { setAdminMode(false); });

  var PANEL_LOADERS = {
    'panel-events': loadEvents,
    'panel-proposals': loadProposalsAndVoting,
    'panel-tasks': loadTasks,
    'panel-profile': loadProfileAndPreferences,
    'panel-admin-dashboard': loadAdminDashboard,
    'panel-admin-users': function () { loadAdminUsers(1); },
    'panel-admin-events': loadAdminEvents,
    'panel-admin-proposals': loadAdminProposals,
    'panel-admin-tasks': loadAdminTasks,
    'panel-admin-feedback': function () { loadAdminFeedback(1); },
    'panel-admin-audit': function () { loadAdminAudit(1); },
  };

  function showPanel(panelId) {
    document.querySelectorAll('.app-main > section').forEach(function (section) {
      section.classList.toggle('hidden', section.id !== panelId);
    });
    document.querySelectorAll('#app-nav [data-panel]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-panel') === panelId);
    });
    window.scrollTo(0, 0);
    if (PANEL_LOADERS[panelId]) PANEL_LOADERS[panelId]();
    // Reavalia os indicadores ("!" de votação aberta, contagem de tarefas)
    // a cada navegação — não só no login — porque um admin pode ter
    // publicado uma tarefa ou aberto uma votação depois que a sessão atual
    // já estava ativa; sem isso o indicador ficava "congelado" no que
    // existia no momento do login.
    refreshNavBadges();
  }

  // ===========================================================================
  // Eventos
  // ===========================================================================
  function loadEvents() {
    setStatus('events-status', 'Carregando eventos...', 'info');
    var loaded = callApi('apiListEvents', state.sessionToken || '').then(function (res) {
      if (!res.success) { setStatus('events-status', res.message, 'error'); return; }
      setStatus('events-status', '', null);
      renderList('events-list', res.events, renderEventItem, 'Não há eventos publicados no momento.');
    });
    loadEventsHistory();
    return loaded;
  }

  function loadEventsHistory() {
    callApi('apiListRecentCompletedEvents').then(function (res) {
      if (!res.success) return;
      renderList('events-history-list', res.events, renderEventHistoryItem, 'Ainda não há eventos concluídos no histórico.');
    });
  }

  function renderEventHistoryItem(item) {
    var children = [];
    if (item.imageUrl) {
      children.push(h('img', {
        className: 'event-image', src: item.imageUrl, alt: item.title,
        onclick: function () { openImageLightbox(item.imageUrl, item.title); },
      }));
    }
    children.push(text('h4', item.title));
    children.push(text('p', item.description));
    var meta = [text('span', 'Realizado em: ' + formatDate(item.eventDate))];
    if (item.location) meta.push(text('span', 'Local: ' + item.location));
    children.push(h('div', { className: 'meta-row' }, meta));
    return h('article', { className: 'list-item' }, children);
  }

  function renderEventItem(item) {
    var metaChildren = [
      text('span', 'Data: ' + formatDate(item.eventDate)),
      text('span', item.capacity !== null ? 'Vagas: ' + item.spotsLeft + '/' + item.capacity : 'Vagas ilimitadas'),
    ];
    if (item.location) metaChildren.push(text('span', 'Local: ' + item.location));
    if (item.status === 'in_progress') {
      metaChildren.unshift(h('span', { className: 'badge in-progress' }, ['Em andamento']));
    }

    var actionsChildren = [];
    if (!state.sessionToken) {
      actionsChildren.push(text('span', 'Faça login para se inscrever.', { className: 'muted' }));
    } else if (item.isRegistered) {
      actionsChildren.push(h('span', { className: 'badge' }, ['Inscrição confirmada']));
    } else if (item.spotsLeft === 0) {
      actionsChildren.push(text('span', 'Sem vagas disponíveis.', { className: 'muted' }));
    } else {
      actionsChildren.push(h('button', {
        onclick: function () { registerForEvent(item.id); },
      }, ['Inscrever-se']));
    }

    var children = [];
    if (item.imageUrl) {
      children.push(h('img', {
        className: 'event-image', src: item.imageUrl, alt: item.title,
        onclick: function () { openImageLightbox(item.imageUrl, item.title); },
      }));
    }
    children.push(text('h4', item.title));
    children.push(text('p', item.description));
    children.push(h('div', { className: 'meta-row' }, metaChildren));
    children.push(h('div', { className: 'actions-row' }, actionsChildren));

    return h('article', { className: 'list-item' }, children);
  }

  function registerForEvent(eventId) {
    callApi('apiRegisterForEvent', state.sessionToken, eventId).then(function (res) {
      loadEvents().then(function () {
        setStatus('events-status', res.message, res.success ? 'success' : 'error');
      });
    });
  }

  // ===========================================================================
  // Propostas e votação
  // ===========================================================================
  document.getElementById('form-proposal').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var payload = {
      title: document.getElementById('proposal-title').value,
      description: document.getElementById('proposal-description').value,
    };
    callApi('apiSubmitProposal', state.sessionToken, payload).then(function (res) {
      setStatus('msg-proposal', res.message, res.success ? 'success' : 'error');
      if (res.success) {
        document.getElementById('form-proposal').reset();
        loadProposalsAndVoting();
      }
    });
  });

  function loadProposalsAndVoting() {
    callApi('apiListMyProposals', state.sessionToken).then(function (res) {
      if (!res.success) return;
      renderList('my-proposals-list', res.proposals, function (p) {
        return h('article', { className: 'list-item' }, [
          text('h4', p.title),
          text('p', p.description),
          h('div', { className: 'meta-row' }, [
            h('span', { className: 'badge' }, [proposalStatusLabel(p.status)]),
            text('span', 'Enviada em: ' + formatDate(p.created_at)),
          ]),
        ]);
      }, 'Você ainda não enviou propostas.');
    });

    if (state.profile.role === 'visitor') {
      setStatus('voting-status', 'Somente membros e administradores podem votar.', 'info');
      renderList('voting-list', [], function () {}, '');
      return;
    }

    setStatus('voting-status', 'Carregando votações abertas...', 'info');
    callApi('apiListOpenProposalsForVoting', state.sessionToken).then(function (res) {
      if (!res.success) { setStatus('voting-status', res.message, 'error'); return; }
      setStatus('voting-status', '', null);
      renderList('voting-list', res.proposals, renderVotingItem, 'Não há votações abertas no momento.');
    });
  }

  function proposalStatusLabel(status) {
    var labels = {
      submitted: 'Em análise', approved: 'Aprovada', rejected: 'Rejeitada',
      voting_open: 'Votação aberta', voting_closed: 'Votação encerrada',
    };
    return labels[status] || status;
  }

  function renderVotingItem(item) {
    var feedback = h('p', { className: 'status-msg' }, []);

    var actions = h('div', { className: 'actions-row' }, item.alreadyVoted
      ? [h('span', { className: 'badge' }, ['Voto registrado'])]
      : [
          h('button', { onclick: function () { submitVote(item.id, 'yes', '', feedback); } }, ['Sim']),
          h('button', { className: 'secondary', onclick: function () { submitVote(item.id, 'no', '', feedback); } }, ['Não']),
          h('button', {
            className: 'secondary',
            onclick: function () {
              openVoteComplementModal(function (text2) {
                if (!text2) return;
                submitVote(item.id, 'complement', text2, feedback);
              });
            },
          }, ['Comentar']),
        ]);

    return h('article', { className: 'list-item' }, [
      text('h4', item.title),
      text('p', item.description),
      h('div', { className: 'meta-row' }, [text('span', 'Encerra em: ' + formatDate(item.votingClosesAt))]),
      actions,
      feedback,
    ]);
  }

  function submitVote(proposalId, choice, complement, feedbackEl) {
    callApi('apiCastVote', state.sessionToken, proposalId, choice, complement).then(function (res) {
      feedbackEl.textContent = res.message;
      feedbackEl.setAttribute('data-kind', res.success ? 'success' : 'error');
      if (res.success) { loadProposalsAndVoting(); refreshNavBadges(); }
    });
  }

  // ===========================================================================
  // Tarefas
  // ===========================================================================
  function loadTasks() {
    if (state.profile.role === 'visitor') {
      setStatus('tasks-status', 'Somente membros e administradores podem ver tarefas.', 'info');
      renderList('tasks-list', [], function () {}, '');
      return Promise.resolve();
    }
    setStatus('tasks-status', 'Carregando tarefas...', 'info');
    return callApi('apiListTasks', state.sessionToken).then(function (res) {
      if (!res.success) { setStatus('tasks-status', res.message, 'error'); return; }
      setStatus('tasks-status', '', null);
      renderList('tasks-list', res.tasks, renderTaskItem, 'Não há tarefas publicadas no momento.');
    });
  }

  function renderTaskItem(item) {
    var actions = [];
    if (item.alreadySignedUp) {
      actions.push(h('span', { className: 'badge' }, [item.completed ? 'Concluída' : 'Você aderiu']));
      if (!item.completed) {
        actions.push(h('button', { onclick: function () { markTaskComplete(item.id); } }, ['Marcar como concluída']));
      }
    } else {
      actions.push(h('button', { onclick: function () { signupForTask(item.id); } }, ['Aderir']));
    }

    var commentsBox = h('div', { className: 'task-comments hidden' }, []);
    var commentsToggle = h('button', {
      className: 'secondary',
      onclick: function () { toggleTaskComments(item.id, commentsBox, commentsToggle); },
    }, ['Comentários']);
    actions.push(commentsToggle);

    return h('article', { className: 'list-item' }, [
      text('h4', item.title),
      text('p', item.description),
      h('div', { className: 'meta-row' }, [
        text('span', 'Prazo: ' + formatDate(item.dueDate)),
        text('span', 'Pessoas aderidas: ' + item.signupCount),
      ]),
      h('div', { className: 'actions-row' }, actions),
      commentsBox,
    ]);
  }

  function signupForTask(taskId) {
    callApi('apiSignupForTask', state.sessionToken, taskId).then(function (res) {
      loadTasks().then(function () {
        setStatus('tasks-status', res.message, res.success ? 'success' : 'error');
      });
      refreshNavBadges();
    });
  }

  function markTaskComplete(taskId) {
    callApi('apiMarkTaskComplete', state.sessionToken, taskId).then(function (res) {
      loadTasks().then(function () {
        setStatus('tasks-status', res.message, res.success ? 'success' : 'error');
      });
    });
  }

  /** Alterna a exibição dos comentários de uma tarefa, carregando-os sob demanda na primeira vez que o painel é aberto. */
  function toggleTaskComments(taskId, box, toggleBtn) {
    var isHidden = box.classList.contains('hidden');
    if (!isHidden) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    loadTaskComments(taskId, box);
  }

  function loadTaskComments(taskId, box) {
    clearEl(box);
    box.appendChild(text('p', 'Carregando comentários...', { className: 'muted' }));
    callApi('apiListTaskComments', state.sessionToken, taskId).then(function (res) {
      clearEl(box);
      if (!res.success) { box.appendChild(text('p', res.message, { className: 'muted' })); return; }

      (res.comments || []).forEach(function (c) {
        box.appendChild(h('div', { className: 'task-comment' }, [
          text('p', c.message),
          h('div', { className: 'comment-meta' }, [text('span', c.authorName + ' — ' + formatDate(c.createdAt))]),
        ]));
      });
      if (!res.comments || !res.comments.length) {
        box.appendChild(text('p', 'Nenhum comentário ainda.', { className: 'empty-state' }));
      }

      var textarea = h('textarea', { maxlength: 1000, placeholder: 'Escreva um comentário...' }, []);
      var submitBtn = h('button', {
        onclick: function () {
          var msg = textarea.value.trim();
          if (!msg) return;
          callApi('apiSubmitTaskComment', state.sessionToken, taskId, msg).then(function (res2) {
            if (res2.success) loadTaskComments(taskId, box);
            else setStatus('tasks-status', res2.message, 'error');
          });
        },
      }, ['Enviar']);
      box.appendChild(h('div', { className: 'task-comment-form' }, [textarea, submitBtn]));
    });
  }

  // ===========================================================================
  // Perfil e preferências
  // ===========================================================================
  function loadProfileAndPreferences() {
    callApi('apiGetMyProfile', state.sessionToken).then(function (res) {
      if (!res.success) { setStatus('msg-profile', res.message, 'error'); return; }

      document.getElementById('profile-name').value = res.profile.fullName || '';
      document.getElementById('profile-username').value = res.profile.username || '';
      document.getElementById('profile-phone').value = res.profile.phone || '';
      document.getElementById('profile-linkedin').value = res.profile.linkedinUrl || '';
      document.getElementById('profile-instagram').value = res.profile.instagramHandle || '';
      document.getElementById('profile-education').value = res.profile.education || '';
      document.getElementById('profile-interests').value = res.profile.interests || '';
      setAvatarPreview('profile-avatar-preview', 'profile-avatar-placeholder', res.profile.avatarUrl || null);

      document.getElementById('pref-theme').value = res.preferences.theme;
      document.getElementById('pref-email-notif').checked = !!res.preferences.emailNotifications;

      applyPreferences(res.preferences);
    });
    loadProfileMetrics();
  }

  function loadProfileMetrics() {
    callApi('apiGetMyMetrics', state.sessionToken).then(function (res) {
      if (!res.success) return;
      var labels = {
        eventsCount: 'Eventos participados', tasksCount: 'Tarefas aderidas', tasksCompletedCount: 'Tarefas concluídas',
        proposalsCount: 'Propostas enviadas', votesCount: 'Votos registrados', feedbackCount: 'Feedbacks enviados',
      };
      var container = document.getElementById('profile-metrics');
      clearEl(container);
      Object.keys(labels).forEach(function (key) {
        container.appendChild(h('div', { className: 'card stat-card' }, [
          text('span', labels[key]),
          text('strong', res.metrics[key]),
        ]));
      });
    });
  }

  document.getElementById('btn-profile-avatar-pick').addEventListener('click', function () {
    document.getElementById('profile-avatar-input').click();
  });

  document.getElementById('profile-avatar-input').addEventListener('change', function (evt) {
    var file = evt.target.files && evt.target.files[0];
    if (!file) return;

    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(file.type) === -1) {
      setStatus('msg-profile-avatar', 'Formato não suportado. Use JPEG, PNG, WEBP ou GIF.', 'error');
      evt.target.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setStatus('msg-profile-avatar', 'Imagem muito grande (máximo 2MB).', 'error');
      evt.target.value = '';
      return;
    }

    setStatus('msg-profile-avatar', 'Enviando foto...', 'info');
    readFileAsBase64(file).then(function (base64) {
      return callApi('apiUpdateMyAvatar', state.sessionToken, base64, file.type);
    }).then(function (res) {
      setStatus('msg-profile-avatar', res.message, res.success ? 'success' : 'error');
      if (res.success) setAvatarPreview('profile-avatar-preview', 'profile-avatar-placeholder', res.avatarUrl);
    }).catch(function (err) {
      setStatus('msg-profile-avatar', err.message, 'error');
    });
    evt.target.value = '';
  });

  document.getElementById('form-profile').addEventListener('submit', function (evt) {
    evt.preventDefault();
    // Nome completo não vai no payload: é imutável após o cadastro (o campo
    // já fica desabilitado na interface) e o servidor ignora esse campo de
    // qualquer forma mesmo que alguém tente enviar via chamada direta.
    var payload = {
      username: document.getElementById('profile-username').value,
      phone: document.getElementById('profile-phone').value,
      linkedinUrl: document.getElementById('profile-linkedin').value,
      instagramHandle: document.getElementById('profile-instagram').value,
      education: document.getElementById('profile-education').value,
      interests: document.getElementById('profile-interests').value,
    };
    callApi('apiUpdateMyProfile', state.sessionToken, payload).then(function (res) {
      setStatus('msg-profile', res.message, res.success ? 'success' : 'error');
    });
  });

  document.getElementById('form-preferences').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var payload = {
      theme: document.getElementById('pref-theme').value,
      emailNotifications: document.getElementById('pref-email-notif').checked,
    };
    callApi('apiUpdateMyPreferences', state.sessionToken, payload).then(function (res) {
      setStatus('msg-preferences', res.message, res.success ? 'success' : 'error');
      if (res.success) applyPreferences(payload);
    });
  });

  document.getElementById('form-feedback').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var message = document.getElementById('feedback-message').value;
    callApi('apiSubmitFeedback', state.sessionToken, message).then(function (res) {
      setStatus('msg-feedback', res.message, res.success ? 'success' : 'error');
      if (res.success) document.getElementById('form-feedback').reset();
    });
  });

  // ===========================================================================
  // Administração — dashboard
  // ===========================================================================
  var adminDashboardChart = null;

  function loadAdminDashboard() {
    callApi('apiAdminDashboard', state.sessionToken).then(function (res) {
      if (!res.success) return;
      var labels = {
        active_members: 'Membros ativos', active_admins: 'Administradores',
        banned_accounts: 'Contas banidas', published_events: 'Eventos publicados',
        proposals_pending: 'Propostas em análise', proposals_voting: 'Propostas em votação',
        tasks_open: 'Tarefas abertas',
      };
      var container = document.getElementById('admin-dashboard-stats');
      clearEl(container);
      Object.keys(labels).forEach(function (key) {
        container.appendChild(h('div', { className: 'card stat-card' }, [
          text('span', labels[key]),
          text('strong', res.indicators[key]),
        ]));
      });
      renderAdminDashboardChart(labels, res.indicators);
    });
  }

  /** Gráfico de barras dos mesmos indicadores dos cartões — usa Chart.js via CDN (index.html); se o script não carregar (bloqueio de rede etc.), o painel continua funcional só sem o gráfico. */
  function renderAdminDashboardChart(labels, indicators) {
    var canvas = document.getElementById('admin-dashboard-chart');
    if (!canvas || typeof window.Chart === 'undefined') return;

    var dataLabels = Object.keys(labels).map(function (key) { return labels[key]; });
    var dataValues = Object.keys(labels).map(function (key) { return indicators[key] || 0; });

    if (adminDashboardChart) { adminDashboardChart.destroy(); }
    adminDashboardChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: dataLabels,
        datasets: [{
          label: 'Indicadores',
          data: dataValues,
          backgroundColor: 'rgba(15, 111, 98, 0.55)',
          borderColor: 'rgba(15, 111, 98, 1)',
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // ===========================================================================
  // Administração — usuários
  // ===========================================================================
  var adminUsersState = { page: 1, search: '' };

  document.getElementById('form-user-search').addEventListener('submit', function (evt) {
    evt.preventDefault();
    adminUsersState.search = document.getElementById('user-search-input').value;
    loadAdminUsers(1);
  });

  function loadAdminUsers(page) {
    adminUsersState.page = page;
    callApi('apiAdminListUsers', state.sessionToken, { search: adminUsersState.search, page: page }).then(function (res) {
      if (!res.success) return;
      renderList('admin-users-list', res.users, renderAdminUserItem, 'Nenhum usuário encontrado.');
      renderPagination('admin-users-pagination', res.page, res.pageSize, res.total, loadAdminUsers);
    });
  }

  function renderAdminUserItem(user) {
    var roleSelect = h('select', {}, ['visitor', 'member', 'admin'].map(function (r) {
      var opt = text('option', roleLabelPt(r), { value: r });
      if (r === user.role) opt.setAttribute('selected', 'selected');
      return opt;
    }));

    var statusBadge = h('span', { className: 'badge' + (user.status === 'banned' ? ' banned' : '') }, [user.status === 'banned' ? 'Banido' : 'Ativo']);

    var actions = [
      h('button', {
        className: 'secondary',
        onclick: function () {
          var newRole = roleSelect.value;
          openConfirm('Confirmar alteração de papel de "' + user.fullName + '" para "' + roleLabelPt(newRole) + '"?', function () {
            callApi('apiAdminChangeUserRole', state.sessionToken, user.id, newRole).then(function (res) {
              alertInline(res);
              loadAdminUsers(adminUsersState.page);
            });
          });
        },
      }, ['Alterar papel']),
    ];

    if (user.status === 'banned') {
      actions.push(h('button', {
        onclick: function () {
          openConfirm('Reativar a conta de "' + user.fullName + '"?', function () {
            callApi('apiAdminUnbanUser', state.sessionToken, user.id).then(function (res) {
              alertInline(res);
              loadAdminUsers(adminUsersState.page);
            });
          });
        },
      }, ['Reativar conta']));
    } else {
      actions.push(h('button', {
        className: 'danger',
        onclick: function () {
          openConfirm('Banir a conta de "' + user.fullName + '"? Todas as sessões ativas serão revogadas.', function () {
            callApi('apiAdminBanUser', state.sessionToken, user.id).then(function (res) {
              alertInline(res);
              loadAdminUsers(adminUsersState.page);
            });
          });
        },
      }, ['Banir conta']));
    }

    return h('article', { className: 'list-item' }, [
      text('h4', user.fullName + ' ' + (user.emailConfirmed ? '' : '(e-mail não confirmado)')),
      text('p', user.email),
      h('div', { className: 'meta-row' }, [statusBadge, text('span', 'Cadastro: ' + formatDate(user.createdAt))]),
      h('div', { className: 'actions-row' }, [roleSelect].concat(actions)),
    ]);
  }

  function roleLabelPt(role) {
    return { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' }[role] || role;
  }

  function alertInline(res) {
    // Feedback simples e não bloqueante para ações administrativas pontuais.
    window.setTimeout(function () {}, 0);
    if (!res.success) {
      setStatus('admin-users-list', '', null);
    }
    var banner = document.createElement('div');
    banner.className = 'status-msg';
    banner.setAttribute('data-kind', res.success ? 'success' : 'error');
    banner.textContent = res.message;
    var host = document.getElementById('panel-admin-users');
    host.insertBefore(banner, host.firstChild.nextSibling);
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 4000);
  }

  function renderPagination(containerId, page, pageSize, total, loader) {
    var container = document.getElementById(containerId);
    clearEl(container);
    var totalPages = Math.max(1, Math.ceil(total / pageSize));

    var prevBtn = h('button', { className: 'secondary' }, ['Anterior']);
    prevBtn.disabled = page <= 1;
    prevBtn.addEventListener('click', function () { loader(page - 1); });

    var nextBtn = h('button', { className: 'secondary' }, ['Próxima']);
    nextBtn.disabled = page >= totalPages;
    nextBtn.addEventListener('click', function () { loader(page + 1); });

    container.appendChild(prevBtn);
    container.appendChild(text('span', 'Página ' + page + ' de ' + totalPages + ' (' + total + ' registros)', { className: 'muted' }));
    container.appendChild(nextBtn);
  }

  // ===========================================================================
  // Administração — eventos
  // ===========================================================================
  var EVENT_TRANSITIONS = {
    draft: ['published'], published: ['in_progress', 'archived'],
    in_progress: ['closed', 'completed', 'archived'], closed: ['completed', 'archived'],
    completed: ['archived'], archived: [],
  };
  var EVENT_STATUS_LABELS = {
    draft: 'Rascunho', published: 'Publicado', in_progress: 'Em andamento',
    closed: 'Fechado', completed: 'Concluído', archived: 'Arquivado',
  };

  document.getElementById('form-admin-event').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var capacityRaw = document.getElementById('event-capacity').value;
    var payload = {
      title: document.getElementById('event-title').value,
      description: document.getElementById('event-description').value,
      eventDate: localDateTimeToIso(document.getElementById('event-date').value),
      visibility: document.getElementById('event-visibility').value,
      location: document.getElementById('event-location').value,
      capacity: capacityRaw === '' ? null : Number(capacityRaw),
    };
    callApi('apiAdminCreateEvent', state.sessionToken, payload).then(function (res) {
      setStatus('msg-admin-event', res.message, res.success ? 'success' : 'error');
      if (res.success) { document.getElementById('form-admin-event').reset(); loadAdminEvents(); }
    });
  });

  function loadAdminEvents() {
    callApi('apiAdminListAllEvents', state.sessionToken).then(function (res) {
      if (!res.success) return;
      renderList('admin-events-list', res.events, renderAdminEventItem, 'Nenhum evento cadastrado.');
    });
  }

  function renderAdminEventItem(item) {
    var options = (EVENT_TRANSITIONS[item.status] || []);
    var actions = [];
    if (options.length) {
      var select = h('select', {}, options.map(function (s) { return text('option', EVENT_STATUS_LABELS[s], { value: s }); }));
      actions.push(select);
      actions.push(h('button', {
        onclick: function () {
          callApi('apiAdminUpdateEventStatus', state.sessionToken, item.id, select.value).then(function (res) {
            setStatus('msg-admin-event', res.message, res.success ? 'success' : 'error');
            loadAdminEvents();
          });
        },
      }, ['Atualizar status']));
    }

    var imageInput = h('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', className: 'visually-hidden',
      onchange: function (evt) { uploadAdminEventImage(item.id, evt); },
    }, []);
    actions.push(h('button', { className: 'secondary', onclick: function () { imageInput.click(); } }, [item.image_url ? 'Trocar imagem' : 'Enviar imagem']));
    actions.push(imageInput);

    var children = [];
    if (item.image_url) {
      children.push(h('img', {
        className: 'event-image', src: item.image_url, alt: item.title,
        onclick: function () { openImageLightbox(item.image_url, item.title); },
      }));
    }
    children.push(text('h4', item.title));
    var adminMeta = [
      h('span', { className: 'badge' + (item.status === 'in_progress' ? ' in-progress' : '') }, [EVENT_STATUS_LABELS[item.status] || item.status]),
      text('span', 'Data: ' + formatDate(item.event_date)),
      text('span', 'Inscritos: ' + item.registered_count + (item.capacity ? '/' + item.capacity : '')),
    ];
    if (item.location) adminMeta.push(text('span', 'Local: ' + item.location));
    children.push(h('div', { className: 'meta-row' }, adminMeta));
    children.push(h('div', { className: 'actions-row' }, actions));

    return h('article', { className: 'list-item' }, children);
  }

  function uploadAdminEventImage(eventId, evt) {
    var file = evt.target.files && evt.target.files[0];
    if (!file) return;

    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(file.type) === -1) {
      setStatus('msg-admin-event', 'Formato não suportado. Use JPEG, PNG, WEBP ou GIF.', 'error');
      return;
    }
    if (file.size > MAX_EVENT_IMAGE_FILE_BYTES) {
      setStatus('msg-admin-event', 'Imagem muito grande (máximo 5MB).', 'error');
      return;
    }

    setStatus('msg-admin-event', 'Enviando imagem...', 'info');
    readFileAsBase64(file).then(function (base64) {
      return callApi('apiAdminUploadEventImage', state.sessionToken, eventId, base64, file.type);
    }).then(function (res) {
      setStatus('msg-admin-event', res.message, res.success ? 'success' : 'error');
      if (res.success) loadAdminEvents();
    }).catch(function (err) {
      setStatus('msg-admin-event', err.message, 'error');
    });
  }

  // ===========================================================================
  // Administração — propostas
  // ===========================================================================
  function loadAdminProposals() {
    callApi('apiAdminListProposalsForReview', state.sessionToken).then(function (res) {
      if (!res.success) return;
      renderList('admin-proposals-list', res.proposals, renderAdminProposalItem, 'Nenhuma proposta cadastrada.');
    });
  }

  function renderAdminProposalItem(item) {
    var resultsBox = h('p', { className: 'status-msg' }, []);
    var actions = [
      h('button', {
        className: 'secondary',
        onclick: function () {
          callApi('apiGetProposalResults', state.sessionToken, item.id).then(function (res) {
            if (!res.success) { resultsBox.textContent = res.message; return; }
            if (res.results) {
              resultsBox.textContent = 'Sim: ' + res.results.yes + ' | Não: ' + res.results.no + ' | Comentários: ' + res.results.complement;
            } else {
              resultsBox.textContent = 'Resultados ainda não disponíveis.';
            }
          });
        },
      }, ['Ver resultados']),
    ];

    if (item.status === 'submitted') {
      actions.push(h('button', {
        onclick: function () { transitionProposal(item.id, 'approved', null); },
      }, ['Aprovar']));
      actions.push(h('button', {
        className: 'danger',
        onclick: function () {
          openConfirm('Rejeitar a proposta "' + item.title + '"?', function () { transitionProposal(item.id, 'rejected', null); });
        },
      }, ['Rejeitar']));
    } else if (item.status === 'approved') {
      var opensInput = h('input', { type: 'datetime-local' });
      var closesInput = h('input', { type: 'datetime-local' });
      actions.push(h('label', {}, ['Abre em: ', opensInput]));
      actions.push(h('label', {}, ['Fecha em: ', closesInput]));
      actions.push(h('button', {
        onclick: function () {
          transitionProposal(item.id, 'voting_open', {
            votingOpensAt: localDateTimeToIso(opensInput.value),
            votingClosesAt: localDateTimeToIso(closesInput.value),
          });
        },
      }, ['Abrir votação']));
    } else if (item.status === 'voting_open') {
      actions.push(h('button', {
        className: 'danger',
        onclick: function () {
          openConfirm('Encerrar a votação da proposta "' + item.title + '"?', function () { transitionProposal(item.id, 'voting_closed', null); });
        },
      }, ['Encerrar votação']));
    }

    return h('article', { className: 'list-item' }, [
      text('h4', item.title),
      text('p', item.description),
      h('div', { className: 'meta-row' }, [
        h('span', { className: 'badge' }, [proposalStatusLabel(item.status)]),
        text('span', 'Autor: ' + (item.author_name || 'Indisponível')),
        text('span', 'Enviada em: ' + formatDate(item.created_at)),
      ]),
      h('div', { className: 'actions-row' }, actions),
      resultsBox,
    ]);
  }

  function transitionProposal(id, newStatus, extra) {
    callApi('apiAdminTransitionProposal', state.sessionToken, id, newStatus, extra).then(function () {
      loadAdminProposals();
    });
  }

  // ===========================================================================
  // Administração — tarefas
  // ===========================================================================
  var TASK_TRANSITIONS = { draft: ['published'], published: ['completed', 'archived'], completed: ['archived'], archived: [] };
  var TASK_STATUS_LABELS = { draft: 'Rascunho', published: 'Publicada', completed: 'Concluída', archived: 'Arquivada' };

  document.getElementById('form-admin-task').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var payload = {
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-description').value,
      dueDate: localDateTimeToIso(document.getElementById('task-due').value),
    };
    callApi('apiAdminCreateTask', state.sessionToken, payload).then(function (res) {
      setStatus('msg-admin-task', res.message, res.success ? 'success' : 'error');
      if (res.success) { document.getElementById('form-admin-task').reset(); loadAdminTasks(); }
    });
  });

  function loadAdminTasks() {
    callApi('apiAdminListAllTasks', state.sessionToken).then(function (res) {
      if (!res.success) return;
      renderList('admin-tasks-list', res.tasks, renderAdminTaskItem, 'Nenhuma tarefa cadastrada.');
    });
  }

  function renderAdminTaskItem(item) {
    var options = TASK_TRANSITIONS[item.status] || [];
    var actions = [];
    if (options.length) {
      var select = h('select', {}, options.map(function (s) { return text('option', TASK_STATUS_LABELS[s], { value: s }); }));
      actions.push(select);
      actions.push(h('button', {
        onclick: function () {
          callApi('apiAdminUpdateTaskStatus', state.sessionToken, item.id, select.value).then(function (res) {
            setStatus('msg-admin-task', res.message, res.success ? 'success' : 'error');
            loadAdminTasks();
          });
        },
      }, ['Atualizar status']));
    }

    return h('article', { className: 'list-item' }, [
      text('h4', item.title),
      h('div', { className: 'meta-row' }, [
        h('span', { className: 'badge' }, [TASK_STATUS_LABELS[item.status] || item.status]),
        text('span', 'Prazo: ' + formatDate(item.due_date)),
        text('span', 'Adesões: ' + item.signup_count),
      ]),
      h('div', { className: 'actions-row' }, actions),
    ]);
  }

  // ===========================================================================
  // Administração — feedback
  // ===========================================================================
  function loadAdminFeedback(page) {
    callApi('apiAdminListFeedback', state.sessionToken, { page: page }).then(function (res) {
      if (!res.success) return;
      renderList('admin-feedback-list', res.feedback, function (item) {
        return h('article', { className: 'list-item' }, [
          text('p', item.message),
          h('div', { className: 'meta-row' }, [
            text('span', 'De: ' + (item.author_name || 'Anônimo')),
            text('span', formatDate(item.created_at)),
          ]),
        ]);
      }, 'Nenhum feedback recebido ainda.');
    });
  }

  // ===========================================================================
  // Administração — auditoria
  // ===========================================================================
  var AUDIT_ACTION_LABELS = {
    REGISTER: 'Cadastro', CONFIRM_EMAIL: 'Confirmação de e-mail', LOGIN: 'Login', LOGOUT: 'Logout',
    REQUEST_PASSWORD_RESET: 'Solicitação de redefinição de senha', CONFIRM_PASSWORD_RESET: 'Redefinição de senha confirmada',
    UPDATE_PROFILE: 'Atualização de perfil', UPDATE_AVATAR: 'Atualização de avatar', UPDATE_PREFERENCES: 'Atualização de preferências',
    SUBMIT_FEEDBACK: 'Envio de feedback', REGISTER_EVENT: 'Inscrição em evento', SUBMIT_PROPOSAL: 'Envio de proposta',
    CAST_VOTE: 'Voto registrado', TRANSITION_PROPOSAL: 'Mudança de status de proposta', SIGNUP_TASK: 'Adesão a tarefa',
    COMPLETE_TASK: 'Tarefa concluída', COMMENT_TASK: 'Comentário em tarefa', CREATE_EVENT: 'Criação de evento',
    UPDATE_EVENT_STATUS: 'Mudança de status de evento', UPDATE_EVENT_IMAGE: 'Imagem de evento atualizada',
    CREATE_TASK: 'Criação de tarefa', UPDATE_TASK_STATUS: 'Mudança de status de tarefa',
    CHANGE_USER_ROLE: 'Alteração de papel de usuário', BAN_USER: 'Banimento de conta', UNBAN_USER: 'Reativação de conta',
  };

  var adminAuditState = { action: '', result: '' };

  (function populateAuditActionFilter() {
    var select = document.getElementById('audit-filter-action');
    if (!select) return;
    Object.keys(AUDIT_ACTION_LABELS).sort().forEach(function (action) {
      select.appendChild(text('option', AUDIT_ACTION_LABELS[action], { value: action }));
    });
  })();

  document.getElementById('form-audit-filter').addEventListener('submit', function (evt) {
    evt.preventDefault();
    adminAuditState.action = document.getElementById('audit-filter-action').value;
    adminAuditState.result = document.getElementById('audit-filter-result').value;
    loadAdminAudit(1);
  });

  function loadAdminAudit(page) {
    callApi('apiAdminListAuditLogs', state.sessionToken, { page: page, action: adminAuditState.action, result: adminAuditState.result }).then(function (res) {
      if (!res.success) return;
      renderList('admin-audit-list', res.logs, function (log) {
        return h('article', { className: 'list-item' }, [
          h('div', { className: 'meta-row' }, [
            h('span', { className: 'badge' + (log.result === 'failure' ? ' banned' : '') }, [AUDIT_ACTION_LABELS[log.action] || log.action]),
            text('span', 'Ator: ' + (log.actor_name || 'Sistema/Desconhecido')),
            text('span', formatDate(log.created_at)),
          ]),
        ]);
      }, 'Nenhum registro de auditoria.');
      renderPagination('admin-audit-pagination', res.page, res.pageSize, res.total, loadAdminAudit);
    });

    loadAdminErrorLogs(page);
  }

  function renderErrorLogItem(log) {
    return h('article', { className: 'list-item' }, [
      h('div', { className: 'meta-row' }, [h('span', { className: 'badge banned' }, [log.code]), text('span', formatDate(log.created_at))]),
      text('p', log.message),
    ]);
  }

  function loadAdminErrorLogs(page) {
    callApi('apiAdminListErrorLogs', state.sessionToken, { page: page }).then(function (res) {
      if (!res.success) return;
      renderList('admin-error-list', res.logs, renderErrorLogItem, 'Nenhum erro técnico registrado.');
      renderPagination('admin-error-pagination', res.page, res.pageSize, res.total, loadAdminErrorLogs);
    });
  }

  // ===========================================================================
  // Inicialização — deep link (?mode=confirm|reset&token=...) lido direto da
  // URL, já que este site estático não tem template de servidor para injetar
  // esses valores. Nunca vai parar em HTML, só é usado como argumento de
  // fetch(), então não existe risco de XSS aqui mesmo sem escaping.
  // ===========================================================================
  function readDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var mode = params.get('mode') || '';
    var token = params.get('token') || '';
    return {
      mode: mode === 'confirm' || mode === 'reset' ? mode : '',
      token: token,
    };
  }

  (function init() {
    var deepLink = readDeepLink();
    window.APP_DEEP_LINK_MODE = deepLink.mode;
    window.APP_DEEP_LINK_TOKEN = deepLink.token;

    if (deepLink.mode === 'confirm' && deepLink.token) {
      setStatus('msg-login', 'Confirmando seu e-mail...', 'info');
      callApi('apiConfirmEmail', deepLink.token).then(function (res) {
        setStatus('msg-login', res.message, res.success ? 'success' : 'error');
      });
      showPublicScreen('screen-welcome');
      return;
    }

    if (deepLink.mode === 'reset' && deepLink.token) {
      callApi('apiValidateResetToken', deepLink.token).then(function (res) {
        if (!res.success) {
          setStatus('msg-reset', res.message, 'error');
          document.getElementById('reset-password').disabled = true;
          document.getElementById('reset-password-confirm').disabled = true;
        }
      });
      showPublicScreen('screen-reset');
      return;
    }

    // Restaura a sessão do cache local (até 30min), se houver uma válida —
    // o servidor SEMPRE revalida de verdade via apiGetMyProfile antes de
    // confiar em qualquer coisa salva no navegador.
    var cached = readSessionCache();
    if (cached) {
      state.sessionToken = cached.token;
      callApi('apiGetMyProfile', cached.token).then(function (res) {
        if (!res.success) {
          clearSessionCache();
          state.sessionToken = null;
          showPublicScreen('screen-welcome');
          return;
        }
        state.profile = { fullName: res.profile.fullName, role: res.profile.role };
        scheduleSessionExpiry(cached.expiresAt);
        enterApp();
      });
      return;
    }

    showPublicScreen('screen-welcome');
  })();
})();
