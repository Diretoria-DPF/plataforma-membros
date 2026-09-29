/**
 * store.js — estado observável do Atlas v2 (Onda 0, WP01)
 * ---------------------------------------------------------------------------
 * Uma única árvore de estado, mutada só por `set(partial)` (mescla rasa, um
 * nível) e lida por `get()` ou por `subscribe(selector, fn)`. Não é Redux:
 * não há reducers nem middlewares — é o mínimo que os pacotes das Ondas 1–2
 * precisam para não duplicar estado (cada painel/modo lê daqui, nunca guarda
 * sua própria cópia de `mode`, `selectedSid` etc.).
 *
 * Efeitos colaterais (chamar o motor 3D, salvar em IndexedDB, animar a
 * câmera) NÃO pertencem a este arquivo — quem muda o estado também emite o
 * evento correspondente em `bus.js`; quem reage ao efeito assina o bus ou
 * este store, o que fizer mais sentido para o caso.
 *
 * Congelado depois desta onda: a FORMA do estado inicial (as chaves) é
 * contrato entre pacotes. Você pode alterar o valor de uma chave a
 * qualquer momento com `set`; adicionar/remover uma chave é mudança de
 * contrato e passa pelo orquestrador.
 *
 * @example
 *   import { get, set, subscribe } from './store.js';
 *   const off = subscribe((s) => s.mode, (mode) => console.log('modo:', mode));
 *   set({ mode: 'quiz' });
 *   off();
 */

import { LAYER_IDS, DEFAULT_MODE } from './contracts.js';

/**
 * @typedef {Object} LayerState
 * @property {boolean} visible
 * @property {number} opacity Entre 0 e 1.
 */

/**
 * @typedef {Object} ClipState
 * @property {(string|null)} plane  'sagital' | 'coronal' | 'transversal' | null.
 * @property {(number|null)} offset Deslocamento do plano ao longo do seu
 *   eixo normal, em metros (mesma unidade do modelo — ver plano §3).
 */

/**
 * @typedef {Object} VisibilityState
 * @property {('none'|'isolate'|'hide'|'ghost')} active
 * @property {(string|null)} sid `null` quando `active` é `'none'`.
 */

/**
 * @typedef {Object} QualityState
 * @property {('auto'|'baixa'|'media'|'alta')} tier
 * @property {number} pixelRatio Efetivo, já resolvido pelo `js/engine/quality.js`
 *   (auto reduz sozinho se o frame passar de 33ms — ver orçamento de
 *   desempenho no plano).
 */

/**
 * Estado completo do Atlas. Todo pacote que lê `store.get()` pode assumir
 * exatamente esta forma — nenhuma chave é opcional (todas têm valor inicial
 * abaixo).
 * @typedef {Object} AtlasState
 * @property {string} mode Um dos ids de `MODES` (contracts.js).
 * @property {(string|null)} selectedSid Estrutura selecionada, ou `null`.
 * @property {Record<string, LayerState>} layers Uma entrada por id de
 *   `LAYERS` (contracts.js): `pele`, `musculos`, `esqueleto`, `visceras`,
 *   `vasos`, `nervos`, `linfatico`.
 * @property {VisibilityState} isolation Estado de isolar/ocultar/fantasma
 *   (no máximo uma estrutura por vez — ações da mini barra/menu de contexto).
 * @property {boolean} xray
 * @property {ClipState} clip
 * @property {string} sheetState Um dos ids de `SHEET_STATES` (contracts.js).
 * @property {('M'|'F')} sex Afeta só o sistema reprodutor e as variantes do
 *   HRA (ver plano §"Decisões técnicas do orquestrador").
 * @property {QualityState} quality
 * @property {('light'|'dark')} theme Espelha `<html data-theme>` — ver
 *   `modulos/shared/laift-identity.js`.
 * @property {ReadonlyArray<string>} loadedSystems ids de `SYSTEMS` já
 *   carregados no Registry.
 * @property {ReadonlyArray<string>} unavailableSystems ids de `SYSTEMS` cujo
 *   GLB falhou ao carregar (mostrados como "indisponível" — ver
 *   `js/engine/fallback.js`).
 */

