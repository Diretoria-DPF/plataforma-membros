/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { shouldShowNotice, NEW_URL } = require(join(ROOT, 'domain-notice.js'));

test('o aviso aparece só no endereço antigo (GitHub Pages)', () => {
  assert.equal(shouldShowNotice('diretoria-dpf.github.io'), true);
});

test('não aparece no domínio novo, no www, em localhost nem em domínios parecidos', () => {
  for (const host of ['laift.com.br', 'www.laift.com.br', 'localhost', '127.0.0.1', 'diretoria-dpf.github.io.evil.example', 'x-diretoria-dpf.github.io']) {
    assert.equal(shouldShowNotice(host), false, host);
  }
});

test('o link do aviso leva ao domínio novo, em https', () => {
  assert.equal(NEW_URL, 'https://laift.com.br/');
});

test('o script é carregado pelo index.html, antes do app.js, e copiado pelo build', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const notice = html.indexOf('src="domain-notice.js"');
  const app = html.indexOf('src="app.js"');
  assert.ok(notice !== -1, 'index.html não carrega domain-notice.js');
  assert.ok(notice < app, 'domain-notice.js deve vir antes do app.js');
  assert.ok(readFileSync(join(ROOT, 'scripts/build.js'), 'utf8').includes('domain-notice.js'), 'build.js não copia o arquivo');
});

test('o script não usa innerHTML nem escreve HTML dinâmico', () => {
  const source = readFileSync(join(ROOT, 'domain-notice.js'), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source));
});
