#!/usr/bin/env node
/**
 * scripts/atlas/migrate-organs.mjs
 *
 * Migra dados de sistemas (14) e órgãos (~60) de
 * frontend/modulos/anatomia-3d/data/bio-database.js para o novo
 * formato de schema JSON com sids (FMA ou za:slug).
 *
 * Uso: node scripts/atlas/migrate-organs.mjs [--out <dir>]
 *
 * Escreve:
 *   - data/atlas/legacy/index.legacy.json (índice de estruturas)
 *   - data/atlas/legacy/content/<sistema>.json (conteúdo por sistema)
 */

import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');
const SCHEMA_DIR = path.join(ATLAS_DATA_DIR, 'schema');
const LEGACY_DIR = path.join(ATLAS_DATA_DIR, 'legacy');
const LEGACY_CONTENT_DIR = path.join(LEGACY_DIR, 'content');
const DEFAULT_OUTPUT_DIR = LEGACY_DIR;

// Opções CLI
const args = process.argv.slice(2);
let outputDir = DEFAULT_OUTPUT_DIR;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outputDir = path.resolve(args[i + 1]);
    i++;
  }
}

// Assegura que outputDir/content existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(path.join(outputDir, 'content'))) {
  fs.mkdirSync(path.join(outputDir, 'content'), { recursive: true });
}

// ===== Carrega bio-database.js em contexto VM =====
const bioDatabasePath = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'bio-database.js');
const bioDatabaseCode = fs.readFileSync(bioDatabasePath, 'utf8');

const fakeWindow = {};
const vmContext = createContext({ window: fakeWindow });
runInContext(bioDatabaseCode, vmContext);

const ATLAS_DATABASE = fakeWindow.ATLAS_DATABASE;
if (!ATLAS_DATABASE) {
  console.error('Erro: ATLAS_DATABASE não foi carregado do bio-database.js');
  process.exitCode = 1;
  process.exit(1);
}

// ===== Carrega mapa legado de IDs =====
const legacyMapPath = path.join(ATLAS_DATA_DIR, 'legacy-id-map.json');
const LEGACY_TO_SID = JSON.parse(fs.readFileSync(legacyMapPath, 'utf8'));

/**
 * Converte string em slug kebab-case
 */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Remove diacríticos
    .replace(/[_\s]+/g, '-') // Espaços e underscores em hífens
    .replace(/[^\w-]/g, '') // Remove caracteres especiais (exceto hífens)
    .replace(/-+/g, '-') // Múltiplos hífens em um
    .replace(/^-+|-+$/g, ''); // Remove hífens nas extremidades
}

/**
 * Obtém sid para um órgão, com fallback para za:slug
 * Prioriza nome PT se estiver no mapa (pode ter FMA), senão id/meshKey (fallback za:)
 */
function getSid(orgao) {
  // Prioriza nome em PT (pode ter mapeamento FMA especial)
  if (orgao.nome && LEGACY_TO_SID[orgao.nome]) {
    return LEGACY_TO_SID[orgao.nome];
  }
  // Depois id
  if (orgao.id && LEGACY_TO_SID[orgao.id]) {
    return LEGACY_TO_SID[orgao.id];
  }
  // Depois meshKey
  if (orgao.meshKey && LEGACY_TO_SID[orgao.meshKey]) {
    return LEGACY_TO_SID[orgao.meshKey];
  }
  // Fallback: cria slug baseado no nomeEn (ou nome se nomeEn não existir)
  const baseName = orgao.nomeEn || orgao.nome;
  return `za:${slugify(baseName)}`;
}

/**
 * Mapeia sistema (id) da bio-database para novo sistema
 * Retorna {newSystem: string, warning?: string}
 */
function mapSystem(sistemaId) {
  // Mapeamento direto quando o id já é válido
  const directMap = {
    'respiratorio': 'respiratorio',
    'cardiovascular': 'cardiovascular',
    'nervoso': 'nervoso',
    'digestorio': 'digestorio',
    'urinario': 'urinario',
    'reprodutor': 'reprodutor',
    'endocrino': 'endocrino',
    'esqueletico': 'esqueletico',
    'muscular': 'muscular',
    'articular': 'articular',
    'linfatico': 'linfatico',
    'tegumentar': 'tegumentar',
    // Sistemas legados que não existem mais na v2
    'imunologico': 'linfatico', // Sistema imunológico → Linfático
    'fascial': 'muscular', // Sistema fascial → Muscular (fáscias são tecido conjuntivo)
  };

  if (directMap[sistemaId]) {
    return { newSystem: directMap[sistemaId] };
  }

  // Fallback: usa o ID tal qual (pode não ser válido)
  return { newSystem: sistemaId, warning: `Sistema desconhecido: ${sistemaId}` };
}

