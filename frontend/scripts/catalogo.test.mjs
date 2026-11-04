/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Catálogo único dos módulos (modulos/catalogo.js, TRA-13/16): nomes consistentes e contagem de questões
// conferida contra os bancos reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const C = createRequire(import.meta.url)('../modulos/catalogo.js');

function countQuestions(rel) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read(rel).replace(/\bconst allQuestions\b/, 'var allQuestions'), sandbox, { timeout: 5000 });
  return sandbox.allQuestions.length;
}

test('cinco módulos, com nomes únicos e sem "&"', () => {
  assert.deepEqual(C.MODULES.map((m) => m.id), ['farmaco', 'toxico', 'clinica', 'lab', 'anatomia']);
  const names = C.MODULES.map((m) => m.name);
  assert.equal(new Set(names).size, 5);
  names.forEach((n) => assert.ok(!n.includes('&')));
});

test('a contagem de questões do catálogo bate com os bancos de questões', () => {
  assert.equal(C.QUESTION_COUNTS.farmaco, countQuestions('modulos/quiz/questions.js'));
  assert.equal(C.QUESTION_COUNTS.toxico, countQuestions('modulos/toxicologia/questions.js'));
});

test('legenda e etiquetas mostram a contagem só onde há banco de questões', () => {
  const farmaco = C.byId('farmaco');
  assert.equal(farmaco.sub, `Simulador · ${C.QUESTION_COUNTS.farmaco} questões`);
  assert.ok(farmaco.tags.includes(`${C.QUESTION_COUNTS.farmaco} questões`));
  assert.equal(C.byId('clinica').sub, 'Casos e plantão');
  assert.equal(C.byStat('anatomia').id, 'anatomia');
  assert.equal(C.nameOf('lab'), 'Laboratório virtual');
  assert.equal(C.byId('x'), null);
});

test('as telas usam o catálogo e não repetem nomes nem a contagem fixa', () => {
  for (const file of ['learning.js', 'learn-v2.js', 'home-v3.js', 'engagement.js']) {
    const code = read(file);
    assert.match(code, /catalogo\.js|LaiftModules/, `${file} usa o catálogo`);
    assert.doesNotMatch(code, /240 questões/, `${file} sem contagem fixa`);
    assert.doesNotMatch(code, /Anatomia (&|e) (PK|Farmacocin)/, `${file} sem nome repetido`);
  }
  assert.match(read('index.html'), /modulos\/catalogo\.js/);
});
