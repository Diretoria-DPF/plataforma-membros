/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Mentoria (mentoringService.js; sql/039; ROL-04) com handlers reais e PGlite com todas as migrações: pedido, aceite,
 * recusa, encerramento, interruptores, resumo de progresso (só agregado, só com vínculo ativo e share_progress),
 * testes de escalada (quem não é parte não lê nem altera nada), auto-mentoria, flag desligada e degradação sem a 039.
 */
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { summarize } from '../src/services/mentoringService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';

const PEOPLE = {
  admin: { id: '11111111-1111-4111-8111-111111111111', role: 'admin' },
  ana: { id: '22222222-2222-4222-8222-222222222222', role: 'member' }, // mentorada
  bia: { id: '33333333-3333-4333-8333-333333333333', role: 'member', cargo: 'mentor' }, // mentora por cargo
  caio: { id: '44444444-4444-4444-8444-444444444444', role: 'member', available: true }, // mentor por disponibilidade
  davi: { id: '55555555-5555-4555-8555-555555555555', role: 'member' }, // terceiro, sem relação
  eva: { id: '66666666-6666-4666-8666-666666666666', role: 'member' }, // membro comum
  visitante: { id: '77777777-7777-4777-8777-777777777777', role: 'visitor' },
};
const GHOST = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

let db;
let sql;
const env = makeEnv();
const tokens = {};

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [name, p] of Object.entries(PEOPLE)) {
    await db.query(
      `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
       VALUES ($1, $2, $3, 'x', '11999990000', $4, 'active', now(), $5)`,
      [p.id, 'Pessoa ' + name, name + '@example.com', p.role, name]
    );
    if (p.cargo) await db.query('INSERT INTO member_roles (profile_id, role) VALUES ($1, $2)', [p.id, p.cargo]);
    if (p.available) await db.query('UPDATE profiles SET mentoring_available = true WHERE id = $1', [p.id]);
    tokens[name] = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, p.id, 'jest');
  }
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.query('DELETE FROM mentorships');
  await db.query('DELETE FROM rate_limit_buckets');
  await db.query('DELETE FROM audit_logs');
  await db.query('DELETE FROM learning_attempts');
  await db.query('DELETE FROM profile_blocks');
  await db.query("UPDATE feature_flags SET enabled = true WHERE key = 'mentoring_enabled'");
  __resetFlagCacheForTests();
});

const call = (action, who, input) => API_REGISTRY[action](sql, env, [tokens[who], input]);
const pedir = (who, mentor, over = {}) => call('apiMentoringRequest', who, { mentorId: PEOPLE[mentor].id, ...over });
async function vinculo(mentee, mentor, { aceitar = true, share = false } = {}) {
  const res = await pedir(mentee, mentor, { shareProgress: share });
  expect(res.success).toBe(true);
  if (aceitar) expect((await call('apiMentoringRespond', mentor, { id: res.id, accept: true })).success).toBe(true);
  return res.id;
}
async function estudar(who, rows) {
  for (const [module, activity, score, max] of rows) {
    await db.query('INSERT INTO learning_attempts (profile_id, module, activity, score, max_score) VALUES ($1, $2, $3, $4, $5)',
      [PEOPLE[who].id, module, activity, score, max]);
  }
}

describe('migração 039', () => {
  test('a flag nasce desligada e a tabela tem RLS forçado', async () => {
    const rls = await db.query("SELECT relrowsecurity AND relforcerowsecurity AS ok FROM pg_class WHERE relname = 'mentorships'");
    expect(rls.rows).toEqual([{ ok: true }]);
    const col = await db.query("SELECT column_default FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'mentoring_available'");
    expect(col.rows[0].column_default).toBe('false');
  });

  test('o banco recusa auto-mentoria, estado inválido e dois vínculos abertos para o mesmo par (em qualquer direção)', async () => {
    const ins = (mentor, mentee, status = 'pending', by = mentee) => db.query(
      'INSERT INTO mentorships (mentor_id, mentee_id, status, requested_by) VALUES ($1, $2, $3, $4)', [mentor, mentee, status, by]);
    await expect(ins(PEOPLE.ana.id, PEOPLE.ana.id)).rejects.toThrow();
    await expect(ins(PEOPLE.bia.id, PEOPLE.ana.id, 'outro')).rejects.toThrow();
    await expect(ins(PEOPLE.bia.id, PEOPLE.ana.id, 'pending', PEOPLE.davi.id)).rejects.toThrow();
    await expect(ins(PEOPLE.bia.id, PEOPLE.ana.id)).resolves.toBeDefined();
    await expect(ins(PEOPLE.bia.id, PEOPLE.ana.id, 'active')).rejects.toThrow();
    await expect(ins(PEOPLE.ana.id, PEOPLE.bia.id)).rejects.toThrow(); // direção invertida
    await db.query("UPDATE mentorships SET status = 'ended'");
    await expect(ins(PEOPLE.bia.id, PEOPLE.ana.id)).resolves.toBeDefined(); // encerrado libera novo pedido
  });
});

