/**
 * Script para enriquecer dados de estruturas anatômicas com informações do Wikidata
 * Uso: node wikidata.mjs --in structures.json --out wikidata.json [--offline-fixture file]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configurações
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'LAIFT-Atlas/1.0 (https://github.com/Diretoria-DPF/plataforma-membros)';
const BATCH_SIZE = 50;
const MAX_RETRIES = 4;

/**
 * Constrói uma query SPARQL para um lote de estruturas
 * @param {Array} batch - Lote de estruturas
 * @returns {string} Query SPARQL válida
 */
export function buildQuery(batch) {
  // Separa estruturas por FMA id ou rótulo
  const fmaStructures = batch.filter(s => s.sid.startsWith('fma:'));
  const labelStructures = batch.filter(s => s.sid.startsWith('za:'));

  // Extrai FMA IDs (remove sufixos -l/-r)
  const fmaIds = fmaStructures.map(s => {
    const match = s.sid.match(/fma:(\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean);

  // Extrai rótulos em inglês
  const labels = labelStructures.map(s => `"${s.english}"`).join(' ');

  // Monta cláusulas WHERE
  let whereClauses = [];

  if (fmaIds.length > 0) {
    whereClauses.push(`
      {
        VALUES ?fmaId { ${fmaIds.map(id => `"${id}"`).join(' ')} }
        ?qid wdt:P1402 ?fmaId .
      }
    `);
  }

  if (labelStructures.length > 0) {
    // As literais em VALUES precisam da tag de idioma diretamente (não é
    // possível aplicar @en a uma variável, como em "?label@en" — isso é um
    // erro de sintaxe SPARQL e faz o endpoint responder HTTP 400). O FMA ID
    // aqui é OPTIONAL porque estas estruturas (sid za:) são justamente as
    // que não têm um FMA ID já conhecido — exigi-lo excluiria a maioria dos
    // resultados válidos.
    whereClauses.push(`
      {
        VALUES ?label { ${labelStructures.map(s => `"${s.english}"@en`).join(' ')} }
        ?qid rdfs:label ?label .
        ?qid wdt:P31|wdt:P279 wd:Q4936952 .
        OPTIONAL { ?qid wdt:P1402 ?fmaId . }
      }
    `);
  }

  // Cada item de whereClauses já é um GroupGraphPattern entre chaves
  // ("{ ... }") — juntá-los com parênteses extras, "({...})", não é SPARQL
  // válido (parênteses de agrupamento só valem em expressões, não em
  // WHERE); UNION exige "{ ... } UNION { ... }" diretamente.
  const whereClause = whereClauses.length > 0
    ? whereClauses.map(w => w.trim()).join('\nUNION\n')
    : '';

  return `
    SELECT DISTINCT
      (SUBSTR(STR(?fmaId), 1) AS ?fma)
      ?qid
      ?fmaId
      ?uberon
      ?ta98
      ?ta2
      ?mesh
      ?icd10
      ?label_pt
      ?alias_pt
      ?ptwiki
    WHERE {
      ${whereClause}

      OPTIONAL { ?qid wdt:P1554 ?uberon . }
      OPTIONAL { ?qid wdt:P1323 ?ta98 . }
      OPTIONAL { ?qid wdt:P7173 ?ta2 . }
      OPTIONAL { ?qid wdt:P486 ?mesh . }
      OPTIONAL { ?qid wdt:P494 ?icd10 . }
      OPTIONAL { ?qid rdfs:label ?label_pt . FILTER(LANG(?label_pt) = "pt") }
      OPTIONAL { ?qid skos:altLabel ?alias_pt . FILTER(LANG(?alias_pt) = "pt") }
      OPTIONAL {
        ?ptwiki schema:about ?qid .
        ?ptwiki schema:isPartOf <https://pt.wikipedia.org/> .
      }
    }
  `;
}

/**
 * Mapeia resultados SPARQL de volta para sids
 * @param {Object} json - Resposta JSON do SPARQL
 * @param {Array} batch - Lote original de estruturas
 * @returns {Object} Mapa de sid -> dados enriquecidos
 */
export function parseBindings(json, batch) {
  const result = {};

  // Cria índices para busca rápida
  const fmaIndex = new Map();
  const labelIndex = new Map();

  batch.forEach(s => {
    if (s.sid.startsWith('fma:')) {
      const match = s.sid.match(/fma:(\d+)/);
      if (match) {
        fmaIndex.set(match[1], s);
      }
    } else {
      labelIndex.set(s.english, s);
    }
  });

  // Mapeia bindings por FMA e rótulo
  const byFma = new Map();
  const byLabel = new Map();

  if (json.results && json.results.bindings) {
    json.results.bindings.forEach(binding => {
      if (binding.fma && binding.fma.value) {
        if (!byFma.has(binding.fma.value)) {
          byFma.set(binding.fma.value, []);
        }
        byFma.get(binding.fma.value).push(binding);
      }
      if (binding.label_pt && binding.label_pt.value) {
        if (!byLabel.has(binding.label_pt.value)) {
          byLabel.set(binding.label_pt.value, []);
        }
        byLabel.get(binding.label_pt.value).push(binding);
      }
    });
  }

  // Processa cada estrutura do lote
  batch.forEach(structure => {
    let binding = null;

    if (structure.sid.startsWith('fma:')) {
      const match = structure.sid.match(/fma:(\d+)/);
      if (match) {
        const bindings = byFma.get(match[1]) || [];
        // Pega a primeira binding com FMA id
        binding = bindings.find(b => b.fmaId) || bindings[0];
      }
    } else {
      // Procura por rótulo em português ou inglês
      const bindings = json.results?.bindings || [];
      binding = bindings.find(b => {
        const label = b.label_pt?.value || '';
        // Busca por estruturas com o rótulo que correspondem
        return b.qid;
      });

      // Se não encontrou, procura por FMA quando rótulo não está explícito
      if (!binding) {
        const allBindings = json.results?.bindings || [];
        for (const b of allBindings) {
          if (b.label_pt?.value === structure.english ||
              b.alias_pt?.value === structure.english ||
              (b.qid && !b.fma)) {
            binding = b;
            break;
          }
        }
      }

      // Fallback: procura estruturas sem FMA (para os 'za:')
      if (!binding && json.results?.bindings) {
        binding = json.results.bindings[json.results.bindings.length - 1];
      }
    }

    if (binding && binding.qid) {
      const qid = binding.qid.value.replace('http://www.wikidata.org/entity/', '');
      result[structure.sid] = {
        qid,
        fma: binding.fmaId?.value || binding.fma?.value || undefined,
        uberon: binding.uberon?.value,
        ta98: binding.ta98?.value,
        ta2: binding.ta2?.value,
        mesh: binding.mesh?.value,
        icd10: binding.icd10?.value ? [binding.icd10.value] : [],
        label_pt: binding.label_pt?.value,
        aliases_pt: binding.alias_pt?.value ? [binding.alias_pt.value] : [],
        ptwiki: binding.ptwiki?.value,
        retrieved: new Date().toISOString().split('T')[0]
      };
    }
  });

  return result;
}

/**
 * Busca com retry exponencial
 */
async function fetchWithRetry(url, options = {}, attempt = 0) {
  try {
    const response = await fetch(url, options);

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.error(`HTTP ${response.status}, retry em ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(url, options, attempt + 1);
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response;
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      console.error(`Erro na requisição, retry em ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

/**
 * Carrega e processa arquivo de estruturas
 */
function loadStructures(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const structures = JSON.parse(content);
  // O structures.json real (gerado pelo WP10) usa englishName/latinName, não
  // english/latin (que é o que os testes/fixtures deste script usam) —
  // normaliza aqui para que o resto do script funcione com os dois formatos.
  return structures.map(s => ({
    ...s,
    english: s.english ?? s.englishName,
    latin: s.latin ?? s.latinName ?? undefined
  }));
}

/**
 * Salva resultado em arquivo
 */
function saveOutput(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Resultado salvo em ${filePath}`);
}

/**
 * Função principal
 */
async function main() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let outputFile = null;
  let offlineFixture = null;

  // Parse argumentos
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in' && i + 1 < args.length) {
      inputFile = args[++i];
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outputFile = args[++i];
    } else if (args[i] === '--offline-fixture' && i + 1 < args.length) {
      offlineFixture = args[++i];
    }
  }

  if (!inputFile || !outputFile) {
    console.error('Uso: node wikidata.mjs --in structures.json --out wikidata.json [--offline-fixture file]');
    process.exit(1);
  }

  // Carrega estruturas
  console.log(`Carregando estruturas de ${inputFile}...`);
  const structures = loadStructures(inputFile);
  console.log(`Carregadas ${structures.length} estruturas`);

  const result = {};

  // Processa em lotes
  for (let i = 0; i < structures.length; i += BATCH_SIZE) {
    const batch = structures.slice(i, i + BATCH_SIZE);
    console.log(`Processando lote ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} itens)...`);

    let sparqlJson;

    if (offlineFixture) {
      // Modo offline
      const fixture = JSON.parse(fs.readFileSync(offlineFixture, 'utf-8'));
      sparqlJson = fixture;
      console.log('Usando fixture offline');
    } else {
      // Modo online
      const query = buildQuery(batch);
      const params = new URLSearchParams({ query, format: 'json' });

      console.log(`Consultando ${SPARQL_ENDPOINT}...`);
      const response = await fetchWithRetry(
        `${SPARQL_ENDPOINT}?${params}`,
        { headers: { 'User-Agent': USER_AGENT } }
      );

      sparqlJson = await response.json();
    }

    // Mapeia resultados
    const batchResult = parseBindings(sparqlJson, batch);
    Object.assign(result, batchResult);

    // Aguarda 1s entre lotes
    if (i + BATCH_SIZE < structures.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Salva resultado
  saveOutput(outputFile, result);
}

// Executa se chamado como script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}
