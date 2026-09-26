/**
 * ai/errors.js
 * Erros "esperados" da camada de IA — mesmo padrão de src/errors.js
 * (`expected = true` → run() devolve a mensagem ao cliente em vez de
 * logar como erro inesperado). Ficam aqui, e não em src/errors.js, para a
 * Fase 3 não mexer num arquivo compartilhado sem necessidade.
 *
 * REGRA: nenhuma mensagem daqui pode conter chave, cabeçalho, corpo de
 * resposta do provedor ou qualquer detalhe interno. São textos fixos.
 */
function makeError(name, flag) {
  return function (message) {
    const err = new Error(message);
    err.name = name;
    err.expected = true;
    if (flag) err[flag] = true;
    return err;
  };
}

// Nenhuma chave do pool respondeu (todas em cooldown, 401/403/429/5xx ou
// timeout), ou não há chave configurada. Marcado para a cota ser devolvida.
export const AiUnavailableError = makeError('AiUnavailableError', 'aiUnavailable');

// O provedor respondeu, mas a saída não passou na validação de esquema
// (JSON inválido, campo obrigatório ausente, resposta vazia) ou o provedor
// recusou a requisição (400/413/422 — failover não ajudaria).
export const AiInvalidOutputError = makeError('AiInvalidOutputError', 'aiInvalidOutput');

// Cota diária da pessoa (ou o disjuntor global) estourada.
export const QuotaExceededError = makeError('QuotaExceededError', 'quotaExceeded');

export const AI_MESSAGES = {
  UNAVAILABLE: 'O serviço de IA está indisponível no momento. Tente novamente em alguns minutos.',
  NOT_CONFIGURED: 'A IA ainda não foi configurada na plataforma. Avise a diretoria.',
  INVALID_OUTPUT: 'A IA não conseguiu produzir uma resposta válida desta vez. Tente novamente.',
  REJECTED: 'A IA não aceitou esta solicitação. Reformule e tente novamente.',
};