describe('autorização de base', () => {
  const ACTIONS = ['apiMentoringOverview', 'apiMentoringListMentors', 'apiMentoringSetAvailability', 'apiMentoringRequest',
    'apiMentoringRespond', 'apiMentoringEnd', 'apiMentoringSetShare', 'apiMentoringGetMenteeProgress'];
  test.each(ACTIONS)('%s: sem sessão válida falha', async (action) => {
    expect((await API_REGISTRY[action](sql, env, ['token-invalido', {}])).success).toBe(false);
  });
  test.each(ACTIONS)('%s: visitante é recusado', async (action) => {
    expect((await call(action, 'visitante', { mentorId: PEOPLE.bia.id, id: GHOST })).success).toBe(false);
  });
});

describe('flag desligada', () => {
  beforeEach(async () => {
    await db.query("UPDATE feature_flags SET enabled = false WHERE key = 'mentoring_enabled'");
    __resetFlagCacheForTests();
  });
  test('leituras devolvem vazio e escritas recusam, sem gravar', async () => {
    expect(await call('apiMentoringOverview', 'ana')).toMatchObject({ success: true, enabled: false, asMentee: [], asMentor: [] });
    expect(await call('apiMentoringListMentors', 'ana')).toMatchObject({ success: true, enabled: false, mentors: [] });
    expect((await pedir('ana', 'bia')).success).toBe(false);
    expect((await call('apiMentoringSetAvailability', 'ana', { available: true })).success).toBe(false);
    expect((await db.query('SELECT count(*)::int AS n FROM mentorships')).rows[0].n).toBe(0);
    expect((await db.query("SELECT mentoring_available FROM profiles WHERE id = $1", [PEOPLE.ana.id])).rows[0].mentoring_available).toBe(false);
  });
});

