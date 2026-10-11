/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryService (CONTRATO-B1 §4.1): serviço do membro e catálogo público,
 * contra um Postgres real (PGlite com as migrações). Os artigos entram direto
 * por SQL. Quem usa: `npm test -- -i libraryService`.
 */
import * as Lib from '../src/services/libraryService.js';
import { searchNorm } from '../src/library/normalize.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000b3';
const P_VISITOR = '11111111-1111-4111-8111-111111111111';
const P_MEMBER = '22222222-2222-4222-8222-222222222222';
const P_OTHER = '33333333-3333-4333-8333-333333333333';
const VISITOR = { profileId: P_VISITOR, role: 'visitor' };
const MEMBER = { profileId: P_MEMBER, role: 'member' };
const OTHER = { profileId: P_OTHER, role: 'member' };
const ABSENT = '99999999-9999-4999-8999-999999999999';
const DISABLED = { success: false, disabled: true, message: 'A Biblioteca ainda não está disponível.' };
const RATE_MSG = 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';

let db;
let sql;
let env;
let seq = 0;

async function setFlag(key, enabled) {
  await db.query('UPDATE feature_flags SET enabled = $2 WHERE key = $1', [key, enabled]);
  __resetFlagCacheForTests();
}

/** Insere um artigo (publicado por padrão). `over` troca colunas; `authors` entra em search_norm. */
async function addArticle(over = {}) {
  seq += 1;
  const published = over.status === undefined || over.status === 'publicado';
  const row = {
    doi: `10.1000/lib${seq}`,
    title: `Artigo ${seq}`,
    authors: [{ family: 'Silva', given: 'Ana' }],
    author_count: 1,
    journal: 'Revista de Teste',
    pub_year: 2020,
    article_type: 'artigo',
    topics: ['toxicologia'],
    license: 'cc-by',
    oa_status: 'gold',
    status: 'publicado',
    ...(published ? { approved_at: new Date('2026-01-01T00:00:00Z'), approver_name: 'Dra. Curadora', published_at: new Date('2026-02-01T00:00:00Z') } : {}),
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

async function addCollection(slug, status, articleIds, sortOrder = 0) {
  const c = await db.query(
    'INSERT INTO library_collections (slug, title, description, status, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [slug, `Coleção ${slug}`, 'Descrição', status, sortOrder],
  );
  for (const [i, id] of articleIds.entries()) {
    await db.query('INSERT INTO library_collection_items (collection_id, article_id, position) VALUES ($1, $2, $3)', [c.rows[0].id, id, i]);
  }
  return c.rows[0].id;
}

async function expectError(promise, name, message) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).not.toBeNull();
  expect(err.name).toBe(name);
  if (message) expect(err.message).toBe(message);
}

