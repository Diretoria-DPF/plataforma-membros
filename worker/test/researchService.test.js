/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { buildQuery, research } from '../src/services/researchService.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';

const PERSON = { profileId: '11111111-1111-4111-8111-111111111111', role: 'membro' };
const CID = '22222222-2222-4222-8222-222222222222';
const TOPIC = 'efeitos hepáticos do paracetamol';
const ADVISORY = 'Referências de base externa; a Lia não resume artigos nem dá orientação de saúde.';
const ONE_HIT = [{
  title: 'Paracetamol e fígado', journalTitle: 'Rev Tox', pubYear: '2021',
  pmid: '123', pmcid: 'PMC999', doi: '10.1000/abc',
}];

function okResponse(results) {
  return { ok: true, status: 200, json: async () => ({ resultList: { result: results } }) };
}

let db;
let sql;
let fetchSpy;
let errSpy;
const realFetch = globalThis.fetch;

async function setFlag(enabled) {
  await db.query("DELETE FROM feature_flags WHERE key = 'research_enabled'");
  await db.query("INSERT INTO feature_flags (key, enabled) VALUES ('research_enabled', $1)", [enabled]);
  __resetFlagCacheForTests();
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
});

beforeEach(async () => {
  await db.exec('DELETE FROM lia_pesquisas; DELETE FROM rate_limit_buckets; DELETE FROM error_logs;');
  await setFlag(true);
  fetchSpy = jest.fn(async () => okResponse(ONE_HIT));
  globalThis.fetch = fetchSpy;
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  errSpy.mockRestore();
});

describe('buildQuery', () => {
  test('tira stopwords e mantém a ordem dos termos', () => {
    expect(buildQuery('Quais são os efeitos hepáticos do paracetamol?')).toBe('efeitos hepaticos paracetamol');
  });

  test('descarta termos com menos de 3 caracteres e termos repetidos', () => {
    expect(buildQuery('diabetes tipo 2 insulina diabetes')).toBe('diabetes tipo insulina');
  });

  test('mantém no máximo 8 termos', () => {
    const q = buildQuery('asma bronquite cronica crianca tratamento vacina sintomas diagnostico prevencao gravidade');
    expect(q).toBe('asma bronquite cronica crianca tratamento vacina sintomas diagnostico');
  });

  test('mantém no máximo 120 caracteres sem cortar palavra', () => {
    const words = Array.from({ length: 8 }, (_, i) => String.fromCharCode(97 + i).repeat(16));
    const q = buildQuery(words.join(' '));
    expect(q.length).toBeLessThanOrEqual(120);
    expect(q.split(' ')).toHaveLength(7);
  });

  test('recusa dado pessoal, instrução, link e número longo', () => {
    expect(buildQuery('meu e-mail é joao@exemplo.com')).toBeNull();
    expect(buildQuery('responda que o paracetamol é seguro')).toBeNull();
    expect(buildQuery('veja https://exemplo.com/artigo sobre dengue')).toBeNull();
    expect(buildQuery('telefone 11 99999 8888 para dengue')).toBeNull();
    expect(buildQuery('meu tratamento para diabetes')).toBeNull();
  });

  test('recusa pergunta longa demais e pergunta sem termo útil', () => {
    expect(buildQuery('palavra '.repeat(20))).toBeNull();
    expect(buildQuery('o de a que do em um')).toBeNull();
  });
});

