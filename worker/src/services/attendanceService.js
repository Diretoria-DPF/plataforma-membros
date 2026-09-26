/**
 * attendanceService.js — presença em eventos e credencial QR
 * (Fase 2 da unificação: docs/PLANO_FASES_2_3_4.md, Contrato 2).
 *
 * Substitui o backend de presença do Apps Script (`loginFiscal`,
 * `carimbarPresenca*`, `marcarPresencaLista`, `listarMembros`,
 * `exportarPresencasCsv`). Diferenças de segurança em relação ao legado:
 *  - não existe mais "senha fiscal": toda ação de portaria exige o papel
 *    `admin`, checado aqui no servidor a partir da sessão;
 *  - a presença vive em event_registrations (checked_in_at/by/method), com
 *    os mesmos gatilhos de capacidade/visibilidade das inscrições comuns;
 *  - o QR da credencial é ASSINADO pela Worker (LAIFT:v2:<profileId>.<sig>)
 *    — o antigo LAIFT:ID:<e-mail> era só o e-mail em texto, forjável por
 *    qualquer um.
 *
 * Assinatura do QR: HMAC-SHA-256 com uma chave DERIVADA do
 * SESSION_TOKEN_PEPPER com separação de domínio
 * (chave = HMAC(pepper, 'laift-attendance-qr-v1')), para não precisar de
 * segredo novo e sem reutilizar o pepper cru em outro contexto. Trocar o
 * pepper invalida todas as sessões E todos os QRs/crachás impressos.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { invalidateCached, CACHE_KEYS } from '../cache.js';
import { cleanText } from './learningService.js';

const QR_PREFIX = 'LAIFT:v2:';
const QR_KEY_DOMAIN = 'laift-attendance-qr-v1';
// 18 bytes = 144 bits (acima do mínimo de 128) = exatamente 24 caracteres
// base64url, sem padding — QR pequeno o bastante para crachá CR-80.
const QR_SIG_BYTES = 18;
const QR_SIG_CHARS = 24;
// BOM UTF-8 construído por código (e não como caractere literal invisível no
// fonte, fácil de apagar sem perceber numa edição).
const UTF8_BOM = String.fromCharCode(0xfeff);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QR_RE = /^LAIFT:v2:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{24})$/;

const ROLE_LABELS = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };
const METHOD_LABELS = { qr: 'QR Code', manual: 'Manual (e-mail)', lista: 'Lista' };
const STATUS_LABELS = {
  draft: 'rascunho', published: 'publicado', in_progress: 'em andamento', closed: 'encerrado',
  completed: 'concluído', archived: 'arquivado',
};

// =============================================================================
// QR assinado
// =============================================================================

let qrKeyCache = null; // { pepper, promise } — importKey é caro; a chave não muda no isolate

function getQrKey(pepper) {
  if (!pepper) throw new Error('SESSION_TOKEN_PEPPER não configurado.'); // inesperado → mensagem genérica
  if (qrKeyCache && qrKeyCache.pepper === pepper) return qrKeyCache.promise;
  const enc = new TextEncoder();
  const promise = crypto.subtle
    .importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((master) => crypto.subtle.sign('HMAC', master, enc.encode(QR_KEY_DOMAIN)))
    .then((derived) => crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  promise.catch(() => { qrKeyCache = null; });
  qrKeyCache = { pepper, promise };
  return promise;
}

function base64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeSignature(env, profileId) {
  const key = await getQrKey(env.SESSION_TOKEN_PEPPER);
  // A mensagem assinada inclui o prefixo de versão: uma assinatura de v2
  // nunca vale para um formato futuro (v3) com o mesmo profileId.
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(QR_PREFIX + profileId));
  return base64url(new Uint8Array(mac).slice(0, QR_SIG_BYTES));
}

/** Comparação em tempo constante (o tamanho já é fixo pela regex). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signAttendanceQr(env, profileId) {
  const id = String(profileId || '').toLowerCase();
  if (!UUID_RE.test(id)) throw new Error('profileId inválido para o QR de presença.');
  return QR_PREFIX + id + '.' + (await computeSignature(env, id));
}

/** Devolve o profileId se o payload for um QR v2 íntegro; senão null. */
export async function verifyAttendanceQr(env, payload) {
  const match = QR_RE.exec(String(payload || '').trim());
  if (!match) return null;
  const id = match[1].toLowerCase();
  const expected = await computeSignature(env, id);
  return timingSafeEqual(expected, match[2]) && expected.length === QR_SIG_CHARS ? id : null;
}

