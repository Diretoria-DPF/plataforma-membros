/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSimService.test.js — integração da simulação clínica (ADR 0009) com ClinicalService.chat/evaluate/reviewCase:
 * regressão byte a byte do prompt atual (flag desligada ou sem `simulation`), portões (flag, papel, maioridade, origem
 * do caso), perfil sorteado só pelo servidor, guardrail de saída do paciente, nota calculada pelo servidor, gravação de
 * details.sim e a trava de revisão (com o banco de verdade, PGlite).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import * as Clinical from '../src/services/clinicalService.js';
import * as ClinicalSim from '../src/services/clinicalSimService.js';
import * as Groq from '../src/ai/groqClient.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { drawAxes } from '../src/clinicalSim/axes.js';
import { profilePromptLines, AXIS_LABELS } from '../src/clinicalSim/catalog.js';
import { getAgent } from '../src/agents/registry.js';
import { SIM_VERSION, SIM_MESSAGES } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { routedSql, callsMatching, groqReply, memoryKv, KEYS } from './helpers/aiTestUtils.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'clinical-prompts-baseline.json'), 'utf8'));
const MEMBER = { profileId: '11111111-1111-4111-8111-111111111111', role: 'member' };
const ADMIN = { profileId: '33333333-3333-4333-8333-333333333333', role: 'admin' };
const VISITOR = { profileId: '22222222-2222-4222-8222-222222222222', role: 'visitor' };
const CASE_UUID = '44444444-4444-4444-8444-444444444444';
const FLAG_ON = [['FROM feature_flags', [{ key: 'clinical_sim_enabled', enabled: true, rollout_pct: 100, conditions: {} }]]];
const FLAG_OFF = [['FROM feature_flags', [{ key: 'clinical_sim_enabled', enabled: false, rollout_pct: 100, conditions: {} }]]];
const SIM = { seed: 42, version: SIM_VERSION };

const BASE = BASELINE.input;
const CHAT_INPUT = { caseId: 'caso_tox_01', caseSource: 'builtin', question: BASE.question, history: BASE.history, patientContext: BASE.context };
const ATTENDANCE = {
  diagnosis: BASE.attendance.diagnosis, conduct: BASE.attendance.conduct, examsRequested: BASE.attendance.examsRequested,
  questionsAsked: BASE.attendance.questionsAsked, elapsedSeconds: 300, vitality: 70, outcome: 'concluido',
  toxindrome: 'Colinérgica', agent: 'Clorpirifós',
};
const EVAL_INPUT = { caseId: 'caso_tox_01', caseSource: 'builtin', attendance: ATTENDANCE, answerKey: BASE.answerKey };
const OLD_EVAL_JSON = JSON.stringify({ score: 88, verdict: 'Bom', feedback: 'Parecer.', strengths: [], improvements: [] });
const SIM_EVAL_JSON = (components) => JSON.stringify({ components, score: 100, verdict: 'Bom atendimento', feedback: 'Parecer da simulação.', strengths: ['a'], improvements: ['b'] });

const sim = (extra) => Object.assign({}, SIM, extra || {});
const envWith = () => makeEnv({ GROQ_API_KEYS: KEYS.join(','), HOT_CACHE: memoryKv() });
const sent = (i) => JSON.parse(globalThis.fetch.mock.calls[i || 0][1].body).messages;

