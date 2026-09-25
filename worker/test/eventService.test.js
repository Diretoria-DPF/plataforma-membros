import { jest } from '@jest/globals';
import * as EventService from '../src/services/eventService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

const VISITOR = { profileId: 'v1', role: 'visitor', email: 'visitante@x.com', fullName: 'Visitante' };
const MEMBER = { profileId: 'm1', role: 'member', email: 'membro@x.com', fullName: 'Membro' };

// registerForEvent envia um e-mail de confirmação (mailer.js chama fetch()
// de verdade contra a API da Brevo) — mockamos fetch global para nenhum
// teste bater na rede.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
});

describe('EventService.registerForEvent — visibilidade (achado de auditoria)', () => {
  test('visitor NÃO consegue se inscrever num evento visibility=members mesmo sabendo o ID', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql.mockResolvedValueOnce([{ visibility: 'members' }]); // SELECT evento
    await expect(EventService.registerForEvent(sql, env, VISITOR, 'evento-membros-1', 'cid')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
    // não deve nem tentar o INSERT depois de barrado na pré-checagem
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('member consegue se inscrever num evento visibility=members', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ id: 'evento-membros-1', title: 'Evento', description: 'desc', event_date: '2026-01-01', location: null, visibility: 'members' }]) // SELECT evento
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await EventService.registerForEvent(sql, env, MEMBER, 'evento-membros-1', 'cid');
    expect(res.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://api.brevo.com/v3/smtp/email', expect.any(Object));
  });

  test('visitor consegue se inscrever num evento visibility=public', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ id: 'evento-publico-1', title: 'Evento', description: 'desc', event_date: '2026-01-01', location: 'Auditório', visibility: 'public' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await EventService.registerForEvent(sql, env, VISITOR, 'evento-publico-1', 'cid');
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
      { id: 'e1', title: 'Semana X', description: 'desc', event_date: '2026-01-01', image_url: 'https://x/img.png', location: 'Auditório' },
    ]);

    const res = await EventService.listRecentCompletedEvents(sql);
    expect(res.success).toBe(true);
    expect(res.events).toEqual([
      { id: 'e1', title: 'Semana X', description: 'desc', eventDate: '2026-01-01', imageUrl: 'https://x/img.png', location: 'Auditório' },
    ]);
  });
});
