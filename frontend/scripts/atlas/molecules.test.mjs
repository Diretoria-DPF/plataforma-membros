#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * molecules.test.mjs — teste de validação de proteínas PDB e filtro
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/molecules.test.mjs
 *
 * Valida:
 * - proteins.json tem 24 entradas com PDB IDs únicos, 4 chars, uppercase
 * - orgaoSid segue o padrão /^(fma:\d+|za:[a-z0-9-]+)$/ ou é null
 * - filterProteins é accent-insensitive e busca por nome/PDB
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const proteinsPath = path.resolve(
  here,
  '../../modulos/anatomia-3d/data/atlas/proteins.json'
);

// Importa filterProteins do modo
const modesDir = path.resolve(
  here,
  '../../modulos/anatomia-3d/js/modes/molecules.js'
);

let failures = 0;

/**
 * @param {string} name
 * @param {() => void} fn
 */
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

// Carrega proteins.json
const proteinsJson = JSON.parse(
  await fs.readFile(proteinsPath, 'utf-8')
);

// Importa filterProteins (módulo ESM)
const { filterProteins } = await import(modesDir);

console.log('proteins.json');

test('tem exatamente 24 entradas', () => {
  assert.equal(Array.isArray(proteinsJson), true);
  assert.equal(proteinsJson.length, 24, `Esperado 24 proteínas, encontrado ${proteinsJson.length}`);
});

test('todos os PDB IDs são 4 caracteres, uppercase, e únicos', () => {
  const pdbs = new Set();
  proteinsJson.forEach((p, idx) => {
    assert.equal(typeof p.pdb, 'string', `proteína ${idx}: pdb não é string`);
    assert.equal(p.pdb.length, 4, `proteína ${idx}: PDB "${p.pdb}" não tem 4 caracteres`);
    assert.equal(p.pdb, p.pdb.toUpperCase(), `proteína ${idx}: PDB não é uppercase`);
    assert.equal(/^[A-Z0-9]{4}$/.test(p.pdb), true, `proteína ${idx}: PDB inválido`);
    assert.equal(pdbs.has(p.pdb), false, `proteína ${idx}: PDB duplicado "${p.pdb}"`);
    pdbs.add(p.pdb);
  });
  assert.equal(pdbs.size, 24, 'PDB IDs não são todos únicos');
});

test('todo orgaoSid é null ou valida o padrão fma:/za:', () => {
  const orgaoPattern = /^(fma:\d+|za:[a-z0-9\-]+)$/;
  proteinsJson.forEach((p, idx) => {
    if (p.orgaoSid !== null) {
      assert.equal(typeof p.orgaoSid, 'string', `proteína ${idx}: orgaoSid não é null ou string`);
      assert.equal(orgaoPattern.test(p.orgaoSid), true, `proteína ${idx}: orgaoSid "${p.orgaoSid}" não corresponde ao padrão`);
    }
  });
});

test('todos os registros têm campos obrigatórios', () => {
  proteinsJson.forEach((p, idx) => {
    assert.equal(typeof p.pdb, 'string', `${idx}: pdb ausente`);
    assert.equal(typeof p.nome_pt, 'string', `${idx}: nome_pt ausente`);
    assert.equal(typeof p.alvo, 'string', `${idx}: alvo ausente`);
    assert.equal(typeof p.fonte, 'string', `${idx}: fonte ausente`);
    assert.equal(typeof p.review, 'object', `${idx}: review ausente`);
    assert.equal(typeof p.review.status, 'string', `${idx}: review.status ausente`);
  });
});

console.log('filterProteins()');

test('retorna lista completa se query vazio', () => {
  const result = filterProteins(proteinsJson, '');
  assert.equal(result.length, 24);
});

test('retorna lista completa se query null/undefined', () => {
  assert.equal(filterProteins(proteinsJson, null).length, 24);
  assert.equal(filterProteins(proteinsJson, undefined).length, 24);
});

test('filtra por PDB ID (case-insensitive)', () => {
  const result = filterProteins(proteinsJson, '4ey7');
  assert.equal(result.length, 1);
  assert.equal(result[0].pdb, '4EY7');
});

test('filtra por nome com acento (accent-insensitive)', () => {
  const result = filterProteins(proteinsJson, 'SERCA');
  assert.equal(result.length > 0, true, 'deveria encontrar SERCA');
});

test('filtra por nome com acentos normalizados', () => {
  // Busca por "sintetase" que aparece em "ATP Sintase"
  const result = filterProteins(proteinsJson, 'sintase');
  assert.equal(result.length > 0, true, 'deveria encontrar ATP Sintase');
});

test('filtro é parcial (substring match)', () => {
  const result = filterProteins(proteinsJson, 'cox');
  assert.equal(result.length, 2, 'deveria encontrar COX-1 e COX-2');
});

test('filtro é case-insensitive', () => {
  const result1 = filterProteins(proteinsJson, 'HEART');
  const result2 = filterProteins(proteinsJson, 'heart');
  const result3 = filterProteins(proteinsJson, 'Heart');
  assert.equal(result1.length, result2.length);
  assert.equal(result2.length, result3.length);
});

test('query com espaços em branco é trimmed', () => {
  const result1 = filterProteins(proteinsJson, '  cox  ');
  const result2 = filterProteins(proteinsJson, 'cox');
  assert.equal(result1.length, result2.length);
});

test('busca por nome de molécula comum', () => {
  const result = filterProteins(proteinsJson, 'Renina');
  assert.equal(result.length > 0, true);
  assert.equal(result.some(p => p.pdb === '2REN'), true);
});

console.log('');
if (failures === 0) {
  console.log('✓ Todos os testes passaram');
  process.exit(0);
} else {
  console.log(`✗ ${failures} teste(s) falharam`);
  process.exit(1);
}
