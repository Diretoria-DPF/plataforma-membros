/**
 * Logging.gs
 * Auditoria e log técnico. Regra inegociável: NUNCA gravar senha, token bruto
 * ou hash, cookie/valor de sessão, telefone, e-mail completo ou corpo livre
 * de proposta/feedback nestes registros (nem em audit_logs.details, nem em
 * error_logs.context). Quando é necessário referenciar uma pessoa, usa-se o
 * profile_id (UUID), nunca dado pessoal em texto livre.
 */
App.Logging = (function () {
  function logAudit(correlationId, actorId, action, targetType, targetId, result, details) {
    try {
      App.Database.execute(
        'INSERT INTO audit_logs (correlation_id, actor_id, action, target_type, target_id, result, details) ' +
          "VALUES (?::uuid, ?::uuid, ?, ?, ?::uuid, ?, ?::jsonb)",
        [
          correlationId,
          actorId || null,
          action,
          targetType || null,
          targetId || null,
          result,
          details ? JSON.stringify(details) : null,
        ]
      );
    } catch (auditErr) {
      // Falha ao auditar não pode derrubar a operação de negócio principal;
      // registramos ao menos no Logger de execução do Apps Script.
      Logger.log('Falha ao gravar audit_logs (correlationId=' + correlationId + '): ' + auditErr);
    }
  }

  function logError(correlationId, code, message, context) {
    try {
      App.Database.execute(
        'INSERT INTO error_logs (correlation_id, code, message, context) VALUES (?::uuid, ?, ?, ?::jsonb)',
        [correlationId, code, message, context ? JSON.stringify(context) : null]
      );
    } catch (logErr) {
      Logger.log('Falha ao gravar error_logs (correlationId=' + correlationId + '): ' + logErr);
    }
    Logger.log('[' + code + '][' + correlationId + '] ' + message);
  }

  return {
    logAudit: logAudit,
    logError: logError,
  };
})();
