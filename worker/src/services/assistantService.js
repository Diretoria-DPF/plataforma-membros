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
import { matchIntent, normalize, DEFAULT_SUGGESTIONS } from '../assistant/kb.js';
import { filterActions } from '../assistant/targets.js';
import * as Rag from './ragService.js';
import { normalizeQuestion } from '../ai/semanticCache.js';
import { moderationGate } from '../assistant/moderationGate.js';
import { looksLikeInjection, withoutOffensiveTurns } from '../assistant/moderationRules.js';

// O filtro de injeção mora em assistant/moderationRules.js (compartilhado com a redenção, sem import
// circular); segue exportado daqui para quem já o importa deste módulo.
export { looksLikeInjection };

const FLAG_CHATBOT = 'chatbot_enabled';
const FLAG_RAG = 'rag_enabled';
const ANSWER_MAX = 4000; // limite de assistant_messages.answer (sql/021)
const HISTORY_TURNS = 5;
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

// Recusa: a IA disse que não tem a informação na base. Texto normalizado (normalize() de kb.js).
const REFUSAL_TEXT = [/\bnao tenho (a |essa |esta )?informacao\b/, /\bnao encontrei\b/];
// Citação no texto da IA: "[n]", n é o número do trecho enviado no prompt (1 a 99).
const CITATION = /\s*\[(\d{1,2})\]/g;

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
 * vazia da IA devolve null: quem chama responde pela base estática (answerFromKnowledge).
 */
