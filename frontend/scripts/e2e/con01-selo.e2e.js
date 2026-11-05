/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * con01-selo.e2e.js — o público NÃO vê selo nem aviso de revisão nas questões; depois do gabarito há só um item
 * discreto "Reportar erro nesta questão", que envia pelo feedback existente (apiSubmitFeedback) sem expor o token.
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

    check(await frame.locator('.laift-review-seal').count() === 0, 'nenhum selo de revisão na questão');
    const texto = await frame.evaluate(() => document.getElementById('quizContainer').innerText);
    check(!/revisad|rascunho|por IA/i.test(texto), 'nenhum texto de revisão visível ao público');

    await frame.click('.option >> nth=0');
    await frame.waitForSelector('#explanation.show');
    const btn = frame.locator('.quiz-report-btn');
    check(await btn.count() === 1, 'um único item "Reportar erro" depois do gabarito');
    const box = await btn.boundingBox();
    check(box && box.height >= 44, 'alvo de toque do item >= 44px');

    await btn.click();
    await frame.waitForSelector('.laift-dialog[role="dialog"]');
    check(!/revisad/i.test(await frame.textContent('.laift-dialog-message')), 'diálogo sem texto de revisão');
    await app.page.keyboard.press('Escape');
    check(await frame.locator('.laift-dialog').count() === 0, 'Esc fecha sem enviar');
    check(!app.calls.worker.some((c) => c.action === 'apiSubmitFeedback'), 'nada é enviado ao fechar');

    await btn.click();
    await frame.waitForSelector('.laift-dialog[role="dialog"]');
    await frame.click('.laift-dialog-btn-primary');
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
