#!/usr/bin/env node
/**
 * scripts/atlas/migrate-routes-processes.mjs
 *
 * Migra dados de viasAdministracao (rotas) e processos fisiológicos
 * de frontend/modulos/anatomia-3d/data/bio-database.js para o novo
 * formato de schema JSON com sids (FMA ou za:slug).
 *
 * Uso: node scripts/atlas/migrate-routes-processes.mjs [--out <dir>]
 *
 * Escreve:
 *   - frontend/modulos/anatomia-3d/data/atlas/routes.json
 *   - frontend/modulos/anatomia-3d/data/atlas/processes.json
 *   - frontend/modulos/anatomia-3d/data/atlas/legacy-id-map.json
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

// ===== Mapping de órgãos legados para sids =====
// FMA (conhecidos)
const KNOWN_FMA_IDS = {
  'heart': 'fma:7088',
  'fígado': 'fma:7197',
  'liver': 'fma:7197',
  'pulmão esquerdo': 'fma:7310',
  'left lung': 'fma:7310',
  'pulmão direito': 'fma:7309',
  'right lung': 'fma:7309',
  'brain': 'fma:50801',
  'cérebro': 'fma:50801',
  'encéfalo': 'fma:50801',
  'estômago': 'fma:7148',
  'stomach': 'fma:7148',
  'rim esquerdo': 'fma:7205',
  'left kidney': 'fma:7205',
  'rim direito': 'fma:7204',
  'right kidney': 'fma:7204',
  'coração': 'fma:7088',
};

// Constrói mapping de todos os órgãos do database
const buildLegacyToSidMap = () => {
  const map = {};
  const seen = new Set();

  // Processa órgãos do banco de dados
  if (ATLAS_DATABASE.sistemas && Array.isArray(ATLAS_DATABASE.sistemas)) {
    for (const sistema of ATLAS_DATABASE.sistemas) {
      if (sistema.orgaos && Array.isArray(sistema.orgaos)) {
        for (const orgao of sistema.orgaos) {
          if (orgao.id && !seen.has(orgao.id)) {
            seen.add(orgao.id);
            const slug = slugify(orgao.nome || orgao.id);
            map[orgao.id] = `za:${slug}`;
          }
          // Também mapeia por meshKey se existir
          if (orgao.meshKey && !seen.has(orgao.meshKey)) {
            seen.add(orgao.meshKey);
            const slug = slugify(orgao.nome || orgao.meshKey);
            map[orgao.meshKey] = `za:${slug}`;
          }
        }
      }
    }
  }

  // Processa órgãos de viasAdministracao
  if (ATLAS_DATABASE.viasAdministracao) {
    for (const [routeKey, route] of Object.entries(ATLAS_DATABASE.viasAdministracao)) {
      if (route.orgaosSequenciais && Array.isArray(route.orgaosSequenciais)) {
        for (const orgaoName of route.orgaosSequenciais) {
          if (orgaoName && !seen.has(orgaoName)) {
            seen.add(orgaoName);
            const lowerName = orgaoName.toLowerCase().trim();
            // Tenta encontrar FMA conhecido
            if (KNOWN_FMA_IDS[lowerName]) {
              map[orgaoName] = KNOWN_FMA_IDS[lowerName];
            } else {
              const slug = slugify(orgaoName);
              map[orgaoName] = `za:${slug}`;
            }
          }
        }
      }
      // Também processa waypoint labels
      if (route.waypoints3D && Array.isArray(route.waypoints3D)) {
        for (const wp of route.waypoints3D) {
          if (wp.label && !seen.has(wp.label)) {
            seen.add(wp.label);
            const slug = slugify(wp.label);
            map[wp.label] = `za:${slug}`;
          }
        }
      }
    }
  }

  // Processa processos
  if (ATLAS_DATABASE.processos) {
    for (const [procKey, proc] of Object.entries(ATLAS_DATABASE.processos)) {
      if (proc.etapas && Array.isArray(proc.etapas)) {
        for (const etapa of proc.etapas) {
          if (etapa.acaoParticulas && !seen.has(etapa.acaoParticulas)) {
            seen.add(etapa.acaoParticulas);
            const slug = slugify(etapa.acaoParticulas);
            map[etapa.acaoParticulas] = `za:${slug}`;
          }
        }
      }
    }
  }

  return map;
};

const LEGACY_TO_SID = buildLegacyToSidMap();

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
 * Converte via de administração (rota) para novo formato
 */
