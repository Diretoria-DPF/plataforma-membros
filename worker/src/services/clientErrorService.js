/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clientErrorService.js — coleta agregada de erros do navegador (OPS-08; sql/045; docs/erros-frontend.md).
 *
 * apiLogClientError é PÚBLICA (o erro pode acontecer antes do login), então:
 *  - limite por IP e teto de linhas na tabela (um atacante não enche o banco);
 *  - corpo pequeno (index.js recusa acima de CLIENT_ERRORS.BODY_MAX_BYTES);
 *  - SEM PII: o texto é limpo (e-mail, token, URL, query string, números longos saem) e truncado; rota é só o caminho;
 *    navegador é uma classe fixa; versão é um rótulo curto. IP, perfil e sessão nunca são gravados;
 *  - nunca falha para o cliente: limite estourado, entrada inválida ou tabela ausente (045 não aplicada) viram
 *    { success: true, stored: false }. Um reporter de erros que gera erro vira laço.
 * apiAdminClientErrors (capacidade metrics.read) lista os erros mais frequentes dos últimos dias.
 */
import * as S from '../security.js';
import { CLIENT_ERRORS } from '../constants.js';

const C = CLIENT_ERRORS;
const KINDS = ['error', 'rejection'];
const BROWSERS = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other'];
const ROUTE_RE = /^\/[a-z0-9._:/-]{0,78}$/;
const VERSION_RE = /^[A-Za-z0-9._-]{1,32}$/;
// Controles C0/C1, marcas de direcao, separadores de linha/paragrafo e BOM viram espaco.
const UNSAFE_CHARS_RE = new RegExp('[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]', 'g');
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function isMissingTable(err) {
  const msg = String((err && err.message) || '');
  return Boolean(err && (err.code === '42P01' || (/client_errors/.test(msg) && /does not exist/.test(msg))));
}

/** Tira de uma mensagem tudo o que poderia identificar alguém ou dar acesso, e a trunca. */
export function sanitizeMessage(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.normalize('NFC');
  text = text.replace(UNSAFE_CHARS_RE, ' ');
  text = text.replace(/https?:\/\/[^\s"')]+/gi, (url) => {
    try { const u = new URL(url); return u.origin + u.pathname; } catch (e) { return '[url]'; }
  });
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  text = text.replace(/\b(bearer|token|authorization|senha|password)\b\s*[:=]?\s*\S+/gi, '$1 [oculto]');
  text = text.replace(/[?&#][A-Za-z0-9_.-]+=[^\s&"')]*/g, '');
  text = text.replace(UUID_RE, '[id]');
  text = text.replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[oculto]');
  text = text.replace(/\d{6,}/g, '[n]');
  return text.replace(/\s+/g, ' ').trim().slice(0, C.MESSAGE_MAX);
}

/** Caminho sem query nem fragmento, minúsculo, ids viram :id; fora do formato vira ''. */
export function sanitizeRoute(raw) {
  if (typeof raw !== 'string') return '';
  const path = raw.split(/[?#]/)[0].toLowerCase().replace(UUID_RE, ':id');
  return ROUTE_RE.test(path) ? path.slice(0, C.ROUTE_MAX) : '';
}

/** Entrada validada, ou null se não serve. Só chaves conhecidas; o resto é ignorado. */
export function normalizeReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const message = sanitizeMessage(input.message);
  if (!message) return null;
  return {
    kind: KINDS.includes(input.kind) ? input.kind : 'error',
    message,
    route: sanitizeRoute(input.route),
    browser: BROWSERS.includes(input.browser) ? input.browser : 'other',
    appVersion: typeof input.appVersion === 'string' && VERSION_RE.test(input.appVersion) ? input.appVersion : '',
  };
}

async function fingerprintOf(report) {
  const text = [report.kind, report.message, report.route, report.browser, report.appVersion].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

// apiLogClientError (pública)
export async function logClientError(sql, env, input) {
  const dropped = { success: true, stored: false };
  const report = normalizeReport(input);
  if (!report) return dropped;
  try {
    await S.enforceRateLimit(sql, 'CLIENT_ERROR_IP', env.clientIp || 'unknown', C.RATE_LIMIT.MAX_ATTEMPTS, C.RATE_LIMIT.WINDOW_SECONDS);
  } catch (err) {
    if (err && err.expected) return dropped;
    throw err;
  }
  const fingerprint = await fingerprintOf(report);
  try {
    // Impressão nova só entra se a tabela ainda tem espaço; as já conhecidas sempre contam.
    const rows = await sql`
      INSERT INTO client_errors (fingerprint, kind, message, route, browser, app_version)
      SELECT ${fingerprint}, ${report.kind}, ${report.message}, ${report.route}, ${report.browser}, ${report.appVersion}
      WHERE EXISTS (SELECT 1 FROM client_errors WHERE fingerprint = ${fingerprint})
         OR (SELECT count(*) FROM client_errors) < ${C.MAX_ROWS}
      ON CONFLICT (fingerprint) DO UPDATE SET count = client_errors.count + 1, last_seen = now()
      RETURNING 1`;
    return { success: true, stored: Array.isArray(rows) ? rows.length > 0 : true };
  } catch (err) {
    if (isMissingTable(err)) return dropped;
    throw err;
  }
}

// apiAdminClientErrors (metrics.read)
export async function adminList(sql, identity, input) {
  S.requireCapability(identity, 'metrics.read');
  const asked = Number(input && input.days);
  const days = C.STATS_DAYS.includes(asked) ? asked : C.STATS_DAYS[1];
  try {
    const rows = await sql`
      SELECT kind, message, route, browser, app_version, count, first_seen, last_seen
      FROM client_errors
      WHERE last_seen > now() - make_interval(days => ${days})
      ORDER BY count DESC, last_seen DESC
      LIMIT ${C.TOP_LIMIT}`;
    return {
      success: true,
      days,
      errors: rows.map((r) => ({
        kind: r.kind, message: r.message, route: r.route, browser: r.browser, appVersion: r.app_version,
        count: Number(r.count) || 0, firstSeen: r.first_seen, lastSeen: r.last_seen,
      })),
    };
  } catch (err) {
    if (isMissingTable(err)) return { success: true, days, errors: [], tableMissing: true };
    throw err;
  }
}
