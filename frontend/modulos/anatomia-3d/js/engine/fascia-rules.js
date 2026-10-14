/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * fascia-rules.js — regras (puras, orientadas a dados) sobre as fáscias
 * ---------------------------------------------------------------------------
 * Decisão do dono (opção 2): o clique PREFERE o músculo/estrutura que está sob
 * a fáscia superficial (fáscia, retináculo, aponeurose, trato iliotibial), mas
 * a fáscia continua selecionável; e há uma camada própria "Fáscias" com
 * liga/desliga e o modo "somente fáscias".
 *
 * Sem three.js e sem DOM: roda em Node nos testes.
 *
 *  - `isFasciaSid`: a regra por NOME (slug do sid) de quem é fáscia. Antes, 80%
 *    dos cliques no corpo caíam em fáscias (diagnóstico de cliques §8): elas
 *    envolvem os músculos e eram a primeira superfície que o raio encontrava.
 *  - `preferUnderFascia`: reordena os acertos do raio — se o mais próximo é
 *    fáscia e logo atrás (dentro de `FASCIA_DEPTH_WINDOW`) há outra estrutura,
 *    a de baixo vem primeiro e a fáscia fica em segundo.
 *  - `createPickCycle`: clicar de novo no mesmo ponto alterna entre a estrutura
 *    de baixo e a fáscia que a cobre (é assim que a fáscia continua alcançável).
 *  - `fasciaOnlyLayers` / `restoreLayers`: o modo "somente fáscias" do painel.
 */

import { LAYER_DEFAULT_OPACITY } from '../core/contracts.js';

/** Slug do sid sem o prefixo de fonte ("za:", "fma:"...). */
function slugOf(sid) {
  const text = String(sid || '');
  const i = text.indexOf(':');
  return i >= 0 ? text.slice(i + 1) : text;
}

/**
 * Regras por nome (slug em inglês do Z-Anatomy). `exclude` vence `include`:
 * "tensor-fasciae-latae" é um MÚSCULO apesar do nome.
 */
export const FASCIA_RULES = Object.freeze({
  include: Object.freeze([
    /(?:^|-)fasci(?:a|ae|as)(?:-|$)/, // fascia-lata, pectoral-fascia, tendoes-fascias...
    /retinacul/, // retináculos (tornozelo, punho, patela, fibulares)
    /aponeuros/, // aponeuroses (epicraniana, palmar, plantar)
    /iliotibial-tract/, // trato iliotibial
  ]),
  exclude: Object.freeze([
    /tensor-fasciae-latae/, // músculo tensor da fáscia lata
  ]),
});

/** A estrutura é uma fáscia superficial/retináculo/aponeurose/trato? */
export function isFasciaSid(sid) {
  const slug = slugOf(sid);
  if (!slug) return false;
  if (FASCIA_RULES.exclude.some((re) => re.test(slug))) return false;
  return FASCIA_RULES.include.some((re) => re.test(slug));
}

/** Distância máxima (m) atrás da fáscia em que ainda se considera "a estrutura
 * sob a fáscia" (fáscia sobre músculo: milímetros a poucos centímetros). */
export const FASCIA_DEPTH_WINDOW = 0.08;

/**
 * Reordena acertos do raio para preferir a estrutura sob a fáscia.
 * @param {Array<{sid: string, distance: number, fascia: boolean, faint?: boolean, point?: number[]}>} hits
 * @param {{ window?: number, enabled?: boolean }} [opts]
 * @returns {Array<{sid: string, distance: number, fascia: boolean}>} nova lista
 *   (a fáscia deslocada fica logo depois da estrutura que a substituiu)
 */
export function preferUnderFascia(hits, { window: depth = FASCIA_DEPTH_WINDOW, enabled = true } = {}) {
  if (!enabled || hits.length < 2 || !hits[0].fascia) return hits.slice();
  const first = hits[0];
  // Só vale o que está ATRÁS da fáscia e é sólido: a lista chega com as
  // transparentes depois das sólidas (não é monotônica em distância), e uma pele
  // translúcida na frente da fáscia não pode virar "a estrutura de baixo".
  const under = hits.find((h, i) => i > 0 && !h.fascia && !h.faint
    && h.distance >= first.distance && h.distance - first.distance <= depth);
  if (!under) return hits.slice();
  return [under, ...hits.filter((h) => h !== under)];
}

