/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import * as Mfa from '../src/services/mfaService.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { codeForStep, stepAt, generateSecret } from '../src/mfa/totp.js';
import { encryptSecret } from '../src/mfa/secretBox.js';
import { routedSql, callsMatching } from './helpers/aiTestUtils.js';

const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const CID = '33333333-3333-4333-8333-333333333333';
const ENV = { SESSION_TOKEN_PEPPER: 'pepper-de-teste', MFA_ENCRYPTION_KEY: 'chave-de-teste-com-32-caracteres-ou-mais!', clientIp: '203.0.113.9' };
const ADMIN = { profileId: PID, role: 'admin', email: 'admin@exemplo.com' };
const MEMBER = { profileId: PID, role: 'member', email: 'ana@exemplo.com' };

async function credentialRow(secret, extra) {
  return Object.assign({
    profile_id: PID, secret_enc: await encryptSecret(ENV, secret, PID), confirmed_at: '2026-10-01T00:00:00Z', last_used_step: 0,
  }, extra || {});
}

beforeEach(() => __resetFlagCacheForTests());

describe('recovery codes', () => {
  test('gera 10 códigos únicos no formato XXXXX-XXXXX sem caracteres ambíguos', () => {
    const codes = Mfa.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/));
  });
});

describe('checkSecondFactor', () => {
  test('aceita o TOTP do momento e grava o passo de forma atômica', async () => {
    const secret = generateSecret();
    const now = 1760000000000;
    const code = await codeForStep(secret, stepAt(now));
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_credentials SET last_used_step', [{ profile_id: PID }]],
    ]);
    expect(await Mfa.checkSecondFactor(sql, ENV, PID, code, now)).toBe('totp');
    expect(callsMatching(sql, 'last_used_step <')).toHaveLength(1);
  });

  test('o mesmo código usado em paralelo falha quando o UPDATE atômico não acha a linha', async () => {
    const secret = generateSecret();
    const now = 1760000000000;
    const code = await codeForStep(secret, stepAt(now));
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_credentials SET last_used_step', []],
    ]);
    expect(await Mfa.checkSecondFactor(sql, ENV, PID, code, now)).toBeNull();
  });

  test('um passo já registrado em last_used_step é recusado sem nem chegar ao UPDATE', async () => {
    const secret = generateSecret();
    const now = 1760000000000;
    const code = await codeForStep(secret, stepAt(now));
    const sql = routedSql([['FROM mfa_credentials', [await credentialRow(secret, { last_used_step: String(stepAt(now)) })]]]);
    expect(await Mfa.checkSecondFactor(sql, ENV, PID, code, now)).toBeNull();
    expect(callsMatching(sql, 'UPDATE mfa_credentials')).toHaveLength(0);
  });

  test('código de recuperação vale uma vez (UPDATE ... used_at IS NULL)', async () => {
    const secret = generateSecret();
    const ok = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_recovery_codes', [{ id: 'x' }]],
    ]);
    expect(await Mfa.checkSecondFactor(ok, ENV, PID, 'ABCDE-FGHJK')).toBe('recovery');
    const used = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_recovery_codes', []],
    ]);
    expect(await Mfa.checkSecondFactor(used, ENV, PID, 'ABCDE-FGHJK')).toBeNull();
  });

  test('quem não tem MFA confirmada nunca passa', async () => {
    const sql = routedSql([['FROM mfa_credentials', []]]);
    expect(await Mfa.checkSecondFactor(sql, ENV, PID, '123456')).toBeNull();
  });
});

