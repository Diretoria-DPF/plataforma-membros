/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * proposalAuthz.test.js — autorização por papel e limite de taxa nas ações de proposta
 * (submitProposal, listMyProposals, getProposalResults) contra um Postgres de verdade (PGlite).
 */
import * as ProposalService from '../src/services/proposalService.js';
import { RATE_LIMITS } from '../src/constants.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000f1';
const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER = { profileId: P_A, role: 'member', email: 'a@exemplo.com', fullName: 'Pessoa A' };
const ADMIN = { profileId: P_B, role: 'admin', email: 'b@exemplo.com', fullName: 'Pessoa B' };
const VISITOR = { profileId: P_A, role: 'visitor', email: 'a@exemplo.com', fullName: 'Pessoa A' };
const INPUT = { title: 'Título válido', description: 'Descrição válida da proposta' };

let db;
let sql;

const errOf = (promise) => promise.then(() => null, (e) => e);
const count = async () => Number((await db.query('SELECT count(*) AS n FROM proposals')).rows[0].n);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [id, name, role] of [[P_A, 'a', 'member'], [P_B, 'b', 'admin']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, email_confirmed_at)
       VALUES ($1, $2, $3, $4, 'x', '11999990000', $5, now())`,
      [id, `Pessoa ${name}`, `pessoa_${name}`, `${name}@exemplo.com`, role],
    );
  }
}, 60000);

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('DELETE FROM votes; DELETE FROM proposals; DELETE FROM audit_logs; DELETE FROM rate_limit_buckets;');
});

describe('propostas — papel exigido', () => {
  test('visitante é negado nas três ações e nada é gravado', async () => {
    const calls = [
      () => ProposalService.submitProposal(sql, VISITOR, INPUT, CID),
      () => ProposalService.listMyProposals(sql, VISITOR),
      () => ProposalService.getProposalResults(sql, VISITOR, P_A),
    ];
    for (const call of calls) expect(await errOf(call())).toMatchObject({ name: 'ForbiddenError' });
    expect(await count()).toBe(0);
  });

  test('identidade ausente também é negada', async () => {
    expect(await errOf(ProposalService.listMyProposals(sql, null))).toMatchObject({ name: 'ForbiddenError' });
  });

  test.each([['membro', MEMBER], ['admin', ADMIN]])('%s envia, lista e consulta resultados', async (_n, identity) => {
    const sent = await ProposalService.submitProposal(sql, identity, INPUT, CID);
    expect(sent.success).toBe(true);
    const mine = await ProposalService.listMyProposals(sql, identity);
    expect(mine.proposals).toHaveLength(1);
    const res = await ProposalService.getProposalResults(sql, identity, sent.proposalId);
    expect(res.success).toBe(true);
  });
});

describe('propostas — limite de envio (PROPOSAL_SUBMIT)', () => {
  test('o envio acima do teto por pessoa é barrado sem gravar; outra pessoa não é afetada', async () => {
    const { MAX_ATTEMPTS, WINDOW_SECONDS } = RATE_LIMITS.PROPOSAL_SUBMIT;
    expect(WINDOW_SECONDS).toBe(3600);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await ProposalService.submitProposal(sql, MEMBER, INPUT, CID);
    const err = await errOf(ProposalService.submitProposal(sql, MEMBER, INPUT, CID));
    expect(err).toMatchObject({ name: 'RateLimitError' });
    expect(await count()).toBe(MAX_ATTEMPTS);
    await expect(ProposalService.submitProposal(sql, ADMIN, INPUT, CID)).resolves.toMatchObject({ success: true });
  });
});
