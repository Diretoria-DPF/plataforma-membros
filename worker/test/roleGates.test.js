/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * roleGates.test.js — ROL-03: as ações operacionais decidem por capacidade (ADR 0010), com handlers reais e PGlite
 * com todas as migrações. Matriz por ação: admin passa; o cargo certo passa; cargo errado, membro sem cargo e
 * visitante são negados; cargo privilegiado sem MFA é negado com mensagem própria; o resto segue exclusivo do admin.
 * "Passa" = não é barrado pelo portão (a ação pode ainda recusar a entrada vazia do teste).
 */
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';

const FORBIDDEN = 'Acesso não autorizado para este recurso.';
const FAKE_ID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

const PEOPLE = {
  admin: { id: '11111111-1111-4111-8111-111111111111', role: 'admin', mfa: true },
  membro: { id: '22222222-2222-4222-8222-222222222222', role: 'member', mfa: true },
  visitante: { id: '33333333-3333-4333-8333-333333333333', role: 'visitor', mfa: false },
  gestor: { id: '44444444-4444-4444-8444-444444444444', role: 'member', mfa: true, cargo: 'gestor' },
  revisor: { id: '55555555-5555-4555-8555-555555555555', role: 'member', mfa: true, cargo: 'revisor_conteudo' },
  moderador: { id: '66666666-6666-4666-8666-666666666666', role: 'member', mfa: true, cargo: 'moderador' },
  curador: { id: '77777777-7777-4777-8777-777777777777', role: 'member', mfa: true, cargo: 'curador' },
  mentor: { id: '88888888-8888-4888-8888-888888888888', role: 'member', mfa: false, cargo: 'mentor' },
  gestorSemMfa: { id: '99999999-9999-4999-8999-999999999999', role: 'member', mfa: false, cargo: 'gestor' },
};

// Ação -> quem tem a capacidade (além do admin).
const BY_ROLE = {
  gestor: [
    'apiAdminCreateEvent', 'apiAdminUpdateEventStatus', 'apiAdminListAllEvents', 'apiAdminUploadEventImage',
    'apiAdminCreateTask', 'apiAdminUpdateTaskStatus', 'apiAdminListAllTasks',
    'apiAdminAttendanceListEvents', 'apiAdminAttendanceCheckIn', 'apiAdminAttendanceSearch',
    'apiAdminAttendanceExportCsv', 'apiAdminAttendanceBadges',
    'apiAdminListProposalsForReview', 'apiAdminTransitionProposal', 'apiAdminSetLeaguePosition',
  ],
  moderador: [
    'apiAdminListReports', 'apiAdminResolveReport', 'apiAdminAssistantModeration',
    'apiAdminListAssistantFeedback', 'apiAdminUpdateAssistantFeedback', 'apiAdminAssistantStats',
  ],
  revisor: ['apiAdminLearnListPendingCases', 'apiAdminLearnReviewCase'],
  curador: ['apiAdminLearnLibraryListQueue', 'apiAdminLearnLibraryListSuggestions', 'apiAdminLearnLibraryListCollections'],
};

const ADMIN_ONLY = [
  'apiAdminListUsers', 'apiAdminChangeUserRole', 'apiAdminBanUser', 'apiAdminUnbanUser', 'apiAdminResetUserMfa',
  'apiAdminListFeatureFlags', 'apiAdminSetFeatureFlag', 'apiAdminListAuditLogs', 'apiAdminListErrorLogs',
  'apiAdminAiHealth', 'apiAdminAiMetrics', 'apiAdminLearnAtlasTelemetry', 'apiAdminDashboard', 'apiAdminReindexKb',
  'apiAdminListRoles', 'apiAdminGrantRole', 'apiAdminRevokeRole', 'apiAdminLearnLibraryListStaff',
  'apiAdminLearnLibrarySetStaff', 'apiAdminMemoryStats', 'apiAdminPurgeMemberMemory', 'apiAdminAgentsStats',
  'apiAdminListFeedback',
];

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
      [p.id, 'Pessoa ' + name, name.toLowerCase() + '@example.com', p.role, name.toLowerCase()]
    );
    if (p.mfa) await db.query("INSERT INTO mfa_credentials (profile_id, secret_enc, confirmed_at) VALUES ($1, 'v1.a.b', now())", [p.id]);
    // O gatilho da 038 só aceita cargo para membro/admin; a concessão real (rolesService) também exige MFA,
    // então gestorSemMfa simula alguém cujo MFA foi resetado depois de receber o cargo.
    if (p.cargo) await db.query('INSERT INTO member_roles (profile_id, role) VALUES ($1, $2)', [p.id, p.cargo]);
    tokens[name] = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, p.id, 'jest');
  }
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.query('DELETE FROM rate_limit_buckets');
  __resetFlagCacheForTests();
});

const call = (action, who) => API_REGISTRY[action](sql, env, [tokens[who], FAKE_ID, 'x', {}]);
const isBlocked = (res) => !!res && res.success === false && (res.message === FORBIDDEN || res.message === S.CAPABILITY_MFA_MESSAGE);

