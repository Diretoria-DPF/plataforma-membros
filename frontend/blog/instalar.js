/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Blog instalável: registra o service worker do blog (/blog-sw.js, escopo
// /blog) e mostra os botões "Instalar o blog" ([data-instalar]).
//  - Android e computador: guarda o beforeinstallprompt e abre o aviso nativo;
//  - iPhone e iPad: sem aviso nativo, abre um diálogo com os três passos
//    (criado só no primeiro clique);
//  - já instalado (modo app): os botões ficam escondidos.
// Arquivo clássico (sem import/export). No Node, exporta as funções puras.
(function (root) {
  'use strict';

  var SELETOR_BOTAO = '[data-instalar]';
  var PASSOS_IOS = [
    'Toque em Compartilhar, o quadrado com a seta, na barra do Safari.',
    'Escolha Adicionar à Tela de Início.',
    'Toque em Adicionar.',
  ];

  var promptNativo = null;
  var dialogoIos = null;
  var botaoEntendi = null;

  function ehIos(nav) {
    var ua = nav.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS 13+ se identifica como Mac; o toque separa de um Mac de verdade.
    return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
  }

  function estaInstalado(win) {
    var modoApp = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
    return !!(modoApp || (win.navigator && win.navigator.standalone));
  }

  function deveRegistrar(env) {
    if (!env.serviceWorker || env.webdriver) return false;
    return env.protocol === 'https:' || env.hostname === 'localhost';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ehIos: ehIos, estaInstalado: estaInstalado, deveRegistrar: deveRegistrar };
    return;
  }

  function botoesInstalar() {
    return document.querySelectorAll(SELETOR_BOTAO);
  }

  function mostrarBotoes(mostrar) {
    Array.prototype.forEach.call(botoesInstalar(), function (botao) { botao.hidden = !mostrar; });
  }

  function criarDialogoIos() {
    var caixa = document.createElement('dialog');
    caixa.className = 'pub-instalar-dialogo';
    caixa.setAttribute('aria-labelledby', 'pub-instalar-t');

    var titulo = document.createElement('h2');
    titulo.id = 'pub-instalar-t';
    titulo.textContent = 'Instalar o blog no iPhone ou iPad';

    var lista = document.createElement('ol');
    PASSOS_IOS.forEach(function (texto) {
      var item = document.createElement('li');
      item.textContent = texto;
      lista.appendChild(item);
    });

    botaoEntendi = document.createElement('button');
    botaoEntendi.type = 'button';
    botaoEntendi.className = 'pub-botao pub-botao--primario';
    botaoEntendi.textContent = 'Entendi';
    botaoEntendi.addEventListener('click', function () { caixa.close(); });

    caixa.appendChild(titulo);
    caixa.appendChild(lista);
    caixa.appendChild(botaoEntendi);
    document.body.appendChild(caixa);
    return caixa;
  }

  function abrirDialogoIos() {
    if (!dialogoIos) dialogoIos = criarDialogoIos();
    if (typeof dialogoIos.showModal === 'function') dialogoIos.showModal();
    else dialogoIos.setAttribute('open', '');
    botaoEntendi.focus();
  }

  function instalarNativo(prompt) {
    promptNativo = null;
    prompt.prompt();
    prompt.userChoice.then(function () { mostrarBotoes(false); });
  }

  function aoClicarInstalar() {
    if (promptNativo) return instalarNativo(promptNativo);
    abrirDialogoIos();
  }

  function registrarServiceWorker() {
    var nav = root.navigator;
    var env = {
      serviceWorker: 'serviceWorker' in nav,
      webdriver: !!nav.webdriver,
      protocol: root.location.protocol,
      hostname: root.location.hostname,
    };
    if (!deveRegistrar(env)) return;
    nav.serviceWorker.register('/blog-sw.js', { scope: '/blog' }).catch(function () {});
  }

  function iniciar() {
    registrarServiceWorker();
    Array.prototype.forEach.call(botoesInstalar(), function (botao) {
      botao.addEventListener('click', aoClicarInstalar);
    });
    if (promptNativo || (ehIos(root.navigator) && !estaInstalado(root))) mostrarBotoes(true);
  }

  root.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    promptNativo = event;
    mostrarBotoes(true);
  });

  root.addEventListener('appinstalled', function () {
    promptNativo = null;
    mostrarBotoes(false);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
