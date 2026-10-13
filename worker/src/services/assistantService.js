/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistantService.js
 * Lia, a guia da plataforma. Orienta e leva até a tela certa; NUNCA altera dados.
 *
 * Camadas, da mais barata para a mais cara (a IA só entra no fim):
 *   1. flag chatbot_enabled (botão de emergência; falha fechada);
 *   2. validação, limite por hora (pessoa ou IP) e filtro de injeção de prompt;
 *   3. intenção por regra (assistant/kb.js): sem IA, sem cota;
 *   4. dado vivo SÓ DE LEITURA e só do que a própria pessoa já pode ver (eventos);
 *   5. IA (Orchestrator.complete) apenas para quem está logado, tem cota e fez uma
 *      pergunta sem intenção; o prompt não leva nome, e-mail nem dado pessoal;
 *      com rag_enabled, os trechos do acervo (ragService) entram como DADO não confiável;
 *   6. base fixa (kb.js) quando não há IA, cota, provedor ou trechos; resposta degradada e honesta.
 *
 * Os botões (actions) saem SEMPRE da base fixa e passam pela lista branca por
 * papel (assistant/targets.js); texto vindo da IA nunca vira botão.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import * as Groq from '../ai/groqClient.js';
import * as Orchestrator from '../ai/orchestrator.js';
import * as EventService from './eventService.js';
import { isEnabled } from './featureFlagService.js';
import { asObject, withQuota, refundQuota, quotaLimit, getMyQuota } from './aiService.js';
import { AiInvalidOutputError, AI_MESSAGES } from '../ai/errors.js';
import { buildAssistantMessages } from '../ai/prompts.js';
import { cleanText, cleanReply, sanitizeHistory } from '../ai/validators.js';
import { matchIntent, normalize, DEFAULT_SUGGESTIONS, suggestionsForVisitor } from '../assistant/kb.js';
import { filterActions, libraryAction, LIBRARY_TARGET_KEYS, MAX_ACTIONS } from '../assistant/targets.js';
import { libraryPlan } from '../assistant/libraryRefs.js';
import * as LiaLibrary from './liaLibraryService.js';
import * as Rag from './ragService.js';
import * as ResearchLog from './researchLogService.js';
import * as ResearchService from './researchService.js';
import { isCacheable, normalizeQuestion } from '../ai/semanticCache.js';
import { moderationGate } from '../assistant/moderationGate.js';
import { questionKind, allowIntent, CLINICAL_REPLY } from '../assistant/questionKind.js';
import { withCitations } from '../assistant/citations.js';
import { extractiveAnswer, sourceEntry, NO_MATCH_REPLY, NO_MATCH_SUGGESTIONS } from '../assistant/extractive.js';
import { publicPathFor } from '../assistant/publicLinks.js';
import * as TreeSelect from './treeSelectService.js';
import * as VisitorAi from './visitorAiService.js';
import { looksLikeInjection, withoutOffensiveTurns } from '../assistant/moderationRules.js';

// O filtro de injeção mora em assistant/moderationRules.js (compartilhado com a redenção, sem import
// circular); segue exportado daqui para quem já o importa deste módulo.
export { looksLikeInjection };

const FLAG_CHATBOT = 'chatbot_enabled';
const FLAG_RAG = 'rag_enabled';
const FLAG_CACHE = 'rag_cache_enabled';
const FLAG_RERANK = 'rag_rerank_enabled';
const FLAG_RESEARCH = 'research_enabled';
const FLAG_LIBRARY = 'library_enabled';
const FLAG_HIBRIDA = 'lia_hibrida_enabled';
const FLAG_VISITOR_AI = 'lia_visitor_ai_enabled';
const KB_PROVIDER = 'kb';
const NO_INDEX = 'sem-indice'; // versão quando o índice não pode ser lido: o registro não é usado nem gravado
const INDEX_TTL_MS = 60 * 1000;
const KB_VERSION_LEN = 16;
const RERANK_SUFFIX = ':r';
const HIBRIDA_SUFFIX = ':h';
const ANSWER_MAX = 4000; // limite de assistant_messages.answer (sql/021)
const EVENTS_SHOWN = 3;
const EVENT_TITLE_MAX = 80;
const EVENT_PLACE_MAX = 60;
const RETRIEVAL_QUERY_MAX = 300; // mesmo teto de ragService (QUERY_MAX); a pergunta atual cabe inteira

