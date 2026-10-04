/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import {
  base32Encode, base32Decode, generateSecret, codeForStep, verifyTotp, stepAt, buildOtpAuthUri,
} from '../src/mfa/totp.js';
import { encryptSecret, decryptSecret } from '../src/mfa/secretBox.js';

// Vetores da RFC 6238 (Apêndice B, SHA-1): segredo ASCII "12345678901234567890".
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
];

describe('base32', () => {
  test('codifica o segredo ASCII da RFC como esperado', () => {
    expect(base32Encode(new TextEncoder().encode('12345678901234567890'))).toBe(RFC_SECRET);
  });

  test('ida e volta preserva os bytes, ignorando espaços, hífens e minúsculas', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const text = base32Encode(bytes);
    const spaced = text.toLowerCase().replace(/(.{4})/g, '$1 ').trim();
    expect(Array.from(base32Decode(spaced))).toEqual(Array.from(bytes));
  });

  test('recusa caractere fora do alfabeto', () => {
    expect(() => base32Decode('ABC1')).toThrow('Base32 inválido');
  });
});

describe('TOTP (RFC 6238)', () => {
  test.each(RFC_VECTORS)('em T=%i o código de 8 dígitos é %s', async (seconds, expected) => {
    expect(await codeForStep(RFC_SECRET, stepAt(seconds * 1000), 8)).toBe(expected);
  });

  test('o código de 6 dígitos são os 6 últimos do de 8', async () => {
    expect(await codeForStep(RFC_SECRET, stepAt(59 * 1000))).toBe('287082');
  });

  test('verifyTotp aceita o passo atual e os vizinhos (janela ±1) e recusa os demais', async () => {
    const now = 1234567890 * 1000;
    const step = stepAt(now);
    expect(await verifyTotp(RFC_SECRET, await codeForStep(RFC_SECRET, step), now)).toBe(step);
    expect(await verifyTotp(RFC_SECRET, await codeForStep(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(await verifyTotp(RFC_SECRET, await codeForStep(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(await verifyTotp(RFC_SECRET, await codeForStep(RFC_SECRET, step + 2), now)).toBeNull();
    expect(await verifyTotp(RFC_SECRET, await codeForStep(RFC_SECRET, step - 2), now)).toBeNull();
  });

  test('um passo já usado não vale de novo (anti-replay)', async () => {
    const now = 1234567890 * 1000;
    const step = stepAt(now);
    const code = await codeForStep(RFC_SECRET, step);
    expect(await verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(await verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  test.each(['', '12345', '1234567', 'abcdef', null, undefined])('recusa formato inválido %p', async (bad) => {
    expect(await verifyTotp(RFC_SECRET, bad, 1234567890 * 1000)).toBeNull();
  });

  test('aceita o código digitado com espaço no meio', async () => {
    const now = 1234567890 * 1000;
    const code = await codeForStep(RFC_SECRET, stepAt(now));
    expect(await verifyTotp(RFC_SECRET, code.slice(0, 3) + ' ' + code.slice(3), now)).toBe(stepAt(now));
  });

  test('generateSecret cria 32 caracteres base32 diferentes a cada vez', () => {
    const a = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateSecret()).not.toBe(a);
  });

  test('o URI otpauth leva emissor, conta com escape e os parâmetros do aplicativo', () => {
    const uri = buildOtpAuthUri({ issuer: 'LAIFT', account: 'ana+x@exemplo.com', secret: RFC_SECRET });
    expect(uri).toBe(
      'otpauth://totp/LAIFT:ana%2Bx%40exemplo.com?secret=' + RFC_SECRET + '&issuer=LAIFT&algorithm=SHA1&digits=6&period=30'
    );
  });
});

describe('secretBox (AES-GCM)', () => {
  const env = { SESSION_TOKEN_PEPPER: 'pepper-de-teste', MFA_ENCRYPTION_KEY: 'chave-propria-de-teste' };
  const profileId = '11111111-1111-4111-8111-111111111111';

  test('cifra e decifra, e o texto guardado não revela o segredo', async () => {
    const stored = await encryptSecret(env, RFC_SECRET, profileId);
    expect(stored).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(stored).not.toContain(RFC_SECRET);
    expect(await decryptSecret(env, stored, profileId)).toBe(RFC_SECRET);
  });

  test('o mesmo segredo cifrado duas vezes dá textos diferentes (IV aleatório)', async () => {
    expect(await encryptSecret(env, RFC_SECRET, profileId)).not.toBe(await encryptSecret(env, RFC_SECRET, profileId));
  });

  test('amarrado à pessoa: o texto de outra linha não decifra', async () => {
    const stored = await encryptSecret(env, RFC_SECRET, profileId);
    await expect(decryptSecret(env, stored, '22222222-2222-4222-8222-222222222222')).rejects.toThrow();
  });

  test('texto adulterado ou chave diferente não decifra', async () => {
    const stored = await encryptSecret(env, RFC_SECRET, profileId);
    const parts = stored.split('.');
    const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA')].join('.');
    await expect(decryptSecret(env, tampered, profileId)).rejects.toThrow();
    await expect(decryptSecret({ ...env, MFA_ENCRYPTION_KEY: 'outra-chave' }, stored, profileId)).rejects.toThrow();
  });

  test('sem MFA_ENCRYPTION_KEY usa o pepper como material da chave', async () => {
    const onlyPepper = { SESSION_TOKEN_PEPPER: 'pepper-de-teste' };
    const stored = await encryptSecret(onlyPepper, RFC_SECRET, profileId);
    expect(await decryptSecret(onlyPepper, stored, profileId)).toBe(RFC_SECRET);
  });

  test('sem nenhuma chave, falha em vez de cifrar com uma chave vazia', async () => {
    await expect(encryptSecret({}, RFC_SECRET, profileId)).rejects.toThrow('Sem chave');
  });

  test('formato desconhecido é recusado', async () => {
    await expect(decryptSecret(env, 'v9.a.b', profileId)).rejects.toThrow('formato desconhecido');
  });
});
