/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryWorkflowService e libraryRemovalService: publicar em lote, mudar o estado
 * (só admin), áreas em lote e pedidos de remoção (curador/mentor pedem, o admin decide),
 * contra um Postgres real (PGlite). Quem usa: `npm test -- -i libraryWorkflowService`.
 */
import * as Flow from '../src/services/libraryWorkflowService.js';
import * as Rem from '../src/services/libraryRemovalService.js';
import { countRateLimitAttempt } from '../src/security.js';
import { searchNorm } from '../src/library/normalize.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000d5';
const P_ADMIN = '11111111-1111-4111-8111-111111111111';
const P_CURADOR = '22222222-2222-4222-8222-222222222222';
const P_MENTOR = '33333333-3333-4333-8333-333333333333';
const P_MEMBRO = '44444444-4444-4444-8444-444444444444';
const ABSENT = '99999999-9999-4999-8999-999999999999';
const ADMIN = { profileId: P_ADMIN, role: 'admin', fullName: 'Admin Teste' };
const CURADOR = { profileId: P_CURADOR, role: 'member', fullName: 'Dra. Curadora' };
const MENTOR = { profileId: P_MENTOR, role: 'member', fullName: 'Mentor Teste' };
const MEMBRO = { profileId: P_MEMBRO, role: 'member', fullName: 'Membro Comum' };
const FORBIDDEN = 'Acesso não autorizado para este recurso.';

let db;
let sql;
let seq = 0;

