/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Retenção da Lia (ADR 0005) contra Postgres de verdade (PGlite com todas as
 * migrações). Prova o que um mock não prova: o corte por idade, o hash feito
 * pelo pgcrypto e o efeito do CASCADE de sql/021 sobre a avaliação.
 * Para cada teste, os dias são "recuados" nas colunas created_at.
 */
import { createHash } from 'node:crypto';
import { runMaintenance } from '../src/maintenance.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const A = '11111111-1111-4111-8111-111111111111';
const CID = '99999999-9999-4999-8999-999999999999';

let db;
let sql;

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function seedMessage(daysAgo = 0) {
  const res = await db.query(
    `INSERT INTO assistant_messages (profile_id, question_hash, topic, source, answer, created_at)
     VALUES ($1, $2, 'eventos', 'kb', 'Resposta da Lia.', now() - make_interval(days => $3::int))
     RETURNING id`,
    [A, 'h-' + Math.random().toString(36).slice(2), daysAgo]
  );
  return res.rows[0].id;
}

async function seedFeedback({ messageId, daysAgo = 0, comment = null, category = null, rating = 'down' }) {
  const res = await db.query(
    `INSERT INTO assistant_feedback (message_id, profile_id, rating, category, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, now() - make_interval(days => $6::int))
     RETURNING id`,
    [messageId, A, rating, category, comment, daysAgo]
  );
  return res.rows[0].id;
}

async function seedIncident(daysAgo) {
  const res = await db.query(
    `INSERT INTO assistant_incidents (profile_id, kind, detection, level_after, created_at)
     VALUES ($1, 'offensive', 'terms', 1, now() - make_interval(days => $2::int))
     RETURNING id`,
    [A, daysAgo]
  );
  return res.rows[0].id;
}

async function feedbackRow(id) {
  const res = await db.query(
    'SELECT rating, category, comment, comment_anonymized_at FROM assistant_feedback WHERE id = $1',
    [id]
  );
  return res.rows[0] || null;
}

async function exists(table, id) {
  const res = await db.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  return res.rows.length === 1;
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, 'Membro Alfa', 'alfa@example.com', 'hash-de-teste', '11999990000', 'member', 'active', now(), 'alfa_membro')`,
    [A]
  );
}, 120000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM assistant_incidents;
    DELETE FROM assistant_feedback;
    DELETE FROM assistant_messages;`);
});

describe('(a) comentário da avaliação anonimizado aos 90 dias', () => {
  test('comentário de 91 dias vira SHA-256 e ganha a data; o de 89 dias fica como está', async () => {
    const m91 = await seedMessage(0);
    const f91 = await seedFeedback({ messageId: m91, daysAgo: 91, comment: 'Errou a data da prova', category: 'incorreta' });
    const m89 = await seedMessage(0);
    const f89 = await seedFeedback({ messageId: m89, daysAgo: 89, comment: 'Ficou confusa' });

    const res = await runMaintenance(sql, CID);

    expect(res.assistantFeedbackAnonymize).toBe(1);
    const anon = await feedbackRow(f91);
    expect(anon.comment).toBe(sha256Hex('Errou a data da prova'));
    expect(anon.comment_anonymized_at).not.toBeNull();
    // Rating e categoria permanecem para métricas.
    expect(anon).toMatchObject({ rating: 'down', category: 'incorreta' });

    const kept = await feedbackRow(f89);
    expect(kept.comment).toBe('Ficou confusa');
    expect(kept.comment_anonymized_at).toBeNull();
  });

  test('é idempotente: a segunda limpeza não rehasheia um comentário já anonimizado', async () => {
    const m = await seedMessage(0);
    const f = await seedFeedback({ messageId: m, daysAgo: 120, comment: 'Texto original' });
    await runMaintenance(sql, CID);
    const primeiro = await feedbackRow(f);
    const res = await runMaintenance(sql, CID);
    expect(res.assistantFeedbackAnonymize).toBe(0);
    expect((await feedbackRow(f)).comment).toBe(primeiro.comment);
  });

  test('só atua em avaliação com comentário: sem texto, nada é marcado', async () => {
    const m = await seedMessage(0);
    const f = await seedFeedback({ messageId: m, daysAgo: 120, comment: null, rating: 'up' });
    await runMaintenance(sql, CID);
    const row = await feedbackRow(f);
    expect(row.comment).toBeNull();
    expect(row.comment_anonymized_at).toBeNull();
  });
});

describe('(b) registro da avaliação removido aos 365 dias', () => {
  test('registro de 366 dias é removido e o de 364 dias permanece', async () => {
    // A mensagem é recente de propósito: assim só a regra de 365 dias age sobre a avaliação.
    const m366 = await seedMessage(0);
    const f366 = await seedFeedback({ messageId: m366, daysAgo: 366, comment: 'Antigo demais' });
    const m364 = await seedMessage(0);
    const f364 = await seedFeedback({ messageId: m364, daysAgo: 364, comment: 'Ainda dentro do prazo' });

    const res = await runMaintenance(sql, CID);

    expect(res.assistantFeedbackPurge).toBe(1);
    expect(await exists('assistant_feedback', f366)).toBe(false);
    expect(await exists('assistant_feedback', f364)).toBe(true);
  });
});

describe('(c) resposta registrada da Lia removida aos 180 dias', () => {
  test('mensagem de 181 dias sai; a de 179 dias permanece', async () => {
    const old = await seedMessage(181);
    const young = await seedMessage(179);

    const res = await runMaintenance(sql, CID);

    expect(res.assistantMessagesPurge).toBe(1);
    expect(await exists('assistant_messages', old)).toBe(false);
    expect(await exists('assistant_messages', young)).toBe(true);
  });

  test('a avaliação da resposta removida sai junto (CASCADE de sql/021); a da resposta nova fica', async () => {
    const old = await seedMessage(181);
    const fOld = await seedFeedback({ messageId: old, daysAgo: 100, comment: 'Ligada a uma resposta velha' });
    const young = await seedMessage(179);
    const fYoung = await seedFeedback({ messageId: young, daysAgo: 10, comment: 'Ligada a uma resposta recente' });

    await runMaintenance(sql, CID);

    expect(await exists('assistant_feedback', fOld)).toBe(false);
    expect(await exists('assistant_feedback', fYoung)).toBe(true);
  });
});

describe('(d) incidentes de moderação removidos aos 365 dias', () => {
  test('incidente de 366 dias sai; o de 364 dias permanece', async () => {
    const i366 = await seedIncident(366);
    const i364 = await seedIncident(364);

    const res = await runMaintenance(sql, CID);

    expect(res.assistantIncidentsPurge).toBe(1);
    expect(await exists('assistant_incidents', i366)).toBe(false);
    expect(await exists('assistant_incidents', i364)).toBe(true);
  });
});
