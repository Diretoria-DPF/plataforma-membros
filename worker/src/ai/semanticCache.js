/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/semanticCache.js
 * Cache de respostas da IA por SIMILARIDADE da pergunta (pg_trgm, sql/018):
 * "o que é um antídoto?" e "o que é antídoto" caem na mesma linha e não
 * gastam tokens de novo. Só entra pergunta GENÉRICA — sem dado pessoal e sem
 * contexto de bancada/histórico (quem chama decide; hasPii é a rede de
 * segurança). Validade curta (AI_CACHE.TTL_DAYS).
 *
 * Toda operação é tolerante a falha: tabela ausente (018 não aplicada) ou
 * erro de banco viram "não achei" / "não guardei", nunca um erro para a pessoa.
 */
import { AI_CACHE } from '../constants.js';
import { stripAccents } from './validators.js';

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_RE = /https?:\/\/|www\./i;
// 8+ dígitos (telefone, CPF, RG, matrícula), com ou sem pontuação no meio.
const LONG_NUMBER_RE = /(?:\d[\s.\-()/]*){8,}/;

/** Minúsculas, sem acento, só letras/números/espaço, espaços colapsados. */
export function normalizeQuestion(text) {
  return stripAccents(String(text === null || text === undefined ? '' : text))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AI_CACHE.QUESTION_MAX);
}

/** Texto que parece conter dado pessoal (e-mail, telefone/documento, link). */
export function hasPii(text) {
  const s = String(text === null || text === undefined ? '' : text);
  return EMAIL_RE.test(s) || URL_RE.test(s) || LONG_NUMBER_RE.test(s);
}

/** Pode ir ao cache? Tamanho razoável e sem dado pessoal (conferido no texto ORIGINAL). */
export function isCacheable(rawQuestion) {
  const norm = normalizeQuestion(rawQuestion);
  return norm.length >= AI_CACHE.QUESTION_MIN && !hasPii(rawQuestion);
}

/**
 * Procura a resposta mais parecida. `minSimilarity` 0–1; `allowExpired`
 * aceita entrada vencida (último recurso quando o provedor está fora).
 * Devolve { id, answer, similarity } ou null.
 */
export async function lookup(sql, feature, rawQuestion, minSimilarity, options) {
  if (!isCacheable(rawQuestion)) return null;
  const q = normalizeQuestion(rawQuestion);
  const allowExpired = !!(options && options.allowExpired);
  try {
    // `%` usa o índice GIN (limiar 0,3 do pg_trgm); o corte fino é feito aqui.
    const rows = await sql`
      SELECT id, answer, similarity(question_norm, ${q}) AS sim
      FROM ai_semantic_cache
      WHERE feature = ${feature} AND question_norm % ${q} AND (expires_at > now() OR ${allowExpired})
      ORDER BY sim DESC
      LIMIT 1
    `;
    const best = rows && rows[0];
    if (!best || Number(best.sim) < minSimilarity) return null;
    await sql`UPDATE ai_semantic_cache SET hits = hits + 1, last_hit_at = now() WHERE id = ${best.id}::uuid`;
    return { id: best.id, answer: best.answer, similarity: Number(best.sim) };
  } catch (err) {
    return null;
  }
}

/** Guarda (ou renova) a resposta. Devolve true se gravou. */
export async function store(sql, feature, rawQuestion, answer) {
  if (!isCacheable(rawQuestion)) return false;
  const text = String(answer === null || answer === undefined ? '' : answer).trim();
  if (!text || text.length > AI_CACHE.ANSWER_MAX) return false;
  const q = normalizeQuestion(rawQuestion);
  try {
    await sql`
      INSERT INTO ai_semantic_cache (feature, question_norm, answer, expires_at)
      VALUES (${feature}, ${q}, ${text}, now() + make_interval(days => ${AI_CACHE.TTL_DAYS}))
      ON CONFLICT (feature, question_norm) DO UPDATE SET
        answer = EXCLUDED.answer, expires_at = EXCLUDED.expires_at, created_at = now()
    `;
    return true;
  } catch (err) {
    return false;
  }
}

/** Entradas válidas e acertos acumulados (painel admin). */
export async function stats(sql) {
  try {
    const rows = await sql`
      SELECT count(*)::int AS entries, coalesce(sum(hits), 0)::int AS hits
      FROM ai_semantic_cache WHERE expires_at > now()
    `;
    return { entries: Number(rows[0].entries) || 0, hits: Number(rows[0].hits) || 0 };
  } catch (err) {
    return { entries: 0, hits: 0 };
  }
}
