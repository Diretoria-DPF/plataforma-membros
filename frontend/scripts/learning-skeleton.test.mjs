/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aprender: o carregamento do desempenho mostra o skeleton padrão (LaiftStates), mantém
// aria-busy no bloco de números e deixa o texto "Carregando..." só para leitor de tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const learning = read('frontend/learning.js');

// Corpo de "function nome(...) { ... }" pelo balanceamento de chaves.
function functionBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'função ausente: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail('bloco sem fechamento: ' + name);
}

test('carregando o desempenho: o skeleton padrão (LaiftStates.createSkeleton) ocupa o lugar do texto', () => {
  const loading = functionBody(learning, 'showStatsLoadingState');
  assert.match(loading, /window\.LaiftStates\.createSkeleton\(document,\s*3\)/);
  assert.match(functionBody(learning, 'startStatsLoading'), /showStatsLoadingState\(A\)/);
});

test('carregando o desempenho: aria-busy liga no bloco de números e é removido ao terminar', () => {
  assert.match(functionBody(learning, 'startStatsLoading'), /setStatsBusy\(statsBox,\s*true\)/);
  assert.match(functionBody(learning, 'showStats'), /setStatsBusy\(statsBox,\s*false\)/);
  assert.match(functionBody(learning, 'showStatsFailure'), /setStatsBusy\(statsBox,\s*false\)/);
});

test('texto "Carregando seu desempenho..." fica só para leitor de tela (laift-sr-only), dentro do role="status"', () => {
  const loading = functionBody(learning, 'showStatsLoadingState');
  assert.match(loading, /srText\.className = 'laift-sr-only'/);
  assert.match(loading, /srText\.textContent = 'Carregando seu desempenho\.\.\.'/);
  assert.doesNotMatch(learning, /setStatus\('learn-status', 'Carregando/);
  assert.match(read('frontend/index.html'), /id="learn-status"[^>]*role="status"/);
});

test('o skeleton é decorativo (aria-hidden) e a estilização dele está publicada em ux.css', () => {
  assert.match(read('frontend/shared-states.js'), /box\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(read('frontend/ux.css'), /\.skeleton\s*\{/);
  assert.match(read('frontend/index.html'), /href="ux\.css"/);
});

test('Aprender: nada de innerHTML no código; sair da conta limpa o status (sem skeleton órfão)', () => {
  const code = learning.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /innerHTML/);
  const reset = learning.slice(learning.indexOf("setStatsBusy(document.querySelector('#learn-hub .learn-stats'), false);"));
  assert.match(reset.slice(0, 200), /app\(\)\.setStatus\('learn-status', '', null\)/);
});
