/**
 * apis.e2e.js — APIs científicas públicas usadas pelos módulos (OpenFDA,
 * RxNav, PubChem, CACTUS/NIH, Wikidata, ChEBI/EBI Search, ChEMBL, UniChem,
 * RCSB PDB) e a geração de QR (agora 100% local).
 *
 * Roda sobre o BUILD (frontend/dist/). Como o ambiente de CI/sandbox não
 * alcança essas APIs de verdade, cada host é interceptado com
 * `context.route` e respondido com um corpo mocado (porém realista, no
 * formato de cada API) e `Access-Control-Allow-Origin: *` — como as APIs
 * reais respondem. Isso confere três coisas que uma chamada abortada (como
 * no harness padrão) não confere:
 *   (a) a requisição realmente é feita para o host certo, com a URL/verbo
 *       certos (inclusive o preflight OPTIONS de POSTs com corpo JSON, que
 *       a API precisa responder para o navegador liberar a chamada real);
 *   (b) o dado mocado chega até o DOM pela cadeia de renderização do módulo
 *       (LaiftDom, safe-dom, os `data-action` etc.) — pega wiring quebrado
 *       que uma chamada abortada não pegaria, já que o `catch` do módulo
 *       mascararia tanto "abortado" quanto "quebrado" com o mesmo fallback;
 *   (c) zero `securitypolicyviolation` (a CSP de cada módulo permite os
 *       hosts que ele realmente usa) e nenhum erro de JavaScript não tratado.
 *
 * Fora do escopo (não mocado nem testado aqui — ver docs/SECURITY.md e o
 * relatório da tarefa): HRA (apps.humanatlas.io/purl.humanatlas.io) e o NIH
 * 3D Print Exchange (3d.nih.gov), cujas funções em anatomia-3d/js/api-cache.js
 * (consultarHRA/consultarNIH3D) já estavam sem nenhum chamador na UI antes
 * desta tarefa (confirmado também em o-bala-vip) — permanecem na CSP para o
 * dia em que alguém as ligar a um botão, mas não há fluxo real para testar.
 */
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;

const CORS = { 'Access-Control-Allow-Origin': '*' };
const CORS_PREFLIGHT = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// PNG 1x1 válido (para os endpoints de imagem do PubChem/CACTUS).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const MOCK_SDF = [
  'E2E-MOCK', '  E2E-mock', '',
  '  1  0  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  'M  END', '$$$$', '',
].join('\n');

/** PDB sintético (hélice de poli-alanina) — o bastante para o 3Dmol montar um cartoon sem erro. */
function mockPdb() {
  const lines = ['HEADER    E2E MOCK STRUCTURE'];
  let n = 1;
  const atom = (name, x, y, z, resi) => {
    lines.push(
      'ATOM  ' + String(n++).padStart(5, ' ') + '  ' + name.padEnd(3, ' ') + ' ALA A' +
      String(resi).padStart(4, ' ') + '    ' +
      x.toFixed(3).padStart(8, ' ') + y.toFixed(3).padStart(8, ' ') + z.toFixed(3).padStart(8, ' ') +
      '  1.00 20.00           ' + name.charAt(0)
    );
  };
  for (let r = 1; r <= 8; r++) {
    const ang = r * 1.7;
    atom('N', 1.5 * Math.cos(ang), 1.5 * Math.sin(ang), r * 1.5, r);
    atom('CA', 2.3 * Math.cos(ang + 0.4), 2.3 * Math.sin(ang + 0.4), r * 1.5 + 0.5, r);
    atom('C', 1.8 * Math.cos(ang + 0.9), 1.8 * Math.sin(ang + 0.9), r * 1.5 + 1, r);
    atom('O', 1.2 * Math.cos(ang + 1.2), 1.2 * Math.sin(ang + 1.2), r * 1.5 + 1.3, r);
  }
  lines.push('END', '');
  return lines.join('\n');
}
const MOCK_PDB = mockPdb();

