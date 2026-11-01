/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * httpStatus.js (OPS-06)
 * Status HTTP real nas respostas de erro, SOMENTE para quem pedir (cabeçalho
 * opt-in `X-Laift-Status: 1`). Sem o cabeçalho, toda resposta segue HTTP 200 com
 * {success:false}, como sempre — clientes antigos e em cache não mudam.
 *
 * O handler marca o objeto de resposta com o status (WeakMap, fora do corpo): o
 * JSON que sai é idêntico nos dois modos. Só o código HTTP muda.
 */
export const STATUS_REQUEST_HEADER = 'X-Laift-Status';

const STATUS_BY_NAME = {
  ValidationError: 400,
  AuthError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  RateLimitError: 429,
};

const STATUS_BY_AGENT_CODE = {
  VALIDATION: 400,
  AGENT_DISABLED: 403,
  RATE_LIMIT: 429,
  QUOTA: 429,
  INVALID_OUTPUT: 502,
  AI_UNAVAILABLE: 503,
};

const STATUS_BY_AI_FLAG = [
  ['quotaExceeded', 429],
  ['aiUnavailable', 503],
  ['aiInvalidOutput', 502],
];

const statusByResult = new WeakMap();

/** Status HTTP de um erro lançado por um handler: esperado -> 4xx/502/503; qualquer outro -> 500. */
export function statusForError(err) {
  if (!err || !err.expected) return 500;
  if (err.name === 'AgentError') return STATUS_BY_AGENT_CODE[err.code] || 400;
  if (STATUS_BY_NAME[err.name]) return STATUS_BY_NAME[err.name];
  for (const [flag, status] of STATUS_BY_AI_FLAG) if (err[flag]) return status;
  return 400;
}

/** Marca o objeto de resposta com o status (sem tocar nas chaves do corpo) e o devolve. */
export function tagStatus(result, status) {
  if (result && typeof result === 'object') statusByResult.set(result, status);
  return result;
}

/** Status marcado no objeto de resposta, ou null (sucesso ou resposta sem marca). */
export function statusOf(result) {
  return result && typeof result === 'object' && statusByResult.has(result) ? statusByResult.get(result) : null;
}

export function wantsRealStatus(request) {
  return request.headers.get(STATUS_REQUEST_HEADER) === '1';
}
