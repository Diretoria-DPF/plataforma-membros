/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant-drag.e2e.js — a Lia pode ser movida para qualquer ponto da tela (frontend/assistant-drag.js).
 *  - um toque sem arrastar abre a Lia como sempre; arrastar move a bolha e NÃO abre o painel;
 *  - o painel abre junto da bolha, sempre dentro da tela; no desktop o cabeçalho também arrasta o painel;
 *  - Alt + setas movem pelo teclado; "Voltar ao canto" desfaz; a posição fica guardada e acompanha o tamanho da janela.
 */
const { startApp, check } = require('./harness');

const FLAGS_ON = () => ({ success: true, flags: { chatbot_enabled: true } });
const dentro = (r, vw, vh) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw + 0.5 && r.y + r.h <= vh + 0.5;

async function rect(page, selector) {
  return page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, selector);
}

async function arrastar(page, de, para) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move((de.x + para.x) / 2, (de.y + para.y) / 2, { steps: 4 });
  await page.mouse.move(para.x, para.y, { steps: 4 });
  await page.mouse.up();
}

async function cenario(rotulo, viewport) {
  const app = await startApp({ role: 'member', viewport, workerHandlers: { apiGetFeatureFlags: FLAGS_ON } });
  const { page } = app;
  try {
    await app.login();
    await page.waitForSelector('#lia-launcher:not(.hidden)', { timeout: 15000 });
    const origem = await rect(page, '#lia-launcher');
    const centro = { x: origem.x + origem.w / 2, y: origem.y + origem.h / 2 };

    // 1) toque sem arrastar abre e fecha como sempre
    await page.click('#lia-launcher');
    check(await page.evaluate(() => !document.getElementById('lia-panel').classList.contains('hidden')), `${rotulo}: um toque sem arrastar abre a Lia`);
    await page.click('#lia-panel .lia-close'); // no canto de origem o painel cobre a bolha: fecha-se pelo ×
    check(await page.evaluate(() => document.getElementById('lia-panel').classList.contains('hidden')), `${rotulo}: e o × fecha`);
    check(await page.evaluate(() => !document.documentElement.hasAttribute('data-lia-moved')), `${rotulo}: sem arrastar, a Lia fica no canto de origem`);

    // 2) arrastar move a bolha e não abre o painel
    const alvo = { x: Math.round(viewport.width * 0.3), y: Math.round(viewport.height * 0.3) };
    await arrastar(page, centro, alvo);
    const movida = await rect(page, '#lia-launcher');
    check(Math.abs(movida.x + movida.w / 2 - alvo.x) < 12 && Math.abs(movida.y + movida.h / 2 - alvo.y) < 12, `${rotulo}: a bolha foi para onde foi arrastada (${Math.round(movida.x)},${Math.round(movida.y)})`);
    check(await page.evaluate(() => document.getElementById('lia-panel').classList.contains('hidden')), `${rotulo}: arrastar não abre o painel`);
    const guardado = await page.evaluate(() => window.localStorage.getItem('laift_lia_pos_v1'));
    check(!!guardado && /"l":\{"fx":/.test(guardado), `${rotulo}: a posição fica guardada neste aparelho`);

    // 3) arrastar para fora da tela é contido
    await arrastar(page, { x: movida.x + movida.w / 2, y: movida.y + movida.h / 2 }, { x: viewport.width + 200, y: viewport.height + 200 });
    const canto = await rect(page, '#lia-launcher');
    check(dentro(canto, viewport.width, viewport.height), `${rotulo}: a bolha nunca sai da tela`);

    // 4) o painel abre dentro da tela, junto da bolha
    await page.click('#lia-launcher');
    const painel = await rect(page, '#lia-panel');
    check(dentro(painel, viewport.width, viewport.height), `${rotulo}: o painel abre inteiro dentro da tela (${Math.round(painel.x)},${Math.round(painel.y)} ${Math.round(painel.w)}x${Math.round(painel.h)})`);
    if (viewport.width > 480) {
      // desktop: o cabeçalho arrasta o painel
      const antes = await rect(page, '#lia-panel');
      await arrastar(page, { x: antes.x + 120, y: antes.y + 20 }, { x: antes.x + 40, y: antes.y + 120 });
      const depois = await rect(page, '#lia-panel');
      check(Math.abs(depois.x - antes.x) > 30 && dentro(depois, viewport.width, viewport.height), `${rotulo}: o cabeçalho arrasta o painel e ele continua dentro da tela`);
      check(await page.evaluate(() => /"p":\{"fx":/.test(window.localStorage.getItem('laift_lia_pos_v1') || '')), `${rotulo}: a posição do painel também fica guardada`);
      await page.click('#lia-panel .lia-close');
    } else {
      check(painel.w >= viewport.width - 20, `${rotulo}: no celular o painel continua ocupando a largura`);
      await page.click('#lia-panel .lia-close');
    }

    // 5) teclado: Alt + seta
    const antesTecla = await rect(page, '#lia-launcher');
    await page.focus('#lia-launcher');
    await page.keyboard.press('Alt+ArrowLeft');
    const depoisTecla = await rect(page, '#lia-launcher');
    check(depoisTecla.x < antesTecla.x || antesTecla.x <= 8.5, `${rotulo}: Alt + seta move a bolha pelo teclado`);

    // 6) a janela muda de tamanho: a bolha continua visível
    const menor = { width: Math.max(320, viewport.width - 120), height: Math.max(480, viewport.height - 160) };
    await page.setViewportSize(menor);
    await page.waitForTimeout(150);
    check(dentro(await rect(page, '#lia-launcher'), menor.width, menor.height), `${rotulo}: ao mudar o tamanho da janela a bolha continua na tela`);
    await page.setViewportSize(viewport);

    // 7) voltar ao canto
    await page.click('#lia-launcher');
    await page.click('.lia-reset-pos');
    check(await page.evaluate(() => !document.documentElement.hasAttribute('data-lia-moved') && !window.localStorage.getItem('laift_lia_pos_v1')), `${rotulo}: "Voltar ao canto" desfaz a posição`);
    const volta = await rect(page, '#lia-launcher');
    check(Math.abs(volta.x + volta.w - (viewport.width - 16)) < 20, `${rotulo}: a bolha voltou ao canto direito (${Math.round(volta.x + volta.w)} de ${viewport.width})`);

    check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function assistantDrag() {
  await cenario('desktop 1280', { width: 1280, height: 800 });
  await cenario('celular 375', { width: 375, height: 812 });
};
