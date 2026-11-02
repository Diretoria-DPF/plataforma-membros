/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Destaques da Liga (highlightsService.js; sql/048) com handlers reais e PGlite com todas as migrações:
 * janela de exibição, teto de 8, ordem, validação de entrada, auditoria, capacidade home.curate, flag desligada e
 * degradação sem a tabela.
 */
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { HIGHLIGHT_LINK_HOSTS, parseLink, cleanText, normalizeSaveInput } from '../src/services/highlightsService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';

const PEOPLE = {
  admin: { id: '11111111-1111-4111-8111-111111111111', role: 'admin', mfa: true },
  membro: { id: '22222222-2222-4222-8222-222222222222', role: 'member', mfa: true },
  gestor: { id: '44444444-4444-4444-8444-444444444444', role: 'member', mfa: true, cargo: 'gestor' },
  gestorSemMfa: { id: '99999999-9999-4999-8999-999999999999', role: 'member', mfa: false, cargo: 'gestor' },
  curador: { id: '77777777-7777-4777-8777-777777777777', role: 'member', mfa: true, cargo: 'curador' },
};
const GHOST = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
const DAY = 86400000;
const future = (days) => new Date(Date.now() + days * DAY).toISOString();

let db;
let sql;
const env = makeEnv();
const tokens = {};

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [name, p] of Object.entries(PEOPLE)) {
    await db.query(
      `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
       VALUES ($1, $2, $3, 'x', '11999990000', $4, 'active', now(), $5)`,
      [p.id, 'Pessoa ' + name, name.toLowerCase() + '@example.com', p.role, name.toLowerCase()]
    );
    if (p.mfa) await db.query("INSERT INTO mfa_credentials (profile_id, secret_enc, confirmed_at) VALUES ($1, 'v1.a.b', now())", [p.id]);
    if (p.cargo) await db.query('INSERT INTO member_roles (profile_id, role) VALUES ($1, $2)', [p.id, p.cargo]);
    tokens[name] = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, p.id, 'jest');
  }
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.query('DELETE FROM home_highlights');
  await db.query('DELETE FROM rate_limit_buckets');
  await db.query('DELETE FROM audit_logs');
  await db.query("UPDATE feature_flags SET enabled = true WHERE key = 'highlights_enabled'");
  __resetFlagCacheForTests();
});

const call = (action, who, input) => API_REGISTRY[action](sql, env, [tokens[who], input]);
const add = (who, over = {}) => call('apiAdminSaveHighlight', who, { kind: 'aviso', title: 'Destaque', ...over });

describe('migração 048', () => {
  test('a flag nasce desligada e a tabela tem RLS forçado', async () => {
    const flag = await db.query("SELECT enabled FROM feature_flags WHERE key = 'highlights_enabled'");
    expect(flag.rows.length).toBe(1);
    const rls = await db.query("SELECT relrowsecurity AND relforcerowsecurity AS ok FROM pg_class WHERE relname = 'home_highlights'");
    expect(rls.rows).toEqual([{ ok: true }]);
  });

  test('o banco também recusa link perigoso, tipo inválido e janela invertida', async () => {
    const insert = (kind, link, ends) => db.query(
      "INSERT INTO home_highlights (kind, title, link_path, ends_at) VALUES ($1, 't', $2, $3)", [kind, link, ends]);
    await expect(insert('aviso', 'javascript:alert(1)', null)).rejects.toThrow();
    await expect(insert('aviso', '//evil.example', null)).rejects.toThrow();
    await expect(insert('aviso', 'http://x.example', null)).rejects.toThrow();
    await expect(insert('aviso', 'https://user:pw@x.example/', null)).rejects.toThrow();
    await expect(insert('outro', null, null)).rejects.toThrow();
    await expect(insert('aviso', null, '2000-01-01T00:00:00Z')).rejects.toThrow();
    await expect(insert('aviso', '/blog/', null)).resolves.toBeDefined();
    await expect(insert('link', 'https://exemplo.org/p?a=1', null)).resolves.toBeDefined();
  });
});

