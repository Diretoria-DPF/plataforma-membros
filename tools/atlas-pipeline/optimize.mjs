#!/usr/bin/env node
/**
 * optimize.mjs
 *
 * Recebe os GLBs "crus" exportados do Blender (Z-Anatomy) ou baixados do HRA
 * e produz, para cada um:
 *   - <nome>.glb       — LOD0 (completo, soldado e sem duplicatas)
 *   - <nome>.lod1.glb  — LOD1 (simplificado a ~25% dos triângulos)
 * ambos com quantização de atributos e compressão EXT_meshopt_compression
 * (decodifica mais rápido que Draco no celular — ver plano §3 e §4).
 *
 * Também remove objetos que não interessam ao motor 3D (texto, rótulos,
 * "empties" sem malha) e registra o nó→sid mais adiante em build-manifest.mjs
 * (este script só otimiza a geometria; não decide nomes).
 *
 * Uso:
 *   node optimize.mjs --in <dir com .glb crus> --out <dir de saída> \
 *     [--lod1-ratio 0.25] [--budgets <budgets.json>] [--budget-category <chave>] \
 *     [--no-lod1] [--dry-run]
 *
 * Convenção de entrada: um .glb por sistema (Z-Anatomy) ou por órgão+sexo
 * (HRA), já no referencial certo (Y para cima, metros).
 *
 * Orçamento (retomada 27/09, ver SOURCES.md): a 1ª execução real (todos os
 * sistemas) mostrou que o `Startup.blend` do Z-Anatomy é muito mais denso do
 * que o esperado — vários sistemas (digestório, endócrino, linfático,
 * nervoso, respiratório, urinário) saem com 2,4–2,9 milhões de triângulos
 * antes de qualquer simplificação, e mesmo o LOD1 (ratio fixo 0,25) ficava
 * várias vezes acima do orçamento de `budgets.json` (WP02). Por isso:
 *   - LOD0 e LOD1 agora usam um ratio de simplificação ADAPTATIVO por
 *     sistema/órgão, calculado a partir do orçamento em bytes (LOD0/LOD1)
 *     de `budgets.json` — nunca fixo em "sem simplificar" (ratio 1) nem em
 *     0.25 "na mão";
 *   - quando o arquivo já cabe no orçamento com ratio 1 (ex.: esqueletico),
 *     o comportamento não muda — nenhuma simplificação extra é aplicada;
 *   - `--budget-category` força a categoria de `budgets.json.bySystem` para
 *     TODOS os arquivos desta chamada (usado para os órgãos do HRA, cujo
 *     nome de arquivo é a chave do órgão, não um id de sistema — todos usam
 *     a categoria "hra"); sem essa flag, a categoria é o próprio nome-base
 *     do arquivo (que já é o id do sistema, ex.: "digestorio.glb"), com
 *     fallback para "default";
 *   - `--no-lod1` pula a geração do LOD1 — usado para os órgãos do HRA, que
 *     entram no manifesto só como `lod: "lod0"` (build-manifest.mjs nunca
 *     cria um asset lod1 de órgão); gerar o LOD1 ali seria bytes desperdiçados
 *     no repositório, sem uso no manifesto.
 */

import { Document, NodeIO } from '@gltf-transform/core';
import {
  cloneDocument,
  dedup,
  weld,
  prune,
  simplify,
  quantize,
  meshopt,
} from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv.slice(2));
const IN_DIR = args.in;
const OUT_DIR = args.out;
const LOD1_RATIO = args['lod1-ratio'] ? Number(args['lod1-ratio']) : 0.25;
const DRY_RUN = Boolean(args['dry-run']);
const NO_LOD1 = Boolean(args['no-lod1']);
const BUDGET_CATEGORY = typeof args['budget-category'] === 'string' ? args['budget-category'] : null;
const BUDGETS_PATH =
  args.budgets ||
  path.join(__dirname, '../../frontend/modulos/anatomia-3d/data/atlas/schema/budgets.json');

if (!IN_DIR || !OUT_DIR) {
  console.error(
    'Uso: node optimize.mjs --in <dir> --out <dir> [--lod1-ratio 0.25] [--budgets <arquivo>] [--budget-category <chave>] [--no-lod1] [--dry-run]'
  );
  process.exit(1);
}

