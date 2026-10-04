/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as MediaService from '../src/services/mediaService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

const ADMIN = { profileId: 'a1', role: 'admin' };
const MEMBER = { profileId: 'm1', role: 'member' };

const SIGNATURES = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

// Arquivo de `sizeBytes` bytes que começa com a assinatura real do formato.
function imageBase64(kind, sizeBytes) {
  const head = Buffer.from(SIGNATURES[kind]);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, sizeBytes - head.length), 1)]).toString('base64');
}

function pngBase64(sizeBytes) {
  return imageBase64('png', sizeBytes);
}

function makeMediaEnv() {
  return makeEnv({
    MEDIA_PUBLIC_URL: 'https://pub-test.r2.dev',
    MEDIA_BUCKET: { put: jest.fn().mockResolvedValue(undefined) },
  });
}

describe('MediaService.uploadAvatarBytes', () => {
  test('rejeita tipo MIME não suportado', async () => {
    const env = makeMediaEnv();
    await expect(MediaService.uploadAvatarBytes(env, 'p1', pngBase64(10), 'image/svg+xml')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(env.MEDIA_BUCKET.put).not.toHaveBeenCalled();
  });

  test('rejeita imagem acima do limite de 2MB para avatar', async () => {
    const env = makeMediaEnv();
    const tooBig = pngBase64(2 * 1024 * 1024 + 1);
    await expect(MediaService.uploadAvatarBytes(env, 'p1', tooBig, 'image/png')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('rejeita payload vazio', async () => {
    const env = makeMediaEnv();
    await expect(MediaService.uploadAvatarBytes(env, 'p1', '', 'image/png')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test.each([
    ['image/png', 'png', 'png'],
    ['image/jpeg', 'jpeg', 'jpg'],
    ['image/gif', 'gif', 'gif'],
    ['image/webp', 'webp', 'webp'],
  ])('aceita %s quando a assinatura confere', async (mime, kind, ext) => {
    const env = makeMediaEnv();
    const url = await MediaService.uploadAvatarBytes(env, 'p1', imageBase64(kind, 64), mime);
    expect(url).toMatch(new RegExp('\\.' + ext + '$'));
  });

  test.each([
    ['HTML disfarçado de PNG', Buffer.from('<html><script>alert(1)</script></html>').toString('base64'), 'image/png'],
    ['executável Windows disfarçado de JPEG', Buffer.from('MZ\x90\x00\x03\x00\x00\x00').toString('base64'), 'image/jpeg'],
    ['JPEG declarado como PNG', imageBase64('jpeg', 64), 'image/png'],
    ['RIFF que não é WEBP (WAV)', Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ').toString('base64'), 'image/webp'],
  ])('recusa %s e não grava nada no bucket', async (_label, base64, mime) => {
    const env = makeMediaEnv();
    await expect(MediaService.uploadAvatarBytes(env, 'p1', base64, mime)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(env.MEDIA_BUCKET.put).not.toHaveBeenCalled();
  });

  test('sniffImageType reconhece os quatro formatos e devolve null para o resto', () => {
    expect(MediaService.sniffImageType(Buffer.from(SIGNATURES.png))).toBe('image/png');
    expect(MediaService.sniffImageType(Buffer.from(SIGNATURES.jpeg))).toBe('image/jpeg');
    expect(MediaService.sniffImageType(Buffer.from(SIGNATURES.gif))).toBe('image/gif');
    expect(MediaService.sniffImageType(Buffer.from(SIGNATURES.webp))).toBe('image/webp');
    expect(MediaService.sniffImageType(Buffer.from('texto qualquer'))).toBeNull();
    expect(MediaService.sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  test('faz upload e devolve a URL pública montada a partir de MEDIA_PUBLIC_URL', async () => {
    const env = makeMediaEnv();
    const url = await MediaService.uploadAvatarBytes(env, 'p1', pngBase64(100), 'image/png');
    expect(url).toMatch(/^https:\/\/pub-test\.r2\.dev\/avatars\/p1-\d+\.png$/);
    expect(env.MEDIA_BUCKET.put).toHaveBeenCalledTimes(1);
  });
});

describe('MediaService.updateMyAvatar', () => {
  test('faz upload, grava avatar_url do próprio perfil e audita', async () => {
    const env = makeMediaEnv();
    const sql = makeSql();
    sql.mockResolvedValueOnce(undefined); // UPDATE profiles
    sql.mockResolvedValueOnce(undefined); // logAudit

    const res = await MediaService.updateMyAvatar(sql, env, MEMBER, pngBase64(100), 'image/png', 'cid-1');
    expect(res.success).toBe(true);
    expect(res.avatarUrl).toMatch(/^https:\/\/pub-test\.r2\.dev\/avatars\/m1-/);
  });
});

describe('MediaService.uploadEventImage', () => {
  test('exige papel admin', async () => {
    const env = makeMediaEnv();
    const sql = makeSql();
    await expect(
      MediaService.uploadEventImage(sql, env, MEMBER, 'evt-1', pngBase64(100), 'image/png', 'cid-1')
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(env.MEDIA_BUCKET.put).not.toHaveBeenCalled();
  });

  test('lança NotFoundError quando o evento não existe', async () => {
    const env = makeMediaEnv();
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // SELECT id FROM events — não encontrado

    await expect(
      MediaService.uploadEventImage(sql, env, ADMIN, 'evt-inexistente', pngBase64(100), 'image/png', 'cid-1')
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('rejeita imagem acima do limite de 5MB para evento', async () => {
    const env = makeMediaEnv();
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'evt-1' }]); // evento existe

    const tooBig = pngBase64(5 * 1024 * 1024 + 1);
    await expect(
      MediaService.uploadEventImage(sql, env, ADMIN, 'evt-1', tooBig, 'image/png', 'cid-1')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('admin faz upload, grava image_url do evento e audita', async () => {
    const env = makeMediaEnv();
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ id: 'evt-1' }]) // evento existe
      .mockResolvedValueOnce(undefined) // UPDATE events
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await MediaService.uploadEventImage(sql, env, ADMIN, 'evt-1', pngBase64(100), 'image/png', 'cid-1');
    expect(res.success).toBe(true);
    expect(res.imageUrl).toMatch(/^https:\/\/pub-test\.r2\.dev\/events\/evt-1-/);
  });
});
