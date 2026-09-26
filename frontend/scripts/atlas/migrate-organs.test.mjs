#!/usr/bin/env node
/**
 * scripts/atlas/migrate-organs.test.mjs
 *
 * Testes para o script de migração de órgãos (bio-database → atlas v2)
 *
 * Uso: node scripts/atlas/migrate-organs.test.mjs
 * Executa com exit code 0 se todos os testes passarem, 1 senão.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');
const LEGACY_DIR = path.join(ATLAS_DATA_DIR, 'legacy');
const LEGACY_CONTENT_DIR = path.join(LEGACY_DIR, 'content');
const SCHEMA_DIR = path.join(ATLAS_DATA_DIR, 'schema');

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

// ===== Carrega arquivos gerados =====
let indexData = null;
let contentBySystem = {};
let schemas = {};

try {
  const indexPath = path.join(LEGACY_DIR, 'index.legacy.json');
  indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
} catch (err) {
  console.error(`Erro ao carregar index.legacy.json: ${err.message}`);
  process.exitCode = 1;
  process.exit(1);
}

// Carrega conteúdo
try {
  const files = fs.readdirSync(LEGACY_CONTENT_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const system = file.replace('.json', '');
      const filePath = path.join(LEGACY_CONTENT_DIR, file);
      contentBySystem[system] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }
} catch (err) {
  console.error(`Erro ao carregar conteúdo: ${err.message}`);
  process.exitCode = 1;
  process.exit(1);
}

// Carrega esquemas
try {
  const indexSchemaPath = path.join(SCHEMA_DIR, 'index.schema.json');
  const contentSchemaPath = path.join(SCHEMA_DIR, 'content.schema.json');

  schemas.index = JSON.parse(fs.readFileSync(indexSchemaPath, 'utf8'));
  schemas.content = JSON.parse(fs.readFileSync(contentSchemaPath, 'utf8'));
} catch (err) {
  console.error(`Erro ao carregar esquemas: ${err.message}`);
  process.exitCode = 1;
  process.exit(1);
}

// ===== Testes =====

console.log('Migração de órgãos');

test('Mínimo 55 órgãos foram migrados', () => {
  assert.ok(indexData.length >= 55, `Esperado >= 55 órgãos, obteve ${indexData.length}`);
});

test('Todos os sistemas foram mapeados', () => {
  const systems = new Set(indexData.map(e => e.system));
  assert.ok(systems.size > 0, 'Nenhum sistema encontrado');

  // Valida que todos os systems são válidos (do contracts.js)
  const validSystems = [
    'esqueletico', 'muscular', 'articular', 'cardiovascular',
    'nervoso', 'respiratorio', 'digestorio', 'urinario',
    'reprodutor', 'endocrino', 'linfatico', 'tegumentar'
  ];

  for (const sys of systems) {
    assert.ok(validSystems.includes(sys), `Sistema inválido: ${sys}`);
  }
});

test('Entrada do coração existe com sid fma:7088 e PT "Coração"', () => {
  const coracao = indexData.find(e => e.names.pt === 'Coração' || e.sid === 'fma:7088');
  assert.ok(coracao, 'Coração não encontrado no índice');
  assert.equal(coracao.sid, 'fma:7088', `SID esperado fma:7088, obteve ${coracao.sid}`);
  assert.equal(coracao.names.pt, 'Coração', `Nome PT esperado "Coração", obteve "${coracao.names.pt}"`);
});

test('Todo registro de conteúdo tem review.status = legacy-unverified', () => {
  for (const [system, entries] of Object.entries(contentBySystem)) {
    for (const [sid, record] of Object.entries(entries)) {
      assert.ok(
        record.review && record.review.status === 'legacy-unverified',
        `${system}/${sid}: review.status deve ser legacy-unverified, obteve ${record.review?.status}`
      );
    }
  }
});

test('Todo registro de conteúdo tem pelo menos uma source', () => {
  for (const [system, entries] of Object.entries(contentBySystem)) {
    for (const [sid, record] of Object.entries(entries)) {
      assert.ok(
        record.sources && record.sources.length >= 1,
        `${system}/${sid}: deve ter pelo menos uma source`
      );
    }
  }
});

test('Índice respeita o schema', () => {
  // Validação manual (o Ajv não está importado aqui para manter simplicidade)
  // Apenas checa estrutura básica
  assert.ok(Array.isArray(indexData), 'Índice deve ser array');

  for (const entry of indexData) {
    assert.ok(entry.sid, `Entry ${JSON.stringify(entry)} falta sid`);
    assert.ok(entry.system, `Entry ${entry.sid} falta system`);
    assert.ok(entry.layer, `Entry ${entry.sid} falta layer`);
    assert.ok(entry.names, `Entry ${entry.sid} falta names`);
    assert.ok(entry.names.pt, `Entry ${entry.sid} falta names.pt`);

    // Valida sid pattern
    assert.ok(/^(fma:[0-9]+|za:[a-z0-9]+(-[a-z0-9]+)*)$/.test(entry.sid),
      `Entry ${entry.sid} não segue padrão de sid`);

    // Valida layer enum
    const validLayers = ['pele', 'musculos', 'esqueleto', 'visceras', 'vasos', 'nervos', 'linfatico'];
    assert.ok(validLayers.includes(entry.layer),
      `Entry ${entry.sid}: layer "${entry.layer}" não é válido`);
  }
});

test('Conteúdo respeita o schema estruturalmente', () => {
  for (const [system, entries] of Object.entries(contentBySystem)) {
    assert.ok(typeof entries === 'object', `${system} deve ser objeto`);

    for (const [sid, record] of Object.entries(entries)) {
      assert.ok(record.ids, `${system}/${sid} falta ids`);
      assert.ok(record.summary_pt, `${system}/${sid} falta summary_pt`);
      assert.ok(record.review, `${system}/${sid} falta review`);
      assert.ok(record.review.status, `${system}/${sid} falta review.status`);
      assert.ok(record.sources, `${system}/${sid} falta sources`);
      assert.ok(Array.isArray(record.sources), `${system}/${sid} sources deve ser array`);
    }
  }
});

test('Contagem de órgãos por sistema', () => {
  const counts = {};
  for (const entry of indexData) {
    counts[entry.system] = (counts[entry.system] || 0) + 1;
  }

  // Relatório
  console.log('  Órgãos migrados por sistema:');
  for (const [sys, count] of Object.entries(counts).sort()) {
    console.log(`    ${sys}: ${count}`);
  }
});

// ===== Resultado final =====
console.log('');
if (failures === 0) {
  console.log('✓ Todos os testes passaram');
  process.exitCode = 0;
} else {
  console.error(`✗ ${failures} teste(s) falharam`);
  process.exitCode = 1;
}
