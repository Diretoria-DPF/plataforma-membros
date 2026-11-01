/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Posição livre do Guia (frontend/assistant-drag.js): contas de posição, guarda no navegador e fiação no app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Drag = require('../assistant-drag.js');

const VIEW = { width: 1000, height: 700 };
const SIZE = { width: 100, height: 50 };

test('clampPosition: nunca sai da tela e deixa folga das bordas', () => {
  assert.deepEqual(Drag.clampPosition({ x: -50, y: -50 }, SIZE, VIEW), { x: 8, y: 8 });
  assert.deepEqual(Drag.clampPosition({ x: 5000, y: 5000 }, SIZE, VIEW), { x: 892, y: 642 });
  assert.deepEqual(Drag.clampPosition({ x: 300, y: 200 }, SIZE, VIEW), { x: 300, y: 200 });
  // janela menor que a caixa: não explode, fica no canto
  assert.deepEqual(Drag.clampPosition({ x: 50, y: 50 }, { width: 400, height: 400 }, { width: 100, height: 100 }), { x: 8, y: 8 });
});

test('toStored / fromStored: a posição guardada acompanha outro tamanho de janela', () => {
  const stored = Drag.toStored({ x: 892, y: 642 }, SIZE, VIEW);
  assert.deepEqual(stored, { fx: 1, fy: 1 });
  const small = { width: 400, height: 300 };
  assert.deepEqual(Drag.fromStored(stored, SIZE, small), { x: 292, y: 242 });
  assert.deepEqual(Drag.fromStored({ fx: 0, fy: 0 }, SIZE, small), { x: 8, y: 8 });
  const mid = Drag.fromStored(Drag.toStored({ x: 450, y: 325 }, SIZE, VIEW), SIZE, VIEW);
  assert.ok(Math.abs(mid.x - 450) <= 1 && Math.abs(mid.y - 325) <= 1);
});

test('parseStored: só aceita frações válidas; lixo vira "sem posição"', () => {
  const ok = Drag.parseStored(JSON.stringify({ l: { fx: 0.5, fy: 0.25 }, p: { fx: 1, fy: 0 } }));
  assert.deepEqual(ok, { launcher: { fx: 0.5, fy: 0.25 }, panel: { fx: 1, fy: 0 } });
  const empty = { launcher: null, panel: null };
  for (const bad of ['', null, undefined, 'x', '[]', '{"l":{"fx":2,"fy":0}}', '{"l":{"fx":"a","fy":0}}', '{"l":null}', 42]) {
    assert.deepEqual(Drag.parseStored(bad), empty, String(bad));
  }
  assert.deepEqual(Drag.parseStored(Drag.serialize({ launcher: { fx: 0.1, fy: 0.2 }, panel: null })), { launcher: { fx: 0.1, fy: 0.2 }, panel: null });
});

test('panelPlacement: abre acima da bolha, alinhado pela direita; sem espaço, abaixo; sempre dentro da tela', () => {
  const panel = { width: 380, height: 560 };
  const bottomRight = Drag.panelPlacement({ x: 880, y: 640, width: 100, height: 50 }, panel, VIEW);
  assert.deepEqual(bottomRight, { x: 600, y: 72 });
  const top = Drag.panelPlacement({ x: 880, y: 20, width: 100, height: 50 }, panel, VIEW);
  assert.equal(top.y, 78); // abaixo da bolha
  const left = Drag.panelPlacement({ x: 8, y: 640, width: 100, height: 50 }, panel, VIEW);
  assert.equal(left.x, 8);
  for (const p of [bottomRight, top, left]) {
    assert.ok(p.x >= 8 && p.y >= 8 && p.x + panel.width <= VIEW.width - 8 && p.y + panel.height <= VIEW.height - 8);
  }
});

test('pastThreshold e keyDelta', () => {
  assert.equal(Drag.pastThreshold(3, -4), false);
  assert.equal(Drag.pastThreshold(7, 0), true);
  assert.equal(Drag.pastThreshold(0, -7), true);
  assert.deepEqual(Drag.keyDelta({ altKey: true, key: 'ArrowLeft' }), { dx: -16, dy: 0 });
  assert.deepEqual(Drag.keyDelta({ altKey: true, shiftKey: true, key: 'ArrowDown' }), { dx: 0, dy: 64 });
  assert.equal(Drag.keyDelta({ altKey: false, key: 'ArrowLeft' }), null);
  assert.equal(Drag.keyDelta({ altKey: true, key: 'a' }), null);
  assert.equal(Drag.keyDelta(null), null);
});

test('assistant-drag.js: sem innerHTML, eval nem style inline; guarda só no navegador (localStorage), nunca na rede', () => {
  const src = fs.readFileSync(path.join(frontend, 'assistant-drag.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function|setAttribute\('style'/);
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|callApi/);
  assert.match(code, /localStorage/);
});

test('fiação: index.html, build.js e sw.js carregam o módulo; assistant.js o usa de forma opcional', () => {
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const drag = html.indexOf('<script src="assistant-drag.js" defer></script>');
  const lia = html.indexOf('<script src="assistant.js" defer></script>');
  assert.ok(drag > 0 && drag < lia, 'assistant-drag.js antes de assistant.js');
  for (const file of ['scripts/build.js', 'sw.js']) {
    assert.ok(fs.readFileSync(path.join(frontend, file), 'utf8').includes("'assistant-drag.js'"), file);
  }
  const assistant = fs.readFileSync(path.join(frontend, 'assistant.js'), 'utf8');
  assert.match(assistant, /root\.AssistantDrag \? root\.AssistantDrag\.attach/);
  assert.match(assistant, /note: note/); // o módulo cria o "Voltar ao canto" na nota do painel
});
