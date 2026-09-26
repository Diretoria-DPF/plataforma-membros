/**
 * parsers.e2e.js — testes de unidade (Node puro, sem navegador) para os
 * parsers de APIs científicas mantidos por este agente:
 *   - modulos/quiz/quiz-apis.js        (RxNav/RxClass, PubChem, ChEBI)
 *   - modulos/laboratorio/js/lab-apis.js (PubChem, CACTUS, Wikidata, ChEBI)
 *
 * Carrega o arquivo de verdade num sandbox `vm` com um `fetch` stub que
 * devolve corpos no formato real de cada API (inclusive o formato novo do
 * PubChem PUG-REST, que desde 2025 devolve ConnectivitySMILES/SMILES no
 * lugar de CanonicalSMILES/IsomericSMILES) — sem precisar de rede nem de
 * navegador. O objetivo é travar a regressão de contrato que já quebrou
 * esses módulos uma vez.
 *
 * A parte do OpenFDA (modulos/toxicologia/app.js) fica fora do sandbox `vm`:
 * fetchOpenFdaWarning é uma função privada de uma IIFE, sem acesso externo.
 * Por isso, ao final deste arquivo, um pequeno trecho Playwright (mesmo
 * harness dos outros *.e2e.js) exercita o fluxo real do módulo com um mock
 * próprio do api.fda.gov, cobrindo especificamente o 404 "sem resultado" e
 * o fallback novo para `warnings_and_cautions`.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const FRONTEND_ROOT = path.join(__dirname, '..', '..');

/** Carrega um script de escopo global (const/var no topo) num contexto `vm` isolado, com um `fetch` stub. */
function loadGlobalScript(relPath, fetchImpl) {
  const abs = path.join(FRONTEND_ROOT, relPath);
  const code = fs.readFileSync(abs, 'utf8');
  const sandbox = { console, AbortController, setTimeout, clearTimeout, URLSearchParams, fetch: fetchImpl };
  sandbox.window = sandbox; // "window.X = X" no arquivo também vira global do contexto
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: abs });
  return context;
}

/** Lê um identificador de topo (const/let) do contexto — não fica em `context.<nome>` diretamente. */
function getGlobal(context, name) {
  return vm.runInContext(name, context);
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function textResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => { throw new Error('corpo não é JSON'); } };
}

