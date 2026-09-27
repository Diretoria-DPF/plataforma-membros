import fs from 'fs';
import path from 'path';

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
 * Mapeia um AS ID para sid usando wikidata
 * @param {string} asId - ID de estrutura anatômica (FMA:xxxx ou UBERON:xxxx)
 * @param {object} wikidata - objeto wikidata com mapeamentos fma e uberon
 * @returns {string|null} - sid ou null se não mapeado
 */
function mapAsIdToSid(asId, wikidata) {
  if (!asId) return null;

  if (asId.startsWith('FMA:')) {
    const fmaNum = asId.substring(4);
    if (wikidata.fma && wikidata.fma[fmaNum]) {
      return `fma:${fmaNum}`;
    }
  } else if (asId.startsWith('UBERON:')) {
    const uberonNum = asId.substring(7);
    if (wikidata.uberon && wikidata.uberon[uberonNum]) {
      return `uberon:${uberonNum}`;
    }
  }

  return null;
}

/**
 * Processa CSV ASCT+B completo
 * @param {string} csvText - conteúdo do CSV
 * @param {object} wikidata - mapeamentos de wikidata
 * @param {object} sourceInfo - informações de origem (organ, version, doi, url, license)
 * @returns {object} - { bySid: {...}, unmapped: [...] }
 */
function processAsctbCsv(csvText, wikidata, sourceInfo = {}) {
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
    const sid = mapAsIdToSid(asId, wikidata);

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
    console.error('Uso: node asctb.mjs --organs heart,kidney,... --wikidata wikidata.json --out asctb.json [--offline-dir dir] [--manifest organs.json]');
    process.exit(1);
  }

  const organs = options.organs.split(',').map(o => o.trim());
  const wikidataFile = options.wikidata || 'wikidata.json';
  const outFile = options.out || 'asctb.json';
  const offlineDir = options['offline-dir'];
  const manifestFile = options.manifest;

  const wikidata = loadJson(wikidataFile);
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

      const sourceInfo = {
        organ,
        version: '1.0',
        doi: '10.35079/HRA.ASCTB.HEART.1.0',
        url: `https://cdn.humanatlas.io/digital-objects/asct-b/${organ}/1.0/assets/asct-b-${organ}.csv`,
        license: 'CC-BY-4.0'
      };

      const processed = processAsctbCsv(csvContent, wikidata, sourceInfo);

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
