#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * scripts/atlas/validate-content.mjs [dir] [--legacy-anchors=warn]
 *
 * Valida um diretório de dados do Atlas Anatômico contra os esquemas em
 * frontend/modulos/anatomia-3d/data/atlas/schema/ e faz verificações
 * cruzadas de integridade que um esquema JSON isolado não consegue expressar
 * (ex.: um sid citado em quiz-cases.json precisa existir em index.json).
 *
 * Sem argumento, valida frontend/modulos/anatomia-3d/data/atlas/fixtures/
 * (as fixtures geradas por make-fixtures.mjs). Passe um caminho para validar
 * outro diretório com o mesmo formato (ex.: o data/atlas/ real, quando
 * existir).
 *
 * --legacy-anchors=warn: Quando set, converte erros de integridade de
 * anchor sids que correspondem ao padrão legado ^za:[a-z0-9-]+$ em avisos.
 * Exceção: com generated/anchor-map.json (ou anchor-map.json) no diretório,
 * as âncoras de routes/processes resolvem por ele e a falta de uma é ERRO.
 * Avisos são exibidos com [aviso], contados separadamente e não afetam
 * o código de saída.
 *
 * Sai com código 0 quando não há erros, e código 1 (com mensagens em
 * português) quando há pelo menos um problema (avisos não contam).
 *
 * Uso: node scripts/atlas/validate-content.mjs [dir] [--legacy-anchors=warn]
 */

import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');
const SCHEMA_DIR = path.join(ATLAS_DATA_DIR, 'schema');
const DEFAULT_TARGET_DIR = path.join(ATLAS_DATA_DIR, 'fixtures');

// Parse arguments: first positional arg is dir, flags come after
const args = process.argv.slice(2);
const targetDir = path.resolve(args[0] ?? DEFAULT_TARGET_DIR);
const legacyAnchorsWarn = args.some((arg) => arg === '--legacy-anchors=warn');

// Regex pattern for legacy anchor sids (e.g., za:aorta-sistemica, za:sa-node)
const LEGACY_ANCHOR_PATTERN = /^za:[a-z0-9-]+$/;

/** Campos de texto/lista conhecidos de um registro de conteúdo, em notação de caminho. */
const CONTENT_TEXT_FIELDS = [
  'summary_pt',
  'anatomy.relations',
  'anatomy.vascularization',
  'anatomy.innervation',
  'anatomy.lymph',
  'histology.epithelium',
  'histology.tissues',
  'histology.cells',
  'clinical',
];

function getPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isNonEmpty(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function readJson(absPath, relLabel) {
  if (!fs.existsSync(absPath)) {
    return { data: undefined, missing: true };
  }
  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    return { data: JSON.parse(raw) };
  } catch (err) {
    return { data: undefined, error: `JSON inválido em ${relLabel}: ${err.message}` };
  }
}

function formatAjvError(fileLabel, err) {
  const loc = err.instancePath && err.instancePath.length ? err.instancePath : '(raiz)';
  switch (err.keyword) {
    case 'required':
      return `[schema] ${fileLabel}: falta a propriedade obrigatória "${err.params.missingProperty}" em ${loc}`;
    case 'enum':
      return `[schema] ${fileLabel}: valor inválido em ${loc} — deve ser um de: ${err.params.allowedValues.join(', ')}`;
    case 'pattern':
      return `[schema] ${fileLabel}: valor em ${loc} não corresponde ao padrão esperado (${err.params.pattern})`;
    case 'type':
      return `[schema] ${fileLabel}: tipo inválido em ${loc} — esperado ${err.params.type}`;
    case 'additionalProperties':
      return `[schema] ${fileLabel}: propriedade não permitida "${err.params.additionalProperty}" em ${loc}`;
    default:
      return `[schema] ${fileLabel}: ${loc} — ${err.message}`;
  }
}

function validateAgainstSchema(validators, schemaKey, data, fileLabel, errors) {
  const validate = validators[schemaKey];
  const ok = validate(data);
  if (!ok) {
    for (const err of validate.errors ?? []) errors.push(formatAjvError(fileLabel, err));
  }
  return ok;
}

