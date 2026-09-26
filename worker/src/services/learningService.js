/**
 * learningService.js — progresso de aprendizagem dos módulos LAIFT
 * (Fase 2 da unificação: docs/PLANO_FASES_2_3_4.md, Contratos 1 e 2).
 *
 * Substitui o que o Google Apps Script fazia com a planilha
 * (`registrarMetricasQuiz`, `registrarFormulacaoLab`, `obterDashboardAluno`):
 *  - a identidade vem SEMPRE da sessão (identity.profileId) — nunca de um
 *    e-mail/matrícula enviado pelo módulo, que era o ponto fraco do legado
 *    (qualquer um gravava métrica no nome de qualquer outro);
 *  - toda entrada é validada com tipos e faixas rígidos antes de tocar o
 *    banco, e os mesmos limites existem como CHECK em sql/012_learning.sql;
 *  - estatísticas e conquistas são calculadas aqui, a partir de
 *    learning_attempts, e o cliente só as exibe.
 *
 * Os casos clínicos (activity='caso_clinico') são gravados pela Equipe 3
 * (clinicalService) direto em learning_attempts; aqui eles só são lidos.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

const QUIZ_ACTIVITIES = ['quiz_estudo', 'quiz_prova'];

// Controles C0/C1, marcas de direção bidirecional e separadores de linha
// Unicode: nunca têm uso legítimo num tópico/reagente/nome, e são a matéria
// prima de truques visuais (texto "invertido") no painel e no CSV.
const UNSAFE_CODE_RANGES = [
  [0x0000, 0x001f], [0x007f, 0x009f], // controles C0/C1
  [0x200b, 0x200f], // largura zero e marcas LRM/RLM
  [0x2028, 0x202e], // separadores de linha/parágrafo e embeddings/overrides
  [0x2066, 0x2069], // isolates bidirecionais
  [0xd800, 0xdfff], // surrogate isolado (texto UTF-16 inválido; o jsonb do Postgres recusa)
  [0xfeff, 0xfeff], // BOM / no-break de largura zero
];

function isUnsafeCode(code) {
  for (let i = 0; i < UNSAFE_CODE_RANGES.length; i++) {
    if (code >= UNSAFE_CODE_RANGES[i][0] && code <= UNSAFE_CODE_RANGES[i][1]) return true;
  }
  return false;
}

/**
 * Normaliza texto curto vindo do cliente: NFC, sem caracteres de controle
 * ou de direção, espaços colapsados. Não trunca — quem chama decide o
 * limite e recusa o que passar dele (validação rígida, não "conserto").
 */
export function cleanText(value) {
  if (value === null || value === undefined) return '';
  let out = '';
  for (const ch of String(value).normalize('NFC')) out += isUnsafeCode(ch.codePointAt(0)) ? ' ' : ch;
  return out.replace(/\s+/g, ' ').trim();
}

