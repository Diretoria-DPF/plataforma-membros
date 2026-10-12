/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * transitions.js
 * Máquina de estados do artigo da Biblioteca (contrato B1 §2) e regra
 * clínica. Pura: não toca no banco. O serviço chama assertTransition antes
 * do UPDATE, e o UPDATE repete a condição no WHERE (o banco decide a corrida).
 *
 * Forma do artigo (camelCase, mapeada pelo serviço a partir das colunas):
 * status, title, articleType, topics, isClinical, summaryText, summaryOrigin,
 * summaryUpdatedAt, summaryUpdatedBy, summaryReviewedAt, summaryReviewerName,
 * clinicalReviewedAt, clinicalReviewerName.
 */
import { ValidationError, ForbiddenError } from '../errors.js';
import { LIBRARY_LIMITS } from './limits.js';

const NOT_ALLOWED_MSG = 'Mudança de estado não permitida.';
const AREA_MSG = 'Escolha ao menos uma área antes de aprovar.';
const TITLE_TYPE_MSG = 'Informe título e tipo antes de aprovar.';
const CLINICAL_MSG = 'Falta a revisão clínica do resumo.';
const AI_SUMMARY_MSG = 'O resumo gerado por IA precisa ser aprovado.';
const REASON_MSG = 'Informe o motivo (3 a 300 caracteres).';
const FORBIDDEN_REVIEWER_MSG = 'A revisão clínica precisa ser de outra pessoa.';

export const STATUSES = Object.freeze([
  'em_triagem', 'aprovado', 'publicado', 'rejeitado', 'removido',
]);

const step = (from, to, role) => Object.freeze({ from, to, role });

// Cadastro (novo) -> em_triagem fica de fora: é o próprio cadastro.
export const TRANSITIONS = Object.freeze([
  step('em_triagem', 'aprovado', 'curador'),
  step('em_triagem', 'rejeitado', 'curador'),
  step('aprovado', 'publicado', 'curador'),
  step('aprovado', 'rejeitado', 'curador'),
  step('aprovado', 'em_triagem', 'curador'),
  // Remover e restaurar: só o admin (030). Curador e mentor PEDEM a remoção (libraryRemovalService).
  step('publicado', 'removido', 'admin'),
  step('rejeitado', 'em_triagem', 'curador'),
  step('removido', 'em_triagem', 'admin'),
  // Automática: o curador mudou o resumo de um artigo publicado.
  step('publicado', 'aprovado', 'servico'),
]);

// Destinos que exigem motivo (3 a 300 caracteres).
const REASON_TARGETS = Object.freeze(['rejeitado', 'removido']);

// Termos de conduta, dose ou interação. Regex sem acento e sem maiúsculas
// (o texto é normalizado antes). Borda de palavra dos dois lados, aplicada
// abaixo, para "amgdala" e "doseamento" não casarem. A heurística é só um
// piso: errar para o lado clínico custa uma revisão; errar para o outro, não.
export const CLINICAL_TERMS = Object.freeze([
  'dose(s)?',
  'mg',
  'posologia',
  'interac(ao|oes)',
  'contraindica[a-z]*',
  'conduta(s)?',
  'tratamento de escolha',
  'tratamento\\s+com',
  'administr[a-z]*',
  'deve-se',
  'deve(m)?\\s+ser',
  'recomend[a-z]*',
  'utilize',
  'indicad[a-z]*',
  'antidoto(s)?',
  'iniciar',
  'inicie',
]);

// Número + unidade ("500mcg", "2,5 µg", "40 UI", "5 g/dia") e razões por
// peso ou por dia ("/kg", "/dia"). Sem borda à esquerda (o número ou a barra
// já separam) e com borda à direita, para "10 gatos" e "2019 genes" não casarem.
// A unidade "µ" aceita o micro (U+00B5) e o mu grego (U+03BC): NFD não os unifica.
const CLINICAL_UNIT_TERMS = Object.freeze([
  '[0-9](?:[.,][0-9]+)?\\s*(?:mg|mcg|[\\u00b5\\u03bc]g|ug|g|ml|ui|meq|mmol)(?![a-z])',
  '/\\s?(?:kg|dia)(?![a-z])',
]);

