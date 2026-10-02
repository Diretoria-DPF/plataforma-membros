/**
 * assets.js — carregador de assets 3D do Atlas v2 (Onda 1, WP05)
 * ---------------------------------------------------------------------------
 * Implementa `AssetLoader` (js/core/contracts.js): carrega
 * `models/manifest.json` (ou `data/atlas/fixtures/manifest.json`, com
 * `?fixtures=1` — quem escolhe é o `baseUrl` passado por quem instancia
 * este módulo, nunca este arquivo) e os GLBs por sistema, sob demanda.
 *
 * GAP de contrato (relatado ao orquestrador): `js/core/contracts.js` fixa a
 * FORMA de `AssetLoader`/`Registry` (isAssetLoader/isRegistry), mas não diz
 * COMO os dois pacotes se ligam para o Registry saber que uma malha nova
 * chegou. Este arquivo resolve isso de duas formas, ambas ativas ao mesmo
 * tempo:
 *   1. Se `createAssetLoader` recebe um `registry` (não é um campo do
 *      contrato — é uma conveniência de fiação entre WP05 e WP13/main.js),
 *      chama `registry.registerSystem`/`unregisterSystem`/
 *      `registerOrganDetail` diretamente.
 *   2. Sempre emite `system:load:start/done/error` no `bus` — os payloads
 *      de `done`/`error` têm campos além dos documentados em
 *      `bus.js` (`root`, `nodeToSid`, `asset`, `sex`, `lod`) para quem
 *      quiser se ligar só pelo bus, sem receber `registry` por parâmetro
 *      (`bus.js` só documenta o mínimo comum; acrescentar campos a um
 *      payload existente é aditivo, não uma mudança de forma).
 *
 * Cancelamento (`cancelLoad`): os loaders vendorizados (`vendor/three/
 * loaders/GLTFLoader.js`) não expõem um `AbortSignal` por chamada de
 * `loadAsync` — implementamos cancelamento COOPERATIVO: a rede continua
 * (não há como abortar o `fetch` interno sem alterar o vendor, que não é
 * nosso arquivo), mas o resultado é descartado (nunca chega a
 * `registerSystem`/`SYSTEM_LOAD_DONE`) se `cancelLoad` for chamado antes de
 * a promessa resolver. Suficiente para não popular a cena com um sistema
 * que o usuário já não quer mais, mesmo sem economizar a banda em voo.
 */

import { GLTFLoader } from '../../vendor/three/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/loaders/DRACOLoader.js';
import { MeshoptDecoder } from '../../vendor/three/libs/meshopt_decoder.module.js';
import { EVENTS } from '../core/bus.js';

const DRACO_DECODER_PATH = new URL('../../vendor/three/libs/draco/', import.meta.url).href;

// Orçamento de triângulos por tier (docs/ATLAS_UX_SPEC.md §17 só fixa o
// total mobile, 1,5M; os demais tiers são nossa própria extrapolação —
// GAP: não há um budgets.triangles em data/atlas/schema/budgets.json,
// só bytes. Reportado ao orquestrador para a Onda 2 decidir se formaliza).
const TRIANGLE_BUDGET = Object.freeze({
  baixa: 500000,
  media: 1000000,
  alta: 1500000,
  auto: 1500000,
});

/**
 * @param {{
 *   bus: Object,
 *   store: Object,
 *   baseUrl: string,
 *   engine?: import('../core/contracts.js').Engine,
 *   registry?: import('../core/contracts.js').Registry,
 * }} deps
 * @returns {import('../core/contracts.js').AssetLoader}
 */
