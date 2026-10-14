/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * writeLimits.js
 * Limite de escrita por pessoa (enforceRateLimit) com mensagem própria, coerente com a janela do limite. A mensagem
 * genérica de security.js fala em "alguns minutos", o que engana quando a janela é de 1 hora.
 */
import * as S from './security.js';
import * as E from './errors.js';

/** Texto de espera a partir da janela (em segundos): "1 hora", "30 minutos"... */
export function waitText(windowSeconds) {
  if (windowSeconds >= 3600) {
    const hours = Math.round(windowSeconds / 3600);
    return hours === 1 ? '1 hora' : hours + ' horas';
  }
  const minutes = Math.max(1, Math.round(windowSeconds / 60));
  return minutes === 1 ? '1 minuto' : minutes + ' minutos';
}

/**
 * @param {string} what  o que foi excedido, ex.: "de propostas" -> "Você atingiu o limite de propostas. Tente novamente em até 1 hora."
 */
export async function enforceWriteLimit(sql, bucket, profileId, limit, what) {
  try {
    await S.enforceRateLimit(sql, bucket, profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') {
      throw E.RateLimitError('Você atingiu o limite ' + what + '. Tente novamente em até ' + waitText(limit.WINDOW_SECONDS) + '.');
    }
    throw err;
  }
}
