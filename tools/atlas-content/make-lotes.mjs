#!/usr/bin/env node
/**
 * make-lotes.mjs — divide os nomes únicos em inglês de structures.json em
 * 20 lotes para tradução (PR 3.1.1, Onda 3).
 *
 * - O nome do lote é o NOME DE EXIBIÇÃO (mesma regra de prettifyName em
 *   frontend/modulos/anatomia-3d/js/main.js): "VH_F_kidney_capsule" e
 *   "VH_M_kidney_capsule" viram "Kidney capsule" — uma linha, uma tradução.
 * - Agrupa por sistema (o mesmo vocabulário fica junto, o que dá
 *   traduções consistentes) e, dentro do sistema, separa os órgãos HRA
 *   (VH_*) do corpo Z-Anatomy.
 * - Cada nome aparece em um lote só (o do primeiro sistema em que aparece).
 *
 * Uso: node tools/atlas-content/make-lotes.mjs [--lotes 20] [--out docs/atlas-traducao]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const STRUCTURES = path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas/generated/structures.json');

// Ordem de vocabulário: sistemas parecidos ficam vizinhos (lotes mistos
// só nas bordas).
const SYSTEM_ORDER = ['esqueletico', 'articular', 'muscular', 'nervoso', 'cardiovascular', 'linfatico',
  'respiratorio', 'digestorio', 'urinario', 'endocrino', 'reprodutor', 'tegumentar'];

/** Mesma regra de prettifyName (js/main.js). */
export function displayName(raw) {
  const name = String(raw || '').replace(/^VH_[MF]_/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

/**
 * Lista ordenada de nomes únicos, agrupada por sistema e origem.
 * @param {Array<{englishName: string, system: string}>} structures
 * @returns {Array<{name: string, system: string, hra: boolean}>}
 */
export function uniqueNames(structures) {
  const seen = new Map();
  for (const s of structures) {
    const name = displayName(s.englishName);
    if (!name || seen.has(name)) continue;
    seen.set(name, { name, system: s.system || '', hra: /^VH_/.test(s.englishName || '') });
  }
  const rankSys = (sys) => {
    const i = SYSTEM_ORDER.indexOf(sys);
    return i === -1 ? SYSTEM_ORDER.length : i;
  };
  return [...seen.values()].sort((a, b) =>
    rankSys(a.system) - rankSys(b.system)
    || Number(a.hra) - Number(b.hra)
    || a.name.localeCompare(b.name, 'en'));
}

/**
 * Divide em `n` lotes de tamanho quase igual, mantendo a ordem.
 * @param {Array} items
 * @param {number} n
 */
export function splitLotes(items, n) {
  const out = [];
  const base = Math.floor(items.length / n);
  let extra = items.length % n;
  let i = 0;
  for (let k = 0; k < n; k++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  const n = Number(opt('--lotes', 20));
  const outDir = path.resolve(ROOT, opt('--out', 'docs/atlas-traducao'));
  const structures = JSON.parse(fs.readFileSync(STRUCTURES, 'utf8'));
  const names = uniqueNames(structures);
  const lotes = splitLotes(names, n);
  // Remove lotes antigos (.txt) para não sobrar lote-11..NN de outra divisão.
  for (const f of fs.readdirSync(outDir)) {
    if (/^lote-\d+\.txt$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  }
  const index = [];
  lotes.forEach((lote, k) => {
    const id = String(k + 1).padStart(2, '0');
    fs.writeFileSync(path.join(outDir, `lote-${id}.txt`), lote.map((x) => x.name).join('\n') + '\n');
    const systems = [...new Set(lote.map((x) => x.system))];
    index.push(`| ${id} | ${lote.length} | ${systems.join(', ')} | ${lote.filter((x) => x.hra).length} |`);
  });
  console.log(`${names.length} nomes únicos em ${n} lotes (${Math.floor(names.length / n)}–${Math.ceil(names.length / n)} por lote).`);
  console.log('| Lote | Nomes | Sistemas | HRA |\n|---|---:|---|---:|\n' + index.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