describe('mentores disponíveis', () => {
  test('lista quem tem o cargo mentor ou ligou a disponibilidade, sem a própria pessoa', async () => {
    const res = await call('apiMentoringListMentors', 'ana');
    expect(res.success).toBe(true);
    expect(res.mentors.map((m) => m.id).sort()).toEqual([PEOPLE.bia.id, PEOPLE.caio.id].sort());
    expect(Object.keys(res.mentors[0]).sort()).toEqual(['avatarUrl', 'fullName', 'id', 'linkStatus', 'username']);
    const propria = await call('apiMentoringListMentors', 'bia');
    expect(propria.mentors.map((m) => m.id)).toEqual([PEOPLE.caio.id]);
  });

  test('alternar a disponibilidade inclui e retira a pessoa da lista, com auditoria', async () => {
    expect((await call('apiMentoringSetAvailability', 'eva', { available: true })).available).toBe(true);
    expect((await call('apiMentoringListMentors', 'ana')).mentors.map((m) => m.id)).toContain(PEOPLE.eva.id);
    await call('apiMentoringSetAvailability', 'eva', { available: false });
    expect((await call('apiMentoringListMentors', 'ana')).mentors.map((m) => m.id)).not.toContain(PEOPLE.eva.id);
    const audit = await db.query("SELECT action FROM audit_logs WHERE action LIKE 'MENTORING_AVAILABLE%' ORDER BY created_at");
    expect(audit.rows.map((r) => r.action)).toEqual(['MENTORING_AVAILABLE_ON', 'MENTORING_AVAILABLE_OFF']);
    expect((await call('apiMentoringSetAvailability', 'eva', { available: 'sim' })).success).toBe(false);
  });

  test('bloqueio entre as partes tira o mentor da lista e impede o pedido', async () => {
    await db.query('INSERT INTO profile_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [PEOPLE.bia.id, PEOPLE.ana.id]);
    expect((await call('apiMentoringListMentors', 'ana')).mentors.map((m) => m.id)).not.toContain(PEOPLE.bia.id);
    expect((await pedir('ana', 'bia')).success).toBe(false);
  });

  test('conta banida não aparece e não recebe pedido', async () => {
    await db.query("UPDATE profiles SET status = 'banned' WHERE id = $1", [PEOPLE.caio.id]);
    try {
      expect((await call('apiMentoringListMentors', 'ana')).mentors.map((m) => m.id)).not.toContain(PEOPLE.caio.id);
      expect((await pedir('ana', 'caio')).success).toBe(false);
    } finally {
      await db.query("UPDATE profiles SET status = 'active' WHERE id = $1", [PEOPLE.caio.id]);
    }
  });
});

describe('pedido de mentoria', () => {
  test('cria o vínculo pendente, audita e aparece para as duas partes', async () => {
    const res = await pedir('ana', 'bia');
    expect(res).toMatchObject({ success: true });
    const row = (await db.query('SELECT * FROM mentorships WHERE id = $1', [res.id])).rows[0];
    expect(row).toMatchObject({ mentor_id: PEOPLE.bia.id, mentee_id: PEOPLE.ana.id, status: 'pending', requested_by: PEOPLE.ana.id, share_progress: false });
    const ana = await call('apiMentoringOverview', 'ana');
    expect(ana.asMentee).toHaveLength(1);
    expect(ana.asMentee[0]).toMatchObject({ id: res.id, myRole: 'mentee', status: 'pending', requestedByMe: true, connected: false });
    expect(ana.asMentee[0].peer.id).toBe(PEOPLE.bia.id);
    const bia = await call('apiMentoringOverview', 'bia');
    expect(bia).toMatchObject({ hasMentorRole: true });
    expect(bia.asMentor).toHaveLength(1);
    expect(bia.asMentor[0]).toMatchObject({ myRole: 'mentor', status: 'pending', requestedByMe: false });
    expect((await db.query("SELECT 1 FROM audit_logs WHERE action = 'MENTORING_REQUEST' AND actor_id = $1", [PEOPLE.ana.id])).rows).toHaveLength(1);
  });

  test('auto-mentoria é recusada, com mensagem e sem gravar', async () => {
    const res = await call('apiMentoringRequest', 'bia', { mentorId: PEOPLE.bia.id });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/si mesmo/);
    expect((await db.query('SELECT count(*)::int AS n FROM mentorships')).rows[0].n).toBe(0);
  });

  test('pedir a quem não se oferece, a id inexistente ou inválido é recusado sem distinguir o motivo', async () => {
    const naoOferece = await pedir('ana', 'eva');
    const fantasma = await call('apiMentoringRequest', 'ana', { mentorId: GHOST });
    expect(naoOferece.success).toBe(false);
    expect(naoOferece.message).toBe(fantasma.message);
    expect((await call('apiMentoringRequest', 'ana', { mentorId: 'x' })).success).toBe(false);
    expect((await call('apiMentoringRequest', 'ana', {})).success).toBe(false);
  });

  test('o administrador também pode ser mentorado', async () => {
    expect((await pedir('admin', 'bia')).success).toBe(true);
  });

  test('segundo pedido para o mesmo par (em qualquer direção) é recusado', async () => {
    expect((await pedir('ana', 'bia')).success).toBe(true);
    expect((await pedir('ana', 'bia')).success).toBe(false);
    await call('apiMentoringSetAvailability', 'ana', { available: true });
    expect((await pedir('bia', 'ana')).success).toBe(false); // direção invertida
  });

  test('tetos: pedidos pendentes e mentores ativos por pessoa', async () => {
    const extras = [];
    for (let i = 0; i < 5; i += 1) {
      const id = '9' + i + '999999-9999-4999-8999-999999999999';
      await db.query(
        `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username, mentoring_available)
         VALUES ($1, $2, $3, 'x', '11999990000', 'member', 'active', now(), $4, true)`, [id, 'Mentor extra ' + i, 'extra' + i + '@example.com', 'extra' + i]);
      extras.push(id);
    }
    try {
      for (let i = 0; i < 5; i += 1) expect((await call('apiMentoringRequest', 'ana', { mentorId: extras[i] })).success).toBe(true);
      const sexto = await pedir('ana', 'bia');
      expect(sexto.success).toBe(false);
      expect(sexto.message).toMatch(/5 pedidos/);
    } finally {
      await db.query('DELETE FROM mentorships');
      for (const id of extras) await db.query('DELETE FROM profiles WHERE id = $1', [id]);
    }
  });

  test('recusa recente impede novo pedido ao mesmo mentor até o fim do prazo', async () => {
    const id = await vinculo('ana', 'bia', { aceitar: false });
    await call('apiMentoringRespond', 'bia', { id, accept: false });
    const de_novo = await pedir('ana', 'bia');
    expect(de_novo.success).toBe(false);
    await db.query("UPDATE mentorships SET updated_at = now() - interval '15 days'");
    expect((await pedir('ana', 'bia')).success).toBe(true);
  });
});

