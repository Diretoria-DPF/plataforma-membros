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
    check(app.errors.length === 0, `voltar: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
};
