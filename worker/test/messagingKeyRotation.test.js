/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Publicação e rotação da chave de mensageria contra um Postgres real (PGlite): a primeira publicação e a
 * rotação (entrar num navegador sem a chave privada local) precisam funcionar sem violar uq_messaging_keys_active.
 * Quem usa: `npm test -- -i messagingKeyRotation`.
 */
import * as MessagingKeyService from '../src/services/messagingKeyService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const PROFILE = '66666666-6666-4666-8666-666666666666';
const MEMBER = { profileId: PROFILE, role: 'member', fullName: 'Membro Teste' };
const key = (n) => Buffer.alloc(32, n).toString('base64url');
const input = (n, expectedCurrentVersion) => ({ algorithm: 'X25519', publicKey: key(n), kdfAlgorithm: 'NONE', expectedCurrentVersion });

let db;
let sql;

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('TRUNCATE messaging_keys, audit_logs, rate_limit_buckets');
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, 'Membro Teste', 'membro', 'membro@exemplo.com', 'x', '11999990000', 'member') ON CONFLICT (id) DO NOTHING`,
    [PROFILE],
  );
});

const rows = async () => (await db.query('SELECT key_version, public_key, superseded_at FROM messaging_keys WHERE profile_id = $1 ORDER BY key_version', [PROFILE])).rows;
const publish = (n, expected) => MessagingKeyService.publishMessagingKey(sql, MEMBER, input(n, expected), 'cid');

describe('publishMessagingKey com banco real', () => {
  test('primeira publicação cria a versão 1 ativa', async () => {
    const res = await publish(1, 0);
    expect(res).toMatchObject({ success: true, keyVersion: 1 });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].superseded_at).toBeNull();
  });

  test('rotação: a versão 1 sai de cena e a 2 fica ativa (navegador novo, sem a chave privada local)', async () => {
    await publish(1, 0);
    const res = await publish(2, 1);
    expect(res).toMatchObject({ success: true, keyVersion: 2 });
    const all = await rows();
    expect(all.map((r) => [r.key_version, r.superseded_at === null])).toEqual([[1, false], [2, true]]);
  });

  test('rotações seguidas continuam numerando 3, 4...', async () => {
    await publish(1, 0);
    await publish(2, 1);
    expect((await publish(3, 2)).keyVersion).toBe(3);
    expect((await rows()).filter((r) => r.superseded_at === null)).toHaveLength(1);
  });

  test('versão esperada velha vira conflito e não mexe nas chaves', async () => {
    await publish(1, 0);
    await publish(2, 1);
    await expect(publish(3, 1)).rejects.toMatchObject({ name: 'ConflictError' });
    expect((await rows()).map((r) => r.key_version)).toEqual([1, 2]);
  });

  test('primeira publicação repetida (duas abas) vira conflito, sem erro de banco', async () => {
    await publish(1, 0);
    await expect(publish(2, 0)).rejects.toMatchObject({ name: 'ConflictError' });
    expect(await rows()).toHaveLength(1);
  });

  test('duas rotações ao mesmo tempo: uma vence, a outra recebe conflito, sempre com uma chave ativa', async () => {
    await publish(1, 0);
    const results = await Promise.allSettled([publish(2, 1), publish(3, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason).toMatchObject({ name: 'ConflictError' });
    expect((await rows()).filter((r) => r.superseded_at === null)).toHaveLength(1);
  });
});
