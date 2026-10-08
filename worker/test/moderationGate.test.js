/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as Gate from '../src/assistant/moderationGate.js';
import * as ModerationService from '../src/services/moderationService.js';
import * as Assistant from '../src/services/assistantService.js';
import * as Groq from '../src/ai/groqClient.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';
import { groqReply, KEYS } from './helpers/aiTestUtils.js';

const DAY = 86400000;
const HOUR = 3600000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days) => new Date(T0.getTime() + days * DAY);
const CID = '00000000-0000-4000-8000-0000000000c1';
const ME = '11111111-1111-4111-8111-111111111111';
const ADM = '22222222-2222-4222-8222-222222222222';
const VIS = '33333333-3333-4333-8333-333333333333';
const MEMBER = { profileId: ME, role: 'member', fullName: 'Maria Souza', email: 'maria@exemplo.com' };
const ADMIN = { profileId: ADM, role: 'admin', fullName: 'Ana Admin', email: 'ana@exemplo.com' };
const VISITOR = { profileId: VIS, role: 'visitor', fullName: 'Vera Visitante', email: 'vera@exemplo.com' };
const OFFENSIVE = 'você é uma idiota';
const LEGIT = 'quero me inscrever no evento de toxicologia';
const SINCERE = 'Peço desculpas, eu estava irritado com um erro e passei do limite com palavras que não devia usar.';
const NOT_SINCERE = 'Quero que o chat volte a funcionar agora porque preciso muito usar a plataforma hoje';

