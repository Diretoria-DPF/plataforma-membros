/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * certificateService.js — emissão, lista, verificação pública e revogação (sql/057; docs/cursos-operacao.md).
 * Flags certificates_enabled (e courses_enabled para emitir).
 *
 *  - Emissão: só com tentativa aprovada na versão atual do curso; idempotente (devolve o certificado em vigor).
 *    Campos congelados (nome, curso, versão, carga, datas) assinados com HMAC-SHA-256 de chave derivada do
 *    SESSION_TOKEN_PEPPER com domínio próprio (laift-certificate-v1), no mesmo padrão do QR de presença.
 *  - Verificação pública (sem sessão): limite por IP; código fora do formato, inexistente, assinatura que não
 *    confere ou nome que não confere respondem IGUAL ({ found: false }), sem oráculo. Mostra só situação, nome,
 *    curso, carga horária e datas. Sem consentimento público, exige o nome digitado.
 *  - Revogação: só admin (certificates.revoke), com motivo e 2º fator na ação; o motivo nunca vai à página pública.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { guarded, requireUuid, requireLearner, requireFlag, flagOn, limitWrite, limitRead, limitAdmin, iso, randomInt } from './courseCommon.js';
import { loadPublishedCourse } from './assessmentService.js';

const K = C.COURSES;
const CODE_RE = /^LAIFT-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;
const NOT_FOUND = Object.freeze({ success: true, found: false });

// ---------------------------------------------------------------------------------------------------------------
// Puras
// ---------------------------------------------------------------------------------------------------------------

/** Código novo LAIFT-XXXXX-XXXXX (50 bits, alfabeto sem 0/O/1/I). */
export function generateCode(rand = randomInt) {
  const a = K.CERT_ALPHABET;
  const group = () => Array.from({ length: K.CERT_GROUP }, () => a[rand(a.length)]).join('');
  return K.CERT_PREFIX + '-' + group() + '-' + group();
}

/** Normaliza o que a pessoa digitou: maiúsculas, sem espaços, hífens recolocados; null se não tiver o formato. */
export function normalizeCode(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const compact = raw.toUpperCase().replace(/[\s-]/g, '');
  const body = compact.startsWith('LAIFT') ? compact.slice(5) : compact;
  if (body.length !== 10) return null;
  const code = 'LAIFT-' + body.slice(0, 5) + '-' + body.slice(5);
  return CODE_RE.test(code) ? code : null;
}

/** Nome para comparar: sem acento, minúsculo, espaços colapsados. */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Texto canônico assinado (ordem fixa; qualquer mudança de campo invalida a assinatura). */
export function canonical(c) {
  return ['v1', c.code, c.holder_name, c.course_id, c.course_title, String(c.course_version), String(c.workload_minutes),
    iso(c.issued_at), c.valid_until ? iso(c.valid_until) : ''].join('|');
}

/** Situação para exibição: revogado vence tudo; depois vencido. */
export function statusOf(c, now = Date.now()) {
  if (c.revoked_at) return 'revogado';
  if (c.valid_until && new Date(c.valid_until).getTime() <= now) return 'vencido';
  return 'valido';
}

export function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ---------------------------------------------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------------------------------------------

const keyCache = new Map();

function certKey(secret) {
  if (!secret) throw new Error('Segredo do certificado não configurado.');
  const hit = keyCache.get(secret);
  if (hit) return hit;
  const enc = new TextEncoder();
  const promise = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((master) => crypto.subtle.sign('HMAC', master, enc.encode(K.CERT_KEY_DOMAIN)))
    .then((derived) => crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  promise.catch(() => keyCache.delete(secret));
  keyCache.set(secret, promise);
  return promise;
}

function base64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sign(env, cert) {
  // Segredo próprio (CERTIFICATE_SECRET): girar o pepper das sessões nunca pode invalidar certificados emitidos.
  const key = await certKey(env && env.CERTIFICATE_SECRET);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical(cert)));
  return base64url(new Uint8Array(mac));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signatureOk(env, cert) {
  return timingSafeEqual(await sign(env, cert), cert.signature);
}

// ---------------------------------------------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------------------------------------------

