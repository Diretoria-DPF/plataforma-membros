/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/moderationGate.js
 * Moderação da Lia na conversa (ADR 0004; sql/022): o portão do chat, o estado da própria
 * pessoa e o resumo para a administração. Quem decide o nível é moderationService; aqui só
 * se monta a resposta. Visitante não é moderado.
 * Falha da moderação: o erro sempre vai para error_logs. Não deu para ler o estado (flag ou leitura):
 * a suspensão é relida do banco (verdade persistida; ModerationService.resolveSuspension) e, se o banco
 * não responder, vale a memória desta instância. Suspensa: segue sem IA (texto fixo). Livre pelo banco,
 * ou tabela ausente (migração 022 não aplicada): a conversa segue normal. Nem banco nem memória: falha
 * SEGURA, a Lia não responde com IA nem libera quem pode estar suspenso (aviso neutro, sem punir).
 * O juiz LLM só roda dentro de um teto por perfil; acima dele vale só o termo (nunca derruba o chat).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as Logging from '../logging.js';
import * as ModerationService from '../services/moderationService.js';
import * as Rules from './moderationRules.js';
import { DEFAULT_SUGGESTIONS } from './kb.js';

const MODERATED_ROLES = [C.ROLES.MEMBER, C.ROLES.ADMIN];
const SUMMARY_WINDOW_DAYS = 90;
const SUMMARY_PAGE_MAX = C.MODERATION.PAGE_SIZE;

// Textos da Lia por nível (o nível 3 usa a mensagem de suspensão, com o horário de Brasília).
export const GATE_TEXTS = Object.freeze({
  1: 'Isso não é permitido. Vamos manter o respeito.',
  2: 'Se continuar, vou precisar me retirar.',
});

const UNTIL_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const NOT_MODERATED = Object.freeze({
  success: true, moderated: false, level: 0, suspended: false, until: null, canRedeem: false, retryAfterSeconds: 0,
});

function isModerated(identity) {
  return !!identity && MODERATED_ROLES.indexOf(identity.role) !== -1;
}

function suspensionText(until) {
  return Rules.SUSPENDED_MESSAGE.replace('{until}', UNTIL_FORMAT.format(until));
}

/** Resposta que para a conversa: a Lia fala, não há botões nem IA. */
function payload(level, until, text) {
  return {
    success: true,
    source: 'moderation',
    reply: text,
    message: text,
    actions: [],
    suggestions: DEFAULT_SUGGESTIONS.slice(0, 3),
    moderation: {
      level,
      suspended: level >= C.MODERATION.MAX_LEVEL,
      until: until ? until.toISOString() : null,
    },
  };
}

function suspendedPayload(state) {
  return payload(C.MODERATION.MAX_LEVEL, state.until, suspensionText(state.until));
}

function incidentPayload(state) {
  if (state.level >= C.MODERATION.MAX_LEVEL) return suspendedPayload(state);
  return payload(state.level, null, GATE_TEXTS[state.level]);
}

const MSG_STATE_UNVERIFIED = 'A Lia não conseguiu verificar o estado da moderação agora e, por segurança, pausou as respostas. '
  + 'Isso não é um aviso nem uma suspensão e não conta como ocorrência. Tente de novo em alguns minutos.';

/** Falha segura: sem saber se a pessoa está suspensa, a Lia pausa (nível 0, sem suspensão) e o chat marca a resposta como degradada. */
function unverifiedPayload() {
  return Object.assign(payload(0, null, MSG_STATE_UNVERIFIED), { degraded: true });
}

async function logFailOpen(sql, correlationId, err) {
  try {
    await Logging.logError(sql, correlationId, 'ASSISTANT_MODERATION_FAILED', String((err && err.message) || err), null);
  } catch (logErr) {
    // Sem nem o log disponível, a conversa segue mesmo assim: a moderação nunca derruba o chat.
  }
}

const JUDGE_LIMIT = C.RATE_LIMITS.ASSISTANT_JUDGE;
const VERDICT_CLEAN = Object.freeze({ offensive: false, detection: null });