const ALL_ROLE_ACTIONS = Object.values(BY_ROLE).flat();

describe('ações por capacidade', () => {
  test.each(ALL_ROLE_ACTIONS)('%s: admin passa do portão', async (action) => {
    expect(isBlocked(await call(action, 'admin'))).toBe(false);
  });

  const allowedRows = Object.entries(BY_ROLE).flatMap(([who, actions]) => actions.map((a) => [a, who]));
  test.each(allowedRows)('%s: %s (cargo certo, com MFA) passa', async (action, who) => {
    expect(isBlocked(await call(action, who))).toBe(false);
  });

  const deniedRows = Object.entries(BY_ROLE).flatMap(([owner, actions]) => actions.flatMap((a) =>
    ['membro', 'visitante', 'mentor', ...Object.keys(BY_ROLE).filter((r) => r !== owner)].map((who) => [a, who])));
  test.each(deniedRows)('%s: %s é negado', async (action, who) => {
    expect(await call(action, who)).toMatchObject({ success: false, message: FORBIDDEN });
  });
});

describe('cargo privilegiado sem MFA ativo', () => {
  test.each(BY_ROLE.gestor)('%s: gestor sem MFA é negado com a mensagem do MFA (flag desligada)', async (action) => {
    expect(await call(action, 'gestorSemMfa')).toMatchObject({ success: false, message: S.CAPABILITY_MFA_MESSAGE, code: 'role_mfa_required' });
  });

  test('a sessão sabe se o autenticador está confirmado', async () => {
    const semMfa = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens.gestorSemMfa);
    const comMfa = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens.gestor);
    expect(semMfa.mfaConfirmed).toBe(false);
    expect(comMfa.mfaConfirmed).toBe(true);
    expect(S.hasCapability(semMfa, 'events.manage')).toBe(false);
    expect(S.hasCapability(comMfa, 'events.manage')).toBe(true);
  });

  test('o perfil avisa que as funções do cargo esperam o MFA', async () => {
    const pending = await API_REGISTRY.apiGetMyProfile(sql, env, [tokens.gestorSemMfa]);
    const ok = await API_REGISTRY.apiGetMyProfile(sql, env, [tokens.gestor]);
    const mentor = await API_REGISTRY.apiGetMyProfile(sql, env, [tokens.mentor]);
    expect(pending.profile.roleMfaPending).toBe(true);
    expect(ok.profile.roleMfaPending).toBe(false);
    expect(mentor.profile.roleMfaPending).toBe(false);
  });

  test('com mfa_required ligada o login avisa quem tem cargo privilegiado e não tem MFA', async () => {
    await db.query("UPDATE feature_flags SET enabled = true WHERE key = 'mfa_required'");
    __resetFlagCacheForTests();
    try {
      await db.query("UPDATE profiles SET password_hash = crypt('senha-de-teste-123', gen_salt('bf', 4)) WHERE id = ANY($1)",
        [[PEOPLE.gestorSemMfa.id, PEOPLE.mentor.id]]);
      const gestor = await API_REGISTRY.apiLogin(sql, env, ['gestorsemmfa@example.com', 'senha-de-teste-123']);
      expect(gestor).toMatchObject({ success: true, mfaSetupRequired: true });
      const mentor = await API_REGISTRY.apiLogin(sql, env, ['mentor@example.com', 'senha-de-teste-123']);
      expect(mentor.success).toBe(true);
      expect(mentor.mfaSetupRequired).toBeUndefined();
    } finally {
      await db.query("UPDATE feature_flags SET enabled = false WHERE key = 'mfa_required'");
      __resetFlagCacheForTests();
    }
  });
});

describe('exclusivas do admin', () => {
  const rows = ADMIN_ONLY.flatMap((a) => ['gestor', 'revisor', 'moderador', 'curador', 'membro', 'visitante'].map((who) => [a, who]));
  test.each(rows)('%s: %s é negado', async (action, who) => {
    const res = await call(action, who);
    expect(res.success).toBe(false);
    expect(res.mfaSetupRequired).toBeUndefined();
  });
});

describe('Biblioteca: compat com library_staff', () => {
  test('curador da library_staff sem cargo funcional continua curando', async () => {
    await db.query("INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador') ON CONFLICT DO NOTHING", [PEOPLE.membro.id]);
    try {
      expect(isBlocked(await call('apiAdminLearnLibraryListQueue', 'membro'))).toBe(false);
    } finally {
      await db.query('DELETE FROM library_staff WHERE profile_id = $1', [PEOPLE.membro.id]);
    }
  });

  test('cargo curador sem MFA não cura', async () => {
    await db.query("INSERT INTO member_roles (profile_id, role) VALUES ($1, 'curador')", [PEOPLE.gestorSemMfa.id]);
    try {
      const res = await call('apiAdminLearnLibraryListQueue', 'gestorSemMfa');
      expect(res.success).toBe(false);
    } finally {
      await db.query("DELETE FROM member_roles WHERE profile_id = $1 AND role = 'curador'", [PEOPLE.gestorSemMfa.id]);
    }
  });
});
