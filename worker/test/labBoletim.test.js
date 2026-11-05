/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Migração 055 (boletim do Laboratório na conta) contra um Postgres real (PGlite): só contadores, uma linha por
// pessoa e competência, exclusão em cascata, RLS forçado e flag desligada. A migração NÃO é aplicada em produção.
import { createMigratedDb } from './helpers/pgliteSql.js';

const PROFILE = '33333333-3333-4333-8333-333333333333';

describe('055 — boletim por competência na conta', () => {
  let db;
  beforeAll(async () => {
    db = await createMigratedDb();
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role)
       VALUES ($1, 'Pessoa Teste', 'pessoateste', 'pessoa@exemplo.com', 'x', '11999990000', 'member')`,
      [PROFILE]
    );
  }, 60000);
  afterAll(async () => { await db.close(); });

  const linha = (comp, extra = '') => db.query(
    `INSERT INTO lab_boletim_competencia (profile_id, competencia, acertos, sem_apoio ${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ($1, $2, 3, 1 ${extra ? ', ' + extra.split('=')[1] : ''})`,
    [PROFILE, comp]
  );

  test('a flag lab_boletim_conta_enabled nasce desligada', async () => {
    const { rows } = await db.query("SELECT enabled FROM feature_flags WHERE key = 'lab_boletim_conta_enabled'");
    expect(rows).toEqual([{ enabled: false }]);
  });

  test('RLS forçado na tabela (laift_enable_rls)', async () => {
    const { rows } = await db.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'lab_boletim_competencia'");
    expect(rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });

  test('uma linha por pessoa e competência; nome de competência fora do padrão é recusado', async () => {
    await linha('tecnica');
    await expect(linha('tecnica')).rejects.toThrow();
    await expect(linha('../x')).rejects.toThrow();
    await expect(linha('Tecnica')).rejects.toThrow();
  });

  test('contadores negativos ou acima do teto, e sem apoio maior que acertos, são recusados', async () => {
    await expect(linha('seguranca', 'erros=-1')).rejects.toThrow();
    await expect(linha('calculo', 'dicas=100001')).rejects.toThrow();
    await expect(db.query("INSERT INTO lab_boletim_competencia (profile_id, competencia, acertos, sem_apoio) VALUES ($1, 'qualidade', 1, 2)", [PROFILE])).rejects.toThrow();
  });

  test('a exclusão da conta apaga o boletim (ON DELETE CASCADE)', async () => {
    expect((await db.query('SELECT count(*)::int AS n FROM lab_boletim_competencia WHERE profile_id = $1', [PROFILE])).rows[0].n).toBe(1);
    await db.query('DELETE FROM profiles WHERE id = $1', [PROFILE]);
    expect((await db.query('SELECT count(*)::int AS n FROM lab_boletim_competencia')).rows[0].n).toBe(0);
  });
});
