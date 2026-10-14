/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalService.js
 * Fase 3 — Clínica Médica Virtual na Worker (substitui conversarComPaciente,
 * avaliarCondutaPreceptor, gerarCasoProcedural, listarCasosAcervo e
 * obterDashboardEpidemiologico do Apps Script). Ver docs/FASE_3_IA_CLINICA.md.
 *
 * Origem do caso (`caseSource`):
 * - 'acervo': caso APROVADO da tabela clinical_cases. Contexto do paciente
 *   e gabarito vêm SEMPRE do banco — o cliente nem recebe o gabarito na
 *   biblioteca, e nada que ele envie substitui o do servidor.
 * - 'builtin' (patients.js) e 'ia' (gerado na própria sessão): o caso já
 *   está no navegador da pessoa, então contexto e gabarito vêm do cliente,
 *   limitados em tamanho. Um gabarito adulterado só muda a nota da PRÓPRIA
 *   pessoa (e o que ela vê no próprio radar), nunca a de outra.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { getCached, setCached, invalidateCached } from '../cache.js';
import * as Orchestrator from '../ai/orchestrator.js';
import { AiInvalidOutputError, AI_MESSAGES } from '../ai/errors.js';
import { buildPatientMessages, buildEvaluationMessages, buildCaseGenerationMessages } from '../ai/prompts.js';
import {
  cleanText, cleanReply, byteLength, sanitizeHistory, sanitizePatientContext, contextFromPayload, sanitizeAnswerKey,
  sanitizeAttendance, validateEvaluation, validateGeneratedCase, parseJsonObject, normalizeToxindrome, normalizeDifficulty,
} from '../ai/validators.js';
import { withQuota, asObject } from './aiService.js';
import * as ClinicalSim from './clinicalSimService.js';
import { buildSimEvaluationMessages } from '../clinicalSim/prompts.js';
import { parseSimEvaluation, computeSimScore } from '../clinicalSim/scoring.js';

