/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryMigration.test.js — sql/memory/001_memory.sql em Postgres de verdade (PGlite, banco SEPARADO do núcleo):
 * sem coluna de texto livre, CHECKs de formato e de forma, teto de 60 itens, retenção de 12 meses, papel de execução
 * sem BYPASSRLS/DDL, RLS FORÇADA por pessoa (sem sujeito nada aparece; A não vê B; manutenção enxerga tudo mas não
 * grava), idempotência, ledger fora do alcance do papel e a volta (down).
 */
import { createMemoryPglite, readMemorySql } from './helpers/memoryDb.js';
import { adaptForNoVector, loadVectorExtension } from '../scripts/pgvector-shim.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
let db;

beforeAll(async () => { db = await createMemoryPglite(); }, 60000);
afterAll(async () => { await db.close(); });

async function asRole(role, fn) {
  await db.exec('SET ROLE ' + role);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
    await db.exec("SELECT set_config('app.subject_id', '', false), set_config('app.maintenance', '', false)");
  }
}

const row = (over = {}) => Object.assign({
  subject_id: A, kind: 'topic_level', slug: 'farmacocinetica', level: 3, value: null, source: 'quiz', evidence: 1,
  consent_version: 'memoria-v1', expires_at: "now() + interval '30 days'", created_at: 'now()',
}, over);

function insertSql(r) {
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + v + "'");
  return `INSERT INTO memory_items (subject_id, kind, slug, level, value, source, evidence, consent_version, created_at, expires_at)
    VALUES (${lit(r.subject_id)}, ${lit(r.kind)}, ${lit(r.slug)}, ${lit(r.level)}, ${lit(r.value)}, ${lit(r.source)}, ${lit(r.evidence)}, ${lit(r.consent_version)}, ${r.created_at}, ${r.expires_at})`;
}
const put = (over) => db.exec(insertSql(row(over)));
const clear = () => db.exec('DELETE FROM memory_items');

describe('esquema — sem lugar para texto livre', () => {
  test('colunas conhecidas e nenhuma de texto livre (só slug/valor de lista fechada)', async () => {
    const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'memory_items' ORDER BY ordinal_position");
    expect(rows.map((r) => r.column_name)).toEqual([
      'id', 'subject_id', 'kind', 'slug', 'level', 'value', 'source', 'evidence', 'consent_version', 'created_at', 'updated_at', 'last_used_at', 'expires_at',
    ]);
  });

  test('o item válido entra', async () => {
    await clear();
    await expect(put()).resolves.toBeDefined();
  });

  test.each([
    ['subject_id fora do formato (não é HMAC hexadecimal)', { subject_id: 'maria@exemplo.com' }],
    ['tipo desconhecido', { kind: 'nota' }],
    ['slug com espaço ou texto livre', { slug: 'minha mae toma metformina' }],
    ['slug curto demais', { slug: 'a' }],
    ['slug com maiúscula', { slug: 'Farmaco' }],
    ['nível fora de 1–5', { level: 6 }],
    ['topic_level sem nível', { level: null }],
    ['topic_level com valor', { value: 'dificil' }],
    ['difficulty com valor fora da lista', { kind: 'difficulty', value: 'depressao', level: 2 }],
    ['difficulty sem valor', { kind: 'difficulty', value: null, level: 2 }],
    ['study_pref com valor livre', { kind: 'study_pref', slug: 'formato', level: null, value: 'quero resumos curtos' }],
    ['study_pref com nível', { kind: 'study_pref', slug: 'formato', level: 3, value: 'resumo' }],
    ['goal com valor diferente de ativo', { kind: 'goal', slug: 'prova', level: null, value: 'passar na prova de dia 10' }],
    ['origem desconhecida', { source: 'llm' }],
    ['evidência zero', { evidence: 0 }],
    ['evidência acima do teto', { evidence: 1001 }],
    ['versão do consentimento fora do formato', { consent_version: 'Versão 1!' }],
    ['validade além de 12 meses da criação', { expires_at: "now() + interval '13 months'" }],
    ['validade anterior à criação', { expires_at: "now() - interval '1 day'" }],
  ])('recusa: %s', async (_nome, over) => {
    await clear();
    await expect(put(over)).rejects.toThrow(/violates check constraint/);
  });

  test('o mesmo (pessoa, tipo, tema) é único', async () => {
    await clear();
    await put();
    await expect(put()).rejects.toThrow(/duplicate key|unique/i);
  });

  test('vocabulário de preferências e objetivo válidos entram', async () => {
    await clear();
    await put({ kind: 'study_pref', slug: 'formato', level: null, value: 'passo_a_passo' });
    await put({ kind: 'goal', slug: 'prova', level: null, value: 'ativo' });
    await put({ kind: 'difficulty', slug: 'coagulacao', level: 2, value: 'duvida', source: 'tutor' });
  });
});

