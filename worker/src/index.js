/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
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
import { readLimitedBody, bodyFitsAction } from './requestBody.js';
import { statusOf, wantsRealStatus, STATUS_REQUEST_HEADER } from './httpStatus.js';
import { securityHeaders } from './securityHeaders.js';
import { HARDENING_BODY_LIMITS, CLIENT_ERRORS } from './constants.js';
import { isEnabled } from './services/featureFlagService.js';
import {
  SESSION_CREATING_ACTIONS, SESSION_ENDING_ACTIONS, cookieAllowedForOrigin, isMarker, readSessionCookie, resolveArgs,
  splitLoginResult, buildSetCookie, buildClearCookie,
} from './sessionCookie.js';

const API_PATHS = new Set(['/', '/v1', '/v1/']);
const HEALTH_PATH = '/health';
const TOO_LARGE = { success: false, message: 'Requisição grande demais.' };
const COOKIE_FLAG = 'session_cookie_enabled';
const SESSION_INVALID = { success: false, message: 'Sessão inválida ou expirada. Faça login novamente.' };

// Sonda rasa para monitor externo de disponibilidade: sem banco, KV, R2,
// segredos nem sessão (não acorda o Neon). Corpo fixo, sem versão nem flags.
function healthResponse(request) {
  return new Response(request.method === 'HEAD' ? null : '{"ok":true}', {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders({ noStore: true }) },
  });
}

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
    'Access-Control-Allow-Headers': 'Content-Type, ' + STATUS_REQUEST_HEADER,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.indexOf(origin) !== -1) {
    headers['Access-Control-Allow-Origin'] = origin;
    // Necessário para o cookie de sessão (SEC-08): sem isto o navegador recusa a resposta de quem usa credentials: 'include'.
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function jsonResponse(body, request, env, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders({ noStore: true }), ...corsHeaders(request, env), ...extraHeaders },
  });
}

/** O cookie de sessão só vale para origens permitidas do MESMO site da API (env.SESSION_COOKIE_SITE). */
function isCookieOrigin(request, env) {
  return cookieAllowedForOrigin(request.headers.get('Origin') || '', parseAllowedOrigins(env), env.SESSION_COOKIE_SITE);
}

/** Login e MFA entregam o token no cookie quando a flag está ligada; a flag nunca derruba a resposta de login. */
async function cookieForLogin(sql, request, env, action, result) {
  if (!SESSION_CREATING_ACTIONS.includes(action) || !isCookieOrigin(request, env)) return { body: result, headers: {} };
  try {
    if (!(await isEnabled(sql, COOKIE_FLAG, null))) return { body: result, headers: {} };
  } catch (err) {
    return { body: result, headers: {} };
  }
  const split = splitLoginResult(result);
  if (!split.token) return { body: result, headers: {} };
  try {
    return { body: split.body, headers: { 'Set-Cookie': buildSetCookie(split.token) } };
  } catch (err) {
    // A sessão já existe no banco: se o cookie não puder ser montado, o login segue como antes (token no corpo).
    return { body: result, headers: {} };
  }
}

