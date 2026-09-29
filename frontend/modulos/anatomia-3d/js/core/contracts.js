/**
 * contracts.js — contratos congelados do Atlas v2 (Onda 0, WP01)
 * ---------------------------------------------------------------------------
 * Este arquivo NÃO implementa nada: define, em JSDoc, a forma das interfaces
 * que os pacotes de trabalho das Ondas 1–2 precisam respeitar para se
 * encaixar sem conhecer os detalhes uns dos outros, mais um punhado de
 * validadores "leves em runtime" (checam só a forma — presença de métodos —
 * nunca o comportamento) para os testes de integração (WP13/WP14)
 * conferirem rápido "isto parece um Registry?" sem montar o motor inteiro.
 *
 * Congelado depois desta onda: qualquer mudança de forma aqui é uma mudança
 * de contrato entre pacotes e passa pelo orquestrador, nunca por um agente
 * isolado.
 *
 * Não importa nada (nem three.js, nem os outros módulos de core/) — só usa
 * tipos de JavaScript puro, então pode ser importado por qualquer pacote,
 * inclusive os que rodam fora do navegador (scripts de CI/validação).
 */

// ============================================================================
// Camadas (LAYERS) — usadas pelo painel de camadas (WP09) e pelo motor de
// visibilidade (WP06). A ordem é a mesma do painel: superficial → profundo.
// ============================================================================

/**
 * @typedef {Object} LayerDef
 * @property {string} id    Chave estável usada em `store.layers` e no evento
 *                           `layer:set` (ver EVENTS em bus.js).
 * @property {string} label Rótulo em PT-BR mostrado no painel de camadas.
 */

/** @type {ReadonlyArray<Readonly<LayerDef>>} */
export const LAYERS = Object.freeze([
  Object.freeze({ id: 'pele', label: 'Pele' }),
  Object.freeze({ id: 'musculos', label: 'Músculos' }),
  Object.freeze({ id: 'esqueleto', label: 'Esqueleto' }),
  Object.freeze({ id: 'visceras', label: 'Vísceras' }),
  Object.freeze({ id: 'vasos', label: 'Vasos' }),
  Object.freeze({ id: 'nervos', label: 'Nervos' }),
  Object.freeze({ id: 'linfatico', label: 'Linfático' }),
]);

/** ids de LAYERS, na mesma ordem — útil para `Object.keys`-like iteração. */
export const LAYER_IDS = Object.freeze(LAYERS.map((l) => l.id));

// ============================================================================
// Sistemas anatômicos (SYSTEMS) — usados pelo navegador (WP09), pelo
// carregador de assets (WP05) e pelo pipeline de conteúdo/3D (WP10/WP11).
// Lista fechada de 12 sistemas com id estável (bate com `models/manifest.json`
// e `data/atlas/content/<sistema>.json`) e rótulo PT-BR.
// ============================================================================

/**
 * @typedef {Object} SystemDef
 * @property {string} id    Chave estável (ex.: `cardiovascular`).
 * @property {string} label Rótulo em PT-BR.
 */

/** @type {ReadonlyArray<Readonly<SystemDef>>} */
export const SYSTEMS = Object.freeze([
  Object.freeze({ id: 'esqueletico', label: 'Esquelético' }),
  Object.freeze({ id: 'muscular', label: 'Muscular' }),
  Object.freeze({ id: 'articular', label: 'Articular' }),
  Object.freeze({ id: 'cardiovascular', label: 'Cardiovascular' }),
  Object.freeze({ id: 'nervoso', label: 'Nervoso' }),
  Object.freeze({ id: 'respiratorio', label: 'Respiratório' }),
  Object.freeze({ id: 'digestorio', label: 'Digestório' }),
  Object.freeze({ id: 'urinario', label: 'Urinário' }),
  Object.freeze({ id: 'reprodutor', label: 'Reprodutor' }),
  Object.freeze({ id: 'endocrino', label: 'Endócrino' }),
  Object.freeze({ id: 'linfatico', label: 'Linfático' }),
  Object.freeze({ id: 'tegumentar', label: 'Tegumentar' }),
]);