async function main() {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`[atlas] diretório não encontrado: ${targetDir}`);
    process.exitCode = 1;
    return;
  }

  // --- Esquemas -----------------------------------------------------------
  const schemaFiles = {
    index: 'index.schema.json',
    content: 'content.schema.json',
    manifest: 'manifest.schema.json',
    routes: 'routes.schema.json',
    processes: 'processes.schema.json',
    quizCases: 'quiz-cases.schema.json',
    glossary: 'glossary.schema.json',
  };

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validators = {};
  for (const [key, filename] of Object.entries(schemaFiles)) {
    const schemaPath = path.join(SCHEMA_DIR, filename);
    if (!fs.existsSync(schemaPath)) {
      console.error(`[atlas] esquema não encontrado: ${schemaPath}`);
      process.exitCode = 1;
      return;
    }
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    validators[key] = ajv.compile(schema);
  }

  const budgetsPath = path.join(SCHEMA_DIR, 'budgets.json');
  const budgets = fs.existsSync(budgetsPath) ? JSON.parse(fs.readFileSync(budgetsPath, 'utf8')) : null;
  if (!budgets) errors.push(`[orcamento] arquivo de orçamentos não encontrado: ${path.relative(FRONTEND_DIR, budgetsPath)}`);

  // --- Leitura dos dados ----------------------------------------------------
  const rel = (p) => path.relative(targetDir, p) || '.';

  const indexFile = readJson(path.join(targetDir, 'index.json'), 'index.json');
  const manifestFile = readJson(path.join(targetDir, 'manifest.json'), 'manifest.json');
  const glossaryFile = readJson(path.join(targetDir, 'glossario-pt.json'), 'glossario-pt.json');
  const routesFile = readJson(path.join(targetDir, 'routes.json'), 'routes.json');
  const processesFile = readJson(path.join(targetDir, 'processes.json'), 'processes.json');
  const quizFile = readJson(path.join(targetDir, 'quiz-cases.json'), 'quiz-cases.json');
  // Mapa de âncoras de Fisiologia (scripts/atlas/build-anchor-map.mjs): liga
  // as âncoras legadas de routes/processes a estruturas/pontos reais. Com o
  // mapa presente, âncora sem resolução é ERRO (mesmo com
  // --legacy-anchors=warn) — sem ele a via não toca no atlas.
  const anchorMapPath = ['generated/anchor-map.json', 'anchor-map.json']
    .map((p) => path.join(targetDir, p))
    .find((p) => fs.existsSync(p));
  const anchorMapFile = anchorMapPath ? readJson(anchorMapPath, path.basename(anchorMapPath)) : null;
  if (anchorMapFile && anchorMapFile.error) errors.push(`[leitura] ${anchorMapFile.error}`);
  const anchorMap = anchorMapFile && anchorMapFile.data && anchorMapFile.data.anchors ? anchorMapFile.data.anchors : null;
  const anchorResolved = (sid, stepKey) => indexSids.has(sid)
    || (anchorMap && (Object.prototype.hasOwnProperty.call(anchorMap, sid)
      || (stepKey && Object.prototype.hasOwnProperty.call(anchorMap, stepKey))));
  const physiologyAnchorIsWarning = (sid) => !anchorMap && legacyAnchorsWarn && LEGACY_ANCHOR_PATTERN.test(sid);

  for (const [label, file] of [
    ['index.json', indexFile], ['manifest.json', manifestFile], ['glossario-pt.json', glossaryFile],
    ['routes.json', routesFile], ['processes.json', processesFile], ['quiz-cases.json', quizFile],
  ]) {
    if (file.error) errors.push(`[leitura] ${file.error}`);
    else if (file.missing) errors.push(`[leitura] arquivo obrigatório não encontrado: ${label} (em ${rel(targetDir)})`);
  }

  const contentDir = path.join(targetDir, 'content');
  const contentFiles = new Map(); // filename -> { data|error, path }
  if (fs.existsSync(contentDir) && fs.statSync(contentDir).isDirectory()) {
    const names = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort();
    for (const name of names) {
      const abs = path.join(contentDir, name);
      contentFiles.set(name, { ...readJson(abs, `content/${name}`), path: abs });
    }
  } else {
    errors.push(`[leitura] diretório de conteúdo não encontrado: content/ (em ${rel(targetDir)})`);
  }
  for (const [name, file] of contentFiles) {
    if (file.error) errors.push(`[leitura] ${file.error}`);
  }

  // --- Validação de esquema -------------------------------------------------
  if (indexFile.data !== undefined) validateAgainstSchema(validators, 'index', indexFile.data, 'index.json', errors);
  if (manifestFile.data !== undefined) validateAgainstSchema(validators, 'manifest', manifestFile.data, 'manifest.json', errors);
  if (glossaryFile.data !== undefined) validateAgainstSchema(validators, 'glossary', glossaryFile.data, 'glossario-pt.json', errors);
  if (routesFile.data !== undefined) validateAgainstSchema(validators, 'routes', routesFile.data, 'routes.json', errors);
  if (processesFile.data !== undefined) validateAgainstSchema(validators, 'processes', processesFile.data, 'processes.json', errors);
  if (quizFile.data !== undefined) validateAgainstSchema(validators, 'quizCases', quizFile.data, 'quiz-cases.json', errors);
  for (const [name, file] of contentFiles) {
    if (file.data !== undefined) validateAgainstSchema(validators, 'content', file.data, `content/${name}`, errors);
  }

  // Usamos as entradas mesmo quando o esquema falhou em algum ponto (ex.: uma
  // entrada sem names.pt): isso evita que um único erro de esquema esvazie o
  // conjunto de sids conhecidos e produza uma cascata de falsos "nó órfão" em
  // todo o resto do manifesto. O próprio erro de esquema já foi reportado.
  const indexEntries = Array.isArray(indexFile.data) ? indexFile.data : [];
  const indexSids = new Set(
    indexEntries.map((e) => e && typeof e.sid === 'string' ? e.sid : null).filter(Boolean),
  );

  // --- Índice: nomes em PT (mensagem amigável complementar ao schema) ------
  for (const entry of indexEntries) {
    if (!entry || !entry.names || !isNonEmpty(entry.names.pt)) {
      errors.push(`[integridade] index.json: a estrutura "${entry && entry.sid}" não tem names.pt (nome em português é obrigatório)`);
    }
  }

  // --- Manifesto: mapa de assets por arquivo (id de fato usado) ------------
  // Mesma lógica: não depende de manifestOk, para não mascarar problemas de
  // outros assets por causa de um erro de esquema isolado.
  const manifestAssets = Array.isArray(manifestFile.data?.assets) ? manifestFile.data.assets : [];
  const assetsByFile = new Map(); // file -> asset[]
  for (const asset of manifestAssets) {
    if (!asset || !asset.file) continue;
    if (!assetsByFile.has(asset.file)) assetsByFile.set(asset.file, []);
    assetsByFile.get(asset.file).push(asset);
  }

  // a) todo destino de nodeToSid existe em index.json
  for (const asset of manifestAssets) {
    if (!asset || typeof asset.nodeToSid !== 'object' || asset.nodeToSid === null) continue;
    for (const [node, sid] of Object.entries(asset.nodeToSid)) {
      if (!indexSids.has(sid)) {
        errors.push(`[integridade] manifest.json: o nó "${node}" do asset "${asset.file}" aponta para o sid "${sid}", que não existe em index.json (nó órfão)`);
      }
    }
  }

  // b) todo nó citado em index.json mesh.nodes existe no manifesto (no asset referenciado)
  for (const entry of indexEntries) {
    if (!entry || !entry.mesh) continue;
    const candidates = assetsByFile.get(entry.mesh.asset) ?? [];
    if (candidates.length === 0) {
      errors.push(`[integridade] index.json: a estrutura "${entry.sid}" referencia o asset "${entry.mesh.asset}", que não existe em manifest.json`);
      continue;
    }
    for (const node of entry.mesh.nodes ?? []) {
      for (const asset of candidates) {
        const map = asset.nodeToSid && typeof asset.nodeToSid === 'object' ? asset.nodeToSid : {};
        if (!(node in map)) {
          errors.push(`[integridade] index.json: a estrutura "${entry.sid}" referencia o nó "${node}" no asset "${entry.mesh.asset}", que não existe no nodeToSid desse asset`);
        }
      }
    }
  }

  // c) licenças mistas: o mesmo arquivo de asset não pode aparecer com licenças diferentes
  for (const [file, list] of assetsByFile) {
    const licenses = new Set(list.map((a) => a.license));
    if (licenses.size > 1) {
      errors.push(`[licenca] manifest.json: o arquivo "${file}" aparece com licenças diferentes (${[...licenses].join(', ')}) — um asset não pode misturar licenças`);
    }
  }

  // d) orçamento de bytes por asset (e total)
  if (budgets) {
    const isFixtureManifest = typeof manifestFile.data?.version === 'string' && manifestFile.data.version.startsWith('fixture');
    let total = 0;
    for (const asset of manifestAssets) {
      if (!asset || typeof asset.bytes !== 'number') continue;
      total += asset.bytes;
      if (isFixtureManifest) {
        const max = budgets.fixtures?.maxBytesPerAsset;
        if (typeof max === 'number' && asset.bytes > max) {
          errors.push(`[orcamento] ${asset.file}: ${asset.bytes} bytes excede o orçamento de fixtures (máx. ${max} bytes)`);
        }
      } else {
        const sysBudget = budgets.bySystem?.[asset.system] ?? budgets.bySystem?.default;
        const max = sysBudget ? sysBudget[asset.lod] : undefined;
        if (typeof max === 'number' && asset.bytes > max) {
          errors.push(`[orcamento] ${asset.file}: ${asset.bytes} bytes excede o orçamento de ${asset.system}/${asset.lod} (máx. ${max} bytes)`);
        }
      }
    }
    const maxTotal = budgets.total?.maxBytes;
    if (typeof maxTotal === 'number' && total > maxTotal) {
      errors.push(`[orcamento] total dos assets (${total} bytes) excede o orçamento geral (máx. ${maxTotal} bytes)`);
    }
  }

  // --- Conteúdo: fontes por campo preenchido, review.status e sid conhecido -
  for (const [name, file] of contentFiles) {
    if (file.data === undefined || typeof file.data !== 'object') continue;
    for (const [sid, record] of Object.entries(file.data)) {
      const fileLabel = `content/${name} (${sid})`;
      if (!indexSids.has(sid)) {
        errors.push(`[integridade] ${fileLabel}: este sid não existe em index.json`);
      }
      if (!record || typeof record !== 'object') continue;
      if (!record.review || !isNonEmpty(record.review.status)) {
        errors.push(`[conteudo] ${fileLabel}: falta review.status`);
      }
      const sources = Array.isArray(record.sources) ? record.sources : [];
      const coveredFields = new Set(sources.map((s) => s && s.field).filter(Boolean));
      for (const fieldPath of CONTENT_TEXT_FIELDS) {
        const value = getPath(record, fieldPath);
        if (isNonEmpty(value) && !coveredFields.has(fieldPath)) {
          errors.push(`[conteudo] ${fileLabel}: o campo "${fieldPath}" está preenchido mas não tem nenhuma fonte em sources[] com field="${fieldPath}"`);
        }
      }
    }
  }

  // --- Rotas / processos / quiz: âncoras apontam para sids existentes ------
  if (Array.isArray(routesFile.data)) {
    for (const route of routesFile.data) {
      for (const anchor of route?.anchors ?? []) {
        if (anchor && anchor.sid && !anchorResolved(anchor.sid)) {
          const msg = `[integridade] routes.json: a rota "${route.id}" referencia o sid "${anchor.sid}", que não existe em index.json${anchorMap ? ' nem em anchor-map.json (rode scripts/atlas/build-anchor-map.mjs)' : ''}`;
          if (physiologyAnchorIsWarning(anchor.sid)) {
            warnings.push(msg.replace('[integridade]', '[aviso]'));
          } else {
            errors.push(msg);
          }
        }
      }
    }
  }
  if (Array.isArray(processesFile.data)) {
    for (const proc of processesFile.data) {
      for (const step of proc?.steps ?? []) {
        for (const anchor of step?.anchors ?? []) {
          if (anchor && anchor.sid && !anchorResolved(anchor.sid, `${proc.id}:${step.order}`)) {
            const msg = `[integridade] processes.json: o processo "${proc.id}" (passo ${step.order}) referencia o sid "${anchor.sid}", que não existe em index.json${anchorMap ? ' nem em anchor-map.json (rode scripts/atlas/build-anchor-map.mjs)' : ''}`;
            if (physiologyAnchorIsWarning(anchor.sid)) {
              warnings.push(msg.replace('[integridade]', '[aviso]'));
            } else {
              errors.push(msg);
            }
          }
        }
      }
    }
  }
  // Quiz: a resposta é TOCADA no corpo 3D — todo sid precisa ser uma malha
  // real de generated/structures.json (sids legados como "fma:7088" ou
  // "za:rins" existem no índice antigo, mas nunca vêm de um toque, e o caso
  // ficava impossível de acertar).
  const structuresPath = path.join(targetDir, 'generated/structures.json');
  const structuresData = fs.existsSync(structuresPath) ? readJson(structuresPath, 'generated/structures.json').data : null;
  const structureList = Array.isArray(structuresData) ? structuresData : (structuresData && structuresData.structures) || null;
  if (structureList && Array.isArray(quizFile.data)) {
    const meshSids = new Set(structureList.map((st) => st.sid));
    const meshSystems = new Set(structureList.map((st) => st.system));
    const seenIds = new Set();
    for (const quizCase of quizFile.data) {
      if (!quizCase) continue;
      if (seenIds.has(quizCase.id)) errors.push(`[integridade] quiz-cases.json: id repetido "${quizCase.id}"`);
      seenIds.add(quizCase.id);
      const meshFields = [
        ...[].concat(quizCase.correctSid || []).map((s) => ['correctSid', s]),
        ...(quizCase.correctSids ?? []).map((s) => ['correctSids', s]),
        ...(quizCase.distractorSids ?? []).map((s) => ['distractorSids', s]),
      ];
      for (const [field, sid] of meshFields) {
        if (!meshSids.has(sid)) {
          errors.push(`[integridade] quiz-cases.json: o caso "${quizCase.id}" (${field}) usa "${sid}", que não é uma estrutura do corpo 3D (generated/structures.json) — não dá para tocá-la`);
        }
      }
      // Distrator que também conta como acerto deixa o caso ambíguo
      // (docs/atlas-conteudo/quiz-regras.md).
      const accepted = new Set([].concat(quizCase.correctSid || [], quizCase.correctSids || []));
      const bySidSystem = (sid) => (structureList.find((st) => st.sid === sid) || {}).system;
      for (const sid of quizCase.distractorSids ?? []) {
        if (accepted.has(sid) || (quizCase.correctSystem && bySidSystem(sid) === quizCase.correctSystem)) {
          errors.push(`[integridade] quiz-cases.json: o caso "${quizCase.id}" tem o distrator "${sid}" que também conta como acerto`);
        }
      }
      if (quizCase.correctSystem && !meshSystems.has(quizCase.correctSystem)) {
        errors.push(`[integridade] quiz-cases.json: o caso "${quizCase.id}" (correctSystem) usa o sistema "${quizCase.correctSystem}", que não existe em generated/structures.json`);
      }
    }
  }
  if (Array.isArray(quizFile.data)) {
    for (const quizCase of quizFile.data) {
      if (!quizCase) continue;
      const sidsToCheck = [
        ...(quizCase.correctSid ? [['correctSid', quizCase.correctSid]] : []),
        ...(quizCase.distractorSids ?? []).map((s) => ['distractorSids', s]),
        ...(quizCase.anchors ?? []).map((a) => ['anchors', a?.sid]),
      ];
      for (const [field, sid] of sidsToCheck) {
        if (sid && !indexSids.has(sid)) {
          const msg = `[integridade] quiz-cases.json: o caso "${quizCase.id}" (${field}) referencia o sid "${sid}", que não existe em index.json`;
          if (legacyAnchorsWarn && LEGACY_ANCHOR_PATTERN.test(sid)) {
            warnings.push(msg.replace('[integridade]', '[aviso]'));
          } else {
            errors.push(msg);
          }
        }
      }
    }
  }

  // --- Conteúdo curado e regras de fonte (PR 3.2) — só quando há fontes.json -
  if (fs.existsSync(path.join(targetDir, 'fontes.json'))) {
    const { validateCurated } = await import('./validate-curated.mjs');
    errors.push(...validateCurated(targetDir).errors);
  }

  // --- Resultado -------------------------------------------------------------
  console.log(`[atlas] validando ${rel(targetDir) === '.' ? targetDir : targetDir}`);
  if (errors.length === 0) {
    if (warnings.length === 0) {
      console.log('[atlas] validação concluída sem erros.');
    } else {
      console.log(`[atlas] validação concluída: ${warnings.length} aviso(s).`);
      for (const w of warnings) console.log(`  - ${w}`);
    }
    process.exitCode = 0;
    return;
  }

  console.error(`[atlas] ${errors.length} problema(s) encontrado(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  if (warnings.length > 0) {
    console.log(`[atlas] ${warnings.length} aviso(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  process.exitCode = 1;
}

main();
