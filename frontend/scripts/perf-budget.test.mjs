/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// MOB-09: orçamento de peso do shell (a primeira visita no celular) e cabeçalhos de cache.
//
// "Shell" = o index.html + todo <script src> e <link rel=stylesheet> LOCAL que ele carrega de imediato.
// Mede os arquivos-fonte (app.js sai ofuscado no build, ~15-20% maior; o teto abaixo tem folga para isso
// ser tratado no e2e de build, e o objetivo aqui é pegar regressão grande: alguém voltar a pôr
// admin/Guia/módulo pesado no carregamento inicial).
//
// Como os tetos foram escolhidos (medição em 2026-11-01, depois do MOB-04):
//   shell gzip   = 273 KB  -> teto 295 KB (+8%: cabe um módulo pequeno novo, não um painel inteiro)
//   JS eager raw = 649 KB  -> teto 700 KB
//   precache raw = 879 KB  -> teto 950 KB
// Antes do MOB-04/07 eram 401 KB gzip, 1.059 KB de JS e 1.586 KB de precache. Se o teto estourar:
// primeiro tente carregar sob demanda (lazy-bundles.js); só suba o teto com justificativa na PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

const BUDGET = {
  shellGzipBytes: 295 * 1024,
  eagerJsRawBytes: 700 * 1024,
  precacheRawBytes: 950 * 1024,
  immutableMaxAgeSeconds: 31536000,
};

function shellFiles() {
  const html = read('index.html');
  const refs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
    .concat([...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]))
    .filter((r) => !/^(https?:)?\/\//.test(r));
  return ['index.html'].concat(refs);
}

const gzipSize = (file) => zlib.gzipSync(fs.readFileSync(path.join(frontend, file)), { level: 9 }).length;

test('orçamento: o shell (HTML + scripts + estilos do carregamento inicial) cabe em 295 KB gzip', () => {
  const files = shellFiles();
  const total = files.reduce((sum, f) => sum + gzipSize(f), 0);
  assert.ok(total <= BUDGET.shellGzipBytes, `shell com ${(total / 1024).toFixed(1)} KB gzip; teto ${BUDGET.shellGzipBytes / 1024} KB`);
});

test('orçamento: o JavaScript do carregamento inicial cabe em 700 KB', () => {
  const total = shellFiles().filter((f) => f.endsWith('.js')).reduce((sum, f) => sum + fs.statSync(path.join(frontend, f)).size, 0);
  assert.ok(total <= BUDGET.eagerJsRawBytes, `JS eager com ${(total / 1024).toFixed(1)} KB; teto ${BUDGET.eagerJsRawBytes / 1024} KB`);
});

test('orçamento: o precache do service worker cabe em 950 KB (só o shell)', () => {
  const m = /var PRECACHE = \[([\s\S]*?)\n  \];/.exec(read('sw.js'));
  const items = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((x) => x !== './');
  const total = items.reduce((sum, f) => sum + fs.statSync(path.join(frontend, f)).size, 0);
  assert.ok(total <= BUDGET.precacheRawBytes, `precache com ${(total / 1024).toFixed(1)} KB; teto ${BUDGET.precacheRawBytes / 1024} KB`);
});

test('orçamento: o shell não volta a carregar admin, Guia nem Atlas no início', () => {
  const files = shellFiles();
  const pesados = files.filter((f) => f.endsWith('.js')).filter((f) => /^admin-|^assistant(?!-sources)|selection-admin|privacy-admin|lia\/lia|anatomia-3d|\.wasm$/.test(f));
  assert.deepEqual(pesados, [], 'carregue sob demanda por lazy-bundles.js');
});

/** Blocos do _headers: caminho na coluna 0, linhas indentadas abaixo. */
function headerBlocks() {
  const blocks = [];
  for (const line of read('_headers').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\S/.test(line)) blocks.push({ path: line.trim(), lines: [] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(line.trim());
  }
  return blocks;
}

test('_headers: cache longo e imutável só onde a versão está no caminho', () => {
  const imutaveis = headerBlocks().filter((b) => b.lines.some((l) => /immutable/.test(l)));
  assert.ok(imutaveis.length >= 2);
  for (const b of imutaveis) {
    assert.deepEqual(b.lines, [`Cache-Control: public, max-age=${BUDGET.immutableMaxAgeSeconds}, immutable`]);
    assert.match(b.path, /\/vendor\/[a-z-]+-\d+\.\d+\.\d+\/\*$/, `${b.path}: caminho sem versão não pode ser imutável`);
    const dir = path.join(frontend, b.path.replace(/\/\*$/, ''));
    assert.ok(fs.existsSync(dir), `${b.path}: a pasta versionada não existe`);
  }
});

test('_headers: HTML, sw.js e o shell sem hash NUNCA recebem cache longo', () => {
  for (const b of headerBlocks()) {
    if (!b.lines.some((l) => /^Cache-Control:.*max-age=\d{6,}/.test(l))) continue; // só Cache-Control longo (>= 100000 s)
    assert.doesNotMatch(b.path, /^\/(\*|sw\.js|index\.html|app\.js|\S*\.html)$/, `${b.path} não pode ter cache longo`);
    assert.match(b.path, /\/vendor\//, `${b.path}: cache longo só em vendor versionado`);
  }
});
