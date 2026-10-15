/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * capabilities.js
 * Cargos funcionais (tabela member_roles, sql/038; ADR 0010) e as capacidades que cada um libera.
 * O papel base (profiles.role: visitor, member, admin) não muda: o cargo se SOMA a ele. Pura (sem I/O) e congelada.
 *
 *   admin      todas as capacidades, inclusive as exclusivas de administração.
 *   member     a união das capacidades dos seus cargos (vários cargos acumulam).
 *   visitor    nada (um cargo gravado para um visitante é ignorado).
 *
 * Os serviços decidem por capacidade (ROL-03): S.requireCapability usa capabilityCheck abaixo. As capacidades dos
 * cargos privilegiados só valem com a verificação em duas etapas ativa (identity.mfaConfirmed), com ou sem a flag.
 */

const freezeList = (list) => Object.freeze(list.slice());

export const ROLE_CAPS = Object.freeze({
  gestor: freezeList(['events.manage', 'tasks.manage', 'attendance.manage', 'proposals.review', 'orgchart.edit']),
  revisor_conteudo: freezeList(['content.review', 'sim.review']),
  moderador: freezeList(['reports.moderate', 'assistant.feedback.moderate']),
  curador: freezeList(['library.curate']),
  mentor: freezeList(['mentoring.offer']),
});

/** Nomes dos cargos (o CHECK de member_roles na 038 aceita exatamente estes). */
export const FUNCTIONAL_ROLES = freezeList(Object.keys(ROLE_CAPS));

/** Só o admin as tem; nenhum cargo as recebe. */
export const ADMIN_ONLY_CAPABILITIES = freezeList([
  'users.manage', 'flags', 'mfa.reset', 'audit.read', 'metrics.read', 'roles.grant', 'kb.reindex',
]);

export const CAPABILITIES = freezeList([
  ...new Set([...Object.values(ROLE_CAPS).flat(), ...ADMIN_ONLY_CAPABILITIES]),
]);

/** Cargos que dão poder sobre o conteúdo ou sobre outras pessoas: exigem verificação em duas etapas. */
export const PRIVILEGED_ROLES = freezeList(['gestor', 'revisor_conteudo', 'moderador', 'curador']);

const BASE_ADMIN = 'admin';
const BASE_MEMBER = 'member';

/** Cargos conhecidos, sem repetição, na ordem de FUNCTIONAL_ROLES (lista nova e congelada). */
export function normalizeFunctionalRoles(list) {
  const given = Array.isArray(list) ? list : [];
  return freezeList(FUNCTIONAL_ROLES.filter((role) => given.includes(role)));
}

/** Capacidades efetivas da pessoa, na ordem de CAPABILITIES (lista nova e congelada). */
export function capabilitiesFor({ baseRole, functionalRoles } = {}) {
  if (baseRole === BASE_ADMIN) return CAPABILITIES;
  if (baseRole !== BASE_MEMBER) return freezeList([]);
  const granted = new Set(normalizeFunctionalRoles(functionalRoles).flatMap((role) => ROLE_CAPS[role]));
  return freezeList(CAPABILITIES.filter((cap) => granted.has(cap)));
}

/** Capacidades que vêm de um cargo privilegiado: só valem com o MFA ativo. */
export const PRIVILEGED_CAPABILITIES = freezeList([...new Set(PRIVILEGED_ROLES.flatMap((role) => ROLE_CAPS[role]))]);

/**
 * Decide uma capacidade (pura): 'ok', 'missing' (não tem) ou 'mfa' (tem pelo cargo, mas sem MFA ativo).
 * O admin passa em qualquer uma (o MFA dele segue a flag mfa_required, no portão de runWithSession).
 */
export function capabilityCheck(identity, capability) {
  if (identity && identity.role === BASE_ADMIN) return 'ok';
  if (!identity || identity.role !== BASE_MEMBER) return 'missing';
  const caps = identity && Array.isArray(identity.capabilities) ? identity.capabilities : [];
  if (!caps.includes(capability)) return 'missing';
  if (PRIVILEGED_CAPABILITIES.includes(capability) && identity.mfaConfirmed !== true) return 'mfa';
  return 'ok';
}

/** A pessoa precisa de verificação em duas etapas? Admin sempre; membro com ao menos um cargo privilegiado. */
export function requiresMfa({ baseRole, functionalRoles } = {}) {
  if (baseRole === BASE_ADMIN) return true;
  if (baseRole !== BASE_MEMBER) return false;
  return normalizeFunctionalRoles(functionalRoles).some((role) => PRIVILEGED_ROLES.includes(role));
}
