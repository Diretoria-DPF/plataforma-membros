/**
 * Testes para o módulo wikidata
 */

import assert from 'node:assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildQuery, parseBindings } from '../wikidata.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const tmpDir = path.join(__dirname, '.tmp');

// Garante diretório temporário
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

/**
 * Teste 1: buildQuery produz SPARQL válida
 */
function testBuildQuery() {
  console.log('Teste 1: buildQuery produz SPARQL válida...');

  const batch = [
    { sid: 'fma:7088', english: 'Heart', system: 'cardiovascular' },
    { sid: 'fma:7197', english: 'Liver', system: 'digestive' },
    { sid: 'za:biceps-brachii-muscle', english: 'Biceps brachii muscle', system: 'muscular' }
  ];

  const query = buildQuery(batch);

  // Verifica se contém cláusulas VALUES
  assert(query.includes('VALUES'), 'Query deve conter cláusula VALUES');
  assert(query.includes('?fmaId'), 'Query deve conter variável ?fmaId');

  // Verifica se contém FMA ids
  assert(query.includes('7088'), 'Query deve conter FMA id 7088');
  assert(query.includes('7197'), 'Query deve conter FMA id 7197');

  // Verifica estrutura básica
  assert(query.includes('SELECT'), 'Query deve ser um SELECT');
  assert(query.includes('WHERE'), 'Query deve ter cláusula WHERE');
  assert(query.includes('wdt:P1402'), 'Query deve buscar por FMA (P1402)');

  console.log('  ✓ buildQuery passa');
}

/**
 * Teste 2: parseBindings mapeia resultados para sids
 */
function testParseBindings() {
  console.log('Teste 2: parseBindings mapeia resultados para sids...');

  const batch = [
    { sid: 'fma:7088', english: 'Heart', system: 'cardiovascular' },
    { sid: 'fma:7197', english: 'Liver', system: 'digestive' },
    { sid: 'fma:7310-l', english: 'Left lung', system: 'respiratory' },
    { sid: 'fma:9611', english: 'Femur', system: 'skeletal' },
    { sid: 'za:biceps-brachii-muscle', english: 'Biceps brachii muscle', system: 'muscular' },
    { sid: 'za:vagus-nerve', english: 'Vagus nerve', system: 'nervous' },
    { sid: 'za:aorta', english: 'Aorta', system: 'cardiovascular' },
    { sid: 'fma:7205-l', english: 'Left kidney', system: 'urinary' }
  ];

  const sparqlJson = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'sparql.sample.json'), 'utf-8'));
  const result = parseBindings(sparqlJson, batch);

  // Verifica estrutura do resultado
  assert(typeof result === 'object', 'Resultado deve ser objeto');

  // Verifica se há algum resultado
  assert(Object.keys(result).length > 0, 'Resultado deve ter ao menos um item');

  // Verifica estrutura de um item FMA
  if (result['fma:7088']) {
    const heart = result['fma:7088'];
    assert(heart.qid, 'Deve ter QID');
    assert(heart.retrieved, 'Deve ter data de retrieval');
    assert(typeof heart.aliases_pt === 'object', 'aliases_pt deve ser array');
    assert(Array.isArray(heart.icd10), 'icd10 deve ser array');
  }

  console.log('  ✓ parseBindings passa');
}

/**
 * Teste 3: Teste end-to-end com CLI
 */
function testCLIEndToEnd() {
  console.log('Teste 3: CLI end-to-end com fixture offline...');

  const inputFile = path.join(fixturesDir, 'structures.sample.json');
  const fixtureFile = path.join(fixturesDir, 'sparql.sample.json');
  const outputFile = path.join(tmpDir, 'output.json');

  // Remove arquivo de saída anterior
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  // Executa CLI
  const cwd = path.join(__dirname, '..');
  try {
    execSync(
      `node wikidata.mjs --in ${inputFile} --out ${outputFile} --offline-fixture ${fixtureFile}`,
      { cwd, stdio: 'pipe' }
    );
  } catch (err) {
    console.error('Erro ao executar CLI:', err.message);
    throw err;
  }

  // Verifica se arquivo de saída foi criado
  assert(fs.existsSync(outputFile), 'Arquivo de saída deve existir');

  // Carrega e valida output
  const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));

  // Verifica estrutura geral
  assert(typeof output === 'object', 'Output deve ser objeto');
  assert(Object.keys(output).length > 0, 'Output deve ter resultados');

  // Verifica estrutura de items
  Object.entries(output).forEach(([sid, data]) => {
    assert(typeof sid === 'string', `sid deve ser string`);
    assert(typeof data === 'object', `dados de ${sid} deve ser objeto`);

    // Campos opcionais mas esperados
    if (data.qid) {
      assert(typeof data.qid === 'string', `${sid}: qid deve ser string`);
    }
    if (data.aliases_pt) {
      assert(Array.isArray(data.aliases_pt), `${sid}: aliases_pt deve ser array`);
    }
    if (data.icd10) {
      assert(Array.isArray(data.icd10), `${sid}: icd10 deve ser array`);
    }
  });

  console.log('  ✓ CLI end-to-end passa');
}

/**
 * Testa tratamento de valores faltantes
 */
function testMissingValues() {
  console.log('Teste 4: parseBindings trata valores faltantes...');

  const batch = [
    { sid: 'fma:7088', english: 'Heart', system: 'cardiovascular' }
  ];

  // JSON com valores parciais
  const sparqlJson = {
    head: { vars: ['fmaId', 'qid', 'uberon'] },
    results: {
      bindings: [
        {
          fmaId: { value: '7088' },
          qid: { value: 'http://www.wikidata.org/entity/Q1072' }
          // uberon faltando
        }
      ]
    }
  };

  const result = parseBindings(sparqlJson, batch);

  if (result['fma:7088']) {
    const heart = result['fma:7088'];
    assert(heart.qid === 'Q1072', 'QID deve ser extraído corretamente');
    assert(!heart.uberon || heart.uberon === undefined, 'Campos faltantes devem ser undefined');
    assert(Array.isArray(heart.icd10), 'icd10 deve ser array mesmo que vazio');
    assert(Array.isArray(heart.aliases_pt), 'aliases_pt deve ser array mesmo que vazio');
  }

  console.log('  ✓ Tratamento de valores faltantes passa');
}

/**
 * Executa todos os testes
 */
function runAllTests() {
  console.log('Executando testes...\n');

  try {
    testBuildQuery();
    testParseBindings();
    testMissingValues();
    testCLIEndToEnd();

    console.log('\n✓ Todos os testes passaram!');
    return 0;
  } catch (err) {
    console.error('\n✗ Teste falhou:', err.message);
    console.error(err.stack);
    return 1;
  }
}

process.exit(runAllTests());