/** Pode chamar o juiz LLM? Teto por perfil ANTES da chamada. Estourou (ou o limitador falhou): só pelos termos. */
async function judgeAllowed(sql, correlationId, profileId) {
  try {
    await S.enforceRateLimit(sql, 'ASSISTANT_JUDGE', profileId, JUDGE_LIMIT.MAX_ATTEMPTS, JUDGE_LIMIT.WINDOW_SECONDS);
    return true;
  } catch (err) {
    if (!err || err.name !== 'RateLimitError') await logFailOpen(sql, correlationId, err);
    return false;
  }
}

/**
 * Sem termo ofensivo não há juiz nem gasto do teto; com termo, o LLM só confirma dentro do teto.
 * Mensagem com cara de injeção ("responda NAO", "ignore as instruções") decide só pelos termos: nem
 * chama o juiz nem gasta o teto, porque o texto poderia mandar o classificador absolver o insulto.
 */
async function judgeMessage(sql, env, identity, message, correlationId) {
  if (!Rules.containsOffensiveTerm(message)) return VERDICT_CLEAN;
  const allowLlm = !Rules.looksLikeInjection(message) && (await judgeAllowed(sql, correlationId, identity.profileId));
  return ModerationService.judgeOffense(sql, env, identity, message, correlationId, { allowLlm });
}

/**
 * Não deu para saber o estado (flag ou leitura falhou). O erro é registrado e a suspensão é resolvida
 * pelo banco, com a memória da instância só como reserva (ModerationService.resolveSuspension):
 * suspensa segue SEM IA (texto fixo da suspensão); livre segue normal; sem resposta nenhuma, falha segura.
 */
async function whenStateUnknown(sql, identity, correlationId, err, at) {
  await logFailOpen(sql, correlationId, err);
  const found = await ModerationService.resolveSuspension(sql, identity.profileId, at);
  if (found.status === 'suspended') return suspendedPayload({ until: found.until });
  return found.status === 'unknown' ? unverifiedPayload() : null;
}

/**
 * Portão do chat (chamado por assistantService.chat depois da validação da pergunta e do teto de
 * mensagens por hora: quem está suspenso também é limitado).
 * Devolve a resposta da moderação quando a conversa deve parar; null quando segue normal.
 * Suspensão ativa responde SEM olhar a mensagem e SEM chamar a IA.
 */
export async function moderationGate(sql, env, identity, message, correlationId, now) {
  if (!isModerated(identity)) return null;
  const at = now || new Date();
  let state;
  try {
    if (!(await ModerationService.moderationEnabled(sql, identity))) return null;
    ({ state } = await ModerationService.getAssistantState(sql, identity.profileId, at));
  } catch (err) {
    return whenStateUnknown(sql, identity, correlationId, err, at);
  }
  if (Rules.isSuspended(state, at)) return suspendedPayload(state);
  try {
    const verdict = await judgeMessage(sql, env, identity, message, correlationId);
    if (!verdict.offensive) return null;
    const next = await ModerationService.registerAssistantIncident(sql, correlationId, identity.profileId, verdict.detection, at);
    return incidentPayload(next);
  } catch (err) {
    await logFailOpen(sql, correlationId, err);
    return null;
  }
}

