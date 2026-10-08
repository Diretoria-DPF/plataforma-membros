/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistantFeedbackService.js
 * Polegar e comentário sobre as respostas da Lia (sql/021, ADR 0005), painel de
 * satisfação do admin, fontes das citações (sql/020) e reindexação da base.
 *
 * - Quem avalia precisa estar logado (membro ou admin) e só avalia resposta da
 *   PRÓPRIA conversa: a checagem de dono está dentro do próprio INSERT.
 * - Comentário é texto puro: é guardado e devolvido como texto, nunca
 *   interpretado e nunca enviado à IA.
 * - O painel mostra só apelido e papel de quem avaliou (nada de nome ou e-mail).
 * - Tabela ausente (migração não aplicada) = recurso inativo, sem erro.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { isEnabled, isMissingTable } from './featureFlagService.js';
import * as Rag from './ragService.js';
import { buildDocuments } from '../assistant/docs.js';

const FLAG_FEEDBACK = 'feedback_enabled';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Controles e invisíveis, exceto tab e quebra de linha: o comentário é texto puro, sem lixo invisível.
const UNSAFE_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠﻿]/g;
const REVIEW_STATUSES = ['reviewed', 'dismissed'];
const UNCATEGORIZED = 'sem_categoria';

function assertMemberOrAdmin(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

function requireUuid(value, message) {
  const id = S.normalizeText(value);
  if (!UUID_RE.test(id)) throw E.ValidationError(message);
  return id;
}

function requireOneOf(value, allowed, message) {
  const text = S.normalizeText(value);
  if (allowed.indexOf(text) === -1) throw E.ValidationError(message);
  return text;
}

/** Campo opcional da allowlist: vazio vira null; valor fora da lista é recusado. */
function optionalOneOf(value, allowed, message) {
  const text = S.normalizeText(value);
  if (!text) return null;
  return requireOneOf(text, allowed, message);
}

/** Comentário: texto puro, sem controles, até COMMENT_MAX caracteres (pontos de código, como o banco conta). */
export function normalizeComment(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw E.ValidationError('Comentário inválido.');
  const text = raw.replace(UNSAFE_CHARS_RE, '').trim();
  if (!text) return null;
  if (Array.from(text).length > C.FEEDBACK.COMMENT_MAX) {
    throw E.ValidationError('Comentário muito longo (máximo de ' + C.FEEDBACK.COMMENT_MAX + ' caracteres).');
  }
  return text;
}

function disabledReply() {
  return { success: false, disabled: true, message: 'O feedback sobre a Lia está desligado no momento.' };
}

/** Upsert por (mensagem, pessoa). O INSERT só lê a mensagem se ela for da própria pessoa. */
async function upsertFeedback(sql, identity, row) {
  return sql`
    INSERT INTO assistant_feedback (message_id, profile_id, rating, category, comment, status)
    SELECT m.id, m.profile_id, ${row.rating}::text, ${row.category}::text, ${row.comment}::text, 'new'
    FROM assistant_messages m
    WHERE m.id = ${row.messageId}::uuid AND m.profile_id = ${identity.profileId}::uuid
    ON CONFLICT (message_id, profile_id) DO UPDATE SET
      rating = EXCLUDED.rating, category = EXCLUDED.category, comment = EXCLUDED.comment,
      comment_anonymized_at = NULL, status = 'new', created_at = now()
    RETURNING id`;
}

/** Avaliação de uma resposta da Lia (membro ou admin). Input: {messageId, rating, category?, comment?}. */
export async function submitFeedback(sql, identity, input, correlationId) {
  assertMemberOrAdmin(identity);
  if (!(await isEnabled(sql, FLAG_FEEDBACK, identity))) return disabledReply();
  const limit = C.RATE_LIMITS.ASSISTANT_FEEDBACK;
  await S.enforceRateLimit(sql, 'ASSISTANT_FEEDBACK', identity.profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);

  const row = {
    messageId: requireUuid(input.messageId, 'Resposta da Lia inválida.'),
    rating: requireOneOf(input.rating, C.FEEDBACK.RATINGS, 'Avaliação inválida.'),
    category: optionalOneOf(input.category, C.FEEDBACK.CATEGORIES, 'Categoria inválida.'),
    comment: normalizeComment(input.comment),
  };

  let saved;
  try {
    saved = await upsertFeedback(sql, identity, row);
  } catch (err) {
    if (isMissingTable(err)) return disabledReply();
    throw err;
  }
  // Mesma resposta para "não existe" e "é de outra pessoa": não revela existência alheia.
  if (!saved.length) throw E.NotFoundError('Resposta da Lia não encontrada.');
  return { success: true, message: 'Obrigado pelo seu feedback.', feedback: { messageId: row.messageId, rating: row.rating, category: row.category } };
}

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return C.FEEDBACK.PAGE_SIZE;
  return Math.min(n, C.FEEDBACK_STATS.LIST_MAX);
}

