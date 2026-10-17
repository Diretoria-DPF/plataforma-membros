/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryCurationService (CONTRATO-B1 §2, §3, §4.2, §6, §7): cadastro por
 * DOI/PMID, fila, edição com versão, estados e revisão clínica, contra um
 * Postgres real (PGlite) e um `fetchImpl` falso com as fixtures de
 * fixtures/library-upstream.json. Quem usa: `npm test -- -i libraryCurationService`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Cur from '../src/services/libraryCurationService.js';
import { searchNorm } from '../src/library/normalize.js';
import { allowedTransitions } from '../src/library/transitions.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'library-upstream.json'), 'utf8'));
const PLOS = FIXTURE.plos;

const CID = '00000000-0000-4000-8000-0000000000c4';
const P_ADMIN = '11111111-1111-4111-8111-111111111111';
const P_CURADOR = '22222222-2222-4222-8222-222222222222';
const P_REVISOR = '33333333-3333-4333-8333-333333333333';
const P_MEMBRO = '44444444-4444-4444-8444-444444444444';
const ABSENT = '99999999-9999-4999-8999-999999999999';
const ADMIN = { profileId: P_ADMIN, role: 'admin', fullName: 'Admin Teste' };
const CURADOR = { profileId: P_CURADOR, role: 'member', fullName: 'Dra. Curadora' };
const REVISOR = { profileId: P_REVISOR, role: 'member', fullName: 'Prof. Revisor' };
const MEMBRO = { profileId: P_MEMBRO, role: 'member', fullName: 'Membro Comum' };
const FORBIDDEN = 'Acesso não autorizado para este recurso.';
const STALE = 'Outra pessoa alterou este artigo. Recarregue para ver a versão nova.';
const DUPLICATE = 'Este artigo já está na Biblioteca.';
const CLINICAL_MSG = 'Este resumo fala de conduta, dose ou interação: precisa de revisor clínico. Para desmarcar, informe o motivo (3 a 300 caracteres).';

let db;
let sql;
let env;
let seq = 0;

/** Respostas falsas por host, com as fixtures; `onFirst` roda antes da primeira resposta. */
function upstream(sample, { onFirst } = {}) {
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
    if (onFirst && calls.length === 1) await onFirst();
    const body = bodies[new URL(url).hostname];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

/** Insere um artigo direto no banco. `over` troca colunas (authors e arrays vão como JSON/arrays). */
async function seed(over = {}) {
  seq += 1;
  const status = over.status ?? 'em_triagem';
  const advanced = status === 'aprovado' || status === 'publicado';
  const row = {
    doi: `10.1000/cur${seq}`,
    title: `Artigo de curadoria ${seq}`,
    authors: [{ family: 'Silva', given: 'Ana' }],
    author_count: 1,
    journal: 'Revista de Teste',
    pub_year: 2020,
    article_type: 'artigo',
    topics: ['toxicologia'],
    license: 'cc-by',
    oa_status: 'gold',
    status,
    ...(advanced ? { approved_at: new Date('2026-01-01T00:00:00Z'), approver_name: 'Dra. Curadora' } : {}),
    ...(status === 'publicado' ? { published_at: new Date('2026-02-01T00:00:00Z') } : {}),
    ...over,
  };
  row.landing_url = row.doi ? `https://doi.org/${row.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${row.pmid}/`;
  row.search_norm = searchNorm({ title: row.title, authors: row.authors, journal: row.journal, doi: row.doi, pmid: row.pmid });
  const cols = Object.keys(row);
  const values = cols.map((c) => (c === 'authors' ? JSON.stringify(row[c]) : row[c]));
  const marks = cols.map((c, i) => (c === 'authors' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const res = await db.query(`INSERT INTO library_articles (${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`, values);
  return res.rows[0].id;
}

/** Artigo clínico com resumo escrito por `author`, pronto para a revisão. */
function seedClinical(over = {}) {
  return seed({
    status: 'aprovado',
    summary_text: 'Administrar a dose indicada em jejum.',
    summary_origin: 'curador',
    summary_updated_at: new Date('2026-03-01T00:00:00Z'),
    summary_updated_by: P_CURADOR,
    is_clinical: true,
    ...over,
  });
}

async function row(id) {
  const res = await db.query('SELECT * FROM library_articles WHERE id = $1', [id]);
  return res.rows[0];
}

async function auditOf(action) {
  const res = await db.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at', [action]);
  return res.rows;
}

async function expectError(promise, name, message) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).not.toBeNull();
  expect(err.name).toBe(name);
  if (message) expect(err.message).toBe(message);
  return err;
}

const update = (identity, id, version, fields, reason) => Cur.updateArticle(sql, identity, { id, version, fields, reason }, CID);
const setStatus = (identity, id, version, to, reason) => Cur.setStatus(sql, identity, { id, version, to, reason }, CID);
const review = (identity, id, version, decision, note) => Cur.clinicalReview(sql, identity, { id, version, decision, note }, CID);
const doImport = (identity, identifier, fake) => Cur.importArticle(sql, env, identity, { identifier }, CID, { fetchImpl: fake.fetchImpl });

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  env = makeEnv();
  await db.exec('TRUNCATE library_removal_requests, library_staff, library_suggestions, library_favorites, library_collection_items, library_collections, library_articles, audit_logs, rate_limit_buckets');
  for (const [id, role, name] of [[P_ADMIN, 'admin', 'admin'], [P_CURADOR, 'member', 'curadora'], [P_REVISOR, 'member', 'revisor'], [P_MEMBRO, 'member', 'membro']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, 'x', '11999990000', $5) ON CONFLICT (id) DO NOTHING`,
      [id, `Pessoa ${name}`, name, `${name}@exemplo.com`, role],
    );
  }
  await db.query(`INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador'), ($2, 'revisor_clinico')`, [P_CURADOR, P_REVISOR]);
});