const MSG_DISABLED = 'A Lia está indisponível no momento. Tente novamente mais tarde.';
const MSG_REFUSAL = 'Não posso seguir esse tipo de instrução, mas posso te ajudar a usar a plataforma: eventos, módulos de estudo, seu crachá e seu perfil.';
const MSG_FALLBACK = 'Ainda não sei responder isso por aqui. Posso te ajudar com eventos, módulos de estudo (laboratório, atlas 3D, quiz, casos clínicos), seu crachá e seu perfil. Escolha uma opção ou pergunte de outro jeito.';
const MSG_AI_DOWN = 'A IA está indisponível agora, então respondo só com o que já sei: eventos, módulos de estudo, seu crachá e seu perfil. Escolha uma opção ou tente de novo mais tarde.';
const MSG_QUOTA = 'Você atingiu o limite diário de perguntas que usam IA; ele volta amanhã. Enquanto isso, posso te ajudar com eventos, módulos de estudo, seu crachá e seu perfil.';
const MSG_KB_FAILED = 'Não consegui consultar a base de conhecimento agora, então não tenho como responder a isso com segurança. ';
const MSG_KB_EMPTY = 'Não encontrei essa informação na base de conhecimento da plataforma, então prefiro não chutar. ';
const MSG_KB_NO_REPLY = 'Não consegui montar uma resposta a partir da base agora, então prefiro não chutar. ';
const MSG_KB_HELP = 'Posso te ajudar com eventos, módulos de estudo (laboratório, atlas 3D, quiz, casos clínicos), seu crachá e seu perfil.';

const EVENT_DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** "sex 16/10 às 19:00" (horário de Brasília), montado por partes: o texto do ICU varia entre versões. */
function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = {};
  EVENT_DATE_FORMAT.formatToParts(date).forEach((part) => { p[part.type] = part.value; });
  return p.weekday.replace('.', '') + ' ' + p.day + '/' + p.month + ' às ' + p.hour + ':' + p.minute;
}

function describeEvent(event, identity) {
  const parts = [cleanText(event.title, EVENT_TITLE_MAX) || 'Evento'];
  const when = formatEventDate(event.eventDate);
  if (when) parts.push(when);
  const place = cleanText(event.location, EVENT_PLACE_MAX);
  if (place) parts.push(place);
  if (typeof event.spotsLeft === 'number') parts.push(event.spotsLeft + (event.spotsLeft === 1 ? ' vaga' : ' vagas'));
  if (identity && event.isRegistered) parts.push('você já está inscrito(a)');
  return '• ' + parts.join(' · ');
}

/** Lê os eventos com a identidade da PRÓPRIA sessão (ou nenhuma). Devolve o texto, ou null se não deu. */
async function liveEventsReply(sql, env, identity, correlationId) {
  try {
    const out = await EventService.listEvents(sql, env, identity);
    const events = (out && Array.isArray(out.events) ? out.events : []).slice(0, EVENTS_SHOWN);
    if (!events.length) return 'No momento não há eventos abertos. Novos eventos aparecem na aba Eventos.';
    const lines = events.map((e) => describeEvent(e, identity));
    const tail = identity ? ' Para se inscrever, abra a aba Eventos.' : ' Entre na plataforma para ver todos e se inscrever.';
    return 'Eventos abertos agora:\n' + lines.join('\n') + '\n' + tail.trim();
  } catch (err) {
    await Logging.logError(sql, correlationId, 'ASSISTANT_EVENTS_FAILED', String((err && err.message) || err), null);
    return null;
  }
}

const answer = (fields) => Object.assign({ success: true, actions: [], suggestions: DEFAULT_SUGGESTIONS.slice(0, 3) }, fields);

function fromIntent(hit, role, reply, source) {
  return answer({
    reply,
    source,
    actions: filterActions(hit.intent.actions, role),
    suggestions: (hit.intent.suggestions || []).slice(0, 3),
  });
}

/** Tira os botões que levam à Biblioteca quando a flag dela está desligada. */
function withLibraryActions(reply, libraryOn) {
  if (libraryOn) return reply;
  const blocked = new Set(LIBRARY_TARGET_KEYS);
  return Object.assign({}, reply, { actions: reply.actions.filter((a) => !blocked.has(a.type + ':' + a.target)) });
}

async function flagOn(sql, identity, key = FLAG_CHATBOT) {
  try {
    return await isEnabled(sql, key, identity);
  } catch (err) {
    return false; // falha fechada: sem saber, a Lia fica desligada
  }
}