/** Cursor opaco "<ISO>|<uuid>" da última linha da página (ordem: created_at, id desc). */
function encodeCursor(row) {
  return new Date(row.created_at).toISOString() + '|' + row.id;
}

function decodeCursor(raw) {
  const text = S.normalizeText(raw);
  if (!text) return null;
  const parts = text.split('|');
  const at = Date.parse(parts[0]);
  if (parts.length !== 2 || Number.isNaN(at) || !UUID_RE.test(parts[1])) throw E.ValidationError('Página inválida.');
  return { at: new Date(at).toISOString(), id: parts[1] };
}

/** Só apelido e papel de quem avaliou; resposta da Lia (sem dado pessoal, por construção). */
function toFeedbackItem(r) {
  return {
    id: r.id,
    messageId: r.message_id,
    rating: r.rating,
    category: r.category,
    comment: r.comment,
    status: r.status,
    createdAt: r.created_at,
    commentAnonymizedAt: r.comment_anonymized_at,
    author: { username: r.username, role: r.role },
    answer: { topic: r.topic, source: r.source, text: r.answer, degraded: r.degraded, answeredAt: r.answered_at },
  };
}

/** Lista paginada para o admin. Input: {status?, rating?, limit?, cursor?}. */
export async function listFeedback(sql, identity, input) {
  assertAdmin(identity);
  const status = optionalOneOf(input.status, C.FEEDBACK.STATUSES, 'Status inválido.');
  const rating = optionalOneOf(input.rating, C.FEEDBACK.RATINGS, 'Avaliação inválida.');
  const limit = clampLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const cursorAt = cursor ? cursor.at : null;
  const cursorId = cursor ? cursor.id : null;

  let rows;
  try {
    rows = await sql`
      SELECT f.id, f.message_id, f.rating, f.category, f.comment, f.status, f.created_at, f.comment_anonymized_at,
             p.username, p.role,
             m.topic, m.source, m.answer, m.degraded, m.created_at AS answered_at
      FROM assistant_feedback f
      JOIN assistant_messages m ON m.id = f.message_id
      JOIN profiles p ON p.id = f.profile_id
      WHERE (${status}::text IS NULL OR f.status = ${status}::text)
        AND (${rating}::text IS NULL OR f.rating = ${rating}::text)
        AND (${cursorAt}::timestamptz IS NULL OR (f.created_at, f.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid))
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT ${limit + 1}`;
  } catch (err) {
    if (isMissingTable(err)) return { success: true, items: [], nextCursor: null };
    throw err;
  }

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    success: true,
    items: page.map(toFeedbackItem),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}

function clampDays(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return C.FEEDBACK_STATS.DAYS_DEFAULT;
  return Math.min(n, C.FEEDBACK_STATS.DAYS_MAX);
}

/** Utilidade = 👍 / (👍 + 👎), entre 0 e 1; null sem avaliações. */
function utilityRate(up, down) {
  if (up + down === 0) return null;
  return Math.round((up / (up + down)) * 1000) / 1000;
}

