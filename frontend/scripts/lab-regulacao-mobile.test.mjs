/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// QA mobile da Regulação: a tabela do livro cabe em 320 px (quebra de palavra e preenchimento menor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(frontend, 'modulos', 'laboratorio', 'regulacao', 'regulacao.css'), 'utf8');

test('Regulação: a tabela do livro quebra palavras e encolhe o preenchimento em 360 px ou menos', () => {
  assert.match(css, /\.rg-tabela th, \.rg-tabela td \{ overflow-wrap: anywhere; \}/);
  assert.match(css, /@media \(max-width: 360px\) \{[^}]*\.rg-tabela \{ font-size: 0\.85rem; \}[^}]*\.rg-tabela th, \.rg-tabela td \{ padding: 6px 4px; \}/);
});
