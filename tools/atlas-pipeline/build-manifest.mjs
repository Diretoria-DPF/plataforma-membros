#!/usr/bin/env node
/**
 * build-manifest.mjs
 *
 * Lê os GLBs já otimizados (optimize.mjs) e produz:
 *   - <modelsDir>/manifest.json — no formato EXATO do esquema do WP02
 *     (`frontend/modulos/anatomia-3d/data/atlas/schema/manifest.schema.json`):
 *     objeto raiz `{ version, generatedAt, assets: [...] }` (nada mais —
 *     o esquema usa `additionalProperties: false` na raiz, então NÃO dá
 *     para guardar `budget`/`totalBytes`/`totalMB` aqui; esses números só
 *     vão para o console e para `out/manifest-report.json`, que não é
 *     validado contra o esquema);
 *   - out/structures.json — uma linha por estrutura (nó), para o pipeline
 *     de conteúdo (WP11): sid, nome em inglês, nome em latim (quando
 *     houver), sistema, camada, coleção-mãe, lado, bbox e fonte
 *     ("zanatomy" ou "hra").
 *
 * Cada item de `assets` é um arquivo GLB (um LOD de um sistema, OU um
 * órgão do HRA, que entra com `lod: "lod0"` e o `system` anatômico ao qual
 * pertence — não existe um "sistema hra" no esquema; o que diferencia um
 * órgão do HRA de uma peça do Z-Anatomy é a `license` de cada asset:
 * CC-BY-SA-4.0 (Z-Anatomy) nunca aparece junto de CC-BY-4.0 (HRA) no mesmo
 * asset, e o `validate.mjs` confere isso).
 *
 * sid (identificador estável de estrutura, `^(fma:[0-9]+|za:[a-z0-9]+(-[a-z0-9]+)*)$`
 * no esquema — SEM prefixo "hra:", mesmo para órgãos do HRA):
 *   - `fma:<id>`  quando a origem já traz um FMA ID (extras.fmaId);
 *   - `za:<slug>` em todos os outros casos (Z-Anatomy OU HRA), com o slug
 *     em minúsculas e hífen como separador (nunca "_"), preservando o
 *     sufixo de lado (`-l`/`-r`) quando existir.
 *
 * Uso:
 *   node build-manifest.mjs --config manifest.config.json --models-dir <dir> \
 *     [--out-structures out/structures.json] [--version <string>]
 *
 * `manifest.config.json` traz os metadados que não vêm do próprio GLB
 * (licença, atribuição, URL/versão de origem, sistema/camada/sexo por
 * arquivo). Ver manifest.config.example.json.
 */

import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as fs from 'node:fs';
import * as path from 'node:path';

function parseArgs(argv) {
  const out = {};
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
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const CONFIG_PATH = args.config;
const MODELS_DIR = args['models-dir'];
const OUT_STRUCTURES = args['out-structures'] || 'out/structures.json';
const OUT_REPORT = args['out-report'] || 'out/manifest-report.json';
const VERSION = args.version || 'dev';

if (!CONFIG_PATH || !MODELS_DIR) {
  console.error(
    'Uso: node build-manifest.mjs --config <manifest.config.json> --models-dir <dir> [--out-structures out/structures.json] [--version <string>]'
  );
  process.exit(1);
}

/** Remove diacríticos e normaliza para um slug seguro em ASCII, hífen como separador (padrão do sid no esquema do WP02: `[a-z0-9]+(-[a-z0-9]+)*`, nunca "_"). */
function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extrai o lado (l/r) de um nome de nó no estilo Blender/Z-Anatomy (Femur.L, Femur_R, femur.l). */
function extractSide(nodeName) {
  const m = nodeName.match(/[._]([LlRr])$/);
  if (!m) return null;
  return m[1].toLowerCase();
}

/** Nome "base" do nó sem o sufixo de lado. */
function stripSide(nodeName) {
  return nodeName.replace(/[._][LlRr]$/, '');
}

/**
 * Deriva o sid estável de um nó a partir dos extras gravados no GLB
 * (fmaId) ou do próprio nome, seguindo a convenção do esquema do WP02:
 * SÓ existem os prefixos "fma:" e "za:" — órgãos do HRA também usam
 * "za:" (não há "hra:" no `pattern` do esquema). A origem real (Z-Anatomy
 * ou HRA) fica registrada em `structures.json` (`source`) e é
 * distinguível no manifesto pela `license` do asset.
 */
function deriveSid(nodeName, extras) {
  const extraObj = extras || {};
  if (extraObj.fmaId) {
    return `fma:${extraObj.fmaId}`;
  }
  const side = extraObj.side || extractSide(nodeName);
  const base = stripSide(nodeName);
  const slug = slugify(extraObj.englishName || base);
  return side ? `za:${slug}-${side}` : `za:${slug}`;
}

/** Normaliza o sexo para o enum do esquema ("M"|"F"|"U") — a API do HRA e o
 * `manifest.config.json` costumam trazer "male"/"female"/"m"/"f". */
function normalizeSex(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === 'masculino') return 'M';
  if (v === 'f' || v === 'female' || v === 'feminino') return 'F';
  return 'U';
}

