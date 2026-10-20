/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Direitos do titular (LGPD): exportação dos próprios dados e pedido de exclusão de conta (privacyService),
 * contra um Postgres real em memória (PGlite). Quem usa: `npm test -- -i privacy`.
 */
import * as Privacy from '../src/services/privacyService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const ADMIN = '77777777-7777-4777-8777-777777777771';
const ADMIN2 = '77777777-7777-4777-8777-777777777772';
const ANA = '77777777-7777-4777-8777-777777777773';
const BIA = '77777777-7777-4777-8777-777777777774';
const CID = '00000000-0000-4000-8000-0000000000d1';
const admin = { profileId: ADMIN, role: 'admin', fullName: 'Diretoria Um' };
const ana = { profileId: ANA, role: 'member', fullName: 'Ana Souza Lima' };
const bia = { profileId: BIA, role: 'member', fullName: 'Bia Costa' };

let db;
let sql;
const rows = async (text, params = []) => (await db.query(text, params)).rows;

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('TRUNCATE selection_events, selection_applications, account_deletion_requests, audit_logs, rate_limit_buckets, consents');
  await db.exec("DELETE FROM profiles WHERE id IN ('" + [ANA, BIA].join("','") + "')");
  const people = [[ADMIN, 'admin', 1, 'Diretoria Um'], [ADMIN2, 'admin', 2, 'Diretoria Dois'], [ANA, 'member', 3, 'Ana Souza Lima'], [BIA, 'member', 4, 'Bia Costa']];
  for (const [id, role, n, name] of people) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, city) VALUES ($1, $3, 'priv${n}', 'priv${n}@exemplo.com', 'HASH-SECRETO-${n}', '1199977000${n}', $2, 'Recife') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
      [id, role, name],
    );
  }
  await db.query("INSERT INTO selection_applications (profile_id, status, bank_version, seed, step, deadline_at, data, ai_triage, decision_note, submitted_at) VALUES ($1, 'submitted', 'v1', 1, 'done', now() + interval '1 day', $2::jsonb, '{\"resumo\":\"TRIAGEM-IA\"}'::jsonb, 'NOTA-INTERNA', now())",
    [ANA, JSON.stringify({ profile: { course: 'Farmácia' }, scenario: { text: 'minha resposta' }, _signals: { scenario: ['saude'] } })]);
  await db.query("INSERT INTO selection_applications (profile_id, status, bank_version, seed, step, deadline_at, data) VALUES ($1, 'draft', 'v1', 2, 'intro', now() + interval '1 day', $2::jsonb)",
    [BIA, JSON.stringify({ profile: { course: 'OUTRO-CURSO-BIA' } })]);
  await db.query("INSERT INTO consents (profile_id, document_type, document_version) SELECT $1, e.enumlabel::consent_document_type, '1.0' FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'consent_document_type' LIMIT 1", [ANA]);
});

