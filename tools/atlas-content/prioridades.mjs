#!/usr/bin/env node
/**
 * prioridades.mjs — lista das 300 estruturas prioritárias para as fichas do
 * PR 3.2 (PR 3.1.7, Onda 3). Cotas e critérios: docs/atlas-conteudo/cotas.md.
 *
 * Uma entrada por estrutura (os dois lados e as versões M/F do órgão HRA
 * contam uma vez — mesma regra de js/ui/structure-groups.js), ordenada por:
 *   1. uso no atlas: âncoras de Fisiologia, quiz e vias (peso maior);
 *   2. ficha já existente (content/<sistema>.json com summary_pt);
 *   3. volume do bbox (desempate: estrutura maior é mais fácil de achar).
 *
 * Uso: node tools/atlas-content/prioridades.mjs  → docs/atlas-conteudo/prioridades.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayName } from './make-lotes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const DATA = path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas');

/** Cotas da Onda 3 v1.0 (docs/atlas-conteudo/cotas.md). */
export const COTAS = Object.freeze({
  esqueletico: 80, nervoso: 48, muscular: 40, digestorio: 40, cardiovascular: 36,
  respiratorio: 20, urinario: 15, linfatico: 10, articular: 6, endocrino: 5, reprodutor: 0,
});

/** Todos os sids "za:..." citados em qualquer ponto de um JSON. */
export function collectSids(value, out = []) {
  if (typeof value === 'string') {
    if (/^za:[\w-]+$/.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectSids(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectSids(v, out);
  }
  return out;
}

function volume(bbox) {
  if (!bbox || !bbox.min || !bbox.max) return 0;
  return Math.abs((bbox.max[0] - bbox.min[0]) * (bbox.max[1] - bbox.min[1]) * (bbox.max[2] - bbox.min[2]));
}

/**
 * @param {Array<Object>} structures generated/structures.json
 * @param {{ usage: Record<string, Set<string>>, withContent: Set<string>, aliases?: Record<string,string> }} signals
 *   usage: fonte ("quiz", "fisiologia"…) → sids citados; withContent: sids com ficha
 * @param {Record<string, number>} [cotas]
 */
export function buildPriorities(structures, { usage, withContent, aliases = {} }, cotas = COTAS) {
  const resolve = (sid) => aliases[sid] || sid;
  const usedBy = new Map(); // sid → Set(fonte)
  for (const [source, sids] of Object.entries(usage)) {
    for (const raw of sids) {
      const sid = resolve(raw);
      if (!usedBy.has(sid)) usedBy.set(sid, new Set());
      usedBy.get(sid).add(source);
    }
  }
  const groups = new Map();
  for (const s of structures) {
    const name = displayName(s.englishName);
    if (!name || !(s.system in cotas)) continue;
    const key = `${s.system}|${name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { system: s.system, name, sids: [], volume: 0 });
    const g = groups.get(key);
    g.sids.push(s.sid);
    g.volume = Math.max(g.volume, volume(s.bbox));
  }
  const scored = [...groups.values()].map((g) => {
    const sources = new Set();
    for (const sid of g.sids) for (const src of usedBy.get(sid) || []) sources.add(src);
    const hasContent = g.sids.some((sid) => withContent.has(sid));
    // Principal: corpo Z-Anatomy antes do HRA; lado direito por convenção.
    const primary = [...g.sids].sort((a, b) =>
      Number(/^za:vh-/.test(a)) - Number(/^za:vh-/.test(b)) || Number(a.endsWith('-l')) - Number(b.endsWith('-l')))[0];
    const reasons = [...sources].sort().map((src) => `usada em ${src}`);
    if (hasContent) reasons.push('ficha existente');
    // Nomes entre parênteses são grupos do Z-Anatomy (coleções), não estruturas.
    const isCollection = /^\(.*\)$/.test(g.name);
    const score = sources.size * 100 + (hasContent ? 50 : 0) + Math.min(20, Math.max(0, Math.log10(g.volume * 1e6 + 1) * 4)) - (isCollection ? 60 : 0);
    return { system: g.system, name: g.name, sid: primary, sids: g.sids.sort(), score: Math.round(score * 10) / 10, reasons };
  });
  const items = [];
  for (const [system, cota] of Object.entries(cotas)) {
    const pool = scored.filter((x) => x.system === system)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'en'));
    items.push(...pool.slice(0, cota));
  }
  return items.map((x, i) => ({ rank: i + 1, ...x }));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const structures = readJson(path.join(DATA, 'generated/structures.json'));
  const usage = {
    fisiologia: new Set(collectSids(readJson(path.join(DATA, 'generated/anchor-map.json')))),
    quiz: new Set(collectSids(readJson(path.join(DATA, 'quiz-cases.json')))),
    vias: new Set(collectSids(readJson(path.join(DATA, 'routes.json')))),
    processos: new Set(collectSids(readJson(path.join(DATA, 'processes.json')))),
  };
  const withContent = new Set();
  for (const f of fs.readdirSync(path.join(DATA, 'content'))) {
    const file = readJson(path.join(DATA, 'content', f));
    for (const [sid, c] of Object.entries(file)) if (c && c.summary_pt) withContent.add(sid);
  }
  const aliases = readJson(path.join(DATA, 'sid-aliases.json'));
  const items = buildPriorities(structures, { usage, withContent, aliases });
  const out = path.join(ROOT, 'docs/atlas-conteudo/prioridades.json');
  fs.writeFileSync(out, JSON.stringify({
    descricao: 'Lista das 300 estruturas prioritárias (Onda 3). Gerada por tools/atlas-content/prioridades.mjs; o conselho editorial valida antes das fichas.',
    cotas: COTAS,
    total: items.length,
    itens: items,
  }, null, 2) + '\n');
  const bySystem = {};
  for (const it of items) bySystem[it.system] = (bySystem[it.system] || 0) + 1;
  console.log(`${items.length} estruturas →`, path.relative(ROOT, out));
  console.log(bySystem);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
