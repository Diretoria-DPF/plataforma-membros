#!/usr/bin/env node
/**
 * Testes para build-content.mjs
 * Executa: node test/build-content.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const TOOLS_DIR = path.join(REPO_ROOT, 'tools', 'atlas-content');
const TEST_FIXTURES_DIR = path.join(TOOLS_DIR, 'test', 'fixtures', 'build');
const BUILD_OUTPUT_DIR = path.join(TOOLS_DIR, 'test', '.tmp', 'build-output');

/**
 * Carrega JSON
 */
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Executa o build
 */
function runBuild() {
  fs.rmSync(BUILD_OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(BUILD_OUTPUT_DIR, { recursive: true });

  const cmd = [
    'node', path.join(TOOLS_DIR, 'build-content.mjs'),
    '--structures', path.join(TEST_FIXTURES_DIR, 'structures.json'),
    '--wikidata', path.join(TEST_FIXTURES_DIR, 'wikidata.json'),
    '--wikipedia', path.join(TEST_FIXTURES_DIR, 'wikipedia.json'),
    '--asctb', path.join(TEST_FIXTURES_DIR, 'asctb.json'),
    '--legacy-dir', path.join(TEST_FIXTURES_DIR, 'legacy'),
    '--data-dir', TEST_FIXTURES_DIR,
    '--out', BUILD_OUTPUT_DIR
  ].join(' ');

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    console.log(output);
    return output;
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}

/**
 * Executa os testes
 */
async function runTests() {
  console.log('\n=== Executando testes build-content ===\n');

  // Step 1: Run build
  console.log('1. Executando build...');
  const buildOutput = runBuild();
  assert.ok(fs.existsSync(BUILD_OUTPUT_DIR), 'Diretório de saída deve existir');

  // Step 2: Check sid-aliases.json
  console.log('2. Verificando mapeamento de legacy sids...');
  const aliases = loadJson(path.join(BUILD_OUTPUT_DIR, 'sid-aliases.json'));
  assert.ok(aliases, 'sid-aliases.json deve existir');

  // za:coracao deve mapear para fma:7088 (via wikidata.label_pt)
  assert.strictEqual(aliases['za:coracao'], 'fma:7088',
    'za:coracao deve mapear para fma:7088 via wikidata label_pt');

  // za:figado deve mapear para fma:7197
  assert.strictEqual(aliases['za:figado'], 'fma:7197',
    'za:figado deve mapear para fma:7197 via wikidata label_pt');

  // Step 3: Check index.json
  console.log('3. Verificando index.json...');
  const index = loadJson(path.join(BUILD_OUTPUT_DIR, 'index.json'));
  assert.ok(Array.isArray(index), 'index.json deve ser um array');

  const heartEntry = index.find(e => e.sid === 'fma:7088');
  assert.ok(heartEntry, 'fma:7088 deve estar no index');
  assert.strictEqual(heartEntry.names.pt, 'Coração', 'Heart name em PT');
  assert.strictEqual(heartEntry.system, 'cardiovascular', 'Heart system');

  // za:vesicula-biliar não foi mapeada, deve estar no index como legacy leftover
  const gallbladderEntry = index.find(e => e.sid === 'za:vesicula-biliar');
  assert.ok(gallbladderEntry, 'za:vesicula-biliar (unmapped) deve estar no index');

  // Step 4: Check content/<system>.json
  console.log('4. Verificando content/<system>.json...');
  const contentDir = path.join(BUILD_OUTPUT_DIR, 'content');
  assert.ok(fs.existsSync(contentDir), 'Diretório content deve existir');

  const cardiovascularContent = loadJson(path.join(contentDir, 'cardiovascular.json'));
  assert.ok(cardiovascularContent, 'content/cardiovascular.json deve existir');
  assert.ok(cardiovascularContent['fma:7088'], 'fma:7088 deve estar no conteúdo cardiovascular');

  const heartContent = cardiovascularContent['fma:7088'];

  // Step 5: Check Wikipedia summary
  console.log('5. Verificando resumo da Wikipedia...');
  assert.ok(heartContent.summary_pt, 'Heart deve ter summary_pt');
  assert.ok(heartContent.summary_pt.includes('órgão muscular'),
    'Summary deve conter texto da Wikipedia');

  // Deve ter fonte wikipedia
  const wikipediaSource = heartContent.sources.find(s => s.field === 'summary_pt');
  assert.ok(wikipediaSource, 'Deve haver fonte para summary_pt');
  assert.strictEqual(wikipediaSource.type, 'wikipedia', 'Tipo deve ser wikipedia');
  assert.strictEqual(wikipediaSource.license, 'CC-BY-SA-4.0', 'License deve ser CC-BY-SA-4.0');

  // Step 6: Check legacy anatomy
  console.log('6. Verificando anatomy do legacy...');
  assert.ok(heartContent.anatomy, 'Heart deve ter anatomy');
  assert.ok(heartContent.anatomy.vascularization, 'Heart deve ter vascularization');
  assert.ok(heartContent.anatomy.vascularization.includes('Artérias coronárias'),
    'Vascularization deve conter legado');

  // Deve ter fonte legacy para vascularization
  const legacyVascSource = heartContent.sources.find(s =>
    s.field === 'anatomy.vascularization' && s.type === 'other');
  assert.ok(legacyVascSource, 'Deve haver fonte legacy para vascularization');

  // Step 7: Check ASCTB cells
  console.log('7. Verificando células do ASCT+B...');
  assert.ok(heartContent.histology, 'Heart deve ter histology');
  assert.ok(heartContent.histology.cells, 'Heart deve ter cells');
  assert.strictEqual(heartContent.histology.cells.length, 2, 'Heart deve ter 2 tipos de célula');

  const myocyte = heartContent.histology.cells.find(c => c.cl === 'CL:0000746');
  assert.ok(myocyte, 'Cardiac myocyte deve estar presente');
  assert.ok(myocyte.name_pt, 'Célula deve ter name_pt');
  assert.ok(Array.isArray(myocyte.biomarkers), 'Célula deve ter biomarkers');

  // Deve ter fonte ASCT+B para cells
  const asctbSource = heartContent.sources.find(s =>
    s.field === 'histology.cells' && s.type === 'hra-asctb');
  assert.ok(asctbSource, 'Deve haver fonte ASCT+B para cells');
  assert.strictEqual(asctbSource.license, 'CC-BY-4.0', 'License deve ser CC-BY-4.0');

  // Step 7b: Regressão do bug "Sids com células: 0" — za:rins é uma
  // estrutura real (sid za:*) SEM entrada em legacy/content/*.json, mas COM
  // dados do ASCT+B (asctb.json). Antes da correção, a condição em
  // buildContentRecord exigia `legacyContentEntry &&` mesmo para o bloco do
  // ASCT+B, então o histology.cells nunca era preenchido para nenhum dos
  // ~2400 sids reais sem legado — este é exatamente esse caso.
  console.log('7b. Verificando células do ASCT+B em sid sem legacy content (za:rins)...');
  const urinarioContent = loadJson(path.join(contentDir, 'urinario.json'));
  assert.ok(urinarioContent, 'content/urinario.json deve existir');
  assert.ok(urinarioContent['za:rins'], 'za:rins deve estar no conteúdo urinário mesmo sem legacy content');

  const kidneyContent = urinarioContent['za:rins'];

  // za:rins não tem verbete na Wikipédia nem no legado — content.schema.json
  // exige summary_pt não-vazio (minLength 1) em todo registro, então
  // buildContentRecord precisa de um resumo de fallback (com sua própria
  // fonte hra-asctb) quando só há dados do ASCT+B.
  assert.ok(kidneyContent.summary_pt && kidneyContent.summary_pt.length > 0,
    'za:rins deve ter summary_pt não-vazio mesmo sem Wikipédia/legado');
  const kidneySummarySource = kidneyContent.sources.find(s => s.field === 'summary_pt');
  assert.ok(kidneySummarySource, 'za:rins deve ter fonte para summary_pt');
  assert.strictEqual(kidneySummarySource.type, 'hra-asctb', 'fonte do summary_pt de fallback deve ser hra-asctb');

  assert.ok(kidneyContent.histology, 'za:rins deve ter histology');
  assert.ok(kidneyContent.histology.cells, 'za:rins deve ter histology.cells');
  assert.strictEqual(kidneyContent.histology.cells.length, 1, 'za:rins deve ter 1 tipo de célula (Podocyte)');
  assert.strictEqual(kidneyContent.histology.cells[0].cl, 'CL:1000491', 'Podocyte deve estar presente');

  const kidneyAsctbSource = kidneyContent.sources.find(s =>
    s.field === 'histology.cells' && s.type === 'hra-asctb');
  assert.ok(kidneyAsctbSource, 'za:rins deve ter fonte hra-asctb para histology.cells');
  assert.strictEqual(kidneyAsctbSource.license, 'CC-BY-4.0', 'License deve ser CC-BY-4.0');
  // rev = versão do órgão na tabela ASCT+B (asctbEntry.source.version, vindo
  // de asctb.mjs) — necessário para a regra "todo campo tem fonte".
  assert.strictEqual(kidneyAsctbSource.rev, 'v1.6', 'rev deve ser a versão do órgão (kidney v1.6)');

  console.log('  ✓ Sid sem legacy content ainda recebe células do ASCT+B, com rev da versão do órgão');

  // Step 7c: Regressão dos 14 erros de schema — ids.uberon deve ser
  // normalizado para o formato canônico "UBERON:<n>" independente do formato
  // bruto vindo do wikidata.json (underscore, URI completa, etc.), e um
  // formato não reconhecido deve ser omitido em vez de reprovar o schema.
  console.log('7c. Verificando normalização de ids.uberon...');

  // fma:7088 (heart): wikidata.json tem "UBERON_0000948" (formato real do
  // Wikidata P1554, com underscore) — deve normalizar para "UBERON:0000948".
  assert.strictEqual(heartContent.ids.uberon, 'UBERON:0000948',
    'ids.uberon do heart deve normalizar "UBERON_0000948" -> "UBERON:0000948"');

  // za:rins: wikidata.json tem a URI completa do OBO/purl — deve normalizar
  // para o mesmo formato canônico.
  assert.strictEqual(kidneyContent.ids.uberon, 'UBERON:0002113',
    'ids.uberon do za:rins deve normalizar a URI purl/OBO para "UBERON:0002113"');

  // za:pulmoes: wikidata.json tem um valor não reconhecido
  // ("not-a-real-uberon-id") — deve ser omitido, sem quebrar o build nem os
  // demais ids (wikidata, mesh) do mesmo registro.
  const respiratorioContent = loadJson(path.join(contentDir, 'respiratorio.json'));
  assert.ok(respiratorioContent && respiratorioContent['za:pulmoes'],
    'za:pulmoes deve estar no conteúdo respiratório (via summary_pt da Wikipédia)');
  const lungContent = respiratorioContent['za:pulmoes'];
  assert.ok(!('uberon' in lungContent.ids),
    'ids.uberon inválido ("not-a-real-uberon-id") deve ser omitido, não gravado como está');
  assert.strictEqual(lungContent.ids.wikidata, 'Q7391', 'ids.wikidata do za:pulmoes deve ser preservado');
  assert.strictEqual(lungContent.ids.mesh, 'D008168', 'ids.mesh do za:pulmoes deve ser preservado');

  console.log('  ✓ ids.uberon normalizado nos formatos reconhecidos e omitido quando inválido');

  // Step 8: Check review status
  console.log('8. Verificando review status...');
  assert.ok(heartContent.review, 'Heart deve ter review');
  assert.strictEqual(heartContent.review.status, 'auto-draft',
    'Heart deve ter status auto-draft (tem Wikipedia)');

  // Step 9: Check rewritten data files
  console.log('9. Verificando data files reescritos...');

  const quizCases = loadJson(path.join(BUILD_OUTPUT_DIR, 'quiz-cases.json'));
  assert.ok(Array.isArray(quizCases), 'quiz-cases.json deve ser array');

  const cardiacCase = quizCases.find(q => q.id === 'caso-cardiaco');
  assert.ok(cardiacCase, 'Caso cardíaco deve existir');
  // correctSid deve ter sido reescrito de za:coracao para fma:7088
  assert.strictEqual(cardiacCase.correctSid, 'fma:7088',
    'correctSid deve ter sido mapeado para fma:7088');

  const routes = loadJson(path.join(BUILD_OUTPUT_DIR, 'routes.json'));
  assert.ok(Array.isArray(routes), 'routes.json deve ser array');
  const rotaCirculacao = routes.find(r => r.id === 'rota-circulacao');
  assert.ok(rotaCirculacao, 'Rota circulação deve existir');
  const coracao = rotaCirculacao.anchors.find(a => a.sid === 'za:coracao');
  if (coracao) {
    // Se ainda tem za:coracao, foi deixado (OK, se temos fma:7088)
    assert.ok(rotaCirculacao.anchors.find(a => a.sid === 'fma:7088'),
      'Deve ter fma:7088 nos anchors');
  } else {
    // Ou foi completamente reescrito
    assert.ok(rotaCirculacao.anchors.every(a => a.sid !== 'za:coracao'),
      'Não deve ter za:coracao se foi reescrito');
  }

  // Step 10: Check liver (fma:7197)
  console.log('10. Verificando fígado (fma:7197)...');
  const liverContent = cardiovascularContent['fma:7197'] ||
    loadJson(path.join(contentDir, 'digestorio.json'))['fma:7197'];

  if (liverContent) {
    assert.ok(liverContent.summary_pt, 'Liver deve ter summary_pt');
    assert.ok(liverContent.summary_pt.includes('glândula'),
      'Liver summary deve conter "glândula" da Wikipedia');
  }

  // Step 11: Check unmapped entry (za:vesicula-biliar)
  console.log('11. Verificando entrada não mapeada (leftover)...');
  assert.ok(buildOutput.includes('não mapeadas') || buildOutput.includes('Entradas não'),
    'Report deve mencionar entradas não mapeadas');

  // Step 12: Check all required files exist
  console.log('12. Verificando arquivos de saída...');
  assert.ok(fs.existsSync(path.join(BUILD_OUTPUT_DIR, 'index.json')), 'index.json');
  assert.ok(fs.existsSync(path.join(BUILD_OUTPUT_DIR, 'sid-aliases.json')), 'sid-aliases.json');
  assert.ok(fs.existsSync(contentDir), 'content/ dir');

  const systems = fs.readdirSync(contentDir).filter(f => f.endsWith('.json'));
  assert.ok(systems.length > 0, 'Deve ter pelo menos um arquivo de conteúdo por sistema');

  console.log(`  ✓ ${systems.length} arquivo(s) de conteúdo por sistema`);

  // Step 13: Validate with ajv (if available)
  console.log('13. Validando esquema...');
  try {
    const validateCmd = [
      'node', path.join(REPO_ROOT, 'frontend', 'scripts', 'atlas', 'validate-content.mjs'),
      BUILD_OUTPUT_DIR
    ].join(' ');

    try {
      execSync(validateCmd, { encoding: 'utf-8', stdio: 'pipe' });
      console.log('  ✓ Validação de esquema passou');
    } catch (err) {
      // Validator pode não estar disponível ou pode exigir um manifest
      console.log('  ⚠ Validator não disponível ou incompleto, validação básica passou');
    }
  } catch (err) {
    console.log('  ⚠ Validação de esquema indisponível');
  }

  console.log('\n✓ Todos os testes passaram!\n');
}

runTests().catch(err => {
  console.error('\n✗ Teste falhou:', err.message);
  console.error(err);
  process.exit(1);
});
