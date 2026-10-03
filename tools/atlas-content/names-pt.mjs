#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * names-pt.mjs — integra a tradução dos nomes (PR 3.1.5, Onda 3).
 *
 * 1. Lê docs/atlas-traducao/lote-NN.pt.tsv (nome de exibição em inglês<TAB>PT).
 * 2. Grava a fonte canônica data/atlas/names-pt.json — sobrevive a uma nova
 *    geração de structures.json pelo pipeline.
 * 3. Aplica `namePt` (por nome de exibição, ver make-lotes.mjs) em
 *    generated/structures.json e generated/structures.boot.json.
 *
 * Linhas terminadas em " ??" entram sem a marca e ficam listadas em
 * `revisar` (revisão humana). Toda tradução daqui é "assistida" até o
 * conselho revisar — a ficha mostra o selo.
 *
 * Uso: node tools/atlas-content/names-pt.mjs [--check]
 *   --check: só confere (falha se faltar tradução ou o .tsv estiver malformado).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayName } from './make-lotes.mjs';
import { loadGlossary, buildMatchers, lintText } from '../../frontend/scripts/atlas/lint-pt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const DATA = path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas');
const LOTES = path.join(ROOT, 'docs/atlas-traducao');
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/**
 * Lê um lote traduzido. Confere que a coluna 1 bate linha a linha com o .txt.
 * @returns {{ entries: Array<{en: string, pt: string, review: boolean}>, errors: string[] }}
 */
export function parseLote(txt, tsv, id = '??') {
  const names = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = tsv.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
  const errors = [];
  if (rows.length !== names.length) errors.push(`lote ${id}: ${rows.length} linhas traduzidas para ${names.length} nomes`);
  const entries = [];
  rows.forEach((row, i) => {
    const cols = row.split('\t');
    if (cols.length !== 2) { errors.push(`lote ${id}, linha ${i + 1}: ${cols.length} colunas`); return; }
    const en = cols[0].trim();
    // Caracteres invisíveis (zero-width, BOM) que o modelo às vezes insere
    // no meio da palavra ("trirradi\u200bada") quebram a busca.
    let pt = cols[1].replace(INVISIBLE_RE, '').trim();
    if (names[i] !== undefined && en !== names[i]) errors.push(`lote ${id}, linha ${i + 1}: "${en}" ≠ "${names[i]}"`);
    const review = /\s*\?\?\s*$/.test(pt);
    pt = pt.replace(/\s*\?\?\s*$/, '').trim();
    // Inicial maiúscula (alguns lotes vêm em minúsculas), inclusive após "(".
    pt = pt.replace(/^(\(?)(\p{Ll})/u, (m, p, c) => p + c.toUpperCase());
    if (!pt) { errors.push(`lote ${id}, linha ${i + 1}: tradução vazia`); return; }
    entries.push({ en, pt, review });
  });
  return { entries, errors };
}

/** Aplica namePt nas estruturas (por nome de exibição). Devolve quantas ficaram sem. */
export function applyNames(structures, names) {
  let missing = 0;
  for (const s of structures) {
    const pt = names[displayName(s.englishName)];
    if (pt) s.namePt = pt;
    else { delete s.namePt; missing += 1; }
  }
  return missing;
}

function main() {
  const check = process.argv.includes('--check');
  const files = fs.readdirSync(LOTES).filter((f) => /^lote-\d+\.txt$/.test(f)).sort();
  const names = {};
  const revisar = [];
  const errors = [];
  for (const f of files) {
    const id = f.match(/\d+/)[0];
    const tsvPath = path.join(LOTES, `lote-${id}.pt.tsv`);
    if (!fs.existsSync(tsvPath)) { errors.push(`lote ${id}: sem lote-${id}.pt.tsv`); continue; }
    const { entries, errors: e } = parseLote(fs.readFileSync(path.join(LOTES, f), 'utf8'), fs.readFileSync(tsvPath, 'utf8'), id);
    errors.push(...e);
    for (const { en, pt, review } of entries) {
      names[en] = pt;
      if (review) revisar.push(en);
    }
  }
  // Correções manuais (docs/atlas-traducao/correcoes.tsv) vencem os lotes.
  const corrPath = path.join(LOTES, 'correcoes.tsv');
  let corrected = 0;
  if (fs.existsSync(corrPath)) {
    for (const line of fs.readFileSync(corrPath, 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const [en, pt] = line.split('\t');
      if (!en || !pt) { errors.push(`correcoes.tsv: linha malformada: ${line}`); continue; }
      if (!(en.trim() in names)) { errors.push(`correcoes.tsv: "${en}" não está em nenhum lote`); continue; }
      const stillDoubt = /\s*\?\?\s*$/.test(pt);
      names[en.trim()] = pt.replace(/\s*\?\?\s*$/, '').trim();
      const i = revisar.indexOf(en.trim());
      // Corrigido à mão sai da lista de revisão — a não ser que a correção
      // ainda traga " ??" (expandida, mas sem certeza).
      if (i >= 0 && !stillDoubt) revisar.splice(i, 1);
      if (i < 0 && stillDoubt) revisar.push(en.trim());
      corrected += 1;
    }
  }

  // lint-pt: anglicismos do glossário (ex.: "Heart" no nome em português).
  const matchers = buildMatchers(loadGlossary(path.join(DATA, 'glossario-pt.json')));
  for (const [en, pt] of Object.entries(names)) {
    for (const f of lintText(pt, matchers)) errors.push(`lint-pt: "${en}" → "${pt}": ${f.message || f.match || JSON.stringify(f)}`);
  }
  const structures = JSON.parse(fs.readFileSync(path.join(DATA, 'generated/structures.json'), 'utf8'));
  const missingNames = [...new Set(structures.map((s) => displayName(s.englishName)))].filter((n) => n && !names[n]);
  if (missingNames.length) errors.push(`${missingNames.length} nome(s) sem tradução (ex.: ${missingNames.slice(0, 5).join(', ')})`);
  if (errors.length) {
    console.error(errors.join('\n'));
    if (check) process.exit(1);
  }
  console.log(`${Object.keys(names).length} nomes traduzidos; ${corrected} corrigidos à mão; ${revisar.length} para revisão humana.`);
  if (check) return;

  const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, 'en')));
  fs.writeFileSync(path.join(DATA, 'names-pt.json'), JSON.stringify({
    descricao: 'Nomes das estruturas em PT-BR (tradução assistida, prompt em docs/atlas-traducao/prompt.md). Chave: nome de exibição em inglês, sem lado nem prefixo VH_. Gerado por tools/atlas-content/names-pt.mjs.',
    status: 'assistida',
    revisar: revisar.sort(),
    nomes: sorted,
  }, null, 2) + '\n');

  applyNames(structures, names);
  fs.writeFileSync(path.join(DATA, 'generated/structures.json'), JSON.stringify(structures, null, 2)); // mesmo formato do pipeline
  const bootPath = path.join(DATA, 'generated/structures.boot.json');
  const boot = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
  applyNames(boot, names);
  fs.writeFileSync(bootPath, JSON.stringify(boot));
  console.log('names-pt.json, structures.json e structures.boot.json atualizados.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