async function enforceChatLimit(sql, env, identity) {
  const limits = C.RATE_LIMITS;
  if (identity) {
    const l = limits.ASSISTANT_CHAT;
    return S.enforceRateLimit(sql, 'ASSISTANT_CHAT', identity.profileId, l.MAX_ATTEMPTS, l.WINDOW_SECONDS);
  }
  const l = limits.ASSISTANT_CHAT_IP;
  return S.enforceRateLimit(sql, 'ASSISTANT_CHAT_IP', env.clientIp || 'unknown', l.MAX_ATTEMPTS, l.WINDOW_SECONDS);
}

/**
 * Pergunta sem intenção: IA para quem pode usar; senão, a base fixa. Com trechos (`context`), uma saída
 * vazia da IA devolve result null: quem chama responde pela base estática (answerFromKnowledge).
 * `refine` (Lia híbrida) é chamada DENTRO da unidade de cota, com os trechos, e devolve { chunks, answerable }:
 * assim uma pergunta continua gastando uma unidade, mesmo com a chamada extra de escolha de seções.
 * Devolve { result, context }: `context` é a lista de trechos que de fato foi para o prompt (a numeração [n]).
 */
async function askAiCore(sql, env, identity, message, history, context = null, refine = null) {
  const role = identity ? identity.role : null;
  const done = (result, used = context) => ({ result, context: used });
  if (!canUseAi(identity, env)) return done(answer({ reply: MSG_FALLBACK, source: 'fallback' }));

  // Pergunta GENÉRICA (sem histórico) de MEMBRO pode vir do cache semântico: não chama a IA e não gasta
  // cota. Só membro guarda e lê: a resposta depende do papel (o prompt cita o papel), e uma resposta
  // gerada para admin nunca pode ser servida a outra pessoa. Com trechos do acervo a resposta depende
  // deles, então não lê nem grava o cache genérico.
  const generic = !context && history.length === 0 && role === C.ROLES.MEMBER;
  if (generic) {
    const hit = await Orchestrator.lookupCache(sql, env, identity, C.AI_FEATURE.ASSISTANT, message);
    if (hit) return done(answer({ reply: cleanReply(hit.answer, C.AI_LIMITS.REPLY_MAX), source: 'ai', cached: true }));
  }

  let used = context;
  let outcome;
  try {
    outcome = await withQuota(sql, identity, C.AI_FEATURE.ASSISTANT, async () => {
      const refined = refine ? await refine(context) : null;
      if (refined && refined.answerable === false) {
        used = [];
        return staticKbFallback(MSG_KB_EMPTY);
      }
      if (refined) used = refined.chunks;
      const messages = buildAssistantMessages({ question: message, history, role, context: used });
      // smartWhenRoom: a Lia do membro sobe para o modelo inteligente quando há folga de tokens (ai/orchestrator.js).
      const out = await Orchestrator.complete(
        sql, env, identity,
        { feature: C.AI_FEATURE.ASSISTANT, messages, profileId: identity.profileId },
        { cacheQuestion: generic ? message : null, smartWhenRoom: true }
      );
      const reply = cleanReply(out.content, C.AI_LIMITS.REPLY_MAX);
      if (!reply) throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
      if (out.degraded) await refundQuota(sql, identity, C.AI_FEATURE.ASSISTANT);
      return answer({ reply, source: 'ai', cached: !!out.cached, ...(out.degraded ? { degraded: true } : {}) });
    });
  } catch (err) {
    // IA fora, orçamento do dia ou resposta vazia: a Lia continua útil com a base fixa.
    if (isEmptyOutput(err) && context) return done(null);
    if (err && (err.aiUnavailable || isEmptyOutput(err))) return done(answer({ reply: MSG_AI_DOWN, source: 'fallback' }));
    throw err;
  }
  if (outcome && outcome.quotaExceeded) return done(answer({ reply: MSG_QUOTA, source: 'fallback', quotaExceeded: true }));
  return done(outcome, used);
}

/** askAiCore sem a lista de trechos: o formato de sempre (a resposta, ou null). */
async function askAi(sql, env, identity, message, history, context = null) {
  return (await askAiCore(sql, env, identity, message, history, context)).result;
}

function isEmptyOutput(err) {
  return !!err && (!!err.aiInvalidOutput || err.name === 'AiInvalidOutputError');
}

/** Resposta que não veio da IA sai sempre marcada como degradada. */
function asDegradedIfNotAi(result) {
  return result.source === 'ai' ? result : Object.assign({}, result, { degraded: true });
}

