/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * A Lia só fala da Biblioteca (resposta e botões) quando a flag library_enabled está ligada.
 */
import { jest } from '@jest/globals';
import * as Assistant from '../src/services/assistantService.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { __resetMetricsForTests } from '../src/ai/metrics.js';
import * as Groq from '../src/ai/groqClient.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql, memoryKv, groqReply, KEYS } from './helpers/aiTestUtils.js';

const MEMBER = { profileId: 'm-1', role: 'member', fullName: 'Maria Souza', email: 'maria@exemplo.com' };
const FLAG_ROW = (key, enabled = true) => ({ key, enabled, rollout_pct: 100, conditions: {} });
const flags = (...rows) => ['FROM feature_flags', rows];
const QUESTION = 'Como eu sugiro um artigo para a Biblioteca?';
const hasLibraryButton = (res) => res.actions.some((a) => a.target === 'panel-library' || a.type === 'open_library');

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
  globalThis.fetch.mockResolvedValue(groqReply('Posso ajudar com a plataforma.'));
  Groq.__resetPoolStateForTests(0);
  __resetFlagCacheForTests();
  __resetMetricsForTests();
  Assistant.__resetKbIndexForTests();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ask = (rows) => Assistant.chat(
  routedSql([flags(...rows)]),
  makeEnv({ GROQ_API_KEYS: KEYS.join('\n'), HOT_CACHE: memoryKv() }),
  MEMBER,
  { message: QUESTION },
  'cid-00000000-0000-4000-8000-000000000000',
);

describe('Lia — flag library_enabled', () => {
  test('ligada: responde pela base fixa e oferece o botão da Biblioteca', async () => {
    const res = await ask([FLAG_ROW('chatbot_enabled'), FLAG_ROW('library_enabled')]);
    expect(res.source).toBe('kb');
    expect(hasLibraryButton(res)).toBe(true);
  });

  test('desligada: a intenção da Biblioteca é ignorada e nenhum botão leva a ela', async () => {
    const res = await ask([FLAG_ROW('chatbot_enabled'), FLAG_ROW('library_enabled', false)]);
    expect(res.source).not.toBe('kb');
    expect(hasLibraryButton(res)).toBe(false);
  });

  test('sem a linha da flag (migração não aplicada): tratada como desligada', async () => {
    const res = await ask([FLAG_ROW('chatbot_enabled')]);
    expect(res.source).not.toBe('kb');
    expect(hasLibraryButton(res)).toBe(false);
  });
});
