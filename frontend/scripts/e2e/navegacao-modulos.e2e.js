/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * navegacao-modulos.e2e.js — módulo aberto no Aprender (TRA-02, 05/06/07, 08):
 *  - 1280 px com home_v2_enabled: a coluna lateral não cobre o "← Voltar" do módulo imersivo (Atlas);
 *  - a Guia (botão flutuante) fica fora da aba do Laboratório, da ficha do Atlas e dos botões da barra do módulo;
 *  - módulo com falha de carga mostra a mensagem do app com "Tentar de novo" e volta ao normal ao tentar de novo.
 */
const { startApp, check } = require('./harness');

const FLAGS = () => ({ success: true, flags: { home_v2_enabled: true, chatbot_enabled: true } });
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openModule(page, id) {
  await page.evaluate((moduleId) => { window.App.showPanel('panel-learn'); window.LaiftLearning.openModule(moduleId); }, id);
  await page.waitForSelector('#learn-viewer:not(.hidden)', { state: 'attached', timeout: 5000 });
  await assentar(page);
}

/**
 * Espera o layout assentar (estado, não tempo fixo): a folha home-v3.css (--v3-rail) já carregou, quando a flag está
 * ligada, e nenhuma transição/animação CSS finita está rodando (as infinitas, como as folhas e o respirar da Guia, e as já concluídas não contam) por dois quadros seguidos. Sem isso, a medida cai no meio
 * do deslizamento do módulo (x=516 -> 248) ou antes da folha (coluna com 1280 px), e o teste falha de vez em quando.
 */
async function assentar(page) {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    if (root.hasAttribute('data-flag-home-v2-enabled') && !getComputedStyle(root).getPropertyValue('--v3-rail').trim()) return false;
    if (document.getAnimations().some((an) => an.playState === 'running' && an.effect && an.effect.getComputedTiming().iterations !== Infinity && an.effect.getComputedTiming().progress !== null)) { window.__quadrosParados = 0; return false; }
    window.__quadrosParados = (window.__quadrosParados || 0) + 1;
    return window.__quadrosParados >= 2;
  }, null, { timeout: 8000, polling: 'raf' });
}

async function box(locator) {
  return locator.evaluate((n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
}

async function scenarioRail() {
  console.log('\n— 1280x800 com a Início v3: a coluna lateral não cobre o módulo');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: { apiGetFeatureFlags: FLAGS } });
  try {
    await app.login();
    const page = app.page;
    check(await page.evaluate(() => document.documentElement.hasAttribute('data-flag-home-v2-enabled')), 'a flag home_v2_enabled está ligada');
    await openModule(page, 'anatomia');
    const back = await box(page.locator('#learn-back'));
    const nav = await box(page.locator('#app-nav'));
    check(!intersects(back, nav), 'o "← Voltar" não fica sob a navegação lateral');
    const topEl = await page.evaluate(() => {
      const r = document.getElementById('learn-back').getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && (el.id || el.tagName);
    });
    check(topEl === 'learn-back', 'o ponto central do "← Voltar" é dele mesmo (' + topEl + ')');
    const viewer = await box(page.locator('#learn-viewer'));
    check(viewer.x >= nav.x + nav.width - 1, 'o módulo imersivo começa depois da coluna lateral');
    await page.click('#learn-back', { timeout: 3000 });
    check(await page.locator('#learn-hub:not(.hidden)').count() === 1, 'clicar em "← Voltar" volta ao hub (sem o clique cair no menu)');

    // Guia fora dos controles de cada módulo.
    for (const id of ['lab', 'anatomia', 'farmaco']) {
      await openModule(page, id);
      const launcher = page.locator('#lia-launcher');
      if (!(await launcher.count()) || !(await launcher.isVisible())) { check(false, 'a Guia aparece com o módulo ' + id); continue; }
      const g = await box(launcher);
      const frame = await box(page.locator('#learn-frames iframe:not(.hidden)'));
      const bottomBand = { x: frame.x, y: frame.y + frame.height - 140, width: frame.width, height: 140 };
      check(!intersects(g, bottomBand), id + ': a Guia não cobre a faixa de baixo do módulo (abas e fichas)');
      const fs = await box(page.locator('#learn-fullscreen'));
      check(!intersects(g, fs), id + ': a Guia não cobre "Tela cheia"');
      check(!intersects(g, await box(page.locator('#learn-back'))), id + ': a Guia não cobre "← Voltar"');
      if (id === 'lab') {
        await page.frameLocator('#learn-frames iframe:not(.hidden)').locator('.m-nav-btn').first().waitFor({ state: 'attached', timeout: 15000 });
        await assentar(page);
        const tabs = await page.frameLocator('#learn-frames iframe:not(.hidden)').locator('.m-nav-btn').evaluateAll((nodes) => nodes.map((n) => {
          const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height };
        }));
        const off = await box(page.locator('#learn-frames iframe:not(.hidden)'));
        const hit = tabs.some((t) => t.width && intersects(g, { x: t.x + off.x, y: t.y + off.y, width: t.width, height: t.height }));
        check(!hit, 'lab: a Guia não cobre as abas do módulo (' + tabs.length + ' abas)');
      }
      await page.click('#learn-back');
    }
    check(app.errors.length === 0, 'sem erros de página (' + app.errors.join('; ') + ')');
  } finally {
    await app.close();
  }
}