const GENERATED_CASE = {
  titulo: 'Intoxicação por organofosforado na lavoura', tipo: 'emergencia', toxindrome: 'Síndrome colinérgica', agentePrincipal: 'Clorpirifós', dificuldade: 'Avançado',
  vitalidadeInicial: 80, pacienciaInicial: 90, taxaDecaimento: { vitalidadePorMinuto: 3, pacienciaPorMinuto: 1 },
  paciente: { nome: 'José Lima', idade: 45, peso: '70 kg', genero: 'Masculino', profissao: 'Agricultor', alergias: 'Nega' },
  queixaPrincipal: 'Tô babando muito e sem ar', historicoAdmissao: 'Trazido pela esposa após pulverizar a lavoura.',
  sinaisVitais: { pa: '90/60 mmHg', fc: '45 bpm', fr: '30 irpm', temp: '36 °C', spo2: '85%', glasgow: '13' },
  contextoOculto: { exposicaoReal: 'Clorpirifós sem EPI', sintomas: 'baba', temperamento: 'Assustado', comportamento: 'ansioso', regrasFala: 'leigo', nivelConsciencia: 'Sonolento' },
  guiaSemiologico: { cronologia: ['Quando começou?'], farmacoterapia: [], exposicao: ['Usou veneno?'], sinaisAlarme: [] }, perguntasSugeridas: ['O que aplicou?'],
  examesDisponiveis: [
    { id: 'colinesterase', nome: 'Colinesterase', custoTempoMin: 10, impactoVitalidade: 0, impactoPaciencia: -2, essencial: true, resultado: 'Baixa' },
    { id: 'tc', nome: 'Tomografia', custoTempoMin: 30, impactoVitalidade: -8, impactoPaciencia: -10, essencial: false, resultado: 'Normal' },
  ],
  gabaritoPreceptor: { diagnostico: 'Síndrome colinérgica por organofosforado', conduta: 'Atropina e pralidoxima', palavrasChave: ['Atropina', 'Pralidóxima'] },
};

const SIM_ACERVO_ROW = {
  id: CASE_UUID, title: 'Caso autoral', toxindrome: 'Colinérgica', agent: 'Clorpirifós',
  payload: { paciente: { nome: 'José' }, queixaPrincipal: 'Falta de ar', contextoOculto: { exposicaoReal: 'Clorpirifós sem EPI' }, gabaritoPreceptor: { diagnostico: 'Síndrome colinérgica', conduta: 'Atropina', palavrasChave: ['atropina'] } },
  sim_profile: { v: 1, difficulty: 'avancado', stages: [{ id: 'inicio', severity: 'estavel', when: { afterMin: 0 } }, { id: 'piora', severity: 'piora', when: { afterMin: 10 }, note: 'Refere visão turva.' }] },
};

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
  Groq.__resetPoolStateForTests(0);
  __resetFlagCacheForTests();
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('regressão: sem a flag (ou sem simulation) o prompt atual sai byte a byte igual', () => {
  test('chat sem simulation: mensagens idênticas ao baseline e NENHUMA consulta nova ao banco', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply('Tô com falta de ar, doutor.'));
    const sql = routedSql(FLAG_ON);
    const res = await Clinical.chat(sql, envWith(), MEMBER, CHAT_INPUT);
    expect(res).toEqual({ success: true, patientReply: 'Tô com falta de ar, doutor.' });
    expect(sent()).toEqual(BASELINE.chat);
    // Sem `simulation` o portão devolve null antes de qualquer consulta (nem a flag é lida por ele).
    const probe = routedSql(FLAG_ON);
    expect(await ClinicalSim.prepare(probe, MEMBER, { rawSimulation: undefined, caseSource: 'builtin', caseId: 'x' })).toBeNull();
    expect(await ClinicalSim.prepare(probe, MEMBER, { rawSimulation: null, caseSource: 'acervo', caseId: 'x' })).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  test('chat com simulation e flag DESLIGADA: ignora o parâmetro, prompt idêntico, resposta sem campo novo', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply('Tô com falta de ar, doutor.'));
    const res = await Clinical.chat(routedSql(FLAG_OFF), envWith(), MEMBER, Object.assign({}, CHAT_INPUT, { simulation: SIM }));
    expect(sent()).toEqual(BASELINE.chat);
    expect(res).toEqual({ success: true, patientReply: 'Tô com falta de ar, doutor.' });
  });

  test('chat com flag ausente da tabela, ou erro ao ler a flag: falha fechada, caminho antigo', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('Tô com falta de ar, doutor.'));
    await Clinical.chat(routedSql([]), envWith(), MEMBER, Object.assign({}, CHAT_INPUT, { simulation: SIM }));
    expect(sent(0)).toEqual(BASELINE.chat);
    __resetFlagCacheForTests();
    await Clinical.chat(routedSql([['FROM feature_flags', new Error('banco fora')]]), envWith(), MEMBER, Object.assign({}, CHAT_INPUT, { simulation: SIM }));
    expect(sent(1)).toEqual(BASELINE.chat);
  });

  test('avaliação sem simulation e com flag desligada: prompt idêntico ao baseline, nota do modelo, details sem "sim"', async () => {
    globalThis.fetch.mockResolvedValue(groqReply(OLD_EVAL_JSON));
    const sql1 = routedSql([['INSERT INTO learning_attempts', [{ id: 'a1' }]]].concat(FLAG_ON));
    const res = await Clinical.evaluate(sql1, envWith(), MEMBER, EVAL_INPUT, 'cid');
    expect(sent(0)).toEqual(BASELINE.evaluate);
    expect(res).toEqual({ success: true, saved: true, result: { score: 88, verdict: 'Bom', feedback: 'Parecer.', strengths: [], improvements: [] } });
    expect(JSON.parse(callsMatching(sql1, 'INSERT INTO learning_attempts')[0][4]).sim).toBeUndefined();

    __resetFlagCacheForTests();
    const sql2 = routedSql([['INSERT INTO learning_attempts', [{ id: 'a2' }]]].concat(FLAG_OFF));
    const off = await Clinical.evaluate(sql2, envWith(), MEMBER, Object.assign({}, EVAL_INPUT, { simulation: SIM }), 'cid');
    expect(sent(1)).toEqual(BASELINE.evaluate);
    expect(off.simulation).toBeUndefined();
    expect(JSON.parse(callsMatching(sql2, 'INSERT INTO learning_attempts')[0][4]).sim).toBeUndefined();
  });
});

