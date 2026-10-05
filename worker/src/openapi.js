/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * openapi.js
 * Gera a documentação OpenAPI 3.1 (worker/openapi.yaml) a partir do
 * API_REGISTRY — só documentação, o Worker não a consome. A API é um único
 * `POST /v1/` com {action, args}; cada action vira um schema em `oneOf`, com
 * os argumentos lidos da assinatura da própria função (`[sessionToken, input]`).
 * `npm run openapi` regenera o arquivo e test/openapi.test.js falha se ele
 * ficar diferente do que o registro produz.
 */
const SESSION_ARG = 'sessionToken';

function groupOf(name) {
  if (/^apiAdmin/.test(name)) return 'Administração';
  if (/^apiLearn/.test(name)) return 'Aprendizagem e IA';
  if (/Mfa/.test(name)) return 'Verificação em duas etapas';
  if (/^api(Register|ConfirmEmail|Login|RequestPasswordReset|ValidateResetToken|ConfirmPasswordReset|Logout|TouchSession)$/.test(name)) return 'Conta e sessão';
  return 'Plataforma';
}

/** Argumentos da action, lidos de `(sql, env, [a, b]) =>`. */
export function argumentsOf(fn) {
  const source = Function.prototype.toString.call(fn);
  const match = source.match(/^\s*(?:async\s*)?\(\s*sql\s*(?:,\s*env\s*(?:,\s*\[([^\]]*)\])?)?\s*\)\s*=>/);
  return match && match[1] ? match[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function describeActions(registry) {
  return Object.keys(registry).sort().map((name) => {
    const args = argumentsOf(registry[name]);
    return {
      name,
      group: groupOf(name),
      args,
      session: args[0] === SESSION_ARG,
      admin: /^apiAdmin/.test(name),
    };
  });
}

export function buildOpenApi(registry) {
  const actions = describeActions(registry);
  const schemas = {};
  actions.forEach((a) => {
    schemas[a.name] = {
      type: 'object',
      required: ['action', 'args'],
      description: [
        a.session ? 'Exige sessão (primeiro argumento: token).' : 'Não exige sessão.',
        a.admin ? 'Somente administrador.' : '',
      ].filter(Boolean).join(' '),
      properties: {
        action: { const: a.name },
        args: {
          type: 'array',
          prefixItems: a.args.map((arg) => ({ description: arg })),
          minItems: 0,
          maxItems: a.args.length,
        },
      },
    };
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'API da Plataforma de Membros LAIFT',
      version: '1.0.0',
      description: [
        'Uma única rota POST com {action, args}. Documentação gerada de worker/src/handlers.js (npm run openapi).',
        'Erros de negócio voltam com HTTP 200 e {success:false, message}; só falhas de protocolo usam 4xx/5xx.',
        'O token de sessão é opaco, vai como primeiro argumento e nunca em cookie.',
      ].join(' '),
      license: { name: 'Proprietária — ver LICENSE', identifier: 'LicenseRef-Proprietary' },
    },
    servers: [
      { url: 'https://api.laift.com.br', description: 'Produção' },
      { url: 'https://staging-api.laift.com.br', description: 'Homologação' },
    ],
    tags: [...new Set(actions.map((a) => a.group))].map((name) => ({ name })),
    paths: {
      '/v1/': {
        post: {
          operationId: 'call',
          summary: 'Chama uma action',
          description: '`POST /` (legado) responde igual a `POST /v1/`. A lista de actions está em `components.schemas`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { oneOf: actions.map((a) => ({ $ref: '#/components/schemas/' + a.name })) },
              },
            },
          },
          responses: {
            200: {
              description: 'Resultado da action (sucesso ou erro de negócio).',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Resultado' } } },
            },
            400: { description: 'Corpo que não é JSON.' },
            404: { description: 'Caminho inexistente.' },
            405: { description: 'Método diferente de POST/OPTIONS.' },
          },
        },
      },
    },
    components: {
      schemas: Object.assign({
        Resultado: {
          type: 'object',
          required: ['success'],
          properties: { success: { type: 'boolean' }, message: { type: 'string' } },
          additionalProperties: true,
        },
      }, schemas),
    },
  };
}

// ---------------------------------------------------------------------------
// YAML mínimo (o documento só tem objetos, listas e escalares): strings saem
// como JSON, que é YAML válido, sem depender de biblioteca.
// ---------------------------------------------------------------------------
function scalar(value) {
  return JSON.stringify(value);
}

function emit(value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return ' []\n';
    return '\n' + value.map((item) => {
      if (item && typeof item === 'object') {
        const body = emit(item, indent + 2);
        return pad + '-' + (body.startsWith('\n') ? ' ' + body.slice(1 + indent + 2) : body);
      }
      return pad + '- ' + scalar(item) + '\n';
    }).join('');
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return ' {}\n';
    return '\n' + keys.map((k) => {
      const v = value[k];
      const key = /^[A-Za-z_][\w$/#.-]*$/.test(k) ? k : scalar(k);
      if (v && typeof v === 'object') return pad + key + ':' + emit(v, indent + 2);
      return pad + key + ': ' + scalar(v) + '\n';
    }).join('');
  }
  return ' ' + scalar(value) + '\n';
}

export function toYaml(document) {
  const text = emit(document, 0);
  return '# Gerado por `npm run openapi` a partir de worker/src/handlers.js. NÃO edite à mão.\n' + text.replace(/^\n/, '');
}
