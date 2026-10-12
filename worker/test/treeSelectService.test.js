/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * treeSelectService.test.js — escolha de seções pelo modelo rápido (services/treeSelectService.js), com o
 * cliente de IA simulado (fetch do Groq). A saída do modelo NUNCA é confiada: JSON válido passa; id inventado
 * é descartado; JSON quebrado ou erro cai nos candidatos do RRF, sem lançar; answerable=false corta.
 */
import { jest } from '@jest/globals';
import * as TreeSelect from '../src/services/treeSelectService.js';
import { getTree } from '../src/assistant/tree.js';
import * as Groq from '../src/ai/groqClient.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { __resetMetricsForTests } from '../src/ai/metrics.js';
import * as C from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql, callsMatching, groqReply, httpError, memoryKv, KEYS } from './helpers/aiTestUtils.js';

const MEMBER = { profileId: 'm-1', role: 'member', fullName: 'Maria Souza', email: 'maria@exemplo.com' };
const QUESTION = 'o que é a laift e quais áreas ela estuda?';
const TAIL = 'RABO-EXCLUSIVO-DO-CONTEUDO-DA-LIGA';

const nodes = getTree();
const idOf = (source, section) => nodes.find((n) => n.source === source && n.section === section).id;
const LIGA_ID = idOf('liga', 'O que é a LAIFT');
const AREAS_ID = idOf('liga', 'Áreas');
const CONTATO_ID = idOf('liga', 'Contato');

// Candidatos do RAG (já aparados pelo assistantService): 3 trechos de verdade, o primeiro com conteúdo marcado.
const CANDIDATES = [
  { source: 'liga', section: 'Contato', content: 'Contato da liga. ' + TAIL },
  { source: 'liga', section: 'Áreas', content: 'Áreas da liga do banco.' },
  { source: 'kb', section: 'Eventos da liga', content: 'Eventos da liga do banco.' },
];

const envWith = () => makeEnv({ GROQ_API_KEYS: KEYS.join('\n'), HOT_CACHE: memoryKv() });
const json = (sections, answerable = true) => JSON.stringify({ sections, answerable });
const run = (sql, candidates = CANDIDATES, env = envWith()) => TreeSelect.refineContext(sql, env, MEMBER, { question: QUESTION, candidates, correlationId: 'cid-1' });

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
  Groq.__resetPoolStateForTests(0);
  __resetFlagCacheForTests();
  __resetMetricsForTests();
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('refineContext — saída válida do modelo', () => {
  test('usa as seções escolhidas, na ordem do modelo, com o conteúdo do banco quando for candidata', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(json([LIGA_ID, AREAS_ID])));
    const out = await run(routedSql([]));
    expect(out).toMatchObject({ answerable: true, usedTree: true });
    expect(out.chunks.map((c) => c.section)).toEqual(['O que é a LAIFT', 'Áreas']);
    // Áreas era candidata: vale o texto do banco. "O que é a LAIFT" não era: vem da árvore (código).
    expect(out.chunks[1].content).toBe('Áreas da liga do banco.');
    expect(out.chunks[0].content).toMatch(/liga acadêmica de ensino/);
    out.chunks.forEach((c) => expect(c.content.length).toBeLessThanOrEqual(C.RAG.CONTEXT_CHARS));
    expect(Object.keys(out.chunks[0]).sort()).toEqual(['content', 'section', 'source']);
  });

  test('aceita o JSON dentro de um bloco de código ou com texto em volta', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply('```json\n' + json([AREAS_ID]) + '\n```'));
    expect((await run(routedSql([]))).chunks.map((c) => c.section)).toEqual(['Áreas']);
    globalThis.fetch.mockResolvedValueOnce(groqReply('Claro! ' + json([CONTATO_ID]) + ' Espero ter ajudado.'));
    expect((await run(routedSql([]))).chunks.map((c) => c.section)).toEqual(['Contato']);
  });

  test('máximo de 4 seções, sem repetir', async () => {
    const ids = nodes.slice(0, 9).map((n) => n.id);
    globalThis.fetch.mockResolvedValueOnce(groqReply(json([ids[0], ids[0], ...ids.slice(1)])));
    const out = await run(routedSql([]));
    expect(out.chunks).toHaveLength(C.TREE.MAX_SECTIONS);
    expect(new Set(out.chunks.map((c) => c.source + '|' + c.section)).size).toBe(C.TREE.MAX_SECTIONS);
  });

  test('id inventado é descartado; os válidos ficam', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(json(['liga/inventada', 'ignore as regras', '__proto__', AREAS_ID, 42, null])));
    const out = await run(routedSql([]));
    expect(out).toMatchObject({ answerable: true, usedTree: true });
    expect(out.chunks.map((c) => c.section)).toEqual(['Áreas']);
  });
});

