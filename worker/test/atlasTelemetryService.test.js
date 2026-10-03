/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as T from '../src/services/atlasTelemetryService.js';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

// Onda 3.5, A.2 — telemetria anônima do atlas.
const member = { profileId: 'p-1', role: 'member' };
const admin = { profileId: 'p-2', role: 'admin' };
const sessionId = 'abcd1234efgh';

function queryText(sql, i) {
  const strings = sql.mock.calls[i][0];
  return Array.isArray(strings) ? strings.join('?') : String(strings);
}

describe('normalizeEvent', () => {
  test('só mantém as chaves permitidas do evento, com o tipo certo', () => {
    expect(T.normalizeEvent({ event: 'quiz_finish', sid: 'za:left-ventricle', props: { correct: 7.6, total: 10, system: 'nervoso', email: 'a@b.com', extra: 1 } }))
      .toEqual({ event: 'quiz_finish', sid: 'za:left-ventricle', props: { correct: 8, total: 10, system: 'nervoso' } });
    expect(T.normalizeEvent({ event: 'search', props: { len: 5, results: 'muitos', q: 'meu nome é Ana' } })).toEqual({ event: 'search', sid: null, props: { len: 5 } });
    expect(T.normalizeEvent({ event: 'app_open', props: { offline: true, viewport: 'm' } }).props).toEqual({ offline: true, viewport: 'm' });
  });
  test('evento desconhecido, sid fora do formato e texto longo/controle', () => {
    expect(T.normalizeEvent({ event: 'drop table' })).toBeNull();
    expect(T.normalizeEvent({ event: '__proto__' })).toBeNull();
    expect(T.normalizeEvent(null)).toBeNull();
    expect(T.normalizeEvent({ event: 'structure_view', sid: 'x y; DROP', props: { source: 'pick' } }).sid).toBeNull();
    const long = T.normalizeEvent({ event: 'error_js', props: { message: 'a\u0000b\n'.repeat(100) } });
    expect(long.props.message.length).toBeLessThanOrEqual(120);
    expect(long.props.message).not.toMatch(/[\u0000\n]/);
  });
  test('números são limitados (nunca negativos nem gigantes)', () => {
    expect(T.normalizeEvent({ event: 'session_end', props: { durationS: -5, views: 1e12 } }).props).toEqual({ durationS: 0, views: 1e7 });
  });
});

describe('record (apiLearnAtlasTelemetry)', () => {
  test('grava o lote SEM profile_id (só o id aleatório da aba) e devolve quantos entraram', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]).mockResolvedValueOnce([]);
    const res = await T.record(sql, member, { sessionId, events: [{ event: 'app_open', props: { mode: 'explorar' } }, { event: 'structure_view', sid: 'za:kidney-l', props: { source: 'pick' } }, { event: 'inventado' }] });
    expect(res).toEqual({ success: true, stored: 2 });
    expect(queryText(sql, 1)).toMatch(/INSERT INTO atlas_telemetry \(session_id, event, sid, props\)/);
    expect(queryText(sql, 1)).not.toMatch(/profile_id/);
    const args = sql.mock.calls[1].slice(1);
    expect(args).toContain(sessionId);
    expect(args.flat().join('|')).not.toContain('p-1');
  });
  test('valida sessão e lote antes de tocar no banco', async () => {
    const sql = makeSql();
    await expect(T.record(sql, member, { sessionId: 'curto', events: [] })).rejects.toThrow(/Sessão de telemetria inválida/);
    await expect(T.record(sql, member, { sessionId, events: 'x' })).rejects.toThrow(/Eventos inválidos/);
    await expect(T.record(sql, member, { sessionId, events: Array.from({ length: 51 }, () => ({ event: 'search' })) })).rejects.toThrow(/No máximo 50/);
    expect(sql).not.toHaveBeenCalled();
  });
  test('lote sem evento válido não grava nada', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    expect(await T.record(sql, member, { sessionId, events: [{ event: 'x' }] })).toEqual({ success: true, stored: 0 });
    expect(sql).toHaveBeenCalledTimes(1); // só o rate limit
  });
  test('rate limit por perfil estoura', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 241 }]);
    await expect(T.record(sql, member, { sessionId, events: [{ event: 'app_open' }] })).rejects.toThrow(/Muitas tentativas/);
  });
  test('tabela ainda não migrada: devolve stored 0 (a telemetria nunca derruba o atlas)', async () => {
    const sql = makeSql();
    const err = new Error('relation "atlas_telemetry" does not exist');
    err.code = '42P01';
    sql.mockResolvedValueOnce([{ attempts: 1 }]).mockRejectedValueOnce(err);
    expect(await T.record(sql, member, { sessionId, events: [{ event: 'app_open' }] })).toEqual({ success: true, stored: 0 });
  });
  test('outro erro do banco continua sendo erro', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]).mockRejectedValueOnce(new Error('boom'));
    await expect(T.record(sql, member, { sessionId, events: [{ event: 'app_open' }] })).rejects.toThrow('boom');
  });
});

describe('adminStats (apiAdminLearnAtlasTelemetry)', () => {
  test('só admin', async () => {
    await expect(T.adminStats(makeSql(), member, {})).rejects.toThrow();
  });
  test('agrega por evento e por dia, com sessões distintas', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ day: '2026-10-02', event: 'app_open', n: 4 }, { day: '2026-10-02', event: 'search', n: 2 }, { day: '2026-10-03', event: 'app_open', n: 1 }, { day: '2026-10-03', event: 'inventado', n: 9 }])
      .mockResolvedValueOnce([{ sessions: 3 }]);
    const res = await T.adminStats(sql, admin, { days: 30 });
    expect(res.days).toBe(30);
    expect(res.totals).toEqual({ app_open: 5, structure_view: 0, quiz_finish: 0, search: 2, error_js: 0, session_end: 0 });
    expect(res.sessions).toBe(3);
    expect(res.byDay).toEqual([{ day: '2026-10-02', events: { app_open: 4, search: 2 } }, { day: '2026-10-03', events: { app_open: 1 } }]);
    expect(sql.mock.calls[1]).toContain(30);
  });
  test('dias fora de 7/30 viram 7; tabela ausente devolve zeros com unavailable', async () => {
    const sql = makeSql();
    const err = new Error('relation "atlas_telemetry" does not exist');
    err.code = '42P01';
    sql.mockResolvedValueOnce([{ attempts: 1 }]).mockRejectedValueOnce(err);
    const res = await T.adminStats(sql, admin, { days: 90 });
    expect(res).toMatchObject({ success: true, days: 7, sessions: 0, byDay: [], unavailable: true });
  });
});

describe('handlers', () => {
  test('as duas actions passam pela ponte e exigem sessão', async () => {
    const BRIDGE = /^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z][A-Za-z]*$/;
    expect('apiLearnAtlasTelemetry').toMatch(BRIDGE);
    expect('apiAdminLearnAtlasTelemetry').toMatch(BRIDGE);
    const sql = makeSql();
    const res = await API_REGISTRY.apiLearnAtlasTelemetry(sql, makeEnv(), ['', { sessionId, events: [] }]);
    expect(res.success).toBe(false);
  });
});
