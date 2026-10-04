/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * handlers.js
 * Equivalente exato de src/Main.gs (Apps Script): a ÚNICA superfície de
 * "funções chamáveis pelo cliente" — cada apiXxx aqui:
 *  1) nunca aceita userId/role/status vindos do cliente como prova de
 *     identidade — sempre resolve a sessão a partir do token opaco;
 *  2) delega a regra de negócio para o service correspondente;
 *  3) captura exceções esperadas (err.expected) e devolve a mensagem ao
 *     cliente; exceções inesperadas são logadas com correlationId e
 *     substituídas por mensagem genérica.
 *
 * API_REGISTRY é a mesma allowlist fechada de src/Main.gs — index.js só
 * invoca uma função se o nome (`action` do corpo da requisição) bater
 * EXATAMENTE com uma chave própria deste objeto (hasOwnProperty, nunca
 * resolução dinâmica contra o escopo global).
 */
import * as S from './security.js';
import * as Logging from './logging.js';
import { GENERIC_ERROR_MESSAGE } from './constants.js';
import * as AuthService from './services/authService.js';
import * as ProfileService from './services/profileService.js';
import * as HomeService from './services/homeService.js';
import * as FeatureFlagService from './services/featureFlagService.js';
import * as MfaService from './services/mfaService.js';
import * as EventService from './services/eventService.js';
import * as ProposalService from './services/proposalService.js';
import * as TaskService from './services/taskService.js';
import * as AdminService from './services/adminService.js';
import * as AuditService from './services/auditService.js';
import * as MediaService from './services/mediaService.js';
import * as ConnectionService from './services/connectionService.js';
import * as ModerationService from './services/moderationService.js';
import * as OrgChartService from './services/orgChartService.js';
import * as MessagingKeyService from './services/messagingKeyService.js';
import * as MessageService from './services/messageService.js';
// Fase 2 — Dados & Presença (docs/PLANO_FASES_2_3_4.md, Contrato 2)
import * as LearningService from './services/learningService.js';
import * as AttendanceService from './services/attendanceService.js';
// Fase 3 — IA (Groq) e clínica virtual
import * as AiService from './services/aiService.js';
import * as ClinicalService from './services/clinicalService.js';
// PR 3.2 (Onda 3) — proxy RCSB/PubChem do modo Moléculas do Atlas 3D
import * as AtlasMoleculeService from './services/atlasMoleculeService.js';
import * as AtlasTelemetryService from './services/atlasTelemetryService.js';

async function run(sql, callback) {
  const correlationId = S.newCorrelationId();
  try {
    return await callback(correlationId);
  } catch (err) {
    if (err && err.expected) {
      // `payload` carrega sinais para a interface (ex.: mfaSetupRequired), nunca dados sensíveis.
      return Object.assign({ success: false, message: err.message }, err.payload || {});
    }
    await Logging.logError(sql, correlationId, (err && err.name) || 'UNEXPECTED_ERROR', String((err && err.message) || err), null);
    return { success: false, message: GENERIC_ERROR_MESSAGE + ' (ref: ' + correlationId + ')' };
  }
}

async function runWithSession(sql, env, sessionToken, callback, options) {
  return run(sql, async (correlationId) => {
    const identity = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken);
    // Com `mfa_required` ligada, admin sem autenticador só chega às ações de
    // cadastro do MFA (allowMfaSetup); o resto é recusado com mfaSetupRequired.
    if (!(options && options.allowMfaSetup)) await MfaService.assertAdminMfaSatisfied(sql, identity);
    return callback(identity, correlationId);
  });
}

