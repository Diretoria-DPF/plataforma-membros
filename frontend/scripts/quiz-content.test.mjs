// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// Guarda de conteúdo dos bancos de quiz: ids únicos, 4 alternativas distintas, gabarito válido,
// explicação presente, sem diminutivos e sem erros de digitação conhecidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadBank(rel) {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(frontend, rel), 'utf8'), sandbox, { filename: rel });
  return vm.runInContext('allQuestions', sandbox);
}

const DIMINUTIVO = /\b\w{3,}(zinh[oa]s?|inh[oa]s?)\b/gi;
const NAO_DIMINUTIVO = /^(linha|linhas|caminho|caminhos|sozinha|sozinho|vizinh\w*|daninha|farinha|minha|tinha|vinha|rainha|cozinha|galinha|andorinha|pinho|ninho|carinho|sozinhas|sozinhos|vinho|marinha|cavalinha|espinha|espinho|toxina|cocaína|penicilina|insulina|heparina|adrenalina|nicotina|morfina|codeína|vitamina|medicina|aspirina|varfarina|cafeína)s?$/i;
const TYPOS = [/\bCompeti\b/, /\s{2,}/, /\.\./, / ,/, /\( /, / \)/];

for (const [nome, rel] of [['farmacologia', 'modulos/quiz/questions.js'], ['toxicologia', 'modulos/toxicologia/questions.js']]) {
  test(`${nome}: banco íntegro (ids, alternativas, gabarito, explicação)`, () => {
    const bank = loadBank(rel);
    const ids = new Set();
    for (const q of bank) {
      assert.ok(!ids.has(q.id), `id repetido ${q.id}`);
      ids.add(q.id);
      assert.equal(q.options.length, 4, `q${q.id}: 4 alternativas`);
      assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, `q${q.id}: gabarito válido`);
      assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, 4, `q${q.id}: alternativas distintas`);
      assert.ok(q.explanation && q.explanation.length >= 30, `q${q.id}: explicação`);
    }
  });

  test(`${nome}: sem diminutivos nem erros de digitação conhecidos`, () => {
    const bank = loadBank(rel);
    const problemas = [];
    for (const q of bank) {
      const texto = [q.question, q.explanation, ...q.options].join(' | ');
      for (const m of texto.match(DIMINUTIVO) || []) if (!NAO_DIMINUTIVO.test(m)) problemas.push(`q${q.id}: diminutivo "${m}"`);
      for (const re of TYPOS) if (re.test(texto)) problemas.push(`q${q.id}: padrão suspeito ${re}`);
    }
    assert.deepEqual(problemas, []);
  });
}
