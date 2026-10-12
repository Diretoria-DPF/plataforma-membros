/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * librarySummaryService (B3): gerar o resumo sugerido por IA (flag
 * library_ai_summary, curador, limites, auditoria) e registrar a revisão do
 * resumo de IA pelo curador, contra um Postgres real (PGlite) e um env.AI falso.
 * Inclui a sequência do lote "Aprovar e publicar" (aprovar → revisar → publicar).
 * Quem usa: `npm test -- -i librarySummaryService`.
 */
import * as Cur from '../src/services/libraryCurationService.js';
import * as Sum from '../src/services/librarySummaryService.js';
import { searchNorm } from '../src/library/normalize.js';
import { INSUFFICIENT_SENTINEL } from '../src/library/summaryProvider.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000c5';
const P_ADMIN = '11111111-1111-4111-8111-111111111111';
const P_CURADOR = '22222222-2222-4222-8222-222222222222';
const P_MEMBRO = '44444444-4444-4444-8444-444444444444';
const ADMIN = { profileId: P_ADMIN, role: 'admin', fullName: 'Admin Teste' };
const CURADOR = { profileId: P_CURADOR, role: 'member', fullName: 'Dra. Curadora' };
const MEMBRO = { profileId: P_MEMBRO, role: 'member', fullName: 'Membro Comum' };
const MODEL = '@cf/teste/modelo-falso';
const FORBIDDEN = 'Acesso não autorizado para este recurso.';
const INSUFFICIENT = 'Resumo original insuficiente';

const ABSTRACT = 'Background: paracetamol overdose is a leading cause of acute liver failure. '
  + 'Methods: we reviewed 120 cases admitted to a tertiary center between 2010 and 2020. '
  + 'Results: late presentation was associated with higher mortality. '
  + 'Conclusions: early recognition matters for outcomes in this population.';
const GOOD = 'O estudo revisou 120 casos de intoxicação por paracetamol em um centro terciário. '
  + 'A chegada tardia ao hospital se associou a maior mortalidade. '
  + 'Os autores destacam o reconhecimento precoce do quadro.';
const CLINICAL = 'O estudo avaliou a dose de 150 mg/kg de acetilcisteína. '
  + 'A chegada tardia se associou a maior mortalidade. '
  + 'Os autores destacam o reconhecimento precoce.';

let db;
let sql;
let seq = 0;

function fakeAi(reply) {
  const calls = [];
  return { calls, AI: { run: async (model, input) => { calls.push({ model, input }); return { response: reply }; } } };
}

function envWith(ai) {
  return makeEnv({ AI: ai.AI, LIBRARY_AI_MODEL: MODEL });
}

async function seed(over = {}) {
  seq += 1;
  const status = over.status ?? 'em_triagem';
  const advanced = status === 'aprovado' || status === 'publicado';
  const row = {
    doi: `10.1000/ia${seq}`,
    title: `Artigo para resumo ${seq}`,
    authors: [{ family: 'Silva', given: 'Ana' }],
    author_count: 1,
    journal: 'Revista de Teste',
    pub_year: 2020,
    article_type: 'artigo',
    topics: ['toxicologia'],
    license: 'cc-by',
    oa_status: 'gold',
    source_abstract: ABSTRACT,
    status,
    ...(advanced ? { approved_at: new Date('2026-01-01T00:00:00Z'), approver_name: 'Dra. Curadora' } : {}),
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

async function row(id) {
  return (await db.query('SELECT * FROM library_articles WHERE id = $1', [id])).rows[0];
}

async function auditOf(action) {
  return (await db.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at', [action])).rows;
}

async function setFlag(enabled) {
  await db.query('UPDATE feature_flags SET enabled = $1 WHERE key = $2', [enabled, 'library_ai_summary']);
  __resetFlagCacheForTests();
}

async function expectError(promise, name, message) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).not.toBeNull();
  expect(err.name).toBe(name);
  if (message) expect(err.message).toBe(message);
  return err;
}

const generate = (identity, id, ai, extra = {}) => Sum.generateSummary(sql, envWith(ai), identity, { id, ...extra }, CID);
const reviewSummary = (identity, id, version) => Sum.reviewSummary(sql, identity, { id, version }, CID);
const setStatus = (identity, id, version, to) => Cur.setStatus(sql, identity, { id, version, to }, CID);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('TRUNCATE library_removal_requests, library_staff, library_favorites, library_collection_items, library_collections, library_suggestions, library_articles, audit_logs, rate_limit_buckets');
  for (const [id, role, name] of [[P_ADMIN, 'admin', 'admin'], [P_CURADOR, 'member', 'curadora'], [P_MEMBRO, 'member', 'membro']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, 'x', '11999990000', $5) ON CONFLICT (id) DO NOTHING`,
      [id, `Pessoa ${name}`, name, `${name}@exemplo.com`, role],
    );
  }
  await db.query(`INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador')`, [P_CURADOR]);
  await setFlag(true);
});

