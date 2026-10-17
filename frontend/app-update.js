/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/app-update.js
 * Botão "Atualizar o aplicativo" (Perfil): quando uma tela não muda depois de uma novidade, a pessoa toca aqui e o
 * app busca a versão mais nova SEM precisar limpar os dados do navegador. Faz três coisas e recarrega:
 *   1. desregistra os service workers do site (o do app e o do Atlas, que só troca de versão com todas as abas fechadas);
 *   2. apaga as cópias guardadas no aparelho (caches "laift-shell-" do app e "atlas-" do Atlas);
 *   3. recarrega a página; os arquivos voltam da rede e os service workers se registram de novo sozinhos.
 * NÃO toca em localStorage, sessionStorage, IndexedDB nem em cookies: a sessão, as preferências, o progresso e a chave
 * das mensagens ficam como estavam. Cada etapa tem prazo; se algo travar, a página recarrega mesmo assim.
 * As decisões são funções puras (testadas em scripts/app-update.test.mjs).
 */
(function (root) {
  'use strict';

  var SHELL_PREFIX = 'laift-shell-';
  var ATLAS_PREFIX = 'atlas-';
  var STEP_TIMEOUT_MS = 6000;
  var RELOAD_DELAY_MS = 700;
  var MESSAGES = {
    working: 'Atualizando…',
    done: 'Pronto. Recarregando com a versão mais nova…',
    failed: 'Não foi possível atualizar agora. Feche e abra o aplicativo de novo.',
  };

  // ---------- Funções puras ----------

  /** Só as cópias do próprio app e do Atlas; qualquer outro cache fica como está. */
  function isAppCache(name) {
    return typeof name === 'string' && (name.indexOf(SHELL_PREFIX) === 0 || name.indexOf(ATLAS_PREFIX) === 0);
  }

  function noop() { return null; }

  /** A promessa, ou null se passar do prazo (a etapa nunca trava a atualização). */
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ms); }),
    ]);
  }

  function unregisterAll(nav, result) {
    if (!nav || !nav.serviceWorker || typeof nav.serviceWorker.getRegistrations !== 'function') return Promise.resolve();
    return nav.serviceWorker.getRegistrations().then(function (registrations) {
      return Promise.all((registrations || []).map(function (registration) {
        return registration.unregister().then(function (ok) { if (ok) result.registrations += 1; }).catch(noop);
      }));
    });
  }

  function deleteAppCaches(cacheStorage, result) {
    if (!cacheStorage || typeof cacheStorage.keys !== 'function') return Promise.resolve();
    return cacheStorage.keys().then(function (names) {
      return Promise.all((names || []).filter(isAppCache).map(function (name) {
        return cacheStorage.delete(name).then(function (ok) { if (ok) result.caches += 1; }).catch(noop);
      }));
    });
  }

  /** Desregistra os service workers e apaga os caches do app. Devolve { registrations, caches } (contagens). */
  function refresh(env, timeoutMs) {
    var ms = typeof timeoutMs === 'number' ? timeoutMs : STEP_TIMEOUT_MS;
    var result = { registrations: 0, caches: 0 };
    var steps = [
      withTimeout(unregisterAll(env && env.navigator, result), ms).catch(noop),
      withTimeout(deleteAppCaches(env && env.caches, result), ms).catch(noop),
    ];
    return Promise.all(steps).then(function () { return result; });
  }

  // ---------- Navegador ----------

  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = 'status-msg' + (kind ? ' ' + kind : '');
  }

  function run(doc) {
    var button = doc.getElementById('btn-app-update');
    var status = doc.getElementById('msg-app-update');
    if (!button || button.getAttribute('data-bound') === '1') return;
    button.setAttribute('data-bound', '1');
    button.addEventListener('click', function () {
      button.disabled = true;
      setStatus(status, MESSAGES.working, '');
      refresh({ navigator: root.navigator, caches: root.caches }).then(function () {
        setStatus(status, MESSAGES.done, 'success');
        setTimeout(function () { root.location.reload(); }, RELOAD_DELAY_MS);
      }).catch(function () {
        button.disabled = false;
        setStatus(status, MESSAGES.failed, 'error');
      });
    });
  }

  var api = { refresh: refresh, isAppCache: isAppCache, MESSAGES: MESSAGES };

  // Navegador: liga o botão quando a página carrega. Node: module.exports, para scripts/app-update.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root.document) {
    root.LaiftAppUpdate = api;
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { run(root.document); });
    else run(root.document);
  }
})(typeof window !== 'undefined' ? window : globalThis);
