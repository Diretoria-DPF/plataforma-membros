/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as F from '../src/services/assistantFeedbackService.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADM = '33333333-3333-4333-8333-333333333333';
const CID = '99999999-9999-4999-8999-999999999999';
const MISSING_UUID = '44444444-4444-4444-8444-444444444444';

const MEMBER_A = { profileId: A, role: 'member' };
const MEMBER_B = { profileId: B, role: 'member' };
const ADMIN = { profileId: ADM, role: 'admin' };
const VISITOR = { profileId: '55555555-5555-4555-8555-555555555555', role: 'visitor' };

let db;
let sql;

async function seedMessage(profileId, { source = 'kb', answer = 'Resposta da Lia.', createdAt = null } = {}) {
  const res = await db.query(
    `INSERT INTO assistant_messages (profile_id, question_hash, topic, source, answer, created_at)
     VALUES ($1, $2, 'eventos', $3, $4, COALESCE($5::timestamptz, now())) RETURNING id`,
    [profileId, 'h-' + Math.random().toString(36).slice(2), source, answer, createdAt]
  );
  return res.rows[0].id;
}

async function seedFeedback({ messageId, profileId, rating, category = null, comment = null, status = 'new', createdAt = null }) {
  const res = await db.query(
    `INSERT INTO assistant_feedback (message_id, profile_id, rating, category, comment, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now())) RETURNING id`,
    [messageId, profileId, rating, category, comment, status, createdAt]
  );
  return res.rows[0].id;
}

async function countRows(table, where = '1=1', params = []) {
  const res = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params);
  return res.rows[0].n;
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  const people = [
    [A, 'Membro Alfa', 'alfa@example.com', 'alfa_membro'],
    [B, 'Membro Beta', 'beta@example.com', 'beta_membro'],
    [ADM, 'Admin Gama', 'gama@example.com', 'gama_admin'],
    [VISITOR.profileId, 'Visitante Delta', 'delta@example.com', 'delta_visitante'],
  ];
  for (const [id, name, email, username] of people) {
    const role = { gama_admin: 'admin', delta_visitante: 'visitor' }[username] || 'member';
    await db.query(
      `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
       VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', $4, 'active', now(), $5)`,
      [id, name, email, role, username]
    );
  }
}, 120000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  __resetFlagCacheForTests();
  await db.exec(`
    DELETE FROM assistant_feedback; DELETE FROM assistant_messages; DELETE FROM kb_chunks;
    DELETE FROM rate_limit_buckets; DELETE FROM audit_logs;
    UPDATE feature_flags SET enabled = TRUE WHERE key = 'feedback_enabled';`);
});

describe('submitFeedback — autorização, ownership e upsert', () => {
  test('visitante não pode avaliar (ForbiddenError)', async () => {
    const msg = await seedMessage(VISITOR.profileId);
    await expect(F.submitFeedback(sql, VISITOR, { messageId: msg, rating: 'up' }, CID))
      .rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('membro avalia a própria resposta com categoria e comentário', async () => {
    const msg = await seedMessage(A);
    const res = await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'down', category: 'incorreta', comment: 'Errou a data.' }, CID);
    expect(res).toMatchObject({ success: true, feedback: { messageId: msg, rating: 'down', category: 'incorreta' } });
    const row = (await db.query('SELECT rating, category, comment, status FROM assistant_feedback')).rows[0];
    expect(row).toEqual({ rating: 'down', category: 'incorreta', comment: 'Errou a data.', status: 'new' });
  });

  test('upsert: segunda avaliação da mesma mensagem atualiza a linha (uma por mensagem) e reabre a triagem', async () => {
    const msg = await seedMessage(A);
    await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'up' }, CID);
    await F.updateFeedback(sql, ADMIN, { id: (await db.query('SELECT id FROM assistant_feedback')).rows[0].id, status: 'reviewed' }, CID);
    await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'down', category: 'confusa' }, CID);
    expect(await countRows('assistant_feedback')).toBe(1);
    const row = (await db.query('SELECT rating, category, status FROM assistant_feedback')).rows[0];
    expect(row).toEqual({ rating: 'down', category: 'confusa', status: 'new' });
  });

  test('não avalia resposta de outra pessoa: mesma recusa de "não encontrada" e nada gravado', async () => {
    const msgDeB = await seedMessage(B);
    await expect(F.submitFeedback(sql, MEMBER_A, { messageId: msgDeB, rating: 'up' }, CID))
      .rejects.toMatchObject({ name: 'NotFoundError', message: 'Resposta da Lia não encontrada.' });
    expect(await countRows('assistant_feedback')).toBe(0);
  });

  test('mensagem inexistente também vira NotFoundError', async () => {
    await expect(F.submitFeedback(sql, MEMBER_A, { messageId: MISSING_UUID, rating: 'up' }, CID))
      .rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('o admin também pode avaliar a própria resposta', async () => {
    const msg = await seedMessage(ADM);
    const res = await F.submitFeedback(sql, ADMIN, { messageId: msg, rating: 'up' }, CID);
    expect(res.success).toBe(true);
  });
});