/** ids de SYSTEMS, na mesma ordem. */
export const SYSTEM_IDS = Object.freeze(SYSTEMS.map((s) => s.id));

// ============================================================================
// Modos (MODES) — o seletor no topo (WP08) e os pacotes `js/modes/*`
// (WP07/WP12) implementam um por id. `icon` é só uma chave para o sprite/
// glifo escolhido pela UI, não um caminho de arquivo.
// ============================================================================

/**
 * @typedef {Object} ModeDef
 * @property {string} id    Chave estável, usada em `store.mode` e no evento
 *                           `mode:change`.
 * @property {string} label Rótulo em PT-BR mostrado no seletor de modo.
 * @property {string} icon  Chave do glifo (ver `js/ui/toolbar.js`).
 */

/** @type {ReadonlyArray<Readonly<ModeDef>>} */
export const MODES = Object.freeze([
  Object.freeze({ id: 'explorar', label: 'Explorar', icon: 'body' }),
  Object.freeze({ id: 'fisiologia', label: 'Fisiologia & Vias', icon: 'route' }),
  Object.freeze({ id: 'farmacologia', label: 'Farmacologia', icon: 'pill' }),
  Object.freeze({ id: 'moleculas', label: 'Moléculas', icon: 'molecule' }),
  Object.freeze({ id: 'quiz', label: 'Quiz', icon: 'check' }),
  Object.freeze({ id: 'estudo', label: 'Meu estudo', icon: 'bookmark' }),
]);

/** ids de MODES, na mesma ordem. */
export const MODE_IDS = Object.freeze(MODES.map((m) => m.id));

/** Modo inicial ao abrir o Atlas sem estado salvo. */
export const DEFAULT_MODE = 'explorar';

// ============================================================================
// Estados do painel inferior/lateral arrastável (ver docs/ATLAS_UX_SPEC.md
// §2 para as alturas exatas por breakpoint — aqui só os ids e rótulos).
// ============================================================================

/**
 * @typedef {Object} SheetStateDef
 * @property {string} id    'peek' | 'half' | 'full'.
 * @property {string} label Rótulo em PT-BR (usado em `aria-label`/testes).
 */

/** @type {ReadonlyArray<Readonly<SheetStateDef>>} */
export const SHEET_STATES = Object.freeze([
  Object.freeze({ id: 'peek', label: 'Espiar' }),
  Object.freeze({ id: 'half', label: 'Metade' }),
  Object.freeze({ id: 'full', label: 'Cheio' }),
]);

/** ids de SHEET_STATES, na mesma ordem. */
export const SHEET_STATE_IDS = Object.freeze(SHEET_STATES.map((s) => s.id));

// ============================================================================
// Superfície de compatibilidade legada — o que `js/compat/legacy-api.js`
// (WP13) precisa continuar expondo para `atlas.e2e.js` e `csp.e2e.js`
// passarem sem alteração. Ver plano §"Testes atuais a preservar".
// Isto é DOCUMENTAÇÃO, não um polyfill: nenhum destes objetos é criado aqui.
// ============================================================================

/**
 * @typedef {Object} LegacyCompatSurface
 * @property {string} globalNamespace          `window.ThreeEngine`, forma atual.
 * @property {ReadonlyArray<string>} threeEngineApiMethods Métodos que
 *   `ThreeEngineAPI` expõe hoje (`js/three-engine.js`) e que a camada de
 *   compatibilidade precisa continuar respondendo (pode traduzir por
 *   dentro para o novo Registry/Engine).
 * @property {string} modelStateGlobal         `window.__atlasModelState`.
 * @property {string} modelReadyEvent          Evento `laift:atlas-model-ready`.
 * @property {string} appControllerSelectSystem `AppController.selectSystem`.
 * @property {string} quizNamespace            `window.QuizEngine`.
 * @property {ReadonlyArray<string>} quizEngineMethods Métodos que `QuizEngine`
 *   expõe hoje (`js/quiz-engine.js`).
 * @property {ReadonlyArray<string>} domIds     ids de DOM lidos pelos testes.
 * @property {string} quizStartAction          Seletor de ação de início do quiz.
 */

