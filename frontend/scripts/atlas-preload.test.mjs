/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Garante que o index.html do Atlas pré-carrega todo o grafo estático de módulos
// (F-022: abertura em Fast 3G). Se este teste falhar, atualize os <link rel="modulepreload">.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modulos', 'anatomia-3d');
const RE = /^\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm;

function graph(entries) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(RE)) walk(path.resolve(path.dirname(f), m[1] || m[2]));
  };
  entries.forEach((e) => walk(path.join(root, e)));
  return [...seen].map((f) => path.relative(root, f).split(path.sep).join('/')).sort();
}

test('index.html pré-carrega todo o grafo estático de módulos do Atlas', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]).sort();
  assert.deepEqual(preloaded, graph(['js/main.js', 'js/compat/legacy-api.js']));
});
