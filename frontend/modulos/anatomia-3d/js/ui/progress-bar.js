/**
 * progress-bar.js — barra de carregamento dos modelos 3D (topbar).
 * ---------------------------------------------------------------------------
 * Alimentada por `assetLoader.onProgress` ({system, loadedBytes, totalBytes},
 * js/engine/assets.js) e pelos eventos SYSTEM_LOAD_START/DONE/ERROR.
 *
 * O progresso é de um LOTE: sistemas que terminam continuam contando como
 * 100% até o lote todo acabar — senão, ao terminar o 1º sistema e começar o
 * 2º, a barra voltaria de quase cheia para quase vazia. E nunca recua dentro
 * do lote (createProgressTracker garante isso, testado em
 * scripts/atlas/progress-bar.test.mjs).
 */

/** Lógica pura do progresso (sem DOM). */
export function createProgressTracker() {
  let batch = new Map(); // system → { loaded, total, done }
  let shown = 0;
  function computed() {
    let loaded = 0;
    let total = 0;
    for (const s of batch.values()) {
      const t = s.total > 0 ? s.total : 0;
      total += t;
      loaded += s.done ? t : Math.min(s.loaded, t);
    }
    return total > 0 ? loaded / total : 0;
  }
  return {
    start(system, total = 0) {
      if (this.idle()) { batch = new Map(); shown = 0; }
      const prev = batch.get(system);
      batch.set(system, { loaded: prev ? prev.loaded : 0, total: total || (prev ? prev.total : 0), done: false });
    },
    update(system, loaded, total) {
      const s = batch.get(system) || { loaded: 0, total: 0, done: false };
      batch.set(system, { loaded: Math.max(s.loaded, loaded || 0), total: total || s.total, done: s.done });
    },
    finish(system) {
      const s = batch.get(system);
      if (s) s.done = true;
    },
    /** Algum sistema ainda baixando? */
    idle() {
      for (const s of batch.values()) if (!s.done) return false;
      return true;
    },
    /** 0..1, nunca recua dentro do lote; 1 quando tudo terminou. */
    progress() {
      if (batch.size && this.idle()) shown = 1;
      else shown = Math.max(shown, computed());
      return shown;
    },
    /** Sistema ainda em andamento (para o rótulo). */
    current() {
      for (const [system, s] of batch) if (!s.done) return system;
      return null;
    },
  };
}

/**
 * Monta a barra em #atlas-topbar.
 * @param {{ bus: {on: Function, EVENTS: Object}, assetLoader: {onProgress: Function}, systemLabel: (id:string)=>string }} opts
 */
export function createProgressBar({ bus, assetLoader, systemLabel }) {
  const { h } = window.LaiftDom;
  const topbar = document.getElementById('atlas-topbar');
  if (!topbar) return { destroy() {} };
  const tracker = createProgressTracker();
  const fill = h('div', { className: 'atlas-progress-fill' }, []);
  const label = h('span', { className: 'atlas-progress-label', 'aria-hidden': 'true' }, ['Preparando o corpo…']);
  const bar = h('div', {
    className: 'atlas-progress', role: 'progressbar', 'aria-label': 'Carregando modelos 3D',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', hidden: true,
  }, [fill]);
  topbar.appendChild(bar);
  topbar.appendChild(label);
  let hideTimer = null;

  function paint() {
    const p = tracker.progress();
    const pct = Math.round(p * 100);
    fill.style.transform = `scaleX(${p})`;
    bar.setAttribute('aria-valuenow', String(pct));
    const cur = tracker.current();
    label.textContent = pct === 0 ? 'Preparando o corpo…' : cur ? `Carregando ${systemLabel(cur).toLowerCase()}…` : 'Pronto';
    if (tracker.idle()) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        bar.dataset.state = 'done';
        document.body.dataset.loading = 'false';
        setTimeout(() => { if (tracker.idle()) bar.hidden = true; }, 200);
      }, 150);
    } else {
      clearTimeout(hideTimer);
      bar.hidden = false;
      bar.dataset.state = 'loading';
      document.body.dataset.loading = 'true';
    }
  }

  const offs = [
    bus.on(bus.EVENTS.SYSTEM_LOAD_START, ({ system }) => { tracker.start(system); paint(); }),
    bus.on(bus.EVENTS.SYSTEM_LOAD_DONE, ({ system }) => { tracker.finish(system); paint(); }),
    bus.on(bus.EVENTS.SYSTEM_LOAD_ERROR, ({ system }) => { tracker.finish(system); paint(); }),
  ];
  const offProgress = assetLoader && assetLoader.onProgress
    ? assetLoader.onProgress(({ system, loadedBytes, totalBytes }) => { tracker.update(system, loadedBytes, totalBytes); paint(); })
    : null;

  return {
    tracker,
    destroy() {
      offs.forEach((off) => typeof off === 'function' && off());
      if (typeof offProgress === 'function') offProgress();
      bar.remove();
      label.remove();
    },
  };
}
