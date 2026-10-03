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

export function registerOffline(flags, nav = typeof navigator !== 'undefined' ? navigator : null, win = typeof window !== 'undefined' ? window : null) {
  if (!nav || !nav.serviceWorker || !win) return Promise.resolve(false);
  if (!flags || !flags.offline) return unregisterOffline(nav, win).then(() => false);
  const scopeUrl = new URL('./', win.location.href);
  return nav.serviceWorker.register('./sw.js', { scope: './' })
    .then(() => nav.serviceWorker.ready)
    .then((reg) => {
      const entries = win.performance && win.performance.getEntriesByType ? win.performance.getEntriesByType('resource') : [];
      const urls = loadedResources(entries, win.location.origin, [scopeUrl.pathname, new URL('../shared/', scopeUrl).pathname]);
      urls.push(scopeUrl.pathname);
      if (reg.active) reg.active.postMessage({ type: 'cache-loaded', urls });
      return true;
    })
    .catch(() => false);
}
