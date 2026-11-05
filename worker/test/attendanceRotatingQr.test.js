/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import * as AttendanceService from '../src/services/attendanceService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

// A2 (Fase A): QR rotativo por evento (LAIFT:v3), expiração por janela de 30 s,
// compatível com o formato permanente LAIFT:v2 do crachá impresso.
const ADMIN = { profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin', email: 'admin@x.com', fullName: 'Admin' };
const MEMBER = { profileId: '11111111-1111-4111-8111-111111111111', role: 'member', email: 'membro@x.com', fullName: 'Membro' };
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_EVENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const NOW = 1_800_000_000_000;
const V3_RE = /^LAIFT:v3:[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d{1,10}\.[A-Za-z0-9_-]{24}$/;
const RATE_OK = [{ attempts: 1 }];
const OPEN_EVENT = [{ id: EVENT_ID, title: 'Simpósio', status: 'in_progress' }];
const PERSON = [{ id: MEMBER.profileId, full_name: 'Ana Souza', role: 'member', status: 'active', email_confirmed_at: '2026-01-01' }];

describe('QR rotativo: assinatura e verificação', () => {
  const env = makeEnv();

  test('formato LAIFT:v3 com perfil, evento, janela e assinatura; cabe em QR de tela', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    expect(qr).toMatch(V3_RE);
    expect(qr.length).toBeLessThanOrEqual(200);
  });

  test('vale dentro da janela e devolve o perfil', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    const res = await AttendanceService.inspectAttendanceQr(env, qr, { eventId: EVENT_ID, nowMs: NOW + 45_000 });
    expect(res).toEqual({ ok: true, profileId: MEMBER.profileId, rotating: true });
  });

  test('expira: depois de 3 janelas é recusado como expirado', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    const res = await AttendanceService.inspectAttendanceQr(env, qr, { eventId: EVENT_ID, nowMs: NOW + 150_000 });
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  test('janela no futuro (além de 1 janela) é inválida', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW + 300_000);
    const res = await AttendanceService.inspectAttendanceQr(env, qr, { eventId: EVENT_ID, nowMs: NOW });
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  test('vinculado ao evento: QR de outro evento é recusado', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, OTHER_EVENT, NOW);
    const res = await AttendanceService.inspectAttendanceQr(env, qr, { eventId: EVENT_ID, nowMs: NOW });
    expect(res).toEqual({ ok: false, reason: 'wrong_event' });
  });

  test('trocar o evento no texto sem refazer a assinatura é inválido', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, OTHER_EVENT, NOW);
    const forged = qr.replace(OTHER_EVENT, EVENT_ID);
    const res = await AttendanceService.inspectAttendanceQr(env, forged, { eventId: EVENT_ID, nowMs: NOW });
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  test('trocar a janela para estender a validade é inválido', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    const parts = qr.split('.');
    parts[2] = String(Number(parts[2]) + 5);
    const res = await AttendanceService.inspectAttendanceQr(env, parts.join('.'), { eventId: EVENT_ID, nowMs: NOW + 150_000 });
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  test('assinatura adulterada é inválida', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    const flipped = qr.slice(0, -1) + (qr.slice(-1) === 'A' ? 'B' : 'A');
    const res = await AttendanceService.inspectAttendanceQr(env, flipped, { eventId: EVENT_ID, nowMs: NOW });
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  test('compatível: o formato permanente LAIFT:v2 continua válido (rotating: false)', async () => {
    const legacy = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const res = await AttendanceService.inspectAttendanceQr(env, legacy, { eventId: EVENT_ID, nowMs: NOW });
    expect(res).toEqual({ ok: true, profileId: MEMBER.profileId, rotating: false });
  });

  test('verifyAttendanceQr (v2) não aceita v3 e inspect recusa lixo', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    expect(await AttendanceService.verifyAttendanceQr(env, qr)).toBeNull();
    expect(await AttendanceService.inspectAttendanceQr(env, 'LAIFT:ID:a@b.com', { eventId: EVENT_ID, nowMs: NOW }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  test('segredo próprio: com ATTENDANCE_QR_SECRET, o QR não vale com a chave derivada do pepper', async () => {
    const withSecret = makeEnv({ ATTENDANCE_QR_SECRET: 'segredo-proprio-do-qr-com-32-caracteres-ou-mais' });
    const qr = await AttendanceService.signRotatingQr(withSecret, MEMBER.profileId, EVENT_ID, NOW);
    expect((await AttendanceService.inspectAttendanceQr(withSecret, qr, { eventId: EVENT_ID, nowMs: NOW })).ok).toBe(true);
    expect(await AttendanceService.inspectAttendanceQr(env, qr, { eventId: EVENT_ID, nowMs: NOW }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  test('a assinatura v3 é diferente da v2 do mesmo perfil (separação de versão)', async () => {
    const v2 = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const v3 = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, NOW);
    expect(v3.split('.').pop()).not.toBe(v2.split('.').pop());
  });
});

describe('getMyAttendanceQr com evento', () => {
  const env = makeEnv();

  test('sem evento devolve o QR permanente v2 (sem rotação)', async () => {
    const res = await AttendanceService.getMyAttendanceQr(env, MEMBER, {});
    expect(res.success).toBe(true);
    expect(res.qrPayload.startsWith('LAIFT:v2:')).toBe(true);
    expect(res.rotating).toBeUndefined();
  });

  test('com evento devolve v3, hora do servidor, janela e fim da validade da janela', async () => {
    const res = await AttendanceService.getMyAttendanceQr(env, MEMBER, { eventId: EVENT_ID }, NOW);
    expect(res.success).toBe(true);
    expect(res.qrPayload).toMatch(V3_RE);
    expect(res.rotating).toBe(true);
    expect(res.eventId).toBe(EVENT_ID);
    expect(res.windowSeconds).toBe(30);
    expect(res.serverTime).toBe(NOW);
    expect(res.refreshAt).toBeGreaterThan(NOW);
    expect(res.refreshAt - NOW).toBeLessThanOrEqual(30_000);
  });

  test('evento inválido → ValidationError', async () => {
    await expect(AttendanceService.getMyAttendanceQr(env, MEMBER, { eventId: 'x' }))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('checkIn com QR rotativo', () => {
  const env = makeEnv();
  const base = { eventId: EVENT_ID, method: 'qr' };

  function sqlForSuccess() {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(OPEN_EVENT).mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([{ checked_in_at: '2026-11-05T12:00:00Z' }]).mockResolvedValueOnce(undefined);
    return sql;
  }

  function sqlForRejection() {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(undefined);
    return sql;
  }

  test('QR do momento registra a presença', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, Date.now());
    const res = await AttendanceService.checkIn(sqlForSuccess(), env, ADMIN, { ...base, qrPayload: qr }, 'cid');
    expect(res.success).toBe(true);
    expect(res.participant.profileId).toBe(MEMBER.profileId);
  });

  test('QR expirado → mensagem pede para atualizar a credencial', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, Date.now() - 600_000);
    await expect(AttendanceService.checkIn(sqlForRejection(), env, ADMIN, { ...base, qrPayload: qr }, 'cid'))
      .rejects.toMatchObject({ name: 'ValidationError', message: expect.stringContaining('expirou') });
  });

  test('QR de outro evento → mensagem diz que é de outro evento', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, OTHER_EVENT, Date.now());
    await expect(AttendanceService.checkIn(sqlForRejection(), env, ADMIN, { ...base, qrPayload: qr }, 'cid'))
      .rejects.toMatchObject({ name: 'ValidationError', message: expect.stringContaining('outro evento') });
  });

  test('reenvio da fila offline: scannedAt recente dentro de 12 h vale o QR da época da leitura', async () => {
    const scanned = Date.now() - 600_000;
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, scanned);
    const res = await AttendanceService.checkIn(sqlForSuccess(), env, ADMIN, { ...base, qrPayload: qr, scannedAt: scanned + 5_000 }, 'cid');
    expect(res.success).toBe(true);
  });

  test('scannedAt no futuro ou com mais de 12 h é ignorado (vale a hora do servidor)', async () => {
    const old = Date.now() - 13 * 3600_000;
    const qrOld = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, old);
    await expect(AttendanceService.checkIn(sqlForRejection(), env, ADMIN, { ...base, qrPayload: qrOld, scannedAt: old }, 'cid'))
      .rejects.toMatchObject({ message: expect.stringContaining('expirou') });
    const future = Date.now() + 3600_000;
    const qrFuture = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, future);
    await expect(AttendanceService.checkIn(sqlForRejection(), env, ADMIN, { ...base, qrPayload: qrFuture, scannedAt: future }, 'cid'))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });

  beforeEach(() => __resetFlagCacheForTests());

  test('o formato antigo v2 continua registrando (modo de transição, flag desligada)', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([{ key: 'attendance_qr_rotating_only', enabled: false }])
      .mockResolvedValueOnce(OPEN_EVENT).mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([{ checked_in_at: '2026-11-05T12:00:00Z' }]).mockResolvedValueOnce(undefined);
    const res = await AttendanceService.checkIn(sql, env, ADMIN, { ...base, qrPayload: qr }, 'cid');
    expect(res.success).toBe(true);
  });

  test('flag attendance_qr_rotating_only ligada: o QR v2 é recusado, o v3 continua valendo', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const flagOn = [{ key: 'attendance_qr_rotating_only', enabled: true, rollout_pct: 100, conditions: {} }];
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(flagOn).mockResolvedValueOnce(undefined);
    await expect(AttendanceService.checkIn(sql, env, ADMIN, { ...base, qrPayload: qr }, 'cid'))
      .rejects.toMatchObject({ name: 'ValidationError', message: expect.stringContaining('encerrado') });
    const v3 = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, Date.now());
    const ok = makeSql();
    ok.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(OPEN_EVENT).mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([{ checked_in_at: '2026-11-05T12:00:00Z' }]).mockResolvedValueOnce(undefined);
    expect((await AttendanceService.checkIn(ok, env, ADMIN, { ...base, qrPayload: v3 }, 'cid')).success).toBe(true);
  });

  test('anti-replay: o mesmo QR lido duas vezes no mesmo evento não duplica (alreadyCheckedIn)', async () => {
    const qr = await AttendanceService.signRotatingQr(env, MEMBER.profileId, EVENT_ID, Date.now());
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(OPEN_EVENT).mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ checked_in_at: '2026-11-05T12:00:00Z' }]).mockResolvedValueOnce(undefined);
    const res = await AttendanceService.checkIn(sql, env, ADMIN, { ...base, qrPayload: qr }, 'cid');
    expect(res.participant.alreadyCheckedIn).toBe(true);
  });
});

describe('listEvents devolve a hora do servidor (relógio do portão)', () => {
  test('serverTime numérico', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    const res = await AttendanceService.listEvents(sql, ADMIN);
    expect(typeof res.serverTime).toBe('number');
  });
});
