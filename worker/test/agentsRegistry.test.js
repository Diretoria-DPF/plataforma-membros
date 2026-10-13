/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agentsRegistry.test.js — o registro de personas dos agentes (agents/registry.generated.js).
 * Etapa 0: o teste "registry não está vazio" nasce VERMELHO (o registro é um esqueleto vazio).
 */
import { AGENTS } from '../src/agents/registry.generated.js';

describe('registro de agentes', () => {
  // test.failing = vermelho conhecido da etapa 0 (passa enquanto o registro estiver vazio); a etapa 1 vira test().
  test.failing('registry não está vazio', () => {
    expect(AGENTS.length).toBeGreaterThan(0);
  });
});
