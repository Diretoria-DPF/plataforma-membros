/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryAdminService (CONTRATO-B1 §3, §4.2, §7): sugestões, coleções, áreas e
 * equipe da Biblioteca, contra um Postgres real (PGlite) e um `fetchImpl`
 * falso com as fixtures de fixtures/library-upstream.json.
 * Quem usa: `npm test -- -i libraryAdminService`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Adm from '../src/services/libraryAdminService.js';
import { searchNorm } from '../src/library/normalize.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'library-upstream.json'), 'utf8'));
const PLOS = FIXTURE.plos;

const CID = '00000000-0000-4000-8000-0000000000c5';
const P_ADMIN = '11111111-1111-4111-8111-111111111111';
const P_CURADOR = '22222222-2222-4222-8222-222222222222';
const P_REVISOR = '33333333-3333-4333-8333-333333333333';
const P_MEMBRO = '44444444-4444-4444-8444-444444444444';
const P_BANIDO = '55555555-5555-4555-8555-555555555555';
const ABSENT = '99999999-9999-4999-8999-999999999999';
const ADMIN = { profileId: P_ADMIN, role: 'admin', fullName: 'Admin Teste' };
const CURADOR = { profileId: P_CURADOR, role: 'member', fullName: 'Dra. Curadora' };
const REVISOR = { profileId: P_REVISOR, role: 'member', fullName: 'Prof. Revisor' };
const MEMBRO = { profileId: P_MEMBRO, role: 'member', fullName: 'Membro Comum' };
const FORBIDDEN = 'Acesso não autorizado para este recurso.';

let db;
let sql;
let env;
let seq = 0;

/** Respostas falsas por host, com as fixtures. */
function upstream(sample) {
  const calls = [];
  const bodies = {
    'api.crossref.org': sample.crossref,
    'www.ebi.ac.uk': sample.europepmc,
    'api.openalex.org': sample.openalex,
    'eutils.ncbi.nlm.nih.gov': sample.pubmed,
    'api.unpaywall.org': sample.unpaywall,
  };
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const body = bodies[new URL(url).hostname];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

/** Insere um artigo direto no banco. */
async function seed(over = {}) {
  seq += 1;
  const status = over.status ?? 'publicado';
  const row = {
    doi: `10.1000/adm${seq}`,
    title: `Artigo de administração ${seq}`,
    authors: [{ family: 'Silva', given: 'Ana' }],
    author_count: 1,
    journal: 'Revista de Teste',
    pub_year: 2020,
    topics: ['toxicologia'],
    status,
    ...(status === 'publicado' || status === 'aprovado' ? { approved_at: new Date('2026-01-01T00:00:00Z'), approver_name: 'Dra. Curadora' } : {}),
    ...(status === 'publicado' ? { published_at: new Date('2026-02-01T00:00:00Z') } : {}),
    ...over,
  };
  row.landing_url = `https://doi.org/${row.doi}`;
  row.search_norm = searchNorm({ title: row.title, authors: row.authors, journal: row.journal, doi: row.doi });
  const cols = Object.keys(row);
  const values = cols.map((c) => (c === 'authors' ? JSON.stringify(row[c]) : row[c]));
  const marks = cols.map((c, i) => (c === 'authors' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const res = await db.query(`INSERT INTO library_articles (${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`, values);
  return res.rows[0].id;
}

async function seedSuggestion(identifier, { kind = 'doi', by = P_MEMBRO, note = null } = {}) {
  const res = await db.query(
    'INSERT INTO library_suggestions (profile_id, identifier_kind, identifier, note) VALUES ($1, $2, $3, $4) RETURNING id',
    [by, kind, identifier, note]);
  return res.rows[0].id;
}

async function one(text, params = []) {
  const res = await db.query(text, params);
  return res.rows[0];
}

async function auditOf(action) {
  const res = await db.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at', [action]);
  return res.rows;
}

async function itemsOf(collectionId) {
  const res = await db.query(
    'SELECT article_id, position FROM library_collection_items WHERE collection_id = $1 ORDER BY position', [collectionId]);
  return res.rows.map((r) => [r.article_id, r.position]);
}

async function expectError(promise, name, message) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).not.toBeNull();
  expect(err.name).toBe(name);
  if (message) expect(err.message).toBe(message);
  return err;
}

const decide = (identity, input, fake) =>
  Adm.decideSuggestion(sql, env, identity, input, CID, { fetchImpl: fake?.fetchImpl });
const saveCol = (identity, input) => Adm.saveCollection(sql, identity, input, CID);
const setStaff = (identity, input) => Adm.setStaff(sql, identity, input, CID);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  env = makeEnv();
  await db.exec('TRUNCATE library_staff, library_suggestions, library_favorites, library_collection_items, library_collections, library_articles, audit_logs, rate_limit_buckets');
  await db.exec("DELETE FROM library_topics WHERE slug NOT IN ('farmacologia-clinica', 'toxicologia')");
  const people = [
    [P_ADMIN, 'admin', 'admin', 'admin', 'active'], [P_CURADOR, 'member', 'curadora', 'curadora', 'active'],
    [P_REVISOR, 'member', 'revisor', 'revisor', 'active'], [P_MEMBRO, 'member', 'membro', 'membro', 'active'],
    [P_BANIDO, 'member', 'banido', 'banido', 'banned'],
  ];
  for (const [id, role, name, , status] of people) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, status) VALUES ($1, $2, $3, $4, 'x', '11999990000', $5, $6) ON CONFLICT (id) DO NOTHING`,
      [id, `Pessoa ${name}`, name, `${name}@exemplo.com`, role, status],
    );
  }
  await db.query(`INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador'), ($2, 'revisor_clinico')`, [P_CURADOR, P_REVISOR]);
});

