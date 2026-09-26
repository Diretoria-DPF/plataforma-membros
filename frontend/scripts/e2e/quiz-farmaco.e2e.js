/**
 * quiz-farmaco.e2e.js — cobre a Fase de "ligar" a detecção de fármaco-alvo
 * (modulos/quiz/farmacos-lexicon.js) ao Simulador de Farmacologia.
 *
 * Motivação (ver docs/relatório da tarefa): nenhuma das 240 questões de
 * questions.js trazia farmacoAlvo/smiles, então renderMolecularStructure e o
 * botão "Ficha Farmacológica" (app.js) nunca chamavam RxNav/PubChem/ChEBI em
 * uso normal. detectarFarmacoAlvo() varre alternativa correta → enunciado →
 * explicação por um fármaco individual conhecido; obterQuestoesDisponiveis()
 * (app.js) aplica isso só às questões sem farmacoAlvo explícito.
 *
 * 1) Detecção pura (Node, sem navegador): carrega farmacos-lexicon.js e
 *    questions.js num sandbox `vm` (mesmo padrão de parsers.e2e.js) e chama
 *    detectarFarmacoAlvo() diretamente contra questões reais do banco.
 * 2) Navegador: abre o módulo de farmacologia de verdade, seleciona um
 *    tópico cuja primeira questão tem fármaco detectado (Coagulação →
 *    Heparina Não Fracionada), e confere que a estrutura molecular e a
 *    ficha farmacológica consultam RxNav/PubChem/ChEBI pelo termo em inglês
 *    (farmacoConsulta), exibindo o nome em português (farmacoAlvo) na tela.
 *    RxNav/PubChem/ChEBI são mocados (mesmo padrão de apis.e2e.js) porque o
 *    ambiente de CI/sandbox não alcança essas APIs de verdade.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

const FRONTEND_ROOT = path.join(__dirname, '..', '..');
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;
const CORS = { 'Access-Control-Allow-Origin': '*' };

// ---------------------------------------------------------------------------
// 1. Detecção pura (Node puro, sem navegador)
// ---------------------------------------------------------------------------
function carregarContextoQuiz() {
  const sandbox = { console };
  sandbox.window = sandbox; // "window.X = X" nos arquivos também vira global do contexto
  vm.createContext(sandbox);
  ['modulos/quiz/farmacos-lexicon.js', 'modulos/quiz/questions.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8'), sandbox, { filename: rel });
  });
  return sandbox;
}

function testarDeteccaoPura() {
  const ctx = carregarContextoQuiz();
  const detectar = ctx.detectarFarmacoAlvo;
  const allQuestions = vm.runInContext('allQuestions', ctx);
  const porId = (id) => allQuestions.find((q) => q.id === id);

  // Q46 (AINEs): "Ácido acetilsalicílico" é a ALTERNATIVA CORRETA (maior prioridade de detecção).
  const aas = detectar(porId(46));
  check(!!aas && aas.farmacoAlvo === 'Ácido Acetilsalicílico' && aas.farmacoConsulta === 'aspirin',
    'detecção pura: questão de AAS (alternativa correta) → farmacoConsulta "aspirin"');

  // Q83 (Coagulação): "Varfarina" está no ENUNCIADO; a alternativa correta é conceitual (INR/TP, não cita fármaco).
  const varfarina = detectar(porId(83));
  check(!!varfarina && varfarina.farmacoAlvo === 'Varfarina' && varfarina.farmacoConsulta === 'warfarin',
    'detecção pura: questão de varfarina (enunciado) → farmacoConsulta "warfarin"');

  // Q1 (Farmacodinâmica): pergunta puramente conceitual (agonista/antagonista) — nenhum fármaco individual citado.
  const conceitual = detectar(porId(1));
  check(conceitual === null, 'detecção pura: questão conceitual de farmacodinâmica não detecta fármaco');

  // Nenhuma classe terapêutica (só substâncias individuais) entra no léxico.
  const LAIFT_FARMACOS = vm.runInContext('LAIFT_FARMACOS', ctx);
  const comoClasse = LAIFT_FARMACOS.find((f) => /betabloqueador|inibidor|bloqueador|estatinas?$/i.test(f.pt));
  check(!comoClasse, 'léxico: nenhuma classe terapêutica cadastrada (só substâncias individuais)');

  // Cobertura: aplicada às 240 questões reais, cada um dos 12 tópicos tem pelo menos uma questão com fármaco.
  const porTopico = {};
  let totalDetectado = 0;
  allQuestions.forEach((q) => {
    porTopico[q.topic] = porTopico[q.topic] || { total: 0, det: 0 };
    porTopico[q.topic].total++;
    if (detectar(q)) { porTopico[q.topic].det++; totalDetectado++; }
  });
  console.log('  · cobertura por tópico: ' + Object.keys(porTopico).map((t) => `${t} ${porTopico[t].det}/${porTopico[t].total}`).join(', '));
  check(Object.keys(porTopico).length === 12 && Object.values(porTopico).every((t) => t.det > 0),
    'detecção pura: todos os 12 tópicos têm ao menos uma questão com fármaco detectado');
  check(totalDetectado >= 140 && totalDetectado < 240,
    `detecção pura: cobertura plausível e não-trivial (${totalDetectado}/240 questões com fármaco — nem zero, nem todas, já que há questões conceituais)`);
}

// ---------------------------------------------------------------------------
// 2. Navegador: RxNav/PubChem/ChEBI de verdade, mocados (QuizAPIEngine)
// ---------------------------------------------------------------------------
function instalarMocksApis(context) {
  const calls = { rxnav: [], pubchem: [], ebi: [] };

  async function preflight(route) {
    if (route.request().method() !== 'OPTIONS') return false;
    await route.fulfill({ status: 204, headers: CORS });
    return true;
  }

  context.route('https://rxnav.nlm.nih.gov/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.rxnav.push({ url, method: req.method() });
    if (await preflight(route)) return;
    const body = url.includes('/rxclass/')
      ? { rxclassDrugInfoList: { rxclassDrugInfo: [{ rxclassMinConceptItem: { className: 'Anticoagulantes (mock E2E)' } }] } }
      : { idGroup: { rxnormId: ['9028'] } };
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  });

  context.route('https://pubchem.ncbi.nlm.nih.gov/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.pubchem.push({ url, method: req.method() });
    if (await preflight(route)) return;
    if (/\/property\//.test(url)) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        PropertyTable: { Properties: [{ CID: 772, MolecularWeight: '15000', MolecularFormula: '(C12H19NO20S3)n', CanonicalSMILES: 'CC(=O)O', IUPACName: 'heparin (mock E2E)' }] },
      }) });
    }
    return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'not mocked' });
  });

  context.route('https://www.ebi.ac.uk/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.ebi.push({ url, method: req.method() });
    if (await preflight(route)) return;
    if (url.includes('/ebisearch/ws/rest/chebi')) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        entries: [{ id: 'CHEBI:28304', fields: { definition: ['Anticoagulante endógeno que potencializa a antitrombina III (mock E2E).'] } }],
      }) });
    }
    return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'not mocked' });
  });

  return calls;
}

/** CSP: mesmo instrumento de apis.e2e.js/csp.e2e.js (ouve securitypolicyviolation em todo frame e serve o jsDelivr do espelho local). */
async function instrumentarCsp(app, pkgs) {
  const violacoes = [];
  await app.context.exposeBinding('__e2eQuizCspReport', (source, v) => {
    violacoes.push(Object.assign({ frame: source.frame.url().replace(app.baseUrl, '') }, v));
  });
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try {
        window.__e2eQuizCspReport({
          directive: e.effectiveDirective, blocked: e.blockedURI,
          source: String(e.sourceFile || '').split('/').slice(-2).join('/') + ':' + e.lineNumber,
        });
      } catch (err) { /* binding indisponível neste documento */ }
    });
  });
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const url = route.request().url();
    const file = pkgs && mirror.resolveCdnUrl(pkgs, url);
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return violacoes;
}