describe('papéis', () => {
  test('admin é curador; equipe pelo library_staff; admin não vira revisor', async () => {
    expect(await Cur.libraryRolesOf(sql, ADMIN)).toEqual(['admin', 'curador']);
    expect(await Cur.libraryRolesOf(sql, CURADOR)).toEqual(['curador']);
    expect(await Cur.libraryRolesOf(sql, REVISOR)).toEqual(['revisor_clinico']);
    expect(await Cur.libraryRolesOf(sql, MEMBRO)).toEqual([]);
    await expect(Cur.requireLibraryRole(sql, ADMIN, 'curador')).resolves.toBeDefined();
    await expectError(Cur.requireLibraryRole(sql, ADMIN, 'revisor_clinico'), 'ForbiddenError', FORBIDDEN);
  });

  test('membro comum é recusado em todas as funções', async () => {
    const id = await seed();
    const fake = upstream(PLOS);
    const calls = [
      doImport(MEMBRO, PLOS.doi, fake),
      Cur.listQueue(sql, MEMBRO, {}),
      Cur.getAdminArticle(sql, MEMBRO, { id }),
      update(MEMBRO, id, 1, { title: 'Novo' }),
      setStatus(MEMBRO, id, 1, 'aprovado'),
      review(MEMBRO, id, 1, 'aprovar'),
    ];
    for (const call of calls) await expectError(call, 'ForbiddenError', FORBIDDEN);
    expect(fake.calls).toHaveLength(0);
  });

  test('revisor lê a fila e a ficha, mas não cadastra, edita nem muda estado', async () => {
    const id = await seed();
    const fake = upstream(PLOS);
    await expect(Cur.listQueue(sql, REVISOR, {})).resolves.toMatchObject({ success: true });
    const got = await Cur.getAdminArticle(sql, REVISOR, { id });
    expect(got.allowedTransitions).toEqual([]);
    await expectError(doImport(REVISOR, PLOS.doi, fake), 'ForbiddenError', FORBIDDEN);
    await expectError(update(REVISOR, id, 1, { title: 'Novo' }), 'ForbiddenError', FORBIDDEN);
    await expectError(setStatus(REVISOR, id, 1, 'aprovado'), 'ForbiddenError', FORBIDDEN);
  });

  test('curador não faz a revisão clínica', async () => {
    const id = await seedClinical();
    await expectError(review(CURADOR, id, 1, 'aprovar'), 'ForbiddenError', FORBIDDEN);
    await expectError(review(ADMIN, id, 1, 'aprovar'), 'ForbiddenError', FORBIDDEN);
  });
});

