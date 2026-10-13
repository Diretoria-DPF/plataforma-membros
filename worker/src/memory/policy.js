/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/policy.js
 * Política da memória de estudo (ADR 0007), em funções PURAS: quem pode (papel e maioridade), consentimento vigente
 * na versão atual da finalidade, retenção e teto. Nada de I/O aqui; o serviço consulta o banco e pergunta à política.
 *
 *   - papéis: só membro e admin (visitante nunca);
 *   - maioridade: a mesma decisão única do tutor (agents/eligibility.js, decisão do dono: só maiores de 18);
 *   - consentimento: precisa estar `granted` NA versão atual da finalidade (C.MEMORY.PURPOSE_VERSION). Versão antiga =
 *     leitura e escrita fechadas até novo aceite (os dados antigos não somem sozinhos; a pessoa pode apagar/exportar);
 *   - retenção: expira 180 dias sem uso e, no máximo, 12 meses depois de criado (o que vier primeiro);
 *   - teto: 60 itens por pessoa.
 */
import { MEMORY } from '../constants.js';
import { isEligibleAdult } from '../agents/eligibility.js';

const MEMORY_ROLES = Object.freeze(['member', 'admin']);
const DAY_MS = 24 * 60 * 60 * 1000;

/** null quando a pessoa pode usar a memória; senão 'role' ou 'age'. */
export function ineligibleReason(identity, { minorsEnabled = false } = {}) {
  if (!identity || !MEMORY_ROLES.includes(identity.role)) return 'role';
  return isEligibleAdult(identity, { minorsEnabled }) ? null : 'age';
}

/** Linha de member_memory_consent -> estado para a tela e para as decisões. */
export function consentState(row, purposeVersion = MEMORY.PURPOSE_VERSION) {
  if (!row) return { status: 'none', current: false, needsReconsent: false, purposeVersion, acceptedVersion: null, grantedAt: null, revokedAt: null };
  const granted = row.status === 'granted';
  const current = granted && row.purpose_version === purposeVersion;
  return {
    status: row.status,
    current,
    needsReconsent: granted && !current,
    purposeVersion,
    acceptedVersion: row.purpose_version || null,
    grantedAt: toIso(row.granted_at),
    revokedAt: toIso(row.revoked_at),
  };
}

export function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Mesma conta que o banco faz (upsert): o menor entre "último uso + 180 dias" e "criação + 12 meses". */
export function computeExpiry(createdAt, lastUsedAt) {
  const created = new Date(createdAt);
  const used = new Date(lastUsedAt);
  const unusedLimit = new Date(used.getTime() + MEMORY.RETENTION_UNUSED_DAYS * DAY_MS);
  const hardLimit = new Date(created);
  hardLimit.setUTCMonth(hardLimit.getUTCMonth() + MEMORY.RETENTION_MAX_MONTHS);
  return unusedLimit < hardLimit ? unusedLimit : hardLimit;
}

export const isExpired = (item, now = new Date()) => !item.expiresAt || new Date(item.expiresAt) <= now;

/** Pode ainda caber mais um item? (o gatilho do banco é a trava final) */
export const hasRoom = (count) => Number.isInteger(count) && count < MEMORY.MAX_ITEMS;

/** O estado do consentimento permite ler e gravar? */
export const consentAllowsUse = (state) => !!state && state.current === true;