/**
 * Mapeia camada (1-5 ou string) para layer ids
 * Regra: organs → visceras, vessels → vasos, nerves → nervos
 */
function mapLayer(camada, nome = '') {
  // Se for numérico 1-5, usa mapa simples
  if (typeof camada === 'number') {
    const numLayerMap = {
      1: 'pele',
      2: 'musculos',
      3: 'esqueleto',
      4: 'visceras',
      5: 'visceras',
    };
    return numLayerMap[camada] || 'visceras';
  }

  // Se for string, tenta heurística baseada no nome do órgão
  const lowerNome = nome.toLowerCase();
  if (lowerNome.includes('vaso') || lowerNome.includes('arteria') || lowerNome.includes('veia') || lowerNome.includes('capilar')) {
    return 'vasos';
  }
  if (lowerNome.includes('nervo') || lowerNome.includes('gangli') || lowerNome.includes('encefalo') || lowerNome.includes('medula')) {
    return 'nervos';
  }
  if (lowerNome.includes('linfo')) {
    return 'linfatico';
  }
  if (lowerNome.includes('musculo')) {
    return 'musculos';
  }
  if (lowerNome.includes('osso') || lowerNome.includes('esqueleto')) {
    return 'esqueleto';
  }
  if (lowerNome.includes('pele') || lowerNome.includes('cabelo') || lowerNome.includes('unha')) {
    return 'pele';
  }

  // Default para órgãos não identificados
  return 'visceras';
}

/**
 * Cria entrada de índice a partir de um órgão
 */
function createIndexEntry(orgao, sistema) {
  const sid = getSid(orgao);

  const entry = {
    sid,
    system: mapSystem(sistema.id).newSystem,
    layer: mapLayer(orgao.camada || 5, orgao.nome),
    parent: null, // Legacy organs não têm pai modelado
    region: 'desconhecido', // Não está em bio-database, será mapeado manualmente
    names: {
      pt: orgao.nome,
      en: orgao.nomeEn,
    },
  };

  // Add synonyms if present
  if (orgao.sinonimos && orgao.sinonimos.length > 0) {
    entry.synonyms = orgao.sinonimos;
  }

  // Legacy organs não têm mesh 3D (content-only)
  // Schema requer "mesh" ou o campo deve ser omitido.
  // Vamos omitir para agora, pois não temos asset.

  return entry;
}

/**
 * Cria registro de conteúdo a partir de um órgão
 */