describe('importArticle', () => {
  test('cadastro feliz grava em_triagem, search_norm, created_by e auditoria', async () => {
    const fake = upstream(PLOS);
    const res = await doImport(ADMIN, `https://doi.org/${PLOS.doi.toUpperCase()}`, fake);
    expect(res.success).toBe(true);
    expect(Array.isArray(res.warnings)).toBe(true);
    expect(res.article).toMatchObject({ doi: PLOS.doi, pmid: PLOS.pmid, status: 'em_triagem', version: 1 });
    expect(res.article.id).toMatch(/^[0-9a-f-]{36}$/);
    const saved = await row(res.article.id);
    expect(saved.created_by).toBe(P_ADMIN);
    expect(saved.status_changed_by).toBe(P_ADMIN);
    expect(saved.search_norm).toContain(PLOS.doi);
    expect(saved.search_norm).toContain('citation');
    expect(saved.landing_url).toBe(`https://doi.org/${PLOS.doi}`);
    expect(saved.metadata_sources.length).toBeGreaterThan(0);
    expect(saved.metadata_fetched_at).not.toBeNull();
    expect(fake.calls.length).toBeGreaterThan(0);
    const audit = await auditOf('LIBRARY_ARTICLE_IMPORT');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: P_ADMIN, target_type: 'library_article', target_id: res.article.id, result: 'success' });
    expect(JSON.stringify(audit[0].details)).not.toContain('@');
  });

  test('areas na importação já entram no artigo; área inexistente recusa antes de chamar as fontes', async () => {
    const fake = upstream(PLOS);
    const res = await Cur.importArticle(sql, env, ADMIN, { identifier: PLOS.doi, areas: ['toxicologia'] }, CID, { fetchImpl: fake.fetchImpl });
    expect(res.article.topics).toEqual(['toxicologia']);
    const none = upstream(PLOS);
    await expectError(Cur.importArticle(sql, env, ADMIN, { identifier: '10.1000/zzz', areas: ['nao-existe'] }, CID, { fetchImpl: none.fetchImpl }), 'ValidationError', 'Área inválida.');
    expect(none.calls).toHaveLength(0);
  });

  test('AdminArticle traz os campos combinados com a tela, em camelCase', async () => {
    const res = await doImport(CURADOR, PLOS.doi, upstream(PLOS));
    const keys = Object.keys(res.article);
    for (const key of ['pubYear', 'articleType', 'summaryText', 'isClinical', 'oaStatus', 'licenseConflict',
      'clinicalReviewedAt', 'metadataSources', 'metadataFetchedAt', 'sourceAbstract', 'journalAbbrev', 'version', 'status']) {
      expect(keys).toContain(key);
    }
    expect(keys).not.toContain('searchNorm');
    // Lista de inclusão: nenhum id de pessoa (created_by etc.) sai para a tela.
    for (const key of ['createdBy', 'statusChangedBy', 'summaryUpdatedBy', 'summaryReviewedBy', 'clinicalReviewedBy', 'approvedBy']) {
      expect(keys).not.toContain(key);
    }
    expect(keys.filter((k) => k.includes('_'))).toEqual([]);
    expect(typeof res.article.metadataFetchedAt).toBe('string');
    expect(Array.isArray(res.article.authors)).toBe(true);
  });

  test('duplicata por DOI e por PMID recusa sem chamar fetch', async () => {
    const byDoi = await seed({ doi: '10.5555/ja-existe' });
    const byPmid = await seed({ doi: null, pmid: '4242' });
    const fake = upstream(PLOS);
    const a = await expectError(doImport(ADMIN, 'doi:10.5555/JA-EXISTE', fake), 'ConflictError', DUPLICATE);
    expect(a.payload).toEqual({ articleId: byDoi });
    const b = await expectError(doImport(ADMIN, 'https://pubmed.ncbi.nlm.nih.gov/4242/', fake), 'ConflictError', DUPLICATE);
    expect(b.payload).toEqual({ articleId: byPmid });
    expect(fake.calls).toHaveLength(0);
    expect(await auditOf('LIBRARY_ARTICLE_IMPORT')).toHaveLength(0);
  });

  test('corrida: a linha entra entre a checagem e o INSERT e vira a mesma ConflictError', async () => {
    let racedId;
    const fake = upstream(PLOS, { onFirst: async () => { racedId = await seed({ doi: PLOS.doi }); } });
    const err = await expectError(doImport(ADMIN, PLOS.doi, fake), 'ConflictError', DUPLICATE);
    expect(err.payload).toEqual({ articleId: racedId });
    const count = await db.query('SELECT count(*)::int AS n FROM library_articles');
    expect(count.rows[0].n).toBe(1);
  });

  test('PMID sem DOI cadastra só com o PMID', async () => {
    const sample = structuredClone(PLOS);
    delete sample.europepmc.resultList.result[0].doi;
    const res = await doImport(ADMIN, PLOS.pmid, upstream(sample));
    expect(res.article.doi).toBeNull();
    expect(res.article.pmid).toBe(PLOS.pmid);
    const saved = await row(res.article.id);
    expect(saved.landing_url).toBe(`https://pubmed.ncbi.nlm.nih.gov/${PLOS.pmid}/`);
  });

  test('identificador inválido não chama fetch', async () => {
    const fake = upstream(PLOS);
    await expectError(doImport(ADMIN, 'https://exemplo.com/10.1000/x', fake), 'ValidationError');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('listQueue e getAdminArticle', () => {
  test('lista por estado com contagens e áreas', async () => {
    await seed();
    await seed();
    await seed({ status: 'aprovado' });
    await seed({ status: 'rejeitado', status_reason: 'Fora do escopo' });
    const triage = await Cur.listQueue(sql, CURADOR, {});
    expect(triage.success).toBe(true);
    expect(triage.items).toHaveLength(2);
    expect(triage.total).toBe(2);
    expect(triage.page).toBe(1);
    expect(triage.counts).toEqual({ em_triagem: 2, aprovado: 1, publicado: 0, rejeitado: 1, removido: 0 });
    expect(triage.topics.map((t) => t.slug)).toEqual(expect.arrayContaining(['toxicologia', 'farmacologia-clinica']));
    expect(triage.items[0]).toHaveProperty('pubYear');
    expect(triage.items[0]).toHaveProperty('version');
    const approved = await Cur.listQueue(sql, REVISOR, { status: 'aprovado' });
    expect(approved.items).toHaveLength(1);
    await expectError(Cur.listQueue(sql, CURADOR, { status: 'xyz' }), 'ValidationError');
  });

  test('ficha traz transições permitidas (iguais às de transitions.js) e favoritos', async () => {
    const withTopic = await seed();
    const noTopic = await seed({ topics: [] });
    const a = await Cur.getAdminArticle(sql, ADMIN, { id: withTopic });
    expect(a.allowedTransitions).toEqual(allowedTransitions(a.article, ['curador']));
    expect(a.allowedTransitions).toEqual(['aprovado', 'rejeitado']);
    expect(a.favoriteCount).toBe(0);
    const b = await Cur.getAdminArticle(sql, ADMIN, { id: noTopic });
    expect(b.allowedTransitions).toEqual(['rejeitado']);
    await db.query('INSERT INTO library_favorites (profile_id, article_id) VALUES ($1, $2)', [P_MEMBRO, withTopic]);
    expect((await Cur.getAdminArticle(sql, ADMIN, { id: withTopic })).favoriteCount).toBe(1);
  });

  test('id inválido e inexistente', async () => {
    await expectError(Cur.getAdminArticle(sql, ADMIN, { id: 'x' }), 'ValidationError', 'Artigo inválido.');
    await expectError(Cur.getAdminArticle(sql, ADMIN, { id: ABSENT }), 'NotFoundError', 'Artigo não encontrado.');
  });
});

describe('updateArticle', () => {
  test('edita campos, refaz o search_norm, soma a versão e audita só os nomes', async () => {
    const id = await seed();
    const res = await update(CURADOR, id, 1, { title: 'Título novo sobre cafeína', year: 2024, topics: ['toxicologia', 'farmacologia-clinica'], oaStatus: 'green' });
    expect(res.article).toMatchObject({ title: 'Título novo sobre cafeína', pubYear: 2024, oaStatus: 'green', version: 2 });
    const saved = await row(id);
    expect(saved.search_norm).toContain('cafeina');
    expect(saved.topics).toEqual(['toxicologia', 'farmacologia-clinica']);
    const audit = await auditOf('LIBRARY_ARTICLE_UPDATE');
    expect(audit).toHaveLength(1);
    expect(audit[0].details.fields.sort()).toEqual(['oaStatus', 'title', 'topics', 'year']);
    expect(JSON.stringify(audit[0].details)).not.toContain('cafeína');
  });

  test('versão velha vira ConflictError com payload version_conflict', async () => {
    const id = await seed();
    await update(CURADOR, id, 1, { journal: 'Outra revista' });
    const err = await expectError(update(ADMIN, id, 1, { journal: 'Mais outra' }), 'ConflictError', STALE);
    expect(err.payload).toEqual({ code: 'version_conflict' });
    expect((await row(id)).journal).toBe('Outra revista');
  });

  test('valida campos: desconhecido, área inexistente, tipo, ano, versão', async () => {
    const id = await seed();
    await expectError(update(CURADOR, id, 1, { doi: '10.1/x' }), 'ValidationError');
    await expectError(update(CURADOR, id, 1, {}), 'ValidationError');
    await expectError(update(CURADOR, id, 1, { topics: ['nao-existe'] }), 'ValidationError', 'Área inválida.');
    await expectError(update(CURADOR, id, 1, { type: 'blog' }), 'ValidationError', 'Tipo de artigo inválido.');
    await expectError(update(CURADOR, id, 1, { year: 1700 }), 'ValidationError');
    await expectError(update(CURADOR, id, 'a', { title: 'x' }), 'ValidationError', 'Versão inválida.');
    await expectError(update(CURADOR, ABSENT, 1, { title: 'x' }), 'NotFoundError', 'Artigo não encontrado.');
    expect((await row(id)).version).toBe(1);
  });

  test('artigo aprovado não fica sem área', async () => {
    const id = await seed({ status: 'aprovado' });
    await expectError(update(CURADOR, id, 1, { topics: [] }), 'ValidationError');
  });

  test('resumo de artigo publicado volta a aprovado e audita a mudança de estado', async () => {
    const id = await seed({ status: 'publicado' });
    const res = await update(CURADOR, id, 1, { summaryText: 'Um resumo próprio sobre o estudo.' });
    expect(res.article).toMatchObject({ status: 'aprovado', summaryText: 'Um resumo próprio sobre o estudo.', isClinical: false });
    const saved = await row(id);
    expect(saved.summary_origin).toBe('curador');
    expect(saved.summary_updated_by).toBe(P_CURADOR);
    const status = await auditOf('LIBRARY_ARTICLE_STATUS');
    expect(status).toHaveLength(1);
    expect(status[0].details).toEqual({ from: 'publicado', to: 'aprovado' });
  });

  test('resumo igual ao anterior não derruba a publicação', async () => {
    const id = await seed({ status: 'publicado', summary_text: 'Resumo estável.', summary_origin: 'curador', summary_updated_at: new Date('2026-03-01T00:00:00Z') });
    const res = await update(CURADOR, id, 1, { summaryText: 'Resumo estável.', journal: 'Revista Nova' });
    expect(res.article.status).toBe('publicado');
  });

  test('resumo com "dose" força isClinical e só deixa desmarcar com motivo', async () => {
    const id = await seed();
    const res = await update(CURADOR, id, 1, { summaryText: 'Ajustar a dose conforme o peso.' });
    expect(res.article.isClinical).toBe(true);
    await expectError(update(CURADOR, id, 2, { isClinical: false }), 'ValidationError', CLINICAL_MSG);
    const plain = await seed();
    const marked = await update(CURADOR, plain, 1, { isClinical: true });
    expect(marked.article.isClinical).toBe(true);
  });

  test.each([
    ['sem motivo', undefined],
    ['motivo curto', 'ok'],
    ['motivo só de espaços', '     '],
    ['motivo longo demais', 'x'.repeat(301)],
    ['motivo que não é texto', 42],
  ])('desmarcar isClinical em resumo clínico com %s é recusado', async (_nome, reason) => {
    const id = await seed();
    await update(CURADOR, id, 1, { summaryText: 'Aplicar 5 mg/kg em dose única.' });
    await expectError(update(CURADOR, id, 2, { isClinical: false }, reason), 'ValidationError', CLINICAL_MSG);
    const saved = await row(id);
    expect(saved.is_clinical).toBe(true);
    expect(saved.version).toBe(2);
  });

  test('desmarcar com motivo (3 a 300) vale e fica na auditoria', async () => {
    const id = await seed();
    await update(CURADOR, id, 1, { summaryText: 'Aplicar 5 mg/kg em dose única.' });
    const res = await update(CURADOR, id, 2, { isClinical: false }, '  Texto apenas descreve o estudo.  ');
    expect(res.article.isClinical).toBe(false);
    const audit = await auditOf('LIBRARY_ARTICLE_UPDATE');
    expect(audit).toHaveLength(2);
    expect(audit[0].details).toEqual({ fields: ['summaryText'] });
    expect(audit[1].details).toEqual({ fields: ['isClinical'], clinicalUnmarkReason: 'Texto apenas descreve o estudo.' });
  });

  test('desmarcado com motivo, uma edição à parte não religa o clínico; trocar o resumo religa', async () => {
    const id = await seed();
    await update(CURADOR, id, 1, { summaryText: 'Aplicar 5 mg/kg em dose única.' });
    await update(CURADOR, id, 2, { isClinical: false }, 'Descrição do estudo, sem conduta.');
    const other = await update(CURADOR, id, 3, { journal: 'Outra Revista' });
    expect(other.article.isClinical).toBe(false);
    const changed = await update(CURADOR, id, 4, { summaryText: 'Utilize 20 ml em jejum.' });
    expect(changed.article.isClinical).toBe(true);
  });

  test('motivo é inútil quando o resumo não casa com a heurística, e nem entra na auditoria', async () => {
    const id = await seed({ is_clinical: true });
    const res = await update(CURADOR, id, 1, { isClinical: false }, 'Marcado por engano.');
    expect(res.article.isClinical).toBe(false);
    const audit = await auditOf('LIBRARY_ARTICLE_UPDATE');
    expect(audit[0].details).toEqual({ fields: ['isClinical'] });
  });

  test.each([
    'Tratamento com carvão ativado.',
    'Iniciar o suporte ventilatório.',
    'O paciente deve ser monitorado.',
    'Aplicar 40 UI por semana.',
    'Recomendamos jejum prévio.',
  ])('a heurística ampliada força isClinical: %s', async (summaryText) => {
    const id = await seed();
    const res = await update(CURADOR, id, 1, { summaryText });
    expect(res.article.isClinical).toBe(true);
  });

  test('limpar o resumo apaga texto e origem juntos', async () => {
    const id = await seed({ summary_text: 'Algo.', summary_origin: 'curador', summary_updated_at: new Date('2026-03-01T00:00:00Z') });
    const res = await update(CURADOR, id, 1, { summaryText: '' });
    expect(res.article.summaryText).toBeNull();
    expect((await row(id)).summary_origin).toBeNull();
  });
});

describe('setStatus', () => {
  test('aprovar grava quem aprovou; publicar e remover respeitam a máquina de estados', async () => {
    const id = await seed();
    const approved = await setStatus(CURADOR, id, 1, 'aprovado');
    expect(approved.article).toMatchObject({ status: 'aprovado', version: 2, approverName: 'Dra. Curadora' });
    const published = await setStatus(ADMIN, id, 2, 'publicado');
    expect(published.article.status).toBe('publicado');
    expect(published.article.publishedAt).toEqual(expect.any(String));
    const removed = await setStatus(ADMIN, id, 3, 'removido', 'Retratado pela revista');
    expect(removed.article).toMatchObject({ status: 'removido', statusReason: 'Retratado pela revista' });
    const back = await setStatus(ADMIN, id, 4, 'em_triagem');
    expect(back.article).toMatchObject({ status: 'em_triagem', statusReason: null, approvedAt: null, approverName: null, publishedAt: null });
    expect(back.article.version).toBe(5);
  });

  test('auditoria só com from e to (o motivo fica na linha)', async () => {
    const id = await seed();
    await setStatus(CURADOR, id, 1, 'rejeitado', 'Fora do escopo da Liga');
    const audit = await auditOf('LIBRARY_ARTICLE_STATUS');
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ from: 'em_triagem', to: 'rejeitado' });
    expect(JSON.stringify(audit[0])).not.toContain('escopo');
  });

  test('recusa transição proibida, motivo curto, aprovar sem área e versão velha', async () => {
    const id = await seed();
    await expectError(setStatus(CURADOR, id, 1, 'publicado'), 'ValidationError', 'Mudança de estado não permitida.');
    await expectError(setStatus(CURADOR, id, 1, 'rejeitado', 'ab'), 'ValidationError');
    await expectError(setStatus(CURADOR, id, 1, 'rejeitado'), 'ValidationError');
    const noTopic = await seed({ topics: [] });
    await expectError(setStatus(CURADOR, noTopic, 1, 'aprovado'), 'ValidationError', 'Escolha ao menos uma área antes de aprovar.');
    const err = await expectError(setStatus(CURADOR, id, 7, 'aprovado'), 'ConflictError', STALE);
    expect(err.payload).toEqual({ code: 'version_conflict' });
    await expectError(setStatus(CURADOR, id, 1, 'banido'), 'ValidationError', 'Mudança de estado não permitida.');
    expect((await row(id)).status).toBe('em_triagem');
  });

  test('publicar clínico sem revisão falha; revisor revisa e o curador publica', async () => {
    const id = await seedClinical();
    await expectError(setStatus(CURADOR, id, 1, 'publicado'), 'ValidationError', 'Falta a revisão clínica do resumo.');
    const reviewed = await review(REVISOR, id, 1, 'aprovar');
    expect(reviewed.article).toMatchObject({ status: 'aprovado', clinicalReviewerName: 'Prof. Revisor', version: 2 });
    expect(reviewed.article.clinicalReviewedAt).toEqual(expect.any(String));
    const published = await setStatus(CURADOR, id, 2, 'publicado');
    expect(published.article.status).toBe('publicado');
  });
});

