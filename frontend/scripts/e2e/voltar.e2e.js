/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * voltar.e2e.js — botão Voltar do Android (MOB-01), sobre o BUILD (frontend/dist/): cada troca de painel
 * entra no histórico, "voltar" reabre o painel anterior e, na Início, não faz o app abrir outro painel.
 * Um cenário em 375x812 (celular).
 */
const { startApp, check } = require('./harness');

const MOBILE = { width: 375, height: 812 };
const PRAZO_MS = 5000;

async function esperar(condicao) {
  const fim = Date.now() + PRAZO_MS;
  while (Date.now() < fim) {
    if (await condicao()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

const visivel = (page, id) => page.locator(`#${id}:not(.hidden)`).count().then((n) => n === 1);

/** TRA-03: o módulo aberto entra na pilha; Voltar do navegador, Esc e "← Voltar" fecham o módulo e ficam no Aprender. */
async function moduloNoHistorico(app) {
  const page = app.page;
  const moduloAberto = () => page.locator('#learn-viewer:not(.hidden)').count().then((n) => n === 1);
  const hubAberto = () => page.locator('#learn-hub:not(.hidden)').count().then((n) => n === 1);

  await app.showPanel('panel-learn');
  await page.click('.learn-card[data-module="farmaco"]');
  check(await esperar(moduloAberto), 'voltar: o cartão abre o módulo');
  const estado = await page.evaluate(() => history.state);
  check(estado && estado.panel === 'panel-learn' && estado.module === 'farmaco', 'voltar: o histórico guarda o módulo aberto');

  await page.goBack();
  check(await esperar(hubAberto), 'voltar: o Voltar do navegador fecha o módulo e mostra a lista do Aprender');
  check(!(await moduloAberto()) && await visivel(page, 'panel-learn'), 'voltar: continua no Aprender, sem visualizador aberto');
  await page.goForward();
  check(await esperar(moduloAberto), 'voltar: avançar reabre o módulo');
  await page.goBack();
  check(await esperar(hubAberto), 'voltar: fecha de novo');
  await page.goBack();
  check(await esperar(() => visivel(page, 'panel-home')), 'voltar: o voltar seguinte vai à Início, já sem módulo aberto');
  check(!(await moduloAberto()), 'voltar: nenhum módulo aberto na Início');

  await app.showPanel('panel-learn');
  await page.click('.learn-card[data-module="toxico"]');
  check(await esperar(moduloAberto), 'voltar: abre Toxicologia');
  await page.keyboard.press('Escape');
  check(await esperar(hubAberto), 'voltar: Esc fecha o módulo');
  await page.click('.learn-card[data-module="toxico"]');
  await page.click('#learn-back');
  check(await esperar(hubAberto), 'voltar: "← Voltar" fecha o módulo');
  await page.goBack();
  check(await esperar(() => visivel(page, 'panel-home')) && !(await moduloAberto()), 'voltar: depois do botão da tela, o Voltar do navegador não reabre o módulo');
}

module.exports = async function voltar() {
  const app = await startApp({ role: 'member', viewport: MOBILE });
  try {
    await app.login();
    const page = app.page;
    check(await visivel(page, 'panel-home'), 'voltar: depois do login a Início está aberta');
    await app.showPanel('panel-learn');
    await app.showPanel('panel-events');
    check(await visivel(page, 'panel-events'), 'voltar: Eventos aberto');

    await page.goBack();
    check(await esperar(() => visivel(page, 'panel-learn')), 'voltar: 1º voltar reabre Aprender');
    await page.goBack();
    check(await esperar(() => visivel(page, 'panel-home')), 'voltar: 2º voltar reabre a Início');
    check(page.url().startsWith(app.baseUrl), 'voltar: continua dentro do app (não saiu da página)');

    await page.goForward();
    check(await esperar(() => visivel(page, 'panel-learn')), 'voltar: avançar reabre Aprender');
    const estado = await page.evaluate(() => history.state);
    check(estado && estado.laift === 'panel' && estado.panel === 'panel-learn', 'voltar: o estado do histórico guarda só o nome do painel');
    await moduloNoHistorico(app);
    check(app.errors.length === 0, `voltar: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
};