function convertRoute(routeKey, routeData) {
  const id = slugify(routeData.id || routeKey);
  const anchors = [];

  // Processa órgãos sequenciais (em ordem)
  if (routeData.orgaosSequenciais && Array.isArray(routeData.orgaosSequenciais)) {
    for (let i = 0; i < routeData.orgaosSequenciais.length; i++) {
      const orgaoName = routeData.orgaosSequenciais[i];
      const sid = LEGACY_TO_SID[orgaoName] || `za:${slugify(orgaoName)}`;
      const anchor = { sid };

      // Se houver waypoints, usa o label do waypoint correspondente
      if (routeData.waypoints3D && routeData.waypoints3D[i]) {
        const wp = routeData.waypoints3D[i];
        if (wp.label) {
          anchor.label_pt = wp.label;
        }
        // Estima t baseado em posição do waypoint na sequência
        if (routeData.waypoints3D.length > 1) {
          anchor.t = i / (routeData.waypoints3D.length - 1);
        }
      }

      anchors.push(anchor);
    }
  }

  // Se não houver órgãos sequenciais mas houver waypoints, usa waypoints
  if (anchors.length === 0 && routeData.waypoints3D && Array.isArray(routeData.waypoints3D)) {
    for (let i = 0; i < routeData.waypoints3D.length; i++) {
      const wp = routeData.waypoints3D[i];
      const label = wp.label || `Ponto ${i + 1}`;
      const sid = LEGACY_TO_SID[label] || `za:${slugify(label)}`;
      const anchor = { sid };

      if (wp.label) {
        anchor.label_pt = wp.label;
      }

      // Calcula t de forma linear
      if (routeData.waypoints3D.length > 1) {
        anchor.t = i / (routeData.waypoints3D.length - 1);
      }

      anchors.push(anchor);
    }
  }

  // Se ainda não houver âncoras, cria uma genérica
  if (anchors.length === 0) {
    anchors.push({
      sid: `za:${id}`,
      label_pt: routeData.nome || id,
    });
  }

  return {
    id,
    system: routeData.categoria || 'desconhecido',
    name_pt: routeData.nome || routeData.id,
    description_pt: routeData.descricaoClinica || routeData.barreirasBiologicas || '',
    anchors,
  };
}

/**
 * Converte processo fisiológico para novo formato
 */
function convertProcess(procKey, procData) {
  const id = slugify(procData.id || procKey);
  const steps = [];

  if (procData.etapas && Array.isArray(procData.etapas)) {
    for (const etapa of procData.etapas) {
      const order = etapa.ordem || (steps.length + 1);
      const description = etapa.descricao || etapa.fase || '';
      const anchors = [];

      // Tenta usar acaoParticulas como referência
      if (etapa.acaoParticulas) {
        const sid = LEGACY_TO_SID[etapa.acaoParticulas] || `za:${slugify(etapa.acaoParticulas)}`;
        anchors.push({ sid });
      }

      // Se não houver âncora, cria uma genérica baseada no id do processo
      if (anchors.length === 0) {
        anchors.push({ sid: `za:${id}` });
      }

      steps.push({
        order,
        description_pt: description,
        anchors,
      });
    }
  }

  // Se não houver passos, cria um vazio
  if (steps.length === 0) {
    steps.push({
      order: 1,
      description_pt: procData.descricao || '',
      anchors: [{ sid: `za:${id}` }],
    });
  }

  return {
    id,
    system: procData.sistema || 'desconhecido',
    name_pt: procData.titulo || procData.id,
    description_pt: procData.descricao || '',
    steps,
  };
}

// ===== Converte dados =====
const routes = [];
const processes = [];

if (ATLAS_DATABASE.viasAdministracao) {
  for (const [key, data] of Object.entries(ATLAS_DATABASE.viasAdministracao)) {
    const route = convertRoute(key, data);
    routes.push(route);
  }
}

if (ATLAS_DATABASE.processos) {
  for (const [key, data] of Object.entries(ATLAS_DATABASE.processos)) {
    const process = convertProcess(key, data);
    processes.push(process);
  }
}

// ===== Ordena por id para determinismo =====
routes.sort((a, b) => a.id.localeCompare(b.id));
processes.sort((a, b) => a.id.localeCompare(b.id));

// ===== Carrega esquemas =====
const ajv = new Ajv2020({ strict: false, allErrors: true });

const routesSchemaPath = path.join(SCHEMA_DIR, 'routes.schema.json');
const processesSchemaPath = path.join(SCHEMA_DIR, 'processes.schema.json');

if (!fs.existsSync(routesSchemaPath) || !fs.existsSync(processesSchemaPath)) {
  console.error('Erro: esquemas não encontrados');
  process.exitCode = 1;
  process.exit(1);
}

const routesSchema = JSON.parse(fs.readFileSync(routesSchemaPath, 'utf8'));
const processesSchema = JSON.parse(fs.readFileSync(processesSchemaPath, 'utf8'));

const validateRoutes = ajv.compile(routesSchema);
const validateProcesses = ajv.compile(processesSchema);

// ===== Valida rotas =====
const routesValid = validateRoutes(routes);
if (!routesValid) {
  console.error('Erros de validação em routes.json:');
  for (const err of validateRoutes.errors || []) {
    console.error(`  ${err.instancePath || '(raiz)'}: ${err.message}`);
  }
  process.exitCode = 1;
  process.exit(1);
}

// ===== Valida processos =====
const processesValid = validateProcesses(processes);
if (!processesValid) {
  console.error('Erros de validação em processes.json:');
  for (const err of validateProcesses.errors || []) {
    console.error(`  ${err.instancePath || '(raiz)'}: ${err.message}`);
  }
  process.exitCode = 1;
  process.exit(1);
}

// ===== Escreve arquivos de saída =====
const routesPath = path.join(outputDir, 'routes.json');
const processesPath = path.join(outputDir, 'processes.json');
const legacyMapPath = path.join(outputDir, 'legacy-id-map.json');

fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2) + '\n');
fs.writeFileSync(processesPath, JSON.stringify(processes, null, 2) + '\n');
fs.writeFileSync(legacyMapPath, JSON.stringify(LEGACY_TO_SID, null, 2) + '\n');

console.log(`✓ ${routes.length} rotas migradas → ${path.relative(FRONTEND_DIR, routesPath)}`);
console.log(`✓ ${processes.length} processos migrados → ${path.relative(FRONTEND_DIR, processesPath)}`);
console.log(`✓ Mapa legado com ${Object.keys(LEGACY_TO_SID).length} entradas → ${path.relative(FRONTEND_DIR, legacyMapPath)}`);
