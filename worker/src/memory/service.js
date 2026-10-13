/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/service.js
 * Memória de estudo da própria pessoa (ADR 0007): consentir/revogar, ver, definir preferência, apagar item ou tudo e
 * exportar. A identidade vem SEMPRE da sessão. Tudo atrás de `memory_enabled`, de maioridade (agents/eligibility.js) e
 * de papel (membro/admin); a ESCRITA exige consentimento vigente na versão atual da finalidade; só vale o que está no
 * vocabulário controlado (memory/vocabulary.js): texto livre é recusado. Nada aqui é escrito por modelo de IA.
 *
 * Erros no estilo do agentsService (AgentError com `code`): MEMORY_DISABLED | MEMORY_UNAVAILABLE | CONSENT_REQUIRED |
 * MEMORY_FULL | RATE_LIMIT | VALIDATION | NOT_FOUND (esperados; a mensagem vai ao cliente).
 *
 * Apagar é um direito: revogar e apagar item/tudo funcionam mesmo com `memory_enabled` desligada ou o aceite
 * desatualizado (só exigem o banco de memória configurado). REVOGAR grava a revogação no núcleo PRIMEIRO (falha fechada:
 * a leitura fecha antes de qualquer outra coisa) e depois apaga na memória; se o apagamento falhar, a pessoa entra na
 * fila (memory/cleanup.js).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { isEnabled, isMissingTable } from '../services/featureFlagService.js';
import { createMemoryDb } from '../db.js';
import * as Store from './store.js';
import { memoryKeyConfigured, subjectIdFor } from './subject.js';
import { ineligibleReason, consentState, toIso } from './policy.js';
import { readMinorsEnabled } from '../agents/eligibility.js';
import { validateMemberItem, MemoryInputError, TOPICS, vocabularyView } from './vocabulary.js';
import { eraseSubject, settlePurge, drainSoon, errorCode } from './cleanup.js';
import { cacheInvalidate } from './tutorCache.js';

const { AgentError } = E;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLAG_MINORS = 'minors_enabled';

const MESSAGES = Object.freeze({
  flag: 'A memória de estudo está indisponível no momento.',
  role: 'A memória de estudo não está disponível para o seu perfil.',
  age: 'A memória de estudo está disponível apenas para maiores de 18 anos.',
  unavailable: 'A memória de estudo está indisponível agora. Tente novamente mais tarde.',
  rate: 'Você fez muitas operações na memória de estudo. Tente novamente mais tarde.',
  consent: 'Ative a memória de estudo e aceite o termo para guardar preferências.',
  full: 'Você chegou ao limite de itens da memória. Apague algum item para guardar outro.',
  eraseFailed: 'A memória foi desativada e já não é usada, mas não conseguimos concluir o apagamento agora. Tente desativar de novo em alguns instantes.',
  pending: 'Estamos concluindo o apagamento da sua memória anterior. Tente ativar novamente mais tarde.',
});

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const disabled = (reason) => AgentError('MEMORY_DISABLED', MESSAGES[reason], { reason });
// Sem `reason`: o motivo interno (sem banco, sem chave, falha) não vai ao cliente; fica só no log técnico, sem segredos.
const unavailable = () => AgentError('MEMORY_UNAVAILABLE', MESSAGES.unavailable);

async function flagOn(sql, identity, key) {
  try {
    return await isEnabled(sql, key, identity);
  } catch (err) {
    return false; // falha fechada: sem saber, a memória fica desligada
  }
}

/** null quando a memória está liberada para a pessoa; senão 'flag' | 'role' | 'age' (flag, papel e maioridade). */
export async function featureReason(sql, identity) {
  if (!(await flagOn(sql, identity, C.MEMORY.FLAG))) return 'flag';
  // minors_enabled falha FECHADO (erro de leitura = "menores habilitados" = exige maioridade confirmada); a flag da
  // memória acima falha fechada no outro sentido (sem saber, desligada).
  const minorsEnabled = await readMinorsEnabled(() => isEnabled(sql, FLAG_MINORS, identity));
  return ineligibleReason(identity, { minorsEnabled });
}

