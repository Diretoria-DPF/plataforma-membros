/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — cálculos de farmacotécnica (O5). Funções puras, sem DOM.
 *
 * Fator de correção (pureza/teor), fator de equivalência (sal e base), densidade aparente e escolha
 * da cápsula, regra de misturas (cruz de Pearson), diluição de álcool e de cloro ativo, conversões
 * % p/p e % p/v, osmolaridade e isotonicidade. Todos devolvem números; quem chama formata.
 * Os exemplos servem a exercícios didáticos; nada aqui é prescrição.
 */
(function (raiz) {
  'use strict';

  function positivo(v, nome) {
    if (!(v > 0) || !Number.isFinite(v)) throw new Error(`${nome} deve ser positivo`);
    return v;
  }

  /** Fator de correção pelo teor (%): matéria-prima a 98 % exige 100/98 do que a fórmula pede. */
  function fatorCorrecao(teorPct) {
    positivo(teorPct, 'teor');
    if (teorPct > 100) throw new Error('teor não pode passar de 100 %');
    return 100 / teorPct;
  }

  /** Fator de correção pela umidade (%): pesa-se a mais para compensar a água da matéria-prima. */
  function fatorUmidade(umidadePct) {
    if (!(umidadePct >= 0 && umidadePct < 100)) throw new Error('umidade deve estar entre 0 e 100 %');
    return 100 / (100 - umidadePct);
  }

  /** Fator de equivalência sal/base: massa de sal = massa de base × (MM sal ÷ MM base). */
  function fatorEquivalencia(mmSal, mmBase) {
    return positivo(mmSal, 'massa molar do sal') / positivo(mmBase, 'massa molar da base');
  }

  /** Massa (g) do ativo a pesar: dose total ÷ teor, com fator de equivalência opcional. */
  function massaAtivoG(p) {
    const doseTotalMg = positivo(p.doseMg, 'dose') * positivo(p.unidades, 'unidades');
    const fc = fatorCorrecao(p.teorPct === undefined ? 100 : p.teorPct);
    const fe = p.fatorEquivalencia === undefined ? 1 : positivo(p.fatorEquivalencia, 'fator de equivalência');
    return (doseTotalMg * fc * fe) / 1000;
  }

  /** Massa total de pó (g) para n cápsulas, com excesso de segurança para perdas (%). */
  function massaTotalPoG(unidades, massaPorCapsulaMg, excessoPct) {
    return (positivo(unidades, 'unidades') * positivo(massaPorCapsulaMg, 'massa por cápsula') * (1 + (excessoPct || 0) / 100)) / 1000;
  }

  /** Diluente q.s.p.: o que falta para completar a massa total depois de somar os componentes (g). */
  function qspG(massaTotalG, componentesG) {
    const falta = positivo(massaTotalG, 'massa total') - componentesG.reduce((a, b) => a + b, 0);
    if (falta < -1e-9) throw new Error('os componentes já passam da massa total');
    return falta;
  }

  /** Volume (mL) que o pó ocupa na cápsula: massa ÷ densidade aparente. */
  function volumeDoPoMl(massaMg, densidadeAparenteGmL) {
    return massaMg / 1000 / positivo(densidadeAparenteGmL, 'densidade aparente');
  }

  /** Menor cápsula (da lista de volumes em mL) que comporta o volume do pó; null se nenhuma comporta. */
  function escolherCapsula(volumeMl, tabela) {
    const ordem = Object.keys(tabela).sort((a, b) => tabela[a] - tabela[b]);
    for (const id of ordem) if (tabela[id] >= volumeMl) return id;
    return null;
  }

  function pvDePp(pp, densidade) { return positivo(pp, 'pp') * positivo(densidade, 'densidade'); }
  function ppDePv(pv, densidade) { return positivo(pv, 'pv') / positivo(densidade, 'densidade'); }

  /** Massa (g) de matéria-prima com teor `teorPp` (% p/p) para obter `alvoPp` em `massaFinalG`. */
  function massaParaTeorPp(alvoPp, massaFinalG, teorPp) {
    positivo(teorPp, 'teor da matéria-prima');
    if (alvoPp > teorPp) throw new Error('o teor desejado não pode passar do teor da matéria-prima');
    return (alvoPp * positivo(massaFinalG, 'massa final')) / teorPp;
  }

  /** Regra de misturas (cruz de Pearson): partes de cada solução para chegar à concentração-alvo. */
  function pearson(c1, c2, alvo) {
    if (!(alvo > Math.min(c1, c2) && alvo < Math.max(c1, c2))) throw new Error('a concentração-alvo deve ficar entre as duas');
    const p1 = Math.abs(c2 - alvo);
    const p2 = Math.abs(c1 - alvo);
    return { partes1: p1, partes2: p2, fracao1: p1 / (p1 + p2), fracao2: p2 / (p1 + p2) };
  }

  /** C1·V1 = C2·V2 em massa: massa de estoque (g) para obter `cFinal` em `massaFinalG`. */
  function massaEstoqueDiluicao(cEstoque, cFinal, massaFinalG) {
    if (!(cFinal > 0 && cEstoque > cFinal)) throw new Error('concentração final deve ser positiva e menor que a do estoque');
    return (cFinal * positivo(massaFinalG, 'massa final')) / cEstoque;
  }

  /** ppm de cloro ativo a partir de % p/p. */
  function ppmDePp(pp) { return pp * 10000; }

  /** Densidade (g/mL) pelo picnômetro: (m cheio − m vazio) ÷ volume. */
  function densidadePicnometro(massaCheioG, massaVazioG, volumeMl) {
    return (massaCheioG - massaVazioG) / positivo(volumeMl, 'volume do picnômetro');
  }

  /** Osmolaridade ideal (mOsm/L) de um soluto não eletrólito ou eletrólito: g/L ÷ MM × partículas × 1000. */
  function osmolaridadeMOsm(gPorL, mm, particulas) {
    return (gPorL / positivo(mm, 'massa molar')) * (particulas || 1) * 1000;
  }

  /** Massa (g) de soluto para o volume e a concentração em mg/mL. */
  function massaPorConcentracaoG(mgPorMl, volumeMl) { return (positivo(mgPorMl, 'concentração') * positivo(volumeMl, 'volume')) / 1000; }

  /** Gotas por mL (didático): conversão de volume em número de gotas pelo fator da gotas/mL do conta-gotas. */
  function gotas(volumeMl, gotasPorMl) { return volumeMl * positivo(gotasPorMl, 'gotas por mL'); }

  /** Interpolação linear em pontos [[x, y], ...] ordenados por x (limites fixos nas pontas). */
  function interpolar(pontos, x) {
    if (!Array.isArray(pontos) || !pontos.length) throw new Error('curva vazia');
    if (x <= pontos[0][0]) return pontos[0][1];
    for (let i = 1; i < pontos.length; i++) {
      if (x <= pontos[i][0]) {
        const [x0, y0] = pontos[i - 1];
        const [x1, y1] = pontos[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return pontos[pontos.length - 1][1];
  }

  const API = {
    fatorCorrecao, fatorUmidade, fatorEquivalencia, massaAtivoG, massaTotalPoG, qspG, volumeDoPoMl, escolherCapsula,
    pvDePp, ppDePv, massaParaTeorPp, pearson, massaEstoqueDiluicao, ppmDePp, densidadePicnometro, osmolaridadeMOsm,
    massaPorConcentracaoG, gotas, interpolar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabFarmaCalculos = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
