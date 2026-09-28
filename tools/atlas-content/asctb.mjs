import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeName } from './wikidata.mjs';
import { normUberon } from './uberon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parser RFC4180 para CSV com suporte a campos com aspas, vírgulas e quebras de linha
 * @param {string} text - conteúdo do CSV
 * @returns {string[][]} - matriz de linhas e campos
 */
export function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Aspas duplas dentro de um campo entre aspas = uma aspa literal
        currentField += '"';
        i++; // pula a próxima aspa
      } else {
        // Toggle estado de aspas
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Delimitador de campo
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      // Fim de linha
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      // pula \r\n como um único break
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentField += char;
    }
  }

  // Última linha
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(field => field)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Encontra a linha de cabeçalho (primeira linha que começa com "AS/1")
 * @param {string[][]} rows - matriz de linhas
 * @returns {number} - índice da linha de cabeçalho
 */
export function findHeader(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'AS/1') {
      return i;
    }
  }
  return -1;
}

/**
 * Extrai registros de dados a partir da linha de cabeçalho
 * @param {string[][]} rows - matriz de linhas
 * @param {number} headerIndex - índice da linha de cabeçalho
 * @returns {object[]} - lista de registros extraídos
 */
export function extractRecords(rows, headerIndex) {
  if (headerIndex < 0 || headerIndex >= rows.length) {
    return [];
  }

  const header = rows[headerIndex];
  const records = [];

  // Processa linhas de dados (após o cabeçalho)
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row[0]) continue;

    const record = {};

    // Cria mapa de coluna -> valor
    for (let j = 0; j < header.length && j < row.length; j++) {
      record[header[j]] = row[j];
    }

    records.push(record);
  }

  return records;
}

/**
 * Agrega registros por AS ID (estrutura anatômica mais profunda com ID)
 * @param {object[]} records - lista de registros
 * @returns {object} - { byAsId: { [asId]: { cells: [...], biomarkers: [...] } } }
 */
export function aggregate(records) {
  const byAsId = {};

  for (const record of records) {
    // Encontra a estrutura anatômica mais profunda com ID
    let deepestAsId = null;
    let deepestAsLabel = null;

    // Procura por AS/N/ID colunas
    let asIndex = 1;
    while (true) {
      const idKey = `AS/${asIndex}/ID`;
      const labelKey = `AS/${asIndex}/LABEL`;
      if (idKey in record && record[idKey]) {
        deepestAsId = record[idKey];
        deepestAsLabel = record[labelKey] || '';
        asIndex++;
      } else {
        break;
      }
    }

    if (!deepestAsId) continue;

    if (!byAsId[deepestAsId]) {
      byAsId[deepestAsId] = {
        label: deepestAsLabel,
        cells: [],
        biomarkers: []
      };
    }

    // Extrai tipos de células (CL ids)
    let ctIndex = 1;
    while (true) {
      const idKey = `CT/${ctIndex}/ID`;
      const labelKey = `CT/${ctIndex}/LABEL`;
      if (idKey in record && record[idKey]) {
        const clId = record[idKey];
        const clLabel = record[labelKey] || '';

        // Valida o formato CL: CL:0000000 (7 dígitos)
        if (/^CL:\d{7}$/.test(clId)) {
          // Adiciona célula se não estiver duplicada
          if (!byAsId[deepestAsId].cells.some(c => c.cl === clId)) {
            byAsId[deepestAsId].cells.push({
              cl: clId,
              name_en: clLabel,
              biomarkers: []
            });
          }
        }
        ctIndex++;
      } else {
        break;
      }
    }

    // Extrai biomarcadores de genes
    let bgeneIndex = 1;
    while (true) {
      const labelKey = `BGene/${bgeneIndex}/LABEL`;
      if (labelKey in record && record[labelKey]) {
        const biomarker = record[labelKey];
        if (!byAsId[deepestAsId].biomarkers.includes(biomarker)) {
          byAsId[deepestAsId].biomarkers.push(biomarker);
        }
        bgeneIndex++;
      } else {
        break;
      }
    }

    // Extrai biomarcadores de proteínas
    let bproteinIndex = 1;
    while (true) {
      const labelKey = `BProtein/${bproteinIndex}/LABEL`;
      if (labelKey in record && record[labelKey]) {
        const biomarker = record[labelKey];
        if (!byAsId[deepestAsId].biomarkers.includes(biomarker)) {
          byAsId[deepestAsId].biomarkers.push(biomarker);
        }
        bproteinIndex++;
      } else {
        break;
      }
    }
  }

  return byAsId;
}

/**
 * Carrega arquivo JSON
 * @param {string} filePath - caminho para o arquivo
 * @returns {object} - objeto JSON
 */
