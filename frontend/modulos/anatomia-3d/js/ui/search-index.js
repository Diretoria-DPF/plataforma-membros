/**
 * search-index.js — índice de busca para o Atlas
 * Busca tolerante a acentos e erros de digitação sobre a estrutura anatômica.
 */

/**
 * Normaliza uma string para comparação: minúsculas, sem acentos,
 * espaços entre palavras, sem caracteres especiais.
 * @param {string} s
 * @returns {string}
 */
export function normalize(s) {
  // Converter para minúsculas e decompor acentos (NFD = decomposição)
  // Remover marcas diacríticas (combining marks)
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove combining marks
    .replace(/[^\p{L}\p{N}]/gu, ' ') // tudo que não é letra ou dígito vira espaço
    .trim()
    .replace(/\s+/g, ' '); // colapsar espaços múltiplos
}

/**
 * Calcula a distância de Levenshtein entre duas strings.
 * Retorna 3 se a distância exceder 2.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));

  // Inicializar primeira linha e coluna
  for (let i = 0; i <= m; i++) dp[0][i] = i;
  for (let j = 0; j <= n; j++) dp[j][0] = j;

  // Preencher tabela de DP
  for (let j = 1; j <= n; j++) {
    let minInRow = Infinity;
    for (let i = 1; i <= m; i++) {
      if (b[j - 1] === a[i - 1]) {
        dp[j][i] = dp[j - 1][i - 1];
      } else {
        dp[j][i] = 1 + Math.min(dp[j - 1][i], dp[j][i - 1], dp[j - 1][i - 1]);
      }
      minInRow = Math.min(minInRow, dp[j][i]);
    }
    // Early exit: se o mínimo nesta linha > 2, o resultado final será > 2
    if (minInRow > 2) return 3;
  }

  return Math.min(3, dp[n][m]);
}

/**
 * Constrói um índice de busca a partir de uma lista de entradas.
 * Cada entrada tem: sid, names {pt, en, la}, synonyms, side, system.
 * @param {Array<Object>} entries
 * @returns {Object} índice opaco
 */
export function buildSearchIndex(entries) {
  // Mapear termo normalizado → lista de {sid, weight, originalTerm}
  const terms = new Map();

  for (const entry of entries) {
    const sid = entry.sid;
    const system = entry.system;

    // Processar nomes PT (peso 100) - indexar como termo completo
    if (entry.names?.pt) {
      const term = normalize(entry.names.pt);
      if (term) addTerm(terms, term, sid, 100, system, entry.names.pt);
    }

    // Processar sinônimos PT (peso 80)
    const ptSynonyms = entry.synonyms?.pt || (Array.isArray(entry.synonyms) && entry.synonyms) || [];
    if (Array.isArray(ptSynonyms)) {
      for (const syn of ptSynonyms) {
        if (syn) {
          const term = normalize(syn);
          if (term) addTerm(terms, term, sid, 80, system, syn);
        }
      }
    }

    // Processar nome LA (peso 70)
    if (entry.names?.la) {
      const term = normalize(entry.names.la);
      if (term) addTerm(terms, term, sid, 70, system, entry.names.la);
    }

    // Processar nome EN (peso 60)
    if (entry.names?.en) {
      const term = normalize(entry.names.en);
      if (term) addTerm(terms, term, sid, 60, system, entry.names.en);
    }

    // Processar sinônimos EN (peso 50)
    const enSynonyms = entry.synonyms?.en || [];
    if (Array.isArray(enSynonyms)) {
      for (const syn of enSynonyms) {
        if (syn) {
          const term = normalize(syn);
          if (term) addTerm(terms, term, sid, 50, system, syn);
        }
      }
    }
  }

  // Converter o mapa em objeto para retornar
  // Armazenar também a lista original de entradas para referência posterior
  return {
    terms,
    entries,
  };
}

/**
 * Adiciona um termo ao índice.
 * @private
 */
function addTerm(termsMap, term, sid, weight, system, originalTerm) {
  if (!termsMap.has(term)) {
    termsMap.set(term, []);
  }
  termsMap.get(term).push({
    sid,
    weight,
    system,
    originalTerm,
  });
}

