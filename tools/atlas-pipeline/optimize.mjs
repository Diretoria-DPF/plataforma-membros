#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
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
 *   - `--no-lod1` pula a geração do LOD1 (mantido para uso pontual/teste; o
 *     workflow não passa mais essa flag para o HRA — ver §8e do SOURCES.md).
 *
 * Peso morto que NÃO é geometria (retomada 27/09, run #9, achado do
 * orquestrador — ver SOURCES.md §8e): mesmo com o LOD0 simplificado para
 * 3-6% dos triângulos originais, o tamanho do arquivo quase não caía. A
 * causa real: `export_extras=True` no exportador do Blender leva TODAS as
 * custom properties de cada objeto do `Startup.blend` (o Z-Anatomy embute
 * metadados de referência em inglês por objeto, não só o que
 * `export_systems.py` grava), e vários GLBs do HRA carregam atributos de
 * vértice (`COLOR_0`, `TANGENT`, UVs extras) que o motor 3D nunca usa. Por
 * isso `loadAndClean` agora chama `stripExtras` (mantém só
 * `NODE_EXTRAS_ALLOWLIST` nos nós; zera extras em todo o resto do
 * documento) e `stripUnusedAttributes` (só `POSITION`/`NORMAL`, e
 * `TEXCOORD_0` apenas quando o material tem textura de verdade) ANTES de
 * simplificar/quantizar — e loga o tamanho antes/depois para conferir o
 * ganho por arquivo.
 *
 * Isolamento por processo (retomada 27/09, ver SOURCES.md §8d): a execução
 * #7/#8 mostrou que `simplify()` do meshoptimizer pode ficar MUITO mais lento
 * do que um benchmark sintético sugere para certos GLBs reais do Z-Anatomy
 * (hipótese: geometria não-manifold/muitas primitivas — não reproduzido
 * localmente). Como é uma chamada WASM síncrona, ela BLOQUEIA o event loop —
 * um `setTimeout`/`Promise.race` dentro do mesmo processo nunca dispara
 * enquanto ela roda, então não dá para interromper de dentro. Por isso, cada
 * arquivo é processado num PROCESSO FILHO separado (`execFileSync` chamando
 * este mesmo script com `--single-file <arquivo>`), com um timeout de
 * verdade (`--file-timeout-ms`, padrão 90000): se o filho passar do tempo, o
 * SO manda SIGTERM nele e o pai continua para o próximo arquivo, registrando
 * um aviso bem visível — o sistema/órgão fica ausente do manifesto nesta
 * execução ("indisponível", plano §3.5) em vez de travar o job inteiro.
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
  flatten,
  joinPrimitives,
} from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// Arquivo único a processar (uso interno — ver "Isolamento por processo" mais
// abaixo). Sem essa flag, o script roda no modo normal (todos os .glb/.gltf
// de --in).
const SINGLE_FILE = typeof args['single-file'] === 'string' ? args['single-file'] : null;
const FILE_TIMEOUT_MS = args['file-timeout-ms'] ? Number(args['file-timeout-ms']) : 90000;

