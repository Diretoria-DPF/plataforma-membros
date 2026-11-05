/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * learning.js
 * Área "Aprender" — hub do ecossistema de aprendizagem LAIFT dentro da
 * Plataforma de Membros (unificação com o antigo repositório o-bala-vip,
 * ver docs/PLANO_UNIFICACAO_LAIFT.md).
 *
 * Os módulos (quiz, toxicologia, clínica, laboratório, anatomia 3D e o
 * terminal fiscal do modo admin) vivem em frontend/modulos/ como páginas
 * autônomas e abrem aqui num <iframe> da MESMA origem: isso isola o CSS e os
 * globais de cada módulo (cada um tem seu próprio :root, reset, .btn etc.)
 * sem reescrevê-los agora, e ainda deixa cada um herdar a identidade da
 * plataforma via modulos/shared/laift-identity.js → window.App.getIdentity().
 *
 * Usa só a ponte window.App (h, text, clearEl, setStatus) — nunca innerHTML
 * com dado dinâmico, mesma regra do resto do front-end (docs/SECURITY.md).
 */
(function () {
  'use strict';

  // Recomeço do zero (decisão do responsável: métricas zeradas, sem importar
  // o histórico da planilha do Apps Script). O antigo o-bala-vip rodava neste
  // mesmo domínio, então navegadores de quem o usou ainda guardam:
  //  - laift_student_session: matrícula/CPF, e-mail e o token do Apps Script
  //    desativado — dado pessoal sem uso nenhum, precisa sair;
  //  - métricas locais antigas (casos concluídos, simulados em andamento,
  //    histórico de simulações que alimenta o dossiê de horas).
  // Roda UMA vez por navegador (marcador laift_reset_v1). Preferências,
  // favoritos e anotações do estúdio são conteúdo da pessoa e ficam.
  // As chaves de progresso são as MESMAS que os módulos novos usam, e isso
  // é seguro: a limpeza roda aqui, na página da plataforma, antes de qualquer
  // módulo abrir neste navegador (é a plataforma que os abre), então o que
  // houver nelas nesse momento só pode ter vindo do sistema antigo.
  (function resetLegacyLocalData() {
    var MARKER = 'laift_reset_v1';
    var LEGACY_KEYS = ['laift_student_session', 'laift_resolved_cases', 'pharmaQuizProgress', 'toxicoQuizProgress', 'laift_atlas_history'];
    try {
      if (localStorage.getItem(MARKER)) return;
      LEGACY_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      localStorage.setItem(MARKER, String(Date.now()));
    } catch (err) {
      // localStorage indisponível (modo privado etc.): nada a limpar.
    }
  })();

  // Nomes, ícones, descrições e caminhos vêm do catálogo único (modulos/catalogo.js, TRA-13/16): o mesmo nome
  // aparece no Aprender, na Início v3 e na Guia. STATS_MODULE_LABELS usa as chaves como a Worker as agrega
  // (learning_attempts.module).
  var CATALOG = window.LaiftModules;
  var STATS_MODULE_LABELS = CATALOG.MODULES.map(function (m) { return [m.stat, m.name]; });
  var STAT_IDS = ['learn-stat-accuracy', 'learn-stat-answered', 'learn-stat-sims', 'learn-stat-cases', 'learn-stat-lab'];

  var MODULES = CATALOG.MODULES.map(function (m) {
    return { id: m.id, icon: m.icon, title: m.name, path: m.path, desc: m.desc, tags: m.tags.slice() };
  });

  var FISCAL_PATH = 'modulos/fiscal/index.html';

  // Um iframe por módulo, criado na primeira abertura e mantido escondido ao
  // voltar ao hub — preserva o progresso (questão atual, leito aberto, cena
  // 3D) enquanto a pessoa navega pela plataforma, como no hub antigo.
  var frames = {};
  var activeModuleId = null;
  var openerCard = null; // cartão que abriu o módulo (o foco volta para ele)
  var hubRendered = false;
  var statsRequestId = 0;

  function app() { return window.App; }
  function $(id) { return document.getElementById(id); }

  // ===========================================================================
  // Hub
  // ===========================================================================
  function renderHub() {
    if (hubRendered) return;
    var A = app();
    var grid = $('learn-modules');
    A.clearEl(grid);
    MODULES.forEach(function (mod) {
      grid.appendChild(A.h('button', {
        type: 'button', className: 'learn-card', 'data-module': mod.id,
        onclick: function () { openModule(mod.id); },
      }, [
        A.text('span', mod.icon, { className: 'learn-card-icon', 'aria-hidden': 'true' }),
        A.text('strong', mod.title, { className: 'learn-card-title' }),
        A.text('span', mod.desc, { className: 'learn-card-desc' }),
        A.h('span', { className: 'learn-card-tags' }, mod.tags.map(function (t) {
          return A.text('span', t, { className: 'badge' });
        })),
      ]));
    });
    $('learn-back').addEventListener('click', closeModule);
    $('learn-fullscreen').addEventListener('click', toggleFullscreen);
    hubRendered = true;
  }

  function setStat(id, value) {
    $(id).textContent = value === null || value === undefined ? '—' : String(value);
  }

  function formatPct(value) {
    return value === null || value === undefined ? '—' : value + '%';
  }

  /** Desempenho por módulo: tentativas + barra de aproveitamento (DOM seguro). */
  function renderByModule(byModule) {
    var A = app();
    var box = $('learn-by-module');
    A.clearEl(box);
    STATS_MODULE_LABELS.forEach(function (pair) {
      var data = (byModule && byModule[pair[0]]) || { attempts: 0, accuracyPct: null };
      var attempts = Number(data.attempts) || 0;
      var pct = data.accuracyPct === null || data.accuracyPct === undefined ? null : Math.max(0, Math.min(100, Number(data.accuracyPct) || 0));
      var fill = A.h('span', { className: 'learn-module-bar-fill' }, []);
      fill.style.width = (pct === null ? 0 : pct) + '%';
      box.appendChild(A.h('div', { className: 'learn-module-row', 'data-module-stat': pair[0] }, [
        A.text('span', pair[1], { className: 'learn-module-name' }),
        A.text('span', attempts === 1 ? '1 atividade' : attempts + ' atividades', { className: 'learn-module-count' }),
        A.h('span', {
          className: 'learn-module-bar', role: 'img',
          'aria-label': pct === null ? 'Sem nota registrada' : 'Aproveitamento de ' + pct + '%',
        }, [fill]),
        A.text('strong', formatPct(pct), { className: 'learn-module-pct' }),
      ]));
    });
  }

  /** Conquistas calculadas na Worker; aqui só se exibe o estado. */
  function renderBadges(badges) {
    var A = app();
    var list = $('learn-badges');
    A.clearEl(list);
    (badges || []).forEach(function (b) {
      var unlocked = !!b.unlocked;
      list.appendChild(A.h('li', {
        className: 'learn-badge' + (unlocked ? ' unlocked' : ''), 'data-badge': String(b.id || ''),
      }, [
        A.text('span', unlocked ? '🏅' : '🔒', { className: 'learn-badge-icon', 'aria-hidden': 'true' }),
        A.h('span', { className: 'learn-badge-body' }, [
          A.text('strong', b.label || ''),
          A.text('span', b.description || '', { className: 'learn-badge-desc' }),
          A.text('span', unlocked ? 'Desbloqueada' : 'Bloqueada', { className: 'learn-badge-state' }),
        ]),
      ]));
    });
  }

  /**
   * Estatísticas da própria sessão, calculadas pela Worker a partir de
   * learning_attempts (apiLearnGetMyStats): a identidade é a da sessão.
   * O histórico do sistema antigo ainda não foi importado (pendência em
   * docs/FASE_2_DADOS_PRESENCA.md).
   */
  /** aria-busy no bloco de números: ligado durante a busca, sempre removido ao fim. */
  function setStatsBusy(statsBox, busy) {
    if (statsBox && window.LaiftStates) window.LaiftStates.setBusy(statsBox, busy);
  }

  /** Enquanto carrega, os números mostram "…"; nunca o valor da busca anterior. */
  function showStatsPlaceholder(value) {
    STAT_IDS.forEach(function (id) { setStat(id, value); });
  }

  /**
   * Carregando: o skeleton (LaiftStates.createSkeleton) ocupa o lugar do texto. O
   * aviso "Carregando seu desempenho..." fica só para leitor de tela (sr-only) dentro
   * de #learn-status, que é role="status" e anuncia a mudança.
   */
  function showStatsLoadingState(A) {
    A.setStatus('learn-status', '', 'info');
    var status = $('learn-status');
    if (!status) return;
    var srText = document.createElement('span');
    srText.className = 'laift-sr-only';
    srText.textContent = 'Carregando seu desempenho...';
    status.appendChild(srText);
    if (window.LaiftStates) status.appendChild(window.LaiftStates.createSkeleton(document, 3));
  }

  function startStatsLoading(A, statsBox) {
    setStatsBusy(statsBox, true);
    showStatsPlaceholder('…');
    showStatsLoadingState(A);
  }

  function showStatsFailure(A, statsBox, res) {
    setStatsBusy(statsBox, false);
    showStatsPlaceholder('—');
    $('learn-progress').classList.add('hidden');
    A.setStatus('learn-status', (res && res.message) || 'Não foi possível carregar seu desempenho agora. Os módulos continuam disponíveis.', 'error');
  }

  function showStats(A, statsBox, st) {
    setStatsBusy(statsBox, false);
    setStat('learn-stat-accuracy', formatPct(st.accuracyPct));
    setStat('learn-stat-answered', Number(st.questionsAnswered) || 0);
    setStat('learn-stat-sims', Number(st.quizzesCompleted) || 0);
    setStat('learn-stat-cases', Number(st.clinicalCasesCompleted) || 0);
    setStat('learn-stat-lab', Number(st.labFormulations) || 0);
    renderByModule(st.byModule);
    renderBadges(st.badges);
    $('learn-progress').classList.remove('hidden');
    A.setStatus('learn-status', '', null);
  }

  function loadStats() {
    var A = app();
    if (!A || typeof A.callLearningApi !== 'function') return;
    var requestId = ++statsRequestId;
    var statsBox = document.querySelector('#learn-hub .learn-stats');
    startStatsLoading(A, statsBox);
    A.callLearningApi('apiLearnGetMyStats').then(function (res) {
      if (requestId !== statsRequestId) return; // resposta antiga: quem manda agora é a busca mais nova
      if (!res || !res.success || !res.stats) showStatsFailure(A, statsBox, res);
      else showStats(A, statsBox, res.stats);
    }).catch(function () {
      if (requestId !== statsRequestId) return;
      showStatsFailure(A, statsBox, null);
    });
  }

  /** Hub de sempre: números, desempenho por módulo, conquistas e a faixa de sequência e meta. */
  function loadLegacyHub() {
    loadStats();
    if (window.LaiftEngagement) window.LaiftEngagement.refreshHub(app(), document);
  }

  /**
   * Aprender v2 (flag learn_v2_enabled; docs/aprender-v2.md): com a flag ligada o pacote sob demanda "aprender2" monta a
   * tela nova no hub. Sem a flag, ou se o pacote falhar, vale o hub de sempre, idêntico.
   */
  function learnV2On() {
    return document.documentElement.hasAttribute('data-flag-learn-v2-enabled') && !!window.LaiftLazy;
  }

  function loadHub() {
    if (!learnV2On()) { loadLegacyHub(); return; }
    window.LaiftLazy.load('aprender2').then(function () {
      if (window.LaiftLearnV2) return window.LaiftLearnV2.load(app(), document);
      return false;
    }).then(function (mounted) {
      if (mounted === false) loadLegacyHub();
    }, function () {
      if (window.LaiftLearnV2) window.LaiftLearnV2.reset(document);
      loadLegacyHub();
    });
  }

  function loadPanel() {
    renderHub();
    if (!activeModuleId) loadHub();
  }

  // ===========================================================================
  // Visualizador de módulos
  // ===========================================================================
  function findModule(id) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i];
    return null;
  }

  function createFrame(container, path, title, allow) {
    // Tela cheia só pelo atributo allow: com allowfullscreen junto, o
    // navegador avisa "Allow attribute will take precedence" (C9, Onda 3).
    var policy = allow || 'fullscreen';
    if (!/(^|;)\s*fullscreen\b/.test(policy)) policy += '; fullscreen';
    var frame = app().h('iframe', { className: 'learn-frame', src: path, title: title, allow: policy }, []);
    container.appendChild(frame);
    return frame;
  }

  // ---------------------------------------------------------------------------
  // Carregando e erro do módulo (TRA-08): enquanto o iframe não carrega, um esqueleto ocupa o lugar; se der erro,
  // demorar demais ou o navegador mostrar a própria página de erro (offline), aparece a mensagem do app com
  // "Tentar de novo". O estado mora num cartão por cima do iframe, dentro de #learn-frames.
  // ---------------------------------------------------------------------------
  var FRAME_TIMEOUT_MS = 12000;
  var frameStates = {};

  /** Pasta do módulo (ex.: /modulos/quiz/): o iframe carregou "o módulo" se a página dele está nessa pasta. */
  function moduleDir(mod) {
    try { return new URL(mod.path, window.location.href).pathname.replace(/[^/]*$/, ''); } catch (e) { return ''; }
  }

  function frameShowsModule(frame, mod) {
    try {
      var loc = frame.contentWindow && frame.contentWindow.location;
      if (!loc || loc.protocol === 'chrome-error:') return false;
      return loc.pathname.indexOf(moduleDir(mod)) === 0;
    } catch (e) { return false; } // página de erro do navegador (outra origem) ou sem acesso
  }

  function syncFrameStates() {
    Object.keys(frameStates).forEach(function (key) {
      var st = frameStates[key];
      st.overlay.classList.toggle('hidden', key !== activeModuleId || st.status === 'ready');
    });
  }

  function renderFrameState(st, status, message) {
    var A = app();
    st.status = status;
    A.clearEl(st.overlay);
    if (status === 'loading') {
      st.overlay.setAttribute('aria-busy', 'true');
      st.overlay.appendChild(A.text('p', 'Carregando o módulo…', { className: 'learn-frame-state-text' }));
      if (window.LaiftStates) st.overlay.appendChild(window.LaiftStates.createSkeleton(document, 3));
    } else if (status === 'error') {
      st.overlay.removeAttribute('aria-busy');
      st.overlay.appendChild(A.text('p', message, { className: 'learn-frame-state-text' }));
      st.overlay.appendChild(A.h('button', { type: 'button', className: 'learn-frame-retry', onclick: st.retry }, ['Tentar de novo']));
    } else {
      st.overlay.removeAttribute('aria-busy');
    }
    syncFrameStates();
  }

  function frameErrorMessage() {
    return navigator.onLine === false
      ? 'Sem conexão. Conecte-se à internet e tente de novo.'
      : 'Não foi possível abrir este módulo agora. Tente de novo.';
  }

  function trackModuleFrame(id, mod, frame) {
    var st = { status: 'loading', timer: null, overlay: app().h('div', { className: 'learn-frame-state hidden', role: 'status' }, []) };
    function arm() {
      window.clearTimeout(st.timer);
      st.timer = window.setTimeout(function () { renderFrameState(st, 'error', frameErrorMessage()); }, FRAME_TIMEOUT_MS);
    }
    st.retry = function () {
      renderFrameState(st, 'loading');
      arm();
      frame.setAttribute('src', frame.getAttribute('src'));
    };
    frame.addEventListener('load', function () {
      window.clearTimeout(st.timer);
      if (frameShowsModule(frame, mod)) renderFrameState(st, 'ready');
      else renderFrameState(st, 'error', frameErrorMessage());
    });
    frame.addEventListener('error', function () {
      window.clearTimeout(st.timer);
      renderFrameState(st, 'error', frameErrorMessage());
    });
    frameStates[id] = st;
    $('learn-frames').appendChild(st.overlay);
    renderFrameState(st, 'loading');
    arm();
  }

  /** Cria o iframe de um módulo do hub, já com o estado de carregamento/erro. */
  function createModuleFrame(mod, path) {
    var frame = createFrame($('learn-frames'), path, mod.title);
    trackModuleFrame(mod.id, mod, frame);
    return frame;
  }

  /** Link compartilhado (#atlas=<sid>): abre o Atlas já na estrutura (Onda 3.5, C.2). */
  function openAtlasLink(sid) {
    var mod = findModule('anatomia');
    if (!mod || typeof sid !== 'string' || !/^[A-Za-z0-9:_.-]{1,120}$/.test(sid)) return false;
    if (!frames.anatomia) {
      frames.anatomia = createModuleFrame(mod, mod.path + '#sid=' + sid);
    } else {
      try { frames.anatomia.contentWindow.location.hash = 'sid=' + sid; } catch (e) { /* outro domínio: abre sem a estrutura */ }
    }
    openModule('anatomia');
    return true;
  }

  /** Avisa a Guia (assistant-hints.js) que o módulo mudou. Só evento DOM: não altera nada aqui. */
  function emitModuleChange(moduleId) {
    document.dispatchEvent(new CustomEvent('laift:modulechange', { detail: { module: moduleId } }));
  }

  /**
   * A Guia (botão flutuante) sai de cima dos controles do módulo (TRA-05/06/07): com um módulo aberto, ela fica na
   * linha da barra "← Voltar", à direita (ux.css, html[data-learn-module]). Aqui só se mede onde a barra está.
   */
  function placeAssistantForModule(id) {
    var root = document.documentElement;
    if (!id) { root.removeAttribute('data-learn-module'); root.style.removeProperty('--lia-module-top'); return; }
    root.setAttribute('data-learn-module', id);
    var bar = document.querySelector('#learn-viewer .learn-viewer-bar');
    var top = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().top)) : 0;
    root.style.setProperty('--lia-module-top', top + 'px');
  }

  /** Abre o módulo. opts.fromHistory: veio do botão Voltar/Avançar do navegador (não empilha de novo). */
  function openModule(id, opts) {
    var mod = findModule(id);
    if (!mod) return;
    var previousModuleId = activeModuleId;
    activeModuleId = id;
    openerCard = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.learn-card, [data-l2-opener]') : null;
    if (!frames[id]) frames[id] = createModuleFrame(mod, mod.path);
    // TRA-03: o módulo aberto entra na pilha do histórico; o Voltar do navegador/Android o fecha.
    if (!(opts && opts.fromHistory === true) && window.LaiftPanelHistory) window.LaiftPanelHistory.push('panel-learn', id);
    Object.keys(frames).forEach(function (key) {
      frames[key].classList.toggle('hidden', key !== id);
      // Modo imersivo (Onda 1, WP08 — docs/ATLAS_UX_SPEC.md §0/§1): só o
      // Atlas de Anatomia usa quase toda a altura útil (frontend/styles.css
      // .learn-frame-immersive); os demais módulos continuam com a altura
      // padrão calc(100dvh - ...px). Nunca fica em mais de um iframe por
      // vez, e sai de qualquer outro ao trocar de módulo.
      frames[key].classList.toggle('learn-frame-immersive', key === 'anatomia' && key === id);
    });
    // O Atlas ocupa toda a área entre o topo da tela e a barra inferior
    // (styles.css .learn-viewer-immersive) — o cabeçalho da plataforma e as
    // folhas decorativas não disputam espaço com o corpo 3D.
    $('learn-viewer').classList.toggle('learn-viewer-immersive', id === 'anatomia');
    $('learn-viewer-title').textContent = mod.icon + ' ' + mod.title;
    $('learn-hub').classList.add('hidden');
    $('learn-viewer').classList.remove('hidden');
    syncFrameStates();
    window.scrollTo(0, 0);
    placeAssistantForModule(id);
    // Teclado/leitor de tela: o foco vai para "← Módulos" (antes ficava num
    // cartão que acabou de sumir, e o próximo Tab ia para a barra inferior).
    $('learn-back').focus({ preventScroll: true });
    if (previousModuleId !== id) emitModuleChange(id);
  }

  /**
   * "Fazer o primeiro quiz" (ENG-04): abre o simulado de Farmacologia já na primeira questão, sem passar
   * pelo hub. Iframe novo: o módulo lê #primeiro-quiz; iframe já aberto: chama quickStart() (que não
   * interrompe um simulado em andamento).
   */
  function openFirstQuiz() {
    var mod = findModule('farmaco');
    if (!mod) return false;
    if (!frames.farmaco) {
      frames.farmaco = createModuleFrame(mod, mod.path + '#primeiro-quiz');
    } else {
      try { frames.farmaco.contentWindow.LaiftQuiz.quickStart(); } catch (e) { /* ainda carregando ou sem acesso: abre o módulo como está */ }
    }
    openModule('farmaco');
    return true;
  }

  /**
   * "Revisar erros" (A3): abre o módulo e, no Quiz (Farmacologia e Toxicologia), já com a sessão dos erros guardados
   * no aparelho. Iframe novo: o módulo lê #revisar-erros; iframe já aberto: chama reviewMyErrors() (que não
   * interrompe um simulado em andamento). Atlas e Clínica abrem como estão: o aviso de revisão fica dentro deles.
   */
  function startReview(id) {
    var mod = findModule(id);
    if (!mod) return false;
    if (id === 'farmaco' || id === 'toxico') {
      if (!frames[id]) frames[id] = createModuleFrame(mod, mod.path + '#revisar-erros');
      else {
        try { frames[id].contentWindow.LaiftQuiz.reviewMyErrors(); } catch (e) { /* ainda carregando ou sem acesso: abre o módulo como está */ }
      }
    }
    openModule(id);
    return true;
  }

  /**
   * Volta ao hub. Também chamado pelos módulos via LaiftIdentity.backToHub(). Sem opts.fromHistory, desfaz também a
   * entrada do módulo na pilha do histórico (history.back()), para o Voltar do navegador não reabrir o módulo.
   */
  function closeModule(opts) {
    var wasOpen = activeModuleId !== null;
    var popEntry = wasOpen && !(opts && opts.fromHistory === true) && window.LaiftPanelHistory
      && window.LaiftPanelHistory.currentModule() === activeModuleId;
    placeAssistantForModule('');
    syncFrameStatesClosed();
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    if (activeModuleId && frames[activeModuleId]) frames[activeModuleId].classList.remove('learn-frame-immersive');
    activeModuleId = null;
    $('learn-viewer').classList.remove('learn-viewer-immersive');
    $('learn-viewer').classList.add('hidden');
    $('learn-hub').classList.remove('hidden');
    app().showPanelSection('panel-learn');
    if (openerCard && document.contains(openerCard)) openerCard.focus({ preventScroll: true });
    openerCard = null;
    loadHub();
    if (wasOpen) emitModuleChange('');
    if (popEntry) { try { history.back(); } catch (e) { /* sem histórico: o hub já está à vista */ } }
  }

  function syncFrameStatesClosed() {
    Object.keys(frameStates).forEach(function (key) { frameStates[key].overlay.classList.add('hidden'); });
  }

  /** Módulo aberto agora ('' se o hub está à vista). */
  function activeModule() { return activeModuleId || ''; }

  // Esc volta ao hub (coerente com "← Voltar"), a menos que haja diálogo aberto ou a tecla já tenha sido usada.
  document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape' || evt.defaultPrevented || !activeModuleId) return;
    var panel = document.getElementById('panel-learn');
    if (!panel || panel.classList.contains('hidden')) return;
    if (document.querySelector('.modal-overlay:not(.hidden), dialog[open], .lia-panel:not(.hidden)')) return;
    evt.preventDefault();
    closeModule();
  });

  function toggleFullscreen() {
    var frame = activeModuleId && frames[activeModuleId];
    if (!frame || !frame.requestFullscreen) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else frame.requestFullscreen().catch(function () {});
  }

  // O crachá virtual (QR de presença) vive em credential.js (window.LaiftCredential);
  // aqui ele só é fechado ao sair da conta (ver reset()).

  // ===========================================================================
  // Terminal fiscal (modo admin)
  // ===========================================================================
  var fiscalFrame = null;

  function loadFiscalPanel() {
    // camera: leitor de QR Code do check-in (html5-qrcode, getUserMedia).
    if (!fiscalFrame) {
      fiscalFrame = createFrame($('admin-fiscal-frame-wrap'), FISCAL_PATH, 'Terminal fiscal', 'fullscreen; camera');
      fiscalFrame.classList.add('learn-frame-auto');
      fiscalFrame.addEventListener('load', function () { fitFrameToContent(fiscalFrame); });
    }
  }

  /**
   * O terminal fiscal é uma página de formulário (não um "app" de tela
   * cheia como o laboratório): o iframe cresce até a altura do conteúdo e
   * quem rola é a página. Antes a rolagem era DENTRO do iframe, com altura
   * fixa, e no celular o fim do terminal ficava escondido atrás da barra
   * inferior fixa (o padding de .app-main só vale para a rolagem da página).
   */
  function fitFrameToContent(frame) {
    var doc;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    var fit = function () {
      if (!frame.isConnected) return;
      // + bordas do iframe (box-sizing: border-box na plataforma).
      var borders = frame.offsetHeight - frame.clientHeight;
      frame.style.height = Math.max(320, Math.ceil(doc.body.getBoundingClientRect().height) + borders) + 'px';
    };
    fit();
    if (window.ResizeObserver) new window.ResizeObserver(fit).observe(doc.body);
  }

  // ===========================================================================
  // Ciclo de vida
  // ===========================================================================
  /** Chamado pelo app.js quando o perfil completo chega (recarrega se o hub estiver à vista). */
  function onProfileReady() {
    if (!activeModuleId && !$('panel-learn').classList.contains('hidden')) { if (learnV2On()) loadHub(); else loadStats(); }
  }

  /** Logout: descarta todos os iframes (e o estado/identidade que carregam). */
  function reset() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    Object.keys(frames).forEach(function (key) { frames[key].remove(); });
    frames = {};
    if (fiscalFrame) { fiscalFrame.remove(); fiscalFrame = null; }
    activeModuleId = null;
    Object.keys(frameStates).forEach(function (key) { window.clearTimeout(frameStates[key].timer); frameStates[key].overlay.remove(); });
    frameStates = {};
    placeAssistantForModule('');
    statsRequestId++;
    // A busca em voo (se houver) será descartada: não pode deixar aria-busy preso.
    setStatsBusy(document.querySelector('#learn-hub .learn-stats'), false);
    app().setStatus('learn-status', '', null); // tira o skeleton de uma busca cancelada
    if (window.LaiftLearnV2) window.LaiftLearnV2.reset(document);
    if ($('learn-viewer')) {
      $('learn-viewer').classList.remove('learn-viewer-immersive');
      $('learn-viewer').classList.add('hidden');
      $('learn-hub').classList.remove('hidden');
      STAT_IDS.forEach(function (id) { setStat(id, null); });
      app().clearEl($('learn-by-module'));
      app().clearEl($('learn-badges'));
      if ($('learn-engagement')) app().clearEl($('learn-engagement'));
      $('learn-progress').classList.add('hidden');
      if (window.LaiftCredential) window.LaiftCredential.close();
    }
  }

  window.LaiftLearning = {
    loadPanel: loadPanel,
    loadFiscalPanel: loadFiscalPanel,
    openModule: openModule,
    openFirstQuiz: openFirstQuiz,
    startReview: startReview,
    openAtlasLink: openAtlasLink,
    closeModule: closeModule,
    activeModule: activeModule,
    onProfileReady: onProfileReady,
    reset: reset,
  };
})();
