/**
 * Code.gs
 * Ponto de entrada do Web App e ÚNICA superfície de funções de nível
 * superior chamáveis pelo cliente via google.script.run. Isso é uma
 * restrição técnica do Apps Script (não apenas uma convenção): o
 * google.script.run só consegue invocar identificadores de função
 * declarados no escopo de topo do projeto — qualquer lógica dentro de
 * App.* (services, Security, Database) é inacessível a partir do
 * navegador, mesmo que o nome seja adivinhado.
 *
 * Toda função pública aqui:
 *  1) nunca aceita userId/role/status vindos do cliente como prova de
 *     identidade — sempre resolve a sessão a partir do token opaco;
 *  2) delega a regra de negócio para App.<X>Service;
 *  3) captura exceções esperadas (App.Errors.*) e devolve a mensagem ao
 *     usuário; exceções inesperadas são logadas com correlationId e
 *     substituídas por mensagem genérica antes de chegar ao cliente.
 */
/* exported include, doGet, apiRegister, apiConfirmEmail, apiLogin, apiRequestPasswordReset,
   apiValidateResetToken, apiConfirmPasswordReset, apiLogout, apiGetMyProfile, apiUpdateMyProfile,
   apiUpdateMyPreferences, apiSubmitFeedback, apiListEvents, apiRegisterForEvent, apiSubmitProposal,
   apiListMyProposals, apiListOpenProposalsForVoting, apiCastVote, apiGetProposalResults, apiListTasks,
   apiSignupForTask, apiAdminDashboard, apiAdminListUsers, apiAdminChangeUserRole, apiAdminBanUser,
   apiAdminUnbanUser, apiAdminListFeedback, apiAdminCreateEvent, apiAdminUpdateEventStatus,
   apiAdminListAllEvents, apiAdminListProposalsForReview, apiAdminTransitionProposal, apiAdminCreateTask,
   apiAdminUpdateTaskStatus, apiAdminListAllTasks, apiAdminListAuditLogs, apiAdminListErrorLogs */

App.Dispatch = (function () {
  function toClientError(err, correlationId) {
    if (err && err.expected) {
      return { success: false, message: err.message };
    }
    App.Logging.logError(correlationId, (err && err.name) || 'UNEXPECTED_ERROR', String((err && err.message) || err), null);
    return { success: false, message: App.Constants.GENERIC_ERROR_MESSAGE + ' (ref: ' + correlationId + ')' };
  }

  function run(callback) {
    const correlationId = App.Security.newCorrelationId();
    try {
      return callback(correlationId);
    } catch (err) {
      return toClientError(err, correlationId);
    }
  }

  function runWithSession(sessionToken, callback) {
    return run(function (correlationId) {
      const identity = App.Security.requireSession(sessionToken);
      return callback(identity, correlationId);
    });
  }

  return { run: run, runWithSession: runWithSession };
})();

// -----------------------------------------------------------------------------
// Web App
// -----------------------------------------------------------------------------
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const mode = String(params.mode || '').trim();
  const token = String(params.token || '').trim();

  const tpl = HtmlService.createTemplateFromFile('src/ui/Index');
  tpl.deepLinkMode = mode === 'confirm' || mode === 'reset' ? mode : '';
  tpl.deepLinkToken = token;
  tpl.termsVersion = App.Constants.LEGAL_VERSIONS.TERMS;
  tpl.privacyVersion = App.Constants.LEGAL_VERSIONS.PRIVACY;

  return tpl
    .evaluate()
    .setTitle('Plataforma de Membros')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// -----------------------------------------------------------------------------
// Autenticação (público)
// -----------------------------------------------------------------------------
function apiRegister(input) {
  return App.Dispatch.run(function (correlationId) {
    return App.AuthService.register(input || {}, correlationId);
  });
}

function apiConfirmEmail(token) {
  return App.Dispatch.run(function (correlationId) {
    return App.AuthService.confirmEmail(token, correlationId);
  });
}

function apiLogin(email, password) {
  return App.Dispatch.run(function (correlationId) {
    return App.AuthService.login(email, password, '', correlationId);
  });
}

function apiRequestPasswordReset(email) {
  return App.Dispatch.run(function (correlationId) {
    return App.AuthService.requestPasswordReset(email, correlationId);
  });
}

function apiValidateResetToken(token) {
  return App.Dispatch.run(function () {
    return App.AuthService.validateResetToken(token);
  });
}

function apiConfirmPasswordReset(token, newPassword) {
  return App.Dispatch.run(function (correlationId) {
    return App.AuthService.confirmPasswordReset(token, newPassword, correlationId);
  });
}

