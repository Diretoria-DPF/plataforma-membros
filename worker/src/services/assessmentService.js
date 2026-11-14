/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assessmentService.js — prova do curso, sorteada e corrigida NA WORKER (sql/056; docs/cursos-operacao.md).
 *
 * Contrato (testado): nenhuma resposta leva o gabarito (assessment_questions.correct), o id das questões nem a
 * ordem original das alternativas. A pessoa recebe só enunciado e alternativas embaralhadas por tentativa; responde
 * com a POSIÇÃO exibida; a Worker traduz pela ordem gravada na abertura e corrige.
 *
 * Regras: aulas todas lidas e tempo mínimo de estudo (min_study_pct do previsto); uma tentativa aberta por vez
 * (índice parcial no banco); prazo por tentativa (attempt_minutes + folga de rede); max_attempts por versão do
 * curso, com retry_wait_hours entre elas; nota mínima pass_pct; questão crítica errada reprova; sorteio com ao
 * menos min_critical críticas. Tentativa vencida e não enviada conta como nota 0. Depois da aprovação ou das
 * tentativas esgotadas, a pessoa vê QUAIS enunciados errou e a fonte para revisar (nunca a alternativa certa).
 */
import * as C from '../constants.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import {
  guarded, requireUuid, requireLearner, requireFlag, limitExam, iso, randomInt, shuffle,
} from './courseCommon.js';

const K = C.COURSES;
const HOUR_MS = 3600 * 1000;
const MINUTE_MS = 60 * 1000;

// ---------------------------------------------------------------------------------------------------------------
// Puras (sem I/O)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Situação da prova para a pessoa. Entrada já lida do banco; devolve { state, ... } sem efeito colateral.
 * state: aprovado | em_andamento | aulas_pendentes | tempo_minimo | tentativas_esgotadas | aguardar |
 *        prova_indisponivel | disponivel
 */
export function decideExam({ course, progress, lessonsTotal, totalMinutes, attempts, bank, now }) {
  const list = Array.isArray(attempts) ? attempts : [];
  const submitted = list.filter((a) => a.submitted_at);
  const used = submitted.length;
  const base = { attemptsUsed: used, maxAttempts: Number(course.max_attempts) };
  const passedAttempt = submitted.find((a) => a.passed === true);
  if (passedAttempt) return Object.assign(base, { state: 'aprovado', scorePct: Number(passedAttempt.score_pct) });
  const open = list.find((a) => !a.submitted_at && new Date(a.expires_at).getTime() > now);
  if (open) return Object.assign(base, { state: 'em_andamento', expiresAt: iso(open.expires_at) });
  const done = progress && Array.isArray(progress.lessons_done) ? new Set(progress.lessons_done.map(Number)) : new Set();
  if (!progress || done.size < lessonsTotal || lessonsTotal === 0) return Object.assign(base, { state: 'aulas_pendentes' });
  const minStudyMs = Math.ceil((Number(course.min_study_pct) / 100) * totalMinutes) * MINUTE_MS;
  const readyAt = new Date(progress.started_at).getTime() + minStudyMs;
  if (now < readyAt) return Object.assign(base, { state: 'tempo_minimo', readyAt: new Date(readyAt).toISOString() });
  if (used >= Number(course.max_attempts)) return Object.assign(base, { state: 'tentativas_esgotadas' });
  if (used > 0) {
    const last = Math.max(...submitted.map((a) => new Date(a.submitted_at).getTime()));
    const retryAt = last + Number(course.retry_wait_hours) * HOUR_MS;
    if (now < retryAt) return Object.assign(base, { state: 'aguardar', retryAt: new Date(retryAt).toISOString() });
  }
  if (!bank || bank.total < Number(course.exam_size) || bank.critical < Number(course.min_critical)) {
    return Object.assign(base, { state: 'prova_indisponivel' });
  }
  return Object.assign(base, { state: 'disponivel' });
}

/**
 * Sorteio: min_critical críticas primeiro, o resto do banco completa até exam_size; ordem final embaralhada.
 * pool: [{ id, is_critical, options }]. Devolve { questionIds, optionOrder } (optionOrder[i][posExibida] = índice original).
 */
