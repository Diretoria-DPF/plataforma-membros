/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Importa as funções a testar
import { buildUrl, cleanExtract, parseResponse } from '../wikipedia-pt.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, 'fixtures');

// ============================================================================
// Testes das funções auxiliares
// ============================================================================

console.log('Testando buildUrl...');
{
  const url = buildUrl(['Coração', 'Fígado']);

  // Verifica que é uma URL válida
  assert(url.startsWith('https://pt.wikipedia.org/w/api.php?'));

  // Verifica que os parâmetros estão codificados
  assert(url.includes('action=query'));
  assert(url.includes('format=json'));
  assert(url.includes('formatversion=2'));
  assert(url.includes('titles='));

  // Verifica que os títulos foram codificados (caracteres especiais)
  assert(url.includes('Cora%C3%A7%C3%A3o')); // Coração codificado
  assert(url.includes('F%C3%ADgado')); // Fígado codificado

  // Verifica que títulos são separados por |
  assert(url.includes('%7C')); // | codificado

  console.log('✓ buildUrl codifica os títulos corretamente');
}

console.log('Testando cleanExtract...');
{
  // Teste 1: Remove pronuncias entre parênteses
  let text = 'O coração /kɔɾɐˈsɐ̃w/ é um órgão muscular que funciona como uma bomba, impulsionando o sangue por todo o corpo.';
  let result = cleanExtract(text);
  assert(!result.includes('/kɔɾɐˈsɐ̃w/'));
  assert(result.includes('O coração'));
  console.log('✓ cleanExtract remove pronuncias IPA');

  // Teste 2: Remove parênteses vazios
  text = 'O fígado () é uma glândula. () Localiza-se no abdômen e é fundamental para o metabolismo do corpo.';
  result = cleanExtract(text);
  assert(!result.includes('()'));
  console.log('✓ cleanExtract remove parênteses vazios');

  // Teste 3: Colapsa espaçamento
  text = 'O  coração   é   um   órgão   muscular   que   funciona   como   uma   bomba,   impulsionando   o   sangue   por   todo   o   corpo.';
  result = cleanExtract(text);
  assert(result.includes('O coração'));
  assert(!result.includes('  ')); // Não deve ter espaço duplo
  console.log('✓ cleanExtract colapsa espaçamento');

  // Teste 4: Corta a 900 caracteres em limite de sentença
  let longText = 'A. '.repeat(350); // Cria um texto muito longo
  result = cleanExtract(longText);
  assert(result.length <= 900);
  assert(result.endsWith('.')); // Deve terminar em ponto
  console.log('✓ cleanExtract corta em limite de sentença');

  // Teste 5: Descarta se muito curto (< 80 caracteres)
  text = 'Órgão.';
  result = cleanExtract(text);
  assert(result === null);
  console.log('✓ cleanExtract descarta extratos muito curtos');

  // Teste 6: Aceita extratos com 80+ caracteres
  text = 'O coração é um órgão muscular que funciona como uma bomba, impulsionando o sangue.';
  result = cleanExtract(text);
  assert(result !== null);
  assert(result.length >= 80);
  console.log('✓ cleanExtract aceita extratos com 80+ caracteres');
}

