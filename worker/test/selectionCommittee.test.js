/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Processo seletivo, fatia 2: painel da comissão (selectionCommitteeService) e pedido de revisão do candidato,
 * contra um Postgres real em memória (PGlite). Quem usa: `npm test -- -i selectionCommittee`.
 */
import { jest } from '@jest/globals';
import * as Committee from '../src/services/selectionCommitteeService.js';
import * as Selection from '../src/services/selectionService.js';
import * as Groq from '../src/ai/groqClient.js';
import * as T from '../src/selection/triage.js';
import * as B from '../src/selection/banco.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { __resetMetricsForTests } from '../src/ai/metrics.js';
import { makeEnv } from './helpers/mockEnv.js';
import { groqReply, memoryKv, KEYS } from './helpers/aiTestUtils.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const ADMIN = '88888888-8888-4888-8888-888888888881';
const CAND = '88888888-8888-4888-8888-888888888882';
const CAND2 = '88888888-8888-4888-8888-888888888883';
const admin = { profileId: ADMIN, role: 'admin', fullName: 'Diretoria' };
const cand = { profileId: CAND, role: 'visitor', fullName: 'Candidata Um' };
const cand2 = { profileId: CAND2, role: 'visitor', fullName: 'Candidato Dois' };
const CID = '00000000-0000-4000-8000-0000000000c2';
const env = () => makeEnv({ GROQ_API_KEYS: KEYS.join('\n'), HOT_CACHE: memoryKv() });

