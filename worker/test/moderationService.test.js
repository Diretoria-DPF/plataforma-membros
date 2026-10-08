/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as ModerationService from '../src/services/moderationService.js';
import * as Groq from '../src/ai/groqClient.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { groqReply, KEYS } from './helpers/aiTestUtils.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const ADMIN = { profileId: 'a1', role: 'admin' };

const DAY = 86400000;
const HOUR = 3600000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days) => new Date(T0.getTime() + days * DAY);
const CID = '00000000-0000-4000-8000-0000000000c2';
const PROFILE = '44444444-4444-4444-8444-444444444444';
const SINCERE = 'Peço desculpas, eu estava irritado com um erro e passei do limite com palavras que não devia usar.';
// Passa na heurística local (>= 40 caracteres, 8 palavras distintas, "desculpa"), mas não diz nada.
const NONSENSE = 'Desculpa, me arrependo. a b c d e f g h i j k l';
const MEMBER_DB = { profileId: PROFILE, role: 'member' };
const realFetch = globalThis.fetch;

describe('ModerationService — decaimento e redenção da Lia (ADR 0004, banco real)', () => {
  let db;
  let sql;
  let env;

  const redeem = (message, when) => ModerationService.redeemAssistant(sql, env, MEMBER_DB, { message }, CID, when || at(50.5));
  const row = async () => (await db.query('SELECT level, redeem_attempt_at, redeemed_at FROM assistant_moderation WHERE profile_id = $1', [PROFILE])).rows[0];
  const errorCodes = async () => (await db.query('SELECT code FROM error_logs')).rows.map((r) => r.code);

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
  }, 120000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await db.close();
  });

  beforeEach(async () => {
    __resetFlagCacheForTests();
    ModerationService.__resetKnownSuspensionsForTests();
    Groq.__resetPoolStateForTests(0);
    env = makeEnv({ GROQ_API_KEYS: KEYS.join('\n') });
    globalThis.fetch = jest.fn(async () => groqReply('sim')); // o juiz diz "sim" por padrão
    await db.exec('TRUNCATE assistant_incidents, assistant_moderation, audit_logs, error_logs, rate_limit_buckets');
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

  describe('redenção: só o veredito afirmativo do juiz aceita (achado 1)', () => {
    test('texto sem sentido + juiz indisponível: NÃO aceita, avisa e NÃO consome o cooldown de 1 h', async () => {
      globalThis.fetch = jest.fn(async () => groqReply('', { status: 503 }));
      const res = await redeem(NONSENSE);
      expect(res).toMatchObject({ success: true, accepted: false, unavailable: true, level: 3 });
      expect(res.message).toMatch(/tente de novo em alguns minutos/);
      expect((await row()).level).toBe(3);
      expect((await row()).redeem_attempt_at).toBeNull();
      expect(await errorCodes()).toContain('ASSISTANT_JUDGE_FAILED');

      // O cooldown não foi gasto: logo em seguida, com o juiz de volta, o pedido é julgado.
      Groq.__resetPoolStateForTests(0); // as chaves entraram em cooldown com os 503
      globalThis.fetch = jest.fn(async () => groqReply('sim'));
      expect(await redeem(SINCERE, at(50.51))).toMatchObject({ accepted: true, level: 0 });
    });

    test('juiz responde vazio ou fora do formato: tratado como indisponível, nunca como aceite', async () => {
      for (const content of ['', 'talvez', '???']) {
        globalThis.fetch = jest.fn(async () => groqReply(content));
        expect(await redeem(NONSENSE)).toMatchObject({ accepted: false, unavailable: true });
      }
      expect((await row()).level).toBe(3);
      expect((await row()).redeem_attempt_at).toBeNull();
    });

    test('juiz afirmativo aceita; "sim." com pontuação também', async () => {
      globalThis.fetch = jest.fn(async () => groqReply('Sim.'));
      expect(await redeem(SINCERE)).toMatchObject({ success: true, accepted: true, level: 0 });
      expect((await row()).level).toBe(0);
      expect((await row()).redeem_attempt_at).toBeNull();
    });

    test('juiz que veta ("nao") recusa e CONSOME o cooldown', async () => {
      globalThis.fetch = jest.fn(async () => groqReply('nao'));
      expect(await redeem(SINCERE)).toMatchObject({ accepted: false, retryAfterSeconds: 3600 });
      expect((await row()).redeem_attempt_at).not.toBeNull();
      await expect(redeem(SINCERE, at(50.51))).rejects.toMatchObject({ name: 'RateLimitError' });
    });

    test('a heurística local barra o texto antes de gastar o juiz', async () => {
      expect(await redeem('Quero que o chat volte a funcionar agora porque preciso muito usar a plataforma hoje')).toMatchObject({ accepted: false });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('limite de redenções ACEITAS por pessoa na janela: a 4ª nem chega ao juiz nem gasta o cooldown', async () => {
      const max = 3;
      for (let i = 0; i < max; i += 1) {
        await db.query(`UPDATE assistant_moderation SET level = 2, redeem_attempt_at = NULL WHERE profile_id = $1`, [PROFILE]);
        expect(await redeem(SINCERE, at(50.5 + i))).toMatchObject({ accepted: true });
      }
      await db.query(`UPDATE assistant_moderation SET level = 2, redeem_attempt_at = NULL WHERE profile_id = $1`, [PROFILE]);
      const calls = globalThis.fetch.mock.calls.length;
      const res = await redeem(SINCERE, at(60));
      expect(res).toMatchObject({ success: true, accepted: false, limitReached: true });
      expect(globalThis.fetch.mock.calls.length).toBe(calls);
      expect((await row()).level).toBe(2);
      expect((await row()).redeem_attempt_at).toBeNull();
    });
  });

  test('redenção tem teto de pedidos por hora (achado 2): o 11º é barrado antes de qualquer consulta ao juiz', async () => {
    const limit = 10;
    for (let i = 0; i < limit; i += 1) {
      await db.query(`UPDATE assistant_moderation SET redeem_attempt_at = NULL WHERE profile_id = $1`, [PROFILE]);
      Groq.__resetPoolStateForTests(0);
      globalThis.fetch = jest.fn(async () => groqReply('', { status: 503 }));
      expect(await redeem(NONSENSE, at(50.5 + i * 0.001))).toMatchObject({ unavailable: true });
    }
    globalThis.fetch = jest.fn(async () => groqReply('sim'));
    await expect(redeem(SINCERE, at(50.6))).rejects.toMatchObject({ name: 'RateLimitError' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect((await row()).level).toBe(3);
  });

  describe('flag da moderação (achado 5)', () => {
    test('tabela de flags ausente = desligada (migração 016 não aplicada)', async () => {
      await db.exec('ALTER TABLE feature_flags RENAME TO feature_flags_off');
      try {
        __resetFlagCacheForTests();
        expect(await ModerationService.moderationEnabled(sql, MEMBER_DB)).toBe(false);
      } finally {
        await db.exec('ALTER TABLE feature_flags_off RENAME TO feature_flags');
        __resetFlagCacheForTests();
      }
    });

    test('qualquer outro erro SOBE em vez de virar "desligada" (falha aberta mascarada)', async () => {
      const broken = jest.fn(async () => { throw Object.assign(new Error('connection terminated'), { code: '08006' }); });
      await expect(ModerationService.moderationEnabled(broken, MEMBER_DB)).rejects.toThrow('connection terminated');
    });

    test('a redenção também propaga o erro de leitura da flag (não finge que a moderação está desligada)', async () => {
      const broken = jest.fn(async () => { throw Object.assign(new Error('connection terminated'), { code: '08006' }); });
      await expect(ModerationService.redeemAssistant(broken, env, MEMBER_DB, { message: SINCERE }, CID, at(50.5))).rejects.toThrow('connection terminated');
    });
  });

  describe('falha do juiz de ofensa (achado 6)', () => {
    test('juiz fora do ar: vale o termo e a falha vai para error_logs SEM o texto da mensagem', async () => {
      globalThis.fetch = jest.fn(async () => groqReply('', { status: 503 }));
      const offense = 'você é um idiota segredo-do-usuario-123';
      const res = await ModerationService.judgeOffense(sql, env, MEMBER_DB, offense, CID);
      expect(res).toEqual({ offensive: true, detection: 'terms' });
      const logs = (await db.query(`SELECT code, message, context FROM error_logs WHERE code = 'ASSISTANT_JUDGE_FAILED'`)).rows;
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs)).not.toMatch(/idiota|segredo-do-usuario/);
      expect(logs[0].context).toMatchObject({ stage: 'offense', reason: 'error' });
    });

    test('resposta ambígua também é registrada; "nao" não é falha e não registra nada', async () => {
      globalThis.fetch = jest.fn(async () => groqReply('depende'));
      expect(await ModerationService.judgeOffense(sql, env, MEMBER_DB, 'você é um idiota', CID)).toEqual({ offensive: true, detection: 'terms' });
      expect((await db.query(`SELECT context FROM error_logs WHERE code = 'ASSISTANT_JUDGE_FAILED'`)).rows[0].context).toMatchObject({ reason: 'ambiguous' });

      await db.exec('TRUNCATE error_logs');
      globalThis.fetch = jest.fn(async () => groqReply('nao'));
      expect(await ModerationService.judgeOffense(sql, env, MEMBER_DB, 'você é um idiota', CID)).toEqual({ offensive: false, detection: null });
      expect(await errorCodes()).toEqual([]);
    });

    test('allowLlm: false decide só pelo termo e não chama o juiz', async () => {
      expect(await ModerationService.judgeOffense(sql, env, MEMBER_DB, 'você é um idiota', CID, { allowLlm: false })).toEqual({ offensive: true, detection: 'terms' });
      expect(await ModerationService.judgeOffense(sql, env, MEMBER_DB, 'quero me inscrever no evento', CID, { allowLlm: false })).toEqual({ offensive: false, detection: null });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
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
