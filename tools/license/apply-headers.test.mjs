import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addHeader, shouldProcess, HEADER_MARKER } from './apply-headers.mjs';

test('adiciona o cabeçalho no topo de um arquivo JS', () => {
  const out = addHeader('const a = 1;\n', 'js');
  assert.ok(out.startsWith('/*'));
  assert.ok(out.includes(HEADER_MARKER));
  assert.ok(out.endsWith('const a = 1;\n'));
});

test('é idempotente: rodar duas vezes não duplica o cabeçalho', () => {
  const once = addHeader('const a = 1;\n', 'js');
  assert.equal(addHeader(once, 'js'), once);
});

test('preserva a linha shebang na primeira linha', () => {
  const out = addHeader('#!/usr/bin/env node\nconsole.log(1);\n', 'mjs');
  assert.ok(out.startsWith('#!/usr/bin/env node\n'));
  assert.ok(out.indexOf(HEADER_MARKER) > 0);
});

test('usa comentário de linha dupla-hífen em SQL', () => {
  const out = addHeader('SELECT 1;\n', 'sql');
  assert.ok(out.startsWith('--'));
  assert.ok(out.includes(HEADER_MARKER));
});

test('não altera arquivo que já tem copyright de terceiros', () => {
  const src = '/* Copyright (c) 2010 Fulano de Tal. MIT */\nvar x;\n';
  assert.equal(addHeader(src, 'js'), src);
});

test('preserva fim de linha CRLF', () => {
  const out = addHeader('a();\r\nb();\r\n', 'js');
  assert.ok(out.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(out));
});

test('shouldProcess exclui vendor, models, node_modules, dist e minificados', () => {
  assert.equal(shouldProcess('frontend/vendor/qrcode-generator.js'), false);
  assert.equal(shouldProcess('frontend/modulos/anatomia-3d/vendor/three/three.module.js'), false);
  assert.equal(shouldProcess('frontend/dist/app.js'), false);
  assert.equal(shouldProcess('worker/node_modules/x/index.js'), false);
  assert.equal(shouldProcess('frontend/x/lib.min.js'), false);
  assert.equal(shouldProcess('frontend/modulos/anatomia-3d/models/zanatomy/a.js'), false);
});

test('shouldProcess aceita código próprio e exclui frontend/modulos por padrão', () => {
  assert.equal(shouldProcess('worker/src/handlers.js'), true);
  assert.equal(shouldProcess('sql/001_init.sql'), true);
  assert.equal(shouldProcess('frontend/app.js'), true);
  assert.equal(shouldProcess('frontend/modulos/quiz/x.js'), false);
  assert.equal(shouldProcess('frontend/modulos/quiz/x.js', { includeModulos: true }), true);
});

test('shouldProcess ignora extensões não suportadas', () => {
  assert.equal(shouldProcess('frontend/index.html'), false);
  assert.equal(shouldProcess('README.md'), false);
  assert.equal(shouldProcess('data/x.json'), false);
});
