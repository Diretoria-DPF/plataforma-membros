/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * trilhas-data.test.mjs — dados e peso de "Trilhas e desafios" (A4).
 *  - toda estrutura das trilhas existe em structures.json (nada inventado);
 *  - os casos excluídos do desafio existem no quiz;
 *  - nenhum texto público de revisão/IA/rascunho e nenhum diminutivo;
 *  - o módulo é carregado sob demanda e cabe no orçamento.
 * Uso: node --test scripts/atlas/trilhas-data.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTrails } from '../../modulos/anatomia-3d/js/modes/trilhas-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../modulos/anatomia-3d');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const data = readJson('data/atlas/trilhas.json');
const structures = readJson('data/atlas/generated/structures.json');
const cases = readJson('data/atlas/quiz-cases.json');
const index = new Map(structures.map((s) => [s.sid, s]));

const PROIBIDO = /revisad|rascunho|\bIA\b|intelig[êe]ncia artificial|gerado por|pendente de|sem revis/i;
const DIMINUTIVO = /\b(?!caminho|caminhos|sozinho|sozinha|vizinho|vizinha|pinho|linha|linhas|minha|minhas|rainha|cozinha|galinha|farinha|andaime)\w{3,}(zinh[oa]s?|inh[oa]s?)\b/i;

function textos(obj, out = []) {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((x) => textos(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => textos(x, out));
  return out;
}

test('as trilhas passam na validação contra structures.json', () => {
  assert.deepEqual(validateTrails(data, index), []);
  assert.ok(data.trilhas.length >= 4);
});

test('as estruturas das trilhas pertencem ao sistema declarado e não usam modelos com licença NC', () => {
  const NC = /kidney|renal-pelvis|cochlea|vestibule/;
  for (const t of data.trilhas) {
    for (const sid of t.passos) {
      assert.ok(index.get(sid).system, `${sid} sem sistema`);
      assert.ok(!NC.test(sid), `${sid} é de modelo com licença NC (ver docs/ATLAS_LICENCAS_PENDENTES.md)`);
    }
    const sistemas = new Set(t.passos.map((sid) => index.get(sid).system));
    assert.ok(sistemas.has(t.sistema), `${t.id}: nenhum passo no sistema ${t.sistema}`);
  }
});

test('todo caso excluído do desafio existe no quiz', () => {
  const ids = new Set(cases.map((c) => c.id));
  for (const id of data.desafio.excluirCasos) assert.ok(ids.has(id), `${id} não existe em quiz-cases.json`);
});

test('textos das trilhas: sem selo de revisão, IA ou rascunho, sem diminutivos', () => {
  for (const t of textos(data)) {
    assert.ok(!PROIBIDO.test(t), `texto proibido: ${t}`);
    assert.ok(!DIMINUTIVO.test(t), `diminutivo: ${t}`);
  }
});

test('textos da interface do modo: mesmas regras e a Guia no feminino', () => {
  for (const f of ['js/modes/trilhas.js', 'js/modes/trilhas-core.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const strings = [...src.matchAll(/'([^'\n]{12,})'|`([^`\n]{12,})`/g)].map((m) => m[1] || m[2]).filter((s) => /\s/.test(s) && !/^(https?:|\.\.?\/)/.test(s));
    for (const s of strings) {
      assert.ok(!PROIBIDO.test(s), `${f}: texto proibido: ${s}`);
      assert.ok(!DIMINUTIVO.test(s), `${f}: diminutivo: ${s}`);
    }
    assert.ok(!/\bo Guia\b/i.test(src), `${f}: use "a Guia"`);
  }
});

test('peso: o modo é carregado sob demanda e o conjunto novo cabe em 40 KB', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.match(main, /import\('\.\/modes\/trilhas\.js'\)/, 'o modo deve entrar por import() dinâmico');
  assert.ok(!/^import .*trilhas/m.test(main), 'sem import estático do modo');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/trilhas/.test(html), 'index.html não pré-carrega o modo');
  const arquivos = ['js/modes/trilhas.js', 'js/modes/trilhas-core.js', 'css/trilhas.css', 'data/atlas/trilhas.json'];
  const total = arquivos.reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0);
  assert.ok(total <= 40 * 1024, `conjunto com ${(total / 1024).toFixed(1)} KB; teto 40 KB`);
});