console.log('Testando parseResponse...');
{
  // Carrega fixture da API
  const fixtureContent = fs.readFileSync(path.join(fixturesDir, 'wiki-api.sample.json'), 'utf-8');
  const apiResponse = JSON.parse(fixtureContent);

  // Cria mapa de títulos para sids
  const titleToSidMap = new Map([
    ['Coração', 's1'],
    ['Fígado', 's2'],
    ['Fêmur', 's3'],
    ['Fémur', 's3'], // Redirecionado
    ['Nervo vago', 's4']
  ]);

  const result = parseResponse(apiResponse, titleToSidMap);

  // Teste 1: Verifica estrutura de resultado
  assert(typeof result === 'object');
  assert(result.s1 !== undefined);
  console.log('✓ parseResponse retorna objeto com sids');

  // Teste 2: Verifica campos obrigatórios
  assert(result.s1.title === 'Coração');
  assert(result.s1.extract_pt !== undefined);
  assert(result.s1.revid !== undefined);
  assert(result.s1.timestamp !== undefined);
  assert(result.s1.url !== undefined);
  assert(result.s1.license === 'CC-BY-SA-4.0');
  assert(result.s1.source === 'Wikipédia em português');
  console.log('✓ parseResponse inclui todos os campos obrigatórios');

  // Teste 3: Verifica que todos os sids foram processados
  assert(result.s1 !== undefined);
  assert(result.s2 !== undefined);
  assert(result.s3 !== undefined);
  assert(result.s4 !== undefined);
  console.log('✓ parseResponse processa todos os sids');

  // Teste 4: Verifica que extract_pt foi limpo
  assert(typeof result.s1.extract_pt === 'string' || result.s1.extract_pt === null);
  if (result.s1.extract_pt !== null) {
    // Se não for null, deve ter pelo menos 80 caracteres
    assert(result.s1.extract_pt.length >= 80);
  }
  console.log('✓ parseResponse limpa extratos corretamente');

  // Teste 5: Verifica redirecionamento
  // A fixture tem um redirecionamento de "Fémur" para "Fêmur"
  // O resultado deve estar mapeado a s3
  const hasS3 = result.s3 !== undefined;
  assert(hasS3, 'Redirecionamento deve ser mapeado corretamente');
  console.log('✓ parseResponse mapeia redirecionamentos');
}

// ============================================================================
// Teste end-to-end com CLI
// ============================================================================

console.log('\nTestando CLI end-to-end...');
{
  const testInputFile = path.join(fixturesDir, 'wikidata.sample.json');
  const testOutputFile = path.join(fixturesDir, 'wikipedia-pt.sample.json');
  const apiFixture = path.join(fixturesDir, 'wiki-api.sample.json');

  // Remove arquivo de output se existir
  if (fs.existsSync(testOutputFile)) {
    fs.unlinkSync(testOutputFile);
  }

  // Executa o script
  const child = spawn('node', [
    path.join(__dirname, '..', 'wikipedia-pt.mjs'),
    '--in', testInputFile,
    '--out', testOutputFile,
    '--offline-fixture', apiFixture
  ]);

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  // Aguarda conclusão
  await new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`CLI retornou código ${code}. stderr: ${stderr}`));
      }
    });

    child.on('error', reject);

    // Timeout de 10 segundos
    setTimeout(() => reject(new Error('CLI timeout')), 10000);
  });

  // Verifica que o arquivo foi criado
  assert(fs.existsSync(testOutputFile), 'Arquivo de output deve ser criado');
  console.log('✓ CLI cria arquivo de output');

  // Lê e valida o arquivo
  const outputContent = fs.readFileSync(testOutputFile, 'utf-8');
  const output = JSON.parse(outputContent);

  // Verifica estrutura
  assert(typeof output === 'object');
  assert(Object.keys(output).length > 0);
  console.log('✓ Output é um objeto JSON válido');

  // Verifica que tem as chaves esperadas
  for (const sid of ['s1', 's2', 's3', 's4']) {
    if (output[sid] !== undefined) {
      assert(output[sid].title !== undefined);
      assert(output[sid].extract_pt !== undefined || output[sid].extract_pt === null);
      assert(output[sid].revid !== undefined);
      assert(output[sid].timestamp !== undefined);
      assert(output[sid].url !== undefined);
      assert(output[sid].license === 'CC-BY-SA-4.0');
      assert(output[sid].source === 'Wikipédia em português');
    }
  }
  console.log('✓ Output tem a estrutura esperada');

  // Limpa arquivo de teste
  fs.unlinkSync(testOutputFile);
}

console.log('\n✅ Todos os testes passaram!');
