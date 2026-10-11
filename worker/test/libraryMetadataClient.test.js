/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { fetchMetadata, assertAllowedUrl } from '../src/library/metadataClient.js';
import { LIBRARY_LIMITS } from '../src/library/limits.js';

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'library-upstream.json'), 'utf8'));
const clone = (value) => structuredClone(value);
const PLOS = FIXTURE.plos;
const NATURE = FIXTURE.nature;
const PLOS_DOI = PLOS.doi;
const NATURE_DOI = NATURE.doi;
const EMAIL = 'biblioteca@example.org';
const ENV = { LIBRARY_CONTACT_EMAIL: EMAIL };
const NOW = Date.parse('2026-10-10T12:00:00Z');
const HOSTS = {
  crossref: 'api.crossref.org',
  epmc: 'www.ebi.ac.uk',
  openalex: 'api.openalex.org',
  pubmed: 'eutils.ncbi.nlm.nih.gov',
  unpaywall: 'api.unpaywall.org',
};
const ALLOWED_PREFIXES = [
  'https://api.crossref.org/',
  'https://www.ebi.ac.uk/europepmc/webservices/rest/',
  'https://api.openalex.org/',
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
  'https://api.unpaywall.org/',
];
const TIMEOUT_MESSAGE = 'Não foi possível obter os dados deste DOI agora. Tente de novo em alguns minutos.';

// ---------- respostas falsas ----------
const ok = (obj) => () => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
const http = (status, headers = {}) => () => new Response('{}', { status, headers });
const rawText = (text, headers = {}) => () => new Response(text, { status: 200, headers });
const hang = () => (options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
});

/** table: { 'host': [resposta1, resposta2, ...] }; a última se repete. */
function createFetch(table, { onCall } = {}) {
  const calls = [];
  const state = { inFlight: 0, maxInFlight: 0, perHost: {} };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      if (onCall) onCall(url);
      await new Promise((resolve) => setImmediate(resolve));
      const host = new URL(url).hostname;
      const replies = table[host];
      if (!replies) throw new Error(`sem rota para ${host}`);
      const index = Math.min(state.perHost[host] ?? 0, replies.length - 1);
      state.perHost[host] = (state.perHost[host] ?? 0) + 1;
      return await replies[index](options);
    } finally {
      state.inFlight -= 1;
    }
  };
  return { fetchImpl, calls, state };
}

function fullTable(sample) {
  return {
    [HOSTS.crossref]: [ok(sample.crossref)],
    [HOSTS.epmc]: [ok(sample.europepmc)],
    [HOSTS.openalex]: [ok(sample.openalex)],
    [HOSTS.pubmed]: [ok(sample.pubmed)],
    [HOSTS.unpaywall]: [ok(sample.unpaywall)],
  };
}

function run(identifier, table, { env = ENV, ...rest } = {}) {
  const fake = createFetch(table);
  const sleep = jest.fn(async () => {});
  const promise = fetchMetadata(identifier, { env, fetchImpl: fake.fetchImpl, sleep, now: () => NOW, ...rest });
  return { promise, sleep, ...fake };
}

const doiId = (value) => ({ kind: 'doi', value });
const pmidId = (value) => ({ kind: 'pmid', value });
const hostsOf = (calls) => calls.map((c) => new URL(c.url).hostname);

