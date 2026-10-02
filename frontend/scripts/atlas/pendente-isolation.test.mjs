#!/usr/bin/env node
/**
 * pendente-isolation.test.mjs — fichas pendentes nunca chegam ao atlas
 * (PR 3.2, O2).
 * Roda com: node frontend/scripts/atlas/pendente-isolation.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCuratedSigned, isSigned } from './check-curated-signed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const ATLAS = path.join(ROOT, 'frontend/modulos/anatomia-3d');
let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) { failures += 1; console.error(`  FALHOU — ${name}\n    ${err.message}`); }
}

console.log('isolamento de pendente/');

test('nenhum arquivo do atlas (js/, index.html) lê o caminho pendente/', () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(e.name) && /pendente\//.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ATLAS, 'js'));
  if (/pendente\//.test(fs.readFileSync(path.join(ATLAS, 'index.html'), 'utf8'))) hits.push('index.html');
  assert.deepEqual(hits, []);
});

test('pendente/ fica fora de frontend/ (o build só copia frontend/)', () => {
  assert.ok(!fs.existsSync(path.join(ATLAS, 'data/atlas/pendente')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'frontend/docs')));
});

test('estado atual: fichas curadas só de ondas assinadas', () => {
  assert.deepEqual(checkCuratedSigned().errors, []);
});

test('ficha posta em curated/ sem assinatura da onda trava o build', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sign-'));
  const cur = path.join(tmp, 'frontend/modulos/anatomia-3d/data/atlas/curated');
  const fichas = path.join(tmp, 'docs/atlas-conteudo/fichas');
  fs.mkdirSync(cur, { recursive: true });
  fs.mkdirSync(fichas, { recursive: true });
  fs.writeFileSync(path.join(fichas, 'onda-01.json'), JSON.stringify({ onda: 1, lotes: [{ itens: [{ sid: 'za:left-ventricle', sids: ['za:left-ventricle'] }] }] }));
  fs.writeFileSync(path.join(cur, 'cardiovascular.json'), JSON.stringify({ 'za:left-ventricle': { summary_pt: 'x' } }));
  assert.match(checkCuratedSigned({ root: tmp }).errors.join('\n'), /onda 1, sem revisao-onda-01\.md assinada/);
  // reprovado continua travado
  fs.writeFileSync(path.join(tmp, 'docs/atlas-conteudo/revisao-onda-01.md'), '- **Revisor:** Dra. Ana\n- **Aprovação:** reprovado\n');
  assert.equal(checkCuratedSigned({ root: tmp }).errors.length, 1);
  // aprovado libera
  fs.writeFileSync(path.join(tmp, 'docs/atlas-conteudo/revisao-onda-01.md'), '- **Revisor:** Dra. Ana (CRM 000)\n- **Aprovação:** aprovado com ressalvas\n');
  assert.deepEqual(checkCuratedSigned({ root: tmp }).errors, []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('modelo em branco não conta como assinatura', () => {
  assert.equal(isSigned(fs.readFileSync(path.join(ROOT, 'docs/atlas-conteudo/revisao-onda-modelo.md'), 'utf8')), false);
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
