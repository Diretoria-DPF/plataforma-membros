#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * review-tool.test.mjs — ferramenta de revisão do conselho (PR 3.2, C1).
 * O .md gerado passa na trava do build (check-curated-signed: isSigned)
 * só quando aprovado; reprovado e modelo em branco não passam.
 * Uso: node --test scripts/atlas/review-tool.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFichas, ondaDecision, buildReviewMd, contentHash, markProblem, ondaFromPath } from '../../modulos/anatomia-3d/js/revisao/review-core.js';
import { isSigned } from './check-curated-signed.mjs';
import { buildPacote } from './pacote-onda.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');

const L1 = { 'za:a-r': { summary_pt: 'x' }, 'za:b': { summary_pt: 'y' } };
const L2 = { 'za:c': { summary_pt: 'z' } };
const base = { reviewer: 'Dra. Maria Souza', registro: 'CRF-BA 1234', date: '2026-10-05', hash: 'abc', nameOf: (s) => s.toUpperCase() };

test('lotes e pacote viram uma lista ordenada; repetidas e inválidas são apontadas', () => {
  const r = collectFichas([{ name: 'onda-01/lote-02.json', json: L2 }, { name: 'onda-01/lote-01.json', json: L1 }]);
  assert.equal(r.onda, 1);
  assert.deepEqual(r.fichas.map((f) => f.sid), ['za:a-r', 'za:b', 'za:c']);
  const p = collectFichas([{ name: 'pacote.json', json: { onda: 3, lotes: { 'lote-01.json': L1 } } }, { name: 'x.json', json: { 'za:b': {}, oops: 1 } }]);
  assert.equal(p.onda, 3);
  assert.equal(p.errors.length, 2);
  assert.equal(ondaFromPath('pacote-onda-07.json'), 7);
});

test('decisão da onda e marcação incompleta', () => {
  const f = collectFichas([{ name: 'lote-01.json', json: L1 }]).fichas;
  assert.equal(ondaDecision(f, { 'za:a-r': { decision: 'aprovar' } }), null);
  assert.equal(ondaDecision(f, { 'za:a-r': { decision: 'aprovar' }, 'za:b': { decision: 'aprovar' } }), 'aprovado');
  assert.equal(ondaDecision(f, { 'za:a-r': { decision: 'aprovar' }, 'za:b': { decision: 'comentar', comment: 'ajustar' } }), 'aprovado com ressalvas');
  assert.equal(ondaDecision(f, { 'za:a-r': { decision: 'reprovar', comment: 'errado' }, 'za:b': { decision: 'aprovar' } }), 'reprovado');
  assert.ok(markProblem({ decision: 'reprovar', comment: '' }));
  assert.equal(markProblem({ decision: 'aprovar' }), null);
});

test('.md aprovado passa na trava do build; reprovado e modelo em branco não', () => {
  const fichas = collectFichas([{ name: 'lote-01.json', json: L1 }]).fichas;
  const ok = buildReviewMd({ ...base, onda: 1, fichas, marks: { 'za:a-r': { decision: 'aprovar' }, 'za:b': { decision: 'comentar', comment: 'trocar termo' } } });
  assert.ok(isSigned(ok), ok);
  assert.match(ok, /\*\*Aprovação:\*\* aprovado com ressalvas/);
  assert.match(ok, /Ficha `za:b` \(ZA:B\): trocar termo/);
  assert.match(ok, /\*\*Conteúdo revisado \(SHA-256\):\*\* abc/);
  const bad = buildReviewMd({ ...base, onda: 1, fichas, marks: { 'za:a-r': { decision: 'reprovar', comment: 'erro factual' }, 'za:b': { decision: 'aprovar' } } });
  assert.equal(isSigned(bad), false);
  assert.throws(() => buildReviewMd({ ...base, reviewer: '', onda: 1, fichas, marks: { 'za:a-r': { decision: 'aprovar' }, 'za:b': { decision: 'aprovar' } } }), /revisor/);
  assert.throws(() => buildReviewMd({ ...base, onda: 1, fichas, marks: { 'za:a-r': { decision: 'aprovar' } } }), /sem decisão/);
  const blank = fs.readFileSync(path.join(ROOT, 'docs/atlas-conteudo/revisao-onda-modelo.md'), 'utf8');
  assert.equal(isSigned(blank), false);
});

test('hash estável do conteúdo e pacote da onda 01', async () => {
  const a = await contentHash([{ sid: 'za:x', data: { b: 1, a: 2 } }]);
  const b = await contentHash([{ sid: 'za:x', data: { a: 2, b: 1 } }]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  const p = buildPacote(1);
  const r = collectFichas([{ name: 'pacote-onda-01.json', json: p }]);
  assert.equal(r.onda, 1);
  assert.equal(r.errors.length, 0);
  assert.equal(r.fichas.length, 31);
});