if (!IN_DIR || !OUT_DIR) {
  console.error(
    'Uso: node optimize.mjs --in <dir> --out <dir> [--lod1-ratio 0.25] [--budgets <arquivo>] [--budget-category <chave>] [--no-lod1] [--file-timeout-ms 90000] [--dry-run]'
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

// Chaves de extras (custom properties do Blender/glTF) que build-manifest.mjs
// de fato lê (deriveSid + structures.json) — ver grep feito antes de escrever
// esta lista, para não quebrar nada silenciosamente:
//   fmaId, side, englishName (deriveSid) e latinName, collection (structures).
const NODE_EXTRAS_ALLOWLIST = ['system', 'layer', 'englishName', 'side', 'fmaId', 'latinName', 'collection'];

/**
 * Remove QUALQUER extra (custom property) que não esteja em
 * `NODE_EXTRAS_ALLOWLIST`, em todo nó (recursivo) — e zera extras em todo o
 * resto do documento (cenas, malhas, primitivas, materiais, texturas,
 * buffers, accessors, animações, skins), onde nunca usamos extras.
 *
 * Achado da retomada 27/09 (orquestrador, run #9 — todos os sistemas +
 * HRA, commit:false): mesmo com o LOD0 simplificado para 3-6% dos
 * triângulos originais, o tamanho do arquivo praticamente não caía (ex.:
 * articular.glb: 7,90 MB a ratio 1 → só 2,52 MB a ratio 0,031, uma
 * simplificação de ~97% dos triângulos que só reduziu 68% dos bytes).
 * Isso só é possível se boa parte do arquivo NÃO for geometria. O
 * `Startup.blend` do Z-Anatomy é exportado com `export_extras=True`
 * (necessário para levar nosso `system`/`layer`/`englishName`/`side`), mas
 * essa opção do exportador do Blender leva TODAS as custom properties de
 * cada objeto — e o Z-Anatomy embute, por objeto (são ~4500 objetos!),
 * metadados de referência (texto em inglês, links, códigos de
 * nomenclatura) que nosso pipeline de conteúdo (WP11) já busca de outra
 * forma (Wikidata/Wikipedia/TA2) — não precisamos que o GLB os carregue
 * também. `optimize.mjs` só geometriza; texto vem de `data/atlas/content/`.
 */
function stripExtras(document) {
  const root = document.getRoot();

  function stripNode(node) {
    const extras = node.getExtras() || {};
    const kept = {};
    for (const key of NODE_EXTRAS_ALLOWLIST) {
      if (extras[key] !== undefined) kept[key] = extras[key];
    }
    node.setExtras(kept);
    for (const child of node.listChildren()) stripNode(child);
  }

  for (const scene of root.listScenes()) {
    scene.setExtras?.({});
    for (const node of scene.listChildren()) stripNode(node);
  }
  for (const mesh of root.listMeshes()) {
    mesh.setExtras?.({});
    for (const prim of mesh.listPrimitives()) prim.setExtras?.({});
  }
  for (const material of root.listMaterials()) material.setExtras?.({});
  for (const texture of root.listTextures()) texture.setExtras?.({});
  for (const buffer of root.listBuffers()) buffer.setExtras?.({});
  for (const accessor of root.listAccessors()) accessor.setExtras?.({});
  for (const animation of root.listAnimations()) animation.setExtras?.({});
  for (const skin of root.listSkins()) skin.setExtras?.({});
  root.setExtras?.({});
}

// Atributos de vértice que o motor 3D do atlas usa de verdade. TEXCOORD_0
// só é mantido quando o material da primitiva de fato referencia uma
// textura (senão é puro peso morto); os demais (COLOR_0, TANGENT,
// TEXCOORD_1+, JOINTS_*, WEIGHTS_* — nenhuma malhas anatômicas estáticas
// tem esqueleto/skinning) são descartados. `prune()` (chamado logo depois)
// remove os accessors/buffers que ficarem sem nenhuma referência.
const ATTRIBUTES_ALWAYS_KEEP = new Set(['POSITION', 'NORMAL']);

function materialHasTexture(material) {
  if (!material) return false;
  return Boolean(
    material.getBaseColorTexture() ||
      material.getNormalTexture() ||
      material.getEmissiveTexture() ||
      material.getMetallicRoughnessTexture() ||
      material.getOcclusionTexture()
  );
}

function stripUnusedAttributes(document) {
  let removed = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const keepTexcoord0 = materialHasTexture(prim.getMaterial());
      for (const semantic of prim.listSemantics()) {
        if (ATTRIBUTES_ALWAYS_KEEP.has(semantic)) continue;
        if (semantic === 'TEXCOORD_0' && keepTexcoord0) continue;
        prim.setAttribute(semantic, null);
        removed++;
      }
    }
  }
  return removed;
}

/** Soma, em bytes, o texto de todos os extras de nó (JSON.stringify) — usado
 * só para o diagnóstico de tamanho (medir antes/depois de `stripExtras`). */
function measureNodeExtrasBytes(document) {
  let bytes = 0;
  function walk(node) {
    bytes += JSON.stringify(node.getExtras() || {}).length;
    for (const child of node.listChildren()) walk(child);
  }
  for (const scene of document.getRoot().listScenes()) {
    for (const node of scene.listChildren()) walk(node);
  }
  return bytes;
}

/** Soma, em bytes brutos (sem compressão), os buffers de atributo de vértice
 * de todas as primitivas — usado só para o diagnóstico de tamanho. */
function measureAttributeBytes(document) {
  let bytes = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        const acc = prim.getAttribute(semantic);
        if (acc) bytes += acc.getCount() * acc.getElementSize() * acc.getComponentSize();
      }
    }
  }
  return bytes;
}

const TRIANGLES_MODE = 4; // glTF Primitive.mode — ver Primitive.Mode.TRIANGLES no core do gltf-transform.

