/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selectionService.js
 * Processo seletivo contínuo (docs/planos/PROCESSO-SELETIVO.md, fatia 1): a jornada do CANDIDATO.
 * A comissão e a triagem por IA entram na fatia 2.
 *
 * Segurança, em camadas (tudo validado aqui; a tela só ajuda):
 *   - flag selection_enabled (falha fechada) e inscrições abertas (selection_settings.is_open);
 *   - só quem tem conta (visitante, ou admin para testar); membro não se inscreve;
 *   - limite por perfil para começar, salvar e enviar (security.enforceRateLimit);
 *   - UMA inscrição ativa por pessoa (índice único parcial) e envio idempotente;
 *   - etapas em ordem, dentro do prazo individual;
 *   - isca (campo `website` deve vir vazio);
 *   - texto livre sem contato nem documento; dado de saúde e tentativa de manipular a IA viram SINAL (nunca punição);
 *   - sem gabarito nem nota; o candidato só enxerga a PRÓPRIA inscrição;
 *   - eventos guardam só metadados, nunca o texto escrito pela pessoa.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { isEnabled, isMissingTable } from './featureFlagService.js';
import * as B from '../selection/banco.js';
import * as R from '../selection/rules.js';

const FLAG = 'selection_enabled';
const ACTIVE_STATUSES = ['draft', 'submitted', 'in_review', 'interview', 'waitlist'];
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SETTINGS = Object.freeze({ isOpen: true, windowDays: 7, batchEveryDays: 15, nextReviewOn: null, vacanciesNote: null });

const MSG = Object.freeze({
  disabled: 'O processo seletivo não está disponível agora. Acompanhe @laift.liga.',
  closed: 'As inscrições estão fechadas no momento. Acompanhe @laift.liga.',
  member: 'Você já faz parte da LAIFT: não precisa se inscrever.',
  login: 'Entre na sua conta para participar do processo seletivo.',
  none: 'Você ainda não começou a inscrição.',
  expired: 'O prazo desta inscrição terminou. Você poderá começar de novo em alguns dias.',
  gone: 'Esta inscrição não está mais aberta para edição.',
  order: 'Conclua as etapas anteriores antes desta.',
  incomplete: 'Faltam etapas para enviar. Confira o resumo e complete o que estiver pendente.',
  bot: 'Não foi possível concluir. Recarregue a página e tente de novo.',
  cooldown: 'Você poderá começar uma nova inscrição a partir de {date}.',
  saved: 'Etapa salva.',
  health: 'Notamos o que parece ser um dado de saúde no texto. Se for seu ou de outra pessoa, edite: o edital pede para não escrever esse tipo de informação.',
  withdrawn: 'Inscrição retirada.',
});

const iso = (value) => (value ? new Date(value).toISOString() : null);
const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

async function flagOn(sql, identity) {
  try { return await isEnabled(sql, FLAG, identity || null); } catch (err) { return false; }
}

async function readSettings(sql) {
  try {
    const [row] = await sql`SELECT is_open, window_days, batch_every_days, next_review_on, vacancies_note FROM selection_settings WHERE id = 1`;
    if (!row) return DEFAULT_SETTINGS;
    return { isOpen: !!row.is_open, windowDays: Number(row.window_days), batchEveryDays: Number(row.batch_every_days), nextReviewOn: dateOnly(row.next_review_on), vacanciesNote: row.vacancies_note || null };
  } catch (err) {
    if (isMissingTable(err)) return DEFAULT_SETTINGS;
    throw err;
  }
}

/** As inscrições estão abertas agora (selection_settings.is_open)? Usado por Guia para não afirmar o que não é. */
export async function isSelectionOpen(sql) {
  return (await readSettings(sql)).isOpen;
}

function assertCandidate(identity) {
  if (!identity) throw E.AuthError(MSG.login);
  if (identity.role !== C.ROLES.VISITOR && identity.role !== C.ROLES.ADMIN) throw E.ForbiddenError(MSG.member);
}

async function requireOpen(sql, identity) {
  if (!(await flagOn(sql, identity))) throw E.ForbiddenError(MSG.disabled);
  const settings = await readSettings(sql);
  if (!settings.isOpen) throw E.ForbiddenError(MSG.closed);
  return settings;
}

