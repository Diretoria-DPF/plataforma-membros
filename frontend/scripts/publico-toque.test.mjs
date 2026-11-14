/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Páginas públicas no celular: menos folhas no toque (F-052), theme-color em todas (F-057) e
// porta de acessibilidade que acha o axe-core fora do node_modules do front-end (F-055).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const front = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(front, rel), 'utf8');

function folhasCriadas({ toque, pedidas, reduzido = false }) {
  const criadas = [];
  const field = { getAttribute: () => (pedidas === undefined ? null : String(pedidas)), appendChild: (n) => criadas.push(n) };
  const sandbox = {
    document: { getElementById: () => field, createElement: () => ({ style: {} }), querySelectorAll: () => [] },
    window: { matchMedia: (q) => ({ matches: q.includes('coarse') ? toque : reduzido }) },
    Math, Number,
  };
  vm.runInNewContext(read('static-page.js'), sandbox);
  return criadas.length;
}

test('static-page.js: no toque são no máximo 6 folhas; no desktop vale o pedido pela página', () => {
  assert.equal(folhasCriadas({ toque: true, pedidas: 14 }), 6);
  assert.equal(folhasCriadas({ toque: true }), 6);
  assert.equal(folhasCriadas({ toque: true, pedidas: 4 }), 4);
  assert.equal(folhasCriadas({ toque: false, pedidas: 14 }), 14);
  assert.equal(folhasCriadas({ toque: false }), 10);
  assert.equal(folhasCriadas({ toque: true, pedidas: 14, reduzido: true }), 0);
});

test('páginas públicas: todas declaram theme-color', () => {
  for (const pagina of ['index.html', 'demo.html', 'liga.html', 'termos.html', 'privacidade.html', '404.html', 'blog.html', 'biblioteca.html', 'edital.html', 'processo-seletivo.html']) {
    assert.match(read(pagina), /<meta name="theme-color" content="#[0-9a-f]{6}">/i, pagina);
  }
});

test('axe-gate.js: procura o axe-core também pela resolução de módulos', () => {
  assert.match(read('scripts/e2e/axe-gate.js'), /require\.resolve\('axe-core\/axe\.min\.js'\)/);
});
