/**
 * index.js
 * Ponto de entrada do Worker. Substitui doPost/doGet do Apps Script
 * (src/Main.gs) — mesmo protocolo {action, args} do front-end, então
 * frontend/app.js só precisa trocar a URL, nada na lógica de chamada.
 *
 * Diferença real em relação ao Apps Script: aqui dá para responder um
 * preflight CORS de verdade (OPTIONS) e restringir Access-Control-Allow-
 * Origin à lista de origens permitidas — o Apps Script não tinha como
 * fazer isso, então o front-end usava o truque de Content-Type
 * text/plain para nunca disparar preflight. Não é mais necessário aqui,
 * mas o front-end continua enviando assim por compatibilidade — este
 * roteador aceita ambos.
 */
import { createDb } from './db.js';
import { API_REGISTRY } from './handlers.js';
import { runMaintenance } from './maintenance.js';
import { newCorrelationId } from './security.js';

function parseAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseAllowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.indexOf(origin) !== -1) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(body, request, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request, env) },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Método não suportado.' }, request, env, 405);
    }

    let body;
    try {
      body = JSON.parse(await request.text());
    } catch (err) {
      return jsonResponse({ success: false, message: 'Requisição inválida.' }, request, env, 400);
    }

    const action = typeof body.action === 'string' ? body.action : '';
    // Allowlist fechada — mesma lógica do API_REGISTRY do Apps Script:
    // hasOwnProperty explícito impede que "toString"/"constructor" resolvam
    // para um método herdado de Object.prototype.
    const hasAction = Object.prototype.hasOwnProperty.call(API_REGISTRY, action);
    const handler = hasAction ? API_REGISTRY[action] : null;

    if (!handler) {
      return jsonResponse({ success: false, message: 'Ação desconhecida.' }, request, env, 200);
    }

    const args = Array.isArray(body.args) ? body.args : [];
    const sql = createDb(env.DATABASE_URL);
    // env é o objeto local desta invocação de fetch() (não é estado global
    // compartilhado entre requisições) — seguro acrescentar o IP aqui para
    // os handlers que precisam dele (hoje só o rate limit de login).
    const requestEnv = Object.assign({}, env, { clientIp: request.headers.get('CF-Connecting-IP') || '' });

    try {
      const result = await handler(sql, requestEnv, args);
      return jsonResponse(result, request, env, 200);
    } catch (err) {
      // Cada handler já captura tudo internamente (run/runWithSession); isto
      // é a última rede de segurança para um erro realmente inesperado.
      console.error('Erro não tratado no roteador:', err);
      return jsonResponse(
        { success: false, message: 'Não foi possível concluir a operação. Tente novamente em instantes.' },
        request,
        env,
        200
      );
    }
  },

  // Cron Trigger diário ([triggers] em wrangler.toml): faxina de dados
  // expirados e retenção do log de uso da IA — ver maintenance.js.
  // waitUntil deixa a limpeza terminar mesmo depois que o evento retorna.
  async scheduled(event, env, ctx) {
    const sql = createDb(env.DATABASE_URL);
    ctx.waitUntil(runMaintenance(sql, newCorrelationId()).then((deleted) => {
      console.log('Manutenção diária concluída:', JSON.stringify(deleted));
    }));
  },
};
