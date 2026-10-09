/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESEARCH_LOG, sanitizeResults, kbVersion, lookup, record, purgeExpired,
} from '../src/services/researchLogService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const MIGRATION_026 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql', '026_lia_pesquisas.sql');
const Q_KB = 'Como agendar a visita ao laboratório?';
const Q_EXT = 'efeitos hepáticos do paracetamol';
const KB_PAYLOAD = { reply: 'Use o botão Agendar na página do laboratório.', sources: [{ source: 'faq', section: 'Agendamento' }] };
const EXT_PAYLOAD = {
  items: [{
    title: 'Efeitos hepáticos do paracetamol', journal: 'Rev Tox', year: 2021,
    url: 'https://europepmc.org/article/MED/123', ids: { pmid: '123', pmcid: 'PMC999', doi: '10.1000/abc' },
  }],
};

describe('researchLogService — sanitizeResults (sem banco)', () => {
  test('kb: corta reply em 4000, no máximo 4 fontes, source em 100 e section em 200', () => {
    const out = sanitizeResults('kb', {
      reply: 'r'.repeat(5000),
      sources: Array.from({ length: 6 }, () => ({ source: 's'.repeat(150), section: 'x'.repeat(250) })),
    });
    expect(out.reply).toHaveLength(RESEARCH_LOG.REPLY_MAX);
    expect(out.sources).toHaveLength(RESEARCH_LOG.SOURCES_MAX);
    expect(out.sources[0].source).toHaveLength(100);
    expect(out.sources[0].section).toHaveLength(200);
  });

  test('descarta campos fora da lista (prompt, token e similares)', () => {
    const out = sanitizeResults('kb', { reply: 'ok', sources: [{ source: 'faq', section: 'a', prompt: 'segredo' }], token: 'x' });
    expect(out).toEqual({ reply: 'ok', sources: [{ source: 'faq', section: 'a' }] });
    expect(JSON.stringify(out)).not.toContain('segredo');
  });

  test('externos: derruba host fora da lista, http:, javascript: e URL com usuário; o item fica sem url', () => {
    const out = sanitizeResults('europepmc', {
      items: [
        { title: 'a', url: 'https://evil.example.com/x' },
        { title: 'b', url: 'http://europepmc.org/article/1' },
        { title: 'c', url: 'javascript:alert(1)' },
        { title: 'd', url: 'https://usuario:senha@europepmc.org/x' },
        { title: 'e', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' },
      ],
    });
    expect(out.items.map((i) => i.url)).toEqual([null, null, null, null, 'https://pubmed.ncbi.nlm.nih.gov/123/']);
    expect(out.items.map((i) => i.title)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('externos: no máximo 10 itens, título em 300, revista em 200, DOI em 200, ano e ids validados', () => {
    const out = sanitizeResults('pubmed', {
      items: Array.from({ length: 15 }, () => ({
        title: 't'.repeat(500), journal: 'j'.repeat(300), year: 2101,
        ids: { pmid: '12345678901', pmcid: 'pmc1', doi: 'd'.repeat(300) },
      })),
    });
    expect(out.items).toHaveLength(RESEARCH_LOG.ITEMS_MAX);
    const [first] = out.items;
    expect(first.title).toHaveLength(300);
    expect(first.journal).toHaveLength(200);
    expect(first.year).toBeNull();
    expect(first.ids).toEqual({ pmid: null, pmcid: null, doi: 'd'.repeat(200) });
  });

  test('externos: ano em texto, pmid numérico e pmcid bem formado passam', () => {
    const [item] = sanitizeResults('openalex', { items: [{ title: 'x', year: '2019', ids: { pmid: 4567, pmcid: 'PMC123' } }] }).items;
    expect(item.year).toBe(2019);
    expect(item.ids).toEqual({ pmid: '4567', pmcid: 'PMC123', doi: null });
  });

  test('não muta a entrada e aceita lixo sem lançar', () => {
    const input = { items: [{ title: 'a', url: 'https://doi.org/10.1/x', extra: 1 }] };
    const before = JSON.stringify(input);
    sanitizeResults('europepmc', input);
    expect(JSON.stringify(input)).toBe(before);
    expect(sanitizeResults('kb', null)).toEqual({ reply: '', sources: [] });
    expect(sanitizeResults('europepmc', 'lixo')).toEqual({ items: [] });
  });
});

describe('researchLogService — versão da base', () => {
  const docs = [
    { source: 'faq', section: 'Agendamento', content: 'Use o botão Agendar.' },
    { source: 'plataforma', section: 'Sobre', content: 'A plataforma reúne a LAIFT.' },
  ];

  test('16 hexadecimais, igual sem importar a ordem, e diferente quando o conteúdo muda', async () => {
    const version = await kbVersion(docs);
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect(await kbVersion([...docs].reverse())).toBe(version);
    expect(await kbVersion([docs[0], { ...docs[1], content: 'Texto novo.' }])).not.toBe(version);
  });

  test('não reordena a lista de entrada', async () => {
    const copy = [...docs];
    await kbVersion(docs);
    expect(docs).toEqual(copy);
  });
});

describe('researchLogService — SQL real (PGlite com as migrações)', () => {
  let db;
  let sql;

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
  }, 60000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.exec('DELETE FROM lia_pesquisas'); });

  test('a 026 aplica e pode ser reaplicada (idempotente)', async () => {
    const migration = fs.readFileSync(MIGRATION_026, 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const [{ reg }] = await sql`SELECT to_regclass('public.lia_pesquisas')::text AS reg`;
    expect(reg).toBe('lia_pesquisas');
  });

  test('ida e volta: record grava a resposta da base e lookup devolve, somando o acerto', async () => {
    expect(await record(sql, { provider: 'kb', question: Q_KB, kbVersion: 'v1', outcome: 'answered', results: KB_PAYLOAD })).toBe(true);
    const hit = await lookup(sql, { provider: 'kb', question: Q_KB, kbVersion: 'v1' });
    expect(hit).toMatchObject({ outcome: 'answered', results: KB_PAYLOAD, similarity: 1 });
    const [{ hits, last }] = await sql`SELECT hits, last_hit_at IS NOT NULL AS last FROM lia_pesquisas`;
    expect(hits).toBe(1);
    expect(last).toBe(true);
  });

  test('externos: guarda só metadados e devolve o mesmo item', async () => {
    expect(await record(sql, { provider: 'europepmc', question: Q_EXT, outcome: 'answered', results: EXT_PAYLOAD })).toBe(true);
    const hit = await lookup(sql, { provider: 'europepmc', question: Q_EXT });
    expect(hit.results).toEqual(EXT_PAYLOAD);
  });

  test('lacuna (outcome empty) é guardada e volta como vazia', async () => {
    const q = 'quanto custa a mensalidade da liga';
    expect(await record(sql, { provider: 'kb', question: q, outcome: 'empty', results: {} })).toBe(true);
    expect(await lookup(sql, { provider: 'kb', question: q })).toMatchObject({ outcome: 'empty', results: { reply: '', sources: [] } });
  });

  test('gravar de novo a mesma pergunta atualiza a resposta, sem duplicar', async () => {
    await record(sql, { provider: 'kb', question: Q_KB, outcome: 'answered', results: KB_PAYLOAD });
    await record(sql, { provider: 'kb', question: Q_KB, outcome: 'answered', results: { reply: 'Nova resposta.', sources: [] } });
    const rows = await sql`SELECT results FROM lia_pesquisas`;
    expect(rows).toEqual([{ results: { reply: 'Nova resposta.', sources: [] } }]);
  });

  test('validade: 30 dias para kb e 7 para externos', async () => {
    await record(sql, { provider: 'kb', question: Q_KB, outcome: 'answered', results: KB_PAYLOAD });
    await record(sql, { provider: 'pubmed', question: Q_EXT, outcome: 'answered', results: EXT_PAYLOAD });
    const rows = await sql`SELECT provider, round(extract(epoch FROM (expires_at - created_at)) / 86400)::int AS days FROM lia_pesquisas ORDER BY provider`;
    expect(rows).toEqual([{ provider: 'kb', days: 30 }, { provider: 'pubmed', days: 7 }]);
  });

  test.each([
    ['e-mail', 'meu email é ana@exemplo.com, pode responder a dúvida?'],
    ['CPF', 'meu cpf 123.456.789-09 está certo para o cadastro?'],
    ['meu paciente', 'qual a dose que devo dar ao meu paciente de 60 kg?'],
    ['nome próprio', 'Segundo o professor João Silva a aspirina é segura?'],
  ])('recusa pergunta com %s: não grava nem acha', async (_label, question) => {
    expect(await record(sql, { provider: 'kb', question, outcome: 'answered', results: KB_PAYLOAD })).toBe(false);
    expect(await lookup(sql, { provider: 'kb', question })).toBeNull();
    expect((await sql`SELECT count(*)::int AS n FROM lia_pesquisas`)[0].n).toBe(0);
  });

  test('guarda de sentido: "é seguro" não acha a resposta de "não é seguro"', async () => {
    const stored = 'O paracetamol é seguro na gravidez?';
    await record(sql, { provider: 'kb', question: stored, outcome: 'answered', results: { reply: 'Sim, com orientação médica.', sources: [] } });
    expect(await lookup(sql, { provider: 'kb', question: 'O paracetamol não é seguro na gravidez?' })).toBeNull();
    expect(await lookup(sql, { provider: 'kb', question: stored })).toMatchObject({ outcome: 'answered' });
  });

  test('pergunta com pequena diferença de grafia acha pelo trigrama (similaridade de 0,9 ou mais)', async () => {
    await record(sql, { provider: 'kb', question: 'quais sao os sintomas da intoxicacao por paracetamol em adultos', outcome: 'answered', results: KB_PAYLOAD });
    const hit = await lookup(sql, { provider: 'kb', question: 'quais sao os sintomas da intoxicacao por paracetamol em adulto' });
    expect(hit).not.toBeNull();
    expect(hit.similarity).toBeGreaterThanOrEqual(RESEARCH_LOG.SIMILARITY);
  });

  test('versão da base diferente não acha, e provedor diferente também não', async () => {
    await record(sql, { provider: 'kb', question: Q_KB, kbVersion: 'v1', outcome: 'answered', results: KB_PAYLOAD });
    expect(await lookup(sql, { provider: 'kb', question: Q_KB, kbVersion: 'v2' })).toBeNull();
    expect(await lookup(sql, { provider: 'kb', question: Q_KB })).toBeNull();
    expect(await lookup(sql, { provider: 'europepmc', question: Q_KB, kbVersion: 'v1' })).toBeNull();
  });

  test('recusa gravação inválida: provedor ou desfecho fora da lista, resposta vazia como answered, versão grande', async () => {
    expect(await record(sql, { provider: 'google', question: Q_KB, outcome: 'answered', results: KB_PAYLOAD })).toBe(false);
    expect(await record(sql, { provider: 'kb', question: Q_KB, outcome: 'maybe', results: KB_PAYLOAD })).toBe(false);
    expect(await record(sql, { provider: 'kb', question: Q_KB, outcome: 'answered', results: { reply: '' } })).toBe(false);
    expect(await record(sql, { provider: 'kb', question: Q_KB, kbVersion: 'x'.repeat(65), outcome: 'answered', results: KB_PAYLOAD })).toBe(false);
    expect((await sql`SELECT count(*)::int AS n FROM lia_pesquisas`)[0].n).toBe(0);
  });

  test('linha vencida não volta, e purgeExpired a remove e devolve quantas apagou', async () => {
    await record(sql, { provider: 'kb', question: Q_KB, outcome: 'answered', results: KB_PAYLOAD });
    await record(sql, { provider: 'europepmc', question: Q_EXT, outcome: 'answered', results: EXT_PAYLOAD });
    await db.exec("UPDATE lia_pesquisas SET expires_at = now() - interval '1 day' WHERE provider = 'kb'");
    expect(await lookup(sql, { provider: 'kb', question: Q_KB })).toBeNull();
    expect(await lookup(sql, { provider: 'europepmc', question: Q_EXT })).not.toBeNull();
    expect(await purgeExpired(sql)).toBe(1);
    expect(await purgeExpired(sql)).toBe(0);
  });
});

describe('researchLogService — falhas do banco nunca chegam à pessoa', () => {
  const broken = () => Promise.reject(new Error('banco fora'));
  const missing = () => Promise.reject(Object.assign(new Error('relation "lia_pesquisas" does not exist'), { code: '42P01' }));

  test.each([
    ['banco fora', broken],
    ['tabela ausente (026 não aplicada)', missing],
  ])('%s: lookup devolve null, record devolve false e purgeExpired devolve 0', async (_label, sqlFn) => {
    expect(await lookup(sqlFn, { provider: 'kb', question: Q_KB })).toBeNull();
    expect(await record(sqlFn, { provider: 'kb', question: Q_KB, outcome: 'answered', results: KB_PAYLOAD })).toBe(false);
    expect(await purgeExpired(sqlFn)).toBe(0);
  });
});
