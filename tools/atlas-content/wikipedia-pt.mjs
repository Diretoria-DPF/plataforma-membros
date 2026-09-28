import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Funções auxiliares exportadas
// ============================================================================

/**
 * Constrói a URL da API de Wikipedia em português com os títulos fornecidos.
 * @param {string[]} titles - Array de títulos a consultar
 * @returns {string} URL completa com query parameters codificados
 */
export function buildUrl(titles) {
  const baseUrl = 'https://pt.wikipedia.org/w/api.php';
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts|revisions|info',
    exintro: '1',
    explaintext: '1',
    exsectionformat: 'plain',
    rvprop: 'ids|timestamp',
    inprop: 'url',
    redirects: '1',
    titles: titles.join('|')
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Limpa o texto do resumo extraído da Wikipedia.
 * - Remove espaçamento em excesso
 * - Remove pronuncias entre parênteses e parênteses vazios
 * - Corta a 900 caracteres em limite de sentença
 * - Descarta se o resultado tiver menos de 80 caracteres
 * @param {string} text - Texto a limpar
 * @returns {string|null} Texto limpo ou null se muito curto
 */
export function cleanExtract(text) {
  if (!text) return null;

  // Colapsa espaçamento em branco
  let cleaned = text.replace(/\s+/g, ' ').trim();

  // Remove pronuncias entre barras (IPA: /.../)
  // Exemplo: /kɔɾɐˈsɐ̃w/ → removido
  cleaned = cleaned.replace(/\s*\/[^/]*\//g, '');

  // Remove pronuncias entre parênteses (IPA e similares)
  // Padrão: remove conteúdo entre parênteses que parecem ser pronuncia
  cleaned = cleaned.replace(/\s*\([^)]*[/ˌˈɪəæθŋ][^)]*\)/g, '');

  // Remove parênteses vazios e espaçamento extra após remover conteúdo
  cleaned = cleaned.replace(/\s*\(\s*\)/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Corta a 900 caracteres em limite de sentença
  if (cleaned.length > 900) {
    // Tenta encontrar último ponto até 900 caracteres
    let cutPos = 900;
    const lastPeriod = cleaned.lastIndexOf('.', cutPos);
    if (lastPeriod > 80) {
      cutPos = lastPeriod + 1;
    } else {
      // Se não houver ponto, tenta vírgula
      const lastComma = cleaned.lastIndexOf(',', cutPos);
      if (lastComma > 80) {
        cutPos = lastComma + 1;
      }
    }
    cleaned = cleaned.substring(0, cutPos).trim();
  }

  // Descarta se muito curto (menos de 80 caracteres)
  if (cleaned.length < 80) {
    return null;
  }

  return cleaned;
}

/**
 * Processa a resposta JSON da API e mapeia os resultados aos sids originais.
 * Lida com redirecionamentos e títulos normalizados.
 * @param {object} json - Resposta JSON da API
 * @param {Map<string, string>} titleToSid - Mapa de título → sid
 * @returns {object} Objeto mapeado { [sid]: { title, extract_pt, revid, timestamp, url, ... } }
 */
export function parseResponse(json, titleToSid) {
  const result = {};

  // Mapear redirecionamentos: from → to
  const redirectMap = {};
  if (json.query?.redirects) {
    for (const redirect of json.query.redirects) {
      redirectMap[redirect.from] = redirect.to;
    }
  }

  // Mapear títulos normalizados: from → to
  const normalizedMap = {};
  if (json.query?.normalized) {
    for (const norm of json.query.normalized) {
      normalizedMap[norm.from] = norm.to;
    }
  }

  // Processar páginas
  if (json.query?.pages) {
    for (const page of json.query.pages) {
      const title = page.title;
      let sid = titleToSid.get(title);

      // Se não encontrar direto, tenta via redirecionamento
      if (!sid) {
        for (const [from, to] of Object.entries(redirectMap)) {
          if (to === title) {
            sid = titleToSid.get(from);
            if (sid) break;
          }
        }
      }

      // Se ainda não encontrar, tenta via normalização
      if (!sid) {
        for (const [from, to] of Object.entries(normalizedMap)) {
          if (to === title) {
            sid = titleToSid.get(from);
            if (sid) break;
          }
        }
      }

      if (!sid) {
        continue; // Pula se não conseguir mapear
      }

      // Extrai revid e timestamp do primeiro revision
      let revid = null;
      let timestamp = null;
      if (page.revisions && page.revisions.length > 0) {
        revid = page.revisions[0].revid;
        timestamp = page.revisions[0].timestamp;
      }

      // Limpa o resumo
      const extract_pt = cleanExtract(page.extract);

      // Monta o resultado
      result[sid] = {
        title: page.title,
        extract_pt,
        revid,
        timestamp,
        url: page.fullurl,
        license: 'CC-BY-SA-4.0',
        source: 'Wikipédia em português'
      };
    }
  }

  return result;
}

// ============================================================================
// Função de requisição com retry
// ============================================================================

/**
 * Faz requisição HTTP com retry automático em caso de erro 429/5xx
 * @param {string} url - URL a requisitar
 * @param {object} options - Opções do https.get
 * @param {number} maxRetries - Número máximo de tentativas
 * @returns {Promise<string>} Corpo da resposta como string
 */
function fetchWithRetry(url, options = {}, maxRetries = 4) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryFetch = () => {
      attempt++;

      https.get(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Se for erro 429 ou 5xx e ainda temos tentativas
          if ((res.statusCode === 429 || res.statusCode >= 500) && attempt < maxRetries) {
            // Espera antes de tentar novamente (backoff exponencial)
            const delay = 500 * Math.pow(2, attempt - 1);
            setTimeout(tryFetch, delay);
          } else if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
          } else {
            resolve(data);
          }
        });
      }).on('error', (err) => {
        if (attempt < maxRetries) {
          const delay = 500 * Math.pow(2, attempt - 1);
          setTimeout(tryFetch, delay);
        } else {
          reject(err);
        }
      });
    };

    tryFetch();
  });
}

