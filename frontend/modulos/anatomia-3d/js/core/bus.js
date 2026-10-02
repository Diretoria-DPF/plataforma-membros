/**
 * bus.js — barramento de eventos do Atlas v2 (Onda 0, WP01)
 * ---------------------------------------------------------------------------
 * Um `EventTarget` caseiro, minúsculo e sem dependências: é assim que
 * `js/engine/*`, `js/modes/*` e `js/ui/*` conversam entre si sem se
 * importar diretamente uns aos outros. Todo nome de evento vem de
 * {@link EVENTS} — nunca escreva a string à mão num pacote novo.
 *
 * Congelado depois desta onda: mudar a forma de `on`/`off`/`once`/`emit` ou
 * o payload de um evento existente é mudança de contrato entre pacotes.
 * Adicionar um evento novo (sem remover nenhum) pode ser proposto ao
 * orquestrador entre ondas.
 *
 * @example
 *   import { on, emit, EVENTS } from './bus.js';
 *   const off = on(EVENTS.STRUCTURE_SELECT, ({ sid, source }) => { ... });
 *   emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:7088', source: 'pick' });
 *   off(); // para de escutar
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Assina `evt`. Chamar o próprio retorno cancela a assinatura (mesmo efeito
 * que chamar {@link off} com os mesmos argumentos) — é o padrão usado em
 * todo o Atlas para "desligar ao sair" (`Mode.exit`, desmontar um painel).
 * @param {string} evt
 * @param {Function} fn
 * @returns {() => void} Função que cancela esta assinatura.
 */
export function on(evt, fn) {
  let set = listeners.get(evt);
  if (!set) {
    set = new Set();
    listeners.set(evt, set);
  }
  set.add(fn);
  return () => off(evt, fn);
}

/**
 * Cancela uma assinatura feita com {@link on} ou {@link once}. Sem efeito
 * se `evt`/`fn` não estiverem mais assinados (seguro chamar duas vezes).
 * @param {string} evt
 * @param {Function} fn
 * @returns {void}
 */
export function off(evt, fn) {
  const set = listeners.get(evt);
  if (!set) return;
  set.delete(fn);
  if (set.size === 0) listeners.delete(evt);
}

/**
 * Assina `evt` para no máximo uma chamada; cancela a própria assinatura
 * antes de invocar `fn`, então nunca reentra ainda que `fn` emita `evt` de
 * novo.
 * @param {string} evt
 * @param {Function} fn
 * @returns {() => void} Função que cancela esta assinatura antes de disparar.
 */
export function once(evt, fn) {
  const wrapped = (payload) => {
    off(evt, wrapped);
    fn(payload);
  };
  return on(evt, wrapped);
}

/**
 * Dispara `evt` para todos os assinantes atuais, na ordem em que assinaram.
 * Uma assinatura que lança erro é isolada (relatada em `console.error`, sem
 * interromper as demais) — um painel quebrado não pode travar o motor 3D
 * nem os outros painéis.
 * @param {string} evt
 * @param {*} [payload]
 * @returns {void}
 */
