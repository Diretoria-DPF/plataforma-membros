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
import * as EventService from './services/eventService.js';
import * as ProposalService from './services/proposalService.js';
import * as TaskService from './services/taskService.js';
import * as AdminService from './services/adminService.js';
import * as AuditService from './services/auditService.js';
import * as MediaService from './services/mediaService.js';

async function run(sql, callback) {
  const correlationId = S.newCorrelationId();
  try {
    return await callback(correlationId);
  } catch (err) {
    if (err && err.expected) {
      return { success: false, message: err.message };
    }
    await Logging.logError(sql, correlationId, (err && err.name) || 'UNEXPECTED_ERROR', String((err && err.message) || err), null);
    return { success: false, message: GENERIC_ERROR_MESSAGE + ' (ref: ' + correlationId + ')' };
  }
}

async function runWithSession(sql, env, sessionToken, callback) {
  return run(sql, async (correlationId) => {
    const identity = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken);
    return callback(identity, correlationId);
  });
}

export const API_REGISTRY = {
  // ---- Autenticação (público) ----
  apiRegister: (sql, env, [input]) => run(sql, (cid) => AuthService.register(sql, env, input || {}, cid)),
  apiConfirmEmail: (sql, env, [token]) => run(sql, (cid) => AuthService.confirmEmail(sql, env, token, cid)),
  apiLogin: (sql, env, [email, password]) => run(sql, (cid) => AuthService.login(sql, env, email, password, '', cid)),
  apiRequestPasswordReset: (sql, env, [email]) => run(sql, (cid) => AuthService.requestPasswordReset(sql, env, email, cid)),
  apiValidateResetToken: (sql, env, [token]) => run(sql, () => AuthService.validateResetToken(sql, env, token)),
  apiConfirmPasswordReset: (sql, env, [token, newPassword]) => run(sql, (cid) => AuthService.confirmPasswordReset(sql, env, token, newPassword, cid)),

  // ---- Sessão ----
  apiLogout: (sql, env, [sessionToken]) => run(sql, (cid) => AuthService.logout(sql, env, sessionToken, cid)),

  // ---- Perfil (requer sessão) ----
  apiGetMyProfile: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProfileService.getMyProfile(sql, identity)),
  apiUpdateMyProfile: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.updateMyProfile(sql, identity, input || {}, cid)),
  apiUpdateMyPreferences: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.updateMyPreferences(sql, identity, input || {}, cid)),
  apiSubmitFeedback: (sql, env, [sessionToken, message]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.submitFeedback(sql, identity, message, cid)),
  apiUpdateMyAvatar: (sql, env, [sessionToken, avatarBase64, avatarMimeType]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProfileService.updateMyAvatarFromBase64(sql, env, identity, avatarBase64, avatarMimeType, cid)),
  apiGetMyMetrics: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProfileService.getMyMetrics(sql, identity)),

  // ---- Eventos ----
  apiListEvents: (sql, env, [sessionToken]) => run(sql, async () => {
    const identity = sessionToken ? await S.resolveSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken) : null;
    return EventService.listEvents(sql, identity);
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
  apiAdminCreateEvent: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => EventService.createEvent(sql, identity, input || {}, cid)),
  apiAdminUpdateEventStatus: (sql, env, [sessionToken, eventId, newStatus]) => runWithSession(sql, env, sessionToken, (identity, cid) => EventService.updateEventStatus(sql, identity, eventId, newStatus, cid)),
  apiAdminListAllEvents: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => EventService.listAllEventsAdmin(sql, identity)),
  apiAdminListProposalsForReview: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => ProposalService.listForReview(sql, identity)),
  apiAdminTransitionProposal: (sql, env, [sessionToken, proposalId, newStatus, extra]) => runWithSession(sql, env, sessionToken, (identity, cid) => ProposalService.transitionProposal(sql, identity, proposalId, newStatus, extra || {}, cid)),
  apiAdminCreateTask: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.createTask(sql, identity, input || {}, cid)),
  apiAdminUpdateTaskStatus: (sql, env, [sessionToken, taskId, newStatus]) => runWithSession(sql, env, sessionToken, (identity, cid) => TaskService.updateTaskStatus(sql, identity, taskId, newStatus, cid)),
  apiAdminListAllTasks: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => TaskService.listAllTasksAdmin(sql, identity)),
  apiAdminListAuditLogs: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AuditService.listAuditLogs(sql, identity, input || {})),
  apiAdminListErrorLogs: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => AuditService.listErrorLogs(sql, identity, input || {})),
  apiAdminUploadEventImage: (sql, env, [sessionToken, eventId, imageBase64, imageMimeType]) => runWithSession(sql, env, sessionToken, (identity, cid) => MediaService.uploadEventImage(sql, env, identity, eventId, imageBase64, imageMimeType, cid)),
};
