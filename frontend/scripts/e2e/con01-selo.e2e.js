/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * con01-selo.e2e.js — o aluno não vê selo nem texto de revisão nas questões
 * (regra do dono: o público só vê o conteúdo e interage; a aprovação fica com o admin).
 * A questão aparece normalmente, sem o selo ⓘ e sem dados de revisão.
 */
const { startApp, check } = require('./harness');

async function run() {
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
  try {
    await app.login();
    const frame = await app.openModule('farmaco');
    await frame.click('.topic-btn[data-topic="Coagulação"]');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');

    check(await frame.locator('.laift-review-seal').count() === 0, 'questão sem selo ⓘ de revisão');
    check(await frame.locator('.laift-review-seal-row').count() === 0, 'sem linha de selo');
    const texto = await frame.evaluate(() => (document.getElementById('quizContainer') || document.body).textContent || '');
    check(!/revisad|rascunho|auto-?draft|por IA|reportar erro/i.test(texto), 'sem texto de revisão na questão');
  } finally {
    check(app.errors.length === 0, 'con01-selo: sem erros de JavaScript');
    await app.close();
  }
}

module.exports = run;
