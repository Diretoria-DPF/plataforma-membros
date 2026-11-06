/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * marca.e2e.js — créditos (easter egg) do Perfil > Sobre, sobre o BUILD (frontend/dist/), em 360x740:
 * três toques na versão abrem a tela cheia, o nome anima, e Voltar (histórico), Esc e Fechar a fecham,
 * devolvendo o foco. Sem rolagem horizontal.
 */
const { startApp, check } = require('./harness');

const MOBILE = { width: 360, height: 740 };
const PRAZO_MS = 5000;

async function esperar(condicao) {
  const fim = Date.now() + PRAZO_MS;
  while (Date.now() < fim) {
    if (await condicao()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

module.exports = async function marca() {
  const app = await startApp({ role: 'member', viewport: MOBILE });
  try {
    await app.login();
    const page = app.page;
    await app.showPanel('panel-profile');
    const aberto = () => page.locator('#creditos').count().then((n) => n === 1);
    const textoVersao = await page.locator('#about-version').textContent();
    check(/^Versão v\d+/.test(textoVersao), `marca: a versão aparece no Sobre (${textoVersao})`);
    check(await page.locator('#about-card a[href="https://dpflabs.com"][rel~="noopener"]').count() === 1, 'marca: linha "desenvolvida por" com link noopener');

    // Dois toques não abrem; o terceiro, dentro da janela, abre.
    await page.locator('#about-version').scrollIntoViewIfNeeded();
    await page.locator('#about-version').click();
    await page.locator('#about-version').click();
    await page.waitForTimeout(200);
    check(!(await aberto()), 'marca: dois toques não abrem os créditos');
    await page.locator('#about-version').click();
    check(await esperar(aberto), 'marca: o terceiro toque seguido abre os créditos');

    const info = await page.evaluate(() => {
      const el = document.getElementById('creditos');
      const corre = el.querySelector('.creditos__corre--1');
      const fechar = el.querySelector('.creditos__fechar');
      return {
        role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), nome: getComputedStyle(corre).animationName,
        alturaFechar: fechar.getBoundingClientRect().height, foco: document.activeElement === fechar,
        rolagemH: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        historico: !!(history.state && history.state.laiftOverlay),
      };
    });
    check(info.role === 'dialog' && info.modal === 'true', 'marca: role=dialog e aria-modal');
    check(info.nome === 'creditos-passa', 'marca: o nome anima por keyframes');
    check(info.alturaFechar >= 44, `marca: botão Fechar com 44 px ou mais (${info.alturaFechar})`);
    check(info.foco, 'marca: o foco vai ao botão Fechar');
    check(!info.rolagemH, 'marca: sem rolagem horizontal em 360 px');
    const x1 = await page.evaluate(() => getComputedStyle(document.querySelector('.creditos__corre--1')).transform);
    await page.waitForTimeout(700);
    const x2 = await page.evaluate(() => getComputedStyle(document.querySelector('.creditos__corre--1')).transform);
    check(x1 !== x2, 'marca: o nome se move pela tela');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.classList.contains('creditos__fechar')), 'marca: o foco fica preso no diálogo');
    check(await esperar(() => page.evaluate(() => !!(history.state && history.state.laiftOverlay))), 'marca: o diálogo entra no histórico');

    // Voltar do Android.
    await page.goBack();
    check(await esperar(async () => !(await aberto())), 'marca: o Voltar fecha os créditos');
    check(await page.locator('#panel-profile:not(.hidden)').count() === 1, 'marca: continua no Perfil depois do Voltar');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'about-version'), 'marca: o foco volta à versão');

    // Esc.
    for (let i = 0; i < 3; i++) await page.locator('#about-version').click();
    check(await esperar(aberto), 'marca: abre de novo');
    await page.keyboard.press('Escape');
    check(await esperar(async () => !(await aberto())), 'marca: Esc fecha');
    await page.waitForTimeout(400);

    // Botão Fechar.
    for (let i = 0; i < 3; i++) await page.locator('#about-version').click();
    check(await esperar(aberto), 'marca: abre pela terceira vez');
    await page.locator('.creditos__fechar').click();
    check(await esperar(async () => !(await aberto())), 'marca: Fechar fecha');
    await page.waitForTimeout(400);
    check(await page.locator('#panel-profile:not(.hidden)').count() === 1, 'marca: Fechar mantém o Perfil');
    check(app.errors.length === 0, `marca: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
};
