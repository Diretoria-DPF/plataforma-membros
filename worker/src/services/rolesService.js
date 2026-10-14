/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * rolesService.js
 * Cargos funcionais (member_roles, sql/038; ADR 0010): só o admin concede, retira e lista.
 * Conceder e retirar exigem reautenticação (senha e, se houver, o segundo fator: options.stepUp, do handler),
 * têm teto por admin e ficam em audit_logs (role_granted / role_revoked, só o cargo e se mudou algo).
 * Cargo privilegiado (gestor, revisor_conteudo, moderador, curador) só vai para quem já tem MFA ativo: assim
 * ninguém recebe um cargo e fica travado pelo portão de MFA logo em seguida.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { FUNCTIONAL_ROLES, PRIVILEGED_ROLES } from '../roles/capabilities.js';
import { hasConfirmedMfa } from './mfaService.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_MAX = 500;
const ELIGIBLE_BASE_ROLES = [C.ROLES.MEMBER, C.ROLES.ADMIN];

const MSG = Object.freeze({
  badPerson: 'Pessoa inválida.',
  badRole: 'Cargo inválido.',
  notFound: 'Pessoa não encontrada.',
  notEligible: 'Só membros e administradores podem ter cargos.',
  notActive: 'A conta da pessoa não está ativa.',
  needsMfa: 'A pessoa precisa ativar a verificação em duas etapas antes de receber este cargo.',
  stepUp: 'Esta ação exige reautenticação.',
  changedMeanwhile: 'A situação da pessoa mudou durante a operação. Confira e tente de novo.',
  granted: 'Cargo concedido.',
  alreadyGranted: 'A pessoa já tinha este cargo.',
  revoked: 'Cargo retirado.',
  alreadyRevoked: 'A pessoa não tinha este cargo.',
});

function parseProfileId(value) {
  const id = S.normalizeText(value);
  if (!UUID_RE.test(id)) throw E.ValidationError(MSG.badPerson);
  return id.toLowerCase();
}

function parseChange(input) {
  const role = typeof input.role === 'string' ? input.role : '';
  if (!FUNCTIONAL_ROLES.includes(role)) throw E.ValidationError(MSG.badRole);
  return { profileId: parseProfileId(input.profileId), role };
}

/** Teto de escritas e reautenticação (o papel de admin já foi conferido antes de ler a entrada). */
async function authorizeWrite(sql, identity, options) {
  const limit = C.ROLE_RATE_LIMITS.ROLE_ADMIN_WRITE;
  await S.enforceRateLimit(sql, 'ROLE_ADMIN_WRITE', identity.profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
  if (!options || typeof options.stepUp !== 'function') throw E.ForbiddenError(MSG.stepUp);
  await options.stepUp();
}

async function findTarget(sql, profileId) {
  const rows = await sql`SELECT role, status FROM profiles WHERE id = ${profileId}::uuid`;
  if (!rows.length) throw E.NotFoundError(MSG.notFound);
  return rows[0];
}

async function assertGrantable(sql, profileId, role) {
  const target = await findTarget(sql, profileId);
  if (!ELIGIBLE_BASE_ROLES.includes(target.role)) throw E.ValidationError(MSG.notEligible);
  if (target.status !== C.ACCOUNT_STATUS.ACTIVE) throw E.ValidationError(MSG.notActive);
  if (PRIVILEGED_ROLES.includes(role) && !(await hasConfirmedMfa(sql, profileId))) {
    throw E.ValidationError(MSG.needsMfa);
  }
}

async function rolesOf(sql, profileId) {
  const rows = await sql`SELECT role FROM member_roles WHERE profile_id = ${profileId}::uuid ORDER BY role`;
  return rows.map((r) => r.role);
}

async function finish(sql, correlationId, identity, change, action, changed, messages) {
  await Logging.logAudit(sql, correlationId, identity.profileId, action, 'profile', change.profileId, 'success',
    { role: change.role, changed });
  return {
    success: true,
    message: changed ? messages[0] : messages[1],
    changed,
    profileId: change.profileId,
    roles: await rolesOf(sql, change.profileId),
  };
}

export async function grantRole(sql, identity, rawInput, correlationId, options) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const change = parseChange(rawInput || {});
  await authorizeWrite(sql, identity, options);
  await assertGrantable(sql, change.profileId, change.role);
  const changed = await insertIfStillGrantable(sql, change, identity.profileId);
  return finish(sql, correlationId, identity, change, 'role_granted', changed, [MSG.granted, MSG.alreadyGranted]);
}

/**
 * Grava repetindo as condições no mesmo comando (conta ativa, papel member/admin e, para cargo privilegiado, MFA
 * confirmado): fecha a janela entre a conferência acima e a escrita. Nada gravado e cargo ausente: a situação mudou.
 */
async function insertIfStillGrantable(sql, change, grantedBy) {
  const privileged = PRIVILEGED_ROLES.includes(change.role);
  const inserted = await sql`
    INSERT INTO member_roles (profile_id, role, granted_by)
    SELECT p.id, ${change.role}, ${grantedBy}::uuid
    FROM profiles p
    WHERE p.id = ${change.profileId}::uuid
      AND p.status = ${C.ACCOUNT_STATUS.ACTIVE} AND p.role IN (${C.ROLES.MEMBER}, ${C.ROLES.ADMIN})
      AND (NOT ${privileged}::boolean OR EXISTS (
        SELECT 1 FROM mfa_credentials m WHERE m.profile_id = p.id AND m.confirmed_at IS NOT NULL
      ))
    ON CONFLICT (profile_id, role) DO NOTHING
    RETURNING profile_id
  `;
  if (inserted.length) return true;
  if ((await rolesOf(sql, change.profileId)).includes(change.role)) return false;
  throw E.ConflictError(MSG.changedMeanwhile);
}

/** Retirar vale para qualquer conta existente (inclusive banida ou rebaixada a visitante). */
export async function revokeRole(sql, identity, rawInput, correlationId, options) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const change = parseChange(rawInput || {});
  await authorizeWrite(sql, identity, options);
  await findTarget(sql, change.profileId);
  const removed = await sql`
    DELETE FROM member_roles WHERE profile_id = ${change.profileId}::uuid AND role = ${change.role}
    RETURNING profile_id
  `;
  return finish(sql, correlationId, identity, change, 'role_revoked', removed.length > 0, [MSG.revoked, MSG.alreadyRevoked]);
}

/** Cargos de uma pessoa ({ profileId }) ou de todas que têm algum (nome e cargos; sem e-mail). */
export async function listRoles(sql, identity, rawInput) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const input = rawInput || {};
  if (input.profileId !== undefined && input.profileId !== null && input.profileId !== '') {
    const profileId = parseProfileId(input.profileId);
    return { success: true, profileId, roles: await rolesOf(sql, profileId) };
  }
  const rows = await sql`
    SELECT mr.profile_id, p.full_name, p.role AS base_role, array_agg(mr.role ORDER BY mr.role) AS roles
    FROM member_roles mr JOIN profiles p ON p.id = mr.profile_id
    GROUP BY mr.profile_id, p.full_name, p.role
    ORDER BY lower(p.full_name)
    LIMIT ${LIST_MAX}
  `;
  return {
    success: true,
    available: FUNCTIONAL_ROLES,
    people: rows.map((r) => ({ profileId: r.profile_id, fullName: r.full_name, baseRole: r.base_role, roles: r.roles })),
  };
}
