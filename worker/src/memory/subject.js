/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/subject.js
 * Pseudônimo da pessoa no banco de memória: subject_id = HMAC-SHA256(MEMORY_SUBJECT_KEY, profile_id) em hexadecimal.
 * A chave é um secret SEPARADO (nunca o pepper da sessão) e só existe no Worker: o banco de memória, sozinho, não diz
 * de quem é a linha. Sem a chave (ausente ou curta) a memória fica indisponível: FALHA FECHADA, nunca um pseudônimo
 * improvisado. Girar a chave orfana TODA a memória (os pseudônimos mudam) — decisão de resetar, ver docs.
 */
import { MEMORY } from '../constants.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let imported = { secret: null, key: null };

export function memoryKeyConfigured(env) {
  return !!env && typeof env.MEMORY_SUBJECT_KEY === 'string' && env.MEMORY_SUBJECT_KEY.length >= MEMORY.KEY_MIN_LENGTH;
}

async function hmacKey(secret) {
  if (imported.secret === secret && imported.key) return imported.key;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  imported = { secret, key };
  return key;
}

const toHex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * @param {object} env  precisa de MEMORY_SUBJECT_KEY
 * @param {string} profileId  UUID da pessoa
 * @returns {Promise<string>} 64 caracteres hexadecimais
 * @throws {Error} sem chave ou com id inválido (o chamador trata como memória indisponível)
 */
export async function subjectIdFor(env, profileId) {
  if (!memoryKeyConfigured(env)) throw new Error('MEMORY_KEY_MISSING');
  const id = typeof profileId === 'string' ? profileId.trim().toLowerCase() : '';
  if (!UUID_RE.test(id)) throw new Error('MEMORY_SUBJECT_INVALID');
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env.MEMORY_SUBJECT_KEY), new TextEncoder().encode(id));
  return toHex(signature);
}