const mineDto = (c, now) => ({
  code: c.code, holderName: c.holder_name, courseId: c.course_id, courseTitle: c.course_title, courseVersion: Number(c.course_version),
  workloadMinutes: Number(c.workload_minutes), scorePct: Number(c.score_pct), issuedAt: iso(c.issued_at), validUntil: iso(c.valid_until),
  publicConsent: c.public_consent === true, status: statusOf(c, now),
});

/** apiLearnCertificateIssue({ courseId, publicConsent }): emite (ou devolve) o certificado da versão atual. */
export async function issue(sql, env, identity, input, correlationId, now = Date.now()) {
  requireLearner(identity);
  await requireFlag(sql, K.FLAG, identity);
  await requireFlag(sql, K.CERT_FLAG, identity, 'Os certificados ainda não estão disponíveis.');
  const courseId = requireUuid(input.courseId, 'Curso');
  if (input.publicConsent !== undefined && typeof input.publicConsent !== 'boolean') throw E.ValidationError('Valor inválido para a página pública.');
  await limitWrite(sql, identity);
  const course = await loadPublishedCourse(sql, courseId);
  const existing = await guarded(() => sql`SELECT code, holder_name, course_id, course_title, course_version, workload_minutes, score_pct,
      issued_at, valid_until, public_consent, revoked_at, signature
    FROM certificates WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid
      AND course_version = ${course.version} AND revoked_at IS NULL`);
  if (existing.length) return { success: true, created: false, certificate: mineDto(existing[0], now) };
  // Revogado não se reemite sozinho: a mesma versão só volta com nova decisão da equipe (nova versão do curso).
  const revoked = await sql`SELECT 1 FROM certificates WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid
      AND course_version = ${course.version} AND revoked_at IS NOT NULL LIMIT 1`;
  if (revoked.length) throw E.ForbiddenError('O certificado desta versão do curso foi revogado. Fale com a coordenação.');
  const passed = await sql`SELECT id, score_pct FROM assessment_attempts
    WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid AND course_version = ${course.version} AND passed
    ORDER BY score_pct DESC, submitted_at DESC LIMIT 1`;
  if (!passed.length) throw E.ForbiddenError('O certificado sai depois da aprovação na prova.');
  const person = await sql`SELECT full_name FROM profiles WHERE id = ${identity.profileId}::uuid`;
  const holderName = String((person[0] && person[0].full_name) || '').replace(/\s+/g, ' ').trim();
  if (holderName.length < 2) throw E.ValidationError('Complete o seu nome no perfil antes de emitir o certificado.');
  const issuedAt = new Date(now);
  const validUntil = course.validity_months ? addMonths(issuedAt, Number(course.validity_months)) : null;
  for (let tries = 0; tries < 3; tries++) {
    const cert = {
      code: generateCode(), holder_name: holderName, course_id: course.id, course_title: course.title,
      course_version: Number(course.version), workload_minutes: Number(course.workload_minutes),
      score_pct: Number(passed[0].score_pct), issued_at: issuedAt, valid_until: validUntil, public_consent: input.publicConsent === true,
    };
    cert.signature = await sign(env, cert);
    try {
      await sql`INSERT INTO certificates (code, profile_id, holder_name, course_id, course_title, course_version, workload_minutes,
          score_pct, attempt_id, issued_at, valid_until, public_consent, signature)
        VALUES (${cert.code}, ${identity.profileId}::uuid, ${cert.holder_name}, ${cert.course_id}::uuid, ${cert.course_title}, ${cert.course_version},
          ${cert.workload_minutes}, ${cert.score_pct}, ${passed[0].id}::uuid, ${issuedAt.toISOString()}::timestamptz,
          ${validUntil ? validUntil.toISOString() : null}::timestamptz, ${cert.public_consent}, ${cert.signature})`;
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (/uq_certificates_active/.test(msg)) return issue(sql, env, identity, input, correlationId, now); // corrida: devolve o que ficou
      if (/certificates_code_uq/.test(msg)) continue; // colisão de código (50 bits): sorteia outro
      throw err;
    }
    await Logging.logAudit(sql, correlationId, identity.profileId, 'CERTIFICATE_ISSUE', 'course', course.id, 'success', { code: cert.code, version: cert.course_version });
    return { success: true, created: true, certificate: mineDto(cert, now) };
  }
  throw new Error('Não foi possível gerar um código de certificado único.');
}

