/**
 * Utilitários dos testes da Fase 3 (IA/clínica).
 *
 * routedSql: mock de `sql` que responde pelo TEXTO da consulta, não pela
 * ordem das chamadas. Os services de IA fazem várias consultas por
 * requisição (cota da pessoa, disjuntor global, ai_usage_log, insert,
 * auditoria); depender da ordem com mockResolvedValueOnce deixaria os
 * testes frágeis a qualquer reordenação inofensiva.
 */
import { jest } from '@jest/globals';

export const RATE_LIMIT_SQL = 'INSERT INTO rate_limit_buckets';

export function sqlText(call) {
  const first = call[0];
  return Array.isArray(first) ? first.join('?') : String(first);
}

export function routedSql(routes) {
  return jest.fn((strings, ...values) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    for (const [fragment, result] of routes || []) {
      if (text.includes(fragment)) {
        const value = typeof result === 'function' ? result(values, text) : result;
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    }
    if (text.includes(RATE_LIMIT_SQL)) return Promise.resolve([{ attempts: 1 }]);
    return Promise.resolve([]);
  });
}

export function callsMatching(sql, fragment) {
  return sql.mock.calls.filter((c) => sqlText(c).includes(fragment));
}

/** Resposta simulada do Groq (formato OpenAI). */
export function groqReply(content, opts) {
  const o = opts || {};
  const status = o.status || 200;
  const headers = new Map(Object.entries(o.headers || {}));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    json: async () => ({
      choices: [{ message: { content }, finish_reason: o.finishReason || 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 22 },
    }),
  };
}

export function httpError(status, headers) {
  return groqReply('', { status, headers });
}

export function abortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

/** Mock de Workers KV com armazenamento real em memória (get/put/delete). */
export function memoryKv() {
  const store = new Map();
  return {
    store,
    get: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    put: jest.fn(async (k, v) => { store.set(k, v); }),
    delete: jest.fn(async (k) => { store.delete(k); }),
  };
}

export const KEYS = ['gsk_live_key_number_one_AAAA1111', 'gsk_live_key_number_two_BBBB2222', 'gsk_live_key_number_three_CCCC3333'];
