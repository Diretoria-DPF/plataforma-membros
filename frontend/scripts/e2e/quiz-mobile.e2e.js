/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Quiz no celular (375x812 e 320x640): "Iniciar" à vista sem rolar, alvos de toque >= 44 px,
// sem rolagem horizontal e fluxo iniciar → responder → explicação.
const { startApp, check } = require('./harness');

async function medir(frame) {
  return frame.evaluate(() => {
    const botoes = [...document.querySelectorAll('button, .option, .topic-btn')].filter((e) => e.offsetParent && !e.closest('[hidden]'));
    const pequenos = botoes.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, w: r.width, h: r.height }; }).filter((x) => x.w < 44 || x.h < 44);
    const start = document.getElementById('startQuiz').getBoundingClientRect();
    return { pequenos, startVisivel: start.top >= 0 && start.bottom <= window.innerHeight, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
}

module.exports = async function quizMobile() {
  for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 640 }]) {
    const app = await startApp({ role: 'member', viewport });
    const rotulo = `${viewport.width}px`;
    try {
      await app.login();
      const frame = await app.openModule('farmaco');
      await frame.waitForSelector('#topicsGrid .topic-btn');
      const tela = await medir(frame);
      check(tela.startVisivel, `quiz ${rotulo}: "Iniciar Quiz" visível sem rolar a configuração`);
      check(tela.pequenos.length === 0, `quiz ${rotulo}: alvos de toque >= 44 px na configuração ${JSON.stringify(tela.pequenos)}`);
      check(!tela.overflow, `quiz ${rotulo}: sem rolagem horizontal`);
      await frame.click('#selectAll');
      await frame.click('.size-btn[data-size="5"]');
      await frame.click('#startQuiz');
      await frame.waitForSelector('#quizContainer:not([hidden]) .option');
      await frame.click('.option');
      await frame.waitForSelector('#explanation.show');
      const quest = await medir(frame);
      check(quest.pequenos.length === 0, `quiz ${rotulo}: alvos de toque >= 44 px na questão ${JSON.stringify(quest.pequenos)}`);
      check(!quest.overflow, `quiz ${rotulo}: questão sem rolagem horizontal`);
      check(app.errors.length === 0, `quiz ${rotulo}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
};