describe('aceitar, recusar e encerrar', () => {
  test('o mentor aceita; o vínculo fica ativo e a auditoria registra', async () => {
    const id = await vinculo('ana', 'bia');
    expect((await db.query('SELECT status FROM mentorships WHERE id = $1', [id])).rows[0].status).toBe('active');
    expect((await db.query("SELECT 1 FROM audit_logs WHERE action = 'MENTORING_ACCEPT'")).rows).toHaveLength(1);
  });

  test('mentor por disponibilidade aceita; sem cargo e sem disponibilidade, não', async () => {
    const id = await vinculo('ana', 'caio');
    expect((await db.query('SELECT status FROM mentorships WHERE id = $1', [id])).rows[0].status).toBe('active');
    const outro = await vinculo('davi', 'caio', { aceitar: false });
    await db.query('UPDATE profiles SET mentoring_available = false WHERE id = $1', [PEOPLE.caio.id]);
    try {
      const res = await call('apiMentoringRespond', 'caio', { id: outro, accept: true });
      expect(res.success).toBe(false);
      expect((await call('apiMentoringRespond', 'caio', { id: outro, accept: false })).success).toBe(true); // recusar sempre pode
    } finally {
      await db.query('UPDATE profiles SET mentoring_available = true WHERE id = $1', [PEOPLE.caio.id]);
    }
  });

  test('recusar zera o compartilhamento e fecha o pedido', async () => {
    const id = await vinculo('ana', 'bia', { aceitar: false, share: true });
    expect((await call('apiMentoringRespond', 'bia', { id, accept: false })).success).toBe(true);
    expect((await db.query('SELECT status, share_progress FROM mentorships WHERE id = $1', [id])).rows[0]).toEqual({ status: 'declined', share_progress: false });
    expect((await call('apiMentoringRespond', 'bia', { id, accept: true })).success).toBe(false); // já respondido
  });

  test('a pessoa mentorada não aceita o próprio pedido', async () => {
    const id = await vinculo('ana', 'bia', { aceitar: false });
    expect((await call('apiMentoringRespond', 'ana', { id, accept: true })).success).toBe(false);
    expect((await db.query('SELECT status FROM mentorships WHERE id = $1', [id])).rows[0].status).toBe('pending');
  });

  test('qualquer parte encerra o vínculo ativo e o compartilhamento é desligado', async () => {
    const id = await vinculo('ana', 'bia', { share: true });
    expect((await call('apiMentoringEnd', 'bia', { id })).success).toBe(true);
    expect((await db.query('SELECT status, share_progress FROM mentorships WHERE id = $1', [id])).rows[0]).toEqual({ status: 'ended', share_progress: false });
    const outro = await vinculo('ana', 'bia');
    expect((await call('apiMentoringEnd', 'ana', { id: outro })).success).toBe(true);
  });

  test('quem pediu cancela o pedido pendente; o mentor não "encerra" pedido pendente (recusa)', async () => {
    const id = await vinculo('ana', 'bia', { aceitar: false });
    expect((await call('apiMentoringEnd', 'bia', { id })).success).toBe(false);
    expect((await call('apiMentoringEnd', 'ana', { id })).success).toBe(true);
    expect((await pedir('ana', 'bia')).success).toBe(true); // vínculo encerrado libera novo pedido
  });

  test('encerrar de novo ou com id inexistente dá a mesma resposta de "não encontrado"', async () => {
    const id = await vinculo('ana', 'bia');
    await call('apiMentoringEnd', 'ana', { id });
    const repetido = await call('apiMentoringEnd', 'ana', { id });
    const fantasma = await call('apiMentoringEnd', 'ana', { id: GHOST });
    expect(repetido.success).toBe(false);
    expect(repetido.message).toBe(fantasma.message);
  });
});

