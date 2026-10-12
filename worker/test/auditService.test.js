/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// listAuditLogs: o total é contado com teto (LIMIT cap+1) em vez de count(*) da
// tabela inteira a cada página; acima do teto devolve total = teto e
// totalIsLowerBound = true. O contrato { success, logs, page, pageSize, total } se mantém.
import { jest } from '@jest/globals';
import * as AuditService from '../src/services/auditService.js';
import { LIMITS } from '../src/constants.js';

const ADMIN = { profileId: 'a-1', role: 'admin' };
const MEMBER = { profileId: 'm-1', role: 'member' };
const CAP = LIMITS.AUDIT_COUNT_CAP;

/** sql(texto, params): a 1ª consulta é a listagem; a que contém "AS total" é a contagem. */
function makeSql({ rows = [], count = 0 } = {}) {
  return jest.fn(async (text) => (String(text).includes('AS total') ? [{ total: String(count) }] : rows));
}

const countCall = (sql) => sql.mock.calls.find((c) => String(c[0]).includes('AS total'));
const listCall = (sql) => sql.mock.calls.find((c) => !String(c[0]).includes('AS total'));

describe('listAuditLogs — contagem com teto', () => {
  test('teto acordado: 10000 registros', () => {
    expect(CAP).toBe(10000);
  });

  test('só admin', async () => {
    await expect(AuditService.listAuditLogs(makeSql(), MEMBER, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('a contagem lê no máximo teto+1 linhas (subconsulta com LIMIT), nunca count(*) da tabela inteira', async () => {
    const sql = makeSql({ count: 12 });
    await AuditService.listAuditLogs(sql, ADMIN, {});
    const text = countCall(sql)[0];
    expect(text).toMatch(/FROM \(\s*SELECT 1 FROM audit_logs a[\s\S]*LIMIT 10001\s*\)/);
  });

  test('abaixo do teto: total exato e totalIsLowerBound=false; contrato da listagem preservado', async () => {
    const rows = [{ id: 1, action: 'LOGIN' }];
    const res = await AuditService.listAuditLogs(makeSql({ rows, count: 137 }), ADMIN, { page: 2 });
    expect(res).toEqual({ success: true, logs: rows, page: 2, pageSize: LIMITS.AUDIT_LIST_PAGE_SIZE, total: 137, totalIsLowerBound: false });
  });

  test('exatamente no teto (10000): ainda é exato', async () => {
    const res = await AuditService.listAuditLogs(makeSql({ count: CAP }), ADMIN, {});
    expect(res).toMatchObject({ total: CAP, totalIsLowerBound: false });
  });

  test('acima do teto (teto+1 linhas contadas): total = teto e totalIsLowerBound=true', async () => {
    const res = await AuditService.listAuditLogs(makeSql({ count: CAP + 1 }), ADMIN, {});
    expect(res).toMatchObject({ total: CAP, totalIsLowerBound: true });
  });

  test('os filtros valem na contagem e na listagem, com parâmetros separados da paginação', async () => {
    const sql = makeSql({ count: 3 });
    await AuditService.listAuditLogs(sql, ADMIN, { action: 'LOGIN', result: 'failure', page: 3 });
    const [listText, listParams] = listCall(sql);
    const [countText, countParams] = countCall(sql);
    expect(countParams).toEqual(['%LOGIN%', 'failure']);
    expect(countText).toContain('a.action ILIKE $1');
    expect(countText).toContain('a.result = $2');
    const pageSize = LIMITS.AUDIT_LIST_PAGE_SIZE;
    expect(listParams).toEqual(['%LOGIN%', 'failure', pageSize, 2 * pageSize]);
    expect(listText).toContain('LIMIT $3 OFFSET $4');
  });

  test('sem filtros: contagem sem parâmetros', async () => {
    const sql = makeSql({ count: 0 });
    await AuditService.listAuditLogs(sql, ADMIN, {});
    expect(countCall(sql)[1]).toEqual([]);
  });
});
