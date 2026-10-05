/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/semanticCache.js
 * Cache de respostas da IA por SIMILARIDADE da pergunta (pg_trgm, sql/018):
 * "o que é um antídoto?" e "o que é antídoto" caem na mesma linha e não
 * gastam tokens de novo.
 *
 * A resposta guardada é lida por OUTRAS pessoas, então o cache é restrito:
 *  - só pergunta CURTA e conceitual (AI_CACHE.QUESTION_MAX; acima disso não é
 *    truncada, é recusada) — texto longo carrega dado pessoal ou instruções;
 *  - nada de instrução à IA ("responda que…", "ignore…"), marcador pessoal
 *    ("meu paciente…"), nome próprio, e-mail, telefone/documento ou link: a
 *    pergunta de quem pede não pode direcionar o que os outros vão ler;
 *  - similaridade por trigramas NÃO enxerga negação nem número ("é seguro" x
 *    "NÃO é seguro" dá 0,97; "24 horas" x "4 horas" dá 0,89). Por isso, depois
 *    da busca, o acerto só vale se os NÚMEROS, as NEGAÇÕES e os prefixos
 *    hipo/hiper/sub/super… forem os mesmos e o tamanho for parecido.
 * Validade curta (AI_CACHE.TTL_DAYS).
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
// Dois nomes próprios seguidos no meio da frase ("… do João Silva …").
const NAME_PAIR_RE = /\s[A-ZÀ-Ý][a-zà-ÿ]{2,}\s+[A-ZÀ-Ý][a-zà-ÿ]{2,}/;
// Pedidos à própria IA (sobre o texto já normalizado: minúsculo e sem acento).
const INSTRUCTION_RE = /\b(responda|responder|ignore|ignorar|desconsidere|esqueca|finja|fingir|obedeca|revele|prompt|instrucao|instrucoes|regras|jailbreak)\b|\b(aja|atue|haja) como\b|\bdiga que\b|\bmodo desenvolvedor\b/;
// Fala de uma pessoa/caso concreto, não de um conceito.
const PERSONAL_RE = /\b(meu|minha|meus|minhas|nosso|nossa|paciente|leito|prontuario)\b/;

const NEGATIONS = new Set(['nao', 'sem', 'nunca', 'jamais', 'nenhum', 'nenhuma', 'nem', 'exceto']);
const PREFIX_RE = /^(hipo|hiper|infra|supra|sub|super)[a-z]{3,}/;

/** Minúsculas, sem acento, só letras/números/espaço, espaços colapsados. */
export function normalizeQuestion(text) {
  return stripAccents(String(text === null || text === undefined ? '' : text))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto que parece conter dado pessoal (e-mail, telefone/documento, link). */
export function hasPii(text) {
  const s = String(text === null || text === undefined ? '' : text);
  return EMAIL_RE.test(s) || URL_RE.test(s) || LONG_NUMBER_RE.test(s);
}

/** Pode ir ao cache? Curta, conceitual e sem dado pessoal nem instrução (texto ORIGINAL e normalizado). */
export function isCacheable(rawQuestion) {
  const raw = String(rawQuestion === null || rawQuestion === undefined ? '' : rawQuestion);
  const norm = normalizeQuestion(raw);
  if (norm.length < AI_CACHE.QUESTION_MIN || norm.length > AI_CACHE.QUESTION_MAX) return false;
  if (hasPii(raw) || NAME_PAIR_RE.test(raw)) return false;
  return !INSTRUCTION_RE.test(norm) && !PERSONAL_RE.test(norm);
}

/** Números, negações e prefixos que mudam o SENTIDO da pergunta, em ordem estável. */
export function meaningSignature(norm) {
  return norm.split(' ')
    .filter((t) => /\d/.test(t) || NEGATIONS.has(t) || PREFIX_RE.test(t))
    .sort()
    .join(' ');
}

/** Duas perguntas parecidas por trigramas só valem como "a mesma" se o sentido e o tamanho batem. */
export function sameMeaning(a, b) {
  if (!a || !b) return false;
  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return ratio >= AI_CACHE.LENGTH_RATIO_MIN && meaningSignature(a) === meaningSignature(b);
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
    // `%` usa o índice GIN (limiar 0,3 do pg_trgm); o corte fino e as guardas de sentido são feitos aqui.
    const rows = await sql`
      SELECT id, answer, question_norm, similarity(question_norm, ${q}) AS sim
      FROM ai_semantic_cache
      WHERE feature = ${feature} AND question_norm % ${q} AND (expires_at > now() OR ${allowExpired})
      ORDER BY sim DESC
      LIMIT 5
    `;
    const best = (rows || []).find((r) => Number(r.sim) >= minSimilarity && sameMeaning(q, r.question_norm));
    if (!best) return null;
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
