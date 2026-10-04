/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mfa/secretBox.js
 * Cifra o segredo TOTP em repouso (AES-256-GCM). A chave vem de
 * MFA_ENCRYPTION_KEY (secret do Worker); sem ela, deriva-se do
 * SESSION_TOKEN_PEPPER — funciona, mas trocar o pepper passaria a invalidar
 * os segredos de MFA, por isso docs/DEPLOYMENT.md manda definir a chave
 * própria. A derivação usa HKDF-SHA256 com um rótulo fixo, e o AAD amarra o
 * texto cifrado à pessoa (um segredo copiado para outra linha não decifra).
 *
 * Formato guardado: "v1.<iv base64url>.<texto cifrado base64url>".
 */
const VERSION = 'v1';
const HKDF_INFO = 'laift-mfa-secret-v1';

function toB64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function keyMaterial(env) {
  const raw = String((env && env.MFA_ENCRYPTION_KEY) || '').trim() || String((env && env.SESSION_TOKEN_PEPPER) || '');
  if (!raw) throw new Error('Sem chave para cifrar o segredo de MFA.');
  return raw;
}

async function deriveKey(env) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyMaterial(env)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(HKDF_INFO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSecret(env, plaintext, profileId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(env);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(String(profileId)) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return [VERSION, toB64Url(iv), toB64Url(new Uint8Array(cipher))].join('.');
}

export async function decryptSecret(env, stored, profileId) {
  const parts = String(stored || '').split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error('Segredo de MFA em formato desconhecido.');
  const key = await deriveKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64Url(parts[1]), additionalData: new TextEncoder().encode(String(profileId)) },
    key,
    fromB64Url(parts[2])
  );
  return new TextDecoder().decode(plain);
}
