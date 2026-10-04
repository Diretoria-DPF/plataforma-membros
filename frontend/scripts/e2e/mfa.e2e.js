/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mfa.e2e.js — verificação em duas etapas (frontend/mfa.js + app.js).
 * Login com segundo passo, erro de código, cadastro com códigos de recuperação
 * e o redirecionamento do admin sem autenticador (mfaSetupRequired).
 */
const { startApp, check } = require('./harness');

module.exports = async function mfa() {
  // ---- Login com MFA: a senha sozinha NÃO entra; o código entra ----
  const calls = [];
  const login = await startApp({
    role: 'member',
    workerHandlers: {
      apiLogin: () => ({ success: true, mfaRequired: true, mfaToken: 'desafio-de-teste' }),
      apiLoginMfa: (args) => {
        calls.push(args);
        return args[1] === '123456'
          ? { success: true, sessionToken: 'e2e-session-token', profile: { fullName: 'Ana Teste', role: 'member' } }
          : { success: false, message: 'Código inválido ou já utilizado.' };
      },
    },
  });
  try {
    const page = login.page;
    await page.goto(login.baseUrl);
    await page.fill('#login-email', 'ana@exemplo.com');
    await page.fill('#login-password', 'senha-de-teste-123');
    await page.click('#form-login button[type=submit]');
    await page.waitForSelector('#form-login-mfa:not(.hidden)');
    check(await page.locator('#form-login.hidden').count() === 1, 'depois da senha aparece o campo do código e o formulário de senha some');
    check(await page.locator('#app-root.hidden').count() === 1, 'sem o código ainda não há sessão: o app continua fechado');

    await page.fill('#login-mfa-code', '000000');
    await page.click('#form-login-mfa button[type=submit]');
    await page.waitForFunction(() => /inválido/.test(document.getElementById('msg-login').textContent));
    check(await page.locator('#app-root.hidden').count() === 1, 'código errado mostra o erro e não entra');

    await page.fill('#login-mfa-code', '123 456');
    await page.click('#form-login-mfa button[type=submit]');
    await page.waitForSelector('#app-root:not(.hidden)');
    check(calls[1] && calls[1][0] === 'desafio-de-teste' && calls[1][1] === '123456', 'o código vai normalizado (sem espaço) junto com o desafio');
    check(login.errors.length === 0, 'sem erros de página no login com MFA (' + login.errors.join('; ') + ')');
  } finally {
    await login.close();
  }

  // ---- "Voltar" desfaz o segundo passo ----
  const back = await startApp({
    role: 'member',
    workerHandlers: { apiLogin: () => ({ success: true, mfaRequired: true, mfaToken: 't' }) },
  });
  try {
    await back.page.goto(back.baseUrl);
    await back.page.fill('#login-email', 'ana@exemplo.com');
    await back.page.fill('#login-password', 'x');
    await back.page.click('#form-login button[type=submit]');
    await back.page.waitForSelector('#form-login-mfa:not(.hidden)');
    await back.page.click('#btn-login-mfa-back');
    await back.page.waitForSelector('#form-login:not(.hidden)');
    check(await back.page.locator('#form-login-mfa.hidden').count() === 1, '"Voltar" restaura o formulário de senha');
  } finally {
    await back.close();
  }

  // ---- Cadastro no perfil: QR, confirmação e códigos de recuperação ----
  const enroll = await startApp({
    role: 'member',
    workerHandlers: {
      apiMfaBeginEnrollment: () => ({ success: true, secret: 'JBSWY3DPEHPK3PXP', issuer: 'LAIFT', otpauthUri: 'otpauth://totp/LAIFT:ana?secret=JBSWY3DPEHPK3PXP&issuer=LAIFT' }),
      apiMfaConfirmEnrollment: (args) => (args[1] === '654321'
        ? { success: true, message: 'Verificação em duas etapas ativada.', recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] }
        : { success: false, message: 'Código inválido.' }),
    },
  });
  try {
    await enroll.login();
    await enroll.showPanel('panel-profile');
    await enroll.page.waitForSelector('#mfa-card-body button');
    await enroll.page.click('#mfa-card-body button');
    await enroll.page.waitForSelector('#mfa-confirm-code');
    check((await enroll.page.textContent('#mfa-card-body')).includes('JBSW Y3DP EHPK 3PXP'), 'a chave aparece agrupada de 4 em 4');
    await enroll.page.waitForSelector('#mfa-card-body img[src^="data:image"]');
    check(true, 'o QR Code é desenhado a partir do URI otpauth');

    await enroll.page.fill('#mfa-confirm-code', '654321');
    await enroll.page.click('#mfa-card-body button:has-text("Confirmar")');
    await enroll.page.waitForSelector('.mfa-codes li');
    check(await enroll.page.locator('.mfa-codes li').count() === 2, 'os códigos de recuperação são exibidos');
    check(await enroll.page.locator('#mfa-card-body button:has-text("Concluir")').isDisabled(), '"Concluir" só libera depois de marcar que guardou os códigos');
    await enroll.page.check('#mfa-codes-saved');
    check(await enroll.page.locator('#mfa-card-body button:has-text("Concluir")').isEnabled(), 'marcar "guardei" libera o "Concluir"');
    check(enroll.errors.length === 0, 'sem erros de página no cadastro (' + enroll.errors.join('; ') + ')');
  } finally {
    await enroll.close();
  }

  // ---- Admin sem autenticador: qualquer ação de admin leva ao cadastro ----
  const required = await startApp({
    role: 'admin',
    workerHandlers: {
      apiLogin: (_a, ctx) => ({ success: true, sessionToken: ctx.sessionToken, profile: { fullName: 'Ana Teste', role: 'admin' }, mfaSetupRequired: true }),
      apiMfaStatus: () => ({ success: true, enabled: false, pendingEnrollment: false, recoveryCodesLeft: 0, required: true }),
    },
  });
  try {
    await required.login();
    await required.page.waitForSelector('#panel-profile:not(.hidden)');
    check((await required.page.textContent('#mfa-card-body')).includes('obrigatória'), 'admin sem MFA cai direto no cartão, com o aviso de obrigatoriedade');
  } finally {
    await required.close();
  }
};
