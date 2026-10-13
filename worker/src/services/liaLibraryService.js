/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liaLibraryService.js
 * Artigos da Biblioteca que a Lia cita na resposta (flag lia_library_enabled, que exige também library_enabled).
 *
 *   - Reaproveita a busca do catálogo (libraryService.searchForLia): só `publicado`, português primeiro, UMA
 *     consulta com LIMIT 3. Quem decide QUANDO buscar é assistant/libraryRefs.js (libraryPlan); aqui só se executa.
 *   - Sem resumo (nem de IA não revisado): a referência é id, título, autores resumidos, periódico, ano e o link
 *     oficial já validado (doi.org ou PubMed). Item com cara de instrução ao modelo sai (toReferences).
 *   - Cache no KV por consulta normalizada, por 10 minutos: com resultado, UMA gravação por consulta NOVA e nenhuma
 *     nas repetições; sem resultado não grava (o plano gratuito do KV aceita 1.000 gravações por dia e uma
 *     consulta aleatória de visitante não pode consumi-las). O conteúdo é o mesmo para qualquer pessoa (não há
 *     resumo), então a chave não leva papel nem pessoa.
 *   - Nunca lança: qualquer falha vira lista vazia e a Lia responde como sempre. Nada de pergunta em log.
 */
import { getCached, setCached } from '../cache.js';
import { searchNorm } from '../library/normalize.js';
import { LIBRARY_FLAGS } from '../library/limits.js';
import { cleanLibraryQuery, toReferences, referenceView, LIBRARY_REFS_MAX } from '../assistant/libraryRefs.js';
import { isEnabled } from './featureFlagService.js';
import { searchForLia } from './libraryService.js';
import { sha256Hex } from './ragService.js';

const FLAG_LIBRARY = LIBRARY_FLAGS.ENABLED;
const FLAG_LIA = LIBRARY_FLAGS.LIA_ENABLED;
const MIN_QUERY_CHARS = 2;
const KEY_PREFIX = 'cache:liab:';
export const CACHE_TTL_SECONDS = 600;

/** Falha fechada: sem saber o valor da flag, a Lia não cita artigos. */
async function flagOn(sql, identity, key) {
  try {
    return await isEnabled(sql, key, identity);
  } catch (err) {
    return false;
  }
}

/** Consulta normalizada como o search_norm da busca (caixa, acento e espaços não criam chaves novas). */
const cacheKeyFor = async (query) => KEY_PREFIX + (await sha256Hex(searchNorm({ title: query })));

const isReferenceList = (value) => Array.isArray(value) && value.every((r) => r && typeof r.title === 'string' && typeof r.url === 'string');

/**
 * Até 3 referências publicadas da Biblioteca para o tema, ou []. `identity` pode ser null (sem login): o
 * resultado é o mesmo catálogo público.
 * @returns {Promise<Array<{id, title, authors, journal, year, url}>>}
 */
export async function referencesFor(sql, env, identity, rawQuery) {
  try {
    const query = cleanLibraryQuery(rawQuery);
    if (query.length < MIN_QUERY_CHARS) return [];
    if (!(await flagOn(sql, identity, FLAG_LIBRARY)) || !(await flagOn(sql, identity, FLAG_LIA))) return [];
    const key = await cacheKeyFor(query);
    const cached = await getCached(env, key);
    if (isReferenceList(cached)) return cached.slice(0, LIBRARY_REFS_MAX).map(referenceView);
    const items = await searchForLia(sql, query, LIBRARY_REFS_MAX);
    const refs = toReferences(items, false).refs.map(referenceView);
    if (refs.length) await setCached(env, key, refs, CACHE_TTL_SECONDS);
    return refs;
  } catch (err) {
    return [];
  }
}