describe('exportMyData', () => {
  test('devolve os dados da própria pessoa sem segredos nem observações internas', async () => {
    const out = await Privacy.exportMyData(sql, ana);
    const text = JSON.stringify(out);
    expect(out.success).toBe(true);
    expect(out.data.profile).toMatchObject({ fullName: 'Ana Souza Lima', email: 'priv3@exemplo.com', city: 'Recife' });
    expect(out.data.selection).toHaveLength(1);
    expect(out.data.selection[0].answers.scenario.text).toBe('minha resposta');
    expect(out.data.consents).toHaveLength(1);
    expect(out.notes.join(' ')).toMatch(/mensagens/i);
    for (const banned of ['HASH-SECRETO', 'password', 'TRIAGEM-IA', 'NOTA-INTERNA', '_signals', 'saude', 'OUTRO-CURSO-BIA', 'Bia Costa']) expect(text).not.toContain(banned);
  });

  test('exige sessão', async () => {
    await expect(Privacy.exportMyData(sql, null)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});

describe('pedido de exclusão', () => {
  test('é idempotente, informa o prazo de 180 dias e audita sem dado pessoal', async () => {
    const first = await Privacy.requestDeletion(sql, ana, { reason: 'Não uso mais.' }, CID);
    const again = await Privacy.requestDeletion(sql, ana, {}, CID);
    expect(first.status).toBe('requested');
    expect(again.dueAt).toBe(first.dueAt);
    expect(await rows('SELECT * FROM account_deletion_requests')).toHaveLength(1);
    const days = (new Date(first.dueAt) - new Date(first.requestedAt)) / 86400000;
    expect(Math.round(days)).toBe(180);
    const [req] = await rows('SELECT profile_label FROM account_deletion_requests');
    expect(req.profile_label).toBe('Ana');
    const audit = JSON.stringify(await rows('SELECT details FROM audit_logs'));
    expect(audit).not.toContain('Não uso mais');
    expect(audit).not.toContain('exemplo.com');
  });

  test('rejeita motivo longo; status e cancelamento', async () => {
    await expect(Privacy.requestDeletion(sql, ana, { reason: 'x'.repeat(501) }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await Privacy.getDeletionStatus(sql, ana)).request).toBeNull();
    await Privacy.requestDeletion(sql, ana, {}, CID);
    expect((await Privacy.getDeletionStatus(sql, ana)).request.status).toBe('requested');
    expect((await Privacy.getDeletionStatus(sql, bia)).request).toBeNull();
    await Privacy.cancelDeletion(sql, ana, CID);
    expect((await Privacy.getDeletionStatus(sql, ana)).request).toBeNull();
    await expect(Privacy.cancelDeletion(sql, ana, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
    expect((await Privacy.requestDeletion(sql, ana, {}, CID)).status).toBe('requested');
  });
});

describe('administração', () => {
  test('lista só o mínimo e só para administrador', async () => {
    await Privacy.requestDeletion(sql, ana, { reason: 'segredo do motivo' }, CID);
    await expect(Privacy.listDeletionRequests(sql, ana, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Privacy.completeDeletion(sql, ana, { id: CID }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    const out = await Privacy.listDeletionRequests(sql, admin, {});
    expect(out.items).toHaveLength(1);
    expect(Object.keys(out.items[0]).sort()).toEqual(['dueAt', 'id', 'label', 'requestedAt', 'status']);
    expect(JSON.stringify(out)).not.toContain('segredo do motivo');
    expect((await Privacy.listDeletionRequests(sql, admin, { status: 'completed' })).items).toHaveLength(0);
  });

  test('concluir apaga o perfil e os dados dela, preserva os de outros e zera o rótulo', async () => {
    await Privacy.requestDeletion(sql, ana, {}, CID);
    const [{ id }] = await rows('SELECT id FROM account_deletion_requests');
    const done = await Privacy.completeDeletion(sql, admin, { id }, CID);
    expect(done.success).toBe(true);
    expect(await rows('SELECT 1 FROM profiles WHERE id = $1', [ANA])).toHaveLength(0);
    expect(await rows('SELECT 1 FROM selection_applications WHERE profile_id = $1', [ANA])).toHaveLength(0);
    expect(await rows('SELECT 1 FROM profiles WHERE id = $1', [BIA])).toHaveLength(1);
    const [req] = await rows('SELECT * FROM account_deletion_requests');
    expect(req).toMatchObject({ status: 'completed', profile_id: null, profile_label: null, processed_by: ADMIN });
    expect(req.processed_at).toBeTruthy();
    const audit = JSON.stringify(await rows("SELECT details, target_id, target_type FROM audit_logs WHERE action = 'ACCOUNT_DELETION_COMPLETED'"));
    expect(audit).not.toContain(ANA);
    expect(audit).not.toContain('Ana');
    await expect(Privacy.completeDeletion(sql, admin, { id }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    await expect(Privacy.completeDeletion(sql, admin, { id: 'xx' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('recusa apagar a própria conta de administrador e o último administrador', async () => {
    await db.exec("UPDATE profiles SET role = 'member' WHERE role = 'admin' AND id <> '" + ADMIN + "'");
    await Privacy.requestDeletion(sql, admin, {}, CID);
    const [{ id }] = await rows('SELECT id FROM account_deletion_requests');
    await expect(Privacy.completeDeletion(sql, admin, { id }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    // outra sessão de administrador tenta apagar o único administrador ativo do banco
    const other = { profileId: ADMIN2, role: 'admin', fullName: 'Outro' };
    await expect(Privacy.completeDeletion(sql, other, { id }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    expect(await rows('SELECT 1 FROM profiles WHERE id = $1', [ADMIN])).toHaveLength(1);
    expect((await rows('SELECT status FROM account_deletion_requests'))[0].status).toBe('requested');
  });
});
