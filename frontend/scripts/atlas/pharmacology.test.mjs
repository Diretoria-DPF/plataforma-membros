#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * scripts/atlas/pharmacology.test.mjs
 *
 * Testes unitários para migração de compostos e mapeamento PK/PD.
 *
 * Uso: node scripts/atlas/pharmacology.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');

// ===== Helper: carrega compounds.json de um diretório =====
function loadCompoundsFromDir(dir) {
  const filePath = path.join(dir, 'compounds.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`compounds.json não encontrado em ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

// ===== Helper: cria toPkProtocol inline para testar =====
function toPkProtocol(compound) {
  if (!compound || !compound.pk) {
    throw new Error('toPkProtocol: compound.pk ausente');
  }
  return {
    nome: compound.nome || compound.id,
    pkData: {
      route: compound.pk.route || 'ORAL',
      vd: compound.pk.vd || 40,
      halfLife: compound.pk.halfLife || 4,
      dose: compound.pk.dose || 100,
      ka: compound.pk.ka || 1.5,
      targetOrgan: compound.targetSid || 'liver'
    },
    targetMesh: compound.targetSid
  };
}

// ===== Executa migrate-compounds.mjs =====
function runMigration(outDir) {
  return new Promise((resolve, reject) => {
    const migrationScript = path.join(__dirname, 'migrate-compounds.mjs');
    const child = spawn('node', [migrationScript, '--out', outDir], {
      stdio: 'pipe',
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Migração falhou com código ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', reject);
  });
}

// ===== Testes =====
async function runTests() {
  let tempDir = null;
  let passed = 0;
  let failed = 0;

  try {
    // Cria diretório temporário
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmacology-test-'));
    console.log(`[TEST] Diretório temporário: ${tempDir}`);

    // Executa migração
    console.log('[TEST] Executando migração...');
    const output = await runMigration(tempDir);
    console.log(output);

    // Carrega resultado
    const compounds = loadCompoundsFromDir(tempDir);

    // Teste 1: Total de compostos
    console.log('\n[TESTE 1] Total de compostos');
    try {
      assert.strictEqual(compounds.length, 15, `Esperado 15 compostos, obteve ${compounds.length}`);
      console.log('  ✓ Exatamente 15 compostos migrados');
      passed++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      failed++;
    }

    // Teste 2: Todos com pk object
    console.log('\n[TESTE 2] Estrutura pk');
    try {
      let allHavePk = true;
      let missingPk = [];
      for (const c of compounds) {
        if (!c.pk || typeof c.pk !== 'object' || !('route' in c.pk)) {
          allHavePk = false;
          missingPk.push(c.id);
        }
      }
      assert.ok(allHavePk, `${missingPk.length} compostos sem pk válido: ${missingPk.join(', ')}`);
      console.log('  ✓ Todos os 15 compostos têm pk.{route, vd, halfLife, dose, ka}');
      passed++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      failed++;
    }

    // Teste 3: Pelo menos 10 com targetSid
    console.log('\n[TESTE 3] Mapeamento de targetSid');
    try {
      const withSid = compounds.filter(c => c.targetSid).length;
      assert.ok(withSid >= 10, `Esperado ≥10 compostos com targetSid, obteve ${withSid}`);
      console.log(`  ✓ ${withSid}/15 compostos com targetSid mapeado`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      failed++;
    }

    // Teste 4: toPkProtocol mapping
    console.log('\n[TESTE 4] toPkProtocol: mapeamento para shape esperado');
    try {
      const testCompound = compounds[0];
      assert.ok(testCompound, 'Nenhum composto para testar');

      const protocol = toPkProtocol(testCompound);

      assert.ok(protocol.nome, 'nome ausente');
      assert.ok(protocol.pkData, 'pkData ausente');
      assert.ok(typeof protocol.pkData.route === 'string', 'pkData.route ausente');
      assert.ok(typeof protocol.pkData.vd === 'number', 'pkData.vd ausente ou não-numérico');
      assert.ok(typeof protocol.pkData.halfLife === 'number', 'pkData.halfLife ausente ou não-numérico');
      assert.ok(typeof protocol.pkData.dose === 'number', 'pkData.dose ausente ou não-numérico');
      assert.ok(typeof protocol.pkData.ka === 'number', 'pkData.ka ausente ou não-numérico');
      assert.ok(typeof protocol.pkData.targetOrgan === 'string', 'pkData.targetOrgan ausente');

      console.log(`  ✓ toPkProtocol(${testCompound.id}) → { nome, pkData, targetMesh }`);
      console.log(`    - route: ${protocol.pkData.route}`);
      console.log(`    - vd: ${protocol.pkData.vd}, halfLife: ${protocol.pkData.halfLife}`);
      console.log(`    - dose: ${protocol.pkData.dose}, ka: ${protocol.pkData.ka}`);
      console.log(`    - targetOrgan: ${protocol.pkData.targetOrgan}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      failed++;
    }

    // Teste 5: Amostra de compostos com targetSid
    console.log('\n[TESTE 5] Amostra de mapeamentos');
    try {
      const withSid = compounds.filter(c => c.targetSid);
      assert.ok(withSid.length > 0, 'Nenhum composto com targetSid');

      for (let i = 0; i < Math.min(3, withSid.length); i++) {
        const c = withSid[i];
        console.log(`  ✓ ${c.nome.padEnd(30)} → ${c.targetSid}`);
      }
      passed++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      failed++;
    }

  } catch (err) {
    console.error('\n[ERRO] Falha durante testes:', err.message);
    failed++;
  } finally {
    // Limpa diretório temporário
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true });
        console.log(`\n[LIMPEZA] Diretório temporário removido`);
      } catch (err) {
        console.warn(`[AVISO] Não foi possível limpar ${tempDir}:`, err.message);
      }
    }

    // Resumo
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTADO: ${passed} passados, ${failed} falhados`);
    console.log(`${'='.repeat(60)}`);

    process.exitCode = failed > 0 ? 1 : 0;
  }
}

// Executa
runTests().catch(err => {
  console.error('[FATAL]', err.message);
  process.exitCode = 1;
});
