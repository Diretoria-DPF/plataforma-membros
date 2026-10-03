#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lint-pt.test.mjs — Tests for the Portuguese linter
 *
 * Usage: node frontend/scripts/atlas/lint-pt.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGlossary, buildMatchers, lintText, lintContent } from './lint-pt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..', '..');
const glossaryPath = path.join(frontendDir, 'modulos', 'anatomia-3d', 'data', 'atlas', 'glossario-pt.json');

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

// Load test glossary with known avoid terms
const testGlossary = [
  {
    id: 'baco',
    term_pt: 'baço',
    term_la: 'lien',
    term_en: 'spleen',
    avoid: ['Spleen']
  },
  {
    id: 'medula-espinal',
    term_pt: 'medula espinal',
    term_la: 'medulla spinalis',
    term_en: 'spinal cord',
    avoid: ['Spinal cord', 'medula espinhal']
  },
  {
    id: 'tuba-uterina',
    term_pt: 'tuba uterina',
    term_la: 'tuba uterina',
    term_en: 'fallopian tube',
    avoid: ['Fallopian tube', 'trompa de Falópio']
  },
  {
    id: 'nervo-vago',
    term_pt: 'nervo vago',
    term_la: 'nervus vagus',
    term_en: 'vagus nerve',
    avoid: ['Vagus nerve']
  }
];

const matchers = buildMatchers(testGlossary);

console.log('lintText() — detecção de palavras inteiras');

test('detecta "Spleen" no meio de frase', () => {
  const findings = lintText('The Spleen is an organ.', matchers);
  assert.equal(findings.length, 1, 'deve encontrar 1 achado');
  assert.equal(findings[0].avoid, 'Spleen');
  assert.equal(findings[0].suggest, 'baço');
});

test('não detecta "Spleen" como parte de outra palavra', () => {
  const findings = lintText('Spleenish is not a word.', matchers);
  // Depending on the regex, this should not match
  const spleenMatch = findings.find(f => f.avoid === 'Spleen' && f.suggest === 'baço');
  // The word boundary should prevent "Spleenish" from matching
  assert.ok(!spleenMatch, 'não deve detectar "Spleen" em "Spleenish"');
});

test('detecta "Spleen" no início da frase', () => {
  const findings = lintText('Spleen is important.', matchers);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].avoid, 'Spleen');
});

test('detecta "Spleen" no final da frase', () => {
  const findings = lintText('This is the Spleen.', matchers);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].avoid, 'Spleen');
});

console.log('\nlintText() — case-insensitive matching');

test('detecta "spleen" em minúsculas', () => {
  const findings = lintText('The spleen is an organ.', matchers);
  assert.ok(findings.some(f => f.avoid === 'Spleen' && f.suggest === 'baço'));
});

test('detecta "SPLEEN" em maiúsculas', () => {
  const findings = lintText('The SPLEEN is an organ.', matchers);
  assert.ok(findings.some(f => f.avoid === 'Spleen' && f.suggest === 'baço'));
});

console.log('\nlintText() — phrase matching');

test('detecta frases com espaço "Spinal cord"', () => {
  const findings = lintText('Damage to the Spinal cord is serious.', matchers);
  const match = findings.find(f => f.avoid === 'Spinal cord');
  assert.ok(match, 'deve detectar "Spinal cord"');
  assert.equal(match.suggest, 'medula espinal');
});

test('detecta "medula espinhal" (com acento)', () => {
  const findings = lintText('A medula espinhal está protegida.', matchers);
  const match = findings.find(f => f.avoid === 'medula espinhal');
  assert.ok(match, 'deve detectar "medula espinhal"');
});

test('detecta "Vagus nerve"', () => {
  const findings = lintText('The Vagus nerve is important.', matchers);
  assert.ok(findings.some(f => f.avoid === 'Vagus nerve'));
});

console.log('\nlintContent() — skipped keys');

test('não linta chaves "sources"', () => {
  const obj = {
    summary_pt: 'The Spleen is...',
    sources: 'Spleen anatomy textbook'
  };
  const findings = lintContent(obj, matchers);
  // Should find 1 (in summary_pt) but not in sources
  const inSummary = findings.filter(f => f.path.includes('summary_pt'));
  const inSources = findings.filter(f => f.path.includes('sources'));
  assert.ok(inSummary.length > 0, 'deve linter summary_pt');
  assert.equal(inSources.length, 0, 'não deve linter sources');
});

test('não linta chaves "name_en"', () => {
  const obj = {
    summary_pt: 'O baço é um órgão.',
    name_en: 'Spleen'
  };
  const findings = lintContent(obj, matchers);
  // Should not find anything (none of our test terms match in Portuguese)
  const inNameEn = findings.filter(f => f.path.includes('name_en'));
  assert.equal(inNameEn.length, 0, 'não deve linter name_en');
});