/** Registra o mock de cada host (com o par 'record + fulfill' do Playwright) e devolve os registros de chamada + os "interruptores" de falha por host. */
function installApiMocks(context) {
  const calls = { fda: [], rxnav: [], pubchem: [], cactus: [], wikidata: [], ebi: [], rcsb: [] };
  const fail = { pubchem: [], cactus: [], fda: [] };
  const shouldFail = (host, url) => fail[host].some((s) => url.includes(s));

  async function preflight(route) {
    if (route.request().method() !== 'OPTIONS') return false;
    await route.fulfill({ status: 204, headers: CORS_PREFLIGHT });
    return true;
  }

  context.route('https://api.fda.gov/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.fda.push({ url, method: req.method() });
    if (await preflight(route)) return;
    if (shouldFail('fda', url)) {
      return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'mock E2E' } }) });
    }
    // Formato real do OpenFDA (drug/label): { results: [ { boxed_warning: [...] } ] }.
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
      results: [{ boxed_warning: ['ALERTA E2E (mock): risco de hepatotoxicidade grave em superdosagem.'] }],
    }) });
  });

  context.route('https://rxnav.nlm.nih.gov/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.rxnav.push({ url, method: req.method() });
    if (await preflight(route)) return;
    const body = url.includes('/rxclass/')
      ? { rxclassDrugInfoList: { rxclassDrugInfo: [{ rxclassMinConceptItem: { className: 'Salicilatos (mock E2E)' } }] } }
      : { idGroup: { rxnormId: ['1191'] } };
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  });

  context.route('https://pubchem.ncbi.nlm.nih.gov/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.pubchem.push({ url, method: req.method(), body: req.postData() || '' });
    if (await preflight(route)) return;
    if (shouldFail('pubchem', url)) {
      return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'Status: 404\nError: PUGREST.NotFound (mock E2E)' });
    }
    if (/\/PNG(\?|$)/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TINY_PNG });
    if (/\/SDF(\?|$)/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'chemical/x-mdl-sdfile', body: MOCK_SDF });
    if (/\/property\/InChIKey\b/.test(url)) {
      // Estúdio: resolverInChIKeyComposto() — GET por nome (Aspirin) resolve de cara;
      // o POST por SMILES só é usado quando a busca por nome falha (2º cenário abaixo)
      // e devolve o formato PÓS-2025 do PubChem (ConnectivitySMILES no lugar de
      // CanonicalSMILES), provando que o parser aceita as duas formas de chave.
      const props = req.method() === 'POST'
        ? { CID: 3672, InChIKey: 'HEFNNWSXXWATRW-UHFFFAOYSA-N', ConnectivitySMILES: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O' }
        : { CID: 2244, InChIKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' };
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        PropertyTable: { Properties: [props] },
      }) });
    }
    if (/\/property\/[^/]*XLogP/.test(url)) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        PropertyTable: { Properties: [{ MolecularWeight: '180.16', XLogP: 1.2, CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O' }] },
      }) });
    }
    if (/\/property\//.test(url)) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        PropertyTable: { Properties: [{ CID: 2244, MolecularWeight: '180.16', MolecularFormula: 'C9H8O4', CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', IUPACName: 'ácido acetilsalicílico (mock E2E)' }] },
      }) });
    }
    return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'not mocked' });
  });

  context.route('https://cactus.nci.nih.gov/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.cactus.push({ url, method: req.method() });
    if (await preflight(route)) return;
    if (shouldFail('cactus', url)) return route.fulfill({ status: 404, headers: CORS, contentType: 'text/html', body: 'Page not found (mock E2E)' });
    if (/\/image(\?|$)/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TINY_PNG });
    if (/\/file(\?|$)/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'chemical/x-mdl-sdfile', body: MOCK_SDF });
    if (/\/iupac_name/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'text/plain', body: 'acido 2-hidroxibenzoico (mock E2E)' });
    if (/\/formula/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'text/plain', body: 'C7H6O3' });
    if (/\/smiles/.test(url)) return route.fulfill({ status: 200, headers: CORS, contentType: 'text/plain', body: 'OC(=O)c1ccccc1O' });
    return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'not mocked' });
  });

  context.route('https://query.wikidata.org/**', async (route) => {
    const req = route.request();
    calls.wikidata.push({ url: req.url(), method: req.method() });
    if (await preflight(route)) return;
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/sparql-results+json', body: JSON.stringify({
      results: { bindings: [{ cas: { value: '69-72-7' }, chembl: { value: 'CHEMBL424 (mock)' }, pubchem: { value: '338' } }] },
    }) });
  });

  context.route('https://www.ebi.ac.uk/**', async (route) => {
    const req = route.request(); const url = req.url();
    calls.ebi.push({ url, method: req.method(), body: req.postData() || '' });
    if (await preflight(route)) return;
    if (url.includes('/ebisearch/ws/rest/chebi')) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        entries: [{ id: 'CHEBI:15365', fields: { definition: ['Ácido salicílico: anti-inflamatório (mock E2E).'] } }],
      }) });
    }
    if (url.includes('/chembl/api/data/molecule/search.json')) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        molecules: [{ molecule_chembl_id: 'CHEMBL25', pref_name: 'ASPIRINA (MOCK E2E)', max_phase: 4, molecule_properties: { full_molformula: 'C9H8O4', full_mwt: '180.16' } }],
      }) });
    }
    if (url.includes('/chembl/api/data/activity.json')) {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        activities: [{ target_pref_name: 'Ciclo-oxigenase-1 (mock E2E)', standard_type: 'IC50', standard_value: '1.2', standard_units: 'uM' }],
      }) });
    }
    if (url.includes('/unichem/api/v1/compounds')) {
      // Formato real do v1: compounds[].sources[] (shortName/compoundId/url) + uci/inchikey
      // no próprio composto — o parser (resolverIdentificadoresUniChem) só usa sources[].
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({
        compounds: [{
          uci: '12345-E2E',
          inchikey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
          sources: [{ shortName: 'drugbank', compoundId: 'DB00945-E2E', url: 'https://go.drugbank.com/drugs/DB00945-E2E' }],
        }],
      }) });
    }
    return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'not mocked' });
  });

  context.route('https://files.rcsb.org/**', async (route) => {
    const req = route.request();
    calls.rcsb.push({ url: req.url(), method: req.method() });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'chemical/x-pdb', body: MOCK_PDB });
  });

  return { calls, fail };
}