// -----------------------------------------------------------------------------
// Sessão
// -----------------------------------------------------------------------------
function apiLogout(sessionToken) {
  return App.Dispatch.run(function (correlationId) {
    return App.AuthService.logout(sessionToken, correlationId);
  });
}

// -----------------------------------------------------------------------------
// Perfil (requer sessão)
// -----------------------------------------------------------------------------
function apiGetMyProfile(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.ProfileService.getMyProfile(identity);
  });
}

function apiUpdateMyProfile(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.ProfileService.updateMyProfile(identity, input || {}, correlationId);
  });
}

function apiUpdateMyPreferences(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.ProfileService.updateMyPreferences(identity, input || {}, correlationId);
  });
}

function apiSubmitFeedback(sessionToken, message) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.ProfileService.submitFeedback(identity, message, correlationId);
  });
}

// -----------------------------------------------------------------------------
// Eventos
// -----------------------------------------------------------------------------
function apiListEvents(sessionToken) {
  return App.Dispatch.run(function () {
    const identity = sessionToken ? App.Security.resolveSession(sessionToken) : null;
    return App.EventService.listEvents(identity);
  });
}

function apiRegisterForEvent(sessionToken, eventId) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.EventService.registerForEvent(identity, eventId, correlationId);
  });
}

// -----------------------------------------------------------------------------
// Propostas e votação
// -----------------------------------------------------------------------------
function apiSubmitProposal(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.ProposalService.submitProposal(identity, input || {}, correlationId);
  });
}

function apiListMyProposals(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.ProposalService.listMyProposals(identity);
  });
}

function apiListOpenProposalsForVoting(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.ProposalService.listOpenForVoting(identity);
  });
}

function apiCastVote(sessionToken, proposalId, choice, complementText) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.ProposalService.castVote(identity, proposalId, choice, complementText, correlationId);
  });
}

function apiGetProposalResults(sessionToken, proposalId) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.ProposalService.getProposalResults(identity, proposalId);
  });
}

// -----------------------------------------------------------------------------
// Tarefas
// -----------------------------------------------------------------------------
function apiListTasks(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.TaskService.listTasks(identity);
  });
}

function apiSignupForTask(sessionToken, taskId) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.TaskService.signupForTask(identity, taskId, correlationId);
  });
}

// -----------------------------------------------------------------------------
// Administração
// -----------------------------------------------------------------------------
function apiAdminDashboard(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.AdminService.dashboard(identity);
  });
}

function apiAdminListUsers(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.AdminService.listUsers(identity, input || {});
  });
}

function apiAdminChangeUserRole(sessionToken, targetProfileId, newRole) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.AdminService.changeUserRole(identity, targetProfileId, newRole, correlationId);
  });
}

function apiAdminBanUser(sessionToken, targetProfileId) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.AdminService.banUser(identity, targetProfileId, correlationId);
  });
}

function apiAdminUnbanUser(sessionToken, targetProfileId) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.AdminService.unbanUser(identity, targetProfileId, correlationId);
  });
}

function apiAdminListFeedback(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.AdminService.listFeedback(identity, input || {});
  });
}

function apiAdminCreateEvent(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.EventService.createEvent(identity, input || {}, correlationId);
  });
}

function apiAdminUpdateEventStatus(sessionToken, eventId, newStatus) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.EventService.updateEventStatus(identity, eventId, newStatus, correlationId);
  });
}

function apiAdminListAllEvents(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.EventService.listAllEventsAdmin(identity);
  });
}

function apiAdminListProposalsForReview(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.ProposalService.listForReview(identity);
  });
}

function apiAdminTransitionProposal(sessionToken, proposalId, newStatus, extra) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.ProposalService.transitionProposal(identity, proposalId, newStatus, extra || {}, correlationId);
  });
}

function apiAdminCreateTask(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.TaskService.createTask(identity, input || {}, correlationId);
  });
}

function apiAdminUpdateTaskStatus(sessionToken, taskId, newStatus) {
  return App.Dispatch.runWithSession(sessionToken, function (identity, correlationId) {
    return App.TaskService.updateTaskStatus(identity, taskId, newStatus, correlationId);
  });
}

function apiAdminListAllTasks(sessionToken) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.TaskService.listAllTasksAdmin(identity);
  });
}

function apiAdminListAuditLogs(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.AuditService.listAuditLogs(identity, input || {});
  });
}

function apiAdminListErrorLogs(sessionToken, input) {
  return App.Dispatch.runWithSession(sessionToken, function (identity) {
    return App.AuditService.listErrorLogs(identity, input || {});
  });
}
