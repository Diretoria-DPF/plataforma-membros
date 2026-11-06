/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Extrai socialProfileUrl de app.js e executa com um LaiftDom mínimo.
function loadHelper() {
  const m = APP.match(/function socialProfileUrl\(kind, value\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, 'socialProfileUrl existe em app.js');
  const window = { LaiftDom: { safeUrl: (u) => (/^https?:/.test(u) ? u : '') } };
  return new Function('window', `${m[0]}; return socialProfileUrl;`)(window);
}

test('socialProfileUrl: Instagram vira link do perfil; handle inválido não vira link', () => {
  const f = loadHelper();
  assert.equal(f('instagram', 'fulano.s'), 'https://www.instagram.com/fulano.s/');
  assert.equal(f('instagram', '@fulano'), 'https://www.instagram.com/fulano/');
  assert.equal(f('instagram', 'a b!'), '');
  assert.equal(f('instagram', ''), '');
});

test('socialProfileUrl: LinkedIn só https no host linkedin.com, sem query', () => {
  const f = loadHelper();
  assert.equal(f('linkedin', 'https://www.linkedin.com/in/fulano?x=1'), 'https://www.linkedin.com/in/fulano');
  assert.equal(f('linkedin', 'https://evil.com/in/fulano'), '');
  assert.equal(f('linkedin', 'https://linkedin.com.evil.com/in/x'), '');
  assert.equal(f('linkedin', 'http://linkedin.com/in/x'), '');
  assert.equal(f('linkedin', 'javascript:alert(1)'), '');
  assert.equal(f('outro', 'https://linkedin.com/in/x'), '');
});

test('perfil de membro: links abrem em nova aba com rel seguro e os campos aceitam formatos soltos', () => {
  assert.match(APP, /target: '_blank', rel: 'noopener noreferrer nofollow'/);
  assert.ok(!/id="(reg|profile)-linkedin"[^>]*type="url"|type="url"[^>]*id="(reg|profile)-linkedin"/.test(HTML), 'LinkedIn aceita linkedin.com/in/x sem https');
});
