import * as LearningService from '../src/services/learningService.js';
import { makeSql } from './helpers/mockEnv.js';

// Fase 2 — Dados & Presença: progresso de aprendizagem (learning_attempts).
const MEMBER = { profileId: '11111111-1111-4111-8111-111111111111', role: 'member', email: 'membro@x.com', fullName: 'Membro' };
const RATE_OK = [{ attempts: 1 }];
const RATE_BLOCKED = [{ attempts: 121 }];

/** Valores ligados ao template da N-ésima chamada a sql (sql`...${v}...`). */
function boundValues(sql, callIndex) {
  return sql.mock.calls[callIndex].slice(1);
}
function queryText(sql, callIndex) {
  const first = sql.mock.calls[callIndex][0];
  return Array.isArray(first) ? first.join('?') : String(first);
}

function validQuiz(overrides) {
  return Object.assign({ module: 'toxicologia', mode: 'prova', correct: 8, total: 10, durationSeconds: 420, topics: ['Antídotos'] }, overrides || {});
}

describe('LearningService.submitQuizAttempt', () => {
  test('grava a tentativa com a identidade da SESSÃO e audita sem conteúdo', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([{ id: 'att-1' }]).mockResolvedValueOnce(undefined);

    const res = await LearningService.submitQuizAttempt(sql, MEMBER, validQuiz({
      // Campos de identidade vindos do cliente são simplesmente ignorados.
      profileId: '99999999-9999-4999-8999-999999999999', email: 'outra@x.com',
      topics: [' Antídotos ', 'antídotos', 'Organo\u0000fosforados'],
    }), 'cid-1');

    expect(res).toEqual({ success: true, attemptId: 'att-1' });
    expect(queryText(sql, 1)).toContain('INSERT INTO learning_attempts');
    const values = boundValues(sql, 1);
    expect(values[0]).toBe(MEMBER.profileId);
    expect(values).toEqual([MEMBER.profileId, 'toxicologia', 'quiz_prova', 8, 10, 420, JSON.stringify({ topics: ['Antídotos', 'Organo fosforados'] })]);
    expect(JSON.stringify(sql.mock.calls)).not.toContain('99999999');

    const auditValues = boundValues(sql, 2);
    expect(auditValues).toContain('LEARN_SUBMIT_QUIZ');
    expect(auditValues[auditValues.length - 1]).toBe(JSON.stringify({ module: 'toxicologia', activity: 'quiz_prova' }));
  });

  test('modo estudo vira activity quiz_estudo; duração ausente vira NULL', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([{ id: 'att-2' }]).mockResolvedValueOnce(undefined);
    await LearningService.submitQuizAttempt(sql, MEMBER, { module: 'farmacologia', mode: 'estudo', correct: 0, total: 1 }, 'cid');
    expect(boundValues(sql, 1).slice(1, 6)).toEqual(['farmacologia', 'quiz_estudo', 0, 1, null]);
  });

  const invalid = [
    ['módulo fora do domínio', { module: 'clinica' }, 'Módulo inválido.'],
    ['módulo ausente', { module: undefined }, 'Módulo inválido.'],
    ['modo inválido', { mode: 'simulado' }, 'Modo do simulado inválido.'],
    ['acertos > total', { correct: 11, total: 10 }, 'Número de acertos inválido.'],
    ['acertos negativos', { correct: -1 }, 'Número de acertos inválido.'],
    ['acertos como texto', { correct: '8' }, 'Número de acertos inválido.'],
    ['acertos fracionários', { correct: 7.5 }, 'Número de acertos inválido.'],
    ['total zero', { correct: 0, total: 0 }, 'Total de questões inválido.'],
    ['total acima de 500', { correct: 1, total: 501 }, 'Total de questões inválido.'],
    ['duração negativa', { durationSeconds: -5 }, 'Duração inválida.'],
    ['duração acima de 24 h', { durationSeconds: 86401 }, 'Duração inválida.'],
    ['duração como texto', { durationSeconds: '300' }, 'Duração inválida.'],
    ['tópicos que não são lista', { topics: 'Antídotos' }, 'Tópicos inválidos.'],
    ['tópico que não é texto', { topics: [{ x: 1 }] }, 'Tópicos inválidos.'],
    ['mais de 20 tópicos', { topics: Array.from({ length: 21 }, (_, i) => 't' + i) }, 'No máximo 20 tópicos.'],
    ['tópico longo demais', { topics: ['x'.repeat(81)] }, 'Cada item de tópicos pode ter até 80 caracteres.'],
  ];
  test.each(invalid)('recusa %s sem gravar nada', async (_label, overrides, message) => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK);
    await expect(LearningService.submitQuizAttempt(sql, MEMBER, validQuiz(overrides), 'cid')).rejects.toMatchObject({ name: 'ValidationError', message });
    expect(sql).toHaveBeenCalledTimes(1); // só o rate limit
  });

  test('rate limit por perfil: estourado → RateLimitError e nenhuma gravação', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_BLOCKED);
    await expect(LearningService.submitQuizAttempt(sql, MEMBER, validQuiz(), 'cid')).rejects.toMatchObject({ name: 'RateLimitError' });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(boundValues(sql, 0)).toContain('learn_submit');
  });
});