describe('validação pura', () => {
  test('parseLink: só caminho interno ou https', () => {
    expect(parseLink('')).toEqual({ ok: true, value: null });
    expect(parseLink(null)).toEqual({ ok: true, value: null });
    expect(parseLink(' /blog/post ')).toEqual({ ok: true, value: '/blog/post' });
    expect(parseLink('https://doi.org/10.1000/xyz?b=1')).toEqual({ ok: true, value: 'https://doi.org/10.1000/xyz?b=1' });
    ['javascript:alert(1)', 'data:text/html,x', 'http://doi.org', '//evil.example', '/\\evil', 'blog/x', 'https://u:p@doi.org/', 'https://', '/a b', 42, 'https://doi.org/' + 'a'.repeat(200)]
      .forEach((bad) => expect(parseLink(bad).ok).toBe(false));
  });

  test('parseLink: https só para domínios da lista (hostname exato)', () => {
    expect(HIGHLIGHT_LINK_HOSTS).toEqual(['laift.com.br', 'www.laift.com.br', 'www.instagram.com', 'instagram.com', 'doi.org', 'www.gov.br', 'www.planalto.gov.br', 'pubmed.ncbi.nlm.nih.gov']);
    HIGHLIGHT_LINK_HOSTS.forEach((h) => expect(parseLink('https://' + h + '/x?y=1').ok).toBe(true));
    expect(parseLink('HTTPS://LAIFT.COM.BR/Edital').ok).toBe(true);
    expect(parseLink('https://laift.com.br:443/x').ok).toBe(true); // porta padrão some na normalização
    [
      'https://evil-laift.com.br/', 'https://laift.com.br.evil.com/', 'https://sub.laift.com.br/', 'https://xlaift.com.br/',
      'https://evil.com/laift.com.br', 'https://laift.com.br@evil.com/', 'https://evil.com@laift.com.br/', 'https://laift.com.br:8443/',
      'https://laift.com.br:80/', 'https://laift.com.br./', 'https://xn--laift-9ua.com.br/', 'https://laíft.com.br/',
      'https://exemplo.org/a', 'http://laift.com.br/', 'https://127.0.0.1/', '//laift.com.br/x', '//evil.com',
    ].forEach((bad) => expect(parseLink(bad).ok).toBe(false));
  });

  test('normalizeSaveInput: erro do link lista os domínios aceitos e não repete o link', () => {
    const run = () => normalizeSaveInput({ kind: 'link', title: 'x', linkPath: 'https://segredo-evil.example/token123' });
    expect(run).toThrow('doi.org');
    try { run(); } catch (e) { expect(e.message).not.toContain('segredo-evil'); }
  });

  test('cleanText tira controles e colapsa espaços', () => {
    expect(cleanText('  a\u0000b \n\n c‮ ')).toBe('a b c');
    expect(cleanText(7)).toBe('');
  });

  test('normalizeSaveInput recusa data passada, tipo e título inválidos', () => {
    const now = Date.now();
    expect(() => normalizeSaveInput({ kind: 'aviso', title: 'x', endsAt: new Date(now - 1000).toISOString() }, now)).toThrow('futura');
    expect(() => normalizeSaveInput({ kind: 'xx', title: 'x' }, now)).toThrow('Tipo');
    expect(() => normalizeSaveInput({ kind: 'aviso', title: '   ' }, now)).toThrow('título');
    expect(() => normalizeSaveInput({ kind: 'aviso', title: 'x'.repeat(121) }, now)).toThrow('título');
    expect(() => normalizeSaveInput({ kind: 'aviso', title: 'x', subtitle: 'y'.repeat(161) }, now)).toThrow('apoio');
    expect(() => normalizeSaveInput({ kind: 'aviso', title: 'x', endsAt: 'lixo' }, now)).toThrow('Data');
    expect(() => normalizeSaveInput({ kind: 'aviso', title: 'x', id: 'nao-uuid' }, now)).toThrow('inválido');
    expect(normalizeSaveInput({ kind: 'edital', title: ' Ok ', linkPath: '/edital.html' }, now)).toMatchObject({ kind: 'edital', title: 'Ok', linkPath: '/edital.html', endsAt: null });
  });
});