describe('papéis', () => {
  test('membro e revisor são recusados nas funções de curadoria', async () => {
    const calls = [
      Adm.listSuggestions(sql, MEMBRO, {}),
      Adm.listCollections(sql, REVISOR),
      saveCol(MEMBRO, { slug: 'abc', title: 'Coleção', status: 'rascunho', articleIds: [] }),
      Adm.saveTopic(sql, REVISOR, { slug: 'abc', name: 'Área' }, CID),
      decide(MEMBRO, { id: ABSENT, decision: 'recusar', reason: 'motivo' }),
    ];
    for (const call of calls) await expectError(call, 'ForbiddenError', FORBIDDEN);
  });
});

describe('sugestões', () => {
  test('lista sem nome nem e-mail de quem sugeriu, filtra por estado e pagina', async () => {
    await seedSuggestion('10.1000/s1', { note: 'bom artigo' });
    await seedSuggestion('1234', { kind: 'pmid' });
    const done = await seedSuggestion('10.1000/s3');
    await db.query("UPDATE library_suggestions SET status = 'recusado', decided_at = now(), decision_reason = 'fora do tema' WHERE id = $1", [done]);
    const res = await Adm.listSuggestions(sql, CURADOR, {});
    expect(res.success).toBe(true);
    expect(res.total).toBe(2);
    expect(res.items.map((i) => i.status)).toEqual(['sugerido', 'sugerido']);
    expect(Object.keys(res.items[0]).sort()).toEqual(
      ['articleId', 'createdAt', 'decidedAt', 'decisionReason', 'id', 'identifier', 'identifierKind', 'note', 'status']);
    const text = JSON.stringify(res);
    expect(text).not.toContain('exemplo.com');
    expect(text).not.toContain('Pessoa');
    expect(text).not.toContain(P_MEMBRO);
    const refused = await Adm.listSuggestions(sql, ADMIN, { status: 'recusado' });
    expect(refused.total).toBe(1);
    expect(refused.items[0].decisionReason).toBe('fora do tema');
    await expectError(Adm.listSuggestions(sql, ADMIN, { status: 'qualquer' }), 'ValidationError');
  });

  test('aceitar cadastra o artigo e marca aceito com article_id', async () => {
    const id = await seedSuggestion(PLOS.doi);
    const fake = upstream(PLOS);
    const res = await decide(CURADOR, { id, decision: 'aceitar' }, fake);
    expect(res.success).toBe(true);
    expect(res.article).toMatchObject({ doi: PLOS.doi, status: 'em_triagem' });
    expect(res.suggestion).toMatchObject({ id, status: 'aceito', articleId: res.article.id });
    const saved = await one('SELECT * FROM library_suggestions WHERE id = $1', [id]);
    expect(saved).toMatchObject({ status: 'aceito', article_id: res.article.id, decided_by: P_CURADOR });
    expect(saved.decided_at).not.toBeNull();
    expect(fake.calls.length).toBeGreaterThan(0);
    const audit = await auditOf('LIBRARY_SUGGESTION_DECIDE');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: P_CURADOR, target_type: 'library_suggestion', target_id: id, result: 'success' });
    expect(audit[0].details).toEqual({ decision: 'aceitar', result: 'aceito' });
  });

  test('aceitar por PMID cadastra pelo PMID', async () => {
    const id = await seedSuggestion(PLOS.pmid, { kind: 'pmid' });
    const res = await decide(ADMIN, { id, decision: 'aceitar' }, upstream(PLOS));
    expect(res.suggestion.status).toBe('aceito');
    expect(res.article.pmid).toBe(PLOS.pmid);
  });

  test('aceitar DOI já cadastrado marca duplicado sem chamar fetch', async () => {
    const articleId = await seed({ doi: '10.5555/ja-existe', status: 'em_triagem' });
    const id = await seedSuggestion('10.5555/ja-existe');
    const fake = upstream(PLOS);
    const res = await decide(ADMIN, { id, decision: 'aceitar' }, fake);
    expect(res.suggestion).toMatchObject({ status: 'duplicado', articleId });
    expect(res.article).toBeUndefined();
    expect(fake.calls).toHaveLength(0);
    const saved = await one('SELECT status, article_id FROM library_suggestions WHERE id = $1', [id]);
    expect(saved).toEqual({ status: 'duplicado', article_id: articleId });
    expect((await auditOf('LIBRARY_SUGGESTION_DECIDE'))[0].details).toEqual({ decision: 'aceitar', result: 'duplicado' });
  });

  test('falha ao obter os dados mantém a sugestão pendente', async () => {
    const id = await seedSuggestion('10.1000/sem-fonte');
    const fetchImpl = async () => new Response('{}', { status: 404 });
    await expectError(Adm.decideSuggestion(sql, env, ADMIN, { id, decision: 'aceitar' }, CID, { fetchImpl }), 'ValidationError');
    expect((await one('SELECT status FROM library_suggestions WHERE id = $1', [id])).status).toBe('sugerido');
    expect(await auditOf('LIBRARY_SUGGESTION_DECIDE')).toHaveLength(0);
  });

  test('recusar exige motivo de 3 a 300 caracteres', async () => {
    const id = await seedSuggestion('10.1000/recusa');
    const fake = upstream(PLOS);
    for (const reason of [undefined, '', 'ab', 'x'.repeat(301), 'com\u0007controle']) {
      await expectError(decide(ADMIN, { id, decision: 'recusar', reason }, fake), 'ValidationError');
    }
    expect((await one('SELECT status FROM library_suggestions WHERE id = $1', [id])).status).toBe('sugerido');
    const res = await decide(ADMIN, { id, decision: 'recusar', reason: '  Fora do escopo  ' }, fake);
    expect(res.suggestion).toMatchObject({ id, status: 'recusado', decisionReason: 'Fora do escopo' });
    expect(fake.calls).toHaveLength(0);
    const saved = await one('SELECT * FROM library_suggestions WHERE id = $1', [id]);
    expect(saved).toMatchObject({ status: 'recusado', decision_reason: 'Fora do escopo', decided_by: P_ADMIN });
    expect((await auditOf('LIBRARY_SUGGESTION_DECIDE'))[0].details).toEqual({ decision: 'recusar', result: 'recusado' });
    expect(JSON.stringify((await auditOf('LIBRARY_SUGGESTION_DECIDE'))[0].details)).not.toContain('escopo');
  });

  test('id inválido, decisão inválida, inexistente e já decidida', async () => {
    const id = await seedSuggestion('10.1000/decidida');
    await decide(ADMIN, { id, decision: 'recusar', reason: 'sem relação' });
    await expectError(decide(ADMIN, { id: 'x', decision: 'recusar', reason: 'motivo' }), 'ValidationError', 'Sugestão inválida.');
    await expectError(decide(ADMIN, { id, decision: 'talvez' }), 'ValidationError', 'Decisão inválida.');
    await expectError(decide(ADMIN, { id: ABSENT, decision: 'recusar', reason: 'motivo' }), 'NotFoundError', 'Sugestão não encontrada.');
    await expectError(decide(ADMIN, { id, decision: 'recusar', reason: 'motivo' }), 'ConflictError', 'Esta sugestão já foi decidida.');
  });
});