async function scenarioGuiaCelular() {
  console.log('\n— 375x812: a Guia fora das abas do Laboratório');
  const app = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: { apiGetFeatureFlags: FLAGS } });
  try {
    await app.login();
    const page = app.page;
    await openModule(page, 'lab');
    const launcher = page.locator('#lia-launcher');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await page.frameLocator('#learn-frames iframe:not(.hidden)').locator('.m-nav-btn').first().waitFor({ state: 'attached', timeout: 15000 });
    await assentar(page);
    const g = await box(launcher);
    const tabs = await page.frameLocator('#learn-frames iframe:not(.hidden)').locator('.m-nav-btn').evaluateAll((nodes) => nodes.map((n) => {
      const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height };
    }));
    const off = await box(page.locator('#learn-frames iframe:not(.hidden)'));
    const hit = tabs.some((t) => t.width && intersects(g, { x: t.x + off.x, y: t.y + off.y, width: t.width, height: t.height }));
    check(tabs.length > 0 && !hit, 'celular, lab: a Guia não cobre as abas do módulo');
    check(g.width >= 44 && g.height >= 44, 'a Guia mantém alvo de pelo menos 44 px');
    await page.click('#learn-back');
    const attr = await page.evaluate(() => document.documentElement.hasAttribute('data-learn-module'));
    check(!attr, 'ao voltar ao hub, a Guia volta ao canto de sempre');
  } finally {
    await app.close();
  }
}

async function scenarioErro() {
  console.log('\n— módulo que não carrega: mensagem do app e "Tentar de novo"');
  const app = await startApp({ role: 'member', viewport: { width: 375, height: 812 } });
  try {
    await app.login();
    const page = app.page;
    await page.route('**/modulos/quiz/index.html*', (route) => route.abort('internetdisconnected'));
    await openModule(page, 'farmaco');
    await page.waitForSelector('.learn-frame-state:not(.hidden) .learn-frame-retry', { timeout: 8000 });
    const msg = await page.textContent('.learn-frame-state:not(.hidden) .learn-frame-state-text');
    check(/módulo/i.test(msg || '') || /conexão/i.test(msg || ''), 'mensagem do app, não a página do navegador (' + msg + ')');
    await page.unroute('**/modulos/quiz/index.html*');
    await page.click('.learn-frame-retry');
    await page.waitForSelector('.learn-frame-state.hidden', { state: 'attached', timeout: 8000 });
    const shown = await page.locator('.learn-frame-state:not(.hidden)').count();
    check(shown === 0, 'depois de "Tentar de novo" o módulo aparece e o cartão some');
    const title = await page.frameLocator('#learn-frames iframe:not(.hidden)').locator('body').count();
    check(title === 1, 'o módulo carregou dentro do iframe');
  } finally {
    await app.close();
  }
}

module.exports = async function navegacaoModulos() {
  await scenarioRail();
  await scenarioGuiaCelular();
  await scenarioErro();
};