/** @type {Readonly<LegacyCompatSurface>} */
export const LEGACY_COMPAT = Object.freeze({
  globalNamespace: 'window.ThreeEngine',
  threeEngineApiMethods: Object.freeze([
    'init', 'selectSystem', 'highlightOrgan', 'flashOrganFeedback',
    'setOrganVisibility', 'setOrganOpacity', 'isolateOrgan', 'resetOrganTree',
    'simulateAdministrationRoute', 'stopRouteSimulation', 'setCrisisMode',
    'setDissectionDepth', 'togglePinsVisibility', 'triggerParticleFlow',
    'stopParticles', 'tweenCamera', 'onWindowResize',
    'isRealModelActive', 'getRealMeshCount', 'getVisibilityStats',
    'debugSelectFirstOfSystem', 'getAnatomicalLandmarks',
    'debugGetOrganWorldBox', 'debugGetOrganOpacity', 'hasOrganLayer',
  ]),
  modelStateGlobal: 'window.__atlasModelState',
  modelReadyEvent: 'laift:atlas-model-ready',
  appControllerSelectSystem: 'AppController.selectSystem',
  quizNamespace: 'window.QuizEngine',
  quizEngineMethods: Object.freeze([
    'startQuiz', 'stopQuiz', 'evaluateUserAnswer', 'getCurrentScore',
  ]),
  domIds: Object.freeze([
    '#organ-name', '#organ-hud', '#bio-search-input', '#biohacking-results-grid',
  ]),
  quizStartAction: '[data-action="QuizEngine.startQuiz"]',
});

// ============================================================================
// Interfaces entre pacotes (JSDoc puro — nada instanciável aqui).
// ============================================================================

/**
 * Ponto/mira de tela usado por `Registry.pick` (mesmo espaço de coordenadas
 * de `THREE.Raycaster.setFromCamera`: em x/y, origem no centro).
 * @typedef {Object} ScreenPoint
 * @property {number} x
 * @property {number} y
 */

/**
 * Caixa delimitadora em coordenadas de mundo.
 * @typedef {Object} BBox
 * @property {[number, number, number]} min
 * @property {[number, number, number]} max
 */

/**
 * Índice vivo de estruturas (uma malha/nó do GLB ↔ um `sid`). Construído
 * pelo carregador de assets (WP05) a partir de `models/manifest.json`;
 * consultado pela seleção, pelo navegador, pelas camadas e pelos modos.
 * @typedef {Object} Registry
 * @property {(sid: string) => (Object|null)} getBySid Metadados da estrutura
 *   (sid, sistema, camada, nomes, bbox, nó do GLB) ou `null` se não existir
 *   ou ainda não tiver sido carregada.
 * @property {(systemId: string) => Array<Object>} getBySystem Todas as
 *   estruturas carregadas daquele sistema (`[]` se o sistema não estiver
 *   carregado — ver `AssetLoader.isLoaded`).
 * @property {(point: ScreenPoint, camera?: Object) => (string|null)} pick Raycast a partir de
 *   um ponto de tela normalizado; devolve o `sid` mais próximo visível e
 *   selecionável, ou `null`.
 * @property {(sid: string) => (BBox|null)} getBBox
 * @property {(sid: string, visible: boolean) => void} setVisible
 * @property {(sid: string, opacity: number) => void} setOpacity Opacidade
 *   0–1; usada por raio-X, fantasma e pelas camadas.
 * @property {(sid: string, color: (string|null)) => void} setColor `null`
 *   restaura a cor de material original da estrutura.
 * @property {() => Iterable<Object>} iterate Percorre todas as estruturas
 *   já carregadas (qualquer sistema), na ordem de inserção.
 */

/**
 * Progresso de carregamento de um sistema.
 * @typedef {Object} LoadProgress
 * @property {string} system
 * @property {number} loadedBytes
 * @property {number} totalBytes
 */

