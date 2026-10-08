/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import * as ModerationService from '../src/services/moderationService.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const ADMIN = { profileId: 'a1', role: 'admin' };

const DAY = 86400000;
const HOUR = 3600000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days) => new Date(T0.getTime() + days * DAY);
const CID = '00000000-0000-4000-8000-0000000000c2';
const PROFILE = '44444444-4444-4444-8444-444444444444';
const SINCERE = 'Peço desculpas, eu estava irritado com um erro e passei do limite com palavras que não devia usar.';
const MEMBER_DB = { profileId: PROFILE, role: 'member' };

describe('ModerationService — decaimento e redenção da Lia (ADR 0004, banco real)', () => {
  let db;
  let sql;
  const env = makeEnv();

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
  }, 120000);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    __resetFlagCacheForTests();
    await db.exec('TRUNCATE assistant_incidents, assistant_moderation, audit_logs, error_logs');
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, 'Maria Souza', 'maria', 'maria@exemplo.com', 'x', '11999990000', 'member') ON CONFLICT (id) DO NOTHING`,
      [PROFILE]
    );
    await db.query(`INSERT INTO feature_flags (key, enabled) VALUES ('moderation_enabled', TRUE) ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled`);
    for (const d of [0, 25, 50]) await ModerationService.registerAssistantIncident(sql, CID, PROFILE, 'terms', at(d));
  });

  test('três incidentes em 90 dias: nível 3; 30 dias sem incidente o job diário baixa para 2 e conta quantos mudaram', async () => {
    const res = await ModerationService.decayAssistantModeration(sql, at(80));
    expect(res).toEqual({ checked: 1, lowered: 1 });
    const row = (await db.query('SELECT level FROM assistant_moderation WHERE profile_id = $1', [PROFILE])).rows[0];
    expect(row.level).toBe(2);
  });

  test('o job não mexe em quem ainda está dentro dos 30 dias', async () => {
    expect(await ModerationService.decayAssistantModeration(sql, at(60))).toEqual({ checked: 1, lowered: 0 });
  });

  test('redenção aceita zera o nível na hora', async () => {
    const res = await ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message: SINCERE }, CID, at(50.5));
    expect(res).toMatchObject({ success: true, accepted: true, level: 0 });
    const row = (await db.query('SELECT level FROM assistant_moderation WHERE profile_id = $1', [PROFILE])).rows[0];
    expect(row.level).toBe(0);
  });

  test('redenção recusada grava a tentativa e exige 1 hora', async () => {
    const refused = await ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message: 'Quero que o chat volte a funcionar agora porque preciso muito usar a plataforma hoje' }, CID, at(50.1));
    expect(refused).toMatchObject({ accepted: false, retryAfterSeconds: 3600 });
    await expect(
      ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message: SINCERE }, CID, new Date(at(50.1).getTime() + HOUR / 2))
    ).rejects.toMatchObject({ name: 'RateLimitError' });
  });

  test('redenção sem texto (vazio ou só espaços) é ValidationError', async () => {
    await expect(ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message: '' }, CID, at(50.5))).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message: '     ' }, CID, at(50.5))).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('com a flag moderation_enabled desligada, a redenção não altera nada', async () => {
    await db.query(`UPDATE feature_flags SET enabled = FALSE WHERE key = 'moderation_enabled'`);
    __resetFlagCacheForTests();
    const res = await ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message: SINCERE }, CID, at(50.5));
    expect(res).toMatchObject({ success: false, disabled: true });
  });

  test('visitante não pode pedir redenção', async () => {
    await expect(
      ModerationService.redeemAssistant(sql, env, { profileId: PROFILE, role: 'visitor' }, { message: SINCERE }, CID, at(50.5))
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});


describe('ModerationService.submitReport', () => {
  test('não é possível denunciar a própria conta', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]); // rate limit
    await expect(
      ModerationService.submitReport(sql, MEMBER, { targetProfileId: 'm1', category: 'spam' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('categoria fora da lista fechada lança ValidationError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(
      ModerationService.submitReport(sql, MEMBER, { targetProfileId: 't1', category: 'inventada' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('sem vínculo prévio (nunca interagiu) lança ForbiddenError', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit
      .mockResolvedValueOnce([]); // SELECT vínculo — nenhum

    await expect(
      ModerationService.submitReport(sql, MEMBER, { targetProfileId: 't1', category: 'spam' }, 'cid')
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('com vínculo prévio, registra a denúncia e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ 1: 1 }]) // vínculo existe
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await ModerationService.submitReport(sql, MEMBER, { targetProfileId: 't1', category: 'harassment' }, 'cid');
    expect(res.success).toBe(true);
  });
});

describe('ModerationService.listReports / resolveReport — só admin', () => {
  test('member não pode listar denúncias', async () => {
    const sql = makeSql();
    await expect(ModerationService.listReports(sql, MEMBER, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('member não pode resolver denúncias', async () => {
    const sql = makeSql();
    await expect(ModerationService.resolveReport(sql, MEMBER, 'r1', { status: 'dismissed' }, 'cid')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });

  test('admin resolve uma denúncia aberta como "resolved" (grava resolved_by/resolved_at)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ status: 'open' }]) // SELECT status atual
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await ModerationService.resolveReport(sql, ADMIN, 'r1', { status: 'resolved', resolutionNote: 'ok' }, 'cid');
    expect(res.success).toBe(true);
  });

  test('transição inválida (de resolved para open) lança ConflictError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ status: 'resolved' }]);
    await expect(ModerationService.resolveReport(sql, ADMIN, 'r1', { status: 'open' }, 'cid')).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});