function createContentRecord(orgao) {
  // Constrói o objeto ids
  const ids = {};

  if (orgao.wikidataId) {
    ids.wikidata = orgao.wikidataId;
  }
  if (orgao.meshId) {
    ids.mesh = orgao.meshId;
  }
  if (orgao.icd10) {
    ids.icd10 = Array.isArray(orgao.icd10) ? orgao.icd10 : [orgao.icd10];
  }
  if (orgao.fipatId) {
    ids.ta2 = orgao.fipatId;
  }

  // Summary: descricao + funcaoPrincipal
  const summaryParts = [];
  if (orgao.descricao) summaryParts.push(orgao.descricao);
  if (orgao.funcaoPrincipal) summaryParts.push(`Função: ${orgao.funcaoPrincipal}`);
  const summary_pt = summaryParts.length > 0 ? summaryParts.join(' ') : 'Descrição não disponível';

  // Anatomy
  const anatomy = {};
  if (orgao.vascularizacao) {
    const vasc = orgao.vascularizacao;
    const vascParts = [];
    if (vasc.arterial) vascParts.push(`Arterial: ${Array.isArray(vasc.arterial) ? vasc.arterial.join(', ') : vasc.arterial}`);
    if (vasc.venosa) vascParts.push(`Venosa: ${Array.isArray(vasc.venosa) ? vasc.venosa.join(', ') : vasc.venosa}`);
    if (vasc.linfatica) vascParts.push(`Linfática: ${Array.isArray(vasc.linfatica) ? vasc.linfatica.join(', ') : vasc.linfatica}`);
    if (vascParts.length > 0) anatomy.vascularization = vascParts.join('; ');
  }
  if (orgao.inervacao) {
    const iner = orgao.inervacao;
    const inerParts = [];
    if (iner.sensitiva) inerParts.push(`Sensitiva: ${Array.isArray(iner.sensitiva) ? iner.sensitiva.join(', ') : iner.sensitiva}`);
    if (iner.simpatica) inerParts.push(`Simpática: ${iner.simpatica}`);
    if (iner.parassimpatica) inerParts.push(`Parassimpática: ${iner.parassimpatica}`);
    if (iner.motora) inerParts.push(`Motora: ${Array.isArray(iner.motora) ? iner.motora.join(', ') : iner.motora}`);
    if (inerParts.length > 0) anatomy.innervation = inerParts.join('; ');
  }

  // Histology
  const histology = {};
  if (orgao.histologia) {
    const hist = orgao.histologia;
    if (hist.epitelio) histology.epithelium = hist.epitelio;
    if (hist.matrizExtracelular && hist.matrizExtracelular.length > 0) {
      histology.tissues = Array.isArray(hist.matrizExtracelular)
        ? hist.matrizExtracelular
        : [hist.matrizExtracelular];
    }
    if (hist.tiposCelulares && hist.tiposCelulares.length > 0) {
      // Cells require CL id, but we don't have them. Leave cl field out per instructions.
      // histology.cells = hist.tiposCelulares.map(name => ({ name_pt: name }));
      // Actually, the schema REQUIRES cl. Skip cells if we don't have CL ids.
    }
  }

  // Clinical: patologias → array of strings (disease descriptions)
  const clinical = [];
  if (orgao.patologias && orgao.patologias.length > 0) {
    for (const pat of orgao.patologias) {
      // Include nome as description
      if (pat.nome) clinical.push(pat.nome);
      // If icd10 exists, collect for ids.icd10
      if (pat.icd10 && !ids.icd10) {
        ids.icd10 = [pat.icd10];
      } else if (pat.icd10 && ids.icd10) {
        if (!ids.icd10.includes(pat.icd10)) {
          ids.icd10.push(pat.icd10);
        }
      }
    }
  }

  // Sources: one per non-empty field
  const sources = [];
  const sourceRef = 'bio-database.js (o-bala-vip, curadoria LAIFT)';
  const sourceLicense = 'proprietary-laift'; // May not be in enum, will report

  if (orgao.descricao || orgao.funcaoPrincipal) {
    sources.push({
      field: 'summary_pt',
      type: 'other',
      ref: sourceRef,
      license: sourceLicense,
    });
  }
  if (Object.keys(anatomy).length > 0) {
    for (const anatField of Object.keys(anatomy)) {
      sources.push({
        field: `anatomy.${anatField}`,
        type: 'other',
        ref: sourceRef,
        license: sourceLicense,
      });
    }
  }
  if (Object.keys(histology).length > 0) {
    for (const histField of Object.keys(histology)) {
      sources.push({
        field: `histology.${histField}`,
        type: 'other',
        ref: sourceRef,
        license: sourceLicense,
      });
    }
  }
  if (clinical.length > 0) {
    sources.push({
      field: 'clinical',
      type: 'other',
      ref: sourceRef,
      license: sourceLicense,
    });
  }

  // If no sources were created, add a default one
  if (sources.length === 0) {
    sources.push({
      field: 'summary_pt',
      type: 'other',
      ref: sourceRef,
      license: sourceLicense,
    });
  }

  const record = {
    ids,
    summary_pt,
    review: {
      status: 'legacy-unverified',
    },
    sources,
  };

  // Add optional fields only if populated
  if (Object.keys(anatomy).length > 0) record.anatomy = anatomy;
  if (Object.keys(histology).length > 0) record.histology = histology;
  if (clinical.length > 0) record.clinical = clinical;

  return record;
}

/**
 * Hauptlogik: Migra sistemas e órgãos
 */
const indexEntries = [];
const contentBySystem = {};
const systemsMapped = new Set();
const systemsNotFound = new Set();
let orgaosCount = 0;