function primitivesHaveNormal(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getAttribute('NORMAL')) return true;
    }
  }
  return false;
}

function dropNormals(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
  }
}

/** Soma a contagem de vértices (POSITION) de todas as primitivas — métrica
 * simples para o log "antes/depois do weld por posição" (não deduplica
 * vértices partilhados entre primitivas; serve só para comparar o mesmo
 * documento em dois momentos, não como contagem absoluta exata). */
function countVertices(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) total += pos.getCount();
    }
  }
  return total;
}

/**
 * Recalcula NORMAL suave (média das normais de face adjacentes de cada
 * vértice, ponderada pela área — o produto vetorial não normalizado já
 * carrega essa ponderação) para toda primitiva TRIANGLES sem NORMAL, SEM
 * duplicar vértice por face.
 *
 * Guardrail de fidelidade (retomada 27/09, revisão do orquestrador): a
 * função `normals()` de `@gltf-transform/functions` também recalcula
 * normais, mas sempre "desengloba" a malha primeiro (normal plana por
 * face, um vértice por face) — isso jogaria fora exatamente a economia de
 * vértices que o reweld por posição (ver `loadAndClean`) conseguiu, e
 * deixaria a malha com aparência "facetada" em vez de suave, inaceitável
 * para um atlas de anatomia. Esta versão mantém a indexação (mesma
 * contagem de vértices de POSITION) e produz sombreamento suave.
 */
function computeSmoothNormals(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES_MODE) continue;
      const position = prim.getAttribute('POSITION');
      if (!position || prim.getAttribute('NORMAL')) continue;
      const indices = prim.getIndices();
      const vertexCount = position.getCount();
      const idxCount = indices ? indices.getCount() : vertexCount;
      const getIndex = (k) => (indices ? indices.getScalar(k) : k);

      const acc = new Float64Array(vertexCount * 3);
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const c = [0, 0, 0];
      for (let t = 0; t + 2 < idxCount; t += 3) {
        const i0 = getIndex(t);
        const i1 = getIndex(t + 1);
        const i2 = getIndex(t + 2);
        position.getElement(i0, a);
        position.getElement(i1, b);
        position.getElement(i2, c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        for (const i of [i0, i1, i2]) {
          acc[i * 3] += nx;
          acc[i * 3 + 1] += ny;
          acc[i * 3 + 2] += nz;
        }
      }

      const out = new Float32Array(vertexCount * 3);
      for (let v = 0; v < vertexCount; v++) {
        const nx = acc[v * 3], ny = acc[v * 3 + 1], nz = acc[v * 3 + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        out[v * 3] = nx / len;
        out[v * 3 + 1] = ny / len;
        out[v * 3 + 2] = nz / len;
      }
      const normalAccessor = document.createAccessor().setType('VEC3').setArray(out);
      prim.setAttribute('NORMAL', normalAccessor);
    }
  }
}

/** Junta, DENTRO de cada malha (nunca entre nós — cada nó continua sendo
 * exatamente uma estrutura, o que `build-manifest.mjs` precisa para o
 * mapa nó→sid), as primitivas que compartilham material e modo de
 * desenho. Reduz o número de primitivas (cada uma carrega seu próprio
 * conjunto de accessors/bufferViews no glTF — overhead fixo que não
 * aparece na contagem de triângulos) sem mudar nó nenhum, nem remover
 * nenhuma estrutura selecionável (pedido do orquestrador — ver SOURCES.md
 * §8i). Primitivas com atributos incompatíveis entre si (achado raro,
 * mas possível) são deixadas como estavam — `joinPrimitives` lança nesse
 * caso, e o catch aqui evita que isso derrube o arquivo inteiro. */
function joinPrimitivesWithinMeshes(document) {
  let merged = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    const groups = new Map(); // material (objeto, já deduplicado por dedup()) -> Map(mode -> Primitive[])
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const mode = prim.getMode();
      let byMode = groups.get(material);
      if (!byMode) {
        byMode = new Map();
        groups.set(material, byMode);
      }
      const arr = byMode.get(mode) || [];
      arr.push(prim);
      byMode.set(mode, arr);
    }
    for (const byMode of groups.values()) {
      for (const prims of byMode.values()) {
        if (prims.length < 2) continue;
        try {
          const joined = joinPrimitives(prims);
          mesh.addPrimitive(joined);
          for (const p of prims) mesh.removePrimitive(p);
          merged += prims.length - 1;
        } catch {
          // Atributos incompatíveis entre essas primitivas — mantém como estavam.
        }
      }
    }
  }
  return merged;
}

