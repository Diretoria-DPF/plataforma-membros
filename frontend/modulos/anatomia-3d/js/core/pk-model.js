/**
 * pk-model.js — modelo PK/PD puro do modo Farmacologia (PR 3.2, Bloco C).
 *
 * Sem DOM e sem Chart.js: o mesmo código desenha os gráficos no atlas e roda
 * nos testes (scripts/atlas/pk-model.test.mjs, casos canônicos com fonte).
 *
 *  - PK: um compartimento, eliminação de 1ª ordem (ke = ln2 / t½).
 *      IV em bolus:    Cp(t) = D / Vd · e^(−ke·t)
 *      extravascular:  Cp(t) = F·D·ka / (Vd·(ka − ke)) · (e^(−ke·t) − e^(−ka·t))   (Bateman)
 *    Unidades: dose em mg, Vd em L, tempo em h → Cp em mg/L.
 *  - PD: Emax/Hill sobre a concentração plasmática (sem compartimento de efeito):
 *      E(C) = Emax · C^n / (EC50^n + C^n)
 */

export const LN2 = Math.LN2;

/** Constante de eliminação (h⁻¹) a partir da meia-vida (h). */
export function eliminationRate(halfLife) {
  const t = Number(halfLife);
  return t > 0 ? LN2 / t : 0;
}

/** Vias sem fase de absorção (Cp máxima em t = 0). */
export function isIntravenous(route) {
  const r = String(route || '').toUpperCase();
  return r === 'IV' || r === 'INTRAVENOSA';
}

/**
 * Parâmetros prontos para o modelo, a partir de compound.pk (v1 normalizado ou v2).
 * F e ka vêm do dado; IV força F = 1 e ignora ka.
 */
export function pkParams(pk) {
  const p = pk || {};
  const iv = isIntravenous(p.route);
  return {
    iv,
    dose: Number(p.dose) || 0,
    vd: Number(p.vd) || 0,
    ke: eliminationRate(p.halfLife),
    ka: iv ? 0 : Number(p.ka) || 0,
    F: iv ? 1 : (p.F != null ? Number(p.F) : 1),
  };
}

/** Cp(t) em mg/L. */
export function concentration(t, params) {
  const { iv, dose, vd, ke, F } = params;
  let { ka } = params;
  if (!(vd > 0) || !(dose > 0) || t < 0) return 0;
  if (iv) return (dose / vd) * Math.exp(-ke * t);
  if (!(ka > 0)) return 0;
  if (Math.abs(ka - ke) < 1e-6) {
    // Limite ka → ke da equação de Bateman: F·D·k·t·e^(−k·t) / Vd.
    return (F * dose * ka * t * Math.exp(-ka * t)) / vd;
  }
  const c = ((F * dose * ka) / (vd * (ka - ke))) * (Math.exp(-ke * t) - Math.exp(-ka * t));
  return c > 0 ? c : 0;
}

/** Tmax analítico (h): ln(ka/ke)/(ka − ke); 0 na IV. */
export function analyticTmax(params) {
  const { iv, ka, ke } = params;
  if (iv || !(ka > 0) || !(ke > 0)) return 0;
  if (Math.abs(ka - ke) < 1e-6) return 1 / ka;
  return Math.log(ka / ke) / (ka - ke);
}

/** Efeito Emax/Hill (% do máximo do sistema). */
export function effect(c, pd) {
  const p = pd || {};
  const emax = Number(p.emax);
  const ec50 = Number(p.ec50);
  const n = Number(p.hill) || 1;
  if (!(c > 0) || !(emax > 0) || !(ec50 > 0)) return 0;
  const cn = Math.pow(c, n);
  return (emax * cn) / (Math.pow(ec50, n) + cn);
}

/** Janela de simulação: 5 meias-vidas (≈ 97% eliminado), entre 6 h e 72 h. */
export function defaultDuration(pk) {
  const t = Number(pk && pk.halfLife) || 4;
  return Math.max(6, Math.min(72, t * 5));
}

/**
 * Simula Cp(t) e E(t).
 * @param {{ pk: Object, pd?: Object }} compound
 * @param {{ duration?: number, points?: number }} [opts]
 * @returns {{ t: number[], cp: number[], e: number[], cmax: number, tmax: number, auc: number, analyticTmax: number }}
 */
export function simulate(compound, { duration, points = 121 } = {}) {
  const pk = (compound && compound.pk) || {};
  const pd = compound && compound.pd;
  const params = pkParams(pk);
  const tEnd = duration > 0 ? duration : defaultDuration(pk);
  const n = Math.max(2, Math.floor(points));
  const t = [];
  const cp = [];
  const e = [];
  for (let i = 0; i < n; i++) {
    const ti = (tEnd * i) / (n - 1);
    const ci = concentration(ti, params);
    t.push(ti);
    cp.push(ci);
    e.push(pd ? effect(ci, pd) : 0);
  }
  // Cmax/Tmax exatos (não dependem da grade): avalia no Tmax analítico.
  const tm = analyticTmax(params);
  const cmax = concentration(tm, params);
  let auc = 0;
  for (let i = 1; i < n; i++) auc += ((cp[i] + cp[i - 1]) / 2) * (t[i] - t[i - 1]);
  return { t, cp, e, cmax, tmax: tm, auc, analyticTmax: tm };
}

/**
 * Diferença relativa |simulado − referência| / referência (para os casos
 * canônicos: tolerância de 25% contra o valor citado).
 */
export function relativeError(simulated, reference) {
  const r = Number(reference);
  if (!(r > 0)) return Infinity;
  return Math.abs(Number(simulated) - r) / r;
}
