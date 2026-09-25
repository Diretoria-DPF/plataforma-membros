import { jest } from '@jest/globals';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

describe('handlers.js — API_REGISTRY (allowlist)', () => {
  test('contém exatamente as 35 ações públicas esperadas, nem mais nem menos', () => {
    const expected = [
      'apiRegister', 'apiConfirmEmail', 'apiLogin', 'apiRequestPasswordReset', 'apiValidateResetToken',
      'apiConfirmPasswordReset', 'apiLogout', 'apiGetMyProfile', 'apiUpdateMyProfile', 'apiUpdateMyPreferences',
      'apiSubmitFeedback', 'apiListEvents', 'apiRegisterForEvent', 'apiSubmitProposal', 'apiListMyProposals',
      'apiListOpenProposalsForVoting', 'apiCastVote', 'apiGetProposalResults', 'apiListTasks', 'apiSignupForTask',
      'apiAdminDashboard', 'apiAdminListUsers', 'apiAdminChangeUserRole', 'apiAdminBanUser', 'apiAdminUnbanUser',
      'apiAdminListFeedback', 'apiAdminCreateEvent', 'apiAdminUpdateEventStatus', 'apiAdminListAllEvents',
      'apiAdminListProposalsForReview', 'apiAdminTransitionProposal', 'apiAdminCreateTask', 'apiAdminUpdateTaskStatus',
      'apiAdminListAllTasks', 'apiAdminListAuditLogs', 'apiAdminListErrorLogs',
    ];
    expect(Object.keys(API_REGISTRY).sort()).toEqual(expected.sort());
  });

  test('cada entrada é uma função (nunca um valor não-invocável)', () => {
    Object.values(API_REGISTRY).forEach((fn) => expect(typeof fn).toBe('function'));
  });

  test('apiLogin com credenciais inválidas devolve {success:false} em vez de lançar (run() já captura)', async () => {
    const sql = makeSql();
    const env = makeEnv();
    const res = await API_REGISTRY.apiLogin(sql, env, ['', '']);
    expect(res.success).toBe(false);
  });

  test('runWithSession devolve mensagem genérica de sessão inválida sem lançar', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // resolveSession não encontra nada
    const env = makeEnv();
    const res = await API_REGISTRY.apiGetMyProfile(sql, env, ['token-invalido']);
    expect(res).toMatchObject({ success: false, message: expect.stringContaining('Sessão') });
  });

  test('erro inesperado (não .expected) vira mensagem genérica com correlationId, nunca o detalhe interno', async () => {
    const sql = makeSql();
    sql.mockRejectedValueOnce(new Error('detalhe interno sensível que não deve vazar'));
    const env = makeEnv();
    const res = await API_REGISTRY.apiListEvents(sql, env, ['']);
    expect(res.success).toBe(false);
    expect(res.message).not.toContain('detalhe interno sensível');
    expect(res.message).toMatch(/ref: [0-9a-f-]+/);
  });
});
