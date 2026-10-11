/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Migração 029 (Biblioteca LAIFT) contra um Postgres real (PGlite com todas as
 * migrações): tabelas, sementes, flags desligadas, cada CHECK do CONTRATO-B1 §1
 * e a volta (sql/down/029_library.sql, §1.1).
 * Quem usa: `npm test`; o contrato é docs/cortex/CONTRATO-B1.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const UP = fs.readFileSync(path.join(SQL_ROOT, '029_library.sql'), 'utf8');
const DOWN = fs.readFileSync(path.join(SQL_ROOT, 'down', '029_library.sql'), 'utf8');

const TABLES = [
  'library_topics', 'library_articles', 'library_favorites', 'library_collections',
  'library_collection_items', 'library_suggestions', 'library_staff',
];
const FLAGS = ['library_enabled', 'library_member_suggest', 'library_ai_summary', 'lia_library_enabled'];
const PROFILE = '11111111-1111-4111-8111-111111111111';
const REVIEWER = '22222222-2222-4222-8222-222222222222';
const T0 = "'2026-01-01T00:00:00Z'";
const T1 = "'2026-02-01T00:00:00Z'";

let seq = 0;
/** Gera um INSERT de artigo; `over` troca ou acrescenta colunas (valores já são literais SQL). */
function articleSql(over = {}) {
  seq += 1;
  const row = {
    doi: `'10.1000/teste${seq}'`,
    title: "'Titulo de teste'",
    landing_url: `'https://doi.org/10.1000/teste${seq}'`,
    search_norm: "'titulo de teste'",
    ...over,
  };
  const cols = Object.keys(row).filter((k) => row[k] !== undefined);
  return `INSERT INTO library_articles (${cols.join(', ')}) VALUES (${cols.map((k) => row[k]).join(', ')})`;
}

/** Colunas mínimas de um artigo já publicado (curador). */
const PUBLISHED = {
  status: "'publicado'",
  topics: "ARRAY['toxicologia']",
  approved_at: T0,
  approver_name: "'Dra. Curadora'",
  published_at: T1,
};

