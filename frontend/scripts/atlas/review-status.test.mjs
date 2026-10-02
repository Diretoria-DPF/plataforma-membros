#!/usr/bin/env node
/**
 * review-status.test.mjs — selo, filtro e peso de revisão (PR 3.2, C2).
 * Uso: node --test scripts/atlas/review-status.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReviewStatus, SEARCH_BOOST } from '../../modulos/anatomia-3d/js/ui/review-status.js';
import { buildSearchIndex, search } from '../../modulos/anatomia-3d/js/ui/search-index.js';
import { buildReviewStatus } from './build-review-status.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../modulos/anatomia-3d/data/atlas/generated/review-status.json');

test('status por sid, sem lado e por grupo (revisada vence)', () => {
  const rs = createReviewStatus({ r: ['za:heart'], e: ['za:kidney-l'], g: ['za:kidney-r', 'za:liver'], l: ['za:femur'] });
  assert.equal(rs.statusOf('za:heart-r'), 'r');
  assert.equal(rs.statusOf('za:liver'), 'g');
  assert.equal(rs.statusOf('za:nada'), null);
  assert.equal(rs.groupStatus(['za:kidney-r', 'za:kidney-l']), 'e');
  assert.deepEqual(rs.counts, { r: 1, e: 1, l: 1, g: 2 });
  assert.equal(createReviewStatus(null).statusOf('za:x'), null);
});

test('busca: com o mesmo casamento, a ficha revisada vem antes', () => {
  const entries = [
    { sid: 'za:a', system: 'x', names: { pt: 'Artéria renal', en: 'Renal artery' } },
    { sid: 'za:b', system: 'x', names: { pt: 'Artéria renal acessória', en: 'Accessory renal artery' } },
  ];
  const idx = buildSearchIndex(entries);
  assert.equal(search(idx, 'arteria renal')[0].sid, 'za:a');
  const rs = createReviewStatus({ r: ['za:b'] });
  const boosted = search(idx, 'arteria renal', { boostOf: (sid) => SEARCH_BOOST[rs.statusOf(sid)] || 0 });
  assert.ok(boosted.find((r) => r.sid === 'za:b').score > search(idx, 'arteria renal').find((r) => r.sid === 'za:b').score);
});

test('review-status.json gravado está em dia com curated/, content/ e legado', () => {
  const next = `${JSON.stringify(buildReviewStatus())}\n`;
  assert.equal(fs.readFileSync(OUT, 'utf8'), next, 'rode: node scripts/atlas/build-review-status.mjs');
});
