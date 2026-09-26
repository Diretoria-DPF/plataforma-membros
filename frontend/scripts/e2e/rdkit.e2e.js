/**
 * rdkit.e2e.js — prova, sob a CSP real do Estúdio (build em frontend/dist/,
 * navegador de verdade), que o RDKit WASM (religado na Fase 4, Onda 3 —
 * docs/SECURITY.md) realmente inicializa e calcula.
 *
 * Diferente do csp.e2e.js (que só confere que a CSP libera o loader e que o
 * script chegou via jsDelivr, sem pagar o custo do init em todo passe), este
 * cenário:
 *   1. abre o Laboratório → Estúdio pela ponte normal do app (login, módulo,
 *      iframe do estúdio — mesmo caminho de um usuário);
 *   2. aguarda window.__rdkitReady (o mesmo contrato que studio.js usa em
 *      carregarRDKitSobDemanda) e chama initRDKitModule com o locateFile de
 *      studio.js (window.LAIFT_RDKIT_DIST), exatamente como o Estúdio faz;
 *   3. confere get_mol('CCO') (etanol) e um descritor calculado de verdade
 *      (massa exata ~46.04, não uma estimativa heurística);
 *   4. falha em qualquer `securitypolicyviolation` em qualquer frame — a
 *      prova de que 'unsafe-eval' + cdn.jsdelivr.net em connect-src bastam,
 *      sem abrir a CSP mais do que o necessário.
 *
 * Precisa do espelho local do npm (scripts/e2e/cdn-mirror) para servir o
 * @rdkit/rdkit@2026.3.6 real com o SRI conferido pelo navegador. Sem acesso
 * ao npm (ensureMirror() devolve null), o cenário AVISA e pula — como os
 * outros *.e2e.js fazem quando faltam as bibliotecas de CDN.
 */
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

async function instrument(app, pkgs) {
  const violations = [];
  await app.context.exposeBinding('__e2eCspReport', (source, v) => {
    violations.push(Object.assign({ frame: source.frame.url().replace(app.baseUrl, '') }, v));
  });
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try {
        window.__e2eCspReport({
          directive: e.effectiveDirective,
          blocked: e.blockedURI,
          source: String(e.sourceFile || '').split('/').slice(-2).join('/') + ':' + e.lineNumber,
        });
      } catch (err) { /* binding indisponível neste documento */ }
    });
  });
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const url = route.request().url();
    const file = mirror.resolveCdnUrl(pkgs, url);
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return violations;
}

module.exports = async function rdkit() {
  const pkgs = mirror.ensureMirror();
  if (!pkgs) {
    console.log('  (aviso: espelho do npm indisponível — RDKit não pode ser baixado; cenário pulado)');
    return;
  }

  const app = await startApp({ role: 'member' });
  try {
    const violations = await instrument(app, pkgs);
    await app.login();

    const lab = await app.openModule('lab');
    await lab.waitForTimeout(300);
    await lab.click('#btnOpenStudio');
    const studioEl = await lab.waitForSelector('#studioIframe');
    const studio = await studioEl.contentFrame();
    await studio.waitForLoadState('load').catch(() => {});

    // Mesmo contrato que studio.js usa em carregarRDKitSobDemanda(): aguarda
    // window.__rdkitReady e chama initFn com o locateFile de LAIFT_RDKIT_DIST.
    const resultado = await studio.evaluate(() => {
      return Promise.race([
        (window.__rdkitReady || Promise.resolve(null)).then(function (initFn) {
          if (typeof initFn !== 'function') {
            return { ok: false, motivo: 'initRDKitModule indisponível (window.__rdkitReady resolveu null)', bloqueadoPelaCsp: window.LAIFT_RDKIT_BLOQUEADO_PELA_CSP === true };
          }
          return initFn({ locateFile: function (f) { return window.LAIFT_RDKIT_DIST + f; } }).then(function (mod) {
            const mol = mod.get_mol('CCO');
            if (!mol) return { ok: false, motivo: "get_mol('CCO') devolveu null" };
            const desc = JSON.parse(mol.get_descriptors());
            return { ok: true, hasGetMol: typeof mod.get_mol === 'function', exactmw: desc.exactmw, numAtoms: mol.get_num_atoms ? mol.get_num_atoms() : undefined };
          });
        }),
        new Promise(function (resolve) { setTimeout(function () { resolve({ ok: false, motivo: 'timeout de 20s aguardando o RDKit' }); }, 20000); }),
      ]);
    });

    check(!!(resultado && resultado.ok), 'RDKit inicializa no Estúdio sob a CSP real e get_mol/get_descriptors funcionam' + (resultado && !resultado.ok ? ': ' + resultado.motivo : ''));
    if (resultado && resultado.ok) {
      // Etanol (C2H6O): massa exata ≈ 46.0419 — prova que é cálculo de
      // verdade do RDKit, não a estimativa heurística de fallback.
      const mwOk = typeof resultado.exactmw === 'number' && Math.abs(resultado.exactmw - 46.0419) < 0.01;
      check(mwOk, `descritor calculado pelo RDKit bate com o etanol (exactmw=${resultado.exactmw})`);
    }

    const csp = await studio.evaluate(() => window.LAIFT_RDKIT_BLOQUEADO_PELA_CSP);
    check(csp === false, "window.LAIFT_RDKIT_BLOQUEADO_PELA_CSP é false: a CSP do Estúdio libera o RDKit");

    const list = violations.map((v) => `${v.frame} → ${v.directive} ${v.blocked} (${v.source})`);
    check(violations.length === 0, 'nenhuma violação de CSP ao carregar e inicializar o RDKit' + (list.length ? ': ' + [...new Set(list)].join(' | ') : ''));

    const realErrors = app.errors.filter((e) => !/\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner)\b/.test(e));
    check(realErrors.length === 0, 'sem erros de JavaScript ao inicializar o RDKit' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
