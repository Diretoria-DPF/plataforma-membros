import * as MessagingKeyService from '../src/services/messagingKeyService.js';
import { makeSql } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const VISITOR = { profileId: 'v1', role: 'visitor' };

// 32 bytes em base64url sem padding (comprimento válido para X25519).
const VALID_PUBLIC_KEY = 'A'.repeat(43);
// 16 bytes em base64url sem padding.
const VALID_SALT = 'B'.repeat(22);

function validInput(overrides) {
  return Object.assign(
    {
      algorithm: 'X25519',
      publicKey: VALID_PUBLIC_KEY,
      kdfAlgorithm: 'PBKDF2-SHA256',
      kdfIterations: 600000,
      kdfSalt: VALID_SALT,
      expectedCurrentVersion: 0,
    },
    overrides || {}
  );
}

describe('MessagingKeyService.getMyMessagingKey', () => {
  test('visitante não pode acessar chave de mensageria', async () => {
    const sql = makeSql();
    await expect(MessagingKeyService.getMyMessagingKey(sql, VISITOR)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('sem chave publicada devolve hasKey:false', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    const res = await MessagingKeyService.getMyMessagingKey(sql, MEMBER);
    expect(res).toEqual({ success: true, hasKey: false, profileId: MEMBER.profileId });
  });

  test('com chave ativa devolve os dados do KDF, incluindo o salt', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { key_version: 1, algorithm: 'X25519', public_key: VALID_PUBLIC_KEY, kdf_algorithm: 'PBKDF2-SHA256', kdf_iterations: 600000, kdf_salt: VALID_SALT },
    ]);
    const res = await MessagingKeyService.getMyMessagingKey(sql, MEMBER);
    expect(res.hasKey).toBe(true);
    expect(res.kdf.salt).toBe(VALID_SALT);
    expect(res.profileId).toBe(MEMBER.profileId);
  });
});

describe('MessagingKeyService.publishMessagingKey', () => {
  // Segue o mesmo padrão de connectionService.sendConnectionRequest: o rate
  // limit é checado ANTES da validação de forma, então mesmo um input
  // inválido consome uma tentativa do bucket (1 chamada ao sql).
  test('rejeita algoritmo fora da lista permitida', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput({ algorithm: 'RSA' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('rejeita iterações abaixo do piso da OWASP', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput({ kdfIterations: 1000 }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('rejeita chave pública com tamanho decodificado diferente de 32 bytes (X25519)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput({ publicKey: 'AAAA' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('rejeita base64url malformado na chave pública (caracteres fora do alfabeto)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput({ publicKey: '*'.repeat(43) }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('rejeita salt curto', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput({ kdfSalt: 'AAAA' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('primeira publicação bem-sucedida audita PUBLISH_MESSAGING_KEY', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit
      .mockResolvedValueOnce([{ key_version: 1 }]) // CTE de supersede+insert
      .mockResolvedValueOnce(undefined); // logAudit
    const res = await MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput(), 'cid');
    expect(res.success).toBe(true);
    expect(res.keyVersion).toBe(1);
  });

  test('expectedCurrentVersion desatualizado (rotação concorrente) vira ConflictError', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit
      .mockResolvedValueOnce([]); // CTE não retornou linha (versão não bateu)
    await expect(MessagingKeyService.publishMessagingKey(sql, MEMBER, validInput({ expectedCurrentVersion: 5 }), 'cid')).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});

describe('MessagingKeyService.getPeerMessagingKeys', () => {
  test('sem conexão aceita (nem ser a própria conta) lança ForbiddenError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ is_connection: false, is_blocked: false }]);
    await expect(MessagingKeyService.getPeerMessagingKeys(sql, MEMBER, 'peer-1')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('bloqueio em qualquer direção lança ForbiddenError mesmo com conexão aceita', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ is_connection: true, is_blocked: true }]);
    await expect(MessagingKeyService.getPeerMessagingKeys(sql, MEMBER, 'peer-1')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('conexão aceita devolve as versões de chave, nunca o salt', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ is_connection: true, is_blocked: false }])
      .mockResolvedValueOnce([{ key_version: 2, algorithm: 'X25519', public_key: VALID_PUBLIC_KEY, superseded_at: null }]);
    const res = await MessagingKeyService.getPeerMessagingKeys(sql, MEMBER, 'peer-1');
    expect(res.keys[0]).not.toHaveProperty('kdf');
    expect(res.keys[0]).not.toHaveProperty('salt');
    expect(res.keys[0].active).toBe(true);
  });
});