// ---------- caminho feliz ----------
describe('fetchMetadata com DOI completo', () => {
  test('consulta Crossref, Europe PMC e OpenAlex nessa ordem, em 3 chamadas', async () => {
    const t = run(doiId(PLOS_DOI), fullTable(PLOS));
    await t.promise;
    expect(hostsOf(t.calls)).toEqual([HOSTS.crossref, HOSTS.epmc, HOSTS.openalex]);
  });

  test('PLOS (CC BY): registro completo e licença aberta', async () => {
    const { record, sources, warnings } = await run(doiId(PLOS_DOI), fullTable(PLOS)).promise;
    expect(record.doi).toBe(PLOS_DOI);
    expect(record.pmid).toBe('17375194');
    expect(record.pmcid).toBe('PMC1817752');
    expect(record.title).toBe('Sharing Detailed Research Data Is Associated with Increased Citation Rate');
    expect(record.authors.length).toBeGreaterThan(0);
    expect(record.authors[0]).toEqual({ family: 'Piwowar', given: 'Heather A.' });
    expect(record.authorCount).toBe(3);
    expect(record.journal).toBe('PLoS ONE');
    expect(record.journalAbbrev).toBe('PLoS ONE');
    expect(record.year).toBe(2007);
    expect(record.volume).toBe('2');
    expect(record.issue).toBe('3');
    expect(record.pages).toBe('e308');
    expect(record.language).toBe('en');
    expect(record.type).toBe('artigo');
    expect(record.license).toBe('cc-by');
    expect(record.licenseSource).toBe('crossref');
    expect(record.licenseConflict).toBe(false);
    expect(record.oaStatus).toBe('gold');
    expect(record.landingUrl).toBe('https://doi.org/10.1371/journal.pone.0000308');
    expect(record.sourceAbstract).toContain('Sharing research data');
    expect(record.sourceAbstract).not.toMatch(/[<>]/);
    expect(record.metadataSources).toEqual(['crossref', 'europepmc', 'openalex']);
    expect(sources).toEqual(['crossref', 'europepmc', 'openalex']);
    expect(record.searchNorm).toContain('piwowar');
    expect(record.searchNorm).toContain('10.1371/journal.pone.0000308');
    expect(warnings).toEqual([]);
  });

  test('o registro tem exatamente os campos de library_articles que vêm de fora', async () => {
    const { record } = await run(doiId(PLOS_DOI), fullTable(PLOS)).promise;
    expect(Object.keys(record).sort()).toEqual([
      'authorCount', 'authors', 'doi', 'issue', 'journal', 'journalAbbrev', 'landingUrl', 'language',
      'license', 'licenseConflict', 'licenseSource', 'metadataSources', 'oaStatus', 'pages', 'pmcid',
      'pmid', 'searchNorm', 'sourceAbstract', 'title', 'type', 'volume', 'year',
    ]);
  });

  test('Nature (sem licença CC): licença desconhecida e acesso bronze', async () => {
    const { record } = await run(doiId(NATURE_DOI), fullTable(NATURE)).promise;
    expect(record.license).toBe('desconhecida');
    expect(record.licenseSource).toBeNull();
    expect(record.licenseConflict).toBe(false);
    expect(record.oaStatus).toBe('bronze');
    expect(record.pmid).toBe('23903748');
    expect(record.journal).toBe('Nature');
    expect(record.pages).toBe('54-58');
  });

  test('o resultado é imutável e usa cópias (sem tocar a entrada)', async () => {
    const { record } = await run(doiId(PLOS_DOI), fullTable(PLOS)).promise;
    expect(Object.isFrozen(record)).toBe(true);
  });
});

