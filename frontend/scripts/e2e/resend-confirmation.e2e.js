/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * resend-confirmation.e2e.js — "Reenviar e-mail de confirmação" (SEC-02) em 375x812, sobre o BUILD.
 * Tela de entrada: o bloco abre, envia { email } a apiResendConfirmation, mostra a mensagem do servidor e
 * desabilita o botão com a contagem. Tela de cadastro: o bloco só aparece depois do sucesso, com o e-mail.
 */
const { startApp, check } = require('./harness');

const MSG = 'Se houver um cadastro aguardando confirmação para este e-mail, enviamos um novo link. Confira a caixa de entrada e o spam.';

module.exports = async function resendConfirmation() {
  const recebidos = [];
  const app = await startApp({
    viewport: { width: 375, height: 812 },
    workerHandlers: {
      apiResendConfirmation: (args) => { recebidos.push(args[0]); return { success: true, message: MSG, cooldownSeconds: 120 }; },
      apiRegister: () => ({ success: true, message: 'Enviamos um e-mail de confirmação se o endereço puder ser cadastrado.' }),
    },
  });
  try {
    const { page } = app;
    await page.goto(app.baseUrl);
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    const abrir = page.locator('[data-reenvio="resend-login"] .reenvio-confirmacao__abrir');
    check(await abrir.isVisible(), 'entrada: botão "Não recebeu o e-mail de confirmação?" visível');
    await abrir.click();
    await page.fill('#resend-login-email', 'pessoa@exemplo.com');
    const botao = page.locator('#resend-login-form button[type=submit]');
    const caixa = await botao.boundingBox();
    check(caixa && caixa.height >= 44, `entrada: botão de reenvio com alvo de 44px (${caixa && caixa.height})`);
    await botao.click();
    await page.waitForFunction((m) => document.getElementById('resend-login-msg').textContent === m, MSG, { timeout: 5000 });
    check(recebidos.length === 1 && recebidos[0] && recebidos[0].email === 'pessoa@exemplo.com', 'entrada: envia { email } a apiResendConfirmation');
    check(await botao.isDisabled(), 'entrada: botão desabilitado durante o intervalo mínimo');
    check(/^Reenviar em [12]:\d\d$/.test((await botao.textContent()).trim()), 'entrada: botão mostra a contagem');
    const transborda = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    check(transborda <= 0, `entrada: sem rolagem horizontal em 375px (${transborda})`);

    await page.click('#screen-welcome [data-nav="screen-register"]');
    await page.waitForSelector('#screen-register:not(.hidden)');
    check(!(await page.locator('[data-reenvio="resend-register"]').isVisible()), 'cadastro: bloco de reenvio escondido antes do cadastro');
    await page.fill('#reg-name', 'Nova Pessoa Teste');
    await page.fill('#reg-username', 'novapessoa');
    await page.fill('#reg-email', 'nova@exemplo.com');
    await page.fill('#reg-phone', '11999998888');
    await page.fill('#reg-password', 'senha12345');
    await page.check('#reg-terms');
    await page.check('#reg-privacy');
    await page.click('#form-register button[type=submit]');
    await page.waitForSelector('[data-reenvio="resend-register"]:not(.hidden)', { timeout: 5000 });
    await page.click('[data-reenvio="resend-register"] .reenvio-confirmacao__abrir');
    check((await page.inputValue('#resend-register-email')) === 'nova@exemplo.com', 'cadastro: o bloco aparece no sucesso, com o e-mail do cadastro');
    check(await page.locator('#resend-register-form button[type=submit]').isDisabled(), 'cadastro: a contagem é a mesma das duas telas');
  } finally {
    await app.close();
  }
};
