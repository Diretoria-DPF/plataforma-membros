/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai-metrics.e2e.js — painel "Orçamento de tokens e consumo" (frontend/admin-ai.js
 * + apiAdminAiMetrics). Orçamento, alertas, tabela por modelo e texto malicioso
 * vindo da API sempre como texto.
 */
const { startApp, check } = require('./harness');

const METRICS = {
  success: true,
  available: true,
  days: 7,
  orchestratorEnabled: true,
  budget: { used: 400000, budget: 450000, pct: 89, exceeded: false },
  cache: { entries: 12, hits: 34 },
  alerts: [{ kind: 'budget', message: 'Consumo de tokens em 89% do orçamento diário.' }],
  rows: [
    { day: '2026-10-10', feature: 'chat', model: 'openai/gpt-oss-20b', provider: 'groq', calls: 40, okCalls: 38, rateLimited: 2, tokensIn: 30000, tokensOut: 20000, cacheHits: 0, cacheMisses: 0, avgLatencyMs: 900 },
    { day: '2026-10-10', feature: 'lab_preceptor', model: '<img src=x onerror="window.__xss=1">', provider: 'groq', calls: 10, okCalls: 10, rateLimited: 0, tokensIn: 5000, tokensOut: 5000, cacheHits: 7, cacheMisses: 3, avgLatencyMs: 1200 },
  ],
  totals: [{ day: '2026-10-10', calls: 50, tokens: 60000, rateLimited: 2, cacheHits: 7, cacheMisses: 3 }],
};

module.exports = async function aiMetrics() {
  const requested = [];
  const admin = await startApp({
    role: 'admin',
    workerHandlers: {
      apiAdminAiMetrics: (args) => { requested.push(args[1] && args[1].days); return METRICS; },
    },
  });
  try {
    await admin.login();
    await admin.page.click('#btn-enter-admin-mode');
    await admin.showPanel('panel-admin-ai');
    await admin.page.waitForSelector('#admin-ai-metrics .ai-budget');
    const text = await admin.page.textContent('#admin-ai-metrics');
    check(text.includes('400.000 de 450.000 tokens (89%)'), 'orçamento do dia com números formatados e percentual');
    check(await admin.page.locator('#admin-ai-metrics .ai-budget[data-level="warn"]').count() === 1, 'acima de 80% o orçamento fica em alerta');
    check((await admin.page.getAttribute('#admin-ai-metrics .ai-alerts', 'role')) === 'alert', 'alertas ativos são anunciados (role=alert)');
    check(text.includes('Consumo de tokens em 89%'), 'a mensagem do alerta aparece');
    check(text.includes('12 respostas guardadas') && text.includes('34 acertos'), 'estatísticas do cache semântico');
    check(text.includes('Orquestrador (cache e orçamento): ligado'), 'estado do orquestrador');
    check(await admin.page.locator('#admin-ai-metrics tbody tr').count() === 2, 'uma linha por recurso/modelo/provedor');

    check((await admin.page.evaluate(() => window.__xss)) === undefined, 'nome de modelo malicioso não executa script');
    check(text.includes('<img src=x'), 'o nome malicioso aparece como texto');
    check(await admin.page.locator('#admin-ai-metrics img').count() === 0, 'nenhum elemento criado a partir do texto da API');

    await admin.page.click('#btn-admin-ai-metrics-30');
    await admin.page.waitForFunction(() => document.querySelectorAll('#admin-ai-metrics .ai-budget').length === 1);
    check(requested.includes(30), 'o botão de 30 dias pede o período de 30 dias');
    check(admin.errors.length === 0, 'sem erros de página (' + admin.errors.join('; ') + ')');
  } finally {
    await admin.close();
  }

  // ---- Migração 018 ainda não aplicada e sem chamadas ----
  const bare = await startApp({
    role: 'admin',
    workerHandlers: {
      apiAdminAiMetrics: () => ({ success: true, available: false, days: 7, orchestratorEnabled: false, budget: { used: 0, budget: 450000, pct: 0, exceeded: false }, rows: [], totals: [], alerts: [], cache: { entries: 0, hits: 0 } }),
    },
  });
  try {
    await bare.login();
    await bare.page.click('#btn-enter-admin-mode');
    await bare.showPanel('panel-admin-ai');
    await bare.page.waitForSelector('#admin-ai-metrics .ai-budget');
    const text = await bare.page.textContent('#admin-ai-metrics');
    check(text.includes('migração 018 ainda não aplicada'), 'avisa que a migração 018 falta');
    check(text.includes('Sem chamadas registradas'), 'sem dados: estado vazio em vez de tabela');
    check(await bare.page.locator('#admin-ai-metrics .ai-alerts').count() === 0, 'sem alertas, sem bloco de alertas');
  } finally {
    await bare.close();
  }

  // ---- Falha da API ----
  const failing = await startApp({
    role: 'admin',
    workerHandlers: { apiAdminAiMetrics: () => ({ success: false, message: 'Servidor ocupado.' }) },
  });
  try {
    await failing.login();
    await failing.page.click('#btn-enter-admin-mode');
    await failing.showPanel('panel-admin-ai');
    await failing.page.waitForFunction(() => /Servidor ocupado/.test(document.getElementById('msg-admin-ai-metrics').textContent));
    check(true, 'erro da API é mostrado na área de métricas');
  } finally {
    await failing.close();
  }
};
