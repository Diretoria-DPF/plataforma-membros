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
      .mockResolvedValueOnce(undefined) // logAudit
      .mockResolvedValueOnce([{ email_notifications: true }]); // SELECT preferences

    const res = await EventService.registerForEvent(sql, env, MEMBER, 'evento-membros-1', 'cid');
    expect(res.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://api.brevo.com/v3/smtp/email', expect.any(Object));
  });

  test('visitor com notificações por e-mail desativadas NÃO recebe e-mail de confirmação (mas a inscrição vale)', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ id: 'evento-publico-1', title: 'Evento', description: 'desc', event_date: '2026-01-01', location: 'Auditório', visibility: 'public' }])
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined) // logAudit
      .mockResolvedValueOnce([{ email_notifications: false }]); // SELECT preferences

    const res = await EventService.registerForEvent(sql, env, VISITOR, 'evento-publico-1', 'cid');
    expect(res.success).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('visitor consegue se inscrever num evento visibility=public', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ id: 'evento-publico-1', title: 'Evento', description: 'desc', event_date: '2026-01-01', location: 'Auditório', visibility: 'public' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]); // SELECT preferences — sem linha ainda (perfil recém-criado) conta como "quer e-mail"

    const res = await EventService.registerForEvent(sql, env, VISITOR, 'evento-publico-1', 'cid');
    expect(res.success).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('EventService.listEvents — filtro de visibilidade por papel', () => {
  test('anônimo (identity null) só vê eventos public', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql.mockResolvedValueOnce([]); // SELECT events

    await EventService.listEvents(sql, env, null);
    const [queryText] = sql.mock.calls[0];
    expect(queryText).toContain("visibility = 'public'");
  });

  test('visitor autenticado vê public+authenticated, mas não members', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // events + "minhas inscrições"

    await EventService.listEvents(sql, env, VISITOR);
    const [queryText] = sql.mock.calls[0];
    expect(queryText).toContain("'public','authenticated'");
    expect(queryText).not.toContain('members');
  });

  test('member vê os 3 níveis de visibilidade', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // events + "minhas inscrições"

    await EventService.listEvents(sql, env, MEMBER);
    const [queryText] = sql.mock.calls[0];
    expect(queryText).toContain("'public','authenticated','members'");
  });
});

describe('EventService.listEvents — cache (achado #4 da auditoria)', () => {
  test('anônimo com cache hit: devolve do KV, nem consulta o banco', async () => {
    const sql = makeSql();
    const cachedEvents = [{ id: 'e1', title: 'Cacheado' }];
    const env = makeEnv({ HOT_CACHE: { get: jest.fn().mockResolvedValue(JSON.stringify(cachedEvents)), put: jest.fn(), delete: jest.fn() } });

    const res = await EventService.listEvents(sql, env, null);
    expect(res).toEqual({ success: true, events: [{ id: 'e1', title: 'Cacheado', isRegistered: false }] });
    expect(sql).not.toHaveBeenCalled();
  });

  test('member com cache hit na camada "members": usa o catálogo cacheado, mas SEMPRE consulta as próprias inscrições (nunca cacheadas)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ event_id: 'e1' }]); // "minhas inscrições" — única query esperada
    const cachedShared = [{ id: 'e1', title: 'Cacheado', capacity: null }];
    const env = makeEnv({ HOT_CACHE: { get: jest.fn().mockResolvedValue(JSON.stringify(cachedShared)), put: jest.fn(), delete: jest.fn() } });

    const res = await EventService.listEvents(sql, env, MEMBER);
    expect(env.HOT_CACHE.get).toHaveBeenCalledWith('cache:events:members:v2');
    expect(sql).toHaveBeenCalledTimes(1); // só a consulta pessoal, nunca o catálogo
    expect(res.events).toEqual([{ id: 'e1', title: 'Cacheado', capacity: null, isRegistered: true }]);
  });

  test('camadas diferentes usam chaves de cache diferentes (visitor não lê o cache de member)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // catálogo (cache miss) + "minhas inscrições"
    const env = makeEnv();

    await EventService.listEvents(sql, env, VISITOR);
    expect(env.HOT_CACHE.get).toHaveBeenCalledWith('cache:events:authenticated:v2');
    expect(env.HOT_CACHE.get).not.toHaveBeenCalledWith('cache:events:members:v2');
  });
});

describe('EventService.registerForEvent — invalida cache de eventos públicos', () => {
  test('inscrição bem-sucedida chama HOT_CACHE.delete (registered_count mudou)', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ id: 'evento-publico-1', title: 'Evento', description: 'desc', event_date: '2026-01-01', location: 'Auditório', visibility: 'public' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ email_notifications: false }]);

    await EventService.registerForEvent(sql, env, VISITOR, 'evento-publico-1', 'cid');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:events:public:v2');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:events:authenticated:v2');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:events:members:v2');
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