describe('submitFeedback — validação e texto puro', () => {
  test.each([
    ['avaliação fora de up/down', { rating: 'talvez' }, 'Avaliação inválida.'],
    ['id que não é UUID', { messageId: 'abc', rating: 'up' }, 'Resposta da Lia inválida.'],
    ['categoria fora da allowlist', { rating: 'up', category: 'inventada' }, 'Categoria inválida.'],
    ['comentário que não é texto', { rating: 'up', comment: 123 }, 'Comentário inválido.'],
  ])('recusa %s', async (_label, extra, message) => {
    const msg = await seedMessage(A);
    await expect(F.submitFeedback(sql, MEMBER_A, Object.assign({ messageId: msg }, extra), CID))
      .rejects.toMatchObject({ name: 'ValidationError', message });
  });

  test('comentário aceita 500 caracteres e recusa 501 (emoji conta como um caractere)', async () => {
    const msg = await seedMessage(A);
    await expect(F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'down', comment: '😀'.repeat(500) }, CID))
      .resolves.toMatchObject({ success: true });
    const msg2 = await seedMessage(A);
    await expect(F.submitFeedback(sql, MEMBER_A, { messageId: msg2, rating: 'down', comment: 'a'.repeat(501) }, CID))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('comentário é texto puro: controles saem, HTML e pedidos de comando ficam como texto', async () => {
    const msg = await seedMessage(A);
    await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'down', comment: 'Obrigado\u0000 <b>oi</b> /apiAdminReindexKb' }, CID);
    const row = (await db.query('SELECT comment FROM assistant_feedback')).rows[0];
    expect(row.comment).toBe('Obrigado <b>oi</b> /apiAdminReindexKb');
  });

  test('comentário só com espaços vira nulo', async () => {
    const msg = await seedMessage(A);
    await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'up', comment: '   ' }, CID);
    const row = (await db.query('SELECT comment FROM assistant_feedback')).rows[0];
    expect(row.comment).toBeNull();
  });

  test('normalizeComment: nulo e vazio passam como nulo', () => {
    expect(F.normalizeComment(undefined)).toBeNull();
    expect(F.normalizeComment('  ')).toBeNull();
  });
});

describe('submitFeedback — flag, cota e migração ausente', () => {
  test('feedback_enabled desligada: responde disabled e não grava', async () => {
    const msg = await seedMessage(A);
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'feedback_enabled'");
    __resetFlagCacheForTests();
    const res = await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'up' }, CID);
    expect(res).toMatchObject({ success: false, disabled: true });
    expect(await countRows('assistant_feedback')).toBe(0);
  });

  test('limite de 30 avaliações por hora: a 31ª é barrada', async () => {
    for (let i = 0; i < 30; i += 1) {
      const msg = await seedMessage(A);
      await F.submitFeedback(sql, MEMBER_A, { messageId: msg, rating: 'up' }, CID);
    }
    const extra = await seedMessage(A);
    await expect(F.submitFeedback(sql, MEMBER_A, { messageId: extra, rating: 'up' }, CID))
      .rejects.toMatchObject({ name: 'RateLimitError' });
  });

  test('migração 021 ausente (tabela de flags sem linha ou tabelas inexistentes) = desligado, sem erro', async () => {
    const missing = Object.assign(new Error('relation "feature_flags" does not exist'), { code: '42P01' });
    const sqlMissing = jest.fn().mockRejectedValue(missing);
    const res = await F.submitFeedback(sqlMissing, MEMBER_A, { messageId: MISSING_UUID, rating: 'up' }, CID);
    expect(res).toMatchObject({ success: false, disabled: true });
  });
});

