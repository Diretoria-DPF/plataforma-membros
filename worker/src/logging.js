/**
 * logging.js
 * Auditoria e log técnico. Regra inegociável, igual ao Apps Script: NUNCA
 * gravar senha, token bruto/hash, cookie/sessão, telefone, e-mail completo
 * ou corpo livre de proposta/feedback em audit_logs.details/error_logs.context.
 */
export async function logAudit(sql, correlationId, actorId, action, targetType, targetId, result, details) {
  try {
    await sql`
      INSERT INTO audit_logs (correlation_id, actor_id, action, target_type, target_id, result, details)
      VALUES (${correlationId}::uuid, ${actorId || null}::uuid, ${action}, ${targetType || null}, ${targetId || null}::uuid, ${result}, ${details ? JSON.stringify(details) : null}::jsonb)
    `;
  } catch (auditErr) {
    console.error('Falha ao gravar audit_logs (correlationId=' + correlationId + '):', auditErr);
  }
}

export async function logError(sql, correlationId, code, message, context) {
  try {
    await sql`
      INSERT INTO error_logs (correlation_id, code, message, context)
      VALUES (${correlationId}::uuid, ${code}, ${message}, ${context ? JSON.stringify(context) : null}::jsonb)
    `;
  } catch (logErr) {
    console.error('Falha ao gravar error_logs (correlationId=' + correlationId + '):', logErr);
  }
  console.error('[' + code + '][' + correlationId + '] ' + message);
}
