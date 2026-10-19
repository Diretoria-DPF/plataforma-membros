/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selectionCommitteeService.js
 * Processo seletivo, fatia 2: o painel da COMISSÃO (diretoria administrativa; papel de administrador).
 *
 *   - fila por situação, ficha da inscrição, decisão (em análise, entrevista, aprovar, lista de espera, não selecionar)
 *     e configurações (inscrições abertas, prazo individual, intervalo entre lotes, data da próxima análise);
 *   - triagem por IA OPCIONAL (flag selection_ai_enabled): só resume e organiza a leitura; nunca decide nem elimina.
 *     A decisão é sempre de uma pessoa da comissão e fica registrada (decided_by) e auditada (LGPD, art. 20);
 *   - aprovar passa a pessoa de visitante a membro; a mudança fica na auditoria;
 *   - o texto da pessoa só sai daqui para administradores; nada disso vai para o candidato (ele vê só o status).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { sendEmail } from '../mailer.js';
import { isEnabled, isMissingTable } from './featureFlagService.js';
import * as Orchestrator from '../ai/orchestrator.js';
import * as T from '../selection/triage.js';
import { freeField } from '../selection/rules.js';

const AI_FLAG = 'selection_ai_enabled';
const DECISIONS = ['in_review', 'interview', 'approved', 'waitlist', 'not_selected'];
const DECIDABLE = ['submitted', 'in_review', 'interview', 'waitlist', 'not_selected'];
const FILTERS = {
  pending: ['submitted', 'in_review', 'interview'],
  waitlist: ['waitlist'],
  decided: ['approved', 'not_selected'],
  all: ['submitted', 'in_review', 'interview', 'waitlist', 'approved', 'not_selected'],
};
const QUEUE_LIMIT = 100;
const TRIAGE_BATCH = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG = Object.freeze({
  forbidden: 'Apenas a diretoria administrativa acessa o painel do processo seletivo.',
  notFound: 'Inscrição não encontrada.',
  badId: 'Inscrição inválida.',
  badDecision: 'Decisão inválida.',
  locked: 'Esta inscrição já foi aprovada. Para alterar, fale com o administrador do sistema.',
  notReady: 'Esta inscrição ainda não foi enviada.',
  aiOff: 'A triagem por IA está desligada.',
  aiDown: 'A IA está indisponível agora. A comissão pode ler as inscrições normalmente.',
  settings: 'Configuração inválida.',
});

const MAIL = {
  approved: ['Seu resultado no processo seletivo da LAIFT', 'Boas notícias: você foi aprovado(a) no processo seletivo da LAIFT. Sua conta na plataforma agora tem acesso de membro. Entre na plataforma para conhecer os próximos passos.'],
  interview: ['Processo seletivo da LAIFT: entrevista', 'Sua inscrição avançou para a etapa de entrevista. A comissão entrará em contato pela plataforma e por e-mail.'],
  waitlist: ['Processo seletivo da LAIFT: lista de espera', 'Sua inscrição ficou na lista de espera. Você será chamado(a) se houver vaga e pode acompanhar pela plataforma.'],
  not_selected: ['Seu resultado no processo seletivo da LAIFT', 'Agradecemos muito seu interesse. Desta vez você não foi selecionado(a), mas pode se inscrever novamente depois do intervalo indicado na plataforma. Se quiser, peça a revisão da decisão por lá.'],
};

const iso = (value) => (value ? new Date(value).toISOString() : null);
const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

function requireAdmin(identity) {
  if (!identity || identity.role !== C.ROLES.ADMIN || !identity.profileId) throw E.ForbiddenError(MSG.forbidden);
}

function idOf(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!UUID.test(id)) throw E.ValidationError(MSG.badId);
  return id;
}

async function aiOn(sql, identity) {
  try { return await isEnabled(sql, AI_FLAG, identity || null); } catch (err) { return false; }
}

const signalsOf = (data) => Array.from(new Set(Object.values((data && data._signals) || {}).flat()));

function toItem(row) {
  const profile = (row.data && row.data.profile) || {};
  return {
    id: row.id, name: row.full_name, status: row.status, receiptCode: row.receipt_code || null,
    course: profile.course || null, semester: profile.semester || null,
    submittedAt: iso(row.submitted_at), signals: signalsOf(row.data),
    hasTriage: !!row.ai_triage, appeal: !!row.appeal_at,
  };
}

