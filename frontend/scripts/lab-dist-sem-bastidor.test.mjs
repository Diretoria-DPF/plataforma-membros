/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// F-005: nenhum arquivo publicado do Laboratório pode trazer [NV], "revisado por", "rascunho" ou "gerado por IA".
// As fontes mantêm as marcas [NV] para o revisor (docs/LABORATORIO_NV_FILA.md); o build publica a versão limpa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const labFonte = path.join(frontend, 'modulos', 'laboratorio');
const labDist = path.join(frontend, 'dist', 'modulos', 'laboratorio');
const fila = require('./lab-nv-fila.js');

const PROIBIDO = /\[NV\]|revisad[oa] por|rascunho|gerad[oa] por (ia|intelig)/i;
// Exceções conhecidas, só em código (não em dados): o validador cita as marcas para rejeitá-las; o aviso do
// Preceptor sobre resposta gerada por IA aparece na tela e está registrado como pendência da revisão.
const EXCECOES_CODIGO = new Set(['js/lab-motor-validador.js', 'js/lab-preceptor.js']);

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : arquivos(full);
    return /\.(json|html|css|js|md|txt|csv|svg)$/i.test(e.name) ? [full] : [];
  });
}

function varrer(raiz) {
  const achados = [];
  for (const arq of arquivos(raiz)) {
    const rel = path.relative(raiz, arq).split(path.sep).join('/');
    if (EXCECOES_CODIGO.has(rel)) continue;
    const m = PROIBIDO.exec(fs.readFileSync(arq, 'utf8'));
    if (m) achados.push(`${rel}: "${m[0]}"`);
  }
  return achados;
}

test('fontes ainda guardam a fila de [NV] (nada se perde) e o documento está atualizado', () => {
  const marcas = fila.coletarNV();
  assert.ok(marcas.length >= 36, `esperava ao menos 36 marcas, achei ${marcas.length}`);
  const doc = fs.readFileSync(fila.DOC, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(doc, fila.gerarMarkdown(marcas), 'docs/LABORATORIO_NV_FILA.md desatualizado: rode node frontend/scripts/lab-nv-fila.js --escrever');
});

test('sanitizarDist: cópia do Laboratório fica sem marcas e sem mudar valores científicos', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-nv-'));
  try {
    const copia = path.join(tmp, 'laboratorio');
    fs.cpSync(labFonte, copia, { recursive: true });
    const n = fila.sanitizarDist(copia);
    assert.equal(n, 13);
    assert.deepEqual(varrer(copia), []);
    const original = JSON.parse(fs.readFileSync(path.join(labFonte, 'data', 'processos', 'proc_nacl_09_v1.json'), 'utf8'));
    const limpo = JSON.parse(fs.readFileSync(path.join(copia, 'data', 'processos', 'proc_nacl_09_v1.json'), 'utf8'));
    assert.equal(limpo.conferencia, undefined);
    assert.deepEqual(limpo.etapas, original.etapas);
    assert.deepEqual(limpo.formulacao, original.formulacao);
    assert.equal(limpo.referencias[1].url, original.referencias[1].url);
    assert.equal(limpo.referencias[0].titulo, original.referencias[0].titulo);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('build.js publica o Laboratório pela versão sanitizada', () => {
  assert.match(fs.readFileSync(path.join(frontend, 'scripts', 'build.js'), 'utf8'), /lab-nv-fila\.js'\)\.sanitizarDist\(/);
});

test('dist (após o build) do Laboratório não traz marcas de bastidor', { skip: !fs.existsSync(labDist) && 'dist ausente: rode node scripts/build.js' }, () => {
  assert.deepEqual(varrer(labDist), []);
});