async function limit(sql, bucket, identity) {
  const rule = C.RATE_LIMITS[bucket];
  await S.enforceRateLimit(sql, bucket, identity.profileId, rule.MAX_ATTEMPTS, rule.WINDOW_SECONDS);
}

async function recordEvent(sql, applicationId, actorId, kind, meta) {
  try {
    await sql`INSERT INTO selection_events (application_id, actor_id, kind, meta) VALUES (${applicationId}, ${actorId}, ${kind}, ${meta ? JSON.stringify(meta) : null}::jsonb)`;
  } catch (err) { /* a linha do tempo nunca derruba a ação */ }
}

async function activeRow(sql, profileId) {
  const [row] = await sql`SELECT * FROM selection_applications WHERE profile_id = ${profileId} AND status = ANY(${ACTIVE_STATUSES}) LIMIT 1`;
  return row || null;
}

/** Rascunho com prazo vencido vira "expired" (e a pessoa vê isso, não um erro obscuro). */
async function expireIfNeeded(sql, row) {
  if (!row || row.status !== 'draft' || new Date(row.deadline_at).getTime() > Date.now()) return row;
  const [done] = await sql`UPDATE selection_applications SET status = 'expired', updated_at = now() WHERE id = ${row.id} AND status = 'draft' RETURNING *`;
  await recordEvent(sql, row.id, null, 'expired', null);
  return done || { ...row, status: 'expired' };
}

/** Conteúdo estático que a tela precisa para montar os formulários (sem gabarito). */
export function content() {
  return {
    version: B.BANK_VERSION,
    courses: B.COURSES, areas: B.AREAS, days: B.DAYS, shifts: B.SHIFTS, semesters: B.SEMESTERS,
    scenario: B.SCENARIO, thinking: B.THINKING, conduct: B.CONDUCT,
    limits: { ...R.LIMITS },
  };
}

/** Inscrição como o candidato pode ver: as próprias respostas, a prova SEM gabarito e, depois do envio, o resumo. */
function toDto(row) {
  const { _signals, ...visible } = row.data || {};
  return {
    id: row.id,
    status: row.status,
    step: row.step,
    startedAt: iso(row.started_at),
    deadlineAt: iso(row.deadline_at),
    submittedAt: iso(row.submitted_at),
    receiptCode: row.receipt_code || null,
    appealRequested: !!row.appeal_at,
    data: visible,
  };
}

/** Visão pública do processo (página /processo-seletivo) e, com login, o estado da própria inscrição. */
export async function overview(sql, identity) {
  const enabled = await flagOn(sql, identity);
  const settings = await readSettings(sql);
  const out = { success: true, enabled, open: enabled && settings.isOpen, windowDays: settings.windowDays, batchEveryDays: settings.batchEveryDays, nextReviewOn: settings.nextReviewOn, vacanciesNote: settings.vacanciesNote, mine: null };
  if (enabled && identity && (identity.role === C.ROLES.VISITOR || identity.role === C.ROLES.ADMIN)) {
    let row = await expireIfNeeded(sql, await activeRow(sql, identity.profileId));
    if (!row) [row] = await sql`SELECT * FROM selection_applications WHERE profile_id = ${identity.profileId} AND status IN ('approved', 'not_selected') ORDER BY started_at DESC LIMIT 1`;
    if (row) out.mine = { status: row.status, step: row.step, deadlineAt: iso(row.deadline_at), submittedAt: iso(row.submitted_at), receiptCode: row.receipt_code || null };
  }
  return out;
}

async function insertDraft(sql, identity, settings) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  const [row] = await sql`
    INSERT INTO selection_applications (profile_id, bank_version, seed, deadline_at)
    VALUES (${identity.profileId}, ${B.BANK_VERSION}, ${seed}, now() + (${settings.windowDays} || ' days')::interval)
    ON CONFLICT (profile_id) WHERE status IN ('draft', 'submitted', 'in_review', 'interview', 'waitlist') DO NOTHING
    RETURNING *`;
  return row || null;
}