// ---------- PMID ----------
describe('fetchMetadata com PMID', () => {
  test('Europe PMC por EXT_ID primeiro, depois Crossref e OpenAlex com o DOI achado', async () => {
    const t = run(pmidId('23903748'), fullTable(NATURE));
    const { record } = await t.promise;
    expect(hostsOf(t.calls)).toEqual([HOSTS.epmc, HOSTS.crossref, HOSTS.openalex]);
    expect(decodeURIComponent(t.calls[0].url)).toContain('EXT_ID:23903748 AND SRC:MED');
    expect(t.calls[0].url).toContain('resultType=core');
    expect(t.calls[1].url).toContain('/works/10.1038/nature12373');
    expect(record.doi).toBe(NATURE_DOI);
    expect(record.pmid).toBe('23903748');
  });

  test('sem DOI em lugar nenhum: cadastra só com o PMID e o link do PubMed', async () => {
    const sample = clone(NATURE);
    delete sample.europepmc.resultList.result[0].doi;
    const t = run(pmidId('23903748'), fullTable(sample));
    const { record } = await t.promise;
    expect(t.calls).toHaveLength(1);
    expect(record.doi).toBeNull();
    expect(record.pmid).toBe('23903748');
    expect(record.landingUrl).toBe('https://pubmed.ncbi.nlm.nih.gov/23903748/');
  });

  test('Europe PMC falhando: PubMed (com e-mail) fornece os dados e o DOI', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.epmc] = [http(500)];
    const t = run(pmidId('17375194'), table);
    const { record, sources, warnings } = await t.promise;
    expect(hostsOf(t.calls)).toEqual([HOSTS.epmc, HOSTS.pubmed, HOSTS.crossref, HOSTS.openalex]);
    expect(t.calls[1].url).toContain('db=pubmed&id=17375194&retmode=json&tool=laift_biblioteca&email=');
    expect(record.doi).toBe(PLOS_DOI);
    expect(record.pmcid).toBe('PMC1817752');
    expect(sources).toContain('pubmed');
    expect(sources).not.toContain('europepmc');
    expect(warnings.some((w) => w.includes('Europe PMC'))).toBe(true);
  });

  test('PubMed: autor "Piwowar HA" vira sobrenome e iniciais', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.epmc] = [http(500)];
    table[HOSTS.crossref] = [http(404)];
    table[HOSTS.openalex] = [http(404)];
    const { record } = await run(pmidId('17375194'), table).promise;
    expect(record.authors[0]).toEqual({ family: 'Piwowar', given: 'HA' });
    expect(record.journalAbbrev).toBe('PLoS One');
    expect(record.year).toBe(2007);
  });

  test('Europe PMC falhando e sem e-mail: não chama PubMed e lança o erro de PMID', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.epmc] = [http(500)];
    const t = run(pmidId('17375194'), table, { env: {} });
    await expect(t.promise).rejects.toMatchObject({ name: 'ValidationError' });
    expect(hostsOf(t.calls)).toEqual([HOSTS.epmc]);
  });
});