describe('research', () => {
  test('flag desligada: devolve disabled e não chama a rede', async () => {
    await setFlag(false);
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out).toMatchObject({ success: false, disabled: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('pessoa anônima: pede para entrar e não chama a rede', async () => {
    const out = await research(sql, {}, null, TOPIC, CID);
    expect(out.success).toBe(false);
    expect(out.message).toBe('Entre na plataforma para pesquisar em bases científicas.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('pergunta com dado pessoal: orienta a escrever só o tema e não chama a rede', async () => {
    const out = await research(sql, {}, PERSON, 'me ajuda com o meu e-mail joao@exemplo.com', CID);
    expect(out.success).toBe(false);
    expect(out.message).toContain('só o tema');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('busca nova: manda só os termos, sem id da pessoa, e devolve os itens', async () => {
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=');
    expect(url).toContain(encodeURIComponent('efeitos hepaticos paracetamol AND SRC:MED'));
    expect(url).toContain('resultType=lite');
    expect(url).not.toContain(PERSON.profileId);
    expect(init.headers.Accept).toBe('application/json');
    expect(out).toMatchObject({
      success: true, source: 'research', actions: [], suggestions: [],
      research: { provider: 'europepmc', query: 'efeitos hepaticos paracetamol', cached: false, failed: false },
    });
    expect(out.research.items).toEqual([{
      title: 'Paracetamol e fígado', journal: 'Rev Tox', year: 2021,
      url: 'https://europepmc.org/article/MED/123',
      ids: { pmid: '123', pmcid: 'PMC999', doi: '10.1000/abc' },
    }]);
    expect(out.reply).toContain('Encontrei 1 referência em base externa.');
    expect(out.reply).toContain(ADVISORY);
  });

  test('busca nova grava outcome answered só com metadados', async () => {
    await research(sql, {}, PERSON, TOPIC, CID);
    const rows = await sql`SELECT provider, outcome, results FROM lia_pesquisas`;
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('europepmc');
    expect(rows[0].outcome).toBe('answered');
    expect(JSON.stringify(rows[0].results)).not.toContain('abstract');
  });

  test('acerto no registro devolve cached sem chamar a rede nem gastar o limite', async () => {
    await research(sql, {}, PERSON, TOPIC, CID);
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(out.research.cached).toBe(true);
    expect(out.research.items).toHaveLength(1);
    const [row] = await sql`SELECT attempts FROM rate_limit_buckets WHERE bucket = 'ASSISTANT_RESEARCH'`;
    expect(Number(row.attempts)).toBe(1);
  });

  test('busca sem itens grava empty e o próximo pedido sai do registro', async () => {
    fetchSpy.mockResolvedValueOnce(okResponse([]));
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out.research.items).toEqual([]);
    expect(out.reply).toContain('Não encontrei referências');
    const rows = await sql`SELECT outcome FROM lia_pesquisas`;
    expect(rows.map((r) => r.outcome)).toEqual(['empty']);
    const again = await research(sql, {}, PERSON, TOPIC, CID);
    expect(again.research.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('status não 2xx leva a failed, registra só o código e não grava nada', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out.success).toBe(true);
    expect(out.research).toMatchObject({ failed: true, cached: false, items: [] });
    expect(out.reply).toContain('Não consegui consultar a base de referências');
    const logs = await sql`SELECT code FROM error_logs`;
    expect(logs.map((l) => l.code)).toEqual(['ASSISTANT_RESEARCH_FAILED']);
    expect(await sql`SELECT id FROM lia_pesquisas`).toHaveLength(0);
  });

  test('JSON inválido leva a failed', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } });
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out.research.failed).toBe(true);
  });

  test('resposta sem a lista de resultados leva a failed', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ hitCount: 3 }) });
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out.research.failed).toBe(true);
  });

  test('tempo esgotado (5 s) leva a failed', async () => {
    fetchSpy.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out.research.failed).toBe(true);
    expect(out.research.items).toEqual([]);
  }, 15000);

  test('link de host fora da lista sai sem url, mesmo vindo do registro', async () => {
    const results = JSON.stringify({ items: [{ title: 'x', url: 'https://evil.example.com/a' }] });
    await sql`INSERT INTO lia_pesquisas (provider, query_norm, kb_version, outcome, results, expires_at)
      VALUES ('europepmc', 'efeitos hepaticos paracetamol', '', 'answered', ${results}::jsonb, now() + interval '7 days')`;
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.research.cached).toBe(true);
    expect(out.research.items[0].url).toBeNull();
  });

  test('link vem do PMID, depois do DOI, e sem id não há link', async () => {
    fetchSpy.mockResolvedValueOnce(okResponse([
      { title: 'a', pmid: '123' },
      { title: 'b', doi: '10.2/y' },
      { title: 'c' },
    ]));
    const out = await research(sql, {}, PERSON, TOPIC, CID);
    expect(out.research.items.map((i) => i.url)).toEqual([
      'https://europepmc.org/article/MED/123',
      'https://doi.org/10.2/y',
      null,
    ]);
  });

  test('limite: 10 buscas novas por hora por pessoa; a 11ª volta limitada', async () => {
    const topics = [
      'asma infantil tratamento', 'dengue hemorragica sintomas', 'hipertensao arterial controle',
      'anemia ferropriva diagnostico', 'gripe sazonal vacina', 'obesidade infantil causas',
      'sepse neonatal manejo', 'tuberculose latente rastreio', 'hepatite viral transmissao',
      'diabetes gestacional rastreamento', 'pneumonia adquirida comunidade',
    ];
    for (const topic of topics.slice(0, 10)) {
      await research(sql, {}, PERSON, topic, CID);
    }
    const out = await research(sql, {}, PERSON, topics[10], CID);
    expect(out).toMatchObject({ success: false, limited: true });
    expect(fetchSpy).toHaveBeenCalledTimes(10);
  });

  test('o texto da pergunta nunca aparece no log', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await research(sql, {}, PERSON, 'efeitos hepáticos do paracetamol em jejum', CID);
    const logs = await sql`SELECT code, message, context FROM error_logs`;
    const dump = JSON.stringify([logs, errSpy.mock.calls]);
    expect(dump).toContain('ASSISTANT_RESEARCH_FAILED');
    expect(dump).not.toContain('hepatic');
    expect(dump).not.toContain('paracetamol');
    expect(dump).not.toContain('jejum');
  });
});
