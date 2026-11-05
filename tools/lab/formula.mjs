/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * formula.mjs — contagem de átomos e massa molar a partir de uma fórmula.
 * Usado pelo gerador do seed do Laboratório e pelo validador (massa declarada
 * contra a fórmula). Aceita parênteses, coeficientes e hidratos ("CuSO4·5H2O").
 * Massas atômicas: valores convencionais (IUPAC), suficientes para a conferência
 * didática do catálogo; a tolerância é decidida por quem chama.
 */

export const MASSA_ATOMICA = Object.freeze({
  H: 1.008, D: 2.014, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305, Al: 26.982,
  Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078, Fe: 55.845, Ni: 58.693, Cu: 63.546,
  Zn: 65.38, Br: 79.904, Ag: 107.868, Sn: 118.71, I: 126.904, Ba: 137.327, Pb: 207.2,
});

/** Soma os átomos de uma fórmula (inclui hidratos separados por "·" ou "."). */
export function contarAtomos(formula) {
  const total = {};
  String(formula).split(/[·.]/).forEach((parte) => {
    const m = /^(\d+)?(.*)$/.exec(parte.trim());
    const fator = m[1] ? Number(m[1]) : 1;
    const contagem = contarSemHidrato(m[2]);
    Object.entries(contagem).forEach(([el, n]) => { total[el] = (total[el] || 0) + n * fator; });
  });
  return total;
}

function contarSemHidrato(texto) {
  const pilha = [{}];
  const re = /([A-Z][a-z]?)(\d*)|(\()|\)(\d*)/g;
  let m;
  let consumido = 0;
  while ((m = re.exec(texto)) !== null) {
    if (m.index !== consumido) throw new Error(`fórmula inválida: ${texto}`);
    consumido = re.lastIndex;
    if (m[1]) {
      const topo = pilha[pilha.length - 1];
      topo[m[1]] = (topo[m[1]] || 0) + (m[2] ? Number(m[2]) : 1);
    } else if (m[3]) {
      pilha.push({});
    } else {
      if (pilha.length < 2) throw new Error(`parênteses sem par: ${texto}`);
      const fechado = pilha.pop();
      const fator = m[4] ? Number(m[4]) : 1;
      const topo = pilha[pilha.length - 1];
      Object.entries(fechado).forEach(([el, n]) => { topo[el] = (topo[el] || 0) + n * fator; });
    }
  }
  if (consumido !== texto.length || pilha.length !== 1) throw new Error(`fórmula inválida: ${texto}`);
  return pilha[0];
}

/** Massa molar (g/mol) de uma fórmula; lança erro para elemento fora da tabela. */
export function massaDaFormula(formula) {
  let massa = 0;
  Object.entries(contarAtomos(formula)).forEach(([el, n]) => {
    if (!(el in MASSA_ATOMICA)) throw new Error(`elemento sem massa atômica na tabela: ${el}`);
    massa += MASSA_ATOMICA[el] * n;
  });
  return massa;
}

/** true se as duas fórmulas têm exatamente os mesmos átomos (ordem e notação de hidrato à parte). */
export function mesmaComposicao(a, b) {
  const x = contarAtomos(a);
  const y = contarAtomos(b);
  const chaves = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...chaves].every((k) => (x[k] || 0) === (y[k] || 0));
}
