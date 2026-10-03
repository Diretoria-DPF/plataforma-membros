#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * discover.mjs
 *
 * Roda só no GitHub Actions (a sandbox de desenvolvimento só alcança o
 * registro do npm — ver instruções do WP10). Confirma, com dados reais, as
 * fontes que o plano (§3) escolheu e imprime tudo em texto simples para
 * ficar no log do job "discover" — este script não baixa nada pesado, só
 * confere metadados (tamanhos, versões, licenças, hashes) antes do fetch.mjs
 * baixar de verdade.
 *
 * O que confere:
 *   1. Z-Anatomy — o zip cheio (todos os sistemas) commitado direto no repo
 *      Z-Anatomy/Models-of-human-anatomy (branch master), e o License.txt;
 *   2. Z-Anatomy — repositórios irmãos (Blender-addons, veterinária) só para
 *      registro;
 *   3. HRA — a lista de órgãos de referência pela API oficial, com as
 *      variações de endpoint conhecidas, e a licença;
 *   4. BodyParts3D (mirror no GitHub) — como fallback de órgão, registrando
 *      que a licença original é CC BY-SA 2.1 Japan (diferente da CC BY-SA
 *      4.0 do Z-Anatomy — nunca tratar como a mesma licença);
 *   5. download.blender.org — a lista de versões 4.x LTS disponíveis, para
 *      escolher o tarball do Blender headless.
 *
 * Cada seção é independente: se uma fonte estiver fora do ar, o script avisa
 * e continua nas outras (nunca derruba o job por causa de uma fonte só).
 *
 * Uso: node discover.mjs [--out out/discovery.json]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT_PATH = outIdx >= 0 ? args[outIdx + 1] : 'out/discovery.json';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_API = 'https://api.github.com';
const UA = 'atlas-pipeline-discover (plataforma-membros WP10)';

const report = { generatedAt: new Date().toISOString(), sections: {} };

function section(name) {
  console.log(`\n${'='.repeat(70)}\n=== ${name}\n${'='.repeat(70)}`);
  report.sections[name] = report.sections[name] || {};
  return report.sections[name];
}

async function githubJson(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GITHUB_API}${pathOrUrl}`;
  const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} em ${url}`);
  }
  return res.json();
}

async function headOrRangeSize(url) {
  const headers = { 'User-Agent': UA };
  let res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' });
  if (res.ok && res.headers.get('content-length')) {
    return { status: res.status, bytes: Number(res.headers.get('content-length')), finalUrl: res.url };
  }
  // Alguns hosts não respondem bem a HEAD; tenta um GET com Range mínimo.
  res = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' }, redirect: 'follow' });
  const cr = res.headers.get('content-range'); // ex.: bytes 0-0/86734957
  const total = cr && cr.includes('/') ? Number(cr.split('/')[1]) : null;
  return { status: res.status, bytes: total, finalUrl: res.url };
}

