/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Paginação das listas do painel admin. A auditoria recebe `totalIsLowerBound` do servidor
// (contagem com teto): acima do teto o total é "mais de N" e "Próxima" só desliga na última página real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');

const BLOCK_START = '// >>> paginacao (puro)';
const BLOCK_END = '// <<< paginacao (puro)';
function pureHelpers() {
  const start = APP.indexOf(BLOCK_START);
  const end = APP.indexOf(BLOCK_END);
  assert.ok(start >= 0 && end > start, 'bloco "paginacao (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn { paginationState };`)();
}

test('total exato: texto e botões como sempre', () => {
  const { paginationState } = pureHelpers();
  assert.deepEqual(paginationState(2, 50, 137), { label: 'Página 2 de 3 (137 registros)', hasPrev: true, hasNext: true });
  assert.deepEqual(paginationState(3, 50, 137), { label: 'Página 3 de 3 (137 registros)', hasPrev: true, hasNext: false });
  assert.deepEqual(paginationState(1, 50, 0), { label: 'Página 1 de 1 (0 registros)', hasPrev: false, hasNext: false });
  assert.equal(paginationState(1, 50, 137, { totalIsLowerBound: false }).hasNext, true);
});

test('total é limite inferior: "mais de N", sem "de P", e Próxima segue ligada até a última página real', () => {
  const { paginationState } = pureHelpers();
  const mid = paginationState(7, 50, 10000, { totalIsLowerBound: true, isLastPage: false });
  assert.equal(mid.label, 'Página 7 (mais de 10000 registros)');
  assert.equal(mid.hasNext, true);
  assert.equal(mid.hasPrev, true);
  const beyond = paginationState(250, 50, 10000, { totalIsLowerBound: true, isLastPage: false });
  assert.equal(beyond.hasNext, true, 'passa da página 200 (10000/50) sem travar');
  const last = paginationState(260, 50, 10000, { totalIsLowerBound: true, isLastPage: true });
  assert.equal(last.hasNext, false);
});

test('a auditoria passa totalIsLowerBound e isLastPage ao renderizador', () => {
  assert.match(APP, /renderPagination\('admin-audit-pagination', res\.page, res\.pageSize, res\.total, loadAdminAudit, \{\s*totalIsLowerBound: !!res\.totalIsLowerBound,\s*isLastPage: res\.logs\.length < res\.pageSize/);
  // os demais usos seguem com 5 argumentos (total exato)
  assert.match(APP, /renderPagination\('admin-users-pagination', res\.page, res\.pageSize, res\.total, loadAdminUsers\)/);
});