/**
 * Carrega `models/manifest.json` e os GLBs por sistema sob demanda (ver
 * plano §3 e §4 — orçamento de 1ª carga ≤5MB, resto sob demanda).
 * @typedef {Object} AssetLoader
 * @property {(url?: string) => Promise<Object>} loadManifest Carrega e cacheia o
 *   manifesto (uma vez por sessão); resolve com o JSON de
 *   `models/manifest.json` ou da URL informada.
 * @property {(system: string, opts?: {lod?: ('lod0'|'lod1')}) => Promise<void>} loadSystem
 *   Carrega o GLB daquele sistema (padrão `lod1` no celular, `lod0` acima do
 *   limiar de qualidade — ver `store.quality`). Idempotente: chamar de novo
 *   com o sistema já carregado resolve na hora.
 * @property {(system: string) => boolean} isLoaded
 * @property {(fn: (p: LoadProgress) => void) => (() => void)} onProgress
 *   Assina progresso de qualquer carregamento em curso; devolve função de
 *   cancelamento (mesmo padrão de `bus.on`).
 */

/**
 * Fachada do motor 3D (three.js) que o resto do app manipula sem conhecer
 * a versão/API exata do three.js — só WP04 importa `vendor/three/` direto.
 * @typedef {Object} Engine
 * @property {Object} scene    `THREE.Scene` (tipado como `Object` aqui para
 *   este arquivo não depender de three.js).
 * @property {Object} camera   `THREE.PerspectiveCamera`.
 * @property {Object} renderer `THREE.WebGLRenderer`.
 * @property {() => void} requestRender Marca o próximo frame para render
 *   (o motor só renderiza quando algo muda — ver orçamento de desempenho).
 * @property {(rect: ({x: number, y: number, width: number, height: number}|null)) => void} setViewOffset
 *   Espelha `camera.setViewOffset`; `null` remove o deslocamento (a área
 *   cheia do canvas volta a ser "livre"). Rect em pixels de tela, relativo
 *   ao canvas — usado para afastar a câmera da área coberta pelo painel.
 * @property {(sid: string, opts?: {animate?: boolean}) => void} focusSid
 *   Centraliza a câmera na estrutura, respeitando o `viewOffset` atual.
 * @property {(name: string) => void} viewPreset Uma das vistas nomeadas em
 *   `docs/ATLAS_UX_SPEC.md` §"Câmera" (`anterior`, `posterior`, `esquerda`,
 *   `direita`, `superior`, `inferior`).
 */

/**
 * Resultado de busca (ver `docs/ATLAS_UX_SPEC.md` §"Busca" para o
 * algoritmo de ranking).
 * @typedef {Object} SearchResult
 * @property {string} sid
 * @property {string} label      Nome exibido (PT), já com o trecho casado.
 * @property {string} systemId
 * @property {number} score      Maior = melhor; usado só para ordenar.
 */

/**
 * Acesso ao conteúdo textual/estruturado (`data/atlas/index.json` e
 * `data/atlas/content/<sistema>.json`), gerado pelo pipeline de conteúdo
 * (WP11) e consumido pela ficha da estrutura, pela busca e pelo navegador.
 * @typedef {Object} ContentStore
 * @property {() => Object} getIndex Índice já carregado na abertura
 *   (`data/atlas/index.json`) — síncrono porque é o primeiro fetch da
 *   página, feito antes de qualquer UI que precise dele.
 * @property {(sid: string) => Promise<(Object|null)>} getContent Conteúdo
 *   completo da estrutura (carrega o `content/<sistema>.json` daquele `sid`
 *   sob demanda e cacheia); `null` se o `sid` não existir no índice.
 * @property {(query: string) => Array<SearchResult>} search Síncrono sobre
 *   o índice em memória (PT/EN/latim/sinônimos, tolerante a acento e a erro
 *   de digitação — ver spec de UX).
 */

