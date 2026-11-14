/**
 * offline.js — registra o Service Worker do atlas (Onda 3.5, A.1).
 * Só com a flag `offline` ligada e suporte do navegador; com ela desligada,
 * remove o SW e os caches que já estiverem no aparelho (rollback). Roda no fim do
 * boot, depois de o atlas estar pronto, para não competir com o primeiro
 * carregamento. Depois de ativo, avisa o SW dos recursos que a página já
 * baixou antes dele existir (1ª visita), para o offline valer já na 2ª abertura.
 * Falha de registro nunca afeta o atlas.
 */

/** URLs do mesmo domínio que a página já carregou, dentro do escopo (ou dos prefixos dados) (pura, testável). */
export function loadedResources(entries, origin, scopePath) {
  const prefixes = [].concat(scopePath);
  const out = new Set();
  for (const e of entries || []) {
    try {
      const u = new URL(e.name, origin);
      if (u.origin === origin && prefixes.some((p) => u.pathname.startsWith(p))) out.add(u.pathname);
    } catch (err) { /* ignora */ }
  }
  return [...out];
}

/** Flag desligada (rollback): remove o SW e os caches do atlas que ficaram em aparelhos. */
export function unregisterOffline(nav, win) {
  if (!nav || !nav.serviceWorker || !nav.serviceWorker.getRegistrations) return Promise.resolve(false);
  const scopePath = new URL('./', win.location.href).pathname;
  return nav.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.filter((r) => new URL(r.scope).pathname === scopePath).map((r) => r.unregister())))
    .then(() => (win.caches && win.caches.keys ? win.caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('atlas-')).map((k) => win.caches.delete(k)))) : null))
    .then(() => true)
    .catch(() => false);
}

/** Há um service worker novo esperando E a página já era controlada por um antigo (não é a 1ª visita)? (pura) */
export function updateReady(reg, controller) {
  return !!(reg && reg.waiting && controller);
}

/**
 * Atualização automática, sem aviso: quando um service worker novo termina de instalar e fica esperando, pede
 * que assuma já (skip-waiting). Quem recarrega a página é `watchTakeover`. Falhas nunca afetam o atlas.
 */
export function watchUpdates(reg, nav) {
  if (!reg || !nav || !nav.serviceWorker) return;
  const activate = () => {
    if (!updateReady(reg, nav.serviceWorker.controller)) return;
    try { reg.waiting.postMessage({ type: 'skip-waiting' }); } catch (e) { /* ignora */ }
  };
  activate();
  if (typeof reg.addEventListener === 'function') {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (worker && typeof worker.addEventListener === 'function') worker.addEventListener('statechange', () => { if (worker.state === 'installed') activate(); });
    });
  }
  try { Promise.resolve(reg.update && reg.update()).catch(() => {}); } catch (e) { /* ignora */ }
}

/**
 * Quando um worker novo assume uma página que já tinha controle (`hadController`), a página em memória é da versão
 * antiga e os arquivos pedidos daqui em diante vêm da nova. Recarrega UMA vez, sem aviso, em momento seguro: quando
 * a aba volta ao foco (ou já está visível e livre). `isBusy()` protege quiz, estudo e qualquer sessão em andamento:
 * ocupado, espera o próximo retorno ao foco (ou a próxima abertura, que já vem atualizada).
 */
export function watchTakeover(nav, win, isBusy, hadController) {
  if (!hadController || !nav || !nav.serviceWorker || typeof nav.serviceWorker.addEventListener !== 'function') return;
  const doc = win && win.document;
  let pending = false;
  let reloaded = false;
  const busy = () => { try { return typeof isBusy === 'function' && !!isBusy(); } catch (e) { return true; } };
  const tryReload = () => {
    if (!pending || reloaded || busy()) return;
    reloaded = true;
    win.location.reload();
  };
  nav.serviceWorker.addEventListener('controllerchange', () => {
    pending = true;
    if (doc && doc.visibilityState === 'hidden') return; // em segundo plano: recarrega ao voltar ao foco
    tryReload();
  });
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') tryReload(); });
  }
  if (typeof win.addEventListener === 'function') win.addEventListener('focus', tryReload);
}

export function registerOffline(flags, nav = typeof navigator !== 'undefined' ? navigator : null, win = typeof window !== 'undefined' ? window : null, isBusy = null) {
  if (!nav || !nav.serviceWorker || !win) return Promise.resolve(false);
  if (!flags || !flags.offline) return unregisterOffline(nav, win).then(() => false);
  const scopeUrl = new URL('./', win.location.href);
  const hadController = !!nav.serviceWorker.controller;
  watchTakeover(nav, win, isBusy, hadController);
  return nav.serviceWorker.register('./sw.js', { scope: './' })
    .then(() => nav.serviceWorker.ready)
    .then((reg) => {
      const entries = win.performance && win.performance.getEntriesByType ? win.performance.getEntriesByType('resource') : [];
      const urls = loadedResources(entries, win.location.origin, [scopeUrl.pathname, new URL('../shared/', scopeUrl).pathname]);
      urls.push(scopeUrl.pathname);
      if (reg.active) reg.active.postMessage({ type: 'cache-loaded', urls });
      watchUpdates(reg, nav);
      return true;
    })
    .catch(() => false);
}