/**
 * Camadas visíveis na abertura: músculos + esqueleto (trazidos no primeiro download
 * de ≤5 MB). As demais camadas (pele, vísceras, vasos, nervos, linfático) entram
 * sob demanda via painel de camadas ou preset "Superficial ↔ Profundo".
 * @type {ReadonlyArray<string>}
 */
const DEFAULT_VISIBLE_LAYERS = Object.freeze(['musculos', 'esqueleto']);

const initialState = Object.freeze({
  mode: DEFAULT_MODE,
  selectedSid: null,
  layers: Object.freeze(
    LAYER_IDS.reduce((acc, id) => {
      acc[id] = Object.freeze({ visible: DEFAULT_VISIBLE_LAYERS.includes(id), opacity: 1 });
      return acc;
    }, {})
  ),
  isolation: Object.freeze({ active: 'none', sid: null }),
  xray: false,
  clip: Object.freeze({ plane: null, offset: null }),
  sheetState: 'peek',
  sex: 'M',
  quality: Object.freeze({ tier: 'auto', pixelRatio: 1 }),
  theme: 'light',
  loadedSystems: Object.freeze([]),
  unavailableSystems: Object.freeze([]),
});

/** @type {AtlasState} */
let state = initialState;

/**
 * @typedef {Object} Subscription
 * @property {(state: AtlasState) => *} selector
 * @property {(value: *, prev: *) => void} fn
 * @property {*} last
 */

/** @type {Set<Subscription>} */
const subscriptions = new Set();

/**
 * @returns {AtlasState} O estado atual (referência viva — trate como
 *   somente leitura; para mudar, use {@link set}).
 */
export function get() {
  return state;
}

/**
 * Mescla `partial` (ou o resultado de `partial(state)`, se for função) um
 * nível dentro do estado atual e notifica os assinantes cujo valor
 * selecionado mudou. Mesclagem é RASA: `set({ layers: { pele: {...} } })`
 * substitui o objeto `layers` inteiro — para mudar só uma camada, monte o
 * objeto `layers` completo a partir de `get().layers` primeiro (é isso que
 * `js/engine/visibility.js` faz).
 * @param {(Partial<AtlasState>|((state: AtlasState) => Partial<AtlasState>))} partial
 * @returns {void}
 */
export function set(partial) {
  let patch;
  try {
    patch = typeof partial === 'function' ? partial(state) : partial;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[atlas/store] função de modificação lançou um erro:', err);
    return;
  }

  if (!patch || typeof patch !== 'object') return;

  // Evita re-renderizações e novas referências quando nenhuma chave mudou
  let hasChanges = false;
  for (const key of Object.keys(patch)) {
    if (!Object.is(state[key], patch[key])) {
      hasChanges = true;
      break;
    }
  }
  if (!hasChanges) return;

  state = { ...state, ...patch };

  for (const sub of Array.from(subscriptions)) {
    let value;
    try {
      value = sub.selector(state);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[atlas/store] seletor de assinante lançou um erro:', err);
      continue;
    }

    if (!Object.is(value, sub.last)) {
      const prev = sub.last;
      sub.last = value;
      try {
        sub.fn(value, prev);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[atlas/store] assinante lançou um erro:', err);
      }
    }
  }
}

/**
 * Assina uma "fatia" derivada do estado: `fn` só é chamado quando
 * `selector(state)` muda (comparado com `Object.is` — para objetos/arrays,
 * isso significa "trocou de referência", que é o que acontece sempre que
 * `set` toca aquela chave, já que a mesclagem é rasa).
 * @template T
 * @param {(state: AtlasState) => T} selector
 * @param {(value: T, prev: T) => void} fn
 * @returns {() => void} Cancela a assinatura.
 */
export function subscribe(selector, fn) {
  let last;
  try {
    last = selector(state);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[atlas/store] seletor lançou erro durante a assinatura inicial:', err);
  }

  /** @type {Subscription} */
  const sub = { selector, fn, last };
  subscriptions.add(sub);
  return () => subscriptions.delete(sub);
}