function loadProfile(db, id, name) {
  return db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role)
     VALUES ($1, $2, $3, $4, 'x', '11999990000', 'member') ON CONFLICT (id) DO NOTHING`,
    [id, name, `u${id.slice(0, 4)}`, `${id.slice(0, 4)}@exemplo.com`]
  );
}

describe('029_library.sql — SQL real (PGlite com as migrações)', () => {
  let db;
  const ok = async (over) => { await expect(db.exec(articleSql(over))).resolves.toBeDefined(); };
  // Recusa tem de vir de CHECK ou UNIQUE (não de erro de sintaxe nem de NOT NULL esquecido).
  const bad = async (over) => {
    await expect(db.exec(articleSql(over))).rejects.toThrow(/violates check constraint|duplicate key value/);
  };

  beforeAll(async () => { db = await createMigratedDb(); }, 60000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec('DELETE FROM library_articles');
    await db.exec('DELETE FROM library_suggestions');
  });

  test('as 7 tabelas existem', async () => {
    const { rows } = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'library\\_%'"
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TABLES].sort());
  });

  test('as 4 flags existem e nascem desligadas', async () => {
    const { rows } = await db.query('SELECT key, enabled FROM feature_flags WHERE key = ANY($1) ORDER BY key', [FLAGS]);
    expect(rows.map((r) => r.key).sort()).toEqual([...FLAGS].sort());
    expect(rows.every((r) => r.enabled === false)).toBe(true);
  });

  test('as 2 áreas iniciais existem', async () => {
    const { rows } = await db.query('SELECT slug FROM library_topics ORDER BY sort_order');
    expect(rows.map((r) => r.slug)).toEqual(['farmacologia-clinica', 'toxicologia']);
  });

  test('a 029 é idempotente (reaplicar não duplica nem falha)', async () => {
    await db.exec(UP);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM library_topics');
    expect(rows[0].n).toBe(2);
    const flags = await db.query('SELECT count(*)::int AS n FROM feature_flags WHERE key = ANY($1)', [FLAGS]);
    expect(flags.rows[0].n).toBe(4);
  });

  describe('identificadores', () => {
    test('aceita DOI minúsculo válido e recusa maiúsculo ou fora do regex', async () => {
      await ok({ doi: "'10.1234/abc-1'" });
      await bad({ doi: "'10.1234/ABC-1'" });
      await bad({ doi: "'11.1234/abc'" });
      await bad({ doi: "'10.12/abc'" });
      await bad({ doi: "'10.1234/ab c'" });
    });

    test('recusa DOI com segmento vazio, "." ou ".." (escape de caminho nas fontes)', async () => {
      for (const doi of ['10.1234/../../funders', '10.1234/..', '10.1234/.', '10.1234/a/./b', '10.1234/a//b', '10.1234//a', '10.1234/a/']) {
        await bad({ doi: `'${doi}'` });
      }
      await ok({ doi: "'10.1234/a.b/c..d/.e'" });
    });

    test('exige DOI ou PMID', async () => {
      await bad({ doi: undefined, pmid: undefined });
      await ok({ doi: undefined, pmid: "'123456'" });
    });

    test('PMID: só dígitos, sem zero à esquerda, até 10', async () => {
      await ok({ doi: undefined, pmid: "'9876543210'" });
      await bad({ doi: undefined, pmid: "'0123'" });
      await bad({ doi: undefined, pmid: "'12a'" });
      await bad({ doi: undefined, pmid: "'12345678901'" });
    });

    test('PMCID segue PMC + dígitos', async () => {
      await ok({ pmcid: "'PMC1234567'" });
      await bad({ pmcid: "'pmc123'" });
      await bad({ pmcid: "'PMC'" });
      await bad({ pmcid: "'PMC12ab'" });
    });

    test('DOI repetido e PMID repetido são recusados', async () => {
      await ok({ doi: "'10.5555/igual'", pmid: "'777'" });
      await bad({ doi: "'10.5555/igual'" });
      await bad({ doi: "'10.5555/outro'", pmid: "'777'" });
    });

    test('dois artigos só com DOI (pmid NULL) são aceitos', async () => {
      await ok({ doi: "'10.5555/a1'" });
      await ok({ doi: "'10.5555/a2'" });
    });
  });

  describe('campos e limites', () => {
    test('landing_url só em doi.org ou pubmed.ncbi.nlm.nih.gov, por https', async () => {
      await ok({ landing_url: "'https://doi.org/10.1000/x'" });
      await ok({ landing_url: "'https://pubmed.ncbi.nlm.nih.gov/123/'" });
      await bad({ landing_url: "'https://exemplo.com/10.1000/x'" });
      await bad({ landing_url: "'http://doi.org/10.1000/x'" });
      await bad({ landing_url: "'https://doi.org.evil.com/x'" });
    });

    test('autores: até 30 na linha e author_count coerente', async () => {
      const lista = (n) => `'${JSON.stringify(Array.from({ length: n }, (_, i) => ({ family: `F${i}`, given: 'G' })))}'::jsonb`;
      await ok({ authors: lista(30), author_count: 30 });
      await ok({ authors: lista(30), author_count: 120 });
      await bad({ authors: lista(31), author_count: 31 });
      await bad({ authors: lista(3), author_count: 2 });
      await bad({ authors: "'{}'::jsonb" });
    });

    test('título, ano, idioma, tipo, licença e fontes respeitam as listas', async () => {
      await bad({ title: "''" });
      await bad({ title: `'${'x'.repeat(501)}'` });
      await bad({ pub_year: '1700' });
      await bad({ language: "'por'" });
      await bad({ article_type: "'blog'" });
      await bad({ license: "'cc-by-xx'" });
      await bad({ oa_status: "'aberto'" });
      await bad({ metadata_sources: "ARRAY['google']" });
      await ok({ pub_year: '2024', language: "'pt'", article_type: "'meta_analise'", license: "'cc-by'", oa_status: "'gold'", metadata_sources: "ARRAY['crossref','pubmed']" });
    });

    test('no máximo 5 áreas, sem NULL', async () => {
      await ok({ topics: "ARRAY['a','b','c','d','e']" });
      await bad({ topics: "ARRAY['a','b','c','d','e','f']" });
      await bad({ topics: "ARRAY['a',NULL]" });
    });

    test('resumo tem tamanho máximo e origem junto com o texto', async () => {
      await bad({ summary_text: `'${'r'.repeat(1201)}'`, summary_origin: "'curador'", summary_updated_at: T0 });
      await bad({ summary_text: "'texto'", summary_updated_at: T0 });
      await bad({ summary_origin: "'curador'" });
      await bad({ summary_text: "'texto'", summary_origin: "'curador'" });
      await bad({ summary_text: "'texto'", summary_origin: "'robo'", summary_updated_at: T0 });
      await ok({ summary_text: "'texto'", summary_origin: "'curador'", summary_updated_at: T0 });
    });
  });

  describe('estados', () => {
    test('estado desconhecido é recusado', async () => {
      await bad({ status: "'sugerido'" });
    });

    test('aprovar exige área, approved_at e nome de quem aprovou', async () => {
      await ok({ status: "'aprovado'", topics: "ARRAY['toxicologia']", approved_at: T0, approver_name: "'Dra. Curadora'" });
      await bad({ status: "'aprovado'", approved_at: T0, approver_name: "'Dra. Curadora'" });
      await bad({ status: "'aprovado'", topics: "ARRAY['toxicologia']", approver_name: "'Dra. Curadora'" });
      await bad({ status: "'aprovado'", topics: "ARRAY['toxicologia']", approved_at: T0 });
    });

    test('publicar exige published_at', async () => {
      await ok(PUBLISHED);
      await bad({ ...PUBLISHED, published_at: undefined });
    });

    test('rejeitar ou remover exige motivo de 3 a 300 caracteres', async () => {
      await ok({ status: "'rejeitado'", status_reason: "'fora do escopo'" });
      await bad({ status: "'rejeitado'", status_reason: "'ab'" });
      await bad({ status: "'rejeitado'" });
      await bad({ status: "'removido'", status_reason: "'ab'" });
      await bad({ status: "'rejeitado'", status_reason: `'${'m'.repeat(301)}'` });
      await ok({ status: "'removido'", status_reason: "'retratado'" });
    });
  });

  describe('regras de resumo (decisões 3 e 11)', () => {
    const CLINICO = {
      ...PUBLISHED,
      is_clinical: 'TRUE',
      summary_text: "'Dose usual de 5 mg.'",
      summary_origin: "'curador'",
      summary_updated_at: T1,
    };

    test('clínico publicado com resumo e sem revisor é recusado', async () => {
      await bad(CLINICO);
    });

    test('clínico com revisão posterior ao resumo é aceito', async () => {
      await ok({ ...CLINICO, clinical_reviewer_name: "'Dr. Revisor'", clinical_reviewed_at: "'2026-03-01T00:00:00Z'" });
      await ok({ ...CLINICO, clinical_reviewer_name: "'Dr. Revisor'", clinical_reviewed_at: T1 });
    });

    test('revisão clínica ANTERIOR à última mudança do resumo é recusada', async () => {
      await bad({ ...CLINICO, clinical_reviewer_name: "'Dr. Revisor'", clinical_reviewed_at: T0 });
    });

    test('clínico sem resumo publica sem revisor; clínico em triagem não exige revisor', async () => {
      await ok({ ...PUBLISHED, is_clinical: 'TRUE' });
      await ok({ is_clinical: 'TRUE', summary_text: "'Dose de 5 mg.'", summary_origin: "'curador'", summary_updated_at: T1 });
    });

    test('resumo "ia" publicado sem revisão é recusado; com revisão posterior é aceito', async () => {
      const IA = { ...PUBLISHED, summary_text: "'Resumo gerado.'", summary_origin: "'ia'", summary_updated_at: T1 };
      await bad(IA);
      await bad({ ...IA, summary_reviewer_name: "'Dra. Curadora'", summary_reviewed_at: T0 });
      await ok({ ...IA, summary_reviewer_name: "'Dra. Curadora'", summary_reviewed_at: "'2026-03-01T00:00:00Z'" });
    });

    test('resumo "ia_editado" também exige revisão ao publicar', async () => {
      const ED = { ...PUBLISHED, summary_text: "'Resumo editado.'", summary_origin: "'ia_editado'", summary_updated_at: T1 };
      await bad(ED);
      await ok({ ...ED, summary_reviewer_name: "'Dra. Curadora'", summary_reviewed_at: T1 });
    });

    test('excluir o perfil do revisor de um artigo publicado não falha (SET NULL + nome em texto)', async () => {
      await loadProfile(db, REVIEWER, 'Dr. Revisor');
      await ok({
        ...PUBLISHED,
        is_clinical: 'TRUE',
        summary_text: "'Dose usual de 5 mg.'",
        summary_origin: "'curador'",
        summary_updated_at: T0,
        clinical_reviewer_name: "'Dr. Revisor'",
        clinical_reviewed_at: T1,
        clinical_reviewed_by: `'${REVIEWER}'`,
        approved_by: `'${REVIEWER}'`,
        created_by: `'${REVIEWER}'`,
      });
      await expect(db.query('DELETE FROM profiles WHERE id = $1', [REVIEWER])).resolves.toBeDefined();
      const { rows } = await db.query('SELECT clinical_reviewed_by, clinical_reviewer_name, status FROM library_articles WHERE title = $1', ['Titulo de teste']);
      expect(rows[0]).toEqual({ clinical_reviewed_by: null, clinical_reviewer_name: 'Dr. Revisor', status: 'publicado' });
    });
  });

  describe('outras tabelas', () => {
    test('slug de área e coleção segue o padrão e o status da coleção é fechado', async () => {
      await expect(db.exec("INSERT INTO library_topics (slug, name) VALUES ('Bad Slug', 'Nome')")).rejects.toThrow();
      await expect(db.exec("INSERT INTO library_topics (slug, name) VALUES ('ok-slug', 'N')")).rejects.toThrow();
      await expect(db.exec("INSERT INTO library_collections (slug, title, status) VALUES ('col-a', 'Coleção A', 'publicada')")).resolves.toBeDefined();
      await expect(db.exec("INSERT INTO library_collections (slug, title, status) VALUES ('col-b', 'Coleção B', 'oculta')")).rejects.toThrow();
      await db.exec("DELETE FROM library_collections WHERE slug = 'col-a'");
    });

    test('sugestão: DOI minúsculo ou PMID, única por membro e decidida junto com decided_at', async () => {
      await loadProfile(db, PROFILE, 'Maria Souza');
      const ins = (kind, id, extra = '') => db.query(
        `INSERT INTO library_suggestions (profile_id, identifier_kind, identifier ${extra ? ', ' + extra.cols : ''})
         VALUES ($1, $2, $3 ${extra ? ', ' + extra.vals : ''})`,
        [PROFILE, kind, id]
      );
      await expect(ins('doi', '10.1000/sug1')).resolves.toBeDefined();
      await expect(ins('doi', '10.1000/sug1')).rejects.toThrow();
      await expect(ins('doi', '10.1000/SUG2')).rejects.toThrow();
      await expect(ins('doi', '10.1000/../../funders')).rejects.toThrow();
      await expect(ins('doi', '10.1000/a//b')).rejects.toThrow();
      await expect(ins('pmid', '12345')).resolves.toBeDefined();
      await expect(ins('pmid', '0123')).rejects.toThrow();
      await expect(ins('isbn', '12345')).rejects.toThrow();
      await expect(ins('pmid', '555', { cols: 'status', vals: "'aceito'" })).rejects.toThrow();
      await expect(ins('pmid', '556', { cols: 'status, decided_at', vals: "'aceito', now()" })).resolves.toBeDefined();
    });

    test('equipe aceita só curador e revisor_clinico', async () => {
      await loadProfile(db, PROFILE, 'Maria Souza');
      await expect(db.query("INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador')", [PROFILE])).resolves.toBeDefined();
      await expect(db.query("INSERT INTO library_staff (profile_id, role) VALUES ($1, 'dono')", [PROFILE])).rejects.toThrow();
      await db.exec('DELETE FROM library_staff');
    });
  });
});

describe('sql/down/029_library.sql', () => {
  let db;

  beforeAll(async () => { db = await createMigratedDb(); }, 60000);
  afterAll(async () => { await db.close(); });

  test('sem artigos, desfaz tudo e a 029 pode ser reaplicada', async () => {
    await db.exec(DOWN);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name LIKE 'library\\_%'");
    expect(rows[0].n).toBe(0);
    const flags = await db.query('SELECT count(*)::int AS n FROM feature_flags WHERE key = ANY($1)', [FLAGS]);
    expect(flags.rows[0].n).toBe(0);
    await db.exec(UP);
    const topics = await db.query('SELECT count(*)::int AS n FROM library_topics');
    expect(topics.rows[0].n).toBe(2);
  });

  test('com artigo e sem a trava aberta, a volta recusa e nada é apagado', async () => {
    await db.exec(articleSql());
    await expect(db.exec(DOWN)).rejects.toThrow(/allow_library_drop/);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM library_articles');
    expect(rows[0].n).toBe(1);
  });

  test('com SET laift.allow_library_drop = on, apaga tudo e reaplicar a 029 funciona', async () => {
    await db.exec("SET laift.allow_library_drop = 'on'");
    try {
      await db.exec(DOWN);
    } finally {
      await db.exec('RESET laift.allow_library_drop');
    }
    const { rows } = await db.query("SELECT to_regclass('public.library_articles')::text AS reg");
    expect(rows[0].reg).toBeNull();
    await db.exec(UP);
    const art = await db.query('SELECT count(*)::int AS n FROM library_articles');
    expect(art.rows[0].n).toBe(0);
    const flags = await db.query('SELECT enabled FROM feature_flags WHERE key = ANY($1)', [FLAGS]);
    expect(flags.rows).toHaveLength(4);
    expect(flags.rows.every((r) => r.enabled === false)).toBe(true);
  });
});