describe('apiListHighlights', () => {
  test('exige sessão válida', async () => {
    const res = await API_REGISTRY.apiListHighlights(sql, env, ['token-invalido']);
    expect(res.success).toBe(false);
  });

  test('flag desligada: lista vazia', async () => {
    await add('admin', { title: 'Visível' });
    await db.query("UPDATE feature_flags SET enabled = false WHERE key = 'highlights_enabled'");
    __resetFlagCacheForTests();
    expect(await call('apiListHighlights', 'membro')).toMatchObject({ success: true, enabled: false, highlights: [] });
  });

  test('devolve só ativos e dentro da janela, ordenados, sem campos internos', async () => {
    await add('admin', { title: 'Terceiro' });
    await add('admin', { title: 'Segundo' });
    await add('admin', { title: 'Primeiro' });
    await add('admin', { title: 'Oculto', isActive: false });
    await add('admin', { title: 'Vencido' });
    await db.query("UPDATE home_highlights SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' WHERE title = 'Vencido'");
    await add('admin', { title: 'Futuro' });
    await db.query("UPDATE home_highlights SET starts_at = now() + interval '1 day' WHERE title = 'Futuro'");
    const res = await call('apiListHighlights', 'membro');
    expect(res.success).toBe(true);
    expect(res.highlights.map((h) => h.title)).toEqual(['Primeiro', 'Segundo', 'Terceiro']);
    expect(Object.keys(res.highlights[0]).sort()).toEqual(['id', 'kind', 'linkPath', 'subtitle', 'title']);
  });

  test('respeita o teto de 8 itens visíveis', async () => {
    for (let i = 1; i <= 10; i += 1) await add('admin', { title: 'Item ' + i });
    const res = await call('apiListHighlights', 'membro');
    expect(res.highlights).toHaveLength(8);
    const admin = await call('apiAdminListHighlights', 'admin');
    expect(admin.highlights).toHaveLength(10);
    expect(admin.visibleCount).toBe(8);
    expect(admin.visibleMax).toBe(8);
    expect(admin.highlights.filter((h) => h.visible).map((h) => h.title)).toEqual(res.highlights.map((h) => h.title));
  });
});

describe('gestão', () => {
  test('cria no topo, edita, liga/desliga, reordena e remove, com auditoria', async () => {
    const a = await add('gestor', { title: 'A', subtitle: 'sub', linkPath: '/blog/', endsAt: future(10) });
    expect(a).toMatchObject({ success: true, message: 'Destaque adicionado.' });
    const b = await add('admin', { title: 'B', kind: 'evento' });
    let list = (await call('apiAdminListHighlights', 'admin')).highlights;
    expect(list.map((h) => h.title)).toEqual(['B', 'A']);
    expect(list[1]).toMatchObject({ subtitle: 'sub', linkPath: '/blog/', kind: 'aviso', isActive: true });
    expect(list[1].endsAt).toBeTruthy();

    const edited = await add('gestor', { id: a.id, title: 'A2', kind: 'edital', linkPath: '' });
    expect(edited).toMatchObject({ success: true, message: 'Destaque atualizado.' });
    list = (await call('apiAdminListHighlights', 'admin')).highlights;
    expect(list.find((h) => h.id === a.id)).toMatchObject({ title: 'A2', kind: 'edital', linkPath: null, endsAt: null });

    expect(await call('apiAdminSetHighlightActive', 'gestor', { id: b.id, isActive: false })).toMatchObject({ success: true });
    expect((await call('apiListHighlights', 'membro')).highlights.map((h) => h.title)).toEqual(['A2']);

    expect(await call('apiAdminReorderHighlights', 'admin', { ids: [a.id, b.id] })).toMatchObject({ success: true });
    list = (await call('apiAdminListHighlights', 'admin')).highlights;
    expect(list.map((h) => h.id)).toEqual([a.id, b.id]);

    expect(await call('apiAdminDeleteHighlight', 'gestor', { id: a.id })).toMatchObject({ success: true });
    expect((await call('apiAdminListHighlights', 'admin')).highlights.map((h) => h.id)).toEqual([b.id]);

    const audit = await db.query("SELECT action FROM audit_logs WHERE target_type = 'home_highlight'");
    const actions = audit.rows.map((r) => r.action);
    ['CREATE_HIGHLIGHT', 'UPDATE_HIGHLIGHT', 'HIDE_HIGHLIGHT', 'REORDER_HIGHLIGHTS', 'DELETE_HIGHLIGHT'].forEach((x) => expect(actions).toContain(x));
  });

  test('avisa quando passa de 8 ativos, sem recusar', async () => {
    for (let i = 1; i <= 8; i += 1) await add('admin', { title: 'Item ' + i });
    const ninth = await add('admin', { title: 'Item 9' });
    expect(ninth.success).toBe(true);
    expect(ninth.warning).toMatch(/8/);
  });

  test('recusa entrada inválida com mensagem que não ecoa o que foi enviado', async () => {
    const bad = await add('admin', { title: 'x', linkPath: 'javascript:alert(1)' });
    expect(bad.success).toBe(false);
    expect(bad.message).not.toContain('javascript');
    expect((await add('admin', { kind: 'zzz' })).success).toBe(false);
    expect((await add('admin', { endsAt: '2001-01-01' })).success).toBe(false);
    expect((await call('apiAdminSetHighlightActive', 'admin', { id: 'x', isActive: true })).success).toBe(false);
    expect((await call('apiAdminSetHighlightActive', 'admin', { id: GHOST, isActive: 'sim' })).success).toBe(false);
    expect((await call('apiAdminReorderHighlights', 'admin', { ids: 'a' })).success).toBe(false);
    expect((await call('apiAdminReorderHighlights', 'admin', { ids: [GHOST, GHOST] })).success).toBe(false);
    expect((await call('apiAdminDeleteHighlight', 'admin', { id: GHOST })).message).toBe('Destaque não encontrado.');
    expect((await call('apiAdminSaveHighlight', 'admin', 'texto')).success).toBe(false);
  });

  test('id desconhecido na reordenação ou edição: não encontrado', async () => {
    expect((await call('apiAdminReorderHighlights', 'admin', { ids: [GHOST] })).success).toBe(false);
    expect((await add('admin', { id: GHOST })).message).toBe('Destaque não encontrado.');
  });

  test('título e texto de apoio entram saneados', async () => {
    await add('admin', { title: '  Olá\u0000  mundo ', subtitle: ' a\n\nb ' });
    const [row] = (await call('apiAdminListHighlights', 'admin')).highlights;
    expect(row).toMatchObject({ title: 'Olá mundo', subtitle: 'a b' });
  });

  test('limite de escrita por pessoa', async () => {
    let last;
    for (let i = 0; i < 61; i += 1) last = await call('apiAdminDeleteHighlight', 'admin', { id: GHOST });
    expect(last.success).toBe(false);
    expect(last.message).toMatch(/limite de alterações nos destaques/);
  });
});