async function testarNoNavegador() {
  const pkgs = mirror.ensureMirror();
  if (!pkgs) console.log('  (aviso: espelho do npm indisponível — SmilesDrawer fica abortado; a verificação de wiring com as APIs segue mesmo assim)');

  const app = await startApp({ role: 'member' });
  const violacoes = await instrumentarCsp(app, pkgs);
  const calls = instalarMocksApis(app.context);

  try {
    await app.login();
    const frame = await app.openModule('farmaco');

    // Coagulação: 1ª questão do tópico (id 81) tem "Heparina Não Fracionada" no
    // enunciado — detecção automática, sem nenhum farmacoAlvo manual no teste.
    await frame.click('.topic-btn[data-topic="Coagulação"]');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');

    await frame.waitForFunction(() => /CID: 772/.test(document.getElementById('quizMolLabel').textContent || ''), null, { timeout: 4000 }).catch(() => {});
    const rotuloMolecula = await frame.evaluate(() => document.getElementById('quizMolLabel').textContent || '');
    check(/^Heparina\b/.test(rotuloMolecula), 'quiz: rótulo da molécula exibe o nome em PT (Heparina), não o termo de consulta em EN');
    check(/CID: 772/.test(rotuloMolecula), 'quiz: estrutura 2D busca no PubChem (mock) mesmo sem farmacoAlvo manual — detecção automática ligou a API');
    check(calls.pubchem.some((c) => c.url.includes('/compound/name/heparin/property')), 'quiz: PubChem consultado pelo termo em inglês do léxico ("heparin"), não "Heparina Não Fracionada"');

    await frame.click('.option');
    await frame.waitForSelector('#btnVerDossie:not([hidden])', { timeout: 4000 });
    await frame.click('#btnVerDossie');
    await frame.waitForFunction(() => /Anticoagulantes/.test(document.getElementById('dossieContent').textContent || ''), null, { timeout: 4000 }).catch(() => {});
    const dossie = await frame.evaluate(() => document.getElementById('dossieContent').textContent || '');

    check(dossie.includes('Ficha Farmacológica: Heparina') && !dossie.includes('Ficha Farmacológica: heparin'), 'quiz: cabeçalho da ficha mostra o nome em PT (Heparina), não "heparin"');
    check(/Anticoagulantes \(mock E2E\)/.test(dossie), 'quiz: ficha mostra a classe ATC vinda do RxNav/RxClass (mock)');
    check(/9028/.test(dossie), 'quiz: ficha mostra o RxCUI resolvido pelo RxNav (mock)');
    check(/antitrombina/i.test(dossie), 'quiz: ficha mostra a definição biológica vinda do ChEBI (mock)');
    check(calls.rxnav.some((c) => c.url.includes('rxcui.json') && c.url.includes('name=heparin')), 'quiz: RxNav consultado pelo termo em inglês ("heparin")');
    check(calls.ebi.some((c) => c.url.includes('/ebisearch/ws/rest/chebi') && c.url.includes('heparin')), 'quiz: ChEBI (EBI Search) consultado pelo termo em inglês ("heparin")');

    check(violacoes.length === 0, 'quiz-farmaco: nenhuma violação de CSP' + (violacoes.length ? ': ' + violacoes.map((v) => `${v.frame} → ${v.directive} ${v.blocked}`).join(' | ') : ''));
    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'quiz-farmaco: sem erros de JavaScript não tratados' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function quizFarmaco() {
  testarDeteccaoPura();
  await testarNoNavegador();
};
