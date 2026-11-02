/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mentoringService.js — Mentoria entre membros (ROL-04; sql/039; docs/mentoria.md), atrás da flag mentoring_enabled.
 *
 * Modelo: mentorships(mentor_id, mentee_id, status pending|active|declined|ended, requested_by, share_progress).
 * Quem pode ser mentor: membro com o cargo mentor (capacidade mentoring.offer, sql/038) ou que ligou
 * profiles.mentoring_available. A pessoa mentorada pede; o mentor aceita ou recusa; qualquer parte encerra.
 *
 * Autorização (nunca confia no cliente): toda ação confere, NO BANCO, que a pessoa da sessão é parte do vínculo
 * (mentor_id ou mentee_id) e o estado esperado, dentro do próprio UPDATE/SELECT. Quem não é parte recebe o mesmo
 * "não encontrado" de um vínculo inexistente, sem revelar nada. O progresso só sai ao mentor, só com vínculo ativo e
 * share_progress verdadeiro, e SÓ como resumo agregado (módulos, % de acerto, sequência): nada de respostas
 * individuais, textos ou dados pessoais.
 *
 * Conversa: reaproveita o chat cifrado. Cada vínculo informa se já existe conexão aceita (connections) entre as
 * pessoas; o cliente só oferece "Enviar mensagem" nesse caso. O serviço NÃO cria conexão (ver docs/mentoria.md).
 *
 * Degrada com segurança: sem a migração 039 (ou com a flag desligada) a leitura devolve lista vazia, sem 500, e a
 * escrita recusa com mensagem clara. Toda escrita tem limite por pessoa e entra em audit_logs. Mensagens nunca
 * ecoam o texto recebido nem detalhes do banco.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { enforceWriteLimit } from '../writeLimits.js';
import { isEnabled } from './featureFlagService.js';
import { getMyStats } from './learningService.js';
import { getEngagement } from './engagementService.js';

const M = C.MENTORING;
const CAPABILITY = 'mentoring.offer';
const MENTOR_ROLE = 'mentor';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';
const UNAVAILABLE_MESSAGE = 'A mentoria ainda não está disponível. A atualização do banco está pendente.';
const FLAG_OFF_MESSAGE = 'A mentoria ainda não está disponível.';
const NOT_FOUND_LINK = 'Vínculo de mentoria não encontrado.';

function isMissingSchema(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  if (err.code === '42P01') return true; // tabela inexistente (mentorships ou member_roles)
  if (err.code === '42703') return /mentoring_available/.test(msg); // coluna inexistente
  return /mentorships|mentoring_available/.test(msg) && /does not exist/.test(msg);
}

function requireUuid(value, message) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw E.ValidationError(message);
  return value.toLowerCase();
}

function requireBoolean(value, message) {
  if (typeof value !== 'boolean') throw E.ValidationError(message);
  return value;
}

function assertParticipant(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

const iso = (value) => (value instanceof Date ? value.toISOString() : value || null);

function peerDto(row) {
  return { id: row.peer_id, fullName: row.full_name, username: row.username || null, avatarUrl: row.avatar_url || null };
}

function linkDto(row, myId) {
  const iAmMentor = row.mentor_id === myId;
  return {
    id: row.id,
    myRole: iAmMentor ? 'mentor' : 'mentee',
    status: row.status,
    shareProgress: row.share_progress === true,
    requestedByMe: row.requested_by === myId,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    peer: peerDto(row),
    connected: row.connected === true,
  };
}

/** Roda a escrita; tabela ou coluna ausente (039 pendente) vira erro esperado e claro, sem vazar detalhe do banco. */
async function writing(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isMissingSchema(err)) throw E.ConflictError(UNAVAILABLE_MESSAGE);
    throw err;
  }
}

/** Porta das escritas: papel, flag ligada e limite por pessoa. */
async function guardWrite(sql, identity) {
  assertParticipant(identity);
  if (!(await isEnabled(sql, M.FLAG, identity))) throw E.ConflictError(FLAG_OFF_MESSAGE);
  await enforceWriteLimit(sql, 'MENTORING_WRITE', identity.profileId, M.WRITE_RATE_LIMIT, 'de ações na mentoria');
}