// ---------- segurança ----------
describe('hosts fixos (SSRF)', () => {
  test('toda URL chamada começa por um dos 5 hosts do contrato (cenário com todos os caminhos)', async () => {
    const urls = [];
    const scenarios = [
      [doiId(PLOS_DOI), fullTable(PLOS)],
      [pmidId('17375194'), { ...fullTable(PLOS), [HOSTS.epmc]: [http(500)], [HOSTS.openalex]: [http(500)] }],
      [doiId(NATURE_DOI), { ...fullTable(NATURE), [HOSTS.openalex]: [http(404)] }],
    ];
    for (const [identifier, table] of scenarios) {
      const t = run(identifier, table);
      await t.promise;
      urls.push(...t.calls.map((c) => c.url));
    }
    expect(urls.length).toBeGreaterThan(8);
    expect(hostsOf(urls.map((url) => ({ url })))).toEqual(expect.arrayContaining([HOSTS.unpaywall, HOSTS.pubmed]));
    for (const url of urls) {
      expect(ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))).toBe(true);
    }
  });

  test('assertAllowedUrl recusa host, esquema e credencial fora do contrato', () => {
    expect(() => assertAllowedUrl('https://api.crossref.org/works/10.1000%2Fx')).not.toThrow();
    for (const bad of [
      'https://evil.example/works/x',
      'http://api.crossref.org/works/x',
      'https://api.crossref.org.evil.example/works/x',
      'https://usuario@api.crossref.org/works/x',
      'https://api.crossref.org:8443/works/x',
      'ftp://api.crossref.org/x',
      'api.crossref.org/works/x',
      '',
    ]) {
      expect(() => assertAllowedUrl(bad)).toThrow();
    }
  });

  test('cada chamada usa as opções do contrato (sem cookies, sem redirecionamento, JSON)', async () => {
    const t = run(doiId(PLOS_DOI), fullTable(PLOS));
    await t.promise;
    for (const { options } of t.calls) {
      expect(options.credentials).toBe('omit');
      expect(options.redirect).toBe('error');
      expect(options.headers.Accept).toBe('application/json');
      expect(options.headers['User-Agent']).toBe('LAIFT-Biblioteca/1.0');
      expect(options.signal).toBeDefined();
    }
  });

  test('identificador inválido é recusado antes de qualquer chamada', async () => {
    for (const bad of [doiId('10.1000/XYZ'), doiId('https://evil.example'), pmidId('abc'), { kind: 'url', value: 'x' }, null]) {
      const t = run(bad, fullTable(PLOS));
      await expect(t.promise).rejects.toMatchObject({ name: 'ValidationError' });
      expect(t.calls).toHaveLength(0);
    }
  });

  test('aceita o texto cru também (passa por parseIdentifier)', async () => {
    const t = run('https://doi.org/10.1371/journal.pone.0000308', fullTable(PLOS));
    const { record } = await t.promise;
    expect(record.doi).toBe(PLOS_DOI);
  });

  test('nenhuma URL vinda das fontes aparece no resultado; só a landingUrl montada', async () => {
    const sample = clone(PLOS);
    sample.crossref.message.URL = 'https://evil.example/crossref';
    sample.crossref.message.link = [{ URL: 'https://evil.example/pdf' }];
    sample.europepmc.resultList.result[0].fullTextUrlList = { fullTextUrl: [{ url: 'https://evil.example/epmc' }] };
    sample.openalex.primary_location.landing_page_url = 'https://evil.example/openalex';
    sample.openalex.open_access.oa_url = 'https://evil.example/oa';
    sample.unpaywall.best_oa_location.url = 'https://evil.example/unpaywall';
    const result = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    const text = JSON.stringify(result);
    expect(text).not.toContain('evil.example');
    const { landingUrl, ...rest } = result.record;
    expect(landingUrl).toBe('https://doi.org/10.1371/journal.pone.0000308');
    expect(JSON.stringify(rest)).not.toMatch(/https?:\/\//);
  });

  test('marcação nos textos de fora é removida', async () => {
    const sample = clone(PLOS);
    sample.crossref.message.title = ['Efeito de <i>E. coli</i> &amp; <script>alert(1)</script>drogas'];
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.title).not.toMatch(/[<>]/);
    expect(record.title).toContain('E. coli & alert(1)drogas');
  });

  test('Crossref que devolve outro DOI é descartada com aviso (comparação sem diferenciar maiúsculas)', async () => {
    const other = clone(PLOS);
    other.crossref.message.DOI = '10.9999/outro';
    const { sources, warnings, record } = await run(doiId(PLOS_DOI), fullTable(other)).promise;
    expect(sources).not.toContain('crossref');
    expect(warnings.some((w) => /Crossref/.test(w) && /DOI/.test(w))).toBe(true);
    expect(record.journal).not.toBe(PLOS.crossref.message['container-title'][0]); // nada do registro descartado

    const upper = clone(PLOS);
    upper.crossref.message.DOI = PLOS_DOI.toUpperCase();
    expect((await run(doiId(PLOS_DOI), fullTable(upper)).promise).sources).toContain('crossref');
  });

  test('Crossref sem o campo DOI também é descartada', async () => {
    const sample = clone(PLOS);
    delete sample.crossref.message.DOI;
    expect((await run(doiId(PLOS_DOI), fullTable(sample)).promise).sources).not.toContain('crossref');
  });

  test('OpenAlex que devolve outro DOI é descartada com aviso; aceita a forma de URL em maiúsculas', async () => {
    const other = clone(PLOS);
    other.openalex.doi = 'https://doi.org/10.9999/outro';
    const { sources, warnings } = await run(doiId(PLOS_DOI), fullTable(other)).promise;
    expect(sources).not.toContain('openalex');
    expect(warnings.some((w) => /OpenAlex/.test(w) && /DOI/.test(w))).toBe(true);

    const upper = clone(PLOS);
    upper.openalex.doi = 'https://doi.org/' + PLOS_DOI.toUpperCase();
    expect((await run(doiId(PLOS_DOI), fullTable(upper)).promise).sources).toContain('openalex');
  });

  test('Unpaywall que devolve outro DOI é descartada com aviso', async () => {
    const other = clone(PLOS);
    other.unpaywall.doi = '10.9999/outro';
    const table = { ...fullTable(other), [HOSTS.openalex]: [http(500)] };
    const { sources, warnings, record } = await run(doiId(PLOS_DOI), table).promise;
    expect(sources).not.toContain('unpaywall');
    expect(record.oaStatus).not.toBe('gold');
    expect(warnings.some((w) => /Unpaywall/.test(w) && /DOI/.test(w))).toBe(true);
  });

  test('Crossref de outro DOI e Europe PMC fora do ar: erro do contrato, nada é gravado', async () => {
    const other = clone(PLOS);
    other.crossref.message.DOI = '10.9999/outro';
    const table = { ...fullTable(other), [HOSTS.epmc]: [http(500)] };
    await expect(run(doiId(PLOS_DOI), table).promise).rejects.toMatchObject({ name: 'ValidationError', message: TIMEOUT_MESSAGE });
  });

  test('DOI com "../" é recusado antes de qualquer chamada (nenhum host recebe o caminho)', async () => {
    for (const value of ['10.1234/../../funders', '10.1234/a//b']) {
      const t = run(doiId(value), fullTable(PLOS));
      await expect(t.promise).rejects.toMatchObject({ name: 'ValidationError' });
      expect(t.calls).toHaveLength(0);
    }
  });

  test('Europe PMC que devolve outro DOI é ignorada', async () => {
    const sample = clone(PLOS);
    sample.europepmc.resultList.result[0].doi = '10.9999/outro';
    sample.europepmc.resultList.result[0].pmid = '999';
    const { record, sources } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(sources).not.toContain('europepmc');
    expect(record.pmid).toBe('17375194'); // vem do OpenAlex (ids.pmid), nunca do resultado trocado
  });
});

