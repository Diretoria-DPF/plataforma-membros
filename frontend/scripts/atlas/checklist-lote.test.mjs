#!/usr/bin/env node
/**
 * checklist-lote.test.mjs — checklist do conselho por lote (plano v4.0).
 * Só a ficha aprovada num checklist assinado (≥ 90%) passa na trava do build.
 * Uso: node --test scripts/atlas/checklist-lote.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChecklist, parseChecklist } from './checklist-lote.mjs';
import { checkCuratedSigned } from './check-curated-signed.mjs';
import { leiaMe } from './pacote-lote.mjs';

const fichas = Array.from({ length: 10 }, (_, i) => ({ sid: `za:f${i}`, nome: `Ficha ${i}` }));
const blank = buildChecklist({ lote: 1, sistemas: ['Cardiovascular'], fichas, hash: 'abc123' });

/** Marca a ficha `sid` com a opção dada (e o texto da ressalva/motivo). */
function mark(md, sid, opcao, texto = '') {
  const [head, ...rest] = md.split(`\`${sid}\``);
  let tail = rest.join(`\`${sid}\``);
  tail = tail.replace(`[ ] ${opcao}`, `[x] ${opcao}`).replace('- Ressalva ou motivo: ', `- Ressalva ou motivo: ${texto}`);
  return `${head}\`${sid}\`${tail}`;
}
const sign = (md) => md.replace('- **Revisor:** ___', '- **Revisor:** Dra. Ana Lima')
  .replace('- **Registro profissional:** ___', '- **Registro profissional:** CRM-BA 0000')
  .replace('- **Data:** AAAA-MM-DD', '- **Data:** 2026-10-06');

test('checklist em branco não está assinado e lista todas as fichas', () => {
  const r = parseChecklist(blank);
  assert.equal(r.signed, false);
  assert.equal(r.total, 10);
  assert.equal(r.lote, 1);
  assert.equal(r.hash, 'abc123');
  assert.deepEqual(r.approvedSids, []);
});

test('abaixo de 90% não assina; com 90% assina e só publica as aprovadas', () => {
  let md = sign(blank);
  for (let i = 0; i < 8; i++) md = mark(md, `za:f${i}`, 'Aprovar');
  md = mark(md, 'za:f8', 'Reprovar', 'confunde com outra estrutura');
  let r = parseChecklist(md);
  assert.equal(r.pct, 80);
  assert.equal(r.signed, false);
  assert.equal(r.resultado, 'reprovado');
  md = mark(md, 'za:f9', 'Aprovar com ressalva', 'trocar "válvula" por "valva" no resumo');
  r = parseChecklist(md);
  assert.equal(r.pct, 90);
  assert.equal(r.signed, true);
  assert.equal(r.resultado, 'aprovado com ressalvas');
  assert.ok(!r.approvedSids.includes('za:f8'));
  assert.ok(r.approvedSids.includes('za:f9'));
  assert.equal(r.approvedSids.length, 9);
});

test('aprovação em bloco cobre as não marcadas, nunca a reprovada', () => {
  let md = sign(blank).replace('- [ ] Li todas as fichas', '- [x] Li todas as fichas');
  md = mark(md, 'za:f3', 'Reprovar', 'histologia errada');
  const r = parseChecklist(md);
  assert.equal(r.signed, true);
  assert.equal(r.approvedSids.length, 9);
  assert.ok(!r.approvedSids.includes('za:f3'));
});

test('sem cabeçalho não assina; ressalva sem texto e marca dupla não contam como aprovação', () => {
  let md = blank.replace('- [ ] Li todas as fichas', '- [x] Li todas as fichas');
  assert.equal(parseChecklist(md).signed, false);
  md = sign(blank);
  for (let i = 0; i < 8; i++) md = mark(md, `za:f${i}`, 'Aprovar');
  md = mark(md, 'za:f8', 'Aprovar com ressalva');
  md = mark(mark(md, 'za:f9', 'Aprovar'), 'za:f9', 'Reprovar', 'x');
  const r = parseChecklist(md);
  assert.equal(r.signed, false);
  assert.equal(r.problemas.length, 2);
});

