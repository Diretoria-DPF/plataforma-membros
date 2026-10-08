/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * moderationService.js
 * Fila de denúncias entre membros (Fase 3a). Só admin lista/resolve —
 * mesmo padrão de acesso de adminService.js.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
// Moderação da Lia (ADR 0004): regras puras, juiz por LLM e flag.
import * as Rules from '../assistant/moderationRules.js';
import { normalize } from '../assistant/kb.js';
import * as Orchestrator from '../ai/orchestrator.js';
import { buildModerationJudgeMessages, buildRedeemJudgeMessages } from '../ai/prompts.js';
import { isEnabled, isMissingTable } from './featureFlagService.js';

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}
function assertMemberOrAdmin(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

const REPORT_CATEGORIES = Object.values(C.REPORT_CATEGORY);

export async function submitReport(sql, identity, input, correlationId) {
  assertMemberOrAdmin(identity);
  await S.enforceRateLimit(sql, 'REPORT', identity.profileId, C.RATE_LIMITS.REPORT.MAX_ATTEMPTS, C.RATE_LIMITS.REPORT.WINDOW_SECONDS);

  const targetId = S.normalizeText(input && input.targetProfileId);
  const category = S.normalizeText(input && input.category);
  const details = S.normalizeText(input && input.details);
  const evidenceExcerpt = S.normalizeText(input && input.evidenceExcerpt);

  if (!targetId) throw E.ValidationError('Conta denunciada inválida.');
  if (targetId === identity.profileId) throw E.ValidationError('Não é possível denunciar a própria conta.');
  if (REPORT_CATEGORIES.indexOf(category) === -1) throw E.ValidationError('Categoria de denúncia inválida.');
  if (details && details.length > C.LIMITS.REPORT_DETAILS_MAX) throw E.ValidationError('Descrição da denúncia muito longa.');
  if (evidenceExcerpt && evidenceExcerpt.length > C.LIMITS.REPORT_EVIDENCE_MAX) throw E.ValidationError('Trecho de evidência muito longo.');

  // Exige vínculo prévio (pedido de conexão em qualquer direção, conexão
  // aceita, ou bloqueio) — evita que qualquer conta denuncie qualquer
  // outra sem nunca ter interagido.
  const linkRows = await sql`
    SELECT 1 FROM connections
    WHERE LEAST(requester_id, addressee_id) = LEAST(${identity.profileId}::uuid, ${targetId}::uuid)
      AND GREATEST(requester_id, addressee_id) = GREATEST(${identity.profileId}::uuid, ${targetId}::uuid)
    UNION ALL
    SELECT 1 FROM profile_blocks
    WHERE (blocker_id = ${identity.profileId}::uuid AND blocked_id = ${targetId}::uuid)
       OR (blocker_id = ${targetId}::uuid AND blocked_id = ${identity.profileId}::uuid)
    LIMIT 1
  `;
  if (!linkRows.length) throw E.ForbiddenError('Só é possível denunciar contas com quem você já teve alguma interação na plataforma.');

  try {
    await sql`
      INSERT INTO profile_reports (reporter_id, reported_profile_id, category, details, evidence_excerpt)
      VALUES (${identity.profileId}::uuid, ${targetId}::uuid, ${category}::report_category, ${details || null}, ${evidenceExcerpt || null})
    `;
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (msg.indexOf('uq_profile_reports_open_pair') !== -1) {
      throw E.ConflictError('Você já tem uma denúncia em aberto sobre esta conta.');
    }
    await Logging.logError(sql, correlationId, 'SUBMIT_REPORT_FAILED', 'Falha ao registrar denúncia.', { reporterId: identity.profileId });
    throw err;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'SUBMIT_REPORT', 'profile', targetId, 'success', { category });
  return { success: true, message: 'Denúncia enviada para análise da administração.' };
}

export async function listReports(sql, identity, input) {
  assertAdmin(identity);
  const status = S.normalizeText(input && input.status);
  const page = Math.max(1, parseInt((input && input.page) || 1, 10) || 1);
  const pageSize = C.LIMITS.REPORT_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const whereClause = status ? 'WHERE r.status = $1' : '';
  const params = status ? [status] : [];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const rows = await sql(
    `SELECT r.id AS id, r.category AS category, r.details AS details, r.evidence_excerpt AS evidence_excerpt,
            r.status AS status, r.created_at AS created_at, r.resolved_at AS resolved_at, r.resolution_note AS resolution_note,
            rep.full_name AS reporter_name, rep.username AS reporter_username,
            tgt.full_name AS reported_name, tgt.username AS reported_username
     FROM profile_reports r
     LEFT JOIN profiles rep ON rep.id = r.reporter_id
     LEFT JOIN profiles tgt ON tgt.id = r.reported_profile_id
     ${whereClause}
     ORDER BY r.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params.concat([pageSize, offset])
  );
  const countRows = await sql(`SELECT count(*) AS total FROM profile_reports r ${whereClause}`, params);

  return {
    success: true,
    reports: rows.map((r) => ({
      id: r.id, category: r.category, details: r.details, evidenceExcerpt: r.evidence_excerpt,
      status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at, resolutionNote: r.resolution_note,
      reporterName: r.reporter_name, reporterUsername: r.reporter_username,
      reportedName: r.reported_name, reportedUsername: r.reported_username,
    })),
    page, pageSize, total: Number(countRows[0].total),
  };
}

const REPORT_TRANSITIONS = {
  open: ['under_review', 'resolved', 'dismissed'],
  under_review: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export async function resolveReport(sql, identity, reportId, input, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(reportId);
  const newStatus = S.normalizeText(input && input.status);
  const resolutionNote = S.normalizeText(input && input.resolutionNote);

  if (Object.keys(REPORT_TRANSITIONS).indexOf(newStatus) === -1) throw E.ValidationError('Status inválido.');
  if (resolutionNote && resolutionNote.length > C.LIMITS.REPORT_DETAILS_MAX) throw E.ValidationError('Nota de resolução muito longa.');

  const current = await sql`SELECT status FROM profile_reports WHERE id = ${id}::uuid`;
  if (!current.length) throw E.NotFoundError('Denúncia não encontrada.');

  const allowed = REPORT_TRANSITIONS[current[0].status] || [];
  if (current[0].status !== newStatus && allowed.indexOf(newStatus) === -1) {
    throw E.ConflictError('Transição de status de denúncia inválida.');
  }

  const isTerminal = newStatus === 'resolved' || newStatus === 'dismissed';
  if (isTerminal) {
    await sql`
      UPDATE profile_reports SET status = ${newStatus}::report_status,
        resolution_note = ${resolutionNote || null}, resolved_by = ${identity.profileId}::uuid, resolved_at = now()
      WHERE id = ${id}::uuid
    `;
  } else {
    await sql`
      UPDATE profile_reports SET status = ${newStatus}::report_status, resolution_note = ${resolutionNote || null}
      WHERE id = ${id}::uuid
    `;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'RESOLVE_REPORT', 'report', id, 'success', { newStatus });
  return { success: true, message: 'Denúncia atualizada.' };
}

// ===========================================================================
// Moderação da Lia (ADR 0004; sql/022). Regras puras em assistant/moderationRules.js.
//
// O driver HTTP do Neon não tem transação interativa. Por isso nenhuma mudança de estado
// é "ler, calcular e regravar a linha inteira": cada uma é UM comando atômico no SQL
// (incremento com teto, reivindicação da tentativa de redenção, redenção) ou uma troca
// condicional (decaimento, só se a linha não mudou desde a leitura).
// ===========================================================================
const FLAG_MODERATION = 'moderation_enabled';
const MSG_MODERATION_OFF = 'A moderação da Lia está desligada no momento.';
const HOUR_MS = 3600000;
const DECAY_RETRIES = 3;

const iso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Flag da moderação. Só a tabela de flags ausente (migração 016 não aplicada) vale como
 * "desligada". Qualquer outro erro SOBE: quem chama decide o que fazer sem saber (o portão
 * do chat segue sem moderar, mas mantém sem IA quem já sabe estar suspenso). Nunca devolve
 * false por engano: isso liberaria a conversa de quem está suspenso.
 */
export async function moderationEnabled(sql, identity) {
  try {
    return await isEnabled(sql, FLAG_MODERATION, identity);
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

// Suspensões vistas por ESTA instância do Worker (memória; some quando a instância reinicia).
// Só servem à falha segura: se a leitura do estado falhar, quem já sabemos suspenso segue sem IA.
const KNOWN_SUSPENSIONS = new Map();
const KNOWN_SUSPENSIONS_MAX = 500;

function noteSuspension(profileId, state, at) {
  if (!Rules.isSuspended(state, at)) {
    KNOWN_SUSPENSIONS.delete(profileId);
    return;
  }
  if (KNOWN_SUSPENSIONS.size >= KNOWN_SUSPENSIONS_MAX) {
    for (const [id, until] of KNOWN_SUSPENSIONS) if (until <= at.getTime()) KNOWN_SUSPENSIONS.delete(id);
  }
  if (KNOWN_SUSPENSIONS.size >= KNOWN_SUSPENSIONS_MAX) KNOWN_SUSPENSIONS.delete(KNOWN_SUSPENSIONS.keys().next().value);
  KNOWN_SUSPENSIONS.set(profileId, state.until.getTime());
}

/** Fim da suspensão que esta instância já viu para a pessoa (Date), ou null se não há suspensão ativa conhecida. */
export function knownSuspensionUntil(profileId, now) {
  const until = KNOWN_SUSPENSIONS.get(profileId);
  if (until === undefined) return null;
  if (until <= (now || new Date()).getTime()) {
    KNOWN_SUSPENSIONS.delete(profileId);
    return null;
  }
  return new Date(until);
}

export function __resetKnownSuspensionsForTests() {
  KNOWN_SUSPENSIONS.clear();
}

async function readRow(sql, profileId) {
  const rows = await sql`
    SELECT level, until, last_incident_at, last_decay_at, redeemed_at, redeem_attempt_at
    FROM assistant_moderation WHERE profile_id = ${profileId}::uuid`;
  return rows[0] || null;
}

/**
 * Grava o decaimento só se a linha ainda é a que foi lida (troca condicional) e sem tocar nas
 * colunas da redenção. Devolve false quando outra requisição mudou a linha no meio: quem chama relê.
 */
async function persistDecay(sql, profileId, read, after) {
  const rows = await sql`
    UPDATE assistant_moderation
    SET level = ${after.level}, until = ${iso(after.until)}::timestamptz,
        last_decay_at = ${iso(after.lastDecayAt)}::timestamptz, updated_at = now()
    WHERE profile_id = ${profileId}::uuid
      AND level = ${Number(read.level)}
      AND date_trunc('milliseconds', last_incident_at) IS NOT DISTINCT FROM ${iso(read.last_incident_at)}::timestamptz
      AND date_trunc('milliseconds', last_decay_at) IS NOT DISTINCT FROM ${iso(read.last_decay_at)}::timestamptz
    RETURNING profile_id`;
  return rows.length > 0;
}

/** Estado atual da pessoa, já com o decaimento devido (e gravado, se mudou). */
export async function getAssistantState(sql, profileId, now) {
  const at = now || new Date();
  let latest = { state: Rules.EMPTY_STATE, row: null };
  for (let attempt = 0; attempt < DECAY_RETRIES; attempt += 1) {
    const row = await readRow(sql, profileId);
    if (!row) {
      KNOWN_SUSPENSIONS.delete(profileId);
      return { state: Rules.EMPTY_STATE, row: null };
    }
    const state = Rules.decay(row, at);
    latest = { state, row };
    if (state.level === Rules.normalizeState(row).level || (await persistDecay(sql, profileId, row, state))) break;
  }
  noteSuspension(profileId, latest.state, at);
  return latest;
}

/**
 * Sobe um nível de uma vez só, no SQL: LEAST(level + 1, teto), com a suspensão de 24 h no teto.
 * Dez incidentes paralelos terminam no nível 3, sem perder nenhum. Equivale a Rules.registerIncident
 * sobre um estado já decaído (o teste de paridade em moderationConcurrency.test.js garante).
 */
async function bumpLevel(sql, profileId, at) {
  const suspendUntil = new Date(at.getTime() + C.MODERATION.SUSPENSION_HOURS * HOUR_MS);
  const max = C.MODERATION.MAX_LEVEL;
  const rows = await sql`
    INSERT INTO assistant_moderation (profile_id, level, until, last_incident_at, updated_at)
    VALUES (${profileId}::uuid, 1, NULL, ${iso(at)}::timestamptz, now())
    ON CONFLICT (profile_id) DO UPDATE SET
      level = LEAST(assistant_moderation.level + 1, ${max}),
      until = CASE WHEN assistant_moderation.level + 1 >= ${max} THEN ${iso(suspendUntil)}::timestamptz ELSE NULL END,
      last_incident_at = ${iso(at)}::timestamptz,
      updated_at = now()
    RETURNING level, until, last_incident_at, last_decay_at`;
  return Rules.normalizeState(rows[0]);
}

/** Registra um incidente: sobe o nível, grava o histórico (sem o texto) e audita. Devolve o novo estado. */
export async function registerAssistantIncident(sql, correlationId, profileId, detection, now) {
  const at = now || new Date();
  await getAssistantState(sql, profileId, at); // aplica o decaimento devido antes de somar
  const next = await bumpLevel(sql, profileId, at);
  await sql`INSERT INTO assistant_incidents (profile_id, kind, detection, level_after) VALUES (${profileId}::uuid, 'offensive', ${detection}, ${next.level})`;
  await Logging.logAudit(sql, correlationId, profileId, 'assistant_incident', 'profile', profileId, 'success', { level: next.level, detection });
  noteSuspension(profileId, next, at);
  return next;
}

/** Job diário (maintenance.js): aplica o decaimento a todos com nível acima de 0. */
export async function decayAssistantModeration(sql, now) {
  const at = now || new Date();
  const rows = await sql`SELECT profile_id, level, until, last_incident_at, last_decay_at, redeemed_at, redeem_attempt_at FROM assistant_moderation WHERE level > 0`;
  let lowered = 0;
  for (const row of rows) {
    const before = Rules.normalizeState(row);
    const after = Rules.decay(row, at);
    if (after.level !== before.level && (await persistDecay(sql, row.profile_id, row, after))) lowered += 1;
  }
  return { checked: rows.length, lowered };
}

// ---- Juiz por LLM ----
function verdict(content) {
  const word = normalize(String(content || '')).split(' ')[0];
  if (word === 'sim') return true;
  if (word === 'nao') return false;
  return null;
}

async function askJudge(sql, env, identity, messages) {
  const out = await Orchestrator.complete(sql, env, identity, { feature: C.AI_FEATURE.ASSISTANT, messages, profileId: identity.profileId }, {});
  return verdict(out && out.content);
}

/** Falha ou resposta ambígua do juiz vai para error_logs. NUNCA leva o texto avaliado. */
async function logJudgeFailure(sql, correlationId, stage, err) {
  await Logging.logError(sql, correlationId || S.newCorrelationId(), 'ASSISTANT_JUDGE_FAILED', 'Juiz da moderação indisponível ou sem veredito.', {
    stage,
    reason: err ? 'error' : 'ambiguous',
    errorName: err && err.name ? String(err.name).slice(0, 60) : null,
  });
}

const VERDICT_CLEAN = Object.freeze({ offensive: false, detection: null });
const VERDICT_TERMS = Object.freeze({ offensive: true, detection: 'terms' });
const VERDICT_LLM = Object.freeze({ offensive: true, detection: 'llm' });

/**
 * Mensagem ofensiva? Termos PT-BR primeiro (barato); só se houver termo, o LLM confirma
 * (evita punir citação ou dúvida legítima). LLM fora do ar, ambíguo ou com `allowLlm: false`
 * (o portão estourou o teto de julgamentos): vale o termo. A falha do juiz é registrada.
 * @returns {Promise<{ offensive: boolean, detection: 'terms'|'llm'|null }>}
 */
export async function judgeOffense(sql, env, identity, message, correlationId, options) {
  if (!Rules.containsOffensiveTerm(message)) return VERDICT_CLEAN;
  if (options && options.allowLlm === false) return VERDICT_TERMS;
  let sayYes = null;
  try {
    sayYes = await askJudge(sql, env, identity, buildModerationJudgeMessages({ message }));
  } catch (err) {
    await logJudgeFailure(sql, correlationId, 'offense', err);
    return VERDICT_TERMS;
  }
  if (sayYes === false) return VERDICT_CLEAN;
  if (sayYes === true) return VERDICT_LLM;
  await logJudgeFailure(sql, correlationId, 'offense', null);
  return VERDICT_TERMS;
}

// ---- Redenção ----
const MSG_REDEEM_ACCEPTED = 'Obrigada por conversar. Redenção aceita: seu nível voltou ao normal.';
const MSG_REDEEM_REFUSED = 'Não consegui perceber sinceridade no seu texto. Conte com suas palavras o que houve e como vai agir daqui em diante; você pode tentar de novo em 1 hora.';
const MSG_REDEEM_UNAVAILABLE = 'Não consegui avaliar o seu pedido agora. Isso não conta como tentativa: tente de novo em alguns minutos.';
const MSG_REDEEM_NORMAL = 'Seu nível já está normal: não há nada a redimir.';
const MSG_REDEEM_LIMIT = 'Você já teve ' + C.MODERATION.REDEEM_ACCEPTED_MAX + ' redenções aceitas nos últimos ' + C.MODERATION.REDEEM_ACCEPTED_WINDOW_DAYS + ' dias. Aguarde o fim da suspensão; se acredita que houve engano, fale com a administração.';

function retryError(secondsLeft) {
  const err = E.RateLimitError('Você já tentou há pouco. Tente a redenção de novo em ' + Math.ceil(secondsLeft / 60) + ' minuto(s).');
  err.payload = { retryAfterSeconds: Math.ceil(secondsLeft) };
  return err;
}

function redeemText(input) {
  const text = input && typeof input.message === 'string' ? input.message.trim() : '';
  if (text.length < C.MODERATION.REDEEM_MIN_CHARS || text.length > C.MODERATION.REDEEM_MAX_CHARS) {
    throw E.ValidationError('Explique em ' + C.MODERATION.REDEEM_MIN_CHARS + ' a ' + C.MODERATION.REDEEM_MAX_CHARS + ' caracteres o que houve e como vai agir daqui em diante.');
  }
  return text;
}

/** Redenções ACEITAS na janela (audit_logs usa o relógio do banco, por isso a janela também). */
async function acceptedRedemptions(sql, profileId) {
  const rows = await sql`
    SELECT count(*) AS total FROM audit_logs
    WHERE actor_id = ${profileId}::uuid AND action = 'assistant_redeemed' AND result = 'success'
      AND created_at >= now() - make_interval(days => ${C.MODERATION.REDEEM_ACCEPTED_WINDOW_DAYS})`;
  return Number((rows[0] || {}).total || 0);
}

/**
 * Reivindica a tentativa ANTES do juiz, num UPDATE atômico: só uma requisição por janela de
 * 1 h passa (o bloqueio de linha do Postgres serializa as concorrentes). Quem perde recebe o
 * erro de espera, ou o de "nível já normal" se a linha mudou no meio.
 */
async function claimRedeemAttempt(sql, profileId, at) {
  const threshold = new Date(at.getTime() - C.MODERATION.REDEEM_RETRY_SECONDS * 1000);
  const rows = await sql`
    UPDATE assistant_moderation SET redeem_attempt_at = ${iso(at)}::timestamptz, updated_at = now()
    WHERE profile_id = ${profileId}::uuid AND level > 0
      AND (redeem_attempt_at IS NULL OR redeem_attempt_at <= ${iso(threshold)}::timestamptz)
    RETURNING redeem_attempt_at`;
  if (rows.length) return;
  const row = await readRow(sql, profileId);
  if (!row || Number(row.level) === 0) throw E.ValidationError(MSG_REDEEM_NORMAL);
  const elapsed = row.redeem_attempt_at ? (at.getTime() - new Date(row.redeem_attempt_at).getTime()) / 1000 : 0;
  throw retryError(Math.max(1, C.MODERATION.REDEEM_RETRY_SECONDS - elapsed));
}

/** Devolve a reivindicação (juiz indisponível): só se ainda for a nossa, para não soltar a de outra tentativa. */
async function releaseRedeemClaim(sql, profileId, at) {
  await sql`
    UPDATE assistant_moderation SET redeem_attempt_at = NULL, updated_at = now()
    WHERE profile_id = ${profileId}::uuid AND redeem_attempt_at = ${iso(at)}::timestamptz`;
}

/** Zera o nível mexendo só no que a redenção muda; last_incident_at e last_decay_at ficam (não reinicia o contador). */
async function applyRedemption(sql, profileId, state, at) {
  const next = Rules.redeem(state);
  await sql`
    UPDATE assistant_moderation
    SET level = ${next.level}, until = ${iso(next.until)}::timestamptz, redeemed_at = ${iso(at)}::timestamptz,
        redeem_attempt_at = NULL, updated_at = now()
    WHERE profile_id = ${profileId}::uuid`;
  return next;
}

/**
 * Desfecho da avaliação. Só `sayYes === true` aceita: juiz fora do ar, vazio ou ambíguo NUNCA
 * aceita (e não pune). A heurística local barra texto sem sentido antes de gastar o juiz.
 * @returns {Promise<'accepted'|'refused'|'unavailable'>}
 */
async function decideRedemption(sql, env, identity, text, correlationId) {
  if (!Rules.sincerityHeuristic(text).ok) return 'refused';
  let sayYes = null;
  try {
    sayYes = await askJudge(sql, env, identity, buildRedeemJudgeMessages({ text }));
  } catch (err) {
    await logJudgeFailure(sql, correlationId, 'redeem', err);
    return 'unavailable';
  }
  if (sayYes === true) return 'accepted';
  if (sayYes === false) return 'refused';
  await logJudgeFailure(sql, correlationId, 'redeem', null);
  return 'unavailable';
}

const redeemReply = (state, extra) => Object.assign({ success: true, accepted: false, level: state.level, retryAfterSeconds: 0 }, extra);

async function settleRedemption(sql, env, identity, text, state, correlationId, at) {
  const profileId = identity.profileId;
  const decision = await decideRedemption(sql, env, identity, text, correlationId);
  if (decision === 'unavailable') {
    await releaseRedeemClaim(sql, profileId, at); // não consome o cooldown de 1 h
    return redeemReply(state, { unavailable: true, message: MSG_REDEEM_UNAVAILABLE });
  }
  if (decision === 'refused') {
    await Logging.logAudit(sql, correlationId, profileId, 'assistant_redeem_refused', 'profile', profileId, 'failure', { level: state.level });
    return redeemReply(state, { retryAfterSeconds: C.MODERATION.REDEEM_RETRY_SECONDS, message: MSG_REDEEM_REFUSED });
  }
  const next = await applyRedemption(sql, profileId, state, at);
  KNOWN_SUSPENSIONS.delete(profileId);
  await Logging.logAudit(sql, correlationId, profileId, 'assistant_redeemed', 'profile', profileId, 'success', { levelBefore: state.level, level: next.level });
  return { success: true, accepted: true, level: next.level, message: MSG_REDEEM_ACCEPTED };
}

/**
 * apiAssistantRedeem: { message } com a explicação da pessoa.
 * Ordem: flag, texto, teto de pedidos/h, nível, teto de redenções aceitas, reivindicação atômica
 * da tentativa e só então a avaliação (heurística + juiz).
 */
export async function redeemAssistant(sql, env, identity, input, correlationId, now) {
  assertMemberOrAdmin(identity);
  if (!(await moderationEnabled(sql, identity))) return { success: false, disabled: true, message: MSG_MODERATION_OFF };
  const at = now || new Date();
  const text = redeemText(input);
  const limit = C.RATE_LIMITS.ASSISTANT_REDEEM_TRY;
  await S.enforceRateLimit(sql, 'ASSISTANT_REDEEM_TRY', identity.profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);

  const { state } = await getAssistantState(sql, identity.profileId, at);
  if (state.level === 0) throw E.ValidationError(MSG_REDEEM_NORMAL);
  if ((await acceptedRedemptions(sql, identity.profileId)) >= C.MODERATION.REDEEM_ACCEPTED_MAX) {
    return redeemReply(state, { limitReached: true, message: MSG_REDEEM_LIMIT });
  }
  await claimRedeemAttempt(sql, identity.profileId, at);
  return settleRedemption(sql, env, identity, text, state, correlationId, at);
}
