/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlasTelemetryService.js — telemetria anônima do Atlas 3D (Onda 3.5, A.2).
 *
 * Mesmo desenho do proxy de moléculas: o módulo roda num iframe sem o token
 * de sessão, então chama pela ponte da plataforma (apiLearnAtlasTelemetry).
 * A sessão só serve de antiabuso (rate limit por perfil): o evento é gravado
 * SEM profile_id — nem e-mail, IP ou texto livre. O que entra por evento é
 * limitado a uma lista de chaves (C.ATLAS_TELEMETRY.EVENTS); o resto é
 * descartado. Se a tabela ainda não foi migrada, grava 0 e segue (a
 * telemetria nunca derruba o atlas).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';

const T = C.ATLAS_TELEMETRY;

function isMissingTable(err) {
  return Boolean(err && (err.code === '42P01' || /atlas_telemetry/.test(String(err.message || '')) && /does not exist/.test(String(err.message || ''))));
}

// Controles C0/C1, marcas de direção, separadores de linha e surrogates soltos viram espaço.
const UNSAFE = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xd800, 0xdfff], [0xfeff, 0xfeff]];
function cleanShort(v) {
  let out = '';
  for (const ch of String(v).normalize('NFC')) {
    const code = ch.codePointAt(0);
    out += UNSAFE.some(([a, b]) => code >= a && code <= b) ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, T.TEXT_MAX);
}

/** Só as chaves permitidas do evento, com o tipo certo. Devolve null se o evento é inválido. */
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const spec = Object.prototype.hasOwnProperty.call(T.EVENTS, raw.event) ? T.EVENTS[raw.event] : null;
  if (!spec) return null;
  const sid = typeof raw.sid === 'string' && T.SID_RE.test(raw.sid) ? raw.sid : null;
  const props = {};
  const src = raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props) ? raw.props : {};
  for (const [key, type] of Object.entries(spec)) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (type === 'n' && typeof v === 'number' && Number.isFinite(v)) props[key] = Math.max(0, Math.min(1e7, Math.round(v)));
    else if (type === 'b' && typeof v === 'boolean') props[key] = v;
    else if (type === 's' && (typeof v === 'string' || typeof v === 'number')) {
      const t = cleanShort(v);
      if (t) props[key] = t;
    }
  }
  return { event: raw.event, sid, props };
}

// ---------------------------------------------------------------------------
// apiLearnAtlasTelemetry
// ---------------------------------------------------------------------------
export async function record(sql, identity, input) {
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
  if (!T.SESSION_ID_RE.test(sessionId)) throw E.ValidationError('Sessão de telemetria inválida.');
  if (!Array.isArray(input.events)) throw E.ValidationError('Eventos inválidos.');
  if (input.events.length > T.BATCH_MAX) throw E.ValidationError(`No máximo ${T.BATCH_MAX} eventos por envio.`);
  await S.enforceRateLimit(sql, 'ATLAS_TELEMETRY', identity.profileId, C.RATE_LIMITS.ATLAS_TELEMETRY.MAX_ATTEMPTS, C.RATE_LIMITS.ATLAS_TELEMETRY.WINDOW_SECONDS);

  const events = input.events.map(normalizeEvent).filter(Boolean);
  if (!events.length) return { success: true, stored: 0 };
  try {
    await sql`
      INSERT INTO atlas_telemetry (session_id, event, sid, props)
      SELECT ${sessionId}, t.event, NULLIF(t.sid, ''), t.props::jsonb
      FROM unnest(${events.map((e) => e.event)}::text[], ${events.map((e) => e.sid || '')}::text[], ${events.map((e) => JSON.stringify(e.props))}::text[])
        AS t(event, sid, props)
    `;
  } catch (err) {
    if (isMissingTable(err)) return { success: true, stored: 0 };
    throw err;
  }
  return { success: true, stored: events.length };
}

// ---------------------------------------------------------------------------
// apiAdminLearnAtlasTelemetry — contagens por evento e por dia (painel admin)
// ---------------------------------------------------------------------------
export async function adminStats(sql, identity, input) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const days = T.STATS_DAYS.includes(Number(input.days)) ? Number(input.days) : 7;
  await S.enforceRateLimit(sql, 'ATLAS_TELEMETRY_STATS', identity.profileId, C.RATE_LIMITS.ATLAS_TELEMETRY_STATS.MAX_ATTEMPTS, C.RATE_LIMITS.ATLAS_TELEMETRY_STATS.WINDOW_SECONDS);
  const totals = Object.fromEntries(Object.keys(T.EVENTS).map((e) => [e, 0]));
  try {
    const rows = await sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, event, count(*)::int AS n
      FROM atlas_telemetry
      WHERE created_at > now() - make_interval(days => ${days})
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;
    const sess = await sql`
      SELECT count(DISTINCT session_id)::int AS sessions
      FROM atlas_telemetry
      WHERE created_at > now() - make_interval(days => ${days})
    `;
    const byDay = new Map();
    for (const r of rows || []) {
      if (!Object.prototype.hasOwnProperty.call(totals, r.event)) continue;
      const n = Number(r.n) || 0;
      totals[r.event] += n;
      if (!byDay.has(r.day)) byDay.set(r.day, {});
      byDay.get(r.day)[r.event] = n;
    }
    return {
      success: true, days, totals, sessions: Number((sess && sess[0] && sess[0].sessions) || 0),
      byDay: [...byDay.entries()].map(([day, events]) => ({ day, events })),
    };
  } catch (err) {
    if (isMissingTable(err)) return { success: true, days, totals, sessions: 0, byDay: [], unavailable: true };
    throw err;
  }
}