function bboxToPlain(bounds) {
  return { min: Array.from(bounds.min), max: Array.from(bounds.max) };
}

function mergeBbox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    min: a.min.map((v, i) => Math.min(v, b.min[i])),
    max: a.max.map((v, i) => Math.max(v, b.max[i])),
  };
}

async function makeIO() {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      const count = indices ? indices.getCount() : pos ? pos.getCount() : 0;
      total += Math.floor(count / 3);
    }
  }
  return total;
}

/**
 * Coleta TODOS os nós com malha de uma cena, em qualquer profundidade —
 * não só os filhos diretos da cena. Bug encontrado na 1ª execução real com
 * os órgãos do HRA (retomada 27/09): os GLBs do HRA embrulham a malha num nó
 * "raiz" (ex.: um nó de transformação sem malha própria, com a malha de
 * verdade num filho) — olhar só `scene.listChildren()` perdia 100% dos nós
 * desses assets (8 de 9 órgãos ficavam com `nodeToSid: {}`, violando o
 * requisito de 100% dos nós mapeados do plano §3.6). Os GLBs do Z-Anatomy
 * (objetos direto na raiz da cena) continuam funcionando igual, já que a
 * busca recursiva também encontra nós que já eram filhos diretos.
 */
function collectMeshNodes(scene) {
  const found = [];
  function visit(node) {
    if (node.getMesh()) found.push(node);
    for (const child of node.listChildren()) visit(child);
  }
  for (const node of scene.listChildren()) visit(node);
  return found;
}

/** Lê um GLB e devolve {bytes, triangles, bbox, nodes: [{name, extras, sid, bbox}]}. */
async function inspectGlb(io, filePath) {
  const bytes = fs.statSync(filePath).size;
  const document = await io.read(filePath);
  const triangles = countTriangles(document);

  let fileBbox = null;
  const nodes = [];
  for (const scene of document.getRoot().listScenes()) {
    for (const node of collectMeshNodes(scene)) {
      const extras = node.getExtras() || {};
      const name = node.getName() || '(sem nome)';
      const sid = deriveSid(name, extras);
      const nodeBbox = bboxToPlain(getBounds(node));
      fileBbox = mergeBbox(fileBbox, nodeBbox);
      nodes.push({ name, extras, sid, bbox: nodeBbox });
    }
  }

  return { bytes, triangles, bbox: fileBbox, nodes };
}

/** Caminho do asset no manifesto: relativo ao diretório de modelos publicado (ex.: "models/zanatomy/esqueletico.lod0.glb"), como exige o esquema (`^models/.+\.glb$`). */
function assetFilePath(relPath) {
  const normalized = relPath.split(path.sep).join('/');
  return normalized.startsWith('models/') ? normalized : `models/${normalized}`;
}