// ============================================================================
// Função principal de processamento
// ============================================================================

/**
 * Processa arquivo wikidata.json e busca extratos de Wikipedia em português.
 * @param {string} inputFile - Caminho para wikidata.json
 * @param {string} outputFile - Caminho para output wikipedia-pt.json
 * @param {string|null} offlineFixture - Caminho opcional para fixture offline
 */
async function processWikipedia(inputFile, outputFile, offlineFixture = null) {
  // Lê arquivo de entrada
  console.log(`Lendo ${inputFile}...`);
  const wikidataContent = fs.readFileSync(inputFile, 'utf-8');
  const wikidata = JSON.parse(wikidataContent);

  // Coleta entradas com ptwiki
  const entriesToFetch = [];
  const titleToSidMap = new Map();

  for (const [sid, entry] of Object.entries(wikidata)) {
    if (entry.ptwiki) {
      entriesToFetch.push({
        sid,
        title: entry.ptwiki
      });
      titleToSidMap.set(entry.ptwiki, sid);
    }
  }

  console.log(`Encontradas ${entriesToFetch.length} entradas com ptwiki`);

  const result = {};

  // Processa em lotes de até 20
  const batchSize = 20;
  for (let i = 0; i < entriesToFetch.length; i += batchSize) {
    const batch = entriesToFetch.slice(i, i + batchSize);
    const titles = batch.map((e) => e.title);

    console.log(`Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(entriesToFetch.length / batchSize)}: ${titles.join(', ')}`);

    let apiResponse;

    if (offlineFixture) {
      // Modo offline: usa fixture
      console.log(`  Carregando fixture: ${offlineFixture}`);
      const fixtureContent = fs.readFileSync(offlineFixture, 'utf-8');
      apiResponse = JSON.parse(fixtureContent);
    } else {
      // Modo online: chama API
      const url = buildUrl(titles);
      const options = {
        headers: {
          'User-Agent': 'LAIFT-Atlas/1.0 (https://github.com/Diretoria-DPF/plataforma-membros)'
        }
      };

      try {
        const responseText = await fetchWithRetry(url, options);
        apiResponse = JSON.parse(responseText);
      } catch (err) {
        console.error(`Erro ao buscar lote: ${err.message}`);
        continue;
      }
    }

    // Parseia resposta e adiciona ao resultado
    const batchResult = parseResponse(apiResponse, titleToSidMap);
    Object.assign(result, batchResult);

    // Aguarda 500ms antes do próximo lote
    if (i + batchSize < entriesToFetch.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Escreve resultado
  console.log(`Escrevendo ${outputFile}...`);
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log('Concluído!');
}

// ============================================================================
// CLI
// ============================================================================

if (process.argv[1] === __filename) {
  // Parse argumentos CLI
  const args = process.argv.slice(2);
  let inputFile = null;
  let outputFile = null;
  let offlineFixture = null;

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
    console.error('Uso: node wikipedia-pt.mjs --in <arquivo> --out <arquivo> [--offline-fixture <arquivo>]');
    process.exit(1);
  }

  processWikipedia(inputFile, outputFile, offlineFixture).catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}
