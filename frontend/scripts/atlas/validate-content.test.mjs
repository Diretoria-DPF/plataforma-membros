#!/usr/bin/env node
/**
 * scripts/atlas/validate-content.test.mjs
 *
 * Teste simples (sem framework, só node:assert) para validate-content.mjs.
 * Roda o validador contra as fixtures reais (espera sucesso) e contra cópias
 * mutadas em um diretório temporário (espera falha) para cada um destes
 * problemas: fonte ausente, nó órfão, nome em PT ausente, quiz referenciando
 * sid desconhecido e licenças mistas no mesmo asset.
 *
 * Uso: node scripts/atlas/validate-content.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const VALIDATOR = path.join(__dirname, 'validate-content.mjs');
const FIXTURES_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas', 'fixtures');

let passCount = 0;
let failCount = 0;

function check(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failCount++;
    console.error(`  FALHOU - ${name}`);
    console.error(`    ${err.message}`);
  }
}

function runValidator(dir, args = []) {
  const result = spawnSync(process.execPath, [VALIDATOR, dir, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

/** Copia as fixtures para um diretório novo em tmp e devolve o caminho. */
function cloneFixtures(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `atlas-fixtures-${label}-`));
  fs.cpSync(FIXTURES_DIR, dir, { recursive: true });
  return dir;
}

function cleanup(dirs) {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

const tmpDirs = [];

console.log('[teste] validate-content.mjs');

// 1) As fixtures reais devem passar.
check('as fixtures geradas passam na validação', () => {
  const { status, stderr } = runValidator(FIXTURES_DIR);
  assert.equal(status, 0, `esperava exit 0, obteve ${status}. stderr:\n${stderr}`);
});

// 2) Fonte ausente: remove a única source de um campo preenchido (summary_pt do coração).
{
  const dir = cloneFixtures('fonte-ausente');
  tmpDirs.push(dir);
  const contentPath = path.join(dir, 'content', 'cardiovascular.json');
  const data = readJson(contentPath);
  data['fma:7088'].sources = data['fma:7088'].sources.filter((s) => s.field !== 'summary_pt');
  writeJson(contentPath, data);

  check('detecta campo de conteúdo sem fonte associada', () => {
    const { status, stderr } = runValidator(dir);
    assert.notEqual(status, 0, 'esperava falha (fonte ausente)');
    assert.match(stderr, /não tem nenhuma fonte/);
  });
}

// 3) Nó órfão: manifesto aponta um nó para um sid que não existe em index.json.
{
  const dir = cloneFixtures('no-orfao');
  tmpDirs.push(dir);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = readJson(manifestPath);
  manifest.assets[0].nodeToSid['NoFantasma'] = 'za:estrutura-inexistente';
  writeJson(manifestPath, manifest);

  check('detecta nó do manifesto que aponta para sid inexistente (nó órfão)', () => {
    const { status, stderr } = runValidator(dir);
    assert.notEqual(status, 0, 'esperava falha (nó órfão)');
    assert.match(stderr, /nó órfão|não existe em index\.json/);
  });
}

// 4) Nome em PT ausente: remove names.pt de uma entrada do índice.
{
  const dir = cloneFixtures('sem-nome-pt');
  tmpDirs.push(dir);
  const indexPath = path.join(dir, 'index.json');
  const index = readJson(indexPath);
  delete index[0].names.pt;
  writeJson(indexPath, index);

  check('detecta estrutura do índice sem names.pt', () => {
    const { status, stderr } = runValidator(dir);
    assert.notEqual(status, 0, 'esperava falha (nome em PT ausente)');
    assert.match(stderr, /obrigatória "pt"/);
  });
}

// 5) Quiz referenciando sid desconhecido.
{
  const dir = cloneFixtures('quiz-sid-invalido');
  tmpDirs.push(dir);
  const quizPath = path.join(dir, 'quiz-cases.json');
  const quiz = readJson(quizPath);
  quiz[0].correctSid = 'za:estrutura-que-nao-existe';
  writeJson(quizPath, quiz);

  check('detecta quiz-case referenciando sid desconhecido', () => {
    const { status, stderr } = runValidator(dir);
    assert.notEqual(status, 0, 'esperava falha (sid desconhecido no quiz)');
    assert.match(stderr, /quiz-cases\.json/);
  });
}

// 6) Licenças mistas: duplica um asset com o mesmo `file` mas licença diferente.
{
  const dir = cloneFixtures('licencas-mistas');
  tmpDirs.push(dir);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = readJson(manifestPath);
  const original = manifest.assets[0];
  const duplicate = { ...original, license: original.license === 'CC0-1.0' ? 'CC-BY-4.0' : 'CC0-1.0' };
  manifest.assets.push(duplicate);
  writeJson(manifestPath, manifest);

  check('detecta o mesmo arquivo de asset com licenças diferentes', () => {
    const { status, stderr } = runValidator(dir);
    assert.notEqual(status, 0, 'esperava falha (licenças mistas)');
    assert.match(stderr, /licenças diferentes/);
  });
}

// 7) Flag --legacy-anchors=warn: converte erros de anchor legado em avisos.
{
  const dir = cloneFixtures('legacy-anchors');
  tmpDirs.push(dir);
  const routesPath = path.join(dir, 'routes.json');
  const routes = readJson(routesPath);
  // Adiciona uma rota com anchor que usa padrão legado
  if (Array.isArray(routes) && routes.length > 0) {
    routes[0].anchors = routes[0].anchors || [];
    routes[0].anchors.push({ sid: 'za:legacy-structure' });
  }
  writeJson(routesPath, routes);

  check('sem flag, legacy anchor gera erro', () => {
    const { status, stderr } = runValidator(dir);
    assert.notEqual(status, 0, 'esperava falha (legacy anchor sem flag)');
    assert.match(stderr, /routes\.json.*za:legacy-structure/);
  });

  check('com --legacy-anchors=warn, legacy anchor vira aviso', () => {
    const { status, stdout, stderr } = runValidator(dir, ['--legacy-anchors=warn']);
    assert.equal(status, 0, `esperava sucesso (exit 0), obteve ${status}. stderr:\n${stderr}`);
    // Verifica que há avisos (não erros)
    assert.match(stdout, /aviso/);
  });
}

cleanup(tmpDirs);

console.log(`[teste] ${passCount} passaram, ${failCount} falharam.`);
process.exitCode = failCount > 0 ? 1 : 0;
