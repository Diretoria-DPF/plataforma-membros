import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseCsv, findHeader, extractRecords, aggregate } from '../asctb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

/**
 * Testa parsing RFC4180 com aspas e vírgulas
 */
function testQuotedParsing() {
  const csv = `name,description
John,"Descrição com, vírgula"
Jane,"Texto com ""aspas duplas"" dentro"`;

  const rows = parseCsv(csv);
  assert.strictEqual(rows.length, 3, 'Deve ter 3 linhas');
  assert.strictEqual(rows[1][1], 'Descrição com, vírgula', 'Deve manter vírgulas dentro de aspas');
  assert.strictEqual(rows[2][1], 'Texto com "aspas duplas" dentro', 'Deve converter aspas duplas em uma aspa');
  console.log('✓ Teste de parsing com aspas passou');
}

/**
 * Testa detecção de cabeçalho ASCT+B
 */
function testHeaderDetection() {
  const csv = `Metadata Row 1
Metadata Row 2
AS/1,AS/1/LABEL,AS/1/ID,CT/1,CT/1/LABEL,CT/1/ID
Data Row 1,Heart,UBERON:0000948,Cardiomyocyte,Cardiomiócito,CL:0000746`;

  const rows = parseCsv(csv);
  const headerIndex = findHeader(rows);
  assert.strictEqual(headerIndex, 2, 'Cabeçalho deve estar na linha 2 (índice 2)');
  console.log('✓ Teste de detecção de cabeçalho passou');
}

/**
 * Testa extração de registros
 */
function testExtractRecords() {
  const csv = `AS/1,AS/1/LABEL,AS/1/ID,CT/1,CT/1/LABEL,CT/1/ID
Heart,Coração,UBERON:0000948,Cardiomyocyte,Cardiomiócito,CL:0000746
Heart,Coração,UBERON:0000948,Endothelial cell,Célula endotelial,CL:0000115`;

  const rows = parseCsv(csv);
  const headerIndex = findHeader(rows);
  const records = extractRecords(rows, headerIndex);

  assert.strictEqual(records.length, 2, 'Deve ter 2 registros');
  assert.strictEqual(records[0]['AS/1'], 'Heart', 'Primeiro registro deve ser Heart');
  assert.strictEqual(records[0]['CT/1/ID'], 'CL:0000746', 'Deve extrair CT ID corretamente');
  console.log('✓ Teste de extração de registros passou');
}

/**
 * Testa agregação e deduplicação
 */
function testAggregation() {
  const records = [
    {
      'AS/1': 'Heart',
      'AS/1/LABEL': 'Coração',
      'AS/1/ID': 'UBERON:0000948',
      'AS/2': 'Left ventricle',
      'AS/2/LABEL': 'Ventrículo esquerdo',
      'AS/2/ID': 'UBERON:0002084',
      'CT/1': 'Cardiomyocyte',
      'CT/1/LABEL': 'Cardiomiócito',
      'CT/1/ID': 'CL:0000746',
      'BGene/1/LABEL': 'MYH7',
      'BProtein/1/LABEL': 'TNNT2'
    },
    {
      'AS/1': 'Heart',
      'AS/1/LABEL': 'Coração',
      'AS/1/ID': 'UBERON:0000948',
      'AS/2': 'Left ventricle',
      'AS/2/LABEL': 'Ventrículo esquerdo',
      'AS/2/ID': 'UBERON:0002084',
      'CT/1': 'Cardiomyocyte',
      'CT/1/LABEL': 'Cardiomiócito',
      'CT/1/ID': 'CL:0000746',
      'BGene/1/LABEL': 'MYH7',
      'BProtein/1/LABEL': 'TNNT2'
    }
  ];

  const aggregated = aggregate(records);

  // Deve ter apenas 1 chave (UBERON:0002084, a mais profunda)
  assert.strictEqual(Object.keys(aggregated).length, 1, 'Deve agregar por AS ID mais profundo');

  const asId = 'UBERON:0002084';
  assert(aggregated[asId], 'Deve ter entrada para UBERON:0002084');
  assert.strictEqual(aggregated[asId].cells.length, 1, 'Deve ter 1 tipo de célula (sem duplicatas)');
  assert.strictEqual(aggregated[asId].cells[0].cl, 'CL:0000746', 'CL ID deve ser correto');
  assert.deepStrictEqual(
    aggregated[asId].biomarkers.sort(),
    ['MYH7', 'TNNT2'],
    'Biomarcadores devem ser deduplicados'
  );
  console.log('✓ Teste de agregação e deduplicação passou');
}

/**
 * Testa validação de CL IDs
 */