describe('chat em modo simulação', () => {
  const run = async (over, reply, identity) => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(reply || 'Comecei a passar mal hoje de manhã.'));
    return Clinical.chat(routedSql(FLAG_ON), envWith(), identity || MEMBER, Object.assign({}, CHAT_INPUT, over));
  };
  const system = () => sent()[0].content;

  test('o prompt é o de sempre MAIS as regras da persona e o perfil sorteado pela semente (trechos fixos do catálogo)', async () => {
    await run({ simulation: sim({ difficulty: 'avancado' }) });
    const base = BASELINE.chat[0].content;
    expect(system().startsWith(base)).toBe(true);
    const lines = profilePromptLines(drawAxes(42, 'avancado'), SIM_VERSION);
    lines.forEach((line) => expect(system()).toContain(line));
    expect(system()).toContain(getAgent('paciente-virtual').prompt);
    expect(system()).toMatch(/DADOS fixos do catálogo/);
    expect(sent().slice(1)).toEqual(BASELINE.chat.slice(1));
  });

  test('mesma semente = mesmo prompt; semente diferente = perfil diferente; o cliente não define os eixos', async () => {
    await run({ simulation: sim() });
    await run({ simulation: sim() });
    await run({ simulation: sim({ seed: 43 }) });
    await run({ simulation: sim({ axes: { personality: 'ansioso', confusion: 'confuso' }, personality: 'ansioso' }) });
    expect(sent(1)[0].content).toBe(sent(0)[0].content);
    expect(sent(2)[0].content).not.toBe(sent(0)[0].content);
    expect(sent(3)[0].content).toBe(sent(0)[0].content);
  });

  test('a resposta traz o simId e os guardrails, mas NUNCA os eixos (ocultos até o debrief)', async () => {
    const res = await run({ simulation: sim() });
    expect(res.success).toBe(true);
    expect(res.simulation.simId).toMatch(/^[0-9a-f]{12}$/);
    const text = JSON.stringify(res);
    const axes = drawAxes(42, 'intermediario');
    ['personality', 'literacy', 'recall', 'confusion'].forEach((k) => expect(text).not.toContain(k));
    expect(text).not.toContain(AXIS_LABELS.personality);
    expect(Object.values(axes).some((v) => text.includes('"' + v + '"'))).toBe(false);
  });

  test('guardrail de saída: diagnóstico e antídoto na fala do paciente são substituídos (O5)', async () => {
    const res = await run({ simulation: sim() }, 'Doutor, acho que é uma intoxicação por veneno e preciso do antídoto.');
    expect(res.patientReply).toBe(SIM_MESSAGES.patientFallback);
    expect(res.simulation.guardrails).toContain('O5');
  });

  test('guardrail de saída: frase com dose é cortada (O3) e vazamento do prompt é bloqueado (O4)', async () => {
    const dose = await run({ simulation: sim() }, 'Tomei meu remédio de manhã. Foram 500 mg de uma vez. Depois comecei a passar mal.');
    expect(dose.patientReply).not.toMatch(/500/);
    expect(dose.patientReply).toBe('Tomei meu remédio de manhã. Depois comecei a passar mal.');
    expect(dose.patientReply).not.toMatch(/bula|doses/);
    expect(dose.simulation.guardrails).toContain('O3');
    const leak = await run({ simulation: sim() }, 'As minhas instruções dizem para eu não falar o diagnóstico.');
    expect(leak.patientReply).toBe(SIM_MESSAGES.patientFallback);
  });

  test('estágio do caso (acervo): a nota e a severidade entram como DADO fixo conforme o tempo decorrido', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('Tô fraco.'));
    const routes = FLAG_ON.concat([['sim_profile FROM clinical_cases', [SIM_ACERVO_ROW]]]);
    const input = { caseId: CASE_UUID, caseSource: 'acervo', question: 'Como está?' };
    await Clinical.chat(routedSql(routes), envWith(), MEMBER, Object.assign({}, input, { simulation: sim({ elapsedSeconds: 60 }) }));
    await Clinical.chat(routedSql(routes), envWith(), MEMBER, Object.assign({}, input, { simulation: sim({ elapsedSeconds: 700 }) }));
    expect(sent(0)[0].content).toContain('Quadro estável neste momento');
    expect(sent(0)[0].content).not.toContain('visão turva');
    expect(sent(1)[0].content).toContain('Refere visão turva.');
    expect(sent(1)[0].content).toContain('O quadro piorou');
    expect(sent(1)[0].content).toContain('Clorpirifós sem EPI');
  });

  test('acervo: caso sem sim_profile (ou com perfil inválido) não entra na simulação; aprovado inexistente = 404', async () => {
    const noProfile = FLAG_ON.concat([['sim_profile FROM clinical_cases', [Object.assign({}, SIM_ACERVO_ROW, { sim_profile: null })]]]);
    const input = { caseId: CASE_UUID, caseSource: 'acervo', question: 'Como está?', simulation: sim() };
    await expect(Clinical.chat(routedSql(noProfile), envWith(), MEMBER, input)).rejects.toMatchObject({ name: 'ValidationError', message: SIM_MESSAGES.caseNotReady });
    const bad = FLAG_ON.concat([['sim_profile FROM clinical_cases', [Object.assign({}, SIM_ACERVO_ROW, { sim_profile: { v: 9 } })]]]);
    await expect(Clinical.chat(routedSql(bad), envWith(), MEMBER, input)).rejects.toMatchObject({ message: SIM_MESSAGES.caseNotReady });
    await expect(Clinical.chat(routedSql(FLAG_ON), envWith(), MEMBER, input)).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('portões: caso gerado na sessão (ia), visitante, menor de idade e parâmetros inválidos são recusados sem custo', async () => {
    await expect(run({ caseSource: 'ia', simulation: sim() })).rejects.toMatchObject({ message: SIM_MESSAGES.sourceNotAllowed });
    await expect(run({ simulation: sim() }, null, VISITOR)).rejects.toMatchObject({ name: 'ForbiddenError', message: SIM_MESSAGES.unavailable });
    await expect(run({ simulation: sim() }, null, Object.assign({}, MEMBER, { isMinor: true }))).rejects.toMatchObject({ name: 'ForbiddenError', message: SIM_MESSAGES.adultsOnly });
    await expect(run({ simulation: sim() }, null, Object.assign({}, MEMBER, { guardianProfileId: ADMIN.profileId }))).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(run({ simulation: { seed: 1.5, version: SIM_VERSION } })).rejects.toMatchObject({ message: SIM_MESSAGES.invalidSeed });
    await expect(run({ simulation: { seed: 1, version: 'sim-v9' } })).rejects.toMatchObject({ message: SIM_MESSAGES.invalidVersion });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('admin pode simular; cota e limite são os do chat clínico (uma chamada de cota)', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply('Oi.'));
    const sql = routedSql(FLAG_ON);
    const res = await Clinical.chat(sql, envWith(), ADMIN, Object.assign({}, CHAT_INPUT, { simulation: sim() }));
    expect(res.success).toBe(true);
    const chatBuckets = callsMatching(sql, 'INSERT INTO rate_limit_buckets').filter((c) => c.includes('AI_CHAT'));
    expect(chatBuckets).toHaveLength(1);
  });
});

