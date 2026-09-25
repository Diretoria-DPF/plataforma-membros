const { createServiceEnvironment, createCoreEnvironment } = require('./helpers/gasEnvironment');

describe('Security.gs — tokens opacos', function () {
  test('generateRawToken produz valores longos, hexadecimais e únicos', function () {
    const env = createCoreEnvironment();
    const a = env.App.Security.generateRawToken();
    const b = env.App.Security.generateRawToken();
    expect(a).toMatch(/^[0-9a-f]+$/i);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });

  test('hashToken é determinístico para o mesmo token e sensível ao pepper', function () {
    const env = createCoreEnvironment({ scriptProperties: { SESSION_TOKEN_PEPPER: 'pepper-A' } });
    const h1 = env.App.Security.hashToken('token-123');
    const h2 = env.App.Security.hashToken('token-123');
    expect(h1).toBe(h2);

    const envOtherPepper = createCoreEnvironment({ scriptProperties: { SESSION_TOKEN_PEPPER: 'pepper-B' } });
    const h3 = envOtherPepper.App.Security.hashToken('token-123');
    expect(h3).not.toBe(h1);
  });

  test('hashToken nunca é igual ao token bruto (não fica reversível trivialmente)', function () {
    const env = createCoreEnvironment();
    const raw = env.App.Security.generateRawToken();
    expect(env.App.Security.hashToken(raw)).not.toBe(raw);
  });
});

describe('Security.gs — toSafeInlineJson (embutir valor em <script> com segurança)', function () {
  test('nunca produz a sequência literal "</script>" mesmo com entrada maliciosa', function () {
    const env = createCoreEnvironment();
    const malicious = '</script><script>alert(1)</script>';
    const output = env.App.Security.toSafeInlineJson(malicious);
    expect(output.toLowerCase()).not.toContain('</script');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
  });

  test('produz um literal JavaScript válido que, ao ser avaliado, reconstrói o valor original', function () {
    const env = createCoreEnvironment();
    const original = 'texto com "aspas", <tag> e & comercial';
    const output = env.App.Security.toSafeInlineJson(original);
    // eval aqui é seguro: `output` é gerado por App.Security.toSafeInlineJson
    // a partir de um literal de teste fixo nesta mesma função — não há
    // entrada de rede, de usuário ou de outro processo envolvida. O único
    // objetivo é confirmar que o texto produzido é um literal JS válido que
    // reconstrói o valor original, exatamente como o navegador faria ao
    // carregar a página.
    // eslint-disable-next-line no-eval
    const roundTrip = eval('(' + output + ')');
    expect(roundTrip).toBe(original);
  });

  test('string vazia e valores simples continuam corretos', function () {
    const env = createCoreEnvironment();
    expect(env.App.Security.toSafeInlineJson('')).toBe('""');
    expect(env.App.Security.toSafeInlineJson('confirm')).toBe('"confirm"');
  });
});

describe('Security.gs — limitação de tentativas (CacheService)', function () {
  test('bloqueia após exceder o número máximo de tentativas na janela', function () {
    const env = createCoreEnvironment();
    for (let i = 0; i < 3; i++) {
      expect(function () { env.App.Security.enforceRateLimit('TEST_BUCKET', 'user@example.com', 3, 60); }).not.toThrow();
    }
    expect(function () { env.App.Security.enforceRateLimit('TEST_BUCKET', 'user@example.com', 3, 60); }).toThrow(/Muitas tentativas/);
  });

  test('buckets/identificadores diferentes não compartilham contador', function () {
    const env = createCoreEnvironment();
    for (let i = 0; i < 3; i++) env.App.Security.enforceRateLimit('BUCKET_A', 'user@example.com', 3, 60);
    expect(function () { env.App.Security.enforceRateLimit('BUCKET_B', 'user@example.com', 3, 60); }).not.toThrow();
    expect(function () { env.App.Security.enforceRateLimit('BUCKET_A', 'other@example.com', 3, 60); }).not.toThrow();
  });
});