// ---------- série, repetição, limites ----------
describe('chamadas em série, repetição e limites', () => {
  test('nunca duas chamadas ao mesmo tempo', async () => {
    const table = { ...fullTable(PLOS), [HOSTS.openalex]: [http(500)] };
    const t = run(doiId(PLOS_DOI), table);
    await t.promise;
    expect(t.calls.length).toBeGreaterThanOrEqual(4);
    expect(t.state.maxInFlight).toBe(1);
  });

  test('429 com Retry-After: 1 repete uma vez depois de 1000 ms', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [http(429, { 'Retry-After': '1' }), ok(PLOS.crossref)];
    const t = run(doiId(PLOS_DOI), table);
    const { sources } = await t.promise;
    expect(hostsOf(t.calls).filter((h) => h === HOSTS.crossref)).toHaveLength(2);
    expect(t.sleep).toHaveBeenCalledTimes(1);
    expect(t.sleep).toHaveBeenCalledWith(1000);
    expect(sources).toContain('crossref');
  });

  test('503 sem Retry-After espera 1 s; Retry-After alto é limitado a 2 s', async () => {
    const a = fullTable(PLOS);
    a[HOSTS.crossref] = [http(503), ok(PLOS.crossref)];
    const ta = run(doiId(PLOS_DOI), a);
    await ta.promise;
    expect(ta.sleep).toHaveBeenCalledWith(1000);

    const b = fullTable(PLOS);
    b[HOSTS.crossref] = [http(429, { 'Retry-After': '30' }), ok(PLOS.crossref)];
    const tb = run(doiId(PLOS_DOI), b);
    await tb.promise;
    expect(tb.sleep).toHaveBeenCalledWith(2000);
  });

  test('só uma repetição: 429 duas vezes vira aviso', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [http(429)];
    const t = run(doiId(PLOS_DOI), table);
    const { warnings, sources } = await t.promise;
    expect(hostsOf(t.calls).filter((h) => h === HOSTS.crossref)).toHaveLength(2);
    expect(sources).not.toContain('crossref');
    expect(warnings.some((w) => w.includes('Crossref'))).toBe(true);
  });

  test('404 não repete e vira aviso; o cadastro segue com as outras fontes', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [http(404)];
    const t = run(doiId(PLOS_DOI), table);
    const { record, warnings } = await t.promise;
    expect(hostsOf(t.calls).filter((h) => h === HOSTS.crossref)).toHaveLength(1);
    expect(t.sleep).not.toHaveBeenCalled();
    expect(warnings.some((w) => w.includes('Crossref'))).toBe(true);
    expect(record.title).toBe('Sharing detailed research data is associated with increased citation rate'); // Europe PMC, sem o ponto final
    expect(record.journal).toBe('PloS one'); // Europe PMC preencheu
  });

  test('tempo esgotado vira aviso e a chamada é abortada', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.epmc] = [hang()];
    const t = run(doiId(PLOS_DOI), table, { timeoutMs: 25 });
    const { warnings, sources } = await t.promise;
    expect(t.calls.find((c) => c.url.includes('ebi.ac.uk')).options.signal.aborted).toBe(true);
    expect(sources).not.toContain('europepmc');
    expect(warnings.some((w) => w.includes('Europe PMC'))).toBe(true);
  });

  test('o tempo vale também para fetch que ignora o sinal', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.openalex] = [() => new Promise(() => {})];
    const t = run(doiId(PLOS_DOI), table, { timeoutMs: 25 });
    const { warnings } = await t.promise;
    expect(warnings.some((w) => w.includes('OpenAlex'))).toBe(true);
  });

  test('o tempo padrão é o de limits.js', () => {
    expect(LIBRARY_LIMITS.UPSTREAM_TIMEOUT_MS).toBe(8000);
  });

  test('corpo acima de UPSTREAM_MAX_BYTES é recusado (leitura em fluxo)', async () => {
    const big = JSON.stringify({ x: 'a'.repeat(LIBRARY_LIMITS.UPSTREAM_MAX_BYTES) });
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [rawText(big)];
    const { warnings, sources } = await run(doiId(PLOS_DOI), table).promise;
    expect(sources).not.toContain('crossref');
    expect(warnings.some((w) => w.includes('Crossref'))).toBe(true);
  });

  test('Content-Length acima do teto é recusado sem ler o corpo', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [() => {
      const res = new Response(JSON.stringify(PLOS.crossref), { status: 200 });
      Object.defineProperty(res.headers, 'get', {
        value: (name) => (String(name).toLowerCase() === 'content-length' ? String(LIBRARY_LIMITS.UPSTREAM_MAX_BYTES + 1) : null),
      });
      return res;
    }];
    const { sources } = await run(doiId(PLOS_DOI), table).promise;
    expect(sources).not.toContain('crossref');
  });

  test('JSON inválido vira aviso', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.openalex] = [rawText('<html>não é json</html>')];
    const { warnings, sources } = await run(doiId(PLOS_DOI), table).promise;
    expect(sources).not.toContain('openalex');
    expect(warnings.some((w) => w.includes('OpenAlex'))).toBe(true);
  });

  test('Crossref e Europe PMC falhando com DOI lançam a ValidationError do contrato, sem chamar o resto', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [http(500)];
    table[HOSTS.epmc] = [hang()];
    const t = run(doiId(PLOS_DOI), table, { timeoutMs: 25 });
    await expect(t.promise).rejects.toMatchObject({ name: 'ValidationError', message: TIMEOUT_MESSAGE });
    expect(hostsOf(t.calls)).not.toContain(HOSTS.openalex);
  });

  test('Europe PMC sem resultado e Crossref 404 também lançam o erro', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [http(404)];
    table[HOSTS.epmc] = [ok({ hitCount: 0, resultList: { result: [] } })];
    await expect(run(doiId(PLOS_DOI), table).promise).rejects.toMatchObject({ message: TIMEOUT_MESSAGE });
  });

  test('no máximo 6 chamadas por cadastro, repetições incluídas', async () => {
    const table = fullTable(PLOS);
    table[HOSTS.crossref] = [http(503), ok(PLOS.crossref)];
    table[HOSTS.epmc] = [http(503), ok(PLOS.europepmc)];
    table[HOSTS.openalex] = [http(503)];
    const t = run(doiId(PLOS_DOI), table);
    const { warnings } = await t.promise;
    expect(t.calls).toHaveLength(6);
    expect(hostsOf(t.calls)).not.toContain(HOSTS.unpaywall);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('estourou o orçamento de tempo: para e cadastra com o que tem, com aviso', async () => {
    const clock = { t: NOW };
    const fake = createFetch(fullTable(PLOS), { onCall: () => { clock.t += 15000; } });
    const sleep = jest.fn(async () => {});
    const { record, warnings } = await fetchMetadata(doiId(PLOS_DOI), {
      env: ENV, fetchImpl: fake.fetchImpl, sleep, now: () => clock.t,
    });
    expect(fake.calls).toHaveLength(2);
    expect(record.title).toBeTruthy();
    expect(warnings.some((w) => /tempo|limite/i.test(w))).toBe(true);
    expect(LIBRARY_LIMITS.IMPORT_BUDGET_MS).toBe(20000);
  });
});

