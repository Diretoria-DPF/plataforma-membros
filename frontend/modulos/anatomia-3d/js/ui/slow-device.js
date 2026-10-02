/**
 * slow-device.js — avisos de demora/offline na abertura do Atlas (Onda 2).
 * ---------------------------------------------------------------------------
 * - Offline ao abrir: aviso imediato; "Tentar novamente" espera a conexão
 *   voltar (evento `online`) e tenta de novo.
 * - 8 s sem o esqueleto: aviso discreto (não bloqueia) com "Tentar novamente".
 * - 20 s: aviso bloqueante com "Tentar novamente" e, depois de 3 tentativas,
 *   "Recarregar a página".
 * "Tentar novamente" pede de novo os sistemas da abertura que ainda não
 * chegaram (não recarrega a página). Tudo some quando o esqueleto chega.
 *
 * classifyDevice() (pura) decide o perfil do aparelho; em CPU/memória
 * fracas o atlas começa no nível gráfico baixo (js/main.js). Tempo de quadro
 * alto já é tratado pelo monitor de quadros do renderer (downgrade sozinho).
 */

export const SLOW_NOTICE_MS = 8000;
export const SLOW_BLOCK_MS = 20000;
export const MAX_RETRIES = 3;

/**
 * @param {{ connection?: {saveData?: boolean, effectiveType?: string}, hardwareConcurrency?: number, deviceMemory?: number }} [nav]
 * @returns {'save-data'|'very-slow'|'slow'|'weak-cpu'|'normal'}
 */
export function classifyDevice(nav = (typeof navigator !== 'undefined' ? navigator : {})) {
  const conn = nav && nav.connection;
  if (conn && conn.saveData) return 'save-data';
  const type = conn && String(conn.effectiveType || '');
  if (type === 'slow-2g' || type === '2g') return 'very-slow';
  if (type === '3g') return 'slow';
  const cores = Number.isFinite(nav.hardwareConcurrency) ? nav.hardwareConcurrency : 4;
  const mem = Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : 8;
  if (cores <= 2 || mem <= 2) return 'weak-cpu';
  return 'normal';
}

/**
 * @param {{ isReady: () => boolean, retry: () => void, online?: () => boolean }} opts
 */
export function createSlowDeviceWatcher({ isReady, retry, online = () => navigator.onLine !== false }) {
  const { h } = window.LaiftDom;
  let retries = 0;
  let notice = null;
  let blocker = null;
  const timers = [];

  function clearUi() {
    if (notice) { notice.remove(); notice = null; }
    if (blocker) { blocker.remove(); blocker = null; }
  }
  function doRetry() {
    retries += 1;
    clearUi();
    if (!online()) { showOffline(); return; }
    retry();
    // Volta a vigiar a partir de agora.
    timers.push(setTimeout(() => { if (!isReady()) showNotice(); }, SLOW_NOTICE_MS));
    timers.push(setTimeout(() => { if (!isReady()) showBlocker(); }, SLOW_BLOCK_MS));
  }
  function retryButton(label = 'Tentar novamente') {
    const b = h('button', { type: 'button', className: 'atlas-slow-btn' }, [label]);
    b.addEventListener('click', doRetry);
    return b;
  }
  function reloadButton() {
    const b = h('button', { type: 'button', className: 'atlas-slow-btn atlas-slow-btn--primary' }, ['Recarregar a página']);
    b.addEventListener('click', () => window.location.reload());
    return b;
  }
  function showNotice(text = 'Está demorando? Verifique sua conexão.') {
    if (isReady() || blocker) return;
    if (notice) notice.remove();
    notice = h('div', { className: 'atlas-slow-notice', role: 'status' }, [
      h('span', {}, [text]),
      retryButton(),
    ]);
    document.body.appendChild(notice);
  }
  function showBlocker() {
    if (isReady()) return;
    if (notice) { notice.remove(); notice = null; }
    if (blocker) blocker.remove();
    const actions = [retryButton()];
    if (retries >= MAX_RETRIES) actions.push(reloadButton());
    blocker = h('div', { className: 'atlas-fatal atlas-slow-block', role: 'alert' }, [
      h('p', { className: 'atlas-fatal-title' }, ['Não conseguimos carregar os modelos 3D.']),
      h('p', { className: 'atlas-fatal-hint' }, ['Sua conexão pode estar lenta. Tente novamente ou use uma rede Wi-Fi.']),
      h('div', { className: 'atlas-slow-actions' }, actions),
    ]);
    document.body.appendChild(blocker);
    actions[0].focus();
  }
  function showOffline() {
    showNotice('Você está offline. Conecte-se para carregar os modelos 3D.');
  }

  const onOnline = () => { if (!isReady() && (notice || blocker)) doRetry(); };
  window.addEventListener('online', onOnline);

  if (!online()) showOffline();
  timers.push(setTimeout(() => { if (!isReady()) showNotice(); }, SLOW_NOTICE_MS));
  timers.push(setTimeout(() => { if (!isReady()) showBlocker(); }, SLOW_BLOCK_MS));

  return {
    /** Chamar quando o esqueleto chegar: some com os avisos e para de vigiar. */
    done() {
      timers.forEach(clearTimeout);
      timers.length = 0;
      clearUi();
      window.removeEventListener('online', onOnline);
    },
    getRetries: () => retries,
  };
}
