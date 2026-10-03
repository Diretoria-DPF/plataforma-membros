/**
 * atlas-offline.e2e.js — o atlas abre sem rede depois da 1ª visita
 * (Onda 3.5, A.1: sw.js, js/core/offline.js, flag `offline`).
 *  - Com a flag: o SW registra, assume e monta o cache `atlas-<build>` com o
 *    código, o esqueleto e as fichas já vistas.
 *  - Offline: recarregar o atlas funciona e mostra o esqueleto 3D e uma ficha.
 *  - Sem a flag (padrão): nenhum SW é registrado.
 */
const { startApp, check } = require('./harness');

const SID = 'za:ethmoid-bone';

async function ready(frame) {
  await frame.waitForFunction(() => {
    const I = window.__atlasInternals;
    return !!I && I.store.get().loadedSystems.includes('esqueletico');
  }, null, { timeout: 60000 });
}

module.exports = async function atlasOffline() {
  // 1) Sem a flag: nada de Service Worker
  {
    const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, atlasFlags: { onboarding: false, hints: false, offline: false } });
    try {
      await app.login();
      const frame = await app.openModule('anatomia');
      await ready(frame);
      await frame.waitForTimeout(500);
      const regs = await frame.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
      check(regs === 0, 'sem a flag offline: nenhum Service Worker registrado');
    } finally { await app.close(); }
  }

  // 2) Com a flag: cache, offline e atualização de build
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, atlasFlags: { onboarding: false, hints: false, offline: true } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    // O SW assume depois do boot; só então a ficha é aberta (entra no cache ao ser usada)
    await frame.evaluate(async () => {
      await navigator.serviceWorker.ready;
      for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
    });
    const withFicha = await frame.evaluate(async (sid) => !!(await window.__atlasInternals.contentStore.getContent(sid)), SID);
    check(withFicha, `ficha de ${SID} carrega online`);

    const cacheInfo = await frame.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      let names = [];
      let keys = [];
      for (let i = 0; i < 100; i++) {
        names = (await caches.keys()).filter((k) => k.startsWith('atlas-'));
        if (names.length) {
          keys = (await (await caches.open(names[0])).keys()).map((r) => new URL(r.url).pathname);
          if (keys.some((k) => /esqueletico\.lod1\.glb\.gz$/.test(k)) && keys.some((k) => /\/js\/main\.js$/.test(k))
            && keys.some((k) => /\/modulos\/shared\/laift-identity\.js$/.test(k)) && keys.some((k) => /\/content\/esqueletico\.json$/.test(k))) break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      const has = (re) => keys.some((k) => re.test(k));
      return { names, count: keys.length, scope: reg.scope, skeleton: has(/esqueletico\.lod1\.glb\.gz$/), main: has(/\/js\/main\.js$/), shared: has(/\/modulos\/shared\/laift-identity\.js$/), ficha: has(/\/content\/esqueletico\.json$/) };
    });
    check(cacheInfo.names.length === 1 && /^atlas-[0-9a-f]{16}$/.test(cacheInfo.names[0]), `cache versionado por build (${cacheInfo.names.join(',')})`);
    check(cacheInfo.count > 50 && cacheInfo.skeleton && cacheInfo.main && cacheInfo.shared, `cache com código, ../shared e esqueleto (${cacheInfo.count} arquivos)`);
    check(cacheInfo.ficha, 'a ficha aberta entrou no cache');
    check(/modulos\/anatomia-3d\/$/.test(cacheInfo.scope), `escopo restrito ao atlas (${cacheInfo.scope})`);

    // Offline: recarrega o atlas só do cache
    await app.context.setOffline(true);
    const url = frame.url();
    await frame.goto(url, { waitUntil: 'load' });
    await ready(frame);
    const offline = await frame.evaluate(async (sid) => {
      const I = window.__atlasInternals;
      const content = await I.contentStore.getContent(sid);
      return { skeleton: I.store.get().loadedSystems.includes('esqueletico'), ficha: !!(content && (content.summary_pt || content.summary)), online: navigator.onLine, controlled: !!navigator.serviceWorker.controller };
    }, SID);
    check(offline.skeleton, 'offline: o esqueleto 3D abre a partir do cache');
    check(offline.ficha, 'offline: a ficha já vista abre a partir do cache');
    check(offline.controlled, 'offline: a página é controlada pelo Service Worker');
    await app.context.setOffline(false);

    check(app.errors.length === 0, 'atlas-offline: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally { await app.close(); }
};