describe('coleções', () => {
  test('cria com 3 artigos e depois salva com 2 numa instrução só, sem perder item', async () => {
    const [a, b, c, d] = [await seed(), await seed(), await seed(), await seed()];
    const created = await saveCol(CURADOR, { slug: 'toxicologia-basica', title: 'Toxicologia básica', description: 'Leituras iniciais', status: 'publicada', sortOrder: 2, articleIds: [c, a, b] });
    expect(created.success).toBe(true);
    expect(created.collection).toMatchObject({ slug: 'toxicologia-basica', title: 'Toxicologia básica', status: 'publicada', sortOrder: 2, version: 1, articleIds: [c, a, b] });
    expect(await itemsOf(created.collection.id)).toEqual([[c, 0], [a, 1], [b, 2]]);

    const next = await saveCol(CURADOR, { id: created.collection.id, version: 1, slug: 'toxicologia-basica', title: 'Toxicologia básica', status: 'publicada', articleIds: [d, c] });
    expect(next.collection).toMatchObject({ version: 2, articleIds: [d, c], description: null });
    expect(await itemsOf(created.collection.id)).toEqual([[d, 0], [c, 1]]);

    const listed = await Adm.listCollections(sql, ADMIN);
    expect(listed.collections).toHaveLength(1);
    expect(listed.collections[0]).toMatchObject({ id: created.collection.id, version: 2, articleIds: [d, c], status: 'publicada' });
    expect((await auditOf('LIBRARY_COLLECTION_SAVE'))).toHaveLength(2);
  });

  test('mudar só a ordem mantém todos os itens; lista vazia esvazia; repetido conta uma vez', async () => {
    const [a, b] = [await seed(), await seed()];
    const col = (await saveCol(ADMIN, { slug: 'ordem', title: 'Ordem', status: 'rascunho', articleIds: [a, b] })).collection;
    const flipped = await saveCol(ADMIN, { id: col.id, version: 1, slug: 'ordem', title: 'Ordem', status: 'rascunho', articleIds: [b, a, b] });
    expect(flipped.collection.articleIds).toEqual([b, a]);
    expect(await itemsOf(col.id)).toEqual([[b, 0], [a, 1]]);
    const empty = await saveCol(ADMIN, { id: col.id, version: 2, slug: 'ordem', title: 'Ordem', status: 'rascunho', articleIds: [] });
    expect(empty.collection.articleIds).toEqual([]);
    expect(await itemsOf(col.id)).toEqual([]);
  });

  test('artigo não publicado ou inexistente é recusado e nada é gravado', async () => {
    const ok = await seed();
    const triagem = await seed({ status: 'em_triagem' });
    await expectError(saveCol(ADMIN, { slug: 'x-um', title: 'Coleção X', status: 'rascunho', articleIds: [ok, triagem] }),
      'ValidationError', 'Só artigos publicados podem entrar na coleção.');
    await expectError(saveCol(ADMIN, { slug: 'x-um', title: 'Coleção X', status: 'rascunho', articleIds: [ABSENT] }), 'ValidationError');
    expect((await one('SELECT count(*)::int AS n FROM library_collections')).n).toBe(0);
  });

  test('version velha vira conflito com code version_conflict e não mexe nos itens', async () => {
    const [a, b] = [await seed(), await seed()];
    const col = (await saveCol(ADMIN, { slug: 'versao', title: 'Versão', status: 'rascunho', articleIds: [a] })).collection;
    await saveCol(ADMIN, { id: col.id, version: 1, slug: 'versao', title: 'Versão 2', status: 'rascunho', articleIds: [a, b] });
    const err = await expectError(saveCol(ADMIN, { id: col.id, version: 1, slug: 'versao', title: 'Velha', status: 'rascunho', articleIds: [b] }), 'ConflictError');
    expect(err.payload).toEqual({ code: 'version_conflict' });
    expect(await itemsOf(col.id)).toEqual([[a, 0], [b, 1]]);
    expect((await one('SELECT title FROM library_collections WHERE id = $1', [col.id])).title).toBe('Versão 2');
    await expectError(saveCol(ADMIN, { id: ABSENT, version: 1, slug: 'nada', title: 'Nada aqui', status: 'rascunho', articleIds: [] }), 'NotFoundError', 'Coleção não encontrada.');
    await expectError(saveCol(ADMIN, { id: col.id, slug: 'versao', title: 'Sem versão', status: 'rascunho', articleIds: [] }), 'ValidationError');
  });

  test('slug repetido vira conflito; entradas inválidas são recusadas', async () => {
    await saveCol(ADMIN, { slug: 'repetido', title: 'Primeira', status: 'rascunho', articleIds: [] });
    await expectError(saveCol(ADMIN, { slug: 'repetido', title: 'Segunda', status: 'rascunho', articleIds: [] }),
      'ConflictError', 'Já existe uma coleção com este endereço.');
    const base = { slug: 'valida', title: 'Válida', status: 'rascunho', articleIds: [] };
    const bad = [
      { ...base, slug: 'Slug Ruim' }, { ...base, slug: 'a' }, { ...base, title: 'ab' }, { ...base, title: 'x'.repeat(121) },
      { ...base, description: 'd'.repeat(601) }, { ...base, status: 'publicado' }, { ...base, articleIds: 'nope' },
      { ...base, articleIds: ['nao-uuid'] }, { ...base, articleIds: Array.from({ length: 201 }, () => ABSENT) },
      { ...base, sortOrder: -1 }, { ...base, sortOrder: 1.5 },
    ];
    for (const input of bad) await expectError(saveCol(ADMIN, input), 'ValidationError');
  });
});

