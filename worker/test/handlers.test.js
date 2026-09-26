import { jest } from '@jest/globals';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

describe('handlers.js — API_REGISTRY (allowlist)', () => {
  test('contém exatamente as 66 ações públicas esperadas, nem mais nem menos', () => {
    const expected = [
      'apiRegister', 'apiConfirmEmail', 'apiLogin', 'apiRequestPasswordReset', 'apiValidateResetToken',
      'apiConfirmPasswordReset', 'apiLogout', 'apiTouchSession', 'apiGetMyProfile', 'apiUpdateMyProfile', 'apiUpdateMyPreferences',
      'apiSubmitFeedback', 'apiUpdateMyAvatar', 'apiGetMyMetrics',
      'apiListEvents', 'apiRegisterForEvent', 'apiListRecentCompletedEvents',
      'apiSubmitProposal', 'apiListMyProposals',
      'apiListOpenProposalsForVoting', 'apiCastVote', 'apiGetProposalResults',
      'apiListTasks', 'apiSignupForTask', 'apiMarkTaskComplete', 'apiListTaskComments', 'apiSubmitTaskComment',
      'apiAdminDashboard', 'apiAdminListUsers', 'apiAdminChangeUserRole', 'apiAdminBanUser', 'apiAdminUnbanUser',
      'apiAdminListFeedback', 'apiAdminCreateEvent', 'apiAdminUpdateEventStatus', 'apiAdminListAllEvents',
      'apiAdminListProposalsForReview', 'apiAdminTransitionProposal', 'apiAdminCreateTask', 'apiAdminUpdateTaskStatus',
      'apiAdminListAllTasks', 'apiAdminListAuditLogs', 'apiAdminListErrorLogs', 'apiAdminUploadEventImage',
      'apiGetMemberProfile', 'apiGetOrgChart', 'apiAdminSetLeaguePosition',
      'apiSendConnectionRequest', 'apiListIncomingConnectionRequests', 'apiRespondConnectionRequest',
      'apiListMyConnections', 'apiRemoveConnection', 'apiBlockProfile', 'apiUnblockProfile', 'apiListMyBlocks',
      'apiReportProfile', 'apiAdminListReports', 'apiAdminResolveReport',
      'apiGetMyMessagingKey', 'apiPublishMessagingKey', 'apiGetPeerMessagingKeys',
      'apiOpenConversation', 'apiListConversations', 'apiListMessages', 'apiSendMessage', 'apiMarkConversationRead', 'apiMessagingSync',
      'apiClearConversation', 'apiHideMessageForMe', 'apiDeleteMessage',
    ];
    // Fase 2 — Dados & Presença (aprendizagem e presença)
    expected.push(
      'apiLearnGetMyStats', 'apiLearnSubmitQuizAttempt', 'apiLearnRecordLabFormulation', 'apiLearnGetMyAttendanceQr',
      'apiAdminAttendanceListEvents', 'apiAdminAttendanceCheckIn', 'apiAdminAttendanceSearch',
      'apiAdminAttendanceExportCsv', 'apiAdminAttendanceBadges'
    );
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

// Fase 2 — Dados & Presença: fiação dos endpoints novos no API_REGISTRY.
describe('handlers.js — endpoints da Fase 2 (aprendizagem e presença)', () => {
  const sessionRow = (role) => [{
    profile_id: '11111111-1111-4111-8111-111111111111', role, status: 'active',
    full_name: 'Pessoa Teste', email: 'pessoa@x.com', email_confirmed_at: '2026-01-01',
  }];

  test('todas as ações novas seguem a allowlist da ponte dos módulos', () => {
    const bridge = /^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z][A-Za-z]*$/;
    Object.keys(API_REGISTRY)
      .filter((k) => /^api(Learn|AdminAttendance)/.test(k))
      .forEach((k) => expect(k).toMatch(bridge));
  });

  test('apiAdminAttendanceCheckIn com sessão de membro → acesso negado, sem tocar em presença', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(sessionRow('member'));
    const res = await API_REGISTRY.apiAdminAttendanceCheckIn(sql, makeEnv(), ['tok', { eventId: 'x', method: 'manual', email: 'a@b.com' }]);
    expect(res).toEqual({ success: false, message: 'Acesso não autorizado para este recurso.' });
    expect(sql).toHaveBeenCalledTimes(1); // só a resolução da sessão
  });

  test('apiLearnSubmitQuizAttempt com input que não é objeto → erro de validação, não erro inesperado', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(sessionRow('visitor')).mockResolvedValueOnce([{ attempts: 1 }]); // sessão + rate limit
    const res = await API_REGISTRY.apiLearnSubmitQuizAttempt(sql, makeEnv(), ['tok', 'lixo']);
    expect(res).toEqual({ success: false, message: 'Módulo inválido.' });
  });

  test('apiLearnGetMyAttendanceQr devolve o QR v2 da PRÓPRIA sessão (ignora qualquer argumento extra)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(sessionRow('member'));
    const res = await API_REGISTRY.apiLearnGetMyAttendanceQr(sql, makeEnv(), ['tok', { profileId: '99999999-9999-4999-8999-999999999999' }]);
    expect(res.success).toBe(true);
    expect(res.qrPayload).toMatch(/^LAIFT:v2:11111111-1111-4111-8111-111111111111\.[A-Za-z0-9_-]{24}$/);
  });

  test('sem sessão válida, nenhum endpoint da Fase 2 responde dados', async () => {
    const names = ['apiLearnGetMyStats', 'apiLearnGetMyAttendanceQr', 'apiAdminAttendanceListEvents'];
    for (const name of names) {
      const sql = makeSql();
      sql.mockResolvedValueOnce([]);
      const res = await API_REGISTRY[name](sql, makeEnv(), ['token-invalido']);
      expect(res).toMatchObject({ success: false, message: expect.stringContaining('Sessão') });
    }
  });
});
