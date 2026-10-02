/**
 * atlas-slow.e2e.js — avisos de demora e offline (js/ui/slow-device.js).
 *   - Esqueleto atrasado: aos 8 s aparece "Está demorando?" com "Tentar
 *     novamente"; quando o esqueleto chega, o aviso some.
 *   - navigator.onLine = false ao abrir: aviso imediato de offline.
 */
const { startApp, check } = require('./harness');

const GLB = /models\/zanatomy\/esqueletico\.lod1\.glb/;

module.exports = async function atlasSlow() {
  // 1) Esqueleto segurado por 11 s
  {
    const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
    try {
      let release;
      const held = new Promise((r) => { release = r; });
      await app.context.route(GLB, async (route) => { await held; await route.continue(); });
      await app.login();
      const frame = await app.openModule('anatomia');
      await frame.waitForFunction(() => !!document.getElementById('atlas-canvas'), null, { timeout: 20000 });
      const early = await frame.evaluate(() => !!document.querySelector('.atlas-slow-notice'));
      const notice = await frame.waitForSelector('.atlas-slow-notice', { timeout: 15000 })
        .then(() => frame.evaluate(() => document.querySelector('.atlas-slow-notice').textContent)).catch(() => null);
      check(!early && !!notice && /demorando/.test(notice) && /Tentar novamente/.test(notice),
        `esqueleto atrasado: aviso "Está demorando?" aparece depois de ~8 s (${notice})`);
      release();
      const gone = await frame.waitForFunction(() => !document.querySelector('.atlas-slow-notice, .atlas-slow-block'), null, { timeout: 20000 })
        .then(() => true).catch(() => false);
      check(gone, 'quando o esqueleto chega, o aviso some');
    } finally {
      await app.close();
    }
  }

  // 2) Offline ao abrir
  {
    const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
    try {
      await app.context.addInitScript(() => {
        try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }); } catch (e) { /* */ }
      });
      let release;
      const held = new Promise((r) => { release = r; });
      await app.context.route(GLB, async (route) => { await held; await route.continue(); });
      await app.login();
      const frame = await app.openModule('anatomia');
      const text = await frame.waitForSelector('.atlas-slow-notice', { timeout: 15000 })
        .then(() => frame.evaluate(() => document.querySelector('.atlas-slow-notice').textContent)).catch(() => null);
      check(!!text && /offline/.test(text), `offline ao abrir: aviso imediato (${text})`);
      release();
      check(app.errors.length === 0, 'atlas-slow: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
    } finally {
      await app.close();
    }
  }
};
