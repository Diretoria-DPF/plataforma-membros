/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';

// index.js chama createDb(env.DATABASE_URL), que usa @neondatabase/serverless
// de verdade — mockamos o módulo inteiro para nunca tentar uma conexão real
// nestes testes de roteamento/CORS. Com ESM, o mock precisa ser registrado
// ANTES do import do módulo sob teste (por isso o import dinâmico abaixo,
// em vez de um import estático no topo do arquivo).
jest.unstable_mockModule('../src/db.js', () => ({
  createDb: jest.fn(() => jest.fn().mockResolvedValue([])),
  createMemoryDb: jest.fn(() => null), // banco de memória (ADR 0007): sem DATABASE_URL_MEMORY = null
}));

const { default: worker } = await import('../src/index.js');

function req(body, options) {
  const opts = options || {};
  return new Request('https://api.example.com/', {
    method: opts.method || 'POST',
    headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, opts.headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('index.js — roteamento e CORS', () => {
  const env = makeEnv();

  test('corpo acima do teto padrão: 413 com o envelope de erro, sem chegar ao handler', async () => {
    const res = await worker.fetch(req({ action: 'apiLogin', args: ['x'.repeat(70 * 1024)] }), env);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ success: false, message: 'Requisição grande demais.' });
  });

  test('Content-Length gigante: 413 sem ler o corpo', async () => {
    const res = await worker.fetch(req({ action: 'apiLogin', args: [] }, { headers: { 'Content-Length': String(50 * 1024 * 1024) } }), env);
    expect(res.status).toBe(413);
  });

  test('ação de imagem passa do teto padrão (não é barrada por tamanho)', async () => {
    const res = await worker.fetch(req({ action: 'apiUpdateMyAvatar', args: ['tok', 'A'.repeat(200 * 1024), 'image/png'] }), env);
    expect(res.status).toBe(200);
  });

  test('ação que não é de imagem não escapa do teto anunciando a ação de imagem em outro campo', async () => {
    const res = await worker.fetch(req({ note: '"action":"apiUpdateMyAvatar"', action: 'apiLogin', args: ['x'.repeat(70 * 1024)] }), env);
    expect(res.status).toBe(413);
  });

  test.each(['/', '/v1', '/v1/'])('POST em %s chega à API (alias versionado e raiz legada)', async (pathname) => {
    const request = new Request('https://api.example.com' + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'naoExiste', args: [] }),
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: false, message: 'Ação desconhecida.' });
  });

  test.each(['/v2/', '/api', '/v1/extra', '/admin', '/.env'])('POST em %s é 404 e nem lê o corpo', async (pathname) => {
    const request = new Request('https://api.example.com' + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'apiLogin', args: ['a@b.c', 'x'] }),
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  test('OPTIONS (preflight) responde 204 com Access-Control-Allow-Origin quando a origem está na allowlist', async () => {
    const request = new Request('https://api.example.com/', {
      method: 'OPTIONS',
      headers: { Origin: 'https://diretoria-dpf.github.io' },
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://diretoria-dpf.github.io');
  });

  test('entrega ctx.waitUntil da requisição aos handlers (via env), sem tocar no env original', async () => {
    const { API_REGISTRY } = await import('../src/handlers.js');
    const seen = [];
    const spy = jest.spyOn(API_REGISTRY, 'apiTouchSession').mockImplementation(async (sql, requestEnv) => {
      seen.push(requestEnv);
      return { success: true };
    });
    const ctx = { waitUntil: jest.fn() };
    try {
      await worker.fetch(req({ action: 'apiTouchSession', args: ['t'] }), env, ctx);
      await worker.fetch(req({ action: 'apiTouchSession', args: ['t'] }), env); // sem ctx (testes/CLI): segue sem waitUntil
    } finally {
      spy.mockRestore();
    }
    expect(typeof seen[0].waitUntil).toBe('function');
    seen[0].waitUntil(Promise.resolve());
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    expect(seen[1].waitUntil).toBeUndefined();
    expect(env.waitUntil).toBeUndefined();
  });

  test('não devolve Access-Control-Allow-Origin para uma origem fora da allowlist', async () => {
    const request = req({ action: 'apiListEvents', args: [''] }, { headers: { Origin: 'https://site-malicioso.example' } });
    const res = await worker.fetch(request, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  describe('migração para laift.com.br', () => {
    const envComDominio = {
      ...env,
      ALLOWED_ORIGINS: 'https://diretoria-dpf.github.io,https://laift.com.br',
    };

    function preflight(origin) {
      return new Request('https://api.laift.com.br/', { method: 'OPTIONS', headers: { Origin: origin } });
    }

    test('aceita a origem https://laift.com.br quando ela consta em ALLOWED_ORIGINS', async () => {
      const res = await worker.fetch(preflight('https://laift.com.br'), envComDominio);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://laift.com.br');
    });

    test('mantém a origem antiga do GitHub Pages durante a transição', async () => {
      const res = await worker.fetch(preflight('https://diretoria-dpf.github.io'), envComDominio);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://diretoria-dpf.github.io');
    });

    test('www.laift.com.br não é aceito se não estiver listado (o www só redireciona)', async () => {
      const res = await worker.fetch(preflight('https://www.laift.com.br'), envComDominio);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    test('rejeita domínio parecido que apenas começa com laift.com.br', async () => {
      const res = await worker.fetch(preflight('https://laift.com.br.site-malicioso.example'), envComDominio);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    test('rejeita http:// (sem TLS) para o mesmo domínio', async () => {
      const res = await worker.fetch(preflight('http://laift.com.br'), envComDominio);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  test('GET é rejeitado com 405', async () => {
    const res = await worker.fetch(req(undefined, { method: 'GET' }), env);
    expect(res.status).toBe(405);
  });

  test('corpo que não é JSON válido devolve 400 genérico', async () => {
    const request = new Request('https://api.example.com/', { method: 'POST', body: '{{{não é json' });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('action fora da allowlist devolve "Ação desconhecida." sem executar nada', async () => {
    const res = await worker.fetch(req({ action: 'apiApagarTudo', args: [] }), env);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Ação desconhecida.' });
  });

  test('action herdada de Object.prototype (constructor/toString) também é rejeitada', async () => {
    for (const action of ['constructor', 'toString', 'hasOwnProperty']) {
      const res = await worker.fetch(req({ action, args: [] }), env);
      const body = await res.json();
      expect(body.message).toBe('Ação desconhecida.');
    }
  });

  test('action válida executa e devolve JSON com Content-Type correto', async () => {
    const res = await worker.fetch(req({ action: 'apiListEvents', args: [''] }), env);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