/** Monta um item de `assets` a partir de um GLB já otimizado + metadados do config. */
async function buildAsset(io, { filePath, relPath, system, lod, sex, license, attribution, sourceUrl, sourceVersion, transform, rmsError }) {
  const info = await inspectGlb(io, filePath);
  const nodeToSid = {};
  for (const n of info.nodes) nodeToSid[n.name] = n.sid;

  return {
    asset: {
      file: assetFilePath(relPath),
      system,
      lod,
      sex: normalizeSex(sex),
      bytes: info.bytes,
      triangles: info.triangles,
      bbox: info.bbox || { min: [0, 0, 0], max: [0, 0, 0] },
      nodeToSid,
      license,
      attribution,
      sourceUrl: sourceUrl ?? null,
      sourceVersion: sourceVersion ?? '',
      transform: transform ?? null,
      rmsError: rmsError ?? null,
    },
    nodes: info.nodes,
  };
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const io = await makeIO();

  const assets = [];
  const structures = [];
  let totalBytes = 0;
  const perSystemBytes = {};

  // --- Sistemas do Z-Anatomy (um asset por LOD existente) --------------
  for (const [key, entry] of Object.entries(config.systems || {})) {
    const lodSpecs = [
      { lod: 'lod0', rel: entry.lod0 },
      { lod: 'lod1', rel: entry.lod1 },
    ].filter((s) => s.rel);

    for (const { lod, rel } of lodSpecs) {
      const filePath = path.join(MODELS_DIR, rel);
      if (!fs.existsSync(filePath)) {
        console.warn(`[manifest] AVISO: ${filePath} não existe — ${key}/${lod} ficará ausente do manifesto.`);
        continue;
      }
      const { asset, nodes } = await buildAsset(io, {
        filePath,
        relPath: rel,
        system: key,
        lod,
        sex: entry.sex,
        license: entry.license,
        attribution: entry.attribution,
        sourceUrl: entry.sourceUrl,
        sourceVersion: entry.sourceVersion,
        transform: entry.transform,
        rmsError: entry.rmsError,
      });
      assets.push(asset);
      totalBytes += asset.bytes;
      perSystemBytes[key] = perSystemBytes[key] || {};
      perSystemBytes[key][lod] = asset.bytes;

      if (lod === 'lod0') {
        for (const n of nodes) {
          structures.push({
            sid: n.sid,
            englishName: n.extras.englishName || stripSide(n.name),
            latinName: n.extras.latinName || null,
            system: key,
            layer: entry.layer,
            parentCollection: n.extras.collection || key,
            side: n.extras.side || extractSide(n.name) || null,
            bbox: n.bbox,
            source: 'zanatomy',
          });
        }
      }
    }
  }

  // --- Órgãos de referência do HRA (lod0 sempre; lod1 quando existir) ---
  for (const [key, entry] of Object.entries(config.organs || {})) {
    const organLodSpecs = [
      { lod: 'lod0', rel: entry.file },
      { lod: 'lod1', rel: entry.lod1File },
    ].filter((s) => s.rel);

    for (const { lod, rel } of organLodSpecs) {
      const filePath = path.join(MODELS_DIR, rel);
      if (!fs.existsSync(filePath)) {
        console.warn(`[manifest] AVISO: ${filePath} não existe — órgão "${key}"/${lod} ficará ausente do manifesto.`);
        continue;
      }
      const { asset, nodes } = await buildAsset(io, {
        filePath,
        relPath: rel,
        system: entry.system,
        lod,
        sex: entry.sex,
        license: entry.license,
        attribution: entry.attribution,
        sourceUrl: entry.sourceUrl,
        sourceVersion: entry.sourceVersion,
        // Fase 1 (plano §3.4/§3.8): órgãos do HRA nunca alinhados por ICP
        // ainda — transform/rmsError ficam null até a v2.
        transform: null,
        rmsError: null,
      });
      assets.push(asset);
      totalBytes += asset.bytes;
      perSystemBytes.hra = perSystemBytes.hra || {};
      perSystemBytes.hra[key] = perSystemBytes.hra[key] || {};
      perSystemBytes.hra[key][lod] = asset.bytes;

      // structures.json só precisa de uma entrada por estrutura (não por
      // LOD) — mesma regra usada acima para os sistemas do Z-Anatomy.
      if (lod === 'lod0') {
        for (const n of nodes) {
          structures.push({
            sid: n.sid,
            englishName: n.extras.englishName || stripSide(n.name),
            latinName: n.extras.latinName || null,
            system: entry.system,
            layer: entry.layer || 'visceras',
            parentCollection: entry.organId || key,
            side: n.extras.side || extractSide(n.name) || null,
            bbox: n.bbox,
            source: 'hra',
          });
        }
      }
    }
  }

  const manifest = {
    version: VERSION,
    generatedAt: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (esquema exige esse formato)
    assets,
  };

  const manifestPath = path.join(MODELS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const totalMB = Number((totalBytes / 1024 / 1024).toFixed(2));
  console.log(`Manifesto escrito em ${manifestPath} (${assets.length} assets, ${totalMB} MB no total).`);

  fs.mkdirSync(path.dirname(OUT_STRUCTURES), { recursive: true });
  fs.writeFileSync(OUT_STRUCTURES, JSON.stringify(structures, null, 2));
  console.log(`${structures.length} estruturas escritas em ${OUT_STRUCTURES}.`);

  // Relatório auxiliar (NÃO faz parte do esquema — só para log/depuração do
  // CI; validate.mjs recalcula os orçamentos a partir do manifest.json real).
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
  fs.writeFileSync(
    OUT_REPORT,
    JSON.stringify({ generatedAt: manifest.generatedAt, totalBytes, totalMB, perSystemBytes }, null, 2)
  );
}

main().catch((err) => {
  console.error('Falha no build-manifest.mjs:', err);
  process.exit(1);
});