/** CSP: mesmo instrumento de csp.e2e.js (ouve securitypolicyviolation em todo frame e serve o jsDelivr do espelho local). */
async function instrumentCsp(app, pkgs) {
  const violations = [];
  await app.context.exposeBinding('__e2eApiCspReport', (source, v) => {
    violations.push(Object.assign({ frame: source.frame.url().replace(app.baseUrl, '') }, v));
  });
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try {
        window.__e2eApiCspReport({
          directive: e.effectiveDirective, blocked: e.blockedURI,
          source: String(e.sourceFile || '').split('/').slice(-2).join('/') + ':' + e.lineNumber,
        });
      } catch (err) { /* binding indisponível neste documento */ }
    });
  });
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const url = route.request().url();
    // RDKit fica de fora de propósito: seu WASM demora "poucos segundos" pra
    // inicializar (ver csp.e2e.js) — deixá-lo carregar tornaria a ordem de
    // fontes do InChIKey (RDKit → PubChem nome → PubChem SMILES) uma corrida
    // dependente de timing. Sem RDKit aqui, o Estúdio sempre cai no PubChem
    // (testado abaixo) — o caminho RDKit é coberto por rdkit.e2e.js.
    if (/@rdkit\/rdkit/.test(url)) return route.abort();
    const file = pkgs && mirror.resolveCdnUrl(pkgs, url);
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return violations;
}