describe('listFeedback — admin, paginação, filtros e dados pessoais', () => {
  test('membro não lista o feedback (ForbiddenError)', async () => {
    await expect(F.listFeedback(sql, MEMBER_A, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('paginação por cursor: página de 2, depois o restante sem repetir', async () => {
    const t = (min) => new Date(Date.UTC(2026, 9, 1, 12, min)).toISOString();
    const ids = [];
    for (const min of [0, 10, 20]) {
      const msg = await seedMessage(A);
      ids.push(await seedFeedback({ messageId: msg, profileId: A, rating: 'down', createdAt: t(min) }));
    }
    const first = await F.listFeedback(sql, ADMIN, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await F.listFeedback(sql, ADMIN, { limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const seen = first.items.concat(second.items).map((i) => i.id);
    expect(seen).toEqual([ids[2], ids[1], ids[0]]);
  });

  test('filtra por status e por avaliação', async () => {
    const m1 = await seedMessage(A);
    const m2 = await seedMessage(A);
    const m3 = await seedMessage(B);
    await seedFeedback({ messageId: m1, profileId: A, rating: 'up', status: 'reviewed' });
    await seedFeedback({ messageId: m2, profileId: A, rating: 'down', status: 'new' });
    await seedFeedback({ messageId: m3, profileId: B, rating: 'down', status: 'reviewed' });
    const reviewed = await F.listFeedback(sql, ADMIN, { status: 'reviewed' });
    expect(reviewed.items.map((i) => i.rating).sort()).toEqual(['down', 'up']);
    const downs = await F.listFeedback(sql, ADMIN, { rating: 'down' });
    expect(downs.items).toHaveLength(2);
    const both = await F.listFeedback(sql, ADMIN, { status: 'new', rating: 'up' });
    expect(both.items).toHaveLength(0);
  });

  test('traz só apelido e papel de quem avaliou, nunca nome completo nem e-mail', async () => {
    const msg = await seedMessage(A);
    await seedFeedback({ messageId: msg, profileId: A, rating: 'down', comment: 'Confuso.' });
    const res = await F.listFeedback(sql, ADMIN, {});
    expect(res.items[0].author).toEqual({ username: 'alfa_membro', role: 'member' });
    const json = JSON.stringify(res);
    expect(json).not.toContain('alfa@example.com');
    expect(json).not.toContain('Membro Alfa');
  });

  test('cursor inválido é recusado', async () => {
    await expect(F.listFeedback(sql, ADMIN, { cursor: 'lixo' })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('filtro com valor fora da lista é recusado', async () => {
    await expect(F.listFeedback(sql, ADMIN, { status: 'apagado' })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('tabela ausente: lista vazia, sem erro', async () => {
    const missing = Object.assign(new Error('relation "assistant_feedback" does not exist'), { code: '42P01' });
    const res = await F.listFeedback(jest.fn().mockRejectedValue(missing), ADMIN, {});
    expect(res).toEqual({ success: true, items: [], nextCursor: null });
  });
});

describe('feedbackStats — painel de satisfação', () => {
  test('membro não vê estatísticas', async () => {
    await expect(F.feedbackStats(sql, MEMBER_A, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('contagens, taxa de utilidade, por categoria e por dia; a janela deixa de fora o antigo', async () => {
    const recent = [];
    for (let i = 0; i < 4; i += 1) recent.push(await seedMessage(A));
    await seedFeedback({ messageId: recent[0], profileId: A, rating: 'up' });
    await seedFeedback({ messageId: recent[1], profileId: A, rating: 'up' });
    await seedFeedback({ messageId: recent[2], profileId: A, rating: 'up' });
    await seedFeedback({ messageId: recent[3], profileId: A, rating: 'down', category: 'incorreta' });
    const old = await seedMessage(B);
    await seedFeedback({ messageId: old, profileId: B, rating: 'down', category: 'ofensiva', createdAt: new Date(Date.now() - 90 * 86400000).toISOString() });

    const res = await F.feedbackStats(sql, ADMIN, { days: 30 });
    expect(res.days).toBe(30);
    expect(res.totals).toEqual({ up: 3, down: 1, total: 4, utilityRate: 0.75 });
    expect(res.byCategory).toEqual(expect.arrayContaining([
      { category: 'incorreta', up: 0, down: 1 },
      { category: 'sem_categoria', up: 3, down: 0 },
    ]));
    expect(res.byCategory.find((c) => c.category === 'ofensiva')).toBeUndefined();
    const dayTotals = res.byDay.reduce((acc, d) => ({ up: acc.up + d.up, down: acc.down + d.down }), { up: 0, down: 0 });
    expect(dayTotals).toEqual({ up: 3, down: 1 });
    res.byDay.forEach((d) => expect(d.day).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  test('sem avaliações: taxa de utilidade é nula', async () => {
    const res = await F.feedbackStats(sql, ADMIN, {});
    expect(res.totals).toEqual({ up: 0, down: 0, total: 0, utilityRate: null });
    expect(res.days).toBe(30);
  });

  test('janela acima do teto é limitada a 365 dias', async () => {
    const res = await F.feedbackStats(sql, ADMIN, { days: 99999 });
    expect(res.days).toBe(365);
  });

  test('tabela ausente: zeros, sem erro', async () => {
    const missing = Object.assign(new Error('relation "assistant_feedback" does not exist'), { code: '42P01' });
    const res = await F.feedbackStats(jest.fn().mockRejectedValue(missing), ADMIN, { days: 7 });
    expect(res).toMatchObject({ success: true, days: 7, totals: { total: 0, utilityRate: null }, byCategory: [], byDay: [] });
  });
});

describe('updateFeedback — triagem do admin', () => {
  test('membro não tria (ForbiddenError)', async () => {
    await expect(F.updateFeedback(sql, MEMBER_A, { id: MISSING_UUID, status: 'reviewed' }, CID))
      .rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('admin marca como revisado e a auditoria não leva o comentário', async () => {
    const msg = await seedMessage(A);
    const id = await seedFeedback({ messageId: msg, profileId: A, rating: 'down', comment: 'texto pessoal sensível' });
    const res = await F.updateFeedback(sql, ADMIN, { id, status: 'reviewed' }, CID);
    expect(res.success).toBe(true);
    expect((await db.query('SELECT status FROM assistant_feedback')).rows[0].status).toBe('reviewed');
    const audit = (await db.query("SELECT action, details FROM audit_logs WHERE action = 'REVIEW_ASSISTANT_FEEDBACK'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ status: 'reviewed' });
    expect(JSON.stringify(audit)).not.toContain('texto pessoal sensível');
  });

  test('status fora de reviewed/dismissed é recusado', async () => {
    await expect(F.updateFeedback(sql, ADMIN, { id: MISSING_UUID, status: 'new' }, CID))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('feedback inexistente vira NotFoundError', async () => {
    await expect(F.updateFeedback(sql, ADMIN, { id: MISSING_UUID, status: 'dismissed' }, CID))
      .rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('listKbSources — fontes para citações', () => {
  test('lista distinta de source e section, sem conteúdo', async () => {
    await db.exec(`
      INSERT INTO kb_chunks (source, section, content, content_hash) VALUES
        ('guia', 'O que a Lia faz', 'texto longo do trecho', 'h1'),
        ('guia', 'Modo limitado', 'outro texto', 'h2'),
        ('destinos', 'Eventos', 'texto de destino', 'h3')`);
    const res = await F.listKbSources(sql);
    expect(res.success).toBe(true);
    expect(res.sources).toEqual([
      { source: 'destinos', section: 'Eventos' },
      { source: 'guia', section: 'Modo limitado' },
      { source: 'guia', section: 'O que a Lia faz' },
    ]);
    res.sources.forEach((s) => expect(Object.keys(s).sort()).toEqual(['section', 'source']));
  });

  test('tabela ausente: lista vazia', async () => {
    const missing = Object.assign(new Error('relation "kb_chunks" does not exist'), { code: '42P01' });
    expect(await F.listKbSources(jest.fn().mockRejectedValue(missing))).toEqual({ success: true, sources: [] });
  });
});

describe('reindexKb — reindexação pelo admin', () => {
  test('membro não reindexa (ForbiddenError)', async () => {
    await expect(F.reindexKb(sql, makeEnv(), MEMBER_A, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('admin reindexa a base sem modelo de embedding: grava trechos sem vetor e audita', async () => {
    const res = await F.reindexKb(sql, makeEnv(), ADMIN, CID);
    expect(res.success).toBe(true);
    expect(res.report.total).toBeGreaterThan(10);
    expect(res.report.embeddingAvailable).toBe(false);
    expect(await countRows('kb_chunks')).toBe(res.report.total);
    expect(await countRows('kb_chunks', 'embedding IS NULL')).toBe(res.report.total);
    const audit = (await db.query("SELECT action, target_type, details FROM audit_logs WHERE action = 'REINDEX_ASSISTANT_KB'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ total: res.report.total, embeddingAvailable: false });
  });

  test('segunda reindexação dentro de 1 minuto é barrada (RateLimitError)', async () => {
    await F.reindexKb(sql, makeEnv(), ADMIN, CID);
    await expect(F.reindexKb(sql, makeEnv(), ADMIN, CID)).rejects.toMatchObject({ name: 'RateLimitError' });
  });
});
