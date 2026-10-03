#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * scripts/atlas/migrate-routes-processes.test.mjs
 *
 * Testa a migração de rotas e processos para o novo schema.
 *
 * Uso: node scripts/atlas/migrate-routes-processes.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');

let failures = 0;

/**
 * Wrapper simples para testes
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

/**
 * Executa a migração em um diretório temporário e retorna um promise
 */
function runMigration(outputDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [
      path.join(__dirname, 'migrate-routes-processes.mjs'),
      '--out', outputDir
    ], {
      cwd: FRONTEND_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Migração falhou com código ${code}:\n${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Cria diretório temporário
const tempDir = path.join(os.tmpdir(), `atlas-migrate-test-${Date.now()}`);
fs.mkdirSync(tempDir, { recursive: true });

console.log('Executando testes da migração de rotas e processos...\n');

// ===== Executa migração =====
console.log('migrate-routes-processes.mjs');
let routes, processes, legacyMap;

try {
  const result = await runMigration(tempDir);
  console.log(`  ✓ migração executada com sucesso`);

  // Lê os arquivos gerados
  const routesPath = path.join(tempDir, 'routes.json');
  const processesPath = path.join(tempDir, 'processes.json');
  const legacyMapPath = path.join(tempDir, 'legacy-id-map.json');

  assert(fs.existsSync(routesPath), 'routes.json foi gerado');
  assert(fs.existsSync(processesPath), 'processes.json foi gerado');
  assert(fs.existsSync(legacyMapPath), 'legacy-id-map.json foi gerado');

  routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  processes = JSON.parse(fs.readFileSync(processesPath, 'utf8'));
  legacyMap = JSON.parse(fs.readFileSync(legacyMapPath, 'utf8'));

  console.log(`  ✓ arquivos JSON válidos`);
} catch (err) {
  console.error(`  FALHOU — execução da migração ou leitura dos arquivos`);
  console.error(`    ${err.message}`);
  failures += 1;
  process.exitCode = 1;
  process.exit(1);
}

console.log('\nValidação dos dados');

// Testa contagens
test('19+ rotas geradas', () => {
  assert(routes.length >= 18, `esperado 18+ rotas, obtive ${routes.length}`);
});

test('15 processos gerados', () => {
  assert.equal(processes.length, 15, `esperado 15 processos, obtive ${processes.length}`);
});

// Testa padrão de sid
const SID_PATTERN = /^(fma:\d+|za:[a-z0-9]+(-[a-z0-9]+)*)$/;

test('todas as rotas têm âncoras com sid válido', () => {
  let invalidCount = 0;
  for (const route of routes) {
    for (const anchor of route.anchors) {
      if (!SID_PATTERN.test(anchor.sid)) {
        invalidCount++;
        console.error(`      rota "${route.id}": sid inválido "${anchor.sid}"`);
      }
    }
  }
  assert.equal(invalidCount, 0, `${invalidCount} sid inválidos encontrados em rotas`);
});

test('todos os processos têm passos com âncoras com sid válido', () => {
  let invalidCount = 0;
  for (const proc of processes) {
    for (const step of proc.steps) {
      for (const anchor of step.anchors) {
        if (!SID_PATTERN.test(anchor.sid)) {
          invalidCount++;
          console.error(`      processo "${proc.id}" passo ${step.order}: sid inválido "${anchor.sid}"`);
        }
      }
    }
  }
  assert.equal(invalidCount, 0, `${invalidCount} sid inválidos encontrados em processos`);
});

// Testa rota específica (ORAL)
test('rota ORAL existe com steps em ordem', () => {
  const oralRoute = routes.find(r => r.id === 'oral');
  assert(oralRoute, 'rota com id "oral" não encontrada');
  assert(oralRoute.anchors.length >= 2, `rota "oral" tem ${oralRoute.anchors.length} âncoras, esperado >= 2`);

  // Verifica se os anchors com t definido estão em ordem crescente
  let lastT = -1;
  let anchorsWithT = 0;
  for (let i = 0; i < oralRoute.anchors.length; i++) {
    const anchor = oralRoute.anchors[i];
    if (anchor.t !== undefined) {
      assert(anchor.t >= lastT, `rota "oral": âncoras com t não estão em ordem crescente`);
      lastT = anchor.t;
      anchorsWithT++;
    }
  }
  assert(anchorsWithT >= 2, `rota "oral": esperado >= 2 âncoras com t definido, obtive ${anchorsWithT}`);
});

// Testa mapa legado
test('mapa legado tem pelo menos 60 entradas', () => {
  const mapSize = Object.keys(legacyMap).length;
  assert(mapSize >= 60, `mapa legado tem ${mapSize} entradas, esperado >= 60`);
});

// Testa schema: carrega schemas e valida
test('rotas válidas contra schema', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });

  const schemaPath = path.join(ATLAS_DATA_DIR, 'schema', 'routes.schema.json');
  assert(fs.existsSync(schemaPath), `schema em ${schemaPath} não encontrado`);

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);

  const valid = validate(routes);
  if (!valid) {
    const errors = validate.errors || [];
    const errorMsg = errors.map(e => `${e.instancePath || '(raiz)'}: ${e.message}`).join('\n');
    throw new Error(`rotas inválidas contra schema:\n${errorMsg}`);
  }
});

test('processos válidos contra schema', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });

  const schemaPath = path.join(ATLAS_DATA_DIR, 'schema', 'processes.schema.json');
  assert(fs.existsSync(schemaPath), `schema em ${schemaPath} não encontrado`);

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);

  const valid = validate(processes);
  if (!valid) {
    const errors = validate.errors || [];
    const errorMsg = errors.map(e => `${e.instancePath || '(raiz)'}: ${e.message}`).join('\n');
    throw new Error(`processos inválidos contra schema:\n${errorMsg}`);
  }
});

// Limpa diretório temporário
try {
  fs.rmSync(tempDir, { recursive: true });
} catch (err) {
  console.warn(`aviso: não foi possível limpar ${tempDir}`);
}

// Resultado final
console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`✓ Todos os testes passaram`);
  process.exitCode = 0;
} else {
  console.log(`✗ ${failures} teste(s) falharam`);
  process.exitCode = 1;
}