function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Erro ao carregar ${filePath}:`, error.message);
    return {};
  }
}

/**
 * Constrói um índice reverso (número FMA/UBERON -> sid real) a partir do
 * wikidata.json.
 *
 * Dois formatos são aceitos:
 * - "plano" (legado, usado nas fixtures de teste): { fma: { "<num>": sid },
 *   uberon: { "<num>": sid } } — o valor já é o sid a usar.
 * - "por sid" (o que wikidata.mjs realmente produz): { "<sid>": { fma:
 *   "<num>", uberon: "UBERON:<num>", ... }, ... } — precisa ser invertido.
 *
 * Sem isso, mapAsIdToSid não tinha como saber a qual sid real (za:*) um AS
 * ID do ASCT+B corresponde — a versão anterior fabricava um sid sintético
 * ("fma:<num>"/"uberon:<num>") que nunca bate com nenhum sid real de
 * structures.json, então build-content.mjs nunca encontrava as células.
 *
 * @param {object} wikidataRaw
 * @returns {{ fma: Map<string,string>, uberon: Map<string,string> }}
 */
export function buildReverseWikidataIndex(wikidataRaw) {
  const fma = new Map();
  const uberon = new Map();

  if (!wikidataRaw || typeof wikidataRaw !== 'object') {
    return { fma, uberon };
  }

  const isFlatLegacyFormat =
    (wikidataRaw.fma && typeof wikidataRaw.fma === 'object' && !wikidataRaw.fma.qid) ||
    (wikidataRaw.uberon && typeof wikidataRaw.uberon === 'object' && !wikidataRaw.uberon.qid);

  if (isFlatLegacyFormat) {
    for (const [num, sid] of Object.entries(wikidataRaw.fma || {})) fma.set(num, sid);
    for (const [num, sid] of Object.entries(wikidataRaw.uberon || {})) uberon.set(num, sid);
    return { fma, uberon };
  }

  for (const [sid, entry] of Object.entries(wikidataRaw)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.fma) {
      const num = String(entry.fma).replace(/^FMA:/i, '');
      if (!fma.has(num)) fma.set(num, sid);
    }
    if (entry.uberon) {
      // entry.uberon pode vir em qualquer formato aceito por normUberon
      // (canônico, purl/OBO com underscore, URI completa) — normaliza antes
      // de extrair o número, em vez de assumir que já está em "UBERON:<n>".
      const normalized = normUberon(entry.uberon);
      if (normalized) {
        const num = normalized.replace(/^UBERON:/i, '');
        if (!uberon.has(num)) uberon.set(num, sid);
      }
    }
  }

  return { fma, uberon };
}

/**
 * Constrói um índice nome normalizado -> sid a partir de structures.json,
 * usado como fallback quando o AS ID do ASCT+B (FMA/UBERON) não bate com
 * nada no índice reverso do wikidata.json — o que é o caso comum, já que a
 * quase totalidade das estruturas reais (sid za:*) só tem qid/uberon quando
 * wikidata.mjs conseguiu casar por nome (ver wikidata.mjs normalizeName).
 * @param {object[]} structures
 * @returns {Map<string,string>}
 */
export function buildNameIndex(structures) {
  const index = new Map();
  for (const struct of structures || []) {
    const english = struct.english ?? struct.englishName;
    if (!english) continue;
    const key = normalizeName(english);
    if (key && !index.has(key)) {
      index.set(key, struct.sid);
    }
  }
  return index;
}

/**
 * Mapeia um AS ID do ASCT+B para o sid real do atlas.
 *
 * Estratégia, em ordem de preferência:
 * 1. FMA/UBERON id do ASCT+B batendo com o índice reverso do wikidata.json
 *    (buildReverseWikidataIndex) — mais confiável, mas só funciona para os
 *    poucos sids que já têm esse id (via wikidata.mjs).
 * 2. Nome (AS/N/LABEL) normalizado batendo com o englishName de uma
 *    estrutura real (buildNameIndex) — fallback usado pela maioria das
 *    ~3.700 estruturas do ASCT+B, que não têm qid/uberon conhecido.
 *
 * @param {string} asId - ID de estrutura anatômica (FMA:xxxx ou UBERON:xxxx)
 * @param {string} label - rótulo da estrutura (AS/N/LABEL do ASCT+B)
 * @param {{ fma: Map, uberon: Map }} wdIndex
 * @param {Map<string,string>} nameIndex
 * @returns {string|null} - sid real, ou null se não mapeado
 */
function mapAsIdToSid(asId, label, wdIndex, nameIndex) {
  if (asId) {
    if (asId.startsWith('FMA:')) {
      const sid = wdIndex.fma.get(asId.substring(4));
      if (sid) return sid;
    } else if (asId.startsWith('UBERON:')) {
      const sid = wdIndex.uberon.get(asId.substring(7));
      if (sid) return sid;
    }
  }

  if (label && nameIndex) {
    const sid = nameIndex.get(normalizeName(label));
    if (sid) return sid;
  }

  return null;
}

/**
 * Processa CSV ASCT+B completo
 * @param {string} csvText - conteúdo do CSV
 * @param {{ fma: Map, uberon: Map }} wdIndex - índice reverso (ver buildReverseWikidataIndex)
 * @param {object} sourceInfo - informações de origem (organ, version, doi, url, license)
 * @returns {object} - { bySid: {...}, unmapped: [...] }
 */
function processAsctbCsv(csvText, wdIndex, sourceInfo = {}, nameIndex = new Map()) {
  const rows = parseCsv(csvText);
  const headerIndex = findHeader(rows);

  if (headerIndex < 0) {
    throw new Error('Cabeçalho ASCT+B não encontrado');
  }

  const records = extractRecords(rows, headerIndex);
  const aggregated = aggregate(records);

  const bySid = {};
  const unmapped = [];

  for (const [asId, data] of Object.entries(aggregated)) {
    const sid = mapAsIdToSid(asId, data.label, wdIndex, nameIndex);

    if (sid) {
      bySid[sid] = {
        cells: data.cells.map(c => ({
          cl: c.cl,
          name_en: c.name_en,
          biomarkers: data.biomarkers
        })),
        tissues: [data.label],
        source: sourceInfo
      };
    } else {
      unmapped.push({
        asId,
        label: data.label
      });
    }
  }

  return {
    bySid,
    unmapped
  };
}

/**
 * Função principal CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    options[key] = value;
  }

  if (!options.organs) {
    console.error('Uso: node asctb.mjs --organs heart,kidney,... --wikidata wikidata.json --out asctb.json [--structures structures.json] [--offline-dir dir] [--manifest organs.json]');
    process.exit(1);
  }

  const organs = options.organs.split(',').map(o => o.trim());
  const wikidataFile = options.wikidata || 'wikidata.json';
  const outFile = options.out || 'asctb.json';
  const offlineDir = options['offline-dir'];
  // Manifesto com a versão/URL real de cada órgão (asctb-organs.json, o
  // mesmo usado pelo workflow para baixar os CSVs) — sem isso, sourceInfo
  // abaixo gravava versão "1.0" e DOI do heart para todos os órgãos, o que
  // vira o `rev` errado em build-content.mjs (content.schema.json exige uma
  // fonte por campo; `rev` deve ser a versão real da tabela ASCT+B usada).
  const manifestFile = options.manifest || path.join(__dirname, 'asctb-organs.json');
  const structuresFile = options.structures;

  const organsManifest = loadJson(manifestFile);
  const organsManifestByName = new Map();
  if (Array.isArray(organsManifest)) {
    for (const o of organsManifest) {
      if (o && o.organ) organsManifestByName.set(o.organ, o);
    }
  }

  const wikidata = loadJson(wikidataFile);
  const wdIndex = buildReverseWikidataIndex(wikidata);
  // Fallback de mapeamento por nome (ver mapAsIdToSid) — usado quando o AS
  // ID do ASCT+B não bate com nenhum FMA/UBERON já conhecido no
  // wikidata.json (o caso comum: a maioria das estruturas reais só ganha
  // qid/uberon quando wikidata.mjs casa por nome).
  const structures = structuresFile ? loadJson(structuresFile) : null;
  const nameIndex = buildNameIndex(structures || []);
  const result = {
    bySid: {},
    unmapped: [],
    processed: []
  };

  for (const organ of organs) {
    let csvContent;
    const csvPath = offlineDir ? path.join(offlineDir, `asctb-${organ}.csv`) : null;

    try {
      if (csvPath && fs.existsSync(csvPath)) {
        csvContent = fs.readFileSync(csvPath, 'utf8');
        console.log(`Carregado de arquivo offline: ${csvPath}`);
      } else {
        console.error(`CSV não encontrado para ${organ}`);
        continue;
      }

      const manifestEntry = organsManifestByName.get(organ);
      const sourceInfo = {
        organ,
        version: manifestEntry?.version || '1.0',
        url: manifestEntry?.url || `https://cdn.humanatlas.io/digital-objects/asct-b/${organ}/1.0/assets/asct-b-${organ}.csv`,
        license: 'CC-BY-4.0'
      };

      const processed = processAsctbCsv(csvContent, wdIndex, sourceInfo, nameIndex);

      // Mescla resultados
      Object.assign(result.bySid, processed.bySid);
      result.unmapped.push(...processed.unmapped);
      result.processed.push(organ);

      console.log(`Processado: ${organ} - ${Object.keys(processed.bySid).length} sids mapeados, ${processed.unmapped.length} não mapeados`);
    } catch (error) {
      console.error(`Erro ao processar ${organ}:`, error.message);
    }
  }

  // Escreve resultado
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\nResultado escrito em: ${outFile}`);
  console.log(`Total de sids: ${Object.keys(result.bySid).length}`);
  console.log(`Total de não mapeados: ${result.unmapped.length}`);
}

// Executa se foi chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