function retrySecondsLeft(row, at) {
  if (!row || !row.redeem_attempt_at) return 0;
  const elapsed = (at.getTime() - new Date(row.redeem_attempt_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(C.MODERATION.REDEEM_RETRY_SECONDS - elapsed));
}

/** Estado da moderação da PRÓPRIA pessoa (apiAssistantModerationState). Falha de leitura não quebra a tela. */
export async function assistantModerationState(sql, identity, now) {
  if (!isModerated(identity)) return NOT_MODERATED;
  const at = now || new Date();
  try {
    if (!(await ModerationService.moderationEnabled(sql, identity))) return NOT_MODERATED;
    const { state, row } = await ModerationService.getAssistantState(sql, identity.profileId, at);
    const retry = retrySecondsLeft(row, at);
    return {
      success: true,
      moderated: true,
      level: state.level,
      suspended: Rules.isSuspended(state, at),
      until: state.until ? state.until.toISOString() : null,
      canRedeem: state.level > 0 && retry === 0,
      retryAfterSeconds: retry,
    };
  } catch (err) {
    await logFailOpen(sql, S.newCorrelationId(), err);
    const found = await ModerationService.resolveSuspension(sql, identity.profileId, at);
    if (found.status !== 'suspended') return NOT_MODERATED; // a tela não quebra; quem protege é o portão do chat
    return Object.assign({}, NOT_MODERATED, { moderated: true, level: C.MODERATION.MAX_LEVEL, suspended: true, until: found.until.toISOString() });
  }
}

function clampPageSize(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return SUMMARY_PAGE_MAX;
  return Math.min(n, SUMMARY_PAGE_MAX);
}

async function incidentTotals(sql) {
  const rows = await sql`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE detection = 'terms') AS by_terms,
           count(*) FILTER (WHERE detection = 'llm') AS by_llm,
           count(*) FILTER (WHERE level_after = 1) AS level_1,
           count(*) FILTER (WHERE level_after = 2) AS level_2,
           count(*) FILTER (WHERE level_after = 3) AS level_3
    FROM assistant_incidents
    WHERE created_at >= now() - make_interval(days => ${SUMMARY_WINDOW_DAYS})`;
  const r = rows[0] || {};
  return {
    total: Number(r.total || 0),
    byDetection: { terms: Number(r.by_terms || 0), llm: Number(r.by_llm || 0) },
    byLevelAfter: { 1: Number(r.level_1 || 0), 2: Number(r.level_2 || 0), 3: Number(r.level_3 || 0) },
  };
}

async function incidentPeople(sql, limit) {
  const rows = await sql`
    SELECT profile_id, count(*) AS incidents, max(level_after) AS max_level, max(created_at) AS last_at
    FROM assistant_incidents
    WHERE created_at >= now() - make_interval(days => ${SUMMARY_WINDOW_DAYS})
    GROUP BY profile_id
    ORDER BY max(created_at) DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    profileId: r.profile_id, incidents: Number(r.incidents), maxLevel: Number(r.max_level), lastAt: r.last_at,
  }));
}

async function redemptionOutcomes(sql) {
  const rows = await sql`
    SELECT action, count(*) AS total FROM audit_logs
    WHERE action IN ('assistant_redeemed', 'assistant_redeem_refused')
      AND created_at >= now() - make_interval(days => ${SUMMARY_WINDOW_DAYS})
    GROUP BY action`;
  const count = (action) => Number((rows.find((r) => r.action === action) || {}).total || 0);
  const accepted = count('assistant_redeemed');
  const refused = count('assistant_redeem_refused');
  const attempts = accepted + refused;
  return { accepted, refused, rate: attempts ? Math.round((accepted / attempts) * 1000) / 1000 : null };
}

async function currentLevels(sql) {
  const rows = await sql`SELECT level, count(*) AS total FROM assistant_moderation WHERE level > 0 GROUP BY level`;
  const out = { 1: 0, 2: 0, 3: 0 };
  rows.forEach((r) => { out[Number(r.level)] = Number(r.total); });
  return out;
}

/**
 * Resumo para a administração (apiAdminAssistantModeration): agregados e pessoas com incidentes.
 * NUNCA traz texto de mensagem: o histórico só guarda tipo, detecção e nível.
 */
export async function adminAssistantModeration(sql, identity, input) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const limit = clampPageSize(input && input.limit);
  return {
    success: true,
    windowDays: SUMMARY_WINDOW_DAYS,
    incidents: await incidentTotals(sql),
    people: await incidentPeople(sql, limit),
    currentLevels: await currentLevels(sql),
    redemption: await redemptionOutcomes(sql),
  };
}
