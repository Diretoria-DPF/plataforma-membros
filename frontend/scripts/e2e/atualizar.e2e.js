/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atualizar.e2e.js — botão "Atualizar o aplicativo" no Perfil (frontend/app-update.js): apaga as cópias guardadas
 * (laift-shell- e atlas-), recarrega a página e a pessoa continua conectada; os outros caches e os dados ficam.
 */
const { startApp, check } = require('./harness');

const PRAZO_MS = 8000;

module.exports = async function atualizar() {
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 800 } });
  try {
    await app.login();
    const page = app.page;
    // Caches de mentira: dois do app/Atlas (somem) e um alheio (fica); e um dado do aparelho (fica).
    await page.evaluate(async () => {
      for (const n of ['laift-shell-antigo', 'atlas-antigo', 'cache-alheio']) await (await caches.open(n)).put('/x', new Response('x'));
      localStorage.setItem('marcador-de-teste', 'fica');
    });
    await app.showPanel('panel-profile');
    check(await page.locator('#btn-app-update').count() === 1, 'atualizar: o botão está no Perfil');

    const recarregou = page.waitForNavigation({ timeout: PRAZO_MS }).then(() => true, () => false);
    await page.click('#btn-app-update');
    check(await recarregou, 'atualizar: a página recarrega depois de limpar as cópias');
    await page.waitForSelector('#app-root:not(.hidden)', { timeout: PRAZO_MS }).catch(() => {});
    check(await page.locator('#app-root:not(.hidden)').count() === 1, 'atualizar: a pessoa continua conectada depois de recarregar');

    const depois = await page.evaluate(async () => ({ caches: await caches.keys(), marcador: localStorage.getItem('marcador-de-teste') }));
    check(!depois.caches.includes('laift-shell-antigo') && !depois.caches.includes('atlas-antigo'), 'atualizar: as cópias do app e do Atlas foram apagadas');
    check(depois.caches.includes('cache-alheio'), 'atualizar: cache de outra origem de dados ficou intacto');
    check(depois.marcador === 'fica', 'atualizar: os dados do aparelho (localStorage) ficaram intactos');
    check(app.errors.length === 0, `atualizar: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
};
