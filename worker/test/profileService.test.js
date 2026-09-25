import { jest } from '@jest/globals';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };

describe('ProfileService.getMyMetrics', () => {
  test('agrega contagens e listas recentes, tudo filtrado pelo profileId da própria sessão', async () => {
    const ProfileService = await import('../src/services/profileService.js');
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([
        { id: 'e1', title: 'Evento 1', event_date: '2026-01-01', status: 'completed' },
      ]) // eventos
      .mockResolvedValueOnce([
        { id: 't1', title: 'Tarefa 1', due_date: '2026-01-02', completed_at: '2026-01-03' },
        { id: 't2', title: 'Tarefa 2', due_date: '2026-01-04', completed_at: null },
      ]) // tarefas
      .mockResolvedValueOnce([{ total: '2' }]) // propostas
      .mockResolvedValueOnce([{ total: '5' }]) // votos
      .mockResolvedValueOnce([{ total: '1' }]); // feedback

    const res = await ProfileService.getMyMetrics(sql, MEMBER);

    expect(res.success).toBe(true);
    expect(res.metrics).toEqual({
      eventsCount: 1,
      tasksCount: 2,
      tasksCompletedCount: 1,
      proposalsCount: 2,
      votesCount: 5,
      feedbackCount: 1,
    });
    expect(res.recentTasks).toEqual([
      { id: 't1', title: 'Tarefa 1', dueDate: '2026-01-02', completed: true },
      { id: 't2', title: 'Tarefa 2', dueDate: '2026-01-04', completed: false },
    ]);
  });
});

describe('ProfileService.updateMyAvatarFromBase64', () => {
  test('delega para mediaService.updateMyAvatar com os mesmos argumentos', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../src/services/mediaService.js', () => ({
      updateMyAvatar: jest.fn().mockResolvedValue({ success: true, message: 'Avatar atualizado.', avatarUrl: 'https://x/avatar.png' }),
    }));

    const ProfileService = await import('../src/services/profileService.js');
    const MediaService = await import('../src/services/mediaService.js');
    const sql = makeSql();
    const env = makeEnv();

    const res = await ProfileService.updateMyAvatarFromBase64(sql, env, MEMBER, 'base64data', 'image/png', 'cid-1');

    expect(MediaService.updateMyAvatar).toHaveBeenCalledWith(sql, env, MEMBER, 'base64data', 'image/png', 'cid-1');
    expect(res.avatarUrl).toBe('https://x/avatar.png');
  });
});