describe('avaliação em modo simulação', () => {
  const evalRun = async (components, over, identity) => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(SIM_EVAL_JSON(components)));
    const sql = routedSql([['INSERT INTO learning_attempts', [{ id: 'att-sim' }]]].concat(FLAG_ON));
    const res = await Clinical.evaluate(sql, envWith(), identity || MEMBER, Object.assign({}, EVAL_INPUT, { simulation: sim({ difficulty: 'avancado' }) }, over), 'cid');
    return { res, sql };
  };

  test('o servidor limita cada componente e soma: o modelo só sugere (a "nota 100" dele é ignorada)', async () => {
    const { res } = await evalRun({ hipotese: 99, conduta: 25, processo: 99, comunicacao: 5 });
    expect(res.result.score).toBe(30 + 25 + 20 + 5);
    expect(res.simulation.components).toEqual({ hipotese: 30, conduta: 25, processo: 20, comunicacao: 5 });
    expect(res.simulation.weights).toEqual({ hipotese: 30, conduta: 30, processo: 20, comunicacao: 20 });
  });

  test('tetos por desfecho e por fatos do atendimento são aplicados pelo servidor', async () => {
    const full = { hipotese: 30, conduta: 30, processo: 20, comunicacao: 20 };
    expect((await evalRun(full, { attendance: Object.assign({}, ATTENDANCE, { outcome: 'obito' }) })).res.result.score).toBe(25);
    expect((await evalRun(full, { attendance: Object.assign({}, ATTENDANCE, { outcome: 'abandono' }) })).res.result.score).toBe(40);
    expect((await evalRun(full, { attendance: Object.assign({}, ATTENDANCE, { diagnosis: '  ' }) })).res.result.score).toBe(70);
    expect((await evalRun(full, { attendance: Object.assign({}, ATTENDANCE, { questionsAsked: [] }) })).res.result.score).toBe(60);
  });

  test('o preceptor recebe o perfil sorteado (rótulos e dicas) e o formato por componente', async () => {
    await evalRun({ hipotese: 1, conduta: 1, processo: 1, comunicacao: 1 });
    const [system, user] = sent().map((m) => m.content);
    expect(system).toContain('"components"');
    expect(system).toContain('hipotese (até 30)');
    expect(system).toContain('comunicacao (até 20)');
    expect(user).toContain('PERFIL DO PACIENTE SIMULADO');
    expect(user).toContain('dicasDeAdaptacao');
    expect(user).toContain(BASE.answerKey.diagnostico);
  });

  test('details.sim guarda simId, semente, versão, dificuldade, eixos, estágio, persona e componentes', async () => {
    const { res, sql } = await evalRun({ hipotese: 10, conduta: 10, processo: 10, comunicacao: 10 });
    const details = JSON.parse(callsMatching(sql, 'INSERT INTO learning_attempts')[0][4]);
    expect(details).toMatchObject({ caseId: 'caso_tox_01', caseSource: 'builtin', outcome: 'sobreviveu' });
    expect(details.sim).toEqual({
      simId: res.simulation.simId, seed: 42, version: SIM_VERSION, difficulty: 'avancado', axes: Object.assign({}, drawAxes(42, 'avancado')),
      stage: null, persona: getAgent('paciente-virtual').ref, components: { hipotese: 10, conduta: 10, processo: 10, comunicacao: 10 },
    });
    expect(JSON.stringify(details).length).toBeLessThan(2000);
  });

  test('o debrief REVELA os eixos (rótulos), só aqui', async () => {
    const { res } = await evalRun({ hipotese: 1, conduta: 1, processo: 1, comunicacao: 1 });
    const axes = drawAxes(42, 'avancado');
    expect(res.simulation.axes.map((a) => a.axis)).toEqual(['personality', 'literacy', 'recall', 'confusion']);
    expect(res.simulation.axes.map((a) => a.value)).toEqual(Object.values(axes));
    expect(res.simulation.axes[0].axisLabel).toBe(AXIS_LABELS.personality);
  });

  test('saída do modelo inutilizável: erro esperado e nada gravado', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(JSON.stringify({ score: 90, verdict: 'ok', feedback: 'sem componentes' })));
    const sql = routedSql(FLAG_ON);
    await expect(Clinical.evaluate(sql, envWith(), MEMBER, Object.assign({}, EVAL_INPUT, { simulation: sim() }), 'cid')).rejects.toMatchObject({ aiInvalidOutput: true });
    expect(callsMatching(sql, 'INSERT INTO learning_attempts')).toHaveLength(0);
  });

  test('caso gerado na sessão (ia) e menores não avaliam em simulação', async () => {
    await expect(evalRun({}, { caseSource: 'ia' })).rejects.toMatchObject({ message: SIM_MESSAGES.sourceNotAllowed });
    await expect(evalRun({}, {}, Object.assign({}, MEMBER, { age: 16 }))).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});