/** apiLearnGetMyAttendanceQr — a credencial da PRÓPRIA sessão (qualquer papel). */
export async function getMyAttendanceQr(env, identity) {
  return { success: true, qrPayload: await signAttendanceQr(env, identity.profileId) };
}

// =============================================================================
// Terminal fiscal (só admin)
// =============================================================================

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

function requireUuid(value, message) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID_RE.test(v)) throw E.ValidationError(message);
  return v;
}

async function invalidateEventsCache(env) {
  // registered_count dos catálogos em cache muda quando a portaria cria uma
  // inscrição — mesma invalidação de eventService.registerForEvent.
  await Promise.all([
    invalidateCached(env, CACHE_KEYS.EVENTS_PUBLIC),
    invalidateCached(env, CACHE_KEYS.EVENTS_AUTHENTICATED),
    invalidateCached(env, CACHE_KEYS.EVENTS_MEMBERS),
  ]);
}

/** apiAdminAttendanceListEvents — eventos para o seletor do terminal. */
export async function listEvents(sql, identity) {
  assertAdmin(identity);
  // Abertos (em andamento, depois publicados) primeiro e, dentro de cada
  // grupo, os mais próximos de agora; encerrados/concluídos vêm depois só
  // para exportação do CSV (o check-in neles é recusado).
  const rows = await sql`
    SELECT e.id AS id, e.title AS title, e.event_date AS event_date, e.status AS status, e.capacity AS capacity,
           count(r.id)::int AS registered_count,
           count(r.checked_in_at)::int AS checked_in_count
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.id
    WHERE e.status IN ('published', 'in_progress', 'closed', 'completed')
    GROUP BY e.id
    ORDER BY CASE e.status::text WHEN 'in_progress' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
             abs(extract(epoch FROM (e.event_date - now()))) ASC
    LIMIT ${C.LIMITS.ATTENDANCE_EVENTS_LIMIT}
  `;
  return {
    success: true,
    events: rows.map((r) => ({
      id: r.id,
      title: r.title,
      eventDate: r.event_date,
      status: r.status,
      capacity: r.capacity === null || r.capacity === undefined ? null : Number(r.capacity),
      registeredCount: Number(r.registered_count) || 0,
      checkedInCount: Number(r.checked_in_count) || 0,
      checkInOpen: C.ATTENDANCE_OPEN_STATUSES.indexOf(r.status) !== -1,
    })),
  };
}

/** Traduz as exceções dos gatilhos de event_registrations em mensagens para o admin. */
function mapRegistrationTriggerError(err, participantName) {
  const msg = String((err && err.message) || '');
  if (msg.indexOf('sem vagas') !== -1) {
    return E.ConflictError('Evento lotado: a capacidade de inscrições foi atingida, então ' + participantName +
      ' não pode ser registrado(a) na porta. Só quem já está inscrito pode ter a presença confirmada.');
  }
  if (msg.indexOf('exclusivo para membros') !== -1) {
    return E.ConflictError('Evento exclusivo para membros: ' + participantName + ' não é membro da liga e não pode ser registrado(a).');
  }
  if (msg.indexOf('não está aberto') !== -1) {
    return E.ConflictError('Este evento não está aberto para check-in.');
  }
  if (msg.indexOf('não autorizada') !== -1) {
    return E.ConflictError('A conta de ' + participantName + ' não está autorizada (banida ou com e-mail não confirmado).');
  }
  return null;
}

/**
 * apiAdminAttendanceCheckIn — registra a presença. Idempotente: o segundo
 * check-in da mesma pessoa no mesmo evento devolve alreadyCheckedIn: true
 * e não altera o registro original (horário, método e quem registrou).
 * Funciona para quem não se inscreveu antes: a inscrição é criada já com o
 * check-in, e os gatilhos do banco decidem capacidade/visibilidade.
 */