describe('clinicalReview', () => {
  test('revisor igual ao autor do resumo é recusado', async () => {
    const id = await seedClinical({ summary_updated_by: P_REVISOR });
    await expectError(review(REVISOR, id, 1, 'aprovar'), 'ForbiddenError', 'A revisão clínica precisa ser de outra pessoa.');
    expect((await row(id)).clinical_reviewed_at).toBeNull();
  });

  test('devolver exige motivo e volta a em_triagem', async () => {
    const id = await seedClinical();
    await expectError(review(REVISOR, id, 1, 'devolver'), 'ValidationError');
    const res = await review(REVISOR, id, 1, 'devolver', 'A dose citada está errada');
    expect(res.article).toMatchObject({ status: 'em_triagem', statusReason: 'A dose citada está errada', clinicalReviewedAt: null, version: 2 });
    const audit = await auditOf('LIBRARY_ARTICLE_CLINICAL_REVIEW');
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ decision: 'devolver' });
  });

  test('só revisa artigo clínico com resumo, na triagem ou aprovado; decisão válida', async () => {
    const plain = await seed({ status: 'aprovado' });
    await expectError(review(REVISOR, plain, 1, 'aprovar'), 'ValidationError', 'Este artigo não tem resumo clínico para revisar.');
    const published = await seedClinical({ status: 'publicado', published_at: new Date(), clinical_reviewed_at: new Date(), clinical_reviewer_name: 'Outro' });
    await expectError(review(REVISOR, published, 1, 'aprovar'), 'ValidationError', 'Este artigo não está disponível para revisão clínica.');
    const id = await seedClinical();
    await expectError(review(REVISOR, id, 1, 'talvez'), 'ValidationError', 'Decisão inválida.');
    const err = await expectError(review(REVISOR, id, 9, 'aprovar'), 'ConflictError', STALE);
    expect(err.payload).toEqual({ code: 'version_conflict' });
  });

  test('editar o resumo depois da revisão invalida a revisão (precisa revisar de novo)', async () => {
    const id = await seedClinical();
    await review(REVISOR, id, 1, 'aprovar');
    await update(CURADOR, id, 2, { summaryText: 'Administrar a dose de 5 mg.' });
    await expectError(setStatus(CURADOR, id, 3, 'publicado'), 'ValidationError', 'Falta a revisão clínica do resumo.');
  });
});

describe('limite', () => {
  test('LIBRARY_CURATE estoura depois de 300 chamadas por hora', async () => {
    await db.query(
      `INSERT INTO rate_limit_buckets (bucket, identifier_hash, window_started_at, attempts)
       SELECT 'LIBRARY_CURATE', encode(digest(lower($1::text), 'sha256'), 'hex'), now(), 300`,
      [P_CURADOR],
    );
    await expectError(Cur.listQueue(sql, CURADOR, {}), 'RateLimitError');
  });
});