export function drawExam(pool, examSize, minCritical, rand = randomInt) {
  const critical = shuffle(pool.filter((q) => q.is_critical), rand);
  if (pool.length < examSize || critical.length < minCritical) throw E.ConflictError('A prova deste curso ainda não está pronta.');
  const chosen = critical.slice(0, minCritical);
  const taken = new Set(chosen.map((q) => q.id));
  const rest = shuffle(pool.filter((q) => !taken.has(q.id)), rand);
  const picked = shuffle(chosen.concat(rest.slice(0, examSize - chosen.length)), rand);
  return {
    questionIds: picked.map((q) => q.id),
    optionOrder: picked.map((q) => shuffle(q.options.map((_, i) => i), rand)),
  };
}

/** Respostas: lista com uma posição exibida (inteiro) ou null por questão, do tamanho exato da prova. */
export function normalizeAnswers(raw, optionOrder) {
  if (!Array.isArray(raw) || raw.length !== optionOrder.length) throw E.ValidationError('Respostas inválidas.');
  return raw.map((value, i) => {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value) || value < 0 || value >= optionOrder[i].length) throw E.ValidationError('Respostas inválidas.');
    return value;
  });
}

/**
 * Correção. questions: mapa id → { correct, is_critical }. Devolve { correctCount, scorePct, criticalMissed,
 * wrongIndexes } (índices da prova, na ordem exibida). Questão sem resposta conta como errada.
 */
export function gradeAttempt(questionIds, optionOrder, answers, questions) {
  let correctCount = 0;
  let criticalMissed = 0;
  const wrongIndexes = [];
  questionIds.forEach((id, i) => {
    const q = questions[id];
    const chosen = answers[i];
    const ok = Boolean(q) && chosen !== null && Number(optionOrder[i][chosen]) === Number(q.correct);
    if (ok) { correctCount++; return; }
    wrongIndexes.push(i);
    if (q && q.is_critical) criticalMissed++;
  });
  const scorePct = questionIds.length ? Math.floor((100 * correctCount) / questionIds.length) : 0;
  return { correctCount, scorePct, criticalMissed, wrongIndexes };
}

export const isPass = (course, grade) => grade.scorePct >= Number(course.pass_pct) && grade.criticalMissed === 0;

// ---------------------------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------------------------

/** Curso publicado ou NotFound (o mesmo erro para inexistente e não publicado: nada vaza sobre rascunhos). */
export async function loadPublishedCourse(sql, courseId) {
  const rows = await guarded(() => sql`SELECT id, slug, title, summary, kind, workload_minutes, version, pass_pct, max_attempts,
      retry_wait_hours, exam_size, min_critical, attempt_minutes, min_study_pct, validity_months, status
    FROM courses WHERE id = ${courseId}::uuid AND status = 'publicado'`);
  if (!rows.length) throw E.NotFoundError('Curso não encontrado.');
  return rows[0];
}

/** Fecha com nota 0 as tentativas vencidas (passada a folga) da pessoa neste curso. */
export async function closeExpired(sql, profileId, courseId) {
  await sql`UPDATE assessment_attempts
    SET submitted_at = now(), score_pct = 0, critical_missed = 0, passed = FALSE
    WHERE profile_id = ${profileId}::uuid AND course_id = ${courseId}::uuid AND submitted_at IS NULL
      AND expires_at < now() - make_interval(secs => ${K.SUBMIT_GRACE_SECONDS})`;
}

