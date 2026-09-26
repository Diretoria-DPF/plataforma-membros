/**
 * fase4.e2e.js — garantias da Fase 4 (Equipe 4: qualidade, design e
 * segurança dos módulos). Duas partes:
 *
 * 1. Verificação estática (Node, sem navegador) dos arquivos da Equipe 4:
 *    nenhum handler inline (on*="..."), nenhum <script> inline, nenhuma
 *    biblioteca externa sem versão fixa + SRI, nenhum innerHTML/
 *    insertAdjacentHTML/document.write fora de shared/safe-dom.js, nenhum
 *    postMessage com alvo '*', nenhum resto do Apps Script.
 * 2. Navegador (celular, 360 × 740): cada módulo sem rolagem horizontal,
 *    tema escuro aplicado por data-theme (como a ponte fará), quizzes e
 *    laboratório registrando o resultado pela ponte window.LaiftApi, e
 *    nenhum erro de JavaScript além das bibliotecas de CDN abortadas.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const MODULOS = path.join(__dirname, '..', '..', 'modulos');

// Arquivos da Equipe 4 (docs/PLANO_FASES_2_3_4.md, "Donos dos arquivos").
const OWNED_DIRS = ['quiz', 'toxicologia', 'anatomia-3d', 'cracha', 'laboratorio'];
const OWNED_SHARED = ['style.css', 'laift-tokens.css', 'quiz-engine.js', 'quiz-engine.css', 'safe-dom.js'];
const NOT_OWNED = [/laboratorio[\\/]js[\\/]lab-preceptor\.js$/];
// Bancos de dados estáticos (só literais de dados, sem DOM) ficam de fora.
const DATA_FILES = /[\\/]data[\\/]/;

// Restos do backend legado (Google Apps Script). Montado por partes para o
// próprio teste não aparecer no `grep` de verificação da remoção.
const LEGACY_BACKEND = new RegExp(['APPS_' + 'SCRIPT', 'script' + '\\.google', 'Api' + 'Service', 'salvarBackupApi', 'registrarMetricasQuiz', 'registrarFormulacaoLab'].join('|'));

// Mesma lista do smoke: globais das bibliotecas de CDN, abortadas de
// propósito no ambiente de teste. Qualquer outro erro é falha.
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;

function listOwnedFiles() {
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(js|html|css)$/.test(name)) out.push(full);
    }
  }
  OWNED_DIRS.forEach((d) => walk(path.join(MODULOS, d)));
  OWNED_SHARED.forEach((f) => out.push(path.join(MODULOS, 'shared', f)));
  return out.filter((f) => !NOT_OWNED.some((re) => re.test(f)) && !DATA_FILES.test(f));
}

/** Remove comentários (HTML e JS/CSS) para não contar exemplos citados neles. */
function stripComments(text, file) {
  let t = text.replace(/<!--[\s\S]*?-->/g, '');
  if (!file.endsWith('.html')) {
    t = t.replace(/\/\*[\s\S]*?\*\//g, '');
    // "//" de comentário (não o de "https://"): início de linha ou após espaço/;{}.
    t = t.replace(/(^|[\s;{}])\/\/.*$/gm, '$1');
  }
  return t;
}

function staticChecks() {
  const files = listOwnedFiles();
  const problems = { inline: [], inlineScript: [], sri: [], sink: [], star: [], appsScript: [] };
  let pinned = 0;
  for (const file of files) {
    const rel = path.relative(MODULOS, file);
    const raw = fs.readFileSync(file, 'utf8');
    const text = stripComments(raw, file);
    if (file.endsWith('.css')) continue;

    (text.match(/\son[a-z]+\s*=\s*["'\\]/g) || []).forEach((m) => problems.inline.push(`${rel}: ${m.trim()}`));

    if (file.endsWith('.html')) {
      (text.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).forEach((m) => problems.inlineScript.push(`${rel}: ${m}`));
      (text.match(/<script\b[^>]*\bsrc=["']https?:\/\/[^>]*>/g) || []).forEach((tag) => {
        const ok = /\bintegrity=["']sha(256|384|512)-/.test(tag) && /\bcrossorigin=["']anonymous["']/.test(tag) && /@\d+\.\d+\.\d+\//.test(tag);
        if (ok) pinned++; else problems.sri.push(`${rel}: ${tag}`);
      });
    }

    if (!file.endsWith(path.join('shared', 'safe-dom.js'))) {
      (text.match(/\.innerHTML\s*\+?=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/g) || []).forEach((m) => problems.sink.push(`${rel}: ${m}`));
    }
    (text.match(/postMessage\([^;]*,\s*['"]\*['"]\s*\)/g) || []).forEach((m) => problems.star.push(`${rel}: ${m}`));
    if (LEGACY_BACKEND.test(text)) problems.appsScript.push(rel);
  }

  // Carregamentos dinâmicos (Estúdio): cada biblioteca com versão e integrity.
  const loader = fs.readFileSync(path.join(MODULOS, 'laboratorio', 'studio', 'studio-loader.js'), 'utf8');
  const dynPinned = /openchemlib@\d+\.\d+\.\d+\//.test(loader) && /RDKIT_VERSION = '\d+\.\d+\.\d+'/.test(loader) &&
    !/jsdelivr\.net\/npm\/[^@'"]+\/dist/.test(loader) && !/unpkg\.com/.test(loader);
  const dynIntegrity = (loader.match(/integrity:\s*'sha384-/g) || []).length;

  console.log(`  (estático: ${files.length} arquivos da Equipe 4; ${pinned} <script> externos pinados com SRI)`);
  check(problems.inline.length === 0, 'nenhum handler inline (on*="...") nos arquivos da Equipe 4' + (problems.inline.length ? ': ' + problems.inline.slice(0, 5).join(' | ') : ''));
  check(problems.inlineScript.length === 0, 'nenhum <script> inline nas páginas da Equipe 4' + (problems.inlineScript.length ? ': ' + problems.inlineScript.join(' | ') : ''));
  check(problems.sri.length === 0 && pinned > 0, 'todo <script src="https://..."> tem versão fixa, integrity e crossorigin' + (problems.sri.length ? ': ' + problems.sri.join(' | ') : ''));
  check(dynPinned && dynIntegrity >= 2, 'bibliotecas carregadas sob demanda no Estúdio (OpenChemLib, RDKit) têm versão fixa e SRI');
  check(problems.sink.length === 0, 'nenhum innerHTML/insertAdjacentHTML/document.write fora de shared/safe-dom.js' + (problems.sink.length ? ': ' + problems.sink.slice(0, 5).join(' | ') : ''));
  check(problems.star.length === 0, "nenhum postMessage com alvo '*'" + (problems.star.length ? ': ' + problems.star.join(' | ') : ''));
  check(problems.appsScript.length === 0, 'nenhum resto do Apps Script nos arquivos da Equipe 4' + (problems.appsScript.length ? ': ' + problems.appsScript.join(', ') : ''));
}

/** Instala no frame um stub de window.LaiftApi que registra as chamadas. */
async function stubLaiftApi(frame) {
  await frame.evaluate(() => {
    window.__laiftCalls = [];
    window.LaiftApi = {
      call(action, input) {
        window.__laiftCalls.push({ action, input });
        return Promise.resolve({ success: true, attemptId: 'e2e-attempt' });
      },
    };
  });
}

async function laiftCalls(frame) {
  return frame.evaluate(() => window.__laiftCalls || []);
}

/** Luminância relativa (WCAG) de "rgb(r, g, b)". */
function luminance(rgb) {
  const m = String(rgb).match(/\d+(\.\d+)?/g);
  if (!m) return 1;
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function bodyBackground(frame) {
  return frame.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    return bg === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : bg;
  });
}

async function setTheme(frame, theme) {
  await frame.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  // Transições de cor (≤ 0,25 s) precisam terminar antes de medir.
  await frame.waitForTimeout(400);
}

function validQuizAttempt(call, module, mode) {
  const i = call && call.input;
  return !!call && call.action === 'apiLearnSubmitQuizAttempt' && !!i && i.module === module && i.mode === mode &&
    Number.isInteger(i.correct) && Number.isInteger(i.total) && i.total > 0 && i.correct >= 0 && i.correct <= i.total &&
    Number.isInteger(i.durationSeconds) && i.durationSeconds >= 1 && Array.isArray(i.topics) && i.topics.length > 0;
}

/** Faz um simulado curto (1 tópico) e devolve as chamadas à ponte. */
async function runQuiz(frame, { mode }) {
  await stubLaiftApi(frame);
  await frame.click('.topic-btn');
  await frame.click(`.mode-btn[data-mode="${mode}"]`);
  await frame.click('#startQuiz');
  await frame.waitForSelector('#quizContainer:not([hidden]) .option');
  await frame.click('.option');
  // Vai até a última questão pelo teclado (→), como faria quem estuda.
  const total = Number(await frame.textContent('#totalQuestions'));
  for (let i = 1; i < total; i++) await frame.press('body', 'ArrowRight');
  await frame.click('#finishBtn');
  await frame.waitForSelector('#resultsContainer:not([hidden]) .score-display');
  await frame.waitForFunction(() => (window.__laiftCalls || []).length > 0, null, { timeout: 3000 }).catch(() => {});
  return laiftCalls(frame);
}

module.exports = async function fase4() {
  staticChecks();

  const app = await startApp({ role: 'member', viewport: { width: 360, height: 740 } });
  try {
    await app.login();

    // ---- Sem rolagem horizontal e tema escuro, módulo a módulo ----
    // lab e anatomia são escuros por natureza (.laift-always-dark): no tema
    // claro continuam escuros (justificativa em docs/FASE_4_QUALIDADE.md).
    const MODULES = [
      { id: 'farmaco', followsLight: true },
      { id: 'toxico', followsLight: true },
      { id: 'lab', followsLight: false },
      { id: 'anatomia', followsLight: false },
      { id: 'clinica', followsLight: true },
    ];
    for (const mod of MODULES) {
      const frame = await app.openModule(mod.id);
      await frame.waitForTimeout(600);
      const size = await frame.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(size.sw <= size.iw + 1, `módulo "${mod.id}" sem rolagem horizontal em 360 px (scrollWidth ${size.sw} ≤ ${size.iw})`);

      await setTheme(frame, 'dark');
      const dark = luminance(await bodyBackground(frame));
      check(dark < 0.05, `módulo "${mod.id}" fica escuro com data-theme="dark" (luminância ${dark.toFixed(3)})`);

      await setTheme(frame, 'light');
      const light = luminance(await bodyBackground(frame));
      if (mod.followsLight) check(light > 0.7, `módulo "${mod.id}" fica claro com data-theme="light" (luminância ${light.toFixed(3)})`);
      else check(light < 0.05, `módulo "${mod.id}" permanece escuro no tema claro (visualização 3D)`);

      await app.page.click('#learn-back');
    }

    // ---- Motor único de quiz: os dois módulos registram o resultado ----
    let frame = await app.openModule('farmaco');
    let calls = await runQuiz(frame, { mode: 'study' });
    check(calls.length === 1 && validQuizAttempt(calls[0], 'farmacologia', 'estudo'),
      'Farmacologia concluída chama LaiftApi.call("apiLearnSubmitQuizAttempt", {module:"farmacologia", mode:"estudo", ...})' + (calls.length ? ' ' + JSON.stringify(calls[0].input) : ''));
    const saved = await frame.evaluate(() => { try { return JSON.parse(localStorage.getItem('pharmaQuizProgress')); } catch (e) { return null; } });
    check(!saved || Array.isArray(saved.userAnswers), 'progresso da Farmacologia continua na chave pharmaQuizProgress');
    await app.page.click('#learn-back');

    frame = await app.openModule('toxico');
    await frame.evaluate(() => localStorage.setItem('toxicoQuizProgress', JSON.stringify({ userAnswers: [2], timestamp: 'e2e' })));
    calls = await runQuiz(frame, { mode: 'exam' });
    check(calls.length === 1 && validQuizAttempt(calls[0], 'toxicologia', 'prova'),
      'Toxicologia concluída (modo prova) chama apiLearnSubmitQuizAttempt com module:"toxicologia", mode:"prova"' + (calls.length ? ' ' + JSON.stringify(calls[0].input) : ''));
    const toxSaved = await frame.evaluate(() => JSON.parse(localStorage.getItem('toxicoQuizProgress') || 'null'));
    check(toxSaved && toxSaved.userAnswers[0] === 2, 'modo prova não mexe no progresso salvo em toxicoQuizProgress');
    const status = await frame.textContent('#resultsContainer .quiz-status');
    check(/registrado/i.test(status || ''), 'resultado mostra a confirmação do registro (role="status")');
    await app.page.click('#learn-back');

    // ---- Laboratório: formulação registrada pela ponte (Contrato 4) ----
    frame = await app.openModule('lab');
    await stubLaiftApi(frame);
    await frame.evaluate(() => window.catalogarFormulacaoNoBanco('Ácido Acetilsalicílico', ['AcidoSalicilico_s', 'AnidridoAcetico_l'], 65, true, 'Cristais brancos.'));
    calls = await laiftCalls(frame);
    const lab = calls[0] && calls[0].input;
    check(calls.length === 1 && calls[0].action === 'apiLearnRecordLabFormulation' && lab.product === 'Ácido Acetilsalicílico' &&
      Array.isArray(lab.reagents) && lab.temperature === 65 && lab.stirring === true && lab.observation === 'Cristais brancos.',
      'laboratório registra a formulação com apiLearnRecordLabFormulation {product, reagents, temperature, stirring, observation}');
    // Estúdio: abre no modal e fecha pelo postMessage de mesma origem.
    await frame.click('#btnOpenStudio');
    const studioEl = await frame.waitForSelector('#studioIframe');
    const studio = await studioEl.contentFrame();
    await studio.waitForLoadState('load').catch(() => {});
    await studio.waitForSelector('.compound-item', { timeout: 8000 }).catch(() => {});
    await studio.click('[data-action="retornarAoLaboratorio"]');
    await frame.waitForFunction(() => document.getElementById('studioIframeModal').style.display === 'none', null, { timeout: 3000 }).catch(() => {});
    check(await frame.evaluate(() => document.getElementById('studioIframeModal').style.display === 'none'),
      'Estúdio fecha por postMessage com origem fixa (a bancada valida event.origin)');
    await app.page.click('#learn-back');

    // ---- Anatomia: quiz 3D registrado + busca não interpreta HTML ----
    frame = await app.openModule('anatomia');
    await stubLaiftApi(frame);
    await frame.evaluate(() => { window.QuizEngine.startQuiz(); window.QuizEngine.completeQuiz(); });
    await frame.waitForFunction(() => (window.__laiftCalls || []).length > 0, null, { timeout: 3000 }).catch(() => {});
    calls = await laiftCalls(frame);
    check(calls.length === 1 && validQuizAttempt(calls[0], 'anatomia', 'prova'), 'quiz 3D da anatomia registra apiLearnSubmitQuizAttempt com module:"anatomia"');
    await frame.click('[data-action="QuizEngine.startQuiz"]');
    check(await frame.evaluate(() => !document.getElementById('quizQuestionCard').classList.contains('hidden')), '"Refazer Quiz" volta a mostrar o caso clínico');
    await frame.evaluate(() => {
      window.QuizEngine.stopQuiz();
      window.AppController.switchTab('view-biohacking');
      const input = document.getElementById('bio-search-input');
      input.value = '<img src=x onerror="window.__xss=1">';
      input.dispatchEvent(new Event('input'));
    });
    await frame.waitForTimeout(200);
    const xss = await frame.evaluate(() => ({ img: !!document.querySelector('#biohacking-results-grid img'), fired: !!window.__xss }));
    check(!xss.img && !xss.fired, 'busca de protocolos da anatomia mostra o termo como texto (sem XSS refletido)');
    await app.page.click('#learn-back');

    // ---- Crachá (aberto em nova aba pelo terminal fiscal) ----
    const [popup] = await Promise.all([
      app.context.waitForEvent('page'),
      app.page.evaluate(() => window.open('modulos/cracha/index.html?id=7&nome=Ana', '_blank')),
    ]);
    await popup.waitForLoadState('load');
    await popup.waitForTimeout(300);
    const badge = await popup.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, qr: !!document.querySelector('#qrCode img[src^="data:image/"]') }));
    check(badge.sw <= badge.iw + 1, `crachá sem rolagem horizontal em 360 px (scrollWidth ${badge.sw} ≤ ${badge.iw})`);
    check(badge.qr, 'QR do crachá é gerado localmente (sem CDN)');
    await popup.close();

    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'sem erros de JavaScript nas páginas' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