test('não linta chaves "url"', () => {
  const obj = {
    summary_pt: 'O coração.',
    url: 'https://Spleen.com'
  };
  const findings = lintContent(obj, matchers);
  const inUrl = findings.filter(f => f.path.includes('url'));
  assert.equal(inUrl.length, 0, 'não deve linter url');
});

console.log('\nlintContent() — nested paths');

test('relata caminho aninhado de array', () => {
  const obj = {
    items: [
      { desc: 'The Spleen is good.' },
      { desc: 'Normal text.' }
    ]
  };
  const findings = lintContent(obj, matchers);
  const found = findings.find(f => f.path.includes('items[0]'));
  assert.ok(found, 'deve reportar path items[0].desc');
  assert.equal(found.avoid, 'Spleen');
});

test('relata caminho profundamente aninhado', () => {
  const obj = {
    data: {
      details: {
        info: 'Spinal cord injury'
      }
    }
  };
  const findings = lintContent(obj, matchers);
  const found = findings.find(f => f.path.includes('data.details.info'));
  assert.ok(found, 'deve reportar path completo');
  assert.equal(found.avoid, 'Spinal cord');
});

console.log('\nGlossário estrutural — validação');

test('glossário existe e é carregável', () => {
  assert.ok(fs.existsSync(glossaryPath), `Glossário deve existir em ${glossaryPath}`);
  const glossary = loadGlossary(glossaryPath);
  assert.ok(Array.isArray(glossary), 'glossário deve ser um array');
  assert.ok(glossary.length > 0, 'glossário deve ter pelo menos 1 entrada');
});

test('todas as entradas têm "id" e "term_pt"', () => {
  const glossary = loadGlossary(glossaryPath);
  for (const entry of glossary) {
    assert.ok(entry.id, `entrada falta id: ${JSON.stringify(entry)}`);
    assert.ok(entry.term_pt, `entrada falta term_pt: ${JSON.stringify(entry)}`);
  }
});

test('todos os "id" são kebab-case ascii', () => {
  const glossary = loadGlossary(glossaryPath);
  const idPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  for (const entry of glossary) {
    assert.ok(
      idPattern.test(entry.id),
      `id "${entry.id}" não é kebab-case válido`
    );
  }
});

test('não há "id" duplicados', () => {
  const glossary = loadGlossary(glossaryPath);
  const ids = glossary.map(e => e.id);
  const uniqueIds = new Set(ids);
  assert.equal(
    ids.length,
    uniqueIds.size,
    'há ids duplicados no glossário'
  );
});

test('não há "avoid" duplicados dentro de uma entrada', () => {
  const glossary = loadGlossary(glossaryPath);
  for (const entry of glossary) {
    if (!entry.avoid || !Array.isArray(entry.avoid)) continue;
    const uniqueAvoid = new Set(entry.avoid);
    assert.equal(
      entry.avoid.length,
      uniqueAvoid.size,
      `entrada "${entry.id}" tem termos duplicados em "avoid"`
    );
  }
});

test('nenhum "avoid" é igual ao próprio "term_pt"', () => {
  const glossary = loadGlossary(glossaryPath);
  for (const entry of glossary) {
    if (!entry.avoid || !Array.isArray(entry.avoid)) continue;
    for (const avoid of entry.avoid) {
      assert.notEqual(
        avoid.toLowerCase(),
        entry.term_pt.toLowerCase(),
        `entrada "${entry.id}" tem "avoid" igual a "term_pt": "${avoid}"`
      );
    }
  }
});

console.log('\nlintContent() — identificadores não são linted');

test('ignora sid, sids, distractorSids e id', () => {
  const obj = { sid: 'Spleen', id: 'Spleen', sids: ['Spleen'], distractorSids: ['Spleen'], name_pt: 'Spleen' };
  const findings = lintContent(obj, matchers);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, 'name_pt');
});

console.log('\nMatchers gerados do glossário');

test('buildMatchers cria regex válidos', () => {
  const glossary = loadGlossary(glossaryPath);
  const mats = buildMatchers(glossary);
  assert.ok(Array.isArray(mats), 'deve retornar um array');
  assert.ok(mats.length > 0, 'deve ter pelo menos 1 matcher');

  for (const matcher of mats) {
    assert.ok(matcher.id, 'matcher deve ter id');
    assert.ok(matcher.avoid, 'matcher deve ter avoid');
    assert.ok(matcher.term_pt, 'matcher deve ter term_pt');
    assert.ok(matcher.re instanceof RegExp, 'matcher deve ter regexp compilada');
  }
});

console.log('\n');
if (failures > 0) {
  console.error(`${failures} teste(s) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todos os testes passaram.');
}