let db;
let sql;
let env;
const realFetch = globalThis.fetch;

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
  Groq.__resetPoolStateForTests(0);
  await db.exec('TRUNCATE assistant_incidents, assistant_moderation, audit_logs, error_logs, rate_limit_buckets');
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES
     ($1, 'Maria Souza', 'maria', 'maria@exemplo.com', 'x', '11999990000', 'member'),
     ($2, 'Ana Admin', 'ana', 'ana@exemplo.com', 'x', '11999990001', 'admin') ON CONFLICT (id) DO NOTHING`,
    [ME, ADM]
  );
  await db.query(`INSERT INTO feature_flags (key, enabled) VALUES ('moderation_enabled', TRUE), ('chatbot_enabled', TRUE) ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled`);
  env = makeEnv({ GROQ_API_KEYS: KEYS.join('\n') });
  // A IA responde "sim" ao juiz (ofensa confirmada). Cada chamada passa por fetch: é assim que medimos "não chamou a IA".
  globalThis.fetch = jest.fn(async () => groqReply('sim'));
});

const count = async (table) => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
const gate = (identity, text, now) => Gate.moderationGate(sql, env, identity, text, CID, now);
const aiCalls = () => globalThis.fetch.mock.calls.length;

describe('moderação da Lia — portão do chat', () => {
  test('visitante não é moderado: uma ofensa não gera incidente nem nível', async () => {
    expect(await gate(VISITOR, OFFENSIVE, at(0))).toBeNull();
    expect(await count('assistant_incidents')).toBe(0);
    expect(await Gate.assistantModerationState(sql, VISITOR, at(0))).toMatchObject({ moderated: false, level: 0 });
  });

  test('flag moderation_enabled desligada: a conversa segue normal e nada é registrado', async () => {
    await db.query(`UPDATE feature_flags SET enabled = FALSE WHERE key = 'moderation_enabled'`);
    expect(await gate(MEMBER, OFFENSIVE, at(0))).toBeNull();
    expect(await count('assistant_incidents')).toBe(0);
  });

  test('pergunta normal não gera incidente e não passa pelo juiz', async () => {
    expect(await gate(MEMBER, LEGIT, at(0))).toBeNull();
    expect(aiCalls()).toBe(0);
  });

  test('primeira e segunda ofensas: alerta (nível 1) e aviso sério (nível 2) com o texto da Lia', async () => {
    expect(await gate(MEMBER, OFFENSIVE, at(0))).toMatchObject({
      source: 'moderation', reply: 'Isso não é permitido. Vamos manter o respeito.', moderation: { level: 1, suspended: false, until: null },
    });
    expect(await gate(MEMBER, OFFENSIVE, at(25))).toMatchObject({
      reply: 'Se continuar, vou precisar me retirar.', moderation: { level: 2, suspended: false },
    });
  });

  test('três ofensas em 90 dias levam ao nível 3 e a suspensão para a conversa SEM chamar a IA', async () => {
    await gate(MEMBER, OFFENSIVE, at(0));
    await gate(MEMBER, OFFENSIVE, at(25));
    const third = await gate(MEMBER, OFFENSIVE, at(50));
    expect(third.moderation).toMatchObject({ level: 3, suspended: true });
    expect(new Date(third.moderation.until).getTime()).toBe(at(50).getTime() + 24 * HOUR);
    expect(third.message).toMatch(/suspenso até .+horário de Brasília/);

    const callsBefore = aiCalls();
    const blocked = await gate(MEMBER, LEGIT, new Date(at(50).getTime() + HOUR));
    expect(blocked).toMatchObject({ moderation: { level: 3, suspended: true } });
    expect(aiCalls()).toBe(callsBefore);
  });

  test('suspensão expirada libera a conversa; a próxima ofensa renova a suspensão', async () => {
    for (const d of [0, 25, 50]) await gate(MEMBER, OFFENSIVE, at(d));
    expect(await gate(MEMBER, LEGIT, at(50.5))).not.toBeNull();
    expect(await gate(MEMBER, LEGIT, at(52))).toBeNull();
    expect(await gate(MEMBER, OFFENSIVE, at(52))).toMatchObject({ moderation: { level: 3, suspended: true } });
  });

  test('decaimento de 30 dias sem incidente: 3 -> 2 -> 1 -> 0, lido no estado da própria pessoa', async () => {
    for (const d of [0, 25, 50]) await gate(MEMBER, OFFENSIVE, at(d));
    expect((await Gate.assistantModerationState(sql, MEMBER, at(80))).level).toBe(2);
    expect((await Gate.assistantModerationState(sql, MEMBER, at(110))).level).toBe(1);
    expect((await Gate.assistantModerationState(sql, MEMBER, at(140))).level).toBe(0);
  });

  test('redenção aceita zera o nível na hora e a conversa volta ao normal', async () => {
    for (const d of [0, 25, 50]) await gate(MEMBER, OFFENSIVE, at(d));
    const res = await ModerationService.redeemAssistant(sql, env, MEMBER, { message: SINCERE }, CID, at(50.5));
    expect(res).toMatchObject({ accepted: true, level: 0 });
    expect(await gate(MEMBER, LEGIT, at(50.6))).toBeNull();
  });

  test('redenção recusada exige 1 hora antes de nova tentativa', async () => {
    for (const d of [0, 25, 50]) await gate(MEMBER, OFFENSIVE, at(d));
    const refused = await ModerationService.redeemAssistant(sql, env, MEMBER, { message: NOT_SINCERE }, CID, at(50.1));
    expect(refused).toMatchObject({ accepted: false, retryAfterSeconds: 3600 });
    await expect(
      ModerationService.redeemAssistant(sql, env, MEMBER, { message: SINCERE }, CID, new Date(at(50.1).getTime() + 10 * 60000))
    ).rejects.toMatchObject({ payload: { retryAfterSeconds: expect.any(Number) } });
    const later = await ModerationService.redeemAssistant(sql, env, MEMBER, { message: SINCERE }, CID, new Date(at(50.1).getTime() + HOUR + 1000));
    expect(later).toMatchObject({ accepted: true, level: 0 });
  });

  test('falha da moderação é aberta para a conversa e fica registrada em error_logs', async () => {
    await db.exec('ALTER TABLE assistant_moderation RENAME TO assistant_moderation_off');
    try {
      expect(await gate(MEMBER, OFFENSIVE, at(0))).toBeNull();
      const logs = (await db.query('SELECT code FROM error_logs')).rows.map((r) => r.code);
      expect(logs).toContain('ASSISTANT_MODERATION_FAILED');
    } finally {
      await db.exec('ALTER TABLE assistant_moderation_off RENAME TO assistant_moderation');
    }
  });

  test('chat: a ofensa responde a Lia pela moderação, sem botões e sem texto da IA', async () => {
    const res = await Assistant.chat(sql, env, MEMBER, { message: OFFENSIVE }, CID);
    expect(res).toMatchObject({ success: true, source: 'moderation', actions: [], moderation: { level: 1 } });
  });

  test('chat: pergunta normal de visitante segue o fluxo habitual (sem campo de moderação)', async () => {
    const res = await Assistant.chat(sql, env, VISITOR, { message: 'qual a previsão do tempo para amanhã' }, CID);
    expect(res.moderation).toBeUndefined();
  });
});

describe('moderação da Lia — estado da própria pessoa e resumo do admin', () => {
  test('estado de membro sem incidentes: moderado, nível 0, sem redenção pendente', async () => {
    expect(await Gate.assistantModerationState(sql, MEMBER, at(0))).toMatchObject({
      success: true, moderated: true, level: 0, suspended: false, canRedeem: false, retryAfterSeconds: 0,
    });
  });

  test('estado com suspensão ativa informa suspensão e pode redimir', async () => {
    for (const d of [0, 25, 50]) await gate(MEMBER, OFFENSIVE, at(d));
    expect(await Gate.assistantModerationState(sql, MEMBER, at(50.5))).toMatchObject({
      level: 3, suspended: true, canRedeem: true,
    });
  });

  test('resumo do admin: agregados por pessoa e taxa de redenção, sem texto de mensagem', async () => {
    const now = new Date();
    for (let i = 0; i < 3; i += 1) await gate(MEMBER, OFFENSIVE, new Date(now.getTime() + i * 1000));
    await ModerationService.redeemAssistant(sql, env, MEMBER, { message: NOT_SINCERE }, CID, new Date(now.getTime() + 5000));
    await ModerationService.redeemAssistant(sql, env, MEMBER, { message: SINCERE }, CID, new Date(now.getTime() + 2 * HOUR));

    const summary = await Gate.adminAssistantModeration(sql, ADMIN, { limit: 10 });
    expect(summary).toMatchObject({
      success: true,
      incidents: { total: 3, byDetection: { terms: 0, llm: 3 }, byLevelAfter: { 1: 1, 2: 1, 3: 1 } },
      people: [{ profileId: ME, incidents: 3, maxLevel: 3 }],
      redemption: { accepted: 1, refused: 1, rate: 0.5 },
    });
    expect(JSON.stringify(summary)).not.toMatch(/idiota|desculpas/i);
  });

  test('resumo do admin: membro não acessa (ForbiddenError)', async () => {
    await expect(Gate.adminAssistantModeration(sql, MEMBER, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});
