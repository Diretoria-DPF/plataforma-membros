/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// TEC-01: bibliotecas vendorizadas (modulos/*/vendor) continuam sendo exatamente
// os bytes do pacote npm que o SRI das páginas fixava no jsDelivr, e cada pasta
// traz o arquivo de licença. Falha se alguém trocar o arquivo sem atualizar o hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULOS = path.join(FRONT, 'modulos');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dev') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
const sri = (file) => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64');

test('<script src> local com integrity bate com o hash do arquivo vendorizado', () => {
  const pages = walk(MODULOS).filter((f) => f.endsWith('.html') && !f.includes(`${path.sep}vendor${path.sep}`));
  let checked = 0;
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
      const src = /\bsrc="([^"]+)"/.exec(m[0]);
      const integrity = /\bintegrity="([^"]+)"/.exec(m[0]);
      if (!src || !integrity || /^https?:/.test(src[1])) continue;
      const file = path.resolve(path.dirname(page), src[1]);
      assert.ok(fs.existsSync(file), `${path.relative(FRONT, page)}: ${src[1]} não existe`);
      assert.equal(sri(file), integrity[1], `${path.relative(FRONT, page)}: SRI de ${src[1]} não bate`);
      checked++;
    }
  }
  assert.ok(checked >= 6, `esperava >= 6 scripts vendorizados com SRI, achei ${checked}`);
});

test('OpenChemLib vendorizado bate com o SRI do studio-loader', () => {
  const loader = fs.readFileSync(path.join(MODULOS, 'laboratorio/studio/studio-loader.js'), 'utf8');
  const url = /url: '(\.\.\/vendor\/openchemlib\/[^']+)'/.exec(loader);
  const integrity = /integrity: '(sha384-[^']+)'/.exec(loader);
  assert.ok(url && integrity, 'OCL deve ser carregado de vendor/ com integrity');
  assert.equal(sri(path.resolve(MODULOS, 'laboratorio/studio', url[1])), integrity[1]);
});

test('toda pasta vendor/ dos módulos (exceto o Atlas, já coberto) traz LICENSE e VERSION', () => {
  const vendors = ['laboratorio/vendor', 'quiz/vendor', 'fiscal/vendor'];
  for (const v of vendors) {
    const base = path.join(MODULOS, v);
    for (const lib of fs.readdirSync(base)) {
      const files = fs.readdirSync(path.join(base, lib));
      assert.ok(files.some((f) => /^LICENSE/i.test(f)), `${v}/${lib}: sem LICENSE`);
      assert.ok(files.includes('VERSION'), `${v}/${lib}: sem VERSION`);
    }
  }
});

test('só o RDKit (> 5 MB de wasm) ainda vem do jsDelivr nas páginas dos módulos', () => {
  const offenders = walk(MODULOS)
    .filter((f) => /\.(html|js)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`))
    .filter((f) => /https:\/\/cdn\.jsdelivr\.net\/npm\/(?!@rdkit\/)/.test(fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')));
  assert.deepEqual(offenders.map((f) => path.relative(MODULOS, f)), []);
});
