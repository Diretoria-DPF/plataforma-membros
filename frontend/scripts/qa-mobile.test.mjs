/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Regressões estáticas da bateria de QA mobile (2026-11-05): campos com 16 px no celular, área de toque do
// crédito do rodapé e quiz sem "menu lateral" no celular. O comportamento real está em scripts/e2e/qa-mobile.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

test('styles.css: campos de formulário com 16 px em aparelho de toque (o iOS dá zoom abaixo disso)', () => {
  const css = read('styles.css');
  const bloco = css.split('@media (pointer: coarse)').map((parte) => parte.slice(0, 400)).find((parte) => /textarea \{ font-size: 16px; \}/.test(parte));
  assert.ok(bloco, 'regra de 16 px dos campos no celular');
  assert.match(bloco, /:not\(\[type="checkbox"\]\)/);
  assert.match(bloco, /:not\(\[type="file"\]\)/);
});

test('ux.css: o crédito do rodapé tem área de toque de 44 px sem mudar a altura da linha', () => {
  const css = read('ux.css');
  assert.match(css, /\.site-credito a \{ display: inline-block; padding: 14px 6px; margin: -14px -6px; \}/);
});

test('quiz: tópicos em duas colunas em celular estreito e aviso sem "menu lateral"', () => {
  const css = read('modulos/shared/quiz-engine.css');
  const estreito = css.split('@media (max-width: 380px)')[1].split('}')[0];
  assert.equal(/topics-grid/.test(estreito), false, 'a regra de coluna única até 380 px saiu');
  for (const rel of ['modulos/shared/quiz-engine.js', 'modulos/quiz/app.js', 'modulos/toxicologia/app.js', 'modulos/toxicologia/index.html']) {
    assert.equal(/menu lateral/i.test(read(rel)), false, rel);
  }
  assert.match(read('modulos/shared/quiz-engine.js'), /setStatus\(L\.noTopic, 'error'\); bringIntoView\(el\.topicsGrid, 'start'\)/);
});
