/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Apoio dos testes (não é um teste): confere a fiação dos scripts carregados SOB DEMANDA (MOB-04/MOB-07).
// Esses arquivos ficam em lazy-bundles.js (uma lista ordenada por pacote), são copiados pelo build.js e NÃO
// aparecem como <script> no index.html nem no PRECACHE do sw.js.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { BUNDLES } = require('../lazy-bundles.js');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

/** Posição do arquivo na lista do pacote (falha se não estiver no pacote dado). */
export function posicaoNoPacote(pacote, arquivo) {
  const i = BUNDLES[pacote].indexOf(arquivo);
  assert.ok(i >= 0, `${arquivo} não está no pacote "${pacote}" de lazy-bundles.js`);
  return i;
}

/** O arquivo está no pacote, no build.js e fora do index.html e do PRECACHE do sw.js. */
export function assertSobDemanda(pacote, arquivo) {
  posicaoNoPacote(pacote, arquivo);
  assert.ok(read('scripts/build.js').includes(`'${arquivo}'`), `build.js não publica ${arquivo}`);
  assert.ok(!read('index.html').includes(`src="${arquivo}"`), `${arquivo} não deve ser <script> do index.html (carga sob demanda)`);
  assert.ok(!read('sw.js').includes(`'${arquivo}'`), `${arquivo} não deve ser pré-cacheado (entra no cache ao ser usado)`);
}

/** a vem antes de b na ordem de execução do pacote. */
export function assertAntes(pacote, a, b) {
  assert.ok(posicaoNoPacote(pacote, a) < posicaoNoPacote(pacote, b), `${a} deve vir antes de ${b} em "${pacote}"`);
}