/** Conta nós com malha e primitivas — usado só para o diagnóstico de
 * tamanho pedido pelo orquestrador (SOURCES.md §8i): quantas primitivas
 * cada arquivo tem, para saber se o peso morto restante é overhead
 * fixo por primitiva/nó em vez de geometria. */
function countNodesAndPrimitives(document) {
  let nodes = 0;
  let prims = 0;
  for (const node of document.getRoot().listNodes()) {
    if (node.getMesh()) nodes++;
  }
  for (const mesh of document.getRoot().listMeshes()) {
    prims += mesh.listPrimitives().length;
  }
  return { nodes, prims };
}

/** Lê os tamanhos dos chunks JSON e BIN de um .glb já escrito (formato
 * binário do glTF: cabeçalho de 12 bytes, depois chunks
 * [length(4)][type(4)][data]) — usado só para o diagnóstico de tamanho
 * pedido pelo orquestrador (SOURCES.md §8i): separa "peso do grafo de
 * cena/materiais/nós" (JSON) de "peso da geometria comprimida" (BIN). */
function glbChunkSizes(filePath) {
  const buf = fs.readFileSync(filePath);
  const sizes = { JSON: 0, BIN: 0 };
  let offset = 12; // pula o cabeçalho (magic + version + length totais)
  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.toString('ascii', offset + 4, offset + 8).replace(/\0/g, '');
    if (chunkType in sizes) sizes[chunkType] = chunkLength;
    offset += 8 + chunkLength;
  }
  return sizes;
}

async function loadAndClean(filePath) {
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(filePath);

  const removed = pruneNonMeshNodes(document);
  annotateSide(document);

  // Diagnóstico de tamanho (retomada 27/09, ver stripExtras acima): mede
  // ANTES de tirar extras/atributos não usados, para confirmar (ou não) a
  // hipótese do orquestrador de que o peso morto não é geometria.
  const extrasBefore = measureNodeExtrasBytes(document);
  const attrBytesBefore = measureAttributeBytes(document);

  stripExtras(document);
  const attrsRemoved = stripUnusedAttributes(document);

  const extrasAfter = measureNodeExtrasBytes(document);

  await document.transform(dedup());

  // Achata a hierarquia de nós (retomada 27/09, pedido do orquestrador —
  // ver SOURCES.md §8i): reparenta todo nó direto para a cena, gravando o
  // transform acumulado na matriz local (a posição/orientação FINAL de
  // cada estrutura não muda — só some a árvore de nós "vazios" que o
  // Blender usa para agrupar/organizar, sem malha própria, que já não
  // sobreviveriam a `pruneNonMeshNodes` de qualquer forma, mas cujo peso
  // no chunk JSON — nome, matriz, lista de filhos — some daqui). Nunca
  // toca no NOME nem nos extras de nenhum nó, então o mapa nó→sid de
  // `build-manifest.mjs` continua igual.
  await document.transform(flatten());

  // Reweld topológico por POSIÇÃO (retomada 27/09, guardrail de fidelidade
  // do orquestrador — ver SOURCES.md §8g): a execução #13 provou que várias
  // malhas (skin-female e vários sistemas do Z-Anatomy) NUNCA reduziam o
  // número de triângulos em writeLodAdaptive, mesmo com `error` no máximo —
  // sinal de que `simplify()` via cada aresta como "borda travada". A causa
  // provável: NORMAL "dura" (uma cópia do vértice por face/ângulo) faz
  // weld() — que por padrão considera TODOS os atributos ao decidir se dois
  // vértices são "iguais" — nunca fundir vértices com posição idêntica mas
  // normal diferente. Por isso: tira NORMAL ANTES de soldar (solda só por
  // posição — e os atributos que sobraram, já que TEXCOORD_0 raramente
  // existe depois de `stripUnusedAttributes`), solda, e SÓ DEPOIS recalcula
  // NORMAL (suave, sem duplicar vértice — `computeSmoothNormals`, chamada
  // em `writeLod` depois de simplificar) a partir da topologia já reduzida.
  const needsNormals = primitivesHaveNormal(document);
  if (needsNormals) dropNormals(document);

  const vertsBeforeWeld = countVertices(document);
  await document.transform(weld({ tolerance: 0.0001 }));
  const vertsAfterWeld = countVertices(document);

  await document.transform(prune({ keepAttributes: false, keepLeaves: false }));

  const { nodes: nodesBeforeJoin, prims: primsBeforeJoin } = countNodesAndPrimitives(document);
  const primsMerged = joinPrimitivesWithinMeshes(document);
  const { prims: primsAfterJoin } = countNodesAndPrimitives(document);

  const attrBytesAfter = measureAttributeBytes(document);
  console.log(
    `  [tamanho] extras de nó: ${(extrasBefore / 1024).toFixed(1)} KB → ${(extrasAfter / 1024).toFixed(1)} KB` +
      ` | atributos de vértice (bruto): ${(attrBytesBefore / 1024 / 1024).toFixed(2)} MB → ${(attrBytesAfter / 1024 / 1024).toFixed(2)} MB` +
      ` (${attrsRemoved} atributo(s) descartado(s) por primitiva)`
  );
  console.log(
    `  [topologia] vértices: ${vertsBeforeWeld.toLocaleString('pt-BR')} → ${vertsAfterWeld.toLocaleString('pt-BR')}` +
      ` depois do weld por posição (NORMAL ${needsNormals ? 'removida p/ soldar; recalculada suave no LOD final' : 'ausente'})`
  );
  console.log(
    `  [estrutura] nós com malha: ${nodesBeforeJoin.toLocaleString('pt-BR')}` +
      ` | primitivas: ${primsBeforeJoin.toLocaleString('pt-BR')} → ${primsAfterJoin.toLocaleString('pt-BR')}` +
      ` (${primsMerged} unidas por material/nó — nós não mudam)`
  );

  return { document, removedNonMesh: removed, needsNormals, nodeCount: nodesBeforeJoin };
}

