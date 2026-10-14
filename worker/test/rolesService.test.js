/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * rolesService.test.js — cargos funcionais de ponta a ponta (PGlite com todas as migrações, handlers reais):
 * sessão com cargos e capacidades, requireCapability, concessão e retirada só pelo admin com reautenticação,
 * recusa de cargo privilegiado sem MFA, idempotência, auditoria, listagem e o portão de MFA para cargos.
 */
import { API_REGISTRY } from '../src/handlers.js';
import * as RolesService from '../src/services/rolesService.js';
import * as S from '../src/security.js';
import { CAPABILITIES } from '../src/roles/capabilities.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';

const PASSWORD = 'senha-de-teste-123';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const VISITOR = '33333333-3333-4333-8333-333333333333';
const MFA_MEMBER = '44444444-4444-4444-8444-444444444444';
const GESTOR = '55555555-5555-4555-8555-555555555555';
const REVISOR = '66666666-6666-4666-8666-666666666666';
const MODERADOR = '77777777-7777-4777-8777-777777777777';
const CURADOR = '88888888-8888-4888-8888-888888888888';
const MISSING = '99999999-9999-4999-8999-999999999999';

let db;
let sql;
const env = makeEnv();
const tokens = {};

async function addProfile(id, name, role) {
  await db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, $2, $3, crypt($4, gen_salt('bf', 4)), '11999990000', $5, 'active', now(), $6)`,
    [id, 'Pessoa ' + name, name + '@example.com', PASSWORD, role, name]
  );
  tokens[id] = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, id, 'jest');
}
const enrollMfa = (id) => db.query(
  "INSERT INTO mfa_credentials (profile_id, secret_enc, confirmed_at) VALUES ($1, 'v1.a.b', now()) ON CONFLICT DO NOTHING", [id]
);
const giveRole = (id, role) => db.query('INSERT INTO member_roles (profile_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, role]);
const rolesOf = async (id) => (await db.query('SELECT role FROM member_roles WHERE profile_id = $1 ORDER BY role', [id])).rows.map((r) => r.role);
const audits = async (action) => (await db.query('SELECT actor_id, target_id, target_type, details FROM audit_logs WHERE action = $1 ORDER BY created_at', [action])).rows;
const setMfaRequired = async (on) => {
  await db.query("UPDATE feature_flags SET enabled = $1 WHERE key = 'mfa_required'", [on]);
  __resetFlagCacheForTests();
};
const call = (name, actor, input) => API_REGISTRY[name](sql, env, [tokens[actor], input]);
const stepUp = (extra) => Object.assign({ password: PASSWORD }, extra);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await addProfile(ADMIN, 'admin', 'admin');
  await addProfile(MEMBER, 'membro', 'member');
  await addProfile(VISITOR, 'visitante', 'visitor');
  await addProfile(MFA_MEMBER, 'membromfa', 'member');
  await enrollMfa(MFA_MEMBER);
  const staff = [[GESTOR, 'gestor'], [REVISOR, 'revisor_conteudo'], [MODERADOR, 'moderador'], [CURADOR, 'curador']];
  for (const [id, role] of staff) {
    await addProfile(id, role, 'member');
    await enrollMfa(id);
    await giveRole(id, role);
  }
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.query('DELETE FROM rate_limit_buckets');
  __resetFlagCacheForTests();
});

describe('sessão com cargos e capacidades', () => {
  test('requireSession traz os cargos e as capacidades no mesmo SELECT', async () => {
    const identity = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[GESTOR]);
    expect(identity.functionalRoles).toEqual(['gestor']);
    expect(identity.capabilities).toEqual(expect.arrayContaining(['events.manage', 'orgchart.edit']));
    expect(identity.capabilities).not.toContain('flags');
  });

  test('membro sem cargo: listas vazias; admin: todas as capacidades', async () => {
    const member = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[MEMBER]);
    expect(member).toMatchObject({ functionalRoles: [], capabilities: [] });
    const admin = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[ADMIN]);
    expect([...admin.capabilities].sort()).toEqual([...CAPABILITIES].sort());
  });

  test('visitante com cargo gravado no banco (antigo membro) não ganha capacidade', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await addProfile(id, 'exmembro', 'member');
    await giveRole(id, 'gestor');
    await db.query("UPDATE profiles SET role = 'visitor' WHERE id = $1", [id]);
    const identity = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[id]);
    expect(identity.capabilities).toEqual([]);
  });

  test('resolveSession (sessão opcional) também traz os cargos', async () => {
    const identity = await S.resolveSession(sql, env.SESSION_TOKEN_PEPPER, tokens[CURADOR]);
    expect(identity).toMatchObject({ functionalRoles: ['curador'], capabilities: ['library.curate'] });
  });

  test('apiGetMyProfile devolve functionalRoles e capabilities ao próprio usuário', async () => {
    const res = await API_REGISTRY.apiGetMyProfile(sql, env, [tokens[MODERADOR]]);
    expect(res.success).toBe(true);
    expect(res.profile).toMatchObject({ role: 'member', functionalRoles: ['moderador'], capabilities: ['reports.moderate', 'assistant.feedback.moderate'] });
  });
});

describe('requireCapability', () => {
  test('nega sem a capacidade e permite com ela; admin passa em qualquer uma', async () => {
    const gestor = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[GESTOR]);
    expect(() => S.requireCapability(gestor, 'events.manage')).not.toThrow();
    expect(() => S.requireCapability(gestor, 'library.curate')).toThrow(expect.objectContaining({ name: 'ForbiddenError', expected: true }));
    expect(() => S.requireCapability(gestor, 'roles.grant')).toThrow(expect.objectContaining({ name: 'ForbiddenError' }));
    const admin = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[ADMIN]);
    ['roles.grant', 'flags', 'library.curate'].forEach((cap) => expect(() => S.requireCapability(admin, cap)).not.toThrow());
    expect(() => S.requireCapability(admin, 'capacidade.inexistente')).not.toThrow();
  });

  test('identidade ausente ou forjada sem capacidades é negada', () => {
    expect(() => S.requireCapability(null, 'events.manage')).toThrow(expect.objectContaining({ name: 'ForbiddenError' }));
    expect(() => S.requireCapability({ role: 'member' }, 'events.manage')).toThrow(expect.objectContaining({ name: 'ForbiddenError' }));
  });
});

describe('apiAdminGrantRole / apiAdminRevokeRole — quem pode', () => {
  const blocked = [['gestor', GESTOR], ['revisor_conteudo', REVISOR], ['moderador', MODERADOR], ['curador', CURADOR], ['membro', MEMBER], ['visitante', VISITOR]];

  test.each(blocked)('%s não concede nem retira cargo (nem para si)', async (_label, actor) => {
    for (const target of [MEMBER, actor]) {
      const granted = await call('apiAdminGrantRole', actor, stepUp({ profileId: target, role: 'mentor' }));
      expect(granted).toMatchObject({ success: false, message: 'Acesso não autorizado para este recurso.' });
      const revoked = await call('apiAdminRevokeRole', actor, stepUp({ profileId: target, role: 'mentor' }));
      expect(revoked).toMatchObject({ success: false, message: 'Acesso não autorizado para este recurso.' });
      const listed = await call('apiAdminListRoles', actor, {});
      expect(listed.success).toBe(false);
    }
    expect(await rolesOf(MEMBER)).not.toContain('mentor');
  });

  test('admin sem reautenticação: exige a senha; senha errada é recusada; nada muda', async () => {
    const semSenha = await call('apiAdminGrantRole', ADMIN, { profileId: MEMBER, role: 'mentor' });
    expect(semSenha).toMatchObject({ success: false, message: 'Informe sua senha.' });
    const errada = await call('apiAdminGrantRole', ADMIN, { profileId: MEMBER, role: 'mentor', password: 'outra-senha' });
    expect(errada).toMatchObject({ success: false, message: 'Senha incorreta.' });
    const revogar = await call('apiAdminRevokeRole', ADMIN, { profileId: GESTOR, role: 'gestor' });
    expect(revogar.success).toBe(false);
    expect(await rolesOf(MEMBER)).toEqual([]);
    expect(await rolesOf(GESTOR)).toEqual(['gestor']);
  });
});

describe('apiAdminGrantRole — regras', () => {
  test('admin concede mentor a um membro (sem MFA: mentor não é privilegiado) e audita sem dado sensível', async () => {
    const res = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MEMBER, role: 'mentor' }));
    expect(res).toMatchObject({ success: true, changed: true, profileId: MEMBER, roles: ['mentor'] });
    expect(await rolesOf(MEMBER)).toEqual(['mentor']);
    const log = (await audits('role_granted')).pop();
    expect(log).toMatchObject({ actor_id: ADMIN, target_id: MEMBER, target_type: 'profile', details: { role: 'mentor', changed: true } });
    expect(JSON.stringify(log)).not.toMatch(/@example\.com|senha|password/);
    const granted = await db.query("SELECT granted_by FROM member_roles WHERE profile_id = $1 AND role = 'mentor'", [MEMBER]);
    expect(granted.rows).toEqual([{ granted_by: ADMIN }]);
  });

  test('conceder de novo é idempotente (sucesso, sem linha duplicada)', async () => {
    const res = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MEMBER, role: 'mentor' }));
    expect(res).toMatchObject({ success: true, changed: false, roles: ['mentor'] });
    expect(await rolesOf(MEMBER)).toEqual(['mentor']);
  });

  test.each(['gestor', 'revisor_conteudo', 'moderador', 'curador'])('cargo privilegiado %s é recusado para quem não tem MFA', async (role) => {
    const res = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MEMBER, role }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/precisa ativar a verificação em duas etapas antes/);
    expect(await rolesOf(MEMBER)).toEqual(['mentor']);
  });

  test('com MFA ativo o cargo privilegiado é concedido, e os cargos acumulam', async () => {
    expect((await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MFA_MEMBER, role: 'gestor' }))).success).toBe(true);
    expect((await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MFA_MEMBER, role: 'moderador' }))).success).toBe(true);
    const identity = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[MFA_MEMBER]);
    expect(identity.functionalRoles).toEqual(['gestor', 'moderador']);
    expect(identity.capabilities).toEqual(expect.arrayContaining(['events.manage', 'reports.moderate']));
  });

  test('admin pode se dar um cargo; cargo privilegiado continua exigindo o MFA dele', async () => {
    const mentor = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: ADMIN, role: 'mentor' }));
    expect(mentor).toMatchObject({ success: true, roles: ['mentor'] });
    const curador = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: ADMIN, role: 'curador' }));
    expect(curador.message).toMatch(/precisa ativar a verificação em duas etapas antes/);
  });

  test('admin com MFA ativo: a reautenticação também pede o código', async () => {
    await enrollMfa(ADMIN);
    try {
      const res = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MEMBER, role: 'mentor' }));
      expect(res.success).toBe(false);
      expect(res.changed).toBeUndefined();
    } finally {
      await db.query('DELETE FROM mfa_credentials WHERE profile_id = $1', [ADMIN]);
    }
  });

  test('MFA retirado entre a conferência e a gravação: o INSERT repete a condição e nada é gravado', async () => {
    const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await addProfile(id, 'corrida', 'member');
    await enrollMfa(id);
    let removed = false;
    const racing = async (strings, ...values) => {
      const rows = await sql(strings, ...values);
      if (!removed && strings.join('?').includes('FROM mfa_credentials')) {
        removed = true;
        await db.query('DELETE FROM mfa_credentials WHERE profile_id = $1', [id]);
      }
      return rows;
    };
    const admin = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[ADMIN]);
    await expect(RolesService.grantRole(racing, admin, { profileId: id, role: 'gestor' }, crypto.randomUUID(), { stepUp: async () => {} }))
      .rejects.toMatchObject({ name: 'ConflictError' });
    expect(removed).toBe(true);
    expect(await rolesOf(id)).toEqual([]);
  });

  test('sem a reautenticação do handler a escrita é recusada (falha fechada)', async () => {
    const admin = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[ADMIN]);
    await expect(RolesService.grantRole(sql, admin, { profileId: MEMBER, role: 'mentor' }, crypto.randomUUID()))
      .rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('visitante, pessoa inexistente, id inválido e cargo fora da lista são recusados', async () => {
    expect((await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: VISITOR, role: 'mentor' }))).message).toMatch(/membros e administradores/);
    expect((await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MISSING, role: 'mentor' }))).message).toMatch(/não encontrada/);
    expect((await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: 'abc', role: 'mentor' }))).message).toMatch(/Pessoa inválida/);
    for (const role of ['admin', 'revisor_clinico', '', null, ['gestor']]) {
      expect((await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MEMBER, role }))).message).toMatch(/Cargo inválido/);
    }
    expect(await rolesOf(VISITOR)).toEqual([]);
  });

  test('conta banida não recebe cargo', async () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await addProfile(id, 'banido', 'member');
    await db.query("UPDATE profiles SET status = 'banned' WHERE id = $1", [id]);
    const res = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: id, role: 'mentor' }));
    expect(res.success).toBe(false);
    expect(await rolesOf(id)).toEqual([]);
  });

  test('há limite de escritas por admin (ROLE_ADMIN_WRITE)', async () => {
    let last;
    for (let i = 0; i < 40 && !(last && last.message && /Muitas tentativas/.test(last.message)); i++) {
      await db.query("DELETE FROM rate_limit_buckets WHERE bucket = 'MFA_MANAGE'");
      last = await call('apiAdminGrantRole', ADMIN, stepUp({ profileId: MEMBER, role: 'mentor' }));
    }
    expect(last.message).toMatch(/Muitas tentativas/);
  });
});

describe('apiAdminRevokeRole', () => {
  test('retira o cargo (sem cargo = só o papel base), audita, e retirar de novo é idempotente', async () => {
    const res = await call('apiAdminRevokeRole', ADMIN, stepUp({ profileId: MEMBER, role: 'mentor' }));
    expect(res).toMatchObject({ success: true, changed: true, roles: [] });
    const identity = await S.requireSession(sql, env.SESSION_TOKEN_PEPPER, tokens[MEMBER]);
    expect(identity).toMatchObject({ role: 'member', functionalRoles: [], capabilities: [] });
    expect((await audits('role_revoked')).pop()).toMatchObject({ actor_id: ADMIN, target_id: MEMBER, details: { role: 'mentor', changed: true } });
    const again = await call('apiAdminRevokeRole', ADMIN, stepUp({ profileId: MEMBER, role: 'mentor' }));
    expect(again).toMatchObject({ success: true, changed: false });
  });

  test('retirar vale mesmo para quem virou visitante', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await addProfile(id, 'rebaixado', 'member');
    await giveRole(id, 'mentor');
    await db.query("UPDATE profiles SET role = 'visitor' WHERE id = $1", [id]);
    const res = await call('apiAdminRevokeRole', ADMIN, stepUp({ profileId: id, role: 'mentor' }));
    expect(res).toMatchObject({ success: true, changed: true });
    expect(await rolesOf(id)).toEqual([]);
  });
});

describe('apiAdminListRoles', () => {
  test('lista por pessoa e geral, sem e-mail', async () => {
    const one = await call('apiAdminListRoles', ADMIN, { profileId: GESTOR });
    expect(one).toMatchObject({ success: true, profileId: GESTOR, roles: ['gestor'] });
    const all = await call('apiAdminListRoles', ADMIN, {});
    expect(all.success).toBe(true);
    expect(all.people).toEqual(expect.arrayContaining([
      expect.objectContaining({ profileId: CURADOR, fullName: 'Pessoa curador', roles: ['curador'] }),
    ]));
    expect(JSON.stringify(all)).not.toMatch(/@example\.com/);
    expect((await call('apiAdminListRoles', ADMIN, { profileId: 'x' })).message).toMatch(/Pessoa inválida/);
  });
});

describe('MFA para cargos privilegiados (flag mfa_required)', () => {
  afterEach(() => setMfaRequired(false));

  test('cargo privilegiado que perdeu o MFA é barrado pelo portão; mentor sozinho não', async () => {
    const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await addProfile(id, 'semmfa', 'member');
    await giveRole(id, 'moderador');
    await setMfaRequired(true);
    const barred = await API_REGISTRY.apiGetMyMetrics(sql, env, [tokens[id]]);
    expect(barred).toMatchObject({ success: false, mfaSetupRequired: true });
    expect((await API_REGISTRY.apiMfaStatus(sql, env, [tokens[id]])).required).toBe(true);
    await db.query("UPDATE member_roles SET role = 'mentor' WHERE profile_id = $1", [id]);
    const free = await API_REGISTRY.apiGetMyMetrics(sql, env, [tokens[id]]);
    expect(free.mfaSetupRequired).toBeUndefined();
    expect((await API_REGISTRY.apiMfaStatus(sql, env, [tokens[id]])).required).toBe(false);
  });

  test('com a flag desligada nada muda para cargos', async () => {
    const id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await addProfile(id, 'flagoff', 'member');
    await giveRole(id, 'gestor');
    const res = await API_REGISTRY.apiGetMyMetrics(sql, env, [tokens[id]]);
    expect(res.mfaSetupRequired).toBeUndefined();
  });

  test('quem tem cargo privilegiado não desliga o MFA com a flag ligada', async () => {
    await setMfaRequired(true);
    const res = await API_REGISTRY.apiMfaDisable(sql, env, [tokens[GESTOR], { password: PASSWORD, code: '000000' }]);
    expect(res).toMatchObject({ success: false });
    expect(res.message).toMatch(/obrigatória/);
  });
});