async function tryStep(label, fn) {
  try {
    const value = await fn();
    console.log(`OK: ${label}`);
    return { ok: true, value };
  } catch (err) {
    console.warn(`AVISO: ${label} falhou — ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 1) Z-Anatomy — Models-of-human-anatomy (Z-Anatomy.zip commitado no repo)
// ---------------------------------------------------------------------------
async function discoverZAnatomy() {
  const s = section('1. Z-Anatomy / Models-of-human-anatomy');

  const repoInfo = await tryStep('repositório Z-Anatomy/Models-of-human-anatomy', () =>
    githubJson('/repos/Z-Anatomy/Models-of-human-anatomy')
  );
  if (repoInfo.ok) {
    s.repo = {
      default_branch: repoInfo.value.default_branch,
      size_kb_git: repoInfo.value.size,
      html_url: repoInfo.value.html_url,
    };
    console.log(`  branch padrão: ${repoInfo.value.default_branch}, tamanho do repo (git, KB): ${repoInfo.value.size}`);
  }

  const branch = repoInfo.ok ? repoInfo.value.default_branch : 'master';
  const headCommit = await tryStep(`commit HEAD de ${branch}`, () =>
    githubJson(`/repos/Z-Anatomy/Models-of-human-anatomy/commits/${branch}`)
  );
  if (headCommit.ok) {
    s.headCommitSha = headCommit.value.sha;
    console.log(`  commit HEAD (pin sugerido): ${headCommit.value.sha}`);
  }

  // Z-Anatomy.zip é um blob normal no repo (não é LFS nem release asset) —
  // confirmado por dezenas de projetos que fazem curl+unzip direto no raw.
  const pinnedRef = headCommit.ok ? headCommit.value.sha : branch;
  const rawZipUrl = `https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/${pinnedRef}/Z-Anatomy.zip`;
  const zipHead = await tryStep('tamanho de Z-Anatomy.zip (HEAD/Range)', () => headOrRangeSize(rawZipUrl));
  if (zipHead.ok) {
    s.zipUrl = rawZipUrl;
    s.zipBytes = zipHead.value.bytes;
    console.log(`  Z-Anatomy.zip: ${zipHead.value.bytes ? (zipHead.value.bytes / 1024 / 1024).toFixed(1) + ' MB' : '(tamanho não informado)'} em ${rawZipUrl}`);
  }

  const contentsAtRoot = await tryStep('listagem da raiz do repo (contents API)', () =>
    githubJson(`/repos/Z-Anatomy/Models-of-human-anatomy/contents/?ref=${pinnedRef}`)
  );
  if (contentsAtRoot.ok) {
    const names = contentsAtRoot.value.map((e) => `${e.name} (${e.size} bytes)`);
    s.rootEntries = names;
    console.log('  raiz do repo:');
    for (const n of names) console.log(`    - ${n}`);
  }

  const licenseFile = await tryStep('License.txt', () =>
    githubJson(`/repos/Z-Anatomy/Models-of-human-anatomy/contents/License.txt?ref=${pinnedRef}`)
  );
  if (licenseFile.ok) {
    const text = Buffer.from(licenseFile.value.content, 'base64').toString('utf8');
    s.licenseExcerpt = text.slice(0, 400);
    console.log('  License.txt (trecho):');
    console.log('    ' + text.split('\n').slice(0, 6).join('\n    '));
  }

  // Repositórios irmãos, só para registro (não usados nesta fase).
  for (const repo of ['Blender-addons', 'Models-of-veterinary-anatomy']) {
    const info = await tryStep(`repositório irmão Z-Anatomy/${repo}`, () =>
      githubJson(`/repos/Z-Anatomy/${repo}`)
    );
    if (info.ok) {
      s[`sibling_${repo}`] = { description: info.value.description, default_branch: info.value.default_branch };
      console.log(`  Z-Anatomy/${repo}: ${info.value.description || '(sem descrição)'}`);
    }
  }

  return s;
}

// ---------------------------------------------------------------------------
// 2) HRA — lista de órgãos de referência
// ---------------------------------------------------------------------------
const HRA_ENDPOINTS = [
  'https://apps.humanatlas.io/api/v1/reference-organs',
  'https://apps.humanatlas.io/hra-api/v1/reference-organs',
  'https://ccf-api.hubmapconsortium.org/v1/reference-organs',
];

/** Varre um valor qualquer em busca de strings terminadas em .glb (achatamento genérico, tolerante a mudanças de esquema da API). */
function findGlbUrls(value, acc = new Set()) {
  if (typeof value === 'string') {
    if (/\.glb(\?|$)/i.test(value)) acc.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) findGlbUrls(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) findGlbUrls(v, acc);
  }
  return acc;
}

async function discoverHRA() {
  const s = section('2. HRA — órgãos de referência (humanatlas.io)');

  let organs = null;
  let usedEndpoint = null;
  for (const endpoint of HRA_ENDPOINTS) {
    const attempt = await tryStep(`GET ${endpoint}`, async () => {
      const res = await fetch(endpoint, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    if (attempt.ok) {
      organs = attempt.value;
      usedEndpoint = endpoint;
      break;
    }
  }

  if (!organs) {
    s.error = 'Nenhum endpoint de reference-organs respondeu. Ver avisos acima.';
    console.warn('  Nenhum endpoint de reference-organs respondeu.');
    return s;
  }

  s.endpointUsado = usedEndpoint;
  const list = Array.isArray(organs) ? organs : organs.data || organs.organs || [];
  console.log(`  endpoint usado: ${usedEndpoint}`);
  console.log(`  ${list.length} entradas recebidas.`);

  if (list.length > 0) {
    console.log('  chaves do primeiro item:', Object.keys(list[0]).join(', '));
  }

  const glbUrls = findGlbUrls(list);
  s.totalEntradas = list.length;
  s.totalGlbEncontrados = glbUrls.size;
  s.organs = list.slice(0, 500).map((o) => ({
    label: o.label || o.organ || o.name || null,
    sex: o.sex || null,
    id: o.id || o.organ_id || o['@id'] || null,
    glb: [...findGlbUrls(o)][0] || null,
  }));

  console.log(`  ${glbUrls.size} URLs .glb distintas encontradas no total.`);
  for (const o of s.organs.slice(0, 40)) {
    console.log(`    - ${o.label || '(sem nome)'} / sexo=${o.sex || '?'} -> ${o.glb || '(sem glb direto)'}`);
  }
  if (s.organs.length > 40) console.log(`    ... e mais ${s.organs.length - 40} entradas (ver out/discovery.json).`);

  return s;
}

// ---------------------------------------------------------------------------
// 3) BodyParts3D — fallback de órgão (licença DIFERENTE: CC BY-SA 2.1 Japan)
// ---------------------------------------------------------------------------
async function discoverBodyParts3D() {
  const s = section('3. BodyParts3D (fallback de órgão) — github.com/Kevin-Mattheus-Moerman/BodyParts3D');
  console.warn(
    '  ATENÇÃO: a licença original do BodyParts3D é "CC BY-SA 2.1 Japan" (Database Center for Life Science),' +
      ' diferente da CC BY-SA 4.0 do Z-Anatomy. Se este fallback for usado, registrar a licença própria' +
      ' em models/LICENSES/ — nunca tratar como a mesma licença do Z-Anatomy.'
  );
  const info = await tryStep('repositório Kevin-Mattheus-Moerman/BodyParts3D', () =>
    githubJson('/repos/Kevin-Mattheus-Moerman/BodyParts3D')
  );
  if (info.ok) {
    s.repo = { default_branch: info.value.default_branch, size_kb_git: info.value.size, html_url: info.value.html_url };
    console.log(`  branch padrão: ${info.value.default_branch}, tamanho (git, KB): ${info.value.size}`);
  }
  s.licencaOriginal = 'CC-BY-SA-2.1-Japan (Database Center for Life Science) — NÃO é CC-BY-SA-4.0';
  return s;
}

// ---------------------------------------------------------------------------
// 4) Blender headless — versões 4.x LTS disponíveis em download.blender.org
// ---------------------------------------------------------------------------
async function discoverBlender() {
  const s = section('4. Blender headless (download.blender.org)');
  const attempt = await tryStep('listagem de download.blender.org/release/', async () => {
    const res = await fetch('https://download.blender.org/release/', { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
  if (!attempt.ok) return s;

  const dirs = [...attempt.value.matchAll(/href="(Blender4\.[0-9]+)\//g)].map((m) => m[1]);
  const uniqueDirs = [...new Set(dirs)].sort();
  s.versoes4x = uniqueDirs;
  console.log('  diretórios Blender4.x encontrados:', uniqueDirs.join(', '));

  if (uniqueDirs.length > 0) {
    const latest = uniqueDirs[uniqueDirs.length - 1];
    const listing = await tryStep(`listagem de ${latest}/`, async () => {
      const res = await fetch(`https://download.blender.org/release/${latest}/`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
    if (listing.ok) {
      const linuxTarballs = [...listing.value.matchAll(/href="([^"]+linux-x64\.tar\.xz)"/g)].map((m) => m[1]);
      s.latest = latest;
      s.linuxTarballsEmLatest = linuxTarballs;
      console.log(`  tarballs linux-x64 em ${latest}/:`, linuxTarballs.join(', ') || '(nenhum — conferir manualmente)');
    }
  }

  return s;
}

async function main() {
  section('WP10 — discover.mjs — ' + new Date().toISOString());

  await discoverZAnatomy();
  await discoverHRA();
  await discoverBodyParts3D();
  await discoverBlender();

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n\nRelatório completo escrito em ${OUT_PATH} (também sobe como artifact do job).`);
}

main().catch((err) => {
  console.error('Falha inesperada no discover.mjs:', err);
  process.exit(1);
});