describe('generateSummary: portões', () => {
  test('flag desligada: { success:false, disabled:true } sem chamar o modelo', async () => {
    await setFlag(false);
    const id = await seed();
    const ai = fakeAi(GOOD);
    const res = await generate(CURADOR, id, ai);
    expect(res).toMatchObject({ success: false, disabled: true });
    expect(ai.calls).toHaveLength(0);
    expect((await row(id)).summary_text).toBeNull();
  });

  test('membro comum é recusado (antes da flag e do modelo)', async () => {
    const id = await seed();
    const ai = fakeAi(GOOD);
    await expectError(generate(MEMBRO, id, ai), 'ForbiddenError', FORBIDDEN);
    expect(ai.calls).toHaveLength(0);
  });

  test('id inválido e artigo inexistente', async () => {
    const ai = fakeAi(GOOD);
    await expectError(generate(CURADOR, 'x', ai), 'ValidationError', 'Artigo inválido.');
    await expectError(generate(CURADOR, '99999999-9999-4999-8999-999999999999', ai), 'NotFoundError', 'Artigo não encontrado.');
  });

  test('artigo publicado é recusado', async () => {
    const id = await seed({ status: 'publicado' });
    const ai = fakeAi(GOOD);
    await expectError(generate(CURADOR, id, ai), 'ValidationError');
    expect(ai.calls).toHaveLength(0);
  });

  test('sem resumo original (ou curto demais): "Resumo original insuficiente", sem chamar o modelo', async () => {
    const ai = fakeAi(GOOD);
    await expectError(generate(CURADOR, await seed({ source_abstract: null }), ai), 'ValidationError', INSUFFICIENT);
    await expectError(generate(CURADOR, await seed({ source_abstract: 'Curto.' }), ai), 'ValidationError', INSUFFICIENT);
    expect(ai.calls).toHaveLength(0);
  });

  test('artigo com resumo da curadoria não é sobrescrito', async () => {
    const id = await seed({ summary_text: 'Resumo humano.', summary_origin: 'curador', summary_updated_at: new Date() });
    await expectError(generate(CURADOR, id, fakeAi(GOOD)), 'ValidationError');
    expect((await row(id)).summary_text).toBe('Resumo humano.');
  });

  test('limite por curador e teto diário: RateLimitError com code rate_limited', async () => {
    const id = await seed();
    await db.query(
      `INSERT INTO rate_limit_buckets (bucket, identifier_hash, window_started_at, attempts)
       SELECT 'LIBRARY_SUMMARY', encode(digest(lower($1::text), 'sha256'), 'hex'), now(), 200`, [P_CURADOR]);
    const err = await expectError(generate(CURADOR, id, fakeAi(GOOD)), 'RateLimitError');
    expect(err.payload).toEqual({ code: 'rate_limited' });
    await db.exec('TRUNCATE rate_limit_buckets');
    await db.query(
      `INSERT INTO rate_limit_buckets (bucket, identifier_hash, window_started_at, attempts)
       SELECT 'LIBRARY_SUMMARY_DAY', encode(digest('global', 'sha256'), 'hex'), now(), 250`);
    await expectError(generate(ADMIN, id, fakeAi(GOOD)), 'RateLimitError');
  });

  test('sem modelo configurado: erro claro, sem gravar', async () => {
    const id = await seed();
    const env = makeEnv({ AI: fakeAi(GOOD).AI });
    await expectError(Sum.generateSummary(sql, env, CURADOR, { id }, CID), 'ValidationError');
    expect((await row(id)).summary_text).toBeNull();
  });
});

