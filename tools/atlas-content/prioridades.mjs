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

/**
 * Chave de agrupamento pelo nome em português (PR 3.2): junta as versões M/F
 * do órgão HRA com nomes abreviados ("antlat", "posmed") e o mesmo órgão no
 * corpo Z-Anatomy e no HRA ("Ventrículo esquerdo" × "Ventrículo esquerdo do
 * coração", "Átrio esquerdo" × "Átrio cardíaco esquerdo").
 */
export function groupNameKey(namePt) {
  return String(namePt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(do coracao|cardiac[oa])\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Sistemas que recebem as vagas que sobram quando um sistema tem menos
 * estruturas distintas que a cota (ex.: cardiovascular tem 31 para 36),
 * para a lista continuar com 300.
 */
export const SPILL_ORDER = Object.freeze(['nervoso', 'digestorio', 'esqueletico', 'muscular']);

/**
 * Nome de exibição de um grupo ZA × HRA (PR 3.2, O3): o nome do ZA vence
 * (mais próximo do aluno brasileiro); o do HRA só se não houver ZA, ou se
 * só o do HRA já tiver sido revisado pelo conselho (fora de "assistida").
 * Os demais nomes do grupo viram sinônimos.
 * @param {Array<{en: string, pt: string, hra: boolean}>} names
 * @param {Set<string>} reviewedPt nomes em inglês cuja tradução foi revisada
 */
export function pickGroupName(names, reviewedPt = new Set()) {
  const za = names.filter((n) => !n.hra);
  const hra = names.filter((n) => n.hra);
  const reviewed = (list) => list.find((n) => reviewedPt.has(n.en));
  let chosen;
  if (!za.length) chosen = hra[0];
  else if (reviewed(hra) && !reviewed(za)) chosen = reviewed(hra);
  else chosen = reviewed(za) || za[0];
  const sinonimos_pt = [...new Set(names.map((n) => n.pt))].filter((pt) => pt !== chosen.pt).sort((a, b) => a.localeCompare(b, 'pt'));
  return { nome_pt: chosen.pt, sinonimos_pt, sourceOfName: chosen.hra ? 'hra' : 'za' };
}

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
export function buildPriorities(structures, { usage, withContent, aliases = {}, namesPt = {}, reviewedPt = new Set() }, cotas = COTAS) {
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
    const key = `${s.system}|${groupNameKey(namesPt[name] || name)}`;
    if (!groups.has(key)) groups.set(key, { system: s.system, name, sids: [], volume: 0, names: [] });
    const g = groups.get(key);
    g.sids.push(s.sid);
    const hra = /^VH_/.test(s.englishName || '');
    if (!g.names.some((n) => n.en === name)) g.names.push({ en: name, pt: namesPt[name] || name, hra });
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
    const { nome_pt, sinonimos_pt, sourceOfName } = pickGroupName(g.names, reviewedPt);
    return { system: g.system, name: g.name, nome_pt, sinonimos_pt, sourceOfName, sid: primary, sids: g.sids.sort(), score: Math.round(score * 10) / 10, reasons };
  });
  const items = [];
  const pools = {};
  let spare = 0;
  for (const [system, cota] of Object.entries(cotas)) {
    pools[system] = scored.filter((x) => x.system === system)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'en'));
    const taken = pools[system].slice(0, cota);
    spare += cota - taken.length;
    items.push(...taken);
  }
  // Vagas que sobraram vão para os sistemas de SPILL_ORDER, na ordem.
  for (const system of SPILL_ORDER) {
    if (spare <= 0 || !pools[system]) continue;
    const already = items.filter((x) => x.system === system).length;
    const extra = pools[system].slice(already, already + spare).map((x) => ({ ...x, reasons: [...x.reasons, 'vaga redistribuída'] }));
    spare -= extra.length;
    items.push(...extra);
  }
  // Ordem final por sistema (cotas) e, dentro dele, por escore.
  const order = Object.keys(cotas);
  items.sort((a, b) => order.indexOf(a.system) - order.indexOf(b.system) || b.score - a.score);
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
  const namesFile = fs.existsSync(path.join(DATA, 'names-pt.json')) ? readJson(path.join(DATA, 'names-pt.json')) : {};
  const namesPt = namesFile.nomes || {};
  // Nomes já revisados pelo conselho (quando existir a lista em names-pt.json).
  const reviewedPt = new Set(namesFile.revisados || []);
  const items = buildPriorities(structures, { usage, withContent, aliases, namesPt, reviewedPt });
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
