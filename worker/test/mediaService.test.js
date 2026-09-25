import { jest } from '@jest/globals';
import * as MediaService from '../src/services/mediaService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

const ADMIN = { profileId: 'a1', role: 'admin' };
const MEMBER = { profileId: 'm1', role: 'member' };

function pngBase64(sizeBytes) {
  return Buffer.alloc(sizeBytes, 1).toString('base64');
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