/** Cota da Lia ainda livre para a pessoa? Só lê: não consome cota nem chama a IA. */
async function hasAiQuota(sql, env, identity) {
  const { quotas } = await getMyQuota(sql, env, identity);
  return quotas.assistant.remaining > 0;
}

/**
 * Consulta da busca: a pergunta atual vem primeiro (o ragService corta no fim, então ela nunca some) e
 * depois a última pergunta da própria pessoa, para que "e no sábado?" ache o assunto anterior.
 */
function retrievalQuery(message, history) {
  const current = message.slice(0, RETRIEVAL_QUERY_MAX);
  const previous = history.filter((t) => t.role === 'user').pop();
  const room = RETRIEVAL_QUERY_MAX - current.length - 1;
  return previous && room > 0 ? current + ' ' + previous.text.slice(0, room) : current;
}

/** Pode usar a IA nesta pergunta: pessoa logada, com cota no papel e chave configurada. */
function canUseAi(identity, env) {
  return !!identity && quotaLimit(identity.role, C.AI_FEATURE.ASSISTANT) > 0 && Groq.parseKeys(env).length > 0;
}

/**
 * Busca os trechos do acervo. Nunca lança: falha vira { failed: true }. Trecho com cara de instrução sai.
 * Com rerank (rag_rerank_enabled), answerable === false quer dizer que nenhum trecho cobre a pergunta.
 * `limit` (Lia híbrida) pede mais candidatos que o TOP_K, para a escolha de seções.
 */
async function retrieveContext(sql, env, query, correlationId, rerank = false, limit = undefined) {
  let found;
  try {
    found = await Rag.retrieve(sql, env, query, { rerank, limit });
  } catch (err) {
    await Logging.logError(sql, correlationId, 'ASSISTANT_RAG_FAILED', String((err && err.message) || err), null);
    return { chunks: [], failed: true, degraded: false };
  }
  // Embedding caiu: a busca seguiu só com trigramas. Registra o fato, sem a pergunta nem o trecho.
  const degraded = !!found.embeddingError;
  if (degraded) await Logging.logError(sql, correlationId, 'ASSISTANT_RAG_EMBEDDING_FAILED', 'Embedding indisponível: busca só por trigramas.', null);
  const usable = found.answerable === false ? [] : found.chunks;
  const chunks = usable.filter((c) => !looksLikeInjection(c.content));
  if (chunks.length < usable.length) {
    await Logging.logAudit(sql, correlationId, null, 'ASSISTANT_RAG_CHUNK_SUPPRESSED', 'assistant', null, 'failure', { dropped: usable.length - chunks.length });
  }
  const trimmed = chunks.map((c) => ({ source: c.source, section: c.section, content: String(c.content).slice(0, C.RAG.CONTEXT_CHARS) }));
  return { chunks: trimmed, failed: false, degraded };
}

/** Último degrau da cadeia: a base estática (kb.js) responde com honestidade que não tem essa informação agora. */
function staticKbFallback(lead) {
  return answer({ reply: lead + MSG_KB_HELP, source: 'kb', degraded: true });
}

/** Só membro, sem histórico e pergunta cacheável usa o registro (L04). Admin depende do papel: fica de fora. */
function usesResearchLog(identity, message, history) {
  return !!identity && identity.role === C.ROLES.MEMBER && history.length === 0 && isCacheable(message);
}

/**
 * Lê o índice que a busca usa (kb_chunks): hash do conteúdo, na ordem source/section. Tabela vazia = empty.
 * Falha de leitura é logada e devolve hash null: a resposta segue, sem registro.
 */
async function readIndex(sql, correlationId) {
  try {
    const rows = await sql`SELECT content_hash FROM kb_chunks ORDER BY source, section`;
    const hashes = (Array.isArray(rows) ? rows : []).map((r) => String(r.content_hash ?? ''));
    if (!hashes.length) return { empty: true, hash: null };
    return { empty: false, hash: (await Rag.sha256Hex(hashes.join(','))).slice(0, KB_VERSION_LEN) };
  } catch (err) {
    await Logging.logError(sql, correlationId, 'ASSISTANT_KB_INDEX_FAILED', String((err && err.message) || err), null);
    return { empty: false, hash: null };
  }
}

let indexMemo = null;

