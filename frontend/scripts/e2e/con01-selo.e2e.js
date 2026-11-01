/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * con01-selo.e2e.js — CON-01: questão sem revisor mostra o selo ⓘ discreto; ao tocar abre o diálogo acessível
 * com a explicação e "Reportar erro", que envia pelo feedback existente (apiSubmitFeedback) sem expor o token.
 */
const { startApp, check } = require('./harness');

async function run() {
  const app = await startApp({
    role: 'member',
    viewport: { width: 390, height: 844 },
    workerHandlers: { apiSubmitFeedback: () => ({ success: true, message: 'Obrigado! Seu feedback foi enviado.' }) },
  });
  try {
    await app.login();
    const frame = await app.openModule('farmaco');
    await frame.click('.topic-btn[data-topic="Coagulação"]');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');

    const seals = frame.locator('.laift-review-seal');
    check(await seals.count() === 1, 'questão sem revisor mostra um único selo ⓘ');
    const box = await seals.first().boundingBox();
    check(box && box.width >= 44 && box.height >= 44, 'alvo de toque do selo >= 44px');
    check(/ainda não revisada por profissional/i.test(await seals.first().getAttribute('aria-label')), 'selo tem nome acessível');

    await seals.first().click();
    await frame.waitForSelector('.laift-dialog[role="dialog"]');
    check(/não foi revisada por um profissional/.test(await frame.textContent('.laift-dialog-message')), 'toque abre a explicação');
    await app.page.keyboard.press('Escape');
    check(await frame.locator('.laift-dialog').count() === 0, 'Esc fecha sem enviar');
    check(!app.calls.worker.some((c) => c.action === 'apiSubmitFeedback'), 'nada é enviado ao fechar');

    await seals.first().click();
    await frame.waitForSelector('.laift-dialog[role="dialog"]');
    await frame.click('.laift-dialog-btn-primary'); // Reportar erro
    await frame.waitForFunction(() => /Obrigado/.test((document.querySelector('.laift-dialog-message') || {}).textContent || ''));
    const call = app.calls.worker.find((c) => c.action === 'apiSubmitFeedback');
    check(!!call && call.args[0] === app.ctx.sessionToken, 'Reportar erro usa o feedback existente, com o token anexado só pela plataforma');
    check(!!call && /^\[Erro de conteúdo\] questão/.test(call.args[1]) && /farmacologia/.test(call.args[1]), 'mensagem identifica módulo e questão (' + (call && call.args[1]) + ')');
    await frame.click('.laift-dialog-btn-primary');
    check(await frame.locator('.laift-dialog').count() === 0, 'agradecimento fecha');
  } finally {
    check(app.errors.length === 0, 'con01-selo: sem erros de JavaScript');
    await app.close();
  }
}

module.exports = run;
