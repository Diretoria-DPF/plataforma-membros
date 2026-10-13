/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agentsUnits.test.js — peças puras da camada de agentes: maioridade (eligibility.js), rastro (trace.js),
 * montagem do prompt (promptBuilder.js), ponto de extensão da memória e a coerência entre as personas ativas e
 * a configuração de IA (FEATURE_CONFIG, AI_QUOTAS, cotas).
 */
import { jest } from '@jest/globals';
import { isEligibleAdult, ADULT_AGE } from '../src/agents/eligibility.js';
import { buildTrace, safeDecisions, traceLine, recordTrace } from '../src/agents/trace.js';
import { buildAgentMessages, canaryFor } from '../src/agents/promptBuilder.js';
import { readMemory, NO_MEMORY } from '../src/agents/memoryProvider.js';
import { listAgents, getAgent } from '../src/agents/registry.js';
import { FEATURE_CONFIG } from '../src/ai/config.js';
import * as C from '../src/constants.js';
import { QUOTA_BUCKETS } from '../src/services/aiService.js';
import { AgentError } from '../src/errors.js';

const NOW = new Date('2026-10-12T12:00:00Z');
const MEMBER = { profileId: '22222222-2222-4222-8222-222222222222', role: 'member' };
const tutor = getAgent('tutor-clinico');

describe('isEligibleAdult — o único ponto da regra "só maiores de 18 anos"', () => {
  test('hoje a sessão não traz dado de idade: conta existente conta como maior (premissa documentada)', () => {
    expect(isEligibleAdult(MEMBER, { now: NOW })).toBe(true);
    expect(ADULT_AGE).toBe(18);
  });

  test.each([
    ['isMinor', { isMinor: true }],
    ['is_minor', { is_minor: true }],
    ['accountType minor', { accountType: 'minor' }],
    ['account_type minor', { account_type: 'minor' }],
    ['faixa que não é adult', { ageBand: '12-17' }],
    ['responsável vinculado', { guardianProfileId: 'x' }],
    ['responsável (coluna)', { guardian_profile_id: 'x' }],
    ['idade 17', { age: 17 }],
    ['idade inválida', { age: 'abc' }],
    ['nascimento de 17 anos', { birthDate: '2009-10-13' }],
    ['nascimento inválido', { birthDate: 'ontem' }],
    ['birth_date de criança', { birth_date: '2020-01-01' }],
  ])('menor: %s', (_nome, marker) => {
    expect(isEligibleAdult(Object.assign({}, MEMBER, marker), { now: NOW })).toBe(false);
  });

  test('exatamente 18 anos completos hoje é maior; faltando um dia, não', () => {
    expect(isEligibleAdult({ ...MEMBER, birthDate: '2008-10-12' }, { now: NOW })).toBe(true);
    expect(isEligibleAdult({ ...MEMBER, birthDate: '2008-10-13' }, { now: NOW })).toBe(false);
    expect(isEligibleAdult({ ...MEMBER, age: 18 }, { now: NOW })).toBe(true);
  });

  test('com minors_enabled ligada, sem adultConfirmed não é maior; com ele, é', () => {
    expect(isEligibleAdult(MEMBER, { now: NOW, minorsEnabled: true })).toBe(false);
    expect(isEligibleAdult({ ...MEMBER, adultConfirmed: true }, { now: NOW, minorsEnabled: true })).toBe(true);
    expect(isEligibleAdult({ ...MEMBER, adultConfirmed: true, isMinor: true }, { now: NOW, minorsEnabled: true })).toBe(false);
  });

  test.each([null, undefined, 'x', 7])('entrada inválida (%p): não é elegível', (v) => {
    expect(isEligibleAdult(v)).toBe(false);
  });
});

describe('trace.js — rastro sem texto do usuário', () => {
  const base = { traceId: '99999999-9999-4999-8999-999999999999', profileId: MEMBER.profileId, agent: tutor, model: 'm', latencyMs: 12, outcome: 'answered', usage: { tokensIn: 5, tokensOut: 7, estimated: false } };

  test('decisions só aceita chaves conhecidas com IDs e números; texto livre é descartado', () => {
    const out = safeDecisions({
      input: 'ok', inputRule: 'I6', outputRules: ['O3'], sources: 2, history: 3, cached: true,
      message: 'meu texto', reply: 'resposta', note: 'oi', errorCode: 'texto com espaços e acentuação', sources2: 1,
    });
    expect(out).toEqual({ input: 'ok', inputRule: 'I6', outputRules: ['O3'], sources: 2, history: 3, cached: true });
    expect(safeDecisions(null)).toEqual({});
    expect(safeDecisions({ outputRules: ['ok', 'x'.repeat(50)] })).toEqual({});
    expect(safeDecisions({ sources: -1 })).toEqual({});
  });

  test('buildTrace devolve só as colunas de agent_traces e corrige valores ruins', () => {
    const t = buildTrace({ ...base, decisions: { input: 'ok' }, memoryUsed: true });
    expect(Object.keys(t).sort()).toEqual([
      'decisions', 'estimated', 'feature', 'latencyMs', 'memoryUsed', 'model', 'outcome', 'personaHash', 'persona', 'personaVersion',
      'profileId', 'tokensIn', 'tokensOut', 'traceId',
    ].sort());
    expect(t).toMatchObject({ persona: 'tutor-clinico', personaVersion: '1.1.0', personaHash: tutor.hash, feature: 'agent_tutor', tokensIn: 5, tokensOut: 7 });
    expect(buildTrace({ ...base, outcome: 'qualquer coisa' }).outcome).toBe('error');
    expect(buildTrace({ ...base, usage: { tokensIn: -3, tokensOut: 1.5 } })).toMatchObject({ tokensIn: null, tokensOut: null });
    expect(buildTrace({ ...base, model: 'x'.repeat(300) }).model).toHaveLength(100);
  });

  test('a linha JSON carrega persona@versão#hash e nada de pessoa', () => {
    const line = JSON.parse(traceLine(buildTrace(base)));
    expect(line.ref).toBe(tutor.ref);
    expect(Object.keys(line)).not.toContain('profileId');
  });

  test('recordTrace emite a linha e grava; falha do banco é engolida e registrada sem texto', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sql = jest.fn().mockResolvedValue([]);
    expect(await recordTrace(sql, buildTrace(base))).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    const failing = jest.fn().mockRejectedValueOnce(new Error('tabela ausente com texto secreto')).mockResolvedValue([]);
    expect(await recordTrace(failing, buildTrace(base))).toBe(false);
    expect(JSON.stringify(failing.mock.calls.slice(1))).not.toMatch(/secreto/);
    log.mockRestore();
    err.mockRestore();
  });
});

