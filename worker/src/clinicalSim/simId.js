/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/simId.js
 * Identificador curto e estável de uma simulação: sha256(caseId|seed|simVersion), 12 primeiros caracteres hex.
 * Mesmo caso + mesma semente + mesma versão = mesmo identificador, em qualquer turno. Não é segredo nem prova de nada:
 * serve para ligar as linhas de uma tentativa e para o teste de determinismo. Usa a Web Crypto do Worker (como
 * security.js e ragService.js), sem node:crypto.
 */
import { SIM_LIMITS } from '../constants.js';

/** @returns {Promise<string>} 12 caracteres hexadecimais */
export async function computeSimId(caseId, seed, version) {
  const data = new TextEncoder().encode([caseId, seed, version].join('|'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, SIM_LIMITS.SIM_ID_LENGTH);
}
