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

  // Nomes de exibição dos módulos como a Worker os agrega (learning_attempts.module).
  var STATS_MODULE_LABELS = [
    ['farmacologia', 'Farmacologia'],
    ['toxicologia', 'Toxicologia'],
    ['clinica', 'Clínica (casos)'],
    ['laboratorio', 'Laboratório'],
    ['anatomia', 'Anatomia & PK'],
  ];
  var STAT_IDS = ['learn-stat-accuracy', 'learn-stat-answered', 'learn-stat-sims', 'learn-stat-cases', 'learn-stat-lab'];

  var MODULES = [
    {
      id: 'farmaco', icon: '💊', title: 'Farmacologia Básica', path: 'modulos/quiz/index.html',
      desc: 'Mecanismos de ação, farmacocinética clínica, receptores e farmacodinâmica comparada.',
      tags: ['Simulador', '240 questões'],
    },
    {
      id: 'toxico', icon: '🧪', title: 'Toxicologia Clínica & Forense', path: 'modulos/toxicologia/index.html',
      desc: 'Intoxicações agudas, defensivos agrícolas, animais peçonhentos e antídotos.',
      tags: ['OpenFDA', '240 questões'],
    },
    {
      id: 'clinica', icon: '🩺', title: 'Clínica Médica Virtual (OSCE)', path: 'modulos/clinica/index.html',
      desc: 'Plantão multipaciente, acervo da liga, roteiro semiológico e preceptor com IA.',
      tags: ['Preceptor IA', 'Acervo & plantão'],
    },
    {
      id: 'lab', icon: '🔬', title: 'Laboratório Virtual', path: 'modulos/laboratorio/index.html',
      desc: 'Ensaios de bancada, sínteses, identificação de compostos e estúdio molecular 3D.',
      tags: ['Bancada', 'Estúdio 3D'],
    },
    {
      id: 'anatomia', icon: '🧬', title: 'Anatomia & Farmacocinética 3D', path: 'modulos/anatomia-3d/index.html',
      desc: 'Corpo humano 3D, farmacocinética visual e vias metabólicas.',
      tags: ['Simulação PK', 'Atlas 3D'],
    },
  ];

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
    $('btn-learn-credential').addEventListener('click', openCredential);
    $('learn-credential-close').addEventListener('click', closeCredential);
    $('modal-learn-credential').addEventListener('click', function (evt) {
      if (evt.target.id === 'modal-learn-credential') closeCredential();
    });
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
  function loadStats() {
    var A = app();
    if (!A || typeof A.callLearningApi !== 'function') return;
    var requestId = ++statsRequestId;
    var statsBox = document.querySelector('#learn-hub .learn-stats');
    // Estado "carregando" visível (os números pulsam) e anunciado.
    if (statsBox) statsBox.setAttribute('aria-busy', 'true');
    A.setStatus('learn-status', 'Carregando seu desempenho...', 'info');
    A.callLearningApi('apiLearnGetMyStats').then(function (res) {
      if (requestId !== statsRequestId) return;
      if (statsBox) statsBox.removeAttribute('aria-busy');
      if (!res || !res.success || !res.stats) {
        A.setStatus('learn-status', (res && res.message) || 'Não foi possível carregar seu desempenho agora. Os módulos continuam disponíveis.', 'error');
        return;
      }
      var st = res.stats;
      setStat('learn-stat-accuracy', formatPct(st.accuracyPct));
      setStat('learn-stat-answered', Number(st.questionsAnswered) || 0);
      setStat('learn-stat-sims', Number(st.quizzesCompleted) || 0);
      setStat('learn-stat-cases', Number(st.clinicalCasesCompleted) || 0);
      setStat('learn-stat-lab', Number(st.labFormulations) || 0);
      renderByModule(st.byModule);
      renderBadges(st.badges);
      $('learn-progress').classList.remove('hidden');
      A.setStatus('learn-status', '', null);
    });
  }

  function loadPanel() {
    renderHub();
    if (!activeModuleId) loadStats();
  }

  // ===========================================================================
  // Visualizador de módulos
  // ===========================================================================
  function findModule(id) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i];
    return null;
  }

  function createFrame(container, path, title, allow) {
    var frame = app().h('iframe', { className: 'learn-frame', src: path, title: title, allow: allow || 'fullscreen' }, []);
    frame.allowFullscreen = true;
    container.appendChild(frame);
    return frame;
  }

  function openModule(id) {
    var mod = findModule(id);
    if (!mod) return;
    activeModuleId = id;
    openerCard = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.learn-card') : null;
    if (!frames[id]) frames[id] = createFrame($('learn-frames'), mod.path, mod.title);
    Object.keys(frames).forEach(function (key) { frames[key].classList.toggle('hidden', key !== id); });
    $('learn-viewer-title').textContent = mod.icon + ' ' + mod.title;
    $('learn-hub').classList.add('hidden');
    $('learn-viewer').classList.remove('hidden');
    window.scrollTo(0, 0);
    // Teclado/leitor de tela: o foco vai para "← Módulos" (antes ficava num
    // cartão que acabou de sumir, e o próximo Tab ia para a barra inferior).
    $('learn-back').focus({ preventScroll: true });
  }

  /** Volta ao hub. Também chamado pelos módulos via LaiftIdentity.backToHub(). */
  function closeModule() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    activeModuleId = null;
    $('learn-viewer').classList.add('hidden');
    $('learn-hub').classList.remove('hidden');
    app().showPanelSection('panel-learn');
    if (openerCard && document.contains(openerCard)) openerCard.focus({ preventScroll: true });
    openerCard = null;
    loadStats();
  }

  function toggleFullscreen() {
    var frame = activeModuleId && frames[activeModuleId];
    if (!frame || !frame.requestFullscreen) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else frame.requestFullscreen().catch(function () {});
  }

  // ===========================================================================
  // Credencial (QR de presença)
  //
  // Fase 2: o QR carrega a credencial ASSINADA pela Worker
  // (apiLearnGetMyAttendanceQr → LAIFT:v2:<profileId>.<assinatura>), a única
  // que o terminal fiscal aceita por leitura. É gerado localmente
  // (vendor/qrcode-generator.js) — nada vai para serviço de terceiros.
  // Se a Worker não responder, cai para o formato antigo LAIFT:ID:<e-mail>,
  // sem assinatura, avisando: o fiscal então só PREENCHE o e-mail para a
  // presença manual, que o admin confirma — nunca registra direto.
  // ===========================================================================
  var qrLibPromise = null;
  var credentialRequestId = 0;
  var QR_V2_RE = /^LAIFT:v2:[0-9a-f-]{36}\.[A-Za-z0-9_-]{24}$/;
  var CREDENTIAL_NOTE = 'Apresente na portaria para registrar presença em eventos.';
  var CREDENTIAL_NOTE_LEGACY = 'Credencial provisória: não foi possível obter a credencial assinada agora. Na portaria, a presença será confirmada pelo seu e-mail. Tente abrir de novo mais tarde.';

  function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLibPromise) {
      qrLibPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'vendor/qrcode-generator.js';
        s.onload = function () { resolve(window.qrcode); };
        s.onerror = function () { qrLibPromise = null; reject(new Error('qr')); };
        document.head.appendChild(s);
      });
    }
    return qrLibPromise;
  }

  function openCredential() {
    var A = app();
    var identity = A.getIdentity();
    if (!identity) return;
    var requestId = ++credentialRequestId;
    var img = $('learn-credential-qr');
    img.removeAttribute('src');
    img.removeAttribute('data-qr-kind');
    $('learn-credential-name').textContent = identity.fullName || '';
    $('learn-credential-email').textContent = identity.email || '';
    $('learn-credential-note').textContent = 'Gerando sua credencial...';
    $('modal-learn-credential').classList.remove('hidden');

    Promise.all([A.callLearningApi('apiLearnGetMyAttendanceQr'), loadQrLib()]).then(function (results) {
      if (requestId !== credentialRequestId) return;
      var res = results[0];
      var qrcode = results[1];
      var payload = res && res.success && typeof res.qrPayload === 'string' && QR_V2_RE.test(res.qrPayload) ? res.qrPayload : null;
      var kind = payload ? 'v2' : 'legacy';
      if (!payload) {
        if (!identity.email) throw new Error('sem-email');
        payload = 'LAIFT:ID:' + identity.email;
      }
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      var qr = qrcode(0, 'M');
      qr.addData(payload);
      qr.make();
      img.src = qr.createDataURL(8, 4);
      img.setAttribute('data-qr-kind', kind);
      $('learn-credential-note').textContent = kind === 'v2' ? CREDENTIAL_NOTE : CREDENTIAL_NOTE_LEGACY;
    }).catch(function () {
      if (requestId !== credentialRequestId) return;
      A.setStatus('learn-status', 'Não foi possível gerar o QR Code agora.', 'error');
      closeCredential();
    });
  }

  function closeCredential() {
    $('modal-learn-credential').classList.add('hidden');
  }

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
    if (!activeModuleId && !$('panel-learn').classList.contains('hidden')) loadStats();
  }

  /** Logout: descarta todos os iframes (e o estado/identidade que carregam). */
  function reset() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    Object.keys(frames).forEach(function (key) { frames[key].remove(); });
    frames = {};
    if (fiscalFrame) { fiscalFrame.remove(); fiscalFrame = null; }
    activeModuleId = null;
    statsRequestId++;
    if ($('learn-viewer')) {
      $('learn-viewer').classList.add('hidden');
      $('learn-hub').classList.remove('hidden');
      STAT_IDS.forEach(function (id) { setStat(id, null); });
      app().clearEl($('learn-by-module'));
      app().clearEl($('learn-badges'));
      $('learn-progress').classList.add('hidden');
      credentialRequestId++;
      closeCredential();
    }
  }

  window.LaiftLearning = {
    loadPanel: loadPanel,
    loadFiscalPanel: loadFiscalPanel,
    openModule: openModule,
    closeModule: closeModule,
    onProfileReady: onProfileReady,
    reset: reset,
  };
})();