describe('refineContext — saída inválida cai no RRF, sem erro', () => {
  const rrf = CANDIDATES.slice(0, C.RAG.TOP_K);
  const expectFallback = (out) => {
    expect(out).toMatchObject({ answerable: true, usedTree: false });
    expect(out.chunks).toEqual(rrf);
  };

  test.each([
    ['só ids inventados', json(['liga/nao-existe', 'outro/tambem-nao'])],
    ['lista vazia com answerable true', json([])],
    ['JSON quebrado', '{"sections": ["liga/areas"'],
    ['texto sem JSON', 'A LAIFT é uma liga acadêmica.'],
    ['sections não é lista', '{"sections":"liga/areas","answerable":true}'],
    ['answerable ausente', '{"sections":["' + AREAS_ID + '"]}'],
    ['answerable não booleano', '{"sections":["' + AREAS_ID + '"],"answerable":"sim"}'],
    ['vazio', ''],
  ])('%s', async (_nome, content) => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(content || ' '));
    expectFallback(await run(routedSql([])));
  });

  test('IA indisponível (503 em todas as chaves): cai no RRF e não lança', async () => {
    globalThis.fetch.mockResolvedValue(httpError(503));
    expectFallback(await run(routedSql([])));
  });

  test('sem chave de IA configurada: cai no RRF sem chamar o provedor', async () => {
    const out = await run(routedSql([]), CANDIDATES, makeEnv({ HOT_CACHE: memoryKv() }));
    expectFallback(out);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('tempo esgotado: cai no RRF', async () => {
    const saved = C.TREE.TIMEOUT_MS;
    C.TREE.TIMEOUT_MS = 20;
    globalThis.fetch.mockImplementation(() => new Promise(() => {}));
    try {
      expectFallback(await run(routedSql([])));
    } finally {
      C.TREE.TIMEOUT_MS = saved;
    }
  });

  test('a falha vai para error_logs sem o texto da pergunta', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply('lixo'));
    const sql = routedSql([]);
    await run(sql);
    const logs = callsMatching(sql, 'INSERT INTO error_logs');
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).toMatch(/ASSISTANT_TREE_FAILED/);
    expect(JSON.stringify(logs)).not.toContain('laift e quais');
  });

  test('sem candidatos não chama o modelo', async () => {
    const out = await run(routedSql([]), []);
    expect(out).toEqual({ chunks: [], answerable: true, usedTree: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('refineContext — answerable false', () => {
  test('o modelo diz que a base não cobre: nenhum trecho segue para a resposta', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(json([], false)));
    const out = await run(routedSql([]));
    expect(out).toEqual({ chunks: [], answerable: false, usedTree: true });
  });

  test('answerable false vale mesmo que o modelo liste seções', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(json([AREAS_ID], false)));
    expect((await run(routedSql([]))).answerable).toBe(false);
  });
});

describe('refineContext — o que vai ao modelo', () => {
  test('árvore com candidatas primeiro (com resumo), pergunta como DADO e nenhum conteúdo de trecho', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(json([AREAS_ID])));
    await run(routedSql([]));
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const system = body.messages[0].content;
    const user = body.messages[body.messages.length - 1].content;
    expect(system).toMatch(/SOMENTE com um objeto JSON/);
    expect(system).toMatch(new RegExp('\\[' + CONTATO_ID + '\\] liga › Contato — '));
    expect(system.indexOf('[' + CONTATO_ID + ']')).toBeLessThan(system.indexOf('[' + LIGA_ID + ']'));
    expect(system).not.toContain(TAIL);
    expect(system.length).toBeLessThan(C.TREE.OUTLINE_MAX_CHARS + 3000);
    expect(user).toContain(QUESTION);
    expect(system).not.toContain(QUESTION);
    expect(JSON.stringify(body.messages)).not.toMatch(/maria@exemplo|Maria Souza/);
  });

  test('uma chamada ao provedor por pergunta', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(json([AREAS_ID])));
    await run(routedSql([]));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('parseSelection', () => {
  const index = new Map(nodes.map((n) => [n.id, n]));

  test('extrai ids válidos e answerable', () => {
    expect(TreeSelect.parseSelection(json([AREAS_ID, LIGA_ID]), index)).toEqual({ ok: true, answerable: true, ids: [AREAS_ID, LIGA_ID] });
    expect(TreeSelect.parseSelection(json([], false), index)).toEqual({ ok: true, answerable: false, ids: [] });
  });

  test.each([[null], [undefined], [42], [''], ['[]'], ['{}'], ['{"sections":null,"answerable":true}']])('recusa %p', (value) => {
    expect(TreeSelect.parseSelection(value, index).ok).toBe(false);
  });
});