describe('áreas', () => {
  test('upsert por slug cria e atualiza; auditoria com target_id nulo e slug em details', async () => {
    const created = await Adm.saveTopic(sql, CURADOR, { slug: 'imunologia', name: 'Imunologia', sortOrder: 5 }, CID);
    expect(created).toMatchObject({ success: true, topic: { slug: 'imunologia', name: 'Imunologia', sortOrder: 5 } });
    const renamed = await Adm.saveTopic(sql, ADMIN, { slug: 'imunologia', name: 'Imunologia clínica' }, CID);
    expect(renamed.topic).toMatchObject({ name: 'Imunologia clínica', sortOrder: 5 });
    expect((await one("SELECT count(*)::int AS n FROM library_topics WHERE slug = 'imunologia'")).n).toBe(1);
    const audit = await auditOf('LIBRARY_TOPIC_SAVE');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actor_id: P_CURADOR, target_id: null, result: 'success' });
    expect(audit[0].details).toEqual({ slug: 'imunologia' });
  });

  test('slug e nome inválidos são recusados', async () => {
    const bad = [
      { slug: 'Imunologia', name: 'Nome' }, { slug: 'a', name: 'Nome' }, { slug: 'com espaço', name: 'Nome' },
      { slug: 'x'.repeat(41), name: 'Nome' }, { slug: 'valido', name: 'n' }, { slug: 'valido', name: 'n'.repeat(61) },
      { slug: 'valido', name: 'Nome', sortOrder: 'a' }, { slug: '-ruim-', name: 'Nome' }, { name: 'Sem slug' },
    ];
    for (const input of bad) await expectError(Adm.saveTopic(sql, ADMIN, input, CID), 'ValidationError');
    expect(await auditOf('LIBRARY_TOPIC_SAVE')).toHaveLength(0);
  });
});