function isInt(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function validateTextList(value, fieldLabel) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw E.ValidationError(fieldLabel + ' inválidos.');
  if (value.length > C.LIMITS.LEARN_LIST_MAX_ITEMS) {
    throw E.ValidationError('No máximo ' + C.LIMITS.LEARN_LIST_MAX_ITEMS + ' ' + fieldLabel.toLowerCase() + '.');
  }
  const seen = new Set();
  const out = [];
  value.forEach((item) => {
    if (typeof item !== 'string') throw E.ValidationError(fieldLabel + ' inválidos.');
    const text = cleanText(item);
    if (!text) return;
    if (text.length > C.LIMITS.LEARN_LIST_ITEM_MAX) {
      throw E.ValidationError('Cada item de ' + fieldLabel.toLowerCase() + ' pode ter até ' + C.LIMITS.LEARN_LIST_ITEM_MAX + ' caracteres.');
    }
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function validateDuration(value) {
  if (value === undefined || value === null) return null;
  if (!isInt(value) || value < 0 || value > C.LIMITS.LEARN_DURATION_MAX_SECONDS) {
    throw E.ValidationError('Duração inválida.');
  }
  return value;
}

function assertDetailsSize(details) {
  const bytes = new TextEncoder().encode(JSON.stringify(details)).length;
  if (bytes > C.LIMITS.LEARN_DETAILS_MAX_BYTES) throw E.ValidationError('Detalhes da atividade grandes demais.');
}

async function insertAttempt(sql, identity, row) {
  const rows = await sql`
    INSERT INTO learning_attempts (profile_id, module, activity, score, max_score, duration_seconds, details)
    VALUES (${identity.profileId}::uuid, ${row.module}, ${row.activity}, ${row.score}, ${row.maxScore},
            ${row.durationSeconds}, ${JSON.stringify(row.details)}::jsonb)
    RETURNING id
  `;
  return rows[0].id;
}

// =============================================================================
// Gravações
// =============================================================================

/** apiLearnSubmitQuizAttempt — um simulado concluído (quiz/toxicologia/anatomia). */
export async function submitQuizAttempt(sql, identity, input, correlationId) {
  await S.enforceRateLimit(sql, 'learn_submit', identity.profileId, C.RATE_LIMITS.LEARN_SUBMIT.MAX_ATTEMPTS, C.RATE_LIMITS.LEARN_SUBMIT.WINDOW_SECONDS);

  const module = typeof input.module === 'string' ? input.module.trim() : '';
  if (C.LEARNING_QUIZ_MODULES.indexOf(module) === -1) throw E.ValidationError('Módulo inválido.');

  const mode = typeof input.mode === 'string' ? input.mode.trim() : '';
  if (mode !== 'estudo' && mode !== 'prova') throw E.ValidationError('Modo do simulado inválido.');

  const correct = input.correct;
  const total = input.total;
  if (!isInt(total) || total < 1 || total > C.LIMITS.LEARN_QUIZ_MAX_TOTAL) throw E.ValidationError('Total de questões inválido.');
  if (!isInt(correct) || correct < 0 || correct > total) throw E.ValidationError('Número de acertos inválido.');

  const durationSeconds = validateDuration(input.durationSeconds);
  const topics = validateTextList(input.topics, 'Tópicos');
  const details = { topics };
  assertDetailsSize(details);

  const activity = mode === 'prova' ? 'quiz_prova' : 'quiz_estudo';
  const attemptId = await insertAttempt(sql, identity, {
    module, activity, score: correct, maxScore: total, durationSeconds, details,
  });

  // Auditoria sem conteúdo (tópicos/placar ficam só na própria tabela).
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LEARN_SUBMIT_QUIZ', 'learning_attempt', attemptId, 'success', { module, activity });
  return { success: true, attemptId };
}

/** apiLearnRecordLabFormulation — uma síntese concluída na bancada virtual. */
export async function recordLabFormulation(sql, identity, input, correlationId) {
  await S.enforceRateLimit(sql, 'learn_lab', identity.profileId, C.RATE_LIMITS.LEARN_LAB.MAX_ATTEMPTS, C.RATE_LIMITS.LEARN_LAB.WINDOW_SECONDS);

  if (typeof input.product !== 'string') throw E.ValidationError('Informe o produto da formulação.');
  const product = cleanText(input.product);
  if (!product || product.length > C.LIMITS.LEARN_PRODUCT_MAX) throw E.ValidationError('Produto da formulação inválido.');

  const reagents = validateTextList(input.reagents, 'Reagentes');

  let temperature = null;
  if (input.temperature !== undefined && input.temperature !== null) {
    // Kelvin absoluto a um forno de laboratório — fora disso é dado forjado.
    if (typeof input.temperature !== 'number' || !Number.isFinite(input.temperature) || input.temperature < -273.15 || input.temperature > 3000) {
      throw E.ValidationError('Temperatura inválida.');
    }
    temperature = Math.round(input.temperature * 100) / 100;
  }

  if (input.stirring !== undefined && input.stirring !== null && typeof input.stirring !== 'boolean') {
    throw E.ValidationError('Agitação inválida.');
  }
  const stirring = input.stirring === true;

  let observation = '';
  if (input.observation !== undefined && input.observation !== null) {
    if (typeof input.observation !== 'string') throw E.ValidationError('Observação inválida.');
    observation = cleanText(input.observation);
    if (observation.length > C.LIMITS.LEARN_OBSERVATION_MAX) {
      throw E.ValidationError('Observação muito longa (máximo ' + C.LIMITS.LEARN_OBSERVATION_MAX + ' caracteres).');
    }
  }

  const details = { product, reagents, temperature, stirring, observation };
  assertDetailsSize(details);

  const attemptId = await insertAttempt(sql, identity, {
    module: 'laboratorio', activity: 'formulacao', score: null, maxScore: null, durationSeconds: null, details,
  });

  await Logging.logAudit(sql, correlationId, identity.profileId, 'LEARN_RECORD_FORMULATION', 'learning_attempt', attemptId, 'success', null);
  return { success: true, attemptId };
}

// =============================================================================
// Estatísticas e conquistas
// =============================================================================

function pct(part, whole) {
  return whole > 0 ? Math.round((part * 100) / whole) : null;
}

/**
 * Conquistas: regras fixas e calculadas no servidor (o cliente não tem
 * como "desbloquear" nada). `test` recebe o agregado montado em
 * getMyStats. Mantenha em sincronia com docs/FASE_2_DADOS_PRESENCA.md.
 */
const BADGES = [
  {
    id: 'primeiro_simulado', label: 'Primeiro simulado',
    description: 'Concluir o primeiro simulado em qualquer módulo.',
    test: (a) => a.quizzesCompleted >= 1,
  },
  {
    id: 'farmacologista', label: 'Farmacologista',
    description: 'Acertar 80% ou mais em Farmacologia, com pelo menos 20 questões respondidas.',
    test: (a) => a.quizByModule.farmacologia.answered >= 20 && pct(a.quizByModule.farmacologia.correct, a.quizByModule.farmacologia.answered) >= 80,
  },
  {
    id: 'toxicologista', label: 'Toxicologista',
    description: 'Acertar 80% ou mais em Toxicologia, com pelo menos 20 questões respondidas.',
    test: (a) => a.quizByModule.toxicologia.answered >= 20 && pct(a.quizByModule.toxicologia.correct, a.quizByModule.toxicologia.answered) >= 80,
  },
  {
    id: 'clinico', label: 'Clínico de plantão',
    description: 'Tirar nota 90 ou mais em um caso clínico.',
    test: (a) => a.clinicalBestScore !== null && a.clinicalBestScore >= 90,
  },
  {
    id: 'bancada', label: 'Mãos na bancada',
    description: 'Registrar a primeira formulação no laboratório virtual.',
    test: (a) => a.labFormulations >= 1,
  },
  {
    id: 'centena', label: 'Centena',
    description: 'Responder 100 questões nos simulados.',
    test: (a) => a.questionsAnswered >= 100,
  },
  {
    id: 'constancia', label: 'Constância',
    description: 'Concluir 10 atividades de aprendizagem (simulados, casos, formulações ou simulações).',
    test: (a) => a.totalActivities >= 10,
  },
];

/** apiLearnGetMyStats — agregado das tentativas DA PRÓPRIA sessão. */
export async function getMyStats(sql, identity) {
  // Agregação no banco, agrupada por (módulo, atividade): no máximo algumas
  // linhas por pessoa, qualquer que seja o tamanho do histórico.
  const rows = await sql`
    SELECT module, activity,
           count(*)::int AS attempts,
           count(score)::int AS scored,
           COALESCE(sum(score), 0)::int AS score_sum,
           COALESCE(sum(max_score), 0)::int AS max_sum,
           COALESCE(sum(score * 100.0 / max_score), 0)::float AS pct_sum,
           max(score * 100.0 / max_score)::float AS best_pct
    FROM learning_attempts
    WHERE profile_id = ${identity.profileId}::uuid
    GROUP BY module, activity
  `;

  const agg = {
    totalActivities: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    quizzesCompleted: 0,
    clinicalCasesCompleted: 0,
    clinicalPctSum: 0,
    clinicalScored: 0,
    clinicalBestScore: null,
    labFormulations: 0,
    pkSimulations: 0,
    quizByModule: {},
    module: {},
  };
  C.LEARNING_MODULES.forEach((m) => {
    agg.quizByModule[m] = { answered: 0, correct: 0 };
    agg.module[m] = { attempts: 0, scoreSum: 0, maxSum: 0 };
  });

  rows.forEach((r) => {
    const module = r.module;
    if (!agg.module[module]) return; // domínio garantido pelo CHECK; defesa extra
    const attempts = Number(r.attempts) || 0;
    agg.totalActivities += attempts;
    agg.module[module].attempts += attempts;
    agg.module[module].scoreSum += Number(r.score_sum) || 0;
    agg.module[module].maxSum += Number(r.max_sum) || 0;

    if (QUIZ_ACTIVITIES.indexOf(r.activity) !== -1) {
      agg.quizzesCompleted += attempts;
      agg.questionsAnswered += Number(r.max_sum) || 0;
      agg.questionsCorrect += Number(r.score_sum) || 0;
      agg.quizByModule[module].answered += Number(r.max_sum) || 0;
      agg.quizByModule[module].correct += Number(r.score_sum) || 0;
    } else if (r.activity === 'caso_clinico') {
      agg.clinicalCasesCompleted += attempts;
      agg.clinicalPctSum += Number(r.pct_sum) || 0;
      agg.clinicalScored += Number(r.scored) || 0;
      if (r.best_pct !== null && r.best_pct !== undefined) {
        const best = Math.round(Number(r.best_pct));
        agg.clinicalBestScore = agg.clinicalBestScore === null ? best : Math.max(agg.clinicalBestScore, best);
      }
    } else if (r.activity === 'formulacao') {
      agg.labFormulations += attempts;
    } else if (r.activity === 'simulacao_pk') {
      agg.pkSimulations += attempts;
    }
  });

  const byModule = {};
  C.LEARNING_MODULES.forEach((m) => {
    const mod = agg.module[m];
    // Quiz: acertos/questões; caso clínico: nota média (score sobre 100) —
    // os dois são "pontos obtidos / pontos possíveis". Atividades sem nota
    // (formulação, simulação PK) não entram; sem nota nenhuma → null.
    byModule[m] = { attempts: mod.attempts, accuracyPct: pct(mod.scoreSum, mod.maxSum) };
  });

  const badges = BADGES.map((b) => ({ id: b.id, label: b.label, description: b.description, unlocked: !!b.test(agg) }));

  return {
    success: true,
    stats: {
      accuracyPct: pct(agg.questionsCorrect, agg.questionsAnswered),
      questionsAnswered: agg.questionsAnswered,
      quizzesCompleted: agg.quizzesCompleted,
      clinicalCasesCompleted: agg.clinicalCasesCompleted,
      clinicalAvgScore: agg.clinicalScored > 0 ? Math.round(agg.clinicalPctSum / agg.clinicalScored) : null,
      labFormulations: agg.labFormulations,
      pkSimulations: agg.pkSimulations,
      totalActivities: agg.totalActivities,
      byModule,
      badges,
    },
  };
}