describe('generateSummary: gravação', () => {
  test('grava a sugestão com origem ia, sem revisão, e audita sem texto', async () => {
    const id = await seed();
    const ai = fakeAi(`**Resumo:** ${GOOD}`);
    const res = await generate(CURADOR, id, ai);
    expect(res.success).toBe(true);
    expect(res.article).toMatchObject({ summaryText: GOOD, summaryOrigin: 'ia', summaryReviewedAt: null, isClinical: false, version: 2 });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].model).toBe(MODEL);
    const content = ai.calls[0].input.messages.map((m) => m.content).join('\n');
    expect(content).toContain(ABSTRACT);
    expect(content).not.toMatch(/curadora|exemplo\.com|Pessoa/);
    const saved = await row(id);
    expect(saved.summary_updated_by).toBe(P_CURADOR);
    expect(saved.status).toBe('em_triagem');
    const audit = await auditOf('LIBRARY_SUMMARY_GENERATE');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ result: 'success', target_type: 'library_article', target_id: id });
    expect(audit[0].details).toMatchObject({ model: MODEL, clinical: false });
    expect(JSON.stringify(audit[0].details)).not.toContain('paracetamol');
  });

  test('pode refazer uma sugestão de IA ainda não editada; versão velha é recusada', async () => {
    const id = await seed();
    await generate(CURADOR, id, fakeAi(GOOD));
    await expectError(generate(CURADOR, id, fakeAi(GOOD), { version: 1 }), 'ConflictError');
    const again = await generate(CURADOR, id, fakeAi(GOOD), { version: 2 });
    expect(again.article.version).toBe(3);
  });

  test('texto com dose casa a heurística clínica: isClinical vira true', async () => {
    const id = await seed();
    const res = await generate(CURADOR, id, fakeAi(CLINICAL));
    expect(res.article.isClinical).toBe(true);
    expect(res.clinical).toBe(true);
  });

  test('o modelo diz que o original é insuficiente: erro, nada gravado, auditoria de falha', async () => {
    const id = await seed();
    await expectError(generate(CURADOR, id, fakeAi(INSUFFICIENT_SENTINEL)), 'ValidationError', INSUFFICIENT);
    expect((await row(id)).summary_text).toBeNull();
    const audit = await auditOf('LIBRARY_SUMMARY_GENERATE');
    expect(audit[0]).toMatchObject({ result: 'failure' });
    expect(audit[0].details).toMatchObject({ reason: 'insuficiente' });
  });

  test('modelo de raciocínio sem texto (finish_reason length) duas vezes: mensagem clara e auditoria "tamanho"', async () => {
    const id = await seed();
    const calls = [];
    const thinking = { AI: { run: async (model, input) => { calls.push(input); return { choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'pensando' } }] }; } } };
    await expectError(generate(CURADOR, id, thinking), 'ValidationError', 'A IA não devolveu o texto desta vez. Clique de novo em "Gerar resumos com IA"; se continuar, avise o administrador.');
    expect(calls).toHaveLength(2);
    expect(calls[0].chat_template_kwargs).toEqual({ enable_thinking: false });
    expect((await row(id)).summary_text).toBeNull();
    const audit = await auditOf('LIBRARY_SUMMARY_GENERATE');
    expect(audit[0]).toMatchObject({ result: 'failure' });
    expect(audit[0].details).toMatchObject({ reason: 'tamanho' });
  });

  test('a nova tentativa com mais tokens grava o resumo (o raciocínio nunca vira resumo)', async () => {
    const id = await seed();
    let n = 0;
    const ai = { AI: { run: async () => { n += 1; return n === 1
      ? { choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: 'rascunho interno' } }] }
      : { choices: [{ finish_reason: 'stop', message: { content: GOOD, reasoning_content: 'rascunho interno' } }] }; } } };
    const res = await generate(CURADOR, id, ai);
    expect(res.article.summaryText).toBe(GOOD);
    expect(res.article.summaryText).not.toContain('rascunho');
  });

  test('resposta fora do formato ou erro do modelo: erro amigável, nada gravado', async () => {
    const id = await seed();
    await expectError(generate(CURADOR, id, fakeAi('Uma frase só.')), 'ValidationError');
    const broken = { AI: { run: async () => { throw new Error('5xx'); } } };
    await expectError(generate(CURADOR, id, broken), 'ValidationError');
    expect((await row(id)).summary_text).toBeNull();
  });
});