/** Começa (ou retoma) a inscrição. */
export async function start(sql, identity, correlationId) {
  assertCandidate(identity);
  const settings = await requireOpen(sql, identity);
  await limit(sql, 'SELECTION_START', identity);
  const existing = await expireIfNeeded(sql, await activeRow(sql, identity.profileId));
  if (existing && ACTIVE_STATUSES.includes(existing.status)) return { success: true, application: toDto(existing), content: content() };

  const [last] = await sql`SELECT started_at FROM selection_applications WHERE profile_id = ${identity.profileId} ORDER BY started_at DESC LIMIT 1`;
  if (last) {
    const until = new Date(last.started_at).getTime() + R.RESTART_COOLDOWN_DAYS * DAY_MS;
    if (until > Date.now()) throw E.ConflictError(MSG.cooldown.replace('{date}', new Date(until).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' })));
  }
  const created = await insertDraft(sql, identity, settings);
  const row = created || await activeRow(sql, identity.profileId); // corrida entre duas abas: vale a que já existe
  if (created) {
    await recordEvent(sql, row.id, identity.profileId, 'started', { bank: B.BANK_VERSION });
    await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_STARTED', 'selection_application', row.id, 'success', null);
  }
  return { success: true, application: toDto(row), content: content() };
}

/** A inscrição ativa da própria pessoa (ou a última, ou null). */
export async function getMine(sql, identity) {
  assertCandidate(identity);
  if (!(await flagOn(sql, identity))) throw E.ForbiddenError(MSG.disabled);
  const row = await expireIfNeeded(sql, await activeRow(sql, identity.profileId));
  if (!row) {
    const [last] = await sql`SELECT * FROM selection_applications WHERE profile_id = ${identity.profileId} ORDER BY started_at DESC LIMIT 1`;
    return { success: true, application: last ? toDto(last) : null, content: content() };
  }
  return { success: true, application: toDto(row), content: content() };
}

async function ensureHuman(sql, identity, input, correlationId) {
  if (typeof input.website === 'string' && input.website.trim()) {
    await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_HONEYPOT', 'selection_application', null, 'failure', null);
    throw E.ValidationError(MSG.bot);
  }
}

async function draftFor(sql, identity) {
  const row = await expireIfNeeded(sql, await activeRow(sql, identity.profileId));
  if (!row) throw E.NotFoundError(MSG.none);
  if (row.status === 'expired') throw E.ConflictError(MSG.expired);
  if (row.status !== 'draft') throw E.ConflictError(MSG.gone);
  return row;
}

const asInput = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

/** Salva UMA etapa, validada no servidor. */
export async function saveStep(sql, identity, rawInput, correlationId) {
  assertCandidate(identity);
  await requireOpen(sql, identity);
  const input = asInput(rawInput);
  await ensureHuman(sql, identity, input, correlationId);
  await limit(sql, 'SELECTION_SAVE', identity);
  const step = typeof input.step === 'string' ? input.step : '';
  const row = await draftFor(sql, identity);
  const data = row.data || {};
  if (!R.canSaveStep(step, data)) throw E.ValidationError(R.DATA_STEPS.includes(step) ? MSG.order : 'Etapa inválida.');

  const { value, signals } = R.validateStep(step, input.data);
  const patch = { [step]: value, _signals: { ...(data._signals || {}), [step]: signals } };
  const reached = Math.max(R.STEPS.indexOf(row.step), R.STEPS.indexOf(R.nextStep(step)));
  const [saved] = await sql`
    UPDATE selection_applications
    SET data = data || ${JSON.stringify(patch)}::jsonb, step = ${R.STEPS[reached]}, updated_at = now()
    WHERE id = ${row.id} AND profile_id = ${identity.profileId} AND status = 'draft' AND deadline_at > now()
    RETURNING *`;
  if (!saved) throw E.ConflictError(MSG.expired);
  await recordEvent(sql, row.id, identity.profileId, 'step_saved', { step });
  if (signals.includes('injecao')) await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_INJECTION_SIGNAL', 'selection_application', row.id, 'failure', { step });
  const warnings = signals.includes('saude') ? [MSG.health] : [];
  return { success: true, message: MSG.saved, warnings, application: toDto(saved) };
}

async function uniqueReceipt(sql, row, identity) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [done] = await sql`
        UPDATE selection_applications
        SET status = 'submitted', submitted_at = now(), step = 'done', receipt_code = ${R.newReceiptCode()}, updated_at = now()
        WHERE id = ${row.id} AND profile_id = ${identity.profileId} AND status = 'draft' AND deadline_at > now()
        RETURNING *`;
      return done || null;
    } catch (err) {
      if (!/uq_selection_receipt|duplicate key/i.test(String((err && err.message) || err))) throw err;
    }
  }
  throw E.ConflictError('Não foi possível gerar o comprovante agora. Tente de novo.');
}