describe('dica de disponibilidade (sem action nova)', () => {
  test('flag ligada e pessoa elegível: acrescenta simulation.available; desligada: resposta idêntica', async () => {
    const base = { success: true, quotas: {} };
    expect(await ClinicalSim.withSimulationHint(routedSql(FLAG_ON), MEMBER, base)).toEqual({ success: true, quotas: {}, simulation: { available: true, version: SIM_VERSION } });
    __resetFlagCacheForTests();
    expect(await ClinicalSim.withSimulationHint(routedSql(FLAG_OFF), MEMBER, base)).toBe(base);
    __resetFlagCacheForTests();
    expect(await ClinicalSim.withSimulationHint(routedSql(FLAG_ON), VISITOR, base)).toBe(base);
    expect(await ClinicalSim.withSimulationHint(routedSql(FLAG_ON), Object.assign({}, MEMBER, { isMinor: true }), base)).toBe(base);
    const failed = { success: false };
    expect(await ClinicalSim.withSimulationHint(routedSql(FLAG_ON), MEMBER, failed)).toBe(failed);
  });
});

describe('trava de revisão no reviewCase (mock)', () => {
  const CHECKLIST = { semDadoReal: true, gabaritoConferido: true, estagiosPlausiveis: true, linguagemRevisada: true };

  test('aprovar com a lista completa grava checklist e revisor clínico; audita', async () => {
    const sql = routedSql([['UPDATE clinical_cases', [{ id: CASE_UUID }]]]);
    const res = await Clinical.reviewCase(sql, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist: CHECKLIST }, 'cid');
    expect(res.success).toBe(true);
    const upd = callsMatching(sql, 'UPDATE clinical_cases')[0];
    expect(upd[0].join('?')).toContain('sim_profile IS NOT NULL');
    expect(upd.slice(1)).toEqual([ADMIN.profileId, JSON.stringify(CHECKLIST), ADMIN.profileId, CASE_UUID]);
  });

  test.each([
    ['item falso', Object.assign({}, CHECKLIST, { linguagemRevisada: false })],
    ['item faltando', { semDadoReal: true }],
    ['item como texto', Object.assign({}, CHECKLIST, { semDadoReal: 'true' })],
    ['item extra', Object.assign({}, CHECKLIST, { outro: true })],
    ['não é objeto', 'tudo certo'],
  ])('lista incompleta (%s) é recusada ANTES de tocar no banco', async (_n, checklist) => {
    const sql = routedSql([]);
    await expect(Clinical.reviewCase(sql, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist }, 'cid')).rejects.toMatchObject({ message: SIM_MESSAGES.reviewIncomplete });
    expect(callsMatching(sql, 'UPDATE clinical_cases')).toHaveLength(0);
  });

  test('caso sem perfil de simulação com lista: mensagem clara; caso inexistente e já revisado seguem como antes', async () => {
    const noProfile = routedSql([['sim_profile IS NOT NULL) AS has_sim', [{ status: 'pending', has_sim: false }]]]);
    await expect(Clinical.reviewCase(noProfile, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist: CHECKLIST }, 'cid')).rejects.toMatchObject({ message: SIM_MESSAGES.reviewNoProfile });
    await expect(Clinical.reviewCase(routedSql([]), envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist: CHECKLIST }, 'cid')).rejects.toMatchObject({ name: 'NotFoundError' });
    const done = routedSql([['sim_profile IS NOT NULL) AS has_sim', [{ status: 'approved', has_sim: true }]]]);
    await expect(Clinical.reviewCase(done, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist: CHECKLIST }, 'cid')).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('erros do gatilho do banco viram mensagens claras; outros erros sobem como estão', async () => {
    const same = routedSql([['UPDATE clinical_cases', new Error('clinical_sim_review: o revisor clínico não pode ser a mesma pessoa que criou o caso')]]);
    await expect(Clinical.reviewCase(same, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist: CHECKLIST }, 'cid')).rejects.toMatchObject({ message: SIM_MESSAGES.reviewSameAuthor });
    const incomplete = routedSql([['UPDATE clinical_cases', new Error('clinical_sim_review: a lista de conferência precisa ter os 4 itens confirmados')]]);
    await expect(Clinical.reviewCase(incomplete, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved' }, 'cid')).rejects.toMatchObject({ message: SIM_MESSAGES.reviewIncomplete });
    const other = routedSql([['UPDATE clinical_cases', new Error('conexão perdida')]]);
    await expect(Clinical.reviewCase(other, envWith(), ADMIN, { caseId: CASE_UUID, decision: 'approved', checklist: CHECKLIST }, 'cid')).rejects.toThrow('conexão perdida');
  });
});