/** Espera (polling) até `cond()` ser verdadeiro ou o timeout vencer — usado para aguardar chamadas assíncronas registradas em `calls` (fora da página, não dá pra usar waitForFunction). */
async function esperarAte(cond, timeout, intervalo) {
  const limite = Date.now() + (timeout || 4000);
  while (Date.now() < limite) {
    if (cond()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalo || 100));
  }
  return cond();
}

function reportCsp(violations, label) {
  const list = violations.map((v) => `${v.frame} → ${v.directive} ${v.blocked} (${v.source})`);
  check(violations.length === 0, `${label}: nenhuma violação de CSP` + (list.length ? ': ' + [...new Set(list)].join(' | ') : ''));
}

module.exports = async function apis() {
  const pkgs = mirror.ensureMirror();
  if (!pkgs) console.log('  (aviso: espelho do npm indisponível — SmilesDrawer/3Dmol/OpenChemLib ficam abortados; a verificação de wiring com as APIs segue mesmo assim)');

  const app = await startApp({ role: 'member' });
  const violations = await instrumentCsp(app, pkgs);
  const { calls, fail } = installApiMocks(app.context);

  try {
    await app.login();

    // =========================================================================
    // 1. TOXICOLOGIA — OpenFDA (fetchOpenFdaWarning)
    // =========================================================================
    let frame = await app.openModule('toxico');
    await frame.click('.topic-btn'); // "Antídotos" é o 1º tópico do banco — a questão 1 cita "paracetamol"
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');
    await frame.click('.option');
    await frame.waitForFunction(() => {
      const tag = document.getElementById('apiDataSourceTag');
      return !!tag && !tag.hidden && tag.dataset.source === 'fda';
    }, null, { timeout: 4000 }).catch(() => {});
    const tox = await frame.evaluate(() => ({
      tagText: (document.getElementById('apiDataSourceTag') || {}).textContent || '',
      tagSource: (document.getElementById('apiDataSourceTag') || {}).dataset && document.getElementById('apiDataSourceTag').dataset.source,
      alertText: (document.querySelector('#explanationText .fda-alert') || {}).textContent || '',
    }));
    check(tox.tagSource === 'fda' && /OpenFDA/.test(tox.tagText), 'toxicologia: tag muda para "OpenFDA Alerta Oficial" com a resposta mocada');
    check(/ALERTA E2E \(mock\)/.test(tox.alertText), 'toxicologia: alerta do OpenFDA (mock) é inserido na explicação');
    check(calls.fda.some((c) => c.url.includes('generic_name') && c.url.includes('acetaminophen')), 'toxicologia: api.fda.gov chamado com o termo mapeado (paracetamol → acetaminophen)');
    await app.page.click('#learn-back');

    // =========================================================================
    // 2. QUIZ (Farmacologia) — RxNav + PubChem + ChEBI (QuizAPIEngine)
    // =========================================================================
    // Nota: o banco carregado por padrão (questions.js) não tem farmacoAlvo/
    // smiles em nenhuma questão (quiz-database.js, que tem, nunca é usado —
    // isso já era assim em o-bala-vip, não é uma quebra desta tarefa; ver
    // relatório). Para exercitar o motor de verdade, usamos o mesmo `state`
    // que quiz-engine.js expõe para os testes E2E (comentário no arquivo).
    frame = await app.openModule('farmaco');
    await frame.click('.topic-btn');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');
    await frame.evaluate(() => {
      const st = window.LaiftQuiz.state;
      const q = st.questions[st.index];
      q.farmacoAlvo = 'Aspirina';
      q.smiles = null;
    });
    await frame.click('.option'); // recarrega a questão: dispara onQuestion (estrutura) e onExplanation (dossiê)
    await frame.waitForSelector('#btnVerDossie:not([hidden])', { timeout: 4000 });
    await frame.click('#btnVerDossie');
    await frame.waitForFunction(() => /Salicilatos/.test(document.getElementById('dossieContent').textContent || ''), null, { timeout: 4000 }).catch(() => {});
    const quizDossie = await frame.evaluate(() => document.getElementById('dossieContent').textContent || '');
    check(/Salicilatos \(mock E2E\)/.test(quizDossie), 'quiz: dossiê mostra a classe ATC vinda do RxNav/RxClass (mock)');
    check(/RxCUI/.test(quizDossie) && /1191/.test(quizDossie), 'quiz: dossiê mostra o RxCUI resolvido pelo RxNav (mock)');
    check(/salicílico/i.test(quizDossie), 'quiz: dossiê mostra a definição biológica vinda do ChEBI (mock)');
    const quizCanvasLabel = await frame.evaluate(() => document.getElementById('quizMolLabel').textContent || '');
    check(/CID: 2244/.test(quizCanvasLabel), 'quiz: estrutura 2D busca o SMILES no PubChem (mock) quando a questão não traz um');
    check(calls.rxnav.some((c) => c.url.includes('rxcui.json')) && calls.rxnav.some((c) => c.url.includes('rxclass')), 'quiz: RxNav chamado (rxcui.json + rxclass/class/byRxcui.json)');
    check(calls.pubchem.some((c) => c.url.includes('/compound/name/Aspirina/property')), 'quiz: PubChem chamado por propriedades de "Aspirina"');
    check(calls.ebi.some((c) => c.url.includes('/ebisearch/ws/rest/chebi')), 'quiz: ChEBI (EBI Search) chamado');
    await app.page.click('#learn-back');

    // =========================================================================
    // 3. LABORATÓRIO — ChemicalAPIEngine (PubChem → CACTUS → Wikidata/ChEBI)
    // =========================================================================
    frame = await app.openModule('lab');
    await frame.evaluate(() => window.switchRightTab('tabMol')); // aplica o reagente já selecionado (1º da lista: Ácido Salicílico)
    await frame.waitForFunction(() => document.getElementById('btnDossieLab').style.display === 'block', null, { timeout: 4000 });
    await frame.click('#btnDossieLab');
    await frame.waitForFunction(() => /ácido acetilsalicílico/i.test(document.getElementById('dossieLabContent').textContent || ''), null, { timeout: 4000 }).catch(() => {});
    const labDossie = await frame.evaluate(() => document.getElementById('dossieLabContent').textContent || '');
    check(/ácido acetilsalicílico \(mock E2E\)/i.test(labDossie), 'laboratório: dossiê mostra o IUPAC vindo do PubChem (mock)');
    check(/69-72-7/.test(labDossie), 'laboratório: dossiê mostra o nº CAS vindo do Wikidata (mock)');
    check(/salicílico/i.test(labDossie), 'laboratório: dossiê mostra o papel biológico vindo do ChEBI (mock)');
    check(calls.pubchem.some((c) => c.url.includes('/compound/name/Salicylic%20acid/property')), 'laboratório: PubChem chamado por "Salicylic acid" (nome internacional do reagente)');
    check(calls.wikidata.length > 0, 'laboratório: Wikidata (SPARQL) chamado');
    check(calls.pubchem.some((c) => c.url.includes('/compound/smiles/') && /\/SDF/.test(c.url)), 'laboratório: PubChem chamado por SMILES para a conformação 3D');

    // 3D: mock SDF chega até o cache local (renderiza só em modoVisualizacao 3D, não é preciso mudar de modo para provar a chamada).
    await frame.waitForTimeout(300);

    // Fallback estrutural: PubChem falha → CACTUS assume (chamada direta na função real usada pelo dossiê).
    fail.pubchem.push('ForcarFallbackCactusE2E');
    const cactusResult = await frame.evaluate(() => window.ChemicalAPIEngine.resolveCompleteCompound('ForcarFallbackCactusE2E'));
    fail.pubchem.length = 0;
    check(!!cactusResult && cactusResult.origem === 'CACTUS Fallback (NCI/NIH)' && cactusResult.smiles === 'OC(=O)c1ccccc1O', 'laboratório: quando o PubChem falha, ChemicalAPIEngine cai para o CACTUS (mock)');
    check(calls.cactus.some((c) => c.url.includes('ForcarFallbackCactusE2E') && c.url.endsWith('/smiles')), 'laboratório: CACTUS consultado por /smiles no fallback');
    check(calls.cactus.some((c) => c.url.includes('ForcarFallbackCactusE2E') && c.url.endsWith('/iupac_name')), 'laboratório: CACTUS consultado por /iupac_name no fallback');

    // Fallback de imagem 2D + SDF 3D: SMILES com "." pula o desenho local e a conformação por SMILES (comportamento existente).
    fail.pubchem.push('ComposicaoImagemE2E');
    await frame.evaluate(() => window.desenharEstruturaSmiles('CC(=O)O.CCO', 'Composição Imagem E2E', 'ComposicaoImagemE2E', 'C4H10O3', 100));
    await frame.waitForFunction(() => {
      const img = document.getElementById('moleculeImg');
      return !!img && /cactus\.nci\.nih\.gov/.test(img.src || '');
    }, null, { timeout: 4000 }).catch(() => {});
    await frame.waitForTimeout(300); // SDF por nome (assíncrono, sem elemento pra aguardar)
    fail.pubchem.length = 0;
    const imgInfo = await frame.evaluate(() => {
      const img = document.getElementById('moleculeImg');
      return { src: img.src, display: img.style.display };
    });
    // O fallback de imagem usa o SMILES (não o nome/pubchemQuery) na URL do CACTUS — ver carregarImagemExterna.
    check(/^https:\/\/cactus\.nci\.nih\.gov\/chemical\/structure\/.+\/image\?/.test(imgInfo.src) && imgInfo.display === 'block', 'laboratório: PNG do PubChem falha → cai para a imagem do CACTUS (mock) no card 2D');
    check(calls.pubchem.some((c) => c.url.includes('ComposicaoImagemE2E') && /\/PNG/.test(c.url)), 'laboratório: PNG do PubChem tentado antes do fallback de imagem');
    check(calls.pubchem.some((c) => c.url.includes('ComposicaoImagemE2E') && /\/SDF/.test(c.url)), 'laboratório: SDF do PubChem (por nome) tentado para a conformação 3D');
    check(calls.cactus.some((c) => /\/file\?format=sdf/.test(c.url)), 'laboratório: SDF do CACTUS pedido no fallback da conformação 3D (a URL usa o SMILES, não o nome)');

    // Fecha o modal do dossiê (ficou aberto desde o passo acima) antes de seguir.
    await frame.evaluate(() => window.fecharDossieLab());

    // ---- Estúdio Molecular (aberto de dentro do laboratório) ----
    await frame.click('#btnOpenStudio');
    const studioEl = await frame.waitForSelector('#studioIframe');
    const studio = await studioEl.contentFrame();
    await studio.waitForLoadState('load').catch(() => {});
    await studio.waitForSelector('.compound-item', { timeout: 10000 });
    await studio.click('.compound-item');
    await studio.waitForTimeout(2500); // motor local (OCL) ou, na falha dele, RDKit/PubChem/CACTUS resolvem a estrutura 3D

    await studio.click('[data-action="abrirDossieChEMBL"]');
    await studio.waitForFunction(() => /ASPIRINA \(MOCK E2E\)/.test(document.getElementById('chemblModalTitle').textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const chembl = await studio.evaluate(() => ({
      title: document.getElementById('chemblModalTitle').textContent || '',
      body: document.getElementById('chemblModalBody').textContent || '',
    }));
    check(/ASPIRINA \(MOCK E2E\)/.test(chembl.title), 'estúdio: dossiê ChEMBL mostra o nome do composto (mock)');
    check(/Ciclo-oxigenase-1 \(mock E2E\)/.test(chembl.body) && /IC50/.test(chembl.body), 'estúdio: dossiê ChEMBL mostra a atividade biológica (mock)');
    check(calls.ebi.some((c) => c.url.includes('/chembl/api/data/molecule/search.json')), 'estúdio: ChEMBL (busca de molécula) chamado');
    check(calls.ebi.some((c) => c.url.includes('/chembl/api/data/activity.json')), 'estúdio: ChEMBL (atividades biológicas) chamado');
    await studio.click('[data-action="fecharDossieChEMBL"]');

    // UniChem via UI de verdade (resolverInChIKeyComposto + anexarCrossReferencesCADD):
    // o composto ativo (1º da lista) resolve o InChIKey pelo PubChem (por nome — a mesma
    // rota GET usada pelo resto do dossiê) e, ao abrir o dossiê CADD, dispara o POST ao
    // UniChem com essa chave e anexa os identificadores cruzados ao próprio modal.
    await esperarAte(() => calls.pubchem.some((c) => /\/property\/InChIKey\b/.test(c.url) && c.method === 'GET'));
    await studio.click('[data-action="abrirModalCADD"]');
    await studio.waitForSelector('#caddModalBody .crossref-item', { timeout: 5000 });
    const crossrefPorNome = await studio.evaluate(() => document.getElementById('caddModalBody').textContent || '');
    check(/drugbank/.test(crossrefPorNome) && /DB00945-E2E/.test(crossrefPorNome), 'estúdio: dossiê CADD mostra os identificadores cruzados do UniChem (mock) após resolver o InChIKey pela UI');
    const unichemCallNome = calls.ebi.find((c) => c.url.includes('/unichem/api/v1/compounds') && c.method === 'POST');
    check(!!unichemCallNome && /BSYNRYMUTXBXSQ-UHFFFAOYSA-N/.test(unichemCallNome.body), 'estúdio: POST ao UniChem enviado com o InChIKey resolvido pelo PubChem (por nome)');
    await studio.click('[data-action="fecharModalCADD"]');

    // Fallback por SMILES + formato PÓS-2025 do PubChem: força a busca por nome do
    // Ibuprofeno a falhar, obrigando resolverInChIKeyComposto() a cair para o POST por
    // SMILES — cujo mock devolve ConnectivitySMILES no lugar de CanonicalSMILES (item 3).
    fail.pubchem.push('name/Ibuprofen/property/InChIKey');
    // O acervo tem bem mais de 40 compostos (lista virtualizada, 1º lote só) — busca
    // pelo nome pra garantir que o Ibuprofeno esteja renderizado antes de clicar.
    await studio.fill('#studioSearchInput', 'Ibuprofeno');
    await studio.waitForSelector('.compound-item:has-text("Ibuprofeno")', { timeout: 3000 });
    await studio.click('.compound-item:has-text("Ibuprofeno")');
    await esperarAte(() => calls.pubchem.some((c) => /\/compound\/smiles\/property\/InChIKey\b/.test(c.url) && c.method === 'POST'));
    fail.pubchem.length = 0;
    const smilesCall = calls.pubchem.find((c) => /\/compound\/smiles\/property\/InChIKey\b/.test(c.url) && c.method === 'POST');
    check(!!smilesCall && smilesCall.body === 'smiles=' + encodeURIComponent('CC(C)CC1=CC=C(C=C1)C(C)C(=O)O'), 'estúdio: fallback por SMILES via POST (corpo smiles=...) quando a busca por nome falha');
    await studio.waitForTimeout(400); // garante que o debounce de 300ms do CADD já preencheu STATE.ultimoDossieCADD
    await studio.click('[data-action="abrirModalCADD"]');
    await studio.waitForSelector('#caddModalBody .crossref-item', { timeout: 5000 });
    const unichemCallSmiles = calls.ebi.filter((c) => c.url.includes('/unichem/api/v1/compounds') && c.method === 'POST').pop();
    check(!!unichemCallSmiles && /HEFNNWSXXWATRW-UHFFFAOYSA-N/.test(unichemCallSmiles.body), 'estúdio: POST ao UniChem enviado com o InChIKey resolvido via fallback SMILES (chave nova do PubChem pós-2025)');
    await studio.click('[data-action="fecharModalCADD"]');

    await studio.click('[data-action="retornarAoLaboratorio"]');
    await frame.waitForFunction(() => document.getElementById('studioIframeModal').style.display === 'none', null, { timeout: 3000 }).catch(() => {});
    await app.page.click('#learn-back');

    // =========================================================================
    // 4. ANATOMIA 3D — RCSB PDB + PubChem (fallback de biohacking)
    // =========================================================================
    frame = await app.openModule('anatomia');
    await frame.evaluate(() => window.abrirPdb('4EY7', 'AChE (E2E)'));
    await frame.waitForFunction(() => !!document.querySelector('#canvas-3d-container canvas'), null, { timeout: 6000 }).catch(() => {});
    check(calls.rcsb.some((c) => c.url.endsWith('/download/4EY7.pdb')), 'anatomia: PDB baixado do RCSB (files.rcsb.org, mock)');
    check(await frame.evaluate(() => !!document.querySelector('#canvas-3d-container canvas')), 'anatomia: estrutura do PDB (mock) chega a montar a cena WebGL');

    // Busca de biohacking sem correspondência local: antes da correção desta tarefa, renderBiohackingCards
    // (app.js) só filtrava ATLAS_DATABASE.protocols e nunca chamava ApiCache.buscarProtocolo (PubChem) —
    // a busca de biohacking.js do o-bala-vip que fazia isso não foi religada na consolidação.
    await frame.evaluate(() => {
      window.AppController.switchTab('view-biohacking');
      const input = document.getElementById('bio-search-input');
      input.value = 'ForcePubchemFallbackE2E';
      input.dispatchEvent(new Event('input'));
    });
    await frame.waitForFunction(() => /forcepubchemfallbacke2e/i.test(document.getElementById('biohacking-results-grid').textContent || ''), null, { timeout: 4000 }).catch(() => {});
    const bioText = await frame.evaluate(() => document.getElementById('biohacking-results-grid').textContent || '');
    check(/forcepubchemfallbacke2e/i.test(bioText), 'anatomia: busca de biohacking sem resultado local cai para o PubChem (mock) — fluxo religado nesta tarefa');
    check(calls.pubchem.some((c) => c.url.includes('forcepubchemfallbacke2e') && /XLogP/.test(c.url)), 'anatomia: PubChem chamado (MolecularWeight,XLogP,CanonicalSMILES) na busca de biohacking');
    await app.page.click('#learn-back');

    // =========================================================================
    // 5. QR — geração 100% local (credencial da plataforma); confirma que
    //    nenhum serviço externo (o antigo api.qrserver.com) é chamado.
    // =========================================================================
    await app.page.waitForTimeout(200); // acomoda o fechamento do módulo anterior antes de trocar de painel
    await app.showPanel('panel-learn');
    await app.page.click('#btn-learn-credential');
    await app.page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 10000 });
    const qrKind = await app.page.evaluate(() => document.getElementById('learn-credential-qr').getAttribute('data-qr-kind'));
    check(qrKind === 'v2' || qrKind === 'legacy', 'plataforma: QR da credencial é gerado (imagem data: local)');
    check(!app.calls.external.some((c) => /qrserver|goqr|qr-code/i.test(c.url)), 'plataforma: nenhuma chamada a um serviço externo de QR — geração local (vendor/qrcode-generator.js)');
    await app.page.click('#learn-credential-close');

    // =========================================================================
    // Verificações globais: nenhuma violação de CSP, nenhum erro de JS.
    // =========================================================================
    reportCsp(violations, 'apis (toxicologia, quiz, laboratório, estúdio, anatomia, credencial)');
    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'sem erros de JavaScript não tratados' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