describe('reviewSummary e o lote "Aprovar e publicar"', () => {
  test('sem revisão o artigo com resumo de IA não publica; com revisão publica (aprovar → revisar → publicar)', async () => {
    const id = await seed();
    await generate(CURADOR, id, fakeAi(GOOD));
    const approved = await setStatus(CURADOR, id, 2, 'aprovado');
    await expectError(setStatus(CURADOR, id, approved.article.version, 'publicado'), 'ValidationError', 'O resumo gerado por IA precisa ser aprovado.');
    const reviewed = await reviewSummary(CURADOR, id, approved.article.version);
    expect(reviewed.article).toMatchObject({ summaryReviewerName: 'Dra. Curadora', summaryOrigin: 'ia' });
    expect(reviewed.article.summaryReviewedAt).toBeTruthy();
    const published = await setStatus(CURADOR, id, reviewed.article.version, 'publicado');
    expect(published.article.status).toBe('publicado');
    const audit = await auditOf('LIBRARY_SUMMARY_REVIEW');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ result: 'success', target_id: id });
  });

  test('não revisa artigo sem resumo de IA, publicado, com versão velha ou por membro', async () => {
    const human = await seed({ summary_text: 'Resumo humano.', summary_origin: 'curador', summary_updated_at: new Date() });
    await expectError(reviewSummary(CURADOR, human, 1), 'ValidationError', 'Este artigo não tem resumo de IA para aprovar.');
    const id = await seed();
    await generate(CURADOR, id, fakeAi(GOOD));
    await expectError(reviewSummary(CURADOR, id, 1), 'ConflictError');
    await expectError(reviewSummary(MEMBRO, id, 2), 'ForbiddenError', FORBIDDEN);
    const pub = await seed({ status: 'publicado', summary_text: GOOD, summary_origin: 'ia', summary_updated_at: new Date('2026-01-01'), summary_reviewed_at: new Date('2026-01-02'), summary_reviewer_name: 'X' });
    await expectError(reviewSummary(CURADOR, pub, 1), 'ValidationError');
  });

  test('editar um resumo de IA vira ia_editado e a revisão antiga deixa de valer', async () => {
    const id = await seed();
    await generate(CURADOR, id, fakeAi(GOOD));
    await reviewSummary(CURADOR, id, 2);
    const edited = await Cur.updateArticle(sql, CURADOR, { id, version: 3, fields: { summaryText: `${GOOD} Texto ajustado.` } }, CID);
    expect(edited.article).toMatchObject({ summaryOrigin: 'ia_editado', summaryReviewedAt: null, summaryReviewerName: null });
    await expectError(generate(CURADOR, id, fakeAi(GOOD)), 'ValidationError');
  });
});
