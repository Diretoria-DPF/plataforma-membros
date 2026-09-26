/**
 * studio-loader.js — carregamento sob demanda do OpenChemLib e do RDKit.
 *
 * Antes era um <script> inline no index.html que buscava as bibliotecas no
 * unpkg/jsDelivr SEM versão (RDKit) e sem verificação de integridade. Agora:
 *   - versões fixas, sempre no jsDelivr (que serve os bytes do pacote npm);
 *   - integrity (SRI) + crossorigin nos <script> injetados: se o CDN servir
 *     outro conteúdo, o navegador recusa;
 *   - o .wasm do RDKit vem da MESMA versão do .js (window.LAIFT_RDKIT_DIST,
 *     usado pelo locateFile em studio.js).
 * Hashes calculados do tarball do npm — ver docs/FASE_4_QUALIDADE.md.
 * Arquivo externo (sem <script> inline) para a CSP da Onda 2.
 */
(function (global) {
  'use strict';

  var OCL = {
    url: 'https://cdn.jsdelivr.net/npm/openchemlib@8.6.0/dist/openchemlib-full.js',
    integrity: 'sha384-uGDLFGKDxSejlsZ5aP+cqrKccw9mRrYPhNcW0/EI8lXb7w+mDoDv+klc5T5xJRbw'
  };
  var RDKIT_VERSION = '2026.3.6';
  var RDKIT_DIST = 'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@' + RDKIT_VERSION + '/dist/';
  var RDKIT = {
    url: RDKIT_DIST + 'RDKit_minimal.js',
    integrity: 'sha384-SEkYzZCyQ/+sB/gjMg6MB1SeXeooxG/gvnDEnpVHmNr1OwbJGvmSUyxg12pxrAxQ'
  };

  global.LAIFT_RDKIT_DIST = RDKIT_DIST;

  /** Injeta um <script> com SRI e espera `ready()` virar verdadeiro. */
  function injetar(lib, ready, rotulo) {
    return new Promise(function (resolve, reject) {
      var s = global.document.createElement('script');
      s.src = lib.url;
      s.integrity = lib.integrity;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        var tentativas = 0;
        var check = setInterval(function () {
          tentativas++;
          if (ready()) {
            clearInterval(check);
            console.log('[' + rotulo + '] ✅ Carregado de ' + lib.url);
            resolve();
          } else if (tentativas >= 20) {
            clearInterval(check);
            reject(new Error(rotulo + ' ausente após o carregamento'));
          }
        }, 100);
      };
      s.onerror = function () { reject(new Error(rotulo + ' indisponível (rede ou integridade)')); };
      global.document.head.appendChild(s);
    });
  }

  // ─── OpenChemLib — LAZY LOADER ─────────────────────────────────────────
  // A biblioteca NÃO é carregada no boot: studio.js chama window.carregarOCL()
  // quando precisa gerar coordenadas 3D (~10 MB a menos na abertura).
  global.__oclPromise = null;
  global.carregarOCL = function () {
    if (global.__oclPromise) return global.__oclPromise;
    global.__oclPromise = injetar(OCL, function () {
      return typeof global.OCL !== 'undefined' && global.OCL.Molecule;
    }, 'OCL Loader').then(function () { return global.OCL; }, function (err) {
      console.warn('[OCL Loader] ❌', err.message);
      throw new Error('OpenChemLib indisponível');
    });
    return global.__oclPromise;
  };

  // ─── RDKit WASM — engine secundária ────────────────────────────────────
  // Resolve com initRDKitModule (ou null, se indisponível) — contrato que
  // studio.js já esperava de window.__rdkitReady.
  //
  // O RDKit (build Emscripten/embind) monta funções com `new Function` ao
  // inicializar — inclusive só para compilar o próprio .wasm — então exige
  // 'unsafe-eval' na CSP da página. Testado empiricamente (Playwright +
  // Chromium, espelho local do pacote npm): com só 'wasm-unsafe-eval' a
  // inicialização quebra ("Refused to evaluate a string as JavaScript");
  // só 'unsafe-eval' sozinho já basta (cobre a compilação do wasm também) —
  // é o mínimo que funciona, e é o que a CSP do Estúdio agora libera (Fase
  // 4, Onda 3 — docs/SECURITY.md), com cdn.jsdelivr.net também em
  // connect-src para o fetch do .wasm (locateFile abaixo/em studio.js).
  // Esta função continua checando a CSP em runtime (em vez de assumir que
  // 'unsafe-eval' está ligado) como cinto-e-suspensório: se algum dia a
  // política desta página voltar a ficar mais restrita, o RDKit degrada
  // sozinho para as estimativas heurísticas em vez de estourar em erro.
  function cspPermiteEval() {
    var meta = global.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!meta) return true;
    var script = /(?:^|;)\s*script-src([^;]*)/.exec(meta.getAttribute('content') || '');
    var fonte = script ? script[1] : ((/(?:^|;)\s*default-src([^;]*)/.exec(meta.getAttribute('content') || '') || [])[1] || '');
    return /'unsafe-eval'/.test(fonte);
  }

  global.LAIFT_RDKIT_BLOQUEADO_PELA_CSP = !cspPermiteEval();
  global.__rdkitReady = global.LAIFT_RDKIT_BLOQUEADO_PELA_CSP
    ? Promise.resolve(null)
    : injetar(RDKIT, function () {
      return typeof global.initRDKitModule === 'function';
    }, 'RDKit Loader').then(function () { return global.initRDKitModule; }, function (err) {
      console.warn('[RDKit Loader] ❌', err.message);
      return null;
    });
  if (global.LAIFT_RDKIT_BLOQUEADO_PELA_CSP) {
    console.info('[RDKit Loader] Desativado pela CSP desta página (exige \'unsafe-eval\'); usando estimativas.');
  }
})(window);