async function testQuizApis() {
  // 1) PubChem (2025): resposta sem CanonicalSMILES/IsomericSMILES, só ConnectivitySMILES/SMILES.
  {
    const context = loadGlobalScript('modulos/quiz/quiz-apis.js', async (url) => {
      if (url.includes('/property/')) {
        return jsonResponse(200, { PropertyTable: { Properties: [{
          CID: 2244, MolecularFormula: 'C9H8O4', MolecularWeight: '180.16', IUPACName: 'aspirin',
          ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
        }] } });
      }
      return jsonResponse(404, {});
    });
    const QuizAPIEngine = getGlobal(context, 'QuizAPIEngine');
    const info = await QuizAPIEngine.buscarEstruturaMolecular('Aspirina');
    check(!!info && info.smiles === 'CC(=O)OC1=CC=CC=C1C(=O)O', 'quiz-apis: PubChem sem CanonicalSMILES/IsomericSMILES ainda resolve o SMILES (ConnectivitySMILES/SMILES)');
    check(!!info && info.pesoMolecular === '180.16', 'quiz-apis: MolecularWeight (agora string) chega intacto, sem quebrar (só é exibido)');
  }

  // 2) RxNav sem correspondência exata em rxcui.json → cai para approximateTerm.json; nome PT é normalizado.
  {
    const calls = [];
    const context = loadGlobalScript('modulos/quiz/quiz-apis.js', async (url) => {
      calls.push(url);
      if (url.includes('rxcui.json')) return jsonResponse(200, { idGroup: {} }); // sem rxnormId
      if (url.includes('approximateTerm.json')) return jsonResponse(200, { approximateGroup: { candidate: [{ rxcui: '161' }] } });
      if (url.includes('rxclass/class/byRxcui.json')) return jsonResponse(200, { rxclassDrugInfoList: { rxclassDrugInfo: [{ rxclassMinConceptItem: { className: 'Analgésicos' } }] } });
      return jsonResponse(404, {});
    });
    const QuizAPIEngine = getGlobal(context, 'QuizAPIEngine');
    const perfil = await QuizAPIEngine.buscarPerfilFarmacologico('Paracetamol');
    check(calls.some((u) => u.includes('rxcui.json') && u.includes('name=acetaminophen')), 'quiz-apis: nome em português é normalizado para o RxNav (paracetamol → acetaminophen)');
    check(!!perfil && perfil.rxcui === '161', 'quiz-apis: RxNav sem match exato em rxcui.json cai para approximateTerm.json');
    check(!!perfil && perfil.classes.includes('Analgésicos'), 'quiz-apis: RxClass retorna a classe ATC depois do RxCUI resolvido pelo fallback');
  }

  // 3) RxClass: item sem rxclassMinConceptItem não deve derrubar o parsing (filtrado).
  {
    const context = loadGlobalScript('modulos/quiz/quiz-apis.js', async (url) => {
      if (url.includes('rxcui.json')) return jsonResponse(200, { idGroup: { rxnormId: ['1191'] } });
      if (url.includes('rxclass/class/byRxcui.json')) return jsonResponse(200, { rxclassDrugInfoList: { rxclassDrugInfo: [{}, { rxclassMinConceptItem: { className: 'Salicilatos' } }] } });
      return jsonResponse(404, {});
    });
    const QuizAPIEngine = getGlobal(context, 'QuizAPIEngine');
    const perfil = await QuizAPIEngine.buscarPerfilFarmacologico('Aspirina');
    check(!!perfil && perfil.classes.length === 1 && perfil.classes[0] === 'Salicilatos', 'quiz-apis: item de RxClass sem rxclassMinConceptItem é filtrado, não derruba o parsing');
  }

  // 4) ChEBI (EBI Search): definição com marcação HTML chega limpa (texto puro).
  {
    const context = loadGlobalScript('modulos/quiz/quiz-apis.js', async () => jsonResponse(200, {
      entries: [{ id: 'CHEBI:15365', fields: { definition: ['<p>Anti-inflamatório <i>não esteroidal</i>.</p>'] } }],
    }));
    const QuizAPIEngine = getGlobal(context, 'QuizAPIEngine');
    const info = await QuizAPIEngine.buscarDefinicaoBiologica('Aspirina');
    check(!!info && info.definicao === 'Anti-inflamatório não esteroidal.', 'quiz-apis: definição do ChEBI vem sem marcação HTML');
  }
}