/**
 * Realiza busca no índice com ranking sofisticado.
 * @param {Object} index - índice retornado por buildSearchIndex
 * @param {string} query
 * @param {{limit?: number, boostOf?: (sid: string) => number}} options
 *   boostOf: peso extra por estrutura (PR 3.2, C2 — ficha revisada > em revisão).
 * @returns {Array<Object>} SearchResult[]
 */
export function search(index, query, { limit = 12, boostOf = null } = {}) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return [];
  }

  const queryWords = normalizedQuery.split(' ');
  const sidScores = new Map(); // sid → {score, matchedTerm}

  // Iterar sobre cada termo indexado
  for (const [term, entries] of index.terms) {
    for (const entry of entries) {
      const { sid, weight } = entry;
      let score = 0;
      let matched = term;
      const termWords = term.split(' ');

      // Verificar se o termo corresponde ao query de várias formas
      if (term === normalizedQuery) {
        // Exact match: weight + 50
        score = weight + 50;
      } else if (term.startsWith(normalizedQuery)) {
        // Term starts with query: weight + 30
        score = weight + 30;
      } else if (queryWords.length === 1) {
        // Single-word query
        const queryStr = queryWords[0];

        // Verificar se uma palavra no termo começa com o query
        let wordStartsWithQuery = false;
        for (const tw of termWords) {
          if (tw.startsWith(queryStr)) {
            wordStartsWithQuery = true;
            break;
          }
        }

        if (wordStartsWithQuery) {
          // Word in term starts with query: weight + 20
          score = weight + 20;
        } else if (normalizedQuery.length >= 3 && term.includes(normalizedQuery)) {
          // Substring match (3+ chars): weight + 5
          score = weight + 5;
        } else if (normalizedQuery.length >= 4) {
          // Fuzzy match: testar Levenshtein em cada palavra do termo
          for (const tw of termWords) {
            // Apenas comparar palavras de tamanho similar
            const lenDiff = Math.abs(tw.length - normalizedQuery.length);
            if (lenDiff <= 2) {
              const dist = levenshtein(normalizedQuery, tw);
              // Aceitar se distância é 1, ou se query tem 7+ chars e distância é 2
              if ((dist === 1) || (normalizedQuery.length >= 7 && dist === 2)) {
                score = weight - 10 * dist;
                break;
              }
            }
          }
        }
      } else {
        // Multi-word query
        // Verificar se todas as palavras da query são prefixos de palavras do termo
        let allWordsArePrefixes = true;
        for (const qw of queryWords) {
          let foundPrefix = false;
          for (const tw of termWords) {
            if (tw.startsWith(qw)) {
              foundPrefix = true;
              break;
            }
          }
          if (!foundPrefix) {
            allWordsArePrefixes = false;
            break;
          }
        }

        if (allWordsArePrefixes) {
          // Multi-word query where every query word is a prefix of some term word: weight + 15
          score = weight + 15;
        }
      }

      // Registrar o melhor score para este sid
      if (score > 0) {
        if (!sidScores.has(sid)) {
          sidScores.set(sid, { score: 0, matched: '' });
        }
        const current = sidScores.get(sid);
        if (score > current.score) {
          current.score = score;
          current.matched = matched;
        }
      }
    }
  }

  // Converter map para array e ordenar
  const results = [];
  for (const [sid, { score, matched }] of sidScores) {
    // Encontrar a entrada correspondente para obter nomes, sistema e side
    const entry = index.entries.find(e => e.sid === sid);
    if (entry) {
      const label = entry.names?.pt || entry.names?.en || sid;
      results.push({
        sid,
        label,
        systemId: entry.system,
        score: score + (boostOf ? Number(boostOf(sid)) || 0 : 0),
        side: entry.side || null,
        matched,
      });
    }
  }

  // Ordenar por score (descending), depois por comprimento da label (ascending),
  // depois por label com localeCompare
  results.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score; // score descending
    }
    if (a.label.length !== b.label.length) {
      return a.label.length - b.label.length; // length ascending
    }
    return a.label.localeCompare(b.label, 'pt-BR'); // localeCompare PT
  });

  // Aplicar limite e retornar
  return results.slice(0, limit);
}
