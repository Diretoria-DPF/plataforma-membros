/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O portão da obrigatoriedade de MFA no nível dos HANDLERS: com `mfa_required`
// ligada, um admin sem autenticador só alcança as ações de cadastro do MFA.
// O teste percorre o API_REGISTRY inteiro, então uma action nova com sessão
// nasce protegida — e quem remover o portão de uma delas quebra a suíte.
import { API_REGISTRY } from '../src/handlers.js';
import { describeActions } from '../src/openapi.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql, callsMatching } from './helpers/aiTestUtils.js';

const PID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'token-de-sessao-de-teste';

// Ações que chegam a esta camada SEM passar pelo portão, por decisão:
//  - cadastro do MFA e leitura do próprio perfil (precisam funcionar para o admin se cadastrar);
//  - sessão opcional / encerrar sessão (não devolvem dado de administração).
const OPEN_FOR_SETUP = ['apiMfaStatus', 'apiMfaBeginEnrollment', 'apiMfaConfirmEnrollment', 'apiGetMyProfile'];
const OPTIONAL_SESSION = ['apiLogout', 'apiTouchSession', 'apiListEvents', 'apiGetFeatureFlags', 'apiAssistantChat'];

function world({ role = 'admin', flagEnabled = true, enrolled = false } = {}) {
  return routedSql([
    ['FROM sessions s', [{ profile_id: PID, role, status: 'active', full_name: 'Ana', email: 'ana@exemplo.com', email_confirmed_at: '2026-01-01' }]],
    ['FROM feature_flags', [{ key: 'mfa_required', enabled: flagEnabled, rollout_pct: 100, conditions: {} }]],
    ['FROM mfa_credentials', enrolled ? [{ profile_id: PID, secret_enc: 'v1.a.b', confirmed_at: '2026-01-01', last_used_step: 0 }] : []],
  ]);
}

beforeEach(() => __resetFlagCacheForTests());

describe('portão de MFA — admin sem autenticador e flag ligada', () => {
  const sessionActions = describeActions(API_REGISTRY)
    .filter((a) => a.session && !OPEN_FOR_SETUP.includes(a.name) && !OPTIONAL_SESSION.includes(a.name))
    .map((a) => a.name);

  test('há muitas actions cobertas (guarda contra o filtro ficar vazio)', () => {
    expect(sessionActions.length).toBeGreaterThan(70);
  });

  test.each(sessionActions)('%s é recusada com mfaSetupRequired', async (name) => {
    const sql = world();
    const res = await API_REGISTRY[name](sql, makeEnv(), [TOKEN, {}, {}]);
    expect(res).toMatchObject({ success: false, mfaSetupRequired: true });
    // Recusou ANTES de qualquer lógica da action: só leu sessão, flag e credencial.
    const touched = sql.mock.calls.map((c) => (Array.isArray(c[0]) ? c[0].join('?') : String(c[0])));
    touched.forEach((t) => expect(t).toMatch(/FROM sessions s|FROM feature_flags|FROM mfa_credentials|INSERT INTO error_logs/));
  });

  test.each(OPEN_FOR_SETUP)('%s continua acessível para o admin se cadastrar', async (name) => {
    const res = await API_REGISTRY[name](world(), makeEnv(), [TOKEN, {}]);
    expect(res.mfaSetupRequired).toBeUndefined();
  });

  test('o login do admin sem MFA avisa que o cadastro é obrigatório', async () => {
    const sql = routedSql([
      ['INSERT INTO rate_limit_buckets', [{ attempts: 1 }]],
      ['FROM profiles WHERE email', [{ id: PID, role: 'admin', status: 'active', full_name: 'Ana', email_confirmed_at: 'x', password_ok: true }]],
      ['FROM feature_flags', [{ key: 'mfa_required', enabled: true, rollout_pct: 100, conditions: {} }]],
      ['FROM mfa_credentials', []],
    ]);
    const res = await API_REGISTRY.apiLogin(sql, makeEnv(), ['ana@exemplo.com', 'senha-certa']);
    expect(res).toMatchObject({ success: true, mfaSetupRequired: true });
    expect(res.sessionToken).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('portão de MFA — quando NÃO deve barrar', () => {
  test('flag desligada: o admin passa do portão', async () => {
    const res = await API_REGISTRY.apiAdminListFeatureFlags(world({ flagEnabled: false }), makeEnv(), [TOKEN]);
    expect(res.mfaSetupRequired).toBeUndefined();
    expect(res.success).toBe(true);
  });

  test('admin com MFA confirmada passa do portão', async () => {
    const res = await API_REGISTRY.apiAdminListFeatureFlags(world({ enrolled: true }), makeEnv(), [TOKEN]);
    expect(res.mfaSetupRequired).toBeUndefined();
  });

  test('membro comum nunca é barrado, nem consulta credenciais de MFA', async () => {
    const sql = world({ role: 'member' });
    await API_REGISTRY.apiListTasks(sql, makeEnv(), [TOKEN]);
    expect(callsMatching(sql, 'FROM mfa_credentials')).toHaveLength(0);
    const res = await API_REGISTRY.apiListTasks(world({ role: 'member' }), makeEnv(), [TOKEN]);
    expect(res.mfaSetupRequired).toBeUndefined();
  });
});

describe('feature flags — o que o navegador enxerga', () => {
  test('anônimo recebe só as flags públicas, sem mfa_required nem as internas', async () => {
    const sql = routedSql([['FROM feature_flags', [
      { key: 'mfa_required', enabled: true, rollout_pct: 100, conditions: {} },
      { key: 'use_orchestrator', enabled: true, rollout_pct: 100, conditions: {} },
      { key: 'nvidia_fallback', enabled: true, rollout_pct: 100, conditions: {} },
      { key: 'ux_v2_enabled', enabled: true, rollout_pct: 100, conditions: {} },
    ]]]);
    const res = await API_REGISTRY.apiGetFeatureFlags(sql, makeEnv(), []);
    expect(res).toEqual({ success: true, flags: { ux_v2_enabled: true } });
  });

  test('desligar mfa_required pela API exige a reautenticação do admin (senha errada = nada muda)', async () => {
    const sql = routedSql([
      ['FROM sessions s', [{ profile_id: PID, role: 'admin', status: 'active', full_name: 'Ana', email: 'a@x.com', email_confirmed_at: 'x' }]],
      ['FROM feature_flags', [{ key: 'mfa_required', enabled: false, rollout_pct: 100, conditions: {} }]],
      ['FROM mfa_credentials', [{ profile_id: PID, secret_enc: 'v1.a.b', confirmed_at: 'x', last_used_step: 0 }]],
      ['crypt(', [{ ok: false }]],
    ]);
    const res = await API_REGISTRY.apiAdminSetFeatureFlag(sql, makeEnv(), [TOKEN, 'mfa_required', { enabled: false, password: 'errada' }]);
    expect(res.success).toBe(false);
    expect(callsMatching(sql, 'INSERT INTO feature_flags')).toHaveLength(0);
  });
});
