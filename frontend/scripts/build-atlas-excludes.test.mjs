/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O dist/ do Atlas não leva dev/ (innerHTML) nem bio-database.js (morto em produção).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { isAtlasUnpublished } = createRequire(import.meta.url)('./build-atlas-excludes.js');

test('dev/ do Atlas fica fora do dist (separadores / e barra invertida)', () => {
  assert.equal(isAtlasUnpublished('C:\\x\\frontend\\modulos\\anatomia-3d\\dev\\credits-demo.js'), true);
  assert.equal(isAtlasUnpublished('/x/frontend/modulos/anatomia-3d/dev'), true);
  assert.equal(isAtlasUnpublished('/x/frontend/modulos/anatomia-3d/dev/toolbar-demo.html'), true);
});

test('ATLAS_KEEP_DEV mantém dev/ (e2e atlas-assets), mas bio-database.js continua fora', () => {
  assert.equal(isAtlasUnpublished('/x/frontend/modulos/anatomia-3d/dev/assets-harness.html', { keepDev: true }), false);
  assert.equal(isAtlasUnpublished('/x/frontend/modulos/anatomia-3d/data/bio-database.js', { keepDev: true }), true);
});

test('arquivos do app seguem publicados', () => {
  for (const f of ['js/main.js', 'index.html', 'css/atlas.css', 'data/atlas/quiz-cases.json', 'sw.js']) {
    assert.equal(isAtlasUnpublished(`/x/frontend/modulos/anatomia-3d/${f}`), false, f);
  }
  assert.equal(isAtlasUnpublished('/x/frontend/modulos/quiz/dev/x.js'), false);
});
