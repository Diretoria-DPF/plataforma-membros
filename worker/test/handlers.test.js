import { jest } from '@jest/globals';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

describe('handlers.js — API_REGISTRY (allowlist)', () => {
  test('contém exatamente as 89 ações públicas esperadas, nem mais nem menos', () => {
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
      // Fase 3 — IA e clínica virtual
      'apiLearnClinicalChat', 'apiLearnClinicalEvaluate', 'apiLearnClinicalGenerateCase', 'apiLearnClinicalLibrary',
      'apiLearnClinicalEpidemiology', 'apiLearnLabPreceptor', 'apiLearnGetMyAiQuota', 'apiAdminAiHealth',
      'apiAdminLearnListPendingCases', 'apiAdminLearnReviewCase',
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

  // Fase 3 — IA e clínica virtual
  test('ações da Fase 3 casam com a allowlist da ponte LaiftApi (Contrato 3)', () => {
    const BRIDGE_ALLOWLIST = /^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z][A-Za-z]*$/;
    const fase3 = [
      'apiLearnClinicalChat', 'apiLearnClinicalEvaluate', 'apiLearnClinicalGenerateCase', 'apiLearnClinicalLibrary',
      'apiLearnClinicalEpidemiology', 'apiLearnLabPreceptor', 'apiLearnGetMyAiQuota', 'apiAdminAiHealth',
      'apiAdminLearnListPendingCases', 'apiAdminLearnReviewCase',
    ];
    fase3.forEach((action) => {
      expect(action).toMatch(BRIDGE_ALLOWLIST);
      expect(typeof API_REGISTRY[action]).toBe('function');
    });
  });

  test('Fase 3: endpoints de IA exigem sessão válida (sem sessão, nenhuma chamada ao provedor)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = jest.fn();
    try {
      const sql = makeSql();
      sql.mockResolvedValue([]);
      const env = makeEnv({ GROQ_API_KEYS: 'gsk_chave_de_teste_1234567890' });
      const res = await API_REGISTRY.apiLearnClinicalChat(sql, env, ['token-invalido', { caseId: 'c', caseSource: 'builtin', question: 'oi' }]);
      expect(res).toMatchObject({ success: false, message: expect.stringContaining('Sessão') });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('Fase 3: entrada que não é objeto é tratada como {} (erro de validação, não exceção)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ profile_id: 'p1', role: 'member', status: 'active', full_name: 'X', email: 'x@y.z', email_confirmed_at: '2026-01-01' }]);
    const res = await API_REGISTRY.apiLearnLabPreceptor(sql, makeEnv(), ['token', 'texto solto']);
    expect(res).toMatchObject({ success: false, message: expect.stringContaining('dúvida') });
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
