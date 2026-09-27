#!/usr/bin/env node
/**
 * scripts/atlas/migrate-compounds.mjs
 *
 * Migra dados de protocolos (compostos farmacológicos) de
 * frontend/modulos/anatomia-3d/data/bio-database.js para JSON determinístico
 * com metadados de revisão.
 *
 * Uso: node scripts/atlas/migrate-compounds.mjs [--out <dir>]
 *
 * Escreve:
 *   - frontend/modulos/anatomia-3d/data/atlas/compounds.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');
const DEFAULT_OUTPUT_DIR = ATLAS_DATA_DIR;

// Opções CLI
const args = process.argv.slice(2);
let outputDir = DEFAULT_OUTPUT_DIR;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outputDir = path.resolve(args[i + 1]);
    i++;
  }
}

// Assegura que outputDir existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
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

// ===== Carrega o legacy-id-map =====
const legacyIdMapPath = path.join(ATLAS_DATA_DIR, 'legacy-id-map.json');
let legacyIdMap = {};
if (fs.existsSync(legacyIdMapPath)) {
  const rawMap = fs.readFileSync(legacyIdMapPath, 'utf8');
  legacyIdMap = JSON.parse(rawMap);
}

/**
 * Converte targetMesh/targetOrgan para sid usando o legacy-id-map.
 * Fallback: converte nomes comuns para za:slug.
 */
function targetOrganToSid(targetOrgan) {
  if (!targetOrgan) return null;

  const target = String(targetOrgan).toLowerCase().trim();

  // Tenta buscar diretamente no mapa
  if (legacyIdMap[target]) {
    return legacyIdMap[target];
  }

  // Tenta com prefixo mesh_
  const meshKey = `mesh_${target}`;
  if (legacyIdMap[meshKey]) {
    return legacyIdMap[meshKey];
  }

  // Fallback: alguns nomes conhecidos
  const knownMappings = {
    'brain': legacyIdMap['cerebro_telencefalo'] || 'za:cerebro-telencefalo',
    'heart': legacyIdMap['coracao'] || 'za:coracao',
    'liver': legacyIdMap['figado'] || 'za:figado',
    'kidney': legacyIdMap['rins'] || 'za:rins',
    'lung': legacyIdMap['pulmoes_alveolos'] || 'za:pulmoes-alveolos',
    'bone': legacyIdMap['ossos_axial'] || 'za:esqueleto-axial',
    'muscl': legacyIdMap['musculos_esqueleticos'] || 'za:musculos-esqueleticos-voluntarios',
    'intestin': legacyIdMap['intestino_delgado'] || 'za:intestino-delgado-duodeno-jejuno-ileo'
  };

  return knownMappings[target] || null;
}

/**
 * Converte compound do bio-database para o novo formato compounds.json
 */
function migrateCompound(compound) {
  if (!compound || !compound.id || !compound.pkData) {
    return null;
  }

  const sid = targetOrganToSid(compound.targetOrgan || compound.targetMesh);

  return {
    id: compound.id,
    nome: compound.nome || '',
    mecanismo: compound.mecanismoAcao || '',
    tags: Array.isArray(compound.tags) ? compound.tags : [],
    pk: {
      route: compound.pkData.route || 'ORAL',
      vd: compound.pkData.vd || 40,
      halfLife: compound.pkData.halfLife || 4,
      dose: compound.pkData.dose || 100,
      ka: compound.pkData.ka || 1.5
    },
    targetSid: sid,
    review: {
      status: 'legacy-unverified'
    }
  };
}

/**
 * Migra todos os protocolos com ordenação determinística
 */
function migrateAllProtocols() {
  const protocols = ATLAS_DATABASE.protocols || [];

  const compounds = protocols
    .map(migrateCompound)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id)); // Ordenação determinística

  return compounds;
}

// ===== Executa migração =====
try {
  const compounds = migrateAllProtocols();

  const outputPath = path.join(outputDir, 'compounds.json');
  fs.writeFileSync(outputPath, JSON.stringify(compounds, null, 2) + '\n', 'utf8');

  console.log(`✓ Migração concluída: ${compounds.length} compostos`);
  console.log(`✓ Arquivo escrito em: ${outputPath}`);

  // Estatísticas
  const withSid = compounds.filter(c => c.targetSid).length;
  console.log(`✓ ${withSid}/${compounds.length} compostos com targetSid mapeado`);

  process.exitCode = 0;
} catch (err) {
  console.error('Erro durante migração:', err.message);
  process.exitCode = 1;
}
