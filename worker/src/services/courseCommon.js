/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * courseCommon.js — peças comuns de cursos, prova, certificado e requisito de evento (sql/056–058).
 * Portão de flag, papel, validação de UUID, limites de taxa e a degradação quando a migração ainda não foi
 * aplicada (tabela ausente vira mensagem clara, nunca 500). Mensagens nunca ecoam a entrada nem detalhes do banco.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import { enforceWriteLimit } from '../writeLimits.js';
import { isEnabled } from './featureFlagService.js';

const K = C.COURSES;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OFF_MESSAGE = 'Os cursos ainda não estão disponíveis.';
export const CERT_OFF_MESSAGE = 'Os certificados ainda não estão disponíveis.';
export const PENDING_MESSAGE = 'Os cursos ainda não estão disponíveis: falta aplicar a atualização do banco de dados.';
const LEARNER_ROLES = [C.ROLES.MEMBER, C.ROLES.ADMIN];

/** Tabela das migrações 056–058 ausente (Postgres 42P01). */
export function isMissingTable(err) {
  const msg = String((err && err.message) || '');
  return Boolean(err && (err.code === '42P01' || /relation .* does not exist/i.test(msg)));
}

/** Roda a consulta; tabela ausente vira erro esperado com mensagem de atualização pendente. */
export async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTable(err)) throw E.ConflictError(PENDING_MESSAGE);
    throw err;
  }
}

export function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw E.ValidationError((label || 'Identificador') + ' inválido.');
  return value.toLowerCase();
}

/** Cursos são de membros (e admin). Visitante não estuda para certificado. */
export function requireLearner(identity) {
  S.requireRole(identity, LEARNER_ROLES);
}

export async function requireFlag(sql, key, identity, message) {
  if (!(await isEnabled(sql, key, identity))) throw E.ForbiddenError(message || OFF_MESSAGE);
}

export async function flagOn(sql, key, identity) {
  return isEnabled(sql, key, identity);
}

export const limitRead = (sql, identity) => enforceWriteLimit(sql, 'COURSES_READ', identity.profileId, K.READ_RATE_LIMIT, 'de consultas aos cursos');
export const limitWrite = (sql, identity) => enforceWriteLimit(sql, 'COURSES_WRITE', identity.profileId, K.WRITE_RATE_LIMIT, 'de ações nos cursos');
export const limitExam = (sql, identity) => enforceWriteLimit(sql, 'COURSES_EXAM', identity.profileId, K.EXAM_RATE_LIMIT, 'de ações na prova');
export const limitAdmin = (sql, identity) => enforceWriteLimit(sql, 'COURSES_ADMIN', identity.profileId, K.ADMIN_RATE_LIMIT, 'de ações de gestão dos cursos');

export const iso = (value) => (value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null);

/** Inteiro aleatório uniforme em [0, n) com crypto (sem viés de módulo). */
export function randomInt(n) {
  if (!Number.isInteger(n) || n <= 0) throw new Error('randomInt: n inválido');
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Embaralhamento de Fisher-Yates (cópia nova). */
export function shuffle(list, rand = randomInt) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/** Texto do aluno: nenhum marcador interno de conferência pode sair. */
export const INTERNAL_MARK_RE = /\[\s*VERIFICAR\b[^\]]*\]/i;