/** Envia a inscrição. Idempotente: reenviar devolve o mesmo comprovante. */
export async function submit(sql, identity, rawInput, correlationId) {
  assertCandidate(identity);
  await requireOpen(sql, identity);
  const input = asInput(rawInput);
  await ensureHuman(sql, identity, input, correlationId);
  await limit(sql, 'SELECTION_SUBMIT', identity);
  const current = await expireIfNeeded(sql, await activeRow(sql, identity.profileId));
  if (!current) throw E.NotFoundError(MSG.none);
  if (current.status === 'expired') throw E.ConflictError(MSG.expired);
  if (current.status !== 'draft') return { success: true, application: toDto(current), alreadySubmitted: true };

  if (!R.isComplete(current.data)) throw E.ValidationError(MSG.incomplete);
  const done = await uniqueReceipt(sql, current, identity);
  if (!done) return { success: true, application: toDto((await activeRow(sql, identity.profileId)) || current), alreadySubmitted: true };

  const signals = Array.from(new Set(Object.values((done.data && done.data._signals) || {}).flat()));
  await recordEvent(sql, done.id, identity.profileId, 'submitted', { signals });
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_SUBMITTED', 'selection_application', done.id, 'success', { signals });
  return { success: true, message: 'Inscrição enviada. Guarde o comprovante.', application: toDto(done) };
}

/** Retira a inscrição (rascunho ou enviada, antes de a comissão decidir). */
export async function withdraw(sql, identity, correlationId) {
  assertCandidate(identity);
  if (!(await flagOn(sql, identity))) throw E.ForbiddenError(MSG.disabled);
  await limit(sql, 'SELECTION_SAVE', identity);
  const row = await activeRow(sql, identity.profileId);
  if (!row) throw E.NotFoundError(MSG.none);
  const [done] = await sql`
    UPDATE selection_applications SET status = 'withdrawn', updated_at = now()
    WHERE id = ${row.id} AND profile_id = ${identity.profileId} AND status IN ('draft', 'submitted') RETURNING *`;
  if (!done) throw E.ConflictError(MSG.gone);
  await recordEvent(sql, done.id, identity.profileId, 'withdrawn', null);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_WITHDRAWN', 'selection_application', done.id, 'success', null);
  return { success: true, message: MSG.withdrawn };
}

/** A pessoa pede revisão humana da decisão (LGPD, art. 20). Um pedido por inscrição; a comissão vê no painel. */
export async function requestReview(sql, identity, rawInput, correlationId) {
  assertCandidate(identity);
  if (!(await flagOn(sql, identity))) throw E.ForbiddenError(MSG.disabled);
  await limit(sql, 'SELECTION_APPEAL', identity);
  const input = asInput(rawInput);
  const note = input.note ? R.freeField(input.note, 600).text : null;
  const [row] = await sql`SELECT id, status, appeal_at FROM selection_applications WHERE profile_id = ${identity.profileId} ORDER BY started_at DESC LIMIT 1`;
  if (!row) throw E.NotFoundError(MSG.none);
  if (row.status !== 'not_selected' && row.status !== 'waitlist') throw E.ConflictError('A revisão só pode ser pedida depois do resultado.');
  if (row.appeal_at) throw E.ConflictError('Você já pediu a revisão desta decisão. A comissão responderá pela plataforma.');
  await sql`UPDATE selection_applications SET appeal_at = now(), appeal_note = ${note}, updated_at = now() WHERE id = ${row.id} AND appeal_at IS NULL`;
  await recordEvent(sql, row.id, identity.profileId, 'appeal', null);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_APPEAL', 'selection_application', row.id, 'success', null);
  return { success: true, message: 'Pedido de revisão enviado. Uma pessoa da comissão vai reler sua inscrição.' };
}