// Fase 2 — entrada dos endpoints dos módulos: só um objeto simples é
// aceito; null, string, número ou array viram {} e caem na validação do
// service (nunca um TypeError inesperado ao ler input.campo).
function asInput(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

export const API_REGISTRY = {
  // ---- Autenticação (público) ----
  apiRegister: (sql, env, [input]) => run(sql, (cid) => AuthService.register(sql, env, input || {}, cid)),
  apiConfirmEmail: (sql, env, [token]) => run(sql, (cid) => AuthService.confirmEmail(sql, env, token, cid)),
  apiLogin: (sql, env, [email, password]) => run(sql, (cid) => AuthService.login(sql, env, email, password, '', cid)),
  apiRequestPasswordReset: (sql, env, [email]) => run(sql, (cid) => AuthService.requestPasswordReset(sql, env, email, cid)),
  apiValidateResetToken: (sql, env, [token]) => run(sql, () => AuthService.validateResetToken(sql, env, token)),
  apiConfirmPasswordReset: (sql, env, [token, newPassword]) => run(sql, (cid) => AuthService.confirmPasswordReset(sql, env, token, newPassword, cid)),

  // ---- Verificação em duas etapas ----
  apiLoginMfa: (sql, env, [mfaToken, code]) => run(sql, (cid) => MfaService.completeLogin(sql, env, mfaToken, code, '', cid)),
  // As ações abaixo valem também para admin que ainda não cadastrou o MFA (allowMfaSetup).
  apiMfaStatus: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => MfaService.status(sql, identity), { allowMfaSetup: true }),
  apiMfaBeginEnrollment: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => MfaService.beginEnrollment(sql, env, identity, input || {}), { allowMfaSetup: true }),
  apiMfaConfirmEnrollment: (sql, env, [sessionToken, code]) => runWithSession(sql, env, sessionToken, (identity, cid) => MfaService.confirmEnrollment(sql, env, identity, code, cid), { allowMfaSetup: true }),
  apiMfaRegenerateRecoveryCodes: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => MfaService.regenerateRecoveryCodes(sql, env, identity, input || {}, cid)),
  apiMfaDisable: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => MfaService.disable(sql, env, identity, input || {}, cid)),
  apiAdminResetUserMfa: (sql, env, [sessionToken, targetProfileId, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => MfaService.adminResetUserMfa(sql, env, identity, targetProfileId, input || {}, cid)),

  // ---- Sessão ----
  apiLogout: (sql, env, [sessionToken]) => run(sql, (cid) => AuthService.logout(sql, env, sessionToken, cid)),
  apiTouchSession: (sql, env, [sessionToken]) => run(sql, async () => {
    await S.touchSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken);
    return { success: true };
  }),

  // ---- Perfil (requer sessão) ----
  apiGetMyProfile: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProfileService.getMyProfile(sql, identity), { allowMfaSetup: true }),
  apiUpdateMyProfile: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.updateMyProfile(sql, identity, input || {}, cid)),
  apiUpdateMyPreferences: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.updateMyPreferences(sql, identity, input || {}, cid)),
  apiSubmitFeedback: (sql, env, [sessionToken, message]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.submitFeedback(sql, identity, message, cid)),
  apiUpdateMyAvatar: (sql, env, [sessionToken, avatarBase64, avatarMimeType]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.updateMyAvatarFromBase64(sql, env, identity, avatarBase64, avatarMimeType, cid)),
  apiGetMyMetrics: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProfileService.getMyMetrics(sql, identity)),
  // Início: eventos, tarefas, votações, aprendizado e caixa de entrada em UMA requisição.
  apiGetHomeSummary: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => HomeService.getHomeSummary(sql, env, identity)),

  // ---- Feature flags (identidade opcional: visitante anônimo só vê flags a 100%) ----
  apiGetFeatureFlags: (sql, env, [sessionToken]) => run(sql, async () => {
    const identity = sessionToken ? await S.resolveSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken) : null;
    return { success: true, flags: await FeatureFlagService.getPublicFlagsFor(sql, identity) };
  }),
  apiAdminListFeatureFlags: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => FeatureFlagService.adminList(sql, identity)),
  apiAdminSetFeatureFlag: (sql, env, [sessionToken, key, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => FeatureFlagService.adminSet(sql, identity, key, input || {}, cid, { stepUp: () => MfaService.requireStepUp(sql, env, identity, input || {}) })),

  // ---- Eventos ----
  apiListEvents: (sql, env, [sessionToken]) => run(sql, async () => {
    const identity = sessionToken ? await S.resolveSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken) : null;
    return EventService.listEvents(sql, env, identity);
  }),
  apiRegisterForEvent: (sql, env, [sessionToken, eventId]) => runWithSession(sql, env, sessionToken, (identity, cid) => EventService.registerForEvent(sql, env, identity, eventId, cid)),
  apiListRecentCompletedEvents: (sql) => run(sql, () => EventService.listRecentCompletedEvents(sql)),

  // ---- Propostas e votação ----
  apiSubmitProposal: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProposalService.submitProposal(sql, identity, input || {}, cid)),
  apiListMyProposals: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProposalService.listMyProposals(sql, identity)),
  apiListOpenProposalsForVoting: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProposalService.listOpenForVoting(sql, identity)),
  apiCastVote: (sql, env, [sessionToken, proposalId, choice, complementText]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProposalService.castVote(sql, identity, proposalId, choice, complementText, cid)),
  apiGetProposalResults: (sql, env, [sessionToken, proposalId]) => runWithSession(sql, env, sessionToken, (identity) => ProposalService.getProposalResults(sql, identity, proposalId)),

  // ---- Tarefas ----
  apiListTasks: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => TaskService.listTasks(sql, identity)),
  apiSignupForTask: (sql, env, [sessionToken, taskId]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.signupForTask(sql, identity, taskId, cid)),
  apiMarkTaskComplete: (sql, env, [sessionToken, taskId]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.markTaskComplete(sql, identity, taskId, cid)),
  apiListTaskComments: (sql, env, [sessionToken, taskId]) => runWithSession(sql, env, sessionToken, (identity) => TaskService.listTaskComments(sql, identity, taskId)),
  apiSubmitTaskComment: (sql, env, [sessionToken, taskId, message]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.submitTaskComment(sql, identity, taskId, message, cid)),

  // ---- Administração ----
  apiAdminDashboard: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => AdminService.dashboard(sql, identity)),
  apiAdminListUsers: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AdminService.listUsers(sql, identity, input || {})),
  apiAdminChangeUserRole: (sql, env, [sessionToken, targetProfileId, newRole]) => runWithSession(sql, env, sessionToken, (identity, cid) => AdminService.changeUserRole(sql, identity, targetProfileId, newRole, cid)),
  apiAdminBanUser: (sql, env, [sessionToken, targetProfileId]) => runWithSession(sql, env, sessionToken, (identity, cid) => AdminService.banUser(sql, identity, targetProfileId, cid)),
  apiAdminUnbanUser: (sql, env, [sessionToken, targetProfileId]) => runWithSession(sql, env, sessionToken, (identity, cid) => AdminService.unbanUser(sql, identity, targetProfileId, cid)),
  apiAdminListFeedback: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AdminService.listFeedback(sql, identity, input || {})),
  apiAdminCreateEvent: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => EventService.createEvent(sql, env, identity, input || {}, cid)),
  apiAdminUpdateEventStatus: (sql, env, [sessionToken, eventId, newStatus]) => runWithSession(sql, env, sessionToken, (identity, cid) => EventService.updateEventStatus(sql, env, identity, eventId, newStatus, cid)),
  apiAdminListAllEvents: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => EventService.listAllEventsAdmin(sql, identity)),
  apiAdminListProposalsForReview: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProposalService.listForReview(sql, identity)),
  apiAdminTransitionProposal: (sql, env, [sessionToken, proposalId, newStatus, extra]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProposalService.transitionProposal(sql, identity, proposalId, newStatus, extra || {}, cid)),
  apiAdminCreateTask: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.createTask(sql, identity, input || {}, cid)),
  apiAdminUpdateTaskStatus: (sql, env, [sessionToken, taskId, newStatus]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.updateTaskStatus(sql, identity, taskId, newStatus, cid)),
  apiAdminListAllTasks: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => TaskService.listAllTasksAdmin(sql, identity)),
  apiAdminListAuditLogs: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AuditService.listAuditLogs(sql, identity, input || {})),
  apiAdminListErrorLogs: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AuditService.listErrorLogs(sql, identity, input || {})),
  apiAdminUploadEventImage: (sql, env, [sessionToken, eventId, imageBase64, imageMimeType]) => runWithSession(sql, env, sessionToken, (identity, cid) => MediaService.uploadEventImage(sql, env, identity, eventId, imageBase64, imageMimeType, cid)),

  // ---- Perfil de outro membro / fluxograma ----
  apiGetMemberProfile: (sql, env, [sessionToken, username]) => runWithSession(sql, env, sessionToken, (identity) => ProfileService.getMemberProfile(sql, identity, username)),
  apiGetOrgChart: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => OrgChartService.getOrgChart(sql, env, identity)),
  apiAdminSetLeaguePosition: (sql, env, [sessionToken, targetProfileId, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => OrgChartService.setMemberPosition(sql, env, identity, targetProfileId, input || {}, cid)),

  // ---- Conexões entre membros ----
  apiSendConnectionRequest: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ConnectionService.sendConnectionRequest(sql, env, identity, input || {}, cid)),
  apiListIncomingConnectionRequests: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ConnectionService.listIncomingRequests(sql, identity)),
  apiRespondConnectionRequest: (sql, env, [sessionToken, connectionId, decision]) => runWithSession(sql, env, sessionToken, (identity, cid) => ConnectionService.respondToRequest(sql, env, identity, connectionId, decision, cid)),
  apiListMyConnections: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ConnectionService.listMyConnections(sql, identity)),
  apiRemoveConnection: (sql, env, [sessionToken, connectionId]) => runWithSession(sql, env, sessionToken, (identity, cid) => ConnectionService.removeConnection(sql, identity, connectionId, cid)),
  apiBlockProfile: (sql, env, [sessionToken, targetProfileId]) => runWithSession(sql, env, sessionToken, (identity, cid) => ConnectionService.blockProfile(sql, identity, targetProfileId, cid)),
  apiUnblockProfile: (sql, env, [sessionToken, targetProfileId]) => runWithSession(sql, env, sessionToken, (identity, cid) => ConnectionService.unblockProfile(sql, identity, targetProfileId, cid)),
  apiListMyBlocks: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ConnectionService.listMyBlocks(sql, identity)),

  // ---- Denúncias (moderação) ----
  apiReportProfile: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ModerationService.submitReport(sql, identity, input || {}, cid)),
  apiAdminListReports: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => ModerationService.listReports(sql, identity, input || {})),
  apiAdminResolveReport: (sql, env, [sessionToken, reportId, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ModerationService.resolveReport(sql, identity, reportId, input || {}, cid)),

  // ---- Mensageria E2EE — chaves (Fase 3d) ----
  apiGetMyMessagingKey: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => MessagingKeyService.getMyMessagingKey(sql, identity)),
  apiPublishMessagingKey: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => MessagingKeyService.publishMessagingKey(sql, identity, input || {}, cid)),
  apiGetPeerMessagingKeys: (sql, env, [sessionToken, peerProfileId]) => runWithSession(sql, env, sessionToken, (identity) => MessagingKeyService.getPeerMessagingKeys(sql, identity, peerProfileId)),

  // ---- Mensageria E2EE — conversas e mensagens (Fase 3e) ----
  apiOpenConversation: (sql, env, [sessionToken, peerProfileId]) => runWithSession(sql, env, sessionToken, (identity, cid) => MessageService.openConversation(sql, identity, peerProfileId, cid)),
  apiListConversations: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => MessageService.listConversations(sql, identity)),
  apiListMessages: (sql, env, [sessionToken, conversationId, input]) => runWithSession(sql, env, sessionToken, (identity) => MessageService.listMessages(sql, identity, conversationId, input || {})),
  apiSendMessage: (sql, env, [sessionToken, conversationId, payload]) => runWithSession(sql, env, sessionToken, (identity, cid) => MessageService.sendMessage(sql, env, identity, conversationId, payload || {}, cid)),
  apiMarkConversationRead: (sql, env, [sessionToken, conversationId, lastReadMessageId]) => runWithSession(sql, env, sessionToken, (identity) => MessageService.markConversationRead(sql, env, identity, conversationId, lastReadMessageId)),
  apiMessagingSync: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => MessageService.syncMessaging(sql, env, identity)),
  apiClearConversation: (sql, env, [sessionToken, conversationId]) => runWithSession(sql, env, sessionToken, (identity, cid) => MessageService.clearConversation(sql, env, identity, conversationId, cid)),
  apiHideMessageForMe: (sql, env, [sessionToken, conversationId, messageId]) => runWithSession(sql, env, sessionToken, (identity, cid) => MessageService.hideMessageForMe(sql, identity, conversationId, messageId, cid)),
  apiDeleteMessage: (sql, env, [sessionToken, conversationId, messageId]) => runWithSession(sql, env, sessionToken, (identity, cid) => MessageService.deleteMessage(sql, identity, conversationId, messageId, cid)),

  // Fase 2 — Dados & Presença: aprendizagem e presença (docs/PLANO_FASES_2_3_4.md,
  // Contrato 2). Usadas pelos módulos via ponte (App.callLearningApi), que só
  // aceita os prefixos apiLearn*/apiAdminAttendance*; entrada = UM objeto.
  // input que não seja objeto vira {} (o service então recusa com mensagem clara).
  apiLearnGetMyStats: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => LearningService.getMyStats(sql, identity)),
  apiLearnSubmitQuizAttempt: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LearningService.submitQuizAttempt(sql, identity, asInput(input), cid)),
  apiLearnRecordLabFormulation: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LearningService.recordLabFormulation(sql, identity, asInput(input), cid)),
  apiLearnGetMyAttendanceQr: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => AttendanceService.getMyAttendanceQr(env, identity)),
  apiAdminAttendanceListEvents: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => AttendanceService.listEvents(sql, identity)),
  apiAdminAttendanceCheckIn: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => AttendanceService.checkIn(sql, env, identity, asInput(input), cid)),
  apiAdminAttendanceSearch: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AttendanceService.search(sql, identity, asInput(input))),
  apiAdminAttendanceExportCsv: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => AttendanceService.exportCsv(sql, identity, asInput(input), cid)),
  apiAdminAttendanceBadges: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => AttendanceService.badges(sql, env, identity, asInput(input), cid)),
  // Fase 3 — IA na Worker e clínica virtual (docs/FASE_3_IA_CLINICA.md).
  // Chamados pelos módulos via ponte LaiftApi (Contrato 3): entrada é UM
  // objeto, e os prefixos seguem a allowlist da ponte
  // (/^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z]/). Cota diária
  // por pessoa e papel em cada chamada que custa tokens (aiService.withQuota).
  apiLearnClinicalChat: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => ClinicalService.chat(sql, env, identity, input || {})),
  apiLearnClinicalEvaluate: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ClinicalService.evaluate(sql, env, identity, input || {}, cid)),
  apiLearnClinicalGenerateCase: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ClinicalService.generateCase(sql, env, identity, input || {}, cid)),
  apiLearnClinicalLibrary: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => ClinicalService.library(sql, env, identity, input || {})),
  apiLearnClinicalEpidemiology: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, () => ClinicalService.epidemiology(sql, env)),
  apiLearnLabPreceptor: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AiService.askLabPreceptor(sql, env, identity, input || {})),
  apiLearnGetMyAiQuota: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => AiService.getMyQuota(sql, env, identity)),
  apiAdminAiHealth: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => AiService.adminHealth(sql, env, identity)),
  apiAdminLearnListPendingCases: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ClinicalService.listPendingCases(sql, identity)),
  // Atlas 3D — moléculas pelo proxy (sem chamada direta do navegador).
  apiLearnAtlasTelemetry: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AtlasTelemetryService.record(sql, identity, asInput(input))),
  apiAdminLearnAtlasTelemetry: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AtlasTelemetryService.adminStats(sql, identity, asInput(input))),
  apiLearnAtlasPdb: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, () => AtlasMoleculeService.getPdb(asInput(input))),
  apiLearnAtlasPubchem: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, () => AtlasMoleculeService.getPubchem(asInput(input))),
  apiAdminLearnReviewCase: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ClinicalService.reviewCase(sql, env, identity, input || {}, cid)),
};