describe('trava de revisão com o banco de verdade (PGlite + 037)', () => {
  let db;
  let sql;
  const AUTHOR = '55555555-5555-4555-8555-555555555555';
  const REVIEWER = '66666666-6666-4666-8666-666666666666';
  const CHECKLIST = { semDadoReal: true, gabaritoConferido: true, estagiosPlausiveis: true, linguagemRevisada: true };
  const identity = (profileId) => ({ profileId, role: 'admin' });

  const addAdmin = (id, name) => db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, $2, $3, 'h', '11999990000', 'admin', 'active', now(), $4)`, [id, name, name + '@example.com', name]
  );
  const addCase = async (over = {}) => {
    const c = Object.assign({ source: 'admin', sim: SIM_ACERVO_ROW.sim_profile }, over);
    const res = await db.query(
      `INSERT INTO clinical_cases (title, source, status, created_by, sim_profile, payload)
       VALUES ('Caso autoral de teste', $1, 'pending', $2, $3::jsonb, $4::jsonb) RETURNING id`,
      [c.source, AUTHOR, c.sim ? JSON.stringify(c.sim) : null, JSON.stringify(SIM_ACERVO_ROW.payload)]
    );
    return res.rows[0].id;
  };
  const review = (caseId, who, extra) => Clinical.reviewCase(sql, envWith(), identity(who), Object.assign({ caseId, decision: 'approved' }, extra), '00000000-0000-4000-8000-000000000000');

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
    await addAdmin(AUTHOR, 'autora');
    await addAdmin(REVIEWER, 'revisor');
  }, 120000);
  afterAll(async () => { await db.close(); });

  test('revisor diferente do autor + lista completa: publica, e a simulação passa a enxergar o caso', async () => {
    const id = await addCase();
    await review(id, REVIEWER, { checklist: CHECKLIST });
    const row = (await db.query('SELECT status, clinical_reviewed_by, review_checklist FROM clinical_cases WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ status: 'approved', clinical_reviewed_by: REVIEWER, review_checklist: CHECKLIST });
    globalThis.fetch.mockResolvedValueOnce(groqReply('Tô fraco.'));
    __resetFlagCacheForTests();
    await db.exec("UPDATE feature_flags SET enabled = TRUE WHERE key = 'clinical_sim_enabled'");
    const res = await Clinical.chat(sql, envWith(), identity(REVIEWER), { caseId: id, caseSource: 'acervo', question: 'Como está?', simulation: sim() });
    expect(res.success).toBe(true);
    expect(sent()[0].content).toContain('Clorpirifós sem EPI');
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'clinical_sim_enabled'");
    __resetFlagCacheForTests();
  });

  test('o autor não revisa o próprio caso (mensagem clara) e o caso segue pendente', async () => {
    const id = await addCase();
    await expect(review(id, AUTHOR, { checklist: CHECKLIST })).rejects.toMatchObject({ message: SIM_MESSAGES.reviewSameAuthor });
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [id])).rows[0].status).toBe('pending');
  });

  test('aprovar caso com sim_profile SEM lista (caminho antigo) é barrado pelo banco com mensagem clara', async () => {
    const id = await addCase();
    await expect(review(id, REVIEWER)).rejects.toMatchObject({ message: SIM_MESSAGES.reviewIncomplete });
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [id])).rows[0].status).toBe('pending');
  });

  test('caso sem sim_profile segue o fluxo antigo (sem lista, autor pode aprovar) e rejeitar nunca exige lista', async () => {
    const plain = await addCase({ sim: null });
    await review(plain, AUTHOR);
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [plain])).rows[0].status).toBe('approved');
    const sem = await addCase();
    await Clinical.reviewCase(sql, envWith(), identity(REVIEWER), { caseId: sem, decision: 'rejected' }, '00000000-0000-4000-8000-000000000000');
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [sem])).rows[0].status).toBe('rejected');
  });

  test('caso gerado por IA continua pendente e sem perfil de simulação', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply(JSON.stringify(GENERATED_CASE)));
    const out = await Clinical.generateCase(sql, envWith(), identity(AUTHOR), { topic: 'Organofosforado', difficulty: 'Avançado' }, '00000000-0000-4000-8000-000000000000');
    const row = (await db.query('SELECT status, source, sim_profile FROM clinical_cases WHERE id = $1', [out.case.id])).rows[0];
    expect(row).toEqual({ status: 'pending', source: 'ia', sim_profile: null });
  });
});