export const CASE_SOURCES = ['builtin', 'acervo', 'ia'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIBRARY_CACHE_KEY = 'cache:clinical-library:v1';
export const EPIDEMIOLOGY_CACHE_KEY = 'cache:clinical-epi:v1';
const LIBRARY_TTL_SECONDS = 300;
const EPIDEMIOLOGY_TTL_SECONDS = 300;
export const EPI_AGENT_MIN_PEOPLE = 2;

// Desfecho do simulador → vocabulário de learning_attempts.details
// (Contrato 1: 'sobreviveu' | 'obito' | 'estavel'). Abandono = o paciente
// foi embora vivo sem conduta concluída → 'estavel'.
const OUTCOME_TO_DETAILS = { concluido: 'sobreviveu', obito: 'obito', abandono: 'estavel' };
const OUTCOME_SCORE_CAP = { obito: 25, abandono: 40 };

function parseCaseSource(value) {
  const s = cleanText(value, 20);
  if (CASE_SOURCES.indexOf(s) === -1) throw E.ValidationError('Origem do caso inválida.');
  return s;
}

function parseCaseId(value) {
  const id = cleanText(value, C.AI_LIMITS.CASE_ID_MAX + 1);
  if (!id || id.length > C.AI_LIMITS.CASE_ID_MAX) throw E.ValidationError('Identificador do caso inválido.');
  return id;
}

function parseQuestion(value) {
  const q = cleanText(value);
  if (!q) throw E.ValidationError('Escreva sua pergunta ao paciente.');
  if (q.length > C.AI_LIMITS.QUESTION_MAX) throw E.ValidationError('A pergunta passou do limite de ' + C.AI_LIMITS.QUESTION_MAX + ' caracteres.');
  return q;
}

async function loadApprovedCase(sql, caseId) {
  if (!UUID_RE.test(caseId)) throw E.NotFoundError('Caso do acervo não encontrado.');
  const rows = await sql`
    SELECT id, title, toxindrome, agent, payload FROM clinical_cases
    WHERE id = ${caseId}::uuid AND status = 'approved'
  `;
  if (!rows.length) throw E.NotFoundError('Caso do acervo não encontrado ou ainda não aprovado.');
  return rows[0];
}

// ---------------------------------------------------------------------------
// apiLearnClinicalChat — paciente virtual (modelo rápido)
// ---------------------------------------------------------------------------
export async function chat(sql, env, identity, rawInput) {
  const input = asObject(rawInput);
  const caseSource = parseCaseSource(input.caseSource);
  const caseId = parseCaseId(input.caseId);
  const question = parseQuestion(input.question);
  const history = sanitizeHistory(input.history, ['student', 'patient'], C.AI_LIMITS.HISTORY_MAX_TURNS, C.AI_LIMITS.HISTORY_TURN_MAX);

  if (input.patientContext !== undefined && byteLength(input.patientContext) > C.AI_LIMITS.CONTEXT_MAX_BYTES) {
    throw E.ValidationError('O contexto do caso é grande demais.');
  }
  // Simulação (ADR 0009): null = desligada ou não pedida; o caminho abaixo é então o de sempre, sem consulta nova.
  const sim = await ClinicalSim.prepare(sql, identity, { rawSimulation: input.simulation, caseSource, caseId });
  let context;
  if (caseSource === 'acervo') {
    const row = sim ? sim.row : await loadApprovedCase(sql, caseId);
    context = contextFromPayload(row.payload, input.patientContext);
  } else {
    context = sanitizePatientContext(input.patientContext);
  }

  return withQuota(sql, identity, C.AI_FEATURE.CHAT, async () => {
    const messages = sim
      ? ClinicalSim.patientMessages(sim.session, { context, question, history })
      : buildPatientMessages({ context, question, history });
    const out = await Orchestrator.complete(sql, env, identity, {
      feature: C.AI_FEATURE.CHAT,
      messages,
      profileId: identity.profileId,
    });
    const patientReply = cleanReply(out.content, C.AI_LIMITS.REPLY_MAX);
    if (!patientReply) throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
    if (!sim) return { success: true, patientReply };
    const guarded = ClinicalSim.guardPatientReply(patientReply);
    return { success: true, patientReply: guarded.reply, simulation: { simId: sim.session.simId, guardrails: guarded.rules } };
  });
}

// ---------------------------------------------------------------------------
// apiLearnClinicalEvaluate — preceptor (modelo forte, JSON) + learning_attempts
// ---------------------------------------------------------------------------
async function resolveAnswerKey(sql, input, caseSource, caseId, attendance, simRow) {
  if (caseSource === 'acervo') {
    const row = simRow || await loadApprovedCase(sql, caseId);
    const answerKey = sanitizeAnswerKey(row.payload && row.payload.gabaritoPreceptor);
    if (!answerKey) throw E.ValidationError('Este caso do acervo está sem gabarito. Avise a diretoria.');
    return { answerKey, caseMeta: { titulo: row.title, toxindrome: row.toxindrome || 'Outra', agente: row.agent || '' } };
  }
  if (input.answerKey !== undefined && byteLength(input.answerKey) > C.AI_LIMITS.ANSWER_KEY_MAX_BYTES) {
    throw E.ValidationError('O gabarito do caso é grande demais.');
  }
  const answerKey = sanitizeAnswerKey(input.answerKey);
  if (!answerKey) throw E.ValidationError('Gabarito do caso ausente ou inválido.');
  return { answerKey, caseMeta: { toxindrome: normalizeToxindrome(attendance.toxindrome), agente: attendance.agent } };
}

// Avaliação de sempre: o modelo devolve a nota total (validateEvaluation).
async function runEvaluation(sql, env, identity, { answerKey, attendance, caseMeta }) {
  const out = await Orchestrator.complete(sql, env, identity, {
    feature: C.AI_FEATURE.EVALUATE,
    messages: buildEvaluationMessages({ answerKey, attendance, caseMeta }),
    profileId: identity.profileId,
  });
  const result = validateEvaluation(parseJsonObject(out.content));
  if (!result) throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
  return { result, components: null };
}

// Avaliação em modo simulação: o modelo só SUGERE a nota de cada componente; clamp e soma são do servidor.
async function runSimEvaluation(sql, env, identity, { answerKey, attendance, caseMeta, session, facts }) {
  const out = await Orchestrator.complete(sql, env, identity, {
    feature: C.AI_FEATURE.EVALUATE,
    messages: buildSimEvaluationMessages({ answerKey, attendance, caseMeta, axes: session.axes, version: session.version }),
    profileId: identity.profileId,
  });
  const parsed = parseSimEvaluation(parseJsonObject(out.content));
  if (!parsed) throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
  const scored = computeSimScore(parsed.components, facts);
  const result = { score: scored.score, verdict: parsed.verdict, feedback: parsed.feedback, strengths: parsed.strengths, improvements: parsed.improvements };
  return { result, components: scored.components };
}

async function saveAttempt(sql, details, score, elapsedSeconds, identity, correlationId) {
  try {
    const rows = await sql`
      INSERT INTO learning_attempts (profile_id, module, activity, score, max_score, duration_seconds, details)
      VALUES (${identity.profileId}::uuid, 'clinica', 'caso_clinico', ${score}, 100, ${elapsedSeconds}, ${JSON.stringify(details)}::jsonb)
      RETURNING id
    `;
    return { saved: true, attemptId: rows && rows[0] ? rows[0].id : null };
  } catch (err) {
    // A avaliação já custou tokens: devolvemos o parecer mesmo sem
    // conseguir registrar a tentativa (e o erro fica no error_logs).
    await Logging.logError(sql, correlationId, 'CLINICAL_ATTEMPT_SAVE_FAILED', 'Falha ao gravar learning_attempts da clínica.', { caseSource: details.caseSource });
    return { saved: false, attemptId: null };
  }
}

export async function evaluate(sql, env, identity, rawInput, correlationId) {
  const input = asObject(rawInput);
  const caseSource = parseCaseSource(input.caseSource);
  const caseId = parseCaseId(input.caseId);
  const attendance = sanitizeAttendance(input.attendance, C.AI_LIMITS, (msg) => { throw E.ValidationError(msg); });
  // Simulação (ADR 0009): null = desligada ou não pedida; o caminho abaixo é então o de sempre, sem consulta nova.
  const sim = await ClinicalSim.prepare(sql, identity, { rawSimulation: input.simulation, caseSource, caseId });
  const { answerKey, caseMeta } = await resolveAnswerKey(sql, input, caseSource, caseId, attendance, sim && sim.row);

  return withQuota(sql, identity, C.AI_FEATURE.EVALUATE, async () => {
    const raw = asObject(input.attendance);
    const facts = { hasDiagnosis: !!cleanText(raw.diagnosis), hasConduct: !!cleanText(raw.conduct), questionsCount: attendance.questionsCount };
    const { result, components } = sim
      ? await runSimEvaluation(sql, env, identity, { answerKey, attendance, caseMeta, session: sim.session, facts })
      : await runEvaluation(sql, env, identity, { answerKey, attendance, caseMeta });
    // O teto por desfecho também é aplicado aqui: o prompt pede, mas quem
    // garante é o servidor.
    if (OUTCOME_SCORE_CAP[attendance.outcome] !== undefined) {
      result.score = Math.min(result.score, OUTCOME_SCORE_CAP[attendance.outcome]);
    }

    const details = {
      caseId,
      caseSource,
      outcome: OUTCOME_TO_DETAILS[attendance.outcome],
      toxindrome: caseMeta.toxindrome || 'Outra',
      agent: cleanText(caseMeta.agente, 120),
    };
    if (sim) details.sim = ClinicalSim.simDetails(sim.session, components);
    const { saved, attemptId } = await saveAttempt(sql, details, result.score, attendance.elapsedSeconds, identity, correlationId);
    if (saved) await invalidateCached(env, EPIDEMIOLOGY_CACHE_KEY);
    await Logging.logAudit(sql, correlationId, identity.profileId, 'LEARN_CLINICAL_EVALUATE', 'learning_attempt', attemptId, saved ? 'success' : 'failure', {
      caseSource, score: result.score, outcome: details.outcome,
    });
    const response = { success: true, result, saved };
    if (sim) response.simulation = ClinicalSim.debrief(sim.session, components);
    return response;
  });
}

// ---------------------------------------------------------------------------
// apiLearnClinicalGenerateCase — gera, valida e salva como 'pending'
// ---------------------------------------------------------------------------
export async function generateCase(sql, env, identity, rawInput, correlationId) {
  const input = asObject(rawInput);
  const topic = cleanText(input.topic);
  if (topic.length < C.AI_LIMITS.TOPIC_MIN) throw E.ValidationError('Descreva o tema do caso (ex.: intoxicação por paracetamol).');
  if (topic.length > C.AI_LIMITS.TOPIC_MAX) throw E.ValidationError('O tema passou do limite de ' + C.AI_LIMITS.TOPIC_MAX + ' caracteres.');
  const difficulty = normalizeDifficulty(input.difficulty, 'Intermediário');

  return withQuota(sql, identity, C.AI_FEATURE.GENERATE_CASE, async () => {
    const out = await Orchestrator.complete(sql, env, identity, {
      feature: C.AI_FEATURE.GENERATE_CASE,
      messages: buildCaseGenerationMessages({ topic, difficulty }),
      profileId: identity.profileId,
    });
    const generated = validateGeneratedCase(parseJsonObject(out.content), { difficulty });
    if (!generated) throw AiInvalidOutputError('A IA gerou um caso incompleto desta vez; nada foi salvo. Tente novamente.');

    const rows = await sql`
      INSERT INTO clinical_cases (title, toxindrome, agent, payload, source, status, created_by)
      VALUES (${generated.titulo}, ${generated.toxindrome}, ${generated.agentePrincipal}, ${JSON.stringify(generated)}::jsonb, 'ia', 'pending', ${identity.profileId}::uuid)
      RETURNING id
    `;
    const id = rows[0].id;
    await Logging.logAudit(sql, correlationId, identity.profileId, 'GENERATE_CLINICAL_CASE', 'clinical_case', id, 'success', {
      toxindrome: generated.toxindrome, difficulty: generated.dificuldade,
    });
    return { success: true, case: Object.assign({ id }, generated), caseSource: 'ia' };
  });
}

// ---------------------------------------------------------------------------
// apiLearnClinicalLibrary — só 'approved', sem gabarito nem contexto oculto
// ---------------------------------------------------------------------------
function toPublicCase(row) {
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const copy = Object.assign({}, p);
  delete copy.gabaritoPreceptor;
  // O contexto oculto (o que "realmente aconteceu") é o que o estudante
  // precisa descobrir; no acervo ele só existe no servidor. O temperamento
  // fica, porque o cliente usa para escolher a reação do paciente.
  copy.contextoOculto = { temperamento: p.contextoOculto && p.contextoOculto.temperamento ? String(p.contextoOculto.temperamento) : '' };
  copy.id = row.id;
  copy.caseSource = 'acervo';
  copy.titulo = row.title;
  copy.toxindrome = row.toxindrome || copy.toxindrome || 'Outra';
  copy.agentePrincipal = row.agent || copy.agentePrincipal || '';
  return copy;
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

export async function library(sql, env, identity, rawInput) {
  const input = asObject(rawInput);
  const term = cleanText(input.term, 100);
  const toxindrome = cleanText(input.toxindrome, 80);
  const unfiltered = !term && !toxindrome;

  if (unfiltered) {
    const cached = await getCached(env, LIBRARY_CACHE_KEY);
    if (cached && Array.isArray(cached.cases)) return { success: true, cases: cached.cases };
  }

  const like = '%' + escapeLike(term) + '%';
  const toxLike = '%' + escapeLike(toxindrome) + '%';
  const rows = await sql`
    SELECT id, title, toxindrome, agent, payload FROM clinical_cases
    WHERE status = 'approved'
      AND (${term} = '' OR title ILIKE ${like} OR agent ILIKE ${like} OR toxindrome ILIKE ${like} OR payload->>'queixaPrincipal' ILIKE ${like})
      AND (${toxindrome} = '' OR toxindrome ILIKE ${toxLike})
    ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
    LIMIT ${C.AI_LIMITS.LIBRARY_MAX}
  `;
  const cases = (rows || []).map(toPublicCase);
  // Chave fixa e compartilhada é segura aqui: o conteúdo é idêntico para
  // qualquer pessoa logada (ver regra em cache.js).
  if (unfiltered) await setCached(env, LIBRARY_CACHE_KEY, { cases }, LIBRARY_TTL_SECONDS);
  return { success: true, cases };
}

// ---------------------------------------------------------------------------
// apiLearnClinicalEpidemiology — radar agregado (sem dado individual)
// ---------------------------------------------------------------------------
export async function epidemiology(sql, env) {
  const cached = await getCached(env, EPIDEMIOLOGY_CACHE_KEY);
  if (cached && typeof cached.totalAttended === 'number') return Object.assign({ success: true }, cached);

  const totals = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE details->>'outcome' IS DISTINCT FROM 'obito')::int AS survived
    FROM learning_attempts
    WHERE module = 'clinica' AND activity = 'caso_clinico'
  `;
  const toxRows = await sql`
    SELECT details->>'toxindrome' AS name, count(*)::int AS count
    FROM learning_attempts
    WHERE module = 'clinica' AND activity = 'caso_clinico' AND coalesce(details->>'toxindrome', '') <> ''
    GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 6
  `;
  // O agente é TEXTO LIVRE vindo do cliente nos casos 'builtin' e 'ia' (só
  // no acervo ele vem do banco), e o radar é visto por todo mundo. Para uma
  // pessoa sozinha não conseguir publicar um texto qualquer no radar da
  // liga, um agente só aparece se veio do acervo ou se pelo menos
  // EPI_AGENT_MIN_PEOPLE pessoas diferentes o registraram.
  const agentRows = await sql`
    SELECT details->>'agent' AS name, count(*)::int AS count
    FROM learning_attempts
    WHERE module = 'clinica' AND activity = 'caso_clinico' AND coalesce(details->>'agent', '') <> ''
    GROUP BY 1
    HAVING count(DISTINCT profile_id) >= ${EPI_AGENT_MIN_PEOPLE} OR bool_or(details->>'caseSource' = 'acervo')
    ORDER BY 2 DESC, 1 ASC LIMIT 6
  `;
  const total = Number(totals[0] && totals[0].total) || 0;
  const survived = Number(totals[0] && totals[0].survived) || 0;
  const data = {
    totalAttended: total,
    survivalRatePct: total ? Math.round((survived / total) * 100) : null,
    topToxindromes: (toxRows || []).map((r) => ({ name: r.name, count: Number(r.count) || 0 })),
    topAgents: (agentRows || []).map((r) => ({ name: r.name, count: Number(r.count) || 0 })),
  };
  await setCached(env, EPIDEMIOLOGY_CACHE_KEY, data, EPIDEMIOLOGY_TTL_SECONDS);
  return Object.assign({ success: true }, data);
}

// ---------------------------------------------------------------------------
// Moderação do acervo (admin)
// ---------------------------------------------------------------------------
export async function listPendingCases(sql, identity) {
  S.requireCapability(identity, 'content.review'); // admin ou cargo revisor de conteúdo (ADR 0010)
  const rows = await sql`
    SELECT c.id, c.title, c.toxindrome, c.agent, c.payload, c.created_at, p.full_name AS created_by_name
    FROM clinical_cases c
    LEFT JOIN profiles p ON p.id = c.created_by
    WHERE c.status = 'pending'
    ORDER BY c.created_at ASC
    LIMIT ${C.AI_LIMITS.PENDING_MAX}
  `;
  return {
    success: true,
    cases: (rows || []).map((r) => {
      const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
      const pac = p.paciente || {};
      const gab = p.gabaritoPreceptor || {};
      return {
        id: r.id,
        title: r.title,
        toxindrome: r.toxindrome,
        agent: r.agent,
        createdAt: r.created_at,
        createdByName: r.created_by_name || null,
        // Resumo para a moderação decidir sem abrir o JSON inteiro. Tudo é
        // exibido como texto pelo painel (frontend/admin-ai.js).
        summary: {
          difficulty: p.dificuldade || '',
          type: p.tipo || '',
          patient: [pac.nome, pac.idade ? pac.idade + ' anos' : ''].filter(Boolean).join(', '),
          chiefComplaint: p.queixaPrincipal || '',
          hiddenExposure: (p.contextoOculto && p.contextoOculto.exposicaoReal) || '',
          diagnosis: gab.diagnostico || '',
          conduct: gab.conduta || '',
          examsCount: Array.isArray(p.examesDisponiveis) ? p.examesDisponiveis.length : 0,
        },
      };
    }),
  };
}

// Aprovação de caso COM perfil de simulação (sql/037): lista de conferência completa e revisor clínico diferente do
// autor. O gatilho do banco impõe as duas regras mesmo que este código seja contornado; aqui só damos a mensagem clara.
async function approveSimCase(sql, identity, caseId, rawChecklist) {
  const checklist = ClinicalSim.parseChecklist(rawChecklist);
  try {
    return await sql`
      UPDATE clinical_cases
      SET status = 'approved', reviewed_by = ${identity.profileId}::uuid, reviewed_at = now(),
          review_checklist = ${JSON.stringify(checklist)}::jsonb,
          clinical_reviewed_by = ${identity.profileId}::uuid, clinical_reviewed_at = now()
      WHERE id = ${caseId}::uuid AND status = 'pending' AND sim_profile IS NOT NULL
      RETURNING id
    `;
  } catch (err) {
    throw ClinicalSim.translateReviewError(err);
  }
}

async function decideCase(sql, identity, caseId, decision) {
  try {
    return await sql`
      UPDATE clinical_cases
      SET status = ${decision}, reviewed_by = ${identity.profileId}::uuid, reviewed_at = now()
      WHERE id = ${caseId}::uuid AND status = 'pending'
      RETURNING id
    `;
  } catch (err) {
    // Caso com sim_profile aprovado sem a lista de conferência: o gatilho da 037 recusa.
    throw ClinicalSim.translateReviewError(err);
  }
}

async function explainNoUpdate(sql, caseId, simReview) {
  const current = simReview
    ? await sql`SELECT status, (sim_profile IS NOT NULL) AS has_sim FROM clinical_cases WHERE id = ${caseId}::uuid`
    : await sql`SELECT status FROM clinical_cases WHERE id = ${caseId}::uuid`;
  if (!current.length) throw E.NotFoundError('Caso não encontrado.');
  if (simReview && current[0].status === 'pending' && !current[0].has_sim) throw E.ValidationError(C.SIM_MESSAGES.reviewNoProfile);
  throw E.ConflictError('Este caso já foi revisado.');
}

export async function reviewCase(sql, env, identity, rawInput, correlationId) {
  S.requireCapability(identity, 'content.review'); // admin ou cargo revisor de conteúdo (ADR 0010)
  const input = asObject(rawInput);
  const caseId = cleanText(input.caseId, 40);
  const decision = cleanText(input.decision, 20);
  if (!UUID_RE.test(caseId)) throw E.ValidationError('Caso inválido.');
  if (decision !== 'approved' && decision !== 'rejected') throw E.ValidationError('Decisão inválida.');

  const simReview = decision === 'approved' && input.checklist !== undefined;
  // Revisão da simulação: sim.review. O gatilho da 037 segue exigindo revisor diferente do autor.
  if (simReview) S.requireCapability(identity, 'sim.review');
  const rows = simReview
    ? await approveSimCase(sql, identity, caseId, input.checklist)
    : await decideCase(sql, identity, caseId, decision);
  if (!rows.length) await explainNoUpdate(sql, caseId, simReview);

  await invalidateCached(env, LIBRARY_CACHE_KEY);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'REVIEW_CLINICAL_CASE', 'clinical_case', caseId, 'success', { decision, clinicalReview: simReview });
  return { success: true, message: decision === 'approved' ? 'Caso aprovado e publicado no acervo.' : 'Caso rejeitado.' };
}