async function writeLod(document, outPath, { simplifyRatio, simplifyError = 0.01, regenerateNormals = false } = {}) {
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
        error: simplifyError,
      })
    );
  }

  // NORMAL foi removida em loadAndClean (reweld topológico por posição —
  // ver comentário lá) SEMPRE que a malha original tinha NORMAL, simplificada
  // ou não. Recalcula agora, suave, a partir da topologia final deste LOD
  // (já reduzida por simplify(), se foi o caso) — ANTES de quantizar, nunca
  // depois (quantize também quantiza NORMAL).
  if (regenerateNormals) {
    computeSmoothNormals(working);
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
  // JSON vs BIN (pedido do orquestrador — SOURCES.md §8i): separa o peso do
  // grafo de cena/materiais/nós (chunk JSON) do peso da geometria comprimida
  // (chunk BIN), para saber qual dos dois domina em cada arquivo.
  const chunks = DRY_RUN ? { JSON: 0, BIN: 0 } : glbChunkSizes(outPath);
  return { bytes, triangles, jsonBytes: chunks.JSON, binBytes: chunks.BIN };
}

/**
 * Escreve um LOD com ratio de simplificação ADAPTATIVO: começa em `maxRatio`
 * (1 = sem simplificar, o comportamento antigo) e, se o resultado passar de
 * `targetBytes`, reduz o ratio proporcionalmente (margem de 15%, corte
 * mínimo de 20% por tentativa, para convergir rápido) e escreve de novo —
 * sempre a partir do MESMO documento limpo (nunca simplifica em cima de um
 * resultado já simplificado, para não perder qualidade à toa). Sem
 * orçamento (`targetBytes` null/undefined), volta ao comportamento antigo:
 * um único LOD no `maxRatio` pedido.
 *
 * `maxMillis` limita o tempo TOTAL deste LOD (retomada 27/09: a execução
 * #7 mostrou que os GLBs reais do Z-Anatomy — provavelmente por terem
 * centenas de primitivas/materiais e geometria não-manifold, ao contrário
 * do benchmark sintético de malha única que rodou em ~2s para 2,8M
 * triângulos — podem deixar `simplify()` bem mais lento do que o esperado.
 * Em vez de arriscar um job travado por tempo indefinido, cada tentativa
 * confere o relógio: se o orçamento de tempo estourar, para com o MELHOR
 * resultado obtido até ali (mesmo que ainda acima do orçamento de bytes —
 * `validate.mjs` vai reportar, o que é MELHOR do que o CI nunca terminar).
 *
 * `error` também escala a cada tentativa (retomada 27/09, run #10/12 —
 * ver SOURCES.md §8f): a execução #9 já tinha mostrado que reduzir o
 * `ratio` pedido nem sempre reduz o tamanho do arquivo. A causa, confirmada
 * depois de tirar extras/atributos (execução #12): `simplify()` do
 * meshoptimizer respeita `target_error` (aqui, `error`) ANTES do `ratio` —
 * se o erro relativo já bate no limite antes de chegar no número de
 * triângulos pedido, ele PARA de simplificar e devolve mais triângulos do
 * que o ratio pedia (`skin-female.glb`: ratio caiu de 1,000 para 0,120 e o
 * arquivo/triângulos não mudaram NADA — 266.696 triângulos em toda
 * tentativa, prova de que `error` fixo em 0,01 travava a simplificação
 * bem antes do ratio). Por isso, a cada tentativa que não convergiu,
 * `error` também sobe (×5, até `maxError`).
 *
 * GUARDRAIL DE FIDELIDADE (revisão do orquestrador, run #13): `error` do
 * meshoptimizer é relativo à extensão da malha — soltar até 1,0 (como a
 * execução #13 fez) pode DEFORMAR a forma visivelmente, inaceitável num
 * atlas de anatomia usado para estudo. `maxError` agora tem teto de 0,05
 * para LOD0 e 0,15 para LOD1 (chamado explicitamente por `processOneFile`)
 * — nunca mais alto. Se mesmo assim `error` no máximo não reduzir mais os
 * triângulos, a causa provável NÃO é falta de tolerância a erro, e sim
 * topologia não soldada (ver `loadAndClean`/reweld por posição); se ainda
 * assim ficar acima do orçamento, é hora de propor (nunca aplicar) um
 * ajuste em `budgets.json`, não de continuar afrouxando `error`.
 *
 * `attempts` subiu de 3 para 6 (retomada 27/09, run #14 — depois do reweld
 * topológico): o log da execução #14 mostrou vários sistemas ainda
 * reduzindo triângulos de verdade a cada tentativa (só pelo `ratio`, com
 * `error` já no teto) quando as 4 tentativas (0 a 3) acabaram — não tinham
 * "travado", só ficado sem tentativas. Mais tentativas deixam o `ratio`
 * continuar caindo até `minRatio` (nunca soltam `error` além do teto do
 * guardrail acima), então não têm o mesmo risco de fidelidade que `error`
 * mais alto teria.
 */
