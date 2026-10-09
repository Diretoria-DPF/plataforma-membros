/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * rerankService.js
 * Camada de seleção da Lia (L05): reordena os candidatos da fusão RRF com um reranker,
 * dá uma nota a cada trecho e decide `answerable` ("há trecho bom o bastante?").
 * Assim a Lia corta a busca antes do LLM quando a base não cobre a pergunta.
 *
 * Neutra de provedor: hoje só 'workers-ai' (@cf/baai/bge-reranker-base, o mesmo operador
 * do embedding). Qualquer outro provedor cai na degradação. Só roda com rag_rerank_enabled
 * ligada (L09 liga por opts.rerank).
 *
 * Degradação: sem binding AI, tempo esgotado, saída malformada, id fora do intervalo ou
 * falha do modelo devolvem a ordem original cortada em TOP_K, com answerable: true e
 * `error` curto (motivo fixo, sem texto da pergunta).
 *
 * Nada aqui recebe dado de pessoa: a entrada é a pergunta normalizada e o texto da base.
 */

// null = sem calibração: não corta. Calibrar no staging com o golden set antes de ligar
// rag_rerank_enabled (docs/lia/pesquisa/SELECAO.md, seção 4). Não ativar sem o OK do dono (O36).
export const RERANK = {
  MODEL: '@cf/baai/bge-reranker-base',
  TIMEOUT_MS: 3000,
  TOP_K: 4,
  MIN_SCORE: null,       // nota mínima (sigmoid) de cada trecho
  ANSWERABLE_MIN: null,  // nota mínima (sigmoid) do melhor trecho para answerable
};

const PROVIDER_WORKERS_AI = 'workers-ai';

const REASON = {
  NO_BINDING: 'binding AI ausente',
  TIMEOUT: 'tempo esgotado',
  MALFORMED: 'saída malformada',
  BAD_ID: 'id fora do intervalo',
  MODEL: 'falha do modelo',
  PROVIDER: 'provedor indisponível',
};

class RerankError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const pick = (value, fallback) => (value === undefined ? fallback : value);

/** Mapeia a nota bruta do modelo para (0, 1): é a escala em que os limiares são comparados. */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function degraded(chunks, reason) {
  return { chunks: chunks.slice(0, RERANK.TOP_K), answerable: true, provider: null, error: reason };
}

async function runModel(env, query, chunks) {
  if (!env || !env.AI || typeof env.AI.run !== 'function') throw new RerankError(REASON.NO_BINDING);
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new RerankError(REASON.TIMEOUT)), RERANK.TIMEOUT_MS);
  });
  const input = { query, contexts: chunks.map((chunk) => ({ text: chunk.content })) };
  try {
    return await Promise.race([env.AI.run(RERANK.MODEL, input), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Lê a nota de cada contexto (o id é o índice em `contexts`). Exige exatamente um item por trecho. */
function readScores(out, count) {
  const list = out && Array.isArray(out.response) ? out.response : null;
  if (!list || list.length !== count) throw new RerankError(REASON.MALFORMED);
  const scores = new Array(count).fill(null);
  list.forEach((item) => {
    if (!item || !Number.isInteger(item.id) || !Number.isFinite(item.score)) throw new RerankError(REASON.MALFORMED);
    if (item.id < 0 || item.id >= count) throw new RerankError(REASON.BAD_ID);
    scores[item.id] = item.score;
  });
  if (scores.includes(null)) throw new RerankError(REASON.MALFORMED);
  return scores;
}

/** Ordena por nota decrescente (sem mexer na entrada), aplica os limiares e corta em TOP_K. */
function rankChunks(out, chunks, opts) {
  const raw = readScores(out, chunks.length);
  const ranked = chunks
    .map((chunk, index) => Object.assign({}, chunk, { rerankScore: sigmoid(raw[index]) }))
    .sort((a, b) => b.rerankScore - a.rerankScore);
  const minScore = pick(opts.minScore, RERANK.MIN_SCORE);
  const answerableMin = pick(opts.answerableMin, RERANK.ANSWERABLE_MIN);
  const passing = minScore === null ? ranked : ranked.filter((chunk) => chunk.rerankScore >= minScore);
  const kept = passing.slice(0, RERANK.TOP_K);
  const answerable = kept.length > 0 && (answerableMin === null || ranked[0].rerankScore >= answerableMin);
  return { chunks: kept, answerable, provider: PROVIDER_WORKERS_AI, error: null };
}

/**
 * Reordena `chunks` (candidatos da fusão, já em ordem) pela nota do reranker.
 * Devolve { chunks, answerable, provider, error }; `provider` é null quando o modelo não deu nota.
 * opts (injetáveis para teste; sem eles valem os de RERANK): provider (só 'workers-ai'),
 * minScore e answerableMin.
 */
export async function rerank(env, query, chunks, opts = {}) {
  if (pick(opts.provider, PROVIDER_WORKERS_AI) !== PROVIDER_WORKERS_AI) return degraded(chunks, REASON.PROVIDER);
  if (chunks.length === 0) return { chunks: [], answerable: false, provider: null, error: null };
  try {
    return rankChunks(await runModel(env, query, chunks), chunks, opts);
  } catch (err) {
    return degraded(chunks, err instanceof RerankError ? err.reason : REASON.MODEL);
  }
}