describe('escalada: quem não é parte do vínculo não lê nem altera nada', () => {
  test.each([
    ['apiMentoringRespond', { accept: true }],
    ['apiMentoringRespond', { accept: false }],
    ['apiMentoringEnd', {}],
    ['apiMentoringSetShare', { share: true }],
    ['apiMentoringGetMenteeProgress', {}],
  ])('%s por um terceiro é recusado e o vínculo não muda', async (action, extra) => {
    const id = await vinculo('ana', 'bia', { share: true });
    const antes = (await db.query('SELECT status, share_progress FROM mentorships WHERE id = $1', [id])).rows[0];
    for (const intruso of ['davi', 'eva', 'caio', 'admin']) {
      const res = await call(action, intruso, { id, ...extra });
      expect(res.success).toBe(false);
      expect(JSON.stringify(res)).not.toMatch(/accuracyPct|modules|Pessoa ana|Pessoa bia/);
    }
    expect((await db.query('SELECT status, share_progress FROM mentorships WHERE id = $1', [id])).rows[0]).toEqual(antes);
  });

  test('o outro lado também não faz o que é do papel oposto', async () => {
    const id = await vinculo('ana', 'bia', { share: true });
    expect((await call('apiMentoringSetShare', 'bia', { id, share: false })).success).toBe(false); // só a pessoa mentorada decide
    expect((await call('apiMentoringGetMenteeProgress', 'ana', { id })).success).toBe(false); // a mentorada não lê "como mentor"
    expect((await db.query('SELECT share_progress FROM mentorships WHERE id = $1', [id])).rows[0].share_progress).toBe(true);
  });

  test('a visão geral e a listagem de terceiros não vazam vínculos alheios', async () => {
    await vinculo('ana', 'bia');
    const davi = await call('apiMentoringOverview', 'davi');
    expect(davi.asMentee).toEqual([]);
    expect(davi.asMentor).toEqual([]);
    const caio = await call('apiMentoringOverview', 'caio');
    expect(JSON.stringify(caio)).not.toContain(PEOPLE.ana.id);
  });

  test('o mesmo "não encontrado" para vínculo inexistente e vínculo alheio', async () => {
    const id = await vinculo('ana', 'bia', { share: true });
    const alheio = await call('apiMentoringGetMenteeProgress', 'davi', { id });
    const fantasma = await call('apiMentoringGetMenteeProgress', 'davi', { id: GHOST });
    expect(alheio.message).toBe(fantasma.message);
  });
});

