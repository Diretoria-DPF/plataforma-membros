const { createServiceEnvironment } = require('./helpers/gasEnvironment');

describe('Validação — Security.gs (normalização e formato)', function () {
  let App;
  beforeEach(function () {
    App = createServiceEnvironment().App;
  });

  test('isValidEmail aceita formatos válidos e rejeita inválidos', function () {
    expect(App.Security.isValidEmail('pessoa@exemplo.com')).toBe(true);
    expect(App.Security.isValidEmail(' Pessoa@Exemplo.COM ')).toBe(true);
    expect(App.Security.isValidEmail('sem-arroba.com')).toBe(false);
    expect(App.Security.isValidEmail('duplo@@exemplo.com')).toBe(false);
    expect(App.Security.isValidEmail('')).toBe(false);
  });

  test('isLengthValid respeita limites mínimo e máximo após trim', function () {
    expect(App.Security.isLengthValid('  ab  ', 3, 10)).toBe(false);
    expect(App.Security.isLengthValid('  abc  ', 3, 10)).toBe(true);
    expect(App.Security.isLengthValid('x'.repeat(11), 3, 10)).toBe(false);
  });

  test('normalizeText remove espaços e trata null/undefined como string vazia', function () {
    expect(App.Security.normalizeText('  oi  ')).toBe('oi');
    expect(App.Security.normalizeText(null)).toBe('');
    expect(App.Security.normalizeText(undefined)).toBe('');
  });
});

describe('Validação — Cadastro (AuthService.register)', function () {
  let env;
  beforeEach(function () {
    env = createServiceEnvironment();
    env.database.query.mockResolvedValueOrSync = undefined;
  });

  const validInput = function (overrides) {
    return Object.assign(
      {
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999998888',
        city: 'São Paulo',
        education: 'Ensino Superior',
        password: 'senha-com-12-chars',
        validationPreference: 'email',
        termsAccepted: true,
        privacyAccepted: true,
      },
      overrides || {}
    );
  };

  test('rejeita senha com menos de 12 caracteres', function () {
    expect(function () {
      env.App.AuthService.register(validInput({ password: 'curta1234' }), 'corr-1');
    }).toThrow(/pelo menos 12 caracteres/);
  });

  test('rejeita nome fora do intervalo de 3 a 150 caracteres', function () {
    expect(function () {
      env.App.AuthService.register(validInput({ fullName: 'ab' }), 'corr-1');
    }).toThrow(/nome completo válido/);
  });

  test('rejeita e-mail em formato inválido', function () {
    expect(function () {
      env.App.AuthService.register(validInput({ email: 'invalido' }), 'corr-1');
    }).toThrow(/e-mail válido/);
  });

  test('rejeita preferência de validação "sms" mesmo enviada manualmente pelo cliente', function () {
    expect(function () {
      env.App.AuthService.register(validInput({ validationPreference: 'sms' }), 'corr-1');
    }).toThrow(/apenas a confirmação por e-mail/);
  });

  test('exige aceite dos Termos de Uso', function () {
    expect(function () {
      env.App.AuthService.register(validInput({ termsAccepted: false }), 'corr-1');
    }).toThrow(/Termos de Uso/);
  });

  test('exige aceite da Política de Privacidade', function () {
    expect(function () {
      env.App.AuthService.register(validInput({ privacyAccepted: true, termsAccepted: true, }), 'corr-1');
    }).not.toThrow(/Política de Privacidade/);

    expect(function () {
      env.App.AuthService.register(validInput({ privacyAccepted: false }), 'corr-1');
    }).toThrow(/Política de Privacidade/);
  });

  test('cadastro válido grava versões de termos/política aceitas e envia e-mail de confirmação', function () {
    env.database.query.mockImplementation(function (sql) {
      if (sql.indexOf('SELECT id FROM profiles WHERE email') !== -1) return [];
      return [];
    });
    env.database.withTransaction.mockImplementation(function (callback) {
      const calls = [];
      const txn = {
        query: function (sql, params) {
          calls.push({ sql: sql, params: params });
          if (sql.indexOf('INSERT INTO profiles') !== -1) return [{ id: 'profile-uuid-1' }];
          return [];
        },
        execute: function (sql, params) {
          calls.push({ sql: sql, params: params });
          return 1;
        },
      };
      const result = callback(txn);
      env.__lastTxnCalls = calls;
      return result;
    });

    const res = env.App.AuthService.register(validInput(), 'corr-2');
    expect(res.success).toBe(true);
    expect(env.sentEmails.length).toBe(1);
    expect(env.sentEmails[0].to).toBe('maria@example.com');

    const consentCalls = env.__lastTxnCalls.filter(function (c) { return c.sql.indexOf('INSERT INTO consents') !== -1; });
    expect(consentCalls.length).toBe(2);
    expect(consentCalls[0].params).toContain(env.App.Constants.LEGAL_VERSIONS.TERMS);
  });
});

describe('Validação — voto com complemento (ProposalService.castVote)', function () {
  test('exige complemento entre 3 e 700 caracteres quando choice=complement', function () {
    const env = createServiceEnvironment();
    const identity = { profileId: 'p1', role: 'member' };

    expect(function () {
      env.App.ProposalService.castVote(identity, 'prop-1', 'complement', 'ab', 'corr');
    }).toThrow(/entre 3 e 700/);
  });

  test('rejeita complemento preenchido quando choice não é complement', function () {
    const env = createServiceEnvironment();
    const identity = { profileId: 'p1', role: 'member' };

    expect(function () {
      env.App.ProposalService.castVote(identity, 'prop-1', 'yes', 'não deveria ter texto', 'corr');
    }).toThrow(/só é permitido/);
  });

  test('rejeita escolha de voto fora do enum permitido', function () {
    const env = createServiceEnvironment();
    const identity = { profileId: 'p1', role: 'member' };

    expect(function () {
      env.App.ProposalService.castVote(identity, 'prop-1', 'talvez', '', 'corr');
    }).toThrow(/Escolha de voto inválida/);
  });
});
