import { jest } from '@jest/globals';
import * as EventService from '../src/services/eventService.js';
import { makeSql } from './helpers/mockEnv.js';

const VISITOR = { profileId: 'v1', role: 'visitor' };
const MEMBER = { profileId: 'm1', role: 'member' };

describe('EventService.registerForEvent — visibilidade (achado de auditoria)', () => {
  test('visitor NÃO consegue se inscrever num evento visibility=members mesmo sabendo o ID', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ visibility: 'members' }]); // SELECT visibility
    await expect(EventService.registerForEvent(sql, VISITOR, 'evento-membros-1', 'cid')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
    // não deve nem tentar o INSERT depois de barrado na pré-checagem
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('member consegue se inscrever num evento visibility=members', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ visibility: 'members' }]) // SELECT visibility
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await EventService.registerForEvent(sql, MEMBER, 'evento-membros-1', 'cid');
    expect(res.success).toBe(true);
  });

  test('visitor consegue se inscrever num evento visibility=public', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ visibility: 'public' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await EventService.registerForEvent(sql, VISITOR, 'evento-publico-1', 'cid');
    expect(res.success).toBe(true);
  });
});

describe('EventService.listEvents — filtro de visibilidade por papel', () => {
  test('anônimo (identity null) só vê eventos public', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // SELECT events

    await EventService.listEvents(sql, null);
    const [queryText] = sql.mock.calls[0];
    expect(queryText).toContain("visibility = 'public'");
  });

  test('visitor autenticado vê public+authenticated, mas não members', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // events + "minhas inscrições"

    await EventService.listEvents(sql, VISITOR);
    const [queryText] = sql.mock.calls[0];
    expect(queryText).toContain("'public','authenticated'");
    expect(queryText).not.toContain('members');
  });

  test('member vê os 3 níveis de visibilidade', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // events + "minhas inscrições"

    await EventService.listEvents(sql, MEMBER);
    const [queryText] = sql.mock.calls[0];
    expect(queryText).toContain("'public','authenticated','members'");
  });
});

describe('EventService.listRecentCompletedEvents — histórico público', () => {
  test('devolve até 3 eventos concluídos, sem capacidade/inscrição (já encerrados)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { id: 'e1', title: 'Semana X', description: 'desc', event_date: '2026-01-01', image_url: 'https://x/img.png' },
    ]);

    const res = await EventService.listRecentCompletedEvents(sql);
    expect(res.success).toBe(true);
    expect(res.events).toEqual([
      { id: 'e1', title: 'Semana X', description: 'desc', eventDate: '2026-01-01', imageUrl: 'https://x/img.png' },
    ]);
  });
});
