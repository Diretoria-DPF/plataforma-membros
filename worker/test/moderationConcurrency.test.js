/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Moderação da Lia sob concorrência (banco real, PGlite). O driver HTTP do Neon não tem
 * transação interativa: aqui se prova que incidentes, decaimento e redenção paralelos não
 * perdem atualização nem furam o cooldown. Cada teste dispara as chamadas com Promise.all.
 */
import { jest } from '@jest/globals';
import * as ModerationService from '../src/services/moderationService.js';
import * as Gate from '../src/assistant/moderationGate.js';
import * as Rules from '../src/assistant/moderationRules.js';
import * as Groq from '../src/ai/groqClient.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';
import { groqReply, KEYS } from './helpers/aiTestUtils.js';

const DAY = 86400000;
const HOUR = 3600000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days) => new Date(T0.getTime() + days * DAY);
const CID = '00000000-0000-4000-8000-0000000000c3';
const ME = '55555555-5555-4555-8555-555555555555';
const MEMBER = { profileId: ME, role: 'member', fullName: 'Maria Souza', email: 'maria@exemplo.com' };
const OFFENSIVE = 'você é uma idiota';
const SINCERE = 'Peço desculpas, eu estava irritado com um erro e passei do limite com palavras que não devia usar.';
const PARALLEL_INCIDENTS = 10;
const PARALLEL_REDEMPTIONS = 20;
const JUDGE_DELAY_MS = 25;

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
  ModerationService.__resetKnownSuspensionsForTests();
  Groq.__resetPoolStateForTests(0);
  await db.exec('TRUNCATE assistant_incidents, assistant_moderation, audit_logs, error_logs, rate_limit_buckets');
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, 'Maria Souza', 'maria', 'maria@exemplo.com', 'x', '11999990000', 'member') ON CONFLICT (id) DO NOTHING`,
    [ME]
  );
  await db.query(`INSERT INTO feature_flags (key, enabled) VALUES ('moderation_enabled', TRUE), ('chatbot_enabled', TRUE) ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled`);
  env = makeEnv({ GROQ_API_KEYS: KEYS.join('\n') });
  globalThis.fetch = jest.fn(async () => groqReply('sim'));
});

const modRow = async () => (await db.query('SELECT * FROM assistant_moderation WHERE profile_id = $1', [ME])).rows[0];
const count = async (table, where) => Number((await db.query(`SELECT count(*) AS n FROM ${table}${where ? ' WHERE ' + where : ''}`)).rows[0].n);
const redeem = (message, when) => ModerationService.redeemAssistant(sql, env, MEMBER, { message }, CID, when || at(50.5));
const slowJudge = (content) => jest.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, JUDGE_DELAY_MS));
  return groqReply(content);
});

async function seedSuspended() {
  for (const d of [0, 25, 50]) await ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(d));
}

function insertRow(raw) {
  return db.query(
    `INSERT INTO assistant_moderation (profile_id, level, until, last_incident_at, last_decay_at) VALUES ($1, $2, $3, $4, $5)`,
    [ME, raw.level, raw.until, raw.lastIncidentAt, raw.lastDecayAt]
  );
}

describe('incidentes paralelos (achado 4): o incremento é atômico no SQL', () => {
  test('10 incidentes ao mesmo tempo terminam no nível 3, sem perder nenhum', async () => {
    const results = await Promise.all(
      Array.from({ length: PARALLEL_INCIDENTS }, () => ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(0)))
    );
    const row = await modRow();
    expect(row.level).toBe(3);
    expect(new Date(row.until).getTime()).toBe(at(0).getTime() + 24 * HOUR);
    expect(await count('assistant_incidents')).toBe(PARALLEL_INCIDENTS);
    // Cada incremento foi contado uma vez: a sequência de níveis é 1, 2, 3, 3, 3...
    const levels = (await db.query('SELECT level_after FROM assistant_incidents')).rows.map((r) => r.level_after).sort();
    expect(levels).toEqual([1, 2, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(results.map((s) => s.level).sort()).toEqual(levels);
  });

  test('10 mensagens ofensivas paralelas no portão do chat: nível 3 e a suspensão passa a valer', async () => {
    await Promise.all(Array.from({ length: PARALLEL_INCIDENTS }, () => Gate.moderationGate(sql, env, MEMBER, OFFENSIVE, CID, at(0))));
    expect((await modRow()).level).toBe(3);
    const blocked = await Gate.moderationGate(sql, env, MEMBER, 'quero me inscrever no evento', CID, new Date(at(0).getTime() + HOUR));
    expect(blocked).toMatchObject({ moderation: { level: 3, suspended: true } });
  });

  test('incidentes em paralelo sobre uma linha com decaimento devido: decai UMA vez e soma cada incidente', async () => {
    // Nível 2 há 100 dias sem incidente: 3 degraus de decaimento -> 0. Dois incidentes depois -> 2.
    await insertRow({ level: 2, until: null, lastIncidentAt: at(-100), lastDecayAt: null });
    await Promise.all([
      ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(0)),
      ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(0)),
    ]);
    expect((await modRow()).level).toBe(2);
  });

  test('o job diário do decaimento concorrendo com um incidente não apaga o incidente', async () => {
    await insertRow({ level: 2, until: null, lastIncidentAt: at(-100), lastDecayAt: null });
    await Promise.all([
      ModerationService.decayAssistantModeration(sql, at(0)),
      ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(0)),
    ]);
    const row = await modRow();
    expect(row.level).toBe(1);
    expect(new Date(row.last_incident_at).getTime()).toBe(at(0).getTime());
  });

  test('leituras do estado com decaimento devido, em paralelo, não corrompem a linha', async () => {
    await insertRow({ level: 3, until: at(-70), lastIncidentAt: at(-70), lastDecayAt: null });
    const states = await Promise.all(Array.from({ length: 6 }, () => ModerationService.getAssistantState(sql, ME, at(0))));
    states.forEach(({ state }) => expect(state.level).toBe(1)); // 70 dias = 2 degraus: 3 -> 1
    expect((await modRow()).level).toBe(1);
  });
});

describe('o SQL atômico equivale à regra pura Rules.registerIncident (paridade)', () => {
  const scenarios = [
    ['sem linha: primeiro incidente', null],
    ['nível 1 recente', { level: 1, until: null, lastIncidentAt: at(-5), lastDecayAt: null }],
    ['nível 2 recente: vira suspensão de 24 h', { level: 2, until: null, lastIncidentAt: at(-5), lastDecayAt: null }],
    ['nível 3 com suspensão ativa: renova a suspensão', { level: 3, until: new Date(at(0).getTime() + 10 * HOUR), lastIncidentAt: at(-0.5), lastDecayAt: null }],
    ['nível 3 expirado há 70 dias: decai 2 degraus e soma 1', { level: 3, until: at(-69), lastIncidentAt: at(-70), lastDecayAt: null }],
    ['nível 2 há 100 dias: zera e soma 1', { level: 2, until: null, lastIncidentAt: at(-100), lastDecayAt: null }],
    ['nível 2 com último decaimento recente', { level: 2, until: null, lastIncidentAt: at(-100), lastDecayAt: at(-10) }],
  ];

  test.each(scenarios)('%s', async (name, raw) => {
    if (raw) await insertRow(raw);
    const expected = Rules.registerIncident(raw || Rules.EMPTY_STATE, at(0));
    await ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(0));
    const actual = Rules.normalizeState(await modRow());
    expect(actual.level).toBe(expected.level);
    expect(actual.until && actual.until.getTime()).toBe(expected.until && expected.until.getTime());
    expect(actual.lastIncidentAt.getTime()).toBe(expected.lastIncidentAt.getTime());
    expect(actual.lastDecayAt && actual.lastDecayAt.getTime()).toBe(expected.lastDecayAt && expected.lastDecayAt.getTime());
  });
});

describe('redenções paralelas (achado 3): a tentativa é reivindicada antes do juiz', () => {
  test('20 pedidos ao mesmo tempo: no máximo 1 é julgado e só 1 é aceito', async () => {
    await seedSuspended();
    globalThis.fetch = slowJudge('sim');
    const settled = await Promise.allSettled(Array.from({ length: PARALLEL_REDEMPTIONS }, () => redeem(SINCERE)));

    expect(globalThis.fetch.mock.calls.length).toBe(1); // o juiz foi chamado uma única vez
    const accepted = settled.filter((r) => r.status === 'fulfilled' && r.value.accepted === true);
    expect(accepted).toHaveLength(1);
    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(PARALLEL_REDEMPTIONS - 1);
    rejected.forEach((r) => expect(['RateLimitError', 'ValidationError']).toContain(r.reason.name));
    expect((await modRow()).level).toBe(0);
    expect(await count('audit_logs', `action = 'assistant_redeemed'`)).toBe(1);
  });

  test('20 pedidos ao mesmo tempo com o juiz vetando: 1 julgado, 1 recusa e o cooldown de 1 h fica valendo', async () => {
    await seedSuspended();
    globalThis.fetch = slowJudge('nao');
    const settled = await Promise.allSettled(Array.from({ length: PARALLEL_REDEMPTIONS }, () => redeem(SINCERE)));

    expect(globalThis.fetch.mock.calls.length).toBe(1);
    const refused = settled.filter((r) => r.status === 'fulfilled' && r.value.accepted === false);
    expect(refused).toHaveLength(1);
    expect((await modRow()).level).toBe(3);
    expect((await modRow()).redeem_attempt_at).not.toBeNull();
    await db.exec('TRUNCATE rate_limit_buckets'); // isola o cooldown do teto de pedidos por hora
    await expect(redeem(SINCERE, new Date(at(50.5).getTime() + 10 * 60000))).rejects.toMatchObject({
      name: 'RateLimitError', payload: { retryAfterSeconds: expect.any(Number) },
    });
  });

  test('juiz indisponível em paralelo: ninguém é aceito, ninguém é punido e o cooldown não é consumido', async () => {
    await seedSuspended();
    globalThis.fetch = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, JUDGE_DELAY_MS));
      return groqReply('', { status: 503 });
    });
    const settled = await Promise.allSettled(Array.from({ length: PARALLEL_REDEMPTIONS }, () => redeem('Desculpa, me arrependo. a b c d e f g h i j k l')));

    expect(settled.some((r) => r.status === 'fulfilled' && r.value.accepted === true)).toBe(false);
    expect(settled.some((r) => r.status === 'fulfilled' && r.value.unavailable === true)).toBe(true);
    const row = await modRow();
    expect(row.level).toBe(3);
    expect(row.redeem_attempt_at).toBeNull();
    expect(await count('audit_logs', `action = 'assistant_redeemed'`)).toBe(0);
    expect(await count('audit_logs', `action = 'assistant_redeem_refused'`)).toBe(0);
  });

  test('uma redenção aceita em paralelo com um incidente novo não perde o incidente', async () => {
    await seedSuspended();
    const [redemption] = await Promise.all([
      redeem(SINCERE),
      ModerationService.registerAssistantIncident(sql, CID, ME, 'terms', at(50.5)),
    ]);
    expect(redemption.accepted).toBe(true);
    // A redenção só mexe em nível e suspensão: o histórico de incidentes e o relógio do decaimento ficam.
    expect(await count('assistant_incidents')).toBe(4);
    expect(new Date((await modRow()).last_incident_at).getTime()).toBe(at(50.5).getTime());
  });
});
