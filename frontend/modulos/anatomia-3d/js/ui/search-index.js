/**
 * @file search-index.js
 * @description Índice de busca textual do Atlas Anatômico 3D LAIFT.
 * Suporta normalização PT-BR sem acento, busca por tokens, autocompletar e tolerância fonética.
 */

// [INÍCIO: normalizeSearchString]
/**
 * Normaliza uma sequência de caracteres removendo marcas de acentuação gráfica e caixa.
 * Converte "Coração", "CORAÇÃO", "coração" e "coracao" na forma canônica "coracao".
 * @param {any} str
 * @returns {string}
 */
export function normalizeSearchString(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
// [FIM: normalizeSearchString]

// [INÍCIO: tokenizeText]
/**
 * Divide uma string em tokens semânticos alfanuméricos isolados.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeText(text) {
  const normalized = normalizeSearchString(text);
  if (normalized.length === 0) {
    return [];
  }
  return normalized
    .split(/[^a-z0-9]+/g)
    .filter(token => token.length >= 2);
}
// [FIM: tokenizeText]

// [INÍCIO: levenshteinDistance]
/**
 * Calcula a distância de Levenshtein entre duas palavras para buscas aproximadas.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Substituição
          matrix[i][j - 1] + 1,     // Inserção
          matrix[i - 1][j] + 1      // Remoção
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
// [FIM: levenshteinDistance]

export class SearchIndex {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {Map<string, Object>} SID -> StructureEntry normalizado */
    this.entriesBySid = new Map();
    /** @type {Map<string, Set<string>>} Token -> SIDs correspondentes */
    this.invertedIndex = new Map();
    /** @type {string[]} Lista de tokens únicos catalogados */
    this.allTokens = [];
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: clear]
  /**
   * Reseta e esvazia todos os índices em memória.
   */
  clear() {
    this.entriesBySid.clear();
    this.invertedIndex.clear();
    this.allTokens = [];
  }
  // [FIM MÉTODO: clear]

  // [INÍCIO MÉTODO: build]
  /**
   * Constrói o índice a partir da coleção completa de estruturas normalizadas.
   * @param {Object[]} structures - Lista de registros StructureEntry.
   */
  build(structures) {
    this.clear();
    if (!Array.isArray(structures)) {
      return;
    }

    for (let i = 0; i < structures.length; i++) {
      const item = structures[i];
      if (!item || !item.sid) {
        continue;
      }
      this.addEntry(item);
    }

    this.allTokens = Array.from(this.invertedIndex.keys());
  }
  // [FIM MÉTODO: build]

  // [INÍCIO MÉTODO: addEntry]
  /**
   * Insere ou atualiza individualmente uma estrutura no índice.
   * @param {Object} item - Estrutura normalizada sob o contrato canônico.
   */
  addEntry(item) {
    if (!item || !item.sid) return;

    this.entriesBySid.set(item.sid, item);

    // Termos que alimentam a busca
    const terms = [
      item.names?.pt,
      item.names?.en,
      item.names?.la,
      item.sid,
      item.system,
      item.systemLabel,
      ...(item.synonyms || [])
    ];

    for (let t = 0; t < terms.length; t++) {
      const rawTerm = terms[t];
      if (!rawTerm) continue;

      const tokens = tokenizeText(rawTerm);
      for (let k = 0; k < tokens.length; k++) {
        const token = tokens[k];
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token).add(item.sid);

        // Gera prefixos para permitir correspondência durante a digitação
        for (let len = 2; len < token.length; len++) {
          const prefix = token.slice(0, len);
          if (!this.invertedIndex.has(prefix)) {
            this.invertedIndex.set(prefix, new Set());
          }
          this.invertedIndex.get(prefix).add(item.sid);
        }
      }
    }
  }
  // [FIM MÉTODO: addEntry]

  // [INÍCIO MÉTODO: search]
  /**
   * Executa busca ponderada com pontuação semântica de relevância.
   * @param {string} query - Termo digitado pelo usuário.
   * @param {number} [limit=15] - Quantidade máxima de resultados.
   * @returns {Object[]} Lista de StructureEntry ordenada por pontuação.
   */
  search(query, limit = 15) {
    const normalizedQuery = normalizeSearchString(query);
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    const queryTokens = tokenizeText(normalizedQuery);
    if (queryTokens.length === 0) {
      return [];
    }

    /** @type {Map<string, number>} SID -> Pontuação */
    const scoreMap = new Map();

    for (let i = 0; i < queryTokens.length; i++) {
      const qToken = queryTokens[i];
      let matchedSids = this.invertedIndex.get(qToken);

      // Se não encontrou correspondência exata de prefixo ou token, tenta aproximação fonética (Levenshtein)
      if (!matchedSids && qToken.length >= 4) {
        for (let j = 0; j < this.allTokens.length; j++) {
          const indexedToken = this.allTokens[j];
          if (Math.abs(indexedToken.length - qToken.length) <= 1) {
            const dist = levenshteinDistance(qToken, indexedToken);
            if (dist <= 1) {
              matchedSids = this.invertedIndex.get(indexedToken);
              break;
            }
          }
        }
      }

      if (matchedSids) {
        matchedSids.forEach(sid => {
          const entry = this.entriesBySid.get(sid);
          if (!entry) return;

          let score = scoreMap.get(sid) || 0;
          const namePtNorm = normalizeSearchString(entry.names.pt);
          const nameEnNorm = normalizeSearchString(entry.names.en);

          // Ponderação de relevância:
          // 1. Igualdade exata no nome vernacular em português
          if (namePtNorm === normalizedQuery) {
            score += 150;
          }
          // 2. Início do nome vernacular coincide com a busca
          else if (namePtNorm.startsWith(normalizedQuery)) {
            score += 80;
          }
          // 3. Contém a busca dentro do nome em português
          else if (namePtNorm.includes(normalizedQuery)) {
            score += 40;
          }
          // 4. Correspondência no nome em inglês ou latim
          else if (nameEnNorm.includes(normalizedQuery)) {
            score += 20;
          }
          // 5. Correspondência por token isolado
          else {
            score += 10;
          }

          scoreMap.set(sid, score);
        });
      }
    }

    // Ordenação decrescente por relevância e extração de objetos
    return Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([sid]) => this.entriesBySid.get(sid))
      .filter(Boolean);
  }
  // [FIM MÉTODO: search]

  // [INÍCIO MÉTODO: getBySid]
  /**
   * Recupera a estrutura canônica pelo identificador único.
   * @param {string} sid
   * @returns {Object|null}
   */
  getBySid(sid) {
    if (!sid) return null;
    return this.entriesBySid.get(sanitizeString(sid)) || null;
  }
  // [FIM MÉTODO: getBySid]

  // [INÍCIO MÉTODO: size]
  /**
   * Retorna o total de estruturas catalogadas no índice.
   * @returns {number}
   */
  size() {
    return this.entriesBySid.size;
  }
  // [FIM MÉTODO: size]
}