/** apiLearnCertificateListMine(): certificados da própria pessoa (inclui revogados e vencidos, com a situação). */
export async function listMine(sql, identity, now = Date.now()) {
  requireLearner(identity);
  if (!(await flagOn(sql, K.CERT_FLAG, identity))) return { success: true, enabled: false, certificates: [] };
  await limitRead(sql, identity);
  const rows = await guarded(() => sql`SELECT code, holder_name, course_id, course_title, course_version, workload_minutes, score_pct,
      issued_at, valid_until, public_consent, revoked_at
    FROM certificates WHERE profile_id = ${identity.profileId}::uuid ORDER BY issued_at DESC LIMIT 200`);
  return { success: true, enabled: true, certificates: rows.map((r) => mineDto(r, now)) };
}

/** apiCertificateVerify({ code, name }): público, sem sessão. Resposta mínima (LGPD) e uniforme quando não acha. */
export async function verify(sql, env, input, now = Date.now()) {
  const L = K.VERIFY_IP_RATE_LIMIT;
  await S.enforceRateLimit(sql, 'CERT_VERIFY_IP', (env && env.clientIp) || 'unknown', L.MAX_ATTEMPTS, L.WINDOW_SECONDS);
  if (!(await flagOn(sql, K.CERT_FLAG, null))) return { success: true, enabled: false, found: false };
  const code = normalizeCode(input && input.code);
  if (!code) return NOT_FOUND;
  const rows = await guarded(() => sql`SELECT code, holder_name, course_id, course_title, course_version, workload_minutes,
      issued_at, valid_until, public_consent, revoked_at, signature
    FROM certificates WHERE code = ${code}`);
  if (!rows.length) return NOT_FOUND;
  const c = rows[0];
  if (c.public_consent !== true) {
    const raw = input && typeof input.name === 'string' && input.name.length <= 200 ? input.name : '';
    const typed = normalizeName(raw);
    if (!typed || typed !== normalizeName(c.holder_name)) return NOT_FOUND;
  }
  if (!(await signatureOk(env, c))) {
    await Logging.logError(sql, S.newCorrelationId(), 'CERTIFICATE_SIGNATURE_MISMATCH', 'Assinatura de certificado não confere.', { code });
    return NOT_FOUND;
  }
  return {
    success: true, found: true, status: statusOf(c, now),
    holderName: c.holder_name, courseTitle: c.course_title, courseVersion: Number(c.course_version),
    workloadMinutes: Number(c.workload_minutes), issuedAt: iso(c.issued_at), validUntil: iso(c.valid_until),
  };
}

/** apiAdminLearnCertificateRevoke({ code, reason }): só admin; o 2º fator é exigido no handler. */
export async function revoke(sql, identity, input, correlationId) {
  S.requireCapability(identity, 'certificates.revoke');
  const code = normalizeCode(input && input.code);
  if (!code) throw E.ValidationError('Código de certificado inválido.');
  const reason = typeof input.reason === 'string' ? input.reason.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < K.REVOKE_REASON_MIN || reason.length > K.REVOKE_REASON_MAX) {
    throw E.ValidationError('Informe o motivo da revogação (' + K.REVOKE_REASON_MIN + ' a ' + K.REVOKE_REASON_MAX + ' caracteres).');
  }
  await limitAdmin(sql, identity);
  const rows = await guarded(() => sql`UPDATE certificates SET revoked_at = now(), revoked_reason = ${reason}, revoked_by = ${identity.profileId}::uuid
    WHERE code = ${code} AND revoked_at IS NULL RETURNING id, course_id`);
  if (!rows.length) throw E.NotFoundError('Certificado não encontrado ou já revogado.');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'CERTIFICATE_REVOKE', 'certificate', rows[0].id, 'success', { code, courseId: rows[0].course_id });
  return { success: true, status: 'revogado' };
}