describe('promptBuilder.js', () => {
  const args = { agent: tutor, message: 'O que é um agonista?', history: [{ role: 'user', text: 'Oi' }, { role: 'assistant', text: 'Olá' }], context: { module: '', topic: '' }, sources: [] };

  test('system primeiro; histórico com papéis do servidor; pergunta por último', () => {
    const msgs = buildAgentMessages(args);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[3].content).toBe('O que é um agonista?');
  });

  test('fontes viram lista numerada de DADOS (sem URL); sem fontes diz para não citar', () => {
    const withSources = buildAgentMessages({ ...args, sources: [{ title: 'Artigo A', authors: 'Silva A', journal: 'J', year: 2022, url: 'https://doi.org/10.1/a' }] })[0].content;
    expect(withSources).toMatch(/"ref": 1/);
    expect(withSources).toMatch(/Artigo A/);
    expect(withSources).not.toMatch(/doi\.org/);
    expect(buildAgentMessages(args)[0].content).toMatch(/nenhuma\. Não cite fontes/);
  });

  test('texto do estudante dentro de dado nunca vira instrução: tema vai como JSON', () => {
    const content = buildAgentMessages({ ...args, context: { module: 'farmacologia', topic: 'tema "com aspas" e {chaves}' } })[0].content;
    expect(content).toContain('"tema": "tema \\"com aspas\\" e {chaves}"');
  });

  test('o canário é estável por persona e vai no prompt', () => {
    expect(canaryFor(tutor)).toBe('LAIFT-' + tutor.hash);
    expect(buildAgentMessages(args)[0].content).toContain(canaryFor(tutor));
    expect(canaryFor(getAgent('content-curator'))).not.toBe(canaryFor(tutor));
  });
});

describe('memória: ponto de extensão', () => {
  test('hoje devolve available:false e não toca em nada', async () => {
    const sql = jest.fn();
    expect(await readMemory({ sql, identity: MEMBER, agent: tutor })).toBe(NO_MEMORY);
    expect(NO_MEMORY).toEqual({ available: false, used: false, items: [] });
    expect(sql).not.toHaveBeenCalled();
  });

  test('só o Tutor Clínico (1.1.0) lê e grava memória; as personas em rascunho não', () => {
    listAgents().forEach((a) => expect(a.memory).toEqual(a.id === 'tutor-clinico' ? { read: true, write: true } : { read: false, write: false }));
  });
});

describe('coerência persona x configuração de IA', () => {
  const active = listAgents().filter((a) => a.status === 'active');

  test.each(active.map((a) => [a.id, a]))('%s: o recurso existe em FEATURE_CONFIG, AI_QUOTAS e QUOTA_BUCKETS com tier, temperatura e teto da persona', (_id, a) => {
    expect(FEATURE_CONFIG[a.feature]).toMatchObject({ tier: a.tier, temperature: a.temperature, maxTokens: a.maxTokens });
    expect(C.AI_QUOTAS[a.feature]).toBeDefined();
    expect(QUOTA_BUCKETS[a.feature]).toBeDefined();
    expect(Object.values(C.AI_FEATURE)).toContain(a.feature);
  });

  test('o curador (rascunho) já tem a configuração pronta e só o admin tem cota', () => {
    const curator = getAgent('content-curator');
    expect(FEATURE_CONFIG[curator.feature]).toMatchObject({ tier: curator.tier, temperature: curator.temperature, maxTokens: curator.maxTokens });
    expect(C.AI_QUOTAS.agent_curator).toEqual({ visitor: 0, member: 0, admin: 40 });
  });

  test('o limite de mensagem das personas respeita o teto de entrada do histórico', () => {
    active.forEach((a) => expect(a.limits.historyTurnMax).toBeLessThanOrEqual(C.AI_LIMITS.HISTORY_TURN_MAX));
    expect(tutor.context.history).toBeLessThanOrEqual(C.AI_LIMITS.HISTORY_MAX_TURNS);
    expect(C.AGENTS.API_VERSION).toBe('agents/v1-alpha');
  });
});

describe('AgentError', () => {
  test('é um erro esperado com code no payload (o handler o devolve ao cliente)', () => {
    const err = AgentError('QUOTA', 'acabou', { quotaExceeded: true });
    expect(err).toMatchObject({ expected: true, name: 'AgentError', code: 'QUOTA', message: 'acabou', payload: { code: 'QUOTA', quotaExceeded: true } });
    expect(AgentError('VALIDATION', 'x').payload).toEqual({ code: 'VALIDATION' });
  });
});
