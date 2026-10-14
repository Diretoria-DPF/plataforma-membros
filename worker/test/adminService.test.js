/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as AdminService from '../src/services/adminService.js';
import { makeSql } from './helpers/mockEnv.js';

const ADMIN = { profileId: 'admin-1', role: 'admin' };
const MEMBER = { profileId: 'member-1', role: 'member' };
const OPTS = () => ({ stepUp: jest.fn().mockResolvedValue(undefined) });

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
    await expect(AdminService.changeUserRole(sql, ADMIN, 'id-inexistente', 'member', 'cid', OPTS())).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  test('changeUserRole rejeita papel fora da lista fechada antes de tocar o banco', async () => {
    const sql = makeSql();
    await expect(AdminService.changeUserRole(sql, ADMIN, 'id-1', 'superadmin', 'cid', OPTS())).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('banUser lança NotFoundError para id inexistente', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(AdminService.banUser(sql, ADMIN, 'id-inexistente', 'cid', OPTS())).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('banUser bem-sucedido revoga sessões e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ id: 'alvo-1' }]) // UPDATE ... RETURNING id
      .mockResolvedValueOnce(undefined) // revokeAllSessionsForProfile
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AdminService.banUser(sql, ADMIN, 'alvo-1', 'cid', OPTS());
    expect(res.success).toBe(true);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  test('unbanUser lança NotFoundError para id inexistente', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(AdminService.unbanUser(sql, ADMIN, 'id-inexistente', 'cid', OPTS())).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('changeUserRole traduz o erro do gatilho de último admin em ConflictError amigável', async () => {
    const sql = makeSql();
    sql.mockRejectedValueOnce(new Error('Operação bloqueada: não é possível remover, rebaixá-la o último administrador ativo.'));
    await expect(AdminService.changeUserRole(sql, ADMIN, 'admin-1', 'member', 'cid', OPTS())).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});

describe('AdminService — reautenticação (step-up) nas ações sensíveis', () => {
  const calls = {
    changeUserRole: (sql, options) => AdminService.changeUserRole(sql, ADMIN, 'alvo-1', 'member', 'cid', options),
    banUser: (sql, options) => AdminService.banUser(sql, ADMIN, 'alvo-1', 'cid', options),
    unbanUser: (sql, options) => AdminService.unbanUser(sql, ADMIN, 'alvo-1', 'cid', options),
  };

  test.each(Object.keys(calls))('%s sem stepUp: recusa (Forbidden) e não toca o banco', async (name) => {
    const sql = makeSql();
    await expect(calls[name](sql, undefined)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(calls[name](sql, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test.each(Object.keys(calls))('%s com reautenticação recusada: nada é alterado e a falha é auditada', async (name) => {
    const sql = makeSql();
    const stepUp = jest.fn().mockRejectedValue(Object.assign(new Error('Senha incorreta.'), { name: 'AuthError' }));
    await expect(calls[name](sql, { stepUp })).rejects.toMatchObject({ name: 'AuthError' });
    expect(sql).toHaveBeenCalledTimes(1); // só o audit_logs
    expect(sql.mock.calls[0][0].join('')).toMatch(/INSERT INTO audit_logs/);
    expect(sql.mock.calls[0].slice(1)).toContain('failure');
  });

  test('quem não é admin é barrado antes de pedir senha', async () => {
    const sql = makeSql();
    const stepUp = jest.fn();
    await expect(AdminService.banUser(sql, MEMBER, 'alvo-1', 'cid', { stepUp })).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(stepUp).not.toHaveBeenCalled();
  });

  test('papel inválido é recusado antes de pedir senha', async () => {
    const stepUp = jest.fn();
    await expect(AdminService.changeUserRole(makeSql(), ADMIN, 'alvo-1', 'superadmin', 'cid', { stepUp })).rejects.toMatchObject({ name: 'ValidationError' });
    expect(stepUp).not.toHaveBeenCalled();
  });

  test('com reautenticação válida a ação segue e o stepUp roda uma única vez, antes do UPDATE', async () => {
    const sql = makeSql();
    const order = [];
    const stepUp = jest.fn(async () => { order.push('stepUp'); });
    sql.mockImplementation(async () => { order.push('sql'); return [{ id: 'alvo-1' }]; });
    await AdminService.unbanUser(sql, ADMIN, 'alvo-1', 'cid', { stepUp });
    expect(stepUp).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('stepUp');
  });
});