/** Flag, papel e maioridade: lança MEMORY_DISABLED. */
async function assertFeature(sql, identity) {
  const reason = await featureReason(sql, identity);
  if (reason) throw disabled(reason);
}

async function enforce(sql, identity, bucket) {
  const limit = C.RATE_LIMITS[bucket];
  try {
    await S.enforceRateLimit(sql, bucket, identity.profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') throw AgentError('RATE_LIMIT', MESSAGES.rate, { rateLimited: true });
    throw err;
  }
}

/** { msql, subject } ou MEMORY_UNAVAILABLE (sem banco, sem chave ou id inválido). */
async function openStore(env, identity) {
  const msql = createMemoryDb(env);
  if (!msql || !memoryKeyConfigured(env)) throw unavailable();
  try {
    return { msql, subject: await subjectIdFor(env, identity.profileId) };
  } catch (err) {
    throw unavailable();
  }
}

/** Roda uma operação no banco de memória; qualquer falha vira MEMORY_UNAVAILABLE (e o teto do gatilho passa como está). */
async function guard(sql, correlationId, op) {
  try {
    return await op();
  } catch (err) {
    if (err && err.expected) throw err;
    if (Store.isCapError(err)) throw AgentError('MEMORY_FULL', MESSAGES.full, { reason: 'cap' });
    await Logging.logError(sql, correlationId, 'MEMORY_DB_FAILED', 'Falha no banco de memória.', { code: errorCode(err) });
    throw unavailable();
  }
}

export async function readConsent(sql, profileId) {
  try {
    const rows = await sql`
      SELECT status, purpose_version, granted_at, revoked_at FROM member_memory_consent WHERE profile_id = ${profileId}::uuid`;
    return rows[0] || null;
  } catch (err) {
    if (isMissingTable(err)) return null; // 036 ainda não aplicada: sem consentimento
    throw err;
  }
}

async function writeConsent(sql, profileId, granted) {
  const rows = granted
    ? await sql`
        INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at, revoked_at, updated_at)
        VALUES (${profileId}::uuid, 'granted', ${C.MEMORY.PURPOSE_VERSION}, now(), NULL, now())
        ON CONFLICT (profile_id) DO UPDATE SET status = 'granted', purpose_version = EXCLUDED.purpose_version,
          granted_at = now(), revoked_at = NULL, updated_at = now()
        RETURNING status, purpose_version, granted_at, revoked_at`
    : await sql`
        INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at, revoked_at, updated_at)
        VALUES (${profileId}::uuid, 'revoked', ${C.MEMORY.PURPOSE_VERSION}, NULL, now(), now())
        ON CONFLICT (profile_id) DO UPDATE SET status = 'revoked', revoked_at = now(), updated_at = now()
        RETURNING status, purpose_version, granted_at, revoked_at`;
  return consentState(rows[0]);
}

const topicLabel = (slug) => (TOPICS[slug] ? TOPICS[slug].label : null);

export function itemView(item) {
  return {
    id: item.id, kind: item.kind, slug: item.slug, label: topicLabel(item.slug), level: item.level, value: item.value,
    source: item.source, evidence: item.evidence, lastUsedAt: item.lastUsedAt, expiresAt: item.expiresAt,
  };
}

const limitsView = () => ({
  maxItems: C.MEMORY.MAX_ITEMS,
  retentionUnusedDays: C.MEMORY.RETENTION_UNUSED_DAYS,
  retentionMaxMonths: C.MEMORY.RETENTION_MAX_MONTHS,
});

const head = () => ({ success: true, alpha: true, apiVersion: C.AGENTS.API_VERSION });

// ---------------------------------------------------------------------------
// apiMemoryGet
// ---------------------------------------------------------------------------
async function listForState(sql, env, identity, correlationId) {
  try {
    const { msql, subject } = await openStore(env, identity);
    return { available: true, items: (await guard(sql, correlationId, () => Store.listItems(msql, subject))).map(itemView) };
  } catch (err) {
    return { available: false, items: [] };
  }
}

/** Estado para a tela: consentimento, vocabulário e (só com consentimento vigente) os itens. */
export async function getState(sql, env, identity, correlationId) {
  await assertFeature(sql, identity);
  await enforce(sql, identity, 'MEMORY_READ');
  const consent = consentState(await readConsent(sql, identity.profileId));
  const listed = consent.current ? await listForState(sql, env, identity, correlationId) : { available: !!createMemoryDb(env) && memoryKeyConfigured(env), items: [] };
  return { ...head(), ...listed, consent, limits: limitsView(), vocabulary: vocabularyView() };
}

// ---------------------------------------------------------------------------
// apiMemorySetConsent
// ---------------------------------------------------------------------------
async function grantConsent(sql, env, identity, input, correlationId) {
  await assertFeature(sql, identity);
  await openStore(env, identity); // sem banco/chave não há o que consentir
  if (input.purposeVersion !== C.MEMORY.PURPOSE_VERSION) {
    throw AgentError('VALIDATION', 'O termo da memória foi atualizado. Recarregue a página e leia de novo antes de aceitar.', { reason: 'version', purposeVersion: C.MEMORY.PURPOSE_VERSION });
  }
  await enforce(sql, identity, 'MEMORY_CONSENT');
  if (!(await settlePurge(sql, env, identity.profileId))) throw AgentError('MEMORY_UNAVAILABLE', MESSAGES.pending, { reason: 'pending_purge' });
  const consent = await writeConsent(sql, identity.profileId, true);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MEMORY_CONSENT_GRANTED', 'member_memory_consent', identity.profileId, 'success', { purposeVersion: C.MEMORY.PURPOSE_VERSION });
  return { ...head(), consent };
}

async function revokeConsent(sql, env, identity, correlationId) {
  await enforce(sql, identity, 'MEMORY_ERASE'); // revogar nunca esbarra nos limites de consentimento/escrita
  const consent = await writeConsent(sql, identity.profileId, false); // núcleo PRIMEIRO: falhou, nada foi dito ao membro
  cacheInvalidate(identity.profileId);
  const outcome = await eraseSubject(sql, env, identity.profileId, 'revoked');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MEMORY_CONSENT_REVOKED', 'member_memory_consent', identity.profileId, outcome.erased || outcome.queued ? 'success' : 'failure', { erased: outcome.erased, queued: outcome.queued });
  if (!outcome.erased && !outcome.queued) {
    // A revogação já vale (a leitura está fechada), mas nem apagou nem enfileirou: o cliente precisa saber e tentar de novo.
    await Logging.logError(sql, correlationId, 'MEMORY_ERASE_NOT_QUEUED', 'Revogação gravada, mas o apagamento não foi concluído nem enfileirado.', null);
    throw AgentError('MEMORY_UNAVAILABLE', MESSAGES.eraseFailed, { revoked: true });
  }
  if (outcome.erased) await drainSoon(sql, env);
  return {
    ...head(), consent, erased: outcome.erased, queued: outcome.queued,
    message: outcome.erased ? 'Memória desativada e apagada.' : 'Memória desativada. O apagamento está em andamento e termina em até 24 horas.',
  };
}

/** Input: { granted: boolean, purposeVersion?: string (obrigatório para ativar) }. */
export async function setConsent(sql, env, identity, rawInput, correlationId) {
  const input = obj(rawInput);
  if (typeof input.granted !== 'boolean') throw AgentError('VALIDATION', 'Informe se deseja ativar ou desativar a memória de estudo.');
  return input.granted ? grantConsent(sql, env, identity, input, correlationId) : revokeConsent(sql, env, identity, correlationId);
}

// ---------------------------------------------------------------------------
// apiMemorySetPreference
// ---------------------------------------------------------------------------
async function requireConsent(sql, identity) {
  const consent = consentState(await readConsent(sql, identity.profileId));
  if (!consent.current) throw AgentError('CONSENT_REQUIRED', MESSAGES.consent, { reason: consent.needsReconsent ? 'version' : 'none' });
  return consent;
}

/** Input: { kind: 'topic_level'|'study_pref'|'goal', slug, level?, value? } — só itens do vocabulário, nunca texto livre. */
export async function setPreference(sql, env, identity, rawInput, correlationId) {
  await assertFeature(sql, identity);
  let item;
  try {
    item = validateMemberItem(rawInput);
  } catch (err) {
    if (err instanceof MemoryInputError) throw AgentError('VALIDATION', err.message);
    throw err;
  }
  await enforce(sql, identity, 'MEMORY_WRITE');
  await requireConsent(sql, identity);
  const { msql, subject } = await openStore(env, identity);
  const [saved] = await guard(sql, correlationId, () => Store.upsertItems(msql, subject, [item], C.MEMORY.PURPOSE_VERSION));
  cacheInvalidate(identity.profileId);
  return { ...head(), item: itemView(saved) };
}

// ---------------------------------------------------------------------------
// apiMemoryDeleteItem / apiMemoryDeleteAll
// ---------------------------------------------------------------------------
/** Input: { id }. Apagar vale mesmo com a flag desligada ou o aceite desatualizado. */
export async function deleteItem(sql, env, identity, rawInput, correlationId) {
  const id = obj(rawInput).id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw AgentError('VALIDATION', 'Item inválido.');
  await enforce(sql, identity, 'MEMORY_ERASE');
  const { msql, subject } = await openStore(env, identity);
  const removed = await guard(sql, correlationId, () => Store.deleteItem(msql, subject, id.toLowerCase()));
  cacheInvalidate(identity.profileId);
  if (!removed) throw AgentError('NOT_FOUND', 'Item não encontrado.');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MEMORY_ITEM_DELETED', 'member_memory_consent', identity.profileId, 'success', null);
  return { ...head(), deleted: 1 };
}

/** Apaga tudo da pessoa SEM revogar o consentimento (para recomeçar). */
export async function deleteAll(sql, env, identity, correlationId) {
  await enforce(sql, identity, 'MEMORY_ERASE');
  const { msql, subject } = await openStore(env, identity);
  const deleted = await guard(sql, correlationId, () => Store.deleteAll(msql, subject));
  cacheInvalidate(identity.profileId);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MEMORY_ALL_DELETED', 'member_memory_consent', identity.profileId, 'success', { deleted });
  await drainSoon(sql, env);
  return { ...head(), deleted };
}

// ---------------------------------------------------------------------------
// apiMemoryExport (portabilidade)
// ---------------------------------------------------------------------------
const exportItem = (i) => ({
  kind: i.kind, slug: i.slug, label: topicLabel(i.slug), level: i.level, value: i.value, source: i.source, evidence: i.evidence,
  createdAt: i.createdAt, updatedAt: i.updatedAt, lastUsedAt: i.lastUsedAt, expiresAt: i.expiresAt,
});

/** Tudo o que existe da pessoa (inclusive de aceite antigo), em JSON legível. Sem identificadores internos. */
export async function exportData(sql, env, identity, correlationId) {
  await assertFeature(sql, identity);
  await enforce(sql, identity, 'MEMORY_EXPORT');
  const { msql, subject } = await openStore(env, identity);
  const consent = consentState(await readConsent(sql, identity.profileId));
  const items = await guard(sql, correlationId, () => Store.listAll(msql, subject));
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MEMORY_EXPORTED', 'member_memory_consent', identity.profileId, 'success', { items: items.length });
  return { ...head(), format: 'laift-memory/v1', exportedAt: toIso(new Date()), consent, items: items.map(exportItem) };
}
