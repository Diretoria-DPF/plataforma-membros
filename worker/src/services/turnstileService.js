/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * turnstileService.js
 * Verificação do desafio Cloudflare Turnstile da prévia de IA do visitante (flag lia_visitor_ai_enabled),
 * conforme o guia oficial da Cloudflare (validação no servidor, "siteverify"). O token é de USO ÚNICO e
 * nunca é reaproveitado aqui.
 *
 * Gate, nesta ordem: token texto não vazio com até 2048 caracteres; segredo TURNSTILE_SECRET no ambiente;
 * POST form-urlencoded (secret, response, remoteip) com timeout de 10 s; HTTP 2xx; success === true;
 * action === 'lia_preview'; hostname dentro de TURNSTILE_HOSTNAMES. Qualquer falha devolve false e NUNCA
 * lança. Token, segredo e IP não vão para log nem para mensagem de erro.
 *
 * Segredo: só o secret do Worker (`wrangler secret put TURNSTILE_SECRET`, pelo dono). A chave do SITE é
 * pública e mora no front. TURNSTILE_HOSTNAMES é variável NÃO secreta (wrangler.toml), separada por vírgula.
 */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const CHALLENGE_ACTION = 'lia_preview';

const TOKEN_MAX = 2048;
const TIMEOUT_MS = 10000;
const DEFAULT_HOSTNAMES = ['laift.com.br', 'www.laift.com.br'];
// Nunca aceitos, mesmo se alguém os colocar na variável: o desafio de desenvolvimento não vale em produção.
const LOCAL_HOST = /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/;

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/** Há segredo do Turnstile configurado? (Condição para a prévia de IA do visitante existir.) */
export function challengeConfigured(env) {
  return !!env && isText(env.TURNSTILE_SECRET);
}

/** Hostnames aceitos: variável TURNSTILE_HOSTNAMES (sem localhost/loopback) ou o padrão de produção. */
export function allowedHostnames(env) {
  const raw = env && typeof env.TURNSTILE_HOSTNAMES === 'string' ? env.TURNSTILE_HOSTNAMES : '';
  const listed = raw.split(',').map((h) => h.trim().toLowerCase()).filter((h) => h && !LOCAL_HOST.test(h));
  return new Set(listed.length ? listed : DEFAULT_HOSTNAMES);
}

async function postSiteverify(env, token, ip) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET.trim(), response: token });
  if (isText(ip)) body.set('remoteip', ip.trim());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** O visitante passou no desafio? Qualquer falha, ausência ou resposta inesperada é false. Nunca lança. */
export async function verifyVisitorChallenge(env, token, ip) {
  if (!isText(token) || token.length > TOKEN_MAX || !challengeConfigured(env)) return false;
  try {
    const res = await postSiteverify(env, token, ip);
    if (!res || !res.ok) return false;
    const data = await res.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    return data.success === true
      && data.action === CHALLENGE_ACTION
      && typeof data.hostname === 'string'
      && allowedHostnames(env).has(data.hostname.toLowerCase());
  } catch (err) {
    return false;
  }
}
