#!/usr/bin/env node
/**
 * fetch.mjs
 *
 * Roda só no GitHub Actions (internet livre). Dois subcomandos:
 *
 *   node fetch.mjs zanatomy --ref <sha|branch> --out <dir>
 *     Baixa 'Z-Anatomy.zip', commitado direto no repo
 *     Z-Anatomy/Models-of-human-anatomy (branch master; não é LFS nem
 *     release asset — é um blob normal, por isso dá para baixar com um GET
 *     simples em raw.githubusercontent.com), e extrai só o
 *     'Z-Anatomy/Startup.blend' de dentro (usa `unzip`, presente nos
 *     runners ubuntu-latest). Também copia o License.txt do repo para
 *     referência.
 *
 *   node fetch.mjs hra --list <hra-organs.json> --out <dir>
 *     Lê a lista de órgãos desejados (chave, rótulo esperado, sexo) e
 *     resolve a URL exata do GLB de cada um contra a API de referência do
 *     HRA (a versão de cada órgão muda com o tempo — nunca fixar a versão
 *     "na mão"). Baixa cada GLB encontrado; avisa (sem falhar o job) sobre
 *     qualquer órgão da lista que a API não tiver mais.
 *
 * Ver discover.mjs para como essas fontes foram confirmadas, e SOURCES.md
 * para o resumo com licenças.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const UA = 'atlas-pipeline-fetch (plataforma-membros WP10)';
const HRA_ENDPOINTS = [
  'https://apps.humanatlas.io/api/v1/reference-organs',
  'https://apps.humanatlas.io/hra-api/v1/reference-organs',
  'https://ccf-api.hubmapconsortium.org/v1/reference-organs',
];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(tok);
    }
  }
  return out;
}

async function downloadToFile(url, destPath, { label } = {}) {
  console.log(`Baixando ${label || url} ...`);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} em ${url}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  console.log(`  -> ${destPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  return buf.length;
}

// ---------------------------------------------------------------------------
// zanatomy
// ---------------------------------------------------------------------------
async function cmdZAnatomy(args) {
  const ref = args.ref || 'master';
  const outDir = args.out;
  if (!outDir) throw new Error('Uso: node fetch.mjs zanatomy --ref <sha|branch> --out <dir>');

  const zipUrl = `https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/${ref}/Z-Anatomy.zip`;
  const zipPath = path.join(outDir, 'Z-Anatomy.zip');
  // Se o `actions/cache` já restaurou o zip (chave = sha do Z-Anatomy), não
  // baixa de novo — evita puxar ~85 MB a cada execução do workflow.
  if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1024 * 1024) {
    console.log(`Z-Anatomy.zip já em cache (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB) — pulando download.`);
  } else {
    await downloadToFile(zipUrl, zipPath, { label: `Z-Anatomy.zip @ ${ref}` });
  }

  console.log('Extraindo Z-Anatomy/Startup.blend ...');
  execFileSync('unzip', ['-o', zipPath, 'Z-Anatomy/Startup.blend', '-d', outDir], { stdio: 'inherit' });
  const blendPath = path.join(outDir, 'Z-Anatomy', 'Startup.blend');
  if (!fs.existsSync(blendPath)) {
    throw new Error(`Startup.blend não apareceu em ${blendPath} depois do unzip — a estrutura do zip pode ter mudado.`);
  }
  console.log(`Startup.blend extraído: ${(fs.statSync(blendPath).size / 1024 / 1024).toFixed(1)} MB`);

  const licenseUrl = `https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/${ref}/License.txt`;
  await downloadToFile(licenseUrl, path.join(outDir, 'License.txt'), { label: 'License.txt (Z-Anatomy, CC BY-SA 4.0)' });

  console.log(`\nOK. Startup.blend em ${blendPath}`);
}

// ---------------------------------------------------------------------------
// hra
// ---------------------------------------------------------------------------
function findAllGlbUrls(value, acc = new Set()) {
  if (typeof value === 'string') {
    if (/\.glb(\?|$)/i.test(value)) acc.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) findAllGlbUrls(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) findAllGlbUrls(v, acc);
  }
  return acc;
}

async function fetchReferenceOrgans() {
  let lastErr;
  for (const endpoint of HRA_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.data || json.organs || [];
      console.log(`API de reference-organs OK via ${endpoint} (${list.length} entradas).`);
      return list;
    } catch (err) {
      lastErr = err;
      console.warn(`  ${endpoint} falhou: ${err.message}`);
    }
  }
  throw new Error(`Nenhum endpoint de reference-organs respondeu (${lastErr?.message}).`);
}

/** Acha, na lista da API, a entrada cujo rótulo contém `labelMatch` (case-insensitive) e sexo == sex (quando informado). */
function matchOrgan(list, { labelMatch, sex }) {
  const needle = labelMatch.toLowerCase();
  return list.find((o) => {
    const label = (o.label || o.organ || o.name || '').toLowerCase();
    if (!label.includes(needle)) return false;
    if (sex && o.sex && String(o.sex).toLowerCase() !== sex.toLowerCase()) return false;
    return true;
  });
}

async function cmdHra(args) {
  const listPath = args.list;
  const outDir = args.out;
  if (!listPath || !outDir) throw new Error('Uso: node fetch.mjs hra --list <hra-organs.json> --out <dir>');

  const wanted = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const organs = await fetchReferenceOrgans();

  const resolved = [];
  const missing = [];

  for (const want of wanted) {
    const entry = matchOrgan(organs, want);
    if (!entry) {
      missing.push(want);
      console.warn(`AVISO: órgão não encontrado na API — key="${want.key}" labelMatch="${want.labelMatch}" sex="${want.sex || ''}"`);
      continue;
    }
    const glbUrls = [...findAllGlbUrls(entry)];
    if (glbUrls.length === 0) {
      missing.push({ ...want, reason: 'sem URL .glb na entrada retornada pela API' });
      console.warn(`AVISO: órgão "${want.key}" encontrado mas sem .glb — chaves: ${Object.keys(entry).join(', ')}`);
      continue;
    }
    const glbUrl = glbUrls[0];
    const destPath = path.join(outDir, `${want.key}.glb`);
    const bytes = await downloadToFile(glbUrl, destPath, { label: `HRA ${want.key} (${glbUrl})` });
    resolved.push({
      key: want.key,
      label: entry.label || entry.organ || entry.name || null,
      sex: entry.sex || want.sex || null,
      sourceUrl: glbUrl,
      bytes,
      organId: entry.id || entry.organ_id || entry['@id'] || null,
    });
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'hra-resolved.json'), JSON.stringify({ resolved, missing }, null, 2));

  console.log(`\nResolvidos: ${resolved.length}/${wanted.length}. Ausentes: ${missing.length}.`);
  if (missing.length > 0) {
    console.log('Ausentes (ajustar hra-organs.json depois de olhar a API real):');
    for (const m of missing) console.log(`  - ${m.key}: ${JSON.stringify(m)}`);
  }
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (sub === 'zanatomy') return cmdZAnatomy(args);
  if (sub === 'hra') return cmdHra(args);
  console.error('Uso: node fetch.mjs <zanatomy|hra> [opções]');
  process.exit(1);
}

main().catch((err) => {
  console.error('Falha no fetch.mjs:', err);
  process.exit(1);
});