/**
 * Contexto passado a `Mode.enter` — o que um modo recebe do shell para se
 * ligar ao motor/estado sem importar os módulos concretos.
 * @typedef {Object} ModeContext
 * @property {Registry} registry
 * @property {AssetLoader} assetLoader
 * @property {Engine} engine
 * @property {ContentStore} contentStore
 */

/**
 * Um modo do seletor superior (`js/modes/*.js`). Implementações não podem
 * usar `innerHTML` (ver `modulos/shared/safe-dom.js`) — `sheetContent`
 * devolve um `Node` já construído.
 * @typedef {Object} Mode
 * @property {string} id    Um dos ids de MODES.
 * @property {string} label
 * @property {string} icon
 * @property {(ctx: ModeContext) => (void|Promise<void>)} enter Chamado ao
 *   entrar no modo; liga seus próprios listeners no `bus` e carrega o que
 *   precisar (bibliotecas pesadas, sob demanda — ver plano §1).
 * @property {() => (void|Promise<void>)} exit Desliga listeners, libera
 *   recursos pesados (ex.: descarta a instância do Chart.js).
 * @property {() => (Node|null)} sheetContent Conteúdo a colocar dentro do
 *   painel arrastável/lateral para este modo; `null` = painel usa o
 *   conteúdo padrão do Explorar (ficha da estrutura).
 */

// ============================================================================
// Validadores leves em runtime — checam só a FORMA (presença de métodos),
// nunca o comportamento. Servem para os testes de integração (WP13/WP14)
// falharem com uma mensagem clara ("faltou pick") em vez de um erro
// genérico no meio de um fluxo E2E.
// ============================================================================

/**
 * @param {*} obj
 * @param {ReadonlyArray<string>} methodNames
 * @returns {boolean}
 */
function hasMethods(obj, methodNames) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
  return methodNames.every((name) => typeof obj[name] === 'function');
}

/** @param {*} obj @returns {boolean} `true` se `obj` implementa {@link Registry}. */
export function isRegistry(obj) {
  return hasMethods(obj, ['getBySid', 'getBySystem', 'pick', 'getBBox', 'setVisible', 'setOpacity', 'setColor', 'iterate']);
}

/** @param {*} obj @returns {boolean} `true` se `obj` implementa {@link AssetLoader}. */
export function isAssetLoader(obj) {
  return hasMethods(obj, ['loadManifest', 'loadSystem', 'isLoaded', 'onProgress']);
}

/** @param {*} obj @returns {boolean} `true` se `obj` implementa {@link Engine}. */
export function isEngine(obj) {
  return hasMethods(obj, ['requestRender', 'setViewOffset', 'focusSid', 'viewPreset'])
    && 'scene' in obj && 'camera' in obj && 'renderer' in obj;
}

/** @param {*} obj @returns {boolean} `true` se `obj` implementa {@link ContentStore}. */
export function isContentStore(obj) {
  return hasMethods(obj, ['getIndex', 'getContent', 'search']);
}

/** @param {*} obj @returns {boolean} `true` se `obj` implementa {@link Mode}. */
export function isMode(obj) {
  return hasMethods(obj, ['enter', 'exit', 'sheetContent'])
    && typeof obj.id === 'string' && obj.id.length > 0
    && typeof obj.label === 'string'
    && typeof obj.icon === 'string';
}

/**
 * Confere se `id` é um dos ids congelados de `SYSTEM_IDS`.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidSystemId(id) {
  return typeof id === 'string' && SYSTEM_IDS.includes(id);
}

/**
 * Confere se `id` é um dos ids congelados de `LAYER_IDS`.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidLayerId(id) {
  return typeof id === 'string' && LAYER_IDS.includes(id);
}

/**
 * Confere se `id` é um dos ids congelados de `MODE_IDS`.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidModeId(id) {
  return typeof id === 'string' && MODE_IDS.includes(id);
}

/**
 * Confere se `id` é um dos ids congelados de `SHEET_STATE_IDS`.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidSheetState(id) {
  return typeof id === 'string' && SHEET_STATE_IDS.includes(id);
}