/** Índice lido no máximo a cada 60 s por isolate (uma falha também fica esse prazo: não repete a consulta a cada pergunta). */
async function kbIndex(sql, correlationId) {
  const now = Date.now();
  if (indexMemo === null || now - indexMemo.at >= INDEX_TTL_MS) indexMemo = Object.assign(await readIndex(sql, correlationId), { at: now });
  return indexMemo;
}

/** Só para testes: esquece a leitura do índice. */
export function __resetKbIndexForTests() {
  indexMemo = null;
}

/**
 * Versão do registro: hash do conteúdo que a busca usa; com o reranker ligado, ':r' (trocar o reranker invalida);
 * com a Lia híbrida, ':h' (a escolha de seções muda o que é lido, então o registro antigo não vale).
 */
function versionOf(index, rerank, hybrid = false) {
  if (index.empty || !index.hash) return NO_INDEX;
  return index.hash + (rerank ? RERANK_SUFFIX : '') + (hybrid ? HIBRIDA_SUFFIX : '');
}

/** Resposta já registrada para esta pergunta e versão: sem IA, sem cota e sem busca. */
async function fromResearchLog(sql, message, version, hybrid = false) {
  const hit = await ResearchLog.lookup(sql, { provider: KB_PROVIDER, question: message, kbVersion: version });
  if (!hit) return null;
  if (hit.outcome === 'empty') return staticKbFallback(MSG_KB_EMPTY);
  // O registro guarda só origem e seção; na Lia híbrida a fonte volta com o link da página pública (allowlist), como na resposta nova.
  const sources = hybrid ? hit.results.sources.map((s) => sourceEntry(s.source, s.section)) : hit.results.sources;
  return answer({ reply: hit.results.reply, sources, source: 'ai', cached: true });
}

/** Grava o desfecho da pergunta: 'answered' (resposta e fontes) ou 'empty' (lacuna da base). Não derruba a resposta. */
async function logKbOutcome(sql, message, version, outcome, results) {
  await ResearchLog.record(sql, { provider: KB_PROVIDER, question: message, kbVersion: version, outcome, results });
}

/**
 * Trechos viram DADO para a IA. A cota é conferida ANTES da busca (sem cota não há embedding nem consulta).
 * Sem trechos, ou com saída vazia da IA, a base estática responde; IA fora ou cota do dia dão resposta fixa.
 * Sem NENHUM trecho indexado (tabela vazia), a IA responde sem RAG, antes de qualquer embedding ou consulta.
 * `flags` = { cache, rerank }, lidas por answerWithKnowledge.
 */
async function answerFromKnowledge(sql, env, identity, message, history, correlationId, flags) {
  const index = await kbIndex(sql, correlationId);
  const version = versionOf(index, flags.rerank, flags.hybrid);
  const logOn = !!flags.cache && version !== NO_INDEX && usesResearchLog(identity, message, history);
  if (logOn) {
    const logged = await fromResearchLog(sql, message, version, !!flags.hybrid);
    if (logged) return logged;
  }
  if (!(await hasAiQuota(sql, env, identity))) return asDegradedIfNotAi(await askAi(sql, env, identity, message, history));
  if (index.empty) return asDegradedIfNotAi(await askAi(sql, env, identity, message, history));
  const found = await retrieveContext(sql, env, retrievalQuery(message, history), correlationId, !!flags.rerank, flags.hybrid ? C.TREE.CANDIDATES : undefined);
  if (!found.chunks.length) {
    if (found.failed) return staticKbFallback(MSG_KB_FAILED);
    if (logOn) await logKbOutcome(sql, message, version, 'empty', {});
    return staticKbFallback(MSG_KB_EMPTY);
  }
  // Lia híbrida: UMA chamada curta escolhe, na árvore de seções, o que a resposta lê (dentro da mesma unidade de cota).
  const refine = flags.hybrid
    ? (candidates) => TreeSelect.refineContext(sql, env, identity, { question: message, candidates, correlationId })
    : null;
  const { result, context } = await askAiCore(sql, env, identity, message, history, found.chunks, refine);
  if (result === null) return staticKbFallback(MSG_KB_NO_REPLY);
  const out = result.source === 'ai' ? withCitations(result, context, { withUrl: !!flags.hybrid }) : asDegradedIfNotAi(result);
  const final = found.degraded ? Object.assign({}, out, { degraded: true }) : out;
  if (logOn && final.source === 'ai' && !final.degraded && final.sources.length) {
    await logKbOutcome(sql, message, version, 'answered', { reply: final.reply, sources: final.sources });
  }
  return final;
}