async function testLabApis() {
  // 5) PubChem (2025) no laboratório: ConnectivitySMILES no lugar de CanonicalSMILES; MolecularWeight (string) vira número.
  {
    const context = loadGlobalScript('modulos/laboratorio/js/lab-apis.js', async (url) => {
      if (url.includes('/property/')) {
        return jsonResponse(200, { PropertyTable: { Properties: [{
          CID: 338, MolecularFormula: 'C7H6O3', MolecularWeight: '138.12', IUPACName: '2-hydroxybenzoic acid',
          ConnectivitySMILES: 'OC(=O)c1ccccc1O',
        }] } });
      }
      return jsonResponse(404, {});
    });
    const engine = getGlobal(context, 'ChemicalAPIEngine');
    const info = await engine.fetchPubChem('Ácido salicílico');
    check(!!info && info.smiles === 'OC(=O)c1ccccc1O', 'lab-apis: PubChem sem CanonicalSMILES ainda resolve o SMILES (ConnectivitySMILES)');
    check(!!info && typeof info.molarMass === 'number' && Math.abs(info.molarMass - 138.12) < 1e-6, 'lab-apis: MolecularWeight (string) é convertido a número sem virar NaN');
    check(!!info && info.pesoMolecular === info.molarMass, 'lab-apis: pesoMolecular espelha molarMass');
  }

  // 6) CACTUS: 404 devolve null sem lançar; 200 com página de erro em HTML também devolve null.
  {
    const engine404 = getGlobal(loadGlobalScript('modulos/laboratorio/js/lab-apis.js', async () => textResponse(404, 'Page not found')), 'ChemicalAPIEngine');
    const r1 = await engine404.fetchCactus('ComponenteInexistenteE2E', 'smiles');
    check(r1 === null, 'lab-apis: CACTUS 404 devolve null (sem lançar exceção)');

    const engineHtml = getGlobal(loadGlobalScript('modulos/laboratorio/js/lab-apis.js', async () => textResponse(200, '<!DOCTYPE html><html>Page not found</html>')), 'ChemicalAPIEngine');
    const r2 = await engineHtml.fetchCactus('ComponenteInexistenteE2E', 'smiles');
    check(r2 === null, 'lab-apis: CACTUS 200 com página de erro em HTML também devolve null');
  }

  // 7) Wikidata SPARQL: results.bindings[].{cas,chembl,pubchem}.value.
  {
    const context = loadGlobalScript('modulos/laboratorio/js/lab-apis.js', async () => jsonResponse(200, {
      results: { bindings: [{ cas: { value: '69-72-7' }, chembl: { value: 'CHEMBL424' }, pubchem: { value: '338' } }] },
    }));
    const engine = getGlobal(context, 'ChemicalAPIEngine');
    const info = await engine.fetchWikidata('Salicylic acid');
    check(!!info && info.cas === '69-72-7' && info.chemblId === 'CHEMBL424' && info.pubchemCid === '338', 'lab-apis: Wikidata SPARQL — bindings.cas/chembl/pubchem extraídos');
  }

  // 8) Fallback em cascata: PubChem indisponível (404) → CACTUS assume a resolução estrutural.
  {
    const context = loadGlobalScript('modulos/laboratorio/js/lab-apis.js', async (url) => {
      if (url.includes('pubchem.ncbi.nlm.nih.gov')) return textResponse(404, 'PUGREST.NotFound');
      if (url.includes('cactus.nci.nih.gov')) {
        if (url.endsWith('/smiles')) return textResponse(200, 'OC(=O)c1ccccc1O');
        if (url.endsWith('/iupac_name')) return textResponse(200, '2-hydroxybenzoic acid');
        if (url.endsWith('/formula')) return textResponse(200, 'C7H6O3');
      }
      if (url.includes('query.wikidata.org')) return jsonResponse(200, { results: { bindings: [] } });
      if (url.includes('ebi.ac.uk')) return jsonResponse(200, { entries: [] });
      return textResponse(404, 'not mocked');
    });
    const engine = getGlobal(context, 'ChemicalAPIEngine');
    const dados = await engine.resolveCompleteCompound('Ácido salicílico');
    check(!!dados && dados.origem === 'CACTUS Fallback (NCI/NIH)' && dados.smiles === 'OC(=O)c1ccccc1O', 'lab-apis: PubChem indisponível (404) → cai para CACTUS no fluxo completo (resolveCompleteCompound)');
  }

  // 9) ChEBI (EBI Search) no laboratório: definição com HTML também chega limpa.
  {
    const context = loadGlobalScript('modulos/laboratorio/js/lab-apis.js', async () => jsonResponse(200, {
      entries: [{ id: 'CHEBI:16914', fields: { definition: ['<p>Ácido monocarboxílico <b>aromático</b>.</p>'] } }],
    }));
    const engine = getGlobal(context, 'ChemicalAPIEngine');
    const info = await engine.fetchChebiOntology('Ácido salicílico');
    check(!!info && info.definicao === 'Ácido monocarboxílico aromático.', 'lab-apis: definição do ChEBI (EBI Search) vem sem marcação HTML');
  }
}

