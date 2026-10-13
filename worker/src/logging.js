/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * logging.js
 * Auditoria e log técnico. Regra inegociável, igual ao Apps Script: NUNCA
 * gravar senha, token bruto/hash, cookie/sessão, telefone, e-mail completo
 * ou corpo livre de proposta/feedback em audit_logs.details/error_logs.context.
 */
/**
 * Tira de um texto de erro qualquer string de conexão (postgres://usuario:SENHA@host/...) e a frase "Connection string:" que o
 * driver do Neon acrescenta ao recusar uma URL malformada. Erro de driver pode carregar o segredo; log nunca.
 */
export function redactSecrets(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redigido]')
    .replace(/(connection string:).*/gi, '$1 [redigido]');
}

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

export async function logError(sql, correlationId, code, rawMessage, context) {
  const message = redactSecrets(rawMessage);
  try {
    await sql`
      INSERT INTO error_logs (correlation_id, code, message, context)
      VALUES (${correlationId}::uuid, ${code}, ${message}, ${context ? JSON.stringify(context) : null}::jsonb)
    `;
  } catch (logErr) {
    console.error('Falha ao gravar error_logs (correlationId=' + correlationId + '):', redactSecrets(logErr && logErr.message));
  }
  console.error('[' + code + '][' + correlationId + '] ' + message);
}