describe('resumo de progresso (apiMentoringGetMenteeProgress)', () => {
  test('mentor sem share_progress não recebe progresso', async () => {
    await estudar('ana', [['farmacologia', 'quiz_estudo', 8, 10]]);
    const id = await vinculo('ana', 'bia', { share: false });
    const res = await call('apiMentoringGetMenteeProgress', 'bia', { id });
    expect(res.success).toBe(false);
    expect(res.summary).toBeUndefined();
    expect(JSON.stringify(res)).not.toMatch(/accuracyPct|farmacologia/);
  });

  test('com vínculo ativo e share_progress, devolve só o resumo agregado', async () => {
    await estudar('ana', [['farmacologia', 'quiz_estudo', 8, 10], ['farmacologia', 'quiz_prova', 6, 10], ['toxicologia', 'quiz_estudo', 5, 10]]);
    const id = await vinculo('ana', 'bia', { share: true });
    const res = await call('apiMentoringGetMenteeProgress', 'bia', { id });
    expect(res.success).toBe(true);
    expect(Object.keys(res).sort()).toEqual(['success', 'summary']);
    expect(Object.keys(res.summary).sort()).toEqual(['accuracyPct', 'modules', 'questionsAnswered', 'streak', 'totalActivities']);
    expect(res.summary).toMatchObject({ questionsAnswered: 30, totalActivities: 3, accuracyPct: 63 });
    expect(res.summary.modules.find((m) => m.module === 'farmacologia')).toEqual({ module: 'farmacologia', attempts: 2, accuracyPct: 70 });
    expect(res.summary.modules.find((m) => m.module === 'anatomia')).toEqual({ module: 'anatomia', attempts: 0, accuracyPct: null });
    expect(res.summary.streak.current).toBeGreaterThanOrEqual(1);
    const texto = JSON.stringify(res);
    expect(texto).not.toContain(PEOPLE.ana.id);
    expect(texto).not.toContain('Pessoa ana');
    expect(texto).not.toContain('ana@example.com');
  });

  test('a pessoa mentorada desliga o compartilhamento e o acesso cessa na hora', async () => {
    await estudar('ana', [['farmacologia', 'quiz_estudo', 8, 10]]);
    const id = await vinculo('ana', 'bia', { share: true });
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id })).success).toBe(true);
    expect((await call('apiMentoringSetShare', 'ana', { id, share: false })).success).toBe(true);
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id })).success).toBe(false);
    expect((await call('apiMentoringSetShare', 'ana', { id, share: true })).shareProgress).toBe(true);
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id })).success).toBe(true);
  });

  test('vínculo pendente, recusado ou encerrado não dá progresso, mesmo com a marca ligada', async () => {
    await estudar('ana', [['farmacologia', 'quiz_estudo', 8, 10]]);
    const pendente = await vinculo('ana', 'bia', { aceitar: false, share: true });
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id: pendente })).success).toBe(false);
    await call('apiMentoringRespond', 'bia', { id: pendente, accept: true });
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id: pendente })).success).toBe(true);
    await call('apiMentoringEnd', 'ana', { id: pendente });
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id: pendente })).success).toBe(false);
    await db.query("UPDATE mentorships SET status = 'active', share_progress = true WHERE id = $1", [pendente]);
    await db.query("UPDATE mentorships SET status = 'declined' WHERE id = $1", [pendente]);
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id: pendente })).success).toBe(false);
  });

  test('summarize ignora campos extras (insígnias, última atividade) e tolera entradas vazias', () => {
    const out = summarize({ accuracyPct: 50, questionsAnswered: 4, totalActivities: 2, badges: [{ id: 'x' }], byModule: { clinica: { attempts: 1, accuracyPct: 50 } } },
      { streak: { current: 2, best: 5, activeToday: true }, last: { module: 'clinica' } });
    expect(JSON.stringify(out)).not.toMatch(/badges|last|activeToday/);
    expect(out.streak).toEqual({ current: 2, best: 5 });
    expect(summarize(null, null).modules).toHaveLength(5);
  });
});