/** Tolerância para dois cliques valerem como "o mesmo ponto": distância (m) entre
 * os pontos 3D acertados na fáscia — não em pixels, porque ao abrir a ficha o
 * painel muda o tamanho do canvas e a câmera se desloca (o ponto 3D não muda). */
export const CYCLE_POINT_EPS = 0.03;
/** Tolerância (NDC) quando os acertos não trazem o ponto 3D. */
const CYCLE_NDC_EPS = 0.015;

/**
 * Alternância ao clicar de novo no mesmo ponto: 1º clique → estrutura sob a
 * fáscia; 2º → a fáscia; 3º → volta à estrutura. Só participa quando a
 * preferência deslocou uma fáscia (`ordered[0]` difere de `raw[0]`).
 * @returns {{ choose: (point: {x:number,y:number}, raw: Object[], ordered: Object[]) => (Object|null), reset: () => void }}
 */
export function createPickCycle() {
  let last = null; // { x, y, primary, alt, showing }

  function samePoint(point, fascia) {
    if (!last) return false;
    if (last.world && fascia.point) return Math.hypot(last.world[0] - fascia.point[0], last.world[1] - fascia.point[1], last.world[2] - fascia.point[2]) < CYCLE_POINT_EPS;
    return Math.abs(last.x - point.x) < CYCLE_NDC_EPS && Math.abs(last.y - point.y) < CYCLE_NDC_EPS;
  }

  function choose(point, raw, ordered) {
    if (!ordered.length) { last = null; return null; }
    const displaced = raw.length > 0 && raw[0].fascia && ordered[0] !== raw[0];
    if (!displaced) { last = null; return ordered[0]; }
    const primary = ordered[0];
    const alt = raw[0];
    if (samePoint(point, alt) && last.primary.sid === primary.sid) {
      last = { ...last, showing: last.showing === 'primary' ? 'alt' : 'primary' };
    } else {
      last = { x: point.x, y: point.y, world: alt.point || null, primary, alt, showing: 'primary' };
    }
    return last.showing === 'primary' ? primary : alt;
  }

  return { choose, reset: () => { last = null; } };
}

// ---- Modo "somente fáscias" -------------------------------------------------

export const FASCIA_LAYER_ID = 'fascias';
/** Opacidade inicial da camada Fáscias: translúcida, para os músculos sob ela
 * continuarem visíveis (e o destaque da seleção também). */
export const FASCIA_DEFAULT_OPACITY = LAYER_DEFAULT_OPACITY.fascias;

/**
 * Camadas para o modo "somente fáscias": tudo desligado, menos Fáscias (opaca).
 * @param {Record<string, {visible: boolean, opacity: number}>} layers
 * @returns {Record<string, {visible: boolean, opacity: number}>} novo objeto
 */
export function fasciaOnlyLayers(layers) {
  const out = {};
  for (const [id, state] of Object.entries(layers)) {
    out[id] = id === FASCIA_LAYER_ID ? { visible: true, opacity: 1 } : { ...state, visible: false };
  }
  if (!out[FASCIA_LAYER_ID]) out[FASCIA_LAYER_ID] = { visible: true, opacity: 1 };
  return out;
}

/** O estado atual das camadas é "somente fáscias"? */
export function isFasciaOnly(layers) {
  const entries = Object.entries(layers);
  return entries.length > 1
    && !!layers[FASCIA_LAYER_ID] && layers[FASCIA_LAYER_ID].visible
    && entries.every(([id, s]) => id === FASCIA_LAYER_ID || !s.visible);
}

/** Cópia rasa do estado das camadas (para restaurar ao sair do modo). */
export function snapshotLayers(layers) {
  const out = {};
  for (const [id, s] of Object.entries(layers)) out[id] = { visible: !!s.visible, opacity: s.opacity };
  return out;
}