export function emit(evt, payload) {
  const set = listeners.get(evt);
  if (!set || set.size === 0) return;
  // Copia antes de iterar: uma assinatura pode chamar `off` (a sua própria
  // ou de outra) durante o disparo, e isso não deve pular nem duplicar
  // chamadas nesta rodada.
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[atlas/bus] assinante de "${evt}" lançou um erro:`, err);
    }
  }
}

/**
 * Nomes de evento congelados do barramento do Atlas. Cada chave documenta,
 * em JSDoc, o formato do payload que {@link emit} espera e que {@link on}
 * recebe — mantenha os dois lados sincronizados manualmente, já que isto é
 * JavaScript puro (sem checagem de tipos em runtime).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const EVENTS = Object.freeze({
  /**
   * Uma estrutura foi selecionada (ou a seleção foi limpa).
   * @payload {{ sid: (string|null), source: ('pick'|'search'|'navigator'|'quiz'|'api') }}
   */
  STRUCTURE_SELECT: 'structure:select',

  /**
   * O ponteiro/mira passou a sobrevoar uma estrutura (hover no mouse; mira
   * central na TV). `sid: null` quando sai de todas.
   * @payload {{ sid: (string|null) }}
   */
  STRUCTURE_HOVER: 'structure:hover',

  /**
   * Começou o carregamento do GLB de um sistema.
   * @payload {{ system: string }}
   */
  SYSTEM_LOAD_START: 'system:load:start',

  /**
   * O GLB de um sistema terminou de carregar e já está no Registry.
   * @payload {{ system: string }}
   */
  SYSTEM_LOAD_DONE: 'system:load:done',

  /**
   * O carregamento de um sistema falhou (rede, 404, parse). O sistema
   * passa a constar em `store.unavailableSystems` — ver
   * `js/engine/fallback.js` (WP05).
   * @payload {{ system: string, error?: string }}
   */
  SYSTEM_LOAD_ERROR: 'system:load:error',

  /**
   * Uma camada anatômica foi ligada/desligada ou teve a opacidade ajustada.
   * @payload {{ layer: string, visible: boolean, opacity: number }}
   */
  LAYER_SET: 'layer:set',

  /**
   * Isolar: só a estrutura (e opcionalmente seus vizinhos diretos) fica
   * visível.
   * @payload {{ sid: string }}
   */
  VISIBILITY_ISOLATE: 'visibility:isolate',

  /**
   * Ocultar: a estrutura fica invisível, o resto permanece como estava.
   * @payload {{ sid: string }}
   */
  VISIBILITY_HIDE: 'visibility:hide',

  /**
   * Fantasma: a estrutura fica translúcida em vez de invisível/isolada.
   * @payload {{ sid: string }}
   */
  VISIBILITY_GHOST: 'visibility:ghost',

  /**
   * Limpa isolar/ocultar/fantasma — volta ao estado das camadas ligadas.
   * @payload {{}}
   */
  VISIBILITY_RESET: 'visibility:reset',

  /**
   * Aplicar uma vista de câmera nomeada (anterior, posterior, esquerda,
   * direita, superior, inferior).
   * @payload {{ name: string }}
   */
  VIEW_PRESET: 'view:preset',

  /**
   * Resetar a câmera para a vista/zoom inicial do modo atual.
   * @payload {{}}
   */
  VIEW_RESET: 'view:reset',

  /**
   * Ligar/desligar o raio-X (pele e músculo translúcidos).
   * @payload {{ enabled: boolean }}
   */
  XRAY_SET: 'xray:set',

  /**
   * Definir/limpar o plano de corte.
   * @payload {{ plane: ('sagital'|'coronal'|'transversal'|null), offset: (number|null) }}
   */
  CLIP_SET: 'clip:set',

  /**
   * Ligar/desligar os rótulos na tela (até 12 simultâneos — ver spec de UX).
   * @payload {{ enabled: boolean, count?: number }}
   */
  LABELS_SET: 'labels:set',

  /**
   * O painel arrastável/lateral encaixou numa posição (arraste do usuário
   * ou chamada programática).
   * @payload {{ state: ('peek'|'half'|'full'), heightPx: number }}
   */
  SHEET_SNAP: 'sheet:snap',

  /**
   * O modo ativo (seletor superior) mudou.
   * @payload {{ mode: string }}
   */
  MODE_CHANGE: 'mode:change',

  /**
   * A busca foi aberta (atalho `/`, toque no campo, botão da barra).
   * @payload {{ query?: string }}
   */
  SEARCH_OPEN: 'search:open',

  /**
   * Uma resposta foi dada num caso de quiz (o usuário tocou uma estrutura
   * no corpo).
   * @payload {{ caseId: string, sid: string, correct: boolean }}
   */
  QUIZ_ANSWER: 'quiz:answer',
  /** Estudo de via/processo concluído (PR 3.2): { kind: 'route'|'process', id, label, sid } */
  STUDY_PATH: 'study:path',

  /**
   * O tema efetivo da plataforma mudou (ver `modulos/shared/laift-identity.js`
   * `applyTheme`/`laift:themechange`).
   * @payload {{ theme: ('light'|'dark') }}
   */
  THEME_CHANGE: 'theme:change',

  /**
   * O nível de qualidade de render mudou (manual ou automático, por FPS —
   * ver `js/engine/quality.js`).
   * @payload {{ tier: ('auto'|'baixa'|'media'|'alta'), pixelRatio?: number }}
   */
  QUALITY_CHANGE: 'quality:change',
});
