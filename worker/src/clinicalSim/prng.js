/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/prng.js
 * Gerador pseudoaleatório determinístico da simulação clínica (ADR 0009). PURO: sem I/O, sem relógio e sem
 * Math.random. A mesma semente produz sempre a mesma sequência, em qualquer máquina (só aritmética inteira de 32 bits).
 * É isso que deixa o servidor reconstruir o paciente a cada turno a partir da semente.
 */

/** Semente inteira de 32 bits sem sinal; qualquer valor não inteiro vira 0. */
export function toUint32(seed) {
  return Number.isInteger(seed) ? seed >>> 0 : 0;
}

/**
 * mulberry32: devolve uma função que gera números em [0, 1) a cada chamada.
 * @param {number} seed inteiro
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let state = toUint32(seed);
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sorteio ponderado que consome SEMPRE um número do gerador (mesmo com um só candidato): a ordem e a quantidade de
 * sorteios nunca dependem dos pesos, então mudar um peso não desloca os sorteios seguintes.
 * @param {() => number} rng
 * @param {Array<[string, number]>} entries pares [valor, peso]; peso 0 ou negativo exclui o valor
 * @returns {string|null} o valor sorteado, ou null se nenhum candidato tem peso positivo
 */
export function pickWeighted(rng, entries) {
  const roll = rng();
  const live = entries.filter((e) => e[1] > 0);
  const total = live.reduce((sum, e) => sum + e[1], 0);
  if (!total) return null;
  let acc = 0;
  for (const [value, weight] of live) {
    acc += weight;
    if (roll * total < acc) return value;
  }
  return live[live.length - 1][0];
}
