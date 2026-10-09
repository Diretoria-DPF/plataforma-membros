/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * researchService.js
 * "Pesquisar mais a fundo": a Lia busca referências numa base científica externa (v1: Europe PMC).
 * Atrás da flag research_enabled, desligada por padrão.
 *
 * Só termos gerais saem do servidor: buildQuery recusa o que tiver dado pessoal, instrução ou
 * texto longo (o mesmo filtro isCacheable do cache semântico). O registro (researchLogService,
 * provedor europepmc) guarda só metadados e link, por 7 dias. O texto da resposta é fixo.
 */
import { isCacheable, normalizeQuestion } from '../ai/semanticCache.js';
import { enforceRateLimit } from '../security.js';
import { isEnabled } from './featureFlagService.js';
import { lookup, record, sanitizeResults } from './researchLogService.js';
import { PROVIDERS } from '../research/scholarlyClient.js';
import * as Logging from '../logging.js';

const PROVIDER = 'europepmc';
const FLAG_KEY = 'research_enabled';
const RATE = { BUCKET: 'ASSISTANT_RESEARCH', MAX_ATTEMPTS: 10, WINDOW_SECONDS: 3600 };
const QUERY_TERMS_MAX = 8;
const QUERY_CHARS_MAX = 120;
const TERM_MIN_LENGTH = 3;
const ADVISORY = 'Referências de base externa; a Lia não resume artigos nem dá orientação de saúde.';
const MSG = {
  DISABLED: 'A pesquisa em bases científicas não está disponível agora.',
  ANONYMOUS: 'Entre na plataforma para pesquisar em bases científicas.',
  NO_TERMS: 'Escreva só o tema da pesquisa, em poucas palavras, sem nomes, e-mails, telefones ou links.',
  LIMITED: 'Você já fez muitas pesquisas em bases científicas nesta hora. Tente de novo mais tarde.',
  FAILED: 'Não consegui consultar a base de referências agora. Tente de novo em alguns minutos.',
};
// Palavras comuns do português, sem acento (normalizeQuestion tira os acentos). "não", "nem" e "sem" ficam de fora: mudam o sentido.
const STOPWORDS = new Set([
  'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas', 'pelo', 'pela', 'pelos', 'pelas', 'num', 'numa',
  'com', 'para', 'pra', 'por', 'sobre', 'entre', 'ate', 'desde', 'contra', 'apos',
  'que', 'qual', 'quais', 'como', 'quando', 'onde', 'porque', 'pois', 'mas', 'ou',
  'sao', 'foi', 'ser', 'ter', 'tem', 'estar', 'esta', 'este', 'isso', 'isto', 'esse', 'essa',
  'esses', 'essas', 'aquele', 'aquela', 'ele', 'ela', 'eles', 'elas', 'voce', 'voces',
  'mais', 'muito', 'muita', 'muitos', 'muitas', 'tambem', 'ainda', 'pode', 'podem', 'deve', 'devem',
  'fazer', 'faz', 'cada', 'todo', 'toda', 'todos', 'todas', 'alguns', 'algumas', 'outro', 'outra',
  'seu', 'sua', 'seus', 'suas', 'assim', 'aqui', 'entao', 'bem', 'mesmo', 'mesma',
]);

function isUsefulTerm(term, terms) {
  return term.length >= TERM_MIN_LENGTH && !STOPWORDS.has(term) && !terms.includes(term);
}

/**
 * Termos gerais da pergunta: sem stopwords, sem termo curto ou repetido, até 8 termos e 120 caracteres.
 * Devolve null (recusa) se a pergunta não passar em isCacheable ou se não sobrar nenhum termo.
 */
export function buildQuery(rawQuestion) {
  if (!isCacheable(rawQuestion)) return null;
  const terms = [];
  for (const term of normalizeQuestion(rawQuestion).split(' ')) {
    if (!isUsefulTerm(term, terms)) continue;
    const candidate = [...terms, term].join(' ');
    if (terms.length >= QUERY_TERMS_MAX || candidate.length > QUERY_CHARS_MAX) break;
    terms.push(term);
  }
  return terms.length > 0 ? terms.join(' ') : null;
}

async function isResearchEnabled(sql, identity) {
  try {
    return (await isEnabled(sql, FLAG_KEY, identity)) === true;
  } catch (err) {
    return false;
  }
}

async function isWithinResearchLimit(sql, identity) {
  try {
    await enforceRateLimit(sql, RATE.BUCKET, identity.profileId, RATE.MAX_ATTEMPTS, RATE.WINDOW_SECONDS);
    return true;
  } catch (err) {
    if (err && err.name === 'RateLimitError') return false;
    throw err;
  }
}

function replyText(count, failed) {
  if (failed) return MSG.FAILED;
  const found = count === 1 ? 'Encontrei 1 referência em base externa.' : 'Encontrei ' + count + ' referências em base externa.';
  const none = 'Não encontrei referências sobre esse tema em base externa.';
  return (count === 0 ? none : found) + ' ' + ADVISORY;
}

/** Monta o retorno do contrato (L08 e L09). Os itens passam por sanitizeResults, inclusive os do cache. */
function answer(query, results, state) {
  const clean = sanitizeResults(PROVIDER, results);
  return {
    success: true,
    source: 'research',
    reply: replyText(clean.items.length, state.failed),
    actions: [],
    suggestions: [],
    research: { provider: PROVIDER, query, cached: state.cached, failed: state.failed, items: clean.items },
  };
}

function shortMessage(err) {
  return String(err && err.message ? err.message : 'erro').slice(0, 120);
}

/** Busca na base externa, registra o resultado (answered ou empty) e devolve a resposta. Falha não é registrada. */
async function searchAndRecord(sql, query, correlationId) {
  let found;
  try {
    found = await PROVIDERS[PROVIDER](query);
  } catch (err) {
    await Logging.logError(sql, correlationId, 'ASSISTANT_RESEARCH_FAILED', 'Falha na base externa (' + PROVIDER + '): ' + shortMessage(err), null);
    return answer(query, { items: [] }, { cached: false, failed: true });
  }
  const results = sanitizeResults(PROVIDER, found);
  await record(sql, {
    provider: PROVIDER,
    question: query,
    outcome: results.items.length > 0 ? 'answered' : 'empty',
    results,
  });
  return answer(query, results, { cached: false, failed: false });
}

/**
 * Pesquisa externa para quem pediu "pesquisar mais a fundo". `env` fica reservado (a v1 não lê dele).
 * Ordem: flag (falha fechada), identidade, termos, registro (sem gastar limite), limite, rede, registro.
 */
export async function research(sql, env, identity, rawQuestion, correlationId) {
  if (!(await isResearchEnabled(sql, identity))) return { success: false, disabled: true, message: MSG.DISABLED };
  if (!identity) return { success: false, message: MSG.ANONYMOUS };
  const query = buildQuery(rawQuestion);
  if (!query) return { success: false, message: MSG.NO_TERMS };
  const cached = await lookup(sql, { provider: PROVIDER, question: query });
  if (cached) return answer(query, cached.results, { cached: true, failed: false });
  if (!(await isWithinResearchLimit(sql, identity))) return { success: false, limited: true, message: MSG.LIMITED };
  return searchAndRecord(sql, query, correlationId);
}