describe('autorização', () => {
  const ACTIONS = ['apiAdminListHighlights', 'apiAdminSaveHighlight', 'apiAdminSetHighlightActive', 'apiAdminReorderHighlights', 'apiAdminDeleteHighlight'];
  test.each(ACTIONS)('%s: membro sem cargo e outro cargo são negados', async (action) => {
    for (const who of ['membro', 'curador']) {
      expect(await call(action, who, {})).toMatchObject({ success: false, message: 'Acesso não autorizado para este recurso.' });
    }
  });
  test.each(ACTIONS)('%s: gestor sem MFA recebe a mensagem do MFA', async (action) => {
    expect(await call(action, 'gestorSemMfa', {})).toMatchObject({ success: false, message: S.CAPABILITY_MFA_MESSAGE });
  });
  test('nada é gravado quando a autorização falha', async () => {
    await add('membro', { title: 'Invasor' });
    expect((await db.query('SELECT count(*)::int AS n FROM home_highlights')).rows[0].n).toBe(0);
  });
});

describe('degradação sem a migração 048', () => {
  beforeEach(async () => { await db.exec('ALTER TABLE home_highlights RENAME TO home_highlights_off'); });
  afterEach(async () => { await db.exec('ALTER TABLE home_highlights_off RENAME TO home_highlights'); });

  test('leitura devolve lista vazia, sem erro', async () => {
    expect(await call('apiListHighlights', 'membro')).toMatchObject({ success: true, highlights: [], tableMissing: true });
    expect(await call('apiAdminListHighlights', 'admin')).toMatchObject({ success: true, highlights: [], tableMissing: true });
  });

  test('escrita recusa com mensagem clara (sem 500 nem detalhe do banco)', async () => {
    const res = await add('admin', { title: 'x' });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/pendente/);
    expect(res.message).not.toMatch(/relation|home_highlights|42P01/);
    expect((await call('apiAdminDeleteHighlight', 'admin', { id: GHOST })).message).toMatch(/pendente/);
  });
});