export async function checkIn(sql, env, identity, input, correlationId) {
  assertAdmin(identity);
  await S.enforceRateLimit(sql, 'attendance_checkin', identity.profileId, C.RATE_LIMITS.ATTENDANCE_CHECKIN.MAX_ATTEMPTS, C.RATE_LIMITS.ATTENDANCE_CHECKIN.WINDOW_SECONDS);

  const eventId = requireUuid(input.eventId, 'Selecione um evento válido.');
  const method = typeof input.method === 'string' ? input.method.trim() : '';
  if (C.ATTENDANCE_CHECKIN_METHODS.indexOf(method) === -1) throw E.ValidationError('Método de check-in inválido.');

  // Cada método aceita UM identificador, e só o seu: profileId cru só vale
  // no método 'lista' (vem da busca do próprio admin); pelo QR, a
  // identidade só é aceita depois de a assinatura conferir.
  let profileRows;
  if (method === 'qr') {
    const payload = typeof input.qrPayload === 'string' ? input.qrPayload.trim() : '';
    if (!payload || payload.length > 200) throw E.ValidationError('QR Code ausente ou inválido.');
    const profileId = await verifyAttendanceQr(env, payload);
    if (!profileId) {
      await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_CHECKIN', 'event', eventId, 'failure', { method, reason: 'invalid_qr' });
      throw E.ValidationError('QR Code inválido ou adulterado. Peça para a pessoa abrir a credencial atualizada na plataforma, ou use a presença manual por e-mail.');
    }
    profileRows = () => sql`SELECT id, full_name, role, status, email_confirmed_at FROM profiles WHERE id = ${profileId}::uuid`;
  } else if (method === 'manual') {
    const email = S.normalizeText(input.email).toLowerCase();
    if (!S.isValidEmail(email)) throw E.ValidationError('Informe um e-mail válido.');
    profileRows = () => sql`SELECT id, full_name, role, status, email_confirmed_at FROM profiles WHERE email = ${email}`;
  } else {
    const profileId = requireUuid(input.profileId, 'Participante inválido.');
    profileRows = () => sql`SELECT id, full_name, role, status, email_confirmed_at FROM profiles WHERE id = ${profileId}::uuid`;
  }

  const eventRows = await sql`SELECT id, title, status FROM events WHERE id = ${eventId}::uuid`;
  if (!eventRows.length) throw E.NotFoundError('Evento não encontrado.');
  const event = eventRows[0];
  if (C.ATTENDANCE_OPEN_STATUSES.indexOf(event.status) === -1) {
    throw E.ConflictError('O check-in só fica aberto em eventos publicados ou em andamento (este está ' + (STATUS_LABELS[event.status] || event.status) + ').');
  }

  const people = await profileRows();
  if (!people.length) {
    throw E.NotFoundError(method === 'manual'
      ? 'Nenhuma conta com esse e-mail. A pessoa precisa se cadastrar na plataforma antes do check-in.'
      : 'Participante não encontrado.');
  }
  const person = people[0];
  const fullName = person.full_name;
  if (person.status === C.ACCOUNT_STATUS.BANNED) throw E.ConflictError('Esta conta está banida; a presença não pode ser registrada.');
  if (!person.email_confirmed_at) throw E.ConflictError('Esta conta ainda não confirmou o e-mail; a presença não pode ser registrada.');

  // 1) Já inscrito e ainda sem presença → marca a presença.
  let walkIn = false;
  let alreadyCheckedIn = false;
  let checkedInAt = null;
  const updated = await sql`
    UPDATE event_registrations
    SET checked_in_at = now(), checked_in_by = ${identity.profileId}::uuid, checkin_method = ${method}
    WHERE event_id = ${eventId}::uuid AND profile_id = ${person.id}::uuid AND checked_in_at IS NULL
    RETURNING checked_in_at
  `;
  if (updated.length) {
    checkedInAt = updated[0].checked_in_at;
  } else {
    // 2) Já tinha presença → idempotente, nada muda.
    const existing = await sql`
      SELECT checked_in_at FROM event_registrations
      WHERE event_id = ${eventId}::uuid AND profile_id = ${person.id}::uuid
    `;
    if (existing.length) {
      alreadyCheckedIn = true;
      checkedInAt = existing[0].checked_in_at;
    } else {
      // 3) Entrada na porta: cria a inscrição já com a presença. O gatilho
      // guard_event_registration (sql/012_learning.sql) aplica capacidade,
      // visibilidade e conta banida/não confirmada.
      try {
        const inserted = await sql`
          INSERT INTO event_registrations (event_id, profile_id, checked_in_at, checked_in_by, checkin_method)
          VALUES (${eventId}::uuid, ${person.id}::uuid, now(), ${identity.profileId}::uuid, ${method})
          RETURNING checked_in_at
        `;
        walkIn = true;
        checkedInAt = inserted[0].checked_in_at;
      } catch (err) {
        const msg = String((err && err.message) || '');
        if (msg.indexOf('event_registrations_unique') !== -1) {
          // Corrida: a inscrição apareceu entre o SELECT e o INSERT (outro
          // terminal, ou a própria pessoa se inscrevendo agora). Uma nova
          // tentativa do passo 1 resolve os dois casos.
          const retried = await sql`
            UPDATE event_registrations
            SET checked_in_at = now(), checked_in_by = ${identity.profileId}::uuid, checkin_method = ${method}
            WHERE event_id = ${eventId}::uuid AND profile_id = ${person.id}::uuid AND checked_in_at IS NULL
            RETURNING checked_in_at
          `;
          if (retried.length) checkedInAt = retried[0].checked_in_at;
          else alreadyCheckedIn = true;
        } else {
          const mapped = mapRegistrationTriggerError(err, fullName);
          if (mapped) {
            await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_CHECKIN', 'event', eventId, 'failure', { method, profileId: person.id, reason: 'registration_blocked' });
            throw mapped;
          }
          throw err;
        }
      }
    }
  }

  if (walkIn) await invalidateEventsCache(env);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_CHECKIN', 'event', eventId, 'success', {
    method, profileId: person.id, walkIn, alreadyCheckedIn,
  });

  let message;
  if (alreadyCheckedIn) message = fullName + ' já estava com presença registrada neste evento.';
  else if (walkIn) message = 'Presença registrada: ' + fullName + ' (inscrição criada na portaria).';
  else message = 'Presença registrada: ' + fullName + '.';

  return {
    success: true,
    message,
    participant: {
      profileId: person.id,
      fullName,
      role: person.role,
      alreadyCheckedIn,
      walkIn,
      checkedInAt,
    },
  };
}

