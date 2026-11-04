#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * peek.test.mjs — a ficha pública (js/ui/infocard.js) não mostra revisão.
 * Regra do dono: o público só vê as informações e interage; selo ⓘ, selo de
 * status e textos de revisão/rascunho/legado ficam fora da vista. Os campos
 * de revisão permanecem no JSON (telas de gestão e ferramenta de revisão).
 * Uso: node scripts/atlas/peek.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const infocardPath = path.resolve(here, '../../modulos/anatomia-3d/js/ui/infocard.js');
const mod = await import(pathToFileURL(infocardPath).href);

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) {
    failures += 1; console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}

console.log('infocard (vista pública)');

test('o resumo padrão de rascunho automático nunca é mostrado', () => {
  assert.equal(mod.publicSummary('Resumo ainda não redigido — aguardando revisão humana.'), '');
  assert.equal(mod.publicSummary('  resumo ainda nao redigido '), '');
  assert.equal(mod.publicSummary(undefined), '');
  assert.equal(mod.publicSummary('   '), '');
});

test('um resumo real é mantido', () => {
  assert.equal(mod.publicSummary(' O fígado é a maior glândula do corpo. '), 'O fígado é a maior glândula do corpo.');
});

test('estrutura sem ficha: nome em inglês, sistema, localização e lado (sem aviso de ausência)', () => {
  const facts = mod.plainFacts(
    { names: { pt: 'Fêmur', en: 'Femur' } },
    { systemLabel: 'Esquelético', layerLabel: 'Esqueleto', sideLabel: 'Direito' },
  );
  assert.deepEqual(facts.map((f) => f.label), ['Sistema', 'Localização', 'Lado', 'Nome em inglês']);
  assert.ok(facts.every((f) => !/sem descri|rascunho|revis/i.test(`${f.label} ${f.value}`)));
});

test('o módulo não exporta mais o selo de status e o código não usa o selo ⓘ', () => {
  assert.equal(mod.getStatusLabel, undefined);
  const src = fs.readFileSync(infocardPath, 'utf8');
  assert.ok(!/LaiftReviewSeal|atlas-card-status|Status de Revisão|Sem descrição ainda|Tradução assistida/.test(src));
});

test('index.html do Atlas não carrega o selo de revisão', () => {
  const html = fs.readFileSync(path.resolve(here, '../../modulos/anatomia-3d/index.html'), 'utf8');
  assert.ok(!/laift-review-seal/.test(html));
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