export function createAssetLoader({ bus, store, baseUrl, engine, registry } = {}) {
  if (!bus) throw new Error('createAssetLoader: bus é obrigatório');
  if (!baseUrl) throw new Error('createAssetLoader: baseUrl é obrigatório (ex.: "../data/atlas/fixtures/")');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  /** @type {Object|null} */
  let manifest = null;
  /** @type {Promise<Object>|null} */
  let manifestPromise = null;

  /** @type {Map<string, Promise>} chave `${system}|${lod}|${sex}` → promessa em voo (dedupe). */
  const inflight = new Map();
  /** @type {Map<string, Object>} sistema → asset do manifesto atualmente carregado/registrado. */
  const loadedSystems = new Map();
  /** Órgãos HRA carregados à parte (`${system}#hra` → asset). */
  const loadedVariants = new Map();
  /** @type {Set<string>} chaves marcadas para descarte cooperativo (cancelLoad). */
  const cancelled = new Set();
  /** @type {Set<(p: import('../core/contracts.js').LoadProgress) => void>} */
  const progressListeners = new Set();
  /** @type {Map<string, Promise>} cache de `loadOrganDetail` por `${sid}|${sex}`. */
  const organDetailCache = new Map();

  let totalTriangles = 0;

  function emitProgress(payload) {
    for (const fn of progressListeners) {
      try {
        fn(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[atlas/assets] assinante de progresso lançou um erro:', err);
      }
    }
  }

  /** @returns {Promise<Object>} */
  function loadManifest(url) {
    if (manifest) return Promise.resolve(manifest);
    if (manifestPromise) return manifestPromise;
    const manifestUrl = url || `${base}manifest.json`;
    manifestPromise = fetch(manifestUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status} em ${manifestUrl}`);
        return res.json();
      })
      .then((json) => {
        // Validação leve de forma (o esquema completo é
        // data/atlas/schema/manifest.schema.json, checado no CI —
        // aqui só o suficiente para não seguir com um JSON claramente errado).
        if (!json || !Array.isArray(json.assets)) {
          throw new Error('manifest.json: forma inválida (esperava { assets: [...] })');
        }
        manifest = json;
        return json;
      })
      .catch((err) => {
        manifestPromise = null; // permite tentar de novo (ex.: rede instável)
        throw err;
      });
    return manifestPromise;
  }

  /**
   * @param {string} system
   * @param {'lod0'|'lod1'} lod
   * @param {string} sex
   * @returns {Object|null}
   */
  // `variant`: 'base' = o arquivo do corpo inteiro (Z-Anatomy, sexo "U") —
  // é o que "carregar o sistema" significa; 'hra' = o órgão detalhado do HRA
  // do sexo atual (coração, fígado, rim…), carregado à parte só quando uma
  // estrutura dele (sid "za:vh-*") é pedida. Antes o arquivo HRA do sexo
  // vencia o Z-Anatomy e o substituía: ventrículos, aorta, estômago,
  // intestinos etc. nunca entravam no corpo.
  function findAsset(system, lod, sex, variant = 'base') {
    if (!manifest) return null;
    const candidates = manifest.assets.filter((a) => a.system === system && a.lod === lod);
    if (!candidates.length) return null;
    if (variant === 'hra') {
      const hra = candidates.filter((a) => a.sex !== 'U');
      return hra.find((a) => a.sex === sex) || hra[0] || null;
    }
    return candidates.find((a) => a.sex === 'U') || candidates.find((a) => a.sex === sex) || candidates[0];
  }

  /**
   * Regra de LOD "auto" (documentada — plano §4/UX §17 não fixam a regra
   * exata, só o objetivo "LOD1 por padrão, LOD0 quando compensa"):
   * começa em LOD1; sobe para LOD0 quando o tier de qualidade é 'media' ou
   * 'alta' — nesses tiers o dispositivo já provou que sustenta mais
   * triângulos (ver `js/engine/quality.js`, que mede tempo de frame antes
   * de subir o tier). O sistema "estar em vista" de fato (frustum/tela)
   * fica para quem chama passar `lod` explícito quando souber melhor (ex.:
   * `visibility.js`/`focus-nav.js` medindo a câmera) — este loader não tem
   * acesso à câmera, só ao `store`.
   * @param {'auto'|0|1|'lod0'|'lod1'} requested
   * @returns {'lod0'|'lod1'}
   */
  function resolveLod(requested) {
    if (requested === 0 || requested === 'lod0') return 'lod0';
    if (requested === 1 || requested === 'lod1') return 'lod1';
    const tier = store && store.get ? store.get().quality.tier : 'auto';
    return tier === 'media' || tier === 'alta' ? 'lod0' : 'lod1';
  }

  /**
   * Baixa `<url>.gz` e descomprime no navegador. Devolve o ArrayBuffer do GLB
   * ou `null` (sem suporte, 404, ou servidor que já descomprimiu) — quem
   * chama cai no `.glb` normal.
   */
  async function fetchGzipGlb(url, onProgress) {
    if (typeof DecompressionStream !== 'function' || typeof TransformStream !== 'function') return null;
    try {
      const res = await fetch(`${url}.gz`);
      if (!res.ok || !res.body) return null;
      const total = Number(res.headers.get('content-length')) || 0;
      let loaded = 0;
      const counter = new TransformStream({
        transform(chunk, ctl) {
          loaded += chunk.byteLength;
          onProgress({ loaded, total });
          ctl.enqueue(chunk);
        },
      });
      const buffer = await new Response(res.body.pipeThrough(counter).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      // Cabeçalho do GLB ("glTF") — se não bater, não era um gzip de GLB.
      const magic = new Uint8Array(buffer, 0, 4);
      return magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46 ? buffer : null;
    } catch (e) {
      return null;
    }
  }

  function markLoaded(system, asset) {
    loadedSystems.set(system, asset);
    const s = store.get();
    if (!s.loadedSystems.includes(system)) {
      store.set({ loadedSystems: Object.freeze([...s.loadedSystems, system]) });
    }
    if (s.unavailableSystems.includes(system)) {
      store.set({ unavailableSystems: Object.freeze(s.unavailableSystems.filter((x) => x !== system)) });
    }
  }

  function markUnavailable(system, error) {
    loadedSystems.delete(system);
    const s = store.get();
    if (!s.unavailableSystems.includes(system)) {
      store.set({ unavailableSystems: Object.freeze([...s.unavailableSystems, system]) });
    }
    bus.emit(EVENTS.SYSTEM_LOAD_ERROR, { system, error: error ? String(error) : undefined });
  }

  /** Orçamento de triângulos (§17) — só avisa, nunca bloqueia o carregamento. */
  function checkTriangleBudget() {
    const tier = store && store.get ? store.get().quality.tier : 'auto';
    const budget = TRIANGLE_BUDGET[tier] || TRIANGLE_BUDGET.auto;
    if (totalTriangles > budget) {
      // eslint-disable-next-line no-console
      console.warn(`[atlas/assets] orçamento de triângulos excedido: ${totalTriangles} > ${budget} (tier "${tier}")`);
    }
  }

  /**
   * @param {string} system
   * @param {{ lod?: ('auto'|0|1|'lod0'|'lod1'), sex?: string }} [opts]
   * @returns {Promise<{ root: Object, asset: Object }|null>}
   */
  function loadSystem(system, opts = {}) {
    const sex = opts.sex || (store && store.get ? store.get().sex : 'M');
    const lod = resolveLod(opts.lod === undefined ? 'auto' : opts.lod);
    const variant = opts.variant === 'hra' ? 'hra' : 'base';
    const regKey = variant === 'hra' ? `${system}#hra` : system;
    const key = `${system}|${lod}|${sex}|${variant}`;
    const existing = inflight.get(key);
    if (existing) return existing; // dedupe: chamada concorrente ganha a mesma promessa

    const promise = (async () => {
      cancelled.delete(key);
      try {
        await loadManifest();
      } catch (err) {
        markUnavailable(system, err && err.message);
        return null;
      }
      let asset = findAsset(system, lod, sex, variant);
      // Sistema existe mas só no outro LOD (ex.: manifesto de teste sem
      // um dos dois): melhor mostrar algo do que marcar indisponível.
      if (!asset) asset = findAsset(system, lod === 'lod0' ? 'lod1' : 'lod0', sex, variant);
      if (!asset) {
        if (variant === 'hra') return null; // sistema sem órgão HRA: nada a carregar
        markUnavailable(system, `sistema "${system}" (sexo ${sex}) não existe no manifesto`);
        return null;
      }
      bus.emit(EVENTS.SYSTEM_LOAD_START, { system, variant });
      const url = base + asset.file;
      try {
        const onProgress = (evt) => {
          emitProgress({ system, loadedBytes: evt.loaded, totalBytes: evt.total || asset.bytes });
        };
        // .glb.gz primeiro (~43% menor; o GitHub Pages não comprime .glb);
        // sem DecompressionStream, ou se o .gz falhar, o .glb de sempre.
        const gzBuffer = await fetchGzipGlb(url, onProgress);
        const gltf = gzBuffer
          ? await gltfLoader.parseAsync(gzBuffer, url.slice(0, url.lastIndexOf('/') + 1))
          : await gltfLoader.loadAsync(url, onProgress);
        if (cancelled.has(key)) {
          cancelled.delete(key);
          return null; // descartado por cancelLoad() — nunca registra nem emite "done"
        }
        const root = gltf.scene;
        root.name = `system:${regKey}`;
        totalTriangles += asset.triangles || 0;
        checkTriangleBudget();
        const integrity = registry ? registry.registerSystem(system, { root, nodeToSid: asset.nodeToSid, sex, lod, asset, key: regKey }) : undefined;
        if (variant === 'hra') loadedVariants.set(regKey, asset);
        else markLoaded(system, asset);
        bus.emit(EVENTS.SYSTEM_LOAD_DONE, { system, variant, sex, lod, root, nodeToSid: asset.nodeToSid, asset, integrity });
        if (engine && engine.requestRender) engine.requestRender();
        return { root, asset };
      } catch (err) {
        // 404, parse inválido, Draco/Meshopt corrompido etc. — nunca deixa
        // a exceção subir: o sistema só fica "indisponível" (ver
        // js/engine/fallback.js para o que aparece no lugar).
        if (variant === 'hra') { bus.emit(EVENTS.SYSTEM_LOAD_ERROR, { system, variant, error: err && err.message }); return null; }
        markUnavailable(system, err && err.message);
        return null;
      }
    })();

    inflight.set(key, promise);
    promise.finally(() => inflight.delete(key));
    return promise;
  }

  /** Cancelamento cooperativo — ver nota no cabeçalho do arquivo. */
  function cancelLoad(system, opts = {}) {
    const sex = opts.sex || (store && store.get ? store.get().sex : 'M');
    const lod = resolveLod(opts.lod === undefined ? 'auto' : opts.lod);
    cancelled.add(`${system}|${lod}|${sex}|${opts.variant === 'hra' ? 'hra' : 'base'}`);
  }

  /**
   * Libera um sistema já carregado: pede ao Registry para descartar as
   * malhas/materiais próprios (a GPU) e sai de `store.loadedSystems`.
   * @param {string} system
   */
  function unloadSystem(system) {
    const asset = loadedSystems.get(system);
    if (!asset) return;
    if (registry) registry.unregisterSystem(system);
    loadedSystems.delete(system);
    totalTriangles = Math.max(0, totalTriangles - (asset.triangles || 0));
    const s = store.get();
    store.set({ loadedSystems: Object.freeze(s.loadedSystems.filter((x) => x !== system)) });
    if (engine && engine.requestRender) engine.requestRender();
  }

  /** @param {string} system @param {{variant?: 'base'|'hra'}} [opts] @returns {boolean} */
  function isLoaded(system, opts = {}) {
    return opts.variant === 'hra' ? loadedVariants.has(`${system}#hra`) : loadedSystems.has(system);
  }

  /**
   * @param {(p: import('../core/contracts.js').LoadProgress) => void} fn
   * @returns {() => void}
   */
  function onProgress(fn) {
    progressListeners.add(fn);
    return () => progressListeners.delete(fn);
  }

  /**
   * Carrega um asset de detalhe de órgão do HRA (ex.: câmaras/valvas do
   * coração) num grupo destacado — não entra em `engine.scene` sozinho; a
   * vista "Detalhe do órgão" decide quando anexar. Convenção de arquivo:
   * `models/hra-<slug>-<sexo>.glb` (fixtures) / `models/hra/<orgao>-<sexo>.glb`
   * (pipeline real, plano §3).
   *
   * GAP de contrato: `models/manifest.json` (data/atlas/schema/
   * manifest.schema.json) não guarda uma ligação explícita "sid do órgão →
   * arquivo HRA" — só `system`+`sex`. Resolvemos aqui perguntando ao
   * Registry (`getBySid`) o sistema do sid pedido (por isso o sistema
   * precisa já estar carregado/registrado antes de chamar isto) e casando
   * pelo `system`+`sex` entre os assets cujo nome de arquivo começa com
   * "hra". Reportado ao orquestrador para a Onda 2 (WP10/WP11) considerar
   * um campo `organSid` no manifesto.
   * @param {string} sid
   * @param {{ system?: string, sex?: string }} [opts]
   * @returns {Promise<{ root: Object, asset: Object, nodeToSid: Object }|null>}
   */
  function loadOrganDetail(sid, opts = {}) {
    const sex = opts.sex || (store && store.get ? store.get().sex : 'M');
    const cacheKey = `${sid}|${sex}`;
    if (organDetailCache.has(cacheKey)) return organDetailCache.get(cacheKey);

    const promise = (async () => {
      await loadManifest();
      const meta = registry && registry.getBySid ? registry.getBySid(sid) : null;
      const system = opts.system || (meta && meta.system);
      if (!system) {
        markUnavailable('hra', `loadOrganDetail: sistema de "${sid}" desconhecido (estrutura ainda não carregada?)`);
        return null;
      }
      const candidates = manifest.assets.filter((a) => /^models\/hra[-/]/i.test(a.file) && a.system === system);
      const asset = candidates.find((a) => a.sex === sex) || candidates.find((a) => a.sex === 'U') || candidates[0];
      if (!asset) {
        bus.emit(EVENTS.SYSTEM_LOAD_ERROR, { system, error: `detalhe de órgão indisponível para ${sid}` });
        return null;
      }
      try {
        const gltf = await gltfLoader.loadAsync(base + asset.file);
        const root = gltf.scene;
        root.name = `organ-detail:${sid}`;
        if (registry) registry.registerOrganDetail(sid, { root, nodeToSid: asset.nodeToSid, asset });
        return { root, asset, nodeToSid: asset.nodeToSid };
      } catch (err) {
        bus.emit(EVENTS.SYSTEM_LOAD_ERROR, { system, error: err && err.message });
        return null;
      }
    })();
    organDetailCache.set(cacheKey, promise);
    return promise;
  }

  return {
    loadManifest,
    loadSystem,
    isLoaded,
    onProgress,
    unloadSystem,
    cancelLoad,
    loadOrganDetail,
  };
}
