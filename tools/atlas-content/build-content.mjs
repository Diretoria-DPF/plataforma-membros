#!/usr/bin/env node
/**
 * Construtor do atlas de anatomia 3D final
 * Uso: node build-content.mjs --structures structures.json --wikidata wikidata.json
 *      --wikipedia wikipedia-pt.json --asctb asctb.json --legacy-dir <data/atlas/legacy>
 *      --data-dir <data/atlas> --out <dir>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Auxiliares de normalização
// ============================================================================

/**
 * Remove acentos e converte para minúsculas
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Lê um arquivo JSON
 */
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Escreve um arquivo JSON formatado
 */
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ============================================================================
// Parseador de argumentos
// ============================================================================

function parseArgs(argv) {
  const args = {
    structures: null,
    wikidata: null,
    wikipedia: null,
    asctb: null,
    legacyDir: null,
    dataDir: null,
    out: null
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--structures') args.structures = argv[++i];
    else if (arg === '--wikidata') args.wikidata = argv[++i];
    else if (arg === '--wikipedia') args.wikipedia = argv[++i];
    else if (arg === '--asctb') args.asctb = argv[++i];
    else if (arg === '--legacy-dir') args.legacyDir = argv[++i];
    else if (arg === '--data-dir') args.dataDir = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
  }

  return args;
}

// ============================================================================
// Reconciliação de legacy sids com real sids
// ============================================================================

/**
 * Constrói um mapa de legacy sid -> real sid usando múltiplas estratégias
 */
function buildSidAliases(structures, legacyIndex, wikidata) {
  const aliases = {}; // legacy sid -> real sid
  const unmapped = [];

  const structuresByFma = new Map();
  const structuresByEnglish = new Map();

  for (const struct of structures) {
    const fmaMatch = struct.sid.match(/^fma:(\d+)/);
    if (fmaMatch) {
      structuresByFma.set(fmaMatch[1], struct);
    }
    structuresByEnglish.set(normalize(struct.english), struct);
  }

  for (const legacyEntry of legacyIndex) {
    const legacySid = legacyEntry.sid;
    let realSid = null;

    // (a) mesmo FMA id
    const legacyFmaMatch = legacySid.match(/^fma:(\d+)/);
    if (legacyFmaMatch && structuresByFma.has(legacyFmaMatch[1])) {
      realSid = structuresByFma.get(legacyFmaMatch[1]).sid;
    }

    // (b) PT name normalizado corresponde ao wikidata label_pt ou alias
    if (!realSid && legacyEntry.names && legacyEntry.names.pt) {
      const legacyPtNorm = normalize(legacyEntry.names.pt);
      for (const struct of structures) {
        const wikidataEntry = wikidata[struct.sid];
        if (wikidataEntry) {
          const wikidataPtNorm = normalize(wikidataEntry.label_pt || '');
          if (legacyPtNorm && legacyPtNorm === wikidataPtNorm) {
            realSid = struct.sid;
            break;
          }
          // Tenta aliases
          for (const alias of (wikidataEntry.aliases_pt || [])) {
            if (legacyPtNorm === normalize(alias)) {
              realSid = struct.sid;
              break;
            }
          }
          if (realSid) break;
        }
      }
    }

    // (c) English name normalizado corresponde ao structure english
    if (!realSid && legacyEntry.names && legacyEntry.names.en) {
      const legacyEnNorm = normalize(legacyEntry.names.en);
      for (const struct of structures) {
        if (legacyEnNorm === normalize(struct.english)) {
          realSid = struct.sid;
          break;
        }
      }
    }

    if (realSid) {
      aliases[legacySid] = realSid;
    } else {
      unmapped.push(legacySid);
    }
  }

  return { aliases, unmapped };
}

// ============================================================================
// Construtor do index.json
// ============================================================================

/**
 * Cria entrada no índice a partir de uma estrutura real
 */
