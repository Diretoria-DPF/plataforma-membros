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
const ALPHA_NOTE = 'ALFA (apiVersion agents/v1-alpha): pode mudar sem aviso; atrás das flags agents_enabled e da flag do agente (memória: memory_enabled). Erros trazem code (AGENT_DISABLED, RATE_LIMIT, QUOTA, AI_UNAVAILABLE, INVALID_OUTPUT, VALIDATION; memória: MEMORY_DISABLED, MEMORY_UNAVAILABLE, CONSENT_REQUIRED, MEMORY_FULL, NOT_FOUND); recusa de guardrail NÃO é erro (success true, refused true, rule).';
// Parâmetros que o registro (assinatura `[sessionToken, input]`) não mostra. Simulação clínica: ADR 0009.
const SIM_NOTE = 'Simulação clínica (beta; flag clinical_sim_enabled, desligada; só maiores de 18 anos): `input.simulation = { seed: inteiro 0..2147483647, version: "sim-v1", difficulty?: "basico"|"intermediario"|"avancado", elapsedSeconds?: 0..21600, events?: ["exam:<id>"] }`. Sem a flag, ou sem o parâmetro, a action se comporta como sempre. O servidor sorteia os eixos do paciente a partir da semente; o cliente nunca os informa.';
const ACTION_NOTES = {
  apiLearnClinicalChat: SIM_NOTE + ' Com a flag ligada a resposta traz `simulation: { simId, guardrails }` (sem os eixos).',
  apiLearnClinicalEvaluate: SIM_NOTE + ' A nota sai de 4 componentes limitados pelo servidor (hipótese 30, conduta 30, processo 20, comunicação 20); a resposta traz `simulation` com o debrief (eixos revelados) e `result.score`.',
  apiLearnGetMyAiQuota: 'Com a flag clinical_sim_enabled ligada para a pessoa, a resposta traz `simulation: { available: true, version }`; sem isso o campo não existe.',
  apiAdminGrantRole: 'Cargo funcional (ADR 0010): `input = { profileId, role, password, code? }`. Só admin, com reautenticação; cargo privilegiado (gestor, revisor_conteudo, moderador, curador) exige MFA ativo da pessoa. Idempotente (`changed`).',
  apiAdminRevokeRole: 'Retira um cargo funcional: `input = { profileId, role, password, code? }`. Só admin, com reautenticação. Idempotente (`changed`).',
  apiAdminListRoles: 'Cargos funcionais de uma pessoa (`input.profileId`) ou de todas que têm algum (nome e cargos, sem e-mail).',
  apiAdminLearnReviewCase: 'Caso com perfil de simulação só é aprovado com `input.checklist = { semDadoReal, gabaritoConferido, estagiosPlausiveis, linguagemRevisada }` (os 4 verdadeiros) e por um administrador diferente de quem criou o caso; o banco também impõe isso (sql/037).',
};
const ALPHA_ACTIONS = /^api(Agents|Memory|AdminMemoryStats|AdminPurgeMemberMemory|AdminAgentsStats)/;

function groupOf(name) {
  if (ALPHA_ACTIONS.test(name)) return 'Agentes de IA (alfa)';
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
      alpha: ALPHA_ACTIONS.test(name),
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
        a.alpha ? ALPHA_NOTE : '',
        ACTION_NOTES[a.name] || '',
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
