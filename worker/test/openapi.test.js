/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_REGISTRY } from '../src/handlers.js';
import { argumentsOf, describeActions, buildOpenApi, toYaml } from '../src/openapi.js';

const yamlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');

describe('openapi — leitura das actions', () => {
  test('lê os argumentos da assinatura, com e sem sessão', () => {
    expect(argumentsOf((sql, env, [sessionToken, input]) => null)).toEqual(['sessionToken', 'input']);
    expect(argumentsOf((sql, env, [email, password]) => null)).toEqual(['email', 'password']);
    expect(argumentsOf((sql) => null)).toEqual([]);
    expect(argumentsOf((sql, env) => null)).toEqual([]);
  });

  test('toda action do registro é descrita, com grupo e indicação de sessão', () => {
    const described = describeActions(API_REGISTRY);
    expect(described).toHaveLength(Object.keys(API_REGISTRY).length);
    described.forEach((a) => {
      expect(a.group).toBeTruthy();
      if (a.name.startsWith('apiAdmin')) expect(a.admin).toBe(true);
    });
    expect(described.find((a) => a.name === 'apiLogin')).toMatchObject({ args: ['email', 'password'], session: false });
    expect(described.find((a) => a.name === 'apiGetMyProfile')).toMatchObject({ args: ['sessionToken'], session: true });
    expect(described.find((a) => a.name === 'apiLoginMfa').group).toBe('Verificação em duas etapas');
  });

  test('nenhuma action ficou sem os argumentos lidos (exceto as realmente sem argumentos)', () => {
    const semArgs = describeActions(API_REGISTRY).filter((a) => !a.args.length).map((a) => a.name);
    expect(semArgs).toEqual(['apiListRecentCompletedEvents']);
  });
});

describe('openapi — documento', () => {
  const doc = buildOpenApi(API_REGISTRY);

  test('é OpenAPI 3.1 com a rota /v1/ e um schema por action', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(['/v1/']);
    Object.keys(API_REGISTRY).forEach((name) => expect(doc.components.schemas[name]).toBeDefined());
    expect(doc.paths['/v1/'].post.requestBody.content['application/json'].schema.oneOf).toHaveLength(Object.keys(API_REGISTRY).length);
  });

  test('worker/openapi.yaml está em dia com o registro (rode `npm run openapi` se falhar)', () => {
    expect(fs.readFileSync(yamlPath, 'utf8').replace(/\r\n/g, '\n')).toBe(toYaml(doc));
  });

  test('o YAML não carrega valor que pareça segredo', () => {
    expect(toYaml(doc)).not.toMatch(/sk-or-|nvapi-|gsk_|postgres(ql)?:\/\//i);
  });
});
