/**
 * dev/contracts-harness.js — checagem manual dos contratos do core
 * ---------------------------------------------------------------------------
 * Roda dentro de dev/contracts-harness.html (abrir direto no navegador —
 * módulo ES, sem servidor especial, só um `file://` ou qualquer estático
 * serve). Não é o teste de CI (esse é frontend/scripts/atlas/core.test.mjs,
 * que roda em Node); isto aqui é o mesmo roteiro, mas visível na tela para
 * quem estiver depurando `js/core/*` no navegador, com `window.__ATLAS_DEV__`
 * exposto para inspeção manual no console.
 *
 * Sem dependências, sem innerHTML (usa `textContent`/`createElement`, como
 * qualquer outro arquivo do Atlas).
 */
import { on, off, once, emit, EVENTS } from '../js/core/bus.js';
import { get, set, subscribe } from '../js/core/store.js';
import {
  LAYERS, LAYER_IDS, SYSTEMS, SYSTEM_IDS, MODES, MODE_IDS,
  SHEET_STATES, isValidLayerId, isValidSystemId, isValidModeId,
  isRegistry, isMode,
} from '../js/core/contracts.js';

/** @type {Array<{ name: string, pass: boolean, detail?: string }>} */
const results = [];

/**
 * @param {string} name
 * @param {() => void} fn
 */
function check(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, detail: err && err.message ? err.message : String(err) });
  }
}

/** @param {boolean} cond @param {string} msg */
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// bus.js
// ---------------------------------------------------------------------------
check('bus: EVENTS está congelado e tem structure:select', () => {
  assert(Object.isFrozen(EVENTS), 'EVENTS deveria ser Object.freeze()');
  assert(EVENTS.STRUCTURE_SELECT === 'structure:select', 'EVENTS.STRUCTURE_SELECT errado');
});

check('bus: on/emit entrega o payload e off cancela', () => {
  let received = null;
  let calls = 0;
  const offFn = on(EVENTS.STRUCTURE_SELECT, (payload) => { received = payload; calls += 1; });
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:7088', source: 'pick' });
  assert(calls === 1, `esperava 1 chamada, veio ${calls}`);
  assert(received && received.sid === 'fma:7088', 'payload não chegou como esperado');
  offFn();
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'outro', source: 'pick' });
  assert(calls === 1, 'off() não cancelou a assinatura');
});

check('bus: off(evt, fn) direto também cancela', () => {
  let calls = 0;
  const fn = () => { calls += 1; };
  on(EVENTS.VIEW_RESET, fn);
  emit(EVENTS.VIEW_RESET, {});
  off(EVENTS.VIEW_RESET, fn);
  emit(EVENTS.VIEW_RESET, {});
  assert(calls === 1, `esperava 1 chamada, veio ${calls}`);
});

check('bus: once dispara só uma vez', () => {
  let calls = 0;
  once(EVENTS.MODE_CHANGE, () => { calls += 1; });
  emit(EVENTS.MODE_CHANGE, { mode: 'quiz' });
  emit(EVENTS.MODE_CHANGE, { mode: 'explorar' });
  assert(calls === 1, `esperava 1 chamada, veio ${calls}`);
});

check('bus: um assinante que lança erro não impede os demais', () => {
  let secondCalled = false;
  on(EVENTS.SEARCH_OPEN, () => { throw new Error('falha proposital'); });
  on(EVENTS.SEARCH_OPEN, () => { secondCalled = true; });
  emit(EVENTS.SEARCH_OPEN, {});
  assert(secondCalled, 'o segundo assinante deveria ter sido chamado mesmo com o primeiro lançando erro');
});

// ---------------------------------------------------------------------------
// store.js
// ---------------------------------------------------------------------------
check('store: get() traz o estado inicial esperado', () => {
  const s = get();
  assert(s.mode === 'explorar', `mode inicial deveria ser "explorar", veio "${s.mode}"`);
  assert(s.selectedSid === null, 'selectedSid inicial deveria ser null');
  assert(s.layers.pele.visible === true, 'a camada pele deveria começar visível');
  assert(s.layers.musculos.visible === false, 'a camada músculos deveria começar oculta');
  assert(LAYER_IDS.every((id) => id in s.layers), 'faltou alguma camada de LAYER_IDS em store.layers');
});

