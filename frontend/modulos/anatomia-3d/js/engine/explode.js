/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * explode.js — controlador da vista "Separar peças" (explodida)
 * ---------------------------------------------------------------------------
 * Carregado SOB DEMANDA (import dinâmico em ui/explode-entry.js, na primeira
 * vez que alguém abre "Separar peças"): nada disto entra no boot do Atlas, e
 * com a vista desligada não há ticker, assinatura de barramento nem matriz
 * alterada.
 *
 * Escopo:
 *  - corpo todo: cada estrutura se afasta radialmente do centro do corpo,
 *    mais as camadas superficiais (explode-math.js);
 *  - estrutura isolada: as partes (sub-malhas) dela se afastam do centro da
 *    própria estrutura. Se ela tem uma peça só, não há o que separar.
 *
 * Funciona com isolar/camadas/rótulos/pick: o Registry grava os deslocamentos
 * nas matrizes das instâncias (respeitando o lote espelhado), então o raycast,
 * a visibilidade e as caixas dos rótulos já enxergam a posição separada.
 * Volta ao normal ao zerar, ao Centralizar (VIEW_RESET) e ao sair do modo
 * Explorar. "Reduzir movimento" (prefers-reduced-motion): sem animação.
 */

import { computeExplodeOffsets, approach, boxCenter, unionBoxes, clamp01 } from './explode-math.js';

/**
 * @param {Object} deps
 * @param {Object} deps.registry getExplodeItems / setExplodeOffsets
 * @param {{ get: Function }} deps.store
 * @param {Object} deps.bus on/EVENTS
 * @param {(fn: (dtMs: number) => boolean) => (() => void)} deps.addTicker
 * @param {() => void} deps.requestRender
 * @param {() => boolean} [deps.reducedMotion]
 * @param {() => void} [deps.onChange] chamado após cada gravação de deslocamentos
 *   (os rótulos só se reposicionam quando a câmera muda: sem isto ficariam parados)
 */
export function createExplode({ registry, store, bus, addTicker, requestRender, reducedMotion = () => false, onChange = () => {} }) {
  let target = 0;
  let current = 0;
  let scope = null; // { mode, items, center, separable }
  let stopTicker = null;
  const listeners = new Set();
  const unsubs = [];

  /** Recalcula o escopo (corpo todo × estrutura isolada) a partir do estado atual. */
  function resolveScope() {
    const items = registry.getExplodeItems();
    const iso = store.get().isolation;
    const isolated = iso && iso.active === 'isolate' && iso.sid ? items.find((i) => i.sid === iso.sid) : null;
    if (isolated) {
      return { mode: 'orgao', items: [isolated], center: isolated.center, separable: isolated.parts.length > 1 };
    }
    const box = unionBoxes(items.map((i) => i.box));
    return { mode: 'corpo', items, center: box ? boxCenter(box) : null, separable: items.length > 0 && !!box };
  }

  function notify() {
    const info = getInfo();
    for (const fn of listeners) fn(info);
  }

  /** Grava os deslocamentos para o valor atual de `current`. */
  function write() {
    if (!scope || !scope.center || current <= 0) {
      registry.setExplodeOffsets(null);
    } else {
      registry.setExplodeOffsets(computeExplodeOffsets(scope.items, { center: scope.center, amount: current, mode: scope.mode }));
    }
    onChange();
  }

  function tick(dtMs) {
    const step = approach(current, target, dtMs);
    current = step.value;
    write();
    if (step.done) { stopTicker = null; notify(); return false; }
    return true;
  }

  function run() {
    if (reducedMotion()) {
      current = target;
      write();
      requestRender();
      notify();
      return;
    }
    if (stopTicker) return; // o ticker em andamento já persegue o novo alvo
    const unsub = addTicker((dt) => {
      const keep = tick(dt);
      if (!keep) unsub();
      return keep;
    });
    stopTicker = unsub;
    requestRender();
  }

  /** Define o quanto as peças ficam separadas (0 = juntas, 1 = máximo). */
  function setAmount(amount) {
    target = clamp01(amount);
    scope = resolveScope();
    run();
    notify();
  }

  /** Reavalia o escopo (isolamento mudou, sistema novo carregado) mantendo o valor. */
  function refresh() {
    if (target <= 0 && current <= 0) return;
    scope = resolveScope();
    write();
    requestRender();
    notify();
  }

  function reset() {
    if (target === 0 && current === 0) return;
    target = 0;
    current = 0;
    if (stopTicker) { stopTicker(); stopTicker = null; }
    scope = null;
    registry.setExplodeOffsets(null);
    onChange();
    requestRender();
    notify();
  }

  function getInfo() {
    const s = scope || resolveScope();
    return { amount: target, active: target > 0, mode: s.mode, separable: s.separable };
  }

  const E = bus.EVENTS;
  unsubs.push(bus.on(E.VISIBILITY_ISOLATE, refresh));
  unsubs.push(bus.on(E.VISIBILITY_RESET, refresh));
  unsubs.push(bus.on(E.SYSTEM_LOAD_DONE, refresh));
  unsubs.push(bus.on(E.VIEW_RESET, reset));
  unsubs.push(bus.on(E.MODE_CHANGE, ({ mode }) => { if (mode !== 'explorar') reset(); }));

  return {
    setAmount,
    getAmount: () => target,
    getInfo,
    refresh,
    reset,
    isActive: () => target > 0,
    /** Assina mudanças ({amount, active, mode, separable}); devolve o cancelamento. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() {
      reset();
      unsubs.forEach((u) => u && u());
      listeners.clear();
    },
  };
}