async function writeLodAdaptive(document, outPath, { targetBytes, maxRatio = 1, minRatio = 0.02, attempts = 6, maxMillis = 30000, baseError = 0.01, maxError = 0.05, regenerateNormals = false } = {}) {
  const t0 = Date.now();
  let ratio = maxRatio;
  let error = baseError;
  let result = await writeLod(document, outPath, { simplifyRatio: ratio, simplifyError: error, regenerateNormals });
  console.log(`    tentativa 0 (ratio ${ratio.toFixed(3)}, error ${error.toFixed(3)}): ${(result.bytes / 1024 / 1024).toFixed(2)} MB, ${result.triangles.toLocaleString('pt-BR')} tri em ${Date.now() - t0}ms`);

  if (targetBytes == null || result.bytes <= targetBytes) {
    return { ...result, ratio, error, overBudget: targetBytes != null && result.bytes > targetBytes };
  }

  for (let i = 0; i < attempts && ratio > minRatio; i++) {
    if (Date.now() - t0 > maxMillis) {
      console.warn(`    tempo limite (${maxMillis}ms) atingido — parando com o melhor resultado obtido até aqui.`);
      break;
    }
    const prevTriangles = result.triangles;
    const scale = Math.min((targetBytes / result.bytes) * 0.85, 0.8);
    ratio = Math.max(minRatio, ratio * scale);
    error = Math.min(maxError, error * 5);
    const tAttempt = Date.now();
    result = await writeLod(document, outPath, { simplifyRatio: ratio, simplifyError: error, regenerateNormals });
    console.log(
      `    tentativa ${i + 1} (ratio ${ratio.toFixed(3)}, error ${error.toFixed(3)}): ${(result.bytes / 1024 / 1024).toFixed(2)} MB, ${result.triangles.toLocaleString('pt-BR')} tri em ${Date.now() - tAttempt}ms`
    );
    if (result.bytes <= targetBytes) break;
    if (result.triangles === prevTriangles && error >= maxError) {
      console.warn(
        `    triângulos não mudaram (${result.triangles.toLocaleString('pt-BR')}) mesmo no error máximo (${maxError}) — provavelmente não é mais falta de tolerância a erro (ver topologia em [topologia] acima); parando tentativas.`
      );
      break;
    }
  }

  const overBudget = result.bytes > targetBytes;
  if (overBudget) {
    console.warn(
      `  AVISO: ${path.basename(outPath)} ainda acima do orçamento (${(result.bytes / 1024 / 1024).toFixed(2)} MB > ${(targetBytes / 1024 / 1024).toFixed(2)} MB) mesmo no ratio mínimo (${ratio.toFixed(3)})/error máximo (${error.toFixed(3)}) após ${Date.now() - t0}ms — validate.mjs vai reportar.`
    );
  }
  return { ...result, ratio, error, overBudget };
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

/** Processa UM arquivo (chamado tanto no modo filho quanto, no modo antigo
 * de teste local sem isolamento, diretamente) e devolve a entrada de
 * relatório para esse arquivo. */
async function processOneFile(file) {
  const inPath = path.join(IN_DIR, file);
  const baseName = file.replace(/\.(glb|gltf)$/i, '');
  const tFile = Date.now();
  console.log(`\n=== ${file} ===`);

  const { document, removedNonMesh, needsNormals, nodeCount } = await loadAndClean(inPath);
  console.log(`  nós não-malha removidos: ${removedNonMesh}`);

  const budget = budgetForFile(baseName);

  // Teto de `error` por LOD (guardrail de fidelidade do orquestrador — ver
  // writeLodAdaptive): LOD0 é a versão "completa" mostrada de perto, por
  // isso o teto é mais conservador (0,05) que o LOD1 (0,15), que já é uma
  // versão simplificada para uso à distância/no celular.
  const lod0Path = path.join(OUT_DIR, `${baseName}.glb`);
  const lod0 = await writeLodAdaptive(document, lod0Path, {
    targetBytes: budget?.lod0 ?? null,
    maxRatio: 1,
    maxError: 0.05,
    regenerateNormals: needsNormals,
  });
  console.log(
    `  LOD0: ${(lod0.bytes / 1024 / 1024).toFixed(2)} MB (JSON ${(lod0.jsonBytes / 1024).toFixed(0)} KB / BIN ${(lod0.binBytes / 1024 / 1024).toFixed(2)} MB), ` +
      `${lod0.triangles.toLocaleString('pt-BR')} triângulos, ${nodeCount.toLocaleString('pt-BR')} nós (ratio ${lod0.ratio.toFixed(3)}, error ${lod0.error.toFixed(3)})`
  );

  let lod1 = null;
  let lod1Path = null;
  if (!NO_LOD1) {
    lod1Path = path.join(OUT_DIR, `${baseName}.lod1.glb`);
    lod1 = await writeLodAdaptive(document, lod1Path, {
      targetBytes: budget?.lod1 ?? null,
      maxRatio: LOD1_RATIO,
      maxError: 0.15,
      regenerateNormals: needsNormals,
    });
    console.log(
      `  LOD1: ${(lod1.bytes / 1024 / 1024).toFixed(2)} MB (JSON ${(lod1.jsonBytes / 1024).toFixed(0)} KB / BIN ${(lod1.binBytes / 1024 / 1024).toFixed(2)} MB), ` +
        `${lod1.triangles.toLocaleString('pt-BR')} triângulos, ${nodeCount.toLocaleString('pt-BR')} nós (ratio ${lod1.ratio.toFixed(3)}, error ${lod1.error.toFixed(3)})`
    );

    // Pular LOD1 inútil (decisão do orquestrador, retomada 27/09 — ver
    // SOURCES.md §8j): vários sistemas do Z-Anatomy são centenas de
    // estruturas pequenas já no piso do simplificador (ratio mínimo +
    // error no teto do guardrail de fidelidade) — o LOD1 sai quase do
    // mesmo tamanho do LOD0 sem ganhar quase nada em troca. Nesses casos
    // não vale publicar um segundo arquivo quase idêntico só para estourar
    // o orçamento total: não escrevemos `.lod1.glb` no manifesto (o
    // carregador do motor 3D já cai para o outro LOD quando um deles não
    // existe — ver frontend/modulos/anatomia-3d/js/engine/assets.js,
    // `findAsset(system, lod === 'lod0' ? 'lod1' : 'lod0', sex)`).
    if (lod1.bytes >= 0.8 * lod0.bytes) {
      console.log(
        `  [lod1] ${baseName}: LOD1 ${(lod1.bytes / 1024 / 1024).toFixed(2)} MB ≥ 80% de LOD0 ${(lod0.bytes / 1024 / 1024).toFixed(2)} MB — não publicado, cliente usa LOD0`
      );
      if (!DRY_RUN) fs.rmSync(lod1Path, { force: true });
      lod1 = null;
      lod1Path = null;
    }
  }
  console.log(`  (${file} levou ${((Date.now() - tFile) / 1000).toFixed(1)}s no total)`);

  return {
    name: baseName,
    nodeCount,
    lod0: { path: path.relative(OUT_DIR, lod0Path), ...lod0 },
    lod1: lod1 ? { path: path.relative(OUT_DIR, lod1Path), ...lod1 } : undefined,
  };
}

/** Monta os argumentos para o processo filho de um arquivo (repassa exatamente as flags relevantes desta execução). */
function childArgsFor(filePath) {
  const out = [
    __filename,
    '--in', IN_DIR,
    '--out', OUT_DIR,
    '--single-file', filePath,
    '--lod1-ratio', String(LOD1_RATIO),
    '--budgets', BUDGETS_PATH,
  ];
  if (BUDGET_CATEGORY) out.push('--budget-category', BUDGET_CATEGORY);
  if (NO_LOD1) out.push('--no-lod1');
  if (DRY_RUN) out.push('--dry-run');
  return out;
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  // Modo filho: processa só o arquivo pedido e grava o resultado num JSON
  // (o pai lê e apaga) — stdout/stderr continuam indo direto pro terminal
  // (stdio: 'inherit' no pai), então os logs de progresso aparecem em tempo
  // real no CI como sempre.
  if (SINGLE_FILE) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const entry = await processOneFile(path.basename(SINGLE_FILE));
    fs.writeFileSync(path.join(OUT_DIR, `.result-${entry.name}.json`), JSON.stringify(entry));
    return;
  }

  const files = fs
    .readdirSync(IN_DIR)
    .filter((f) => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));

  if (files.length === 0) {
    console.warn(`Nenhum .glb/.gltf encontrado em ${IN_DIR} — nada para otimizar.`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = [];
  const dropped = [];

  for (const file of files) {
    const baseName = file.replace(/\.(glb|gltf)$/i, '');
    const resultPath = path.join(OUT_DIR, `.result-${baseName}.json`);
    fs.rmSync(resultPath, { force: true }); // resto de uma execução anterior, se houver

    try {
      execFileSync(process.execPath, childArgsFor(path.join(IN_DIR, file)), {
        stdio: 'inherit',
        timeout: FILE_TIMEOUT_MS,
        cwd: process.cwd(),
      });
    } catch (err) {
      if (err.signal || err.killed) {
        console.warn(
          `\nAVISO: ${file} passou de ${(FILE_TIMEOUT_MS / 1000).toFixed(0)}s e foi ABANDONADO (processo filho morto com ${err.signal || 'timeout'}) — ` +
            `esse sistema/órgão fica ausente do manifesto NESTA execução (\"indisponível\", plano §3.5). Rever com mais tempo/CPU depois.`
        );
        dropped.push(file);
        continue;
      }
      throw err; // erro real (não timeout) — propaga, não mascara.
    }

    if (!fs.existsSync(resultPath)) {
      console.warn(`AVISO: ${file} terminou mas não gravou resultado esperado (${resultPath}) — pulando.`);
      dropped.push(file);
      continue;
    }
    report.push(JSON.parse(fs.readFileSync(resultPath, 'utf8')));
    fs.rmSync(resultPath, { force: true });
  }

  if (!DRY_RUN) {
    fs.writeFileSync(
      path.join(OUT_DIR, 'optimize-report.json'),
      JSON.stringify({ report, dropped }, null, 2)
    );
  }

  console.log('\nResumo (bytes, JSON/BIN, error final usado — auditoria de fidelidade e diagnóstico de peso morto):');
  for (const r of report) {
    const lod1Str = r.lod1
      ? `${(r.lod1.bytes / 1024 / 1024).toFixed(2)} MB (JSON ${(r.lod1.jsonBytes / 1024).toFixed(0)} KB, error ${r.lod1.error.toFixed(3)})`
      : '(sem LOD1)';
    console.log(
      `  ${r.name} (${r.nodeCount.toLocaleString('pt-BR')} nós): ` +
        `LOD0 ${(r.lod0.bytes / 1024 / 1024).toFixed(2)} MB (JSON ${(r.lod0.jsonBytes / 1024).toFixed(0)} KB, error ${r.lod0.error.toFixed(3)}) / LOD1 ${lod1Str}`
    );
  }
  if (dropped.length > 0) {
    console.warn(`\nAVISO: ${dropped.length} arquivo(s) abandonado(s) por tempo/erro: ${dropped.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('Falha no optimize.mjs:', err);
  process.exit(1);
});
