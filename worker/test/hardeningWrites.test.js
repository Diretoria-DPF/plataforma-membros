/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * hardeningWrites.test.js — limites de escrita por pessoa (feedback, comentário de tarefa, resultado de proposta) e
 * visibilidade de apiGetProposalResults, contra um Postgres de verdade (PGlite).
 */
import * as ProposalService from '../src/services/proposalService.js';
import * as ProfileService from '../src/services/profileService.js';
import * as TaskService from '../src/services/taskService.js';
import { HARDENING_RATE_LIMITS as L } from '../src/constants.js';
import { waitText } from '../src/writeLimits.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000f2';
const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MEMBER_A = { profileId: P_A, role: 'member', capabilities: [] };
const MEMBER_C = { profileId: P_C, role: 'member', capabilities: [] };
const GESTOR_C = { profileId: P_C, role: 'member', capabilities: ['proposals.review'] };
const ADMIN = { profileId: P_B, role: 'admin', capabilities: [] };
const TASK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let db;
let sql;
const errOf = (promise) => promise.then(() => null, (e) => e);
const proposal = async (status) => (await db.query(
  "INSERT INTO proposals (title, description, author_id, status) VALUES ('Título', 'Descrição longa', $1, $2::proposal_status) RETURNING id",
  [P_A, status]
)).rows[0].id;

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [id, name, role] of [[P_A, 'a', 'member'], [P_B, 'b', 'admin'], [P_C, 'c', 'member']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, email_confirmed_at)
       VALUES ($1, $2, $3, $4, 'x', '11999990000', $5, now())`,
      [id, `Pessoa ${name}`, `pessoa_${name}`, `${name}@exemplo.com`, role]
    );
  }
  await db.query("INSERT INTO tasks (id, title, description, status) VALUES ($1, 'Tarefa', 'Descrição da tarefa', 'published')", [TASK]);
  await db.query('INSERT INTO task_signups (task_id, profile_id) VALUES ($1, $2)', [TASK, P_A]);
}, 60000);

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('DELETE FROM votes; DELETE FROM proposals; DELETE FROM feedback; DELETE FROM task_comments; DELETE FROM audit_logs; DELETE FROM rate_limit_buckets;');
});

describe('apiGetProposalResults — visibilidade', () => {
  test.each(['submitted', 'approved', 'rejected'])('membro que não é autor não vê proposta %s (mesma resposta de inexistente)', async (status) => {
    const id = await proposal(status);
    expect(await errOf(ProposalService.getProposalResults(sql, MEMBER_C, id))).toMatchObject({ name: 'NotFoundError' });
  });

  test.each(['voting_open', 'voting_closed'])('membro vê proposta %s', async (status) => {
    const id = await proposal(status);
    const res = await ProposalService.getProposalResults(sql, MEMBER_C, id);
    expect(res.proposal).toMatchObject({ id, title: 'Título' });
  });

  test('autor vê a própria proposta em qualquer status', async () => {
    const id = await proposal('submitted');
    expect((await ProposalService.getProposalResults(sql, MEMBER_A, id)).proposal.id).toBe(id);
  });

  test('admin e quem tem a capacidade proposals.review veem qualquer status', async () => {
    const id = await proposal('rejected');
    expect((await ProposalService.getProposalResults(sql, ADMIN, id)).success).toBe(true);
    expect((await ProposalService.getProposalResults(sql, GESTOR_C, id)).success).toBe(true);
  });

  test('UUID inválido é erro de validação, não 500', async () => {
    for (const bad of ['', 'abc', 'x'.repeat(40), "' OR 1=1 --", null, undefined]) {
      expect(await errOf(ProposalService.getProposalResults(sql, MEMBER_A, bad))).toMatchObject({ name: 'ValidationError' });
    }
  });

  test('proposta inexistente continua NotFoundError', async () => {
    expect(await errOf(ProposalService.getProposalResults(sql, ADMIN, TASK))).toMatchObject({ name: 'NotFoundError' });
  });

  test('limite por pessoa, com mensagem coerente com a janela de 1 hora', async () => {
    const id = await proposal('voting_open');
    for (let i = 0; i < L.PROPOSAL_RESULTS.MAX_ATTEMPTS; i += 1) await ProposalService.getProposalResults(sql, MEMBER_C, id);
    const err = await errOf(ProposalService.getProposalResults(sql, MEMBER_C, id));
    expect(err).toMatchObject({ name: 'RateLimitError' });
    expect(err.message).toMatch(/1 hora/);
    expect(err.message).not.toMatch(/alguns minutos/);
  });
});

describe('propostas — mensagem do limite de envio', () => {
  test('fala em 1 hora, não em "alguns minutos"', async () => {
    const input = { title: 'Título válido', description: 'Descrição válida da proposta' };
    for (let i = 0; i < 10; i += 1) await ProposalService.submitProposal(sql, MEMBER_A, input, CID);
    const err = await errOf(ProposalService.submitProposal(sql, MEMBER_A, input, CID));
    expect(err).toMatchObject({ name: 'RateLimitError' });
    expect(err.message).toMatch(/1 hora/);
  });
});

describe('limites de escrita por pessoa', () => {
  test('feedback: acima do teto é barrado sem gravar; outra pessoa não é afetada', async () => {
    const msg = 'Mensagem de feedback válida';
    for (let i = 0; i < L.FEEDBACK_SUBMIT.MAX_ATTEMPTS; i += 1) await ProfileService.submitFeedback(sql, MEMBER_A, msg, CID);
    expect(await errOf(ProfileService.submitFeedback(sql, MEMBER_A, msg, CID))).toMatchObject({ name: 'RateLimitError' });
    expect(Number((await db.query('SELECT count(*) AS n FROM feedback')).rows[0].n)).toBe(L.FEEDBACK_SUBMIT.MAX_ATTEMPTS);
    await expect(ProfileService.submitFeedback(sql, MEMBER_C, msg, CID)).resolves.toMatchObject({ success: true });
  });

  test('feedback inválido não consome o limite', async () => {
    for (let i = 0; i < L.FEEDBACK_SUBMIT.MAX_ATTEMPTS + 2; i += 1) {
      expect(await errOf(ProfileService.submitFeedback(sql, MEMBER_A, '', CID))).toMatchObject({ name: 'ValidationError' });
    }
    await expect(ProfileService.submitFeedback(sql, MEMBER_A, 'Mensagem de feedback válida', CID)).resolves.toMatchObject({ success: true });
  });

  test('comentário de tarefa: acima do teto é barrado sem gravar', async () => {
    for (let i = 0; i < L.TASK_COMMENT.MAX_ATTEMPTS; i += 1) await TaskService.submitTaskComment(sql, MEMBER_A, TASK, 'comentário ' + i, CID);
    expect(await errOf(TaskService.submitTaskComment(sql, MEMBER_A, TASK, 'um a mais', CID))).toMatchObject({ name: 'RateLimitError' });
    expect(Number((await db.query('SELECT count(*) AS n FROM task_comments')).rows[0].n)).toBe(L.TASK_COMMENT.MAX_ATTEMPTS);
  });
});

describe('waitText', () => {
  test.each([[3600, '1 hora'], [7200, '2 horas'], [60, '1 minuto'], [1800, '30 minutos']])('%i s -> %s', (seconds, text) => {
    expect(waitText(seconds)).toBe(text);
  });
});
