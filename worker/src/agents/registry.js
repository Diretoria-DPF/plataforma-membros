/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/registry.js
 * Acesso (somente leitura) às personas dos agentes. Os dados vêm de registry.generated.js, produzido por
 * worker/scripts/gen-agent-registry.mjs a partir de worker/agents/personas/*.md: nada é lido de arquivo em execução.
 */
import { AGENTS } from './registry.generated.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

deepFreeze(AGENTS);

/** Persona pelo id, ou null. */
export function getAgent(id) {
  return AGENTS.find((a) => a.id === id) || null;
}

/** Todas as personas do registro (inclusive rascunhos). */
export function listAgents() {
  return AGENTS;
}

/** "tutor-clinico@1.0.0#a1b2c3d4e5f6": vai em todo trace. */
export function agentRef(agent) {
  return agent.ref;
}
