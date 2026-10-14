/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * explode-entry.js — ponto de entrada (mínimo) da vista "Separar peças"
 * ---------------------------------------------------------------------------
 * É a única parte que entra no boot: publica `AtlasShell.toggleExplode` e
 * `AtlasShell.isExploded` (usados pelo menu "Mais opções"). Nada é baixado
 * até a primeira abertura: o controlador (engine/explode.js), a matemática
 * (engine/explode-math.js), o painel (ui/explode-panel.js) e o CSS
 * (css/explode.css) chegam por import dinâmico.
 */

const CSS_HREF = new URL('../../css/explode.css', import.meta.url).href;

function loadStylesheet() {
  if (typeof document === 'undefined' || document.querySelector('link[data-atlas-explode]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-atlas-explode', '');
  document.head.appendChild(link);
}

/**
 * @param {Object} deps
 * @param {Object} deps.registry
 * @param {{ get: Function, set: Function, subscribe: Function }} deps.store
 * @param {Object} deps.bus
 * @param {Function} deps.addTicker
 * @param {() => void} deps.requestRender
 * @param {(name: string, el: Element) => void} deps.registerPanel
 * @param {() => boolean} deps.reducedMotion
 * @param {() => void} [deps.onChange] reposiciona os rótulos após mover as peças
 * @returns {{ toggle: () => Promise<void>, isExploded: () => boolean }}
 */
export function mountExplode(deps) {
  let loaded = null;
  let controller = null;
  let panel = null;

  async function ensure() {
    if (!loaded) {
      loadStylesheet();
      loaded = Promise.all([import('../engine/explode.js'), import('./explode-panel.js')]).then(([engine, ui]) => {
        controller = engine.createExplode(deps);
        panel = ui.createExplodePanel({ controller, onClose: () => panel && panel.setOpen(false) });
        deps.registerPanel('explode', panel.element);
        return panel;
      });
    }
    return loaded;
  }

  async function toggle() {
    try {
      const p = await ensure();
      p.setOpen(p.element.hidden);
    } catch (err) {
      loaded = null; // permite tentar de novo (ex.: perdeu a rede no meio)
      // eslint-disable-next-line no-console
      console.warn('[atlas] "Separar peças" não carregou:', err && err.message ? err.message : err);
    }
  }

  const api = { toggle, isExploded: () => !!(controller && controller.isActive()) };
  if (typeof window !== 'undefined' && window.AtlasShell) {
    window.AtlasShell.toggleExplode = toggle;
    window.AtlasShell.isExploded = api.isExploded;
  }
  return api;
}
