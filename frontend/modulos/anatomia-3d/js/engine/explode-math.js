/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * explode-math.js — matemática (pura) da vista "Separar peças"
 * ---------------------------------------------------------------------------
 * Sem three.js e sem DOM: roda em Node nos testes e só é carregada junto com
 * a vista (import dinâmico — nada disto entra no boot do Atlas).
 *
 * O deslocamento é RADIAL a partir de um centro (o centro do corpo, ou o do
 * órgão isolado): cada peça anda na direção "centro → peça", e quanto mais
 * superficial a camada, mais ela anda (pele e fáscias saem primeiro, esqueleto
 * e vísceras ficam mais perto do centro) — assim as camadas se abrem em
 * "cascas" em vez de se atravessarem. O padrão (explosão radial ponderada por
 * camada, proporcional à distância ao centro) é o de qualquer vista explodida
 * de atlas; a implementação aqui é própria.
 *
 * Deslocamentos são em METROS DO MUNDO. Quem os grava nas instâncias do
 * BatchedMesh precisa respeitar o espelho dos lotes `#m`:
 * `instanceMatrixFor` (registry-helpers.js) multiplica por MIRROR_X.
 */

/** Deslocamento radial máximo (m) para uma peça de peso 1 com `amount` = 1. */
export const EXPLODE_BASE_M = 0.14;
/** Fração extra da distância ao centro (a explosão é proporcional ao corpo). */
export const EXPLODE_SPREAD = 0.5;
/** Duração da animação (ms); com "reduzir movimento" a vista salta direto. */
export const EXPLODE_DURATION_MS = 450;
/** Constante de tempo do suavizador (ms): 99% do caminho em ~5 × tau. */
export const EXPLODE_TAU_MS = 90;
/** Distância (em amount) abaixo da qual a animação encosta no alvo. */
export const EXPLODE_SNAP = 0.002;

/** Peso por camada: superficial anda mais (cascas concêntricas). */
export const LAYER_EXPLODE_WEIGHT = Object.freeze({
  pele: 1,
  fascias: 0.9,
  musculos: 0.75,
  nervos: 0.55,
  linfatico: 0.5,
  esqueleto: 0.45,
  vasos: 0.4,
  visceras: 0.3,
});
const DEFAULT_WEIGHT = 0.5;

export const layerWeight = (layer) => (Object.prototype.hasOwnProperty.call(LAYER_EXPLODE_WEIGHT, layer) ? LAYER_EXPLODE_WEIGHT[layer] : DEFAULT_WEIGHT);

/** Limita `value` a [0, 1]; NaN vira 0. */
export const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Suaviza a animação (desacelera no fim). */
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;

/** Passo de um tween linear no tempo, em [from, to]. */
export function tweenStep(from, to, elapsedMs, durationMs = EXPLODE_DURATION_MS) {
  if (durationMs <= 0) return to;
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs);
}

/**
 * Aproxima `current` de `target` (suavização exponencial, independente da
 * taxa de quadros): responde bem a quem arrasta o controle deslizante.
 * @returns {{ value: number, done: boolean }}
 */
export function approach(current, target, dtMs, tau = EXPLODE_TAU_MS) {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tau);
  const value = current + (target - current) * k;
  return Math.abs(target - value) < EXPLODE_SNAP ? { value: target, done: true } : { value, done: false };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);

/** Centro de uma caixa `{min, max}`. */
export const boxCenter = (box) => [
  (box.min[0] + box.max[0]) / 2,
  (box.min[1] + box.max[1]) / 2,
  (box.min[2] + box.max[2]) / 2,
];

/** União de várias caixas; `null` se não houver nenhuma válida. */
export function unionBoxes(boxes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  for (const b of boxes) {
    if (!b || b.min.some((v) => !Number.isFinite(v)) || b.max.some((v) => !Number.isFinite(v))) continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
    count += 1;
  }
  return count ? { min, max } : null;
}

/**
 * Deslocamento de um ponto a partir de um centro.
 * @param {number[]} center
 * @param {number[]} point
 * @param {number} amount 0..1
 * @param {number} weight peso da camada (0..1)
 * @param {number} [salt] desempata quando o ponto coincide com o centro
 * @returns {number[]} [dx, dy, dz] (metros do mundo)
 */
export function radialOffset(center, point, amount, weight, salt = 0) {
  const t = clamp01(amount);
  if (t === 0 || weight === 0) return [0, 0, 0];
  const d = sub(point, center);
  const dist = len(d);
  // Ponto no centro: direção arbitrária, mas estável (por `salt`).
  const dir = dist > 1e-6
    ? [d[0] / dist, d[1] / dist, d[2] / dist]
    : [Math.cos(salt * 2.399), Math.sin(salt * 2.399), 0.35];
  const k = len(dir);
  const push = t * weight * EXPLODE_BASE_M / k;
  const spread = t * weight * EXPLODE_SPREAD;
  return [dir[0] * push + d[0] * spread, dir[1] * push + d[1] * spread, dir[2] * push + d[2] * spread];
}

/**
 * Deslocamentos de todas as peças.
 *  - modo 'corpo': um deslocamento por ESTRUTURA (todas as instâncias de um
 *    sid andam juntas, a estrutura não se desmonta);
 *  - modo 'orgao' (órgão isolado): um deslocamento por INSTÂNCIA (sub-malhas
 *    do órgão se afastam do centro do órgão).
 * @param {Array<{sid: string, layer: string, center: number[], parts?: number[][]}>} items
 * @param {{ center: number[], amount: number, mode?: 'corpo'|'orgao' }} opts
 * @returns {Map<string, number[]|number[][]>}
 */
export function computeExplodeOffsets(items, { center, amount, mode = 'corpo' }) {
  const out = new Map();
  if (!center || clamp01(amount) === 0) return out;
  items.forEach((item, i) => {
    const w = mode === 'orgao' ? 1 : layerWeight(item.layer);
    if (mode === 'orgao' && Array.isArray(item.parts) && item.parts.length > 1) {
      out.set(item.sid, item.parts.map((p, j) => radialOffset(center, p, amount, w, i + j)));
    } else {
      out.set(item.sid, radialOffset(center, item.center, amount, w, i));
    }
  });
  return out;
}

/** Valor do controle (0..100 %) → amount 0..1, ancorado em passos de 1%. */
export const percentToAmount = (percent) => clamp01(Math.round(Number(percent)) / 100);
