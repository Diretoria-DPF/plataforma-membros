#!/usr/bin/env node
/**
 * validate-curated.mjs — valida o conteúdo curado e as bases do atlas
 * contra os esquemas e as regras de fonte (PR 3.2, A.5):
 *   curated/<sistema>.json, compounds.json, processes.json, routes.json,
 *   scenarios/*.json.
 * Uso: node scripts/atlas/validate-curated.mjs [dataDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkRecord, loadFontes } from './content-rules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(here, '../../modulos/anatomia-3d/data/atlas');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** @returns {{ errors: string[], counts: Object }} */
export function validateCurated(dataDir = DEFAULT_DIR, { files = null } = {}) {
  const errors = [];
  const counts = { curated: 0, compounds: 0, compoundsV2: 0, processes: 0, routes: 0, scenarios: 0 };
  const schemaDir = path.join(dataDir, 'schema');
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const compile = (name) => ajv.compile(readJson(path.join(schemaDir, name)));
  const fontes = loadFontes(readJson(path.join(dataDir, 'fontes.json')));
  const fmt = (label, v) => (v.errors || []).slice(0, 5).map((e) => `[esquema] ${label}${e.instancePath}: ${e.message}`);

  // Fichas curadas
  const vContent = compile('content.schema.json');
  const structuresPath = path.join(dataDir, 'generated/structures.json');
  const meshSids = fs.existsSync(structuresPath) ? new Set(readJson(structuresPath).map((s) => s.sid)) : null;
  // `files`: valida arquivos avulsos como fichas curadas (ex.: uma onda em
  // docs/atlas-conteudo/fichas/pendente/) em vez de curated/.
  const curatedDir = path.join(dataDir, 'curated');
  const curatedFiles = files
    ? files.map((p) => [path.basename(p), p])
    : fs.existsSync(curatedDir)
      ? fs.readdirSync(curatedDir).filter((x) => x.endsWith('.json')).sort().map((f) => [f, path.join(curatedDir, f)])
      : [];
  {
    for (const [f, filePath] of curatedFiles) {
      const data = readJson(filePath);
      if (!vContent(data)) errors.push(...fmt(`curated/${f}`, vContent));
      for (const [sid, rec] of Object.entries(data)) {
        counts.curated += 1;
        const label = `curated/${f} (${sid})`;
        if (meshSids && !meshSids.has(sid)) errors.push(`[integridade] ${label}: sid não é uma estrutura do corpo 3D`);
        if (!rec.review || !['editorial', 'reviewed', 'approved'].includes(rec.review.status)) {
          errors.push(`[conteudo] ${label}: review.status precisa ser editorial/reviewed/approved`);
        }
        const books = (rec.sources || []).filter((s) => s && (s.obraId || s.exception));
        if (books.length < 2) errors.push(`[fonte] ${label}: precisa de pelo menos 2 fontes de obra (obraId)`);
        errors.push(...checkRecord(rec, fontes, label));
      }
    }
  }

  if (files) return { errors, counts };

  // Compostos, processos, vias e cenários
  const blocks = [
    ['compounds.json', 'compounds.schema.json', 'compounds'],
    ['processes.json', 'processes.schema.json', 'processes'],
    ['routes.json', 'routes.schema.json', 'routes'],
  ];
  for (const [file, schemaName, key] of blocks) {
    const p = path.join(dataDir, file);
    if (!fs.existsSync(p)) continue;
    const data = readJson(p);
    const v = compile(schemaName);
    if (!v(data)) errors.push(...fmt(file, v));
    for (const rec of Array.isArray(data) ? data : []) {
      counts[key] += 1;
      if (key === 'compounds' && rec.pd) counts.compoundsV2 += 1;
      // Registro legado (v1, sem fontes) só é checado no texto.
      errors.push(...checkRecord(rec, fontes, `${file} (${rec.id})`));
    }
  }
  const scenDir = path.join(dataDir, 'scenarios');
  let vScenario = null; // compila uma vez só (o $id não pode ser registrado duas vezes no ajv)
  if (fs.existsSync(scenDir)) {
    for (const f of fs.readdirSync(scenDir).filter((x) => x.endsWith('.json'))) {
      counts.scenarios += 1;
      const rec = readJson(path.join(scenDir, f));
      if (!vScenario) vScenario = compile('scenario.schema.json');
      const vs = vScenario;
      if (!vs(rec)) errors.push(...fmt(`scenarios/${f}`, vs));
      errors.push(...checkRecord(rec, fontes, `scenarios/${f}`));
      if (!Array.isArray(rec.sources) || rec.sources.length < 1) errors.push(`[fonte] scenarios/${f}: sem sources[]`);
    }
  }
  return { errors, counts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const files = fileIdx >= 0 ? args.slice(fileIdx + 1).map((p) => path.resolve(p)) : null;
  const dir = path.resolve((fileIdx === 0 ? null : args[0]) || DEFAULT_DIR);
  const { errors, counts } = validateCurated(dir, { files });
  console.log(`[atlas] curado/bases: ${JSON.stringify(counts)}`);
  if (errors.length) {
    console.error(`[atlas] ${errors.length} problema(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log('[atlas] curado e bases sem erros.');
  }
}