/**
 * Grava o mínimo (ADR 0005, sql/021): hash da pergunta normalizada, nunca o texto, e a resposta.
 * Devolve messageId para a avaliação. Anônimo não grava (profile_id é obrigatório). Não derruba a resposta.
 */
async function recordAnswer(sql, identity, message, result, correlationId) {
  const shaped = Object.assign({ sources: [], messageId: null }, result);
  if (!identity) return shaped;
  try {
    const questionHash = await Rag.sha256Hex(identity.profileId + ':' + normalizeQuestion(message));
    const rows = await sql`
      INSERT INTO assistant_messages (profile_id, question_hash, source, answer, sources, degraded)
      VALUES (${identity.profileId}::uuid, ${questionHash}, ${shaped.source}, ${String(shaped.reply).slice(0, ANSWER_MAX)}, ${JSON.stringify(shaped.sources)}::jsonb, ${!!shaped.degraded})
      RETURNING id`;
    return Object.assign({}, shaped, { messageId: rows && rows[0] ? rows[0].id : null });
  } catch (err) {
    await Logging.logError(sql, correlationId, 'ASSISTANT_MESSAGE_SAVE_FAILED', String((err && err.message) || err), null);
    return shaped;
  }
}

/** Quem não tem direito à IA (sem login ou papel com cota 0): na Lia híbrida recebe o trecho do acervo. */
function lacksAiRight(identity) {
  return !identity || quotaLimit(identity.role, C.AI_FEATURE.ASSISTANT) <= 0;
}

/** Convite para criar conta: só para quem ainda não tem conta (sem login). */
function withInvite(result, identity) {
  return identity ? result : Object.assign({}, result, { cta: { text: C.LIA_VISITOR.CTA_TEXT, url: C.LIA_VISITOR.CTA_URL } });
}

const isLibraryChunk = (chunk) => publicPathFor(chunk.source, chunk.section) === '/biblioteca';

/** Resposta da prévia de IA (ou do cache compartilhado): a pessoa vê que é uma prévia e o convite. */
function previewAnswer(generated, cached) {
  const base = answer({ reply: generated.reply, source: 'ai', sources: generated.sources, preview: true, cta: { text: C.LIA_VISITOR.CTA_TEXT, url: C.LIA_VISITOR.CTA_URL } });
  return cached ? Object.assign({}, base, { cached: true }) : base;
}

/** Acerto no cache compartilhado dos visitantes (custo zero: não gasta limite por IP nem neurons). */
async function cachedPreview(sql, env, message, correlationId) {
  const index = await kbIndex(sql, correlationId);
  const version = versionOf(index, false);
  const key = version === NO_INDEX ? null : await VisitorAi.cacheKeyFor(version, message);
  const hit = await VisitorAi.readCachedPreview(env, key);
  return { key, hit };
}

/**
 * Lia híbrida para quem não usa IA da conta. Degraus, do melhor ao mais simples, sem nunca mostrar erro técnico:
 * cache compartilhado -> prévia de IA (Workers AI; flag lia_visitor_ai_enabled, limite por IP, Turnstile e
 * teto de neurons) -> trecho EXTRATIVO do acervo -> convite com temas. Não usa Groq, orquestrador nem cota.
 */
async function answerForVisitor(sql, env, identity, ctx) {
  const { message, history, correlationId, mode } = ctx;
  const previewOn = !identity && mode.visitorAi && history.length === 0 && VisitorAi.previewConfigured(env);
  const cache = previewOn ? await cachedPreview(sql, env, message, correlationId) : { key: null, hit: null };
  if (cache.hit) return previewAnswer(cache.hit, true);

  const found = await retrieveContext(sql, env, retrievalQuery(message, history), correlationId, false);
  if (found.failed) return withInvite(staticKbFallback(MSG_KB_FAILED), identity);
  const usable = mode.libraryOn ? found.chunks : found.chunks.filter((c) => !isLibraryChunk(c));
  const degraded = found.degraded ? { degraded: true } : {};
  if (!usable.length) {
    return withInvite(answer({ reply: NO_MATCH_REPLY, source: 'kb', sources: [], suggestions: NO_MATCH_SUGGESTIONS.slice(), ...degraded }), identity);
  }
  const generated = previewOn
    ? await VisitorAi.generatePreview(sql, env, { message, chunks: usable, ip: env.clientIp, turnstileToken: mode.turnstileToken, cacheKey: cache.key, degraded: !!found.degraded })
    : null;
  if (generated) return previewAnswer(generated, false);
  return withInvite(answer({ ...extractiveAnswer(usable[0]), source: 'kb', ...degraded }), identity);
}