describe('LearningService.recordLabFormulation', () => {
  const valid = { product: 'Ácido acetilsalicílico', reagents: ['Ácido salicílico', 'Anidrido acético'], temperature: 85.456, stirring: true, observation: 'Cristais brancos.' };

  test('grava formulação sem nota (score/max NULL), com details normalizado', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([{ id: 'lab-1' }]).mockResolvedValueOnce(undefined);
    const res = await LearningService.recordLabFormulation(sql, MEMBER, valid, 'cid');
    expect(res).toEqual({ success: true, attemptId: 'lab-1' });
    const values = boundValues(sql, 1);
    expect(values.slice(0, 6)).toEqual([MEMBER.profileId, 'laboratorio', 'formulacao', null, null, null]);
    expect(JSON.parse(values[6])).toEqual({
      product: 'Ácido acetilsalicílico', reagents: ['Ácido salicílico', 'Anidrido acético'], temperature: 85.46, stirring: true, observation: 'Cristais brancos.',
    });
    expect(boundValues(sql, 0)).toContain('learn_lab');
  });

  test('campos opcionais ausentes viram valores neutros', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([{ id: 'lab-2' }]).mockResolvedValueOnce(undefined);
    await LearningService.recordLabFormulation(sql, MEMBER, { product: 'Soro fisiológico' }, 'cid');
    expect(JSON.parse(boundValues(sql, 1)[6])).toEqual({ product: 'Soro fisiológico', reagents: [], temperature: null, stirring: false, observation: '' });
  });

  const invalid = [
    ['produto ausente', { product: undefined }, 'Informe o produto da formulação.'],
    ['produto vazio', { product: '   ' }, 'Produto da formulação inválido.'],
    ['produto longo demais', { product: 'x'.repeat(121) }, 'Produto da formulação inválido.'],
    ['reagentes que não são lista', { reagents: 'água' }, 'Reagentes inválidos.'],
    ['temperatura como texto', { temperature: '80' }, 'Temperatura inválida.'],
    ['temperatura abaixo do zero absoluto', { temperature: -300 }, 'Temperatura inválida.'],
    ['temperatura infinita', { temperature: Infinity }, 'Temperatura inválida.'],
    ['agitação não booleana', { stirring: 'sim' }, 'Agitação inválida.'],
    ['observação que não é texto', { observation: 42 }, 'Observação inválida.'],
    ['observação longa demais', { observation: 'x'.repeat(501) }, 'Observação muito longa (máximo 500 caracteres).'],
  ];
  test.each(invalid)('recusa %s sem gravar nada', async (_label, overrides, message) => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK);
    await expect(LearningService.recordLabFormulation(sql, MEMBER, Object.assign({}, valid, overrides), 'cid')).rejects.toMatchObject({ name: 'ValidationError', message });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('rate limit por perfil', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_BLOCKED);
    await expect(LearningService.recordLabFormulation(sql, MEMBER, valid, 'cid')).rejects.toMatchObject({ name: 'RateLimitError' });
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe('LearningService.getMyStats', () => {
  test('sem histórico: zeros, aproveitamento null e nenhuma conquista', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    const res = await LearningService.getMyStats(sql, MEMBER);
    expect(res.success).toBe(true);
    expect(res.stats).toMatchObject({
      accuracyPct: null, questionsAnswered: 0, quizzesCompleted: 0, clinicalCasesCompleted: 0,
      clinicalAvgScore: null, labFormulations: 0, totalActivities: 0,
    });
    expect(res.stats.byModule.toxicologia).toEqual({ attempts: 0, accuracyPct: null });
    expect(res.stats.badges.every((b) => b.unlocked === false)).toBe(true);
    expect(res.stats.badges.map((b) => b.id)).toEqual(['primeiro_simulado', 'farmacologista', 'toxicologista', 'clinico', 'bancada', 'centena', 'constancia']);
    // Agregação filtrada pela sessão, nunca por algo vindo do cliente.
    expect(boundValues(sql, 0)).toEqual([MEMBER.profileId]);
    expect(queryText(sql, 0)).toContain('GROUP BY module, activity');
  });

  test('agrega por módulo/atividade e calcula as conquistas no servidor', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { module: 'toxicologia', activity: 'quiz_prova', attempts: 2, scored: 2, score_sum: 17, max_sum: 20, pct_sum: 170, best_pct: 90 },
      { module: 'toxicologia', activity: 'quiz_estudo', attempts: 1, scored: 1, score_sum: 9, max_sum: 10, pct_sum: 90, best_pct: 90 },
      { module: 'farmacologia', activity: 'quiz_estudo', attempts: 3, scored: 3, score_sum: 40, max_sum: 90, pct_sum: 133, best_pct: 60 },
      { module: 'clinica', activity: 'caso_clinico', attempts: 2, scored: 2, score_sum: 165, max_sum: 200, pct_sum: 165, best_pct: 92 },
      { module: 'laboratorio', activity: 'formulacao', attempts: 1, scored: 0, score_sum: 0, max_sum: 0, pct_sum: 0, best_pct: null },
      { module: 'anatomia', activity: 'simulacao_pk', attempts: 1, scored: 0, score_sum: 0, max_sum: 0, pct_sum: 0, best_pct: null },
    ]);
    const { stats } = await LearningService.getMyStats(sql, MEMBER);
    expect(stats).toMatchObject({
      questionsAnswered: 120, // 20 + 10 + 90
      accuracyPct: 55, // (17 + 9 + 40) / 120
      quizzesCompleted: 6,
      clinicalCasesCompleted: 2,
      clinicalAvgScore: 83, // 165 / 2 = 82.5
      labFormulations: 1,
      pkSimulations: 1,
      totalActivities: 10,
    });
    expect(stats.byModule).toEqual({
      farmacologia: { attempts: 3, accuracyPct: 44 },
      toxicologia: { attempts: 3, accuracyPct: 87 },
      clinica: { attempts: 2, accuracyPct: 83 },
      laboratorio: { attempts: 1, accuracyPct: null },
      anatomia: { attempts: 1, accuracyPct: null },
    });
    const unlocked = stats.badges.filter((b) => b.unlocked).map((b) => b.id);
    expect(unlocked).toEqual(['primeiro_simulado', 'toxicologista', 'clinico', 'bancada', 'centena', 'constancia']);
    stats.badges.forEach((b) => {
      expect(Object.keys(b).sort()).toEqual(['description', 'id', 'label', 'unlocked']);
    });
  });

  test('toxicologista exige volume mínimo: 100% com menos de 20 questões não desbloqueia', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { module: 'toxicologia', activity: 'quiz_prova', attempts: 1, scored: 1, score_sum: 19, max_sum: 19, pct_sum: 100, best_pct: 100 },
      { module: 'clinica', activity: 'caso_clinico', attempts: 1, scored: 1, score_sum: 89, max_sum: 100, pct_sum: 89, best_pct: 89 },
    ]);
    const { stats } = await LearningService.getMyStats(sql, MEMBER);
    const byId = Object.fromEntries(stats.badges.map((b) => [b.id, b.unlocked]));
    expect(byId.toxicologista).toBe(false);
    expect(byId.clinico).toBe(false);
  });
});

describe('LearningService.cleanText', () => {
  test('remove controles, marcas bidirecionais e surrogates isolados; colapsa espaços', () => {
    const rlo = String.fromCharCode(0x202e);
    const zw = String.fromCharCode(0x200b);
    const lone = String.fromCharCode(0xd800);
    expect(LearningService.cleanText('  a\tb\n' + rlo + 'c' + zw + 'd' + lone + ' ')).toBe('a b c d');
    expect(LearningService.cleanText('Ácido 😀')).toBe('Ácido 😀');
    expect(LearningService.cleanText(null)).toBe('');
  });
});
