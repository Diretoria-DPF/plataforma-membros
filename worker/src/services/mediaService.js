/**
 * mediaService.js
 * Upload de avatar de perfil e imagem de capa de evento para o bucket R2
 * (MEDIA_BUCKET). Imagem chega como base64 dentro do envelope JSON normal da
 * API (mesmo protocolo {action, args} de tudo o resto) — sem endpoint HTTP
 * separado, sem multipart, sem mudar o modelo de allowlist já existente.
 *
 * Limite de tamanho é checado no bytes DECODIFICADOS (não na string base64,
 * que é ~33% maior) para o limite refletir o tamanho real do arquivo.
 */
import * as S from '../security.js';
import * as E from '../errors.js';
import * as C from '../constants.js';
import * as Logging from '../logging.js';

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

function decodeImage(base64Data, mimeType, maxBytes) {
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    throw E.ValidationError('Formato de imagem não suportado. Use JPEG, PNG, WEBP ou GIF.');
  }
  const raw = S.normalizeText(base64Data).replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw E.ValidationError('Nenhuma imagem enviada.');

  let bytes;
  try {
    const binary = atob(raw);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch (err) {
    throw E.ValidationError('Imagem inválida — não foi possível decodificar.');
  }

  if (bytes.length === 0) throw E.ValidationError('Nenhuma imagem enviada.');
  if (bytes.length > maxBytes) {
    throw E.ValidationError('Imagem muito grande (máximo ' + Math.round(maxBytes / (1024 * 1024)) + 'MB).');
  }

  return bytes;
}

async function putObject(env, key, bytes, mimeType) {
  await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: mimeType } });
  return env.MEDIA_PUBLIC_URL.replace(/\/$/, '') + '/' + key;
}

/** Usado tanto no cadastro (avatar opcional) quanto depois, a partir do perfil. */
export async function uploadAvatarBytes(env, profileId, base64Data, mimeType) {
  const bytes = decodeImage(base64Data, mimeType, MAX_AVATAR_BYTES);
  const ext = ALLOWED_MIME_TYPES[mimeType];
  const key = 'avatars/' + profileId + '-' + Date.now() + '.' + ext;
  return putObject(env, key, bytes, mimeType);
}

export async function updateMyAvatar(sql, env, identity, base64Data, mimeType, correlationId) {
  const url = await uploadAvatarBytes(env, identity.profileId, base64Data, mimeType);
  await sql`UPDATE profiles SET avatar_url = ${url} WHERE id = ${identity.profileId}::uuid`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_AVATAR', 'profile', identity.profileId, 'success', null);
  return { success: true, message: 'Avatar atualizado.', avatarUrl: url };
}

export async function uploadEventImage(sql, env, identity, eventId, base64Data, mimeType, correlationId) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const id = S.normalizeText(eventId);

  const existing = await sql`SELECT id FROM events WHERE id = ${id}::uuid`;
  if (!existing.length) throw E.NotFoundError('Evento não encontrado.');

  const bytes = decodeImage(base64Data, mimeType, MAX_EVENT_IMAGE_BYTES);
  const ext = ALLOWED_MIME_TYPES[mimeType];
  const key = 'events/' + id + '-' + Date.now() + '.' + ext;
  const url = await putObject(env, key, bytes, mimeType);

  await sql`UPDATE events SET image_url = ${url} WHERE id = ${id}::uuid`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_EVENT_IMAGE', 'event', id, 'success', null);
  return { success: true, message: 'Imagem do evento atualizada.', imageUrl: url };
}