const CLINICAL_PATTERN = new RegExp(
  `(?:^|[^a-z])(?:${CLINICAL_TERMS.join('|')})(?![a-z])|${CLINICAL_UNIT_TERMS.join('|')}`,
);

const AI_ORIGINS = Object.freeze(['ia', 'ia_editado']);

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeText = (text) => String(text ?? '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .toLowerCase();

export function hasClinicalTerms(text) {
  return CLINICAL_PATTERN.test(normalizeText(text));
}

// Revisão vale só se for posterior à última mudança do resumo.
function reviewedAfterLastChange(reviewedAt, updatedAt) {
  if (!reviewedAt) return false;
  if (!updatedAt) return true;
  return new Date(reviewedAt).getTime() >= new Date(updatedAt).getTime();
}

const areaCheck = (article) => ((article.topics ?? []).length >= 1 ? null : AREA_MSG);

const titleTypeCheck = (article) => (
  hasText(article.title) && hasText(article.articleType) ? null : TITLE_TYPE_MSG
);

const clinicalCheck = (article) => {
  if (!article.isClinical || !article.summaryText) return null;
  const reviewed = hasText(article.clinicalReviewerName)
    && reviewedAfterLastChange(article.clinicalReviewedAt, article.summaryUpdatedAt);
  return reviewed ? null : CLINICAL_MSG;
};

const aiSummaryCheck = (article) => {
  if (!AI_ORIGINS.includes(article.summaryOrigin)) return null;
  const reviewed = hasText(article.summaryReviewerName)
    && reviewedAfterLastChange(article.summaryReviewedAt, article.summaryUpdatedAt);
  return reviewed ? null : AI_SUMMARY_MSG;
};

// Pré-condições que dependem só do artigo (allowedTransitions usa estas).
const STATE_CHECKS = Object.freeze({
  'em_triagem>aprovado': Object.freeze([areaCheck, titleTypeCheck]),
  'aprovado>publicado': Object.freeze([clinicalCheck, aiSummaryCheck]),
});

const stateChecksFor = (from, to) => STATE_CHECKS[`${from}>${to}`] ?? [];

const firstFailure = (checks, article) => {
  for (const check of checks) {
    const message = check(article);
    if (message) return message;
  }
  return null;
};

const reasonFailure = (reason) => {
  const size = typeof reason === 'string' ? reason.trim().length : 0;
  const valid = size >= LIBRARY_LIMITS.REASON_MIN && size <= LIBRARY_LIMITS.REASON_MAX;
  return valid ? null : REASON_MSG;
};

const canPerform = (transition, roles) => (roles ?? []).includes(transition.role);

const findTransition = (article, to, roles) => TRANSITIONS.find((t) => (
  t.from === article?.status && t.to === to && canPerform(t, roles)
)) ?? null;

export function allowedTransitions(article, roles) {
  return TRANSITIONS
    .filter((t) => t.from === article.status && canPerform(t, roles))
    .filter((t) => firstFailure(stateChecksFor(t.from, t.to), article) === null)
    .map((t) => t.to);
}

export function assertTransition(article, to, roles, reason) {
  const transition = findTransition(article, to, roles);
  if (!transition) throw ValidationError(NOT_ALLOWED_MSG);
  const failure = firstFailure(stateChecksFor(transition.from, to), article)
    ?? (REASON_TARGETS.includes(to) ? reasonFailure(reason) : null);
  if (failure) throw ValidationError(failure);
}

export function assertClinicalReviewer(article, identity) {
  const reviewerId = identity?.profileId;
  if (reviewerId && reviewerId === article?.summaryUpdatedBy) {
    throw ForbiddenError(FORBIDDEN_REVIEWER_MSG);
  }
}