/** Lê tudo o que decideExam precisa (progresso, aulas, tentativas desta versão, tamanho do banco). */
export async function loadExamContext(sql, profileId, course) {
  const [progressRows, lessonRows, attempts, bankRows] = await Promise.all([
    sql`SELECT course_version, lessons_done, started_at FROM course_progress WHERE profile_id = ${profileId}::uuid AND course_id = ${course.id}::uuid`,
    sql`SELECT count(*)::int AS n, COALESCE(sum(min_minutes), 0)::int AS minutes FROM course_lessons WHERE course_id = ${course.id}::uuid`,
    sql`SELECT id, started_at, expires_at, submitted_at, passed, score_pct FROM assessment_attempts
        WHERE profile_id = ${profileId}::uuid AND course_id = ${course.id}::uuid AND course_version = ${course.version}
        ORDER BY started_at`,
    sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE is_critical)::int AS critical
        FROM assessment_questions WHERE course_id = ${course.id}::uuid AND active`,
  ]);
  const progress = progressRows[0] && Number(progressRows[0].course_version) === Number(course.version) ? progressRows[0] : null;
  return {
    course, progress, attempts,
    lessonsTotal: Number(lessonRows[0].n), totalMinutes: Number(lessonRows[0].minutes),
    bank: { total: Number(bankRows[0].total), critical: Number(bankRows[0].critical) },
  };
}

/** Enunciados e alternativas na ordem da tentativa (sem id, sem gabarito). */
async function questionsForAttempt(sql, attempt) {
  const ids = attempt.question_ids;
  const rows = await sql`SELECT id, stem, options FROM assessment_questions WHERE id = ANY(${ids}::uuid[])`;
  const byId = {};
  rows.forEach((r) => { byId[r.id] = r; });
  const order = attempt.option_order;
  return ids.map((id, i) => {
    const q = byId[id];
    const opts = Array.isArray(q && q.options) ? q.options : [];
    return { n: i + 1, stem: q ? q.stem : '', options: order[i].map((orig) => String(opts[orig] ?? '')) };
  });
}

const attemptDto = async (sql, attempt) => ({
  attemptId: attempt.id,
  expiresAt: iso(attempt.expires_at),
  questions: await questionsForAttempt(sql, attempt),
});

/** Situação da prova para a tela do curso (sem efeito além de fechar tentativas vencidas). */
export async function examStatus(sql, identity, course, now = Date.now()) {
  await closeExpired(sql, identity.profileId, course.id);
  const ctx = await loadExamContext(sql, identity.profileId, course);
  return decideExam(Object.assign({ now }, ctx));
}

const STATE_MESSAGE = {
  aprovado: 'Você já foi aprovada ou aprovado neste curso.',
  aulas_pendentes: 'Leia todas as aulas antes da prova.',
  tempo_minimo: 'A prova abre depois do tempo mínimo de estudo.',
  tentativas_esgotadas: 'Você usou todas as tentativas desta versão do curso. Fale com quem instrui o curso.',
  aguardar: 'Aguarde o intervalo entre tentativas.',
  prova_indisponivel: 'A prova deste curso ainda não está pronta.',
};

// ---------------------------------------------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------------------------------------------

/** apiLearnCourseExamStart({ courseId }): abre (ou retoma) a tentativa. */
export async function startExam(sql, identity, input, correlationId, now = Date.now()) {
  requireLearner(identity);
  await requireFlag(sql, K.FLAG, identity);
  const courseId = requireUuid(input.courseId, 'Curso');
  await limitExam(sql, identity);
  const course = await loadPublishedCourse(sql, courseId);
  await guarded(() => closeExpired(sql, identity.profileId, courseId));
  const ctx = await loadExamContext(sql, identity.profileId, course);
  const decision = decideExam(Object.assign({ now }, ctx));
  if (decision.state === 'em_andamento') {
    const open = await sql`SELECT id, question_ids, option_order, expires_at FROM assessment_attempts
      WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid AND submitted_at IS NULL`;
    if (open.length) return Object.assign({ success: true, resumed: true }, await attemptDto(sql, open[0]));
  }
  if (decision.state !== 'disponivel') {
    const err = (decision.state === 'aprovado' ? E.ConflictError : E.ForbiddenError)(STATE_MESSAGE[decision.state] || 'A prova não está disponível.');
    err.payload = { exam: decision };
    throw err;
  }
  const pool = await sql`SELECT id, is_critical, options FROM assessment_questions WHERE course_id = ${courseId}::uuid AND active`;
  const draw = drawExam(pool, Number(course.exam_size), Number(course.min_critical));
  const expiresAt = new Date(now + Number(course.attempt_minutes) * MINUTE_MS);
  let rows;
  try {
    rows = await sql`INSERT INTO assessment_attempts (profile_id, course_id, course_version, question_ids, option_order, started_at, expires_at)
      SELECT ${identity.profileId}::uuid, ${courseId}::uuid, ${course.version}, ${draw.questionIds}::uuid[], ${JSON.stringify(draw.optionOrder)}::jsonb,
             ${new Date(now).toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz
      WHERE (SELECT count(*) FROM assessment_attempts WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid
               AND course_version = ${course.version} AND submitted_at IS NOT NULL) = ${decision.attemptsUsed}
      RETURNING id, question_ids, option_order, expires_at`;
    // Outra aba enviou uma tentativa entre a decisão e o INSERT: nada é aberto (limite e espera continuam valendo).
    if (!rows.length) throw E.ConflictError('A situação da prova mudou. Atualize a tela e tente de novo.');
  } catch (err) {
    // Duas abas abrindo ao mesmo tempo: o índice parcial barra a segunda; devolve a que ficou.
    if (!/uq_assessment_attempts_open|duplicate key/i.test(String(err && err.message))) throw err;
    rows = await sql`SELECT id, question_ids, option_order, expires_at FROM assessment_attempts
      WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid AND submitted_at IS NULL`;
    if (!rows.length) throw err;
  }
  await Logging.logAudit(sql, correlationId, identity.profileId, 'COURSE_EXAM_START', 'course', courseId, 'success',
    { attemptId: rows[0].id, version: course.version, size: draw.questionIds.length });
  return Object.assign({ success: true, resumed: false }, await attemptDto(sql, rows[0]));
}

/** Revisão depois da aprovação ou das tentativas esgotadas: enunciado errado + fonte (nunca a alternativa certa). */
async function reviewFor(sql, attempt, wrongIndexes) {
  if (!wrongIndexes.length) return [];
  const ids = wrongIndexes.map((i) => attempt.question_ids[i]);
  const rows = await sql`SELECT id, stem, source_ref FROM assessment_questions WHERE id = ANY(${ids}::uuid[])`;
  const byId = {};
  rows.forEach((r) => { byId[r.id] = r; });
  return wrongIndexes.map((i) => {
    const q = byId[attempt.question_ids[i]] || {};
    return { n: i + 1, stem: q.stem || '', source: q.source_ref || '' };
  });
}

/** apiLearnCourseExamSubmit({ attemptId, answers }): corrige na Worker e fecha a tentativa (uma vez só). */
export async function submitExam(sql, identity, input, correlationId, now = Date.now()) {
  requireLearner(identity);
  await requireFlag(sql, K.FLAG, identity);
  const attemptId = requireUuid(input.attemptId, 'Tentativa');
  await limitExam(sql, identity);
  const found = await guarded(() => sql`SELECT id, course_id, course_version, question_ids, option_order, expires_at
    FROM assessment_attempts WHERE id = ${attemptId}::uuid AND profile_id = ${identity.profileId}::uuid AND submitted_at IS NULL`);
  if (!found.length) throw E.NotFoundError('Tentativa não encontrada ou já enviada.');
  const attempt = found[0];
  const course = await loadPublishedCourse(sql, attempt.course_id);
  if (now > new Date(attempt.expires_at).getTime() + K.SUBMIT_GRACE_SECONDS * 1000) {
    await closeExpired(sql, identity.profileId, attempt.course_id);
    throw E.ConflictError('O tempo desta tentativa acabou. Ela contou como uma tentativa.');
  }
  const answers = normalizeAnswers(input.answers, attempt.option_order);
  const keyRows = await sql`SELECT id, correct, is_critical FROM assessment_questions WHERE id = ANY(${attempt.question_ids}::uuid[])`;
  const key = {};
  keyRows.forEach((r) => { key[r.id] = r; });
  const grade = gradeAttempt(attempt.question_ids, attempt.option_order, answers, key);
  const passed = isPass(course, grade);
  const closed = await sql`UPDATE assessment_attempts
    SET submitted_at = ${new Date(now).toISOString()}::timestamptz, answers = ${JSON.stringify(answers)}::jsonb,
        score_pct = ${grade.scorePct}, critical_missed = ${grade.criticalMissed}, passed = ${passed}
    WHERE id = ${attemptId}::uuid AND profile_id = ${identity.profileId}::uuid AND submitted_at IS NULL
    RETURNING id`;
  if (!closed.length) throw E.ConflictError('Esta tentativa já foi enviada.');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'COURSE_EXAM_SUBMIT', 'course', attempt.course_id, 'success',
    { attemptId, scorePct: grade.scorePct, passed, criticalMissed: grade.criticalMissed });
  const status = await examStatus(sql, identity, course, now);
  const showReview = passed || status.state === 'tentativas_esgotadas';
  return {
    success: true,
    passed,
    scorePct: grade.scorePct,
    passPct: Number(course.pass_pct),
    correctCount: grade.correctCount,
    total: attempt.question_ids.length,
    criticalMissed: grade.criticalMissed,
    exam: status,
    review: showReview ? await reviewFor(sql, attempt, grade.wrongIndexes) : null,
  };
}
