/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import {
  evaluateFlag, rolloutBucket, isEnabled, getFlagsFor, getPublicFlagsFor, adminList, adminSet,
  __resetFlagCacheForTests, FLAG_CACHE_TTL_MS,
} from '../src/services/featureFlagService.js';
import { routedSql, callsMatching } from './helpers/aiTestUtils.js';

const ADMIN = { profileId: '11111111-1111-4111-8111-111111111111', role: 'admin' };
const MEMBER = { profileId: '22222222-2222-4222-8222-222222222222', role: 'member' };
const CID = '33333333-3333-4333-8333-333333333333';

const flag = (extra) => Object.assign({ key: 'nova_tela', enabled: true, rollout_pct: 100, conditions: {} }, extra || {});

beforeEach(() => __resetFlagCacheForTests());

describe('evaluateFlag', () => {
  test('flag inexistente ou desligada vale falso para todos', () => {
    expect(evaluateFlag(undefined, MEMBER)).toBe(false);
    expect(evaluateFlag(flag({ enabled: false }), MEMBER)).toBe(false);
  });

  test('ligada a 100% vale para todos, inclusive visitante anônimo', () => {
    expect(evaluateFlag(flag(), MEMBER)).toBe(true);
    expect(evaluateFlag(flag(), null)).toBe(true);
  });

  test('condição de papel aceita um papel ou uma lista', () => {
    expect(evaluateFlag(flag({ conditions: { role: 'admin' } }), ADMIN)).toBe(true);
    expect(evaluateFlag(flag({ conditions: { role: 'admin' } }), MEMBER)).toBe(false);
    expect(evaluateFlag(flag({ conditions: { role: ['admin', 'member'] } }), MEMBER)).toBe(true);
    expect(evaluateFlag(flag({ conditions: { role: 'admin' } }), null)).toBe(false);
  });

  test('condição de profile_ids restringe a quem está na lista', () => {
    const f = flag({ conditions: { profile_ids: [MEMBER.profileId] } });
    expect(evaluateFlag(f, MEMBER)).toBe(true);
    expect(evaluateFlag(f, ADMIN)).toBe(false);
  });

  test('0% desliga e percentual parcial é estável para a mesma pessoa', () => {
    expect(evaluateFlag(flag({ rollout_pct: 0 }), MEMBER)).toBe(false);
    const f = flag({ rollout_pct: 50 });
    const first = evaluateFlag(f, MEMBER);
    for (let i = 0; i < 20; i++) expect(evaluateFlag(f, MEMBER)).toBe(first);
  });

  test('percentual parcial nunca vale para quem não tem identidade', () => {
    expect(evaluateFlag(flag({ rollout_pct: 99 }), null)).toBe(false);
  });

  test('o balde fica entre 0 e 99 e se distribui perto do percentual pedido', () => {
    let on = 0;
    const total = 2000;
    for (let i = 0; i < total; i++) {
      const bucket = rolloutBucket('nova_tela', 'perfil-' + i);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
      if (bucket < 30) on += 1;
    }
    expect(on / total).toBeGreaterThan(0.25);
    expect(on / total).toBeLessThan(0.35);
  });
});

