/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — cálculos farmacêuticos do motor de processos (O3). Funções puras.
 * Unidades: g, mL, mol/L, mmol, mOsm/L. Dose só para exercício, nunca como prescrição.
 */
(function (raiz) {
  'use strict';

  function positivo(v, nome) { if (!(v > 0)) throw new Error(`${nome} deve ser positivo`); return v; }

  /** Massa (g) de soluto para `pct` % p/v em `volumeMl`, corrigida pela pureza (fração). */
  function massaParaPV(pct, volumeMl, pureza) {
    positivo(volumeMl, 'volume');
    const p = pureza === undefined ? 1 : pureza;
    if (!(p > 0 && p <= 1)) throw new Error('pureza deve estar entre 0 e 1');
    return (pct * volumeMl) / 100 / p;
  }

  function mmol(massaG, mm) { return (massaG * 1000) / positivo(mm, 'massa molar'); }
  function mmolDeVolume(volMl, densidade, mm) { return (volMl * densidade * 1000) / positivo(mm, 'massa molar'); }
  function molaridade(massaG, mm, volMl) { return mmol(massaG, mm) / positivo(volMl, 'volume'); }

  /** C1·V1 = C2·V2; informe três e receba o quarto (v2 ou v1). */
  function diluir(p) {
    if (!(p.c2 > 0) || !(p.c1 > 0) || p.c2 > p.c1) throw new Error('concentração final deve ser positiva e menor que a inicial');
    if (p.v1 > 0) return (p.c1 * p.v1) / p.c2;
    if (p.v2 > 0) return (p.c2 * p.v2) / p.c1;
    throw new Error('informe v1 ou v2');
  }

  /** Osmolaridade ideal (mOsm/L) = Σ C·i·1000. */
  function osmolaridade(componentes) {
    return componentes.reduce((s, c) => s + c.concMolL * (c.i || 1) * 1000, 0);
  }

  function fatorCorrecao(teorPct) { return 100 / positivo(teorPct, 'teor'); }
  function rendimentoPct(realG, teoricoG) { return (100 * realG) / positivo(teoricoG, 'rendimento teórico'); }
  function rendimentoTeoricoG(nLimitanteMmol, coefLimitante, coefProduto, mmProduto) {
    return (nLimitanteMmol / coefLimitante) * coefProduto * mmProduto / 1000;
  }

  function doseMl(p) {
    const mg = p.mgPorKg * positivo(p.pesoKg, 'peso');
    return { mg, ml: mg / positivo(p.concMgPorMl, 'concentração'), aviso: 'Cálculo para exercício didático; não é prescrição.' };
  }

  function formatarNumero(v, casas) { return Number(v).toFixed(casas === undefined ? 2 : casas).replace('.', ','); }

  function lerNumero(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(/\s/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }

  /** Compara a resposta do aluno ao cálculo prévio da etapa. Devolve { respondida, ok, valor, texto }. */
  function conferirResposta(calculo, resposta) {
    if (resposta === undefined || resposta === null || resposta === '') return { respondida: false, ok: false, valor: null, texto: 'Cálculo prévio não respondido.' };
    const valor = lerNumero(resposta);
    const casas = Math.max(0, Math.min(4, Math.ceil(-Math.log10(calculo.tolerancia || 0.01))));
    const certo = `${formatarNumero(calculo.resposta, casas)} ${calculo.unidade}`;
    if (valor === null) return { respondida: true, ok: false, valor: null, texto: `Resposta não numérica. Conta: ${calculo.formula}; resultado ${certo}.` };
    const ok = Math.abs(valor - calculo.resposta) <= (calculo.tolerancia || 0);
    return {
      respondida: true, ok, valor,
      texto: ok ? `Certo: ${certo} (${calculo.formula}).` : `Ainda não: você respondeu ${formatarNumero(valor, casas)}; conta ${calculo.formula} dá ${certo}.`
    };
  }

  const API = {
    massaParaPV, mmol, mmolDeVolume, molaridade, diluir, osmolaridade, fatorCorrecao,
    rendimentoPct, rendimentoTeoricoG, doseMl, formatarNumero, lerNumero, conferirResposta
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorCalculos = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
