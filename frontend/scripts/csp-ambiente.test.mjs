/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// F-048: origem antiga fora do Worker e CSP de produção sem hosts que a produção não chama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { enxugarCsp, enxugarDist, HOST_ANTIGO, HOST_HOMOLOGACAO } = require('./csp-ambiente.js');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const pagina = (connect) => `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src ${connect}; frame-src 'none'"></head>`;
const FONTE = pagina(`'self' ${HOST_ANTIGO} https://api.laift.com.br ${HOST_HOMOLOGACAO}`);

test('produção: saem o endereço antigo e a API de homologação; o resto fica igual', () => {
  assert.equal(enxugarCsp(FONTE, 'production'), pagina("'self' https://api.laift.com.br"));
});

test('homologação: sai só o endereço antigo', () => {
  assert.equal(enxugarCsp(FONTE, 'staging'), pagina(`'self' https://api.laift.com.br ${HOST_HOMOLOGACAO}`));
});

test('sem ambiente (build local, e2e) ou ambiente desconhecido: nada muda', () => {
  assert.equal(enxugarCsp(FONTE, undefined), FONTE);
  assert.equal(enxugarCsp(FONTE, 'qualquer'), FONTE);
  assert.equal(enxugarCsp('<p>sem csp</p>', 'production'), '<p>sem csp</p>');
});

test('index.html real: em produção a connect-src fica só com a própria origem e a API de produção', () => {
  const html = enxugarCsp(read('frontend/index.html'), 'production');
  const csp = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/)[1];
  const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src'));
  assert.ok(connect.includes('https://api.laift.com.br'));
  assert.ok(!connect.includes('workers.dev'));
  assert.ok(!connect.includes('staging-api'));
  assert.match(csp, /script-src 'self'/);
});

test('enxugarDist: percorre as páginas, pula modulos/ e conta as alteradas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-amb-'));
  try {
    fs.mkdirSync(path.join(dir, 'blog'));
    fs.mkdirSync(path.join(dir, 'modulos'));
    fs.writeFileSync(path.join(dir, 'index.html'), FONTE);
    fs.writeFileSync(path.join(dir, 'blog', 'a.html'), FONTE);
    fs.writeFileSync(path.join(dir, 'modulos', 'm.html'), FONTE);
    fs.writeFileSync(path.join(dir, 'app.js'), HOST_ANTIGO);
    assert.equal(enxugarDist(dir, 'production'), 2);
    assert.ok(!fs.readFileSync(path.join(dir, 'blog', 'a.html'), 'utf8').includes('workers.dev'));
    assert.equal(fs.readFileSync(path.join(dir, 'modulos', 'm.html'), 'utf8'), FONTE);
    assert.equal(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), HOST_ANTIGO);
    assert.equal(enxugarDist(dir, undefined), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fiação: build aplica pelo LAIFT_DEPLOY_ENV e o deploy define a variável', () => {
  assert.match(read('frontend/scripts/build.js'), /enxugarDist\(DIST, process\.env\.LAIFT_DEPLOY_ENV\)/);
  const fluxo = read('.github/workflows/deploy-frontend-cloudflare.yml');
  assert.match(fluxo, /LAIFT_DEPLOY_ENV: \$\{\{ github\.ref_name == 'main' && 'production' \|\| 'staging' \}\}/);
});

test('Worker de produção: ALLOWED_ORIGINS só com o domínio próprio (GitHub Pages encerrado)', () => {
  const toml = read('worker/wrangler.toml');
  const topo = toml.slice(0, toml.indexOf('[env.staging]'));
  const origens = topo.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]+)"/m)[1].split(',');
  assert.deepEqual(origens, ['https://laift.com.br']);
});