async function askAi(sql, env, identity, message, history, context = null) {
  const role = identity ? identity.role : null;
  if (!canUseAi(identity, env)) return answer({ reply: MSG_FALLBACK, source: 'fallback' });

  // Pergunta GENÉRICA (sem histórico) de MEMBRO pode vir do cache semântico: não chama a IA e não gasta
  // cota. Só membro guarda e lê: a resposta depende do papel (o prompt cita o papel), e uma resposta
  // gerada para admin nunca pode ser servida a outra pessoa. Com trechos do acervo a resposta depende
  // deles, então não lê nem grava o cache genérico.
  const generic = !context && history.length === 0 && role === C.ROLES.MEMBER;
  if (generic) {
    const hit = await Orchestrator.lookupCache(sql, env, identity, C.AI_FEATURE.ASSISTANT, message);
    if (hit) return answer({ reply: cleanReply(hit.answer, C.AI_LIMITS.REPLY_MAX), source: 'ai', cached: true });
  }

  let outcome;
  try {
    outcome = await withQuota(sql, identity, C.AI_FEATURE.ASSISTANT, async () => {
      const messages = buildAssistantMessages({ question: message, history, role, context });
      const out = await Orchestrator.complete(
        sql, env, identity,
        { feature: C.AI_FEATURE.ASSISTANT, messages, profileId: identity.profileId },
        { cacheQuestion: generic ? message : null }
      );
      const reply = cleanReply(out.content, C.AI_LIMITS.REPLY_MAX);
      if (!reply) throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
      if (out.degraded) await refundQuota(sql, identity, C.AI_FEATURE.ASSISTANT);
      return answer({ reply, source: 'ai', cached: !!out.cached, ...(out.degraded ? { degraded: true } : {}) });
    });
  } catch (err) {
    // IA fora, orçamento do dia ou resposta vazia: a Lia continua útil com a base fixa.
    if (isEmptyOutput(err) && context) return null;
    if (err && (err.aiUnavailable || isEmptyOutput(err))) return answer({ reply: MSG_AI_DOWN, source: 'fallback' });
    throw err;
  }
  if (outcome && outcome.quotaExceeded) return answer({ reply: MSG_QUOTA, source: 'fallback', quotaExceeded: true });
  return outcome;
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

/** Busca os trechos do acervo. Nunca lança: falha vira { failed: true }. Trecho com cara de instrução sai. */
async function retrieveContext(sql, env, query, correlationId) {
  let found;
  try {
    found = await Rag.retrieve(sql, env, query);
  } catch (err) {
    await Logging.logError(sql, correlationId, 'ASSISTANT_RAG_FAILED', String((err && err.message) || err), null);
    return { chunks: [], failed: true, degraded: false };
  }
  // Embedding caiu: a busca seguiu só com trigramas. Registra o fato, sem a pergunta nem o trecho.
  const degraded = !!found.embeddingError;
  if (degraded) await Logging.logError(sql, correlationId, 'ASSISTANT_RAG_EMBEDDING_FAILED', 'Embedding indisponível: busca só por trigramas.', null);
  const chunks = found.chunks.filter((c) => !looksLikeInjection(c.content));
  if (chunks.length < found.chunks.length) {
    await Logging.logAudit(sql, correlationId, null, 'ASSISTANT_RAG_CHUNK_SUPPRESSED', 'assistant', null, 'failure', { dropped: found.chunks.length - chunks.length });
  }
  const trimmed = chunks.map((c) => ({ source: c.source, section: c.section, content: String(c.content).slice(0, C.RAG.CONTEXT_CHARS) }));
  return { chunks: trimmed, failed: false, degraded };
}

/** Último degrau da cadeia: a base estática (kb.js) responde com honestidade que não tem essa informação agora. */
function staticKbFallback(lead) {
  return answer({ reply: lead + MSG_KB_HELP, source: 'kb', degraded: true });
}

function isRefusal(reply) {
  const text = normalize(reply);
  return REFUSAL_TEXT.some((re) => re.test(text));
}

/** Números [n] da resposta que apontam para trechos existentes, sem repetir e em ordem crescente. */
function citedNumbers(reply, count) {
  const numbers = Array.from(reply.matchAll(CITATION), (m) => Number(m[1]));
  return Array.from(new Set(numbers)).filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

/**
 * Cita só os trechos que a IA usou ("[n]" no texto): o texto mostra "(Fonte: seção X)" no fim, e
 * `sources` leva só origem e seção (nunca o conteúdo). Recusa não cita fonte. Sem [n] e sem recusa,
 * cita o trecho de maior score (o primeiro, pois a busca já devolve ordenado).
 */
function withCitations(result, chunks) {
  const body = result.reply.replace(CITATION, '').trim();
  if (isRefusal(result.reply)) return Object.assign({}, result, { reply: body, sources: [] });
  const numbers = citedNumbers(result.reply, chunks.length);
  const used = numbers.length ? numbers.map((n) => chunks[n - 1]) : chunks.slice(0, 1);
  const sections = Array.from(new Set(used.map((c) => c.section)));
  const sources = Array.from(new Map(used.map((c) => [c.source + '|' + c.section, { source: c.source, section: c.section }])).values());
  const label = sections.length > 1 ? 'Fontes' : 'Fonte';
  const note = '(' + label + ': ' + sections.map((s) => 'seção ' + s).join('; ') + ')';
  return Object.assign({}, result, { reply: (body ? body + '\n\n' : '') + note, sources });
}

/**
 * Trechos viram DADO para a IA. A cota é conferida ANTES da busca (sem cota não há embedding nem consulta).
 * Sem trechos, ou com saída vazia da IA, a base estática responde; IA fora ou cota do dia dão resposta fixa.
 */
async function answerFromKnowledge(sql, env, identity, message, history, correlationId) {
  if (!(await hasAiQuota(sql, env, identity))) return asDegradedIfNotAi(await askAi(sql, env, identity, message, history));
  const found = await retrieveContext(sql, env, retrievalQuery(message, history), correlationId);
  if (!found.chunks.length) return staticKbFallback(found.failed ? MSG_KB_FAILED : MSG_KB_EMPTY);
  const result = await askAi(sql, env, identity, message, history, found.chunks);
  if (result === null) return staticKbFallback(MSG_KB_NO_REPLY);
  const out = result.source === 'ai' ? withCitations(result, found.chunks) : asDegradedIfNotAi(result);
  return found.degraded ? Object.assign({}, out, { degraded: true }) : out;
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

/** Pergunta sem intenção por regra. Com rag_enabled desligada, é exatamente o comportamento anterior. */
async function askWithKnowledge(sql, env, identity, message, history, correlationId) {
  if (!(await flagOn(sql, identity, FLAG_RAG))) return askAi(sql, env, identity, message, history);
  const result = canUseAi(identity, env)
    ? await answerFromKnowledge(sql, env, identity, message, history, correlationId)
    : await askAi(sql, env, identity, message, history);
  return recordAnswer(sql, identity, message, result, correlationId);
}

/**
 * apiAssistantChat — a identidade (quando há) vem da sessão; o cliente nunca
 * informa quem é. `identity` é null para quem não está logado.
 */
export async function chat(sql, env, identity, rawInput, correlationId) {
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

  const role = identity ? identity.role : null;
  // Só perguntas anteriores DA PESSOA; respostas antigas não voltam do cliente. Turno com termo ofensivo
  // sai do histórico (não é punido de novo, mas também não chega à busca nem ao LLM).
  const history = withoutOffensiveTurns(sanitizeHistory(input.history, ['user'], HISTORY_TURNS, C.AI_LIMITS.HISTORY_TURN_MAX));
  if (looksLikeInjection(message) || history.some((turn) => looksLikeInjection(turn.text))) {
    await Logging.logAudit(sql, correlationId, identity ? identity.profileId : null, 'ASSISTANT_INJECTION_BLOCKED', 'assistant', null, 'failure', { length: message.length });
    return answer({ reply: MSG_REFUSAL, source: 'fallback' });
  }

  const hit = matchIntent(message, history);
  if (hit) {
    if (hit.id === 'eventos') {
      const live = await liveEventsReply(sql, env, identity, correlationId);
      if (live) return fromIntent(hit, role, live, 'live');
    }
    return recordAnswer(sql, identity, message, fromIntent(hit, role, hit.intent.reply, 'kb'), correlationId);
  }
  return askWithKnowledge(sql, env, identity, message, history, correlationId);
}