// ---------- e-mail de contato ----------
describe('e-mail de contato (LIBRARY_CONTACT_EMAIL)', () => {
  test('com e-mail válido: Crossref leva mailto; Unpaywall entra quando o OpenAlex falha', async () => {
    const table = { ...fullTable(PLOS), [HOSTS.openalex]: [http(500)] };
    const t = run(doiId(PLOS_DOI), table);
    const { record, sources } = await t.promise;
    expect(t.calls[0].url).toContain('?mailto=' + encodeURIComponent(EMAIL));
    const last = t.calls[t.calls.length - 1].url;
    expect(last.startsWith('https://api.unpaywall.org/v2/10.1371/journal.pone.0000308?email=')).toBe(true);
    expect(sources).toContain('unpaywall');
    expect(record.oaStatus).toBe('gold');
  });

  test.each([
    ['ausente', {}],
    ['vazio', { LIBRARY_CONTACT_EMAIL: '' }],
    ['inválido', { LIBRARY_CONTACT_EMAIL: 'isto nao e email' }],
  ])('e-mail %s: Crossref sem mailto e nenhuma URL do PubMed ou Unpaywall', async (_nome, env) => {
    const table = { ...fullTable(PLOS), [HOSTS.openalex]: [http(500)] };
    const t = run(doiId(PLOS_DOI), table, { env });
    const { warnings, record } = await t.promise;
    expect(t.calls[0].url).toBe('https://api.crossref.org/works/10.1371/journal.pone.0000308');
    expect(t.calls[0].url).not.toContain('mailto');
    for (const { url } of t.calls) {
      expect(url).not.toContain(HOSTS.pubmed);
      expect(url).not.toContain(HOSTS.unpaywall);
    }
    expect(record.title).toBeTruthy();
    expect(warnings.some((w) => /OpenAlex/.test(w))).toBe(true);
  });

  test('sem env nenhum: não quebra', async () => {
    const fake = createFetch(fullTable(PLOS));
    const result = await fetchMetadata(doiId(PLOS_DOI), { fetchImpl: fake.fetchImpl, sleep: async () => {}, now: () => NOW });
    expect(result.record.doi).toBe(PLOS_DOI);
  });
});