/** Todo logout vindo de origem do mesmo site apaga o cookie, mesmo com token explícito ou se a chamada falhar. */
function clearCookieHeaders(request, env, action) {
  return SESSION_ENDING_ACTIONS.includes(action) && isCookieOrigin(request, env) ? { 'Set-Cookie': buildClearCookie() } : {};
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...securityHeaders(), ...corsHeaders(request, env) } });
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && new URL(request.url).pathname === HEALTH_PATH) {
      return healthResponse(request);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Método não suportado.' }, request, env, 405);
    }

    // `/v1/` é o endereço versionado (worker/openapi.yaml); a raiz continua
    // valendo para o front-end já instalado/em cache. Qualquer outro caminho
    // não é a API.
    if (!API_PATHS.has(new URL(request.url).pathname)) {
      return jsonResponse({ success: false, message: 'Caminho não encontrado.' }, request, env, 404);
    }

    // Teto do corpo (requestBody.js): barra corpo gigante antes de parsear, com ou sem Content-Length.
    const raw = await readLimitedBody(request, HARDENING_BODY_LIMITS);
    if (raw.tooLarge) return jsonResponse(TOO_LARGE, request, env, 413);

    let body;
    try {
      body = JSON.parse(raw.text);
    } catch (err) {
      return jsonResponse({ success: false, message: 'Requisição inválida.' }, request, env, 400);
    }

    // OPS-06: status HTTP real só para quem pede (X-Laift-Status: 1); sem o cabeçalho, erro de API segue HTTP 200.
    const realStatus = wantsRealStatus(request);
    const action = body && typeof body.action === 'string' ? body.action : '';
    if (!bodyFitsAction(raw.bytes, action, HARDENING_BODY_LIMITS)) return jsonResponse(TOO_LARGE, request, env, 413);
    // OPS-08: o relato de erro do navegador e pequeno por definicao.
    if (action === 'apiLogClientError' && raw.bytes > CLIENT_ERRORS.BODY_MAX_BYTES) return jsonResponse(TOO_LARGE, request, env, 413);
    // Allowlist fechada — mesma lógica do API_REGISTRY do Apps Script:
    // hasOwnProperty explícito impede que "toString"/"constructor" resolvam
    // para um método herdado de Object.prototype.
    const hasAction = Object.prototype.hasOwnProperty.call(API_REGISTRY, action);
    const handler = hasAction ? API_REGISTRY[action] : null;

    if (!handler) {
      return jsonResponse({ success: false, message: 'Ação desconhecida.' }, request, env, realStatus ? 404 : 200);
    }

    let args = Array.isArray(body.args) ? body.args : [];
    // Cookie de sessão (SEC-08): o marcador "cookie" no lugar do token só vale vindo de origem do mesmo site;
    // o Worker troca o marcador pelo token do cookie HttpOnly antes de chamar o handler.
    const usesCookie = isMarker(args[0]) && !SESSION_CREATING_ACTIONS.includes(action);
    if (usesCookie) {
      if (!isCookieOrigin(request, env)) return jsonResponse(SESSION_INVALID, request, env, realStatus ? 401 : 200);
      args = resolveArgs(args, readSessionCookie(request));
    }
    const sql = createDb(env.DATABASE_URL);
    // env é o objeto local desta invocação de fetch() (não é estado global
    // compartilhado entre requisições) — seguro acrescentar o IP aqui para
    // os handlers que precisam dele (limites de login, cadastro, redefinição e MFA).
    // waitUntil (da requisição) deixa a memória de estudo gravar DEPOIS de a resposta sair (memory/background.js).
    const requestEnv = Object.assign({}, env, { clientIp: request.headers.get('CF-Connecting-IP') || '' },
      ctx && typeof ctx.waitUntil === 'function' ? { waitUntil: (promise) => ctx.waitUntil(promise) } : {});

    try {
      const result = await handler(sql, requestEnv, args);
      const login = await cookieForLogin(sql, request, env, action, result);
      const errorStatus = realStatus ? statusOf(result) : null;
      return jsonResponse(login.body, request, env, errorStatus || 200, { ...login.headers, ...clearCookieHeaders(request, env, action) });
    } catch (err) {
      // Cada handler já captura tudo internamente (run/runWithSession); isto
      // é a última rede de segurança para um erro realmente inesperado.
      console.error('Erro não tratado no roteador:', err);
      return jsonResponse(
        { success: false, message: 'Não foi possível concluir a operação. Tente novamente em instantes.' },
        request,
        env,
        realStatus ? 500 : 200,
        clearCookieHeaders(request, env, action)
      );
    }
  },

  // Cron Trigger diário ([triggers] em wrangler.toml): faxina de dados
  // expirados e retenção do log de uso da IA — ver maintenance.js.
  // waitUntil deixa a limpeza terminar mesmo depois que o evento retorna.
  async scheduled(event, env, ctx) {
    const sql = createDb(env.DATABASE_URL);
    ctx.waitUntil(runMaintenance(sql, newCorrelationId(), env).then((deleted) => {
      console.log('Manutenção diária concluída:', JSON.stringify(deleted));
    }).catch((err) => {
      // runMaintenance já isola cada limpeza; isto só impede que algo
      // inesperado vire rejeição não tratada no runtime.
      console.error('Manutenção diária falhou:', err);
    }));
  },
};
