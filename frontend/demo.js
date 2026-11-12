/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Modo demonstração (demo.html): abre os módulos de estudo sem conta.
// Faz o papel da plataforma para modulos/shared/laift-identity.js, com uma identidade fictícia
// de visitante. Nada sai do navegador: callLearningApi e submitContentReport respondem
// "precisa de conta" sem chamar a Worker. Sem token, sem cookie, sem telemetria, sem armazenamento.
(function () {
  'use strict';

  var MSG = 'Na demonstração, este recurso precisa de conta. Crie a sua grátis na LAIFT.';
  var IDENTITY = Object.freeze({ fullName: 'Visitante da demonstração', email: '', username: '', role: 'visitor', capabilities: [] });

  function prefersDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }

  document.documentElement.setAttribute('data-theme', prefersDark() ? 'dark' : 'light');

  // Interface mínima que os módulos usam da plataforma (laift-identity.js).
  window.App = Object.freeze({
    getIdentity: function () { return IDENTITY; },
    notifyActivity: function () {},
    callLearningApi: function () { return Promise.resolve({ success: false, demo: true, message: MSG }); },
    submitContentReport: function () { return Promise.resolve({ success: false, message: MSG }); },
    getTheme: function () { return prefersDark() ? 'dark' : 'light'; },
    getThemePreference: function () { return 'system'; },
  });

  var list = document.getElementById('demo-inicio');
  var grid = document.getElementById('demo-modulos');
  var stage = document.getElementById('demo-palco');
  var frameBox = document.getElementById('demo-frame');
  var title = document.getElementById('demo-titulo-modulo');
  var back = document.getElementById('demo-voltar');
  var mods = (window.LaiftModules && window.LaiftModules.MODULES) || [];

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
    list.hidden = true;
    stage.hidden = false;
    back.focus();
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  }

  function closeModule() {
    frameBox.textContent = '';
    stage.hidden = true;
    list.hidden = false;
    history.replaceState(null, '', location.pathname);
  }
  window.LaiftLearning = Object.freeze({ closeModule: closeModule });

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
