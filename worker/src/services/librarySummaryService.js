/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * librarySummaryService.js
 * Resumo sugerido por IA da Biblioteca (B3; PLANO-CORTEX decisões 3 e 11;
 * CONTRATO-B1 §4.2):
 *  - generateSummary: o curador pede; com a flag library_ai_summary ligada, o
 *    modelo de LIBRARY_AI_MODEL (Workers AI, env.AI) resume o source_abstract e
 *    a sugestão fica gravada com summary_origin 'ia', SEM revisão. Texto com
 *    conduta, dose ou interação marca is_clinical (vai ao revisor clínico).
 *  - reviewSummary: o curador registra que leu e aprova o resumo de IA (nome e
 *    data); só então o CHECK library_articles_ai_summary_chk deixa publicar.
 * Uso de IA fica em audit_logs (LIBRARY_SUMMARY_GENERATE) e nos contadores de
 * limite; ai_usage_log não é usado (o CHECK de feature exigiria migração).
 * Quem usa: worker/src/handlers.js e frontend/admin-library-lote.js.
 */
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { LIBRARY_FLAGS } from '../library/limits.js';
import { hasClinicalTerms } from '../library/transitions.js';
import {
  buildSummaryMessages, isAbstractSufficient, runSummaryModel, postProcessSummary,
} from '../library/summaryProvider.js';
import { isEnabled } from './featureFlagService.js';
import {
  LIBRARY_ROLES, requireLibraryRole, enforce, articleIdOf, versionOf, loadArticle, assertVersion,
  requireRow, toAdminArticle, displayName,
} from './libraryCurationService.js';

const EDITABLE_STATUSES = ['em_triagem', 'aprovado'];
const AI_ORIGINS = ['ia', 'ia_editado'];

const MSG = Object.freeze({
  disabled: 'O resumo por IA está desligado.',
  notConfigured: 'O resumo por IA não está configurado (LIBRARY_AI_MODEL).',
  wrongStatus: 'Só artigos em triagem ou aprovados recebem resumo por IA.',
  insufficient: 'Resumo original insuficiente',
  hasSummary: 'Este artigo já tem resumo da curadoria. Apague o resumo para pedir um da IA.',
  format: 'A IA devolveu um resumo fora do formato (3 a 5 frases). Tente de novo.',
  model: 'A IA não respondeu agora. Tente de novo em alguns minutos.',
  empty: 'A IA não devolveu o texto desta vez. Clique de novo em "Gerar resumos com IA"; se continuar, avise o administrador.',
  timeout: 'A IA demorou demais para responder. Tente de novo em alguns minutos.',
  binding: 'O resumo por IA não está ligado no servidor (Workers AI). Avise o administrador.',
  noAiSummary: 'Este artigo não tem resumo de IA para aprovar.',
  reviewStatus: 'Só artigos em triagem ou aprovados têm o resumo de IA aprovado aqui.',
});

/** Falha fechada: sem saber o valor da flag, o resumo por IA fica desligado. */
async function aiFlagOn(sql, identity) {
  try {
    return await isEnabled(sql, LIBRARY_FLAGS.AI_SUMMARY, identity);
  } catch (err) {
    return false;
  }
}

const modelOf = (env) => (typeof env?.LIBRARY_AI_MODEL === 'string' ? env.LIBRARY_AI_MODEL.trim() : '');

function assertCanGenerate(cur) {
  if (!EDITABLE_STATUSES.includes(cur.status)) throw E.ValidationError(MSG.wrongStatus);
  if (cur.summary_text && cur.summary_origin !== 'ia') throw E.ValidationError(MSG.hasSummary);
  if (!isAbstractSufficient(cur.source_abstract)) throw E.ValidationError(MSG.insufficient);
}

function audit(sql, cid, identity, id, result, details) {
  return Logging.logAudit(sql, cid, identity.profileId, 'LIBRARY_SUMMARY_GENERATE', 'library_article', id, result, details);
}

// Motivo técnico (summaryProvider) → mensagem em linguagem comum para a tela.
const MODEL_MESSAGES = Object.freeze({
  vazio: MSG.empty, tamanho: MSG.empty, tempo: MSG.timeout, binding: MSG.binding, modelo: MSG.notConfigured,
});

/** Chama o modelo e devolve o texto pronto; falhas viram erro amigável com auditoria de falha. */
async function suggestText(sql, env, identity, cur, model, cid) {
  let raw;
  try {
    raw = await runSummaryModel(env, { model, messages: buildSummaryMessages({ title: cur.title, sourceAbstract: cur.source_abstract }) });
  } catch (err) {
    const reason = err?.reason || 'erro';
    await audit(sql, cid, identity, cur.id, 'failure', { model, reason });
    throw E.ValidationError(MODEL_MESSAGES[reason] ?? MSG.model);
  }
  const out = postProcessSummary(raw, { title: cur.title });
  if (out.ok) return out.text;
  await audit(sql, cid, identity, cur.id, 'failure', { model, reason: out.reason });
  throw E.ValidationError(out.reason === 'insuficiente' ? MSG.insufficient : MSG.format);
}

function runSuggestion(sql, cur, text, isClinical, profileId) {
  return sql`
    UPDATE library_articles SET
      summary_text = ${text}::text, summary_origin = 'ia',
      summary_updated_at = now(), summary_updated_by = ${profileId}::uuid,
      summary_reviewed_at = NULL, summary_reviewed_by = NULL, summary_reviewer_name = NULL,
      is_clinical = ${isClinical}::boolean, version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

export async function generateSummary(sql, env, identity, input = {}, correlationId) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const id = articleIdOf(input.id);
  const version = input.version === undefined || input.version === null ? null : versionOf(input.version);
  if (!(await aiFlagOn(sql, identity))) return { success: false, disabled: true, message: MSG.disabled };
  const model = modelOf(env);
  if (!model) throw E.ValidationError(MSG.notConfigured);
  const cur = await loadArticle(sql, id);
  if (version !== null) assertVersion(cur, version);
  assertCanGenerate(cur);
  await enforce(sql, 'LIBRARY_SUMMARY', identity.profileId);
  await enforce(sql, 'LIBRARY_SUMMARY_DAY', 'global');
  const text = await suggestText(sql, env, identity, cur, model, correlationId);
  const clinical = cur.is_clinical === true || hasClinicalTerms(text);
  const row = requireRow(await runSuggestion(sql, cur, text, clinical, identity.profileId));
  await audit(sql, correlationId, identity, id, 'success', { model, clinical, chars: text.length });
  return { success: true, article: toAdminArticle(row), clinical };
}

function runReview(sql, cur, identity) {
  return sql`
    UPDATE library_articles SET
      summary_reviewed_at = now(), summary_reviewed_by = ${identity.profileId}::uuid,
      summary_reviewer_name = ${displayName(identity)}::text, version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

export async function reviewSummary(sql, identity, input = {}, correlationId) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const id = articleIdOf(input.id);
  const version = versionOf(input.version);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const cur = await loadArticle(sql, id);
  assertVersion(cur, version);
  if (!AI_ORIGINS.includes(cur.summary_origin) || !cur.summary_text) throw E.ValidationError(MSG.noAiSummary);
  if (!EDITABLE_STATUSES.includes(cur.status)) throw E.ValidationError(MSG.reviewStatus);
  const row = requireRow(await runReview(sql, cur, identity));
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_SUMMARY_REVIEW', 'library_article', id, 'success', { origin: cur.summary_origin });
  return { success: true, article: toAdminArticle(row) };
}