test('trava do build: com o lote assinado, só a ficha aprovada entra em curated/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lote-'));
  const cur = path.join(tmp, 'frontend/modulos/anatomia-3d/data/atlas/curated');
  const docs = path.join(tmp, 'docs/atlas-conteudo');
  fs.mkdirSync(cur, { recursive: true });
  fs.mkdirSync(path.join(docs, 'fichas'), { recursive: true });
  const itens = fichas.map((f) => ({ sid: f.sid, sids: [f.sid, `${f.sid}-l`] }));
  fs.writeFileSync(path.join(docs, 'fichas/onda-02.json'), JSON.stringify({ onda: 2, lotes: [{ itens }] }));
  fs.writeFileSync(path.join(cur, 'nervoso.json'), JSON.stringify({ 'za:f0': {}, 'za:f8': {} }));
  // sem checklist: trava
  assert.equal(checkCuratedSigned({ root: tmp }).errors.length, 2);
  // checklist em branco: trava
  fs.writeFileSync(path.join(docs, 'revisao-lote-1.md'), blank);
  assert.equal(checkCuratedSigned({ root: tmp }).errors.length, 2);
  // assinado com f8 reprovada: f0 passa, f8 trava
  let md = sign(blank).replace('- [ ] Li todas as fichas', '- [x] Li todas as fichas');
  md = mark(md, 'za:f8', 'Reprovar', 'erro no território arterial');
  fs.writeFileSync(path.join(docs, 'revisao-lote-1.md'), md);
  const r = checkCuratedSigned({ root: tmp });
  assert.deepEqual(r.signedLotes, [1]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /za:f8.*não foi aprovada no checklist assinado do lote 1/);
  // checklist do lote 1 não libera onda de outro lote
  fs.writeFileSync(path.join(docs, 'fichas/onda-04.json'), JSON.stringify({ onda: 4, lotes: [{ itens: [{ sid: 'za:g1', sids: ['za:g1'] }] }] }));
  fs.writeFileSync(path.join(cur, 'nervoso.json'), JSON.stringify({ 'za:f0': {} }));
  fs.writeFileSync(path.join(cur, 'digestorio.json'), JSON.stringify({ 'za:g1': {} }));
  assert.match(checkCuratedSigned({ root: tmp }).errors.join('\n'), /za:g1.*revisao-lote-2\.md/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('LEIA-ME tem as 10 instruções com prazo e regra dos 90%', () => {
  const t = leiaMe(2, 60);
  assert.equal(t.split('\n').filter((l) => /^\d+\. /.test(l)).length, 10);
  assert.match(t, /3 dias/);
  assert.match(t, /90%/);
});

test('lote de quiz (4a): checklist por caso e trava de quiz-cases.json', async () => {
  const { buildChecklist: build, parseChecklist: parse, QUIZ_LOTE } = await import('./checklist-lote.mjs');
  const casos = Array.from({ length: 10 }, (_, i) => ({ sid: `q4a-x-0${i}`, nome: `Caso ${i}` }));
  let md = build({ lote: QUIZ_LOTE, sistemas: ['Quiz'], fichas: casos, hash: 'h', tipo: 'quiz' });
  assert.match(md, /Li todos os casos/);
  assert.equal(parse(md).lote, '4a');
  assert.equal(parse(md).signed, false);
  md = md.replace('- **Revisor:** ___', '- **Revisor:** Dr. Caio Souza').replace('- **Registro profissional:** ___', '- **Registro profissional:** CRM 1').replace('- **Data:** AAAA-MM-DD', '- **Data:** 2026-10-06')
    .replace('- [ ] Li todos os casos', '- [x] Li todos os casos');
  md = mark(md, 'q4a-x-03', 'Reprovar', 'resposta errada');
  const r = parse(md);
  assert.equal(r.signed, true);
  assert.ok(!r.approvedSids.includes('q4a-x-03') && r.approvedSids.length === 9);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-quiz-'));
  const data = path.join(tmp, 'frontend/modulos/anatomia-3d/data/atlas');
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(path.join(tmp, 'docs/atlas-conteudo'), { recursive: true });
  const base = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../modulos/anatomia-3d/data/atlas/quiz-cases.json'), 'utf8'));
  fs.writeFileSync(path.join(data, 'quiz-cases.json'), JSON.stringify([...base, { id: 'q4a-x-00' }, { id: 'q4a-x-03' }]));
  assert.equal(checkCuratedSigned({ root: tmp }).errors.length, 2, 'sem checklist: os dois casos novos travam');
  fs.writeFileSync(path.join(tmp, 'docs/atlas-conteudo/revisao-lote-4a.md'), md);
  const res = checkCuratedSigned({ root: tmp });
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /q4a-x-03/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