/** A pessoa pode atuar como mentora agora? Cargo mentor (capacidade) ou disponibilidade ligada. */
async function isEligibleMentor(sql, identity) {
  if (S.hasCapability(identity, CAPABILITY)) return true;
  const rows = await sql`SELECT mentoring_available FROM profiles WHERE id = ${identity.profileId}::uuid`;
  return rows.length > 0 && rows[0].mentoring_available === true;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

// apiMentoringOverview: estado da tela (disponibilidade, vínculos como mentorado e como mentor)
export async function overview(sql, identity) {
  assertParticipant(identity);
  const me = identity.profileId;
  const empty = { success: true, enabled: false, available: false, hasMentorRole: false, asMentee: [], asMentor: [] };
  if (!(await isEnabled(sql, M.FLAG, identity))) return empty;
  await enforceWriteLimit(sql, 'MENTORING_READ', me, M.READ_RATE_LIMIT, 'de consultas da mentoria');
  const hasMentorRole = S.hasCapability(identity, CAPABILITY);
  try {
    const [mine, rows] = await Promise.all([
      sql`SELECT mentoring_available FROM profiles WHERE id = ${me}::uuid`,
      sql`
        SELECT m.id, m.mentor_id, m.mentee_id, m.status, m.requested_by, m.share_progress, m.created_at, m.updated_at,
               p.id AS peer_id, p.full_name, p.username, p.avatar_url,
               EXISTS (
                 SELECT 1 FROM connections c
                 WHERE c.status = 'accepted'::connection_status
                   AND LEAST(c.requester_id, c.addressee_id) = LEAST(m.mentor_id, m.mentee_id)
                   AND GREATEST(c.requester_id, c.addressee_id) = GREATEST(m.mentor_id, m.mentee_id)
               ) AS connected
        FROM mentorships m
        JOIN profiles p ON p.id = CASE WHEN m.mentor_id = ${me}::uuid THEN m.mentee_id ELSE m.mentor_id END
        WHERE (m.mentor_id = ${me}::uuid OR m.mentee_id = ${me}::uuid)
          AND (m.status IN ('pending', 'active')
               OR (m.status IN ('declined', 'ended') AND m.updated_at > now() - interval '30 days'))
          AND p.status = 'active'::account_status
        ORDER BY m.updated_at DESC
        LIMIT ${M.LIST_MAX}`,
    ]);
    const links = rows.map((row) => linkDto(row, me));
    return {
      success: true, enabled: true,
      available: Boolean(mine.length && mine[0].mentoring_available === true),
      hasMentorRole,
      asMentee: links.filter((l) => l.myRole === 'mentee'),
      asMentor: links.filter((l) => l.myRole === 'mentor'),
    };
  } catch (err) {
    if (isMissingSchema(err)) return { ...empty, enabled: true, hasMentorRole, tableMissing: true };
    throw err;
  }
}

// apiMentoringListMentors: membros que se oferecem (cargo mentor ou disponibilidade), sem a própria pessoa nem bloqueios
export async function listMentors(sql, identity) {
  assertParticipant(identity);
  const me = identity.profileId;
  if (!(await isEnabled(sql, M.FLAG, identity))) return { success: true, enabled: false, mentors: [] };
  await enforceWriteLimit(sql, 'MENTORING_READ', me, M.READ_RATE_LIMIT, 'de consultas da mentoria');
  try {
    const rows = await sql`
      SELECT p.id AS peer_id, p.full_name, p.username, p.avatar_url,
             (SELECT m.status FROM mentorships m
              WHERE m.status IN ('pending', 'active')
                AND LEAST(m.mentor_id, m.mentee_id) = LEAST(p.id, ${me}::uuid)
                AND GREATEST(m.mentor_id, m.mentee_id) = GREATEST(p.id, ${me}::uuid)
              LIMIT 1) AS link_status
      FROM profiles p
      WHERE p.id <> ${me}::uuid
        AND p.status = 'active'::account_status AND p.email_confirmed_at IS NOT NULL
        AND p.role IN ('member'::user_role, 'admin'::user_role)
        AND (p.mentoring_available
             OR EXISTS (SELECT 1 FROM member_roles r WHERE r.profile_id = p.id AND r.role = ${MENTOR_ROLE}))
        AND NOT EXISTS (
          SELECT 1 FROM profile_blocks b
          WHERE (b.blocker_id = p.id AND b.blocked_id = ${me}::uuid) OR (b.blocker_id = ${me}::uuid AND b.blocked_id = p.id))
      ORDER BY p.full_name ASC
      LIMIT ${M.LIST_MAX}`;
    return { success: true, enabled: true, mentors: rows.map((row) => ({ ...peerDto(row), linkStatus: row.link_status || null })) };
  } catch (err) {
    if (isMissingSchema(err)) return { success: true, enabled: true, mentors: [], tableMissing: true };
    throw err;
  }
}

// apiMentoringGetMenteeProgress: { id } do vínculo. Resumo agregado, só ao mentor, só ativo e só com share_progress.
export async function getMenteeProgress(sql, identity, input) {
  assertParticipant(identity);
  const id = requireUuid(input.id, 'Vínculo inválido.');
  if (!(await isEnabled(sql, M.FLAG, identity))) throw E.ConflictError(FLAG_OFF_MESSAGE);
  await enforceWriteLimit(sql, 'MENTORING_READ', identity.profileId, M.READ_RATE_LIMIT, 'de consultas da mentoria');
  const link = await reading(async () => {
    const rows = await sql`
      SELECT mentee_id, share_progress FROM mentorships
      WHERE id = ${id}::uuid AND mentor_id = ${identity.profileId}::uuid AND status = 'active'`;
    return rows[0] || null;
  });
  if (!link) throw E.NotFoundError(NOT_FOUND_LINK);
  if (link.share_progress !== true) throw E.ForbiddenError('Esta pessoa ainda não compartilha o progresso com você.');
  const target = { profileId: link.mentee_id };
  const [stats, engagement] = await Promise.all([getMyStats(sql, target), getEngagement(sql, target)]);
  return { success: true, summary: summarize(stats.stats, engagement.engagement) };
}

/** Só o agregado: nada de respostas, tentativas individuais, insígnias nem identidade. */
export function summarize(stats, engagement) {
  const byModule = (stats && stats.byModule) || {};
  return {
    accuracyPct: stats && stats.accuracyPct !== undefined ? stats.accuracyPct : null,
    questionsAnswered: Number(stats && stats.questionsAnswered) || 0,
    totalActivities: Number(stats && stats.totalActivities) || 0,
    modules: C.LEARNING_MODULES.map((module) => ({
      module,
      attempts: Number(byModule[module] && byModule[module].attempts) || 0,
      accuracyPct: byModule[module] && byModule[module].accuracyPct !== undefined ? byModule[module].accuracyPct : null,
    })),
    streak: {
      current: Number(engagement && engagement.streak && engagement.streak.current) || 0,
      best: Number(engagement && engagement.streak && engagement.streak.best) || 0,
    },
  };
}

/** Leitura que degrada: sem a migração, o vínculo "não existe" (nunca 500). */
async function reading(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

// apiMentoringSetAvailability: { available } — "Estou disponível como mentor"
export async function setAvailability(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const available = requireBoolean(input.available, 'Valor inválido para disponibilidade.');
  return writing(async () => {
    await sql`UPDATE profiles SET mentoring_available = ${available}, updated_at = now() WHERE id = ${identity.profileId}::uuid`;
    await Logging.logAudit(sql, correlationId, identity.profileId, available ? 'MENTORING_AVAILABLE_ON' : 'MENTORING_AVAILABLE_OFF', 'profile', identity.profileId, 'success', null);
    return { success: true, available, message: available ? 'Você aparece como mentor disponível.' : 'Você não aparece mais como mentor disponível.' };
  });
}

/** O mentor-alvo existe, está ativo, se oferece e não há bloqueio entre as partes? Id ou null (sem dizer o motivo). */
async function findOfferingMentor(sql, mentorId, me) {
  const rows = await sql`
    SELECT p.id FROM profiles p
    WHERE p.id = ${mentorId}::uuid AND p.id <> ${me}::uuid
      AND p.status = 'active'::account_status AND p.email_confirmed_at IS NOT NULL
      AND p.role IN ('member'::user_role, 'admin'::user_role)
      AND (p.mentoring_available
           OR EXISTS (SELECT 1 FROM member_roles r WHERE r.profile_id = p.id AND r.role = ${MENTOR_ROLE}))
      AND NOT EXISTS (
        SELECT 1 FROM profile_blocks b
        WHERE (b.blocker_id = p.id AND b.blocked_id = ${me}::uuid) OR (b.blocker_id = ${me}::uuid AND b.blocked_id = p.id))`;
  return rows.length ? rows[0].id : null;
}

async function countOf(sql, column, profileId, status) {
  const rows = column === 'mentee_id'
    ? await sql`SELECT count(*)::int AS n FROM mentorships WHERE mentee_id = ${profileId}::uuid AND status = ${status}`
    : await sql`SELECT count(*)::int AS n FROM mentorships WHERE mentor_id = ${profileId}::uuid AND status = ${status}`;
  return rows.length ? Number(rows[0].n) || 0 : 0;
}

async function assertRequestRoom(sql, me, mentorId) {
  if ((await countOf(sql, 'mentee_id', me, 'pending')) >= M.OPEN_REQUESTS_MAX) {
    throw E.ConflictError('Você já tem ' + M.OPEN_REQUESTS_MAX + ' pedidos aguardando resposta. Espere uma resposta ou cancele algum.');
  }
  if ((await countOf(sql, 'mentee_id', me, 'active')) >= M.ACTIVE_MENTORS_MAX) {
    throw E.ConflictError('Você já tem ' + M.ACTIVE_MENTORS_MAX + ' mentores ativos. Encerre algum vínculo antes de pedir outro.');
  }
  const busy = (await countOf(sql, 'mentor_id', mentorId, 'pending')) >= M.PENDING_INBOX_MAX
    || (await countOf(sql, 'mentor_id', mentorId, 'active')) >= M.ACTIVE_MENTEES_MAX;
  if (busy) throw E.ConflictError('Este mentor não está recebendo novos pedidos agora. Tente outra pessoa ou volte mais tarde.');
  const recent = await sql`
    SELECT 1 FROM mentorships
    WHERE status = 'declined' AND mentor_id = ${mentorId}::uuid AND mentee_id = ${me}::uuid
      AND updated_at > now() - make_interval(days => ${M.DECLINE_COOLDOWN_DAYS})
    LIMIT 1`;
  if (recent.length) throw E.ConflictError('Este mentor não pôde aceitar seu pedido há pouco. Tente de novo mais tarde.');
}

// apiMentoringRequest: { mentorId, shareProgress? } — a pessoa mentorada (sessão) pede a um mentor
export async function request(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const me = identity.profileId;
  const mentorId = requireUuid(input.mentorId, 'Mentor inválido.');
  if (mentorId === me) throw E.ValidationError('Não é possível pedir mentoria a si mesmo.');
  const share = input.shareProgress === undefined ? false : requireBoolean(input.shareProgress, 'Valor inválido para compartilhar o progresso.');
  return writing(async () => {
    if (!(await findOfferingMentor(sql, mentorId, me))) throw E.NotFoundError('Mentor não encontrado ou indisponível.');
    await assertRequestRoom(sql, me, mentorId);
    let rows;
    try {
      rows = await sql`
        INSERT INTO mentorships (mentor_id, mentee_id, status, requested_by, share_progress)
        VALUES (${mentorId}::uuid, ${me}::uuid, 'pending', ${me}::uuid, ${share})
        RETURNING id`;
    } catch (err) {
      if (err && err.code === UNIQUE_VIOLATION) throw E.ConflictError('Já existe um vínculo de mentoria aberto com esta pessoa.');
      throw err;
    }
    await Logging.logAudit(sql, correlationId, me, 'MENTORING_REQUEST', 'mentorship', rows[0].id, 'success', { shareProgress: share });
    return { success: true, id: rows[0].id, message: 'Pedido de mentoria enviado.' };
  });
}

// apiMentoringRespond: { id, accept } — só o mentor do vínculo, só em pedido pendente aberto pela outra parte
export async function respond(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const me = identity.profileId;
  const id = requireUuid(input.id, 'Vínculo inválido.');
  const accept = requireBoolean(input.accept, 'Resposta inválida.');
  return writing(async () => {
    if (accept) await assertCanAccept(sql, identity, id);
    const rows = await sql`
      UPDATE mentorships
      SET status = ${accept ? 'active' : 'declined'}, share_progress = (share_progress AND ${accept}::boolean),
          updated_at = now()
      WHERE id = ${id}::uuid AND mentor_id = ${me}::uuid AND requested_by <> ${me}::uuid AND status = 'pending'
      RETURNING id`;
    if (!rows.length) throw E.NotFoundError('Pedido não encontrado ou já respondido.');
    await Logging.logAudit(sql, correlationId, me, accept ? 'MENTORING_ACCEPT' : 'MENTORING_DECLINE', 'mentorship', id, 'success', null);
    return { success: true, message: accept ? 'Mentoria aceita.' : 'Pedido recusado.' };
  });
}

/** Aceitar exige ser mentor elegível (cargo ou disponibilidade) e vaga na conta das duas partes. */
async function assertCanAccept(sql, identity, id) {
  if (!(await isEligibleMentor(sql, identity))) {
    throw E.ForbiddenError('Para aceitar pedidos, ative "Estou disponível como mentor" ou receba o cargo de mentor.');
  }
  if ((await countOf(sql, 'mentor_id', identity.profileId, 'active')) >= M.ACTIVE_MENTEES_MAX) {
    throw E.ConflictError('Você já tem ' + M.ACTIVE_MENTEES_MAX + ' mentorados ativos.');
  }
  const link = await sql`SELECT mentee_id FROM mentorships WHERE id = ${id}::uuid AND mentor_id = ${identity.profileId}::uuid AND status = 'pending'`;
  if (link.length && (await countOf(sql, 'mentee_id', link[0].mentee_id, 'active')) >= M.ACTIVE_MENTORS_MAX) {
    throw E.ConflictError('Esta pessoa já tem o máximo de mentores ativos.');
  }
}

// apiMentoringEnd: { id } — qualquer parte encerra um vínculo ativo; quem pediu cancela o próprio pedido pendente
export async function end(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const me = identity.profileId;
  const id = requireUuid(input.id, 'Vínculo inválido.');
  return writing(async () => {
    const rows = await sql`
      UPDATE mentorships SET status = 'ended', share_progress = FALSE, updated_at = now()
      WHERE id = ${id}::uuid AND (mentor_id = ${me}::uuid OR mentee_id = ${me}::uuid)
        AND (status = 'active' OR (status = 'pending' AND requested_by = ${me}::uuid))
      RETURNING id, status`;
    if (!rows.length) throw E.NotFoundError(NOT_FOUND_LINK);
    await Logging.logAudit(sql, correlationId, me, 'MENTORING_END', 'mentorship', id, 'success', null);
    return { success: true, message: 'Mentoria encerrada.' };
  });
}

// apiMentoringSetShare: { id, share } — só a PESSOA MENTORADA decide; vale para vínculo pendente ou ativo
export async function setShareProgress(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const me = identity.profileId;
  const id = requireUuid(input.id, 'Vínculo inválido.');
  const share = requireBoolean(input.share, 'Valor inválido para compartilhar o progresso.');
  return writing(async () => {
    const rows = await sql`
      UPDATE mentorships SET share_progress = ${share}, updated_at = now()
      WHERE id = ${id}::uuid AND mentee_id = ${me}::uuid AND status IN ('pending', 'active')
      RETURNING id`;
    if (!rows.length) throw E.NotFoundError(NOT_FOUND_LINK);
    await Logging.logAudit(sql, correlationId, me, share ? 'MENTORING_SHARE_ON' : 'MENTORING_SHARE_OFF', 'mentorship', id, 'success', null);
    return { success: true, shareProgress: share, message: share ? 'Seu mentor agora vê o resumo do seu progresso.' : 'Seu mentor não vê mais o seu progresso.' };
  });
}