describe('leitura com cache', () => {
  test('lê o banco uma vez dentro da janela de 60 s', async () => {
    const sql = routedSql([['FROM feature_flags', [flag()]]]);
    expect(await isEnabled(sql, 'nova_tela', MEMBER, 1000)).toBe(true);
    expect(await isEnabled(sql, 'nova_tela', MEMBER, 1000 + FLAG_CACHE_TTL_MS - 1)).toBe(true);
    expect(callsMatching(sql, 'FROM feature_flags')).toHaveLength(1);
    await isEnabled(sql, 'nova_tela', MEMBER, 1000 + FLAG_CACHE_TTL_MS + 1);
    expect(callsMatching(sql, 'FROM feature_flags')).toHaveLength(2);
  });

  test('erro de banco que NÃO é tabela ausente sobe (nunca vira "flag desligada")', async () => {
    const sql = routedSql([['FROM feature_flags', new Error('connection reset by peer')]]);
    await expect(isEnabled(sql, 'mfa_required', ADMIN)).rejects.toThrow('connection reset');
  });

  test('banco instável depois de uma leitura boa: usa o último valor conhecido', async () => {
    let calls = 0;
    const sql = routedSql([['FROM feature_flags', () => {
      calls += 1;
      if (calls === 1) return [flag({ key: 'mfa_required' })];
      return new Error('timeout');
    }]]);
    expect(await isEnabled(sql, 'mfa_required', ADMIN, 1000)).toBe(true);
    expect(await isEnabled(sql, 'mfa_required', ADMIN, 1000 + FLAG_CACHE_TTL_MS + 5)).toBe(true);
    expect(calls).toBe(2);
  });

  test('getPublicFlagsFor devolve só as flags de interface', async () => {
    const sql = routedSql([['FROM feature_flags', [
      flag({ key: 'mfa_required' }), flag({ key: 'use_orchestrator' }), flag({ key: 'ux_v2_enabled' }),
    ]]]);
    expect(await getPublicFlagsFor(sql, MEMBER)).toEqual({ ux_v2_enabled: true });
  });

  test('tabela ausente (migração 016 ainda não aplicada) deixa tudo desligado, sem erro', async () => {
    const sql = routedSql([['FROM feature_flags', new Error('relation "feature_flags" does not exist')]]);
    expect(await isEnabled(sql, 'nova_tela', MEMBER)).toBe(false);
    expect(await getFlagsFor(sql, MEMBER)).toEqual({});
  });

  test('tabela ausente é consultada UMA vez por janela (não a cada chamada de IA)', async () => {
    const sql = routedSql([['FROM feature_flags', Object.assign(new Error('relation "feature_flags" does not exist'), { code: '42P01' })]]);
    await isEnabled(sql, 'use_orchestrator', MEMBER, 1000);
    await isEnabled(sql, 'use_orchestrator', MEMBER, 2000);
    await isEnabled(sql, 'mfa_required', ADMIN, 3000);
    expect(callsMatching(sql, 'FROM feature_flags')).toHaveLength(1);
  });

  test('getFlagsFor devolve o mapa já avaliado para a pessoa', async () => {
    const sql = routedSql([['FROM feature_flags', [flag({ key: 'a' }), flag({ key: 'b', conditions: { role: 'admin' } })]]]);
    expect(await getFlagsFor(sql, MEMBER)).toEqual({ a: true, b: false });
  });
});