function mapParticipant(r) {
  return {
    profileId: r.id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    registered: !!r.registration_id,
    checkedInAt: r.checked_in_at || null,
  };
}

/**
 * apiAdminAttendanceSearch — com `term` (≥ 2 caracteres) busca contas
 * ativas por nome/e-mail/usuário; com `term` vazio lista os inscritos do
 * evento (a "lista nominal" da portaria).
 */
export async function search(sql, identity, input) {
  assertAdmin(identity);
  const eventId = requireUuid(input.eventId, 'Selecione um evento válido.');
  const term = cleanText(typeof input.term === 'string' ? input.term : '');

  if (!term) {
    const rows = await sql`
      SELECT p.id AS id, p.full_name AS full_name, p.email AS email, p.role AS role,
             r.id AS registration_id, r.checked_in_at AS checked_in_at
      FROM event_registrations r
      JOIN profiles p ON p.id = r.profile_id
      WHERE r.event_id = ${eventId}::uuid
      ORDER BY p.full_name ASC
      LIMIT ${C.LIMITS.ATTENDANCE_LIST_LIMIT}
    `;
    return { success: true, participants: rows.map(mapParticipant) };
  }

  if (term.length < C.LIMITS.ATTENDANCE_SEARCH_MIN) throw E.ValidationError('Digite ao menos ' + C.LIMITS.ATTENDANCE_SEARCH_MIN + ' caracteres.');
  if (term.length > C.LIMITS.ATTENDANCE_SEARCH_MAX) throw E.ValidationError('Busca muito longa.');

  // Curingas do LIKE digitados pela pessoa viram literais (\ é o escape
  // padrão do ILIKE) — "%" não pode virar "listar todo mundo".
  const pattern = '%' + term.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
  const rows = await sql`
    SELECT p.id AS id, p.full_name AS full_name, p.email AS email, p.role AS role,
           r.id AS registration_id, r.checked_in_at AS checked_in_at
    FROM profiles p
    LEFT JOIN event_registrations r ON r.profile_id = p.id AND r.event_id = ${eventId}::uuid
    WHERE p.status = 'active' AND p.email_confirmed_at IS NOT NULL
      AND (p.full_name ILIKE ${pattern} OR p.email ILIKE ${pattern} OR p.username ILIKE ${pattern})
    ORDER BY (r.id IS NOT NULL) DESC, p.full_name ASC
    LIMIT ${C.LIMITS.ATTENDANCE_SEARCH_LIMIT}
  `;
  return { success: true, participants: rows.map(mapParticipant) };
}

// =============================================================================
// CSV
// =============================================================================

