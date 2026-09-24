/**
 * ProfileService.gs
 * Consulta e edição do próprio perfil, preferências e envio de feedback.
 * E-mail, papel, status e campos administrativos NÃO são editáveis aqui —
 * exigem fluxos próprios (ver AuthService.gs para e-mail/senha e
 * AdminService.gs para papel/status).
 */
App.ProfileService = (function () {
  const C = App.Constants;
  const S = App.Security;
  const E = App.Errors;

  function getMyProfile(identity) {
    const rows = App.Database.query(
      'SELECT p.full_name AS full_name, p.email AS email, p.phone AS phone, p.city AS city, ' +
        '       p.education AS education, p.role AS role, p.created_at AS created_at, ' +
        '       pr.theme AS theme, pr.density AS density, pr.email_notifications AS email_notifications ' +
        'FROM profiles p LEFT JOIN preferences pr ON pr.profile_id = p.id ' +
        'WHERE p.id = ?::uuid LIMIT 1',
      [identity.profileId]
    );

    if (!rows.length) throw E.NotFoundError('Perfil não encontrado.');
    const row = rows[0];

    return {
      success: true,
      profile: {
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        city: row.city,
        education: row.education,
        role: row.role,
        memberSince: row.created_at,
      },
      preferences: {
        theme: row.theme || C.THEME.SYSTEM,
        density: row.density || C.DENSITY.STANDARD,
        emailNotifications: row.email_notifications !== false,
      },
    };
  }

  function updateMyProfile(identity, input, correlationId) {
    const fullName = S.normalizeText(input.fullName);
    const phone = S.normalizeText(input.phone);
    const city = S.normalizeText(input.city);
    const education = S.normalizeText(input.education);

    if (!S.isLengthValid(fullName, C.LIMITS.NAME_MIN, C.LIMITS.NAME_MAX)) {
      throw E.ValidationError('Informe um nome completo válido.');
    }
    if (!S.isLengthValid(phone, C.LIMITS.PHONE_MIN, C.LIMITS.PHONE_MAX)) {
      throw E.ValidationError('Informe um telefone válido.');
    }
    if (city && city.length > C.LIMITS.CITY_MAX) throw E.ValidationError('Cidade inválida.');
    if (education && education.length > C.LIMITS.EDUCATION_MAX) throw E.ValidationError('Escolaridade inválida.');

    App.Database.execute(
      'UPDATE profiles SET full_name = ?, phone = ?, city = ?, education = ? WHERE id = ?::uuid',
      [fullName, phone, city || null, education || null, identity.profileId]
    );

    App.Logging.logAudit(correlationId, identity.profileId, 'UPDATE_PROFILE', 'profile', identity.profileId, 'success', null);
    return { success: true, message: 'Perfil atualizado com sucesso.' };
  }

  function updateMyPreferences(identity, input, correlationId) {
    const theme = S.normalizeText(input.theme);
    const density = S.normalizeText(input.density);
    const emailNotifications = input.emailNotifications === true;

    if (Object.keys(C.THEME).map(function (k) { return C.THEME[k]; }).indexOf(theme) === -1) {
      throw E.ValidationError('Tema inválido.');
    }
    if (Object.keys(C.DENSITY).map(function (k) { return C.DENSITY[k]; }).indexOf(density) === -1) {
      throw E.ValidationError('Densidade inválida.');
    }

    App.Database.execute(
      'UPDATE preferences SET theme = ?::theme_preference, density = ?::density_preference, email_notifications = ? ' +
        'WHERE profile_id = ?::uuid',
      [theme, density, emailNotifications, identity.profileId]
    );

    App.Logging.logAudit(correlationId, identity.profileId, 'UPDATE_PREFERENCES', 'profile', identity.profileId, 'success', null);
    return { success: true, message: 'Preferências atualizadas.' };
  }

  function submitFeedback(identity, message, correlationId) {
    const text = S.normalizeText(message);
    if (!S.isLengthValid(text, C.LIMITS.FEEDBACK_MIN, C.LIMITS.FEEDBACK_MAX)) {
      throw E.ValidationError('A mensagem deve ter entre ' + C.LIMITS.FEEDBACK_MIN + ' e ' + C.LIMITS.FEEDBACK_MAX + ' caracteres.');
    }

    App.Database.execute('INSERT INTO feedback (profile_id, message) VALUES (?::uuid, ?)', [identity.profileId, text]);
    App.Logging.logAudit(correlationId, identity.profileId, 'SUBMIT_FEEDBACK', 'feedback', null, 'success', null);
    return { success: true, message: 'Obrigado! Seu feedback foi enviado.' };
  }

  return {
    getMyProfile: getMyProfile,
    updateMyProfile: updateMyProfile,
    updateMyPreferences: updateMyPreferences,
    submitFeedback: submitFeedback,
  };
})();