describe('administração', () => {
  test('só administrador lista e altera', async () => {
    const sql = routedSql([]);
    await expect(adminList(sql, MEMBER)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(adminSet(sql, MEMBER, 'nova_tela', { enabled: true }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('cria/atualiza com validação, invalida o cache e audita', async () => {
    const saved = { key: 'nova_tela', enabled: true, rollout_pct: 25, conditions: { role: 'admin' }, description: 'x', updated_at: '2026-10-10T00:00:00Z' };
    const sql = routedSql([['INSERT INTO feature_flags', [saved]]]);
    const out = await adminSet(sql, ADMIN, 'nova_tela', { enabled: true, rolloutPct: 25, conditions: { role: 'admin' }, description: 'x' }, CID);
    expect(out.success).toBe(true);
    expect(out.flag).toMatchObject({ key: 'nova_tela', enabled: true, rolloutPct: 25 });
    const audit = callsMatching(sql, 'INSERT INTO audit_logs');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toContain('SET_FEATURE_FLAG');
  });

  test('um patch parcial preserva os demais campos da flag', async () => {
    const existing = { key: 'nova_tela', enabled: false, rollout_pct: 40, conditions: { role: 'member' }, description: 'antiga' };
    const sql = routedSql([
      ['SELECT key, enabled, rollout_pct, conditions, description FROM feature_flags', [existing]],
      ['INSERT INTO feature_flags', [{ ...existing, enabled: true, updated_at: 'agora' }]],
    ]);
    await adminSet(sql, ADMIN, 'nova_tela', { enabled: true }, CID);
    const insert = callsMatching(sql, 'INSERT INTO feature_flags')[0];
    expect(insert).toContain(40);
    expect(insert).toContain('antiga');
    expect(insert).toContain(JSON.stringify({ role: 'member' }));
  });

  describe('flag de segurança mfa_required', () => {
    const saved = { key: 'mfa_required', enabled: true, rollout_pct: 100, conditions: {}, description: '', updated_at: 'x' };

    test('não aceita percentual nem condições (valeria só para alguns admins)', async () => {
      const stepUp = jest.fn().mockResolvedValue(undefined);
      const sql = routedSql([['INSERT INTO feature_flags', [saved]]]);
      await expect(adminSet(sql, ADMIN, 'mfa_required', { enabled: true, rolloutPct: 50 }, CID, { stepUp })).rejects.toMatchObject({ name: 'ValidationError' });
      await expect(adminSet(sql, ADMIN, 'mfa_required', { enabled: true, conditions: { role: 'member' } }, CID, { stepUp })).rejects.toMatchObject({ name: 'ValidationError' });
      expect(callsMatching(sql, 'INSERT INTO feature_flags')).toHaveLength(0);
    });

    test('sem reautenticação disponível, recusa', async () => {
      const sql = routedSql([['INSERT INTO feature_flags', [saved]]]);
      await expect(adminSet(sql, ADMIN, 'mfa_required', { enabled: false }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    });

    test('a reautenticação que falha impede a mudança', async () => {
      const stepUp = jest.fn().mockRejectedValue(Object.assign(new Error('Senha incorreta.'), { name: 'AuthError', expected: true }));
      const sql = routedSql([['INSERT INTO feature_flags', [saved]]]);
      await expect(adminSet(sql, ADMIN, 'mfa_required', { enabled: false }, CID, { stepUp })).rejects.toMatchObject({ name: 'AuthError' });
      expect(callsMatching(sql, 'INSERT INTO feature_flags')).toHaveLength(0);
    });

    test('com a reautenticação certa, grava e audita', async () => {
      const stepUp = jest.fn().mockResolvedValue(undefined);
      const sql = routedSql([['INSERT INTO feature_flags', [saved]]]);
      const out = await adminSet(sql, ADMIN, 'mfa_required', { enabled: true }, CID, { stepUp });
      expect(out.success).toBe(true);
      expect(stepUp).toHaveBeenCalledTimes(1);
    });

    test('flags comuns não pedem reautenticação', async () => {
      const stepUp = jest.fn();
      const sql = routedSql([['INSERT INTO feature_flags', [{ ...saved, key: 'nova_tela' }]]]);
      await adminSet(sql, ADMIN, 'nova_tela', { enabled: true }, CID, { stepUp });
      expect(stepUp).not.toHaveBeenCalled();
    });
  });

  test.each([
    ['chave com maiúscula', 'Nova', { enabled: true }],
    ['enabled que não é booleano', 'nova_tela', { enabled: 'sim' }],
    ['percentual fora da faixa', 'nova_tela', { rolloutPct: 101 }],
    ['percentual fracionado', 'nova_tela', { rolloutPct: 10.5 }],
    ['condição desconhecida', 'nova_tela', { conditions: { pais: 'BR' } }],
    ['papel inexistente', 'nova_tela', { conditions: { role: 'root' } }],
    ['profile_ids inválido', 'nova_tela', { conditions: { profile_ids: ['nao-e-uuid'] } }],
    ['sem nenhum campo', 'nova_tela', {}],
  ])('recusa %s', async (_label, key, input) => {
    const sql = routedSql([]);
    await expect(adminSet(sql, ADMIN, key, input, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(callsMatching(sql, 'INSERT INTO feature_flags')).toHaveLength(0);
  });
});