async function statsRows(sql, days) {
  const totals = await sql`
    SELECT count(*) FILTER (WHERE rating = 'up')::int AS up_count,
           count(*) FILTER (WHERE rating = 'down')::int AS down_count
    FROM assistant_feedback
    WHERE created_at >= now() - (${days}::int * interval '1 day')`;
  const byCategory = await sql`
    SELECT COALESCE(category, ${UNCATEGORIZED}) AS category,
           count(*) FILTER (WHERE rating = 'up')::int AS up_count,
           count(*) FILTER (WHERE rating = 'down')::int AS down_count
    FROM assistant_feedback
    WHERE created_at >= now() - (${days}::int * interval '1 day')
    GROUP BY 1 ORDER BY down_count DESC, category ASC`;
  const byDay = await sql`
    SELECT to_char((created_at AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS day_key,
           count(*) FILTER (WHERE rating = 'up')::int AS up_count,
           count(*) FILTER (WHERE rating = 'down')::int AS down_count
    FROM assistant_feedback
    WHERE created_at >= now() - (${days}::int * interval '1 day')
    GROUP BY 1 ORDER BY 1`;
  return { totals: totals[0], byCategory, byDay };
}

function formatStats(days, raw) {
  const up = raw.totals.up_count;
  const down = raw.totals.down_count;
  return {
    success: true,
    days,
    totals: { up, down, total: up + down, utilityRate: utilityRate(up, down) },
    byCategory: raw.byCategory.map((r) => ({ category: r.category, up: r.up_count, down: r.down_count })),
    byDay: raw.byDay.map((r) => ({ day: r.day_key, up: r.up_count, down: r.down_count })),
  };
}

/** Painel de satisfação do admin. Input: {days?} (padrão e teto em FEEDBACK_STATS). */
export async function feedbackStats(sql, identity, input) {
  assertAdmin(identity);
  const days = clampDays(input.days);
  try {
    return formatStats(days, await statsRows(sql, days));
  } catch (err) {
    if (isMissingTable(err)) return formatStats(days, { totals: { up_count: 0, down_count: 0 }, byCategory: [], byDay: [] });
    throw err;
  }
}

/** Atualiza a triagem de um feedback. Input: {id, status: 'reviewed'|'dismissed'}. */
export async function updateFeedback(sql, identity, input, correlationId) {
  assertAdmin(identity);
  const id = requireUuid(input.id, 'Feedback inválido.');
  const status = requireOneOf(input.status, REVIEW_STATUSES, 'Status inválido.');
  const rows = await sql`
    UPDATE assistant_feedback SET status = ${status}::text
    WHERE id = ${id}::uuid
    RETURNING id`;
  if (!rows.length) throw E.NotFoundError('Feedback não encontrado.');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'REVIEW_ASSISTANT_FEEDBACK', 'assistant_feedback', id, 'success', { status });
  return { success: true, message: 'Feedback atualizado.' };
}

/** Fontes do acervo para a UI de citações: {source, section}, sem conteúdo. */
export async function listKbSources(sql) {
  try {
    const rows = await sql`SELECT DISTINCT source, section FROM kb_chunks ORDER BY source, section`;
    return { success: true, sources: rows.map((r) => ({ source: r.source, section: r.section })) };
  } catch (err) {
    if (isMissingTable(err)) return { success: true, sources: [] };
    throw err;
  }
}

/** Reindexa a base (docs + kb) com a mesma rotina idempotente do ragService. Admin, 1 por minuto. */
export async function reindexKb(sql, env, identity, correlationId) {
  assertAdmin(identity);
  const limit = C.RATE_LIMITS.ASSISTANT_REINDEX_MINUTE;
  await S.enforceRateLimit(sql, 'ASSISTANT_REINDEX_MINUTE', 'global', limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
  const report = await Rag.reindex(sql, env, buildDocuments());
  await Logging.logAudit(sql, correlationId, identity.profileId, 'REINDEX_ASSISTANT_KB', 'kb', null, 'success', {
    total: report.total,
    upserted: report.upserted,
    unchanged: report.unchanged,
    removed: report.removed,
    embedded: report.embedded,
    embeddingAvailable: report.embeddingAvailable,
  });
  return { success: true, message: 'Base da Lia reindexada.', report };
}
