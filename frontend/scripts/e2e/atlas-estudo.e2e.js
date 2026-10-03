/**
 * atlas-estudo.e2e.js — favoritos, compartilhar e resumo do estudo (Onda 3.5, C.1–C.3).
 *  - ★ Fixar na ficha: 3 estruturas fixadas aparecem em Meu estudo > Fixados.
 *  - Compartilhar: o link copiado abre a plataforma direto na estrutura.
 *  - "Seu estudo": estruturas vistas batem com o histórico.
 */
const { startApp, check } = require('./harness');

const SIDS = ['za:left-ventricle', 'za:kidney-l', 'za:urinary-bladder'];

async function ready(frame) {
  await frame.waitForFunction(() => { const I = window.__atlasInternals; return !!I && I.store.get().loadedSystems.includes('esqueletico'); }, null, { timeout: 60000 });
}

module.exports = async function atlasEstudo() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  let shared = '';
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    for (const sid of SIDS) {
      await frame.evaluate((s) => window.__atlasInternals.selection.select(s, 'api'), sid);
      await frame.waitForSelector('.atlas-card-pin', { timeout: 15000 });
      await frame.waitForFunction((s) => window.__atlasInternals.store.get().selectedSid === s, sid);
      await frame.locator('.atlas-card-pin').first().click();
      await frame.waitForFunction(() => document.querySelector('.atlas-card-pin').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => {});
    }
    check(await frame.evaluate(() => document.querySelector('.atlas-card-pin').getAttribute('aria-pressed') === 'true' && /Fixada/.test(document.querySelector('.atlas-card-pin').textContent)), '★ Fixar: o botão mostra "Fixada" depois de tocar');
    // reabrir a 1ª estrutura: o botão já nasce marcado
    await frame.evaluate((s) => window.__atlasInternals.selection.select(s, 'api'), SIDS[0]);
    await frame.waitForFunction(() => document.querySelector('.atlas-card-pin') && document.querySelector('.atlas-card-pin').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => {});
    check(await frame.evaluate(() => document.querySelector('.atlas-card-pin').getAttribute('aria-pressed') === 'true'), 'estrutura já fixada volta marcada');

    await frame.locator('.atlas-card-share').first().click();
    await frame.waitForFunction(() => /Link copiado|Copie o link/.test((document.querySelector('.atlas-card-action-note') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    shared = await app.page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check(/#atlas=za:left-ventricle$/.test(shared), `compartilhar copia o link da estrutura (${shared})`);

    await frame.evaluate(() => window.AtlasShell.setMode('estudo'));
    await frame.waitForSelector('.study-stats', { timeout: 15000 });
    const nums = await frame.evaluate(() => [...document.querySelectorAll('.study-stat-n')].map((n) => Number(n.textContent)));
    check(nums[0] === 3, `"Seu estudo": 3 estruturas vistas (${nums.join(',')})`);
    check(await frame.evaluate(() => { const d = document.querySelector('.study-changelog'); return !!d && /O que mudou/.test(d.textContent) && d.querySelectorAll('li').length >= 3; }), '"O que mudou" lista as novidades da versão');
    await frame.locator('.study-tab-btn', { hasText: 'Fixados' }).click();
    await frame.waitForTimeout(500);
    const pins = await frame.evaluate(() => (document.querySelector('.study-content') || document.body).innerText);
    check(/Ventrículo esquerdo/.test(pins) && /Rins/.test(pins) && /Bexiga/.test(pins), 'Meu estudo > Fixados lista as 3 estruturas');
    check(app.errors.length === 0, 'atlas-estudo (fixar): sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally { await app.close(); }

  // Link compartilhado: abre a plataforma direto na estrutura
  const app2 = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
  try {
    await app2.page.goto(`${app2.baseUrl}#atlas=za:kidney-l`);
    await app2.page.fill('#login-email', app2.ctx.profile.email);
    await app2.page.fill('#login-password', 'senha-de-teste-123');
    await app2.page.click('#form-login button[type=submit]');
    await app2.page.waitForSelector('#app-root:not(.hidden)');
    const el = await app2.page.waitForSelector('.learn-frame:not(.hidden)', { timeout: 20000 });
    const frame = await el.contentFrame();
    await ready(frame);
    await frame.waitForFunction(() => window.__atlasInternals.store.get().selectedSid === 'za:kidney-l', null, { timeout: 20000 }).catch(() => {});
    check(await frame.evaluate(() => window.__atlasInternals.store.get().selectedSid) === 'za:kidney-l', 'link #atlas=za:kidney-l: o atlas abre direto no rim');
    check(await app2.page.evaluate(() => !/atlas=/.test(window.location.hash)), 'o hash do link é limpo depois de usado');
    check(app2.errors.length === 0, 'atlas-estudo (link): sem erros de JavaScript' + (app2.errors.length ? ': ' + app2.errors.join(' | ') : ''));
  } finally { await app2.close(); }
};