function buildIndexEntry(struct, wikidata, legacyIndex, legacyAliases, legacyContent) {
  const entry = {
    sid: struct.sid,
    system: struct.system,
    layer: struct.layer,
    parent: struct.parent || null,
    region: struct.region || 'desconhecido'
  };

  if (struct.side) {
    entry.side = struct.side;
  }

  if (struct.bbox) {
    entry.bbox = struct.bbox;
  }

  if (struct.mesh) {
    entry.mesh = struct.mesh;
  }

  // Nomes
  const wikidataEntry = wikidata[struct.sid] || {};
  const legacySidsForThisReal = Object.entries(legacyAliases)
    .filter(([_, real]) => real === struct.sid)
    .map(([legacy, _]) => legacy);

  let legacyMatch = null;
  if (legacySidsForThisReal.length > 0) {
    const legacySid = legacySidsForThisReal[0];
    legacyMatch = legacyIndex.find(e => e.sid === legacySid);
  }

  entry.names = {
    pt: wikidataEntry.label_pt || legacyMatch?.names?.pt || struct.english,
    en: struct.english,
    la: struct.latin || undefined
  };

  // Remove undefined
  if (!entry.names.la) delete entry.names.la;

  // Synonyms
  const synonyms = [
    ...(wikidataEntry.aliases_pt || []),
    ...(legacyMatch?.names ? [] : []) // não adiciona aliases vazias
  ];
  if (synonyms.length > 0) {
    entry.synonyms = synonyms;
  }

  return entry;
}

// ============================================================================
// Construtor do content/<system>.json
// ============================================================================

/**
 * Cria registro de conteúdo para um sid real
 */
function buildContentRecord(sid, wikidataEntry, wikipediaEntry, asctbEntry, legacyContentEntry, legacyAliases) {
  const record = {
    ids: {},
    summary_pt: '',
    sources: [],
    review: {}
  };

  // Extrai IDs do wikidata
  if (wikidataEntry) {
    if (wikidataEntry.qid) record.ids.wikidata = wikidataEntry.qid;
    if (wikidataEntry.fma) record.ids.fma = wikidataEntry.fma;
    if (wikidataEntry.uberon) record.ids.uberon = wikidataEntry.uberon;
    if (wikidataEntry.ta2) record.ids.ta2 = wikidataEntry.ta2;
    if (wikidataEntry.mesh) record.ids.mesh = wikidataEntry.mesh;
    if (wikidataEntry.icd10 && wikidataEntry.icd10.length > 0) {
      record.ids.icd10 = wikidataEntry.icd10;
    }
  }

  // IDs do legacy (se houver)
  if (legacyContentEntry && legacyContentEntry.ids) {
    Object.assign(record.ids, legacyContentEntry.ids);
  }

  // Summary PT
  let hasAutoDraft = false;
  if (wikipediaEntry && wikipediaEntry.extract_pt) {
    record.summary_pt = wikipediaEntry.extract_pt;
    record.sources.push({
      field: 'summary_pt',
      type: 'wikipedia',
      ref: 'Wikipedia',
      license: 'CC-BY-SA-4.0',
      url: wikipediaEntry.url || undefined
    });
    hasAutoDraft = true;
  } else if (legacyContentEntry && legacyContentEntry.summary_pt) {
    record.summary_pt = legacyContentEntry.summary_pt;
    record.sources.push({
      field: 'summary_pt',
      type: 'other',
      ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
      license: 'proprietary-laift'
    });
  }

  // Anatomy
  if (legacyContentEntry && legacyContentEntry.anatomy) {
    record.anatomy = {};
    if (legacyContentEntry.anatomy.vascularization) {
      record.anatomy.vascularization = legacyContentEntry.anatomy.vascularization;
      record.sources.push({
        field: 'anatomy.vascularization',
        type: 'other',
        ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
        license: 'proprietary-laift'
      });
    }
    if (legacyContentEntry.anatomy.innervation) {
      record.anatomy.innervation = legacyContentEntry.anatomy.innervation;
      record.sources.push({
        field: 'anatomy.innervation',
        type: 'other',
        ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
        license: 'proprietary-laift'
      });
    }
    if (legacyContentEntry.anatomy.relations) {
      record.anatomy.relations = legacyContentEntry.anatomy.relations;
      record.sources.push({
        field: 'anatomy.relations',
        type: 'other',
        ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
        license: 'proprietary-laift'
      });
    }
    if (legacyContentEntry.anatomy.lymph) {
      record.anatomy.lymph = legacyContentEntry.anatomy.lymph;
      record.sources.push({
        field: 'anatomy.lymph',
        type: 'other',
        ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
        license: 'proprietary-laift'
      });
    }
  }

  // Histology
  if (legacyContentEntry && (legacyContentEntry.histology || asctbEntry)) {
    record.histology = {};
    if (legacyContentEntry && legacyContentEntry.histology && legacyContentEntry.histology.epithelium) {
      record.histology.epithelium = legacyContentEntry.histology.epithelium;
      record.sources.push({
        field: 'histology.epithelium',
        type: 'other',
        ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
        license: 'proprietary-laift'
      });
    }
    if (legacyContentEntry && legacyContentEntry.histology && legacyContentEntry.histology.tissues) {
      record.histology.tissues = legacyContentEntry.histology.tissues;
      record.sources.push({
        field: 'histology.tissues',
        type: 'other',
        ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
        license: 'proprietary-laift'
      });
    }

    // Cells do ASCT+B
    if (asctbEntry && asctbEntry.cells) {
      record.histology.cells = asctbEntry.cells.map(cell => ({
        cl: cell.cl,
        name_pt: cell.name_en || '', // Aguardando tradução
        biomarkers: cell.biomarkers || []
      }));
      record.sources.push({
        field: 'histology.cells',
        type: 'hra-asctb',
        ref: 'ASCT+B',
        license: 'CC-BY-4.0'
      });
      hasAutoDraft = true;
    }
  }

  // Clinical
  if (legacyContentEntry && legacyContentEntry.clinical) {
    record.clinical = legacyContentEntry.clinical;
    record.sources.push({
      field: 'clinical',
      type: 'other',
      ref: 'bio-database.js (o-bala-vip, curadoria LAIFT)',
      license: 'proprietary-laift'
    });
  }

  // Review status
  if (record.sources.length === 0) {
    // Sem conteúdo
    record.review.status = 'legacy-unverified';
  } else if (hasAutoDraft) {
    record.review.status = 'auto-draft';
  } else {
    record.review.status = 'legacy-unverified';
  }

  // Remove campos vazios
  if (!record.anatomy || Object.keys(record.anatomy).length === 0) delete record.anatomy;
  if (!record.histology || Object.keys(record.histology).length === 0) delete record.histology;
  if (!record.clinical || record.clinical.length === 0) delete record.clinical;

  return record;
}