// ---------- junção dos dados ----------
describe('licença do Unpaywall', () => {
  const onlyUnpaywall = (sample) => ({ ...fullTable(sample), [HOSTS.openalex]: [http(500)] });

  test('best_oa_location só vale como licença se for a versão publicada', async () => {
    const accepted = clone(NATURE);
    accepted.unpaywall.best_oa_location = { license: 'cc-by', version: 'acceptedVersion' };
    const noLicense = { ...accepted.crossref.message, license: undefined };
    accepted.crossref.message = noLicense;
    accepted.europepmc.resultList.result[0].license = undefined;
    const { record } = await run(doiId(NATURE_DOI), onlyUnpaywall(accepted)).promise;
    expect(record.license).toBe('desconhecida');

    const published = clone(accepted);
    published.unpaywall.best_oa_location.version = 'publishedVersion';
    expect((await run(doiId(NATURE_DOI), onlyUnpaywall(published)).promise).record.license).toBe('cc-by');
  });
});

describe('junção das fontes', () => {
  test('licenças divergentes: vale a mais restritiva e licenseConflict fica true', async () => {
    const sample = clone(PLOS);
    sample.openalex.primary_location.license = 'cc-by-nc';
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.license).toBe('cc-by-nc');
    expect(record.licenseSource).toBe('openalex');
    expect(record.licenseConflict).toBe(true);
  });

  test('Europe PMC "cc by" (com espaço) é reconhecida', async () => {
    const sample = clone(PLOS);
    sample.crossref.message.license = [];
    sample.openalex.primary_location.license = null;
    sample.openalex.best_oa_location = null;
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.license).toBe('cc-by');
    expect(record.licenseSource).toBe('europepmc');
  });

  test('autores: corta em 30 e guarda a contagem real', async () => {
    const sample = clone(PLOS);
    sample.crossref.message.author = Array.from({ length: 35 }, (_v, i) => ({ given: 'A', family: `Autor${i}` }));
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.authors).toHaveLength(30);
    expect(record.authorCount).toBe(35);
  });

  test('sem resumo nas outras fontes, o OpenAlex reconstrói o índice invertido', async () => {
    const sample = clone(PLOS);
    delete sample.europepmc.resultList.result[0].abstractText;
    sample.openalex.abstract_inverted_index = { Dados: [0], abertos: [1], ajudam: [2] };
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.sourceAbstract).toBe('Dados abertos ajudam');
  });

  test('Crossref com resumo JATS: tira a marcação e o título "Abstract"', async () => {
    const sample = clone(PLOS);
    sample.crossref.message.abstract = '<jats:title>Abstract</jats:title><jats:p>Texto <jats:italic>importante</jats:italic>.</jats:p>';
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.sourceAbstract).toBe('Texto importante.');
  });

  test('sem nenhum título nas fontes lança o erro do contrato', async () => {
    const sample = clone(PLOS);
    delete sample.crossref.message.title;
    delete sample.europepmc.resultList.result[0].title;
    delete sample.openalex.title;
    await expect(run(doiId(PLOS_DOI), fullTable(sample)).promise).rejects.toMatchObject({ message: TIMEOUT_MESSAGE });
  });

  test('o tipo vem do Europe PMC (pubTypeList) quando existe', async () => {
    const sample = clone(PLOS);
    sample.europepmc.resultList.result[0].pubTypeList = { pubType: ['Review', 'Journal Article'] };
    const { record } = await run(doiId(PLOS_DOI), fullTable(sample)).promise;
    expect(record.type).toBe('revisao');
  });
});
