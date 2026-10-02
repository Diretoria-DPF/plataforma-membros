#!/usr/bin/env node
/**
 * build-review-status.mjs — mapa sid → status de revisão da ficha (PR 3.2, C2).
 *
 * Grava data/atlas/generated/review-status.json, arquivo leve lido no boot
 * para o selo e o filtro do navegador e o peso da busca, sem baixar as
 * fichas (elas continuam sob demanda em getContent). Mesma precedência de
 * content-merge.js: curada > legado > gerada.
 *   r = revisada pelo conselho (curated, reviewed/approved)
 *   e = em revisão editorial (curated, editorial)
 *   l = conteúdo antigo (legacy/content)
 *   g = gerada automaticamente (content/)
 *
 * Uso: node scripts/atlas/build-review-status.mjs [--check]
 *   --check: falha se o arquivo gravado estiver desatualizado (testes/CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkLegacy } from '../../modulos/anatomia-3d/js/ui/legacy-link.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '../../modulos/anatomia-3d/data/atlas');
const OUT = path.join(DATA, 'generated/review-status.json');

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const readDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [])
  .reduce((acc, f) => Object.assign(acc, readJson(path.join(dir, f), {})), {});

export function buildReviewStatus(dataDir = DATA) {
  const structures = readJson(path.join(dataDir, 'generated/structures.boot.json'), []);
  const legacyIndex = readJson(path.join(dataDir, 'legacy/index.legacy.json'), []);
  const curated = readDir(path.join(dataDir, 'curated'));
  const generated = readDir(path.join(dataDir, 'content'));
  const legacy = readDir(path.join(dataDir, 'legacy/content'));
  const realToLegacy = linkLegacy(structures, legacyIndex);
  const base = (sid) => sid.replace(/-[lr]$/, '');
  const pick = (map, sid) => map[sid] || map[base(sid)] || null;
  const out = { r: [], e: [], l: [], g: [] };
  for (const s of structures) {
    const sid = s.sid;
    const cur = pick(curated, sid);
    const st = cur && cur.review ? cur.review.status : null;
    if (st === 'reviewed' || st === 'approved') out.r.push(sid);
    else if (cur) out.e.push(sid);
    else if (legacy[realToLegacy.get(sid)] || legacy[sid]) out.l.push(sid);
    else if (pick(generated, sid)) out.g.push(sid);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return { v: 1, ...out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = `${JSON.stringify(buildReviewStatus())}\n`;
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== next) { console.error('[atlas] review-status.json desatualizado — rode node scripts/atlas/build-review-status.mjs'); process.exit(1); }
    console.log('[atlas] review-status.json em dia.');
  } else {
    fs.writeFileSync(OUT, next);
    const s = JSON.parse(next);
    console.log(`[atlas] review-status.json: ${s.r.length} revisadas, ${s.e.length} em revisão, ${s.l.length} antigas, ${s.g.length} geradas`);
  }
}
