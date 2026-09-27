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

// ============================================================================
// Normalização de nomes
// ============================================================================

/**
 * Normaliza um nome de estrutura para comparação: remove prefixos técnicos
 * ("VH_M_"/"VH_F_", usados por alguns datasets de anatomia 3D), sufixos de
 * lado ("left"/"right" como palavra, ou ".l"/".r"/"-l"/"-r" como sufixo),
 * troca underscores por espaço e converte para minúsculas sem acentos.
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  if (!name) return '';
  let s = String(name).trim();
  s = s.replace(/^VH_[MF]_/i, '');
  s = s.replace(/_/g, ' ');
  s = s.replace(/\b(left|right)\b/gi, ' ');
  s = s.replace(/[.\-_]\s*(l|r)$/i, '');
  s = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Constrói candidatos de rótulo (mantendo capitalização, para uso em VALUES
 * SPARQL) a partir do englishName de uma estrutura: o nome "limpo" (sem
 * prefixo técnico/underscore) e, quando aplicável, uma variante genérica sem
 * a palavra de lado ("Left kidney" -> "Kidney") — útil porque o Wikidata
 * normalmente não tem um item separado para o órgão de um lado específico.
 * @param {string} rawName
 * @returns {string[]}
 */
export function buildLabelCandidates(rawName) {
  if (!rawName) return [];
  let base = String(rawName).trim();
  base = base.replace(/^VH_[MF]_/i, '');
  base = base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return [];

  const candidates = [base];

  let noSide = base.replace(/\b(left|right)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  noSide = noSide.replace(/[.\-_]\s*(l|r)$/i, '').trim();
  if (noSide && noSide.toLowerCase() !== base.toLowerCase()) {
    noSide = noSide.charAt(0).toUpperCase() + noSide.slice(1);
    candidates.push(noSide);
  }

  return candidates;
}

/**
 * Escapa uma string para uso como literal SPARQL entre aspas duplas.
 * @param {string} s
 * @returns {string}
 */
function escapeSparqlString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Extrai o título de página da Wikipédia PT a partir da URL de sitelink
 * devolvida pelo SPARQL (schema:about), decodificando percent-encoding e
 * trocando "_" por espaço — wikipedia-pt.mjs usa esse título diretamente no
 * parâmetro `titles` da API da Wikipédia, que espera o título "normal", não
 * a URL.
 * @param {string} url
 * @returns {string|undefined}
 */
export function extractWikiTitle(url) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const encoded = u.pathname.replace(/^\/wiki\//, '');
    if (!encoded) return undefined;
    return decodeURIComponent(encoded.replace(/_/g, ' '));
  } catch {
    return undefined;
  }
}

/**
 * Constrói uma query SPARQL para um lote de estruturas
 * @param {Array} batch - Lote de estruturas
 * @returns {string} Query SPARQL válida
 */
