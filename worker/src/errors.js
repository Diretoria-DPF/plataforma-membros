/**
 * errors.js
 * Erros tipados "esperados" — quando um destes é lançado, a mensagem vai
 * direto ao cliente. Qualquer outro erro é tratado como inesperado: logado
 * com correlationId e substituído por mensagem genérica (ver index.js).
 * Espelha App.Errors de src/Security.gs.
 */
function makeError(name) {
  return function (message) {
    const err = new Error(message);
    err.name = name;
    err.expected = true;
    return err;
  };
}

export const ValidationError = makeError('ValidationError');
export const AuthError = makeError('AuthError');
export const ForbiddenError = makeError('ForbiddenError');
export const RateLimitError = makeError('RateLimitError');
export const NotFoundError = makeError('NotFoundError');
export const ConflictError = makeError('ConflictError');