function testClIdValidation() {
  const records = [
    {
      'AS/1': 'Heart',
      'AS/1/LABEL': 'Coração',
      'AS/1/ID': 'UBERON:0000948',
      'CT/1': 'Valid Cell',
      'CT/1/LABEL': 'Célula válida',
      'CT/1/ID': 'CL:0000746', // válido: CL:xxxxxxx (7 dígitos)
      'BGene/1/LABEL': 'MYH7'
    },
    {
      'AS/1': 'Heart',
      'AS/1/LABEL': 'Coração',
      'AS/1/ID': 'UBERON:0000948',
      'CT/1': 'Invalid Cell',
      'CT/1/LABEL': 'Célula inválida',
      'CT/1/ID': 'CL:123', // inválido: menos de 7 dígitos
      'BGene/1/LABEL': 'MYH7'
    },
    {
      'AS/1': 'Heart',
      'AS/1/LABEL': 'Coração',
      'AS/1/ID': 'UBERON:0000948',
      'CT/1': 'Invalid Cell',
      'CT/1/LABEL': 'Célula inválida',
      'CT/1/ID': 'CL:00007461234', // inválido: mais de 7 dígitos
      'BGene/1/LABEL': 'MYH7'
    }
  ];

  const aggregated = aggregate(records);
  const asId = 'UBERON:0000948';

  // Deve ter apenas 1 célula válida
  assert.strictEqual(aggregated[asId].cells.length, 1, 'Deve rejeitar CL IDs com formato inválido');
  assert.strictEqual(aggregated[asId].cells[0].cl, 'CL:0000746', 'Deve manter apenas o CL ID válido');
  console.log('✓ Teste de validação de CL IDs passou');
}

/**
 * Testa mapeamento de SID (FMA direto, UBERON via wikidata)
 */
function testSidMapping() {
  // Esta função não é exportada, então vamos testar através do CLI
  console.log('✓ Mapeamento de SID será testado no teste de CLI');
}

/**
 * Testa CLI end-to-end com --offline-dir
 */
function testCliEndToEnd() {
  const offlineDir = fixturesDir;
  const outFile = path.join(fixturesDir, '.tmp', 'asctb-test.json');
  const wikidataFile = path.join(fixturesDir, 'wikidata.asctb.json');

  // Cria diretório temporário se não existir
  const tmpDir = path.dirname(outFile);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Executa o script CLI
  const scriptPath = path.join(__dirname, '..', 'asctb.mjs');

  try {
    execSync(
      `node ${scriptPath} --organs heart --wikidata ${wikidataFile} --out ${outFile} --offline-dir ${offlineDir}`,
      { cwd: __dirname, stdio: 'inherit' }
    );
  } catch (error) {
    console.error('Erro ao executar CLI:', error.message);
    throw error;
  }

  // Verifica resultado
  assert(fs.existsSync(outFile), 'Arquivo de saída deve existir');

  const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));

  // Verifica estrutura
  assert(result.bySid, 'Deve ter propriedade bySid');
  assert(Array.isArray(result.unmapped), 'Deve ter array unmapped');
  assert(Array.isArray(result.processed), 'Deve ter array processed');

  // Verifica conteúdo
  assert(Object.keys(result.bySid).length > 0, 'Deve ter pelo menos um sid mapeado');

  // Verifica que tem entries para sids do coração
  const expectedSids = ['uberon:0002084', 'uberon:0002080', 'uberon:0000079'];
  const actualSids = Object.keys(result.bySid);

  for (const expectedSid of expectedSids) {
    assert(actualSids.includes(expectedSid), `Deve mapear ${expectedSid}`);
  }

  // Verifica que UBERON:0000948 (heart root) está em unmapped ou não (dependendo do mapeamento)
  // De acordo com wikidata.asctb.json, todos os UBERONs devem estar mapeados

  // Verifica estrutura de um sid
  const firstSid = actualSids[0];
  const sidData = result.bySid[firstSid];
  assert(sidData.cells, `${firstSid} deve ter propriedade cells`);
  assert(Array.isArray(sidData.cells), `${firstSid}.cells deve ser um array`);
  assert(sidData.tissues, `${firstSid} deve ter propriedade tissues`);
  assert(Array.isArray(sidData.tissues), `${firstSid}.tissues deve ser um array`);
  assert(sidData.source, `${firstSid} deve ter propriedade source`);
  assert.strictEqual(sidData.source.organ, 'heart', 'source.organ deve ser heart');
  assert.strictEqual(sidData.source.license, 'CC-BY-4.0', 'source.license deve ser CC-BY-4.0');

  // Verifica que células têm formato correto
  if (sidData.cells.length > 0) {
    const firstCell = sidData.cells[0];
    assert(firstCell.cl, 'Célula deve ter cl');
    assert(/^CL:\d{7}$/.test(firstCell.cl), 'CL deve ter formato CL:xxxxxxx');
    assert(firstCell.name_en, 'Célula deve ter name_en');
    assert(Array.isArray(firstCell.biomarkers), 'Biomarkers deve ser array');
  }

  console.log('✓ Teste CLI end-to-end passou');
  console.log(`  - ${Object.keys(result.bySid).length} sids mapeados`);
  console.log(`  - ${result.unmapped.length} sids não mapeados`);
  console.log(`  - órgãos processados: ${result.processed.join(', ')}`);
}

/**
 * Executa todos os testes
 */
function runAllTests() {
  console.log('Iniciando testes ASCT+B...\n');

  try {
    testQuotedParsing();
    testHeaderDetection();
    testExtractRecords();
    testAggregation();
    testClIdValidation();
    testSidMapping();
    testCliEndToEnd();

    console.log('\n✓ Todos os testes passaram!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Teste falhou:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllTests();