describe('Security.gs — resolução de sessão sempre consulta o banco (nunca confia em cache local)', function () {
  test('sessão inexistente/expirada/revogada retorna null', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([]); // join sessions+profiles não encontrou linha válida
    expect(env.App.Security.resolveSession('qualquer-token')).toBeNull();
  });

  test('conta banida é rejeitada mesmo com sessão tecnicamente válida no banco', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([
      { profile_id: 'p1', role: 'member', status: 'banned', full_name: 'X', email: 'x@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(env.App.Security.resolveSession('token-banido')).toBeNull();
  });

  test('conta sem e-mail confirmado é rejeitada', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([
      { profile_id: 'p1', role: 'member', status: 'active', full_name: 'X', email: 'x@example.com', email_confirmed_at: null },
    ]);
    expect(env.App.Security.resolveSession('token-nao-confirmado')).toBeNull();
  });

  test('sessão válida resolve identidade completa', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([
      { profile_id: 'p1', role: 'admin', status: 'active', full_name: 'Admin', email: 'admin@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' },
    ]);
    const identity = env.App.Security.resolveSession('token-valido');
    expect(identity).toEqual(expect.objectContaining({ profileId: 'p1', role: 'admin' }));
  });

  test('requireSession lança AuthError genérico quando a sessão é inválida', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([]);
    expect(function () { env.App.Security.requireSession('token-invalido'); }).toThrow(/Sessão inválida ou expirada/);
  });
});

describe('AuthService.login — não revela se a conta existe', function () {
  test('e-mail inexistente e senha errada devolvem exatamente a mesma mensagem', function () {
    const env = createServiceEnvironment();

    env.database.query.mockReturnValueOnce([]); // e-mail não encontrado
    let messageForMissingEmail;
    try {
      env.App.AuthService.login('naoexiste@example.com', 'qualquer-senha-12chars', '', 'corr-1');
    } catch (err) {
      messageForMissingEmail = err.message;
    }

    env.database.query.mockReturnValueOnce([
      { id: 'p1', role: 'member', status: 'active', full_name: 'X', email_confirmed_at: '2026-01-01T00:00:00.000Z', password_ok: false },
    ]);
    let messageForWrongPassword;
    try {
      env.App.AuthService.login('existe@example.com', 'senha-errada-12chars', '', 'corr-2');
    } catch (err) {
      messageForWrongPassword = err.message;
    }

    expect(messageForMissingEmail).toBe(messageForWrongPassword);
    expect(messageForMissingEmail).toBe(env.App.Constants.GENERIC_AUTH_FAILURE_MESSAGE);
  });

  test('conta banida ou não confirmada recebe a mesma mensagem genérica (não uma diferente)', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([
      { id: 'p1', role: 'member', status: 'banned', full_name: 'X', email_confirmed_at: '2026-01-01T00:00:00.000Z', password_ok: true },
    ]);
    expect(function () { env.App.AuthService.login('banido@example.com', 'senha-12-caracteres', '', 'corr'); })
      .toThrow(env.App.Constants.GENERIC_AUTH_FAILURE_MESSAGE);
  });
});

describe('AuthService — uso único e expiração de tokens', function () {
  test('confirmEmail rejeita token já usado/expirado/inexistente (0 linhas afetadas)', function () {
    const env = createServiceEnvironment();
    env.database.withTransaction.mockImplementation(function (cb) {
      return cb({ query: function () { return []; }, execute: function () { return 0; } });
    });
    expect(function () { env.App.AuthService.confirmEmail('token-x', 'corr'); })
      .toThrow(/inválido, já utilizado ou expirado/);
  });

  test('confirmPasswordReset rejeita token já usado/expirado e revoga sessões só quando o token é válido', function () {
    const env = createServiceEnvironment();
    env.database.withTransaction.mockImplementation(function () {
      return null; // simula UPDATE ... RETURNING sem linhas (token inválido)
    });
    const revokeSpy = jest.spyOn(env.App.Security, 'revokeAllSessionsForProfile');

    expect(function () { env.App.AuthService.confirmPasswordReset('token-invalido', 'nova-senha-12+', 'corr'); })
      .toThrow(/inválido, já utilizado ou expirado/);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  test('confirmPasswordReset bem-sucedido revoga todas as sessões da conta', function () {
    const env = createServiceEnvironment();
    env.database.withTransaction.mockImplementation(function () {
      return 'profile-123';
    });
    const revokeSpy = jest.spyOn(env.App.Security, 'revokeAllSessionsForProfile').mockImplementation(function () {});

    const res = env.App.AuthService.confirmPasswordReset('token-valido', 'nova-senha-12+', 'corr');
    expect(res.success).toBe(true);
    expect(revokeSpy).toHaveBeenCalledWith('profile-123');
  });

  test('confirmPasswordReset rejeita nova senha com menos de 12 caracteres antes de tocar o banco', function () {
    const env = createServiceEnvironment();
    expect(function () { env.App.AuthService.confirmPasswordReset('token-x', 'curta', 'corr'); })
      .toThrow(/pelo menos 12 caracteres/);
    expect(env.database.withTransaction).not.toHaveBeenCalled();
  });
});