describe('equipe', () => {
  test('só admin lista e altera; curador e revisor são recusados', async () => {
    for (const who of [CURADOR, REVISOR, MEMBRO]) {
      await expectError(Adm.listStaff(sql, who), 'ForbiddenError', FORBIDDEN);
      await expectError(setStaff(who, { email: 'membro@exemplo.com', role: 'curador', grant: true }), 'ForbiddenError', FORBIDDEN);
    }
    const res = await Adm.listStaff(sql, ADMIN);
    expect(res.staff.map((s) => [s.profileId, s.role, s.fullName]).sort()).toEqual([
      [P_CURADOR, 'curador', 'Pessoa curadora'], [P_REVISOR, 'revisor_clinico', 'Pessoa revisor']].sort());
    expect(Object.keys(res.staff[0]).sort()).toEqual(['fullName', 'grantedAt', 'profileId', 'role']);
  });

  test('dar acesso devolve a lista, é idempotente e audita sem e-mail', async () => {
    const res = await setStaff(ADMIN, { email: ' MEMBRO@exemplo.com ', role: 'curador', grant: true });
    expect(res.success).toBe(true);
    expect(res.staff.map((s) => [s.profileId, s.role])).toContainEqual([P_MEMBRO, 'curador']);
    await setStaff(ADMIN, { email: 'membro@exemplo.com', role: 'curador', grant: true });
    expect((await one('SELECT count(*)::int AS n FROM library_staff WHERE profile_id = $1', [P_MEMBRO])).n).toBe(1);
    expect((await one('SELECT granted_by FROM library_staff WHERE profile_id = $1', [P_MEMBRO])).granted_by).toBe(P_ADMIN);
    const audit = await auditOf('LIBRARY_STAFF_SET');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actor_id: P_ADMIN, target_type: 'library_staff', target_id: P_MEMBRO, result: 'success' });
    expect(audit[0].details).toEqual({ role: 'curador', grant: true });
    expect(JSON.stringify(audit)).not.toContain('@');
  });

  test('tirar acesso duas vezes não falha', async () => {
    const first = await setStaff(ADMIN, { email: 'curadora@exemplo.com', role: 'curador', grant: false });
    expect(first.staff.map((s) => s.profileId)).toEqual([P_REVISOR]);
    const second = await setStaff(ADMIN, { email: 'curadora@exemplo.com', role: 'curador', grant: false });
    expect(second.success).toBe(true);
    expect((await auditOf('LIBRARY_STAFF_SET')).map((a) => a.details)).toEqual([
      { role: 'curador', grant: false }, { role: 'curador', grant: false }]);
  });

  test('e-mail sem conta ativa vira NotFoundError; conta banida só perde acesso', async () => {
    await expectError(setStaff(ADMIN, { email: 'ninguem@exemplo.com', role: 'curador', grant: true }), 'NotFoundError', 'Pessoa não encontrada.');
    await expectError(setStaff(ADMIN, { email: 'banido@exemplo.com', role: 'curador', grant: true }), 'NotFoundError', 'Pessoa não encontrada.');
    await db.query("INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador')", [P_BANIDO]);
    await setStaff(ADMIN, { email: 'banido@exemplo.com', role: 'curador', grant: false });
    expect((await one('SELECT count(*)::int AS n FROM library_staff WHERE profile_id = $1', [P_BANIDO])).n).toBe(0);
  });

  test('entrada inválida é recusada', async () => {
    const bad = [
      { email: 'nao-e-email', role: 'curador', grant: true }, { email: 'membro@exemplo.com', role: 'admin', grant: true },
      { email: 'membro@exemplo.com', role: 'curador', grant: 'sim' }, { email: 'membro@exemplo.com', role: 'curador' }, {},
    ];
    for (const input of bad) await expectError(setStaff(ADMIN, input), 'ValidationError');
  });
});
