/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import * as Engagement from '../src/services/engagementService.js';
import { makeSql } from './helpers/mockEnv.js';

// ENG-02 (streak e meta diária no servidor, fuso America/Sao_Paulo) e ENG-01 (última atividade).
const MEMBER = { profileId: '11111111-1111-4111-8111-111111111111', role: 'member', email: 'membro@x.com', fullName: 'Membro' };
// 2026-10-31 02:30 UTC ainda é 30/10 em São Paulo (UTC-3).
const NOW_BEFORE_MIDNIGHT_SP = new Date('2026-10-31T02:30:00Z');
const NOW = new Date('2026-10-31T15:00:00Z');

describe('dia em America/Sao_Paulo', () => {
  test('madrugada UTC ainda é o dia anterior em São Paulo', () => {
    expect(Engagement.saoPauloDateKey(NOW_BEFORE_MIDNIGHT_SP)).toBe('2026-10-30');
    expect(Engagement.saoPauloDateKey(NOW)).toBe('2026-10-31');
  });
});

describe('computeStreak', () => {
  test('sem nenhum dia: sequência zero', () => {
    expect(Engagement.computeStreak([], '2026-10-31')).toEqual({ current: 0, best: 0, activeToday: false });
  });
  test('dias seguidos até hoje', () => {
    expect(Engagement.computeStreak(['2026-10-31', '2026-10-30', '2026-10-29'], '2026-10-31'))
      .toEqual({ current: 3, best: 3, activeToday: true });
  });
  test('ainda sem atividade hoje: a sequência de ontem segue viva', () => {
    expect(Engagement.computeStreak(['2026-10-30', '2026-10-29'], '2026-10-31'))
      .toEqual({ current: 2, best: 2, activeToday: false });
  });
  test('último dia antes de ontem: sequência atual zera, o recorde fica', () => {
    expect(Engagement.computeStreak(['2026-10-28', '2026-10-27', '2026-10-26', '2026-10-20'], '2026-10-31'))
      .toEqual({ current: 0, best: 3, activeToday: false });
  });
  test('atravessa virada de mês e de ano', () => {
    expect(Engagement.computeStreak(['2027-01-01', '2026-12-31', '2026-12-30'], '2027-01-01').current).toBe(3);
    expect(Engagement.computeStreak(['2026-11-01', '2026-10-31'], '2026-11-01').current).toBe(2);
  });
});

describe('getEngagement', () => {
  test('monta streak, meta, quiz do dia e última atividade só com a sessão', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ day: '2026-10-31' }, { day: '2026-10-30' }])
      .mockResolvedValueOnce([{ questions_today: 7, daily_quiz_done: true }])
      .mockResolvedValueOnce([{ module: 'toxicologia', activity: 'quiz_estudo', created_at: new Date('2026-10-31T14:00:00Z') }])
      .mockResolvedValueOnce([{ daily_goal: 5 }]);
    const res = await Engagement.getEngagement(sql, MEMBER, NOW);
    expect(res).toEqual({
      success: true,
      engagement: {
        today: '2026-10-31',
        streak: { current: 2, best: 2, activeToday: true },
        goal: { target: 5, todayQuestions: 7, reached: true, persisted: true },
        dailyQuizDone: true,
        last: { module: 'toxicologia', activity: 'quiz_estudo', at: '2026-10-31T14:00:00.000Z' },
      },
    });
    for (let i = 0; i < 4; i++) expect(sql.mock.calls[i].slice(1)).toContain(MEMBER.profileId);
    expect(sql.mock.calls.map((c) => c[0].join('?')).join('\n')).toContain('America/Sao_Paulo');
  });

  test('sem histórico: tudo zerado, meta padrão 10 e last nulo', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ questions_today: 0, daily_quiz_done: false }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await Engagement.getEngagement(sql, MEMBER, NOW);
    expect(res.engagement.streak).toEqual({ current: 0, best: 0, activeToday: false });
    expect(res.engagement.goal).toEqual({ target: 10, todayQuestions: 0, reached: false, persisted: false });
    expect(res.engagement.last).toBeNull();
  });

  test('coluna daily_goal ausente (migração 047 não aplicada): degrada para a meta padrão', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ questions_today: 3, daily_quiz_done: false }]).mockResolvedValueOnce([])
      .mockRejectedValueOnce(Object.assign(new Error('column "daily_goal" does not exist'), { code: '42703' }));
    const res = await Engagement.getEngagement(sql, MEMBER, NOW);
    expect(res.success).toBe(true);
    expect(res.engagement.goal).toMatchObject({ target: 10, todayQuestions: 3, persisted: false });
  });

  test('módulo desconhecido na última tentativa não vaza para o cliente', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ questions_today: 0, daily_quiz_done: false }])
      .mockResolvedValueOnce([{ module: 'x<script>', activity: 'y', created_at: new Date('2026-10-31T14:00:00Z') }]).mockResolvedValueOnce([]);
    const res = await Engagement.getEngagement(sql, MEMBER, NOW);
    expect(res.engagement.last).toBeNull();
  });
});

describe('setDailyGoal', () => {
  test.each([[5], [10], [20]])('aceita %i questões', async (goal) => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ daily_goal: goal }]);
    const res = await Engagement.setDailyGoal(sql, MEMBER, { goal });
    expect(res).toEqual({ success: true, goal });
    expect(sql.mock.calls[0].slice(1)).toContain(MEMBER.profileId);
  });
  test.each([[7], ['10'], [0], [null], [undefined], [1000]])('recusa %p', async (goal) => {
    const sql = makeSql();
    await expect(Engagement.setDailyGoal(sql, MEMBER, { goal })).rejects.toThrow('Meta diária inválida.');
    expect(sql).not.toHaveBeenCalled();
  });
  test('sem a coluna: avisa que fica só neste aparelho, sem erro 500', async () => {
    const sql = makeSql();
    sql.mockRejectedValueOnce(Object.assign(new Error('column "daily_goal" of relation "preferences" does not exist'), { code: '42703' }));
    const res = await Engagement.setDailyGoal(sql, MEMBER, { goal: 5 });
    expect(res).toMatchObject({ success: false, localOnly: true, goal: 5 });
  });
});
