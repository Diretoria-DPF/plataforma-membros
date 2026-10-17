/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * sessionCookie.js (SEC-08, ADR 0011)
 * O token de sessão sai do JavaScript da página: no login, o Worker o entrega num cookie HttpOnly
 * (`__Host-pm_session`, Secure, SameSite=Lax, sem Domain) e a resposta leva só o marcador "cookie".
 * Nas chamadas seguintes o navegador anexa o cookie sozinho e o Worker troca o marcador pelo token.
 * Pura: só monta e lê cabeçalhos; a regra de quando usar fica em index.js (flag session_cookie_enabled).
 *
 * Só vale para origens do MESMO site da API (env.SESSION_COOKIE_SITE, ex.: "laift.com.br"): a cópia
 * do GitHub Pages é outro site e continua com o token no corpo. Quem usa: worker/src/index.js.
 */

export const COOKIE_NAME = '__Host-pm_session';
export const COOKIE_MARKER = 'cookie';
export const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
export const SESSION_CREATING_ACTIONS = Object.freeze(['apiLogin', 'apiLoginMfa']);
export const SESSION_ENDING_ACTIONS = Object.freeze(['apiLogout']);

const TOKEN_RE = /^[A-Za-z0-9._~-]{16,200}$/;

/** Lê o cabeçalho Cookie em { nome: valor } (sem decodificar o que não for percent-encoding válido). */
export function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  header.split(';').forEach((part) => {
    const cut = part.indexOf('=');
    if (cut < 1) return;
    const name = part.slice(0, cut).trim();
    const raw = part.slice(cut + 1).trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) return;
    try { out[name] = decodeURIComponent(raw); } catch (err) { out[name] = raw; }
  });
  return out;
}

/** Token do cookie (ou ''), só se tiver a forma de um token opaco. */
export function readSessionCookie(request) {
  const value = parseCookies(request.headers.get('Cookie'))[COOKIE_NAME];
  return typeof value === 'string' && TOKEN_RE.test(value) ? value : '';
}

/** A origem pertence ao site configurado (o próprio domínio ou um subdomínio, em https)? */
export function originInSite(origin, site) {
  if (typeof origin !== 'string' || typeof site !== 'string' || !site) return false;
  let url;
  try { url = new URL(origin); } catch (err) { return false; }
  if (url.protocol !== 'https:' || url.origin !== origin) return false;
  const host = url.hostname.toLowerCase();
  const base = site.trim().toLowerCase();
  return host === base || host.endsWith('.' + base);
}

/** O cookie só entra se a origem estiver na lista de origens permitidas E no mesmo site da API. */
export function cookieAllowedForOrigin(origin, allowedOrigins, site) {
  return Array.isArray(allowedOrigins) && allowedOrigins.indexOf(origin) !== -1 && originInSite(origin, site);
}

export function buildSetCookie(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new Error('Token inválido para o cookie de sessão.');
  return `${COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function buildClearCookie() {
  return `${COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** O primeiro argumento é o marcador "cookie" (o cliente não tem o token)? */
export function isMarker(value) { return value === COOKIE_MARKER; }

/**
 * Troca o marcador do primeiro argumento pelo token do cookie. Sem cookie, mantém o marcador
 * (o handler recusa como sessão inválida). Devolve uma lista nova; a original não é alterada.
 */
export function resolveArgs(args, cookieToken) {
  if (!Array.isArray(args) || !isMarker(args[0])) return args;
  return [cookieToken || args[0], ...args.slice(1)];
}

/**
 * Resposta de login/MFA: se trouxe sessionToken, devolve { body, token } com o token trocado pelo
 * marcador e `sessionCookie: true`; senão devolve o corpo igual e token ''.
 */
export function splitLoginResult(result) {
  if (!result || typeof result !== 'object' || typeof result.sessionToken !== 'string' || !result.sessionToken) {
    return { body: result, token: '' };
  }
  const { sessionToken, ...rest } = result;
  return { body: { ...rest, sessionToken: COOKIE_MARKER, sessionCookie: true }, token: sessionToken };
}
