/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Ambiente de homologação (staging): isolado da produção e fora dos buscadores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/** Corpo da tabela TOML `[header]` (ou `[[header]]`) até o próximo cabeçalho. */
function tomlSection(text, header) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === header);
  assert.ok(start >= 0, 'cabeçalho TOML ausente: ' + header);
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

test('_headers: staging e URLs workers.dev saem dos buscadores (X-Robots-Tag)', () => {
  const headers = read('frontend/_headers');
  for (const pattern of [
    'https://staging.laift.com.br/*',
    'https://:name.:subdomain.workers.dev/*',
    'https://:version.:name.:subdomain.workers.dev/*',
  ]) {
    const i = headers.indexOf('\n' + pattern + '\n');
    assert.ok(i >= 0, 'falta a regra para ' + pattern);
    assert.match(headers.slice(i + pattern.length + 2).split('\n')[0], /X-Robots-Tag:\s*noindex,\s*nofollow/);
  }
});

test('_headers: o domínio de produção NÃO recebe noindex', () => {
  const headers = read('frontend/_headers');
  const prod = headers.split('\n').filter((l) => /laift\.com\.br/.test(l) && !l.startsWith('#') && !/staging/.test(l));
  assert.deepEqual(prod, []);
  assert.doesNotMatch(headers.split(/\n\/\*\n/)[1] || '', /X-Robots-Tag/);
});

test('app.js escolhe a API pelo hostname, com staging isolado da produção', () => {
  const src = read('frontend/app.js');
  const m = src.match(/var API_BASE_URL = \(function \(\) \{([\s\S]*?)\n  \}\)\(\);/);
  assert.ok(m, 'bloco API_BASE_URL não encontrado');
  const pick = (hostname) => new Function('window', m[1])({ location: { hostname } });
  assert.equal(pick('laift.com.br'), 'https://api.laift.com.br');
  assert.equal(pick('www.laift.com.br'), 'https://api.laift.com.br');
  assert.equal(pick('staging.laift.com.br'), 'https://staging-api.laift.com.br');
  assert.equal(pick('diretoria-dpf.github.io'), 'https://plataforma-membros-api.diretoria-dpf.workers.dev');
  assert.equal(pick('localhost'), 'https://plataforma-membros-api.diretoria-dpf.workers.dev');
});

test('CSP do index.html permite conectar à API de staging', () => {
  const html = read('frontend/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
  assert.ok(csp, 'CSP não encontrada');
  const connect = csp[1].split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src'));
  assert.ok(connect.includes('https://api.laift.com.br'));
  assert.ok(connect.includes('https://staging-api.laift.com.br'));
});

test('Worker: [env.staging] tem nome, domínio, variáveis e banco próprios; sem cron nem bindings de produção', () => {
  const toml = read('worker/wrangler.toml');
  const env = tomlSection(toml, '[env.staging]');
  assert.match(env, /workers_dev\s*=\s*true/);
  const route = tomlSection(toml, '[[env.staging.routes]]');
  assert.match(route, /pattern\s*=\s*"staging-api\.laift\.com\.br"/);
  assert.match(route, /custom_domain\s*=\s*true/);
  const vars = tomlSection(toml, '[env.staging.vars]');
  assert.match(vars, /APP_BASE_URL\s*=\s*"https:\/\/staging\.laift\.com\.br\/"/);
  const origins = vars.match(/ALLOWED_ORIGINS\s*=\s*"([^"]+)"/)[1].split(',');
  assert.ok(origins.includes('https://staging.laift.com.br'));
  for (const prod of ['https://laift.com.br', 'https://diretoria-dpf.github.io']) {
    assert.ok(!origins.includes(prod), 'staging não pode aceitar a origem de produção ' + prod);
  }
  // Segredos e bindings nunca são herdados; garantir que não foram copiados por engano.
  assert.doesNotMatch(toml, /\[env\.staging\.triggers\]/);
  assert.doesNotMatch(toml, /env\.staging\.kv_namespaces/);
  assert.doesNotMatch(toml, /DATABASE_URL\s*=/);
});

test('Front: [env.staging] publica em staging.laift.com.br com os mesmos assets', () => {
  const toml = read('frontend/wrangler.toml');
  assert.match(tomlSection(toml, '[env.staging]'), /workers_dev\s*=\s*true/);
  const route = tomlSection(toml, '[[env.staging.routes]]');
  assert.match(route, /pattern\s*=\s*"staging\.laift\.com\.br"/);
  assert.match(route, /custom_domain\s*=\s*true/);
  const assets = tomlSection(toml, '[env.staging.assets]');
  assert.match(assets, /directory\s*=\s*"\.\/dist"/);
  assert.match(assets, /not_found_handling\s*=\s*"404-page"/);
});