/** Pergunta sem intenção por regra. Com rag_enabled desligada, é exatamente o comportamento anterior. */
async function answerWithKnowledge(sql, env, identity, ctx) {
  const { message, history, correlationId, mode } = ctx;
  if (!(await flagOn(sql, identity, FLAG_RAG))) return askAi(sql, env, identity, message, history);
  if (!canUseAi(identity, env)) {
    const fallback = mode.hybrid && lacksAiRight(identity)
      ? await answerForVisitor(sql, env, identity, ctx)
      : await askAi(sql, env, identity, message, history);
    return recordAnswer(sql, identity, message, fallback, correlationId);
  }
  const flags = { cache: await flagOn(sql, identity, FLAG_CACHE), rerank: await flagOn(sql, identity, FLAG_RERANK), hybrid: mode.hybrid };
  const result = await answerFromKnowledge(sql, env, identity, message, history, correlationId, flags);
  return recordAnswer(sql, identity, message, result, correlationId);
}

/** canResearch só com research_enabled ligada para a pessoa, identidade, pergunta cacheável e resposta da base ou da IA. */
async function offerResearch(sql, identity, message, result) {
  if (!identity || !isCacheable(message) || !['kb', 'ai'].includes(result.source)) return result;
  if (!(await flagOn(sql, identity, FLAG_RESEARCH))) return result;
  return Object.assign({}, result, { canResearch: true });
}

async function askWithKnowledge(sql, env, identity, ctx) {
  const result = await answerWithKnowledge(sql, env, identity, ctx);
  return offerResearch(sql, identity, ctx.message, result);
}

/**
 * Modo da Lia híbrida para esta pergunta. `hybrid` exige a flag lia_hibrida_enabled E rag_enabled (sem o acervo
 * não há o que escolher nem extrair); a prévia de IA do visitante exige ainda lia_visitor_ai_enabled. Com
 * lia_hibrida_enabled desligada nada muda: o resto do fluxo é o de sempre. `turnstileToken` é de uso único.
 */
async function hybridMode(sql, identity, input, libraryOn) {
  const hybrid = (await flagOn(sql, identity, FLAG_HIBRIDA)) && (await flagOn(sql, identity, FLAG_RAG));
  const visitorAi = hybrid && !identity && (await flagOn(sql, identity, FLAG_VISITOR_AI));
  const turnstileToken = typeof input.turnstileToken === 'string' ? input.turnstileToken : null;
  return { hybrid, visitorAi, libraryOn, turnstileToken };
}

/** Resposta segura a pergunta clínica (assistant/questionKind.js): sem dose nem conduta. */
function clinicalAnswer() {
  return answer({ reply: CLINICAL_REPLY.reply, source: 'kb', sources: CLINICAL_REPLY.sources.map((s) => Object.assign({}, s)) });
}

/**
 * Artigos da Biblioteca na resposta (flag lia_library_enabled; assistant/libraryRefs.js decide QUANDO, aqui só se
 * aplica). `plan` nulo, flags desligadas ou nada publicado sobre o tema: a resposta sai exatamente como estava.
 * Com artigos, `references` vai junto e o botão "Ver na Biblioteca" leva a busca já preenchida (só para quem tem
 * login). Nunca entra no registro de respostas nem no cache (eles guardam só texto e fontes; isto é recalculado).
 */
async function withLibraryReferences(sql, env, identity, result, plan) {
  if (!plan || !result || result.success !== true) return result;
  const references = await LiaLibrary.referencesFor(sql, env, identity, plan.query);
  if (!references.length) return result;
  const action = identity ? libraryAction(identity.role, plan.query) : null;
  const others = (result.actions || []).filter((a) => a.type + ':' + a.target !== 'open_library:search');
  return Object.assign({}, result, { references, actions: (action ? [action].concat(others) : others).slice(0, MAX_ACTIONS) });
}

/**
 * apiAssistantChat — a identidade (quando há) vem da sessão; o cliente nunca
 * informa quem é. `identity` é null para quem não está logado e, então, as sugestões
 * são as de quem ainda não tem conta (kb.js, suggestionsForVisitor).
 */
export async function chat(sql, env, identity, rawInput, correlationId) {
  const result = await chatCore(sql, env, identity, rawInput, correlationId);
  const hasSuggestions = !!result && Array.isArray(result.suggestions);
  return identity || !hasSuggestions ? result : Object.assign({}, result, { suggestions: suggestionsForVisitor(result.suggestions) });
}