export function buildQuery(batch) {
  // Estruturas com FMA id conhecido (sid fma:*) são casadas diretamente por
  // P1402. As demais (sid za:*, a imensa maioria dos dados reais) só têm
  // englishName/latinName — são casadas por rótulo/altLabel (@en) ou, como
  // último recurso, pelo rótulo em latim (@la).
  const fmaStructures = batch.filter(s => s.sid && s.sid.startsWith('fma:'));
  const nameStructures = batch.filter(s => !s.sid || !s.sid.startsWith('fma:'));

  const fmaIds = fmaStructures.map(s => {
    const match = s.sid.match(/fma:(\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean);

  const enLabels = new Set();
  const laLabels = new Set();
  for (const s of nameStructures) {
    for (const candidate of buildLabelCandidates(s.english)) {
      enLabels.add(candidate);
    }
    if (s.latin) {
      laLabels.add(String(s.latin).trim());
    }
  }

  const whereClauses = [];

  if (fmaIds.length > 0) {
    whereClauses.push(`
      {
        VALUES ?fmaId { ${fmaIds.map(id => `"${id}"`).join(' ')} }
        ?qid wdt:P1402 ?fmaId .
        BIND("fma" AS ?matchType)
      }
    `);
  }

  if (enLabels.size > 0) {
    const values = Array.from(enLabels).map(l => `"${escapeSparqlString(l)}"@en`).join(' ');
    // Restrito a itens que já têm FMA ID (P1402) OU UBERON ID (P1554) — sem
    // isso, rótulos genéricos em inglês (ex: "Muscle") trariam ruído demais.
    whereClauses.push(`
      {
        VALUES ?matchedLabel { ${values} }
        {
          ?qid rdfs:label ?matchedLabel .
          BIND("label" AS ?matchType)
        }
        UNION
        {
          ?qid skos:altLabel ?matchedLabel .
          BIND("altLabel" AS ?matchType)
        }
        FILTER(EXISTS { ?qid wdt:P1402 [] } || EXISTS { ?qid wdt:P1554 [] })
      }
    `);
  }

  if (laLabels.size > 0) {
    const values = Array.from(laLabels).map(l => `"${escapeSparqlString(l)}"@la`).join(' ');
    whereClauses.push(`
      {
        VALUES ?matchedLabel { ${values} }
        ?qid rdfs:label ?matchedLabel .
        BIND("latin" AS ?matchType)
        FILTER(EXISTS { ?qid wdt:P1402 [] } || EXISTS { ?qid wdt:P1554 [] })
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
      ?qid
      ?fmaId
      ?matchType
      ?matchedLabel
      ?uberon
      ?ta2
      ?mesh
      ?icd10
      ?label_pt
      ?alias_pt
      ?ptwiki
    WHERE {
      ${whereClause}

      OPTIONAL { ?qid wdt:P1402 ?fmaId . }
      OPTIONAL { ?qid wdt:P1554 ?uberon . }
      OPTIONAL { ?qid wdt:P1323 ?ta2 . }
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
 * Monta a entrada final de uma estrutura a partir de um binding SPARQL.
 */
function bindingToEntry(binding) {
  if (!binding || !binding.qid) return null;
  const qid = binding.qid.value.replace('http://www.wikidata.org/entity/', '');
  return {
    qid,
    fma: binding.fmaId?.value || undefined,
    uberon: binding.uberon?.value,
    ta2: binding.ta2?.value,
    mesh: binding.mesh?.value,
    icd10: binding.icd10?.value ? [binding.icd10.value] : [],
    label_pt: binding.label_pt?.value,
    aliases_pt: binding.alias_pt?.value ? [binding.alias_pt.value] : [],
    ptwiki: extractWikiTitle(binding.ptwiki?.value),
    retrieved: new Date().toISOString().split('T')[0]
  };
}

/**
 * Mapeia resultados SPARQL de volta para sids
 * @param {Object} json - Resposta JSON do SPARQL
 * @param {Array} batch - Lote original de estruturas
 * @returns {Object} Mapa de sid -> dados enriquecidos
 */
export function parseBindings(json, batch) {
  const result = {};

  const bindings = (json.results && json.results.bindings) || [];

  // Índice de bindings por FMA id (match direto, sid fma:*)
  const byFma = new Map();
  // Índice de bindings por rótulo casado (normalizado), separando @la de
  // @en/altLabel para não confundir um nome em latim com um em inglês que,
  // por acaso, normalize para o mesmo texto.
  const byLabel = new Map();

  for (const binding of bindings) {
    if (binding.matchType && binding.matchType.value === 'fma' && binding.fmaId) {
      const key = binding.fmaId.value;
      if (!byFma.has(key)) byFma.set(key, []);
      byFma.get(key).push(binding);
    }

    if (binding.matchedLabel && binding.matchedLabel.value) {
      const lang = binding.matchedLabel['xml:lang'] || '';
      const key = (lang === 'la' ? 'la:' : 'en:') + normalizeName(binding.matchedLabel.value);
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(binding);
    }
  }

  const matchTypeRank = { label: 0, altLabel: 1, latin: 2 };
  function bestBinding(list) {
    return list.slice().sort((a, b) => {
      const ra = matchTypeRank[a.matchType?.value] ?? 3;
      const rb = matchTypeRank[b.matchType?.value] ?? 3;
      return ra - rb;
    })[0];
  }

  // Estruturas com FMA id direto
  batch.forEach(structure => {
    if (!structure.sid || !structure.sid.startsWith('fma:')) return;
    const match = structure.sid.match(/fma:(\d+)/);
    if (!match) return;
    const candidates = byFma.get(match[1]) || [];
    const binding = candidates.find(b => b.qid) || null;
    const entry = bindingToEntry(binding);
    if (entry) result[structure.sid] = entry;
  });

  // Estruturas casadas por nome (sid za:* ou qualquer coisa sem prefixo fma:)
  batch.forEach(structure => {
    if (structure.sid && structure.sid.startsWith('fma:')) return;

    const tries = [];
    for (const candidate of buildLabelCandidates(structure.english)) {
      tries.push('en:' + normalizeName(candidate));
    }
    if (structure.latin) {
      tries.push('la:' + normalizeName(structure.latin));
    }

    for (const key of tries) {
      const candidates = byLabel.get(key) || [];
      if (candidates.length === 0) continue;
      const binding = bestBinding(candidates);
      const entry = bindingToEntry(binding);
      if (entry) {
        result[structure.sid] = entry;
      }
      break;
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
        { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json' } }
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

  const withQid = Object.keys(result).filter(k => result[k].qid).length;
  console.log(`Sids com qid: ${withQid} de ${structures.length}`);
}

// Executa se chamado como script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}