// Processa os 14 sistemas
if (ATLAS_DATABASE.sistemas && Array.isArray(ATLAS_DATABASE.sistemas)) {
  for (const sistema of ATLAS_DATABASE.sistemas) {
    const mappedSystem = mapSystem(sistema.id);
    if (mappedSystem.warning) {
      systemsNotFound.add(sistema.id);
    } else {
      systemsMapped.add(mappedSystem.newSystem);
    }

    // Inicializa content para este sistema
    if (!contentBySystem[mappedSystem.newSystem]) {
      contentBySystem[mappedSystem.newSystem] = {};
    }

    // Processa órgãos deste sistema
    if (sistema.orgaos && Array.isArray(sistema.orgaos)) {
      for (const orgao of sistema.orgaos) {
        orgaosCount++;

        // Cria entrada de índice
        const indexEntry = createIndexEntry(orgao, sistema);
        indexEntries.push(indexEntry);

        // Cria registro de conteúdo
        const contentRecord = createContentRecord(orgao);
        const sid = getSid(orgao);
        contentBySystem[mappedSystem.newSystem][sid] = contentRecord;
      }
    }
  }
}

// Ordena para determinismo
indexEntries.sort((a, b) => a.sid.localeCompare(b.sid));
for (const system in contentBySystem) {
  const entries = contentBySystem[system];
  const sorted = {};
  Object.keys(entries)
    .sort()
    .forEach(key => {
      sorted[key] = entries[key];
    });
  contentBySystem[system] = sorted;
}

// ===== Carrega esquemas para validação =====
const ajv = new Ajv2020({ strict: false, allErrors: true });

const indexSchemaPath = path.join(SCHEMA_DIR, 'index.schema.json');
const contentSchemaPath = path.join(SCHEMA_DIR, 'content.schema.json');

if (!fs.existsSync(indexSchemaPath) || !fs.existsSync(contentSchemaPath)) {
  console.error('Erro: esquemas não encontrados');
  process.exitCode = 1;
  process.exit(1);
}

const indexSchema = JSON.parse(fs.readFileSync(indexSchemaPath, 'utf8'));
const contentSchema = JSON.parse(fs.readFileSync(contentSchemaPath, 'utf8'));

const validateIndex = ajv.compile(indexSchema);

// ===== Valida índice =====
const indexValid = validateIndex(indexEntries);
if (!indexValid) {
  console.error('Erros de validação em index.legacy.json:');
  for (const err of validateIndex.errors || []) {
    console.error(`  ${err.instancePath || '(raiz)'}: ${err.message}`);
  }
  process.exitCode = 1;
  process.exit(1);
}

// ===== Valida conteúdo =====
const validateContent = ajv.compile(contentSchema);
let contentValid = true;

for (const [system, entries] of Object.entries(contentBySystem)) {
  const isValid = validateContent(entries);
  if (!isValid) {
    console.error(`Erros de validação em content/${system}.json:`);
    for (const err of validateContent.errors || []) {
      console.error(`  ${err.instancePath || '(raiz)'}: ${err.message}`);
    }
    contentValid = false;
  }
}

if (!contentValid) {
  process.exitCode = 1;
  process.exit(1);
}

// ===== Escreve arquivos de saída =====
const indexPath = path.join(outputDir, 'index.legacy.json');
fs.writeFileSync(indexPath, JSON.stringify(indexEntries, null, 2) + '\n');

let contentFilesWritten = 0;
for (const [system, entries] of Object.entries(contentBySystem)) {
  const contentPath = path.join(outputDir, 'content', `${system}.json`);
  fs.writeFileSync(contentPath, JSON.stringify(entries, null, 2) + '\n');
  contentFilesWritten++;
}

// ===== Relatório =====
console.log(`✓ ${orgaosCount} órgãos migrados → ${path.relative(FRONTEND_DIR, indexPath)}`);
console.log(`✓ ${contentFilesWritten} arquivos de conteúdo criados`);
console.log(`✓ Sistemas mapeados: ${Array.from(systemsMapped).sort().join(', ')}`);

if (systemsNotFound.size > 0) {
  console.warn(`⚠ Sistemas não encontrados no mapa: ${Array.from(systemsNotFound).join(', ')}`);
}

// Alerta sobre license proprietary-laift se não estiver no enum
console.log('\nNota: fonte "proprietary-laift" pode não estar no enum de licenças. Verifique schema.');
