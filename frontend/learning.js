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

  // Backend legado dos módulos (Google Apps Script): métricas, IA da
  // clínica/laboratório e terminal fiscal. ÚNICO lugar com a URL — os módulos
  // a recebem daqui via laift-identity.js. Migração para a Worker na Fase 2.
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXvBYrHBIXNjHYItuq2LXKt1vkmh2m_CME-5aZqkxUJhl7ktJjemuasbvdEweH95k/exec';
  var STATS_TIMEOUT_MS = 20000;

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

  /**
   * Estatísticas do aluno no Apps Script (obterDashboardAluno), indexadas
   * pelo e-mail da conta. Até a Fase 2, quem tinha histórico com matrícula/
   * CPF no sistema antigo pode ver zeros aqui se o Apps Script não resolver
   * o e-mail — ver docs/PLANO_UNIFICACAO_LAIFT.md.
   */
  function loadStats() {
    var identity = app().getIdentity();
    if (!identity || !identity.email) {
      // O e-mail chega com o apiGetMyProfile do login; onProfileReady() chama de novo.
      return;
    }
    var requestId = ++statsRequestId;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, STATS_TIMEOUT_MS);
    app().setStatus('learn-status', 'Carregando seu desempenho...', 'info');

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain evita o preflight CORS, que o Apps Script não responde.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ acao: 'obterDashboardAluno', identificador: identity.email }),
      signal: controller.signal,
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (requestId !== statsRequestId) return;
      if (!data || !data.sucesso || !data.aluno) {
        app().setStatus('learn-status', '', null);
        return;
      }
      setStat('learn-stat-accuracy', (Number(data.aluno.taxaAcertoGeral) || 0) + '%');
      setStat('learn-stat-answered', Number(data.aluno.totalQuestoes) || 0);
      setStat('learn-stat-sims', Number(data.aluno.simuladosConcluidos) || 0);
      app().setStatus('learn-status', '', null);
    }).catch(function () {
      if (requestId !== statsRequestId) return;
      app().setStatus('learn-status', 'Não foi possível carregar seu desempenho agora. Os módulos continuam disponíveis.', 'error');
    }).then(function () { clearTimeout(timer); });
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
    if (!frames[id]) frames[id] = createFrame($('learn-frames'), mod.path, mod.title);
    Object.keys(frames).forEach(function (key) { frames[key].classList.toggle('hidden', key !== id); });
    $('learn-viewer-title').textContent = mod.icon + ' ' + mod.title;
    $('learn-hub').classList.add('hidden');
    $('learn-viewer').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  /** Volta ao hub. Também chamado pelos módulos via LaiftIdentity.backToHub(). */
  function closeModule() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    activeModuleId = null;
    $('learn-viewer').classList.add('hidden');
    $('learn-hub').classList.remove('hidden');
    app().showPanelSection('panel-learn');
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
  // O QR antigo carregava o token OTP do Apps Script (LAIFT:v1:<token>), que
  // deixou de existir com o fim do cadastro próprio; agora é LAIFT:ID:<e-mail>,
  // formato que o check-in do terminal fiscal já aceitava. Gerado localmente
  // (vendor/qrcode-generator.js) — antes a imagem vinha de api.qrserver.com,
  // o que mandaria o e-mail da pessoa para um serviço de terceiros.
  // ===========================================================================
  var qrLibPromise = null;

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
    var identity = app().getIdentity();
    if (!identity || !identity.email) return;
    var img = $('learn-credential-qr');
    img.removeAttribute('src');
    $('learn-credential-name').textContent = identity.fullName || '';
    $('learn-credential-email').textContent = identity.email;
    $('modal-learn-credential').classList.remove('hidden');
    loadQrLib().then(function (qrcode) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      var qr = qrcode(0, 'M');
      qr.addData('LAIFT:ID:' + identity.email);
      qr.make();
      img.src = qr.createDataURL(8, 4);
    }).catch(function () {
      app().setStatus('learn-status', 'Não foi possível gerar o QR Code agora.', 'error');
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
    if (!fiscalFrame) fiscalFrame = createFrame($('admin-fiscal-frame-wrap'), FISCAL_PATH, 'Terminal fiscal', 'fullscreen; camera');
  }

  // ===========================================================================
  // Ciclo de vida
  // ===========================================================================
  /** Chamado pelo app.js quando o perfil completo (com e-mail) chega. */
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
      ['learn-stat-accuracy', 'learn-stat-answered', 'learn-stat-sims'].forEach(function (id) { setStat(id, null); });
      closeCredential();
    }
  }

  window.LaiftLearning = {
    APPS_SCRIPT_URL: APPS_SCRIPT_URL,
    loadPanel: loadPanel,
    loadFiscalPanel: loadFiscalPanel,
    openModule: openModule,
    closeModule: closeModule,
    onProfileReady: onProfileReady,
    reset: reset,
  };
})();