/** Mock isolado do api.fda.gov (independente do de apis.e2e.js) para os dois cenários do fix desta tarefa. */
function installOpenFdaMock(context) {
  const calls = [];
  let scenario = 'notfound';
  context.route('https://api.fda.gov/**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    if (scenario === 'notfound') {
      // Formato real do OpenFDA quando a busca não acha nada.
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No matches found!' } }) });
    }
    if (scenario === 'warnings_and_cautions') {
      // Bulas no formato OTC/Drug Facts costumam trazer só este campo (sem boxed_warning/warnings/overdosage).
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        results: [{ warnings_and_cautions: ['ALERTA WARNINGS_AND_CAUTIONS E2E (mock): risco em superdosagem.'] }],
      }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return { calls, setScenario: (s) => { scenario = s; } };
}

/** Toxicologia/OpenFDA: fetchOpenFdaWarning é privada (IIFE) — exercitada via UI real com Playwright, como os demais *.e2e.js. */
async function testToxicologiaOpenFda() {
  const app = await startApp({ role: 'member' });
  const mock = installOpenFdaMock(app.context);
  try {
    await app.login();

    // Cenário A: OpenFDA sem correspondência (404 NOT_FOUND) — não pode travar nem virar erro de JS.
    mock.setScenario('notfound');
    let frame = await app.openModule('toxico');
    await frame.click('.topic-btn'); // "Antídotos" — questão 1 cita "paracetamol"
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');
    await frame.click('.option');
    await frame.waitForFunction(() => {
      const tag = document.getElementById('apiDataSourceTag');
      return !!tag && !tag.hidden && tag.dataset.source;
    }, null, { timeout: 4000 }).catch(() => {});
    const notFoundState = await frame.evaluate(() => ({
      tagSource: (document.getElementById('apiDataSourceTag') || {}).dataset && document.getElementById('apiDataSourceTag').dataset.source,
      hasAlert: !!document.querySelector('#explanationText .fda-alert'),
    }));
    check(notFoundState.tagSource === 'local', 'toxicologia: OpenFDA 404 (sem resultado) cai para a base local, sem travar');
    check(!notFoundState.hasAlert, 'toxicologia: OpenFDA 404 — nenhum alerta falso é inserido na explicação');
    check(mock.calls.some((u) => /generic_name/.test(u) && /acetaminophen/i.test(decodeURIComponent(u))), 'toxicologia: URL do OpenFDA leva o campo e o termo mapeado (paracetamol → acetaminophen) corretamente codificados');
    await app.page.click('#learn-back');

    // Cenário B: bula só com `warnings_and_cautions` (formato OTC) — cobre o fallback novo desta tarefa.
    mock.setScenario('warnings_and_cautions');
    frame = await app.openModule('toxico');
    await frame.click('.topic-btn');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');
    await frame.click('.option');
    await frame.waitForFunction(() => {
      const tag = document.getElementById('apiDataSourceTag');
      return !!tag && !tag.hidden && tag.dataset.source === 'fda';
    }, null, { timeout: 4000 }).catch(() => {});
    const alertText = await frame.evaluate(() => (document.querySelector('#explanationText .fda-alert') || {}).textContent || '');
    check(/ALERTA WARNINGS_AND_CAUTIONS E2E \(mock\)/.test(alertText), 'toxicologia: bula sem boxed_warning/warnings/overdosage cai para warnings_and_cautions (fix desta tarefa)');
    await app.page.click('#learn-back');

    const realErrors = app.errors.filter((e) => !/\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/.test(e));
    check(realErrors.length === 0, 'toxicologia/OpenFDA: sem erros de JavaScript não tratados' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function parsers() {
  await testQuizApis();
  await testLabApis();
  await testToxicologiaOpenFda();
};