describe('login com desafio', () => {
  test('sem MFA o login segue como antes (null)', async () => {
    const sql = routedSql([['FROM mfa_credentials', []]]);
    expect(await Mfa.startLoginChallenge(sql, ENV, PID)).toBeNull();
  });

  test('tabela ausente (migração 017 não aplicada) não derruba o login', async () => {
    const err = Object.assign(new Error('relation "mfa_credentials" does not exist'), { code: '42P01' });
    const sql = routedSql([['FROM mfa_credentials', err]]);
    expect(await Mfa.startLoginChallenge(sql, ENV, PID)).toBeNull();
  });

  test('com MFA grava só o HASH do desafio e devolve o token bruto', async () => {
    const sql = routedSql([['FROM mfa_credentials', [await credentialRow(generateSecret())]]]);
    const token = await Mfa.startLoginChallenge(sql, ENV, PID);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const insert = callsMatching(sql, 'INSERT INTO mfa_challenges')[0];
    expect(insert).not.toContain(token);
  });

  test('completeLogin: código certo cria a sessão e apaga o desafio', async () => {
    const secret = generateSecret();
    const now = Date.now();
    const code = await codeForStep(secret, stepAt(now));
    const sql = routedSql([
      ['UPDATE mfa_challenges SET attempts', [{ profile_id: PID }]],
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_credentials SET last_used_step', [{ profile_id: PID }]],
      ['FROM profiles', [{ role: 'admin', status: 'active', full_name: 'Ana', email_confirmed_at: 'x' }]],
    ]);
    const out = await Mfa.completeLogin(sql, ENV, 'token-bruto', code, 'ua', CID);
    expect(out).toMatchObject({ success: true, profile: { role: 'admin' }, usedRecoveryCode: false });
    // O id vem do desafio já validado (o mesmo da sessão criada), não do corpo; chave exata, sem e-mail nem telefone.
    expect(out.profile).toEqual({ id: PID, fullName: 'Ana', role: 'admin' });
    expect(Object.keys(out).sort()).toEqual(['message', 'profile', 'sessionToken', 'success', 'usedRecoveryCode']);
    expect(out.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(callsMatching(sql, 'DELETE FROM mfa_challenges')).toHaveLength(1);
    expect(callsMatching(sql, 'INSERT INTO sessions')).toHaveLength(1);
  });

  test('completeLogin: desafio expirado ou sem tentativas restantes é recusado', async () => {
    const sql = routedSql([['UPDATE mfa_challenges SET attempts', []]]);
    await expect(Mfa.completeLogin(sql, ENV, 'token', '123456', '', CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(sql, 'INSERT INTO sessions')).toHaveLength(0);
  });

  test('completeLogin: código errado não cria sessão e audita a falha', async () => {
    const secret = generateSecret();
    const sql = routedSql([
      ['UPDATE mfa_challenges SET attempts', [{ profile_id: PID }]],
      ['FROM mfa_credentials', [await credentialRow(secret)]],
    ]);
    await expect(Mfa.completeLogin(sql, ENV, 'token', '000000', '', CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(sql, 'INSERT INTO sessions')).toHaveLength(0);
    expect(callsMatching(sql, 'INSERT INTO audit_logs')[0]).toContain('LOGIN_MFA');
  });

  test('completeLogin: conta banida depois do desafio não ganha sessão', async () => {
    const secret = generateSecret();
    const now = Date.now();
    const sql = routedSql([
      ['UPDATE mfa_challenges SET attempts', [{ profile_id: PID }]],
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_credentials SET last_used_step', [{ profile_id: PID }]],
      ['FROM profiles', [{ role: 'member', status: 'banned', full_name: 'Ana', email_confirmed_at: 'x' }]],
    ]);
    await expect(Mfa.completeLogin(sql, ENV, 'token', await codeForStep(secret, stepAt(now)), '', CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(sql, 'INSERT INTO sessions')).toHaveLength(0);
  });
});

describe('obrigatoriedade para administradores', () => {
  const flagOn = ['FROM feature_flags', [{ key: 'mfa_required', enabled: true, rollout_pct: 100, conditions: {} }]];

  test('flag desligada: ninguém é barrado', async () => {
    const sql = routedSql([['FROM feature_flags', [{ key: 'mfa_required', enabled: false, rollout_pct: 100, conditions: {} }]]]);
    await expect(Mfa.assertAdminMfaSatisfied(sql, ADMIN)).resolves.toBeUndefined();
  });

  test('flag ligada: admin sem MFA recebe mfaSetupRequired', async () => {
    const sql = routedSql([flagOn, ['FROM mfa_credentials', []]]);
    await expect(Mfa.assertAdminMfaSatisfied(sql, ADMIN)).rejects.toMatchObject({ name: 'AuthError', payload: { mfaSetupRequired: true } });
  });

  test('flag ligada: admin com MFA confirmada passa', async () => {
    const sql = routedSql([flagOn, ['FROM mfa_credentials', [await credentialRow(generateSecret())]]]);
    await expect(Mfa.assertAdminMfaSatisfied(sql, ADMIN)).resolves.toBeUndefined();
  });

  test('flag ligada: membro comum nunca é barrado e nem consulta o banco', async () => {
    const sql = routedSql([flagOn]);
    await expect(Mfa.assertAdminMfaSatisfied(sql, MEMBER)).resolves.toBeUndefined();
    expect(sql).not.toHaveBeenCalled();
  });

  test('tabela ausente não barra o admin', async () => {
    const err = Object.assign(new Error('relation "mfa_credentials" does not exist'), { code: '42P01' });
    const sql = routedSql([flagOn, ['FROM mfa_credentials', err]]);
    await expect(Mfa.assertAdminMfaSatisfied(sql, ADMIN)).resolves.toBeUndefined();
  });
});

describe('cadastro', () => {
  test('beginEnrollment devolve segredo e URI, e guarda o segredo CIFRADO', async () => {
    const sql = routedSql([
      ['crypt(', [{ ok: true }]],
      ['FROM mfa_credentials', []],
      ['INSERT INTO mfa_credentials', [{ profile_id: PID }]],
    ]);
    const out = await Mfa.beginEnrollment(sql, ENV, MEMBER, { password: 'senha-certa' });
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.otpauthUri).toContain('secret=' + out.secret);
    const insert = callsMatching(sql, 'INSERT INTO mfa_credentials')[0];
    expect(insert).not.toContain(out.secret);
    expect(insert.some((v) => typeof v === 'string' && v.startsWith('v1.'))).toBe(true);
  });

  test('beginEnrollment recusa quando já há MFA confirmada', async () => {
    const sql = routedSql([['crypt(', [{ ok: true }]], ['FROM mfa_credentials', [await credentialRow(generateSecret())]]]);
    await expect(Mfa.beginEnrollment(sql, ENV, MEMBER, { password: 'senha-certa' })).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('beginEnrollment exige a SENHA: sessão roubada sozinha não ativa um autenticador', async () => {
    const sql = routedSql([['crypt(', [{ ok: false }]]]);
    await expect(Mfa.beginEnrollment(sql, ENV, MEMBER, { password: 'errada' })).rejects.toMatchObject({ name: 'AuthError' });
    await expect(Mfa.beginEnrollment(sql, ENV, MEMBER, {})).rejects.toMatchObject({ name: 'ValidationError' });
    expect(callsMatching(sql, 'INSERT INTO mfa_credentials')).toHaveLength(0);
  });

  test('beginEnrollment não devolve segredo que não foi gravado (corrida com a confirmação)', async () => {
    const sql = routedSql([
      ['crypt(', [{ ok: true }]],
      ['FROM mfa_credentials', []],
      ['INSERT INTO mfa_credentials', []],
    ]);
    await expect(Mfa.beginEnrollment(sql, ENV, MEMBER, { password: 'senha-certa' })).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('confirmEnrollment com código certo ativa e devolve 10 códigos de recuperação UMA vez', async () => {
    const secret = generateSecret();
    const now = 1760000000000;
    const code = await codeForStep(secret, stepAt(now));
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret, { confirmed_at: null })]],
      ['SET confirmed_at = now()', [{ profile_id: PID }]],
    ]);
    const out = await Mfa.confirmEnrollment(sql, ENV, MEMBER, code, CID, now);
    expect(out.recoveryCodes).toHaveLength(10);
    const stored = callsMatching(sql, 'INSERT INTO mfa_recovery_codes')[0];
    out.recoveryCodes.forEach((c) => expect(JSON.stringify(stored)).not.toContain(c));
    expect(callsMatching(sql, 'INSERT INTO audit_logs')[0]).toContain('MFA_ENABLE');
  });

  test('confirmEnrollment com código errado não ativa nada', async () => {
    const sql = routedSql([['FROM mfa_credentials', [await credentialRow(generateSecret(), { confirmed_at: null })]]]);
    await expect(Mfa.confirmEnrollment(sql, ENV, MEMBER, '000000', CID, 1760000000000)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(callsMatching(sql, 'SET confirmed_at')).toHaveLength(0);
  });

  test('confirmEnrollment sem cadastro iniciado pede para começar', async () => {
    const sql = routedSql([['FROM mfa_credentials', []]]);
    await expect(Mfa.confirmEnrollment(sql, ENV, MEMBER, '123456', CID)).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('desativar e resetar', () => {
  test('admin com a obrigatoriedade ligada não pode desativar a própria MFA', async () => {
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(generateSecret())]],
      ['FROM feature_flags', [{ key: 'mfa_required', enabled: true, rollout_pct: 100, conditions: {} }]],
    ]);
    await expect(Mfa.disable(sql, ENV, ADMIN, { password: 'x', code: '123456' }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('desativar exige senha correta E segundo fator', async () => {
    const secret = generateSecret();
    const wrongPassword = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['crypt(', [{ ok: false }]],
    ]);
    await expect(Mfa.disable(wrongPassword, ENV, MEMBER, { password: 'errada', code: '123456' }, CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(wrongPassword, 'DELETE FROM mfa_credentials')).toHaveLength(0);
  });

  test('desativar com senha e código certos apaga credencial, códigos e desafios', async () => {
    const secret = generateSecret();
    const now = Date.now();
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['crypt(', [{ ok: true }]],
      ['UPDATE mfa_credentials SET last_used_step', [{ profile_id: PID }]],
    ]);
    const out = await Mfa.disable(sql, ENV, MEMBER, { password: 'certa', code: await codeForStep(secret, stepAt(now)) }, CID);
    expect(out.success).toBe(true);
    ['mfa_challenges', 'mfa_recovery_codes', 'mfa_credentials'].forEach((t) => {
      expect(callsMatching(sql, 'DELETE FROM ' + t)).toHaveLength(1);
    });
  });

  test('admin não reseta a própria MFA; peça a outro administrador', async () => {
    const sql = routedSql([]);
    await expect(Mfa.adminResetUserMfa(sql, ENV, ADMIN, PID, {}, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('só administrador reseta a MFA de outra pessoa', async () => {
    const sql = routedSql([]);
    await expect(Mfa.adminResetUserMfa(sql, ENV, MEMBER, OTHER, {}, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('reset exige a SENHA do admin que executa; sem ela nada é apagado', async () => {
    const sql = routedSql([['crypt(', [{ ok: false }]]]);
    await expect(Mfa.adminResetUserMfa(sql, ENV, ADMIN, OTHER, { password: 'errada' }, CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(sql, 'DELETE FROM mfa_credentials')).toHaveLength(0);
    expect(callsMatching(sql, 'UPDATE profiles SET password_hash')).toHaveLength(0);
  });

  test('reset exige também o segundo fator do admin que executa, quando ele tem MFA', async () => {
    const sql = routedSql([
      ['crypt(', [{ ok: true }]],
      ['FROM mfa_credentials', [await credentialRow(generateSecret())]],
    ]);
    await expect(Mfa.adminResetUserMfa(sql, ENV, ADMIN, OTHER, { password: 'certa', code: '000000' }, CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(sql, 'DELETE FROM mfa_credentials')).toHaveLength(0);
  });

  test('reset por outro admin: sessões revogadas, MFA apagada, SENHA invalidada, link enviado e auditoria', async () => {
    const sent = [];
    const sql = routedSql([
      ['crypt(', [{ ok: true }]],
      ['FROM mfa_credentials', []],
      ['SELECT id, email FROM profiles', [{ id: OTHER, email: 'alvo@exemplo.com' }]],
    ]);
    const out = await Mfa.adminResetUserMfa(sql, ENV, ADMIN, OTHER, { password: 'certa' }, CID, {
      sendResetLink: async (_env, email) => { sent.push(email); },
    });
    expect(out).toMatchObject({ success: true, linkSent: true });
    expect(sent).toEqual(['alvo@exemplo.com']);
    expect(callsMatching(sql, 'DELETE FROM mfa_credentials')).toHaveLength(1);
    expect(callsMatching(sql, 'UPDATE profiles SET password_hash')).toHaveLength(1);
    // Ordem: as sessões do alvo caem antes de qualquer outra mudança.
    const order = sql.mock.calls.map((c) => (Array.isArray(c[0]) ? c[0].join('?') : String(c[0])));
    const revoke = order.findIndex((t) => t.includes('UPDATE sessions SET revoked_at'));
    const wipeAt = order.findIndex((t) => t.includes('DELETE FROM mfa_credentials'));
    expect(revoke).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(wipeAt);
  });

  test('se o e-mail de redefinição falhar, o reset vale e a resposta avisa', async () => {
    const sql = routedSql([['crypt(', [{ ok: true }]], ['FROM mfa_credentials', []], ['SELECT id, email FROM profiles', [{ id: OTHER, email: 'alvo@exemplo.com' }]]]);
    const out = await Mfa.adminResetUserMfa(sql, ENV, ADMIN, OTHER, { password: 'certa' }, CID, {
      sendResetLink: async () => { throw new Error('brevo fora'); },
    });
    expect(out).toMatchObject({ success: true, linkSent: false });
    expect(out.message).toContain('Esqueci minha senha');
    expect(callsMatching(sql, 'UPDATE profiles SET password_hash')).toHaveLength(1);
    expect(callsMatching(sql, 'INSERT INTO audit_logs')[0]).toContain('MFA_ADMIN_RESET');
  });

  test('reset com identificador inválido ou pessoa inexistente é recusado', async () => {
    await expect(Mfa.adminResetUserMfa(routedSql([]), ENV, ADMIN, 'nao-uuid', {}, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    const semAlvo = routedSql([['crypt(', [{ ok: true }]], ['FROM mfa_credentials', []], ['SELECT id, email FROM profiles', []]]);
    await expect(Mfa.adminResetUserMfa(semAlvo, ENV, ADMIN, OTHER, { password: 'certa' }, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('status', () => {
  test('sem credencial: desativada, com o recurso disponível', async () => {
    const sql = routedSql([['FROM mfa_credentials', []]]);
    expect(await Mfa.status(sql, MEMBER)).toMatchObject({ success: true, enabled: false, pendingEnrollment: false, available: true, required: false });
  });

  test('com MFA confirmada informa quantos códigos de recuperação restam', async () => {
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(generateSecret())]],
      ['count(*)', [{ n: 7 }]],
    ]);
    expect(await Mfa.status(sql, MEMBER)).toMatchObject({ enabled: true, recoveryCodesLeft: 7 });
  });

  test('cadastro iniciado e não confirmado aparece como pendente', async () => {
    const sql = routedSql([['FROM mfa_credentials', [await credentialRow(generateSecret(), { confirmed_at: null })]]]);
    expect(await Mfa.status(sql, MEMBER)).toMatchObject({ enabled: false, pendingEnrollment: true });
  });

  test('antes da migração 017 responde available:false em vez de erro', async () => {
    const err = Object.assign(new Error('relation "mfa_credentials" does not exist'), { code: '42P01' });
    const sql = routedSql([['FROM mfa_credentials', err]]);
    expect(await Mfa.status(sql, MEMBER)).toMatchObject({ success: true, enabled: false, available: false });
  });

  test('outro erro de banco não é escondido', async () => {
    const sql = routedSql([['FROM mfa_credentials', new Error('connection reset')]]);
    await expect(Mfa.status(sql, MEMBER)).rejects.toThrow('connection reset');
  });

  test('admin com a obrigatoriedade ligada vê required:true', async () => {
    const sql = routedSql([
      ['FROM mfa_credentials', []],
      ['FROM feature_flags', [{ key: 'mfa_required', enabled: true, rollout_pct: 100, conditions: {} }]],
    ]);
    expect(await Mfa.status(sql, ADMIN)).toMatchObject({ required: true });
  });
});

describe('regenerateRecoveryCodes e requireStepUp', () => {
  test('gera 10 códigos novos com um TOTP válido e audita', async () => {
    const secret = generateSecret();
    const now = Date.now();
    const sql = routedSql([
      ['FROM mfa_credentials', [await credentialRow(secret)]],
      ['UPDATE mfa_credentials SET last_used_step', [{ profile_id: PID }]],
    ]);
    const out = await Mfa.regenerateRecoveryCodes(sql, ENV, MEMBER, { code: await codeForStep(secret, stepAt(now)) }, CID);
    expect(out.recoveryCodes).toHaveLength(10);
    expect(callsMatching(sql, 'INSERT INTO mfa_recovery_codes')).toHaveLength(1);
    expect(callsMatching(sql, 'INSERT INTO audit_logs')[0]).toContain('MFA_RECOVERY_REGENERATE');
  });

  test('código errado não troca os códigos antigos', async () => {
    const sql = routedSql([['FROM mfa_credentials', [await credentialRow(generateSecret())]]]);
    await expect(Mfa.regenerateRecoveryCodes(sql, ENV, MEMBER, { code: '000000' }, CID)).rejects.toMatchObject({ name: 'AuthError' });
    expect(callsMatching(sql, 'INSERT INTO mfa_recovery_codes')).toHaveLength(0);
  });

  test('sem MFA ativa não há o que regenerar', async () => {
    const sql = routedSql([['FROM mfa_credentials', []]]);
    await expect(Mfa.regenerateRecoveryCodes(sql, ENV, MEMBER, { code: '123456' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('requireStepUp: senha certa e sem MFA passa; senha errada não', async () => {
    await expect(Mfa.requireStepUp(routedSql([['crypt(', [{ ok: true }]], ['FROM mfa_credentials', []]]), ENV, ADMIN, { password: 'certa' })).resolves.toBeUndefined();
    await expect(Mfa.requireStepUp(routedSql([['crypt(', [{ ok: false }]]]), ENV, ADMIN, { password: 'errada' })).rejects.toMatchObject({ name: 'AuthError' });
  });

  test('requireStepUp: com MFA ativa o código também é exigido', async () => {
    const secret = generateSecret();
    const now = Date.now();
    const rows = [['crypt(', [{ ok: true }]], ['FROM mfa_credentials', [await credentialRow(secret)]], ['UPDATE mfa_credentials SET last_used_step', [{ profile_id: PID }]]];
    await expect(Mfa.requireStepUp(routedSql(rows), ENV, ADMIN, { password: 'certa', code: await codeForStep(secret, stepAt(now)) })).resolves.toBeUndefined();
    await expect(Mfa.requireStepUp(routedSql(rows), ENV, ADMIN, { password: 'certa', code: '000000' })).rejects.toMatchObject({ name: 'AuthError' });
  });
});