check('store: set() muda e subscribe() notifica o seletor certo', () => {
  let seen = [];
  const offSub = subscribe((s) => s.mode, (mode) => seen.push(mode));
  set({ mode: 'quiz' });
  set({ mode: 'quiz' }); // mesmo valor: não deveria notificar de novo
  set({ mode: 'estudo' });
  offSub();
  set({ mode: 'explorar' }); // depois de cancelar: não deveria notificar
  assert(seen.length === 2, `esperava 2 notificações, vieram ${seen.length} (${JSON.stringify(seen)})`);
  assert(seen[0] === 'quiz' && seen[1] === 'estudo', `sequência errada: ${JSON.stringify(seen)}`);
});

check('store: subscribe ignora chaves que não mudaram (Object.is)', () => {
  let calls = 0;
  const offSub = subscribe((s) => s.selectedSid, () => { calls += 1; });
  set({ mode: 'explorar' }); // não toca selectedSid
  offSub();
  assert(calls === 0, `subscribe de selectedSid não deveria disparar; disparou ${calls}x`);
});

// ---------------------------------------------------------------------------
// contracts.js
// ---------------------------------------------------------------------------
check('contracts: LAYERS/SYSTEMS/MODES/SHEET_STATES estão congelados e coerentes', () => {
  assert(Object.isFrozen(LAYERS), 'LAYERS deveria ser Object.freeze()');
  assert(Object.isFrozen(SYSTEMS), 'SYSTEMS deveria ser Object.freeze()');
  assert(Object.isFrozen(MODES), 'MODES deveria ser Object.freeze()');
  assert(LAYERS.length === 7, `esperava 7 camadas, vieram ${LAYERS.length}`);
  assert(SYSTEMS.length === 12, `esperava 12 sistemas, vieram ${SYSTEMS.length}`);
  assert(MODES.length === 6, `esperava 6 modos, vieram ${MODES.length}`);
  assert(SHEET_STATES.length === 3, `esperava 3 estados de painel, vieram ${SHEET_STATES.length}`);
});

check('contracts: validadores de id aceitam válido e rejeitam inválido', () => {
  assert(isValidLayerId('pele') === true, '"pele" deveria ser uma camada válida');
  assert(isValidLayerId('cabelo') === false, '"cabelo" não deveria ser uma camada válida');
  assert(isValidSystemId('cardiovascular') === true, '"cardiovascular" deveria ser um sistema válido');
  assert(isValidModeId('quiz') === true, '"quiz" deveria ser um modo válido');
  assert(SYSTEM_IDS.length === SYSTEMS.length && MODE_IDS.length === MODES.length, 'listas de id fora de sincronia');
});

check('contracts: isRegistry/isMode rejeitam objetos incompletos', () => {
  assert(isRegistry({}) === false, 'objeto vazio não deveria passar por Registry');
  assert(isRegistry({
    getBySid() {}, getBySystem() {}, pick() {}, getBBox() {},
    setVisible() {}, setOpacity() {}, setColor() {}, iterate() {},
  }) === true, 'objeto com todos os métodos deveria passar por Registry');
  assert(isMode({ id: 'x', label: 'X', icon: 'x', enter() {}, exit() {} }) === false, 'sem sheetContent não deveria passar por Mode');
});

// ---------------------------------------------------------------------------
// Renderização do resultado (sem innerHTML — nó por nó).
// ---------------------------------------------------------------------------
function render() {
  const list = document.getElementById('results');
  if (!list) return;
  results.forEach((r) => {
    const li = document.createElement('li');
    li.className = r.pass ? 'pass' : 'fail';
    const status = document.createElement('strong');
    status.textContent = r.pass ? 'OK' : 'FALHOU';
    li.appendChild(status);
    li.appendChild(document.createTextNode(' — ' + r.name));
    if (!r.pass && r.detail) {
      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = r.detail;
      li.appendChild(detail);
    }
    list.appendChild(li);
  });
  const summary = document.getElementById('summary');
  if (summary) {
    const passCount = results.filter((r) => r.pass).length;
    summary.textContent = `${passCount}/${results.length} passaram`;
    summary.className = passCount === results.length ? 'pass' : 'fail';
  }
}

render();

// Exposto para inspeção manual no console do navegador durante depuração.
window.__ATLAS_DEV__ = { results, bus: { on, off, once, emit, EVENTS }, store: { get, set, subscribe } };
