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
 *   6. base fixa quando não há IA, cota ou provedor.
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
import { asObject, withQuota, refundQuota, quotaLimit } from './aiService.js';
import { AiInvalidOutputError, AI_MESSAGES } from '../ai/errors.js';
import { buildAssistantMessages } from '../ai/prompts.js';
import { cleanText, cleanReply, sanitizeHistory } from '../ai/validators.js';
import { matchIntent, normalize, DEFAULT_SUGGESTIONS } from '../assistant/kb.js';
import { filterActions } from '../assistant/targets.js';
import { moderationGate } from '../assistant/moderationGate.js';

const FLAG_CHATBOT = 'chatbot_enabled';
const HISTORY_TURNS = 5;
const EVENTS_SHOWN = 3;
const EVENT_TITLE_MAX = 80;
const EVENT_PLACE_MAX = 60;

const MSG_DISABLED = 'A Lia está indisponível no momento. Tente novamente mais tarde.';
const MSG_REFUSAL = 'Não posso seguir esse tipo de instrução, mas posso te ajudar a usar a plataforma: eventos, módulos de estudo, seu crachá e seu perfil.';
const MSG_FALLBACK = 'Ainda não sei responder isso por aqui. Posso te ajudar com eventos, módulos de estudo (laboratório, atlas 3D, quiz, casos clínicos), seu crachá e seu perfil. Escolha uma opção ou pergunte de outro jeito.';
const MSG_AI_DOWN = 'A IA está indisponível agora, então respondo só com o que já sei: eventos, módulos de estudo, seu crachá e seu perfil. Escolha uma opção ou tente de novo mais tarde.';
const MSG_QUOTA = 'Você atingiu o limite diário de perguntas que usam IA; ele volta amanhã. Enquanto isso, posso te ajudar com eventos, módulos de estudo, seu crachá e seu perfil.';

// Tentativas de dar ordens à IA ou de embutir marcação. Textos normalizados (sem acento, minúsculos).
const INJECTION_TEXT = [
  /\b(ignore|ignorar|ignora|ignorem|desconsidere|esqueca)\b.{0,60}\b(instrucoes|instrucao|regras|prompt|anteriores|papel)\b/,
  /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules|previous|prompt)\b/,
  /\b(system prompt|prompt de sistema|prompt do sistema|developer mode|modo desenvolvedor|jailbreak)\b/,
  /\b(revele|revelar|mostre|mostrar|repita|exiba)\b.{0,30}\b(prompt|instrucoes internas|instrucoes do sistema)\b/,
];
// Marcação testada no texto original: tags, delimitadores de chat e pseudo-instruções.
const INJECTION_MARKUP = /<\s*\/?\s*(system|script|iframe|img|svg)\b|<\|im_|\[\[?\s*\/?\s*inst\b|\bsystem\s*:/i;

// Caracteres invisíveis (largura zero, marcas de direção) usados para quebrar palavras-chave.
const INVISIBLE = /[\u200B-\u200F\u2060\u202A-\u202E\uFEFF\u00AD]/g;

export function looksLikeInjection(message) {
  const clean = String(message).replace(INVISIBLE, '');
  if (INJECTION_MARKUP.test(clean)) return true;
  const text = normalize(clean);
  return INJECTION_TEXT.some((re) => re.test(text));
}

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

async function flagOn(sql, identity) {
  try {
    return await isEnabled(sql, FLAG_CHATBOT, identity);
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

/** Pergunta sem intenção: IA para quem pode usar; senão, a base fixa. */
async function askAi(sql, env, identity, message, history) {
  const role = identity ? identity.role : null;
  const canUseAi = !!identity && quotaLimit(role, C.AI_FEATURE.ASSISTANT) > 0 && Groq.parseKeys(env).length > 0;
  if (!canUseAi) return answer({ reply: MSG_FALLBACK, source: 'fallback' });

  // Pergunta GENÉRICA (sem histórico) de MEMBRO pode vir do cache semântico: não chama a IA e não gasta
  // cota. Só membro guarda e lê: a resposta depende do papel (o prompt cita o papel), e uma resposta
  // gerada para admin nunca pode ser servida a outra pessoa.
  const generic = history.length === 0 && role === C.ROLES.MEMBER;
  if (generic) {
    const hit = await Orchestrator.lookupCache(sql, env, identity, C.AI_FEATURE.ASSISTANT, message);
    if (hit) return answer({ reply: cleanReply(hit.answer, C.AI_LIMITS.REPLY_MAX), source: 'ai', cached: true });
  }

  let outcome;
  try {
    outcome = await withQuota(sql, identity, C.AI_FEATURE.ASSISTANT, async () => {
      const messages = buildAssistantMessages({ question: message, history, role });
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
    if (err && (err.aiUnavailable || err.aiInvalidOutput || err.name === 'AiInvalidOutputError')) {
      return answer({ reply: MSG_AI_DOWN, source: 'fallback' });
    }
    throw err;
  }
  if (outcome && outcome.quotaExceeded) return answer({ reply: MSG_QUOTA, source: 'fallback', quotaExceeded: true });
  return outcome;
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
  const moderated = await moderationGate(sql, env, identity, message, correlationId);
  if (moderated) return moderated;

  await enforceChatLimit(sql, env, identity);

  const role = identity ? identity.role : null;
  // Só perguntas anteriores DA PESSOA; respostas antigas não voltam do cliente.
  const history = sanitizeHistory(input.history, ['user'], HISTORY_TURNS, C.AI_LIMITS.HISTORY_TURN_MAX);
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
    return fromIntent(hit, role, hit.intent.reply, 'kb');
  }
  return askAi(sql, env, identity, message, history);
}
