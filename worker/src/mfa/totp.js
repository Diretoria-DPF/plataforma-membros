/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mfa/totp.js
 * TOTP (RFC 6238) sobre HMAC-SHA1 com Web Crypto — o algoritmo que todo
 * aplicativo autenticador (Google/Microsoft Authenticator, Authy, 1Password…)
 * entende. Sem dependências. Funções puras, testadas com os vetores da RFC.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
// ±1 passo (30 s) absorve relógio de celular levemente fora de hora.
export const TOTP_WINDOW = 1;
const SECRET_BYTES = 20;

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[\s=-]/g, '');
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Base32 inválido.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export function generateSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

async function hmacSha1(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
}

export function stepAt(nowMs, stepSeconds = TOTP_STEP_SECONDS) {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

/** Código de `digits` dígitos para o contador `step` (HOTP, RFC 4226). */
export async function codeForStep(secretBase32, step, digits = TOTP_DIGITS) {
  const counter = new Uint8Array(8);
  let remaining = BigInt(step);
  for (let i = 7; i >= 0; i--) {
    counter[i] = Number(remaining & 255n);
    remaining >>= 8n;
  }
  const mac = await hmacSha1(base32Decode(secretBase32), counter);
  const offset = mac[mac.length - 1] & 15;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Comparação em tempo constante para strings de mesmo comprimento. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Confere o código nos passos [agora-janela, agora+janela]. Devolve o passo
 * que bateu (para o chamador gravar e impedir reuso) ou null. Passos
 * <= lastUsedStep são recusados: o mesmo código não vale duas vezes.
 */
export async function verifyTotp(secretBase32, code, nowMs, lastUsedStep = 0, window = TOTP_WINDOW) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(nowMs);
  let matched = null;
  for (let step = current - window; step <= current + window; step++) {
    if (step <= lastUsedStep) continue;
    if (safeEqual(await codeForStep(secretBase32, step), clean)) matched = step;
  }
  return matched;
}

export function buildOtpAuthUri({ issuer, account, secret }) {
  const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(account);
  return 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) +
    '&algorithm=SHA1&digits=' + TOTP_DIGITS + '&period=' + TOTP_STEP_SECONDS;
}