// ============================================================================
// Reescrita de arquivos de dados
// ============================================================================

/**
 * Reescreve um arquivo de dados (routes, quiz-cases, etc) aplicando aliases de legacy
 */
function rewriteDataFile(data, aliases) {
  if (!data) return null;

  if (Array.isArray(data)) {
    return data.map(item => {
      const itemCopy = JSON.parse(JSON.stringify(item));

      // Reescreve correctSid
      if (itemCopy.correctSid && aliases[itemCopy.correctSid]) {
        itemCopy.correctSid = aliases[itemCopy.correctSid];
      }

      // Reescreve distractorSids
      if (Array.isArray(itemCopy.distractorSids)) {
        itemCopy.distractorSids = itemCopy.distractorSids.map(sid =>
          aliases[sid] || sid
        );
      }

      // Reescreve anchors[].sid
      if (Array.isArray(itemCopy.anchors)) {
        itemCopy.anchors = itemCopy.anchors.map(anchor => {
          if (anchor && anchor.sid && aliases[anchor.sid]) {
            return { ...anchor, sid: aliases[anchor.sid] };
          }
          return anchor;
        });
      }

      return itemCopy;
    });
  }

  return data;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);

  // Validação de argumentos
  if (!args.structures || !args.wikidata || !args.wikipedia || !args.asctb ||
      !args.legacyDir || !args.dataDir || !args.out) {
    console.error('Uso: node build-content.mjs --structures <file> --wikidata <file> ' +
      '--wikipedia <file> --asctb <file> --legacy-dir <dir> --data-dir <dir> --out <dir>');
    process.exit(1);
  }

  // Leitura de dados
  console.log('Lendo arquivos de entrada...');
  // O structures.json real (WP10) usa englishName/latinName; os testes deste
  // script usam english/latin — normaliza para os dois formatos funcionarem.
  const structures = (loadJson(args.structures) || []).map(s => ({
    ...s,
    english: s.english ?? s.englishName,
    latin: s.latin ?? s.latinName ?? undefined
  }));
  const wikidata = loadJson(args.wikidata) || {};
  const wikipedia = loadJson(args.wikipedia) || {};
  const asctbRaw = loadJson(args.asctb) || {};
  // Extrai bySid se presente
  const asctb = asctbRaw.bySid || asctbRaw;

  // Legacy
  const legacyIndex = loadJson(path.join(args.legacyDir, 'index.legacy.json')) || [];
  const legacyContentFiles = {};
  const contentDir = path.join(args.legacyDir, 'content');
  if (fs.existsSync(contentDir)) {
    for (const file of fs.readdirSync(contentDir)) {
      if (file.endsWith('.json')) {
        const content = loadJson(path.join(contentDir, file));
        if (content) {
          Object.assign(legacyContentFiles, content);
        }
      }
    }
  }

  // Data files
  const routes = loadJson(path.join(args.dataDir, 'routes.json')) || [];
  const processes = loadJson(path.join(args.dataDir, 'processes.json')) || [];
  const quizCases = loadJson(path.join(args.dataDir, 'quiz-cases.json')) || [];
  const compounds = loadJson(path.join(args.dataDir, 'compounds.json')) || {};
  const proteins = loadJson(path.join(args.dataDir, 'proteins.json')) || {};

  // Reconciliação
  console.log('Reconciliando legacy sids com real sids...');
  const { aliases, unmapped } = buildSidAliases(structures, legacyIndex, wikidata);

  // Index
  console.log('Construindo index.json...');
  const index = structures.map(struct =>
    buildIndexEntry(struct, wikidata, legacyIndex, aliases, legacyContentFiles)
  );

  // Legacy without mesh (content-only)
  const legacyLeftovers = [];
  for (const legacyEntry of legacyIndex) {
    const legacySid = legacyEntry.sid;
    const realSid = aliases[legacySid];

    // Se não foi mapeado, adiciona como content-only
    if (!realSid) {
      const contentEntry = buildContentRecord(
        legacySid,
        wikidata[legacySid],
        wikipedia[legacySid],
        asctb[legacySid],
        legacyContentFiles[legacySid],
        aliases
      );

      if (Object.keys(contentEntry.ids).length > 0 || contentEntry.summary_pt) {
        legacyLeftovers.push({
          sid: legacySid,
          system: legacyEntry.system,
          names: legacyEntry.names
        });
        index.push({
          sid: legacySid,
          system: legacyEntry.system,
          layer: legacyEntry.layer,
          parent: legacyEntry.parent,
          region: legacyEntry.region,
          names: legacyEntry.names,
          side: legacyEntry.side
        });
      }
    }
  }

  // Content já existente em --out (execuções anteriores) — usado para nunca
  // sobrescrever entradas já revisadas/aprovadas por humanos.
  const existingContentBySystem = {};
  const existingOutContentDir = path.join(args.out, 'content');
  if (fs.existsSync(existingOutContentDir)) {
    for (const file of fs.readdirSync(existingOutContentDir)) {
      if (file.endsWith('.json')) {
        const system = file.replace(/\.json$/, '');
        const content = loadJson(path.join(existingOutContentDir, file));
        if (content) {
          existingContentBySystem[system] = content;
        }
      }
    }
  }

  /**
   * Se já existe uma entrada revisada/aprovada por humanos para este sid,
   * devolve essa entrada intacta (nunca sobrescrita). Caso contrário,
   * devolve o registro recém-calculado.
   */
  function preserveReviewed(system, sid, freshRecord) {
    const existing = existingContentBySystem[system] && existingContentBySystem[system][sid];
    if (existing && existing.review &&
        (existing.review.status === 'reviewed' || existing.review.status === 'approved')) {
      return existing;
    }
    return freshRecord;
  }

  // Content por sistema
  console.log('Construindo content/<system>.json...');
  const contentBySystem = {};

  // Real sids
  for (const struct of structures) {
    const system = struct.system;
    if (!contentBySystem[system]) {
      contentBySystem[system] = {};
    }

    const realSid = struct.sid;
    const legacySidsForThisReal = Object.entries(aliases)
      .filter(([_, real]) => real === realSid)
      .map(([legacy, _]) => legacy);

    let legacySid = null;
    if (legacySidsForThisReal.length > 0) {
      legacySid = legacySidsForThisReal[0];
    }

    const record = buildContentRecord(
      realSid,
      wikidata[realSid],
      wikipedia[realSid],
      asctb[realSid],
      legacyContentFiles[legacySid] || legacyContentFiles[realSid],
      aliases
    );

    // Só grava um registro de conteúdo quando há de fato algo para mostrar
    // (content.schema.json exige summary_pt e sources não-vazios). A grande
    // maioria das ~12,7 mil estruturas reais (WP10) são partes pequenas
    // demais para ter um verbete próprio na Wikipédia ou no ASCT+B — ficam
    // apenas no index.json (nome/posição), sem entrada em content/<sistema>.json,
    // exatamente como nas fixtures (frontend/.../data/atlas/fixtures/content/).
    const finalRecord = preserveReviewed(system, realSid, record);
    if (finalRecord.sources && finalRecord.sources.length > 0) {
      contentBySystem[system][realSid] = finalRecord;
    }
  }

  // Legacy leftovers
  for (const leftover of legacyLeftovers) {
    const system = leftover.system;
    if (!contentBySystem[system]) {
      contentBySystem[system] = {};
    }

    const record = buildContentRecord(
      leftover.sid,
      wikidata[leftover.sid],
      wikipedia[leftover.sid],
      asctb[leftover.sid],
      legacyContentFiles[leftover.sid],
      aliases
    );

    const finalLeftoverRecord = preserveReviewed(system, leftover.sid, record);
    if (finalLeftoverRecord.sources && finalLeftoverRecord.sources.length > 0) {
      contentBySystem[system][leftover.sid] = finalLeftoverRecord;
    }
  }

  // Reescrita de data files
  console.log('Reescrevendo data files...');
  const rewrittenRoutes = rewriteDataFile(routes, aliases);
  const rewrittenProcesses = rewriteDataFile(processes, aliases);
  const rewrittenQuizCases = rewriteDataFile(quizCases, aliases);
  const rewrittenCompounds = rewriteDataFile(compounds, aliases);
  const rewrittenProteins = rewriteDataFile(proteins, aliases);

  // Escrita de saída
  console.log('Escrevendo arquivos de saída...');
  fs.mkdirSync(args.out, { recursive: true });

  writeJson(path.join(args.out, 'index.json'), index);
  writeJson(path.join(args.out, 'sid-aliases.json'), aliases);

  for (const [system, content] of Object.entries(contentBySystem)) {
    writeJson(path.join(args.out, 'content', `${system}.json`), content);
  }

  if (rewrittenRoutes) {
    writeJson(path.join(args.out, 'routes.json'), rewrittenRoutes);
  }
  if (rewrittenProcesses) {
    writeJson(path.join(args.out, 'processes.json'), rewrittenProcesses);
  }
  if (rewrittenQuizCases) {
    writeJson(path.join(args.out, 'quiz-cases.json'), rewrittenQuizCases);
  }
  if (rewrittenCompounds) {
    writeJson(path.join(args.out, 'compounds.json'), rewrittenCompounds);
  }
  if (rewrittenProteins) {
    writeJson(path.join(args.out, 'proteins.json'), rewrittenProteins);
  }

  // Report
  console.log('\n=== RELATÓRIO DE BUILD ===');
  console.log(`Estruturas reais: ${structures.length}`);
  console.log(`Legacy entries reconciliadas: ${Object.keys(aliases).length}`);
  console.log(`Legacy entries não mapeadas: ${unmapped.length}`);
  console.log(`Legacy leftovers (content-only): ${legacyLeftovers.length}`);

  const withWikipedia = Object.values(wikipedia).filter(v => v.extract_pt).length;
  console.log(`Sids com Wikipedia: ${withWikipedia}`);

  let withCells = 0;
  for (const system of Object.values(contentBySystem)) {
    for (const record of Object.values(system)) {
      if (record.histology && record.histology.cells && record.histology.cells.length > 0) {
        withCells++;
      }
    }
  }
  console.log(`Sids com células: ${withCells}`);
  console.log(`Data files reescritos: 5`);

  if (unmapped.length > 0) {
    console.log(`\nEntradas não mapeadas: ${unmapped.join(', ')}`);
  }

  console.log('✓ Build concluído com sucesso.');
}

main().catch(err => {
  console.error('Erro durante build:', err.message);
  process.exit(1);
});