describe('teto de 60 itens por pessoa', () => {
  test('o 61º item é recusado; o UPSERT de um existente continua valendo; outra pessoa não é afetada', async () => {
    await clear();
    for (let i = 0; i < 60; i++) await put({ slug: 'tema-' + String(i).padStart(2, '0') });
    await expect(put({ slug: 'tema-novo' })).rejects.toThrow(/memory_items_cap/);
    await expect(db.exec(
      `${insertSql(row({ slug: 'tema-00', level: 4 }))} ON CONFLICT (subject_id, kind, slug) DO UPDATE SET level = EXCLUDED.level`
    )).resolves.toBeDefined();
    await expect(put({ subject_id: B, slug: 'tema-novo' })).resolves.toBeDefined();
  });

  test('itens vencidos não ocupam vaga do teto', async () => {
    await clear();
    for (let i = 0; i < 60; i++) await put({ slug: 'tema-' + String(i).padStart(2, '0'), created_at: i < 5 ? "now() - interval '200 days'" : 'now()', expires_at: i < 5 ? "now() - interval '1 day'" : "now() + interval '30 days'" });
    await expect(put({ slug: 'tema-novo' })).resolves.toBeDefined();
  });
});

describe('papel de execução laift_memory_worker', () => {
  test('LOGIN sem superusuário, sem BYPASSRLS, sem CREATEDB/CREATEROLE', async () => {
    const { rows } = await db.query("SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = 'laift_memory_worker'");
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: true }]);
  });

  test('sem senha definida no SQL (o dono define depois)', async () => {
    const { rows } = await db.query("SELECT rolpassword FROM pg_authid WHERE rolname = 'laift_memory_worker'").catch(() => ({ rows: [{ rolpassword: null }] }));
    expect(rows[0].rolpassword).toBeNull();
  });

  test('RLS ligada e FORÇADA, com a política por pessoa', async () => {
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
              (SELECT array_agg(polname) FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas
       FROM pg_class c WHERE c.relname = 'memory_items'`
    );
    expect(rows).toEqual([{ rls: true, forcado: true, politicas: ['memory_subject_isolation'] }]);
  });

  test('só DML em memory_items: nenhuma outra tabela ou sequência', async () => {
    const { rows } = await db.query(
      `SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
       FROM information_schema.role_table_grants WHERE grantee = 'laift_memory_worker' AND table_schema = 'public' GROUP BY table_name`
    );
    expect(rows).toEqual([{ table_name: 'memory_items', privs: 'DELETE,INSERT,SELECT,UPDATE' }]);
  });

  test('DDL negado: criar/apagar/alterar tabela, TRUNCATE, desligar RLS, criar papel, criar extensão', async () => {
    await asRole('laift_memory_worker', async () => {
      await expect(db.exec('CREATE TABLE zz_intruso (id int)')).rejects.toThrow(/permission denied/);
      await expect(db.exec('DROP TABLE memory_items')).rejects.toThrow(/must be owner/);
      await expect(db.exec('ALTER TABLE memory_items ADD COLUMN nota text')).rejects.toThrow(/must be owner/);
      await expect(db.exec('ALTER TABLE memory_items DISABLE ROW LEVEL SECURITY')).rejects.toThrow(/must be owner/);
      await expect(db.exec('TRUNCATE memory_items')).rejects.toThrow(/permission denied/);
      await expect(db.exec('CREATE ROLE zz_outro')).rejects.toThrow(/permission denied/);
      await expect(db.exec('CREATE POLICY zz ON memory_items USING (true)')).rejects.toThrow(/must be owner/);
    });
  });
});

describe('RLS por pessoa (laift_memory_worker)', () => {
  beforeAll(async () => {
    await clear();
    await put({ subject_id: A, slug: 'farmacocinetica' });
    await put({ subject_id: A, slug: 'coagulacao' });
    await put({ subject_id: B, slug: 'farmacocinetica' });
  });
  const count = async () => (await db.query('SELECT count(*)::int AS n FROM memory_items')).rows[0].n;
  const setSubject = (s) => db.exec(`SELECT set_config('app.subject_id', '${s}', false)`);

  test('SEM app.subject_id nada é visível, nem para apagar', async () => {
    await asRole('laift_memory_worker', async () => {
      expect(await count()).toBe(0);
      expect((await db.query('DELETE FROM memory_items')).affectedRows).toBe(0);
    });
    expect((await db.query('SELECT count(*)::int AS n FROM memory_items')).rows[0].n).toBe(3);
  });

  test('a pessoa A vê só o que é dela; B não vê o de A', async () => {
    await asRole('laift_memory_worker', async () => {
      await setSubject(A);
      expect(await count()).toBe(2);
      await setSubject(B);
      expect(await count()).toBe(1);
      expect((await db.query("SELECT subject_id FROM memory_items")).rows.every((r) => r.subject_id === B)).toBe(true);
    });
  });

  test('A não grava nem altera nem apaga linha de B (mesmo com WHERE esquecido)', async () => {
    await asRole('laift_memory_worker', async () => {
      await setSubject(A);
      await expect(put({ subject_id: B, slug: 'toxicocinetica' })).rejects.toThrow(/row-level security/);
      expect((await db.query("UPDATE memory_items SET level = 1")).affectedRows).toBe(2);
      expect((await db.query('DELETE FROM memory_items WHERE true')).affectedRows).toBe(2);
    });
    await asRole('laift_memory_worker', async () => {
      await setSubject(B);
      expect(await count()).toBe(1);
    });
  });

  test('o modo de manutenção enxerga e apaga tudo, mas NÃO grava linha de pessoa nenhuma', async () => {
    await put({ subject_id: A, slug: 'coagulacao' });
    await asRole('laift_memory_worker', async () => {
      await db.exec("SELECT set_config('app.maintenance', 'on', false)");
      expect(await count()).toBe(2);
      await expect(put({ subject_id: A, slug: 'diureticos' })).rejects.toThrow(/row-level security/);
      expect((await db.query('DELETE FROM memory_items')).affectedRows).toBe(2);
    });
  });

  test('o dono do esquema (sem trocar de papel) é afetado pela FORCE RLS? só o papel de execução é o alvo do teste', async () => {
    const { rows } = await db.query("SELECT relforcerowsecurity FROM pg_class WHERE relname = 'memory_items'");
    expect(rows[0].relforcerowsecurity).toBe(true);
  });
});

describe('idempotência, ledger e volta', () => {
  test('reaplicar não duplica política, gatilho nem papel', async () => {
    const vectorExt = await loadVectorExtension();
    const text = readMemorySql('001_memory.sql');
    await db.exec(vectorExt ? text : adaptForNoVector(text));
    await db.exec(vectorExt ? text : adaptForNoVector(text));
    const pol = await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polrelid = 'memory_items'::regclass");
    const trg = await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'memory_items'::regclass AND NOT tgisinternal");
    const role = await db.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'laift_memory_worker'");
    expect([pol.rows[0].n, trg.rows[0].n, role.rows[0].n]).toEqual([1, 1, 1]);
  });

  test('o ledger próprio fica fora do alcance do papel de execução', async () => {
    await db.exec('CREATE TABLE memory_schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.exec("INSERT INTO memory_schema_migrations (name, hash) VALUES ('001_memory.sql', 'h'), ('002_outra.sql', 'h')");
    const vectorExt = await loadVectorExtension();
    const text = readMemorySql('001_memory.sql');
    await db.exec(vectorExt ? text : adaptForNoVector(text));
    await asRole('laift_memory_worker', async () => {
      await expect(db.query('SELECT * FROM memory_schema_migrations')).rejects.toThrow(/permission denied/);
    });
  });

  test('down: apaga a tabela e tira SÓ a própria linha do ledger; reaplicar recria tudo', async () => {
    await db.exec(readMemorySql('down/001_memory.sql'));
    expect((await db.query("SELECT to_regclass('public.memory_items') AS t")).rows[0].t).toBeNull();
    expect((await db.query('SELECT name FROM memory_schema_migrations')).rows.map((r) => r.name)).toEqual(['002_outra.sql']);
    const vectorExt = await loadVectorExtension();
    const text = readMemorySql('001_memory.sql');
    await db.exec(vectorExt ? text : adaptForNoVector(text));
    expect((await db.query("SELECT relforcerowsecurity AS f FROM pg_class WHERE relname = 'memory_items'")).rows[0].f).toBe(true);
  });

  test('o down deixa o papel (conexões abertas) e tolera o ledger ausente', async () => {
    await db.exec('DROP TABLE memory_schema_migrations');
    await db.exec(readMemorySql('down/001_memory.sql'));
    expect((await db.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'laift_memory_worker'")).rows[0].n).toBe(1);
  });
});
