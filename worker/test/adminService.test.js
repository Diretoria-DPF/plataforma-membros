import { jest } from '@jest/globals';
import * as AdminService from '../src/services/adminService.js';
import { makeSql } from './helpers/mockEnv.js';

const ADMIN = { profileId: 'admin-1', role: 'admin' };
const MEMBER = { profileId: 'member-1', role: 'member' };

describe('AdminService — controle de acesso', () => {
  test('listUsers recusa quem não é admin, sem tocar o banco', async () => {
    const sql = makeSql();
    await expect(AdminService.listUsers(sql, MEMBER, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('dashboard recusa sessão anônima (identity null)', async () => {
    const sql = makeSql();
    await expect(AdminService.dashboard(sql, null)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});

describe('AdminService.changeUserRole / banUser / unbanUser — checagem de existência', () => {
  test('changeUserRole lança NotFoundError quando o UPDATE não afeta nenhuma linha', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // UPDATE ... RETURNING id — 0 linhas
    await expect(AdminService.changeUserRole(sql, ADMIN, 'id-inexistente', 'member', 'cid')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  test('changeUserRole rejeita papel fora da lista fechada antes de tocar o banco', async () => {
    const sql = makeSql();
    await expect(AdminService.changeUserRole(sql, ADMIN, 'id-1', 'superadmin', 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('banUser lança NotFoundError para id inexistente', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(AdminService.banUser(sql, ADMIN, 'id-inexistente', 'cid')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('banUser bem-sucedido revoga sessões e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ id: 'alvo-1' }]) // UPDATE ... RETURNING id
      .mockResolvedValueOnce(undefined) // revokeAllSessionsForProfile
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AdminService.banUser(sql, ADMIN, 'alvo-1', 'cid');
    expect(res.success).toBe(true);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  test('unbanUser lança NotFoundError para id inexistente', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(AdminService.unbanUser(sql, ADMIN, 'id-inexistente', 'cid')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('changeUserRole traduz o erro do gatilho de último admin em ConflictError amigável', async () => {
    const sql = makeSql();
    sql.mockRejectedValueOnce(new Error('Operação bloqueada: não é possível remover, rebaixá-la o último administrador ativo.'));
    await expect(AdminService.changeUserRole(sql, ADMIN, 'admin-1', 'member', 'cid')).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});