/**
 * Uma célula CSV segura para planilhas: texto que começa com = + - @ (ou
 * tab/CR) seria interpretado como FÓRMULA pelo Excel/LibreOffice/Sheets
 * (injeção de fórmula / "CSV injection" — um nome de cadastro como
 * `=HYPERLINK(...)` viraria link malicioso na planilha do admin). O
 * apóstrofo na frente força texto. Toda célula vai entre aspas (RFC 4180).
 */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function formatDateTimeBr(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function slugify(text) {
  const slug = String(text || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '');
  return slug || 'evento';
}

/**
 * apiAdminAttendanceExportCsv — inscritos e presenças de um evento.
 * `excel: true` devolve no formato que o Excel em pt-BR abre direto:
 * BOM UTF-8 (acentos corretos) e ";" como separador. Sem ele, CSV RFC 4180
 * puro (vírgula, sem BOM).
 */
export async function exportCsv(sql, identity, input, correlationId) {
  assertAdmin(identity);
  const eventId = requireUuid(input.eventId, 'Selecione um evento válido.');
  const excel = input.excel === true;

  const eventRows = await sql`SELECT id, title, event_date FROM events WHERE id = ${eventId}::uuid`;
  if (!eventRows.length) throw E.NotFoundError('Evento não encontrado.');
  const event = eventRows[0];

  const rows = await sql`
    SELECT p.full_name AS full_name, p.email AS email, p.role AS role,
           r.registered_at AS registered_at, r.checked_in_at AS checked_in_at,
           r.checkin_method AS checkin_method, a.full_name AS checked_in_by_name
    FROM event_registrations r
    JOIN profiles p ON p.id = r.profile_id
    LEFT JOIN profiles a ON a.id = r.checked_in_by
    WHERE r.event_id = ${eventId}::uuid
    ORDER BY (r.checked_in_at IS NULL) ASC, p.full_name ASC
  `;

  const sep = excel ? ';' : ',';
  const header = ['Nome', 'E-mail', 'Papel', 'Inscrito em', 'Presente', 'Check-in em', 'Método', 'Registrado por'];
  const lines = [header.map(csvCell).join(sep)];
  rows.forEach((r) => {
    lines.push([
      r.full_name,
      r.email,
      ROLE_LABELS[r.role] || r.role,
      formatDateTimeBr(r.registered_at),
      r.checked_in_at ? 'Sim' : 'Não',
      formatDateTimeBr(r.checked_in_at),
      r.checkin_method ? (METHOD_LABELS[r.checkin_method] || r.checkin_method) : '',
      r.checked_in_by_name || '',
    ].map(csvCell).join(sep));
  });
  const csv = (excel ? UTF8_BOM : '') + lines.join('\r\n') + '\r\n';

  const datePart = (() => {
    const d = new Date(event.event_date);
    return isNaN(d.getTime()) ? 'sem-data' : d.toISOString().slice(0, 10);
  })();
  const filename = 'presenca-' + slugify(event.title) + '-' + datePart + '.csv';

  // Exportação de dado pessoal (nome/e-mail) em massa: auditada, sem conteúdo.
  await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_EXPORT_CSV', 'event', eventId, 'success', { rows: rows.length });
  return { success: true, filename, csv, rows: rows.length };
}

// =============================================================================
// Crachás em lote
// =============================================================================

/** apiAdminAttendanceBadges — nome, papel e QR v2 de cada perfil pedido. */
export async function badges(sql, env, identity, input, correlationId) {
  assertAdmin(identity);
  if (!Array.isArray(input.profileIds)) throw E.ValidationError('Selecione ao menos um participante.');
  if (input.profileIds.length > C.LIMITS.ATTENDANCE_BADGES_MAX) {
    throw E.ValidationError('No máximo ' + C.LIMITS.ATTENDANCE_BADGES_MAX + ' crachás por impressão.');
  }
  const ids = [];
  input.profileIds.forEach((raw) => {
    const id = requireUuid(raw, 'Lista de participantes inválida.');
    if (ids.indexOf(id) === -1) ids.push(id);
  });
  if (!ids.length) throw E.ValidationError('Selecione ao menos um participante.');

  const rows = await sql`
    SELECT id, full_name, role, league_position
    FROM profiles
    WHERE id = ANY(${ids}::uuid[]) AND status = 'active'
  `;
  const byId = {};
  rows.forEach((r) => { byId[String(r.id).toLowerCase()] = r; });

  const out = [];
  for (const id of ids) {
    const r = byId[id];
    if (!r) continue; // conta inexistente/banida: simplesmente não sai crachá
    out.push({
      profileId: id,
      fullName: r.full_name,
      role: r.role,
      leaguePosition: r.league_position || null,
      qrPayload: await signAttendanceQr(env, id),
    });
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_BADGES', 'profile', null, 'success', { requested: ids.length, issued: out.length });
  return { success: true, badges: out };
}