let db;
let sql;
let realFetch;

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [id, role, n] of [[ADMIN, 'admin', 1], [CAND, 'visitor', 2], [CAND2, 'visitor', 3]]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, $3, 'comissao${n}', 'c${n}@exemplo.com', 'x', '1199988000${n}', $2) ON CONFLICT (id) DO NOTHING`,
      [id, role, 'Pessoa ' + n],
    );
  }
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
  Groq.__resetPoolStateForTests(0);
  __resetMetricsForTests();
  await db.exec('TRUNCATE selection_events, selection_applications, audit_logs, rate_limit_buckets, ai_usage_log');
  await db.exec("UPDATE profiles SET role = 'visitor' WHERE id IN ('" + CAND + "', '" + CAND2 + "')");
  await db.exec("UPDATE feature_flags SET enabled = TRUE WHERE key IN ('selection_enabled', 'selection_ai_enabled')");
  await db.exec('UPDATE selection_settings SET is_open = TRUE, window_days = 7, batch_every_days = 15, next_review_on = NULL, vacancies_note = NULL');
  __resetFlagCacheForTests();
});
afterEach(() => { globalThis.fetch = realFetch; });

const rows = async (text, params = []) => (await db.query(text, params)).rows;
const filler = (n) => ('Resposta com raciocínio e exemplos claros. ').repeat(Math.ceil(n / 42)).slice(0, n);

async function submitted(who, extra) {
  const { application } = await Selection.start(sql, who, CID);
  const steps = [
    ['intro', { acceptedEdital: true, acceptedAiNotice: true, acceptedPrivacy: true }],
    ['profile', { course: 'Farmácia', institution: 'UNINASSAU', semester: '5', areas: ['Toxicologia'], hoursPerWeek: 6, days: ['seg'], shifts: ['noite'], motivation: 'Quero aprender.' }],
    ['scenario', { text: filler(600) + (extra || '') }],
    ['thinking', { answers: Object.fromEntries(B.THINKING.map((q) => [q.id, filler(q.min + 10)])) }],
    ['conduct', { answers: Object.fromEntries(B.CONDUCT.map((q) => [q.id, filler(q.min + 10)])) }],
  ];
  for (const [step, data] of steps) await Selection.saveStep(sql, who, { step, data }, CID);
  await db.query("UPDATE selection_applications SET started_at = now() - interval '10 minutes' WHERE id = $1", [application.id]);
  await Selection.submit(sql, who, {}, CID);
  return application.id;
}

describe('acesso', () => {
  test('só administrador usa o painel; visitante e membro são recusados', async () => {
    for (const who of [cand, { ...cand, role: 'member' }, null]) {
      await expect(Committee.overview(sql, who, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
      await expect(Committee.decide(sql, env(), who, { id: CAND, decision: 'approved' }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
      await expect(Committee.saveSettings(sql, who, {}, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    }
  });
});

describe('fila e ficha', () => {
  test('a fila traz contagens, sinais e respeita o filtro; rascunho não aparece', async () => {
    const id = await submitted(cand, ' estou em tratamento há anos.');
    await Selection.start(sql, cand2, CID);
    const view = await Committee.overview(sql, admin, {});
    expect(view.counts).toMatchObject({ submitted: 1 });
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ id, name: 'Pessoa 2', course: 'Farmácia', signals: ['saude'], hasTriage: false, appeal: false });
    expect(view.aiEnabled).toBe(true);
    expect(view.settings).toMatchObject({ isOpen: true, windowDays: 7 });
    expect((await Committee.overview(sql, admin, { filter: 'decided' })).items).toHaveLength(0);
  });

  test('a ficha mostra as respostas e nunca os sinais internos como resposta', async () => {
    const id = await submitted(cand);
    const { application } = await Committee.getApplication(sql, admin, { id });
    expect(application.answers.thinking.answers.t01).toBeTruthy();
    expect(application.answers).not.toHaveProperty('_signals');
    expect(application.email).toBe('c2@exemplo.com');
    await expect(Committee.getApplication(sql, admin, { id: 'nao-e-id' })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Committee.getApplication(sql, admin, { id: '99999999-9999-4999-8999-999999999999' })).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('decisão', () => {
  test('a comissão não decide a própria inscrição', async () => {
    const id = await submitted(admin);
    await expect(Committee.decide(sql, env(), admin, { id, decision: 'approved' }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('aprovar torna a pessoa membro, registra quem decidiu e audita; decidir de novo é recusado', async () => {
    const id = await submitted(cand);
    const out = await Committee.decide(sql, env(), admin, { id, decision: 'approved', note: 'Ótima proposta.' }, CID);
    expect(out).toMatchObject({ success: true, status: 'approved' });
    expect((await rows('SELECT role FROM profiles WHERE id = $1', [CAND]))[0].role).toBe('member');
    expect((await rows('SELECT status, decided_by, decision_note FROM selection_applications WHERE id = $1', [id]))[0]).toMatchObject({ status: 'approved', decided_by: ADMIN, decision_note: 'Ótima proposta.' });
    expect(await rows("SELECT 1 FROM audit_logs WHERE action IN ('SELECTION_DECIDED', 'CHANGE_USER_ROLE')")).toHaveLength(2);
    await expect(Committee.decide(sql, env(), admin, { id, decision: 'not_selected' }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('lista de espera e não selecionar não mudam o papel; decisão inválida e rascunho são recusados', async () => {
    const id = await submitted(cand);
    await Committee.decide(sql, env(), admin, { id, decision: 'waitlist' }, CID);
    await Committee.decide(sql, env(), admin, { id, decision: 'not_selected' }, CID);
    expect((await rows('SELECT role FROM profiles WHERE id = $1', [CAND]))[0].role).toBe('visitor');
    await expect(Committee.decide(sql, env(), admin, { id, decision: 'talvez' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    const { application } = await Selection.start(sql, cand2, CID);
    await expect(Committee.decide(sql, env(), admin, { id: application.id, decision: 'approved' }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
  });
});

describe('pedido de revisão', () => {
  test('só depois do resultado, uma vez, e a comissão vê o pedido', async () => {
    const id = await submitted(cand);
    await expect(Selection.requestReview(sql, cand, {}, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    await Committee.decide(sql, env(), admin, { id, decision: 'not_selected' }, CID);
    const out = await Selection.requestReview(sql, cand, { note: 'Gostaria que relessem meu projeto.' }, CID);
    expect(out.success).toBe(true);
    await expect(Selection.requestReview(sql, cand, {}, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    const view = await Committee.overview(sql, admin, { filter: 'appeal' });
    expect(view.items).toHaveLength(1);
    expect(view.items[0].appeal).toBe(true);
    expect((await Committee.getApplication(sql, admin, { id })).application.appealNote).toMatch(/projeto/);
    expect((await Selection.overview(sql, cand)).mine).toMatchObject({ status: 'not_selected' });
  });
});

describe('configurações', () => {
  test('salva, valida e aparece na visão pública', async () => {
    const out = await Committee.saveSettings(sql, admin, { isOpen: true, windowDays: 10, batchEveryDays: 20, nextReviewOn: '2026-12-01', vacanciesNote: '10 vagas' }, CID);
    expect(out.settings).toMatchObject({ windowDays: 10, batchEveryDays: 20, nextReviewOn: '2026-12-01', vacanciesNote: '10 vagas' });
    expect(await Selection.overview(sql, null)).toMatchObject({ windowDays: 10, nextReviewOn: '2026-12-01' });
    await expect(Committee.saveSettings(sql, admin, { isOpen: true, windowDays: 0, batchEveryDays: 20 }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Committee.saveSettings(sql, admin, { isOpen: 'sim', windowDays: 7, batchEveryDays: 15 }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Committee.saveSettings(sql, admin, { isOpen: true, windowDays: 7, batchEveryDays: 15, nextReviewOn: 'amanha' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('triagem por IA', () => {
  const good = JSON.stringify({ resumo: 'Propõe um simpósio sobre farmacovigilância e descreve estudo próprio.', pontos_fortes: ['Projeto claro'], pontos_para_conferir: ['Fonte do artigo citado'] });

  test('gera o resumo sem decidir: o status não muda e o texto da pessoa vai como dado', async () => {
    const id = await submitted(cand);
    globalThis.fetch.mockResolvedValue(groqReply(good));
    const out = await Committee.triage(sql, env(), admin, { id }, CID);
    expect(out).toMatchObject({ success: true, done: 1 });
    const row = (await rows('SELECT status, ai_triage FROM selection_applications WHERE id = $1', [id]))[0];
    expect(row.status).toBe('submitted');
    expect(row.ai_triage).toMatchObject({ summary: expect.stringMatching(/simpósio/), strengths: ['Projeto claro'], checks: ['Fonte do artigo citado'] });
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sent.messages[1].content).toMatch(/<inscricao>[\s\S]*<\/inscricao>/);
    expect(sent.messages[1].content).not.toMatch(/c2@exemplo|Pessoa 2|Candidata/);
    expect((await Committee.overview(sql, admin, {})).items[0].hasTriage).toBe(true);
  });

  test('saída que decide, dá nota ou foge do formato é descartada; IA fora não derruba nada', async () => {
    expect(T.parseTriage('{"resumo":"Recomendo aprovar este candidato.","pontos_fortes":[],"pontos_para_conferir":[]}')).toBeNull();
    expect(T.parseTriage('{"resumo":"Boa candidata. Nota 9/10","pontos_fortes":[],"pontos_para_conferir":[]}')).toBeNull();
    expect(T.parseTriage('texto solto')).toBeNull();
    expect(T.parseTriage(good)).toMatchObject({ summary: expect.any(String) });
    const id = await submitted(cand);
    globalThis.fetch.mockResolvedValue(groqReply('{"resumo":"Aprovar sem dúvida."}'));
    const out = await Committee.triage(sql, env(), admin, { id }, CID);
    expect(out.done).toBe(0);
    expect((await rows('SELECT ai_triage FROM selection_applications WHERE id = $1', [id]))[0].ai_triage).toBeNull();
  });

  test('flag desligada recusa; sem id processa as próximas pendentes', async () => {
    await submitted(cand);
    await submitted(cand2);
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'selection_ai_enabled'");
    __resetFlagCacheForTests();
    await expect(Committee.triage(sql, env(), admin, {}, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await db.exec("UPDATE feature_flags SET enabled = TRUE WHERE key = 'selection_ai_enabled'");
    __resetFlagCacheForTests();
    globalThis.fetch.mockResolvedValue(groqReply(good));
    expect(await Committee.triage(sql, env(), admin, {}, CID)).toMatchObject({ done: 2, asked: 2 });
  });
});
