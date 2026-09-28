/**
 * Testes para uberon.mjs (normUberon)
 *
 * Cobre o bug de CI: 14 erros de schema porque ids.uberon vinha do Wikidata
 * como "UBERON_<n>" (estilo purl/OBO) em vez do formato canônico
 * "UBERON:<n>" exigido por content.schema.json (^UBERON:[0-9]+$).
 */
import assert from 'assert';
import { normUberon } from '../uberon.mjs';

function testCanonicalFormat() {
  assert.strictEqual(normUberon('UBERON:0000948'), 'UBERON:0000948');
  console.log('✓ Formato canônico "UBERON:<n>" passa inalterado');
}

function testUnderscoreFormat() {
  // O formato real devolvido pelo Wikidata (propriedade P1554) — a causa raiz
  // dos 14 erros de schema vistos em CI.
  assert.strictEqual(normUberon('UBERON_0000948'), 'UBERON:0000948');
  console.log('✓ Formato com underscore "UBERON_<n>" é normalizado');
}

function testLowercasePrefix() {
  assert.strictEqual(normUberon('uberon:0000948'), 'UBERON:0000948');
  assert.strictEqual(normUberon('uberon_0000948'), 'UBERON:0000948');
  console.log('✓ Prefixo minúsculo é normalizado');
}

function testFullUri() {
  assert.strictEqual(
    normUberon('http://purl.obolibrary.org/obo/UBERON_0000948'),
    'UBERON:0000948'
  );
  assert.strictEqual(
    normUberon('https://purl.obolibrary.org/obo/UBERON_0000948'),
    'UBERON:0000948'
  );
  console.log('✓ URI completa do OBO/purl é normalizada');
}

function testBareDigits() {
  // O formato real devolvido pelo Wikidata para P1554: só o número, sem
  // prefixo "UBERON" algum — a formatter URL da propriedade já contém
  // "obo/UBERON_$1", então o valor gravado na declaração é só "$1". Sem
  // aceitar isso, os 14 sids reais que tinham P1554 na run de CI ficavam
  // SEM ids.uberon (dropados), em vez de com o formato corrigido.
  assert.strictEqual(normUberon('0000948'), 'UBERON:0000948');
  assert.strictEqual(normUberon('  0000948  '), 'UBERON:0000948');
  console.log('✓ Número puro (formato real do Wikidata P1554) é normalizado');
}

function testInvalidReturnsNull() {
  assert.strictEqual(normUberon(undefined), null);
  assert.strictEqual(normUberon(null), null);
  assert.strictEqual(normUberon(''), null);
  assert.strictEqual(normUberon('   '), null);
  assert.strictEqual(normUberon('not-an-uberon-id'), null);
  assert.strictEqual(normUberon('FMA:7088'), null);
  assert.strictEqual(normUberon('UBERON'), null);
  console.log('✓ Valores não reconhecidos devolvem null (campo deve ser omitido)');
}

function runAllTests() {
  console.log('Iniciando testes uberon.mjs...\n');
  try {
    testCanonicalFormat();
    testUnderscoreFormat();
    testLowercasePrefix();
    testFullUri();
    testBareDigits();
    testInvalidReturnsNull();
    console.log('\n✓ Todos os testes de uberon.mjs passaram!');
    return 0;
  } catch (err) {
    console.error('\n✗ Teste falhou:', err.message);
    console.error(err.stack);
    return 1;
  }
}

process.exit(runAllTests());