async function seed(over = {}) {
  seq += 1;
  const status = over.status ?? 'em_triagem';
  const advanced = status === 'aprovado' || status === 'publicado';
  const row = {
    doi: `10.1000/wf${seq}`,
    title: `Artigo de fluxo ${seq}`,
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
  row.landing_url = `https://doi.org/${row.doi}`;
  row.search_norm = searchNorm({ title: row.title, authors: row.authors, journal: row.journal, doi: row.doi });
  const cols = Object.keys(row);
  const values = cols.map((c) => (c === 'authors' ? JSON.stringify(row[c]) : row[c]));
  const marks = cols.map((c, i) => (c === 'authors' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const res = await db.query(`INSERT INTO library_articles (${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`, values);
  return res.rows[0].id;
}

const seedAiSummary = (over = {}) => seed({
  status: 'aprovado',
  summary_text: 'Resumo gerado pela IA sobre o mecanismo.',
  summary_origin: 'ia',
  summary_updated_at: new Date('2026-03-01T00:00:00Z'),
  summary_updated_by: P_CURADOR,
  ...over,
});

const seedClinical = (over = {}) => seed({
  status: 'aprovado',
  summary_text: 'Administrar a dose indicada em jejum.',
  summary_origin: 'curador',
  summary_updated_at: new Date('2026-03-01T00:00:00Z'),
  summary_updated_by: P_CURADOR,
  is_clinical: true,
  ...over,
});

async function row(id) {
  return (await db.query('SELECT * FROM library_articles WHERE id = $1', [id])).rows[0];
}

async function auditOf(action) {
  return (await db.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at', [action])).rows;
}

async function expectError(promise, name, message) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).not.toBeNull();
  expect(err.name).toBe(name);
  if (message) expect(err.message).toBe(message);
  return err;
}

const publishMany = (identity, ids, extra = {}) => Flow.publishMany(sql, identity, { ids, ...extra }, CID);
const changeStatus = (identity, id, version, to, reason) => Flow.changeStatus(sql, identity, { id, version, to, reason }, CID);
const setAreas = (identity, ids, topics, mode) => Flow.setAreas(sql, identity, { ids, topics, mode }, CID);
const requestRemoval = (identity, id, reason) => Rem.requestRemoval(sql, identity, { id, reason }, CID);
const decide = (identity, id, decision) => Rem.decideRemoval(sql, identity, { id, decision }, CID);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('TRUNCATE library_removal_requests, library_staff, library_suggestions, library_favorites, library_collection_items, library_collections, library_articles, audit_logs, rate_limit_buckets');
  for (const [id, role, name] of [[P_ADMIN, 'admin', 'admin'], [P_CURADOR, 'member', 'curadora'], [P_MENTOR, 'member', 'mentor'], [P_MEMBRO, 'member', 'membro']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, 'x', '11999990000', $5) ON CONFLICT (id) DO NOTHING`,
      [id, `Pessoa ${name}`, name, `${name}@exemplo.com`, role],
    );
  }
  await db.query(`INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador'), ($2, 'mentor')`, [P_CURADOR, P_MENTOR]);
});

describe('publishMany', () => {
  test('aprova e publica artigos da triagem de uma vez, gravando quem aprovou', async () => {
    const a = await seed();
    const b = await seed({ status: 'aprovado' });
    const out = await publishMany(CURADOR, [a, b]);
    expect(out.success).toBe(true);
    expect(out.results.map((r) => [r.id, r.ok, r.status])).toEqual([[a, true, 'publicado'], [b, true, 'publicado']]);
    expect(out.published).toBe(2);
    const ra = await row(a);
    expect(ra.status).toBe('publicado');
    expect(ra.approver_name).toBe('Dra. Curadora');
    expect(ra.published_at).not.toBeNull();
    expect(await auditOf('LIBRARY_PUBLISH_MANY')).toHaveLength(1);
  });

  test('um item que falha não derruba os outros e a mensagem diz o porquê', async () => {
    const sem = await seed({ topics: [] });
    const bom = await seed();
    const out = await publishMany(CURADOR, [sem, bom]);
    expect(out.results[0]).toMatchObject({ id: sem, ok: false, status: 'em_triagem', message: 'Escolha ao menos uma área antes de aprovar.' });
    expect(out.results[1]).toMatchObject({ id: bom, ok: true, status: 'publicado' });
    expect(out.published).toBe(1);
  });

  test('resumo de IA sem aprovação fica como aprovado; com approveAiSummaries vai ao ar', async () => {
    const id = await seedAiSummary();
    const first = await publishMany(CURADOR, [id]);
    expect(first.results[0]).toMatchObject({ ok: false, status: 'aprovado', message: 'O resumo gerado por IA precisa ser aprovado.' });
    const second = await publishMany(CURADOR, [id], { approveAiSummaries: true });
    expect(second.results[0]).toMatchObject({ ok: true, status: 'publicado' });
    const r = await row(id);
    expect(r.summary_text).toContain('IA');
    expect(r.summary_reviewer_name).toBe('Dra. Curadora');
  });

  test('clínico sem revisor não vai ao ar; com clinicalAsReference sai só como referência, sem resumo', async () => {
    const id = await seedClinical();
    const blocked = await publishMany(CURADOR, [id], { approveAiSummaries: true });
    expect(blocked.results[0]).toMatchObject({ ok: false, message: 'Falta a revisão clínica do resumo.' });
    const ref = await publishMany(CURADOR, [id], { clinicalAsReference: true });
    expect(ref.results[0]).toMatchObject({ ok: true, status: 'publicado', referenceOnly: true });
    const r = await row(id);
    expect(r.summary_text).toBeNull();
    expect(r.summary_origin).toBeNull();
    expect(r.reference_only).toBe(true);
  });

  test('estado que não publica (rejeitado, publicado) é recusado por item', async () => {
    const rej = await seed({ status: 'rejeitado', status_reason: 'fora do escopo' });
    const pub = await seed({ status: 'publicado' });
    const out = await publishMany(CURADOR, [rej, pub]);
    expect(out.results.every((r) => r.ok === false)).toBe(true);
    expect(out.results[0].message).toBe('Só artigos para revisar ou aprovados podem ser publicados.');
  });

  test('id inexistente vira falha do item; lista vazia, inválida ou grande demais é recusada', async () => {
    const out = await publishMany(CURADOR, [ABSENT]);
    expect(out.results[0]).toMatchObject({ ok: false, message: 'Artigo não encontrado.' });
    await expectError(publishMany(CURADOR, []), 'ValidationError');
    await expectError(publishMany(CURADOR, ['nao-uuid']), 'ValidationError');
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await expectError(publishMany(CURADOR, many), 'ValidationError');
  });

  test('só quem publica: membro e mentor são recusados', async () => {
    const id = await seed();
    await expectError(publishMany(MEMBRO, [id]), 'ForbiddenError', FORBIDDEN);
    await expectError(publishMany(MENTOR, [id]), 'ForbiddenError', FORBIDDEN);
    expect((await row(id)).status).toBe('em_triagem');
  });

  test('ao estourar o teto de publicação, os itens restantes voltam como rate_limited', async () => {
    const ids = [await seed(), await seed(), await seed()];
    for (let i = 0; i < 399; i += 1) await countRateLimitAttempt(sql, 'LIBRARY_PUBLISH', P_CURADOR, 3600);
    const out = await publishMany(CURADOR, ids);
    expect(out.results[0].ok).toBe(true);
    expect(out.results[1]).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(out.results[2]).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});

describe('changeStatus (admin)', () => {
  test('admin leva um publicado a em_triagem e depois a aprovado, limpando a aprovação ao voltar', async () => {
    const id = await seed({ status: 'publicado' });
    const back = await changeStatus(ADMIN, id, 1, 'em_triagem');
    expect(back.article.status).toBe('em_triagem');
    expect(back.article.approverName).toBeNull();
    const again = await changeStatus(ADMIN, id, back.article.version, 'aprovado');
    expect(again.article.status).toBe('aprovado');
    expect(again.article.approverName).toBe('Admin Teste');
  });

  test('de em_triagem direto a publicado passa por aprovado (grava aprovação)', async () => {
    const id = await seed();
    const out = await changeStatus(ADMIN, id, 1, 'publicado');
    expect(out.article.status).toBe('publicado');
    expect(out.article.approverName).toBe('Admin Teste');
    expect(out.article.version).toBe(3);
  });

  test('rejeitar e remover pedem motivo; restaurar um removido volta à triagem', async () => {
    const id = await seed({ status: 'publicado' });
    await expectError(changeStatus(ADMIN, id, 1, 'removido', 'x'), 'ValidationError', 'Informe o motivo (3 a 300 caracteres).');
    const gone = await changeStatus(ADMIN, id, 1, 'removido', 'artigo retratado');
    expect(gone.article.status).toBe('removido');
    const back = await changeStatus(ADMIN, id, gone.article.version, 'em_triagem');
    expect(back.article.status).toBe('em_triagem');
  });

  test('respeita as regras: sem área não aprova; clínico sem revisão não publica; mesmo estado e versão velha falham', async () => {
    const sem = await seed({ topics: [] });
    await expectError(changeStatus(ADMIN, sem, 1, 'aprovado'), 'ValidationError', 'Escolha ao menos uma área antes de aprovar.');
    const cli = await seedClinical();
    await expectError(changeStatus(ADMIN, cli, 1, 'publicado'), 'ValidationError', 'Falta a revisão clínica do resumo.');
    const ok = await seed();
    await expectError(changeStatus(ADMIN, ok, 1, 'em_triagem'), 'ValidationError', 'Mudança de estado não permitida.');
    await expectError(changeStatus(ADMIN, ok, 7, 'aprovado'), 'ConflictError');
  });

  test('curador, mentor e membro não mudam o estado por esta ação', async () => {
    const id = await seed({ status: 'publicado' });
    for (const who of [CURADOR, MENTOR, MEMBRO]) {
      await expectError(changeStatus(who, id, 1, 'removido', 'quero tirar'), 'ForbiddenError', FORBIDDEN);
    }
    expect((await row(id)).status).toBe('publicado');
  });

  test('audita de onde para onde', async () => {
    const id = await seed({ status: 'publicado' });
    await changeStatus(ADMIN, id, 1, 'em_triagem');
    const [audit] = await auditOf('LIBRARY_ARTICLE_STATUS');
    expect(audit.details).toMatchObject({ from: 'publicado', to: 'em_triagem', byAdmin: true });
  });
});

describe('setAreas', () => {
  test('soma áreas por padrão e substitui em mode replace', async () => {
    const a = await seed({ topics: ['toxicologia'] });
    const b = await seed({ topics: [] });
    const added = await setAreas(CURADOR, [a, b], ['farmacologia-clinica']);
    expect(added.results.map((r) => r.ok)).toEqual([true, true]);
    expect((await row(a)).topics).toEqual(['toxicologia', 'farmacologia-clinica']);
    expect((await row(b)).topics).toEqual(['farmacologia-clinica']);
    const replaced = await setAreas(ADMIN, [a], ['toxicologia'], 'replace');
    expect(replaced.results[0].topics).toEqual(['toxicologia']);
    expect((await row(a)).version).toBe(3);
  });

  test('passar de 5 áreas falha só naquele item; área inexistente e papel errado são recusados', async () => {
    await db.query(`INSERT INTO library_topics (slug, name, sort_order) VALUES ('t3','T3',3),('t4','T4',4),('t5','T5',5),('t6','T6',6) ON CONFLICT DO NOTHING`);
    const cheio = await seed({ topics: ['t3', 't4', 't5', 't6', 'toxicologia'] });
    const livre = await seed({ topics: [] });
    const out = await setAreas(CURADOR, [cheio, livre], ['farmacologia-clinica']);
    expect(out.results[0]).toMatchObject({ ok: false, message: 'Escolha no máximo 5 áreas.' });
    expect(out.results[1].ok).toBe(true);
    await expectError(setAreas(CURADOR, [livre], ['nao-existe']), 'ValidationError', 'Área inválida.');
    await expectError(setAreas(MENTOR, [livre], ['farmacologia-clinica']), 'ForbiddenError', FORBIDDEN);
  });
});

describe('pedidos de remoção', () => {
  test('curador e mentor pedem a remoção de um publicado; um pedido pendente por artigo', async () => {
    const id = await seed({ status: 'publicado' });
    const out = await requestRemoval(MENTOR, id, 'artigo retratado pela revista');
    expect(out.request).toMatchObject({ articleId: id, status: 'pendente', reason: 'artigo retratado pela revista' });
    await expectError(requestRemoval(CURADOR, id, 'também acho'), 'ConflictError', 'Já existe um pedido de remoção para este artigo.');
    expect((await row(id)).status).toBe('publicado');
    expect(await auditOf('LIBRARY_REMOVAL_REQUEST')).toHaveLength(1);
  });

  test('exige motivo, artigo publicado e papel de equipe; admin remove direto em vez de pedir', async () => {
    const pub = await seed({ status: 'publicado' });
    const tri = await seed();
    await expectError(requestRemoval(MENTOR, pub, 'ab'), 'ValidationError', 'Informe o motivo (3 a 300 caracteres).');
    await expectError(requestRemoval(MENTOR, tri, 'motivo válido'), 'ValidationError', 'Só artigos que estão no ar podem ter a remoção pedida.');
    await expectError(requestRemoval(MENTOR, ABSENT, 'motivo válido'), 'NotFoundError');
    await expectError(requestRemoval(MEMBRO, pub, 'motivo válido'), 'ForbiddenError', FORBIDDEN);
    await expectError(requestRemoval(ADMIN, pub, 'motivo válido'), 'ValidationError', 'Você é administrador: tire o artigo do ar direto.');
  });

  test('o admin vê todos os pedidos; o mentor só os próprios', async () => {
    const a = await seed({ status: 'publicado' });
    const b = await seed({ status: 'publicado' });
    await requestRemoval(MENTOR, a, 'pedido do mentor');
    await requestRemoval(CURADOR, b, 'pedido da curadora');
    const adm = await Rem.listRemovalRequests(sql, ADMIN, {});
    expect(adm.items).toHaveLength(2);
    expect(adm.pendingCount).toBe(2);
    expect(adm.items[0]).toMatchObject({ articleTitle: expect.any(String), requestedByName: expect.any(String) });
    const mine = await Rem.listRemovalRequests(sql, MENTOR, {});
    expect(mine.items.map((i) => i.articleId)).toEqual([a]);
    await expectError(Rem.listRemovalRequests(sql, MEMBRO, {}), 'ForbiddenError', FORBIDDEN);
  });

  test('aceitar remove o artigo do ar com o motivo do pedido; recusar mantém no ar', async () => {
    const a = await seed({ status: 'publicado' });
    const b = await seed({ status: 'publicado' });
    const ra = (await requestRemoval(MENTOR, a, 'artigo retratado')).request;
    const rb = (await requestRemoval(MENTOR, b, 'prefiro outro')).request;
    const ok = await decide(ADMIN, ra.id, 'aceitar');
    expect(ok.request).toMatchObject({ status: 'aceito', articleRemoved: true });
    const no = await decide(ADMIN, rb.id, 'recusar');
    expect(no.request).toMatchObject({ status: 'recusado', articleRemoved: false });
    const removed = await row(a);
    expect(removed.status).toBe('removido');
    expect(removed.status_reason).toBe('artigo retratado');
    expect((await row(b)).status).toBe('publicado');
    expect(await auditOf('LIBRARY_REMOVAL_DECIDE')).toHaveLength(2);
  });

  test('só o admin decide, uma vez só, com decisão válida; depois de recusado dá para pedir de novo', async () => {
    const id = await seed({ status: 'publicado' });
    const req = (await requestRemoval(MENTOR, id, 'primeiro pedido')).request;
    await expectError(decide(CURADOR, req.id, 'aceitar'), 'ForbiddenError', FORBIDDEN);
    await expectError(decide(ADMIN, req.id, 'talvez'), 'ValidationError', 'Decisão inválida.');
    await expectError(decide(ADMIN, ABSENT, 'aceitar'), 'NotFoundError');
    await decide(ADMIN, req.id, 'recusar');
    await expectError(decide(ADMIN, req.id, 'aceitar'), 'ConflictError', 'Este pedido já foi decidido.');
    const again = await requestRemoval(MENTOR, id, 'segundo pedido');
    expect(again.request.status).toBe('pendente');
  });
});