async function chatCore(sql, env, identity, rawInput, correlationId) {
  if (!(await flagOn(sql, identity))) return { success: false, disabled: true, message: MSG_DISABLED };

  const input = asObject(rawInput);
  // Só texto: um número ou objeto não é pergunta (cleanText aceitaria o número).
  const message = typeof input.message === 'string' ? cleanText(input.message, C.AI_LIMITS.QUESTION_MAX + 1) : '';
  if (!message) throw E.ValidationError('Escreva sua pergunta para a Lia.');
  if (message.length > C.AI_LIMITS.QUESTION_MAX) throw E.ValidationError('A pergunta passou do limite de ' + C.AI_LIMITS.QUESTION_MAX + ' caracteres.');
  // O teto de mensagens por hora vem ANTES do portão: quem está suspenso também gasta o teto (60/h) e não
  // consegue martelar o endpoint só porque a resposta é um texto fixo.
  await enforceChatLimit(sql, env, identity);
  const moderated = await moderationGate(sql, env, identity, message, correlationId);
  if (moderated) return moderated;

  // Só perguntas anteriores DA PESSOA; respostas antigas não voltam do cliente. Turno com termo ofensivo
  // sai do histórico (não é punido de novo, mas também não chega à busca nem ao LLM).
  const history = withoutOffensiveTurns(sanitizeHistory(input.history, ['user'], C.AI_LIMITS.HISTORY_MAX_TURNS, C.AI_LIMITS.HISTORY_TURN_MAX));
  if (looksLikeInjection(message) || history.some((turn) => looksLikeInjection(turn.text))) {
    await Logging.logAudit(sql, correlationId, identity ? identity.profileId : null, 'ASSISTANT_INJECTION_BLOCKED', 'assistant', null, 'failure', { length: message.length });
    return answer({ reply: MSG_REFUSAL, source: 'fallback' });
  }

  // Pesquisa externa (L07): a flag research_enabled e a identidade são checadas lá. Não passa pela IA nem grava a mensagem.
  if (input.research === true) return ResearchService.research(sql, env, identity, message, correlationId);

  return routeQuestion(sql, env, identity, { input, message, history, correlationId });
}

/** Depois do portão, da moderação e do filtro de injeção: intenção por regra, conhecimento + IA e artigos da Biblioteca. */
async function routeQuestion(sql, env, identity, ctx) {
  const { input, message, history, correlationId } = ctx;
  const role = identity ? identity.role : null;
  // O papel limita as intenções: a de administração não existe para quem não é admin (cai no fluxo normal).
  // Com library_enabled desligada a Lia não fala da Biblioteca: a intenção é ignorada e os botões para ela somem.
  const libraryOn = await flagOn(sql, identity, FLAG_LIBRARY);
  const mode = await hybridMode(sql, identity, input, libraryOn);
  const kind = mode.hybrid ? questionKind(message) : null;
  // Lia híbrida: pergunta clínica (dose, conduta, tratamento) nunca é respondida; remete a profissional e à emergência.
  if (kind === 'clinico') return recordAnswer(sql, identity, message, clinicalAnswer(), correlationId);

  let hit = matchIntent(message, history, role);
  if (hit && hit.intent.library && !libraryOn) hit = null;
  // Lia híbrida: pergunta de definição só é respondida por regra pelas intenções que de fato definem.
  if (hit && mode.hybrid && !allowIntent(kind, hit)) hit = null;
  // Artigos da Biblioteca: só com library_enabled; quem não tem login só na Lia híbrida (o degrau do visitante).
  const wantsRefs = libraryOn && (!!identity || mode.hybrid);
  const plan = wantsRefs ? libraryPlan(message, kind || questionKind(message), !!hit) : null;
  if (hit) {
    if (hit.id === 'eventos') {
      const live = await liveEventsReply(sql, env, identity, correlationId);
      if (live) return withLibraryActions(fromIntent(hit, role, live, 'live'), libraryOn);
    }
    const reply = withLibraryActions(fromIntent(hit, role, hit.intent.reply, 'kb'), libraryOn);
    return withLibraryReferences(sql, env, identity, await recordAnswer(sql, identity, message, reply, correlationId), plan);
  }
  const result = await askWithKnowledge(sql, env, identity, { message, history, correlationId, mode });
  return withLibraryReferences(sql, env, identity, result, plan);
}