describe('conversa pelo chat cifrado', () => {
  const pair = async () => (await db.query('SELECT requester_id, addressee_id, status, requested_via FROM connections')).rows;
  const limpar = async () => { await db.query('DELETE FROM connections'); await db.query('DELETE FROM mentorships'); };

  test('aceitar cria a conexão aceita (mentorado -> mentor) e libera "connected"', async () => {
    await limpar();
    const id = await vinculo('ana', 'bia');
    expect(await pair()).toEqual([{ requester_id: PEOPLE.ana.id, addressee_id: PEOPLE.bia.id, status: 'accepted', requested_via: 'username' }]);
    expect((await call('apiMentoringOverview', 'ana')).asMentee[0]).toMatchObject({ id, connected: true });
    expect((await call('apiMentoringOverview', 'bia')).asMentor[0].connected).toBe(true);
  });

  test('pedido pendente não cria conexão; recusar também não', async () => {
    await limpar();
    const id = await vinculo('ana', 'bia', { aceitar: false });
    expect(await pair()).toEqual([]);
    await call('apiMentoringRespond', 'bia', { id, accept: false });
    expect(await pair()).toEqual([]);
  });

  test('bloqueio em qualquer direção impede a criação, mas o aceite segue', async () => {
    for (const [blocker, blocked] of [['ana', 'bia'], ['bia', 'ana']]) {
      await limpar();
      const res = await pedir('ana', 'bia');
      await db.query('INSERT INTO profile_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [PEOPLE[blocker].id, PEOPLE[blocked].id]);
      expect((await call('apiMentoringRespond', 'bia', { id: res.id, accept: true })).success).toBe(true);
      expect(await pair()).toEqual([]);
      await db.query('DELETE FROM profile_blocks');
    }
  });

  test('conexão pendente (em qualquer direção) vira aceita, sem duplicar', async () => {
    await limpar();
    await db.query("INSERT INTO connections (requester_id, addressee_id, status, requested_via) VALUES ($1, $2, 'pending', 'phone')", [PEOPLE.bia.id, PEOPLE.ana.id]);
    await vinculo('ana', 'bia');
    expect(await pair()).toEqual([{ requester_id: PEOPLE.bia.id, addressee_id: PEOPLE.ana.id, status: 'accepted', requested_via: 'phone' }]);
  });

  test('conexão recusada: só reabre com o prazo vencido', async () => {
    await limpar();
    await db.query("INSERT INTO connections (requester_id, addressee_id, status, requested_via, declined_until) VALUES ($1, $2, 'declined', 'username', now() + interval '3 days')", [PEOPLE.bia.id, PEOPLE.ana.id]);
    await vinculo('ana', 'bia');
    expect((await pair())[0].status).toBe('declined');
    await db.query('DELETE FROM mentorships');
    await db.query('DELETE FROM connections');
    await db.query("INSERT INTO connections (requester_id, addressee_id, status, requested_via, declined_until) VALUES ($1, $2, 'declined', 'username', now() - interval '1 day')", [PEOPLE.bia.id, PEOPLE.ana.id]);
    await vinculo('ana', 'bia');
    expect((await pair())[0].status).toBe('accepted');
  });

  test('encerrar a mentoria não apaga a conexão', async () => {
    await limpar();
    const id = await vinculo('ana', 'bia');
    expect((await call('apiMentoringEnd', 'ana', { id })).success).toBe(true);
    expect(await pair()).toHaveLength(1);
    expect((await pair())[0].status).toBe('accepted');
  });

  test('idempotência: aceitar duas vezes (ou em novo vínculo) mantém uma só conexão', async () => {
    await limpar();
    const id = await vinculo('ana', 'bia');
    expect((await call('apiMentoringRespond', 'bia', { id, accept: true })).success).toBe(false);
    await call('apiMentoringEnd', 'ana', { id });
    await vinculo('ana', 'bia');
    expect(await pair()).toHaveLength(1);
  });
});

describe('limite de escrita', () => {
  test('passado o teto por hora, a escrita é recusada com mensagem própria', async () => {
    let ultimo;
    for (let i = 0; i < 31; i += 1) ultimo = await call('apiMentoringSetAvailability', 'eva', { available: i % 2 === 0 });
    expect(ultimo.success).toBe(false);
    expect(ultimo.message).toMatch(/limite/);
  });
});

describe('degradação sem a migração 039', () => {
  beforeEach(async () => { await db.exec('ALTER TABLE mentorships RENAME TO mentorships_off'); });
  afterEach(async () => { await db.exec('ALTER TABLE mentorships_off RENAME TO mentorships'); });

  test('leitura devolve vazio, sem erro', async () => {
    expect(await call('apiMentoringOverview', 'ana')).toMatchObject({ success: true, enabled: true, asMentee: [], asMentor: [], tableMissing: true });
    expect(await call('apiMentoringListMentors', 'ana')).toMatchObject({ success: true, mentors: [] });
  });

  test('escrita recusa com mensagem clara, sem vazar detalhe do banco', async () => {
    for (const res of [
      await pedir('ana', 'bia'),
      await call('apiMentoringEnd', 'ana', { id: GHOST }),
      await call('apiMentoringSetShare', 'ana', { id: GHOST, share: true }),
      await call('apiMentoringRespond', 'bia', { id: GHOST, accept: false }),
    ]) {
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/pendente/);
      expect(res.message).not.toMatch(/relation|mentorships|42P01/);
    }
    expect((await call('apiMentoringGetMenteeProgress', 'bia', { id: GHOST })).success).toBe(false);
  });
});
