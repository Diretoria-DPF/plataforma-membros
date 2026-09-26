/**
 * csp.e2e.js — Content-Security-Policy da plataforma e dos módulos (Fase 4,
 * Onda 2; Onda 3 religou o RDKit do Estúdio). Roda sobre o BUILD
 * (frontend/dist/, com o app.js ofuscado).
 *
 * 1. Estático (Node): toda página HTML publicada tem <meta http-equiv=
 *    "Content-Security-Policy"> ANTES de qualquer script, sem
 *    'unsafe-inline' em script-src (em nenhuma página) e sem 'unsafe-eval'/
 *    'wasm-unsafe-eval' (exceto na ÚNICA exceção documentada abaixo, o
 *    Estúdio — ver `ehPaginaDoEstudio`), com object-src 'none', base-uri
 *    'self', form-action 'self' e frame-src; todo host de <script src>
 *    externo está em script-src (e só o jsDelivr é aceito); nenhum arquivo
 *    do front-end tem handler inline, <script> inline ou innerHTML/
 *    document.write fora de modulos/shared/safe-dom.js.
 * 2. Navegador: percorre a plataforma (membro e admin), todos os módulos com
 *    as interações principais, os pop-ups (crachá, dossiê) e as páginas
 *    estáticas, e FALHA em qualquer evento `securitypolicyviolation` em
 *    qualquer frame.
 *
 * Bibliotecas de CDN: com o espelho local (scripts/e2e/cdn-mirror, instalado
 * do npm na primeira execução) as URLs do jsDelivr são servidas com os bytes
 * do pacote — o navegador confere o SRI de verdade e as bibliotecas rodam
 * sob a CSP (3Dmol cria workers blob:, three carrega o .glb, Chart.js,
 * html5-qrcode, RDKit compila o .wasm com 'unsafe-eval' só no Estúdio...).
 * Sem acesso ao npm, o teste segue com as bibliotecas abortadas e avisa.
 * A inicialização completa do RDKit (get_mol de verdade) é o rdkit.e2e.js.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

const FRONT = path.join(__dirname, '..', '..');
const DIST = path.join(FRONT, 'dist');

const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;

// Exceções documentadas a "sem 'unsafe-eval'/'wasm-unsafe-eval' em nenhuma
// página" (Fase 4, Onda 3 — docs/SECURITY.md):
//  - Estúdio: precisa do RDKit (WASM/embind), que só inicializa com
//    'unsafe-eval' — testado empiricamente com Playwright/Chromium: só
//    'wasm-unsafe-eval' não basta (o embind monta chamadas com `new Function`
//    além de compilar o próprio wasm).
//  - Atlas de Anatomia (anatomia-3d): o DRACOLoader decodifica o body.glb
//    (KHR_draco_mesh_compression) num Worker blob: que só faz
//    WebAssembly.instantiate() do .wasm vendorizado (vendor/draco/) — testado
//    empiricamente: SEM nenhuma palavra-chave o navegador recusa compilar o
//    wasm (CompileError), e só 'wasm-unsafe-eval' (sem 'unsafe-eval') já basta
//    — o decodificador não usa eval/new Function, só WebAssembly.instantiate.
// Nenhuma outra página tem essa exceção, e 'unsafe-inline' continua proibido
// em TODAS elas, inclusive Estúdio e Atlas.
const STUDIO_PAGE = 'modulos/laboratorio/studio/index.html';
const ATLAS_PAGE = 'modulos/anatomia-3d/index.html';
function ehPaginaDoEstudio(rel) {
  return rel.split(path.sep).join('/') === STUDIO_PAGE;
}
function ehPaginaDoAtlas(rel) {
  return rel.split(path.sep).join('/') === ATLAS_PAGE;
}

// ---------------------------------------------------------------------------
// 1. Verificação estática
// ---------------------------------------------------------------------------
function walk(dir, filter, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', 'dist', 'vendor', 'scripts', '.git'].includes(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

function stripComments(text, file) {
  let t = text.replace(/<!--[\s\S]*?-->/g, '');
  if (!file.endsWith('.html')) {
    t = t.replace(/\/\*[\s\S]*?\*\//g, '');
    t = t.replace(/(^|[\s;{}])\/\/.*$/gm, '$1');
  }
  return t;
}

function parsePolicy(content) {
  const out = {};
  content.split(';').map((d) => d.trim()).filter(Boolean).forEach((d) => {
    const [name, ...values] = d.split(/\s+/);
    out[name] = values;
  });
  return out;
}

function staticChecks() {
  const pages = walk(DIST, (f) => f.endsWith('.html'));
  const problems = [];
  for (const file of pages) {
    const rel = path.relative(DIST, file);
    const html = fs.readFileSync(file, 'utf8');
    const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i.exec(html);
    if (!meta) { problems.push(`${rel}: sem <meta> de CSP`); continue; }
    const firstScript = html.search(/<script\b/i);
    if (firstScript !== -1 && firstScript < meta.index) problems.push(`${rel}: há <script> antes da CSP`);
    const p = parsePolicy(meta[1]);
    const script = p['script-src'] || p['default-src'] || [];
    const isStudioPage = ehPaginaDoEstudio(rel);
    const isAtlasPage = ehPaginaDoAtlas(rel);
    if (script.includes("'unsafe-inline'")) problems.push(`${rel}: script-src com 'unsafe-inline'`);
    const evalKeywords = script.filter((s) => s === "'unsafe-eval'" || s === "'wasm-unsafe-eval'");
    if (evalKeywords.length && !isStudioPage && !isAtlasPage) problems.push(`${rel}: script-src com ${evalKeywords.join('/')} (só Estúdio/Atlas podem ter essa exceção)`);
    if (isStudioPage && !script.includes("'unsafe-eval'")) problems.push(`${rel}: Estúdio sem 'unsafe-eval' — RDKit (embind) não inicializa`);
    if (isAtlasPage && script.includes("'unsafe-eval'")) problems.push(`${rel}: Atlas só pode ter 'wasm-unsafe-eval' (não precisa de 'unsafe-eval')`);
    if (isAtlasPage && !script.includes("'wasm-unsafe-eval'")) problems.push(`${rel}: Atlas sem 'wasm-unsafe-eval' — DRACOLoader (WebAssembly) não inicializa`);
    if (script.some((s) => /^https?:\/\//.test(s) && s !== 'https://cdn.jsdelivr.net')) problems.push(`${rel}: script-src com host além do jsDelivr`);
    if (script.includes('*') || script.includes('https:') || script.includes('data:')) problems.push(`${rel}: script-src aberto demais`);
    if ((p['object-src'] || []).join(' ') !== "'none'") problems.push(`${rel}: object-src não é 'none'`);
    if ((p['base-uri'] || []).join(' ') !== "'self'") problems.push(`${rel}: base-uri não é 'self'`);
    if ((p['form-action'] || []).join(' ') !== "'self'") problems.push(`${rel}: form-action não é 'self'`);
    if (!p['frame-src']) problems.push(`${rel}: sem frame-src`);
    if (!p['default-src'] || p['default-src'].join(' ') !== "'self'") problems.push(`${rel}: default-src não é 'self'`);
    const external = [...html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^/"]+)[^"]*"/gi)].map((m) => m[1]);
    external.forEach((host) => { if (!script.includes(host)) problems.push(`${rel}: ${host} fora de script-src`); });
    if (script.includes('https://cdn.jsdelivr.net') && !external.length && !/studio/.test(rel)) problems.push(`${rel}: jsDelivr em script-src sem biblioteca externa`);
  }
  check(pages.length >= 12 && problems.length === 0, `CSP em todas as ${pages.length} páginas publicadas, sem 'unsafe-inline' em nenhuma e sem 'unsafe-eval' fora da exceção única do Estúdio` + (problems.length ? ': ' + problems.join(' | ') : ''));

  // Todo o front-end (fonte), não só os arquivos da Equipe 4.
  const sources = walk(FRONT, (f) => /\.(js|html)$/.test(f) && !/[\\/]data[\\/]/.test(f));
  const bad = { inline: [], inlineScript: [], sink: [], jsUrl: [] };
  for (const file of sources) {
    const rel = path.relative(FRONT, file);
    const text = stripComments(fs.readFileSync(file, 'utf8'), file);
    (text.match(/\son[a-z]+\s*=\s*["'\\]/g) || []).forEach((m) => bad.inline.push(`${rel}: ${m.trim()}`));
    if (file.endsWith('.html')) (text.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).forEach((m) => bad.inlineScript.push(`${rel}: ${m}`));
    // href/src="javascript:..." também é script inline para a CSP.
    (text.match(/(?:href|src|action)\s*=\s*["']\s*javascript:/gi) || []).forEach((m) => bad.jsUrl.push(`${rel}: ${m}`));
    if (!file.endsWith(path.join('shared', 'safe-dom.js'))) {
      (text.match(/\.innerHTML\s*\+?=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/g) || []).forEach((m) => bad.sink.push(`${rel}: ${m}`));
    }
  }
  console.log(`  (estático: ${sources.length} arquivos .js/.html do front-end)`);
  check(bad.inline.length === 0, 'nenhum handler inline (on*="...") em todo o front-end' + (bad.inline.length ? ': ' + bad.inline.slice(0, 5).join(' | ') : ''));
  check(bad.inlineScript.length === 0, 'nenhum <script> inline em todo o front-end' + (bad.inlineScript.length ? ': ' + bad.inlineScript.join(' | ') : ''));
  check(bad.jsUrl.length === 0, 'nenhuma URL javascript: em href/src/action' + (bad.jsUrl.length ? ': ' + bad.jsUrl.join(' | ') : ''));
  check(bad.sink.length === 0, 'nenhum innerHTML/insertAdjacentHTML/document.write fora de shared/safe-dom.js' + (bad.sink.length ? ': ' + bad.sink.slice(0, 5).join(' | ') : ''));
}

// ---------------------------------------------------------------------------
// 2. Navegador
// ---------------------------------------------------------------------------
async function instrument(app, pkgs) {
  const violations = [];
  const served = { ok: [], missing: [] };
  await app.context.exposeBinding('__e2eCspReport', (source, v) => {
    violations.push(Object.assign({ frame: source.frame.url().replace(app.baseUrl, '') }, v));
  });
  // Roda em todo documento (página, iframes, pop-ups) antes dos scripts dele.
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
  // Rotas do contexto registradas depois têm prioridade: o jsDelivr vem do
  // espelho (quando existe); o resto segue a regra do harness (aborta).
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const url = route.request().url();
    const file = pkgs && mirror.resolveCdnUrl(pkgs, url);
    if (!file) { served.missing.push(url); return route.abort(); }
    served.ok.push(url);
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return { violations, served };
}

function report(violations, label) {
  const list = violations.map((v) => `${v.frame} → ${v.directive} ${v.blocked} (${v.source})`);
  check(violations.length === 0, `${label}: nenhuma violação de CSP` + (list.length ? ': ' + [...new Set(list)].join(' | ') : ''));
}

async function memberTour(pkgs) {
  const app = await startApp({ role: 'member' });
  const { violations, served } = await instrument(app, pkgs);
  try {
    await app.login();
    // Todos os painéis da barra inferior (app.js ofuscado, mensageria E2EE...).
    for (const btn of await app.page.$$('#app-nav [data-panel]')) {
      if (await btn.isVisible()) { await btn.click(); await app.page.waitForTimeout(150); }
    }
    await app.showPanel('panel-learn');
    await app.page.click('#btn-learn-credential');
    await app.page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 5000 }).catch(() => {});
    await app.page.click('#learn-credential-close');

    let f = await app.openModule('farmaco');
    await f.click('.topic-btn'); await f.click('#startQuiz'); await f.click('.option');
    await f.waitForTimeout(300);
    const quizLib = await f.evaluate(() => typeof SmilesDrawer !== 'undefined');
    await app.page.click('#learn-back');

    f = await app.openModule('toxico');
    await f.click('.topic-btn'); await f.click('#startQuiz'); await f.click('.option');
    await app.page.click('#learn-back');

    f = await app.openModule('clinica');
    await f.waitForTimeout(300);
    const bed = await f.$('.bed-card button');
    if (bed) { await bed.click(); await f.waitForTimeout(300); }
    await app.page.click('#learn-back');

    f = await app.openModule('lab');
    await f.waitForTimeout(500);
    await f.evaluate(() => { window.setModoVisualizacao('3D'); window.switchRightTab('tabPH'); window.switchRightTab('tabMol'); });
    await f.click('#btnOpenStudio');
    const studio = await (await f.waitForSelector('#studioIframe')).contentFrame();
    await studio.waitForLoadState('load').catch(() => {});
    await studio.waitForSelector('.compound-item', { timeout: 10000 }).catch(() => {});
    const item = await studio.$('.compound-item');
    if (item) { await item.click(); await studio.waitForTimeout(2500); }
    // Superfície VDW: o 3Dmol cria workers a partir de blob: (worker-src).
    await studio.evaluate(() => { try { window.setModelo3D('surface'); } catch (e) { /* 3Dmol ausente */ } });
    await studio.waitForTimeout(1500);
    await studio.click('[data-action="abrirTabelaPeriodica"]');
    await studio.click('#periodicTableModal [data-action="fecharTabelaPeriodica"]');
    // Não chama initRDKitModule() aqui (init pesado, ~poucos segundos): só confere
    // que a CSP libera o loader e que o script chegou via jsDelivr. A inicialização
    // completa (get_mol de verdade) é o rdkit.e2e.js, dedicado a isso.
    const studioLibs = await studio.evaluate(async () => {
      const initFn = await (window.__rdkitReady || Promise.resolve(null)).catch(() => null);
      return {
        mol: typeof $3Dmol !== 'undefined',
        rdkitOff: window.LAIFT_RDKIT_BLOQUEADO_PELA_CSP === true,
        rdkitInitFnDisponivel: typeof initFn === 'function',
      };
    });
    await studio.click('[data-action="retornarAoLaboratorio"]');
    const labLibs = await f.evaluate(() => typeof $3Dmol !== 'undefined' && typeof SmilesDrawer !== 'undefined');
    await app.page.click('#learn-back');

    f = await app.openModule('anatomia');
    await f.waitForTimeout(pkgs ? 4000 : 800);
    const atlas = await f.evaluate(() => ({
      three: typeof THREE !== 'undefined' && typeof THREE.GLTFLoader === 'function',
      chart: typeof Chart !== 'undefined',
      canvas: !!document.querySelector('#canvas-3d-container canvas'),
    }));
    await f.evaluate(() => { window.submeterInformacaoCustom(); window.abrirPdb('4EY7', 'AChE'); });
    await f.waitForTimeout(800);
    await f.evaluate(() => localStorage.setItem('laift_atlas_history', JSON.stringify([{ id: 'e2e', data: '01/01/2026', hora: '10:00', composto: 'Teste', via: 'ORAL', horasAcademicas: 0.5 }])));
    const [dossie] = await Promise.all([app.context.waitForEvent('page'), f.evaluate(() => window.ApiCache.exportarDossiePDF())]);
    await dossie.waitForTimeout(500);
    await dossie.close();
    await app.page.click('#learn-back');

    const [cracha] = await Promise.all([
      app.context.waitForEvent('page'),
      app.page.evaluate(() => window.open('modulos/cracha/index.html?id=7&nome=Ana', '_blank')),
    ]);
    await cracha.waitForLoadState('load');
    await cracha.fill('#photoUrl', 'https://example.org/foto.png');
    await cracha.waitForTimeout(300);
    await cracha.close();

    for (const pageName of ['404.html', 'termos.html', 'privacidade.html']) {
      const pg = await app.context.newPage();
      await pg.goto(app.baseUrl + pageName);
      await pg.waitForTimeout(200);
      await pg.close();
    }
    // "← Voltar" dos termos: volta ao cadastro pelo histórico, sem javascript:.
    {
      const pg = await app.context.newPage();
      await pg.goto(app.baseUrl + 'index.html');
      await pg.goto(app.baseUrl + 'termos.html');
      await pg.click('a[data-history-back]');
      await pg.waitForURL((u) => !/termos\.html/.test(String(u)), { timeout: 5000 }).catch(() => {});
      check(!/termos\.html/.test(pg.url()), 'termos: "← Voltar" volta pelo histórico sob a CSP');
      await pg.close();
    }

    if (pkgs) {
      check(served.missing.length === 0, 'toda URL do jsDelivr pedida existe no pacote npm pinado' + (served.missing.length ? ': ' + served.missing.join(', ') : ''));
      check(quizLib && labLibs && studioLibs.mol && atlas.three && atlas.chart,
        'bibliotecas de CDN carregam com o SRI conferido pelo navegador (SmilesDrawer, 3Dmol, three + GLTFLoader, Chart.js)');
      check(atlas.canvas, 'atlas 3D monta a cena WebGL sob a CSP');
    }
    check(!studioLibs.rdkitOff, "Estúdio: a CSP libera 'unsafe-eval' — RDKit não é mais desativado pela política de segurança");
    if (pkgs) {
      check(studioLibs.rdkitInitFnDisponivel, 'Estúdio: initRDKitModule chega via jsDelivr (espelho) sob a nova CSP');
    }
    report(violations, 'membro (plataforma, 6 módulos, estúdio, pop-ups e páginas estáticas)');
    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'membro: sem erros de JavaScript' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function adminTour(pkgs) {
  const app = await startApp({ role: 'admin' });
  const { violations } = await instrument(app, pkgs);
  try {
    await app.login();
    await app.page.click('#btn-enter-admin-mode');
    for (const btn of await app.page.$$('#app-nav [data-panel]')) {
      if (await btn.isVisible()) { await btn.click(); await app.page.waitForTimeout(200); }
    }
    await app.showPanel('panel-admin-fiscal');
    const fiscal = await (await app.page.waitForSelector('#admin-fiscal-frame-wrap iframe')).contentFrame();
    await fiscal.waitForLoadState('load').catch(() => {});
    await fiscal.waitForTimeout(500);
    if (pkgs) {
      check(await app.page.evaluate(() => typeof Chart !== 'undefined'), 'Chart.js do painel admin carrega com SRI (4.5.1, arquivo do pacote npm)');
      check(await fiscal.evaluate(() => typeof Html5QrcodeScanner !== 'undefined'), 'html5-qrcode do terminal fiscal carrega com SRI');
    }
    report(violations, 'admin (painel, gráficos, fiscal e IA)');
    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'admin: sem erros de JavaScript' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function csp() {
  staticChecks();
  const pkgs = mirror.ensureMirror();
  if (!pkgs) console.log('  (aviso: espelho do npm indisponível — bibliotecas de CDN abortadas; SRI e execução delas não verificados)');
  await memberTour(pkgs);
  await adminTour(pkgs);
};