function fakeCache() {
  const store = new Map();
  return {
    store,
    match: async (key) => (store.has(String(key)) ? new Response(store.get(String(key))) : undefined),
    put: async (key, res) => { store.set(String(key), await res.text()); },
  };
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  env = makeEnv();
  await db.exec('TRUNCATE library_suggestions, library_favorites, library_collection_items, library_collections, library_articles, audit_logs, rate_limit_buckets');
  for (const [id, role, name] of [[P_VISITOR, 'visitor', 'visitante'], [P_MEMBER, 'member', 'membro'], [P_OTHER, 'member', 'outro']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, 'x', '11999990000', $5) ON CONFLICT (id) DO NOTHING`,
      [id, `Pessoa ${name}`, name, `${name}@exemplo.com`, role],
    );
  }
  await setFlag('library_enabled', true);
  await setFlag('library_member_suggest', true);
});

describe('flag fechada', () => {
  beforeEach(async () => { await setFlag('library_enabled', false); });

  test('as funções do membro respondem "disabled" sem tocar nos dados', async () => {
    const id = await addArticle();
    expect(await Lib.search(sql, MEMBER, {})).toEqual(DISABLED);
    expect(await Lib.getArticle(sql, MEMBER, { id })).toEqual(DISABLED);
    expect(await Lib.setFavorite(sql, MEMBER, { id, favorite: true })).toEqual(DISABLED);
    expect(await Lib.listFavorites(sql, MEMBER, {})).toEqual(DISABLED);
    expect(await Lib.listCollections(sql, MEMBER)).toEqual(DISABLED);
    expect(await Lib.getCollection(sql, MEMBER, { id })).toEqual(DISABLED);
    expect(await Lib.suggest(sql, env, MEMBER, { identifier: '10.1000/x1' }, CID)).toEqual(DISABLED);
    const fav = await db.query('SELECT count(*)::int AS n FROM library_favorites');
    expect(fav.rows[0].n).toBe(0);
  });

  test('o catálogo público responde vazio e não grava no cache', async () => {
    await addArticle();
    const cache = fakeCache();
    const res = await Lib.publicCatalog(sql, env, { cache });
    expect(res).toEqual({ success: true, enabled: false, topics: [], items: [] });
    expect(cache.store.size).toBe(0);
  });

  test('sem a linha da flag (falha fechada): também fechado', async () => {
    await db.query("DELETE FROM feature_flags WHERE key = 'library_enabled'");
    __resetFlagCacheForTests();
    expect(await Lib.search(sql, MEMBER, {})).toEqual(DISABLED);
    await db.query("INSERT INTO feature_flags (key, enabled, description) VALUES ('library_enabled', FALSE, 'x')");
  });

  test('suggest com library_member_suggest desligada: disabled com texto próprio', async () => {
    await setFlag('library_enabled', true);
    await setFlag('library_member_suggest', false);
    const res = await Lib.suggest(sql, env, MEMBER, { identifier: '10.1000/x1' }, CID);
    expect(res).toMatchObject({ success: false, disabled: true });
  });
});

describe('search', () => {
  test('só artigos publicados aparecem', async () => {
    await addArticle({ title: 'Publicado um' });
    await addArticle({ title: 'Aprovado dois', status: 'aprovado', approved_at: new Date(), approver_name: 'X' });
    await addArticle({ title: 'Triagem tres', status: 'em_triagem' });
    await addArticle({ title: 'Removido quatro', status: 'removido', status_reason: 'motivo claro' });
    const res = await Lib.search(sql, MEMBER, {});
    expect(res.success).toBe(true);
    expect(res.total).toBe(1);
    expect(res.items.map((i) => i.title)).toEqual(['Publicado um']);
  });

  test('o formato do item segue ListItem e não vaza campos internos', async () => {
    await addArticle({ title: 'Formato', summary_text: 'Resumo do curador', summary_origin: 'curador', summary_updated_at: new Date('2026-01-15T00:00:00Z'), pmid: '123' });
    const { items, topics } = await Lib.search(sql, MEMBER, {});
    expect(Object.keys(items[0]).sort()).toEqual([
      'authorCount', 'authors', 'doi', 'hasSummary', 'id', 'isFavorite', 'journal', 'landingUrl', 'language', 'license',
      'openAccess', 'pmid', 'publishedAt', 'topics', 'title', 'type', 'year',
    ].sort());
    expect(items[0]).toMatchObject({ title: 'Formato', year: 2020, type: 'artigo', openAccess: true, hasSummary: true, isFavorite: false, pmid: '123' });
    expect(topics.map((t) => t.slug)).toEqual(['farmacologia-clinica', 'toxicologia']);
  });

  test('"varfarina" acha "Varfarína" no título (sem acento, sem maiúsculas)', async () => {
    await addArticle({ title: 'Interação da Varfarína com antibióticos' });
    await addArticle({ title: 'Outro assunto' });
    const res = await Lib.search(sql, MEMBER, { q: 'VARFARINA' });
    expect(res.items.map((i) => i.title)).toEqual(['Interação da Varfarína com antibióticos']);
  });

  test('dois termos fazem AND; autor e revista também são pesquisáveis', async () => {
    await addArticle({ title: 'Varfarina em idosos', authors: [{ family: 'Oliveira', given: 'Rui' }] });
    await addArticle({ title: 'Varfarina em crianças', authors: [{ family: 'Souza', given: 'Eva' }] });
    expect((await Lib.search(sql, MEMBER, { q: 'varfarina' })).total).toBe(2);
    expect((await Lib.search(sql, MEMBER, { q: 'varfarina idosos' })).total).toBe(1);
    expect((await Lib.search(sql, MEMBER, { q: 'varfarina oliveira' })).total).toBe(1);
    expect((await Lib.search(sql, MEMBER, { q: 'varfarina inexistente' })).total).toBe(0);
  });

  test('termo com curinga do LIKE não casa tudo', async () => {
    await addArticle({ title: 'Qualquer coisa' });
    expect((await Lib.search(sql, MEMBER, { q: '%' })).total).toBe(1); // sobra nada: sem filtro
    expect((await Lib.search(sql, MEMBER, { q: 'qua_quer' })).total).toBe(1); // "_" vira espaço: dois termos de 3 letras
  });

  test('filtros combinados: área, tipo, anos e acesso aberto', async () => {
    await addArticle({ title: 'A', topics: ['toxicologia'], article_type: 'revisao', pub_year: 2018, oa_status: 'gold' });
    await addArticle({ title: 'B', topics: ['toxicologia'], article_type: 'revisao', pub_year: 2022, oa_status: 'closed' });
    await addArticle({ title: 'C', topics: ['farmacologia-clinica'], article_type: 'revisao', pub_year: 2022, oa_status: 'green' });
    await addArticle({ title: 'D', topics: ['toxicologia'], article_type: 'artigo', pub_year: 2022, oa_status: 'gold' });
    const titles = async (input) => (await Lib.search(sql, MEMBER, input)).items.map((i) => i.title).sort();
    expect(await titles({ topic: 'toxicologia' })).toEqual(['A', 'B', 'D']);
    expect(await titles({ topic: 'toxicologia', type: 'revisao' })).toEqual(['A', 'B']);
    expect(await titles({ topic: 'toxicologia', type: 'revisao', yearFrom: 2020 })).toEqual(['B']);
    expect(await titles({ yearFrom: 2019, yearTo: 2022, openAccess: true })).toEqual(['C', 'D']);
    expect(await titles({ openAccess: false })).toEqual(['A', 'B', 'C', 'D']);
  });

  test('filtros inválidos são recusados com mensagem clara', async () => {
    await expectError(Lib.search(sql, MEMBER, { topic: 'Área Inválida!' }), 'ValidationError');
    await expectError(Lib.search(sql, MEMBER, { type: 'inventado' }), 'ValidationError');
  });

  test('ordem: ano decrescente, depois título; paginação e pageSize 51 vira 50', async () => {
    for (let i = 1; i <= 3; i += 1) await addArticle({ title: `Ordem ${i}`, pub_year: 2000 + i });
    await addArticle({ title: 'Sem ano', pub_year: null });
    const all = await Lib.search(sql, MEMBER, { pageSize: 51 });
    expect(all.pageSize).toBe(50);
    expect(all.items.map((i) => i.title)).toEqual(['Ordem 3', 'Ordem 2', 'Ordem 1', 'Sem ano']);
    const p2 = await Lib.search(sql, MEMBER, { pageSize: 2, page: 2 });
    expect(p2).toMatchObject({ page: 2, pageSize: 2, total: 4 });
    expect(p2.items.map((i) => i.title)).toEqual(['Ordem 1', 'Sem ano']);
    expect((await Lib.search(sql, MEMBER, {})).pageSize).toBe(20);
    expect((await Lib.search(sql, MEMBER, { pageSize: 0, page: 1000 }))).toMatchObject({ page: 100, pageSize: 20 });
  });

  test('ordem padrão: português primeiro, depois ano decrescente e título; sem idioma vem junto dos demais', async () => {
    await addArticle({ title: 'Inglês recente', language: 'en', pub_year: 2024 });
    await addArticle({ title: 'Português antigo', language: 'pt', pub_year: 2010 });
    await addArticle({ title: 'Sem idioma', language: null, pub_year: 2023 });
    await addArticle({ title: 'Português novo', language: 'pt', pub_year: 2022 });
    await addArticle({ title: 'Espanhol', language: 'es', pub_year: 2021 });
    const res = await Lib.search(sql, MEMBER, {});
    expect(res.items.map((i) => i.title)).toEqual(['Português novo', 'Português antigo', 'Inglês recente', 'Sem idioma', 'Espanhol']);
    expect(res.items.map((i) => i.language)).toEqual(['pt', 'pt', 'en', null, 'es']);
  });

  test('a ordem portuguesa vale na paginação inteira, não só dentro da página', async () => {
    await addArticle({ title: 'En 1', language: 'en', pub_year: 2025 });
    await addArticle({ title: 'En 2', language: 'en', pub_year: 2024 });
    await addArticle({ title: 'Pt 1', language: 'pt', pub_year: 2001 });
    const p1 = await Lib.search(sql, MEMBER, { pageSize: 2, page: 1 });
    const p2 = await Lib.search(sql, MEMBER, { pageSize: 2, page: 2 });
    expect(p1.items.map((i) => i.title)).toEqual(['Pt 1', 'En 1']);
    expect(p2.items.map((i) => i.title)).toEqual(['En 2']);
  });

  test('filtro de idioma: pt, en e outros (tudo que não é português); ausente = todos', async () => {
    await addArticle({ title: 'P', language: 'pt' });
    await addArticle({ title: 'E', language: 'en' });
    await addArticle({ title: 'S', language: 'es' });
    await addArticle({ title: 'N', language: null });
    const titles = async (input) => (await Lib.search(sql, MEMBER, input)).items.map((i) => i.title).sort();
    expect(await titles({ language: 'pt' })).toEqual(['P']);
    expect(await titles({ language: 'en' })).toEqual(['E']);
    expect(await titles({ language: 'outros' })).toEqual(['E', 'N', 'S']);
    expect(await titles({})).toEqual(['E', 'N', 'P', 'S']);
    expect(await titles({ language: '' })).toEqual(['E', 'N', 'P', 'S']);
    expect((await Lib.search(sql, MEMBER, { language: 'pt' })).total).toBe(1);
  });

  test('idioma inválido é recusado', async () => {
    await expectError(Lib.search(sql, MEMBER, { language: 'fr' }), 'ValidationError', 'Idioma inválido.');
    await expectError(Lib.search(sql, MEMBER, { language: 5 }), 'ValidationError');
  });

  test('favoritos seguem do mais recente ao mais antigo, sem a ordem do idioma', async () => {
    const en = await addArticle({ title: 'Fav en', language: 'en' });
    const pt = await addArticle({ title: 'Fav pt', language: 'pt' });
    await db.query("INSERT INTO library_favorites (profile_id, article_id, created_at) VALUES ($1, $2, '2026-03-01'), ($1, $3, '2026-03-02')", [P_MEMBER, pt, en]);
    const res = await Lib.listFavorites(sql, MEMBER, {});
    expect(res.items.map((i) => i.title)).toEqual(['Fav en', 'Fav pt']);
    expect(res.items.map((i) => i.language)).toEqual(['en', 'pt']);
  });

  test('isFavorite reflete só os favoritos de quem pergunta', async () => {
    const a = await addArticle({ title: 'Favoritado' });
    await db.query('INSERT INTO library_favorites (profile_id, article_id) VALUES ($1, $2)', [P_MEMBER, a]);
    expect((await Lib.search(sql, MEMBER, {})).items[0].isFavorite).toBe(true);
    expect((await Lib.search(sql, OTHER, {})).items[0].isFavorite).toBe(false);
  });

  test('visitor busca, mas sem resumo nem favorito', async () => {
    const a = await addArticle({ title: 'Para visitante', summary_text: 'Resumo', summary_origin: 'curador', summary_updated_at: new Date() });
    await db.query('INSERT INTO library_favorites (profile_id, article_id) VALUES ($1, $2)', [P_VISITOR, a]);
    const res = await Lib.search(sql, VISITOR, {});
    expect(res.items[0]).toMatchObject({ hasSummary: false, isFavorite: false });
  });

  test('sem sessão: recusa; limite por perfil; o termo buscado não é gravado', async () => {
    await expectError(Lib.search(sql, null, {}), 'ForbiddenError');
    await Lib.search(sql, MEMBER, { q: 'varfarina' });
    const rows = (await db.query("SELECT bucket, attempts FROM rate_limit_buckets WHERE bucket = 'LIBRARY_SEARCH'")).rows;
    expect(rows).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n).toBe(0);
    await db.query("UPDATE rate_limit_buckets SET attempts = 300 WHERE bucket = 'LIBRARY_SEARCH'");
    await expectError(Lib.search(sql, MEMBER, {}), 'RateLimitError', RATE_MSG);
  });
});

describe('getArticle', () => {
  test('membro recebe a ficha completa com resumo revisado, resumo original aberto e coleções', async () => {
    const id = await addArticle({
      title: 'Ficha', pmcid: 'PMC123', journal_abbrev: 'Rev Teste', volume: '3', issue: '2', pages: '10-20', language: 'pt',
      license: 'cc-by', source_abstract: 'Resumo original do periódico',
      summary_text: 'Resumo do curador', summary_origin: 'curador', summary_updated_at: new Date('2026-01-10T00:00:00Z'),
      authors: [{ family: 'A', given: 'a' }, { family: 'B', given: 'b' }, { family: 'C', given: 'c' }, { family: 'D', given: 'd' }], author_count: 4,
    });
    await addCollection('publicada-1', 'publicada', [id]);
    await addCollection('rascunho-1', 'rascunho', [id]);
    await db.query('INSERT INTO library_favorites (profile_id, article_id) VALUES ($1, $2)', [P_MEMBER, id]);
    const { success, article } = await Lib.getArticle(sql, MEMBER, { id });
    expect(success).toBe(true);
    expect(article).toMatchObject({
      id, title: 'Ficha', membersOnly: false, isFavorite: true, hasSummary: true, pmcid: 'PMC123',
      pmcUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/', journalAbbrev: 'Rev Teste', volume: '3', issue: '2', pages: '10-20',
      language: 'pt', oaStatus: 'gold', abstract: 'Resumo original do periódico', clinicalReview: null,
    });
    expect(article.authors).toHaveLength(4);
    expect(article.summary).toEqual({ text: 'Resumo do curador', origin: 'curador', reviewerName: null, reviewedAt: null });
    expect(article.collections.map((c) => c.title)).toEqual(['Coleção publicada-1']);
    expect(article).not.toHaveProperty('sourceAbstract');
    expect(article).not.toHaveProperty('statusReason');
  });

  test('licença NC não libera o resumo original; sem resumo próprio fica null', async () => {
    const id = await addArticle({ license: 'cc-by-nc', source_abstract: 'Texto protegido' });
    const { article } = await Lib.getArticle(sql, MEMBER, { id });
    expect(article.abstract).toBeNull();
    expect(article.summary).toBeNull();
  });

  test('resumo clínico mostra o revisor; resumo de IA só com revisão', async () => {
    const id = await addArticle({
      is_clinical: true, summary_text: 'Dose de 5 mg', summary_origin: 'ia_editado', summary_updated_at: new Date('2026-01-10T00:00:00Z'),
      summary_reviewed_at: new Date('2026-01-11T00:00:00Z'), summary_reviewer_name: 'Dr. Curador',
      clinical_reviewed_at: new Date('2026-01-12T00:00:00Z'), clinical_reviewer_name: 'Dra. Revisora',
    });
    const { article } = await Lib.getArticle(sql, MEMBER, { id });
    expect(article.summary).toMatchObject({ origin: 'ia_editado', reviewerName: 'Dr. Curador' });
    expect(article.clinicalReview).toMatchObject({ reviewerName: 'Dra. Revisora' });
  });

  test('visitor recebe membersOnly e nada de resumo, resumo original, coleções ou favorito', async () => {
    const id = await addArticle({ source_abstract: 'Original', summary_text: 'Resumo', summary_origin: 'curador', summary_updated_at: new Date() });
    await addCollection('c-visitor', 'publicada', [id]);
    const { article } = await Lib.getArticle(sql, VISITOR, { id });
    expect(article).toMatchObject({ membersOnly: true, summary: null, abstract: null, collections: [], isFavorite: false, hasSummary: false, clinicalReview: null });
    expect(article.title).toBeTruthy();
  });

  test('artigo aprovado, em triagem, removido ou inexistente: NotFoundError', async () => {
    const aprovado = await addArticle({ status: 'aprovado', approved_at: new Date(), approver_name: 'X' });
    const triagem = await addArticle({ status: 'em_triagem' });
    for (const id of [aprovado, triagem, ABSENT]) {
      await expectError(Lib.getArticle(sql, MEMBER, { id }), 'NotFoundError', 'Artigo não encontrado.');
    }
  });

  test('id inválido: ValidationError', async () => {
    await expectError(Lib.getArticle(sql, MEMBER, { id: "x'; DROP TABLE" }), 'ValidationError', 'Artigo inválido.');
    await expectError(Lib.getArticle(sql, MEMBER, {}), 'ValidationError', 'Artigo inválido.');
  });
});

describe('favoritos', () => {
  test('favoritar duas vezes não duplica; desfavoritar é idempotente', async () => {
    const id = await addArticle();
    expect(await Lib.setFavorite(sql, MEMBER, { id, favorite: true })).toEqual({ success: true, favorite: true });
    expect(await Lib.setFavorite(sql, MEMBER, { id, favorite: true })).toEqual({ success: true, favorite: true });
    expect((await db.query('SELECT count(*)::int AS n FROM library_favorites')).rows[0].n).toBe(1);
    expect(await Lib.setFavorite(sql, MEMBER, { id, favorite: false })).toEqual({ success: true, favorite: false });
    expect(await Lib.setFavorite(sql, MEMBER, { id, favorite: false })).toEqual({ success: true, favorite: false });
    expect((await db.query('SELECT count(*)::int AS n FROM library_favorites')).rows[0].n).toBe(0);
  });

  test('só membro favorita; só artigo publicado; favorite precisa ser booleano', async () => {
    const id = await addArticle();
    const triagem = await addArticle({ status: 'em_triagem' });
    await expectError(Lib.setFavorite(sql, VISITOR, { id, favorite: true }), 'ForbiddenError');
    await expectError(Lib.setFavorite(sql, MEMBER, { id: triagem, favorite: true }), 'NotFoundError');
    await expectError(Lib.setFavorite(sql, MEMBER, { id, favorite: 'sim' }), 'ValidationError');
    await expectError(Lib.setFavorite(sql, MEMBER, { id: 'nao-uuid', favorite: true }), 'ValidationError', 'Artigo inválido.');
  });

  test('teto de favoritos: o 501º é recusado, mas refavoritar um existente e desfavoritar funcionam', async () => {
    await db.query(
      `INSERT INTO library_articles (doi, title, landing_url, search_norm, topics, status, approved_at, approver_name, published_at)
       SELECT '10.2000/bulk' || g, 'Bulk ' || g, 'https://doi.org/10.2000/bulk' || g, 'bulk ' || g, ARRAY['toxicologia'], 'publicado', now(), 'X', now()
       FROM generate_series(1, 501) g`,
    );
    await db.query(
      `INSERT INTO library_favorites (profile_id, article_id)
       SELECT $1, id FROM (SELECT id FROM library_articles ORDER BY doi LIMIT 500) s`,
      [P_MEMBER],
    );
    const extra = (await db.query(
      'SELECT id FROM library_articles WHERE id NOT IN (SELECT article_id FROM library_favorites) LIMIT 1',
    )).rows[0].id;
    await expectError(Lib.setFavorite(sql, MEMBER, { id: extra, favorite: true }), 'ValidationError');
    const existing = (await db.query('SELECT article_id AS id FROM library_favorites LIMIT 1')).rows[0].id;
    expect(await Lib.setFavorite(sql, MEMBER, { id: existing, favorite: true })).toEqual({ success: true, favorite: true });
    await Lib.setFavorite(sql, MEMBER, { id: existing, favorite: false });
    expect(await Lib.setFavorite(sql, MEMBER, { id: extra, favorite: true })).toEqual({ success: true, favorite: true });
  });

  test('listFavorites: só publicados, só os meus, mais recentes primeiro; visitor recusado', async () => {
    const a = await addArticle({ title: 'Primeiro' });
    const b = await addArticle({ title: 'Segundo' });
    const gone = await addArticle({ title: 'Removido depois', status: 'removido', status_reason: 'motivo claro', approved_at: new Date(), approver_name: 'X' });
    await db.query('INSERT INTO library_favorites (profile_id, article_id, created_at) VALUES ($1, $2, now() - interval \'2 hours\')', [P_MEMBER, a]);
    await db.query('INSERT INTO library_favorites (profile_id, article_id, created_at) VALUES ($1, $2, now() - interval \'1 hours\')', [P_MEMBER, b]);
    await db.query('INSERT INTO library_favorites (profile_id, article_id) VALUES ($1, $2)', [P_MEMBER, gone]);
    await db.query('INSERT INTO library_favorites (profile_id, article_id) VALUES ($1, $2)', [P_OTHER, a]);
    const res = await Lib.listFavorites(sql, MEMBER, {});
    expect(res).toMatchObject({ success: true, total: 2, page: 1 });
    expect(res.items.map((i) => i.title)).toEqual(['Segundo', 'Primeiro']);
    expect(res.items.every((i) => i.isFavorite)).toBe(true);
    await expectError(Lib.listFavorites(sql, VISITOR, {}), 'ForbiddenError');
  });
});

describe('coleções', () => {
  test('listCollections: só publicadas, contando só artigos publicados, na ordem', async () => {
    const a = await addArticle();
    const b = await addArticle();
    const hidden = await addArticle({ status: 'aprovado', approved_at: new Date(), approver_name: 'X' });
    await addCollection('segunda', 'publicada', [a], 2);
    await addCollection('primeira', 'publicada', [a, b, hidden], 1);
    await addCollection('rascunho', 'rascunho', [a], 0);
    const { collections } = await Lib.listCollections(sql, MEMBER);
    expect(collections.map((c) => [c.slug, c.count])).toEqual([['primeira', 2], ['segunda', 1]]);
    expect(Object.keys(collections[0]).sort()).toEqual(['count', 'description', 'id', 'slug', 'title']);
  });

  test('getCollection: itens publicados na ordem da coleção; rascunho e inexistente dão NotFound', async () => {
    const a = await addArticle({ title: 'Mais novo', pub_year: 2024 });
    const b = await addArticle({ title: 'Mais antigo', pub_year: 2001 });
    const hidden = await addArticle({ title: 'Oculto', status: 'aprovado', approved_at: new Date(), approver_name: 'X' });
    const col = await addCollection('ordem', 'publicada', [b, hidden, a]);
    const draft = await addCollection('rasc', 'rascunho', [a]);
    const res = await Lib.getCollection(sql, MEMBER, { id: col });
    expect(res.collection).toEqual({ id: col, slug: 'ordem', title: 'Coleção ordem', description: 'Descrição' });
    expect(res.items.map((i) => i.title)).toEqual(['Mais antigo', 'Mais novo']);
    await expectError(Lib.getCollection(sql, MEMBER, { id: draft }), 'NotFoundError');
    await expectError(Lib.getCollection(sql, MEMBER, { id: ABSENT }), 'NotFoundError');
    await expectError(Lib.getCollection(sql, MEMBER, { id: 'x' }), 'ValidationError');
  });

  test('visitor não vê coleções', async () => {
    await expectError(Lib.listCollections(sql, VISITOR), 'ForbiddenError');
    await expectError(Lib.getCollection(sql, VISITOR, { id: ABSENT }), 'ForbiddenError');
  });
});

describe('suggest', () => {
  const suggest = (input, identity = MEMBER) => Lib.suggest(sql, env, identity, input, CID);

  test('DOI válido vira sugestão no estado "sugerido" e gera auditoria sem dados pessoais', async () => {
    const res = await suggest({ identifier: 'https://doi.org/10.1000/ABC123', note: 'Útil para a aula' });
    expect(res).toMatchObject({ success: true, status: 'sugerido' });
    const row = (await db.query('SELECT * FROM library_suggestions WHERE id = $1', [res.suggestionId])).rows[0];
    expect(row).toMatchObject({ identifier_kind: 'doi', identifier: '10.1000/abc123', note: 'Útil para a aula', status: 'sugerido', profile_id: P_MEMBER });
    const audit = (await db.query("SELECT * FROM audit_logs WHERE action = 'LIBRARY_SUGGESTION_CREATE'")).rows[0];
    expect(audit).toMatchObject({ target_type: 'library_suggestion', target_id: res.suggestionId, actor_id: P_MEMBER, result: 'success' });
    expect(JSON.stringify(audit.details)).not.toMatch(/Útil|exemplo|abc123/i);
  });

  test('link do PubMed grava só o PMID', async () => {
    const res = await suggest({ identifier: 'https://pubmed.ncbi.nlm.nih.gov/12345678/?utm=x' });
    const row = (await db.query('SELECT identifier_kind, identifier, note FROM library_suggestions WHERE id = $1', [res.suggestionId])).rows[0];
    expect(row).toEqual({ identifier_kind: 'pmid', identifier: '12345678', note: null });
  });

  test('identificador fora do formato e host estranho são recusados', async () => {
    await expectError(suggest({ identifier: 'https://exemplo.com/artigo' }), 'ValidationError');
    await expectError(suggest({ identifier: 'texto qualquer' }), 'ValidationError');
    await expectError(suggest({}), 'ValidationError');
  });

  test.each(['veja <b>isto</b>', 'acesse http://x.com', 'HTTPS://x.com', 'www.site.com', 'script>alert(1)', 'linha\u0000nula'])(
    'nota com marcação ou link é recusada: %s',
    async (note) => {
      await expectError(suggest({ identifier: '10.1000/nota1', note }), 'ValidationError');
      expect((await db.query('SELECT count(*)::int AS n FROM library_suggestions')).rows[0].n).toBe(0);
    },
  );

  test('nota acima de 300 caracteres é recusada; nota em branco vira nula', async () => {
    await expectError(suggest({ identifier: '10.1000/nota2', note: 'a'.repeat(301) }), 'ValidationError');
    const res = await suggest({ identifier: '10.1000/nota3', note: '   ' });
    const row = (await db.query('SELECT note FROM library_suggestions WHERE id = $1', [res.suggestionId])).rows[0];
    expect(row.note).toBeNull();
  });

  test('sugerir o mesmo artigo duas vezes: ConflictError', async () => {
    await suggest({ identifier: '10.1000/dup' });
    await expectError(suggest({ identifier: 'doi:10.1000/DUP' }), 'ConflictError', 'Você já sugeriu este artigo.');
  });

  test('a 6ª sugestão na mesma hora estoura o limite', async () => {
    for (let i = 1; i <= 5; i += 1) await suggest({ identifier: `10.1000/lim${i}` });
    await expectError(suggest({ identifier: '10.1000/lim6' }), 'RateLimitError', RATE_MSG);
    expect((await db.query('SELECT count(*)::int AS n FROM library_suggestions')).rows[0].n).toBe(5);
  });

  test('o limite diário também vale (15 em 24 h)', async () => {
    await suggest({ identifier: '10.1000/dia0' });
    await db.query("UPDATE rate_limit_buckets SET attempts = 15 WHERE bucket = 'LIBRARY_SUGGEST_DAY'");
    await expectError(suggest({ identifier: '10.1000/dia1' }), 'RateLimitError');
  });

  test('teto de pendentes por pessoa (10) e na fila toda (200)', async () => {
    await db.query(
      `INSERT INTO library_suggestions (profile_id, identifier_kind, identifier)
       SELECT $1, 'pmid', g::text FROM generate_series(1, 10) g`,
      [P_MEMBER],
    );
    await expectError(suggest({ identifier: '10.1000/cheio' }), 'ValidationError');
    expect(await suggest({ identifier: '10.1000/outro' }, OTHER)).toMatchObject({ success: true });
    await db.query("TRUNCATE library_suggestions");
    await db.query(
      `INSERT INTO library_suggestions (profile_id, identifier_kind, identifier)
       SELECT $1, 'pmid', g::text FROM generate_series(1, 200) g`,
      [P_OTHER],
    );
    await db.query("TRUNCATE rate_limit_buckets");
    await expectError(suggest({ identifier: '10.1000/fila' }), 'ValidationError');
  });

  test('visitor não sugere', async () => {
    await expectError(suggest({ identifier: '10.1000/vis' }, VISITOR), 'ForbiddenError');
  });
});

describe('publicCatalog', () => {
  test('lista só publicados, com PublicItem (3 autores), sem resumo e sem sessão', async () => {
    await addArticle({
      title: 'Público', pmid: '777', summary_text: 'segredo', summary_origin: 'curador', summary_updated_at: new Date(),
      source_abstract: 'original',
      authors: [{ family: 'A', given: 'a' }, { family: 'B', given: 'b' }, { family: 'C', given: 'c' }, { family: 'D', given: 'd' }], author_count: 9,
    });
    await addArticle({ title: 'Em triagem', status: 'em_triagem' });
    const res = await Lib.publicCatalog(sql, env, { cache: fakeCache() });
    expect(res).toMatchObject({ success: true, enabled: true });
    expect(Date.parse(res.generatedAt)).not.toBeNaN();
    expect(res.topics.map((t) => t.slug)).toEqual(['farmacologia-clinica', 'toxicologia']);
    expect(res.items).toHaveLength(1);
    const [item] = res.items;
    expect(item.authors).toHaveLength(3);
    expect(item).toMatchObject({ title: 'Público', authorCount: 9, pmid: '777', openAccess: true, license: 'cc-by' });
    expect(Object.keys(item).sort()).toEqual([
      'authorCount', 'authors', 'doi', 'id', 'journal', 'landingUrl', 'language', 'license', 'openAccess', 'pmid', 'publishedAt', 'title', 'topics', 'type', 'year',
    ].sort());
    expect(JSON.stringify(res)).not.toMatch(/segredo|original/);
  });

  test('ordena o português primeiro e traz o idioma de cada item', async () => {
    await addArticle({ title: 'Catálogo en', language: 'en', pub_year: 2025 });
    await addArticle({ title: 'Catálogo pt', language: 'pt', pub_year: 2005 });
    await addArticle({ title: 'Catálogo sem idioma', language: null, pub_year: 2024 });
    const res = await Lib.publicCatalog(sql, env, { cache: fakeCache() });
    expect(res.items.map((i) => i.title)).toEqual(['Catálogo pt', 'Catálogo en', 'Catálogo sem idioma']);
    expect(res.items.map((i) => i.language)).toEqual(['pt', 'en', null]);
  });

  test('a segunda chamada sai do cache sem tocar o banco nem os limites', async () => {
    await addArticle({ title: 'Cacheado' });
    const cache = fakeCache();
    const first = await Lib.publicCatalog(sql, env, { cache });
    expect(cache.store.size).toBe(1);
    const boom = () => { throw new Error('o banco não deveria ser chamado'); };
    const second = await Lib.publicCatalog(boom, env, { cache });
    expect(second).toEqual(first);
    expect((await db.query("SELECT count(*)::int AS n FROM rate_limit_buckets WHERE bucket LIKE 'LIBRARY_PUBLIC%'")).rows[0].n).toBe(0);
  });

  test('o cache guarda por 60 s no máximo (janela de remoção de artigo)', async () => {
    await addArticle();
    const heads = [];
    const cache = {
      match: async () => undefined,
      put: async (_key, res) => { heads.push(res.headers.get('Cache-Control')); },
    };
    await Lib.publicCatalog(sql, env, { cache });
    expect(heads).toEqual(['public, max-age=60']);
  });

  test('flag fechada depois do cache aquecido: não serve do cache nem grava nele', async () => {
    await addArticle({ title: 'Já cacheado' });
    const cache = fakeCache();
    const open = await Lib.publicCatalog(sql, env, { cache });
    expect(open.items).toHaveLength(1);
    await setFlag('library_enabled', false);
    const closed = await Lib.publicCatalog(sql, env, { cache });
    expect(closed).toEqual({ success: true, enabled: false, topics: [], items: [] });
    expect(cache.store.size).toBe(1);
    expect(JSON.stringify(closed)).not.toContain('Já cacheado');
  });

  test('sem cache disponível aplica os dois limites (IP e global)', async () => {
    await addArticle();
    const res = await Lib.publicCatalog(sql, env, { cache: null });
    expect(res.success).toBe(true);
    const buckets = (await db.query("SELECT bucket FROM rate_limit_buckets WHERE bucket LIKE 'LIBRARY_PUBLIC%' ORDER BY bucket")).rows.map((r) => r.bucket);
    expect(buckets).toEqual(['LIBRARY_PUBLIC_GLOBAL', 'LIBRARY_PUBLIC_IP']);
  });

  test('erro no cache cai no caminho com limites, e estourar o limite global recusa', async () => {
    await addArticle();
    const broken = { match: async () => { throw new Error('cache fora'); }, put: async () => { throw new Error('cache fora'); } };
    expect((await Lib.publicCatalog(sql, env, { cache: broken })).success).toBe(true);
    await db.query("UPDATE rate_limit_buckets SET attempts = 300 WHERE bucket = 'LIBRARY_PUBLIC_GLOBAL'");
    await expectError(Lib.publicCatalog(sql, env, { cache: null }), 'RateLimitError', RATE_MSG);
  });

  test('o teto de 2000 itens vale (LIMIT)', async () => {
    await db.query(
      `INSERT INTO library_articles (doi, title, landing_url, search_norm, topics, status, approved_at, approver_name, published_at)
       SELECT '10.3000/pub' || g, 'Pub ' || g, 'https://doi.org/10.3000/pub' || g, 'pub ' || g, ARRAY['toxicologia'], 'publicado', now(), 'X', now()
       FROM generate_series(1, 2005) g`,
    );
    const res = await Lib.publicCatalog(sql, env, { cache: fakeCache() });
    expect(res.items).toHaveLength(2000);
  }, 30000);
});
