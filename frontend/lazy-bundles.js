/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Carga sob demanda (MOB-04): o código do painel admin e o da Guia (assistente)
// não entram mais no carregamento inicial. Cada pacote (bundle) é uma lista
// ORDENADA de scripts do próprio site, injetados como <script src> (a CSP já
// permite 'self'; nada de inline) com async=false, o que garante a execução na
// ordem da lista mesmo baixando em paralelo.
//
//  - admin: carregado quando um painel administrativo abre (app.js);
//  - destaques: carregado quando a flag highlights_enabled está ligada (Início) ou a tela de gestão abre (app.js);
//  - entradaV2: carregado quando a flag entrada_v2_enabled está ligada e a pessoa não está logada (app.js);
//  - inicio3: carregado quando a flag home_v2_enabled está ligada (Início v3 e Meu desempenho no Perfil; app.js);
//  - eventos2: carregado quando a flag events_v2_enabled está ligada e a tela Eventos abre (app.js);
//  - perfil2: carregado quando a flag profile_v2_enabled está ligada e o Perfil abre (app.js);
//  - novidades: carregado após o login (uma vez por versão) ou ao abrir "Ver novidades" no Perfil;
//  - lia: carregado logo após o login e, para quem só visita, quando o navegador
//    fica ocioso depois do evento load (fora do caminho crítico).
// Cada pacote é carregado uma única vez; se falhar (sem rede e sem cache), a
// promessa é recusada e uma próxima tentativa baixa de novo.
// A lista abaixo é a ÚNICA fonte de verdade: build.js copia os arquivos para
// dist/ e o teste lazy-bundles.test.mjs confere que todos existem e que nenhum
// ficou também no index.html nem no PRECACHE do sw.js.
(function (root) {
  'use strict';

  var BUNDLES = {
    admin: [
      'admin-ai.js', 'admin-moderation.js', 'admin-usage.js', 'selection-admin.js', 'privacy-admin.js',
      'admin-library-extras.js', 'admin-library-publicar.js', 'admin-library-lote.js', 'admin-library.js',
      'admin-roles.js',
    ],
    // Destaques da Liga: bloco "Na Liga" da Início (flag highlights_enabled) e a tela de gestão (home.curate).
    destaques: ['highlights.js', 'highlights-manage.js'],
    // Mentoria (ROL-04): tela Mentoria do menu Participação (flag mentoring_enabled); baixa só ao abrir a tela.
    mentoria: ['mentoring.js'],
    // Entrada v2 (flag entrada_v2_enabled): tela de abertura de quem não está logado; o CSS é injetado pelo próprio script.
    entradaV2: ['entrada-v2.js'],
    // Início v3: tela nova e navegação responsiva, só com a flag home_v2_enabled ligada (app.js).
    inicio3: ['home-v3.js'],
    // Eventos v2: tela Eventos nova, só com a flag events_v2_enabled ligada (app.js; docs/eventos-v2.md).
    eventos2: ['events-v2.js'],
    // Perfil v2: reorganiza o Perfil de sempre (cabeçalho, colunas e seções recolhíveis), só com a flag profile_v2_enabled ligada (app.js).
    perfil2: ['profile-v2.js'],
    // Novidades (ENG-07): aviso uma vez por versão no login e "Ver novidades" no Perfil. O estilo do diálogo
    // (laift-dialog.css) vem no index.html; aqui só o script.
    novidades: ['modulos/shared/laift-dialog.js', 'whats-new.js'],
    lia: [
      'modulos/shared/lia/lia-art.js', 'modulos/shared/lia/lia-states.js', 'modulos/shared/lia/lia-mood.js',
      'assistant-mood-glue.js', 'modulos/shared/lia/lia-anim.js', 'modulos/shared/lia/lia-props.js',
      'modulos/shared/lia/lia-scenes.js', 'modulos/shared/lia/lia.js', 'assistant-feedback.js',
      'assistant-research.js', 'assistant-moderation.js', 'assistant-hints.js', 'assistant-typing.js',
      'assistant-drag.js', 'assistant-suggestions.js', 'assistant-turnstile.js', 'assistant.js',
    ],
  };

  /** Espera de ociosidade para quem só visita (a Guia sobe depois do load, sem disputar a primeira pintura). */
  var IDLE_TIMEOUT_MS = 3000;

  /** Cria um carregador ligado a um documento (a página usa o real; os testes usam um falso). */
  function createLoader(doc, bundles) {
    var pending = {};

    function inject(src) {
      return new Promise(function (resolve, reject) {
        var script = doc.createElement('script');
        script.src = src;
        script.async = false; // ordem de execução = ordem de inserção
        script.onload = function () { resolve(src); };
        script.onerror = function () { reject(new Error('Falha ao carregar ' + src)); };
        (doc.body || doc.head || doc.documentElement).appendChild(script);
      });
    }

    function load(name) {
      var list = bundles[name];
      if (!list) return Promise.reject(new Error('Pacote desconhecido: ' + name));
      if (!pending[name]) {
        pending[name] = Promise.all(list.map(inject)).then(function () { return name; }, function (err) {
          delete pending[name]; // permite tentar de novo (rede voltou)
          throw err;
        });
      }
      return pending[name];
    }

    function isRequested(name) { return !!pending[name]; }

    return { load: load, isRequested: isRequested };
  }

  /** Roda fn quando o navegador estiver ocioso (com teto de tempo); sem requestIdleCallback, usa setTimeout. */
  function whenIdle(win, fn) {
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    else win.setTimeout(fn, 200);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BUNDLES: BUNDLES, IDLE_TIMEOUT_MS: IDLE_TIMEOUT_MS, createLoader: createLoader, whenIdle: whenIdle };
    return;
  }

  var loader = createLoader(root.document, BUNDLES);
  root.LaiftLazy = { load: loader.load, isRequested: loader.isRequested };

  // Visitante (ou sessão restaurada): a Guia sobe depois da primeira pintura. Quem faz login a pede antes, em app.js.
  function scheduleLia() { whenIdle(root, function () { loader.load('lia').catch(function () { /* sem rede: tenta no login */ }); }); }
  if (root.document.readyState === 'complete') scheduleLia();
  else root.addEventListener('load', scheduleLia);
})(typeof self !== 'undefined' ? self : this);