/** Lê budgets.json (WP02) — nunca editado aqui, só lido. Se não existir,
 * volta ao comportamento antigo (LOD0 sem simplificar, LOD1 em LOD1_RATIO
 * fixo) em vez de falhar — mantém o script utilizável fora do CI. */
function loadBudgets(budgetsPath) {
  if (!fs.existsSync(budgetsPath)) {
    console.warn(`[optimize] ${budgetsPath} não encontrado — sem orçamento, LOD0 fica sem simplificar e LOD1 usa ratio fixo ${LOD1_RATIO}.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
}

const BUDGETS = loadBudgets(BUDGETS_PATH);

/** Orçamento {lod0,lod1} (em bytes) a aplicar a um arquivo, pela categoria
 * forçada (--budget-category, usado pelos órgãos do HRA) ou pelo próprio
 * nome-base do arquivo (que já é o id do sistema para os GLBs do
 * Z-Anatomy), com fallback para "default". */
function budgetForFile(baseName) {
  if (!BUDGETS) return null;
  const key = BUDGET_CATEGORY || baseName;
  return BUDGETS.bySystem?.[key] || BUDGETS.bySystem?.default || null;
}

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

/** Remove nós sem malha e sem filhos com malha — texto, "empties", rótulos do Blender. */
function pruneNonMeshNodes(document) {
  const root = document.getRoot();
  let removed = 0;

  function nodeHasMeshDescendant(node) {
    if (node.getMesh()) return true;
    return node.listChildren().some(nodeHasMeshDescendant);
  }

  for (const scene of root.listScenes()) {
    for (const node of [...scene.listChildren()]) {
      if (!nodeHasMeshDescendant(node)) {
        // Heurística extra: nomes típicos de rótulo/texto/empty do Z-Anatomy.
        node.dispose();
        removed++;
      }
    }
  }
  return removed;
}

/** Normaliza sufixos .L/.R (Blender) para o padrão _l/_r usado no sid. Mantido nos extras, não no nome do nó em si (build-manifest.mjs lê o nome original). */
function annotateSide(document) {
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName() || '';
    const extras = node.getExtras() || {};
    if (/\.[Ll]$/.test(name) || /_[Ll]$/.test(name)) {
      node.setExtras({ ...extras, side: 'l' });
    } else if (/\.[Rr]$/.test(name) || /_[Rr]$/.test(name)) {
      node.setExtras({ ...extras, side: 'r' });
    }
  }
}

async function loadAndClean(filePath) {
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(filePath);

  const removed = pruneNonMeshNodes(document);
  annotateSide(document);

  await document.transform(
    dedup(),
    weld({ tolerance: 0.0001 }),
    prune({ keepAttributes: false, keepLeaves: false })
  );

  return { document, removedNonMesh: removed };
}

async function writeLod(document, outPath, { simplifyRatio } = {}) {
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  // Clona o documento para não afetar o LOD anterior — cada chamada parte
  // do mesmo estado "limpo" (dedup+weld+prune já aplicados em loadAndClean).
  const working = cloneDocument(document);

  if (simplifyRatio != null && simplifyRatio < 1) {
    await working.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: simplifyRatio,
        error: 0.01,
      })
    );
  }

  await working.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 })
  );

  const meshoptExt = working.createExtension(EXTMeshoptCompression);
  meshoptExt.setRequired(true);
  await working.transform(
    meshopt({ encoder: MeshoptEncoder, level: 'high' })
  );

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await io.write(outPath, working);
  }

  const bytes = DRY_RUN ? 0 : fs.statSync(outPath).size;
  const triangles = countTriangles(working);
  return { bytes, triangles };
}

/**
 * Escreve um LOD com ratio de simplificação ADAPTATIVO: começa em `maxRatio`
 * (1 = sem simplificar, o comportamento antigo) e, se o resultado passar de
 * `targetBytes`, reduz o ratio proporcionalmente (com uma margem de 15% e um
 * mínimo forçado de 10% de redução por tentativa, para nunca "empacar" perto
 * do limite) e escreve de novo — sempre a partir do MESMO documento limpo
 * (nunca simplifica em cima de um resultado já simplificado, para não perder
 * qualidade à toa). Sem orçamento (`targetBytes` null/undefined), volta ao
 * comportamento antigo: um único LOD no `maxRatio` pedido.
 */
async function writeLodAdaptive(document, outPath, { targetBytes, maxRatio = 1, minRatio = 0.02, attempts = 5 } = {}) {
  let ratio = maxRatio;
  let result = await writeLod(document, outPath, { simplifyRatio: ratio });

  if (targetBytes == null || result.bytes <= targetBytes) {
    return { ...result, ratio, overBudget: targetBytes != null && result.bytes > targetBytes };
  }

  for (let i = 0; i < attempts && ratio > minRatio; i++) {
    const scale = Math.min((targetBytes / result.bytes) * 0.85, 0.9);
    ratio = Math.max(minRatio, ratio * scale);
    result = await writeLod(document, outPath, { simplifyRatio: ratio });
    if (result.bytes <= targetBytes) break;
  }

  const overBudget = result.bytes > targetBytes;
  if (overBudget) {
    console.warn(
      `  AVISO: ${path.basename(outPath)} ainda acima do orçamento (${(result.bytes / 1024 / 1024).toFixed(2)} MB > ${(targetBytes / 1024 / 1024).toFixed(2)} MB) mesmo no ratio mínimo (${ratio.toFixed(3)}) após ${attempts} tentativas — validate.mjs vai reportar.`
    );
  }
  return { ...result, ratio, overBudget };
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : prim.getAttribute('POSITION').getCount();
      total += Math.floor(count / 3);
    }
  }
  return total;
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const files = fs
    .readdirSync(IN_DIR)
    .filter((f) => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));

  if (files.length === 0) {
    console.warn(`Nenhum .glb/.gltf encontrado em ${IN_DIR} — nada para otimizar.`);
    return;
  }

  const report = [];

  for (const file of files) {
    const inPath = path.join(IN_DIR, file);
    const baseName = file.replace(/\.(glb|gltf)$/i, '');
    console.log(`\n=== ${file} ===`);

    const { document, removedNonMesh } = await loadAndClean(inPath);
    console.log(`  nós não-malha removidos: ${removedNonMesh}`);

    const budget = budgetForFile(baseName);

    const lod0Path = path.join(OUT_DIR, `${baseName}.glb`);
    const lod0 = await writeLodAdaptive(document, lod0Path, {
      targetBytes: budget?.lod0 ?? null,
      maxRatio: 1,
    });
    console.log(
      `  LOD0: ${(lod0.bytes / 1024 / 1024).toFixed(2)} MB, ${lod0.triangles.toLocaleString('pt-BR')} triângulos (ratio ${lod0.ratio.toFixed(3)})`
    );

    let lod1 = null;
    let lod1Path = null;
    if (!NO_LOD1) {
      lod1Path = path.join(OUT_DIR, `${baseName}.lod1.glb`);
      lod1 = await writeLodAdaptive(document, lod1Path, {
        targetBytes: budget?.lod1 ?? null,
        maxRatio: LOD1_RATIO,
      });
      console.log(
        `  LOD1: ${(lod1.bytes / 1024 / 1024).toFixed(2)} MB, ${lod1.triangles.toLocaleString('pt-BR')} triângulos (ratio ${lod1.ratio.toFixed(3)})`
      );
    }

    report.push({
      name: baseName,
      lod0: { path: path.relative(OUT_DIR, lod0Path), ...lod0 },
      lod1: lod1 ? { path: path.relative(OUT_DIR, lod1Path), ...lod1 } : undefined,
    });
  }

  if (!DRY_RUN) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUT_DIR, 'optimize-report.json'),
      JSON.stringify(report, null, 2)
    );
  }

  console.log('\nResumo:');
  for (const r of report) {
    const lod1Str = r.lod1 ? `${(r.lod1.bytes / 1024 / 1024).toFixed(2)} MB` : '(sem LOD1)';
    console.log(`  ${r.name}: LOD0 ${(r.lod0.bytes / 1024 / 1024).toFixed(2)} MB / LOD1 ${lod1Str}`);
  }
}

main().catch((err) => {
  console.error('Falha no optimize.mjs:', err);
  process.exit(1);
});
