/**
 * AuthService.gs
 * Cadastro, confirmação de e-mail, login, logout e recuperação de senha.
 *
 * Hashing de senha SEMPRE no Postgres via pgcrypto (crypt()/gen_salt('bf'));
 * o valor em texto puro só trafega dentro da conexão TLS até o banco e nunca
 * é armazenado nem logado. Custo do bcrypt fixado em 10 rounds — equilíbrio
 * documentado entre robustez e o tempo de execução aceitável dentro dos
 * limites de uma execução de Apps Script (ver docs/SECURITY.md).
 */
App.AuthService = (function () {
  const C = App.Constants;
  const S = App.Security;
  const E = App.Errors;
  const BCRYPT_COST = 10;
  // Hash bcrypt fixo (não corresponde a nenhuma senha real) usado apenas para
  // igualar o tempo de resposta quando o e-mail informado não existe, mitigando
  // enumeração de contas por diferença de latência.
  const DUMMY_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8vC0Ldx7Fn6TZ2yq6q9Q2q9Q2q9Q2q';

  function assertValidRegistration(input) {
    const fullName = S.normalizeText(input.fullName);
    const email = S.normalizeText(input.email).toLowerCase();
    const phone = S.normalizeText(input.phone);
    const city = S.normalizeText(input.city);
    const education = S.normalizeText(input.education);
    const password = S.normalizeText(input.password);
    const validationPreference = S.normalizeText(input.validationPreference || 'email');

    if (!S.isLengthValid(fullName, C.LIMITS.NAME_MIN, C.LIMITS.NAME_MAX)) {
      throw E.ValidationError('Informe um nome completo válido.');
    }
    if (!S.isValidEmail(email)) {
      throw E.ValidationError('Informe um e-mail válido.');
    }
    if (!S.isLengthValid(phone, C.LIMITS.PHONE_MIN, C.LIMITS.PHONE_MAX)) {
      throw E.ValidationError('Informe um telefone válido.');
    }
    if (city && city.length > C.LIMITS.CITY_MAX) {
      throw E.ValidationError('Cidade inválida.');
    }
    if (education && education.length > C.LIMITS.EDUCATION_MAX) {
      throw E.ValidationError('Escolaridade inválida.');
    }
    if (password.length < C.LIMITS.PASSWORD_MIN_LENGTH) {
      throw E.ValidationError('A senha deve ter pelo menos ' + C.LIMITS.PASSWORD_MIN_LENGTH + ' caracteres.');
    }
    if (validationPreference !== 'email') {
      // V1 só aceita confirmação por e-mail; SMS é sempre rejeitado no servidor,
      // mesmo que o cliente tenha sido adulterado para enviar outro valor.
      throw E.ValidationError('No momento, apenas a confirmação por e-mail está disponível.');
    }
    if (input.termsAccepted !== true) {
      throw E.ValidationError('É necessário aceitar os Termos de Uso.');
    }
    if (input.privacyAccepted !== true) {
      throw E.ValidationError('É necessário aceitar a Política de Privacidade.');
    }

    return { fullName: fullName, email: email, phone: phone, city: city || null, education: education || null, password: password };
  }

  function register(input, correlationId) {
    const data = assertValidRegistration(input);
    S.enforceRateLimit('REGISTER', data.email, C.RATE_LIMITS.REGISTER.MAX_ATTEMPTS, C.RATE_LIMITS.REGISTER.WINDOW_SECONDS);

    const existing = App.Database.query('SELECT id FROM profiles WHERE email = ? LIMIT 1', [data.email]);
    if (existing.length) {
      throw E.ConflictError('Já existe uma conta cadastrada com este e-mail.');
    }

    const rawToken = S.generateRawToken();
    const tokenHash = S.hashToken(rawToken);

    const profileId = App.Database.withTransaction(function (txn) {
      const inserted = txn.query(
        'INSERT INTO profiles (full_name, email, password_hash, phone, city, education, role, status) ' +
          "VALUES (?, ?, crypt(?, gen_salt('bf', " + BCRYPT_COST + ')), ?, ?, ?, ?::user_role, ?::account_status) ' +
          'RETURNING id',
        [data.fullName, data.email, data.password, data.phone, data.city, data.education, C.ROLES.VISITOR, C.ACCOUNT_STATUS.ACTIVE]
      );
      const newId = inserted[0].id;

      txn.execute(
        'INSERT INTO consents (profile_id, document_type, document_version) VALUES (?::uuid, ?::consent_document_type, ?)',
        [newId, 'terms', C.LEGAL_VERSIONS.TERMS]
      );
      txn.execute(
        'INSERT INTO consents (profile_id, document_type, document_version) VALUES (?::uuid, ?::consent_document_type, ?)',
        [newId, 'privacy', C.LEGAL_VERSIONS.PRIVACY]
      );
      txn.execute('INSERT INTO preferences (profile_id) VALUES (?::uuid)', [newId]);

      txn.execute(
        'INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at) ' +
          "VALUES (?::uuid, ?::account_token_type, ?, now() + (? || ' hours')::interval)",
        [newId, C.TOKEN_TYPE.EMAIL_CONFIRMATION, tokenHash, C.LIMITS.EMAIL_TOKEN_TTL_HOURS]
      );

      return newId;
    });

    sendConfirmationEmail(data.email, data.fullName, rawToken, correlationId, profileId);

    App.Logging.logAudit(correlationId, profileId, 'REGISTER', 'profile', profileId, 'success', null);
    return { success: true, message: 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.' };
  }

  function sendConfirmationEmail(email, fullName, rawToken, correlationId, profileId) {
    const baseUrl = App.Config.getAppBaseUrl();
    const link = baseUrl + '?mode=confirm&token=' + encodeURIComponent(rawToken);
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Confirme sua conta — ' + App.Config.getMailFromName(),
        body: 'Olá, ' + fullName + '. Confirme sua conta acessando: ' + link + ' (o link expira em ' + C.LIMITS.EMAIL_TOKEN_TTL_HOURS + ' horas).',
        htmlBody:
          '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">' +
          '<h2>Confirme sua conta</h2>' +
          '<p>Olá, ' + escapeHtmlForEmail(fullName) + '.</p>' +
          '<p><a href="' + link + '" target="_blank">Clique aqui para confirmar seu e-mail</a></p>' +
          '<p>Este link expira em ' + C.LIMITS.EMAIL_TOKEN_TTL_HOURS + ' horas.</p>' +
          '</div>',
        name: App.Config.getMailFromName(),
      });
    } catch (mailErr) {
      App.Logging.logError(correlationId, 'MAIL_CONFIRMATION_FAILED', 'Falha ao enviar e-mail de confirmação.', { profileId: profileId });
    }
  }

  function escapeHtmlForEmail(text) {
    var escaped = String(text || '');
    escaped = escaped.replace(/&/g, '&amp;');
    escaped = escaped.replace(/</g, '&lt;');
    escaped = escaped.replace(/>/g, '&gt;');
    escaped = escaped.replace(/"/g, '&quot;');
    escaped = escaped.replace(/'/g, '&#39;');
    return escaped;
  }

  function confirmEmail(rawToken, correlationId) {
    const token = S.normalizeText(rawToken);
    if (!token) throw E.ValidationError('Link de confirmação inválido.');
    S.enforceRateLimit('CONFIRM_EMAIL', token, C.RATE_LIMITS.CONFIRM_EMAIL.MAX_ATTEMPTS, C.RATE_LIMITS.CONFIRM_EMAIL.WINDOW_SECONDS);

    const tokenHash = S.hashToken(token);

    const profileId = App.Database.withTransaction(function (txn) {
      const consumed = txn.query(
        'UPDATE account_tokens SET used_at = now() ' +
          "WHERE token_hash = ? AND token_type = 'email_confirmation'::account_token_type " +
          '  AND used_at IS NULL AND expires_at > now() ' +
          'RETURNING profile_id',
        [tokenHash]
      );
      if (!consumed.length) return null;

      const id = consumed[0].profile_id;
      txn.execute('UPDATE profiles SET email_confirmed_at = now() WHERE id = ?::uuid AND email_confirmed_at IS NULL', [id]);
      return id;
    });

    if (!profileId) {
      App.Logging.logAudit(correlationId, null, 'CONFIRM_EMAIL', 'account_token', null, 'failure', null);
      throw E.ConflictError('Link de confirmação inválido, já utilizado ou expirado.');
    }

    App.Logging.logAudit(correlationId, profileId, 'CONFIRM_EMAIL', 'profile', profileId, 'success', null);
    return { success: true, message: 'E-mail confirmado com sucesso. Você já pode entrar.' };
  }

  function login(email, password, userAgent, correlationId) {
    const normalizedEmail = S.normalizeText(email).toLowerCase();
    const pwd = S.normalizeText(password);

    if (!S.isValidEmail(normalizedEmail) || !pwd) {
      throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);
    }

    S.enforceRateLimit('LOGIN', normalizedEmail, C.RATE_LIMITS.LOGIN.MAX_ATTEMPTS, C.RATE_LIMITS.LOGIN.WINDOW_SECONDS);

    const rows = App.Database.query(
      'SELECT id, role, status, full_name, email_confirmed_at, (password_hash = crypt(?, password_hash)) AS password_ok ' +
        'FROM profiles WHERE email = ? LIMIT 1',
      [pwd, normalizedEmail]
    );

    if (!rows.length) {
      // Mitiga enumeração por tempo de resposta: computa um crypt() equivalente
      // mesmo quando não há conta com esse e-mail.
      App.Database.query('SELECT crypt(?, ?) AS ignored', [pwd, DUMMY_BCRYPT_HASH]);
      App.Logging.logAudit(correlationId, null, 'LOGIN', 'profile', null, 'failure', null);
      throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);
    }

    const row = rows[0];
    const passwordOk = row.password_ok === true || row.password_ok === 'true' || row.password_ok === 't';
    const authorized = passwordOk && row.status === C.ACCOUNT_STATUS.ACTIVE && !!row.email_confirmed_at;

    if (!authorized) {
      App.Logging.logAudit(correlationId, row.id, 'LOGIN', 'profile', row.id, 'failure', null);
      throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);
    }

    const sessionToken = S.createSession(row.id, userAgent || '');
    App.Logging.logAudit(correlationId, row.id, 'LOGIN', 'profile', row.id, 'success', null);

    return {
      success: true,
      message: 'Login realizado com sucesso.',
      sessionToken: sessionToken,
      profile: { fullName: row.full_name, role: row.role },
    };
  }

  function logout(rawSessionToken, correlationId) {
    const identity = S.resolveSession(rawSessionToken);
    S.revokeSession(rawSessionToken);
    App.Logging.logAudit(correlationId, identity ? identity.profileId : null, 'LOGOUT', 'session', null, 'success', null);
    return { success: true, message: 'Sessão encerrada.' };
  }

  function requestPasswordReset(email, correlationId) {
    const normalizedEmail = S.normalizeText(email).toLowerCase();
    const generic = { success: true, message: 'Se o e-mail existir em nossa base, um link de redefinição será enviado.' };

    if (!S.isValidEmail(normalizedEmail)) {
      throw E.ValidationError('Informe um e-mail válido.');
    }

    S.enforceRateLimit('RESET_REQUEST', normalizedEmail, C.RATE_LIMITS.RESET_REQUEST.MAX_ATTEMPTS, C.RATE_LIMITS.RESET_REQUEST.WINDOW_SECONDS);

    const rows = App.Database.query(
      "SELECT id, full_name FROM profiles WHERE email = ? AND status = 'active'::account_status LIMIT 1",
      [normalizedEmail]
    );

    if (!rows.length) {
      App.Logging.logAudit(correlationId, null, 'REQUEST_PASSWORD_RESET', 'profile', null, 'success', null);
      return generic;
    }

    const profile = rows[0];
    const rawToken = S.generateRawToken();
    const tokenHash = S.hashToken(rawToken);

    App.Database.execute(
      'INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at) ' +
        "VALUES (?::uuid, ?::account_token_type, ?, now() + (? || ' minutes')::interval)",
      [profile.id, C.TOKEN_TYPE.PASSWORD_RESET, tokenHash, C.LIMITS.RESET_TOKEN_TTL_MINUTES]
    );

    const baseUrl = App.Config.getAppBaseUrl();
    const link = baseUrl + '?mode=reset&token=' + encodeURIComponent(rawToken);

    try {
      MailApp.sendEmail({
        to: normalizedEmail,
        subject: 'Redefinição de senha — ' + App.Config.getMailFromName(),
        body: 'Acesse o link para redefinir sua senha: ' + link + ' (expira em ' + C.LIMITS.RESET_TOKEN_TTL_MINUTES + ' minutos).',
        htmlBody:
          '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">' +
          '<h2>Redefinição de senha</h2>' +
          '<p><a href="' + link + '" target="_blank">Clique aqui para criar uma nova senha</a></p>' +
          '<p>Este link expira em ' + C.LIMITS.RESET_TOKEN_TTL_MINUTES + ' minutos.</p>' +
          '</div>',
        name: App.Config.getMailFromName(),
      });
    } catch (mailErr) {
      App.Logging.logError(correlationId, 'MAIL_RESET_FAILED', 'Falha ao enviar e-mail de redefinição.', { profileId: profile.id });
    }

    App.Logging.logAudit(correlationId, profile.id, 'REQUEST_PASSWORD_RESET', 'profile', profile.id, 'success', null);
    return generic;
  }

  function validateResetToken(rawToken) {
    const token = S.normalizeText(rawToken);
    if (!token) return { success: false, message: 'Link inválido.' };

    const tokenHash = S.hashToken(token);
    const rows = App.Database.query(
      "SELECT id FROM account_tokens WHERE token_hash = ? AND token_type = 'password_reset'::account_token_type " +
        '  AND used_at IS NULL AND expires_at > now() LIMIT 1',
      [tokenHash]
    );

    if (!rows.length) return { success: false, message: 'Este link é inválido, já foi usado ou expirou.' };
    return { success: true, message: 'Link válido.' };
  }

  function confirmPasswordReset(rawToken, newPassword, correlationId) {
    const token = S.normalizeText(rawToken);
    const pwd = S.normalizeText(newPassword);

    if (!token) throw E.ValidationError('Link de redefinição inválido.');
    S.enforceRateLimit('RESET_CONFIRM', token, C.RATE_LIMITS.RESET_CONFIRM.MAX_ATTEMPTS, C.RATE_LIMITS.RESET_CONFIRM.WINDOW_SECONDS);
    if (pwd.length < C.LIMITS.PASSWORD_MIN_LENGTH) {
      throw E.ValidationError('A nova senha deve ter pelo menos ' + C.LIMITS.PASSWORD_MIN_LENGTH + ' caracteres.');
    }

    const tokenHash = S.hashToken(token);

    const profileId = App.Database.withTransaction(function (txn) {
      const consumed = txn.query(
        'UPDATE account_tokens SET used_at = now() ' +
          "WHERE token_hash = ? AND token_type = 'password_reset'::account_token_type " +
          '  AND used_at IS NULL AND expires_at > now() ' +
          'RETURNING profile_id',
        [tokenHash]
      );
      if (!consumed.length) return null;

      const id = consumed[0].profile_id;
      txn.execute(
        "UPDATE profiles SET password_hash = crypt(?, gen_salt('bf', " + BCRYPT_COST + ')) WHERE id = ?::uuid',
        [pwd, id]
      );
      return id;
    });

    if (!profileId) {
      App.Logging.logAudit(correlationId, null, 'CONFIRM_PASSWORD_RESET', 'account_token', null, 'failure', null);
      throw E.ConflictError('Link inválido, já utilizado ou expirado.');
    }

    S.revokeAllSessionsForProfile(profileId);
    App.Logging.logAudit(correlationId, profileId, 'CONFIRM_PASSWORD_RESET', 'profile', profileId, 'success', null);
    return { success: true, message: 'Senha redefinida com sucesso. Faça login novamente.' };
  }

  return {
    register: register,
    confirmEmail: confirmEmail,
    login: login,
    logout: logout,
    requestPasswordReset: requestPasswordReset,
    validateResetToken: validateResetToken,
    confirmPasswordReset: confirmPasswordReset,
  };
})();
