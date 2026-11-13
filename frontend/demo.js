/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Modo demonstração (demo.html): abre os módulos de estudo sem conta.
// Faz o papel da plataforma para modulos/shared/laift-identity.js, com uma identidade fictícia
// de visitante. Nada sai do navegador: callLearningApi e submitContentReport respondem
// "precisa de conta" sem chamar a Worker. Sem token, cookie ou telemetria. Nada é gravado no aparelho:
// progresso, erros, missão e preferências dos módulos vão para um armazenamento só em memória
// (modulos/shared/demo-storage.js, exposto em App.demoStorage e aplicado por laift-identity.js),
// que some ao sair da página. A contagem de uso que dispara o convite também vive só na memória.
// A única leitura do localStorage é a limpeza de registros sem dono deixados pela versão antiga da demo.
// ?embed=1 (portfólio do autor): só o módulo, sem cabeçalho; links de cadastro abrem em nova aba.
(function () {
  'use strict';

  var MSG = 'Na demonstração, este recurso precisa de conta. Crie a sua grátis na LAIFT.';
  var IDENTITY = Object.freeze({ fullName: 'Visitante da demonstração', email: '', username: '', role: 'visitor', capabilities: [] });
  var CONVITE_INTERACOES = 20;       // cliques/toques/teclas dentro dos módulos
  var CONVITE_MIN_MS = 90 * 1000;    // e pelo menos 1,5 min de uso
  var AVISO_MS = 9000;
  var CADASTRO = '/#cadastro';

  var embed = new URLSearchParams(location.search).get('embed') === '1';
  if (embed) document.documentElement.classList.add('is-embed');

  function prefersDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  document.documentElement.setAttribute('data-theme', prefersDark() ? 'dark' : 'light');

  // Armazenamento em memória dos módulos (ver demo-storage.js). Nunca toca as chaves das contas.
  var memoria = window.LaiftDemoStorage.createPair();

  // Versões antigas da demo gravavam no aparelho com dono vazio e uma conta herdava esse progresso (F-006).
  // Apaga só o que tem dono vazio; o que pertence a uma conta (dono preenchido) nunca é tocado.
  var CHAVES_ANTIGAS = ['laiftQuizErrors', 'laiftMissao', 'pharmaQuizProgress', 'toxicoQuizProgress'];
  function limparRestosAntigos() {
    CHAVES_ANTIGAS.forEach(function (k) {
      try {
        var raw = window.localStorage.getItem(k);
        if (raw === null) return;
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && !obj.owner) window.localStorage.removeItem(k);
      } catch (e) { /* armazenamento bloqueado ou texto inválido: nada a limpar */ }
    });
  }
  limparRestosAntigos();
  window.addEventListener('pagehide', function () { memoria.clear(); });

  var interacoes = 0;
  var inicioUso = 0;
  var convidou = false;

  function registrarUso() {
    if (convidou) return;
    if (!inicioUso) inicioUso = Date.now();
    interacoes++;
    if (interacoes >= CONVITE_INTERACOES && Date.now() - inicioUso >= CONVITE_MIN_MS) mostrarConvite();
  }

  // Interface mínima que os módulos usam da plataforma (laift-identity.js).
  window.App = Object.freeze({
    isDemo: true,
    demoStorage: memoria,
    getIdentity: function () { return IDENTITY; },
    notifyActivity: registrarUso,
    callLearningApi: function () { return Promise.resolve({ success: false, demo: true, message: MSG }); },
    submitContentReport: function () { return Promise.resolve({ success: false, message: MSG }); },
    getTheme: function () { return prefersDark() ? 'dark' : 'light'; },
    getThemePreference: function () { return 'system'; },
  });

  var intro = document.getElementById('demo-inicio');
  var grid = document.getElementById('demo-modulos');
  var stage = document.getElementById('demo-palco');
  var frameBox = document.getElementById('demo-frame');
  var title = document.getElementById('demo-titulo-modulo');
  var back = document.getElementById('demo-voltar');
  var aviso = document.getElementById('demo-aviso');
  var convite = document.getElementById('demo-convite');
  var mods = (window.LaiftModules && window.LaiftModules.MODULES) || [];

  if (embed) {
    document.querySelectorAll('a[href="' + CADASTRO + '"], a[href="/"]').forEach(function (a) {
      a.href = 'https://laift.com.br' + a.getAttribute('href');
      a.target = '_blank';
      a.rel = 'noopener';
    });
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function openModule(id) {
    var m = window.LaiftModules.byId(id);
    if (!m) return;
    frameBox.textContent = '';
    frameBox.appendChild(el('iframe', { src: m.path, title: m.name, allow: 'fullscreen' }));
    title.textContent = m.name;
    intro.hidden = true;
    stage.hidden = false;
    if (!embed) back.focus();
    if (location.hash !== '#' + id) history.replaceState(null, '', location.search + '#' + id);
  }

  function closeModule() {
    frameBox.textContent = '';
    stage.hidden = true;
    intro.hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
  }
  window.LaiftLearning = Object.freeze({ closeModule: closeModule });

  // Aviso de entrada: lembra que é uma prévia e que a conta é grátis.
  function fecharAviso() { aviso.hidden = true; }
  aviso.querySelector('[data-fechar]').addEventListener('click', fecharAviso);
  setTimeout(fecharAviso, AVISO_MS);

  // Convite depois de algum uso: aparece uma vez por visita.
  function mostrarConvite() {
    convidou = true;
    fecharAviso();
    convite.hidden = false;
    convite.querySelector('a').focus();
  }
  convite.querySelector('[data-fechar]').addEventListener('click', function () { convite.hidden = true; });

  mods.forEach(function (m) {
    var b = el('button', { type: 'button', class: 'demo-card', 'data-id': m.id }, [
      el('span', { class: 'demo-ico', 'aria-hidden': 'true' }, [m.icon]),
      el('strong', {}, [m.name]),
      el('span', { class: 'demo-sub' }, [m.sub]),
      el('span', { class: 'demo-desc' }, [m.desc]),
    ]);
    b.addEventListener('click', function () { openModule(m.id); });
    grid.appendChild(b);
  });
  back.addEventListener('click', closeModule);

  function fromHash() {
    var id = location.hash.replace('#', '');
    if (id) openModule(id);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