async function readSettings(sql) {
  try {
    const [row] = await sql`SELECT is_open, window_days, batch_every_days, next_review_on, vacancies_note FROM selection_settings WHERE id = 1`;
    if (!row) return null;
    return { isOpen: !!row.is_open, windowDays: Number(row.window_days), batchEveryDays: Number(row.batch_every_days), nextReviewOn: dateOnly(row.next_review_on), vacanciesNote: row.vacancies_note || null };
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** Painel: contagens por situação, configurações e a fila (filtro: pending, waitlist, decided, appeal, all). */
export async function overview(sql, identity, rawInput) {
  requireAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const filter = ['pending', 'waitlist', 'decided', 'appeal', 'all'].includes(input.filter) ? input.filter : 'pending';
  const statuses = FILTERS[filter] || FILTERS.all;
  const onlyAppeals = filter === 'appeal';
  const rows = await sql`
    SELECT a.id, a.status, a.receipt_code, a.submitted_at, a.data, a.ai_triage, a.appeal_at, p.full_name
    FROM selection_applications a JOIN profiles p ON p.id = a.profile_id
    WHERE a.status = ANY(${statuses}) AND (${!onlyAppeals} OR a.appeal_at IS NOT NULL)
    ORDER BY a.appeal_at IS NULL, a.submitted_at ASC NULLS LAST
    LIMIT ${QUEUE_LIMIT}`;
  const counted = await sql`SELECT status, count(*)::int AS n FROM selection_applications WHERE status <> 'draft' GROUP BY status`;
  const [appeals] = await sql`SELECT count(*)::int AS n FROM selection_applications WHERE appeal_at IS NOT NULL AND status = 'not_selected'`;
  const counts = {};
  counted.forEach((r) => { counts[r.status] = r.n; });
  return {
    success: true, filter, counts, appeals: appeals ? appeals.n : 0,
    settings: await readSettings(sql), aiEnabled: await aiOn(sql, identity),
    items: rows.map(toItem),
  };
}

/** Ficha completa de uma inscrição (respostas, triagem, linha do tempo). */
export async function getApplication(sql, identity, rawInput) {
  requireAdmin(identity);
  const id = idOf((rawInput || {}).id);
  const [row] = await sql`
    SELECT a.*, p.full_name, p.email FROM selection_applications a JOIN profiles p ON p.id = a.profile_id
    WHERE a.id = ${id}::uuid AND a.status <> 'draft'`;
  if (!row) throw E.NotFoundError(MSG.notFound);
  const events = await sql`SELECT kind, created_at FROM selection_events WHERE application_id = ${id}::uuid ORDER BY created_at ASC LIMIT 50`;
  const { _signals, ...answers } = row.data || {};
  return {
    success: true,
    application: {
      id: row.id, name: row.full_name, email: row.email, status: row.status, receiptCode: row.receipt_code || null,
      submittedAt: iso(row.submitted_at), startedAt: iso(row.started_at), bankVersion: row.bank_version,
      answers, signals: signalsOf(row.data), triage: row.ai_triage || null, triageAt: iso(row.ai_triage_at),
      decidedAt: iso(row.decided_at), decisionNote: row.decision_note || null,
      appealAt: iso(row.appeal_at), appealNote: row.appeal_note || null,
      events: events.map((e) => ({ kind: e.kind, at: iso(e.created_at) })),
    },
  };
}

async function triageOne(sql, env, identity, row) {
  const out = await Orchestrator.complete(sql, env, identity,
    { feature: C.AI_FEATURE.SELECTION_TRIAGE, messages: T.buildMessages(row.data), profileId: identity.profileId });
  const parsed = T.parseTriage(out.content);
  if (!parsed) return false;
  const value = { ...parsed, version: T.TRIAGE_VERSION, model: out.model || null };
  await sql`UPDATE selection_applications SET ai_triage = ${JSON.stringify(value)}::jsonb, ai_triage_at = now() WHERE id = ${row.id}`;
  return true;
}

/** Triagem por IA: de uma inscrição ({id}) ou das próximas sem resumo ({pending:true}, até 5 por vez). */
export async function triage(sql, env, identity, rawInput, correlationId) {
  requireAdmin(identity);
  if (!(await aiOn(sql, identity))) throw E.ForbiddenError(MSG.aiOff);
  const rule = C.RATE_LIMITS.SELECTION_TRIAGE;
  await S.enforceRateLimit(sql, 'SELECTION_TRIAGE', identity.profileId, rule.MAX_ATTEMPTS, rule.WINDOW_SECONDS);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const rows = input.id
    ? await sql`SELECT id, data FROM selection_applications WHERE id = ${idOf(input.id)}::uuid AND status <> 'draft'`
    : await sql`SELECT id, data FROM selection_applications WHERE status = 'submitted' AND ai_triage IS NULL ORDER BY submitted_at ASC LIMIT ${TRIAGE_BATCH}`;
  if (input.id && !rows.length) throw E.NotFoundError(MSG.notFound);
  let done = 0;
  let down = false;
  for (const row of rows) {
    try {
      if (await triageOne(sql, env, identity, row)) done += 1;
    } catch (err) {
      if (err && (err.aiUnavailable || err.aiInvalidOutput)) { down = true; continue; }
      throw err;
    }
  }
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_TRIAGE_RUN', 'selection_application', input.id || null, 'success', { done, asked: rows.length });
  if (!done && down) return { success: false, message: MSG.aiDown, done };
  return { success: true, done, asked: rows.length, message: done ? 'Resumo gerado.' : 'Nenhuma inscrição aguardando resumo.' };
}

async function notify(env, row, decision) {
  const mail = MAIL[decision];
  if (!mail || !row.email) return;
  try { await sendEmail(env, { to: row.email, subject: mail[0], text: mail[1] }); } catch (err) { /* o e-mail nunca desfaz a decisão */ }
}

/** Decisão da comissão. Aprovar torna a pessoa membro. A decisão é sempre de uma pessoa (decided_by). */
export async function decide(sql, env, identity, rawInput, correlationId) {
  requireAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const id = idOf(input.id);
  const decision = typeof input.decision === 'string' ? input.decision : '';
  if (!DECISIONS.includes(decision)) throw E.ValidationError(MSG.badDecision);
  const rule = C.RATE_LIMITS.SELECTION_DECIDE;
  await S.enforceRateLimit(sql, 'SELECTION_DECIDE', identity.profileId, rule.MAX_ATTEMPTS, rule.WINDOW_SECONDS);
  const note = input.note ? freeField(input.note, 1000).text : null;
  const [row] = await sql`
    SELECT a.id, a.status, a.profile_id, p.email, p.role FROM selection_applications a JOIN profiles p ON p.id = a.profile_id
    WHERE a.id = ${id}::uuid`;
  if (!row) throw E.NotFoundError(MSG.notFound);
  if (row.status === 'approved') throw E.ConflictError(MSG.locked);
  if (!DECIDABLE.includes(row.status)) throw E.ConflictError(MSG.notReady);

  const [saved] = await sql`
    UPDATE selection_applications
    SET status = ${decision}, decided_by = ${identity.profileId}::uuid, decided_at = now(), decision_note = ${note}, updated_at = now()
    WHERE id = ${id}::uuid AND status = ANY(${DECIDABLE}) RETURNING id`;
  if (!saved) throw E.ConflictError(MSG.locked);
  if (decision === 'approved' && row.role === C.ROLES.VISITOR) {
    await sql`UPDATE profiles SET role = ${C.ROLES.MEMBER}::user_role WHERE id = ${row.profile_id}::uuid AND role = ${C.ROLES.VISITOR}::user_role`;
    await Logging.logAudit(sql, correlationId, identity.profileId, 'CHANGE_USER_ROLE', 'profile', row.profile_id, 'success', { newRole: C.ROLES.MEMBER, via: 'selection' });
  }
  try {
    await sql`INSERT INTO selection_events (application_id, actor_id, kind, meta) VALUES (${id}::uuid, ${identity.profileId}::uuid, 'decided', ${JSON.stringify({ decision })}::jsonb)`;
  } catch (err) { /* a linha do tempo nunca derruba a ação */ }
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_DECIDED', 'selection_application', id, 'success', { decision });
  await notify(env, row, decision);
  return { success: true, message: 'Decisão registrada.', status: decision };
}

/** Configurações do processo contínuo. */
export async function saveSettings(sql, identity, rawInput, correlationId) {
  requireAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const windowDays = Number(input.windowDays);
  const batchEveryDays = Number(input.batchEveryDays);
  const next = input.nextReviewOn ? String(input.nextReviewOn) : null;
  const note = input.vacanciesNote ? freeField(input.vacanciesNote, 200).text : null;
  const okInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (typeof input.isOpen !== 'boolean' || !okInt(windowDays, 1, 60) || !okInt(batchEveryDays, 1, 90)) throw E.ValidationError(MSG.settings);
  if (next && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(next)) throw E.ValidationError(MSG.settings);
  await sql`
    UPDATE selection_settings
    SET is_open = ${input.isOpen}, window_days = ${windowDays}, batch_every_days = ${batchEveryDays},
        next_review_on = ${next}::date, vacancies_note = ${note}, updated_at = now()
    WHERE id = 1`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SELECTION_SETTINGS_SAVED', 'selection_settings', null, 'success', { isOpen: input.isOpen, windowDays, batchEveryDays });
  return { success: true, message: 'Configurações salvas.', settings: await readSettings(sql) };
}
