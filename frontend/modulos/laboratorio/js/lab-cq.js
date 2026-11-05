/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — Controle de Qualidade (O5). Funções puras, sem DOM: peso médio, uniformidade de doses unitárias
 * (valor de aceitação), pH, densidade, viscosidade, teor por titulação, desintegração, dissolução em estágios
 * e limite microbiano conceitual. Cada ensaio devolve { aprovado, ... } com os números que explicam a decisão.
 * Os critérios-padrão ficam em CRITERIOS e podem ser trocados por critérios do processo; a fonte oficial de
 * cada critério fica em data/cq/ensaios.json (citação, sem reproduzir o texto da norma).
 */
(function (raiz) {
  'use strict';

  const soma = (v) => v.reduce((a, b) => a + b, 0);
  const media = (v) => soma(v) / v.length;
  function desvioPadrao(v) {
    if (v.length < 2) return 0;
    const m = media(v);
    return Math.sqrt(soma(v.map((x) => (x - m) * (x - m))) / (v.length - 1));
  }
  function numeros(v, nome) {
    if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error(`${nome}: informe uma lista de números`);
    return v;
  }
  const arred = (x, c) => { const f = Math.pow(10, c === undefined ? 2 : c); return Math.round(x * f) / f; };

  // ── Peso médio ────────────────────────────────────────────────────────────
  // Limite de variação individual (± % do peso médio) por tipo e faixa de peso médio.
  const FAIXAS_PESO = {
    capsula: [{ ate: 300, pct: 10 }, { ate: Infinity, pct: 7.5 }],
    comprimido: [{ ate: 80, pct: 10 }, { ate: 250, pct: 7.5 }, { ate: Infinity, pct: 5 }]
  };

  function limitePesoPct(tipo, mediaMg) {
    const faixas = FAIXAS_PESO[tipo];
    if (!faixas) throw new Error(`tipo desconhecido para peso médio: ${tipo}`);
    return faixas.find((f) => mediaMg < f.ate).pct;
  }

  /** Peso médio e limites: no máximo 2 unidades (de 20) fora do limite e nenhuma fora do dobro dele. */
  function pesoMedio(pesosMg, tipo) {
    const v = numeros(pesosMg, 'pesos');
    if (v.length < 10) throw new Error('peso médio exige ao menos 10 unidades (o método usa 20)');
    const m = media(v);
    const pct = limitePesoPct(tipo, m);
    const inf = m * (1 - pct / 100);
    const sup = m * (1 + pct / 100);
    const inf2 = m * (1 - pct / 50);
    const sup2 = m * (1 + pct / 50);
    const fora = v.filter((x) => x < inf || x > sup).length;
    const foraDobro = v.filter((x) => x < inf2 || x > sup2).length;
    const permitidas = v.length >= 20 ? 2 : 1;
    return {
      n: v.length, mediaMg: m, desvioPadraoMg: desvioPadrao(v), cvPct: (100 * desvioPadrao(v)) / m,
      limitePct: pct, inferiorMg: inf, superiorMg: sup, fora, foraDobro, permitidas,
      aprovado: fora <= permitidas && foraDobro === 0
    };
  }

  // ── Uniformidade de doses unitárias (valor de aceitação) ─────────────────
  const L1 = 15;
  const L2 = 25;

  /** teoresPct: conteúdo de cada unidade em % da quantidade declarada (10 unidades no 1º estágio; 30 no 2º). */
  function uniformidadeDoses(teoresPct) {
    const v = numeros(teoresPct, 'teores');
    if (v.length !== 10 && v.length !== 30) throw new Error('uniformidade usa 10 unidades (1º estágio) ou 30 (2º estágio)');
    const x = media(v);
    const s = desvioPadrao(v);
    const M = x < 98.5 ? 98.5 : (x > 101.5 ? 101.5 : x);
    const k = v.length === 10 ? 2.4 : 2.0;
    const va = Math.abs(M - x) + k * s;
    let aprovado = va <= L1;
    let extremos = true;
    if (v.length === 30) {
      extremos = v.every((t) => t >= (1 - L2 / 100) * M && t <= (1 + L2 / 100) * M);
      aprovado = aprovado && extremos;
    }
    return { n: v.length, estagio: v.length === 10 ? 1 : 2, mediaPct: x, desvioPadraoPct: s, M, k, valorAceitacao: va, L1, L2, extremosOk: extremos, aprovado };
  }

  // ── Medidas diretas ──────────────────────────────────────────────────────
  function naFaixa(valor, faixa) {
    if (!Array.isArray(faixa) || faixa.length !== 2 || faixa[0] > faixa[1]) throw new Error('faixa deve ser [mínimo, máximo]');
    return { valor, minimo: faixa[0], maximo: faixa[1], aprovado: valor >= faixa[0] && valor <= faixa[1] };
  }

  /** Viscosidade (mPa·s = cP) = leitura de torque (%) × fator do conjunto fuso/velocidade; leitura entre 10 e 100 %. */
  function viscosidadeRotacional(leituraTorquePct, fator) {
    if (!(leituraTorquePct > 0 && fator > 0)) throw new Error('leitura e fator devem ser positivos');
    return { mPaS: (leituraTorquePct * fator) / 1, leituraValida: leituraTorquePct >= 10 && leituraTorquePct <= 100 };
  }

  /**
   * Teor por titulação: massa do analito (g) = V(L) × M × f × MM × r; teor (%) = massa ÷ amostra × 100.
   * r = razão estequiométrica analito:titulante (ex.: 1 para ácido monoprótico com NaOH).
   */
  function teorTitulacao(p) {
    const vL = (p.volumeGastoMl - (p.brancoMl || 0)) / 1000;
    if (!(vL > 0 && p.concMolL > 0 && p.massaMolar > 0 && p.massaAmostraG > 0)) throw new Error('volume, concentração, massa molar e massa da amostra devem ser positivos');
    const f = p.fatorCorrecaoTitulante === undefined ? 1 : p.fatorCorrecaoTitulante;
    const r = p.razao === undefined ? 1 : p.razao;
    const massaAnalitoG = vL * p.concMolL * f * p.massaMolar * r;
    return { massaAnalitoG, teorPct: (100 * massaAnalitoG) / p.massaAmostraG };
  }

  /** Fator de correção do titulante (padronização): f = massa do padrão primário ÷ (V·M·MM·r). */
  function fatorTitulante(p) {
    const teorica = (p.volumeGastoMl / 1000) * p.concMolL * p.massaMolar * (p.razao || 1);
    if (!(teorica > 0 && p.massaPadraoG > 0)) throw new Error('dados da padronização inválidos');
    return p.massaPadraoG / teorica;
  }

  // ── Desintegração e dissolução ───────────────────────────────────────────
  function desintegracao(temposMin, limiteMin) {
    const v = numeros(temposMin, 'tempos');
    const max = Math.max.apply(null, v);
    return { n: v.length, maximoMin: max, mediaMin: media(v), limiteMin, aprovado: max <= limiteMin };
  }

  /**
   * Dissolução em estágios para a quantidade Q (% do declarado, no tempo do ensaio).
   * S1 (6 unidades): todas ≥ Q+5. S2 (12): média ≥ Q e nenhuma < Q−15. S3 (24): média ≥ Q, no máximo 2 abaixo de Q−15 e nenhuma < Q−25.
   */
  function dissolucaoEstagios(valoresPct, Q) {
    const v = numeros(valoresPct, 'valores');
    if (v.length < 6) throw new Error('dissolução exige ao menos 6 unidades');
    const s1 = v.slice(0, 6);
    if (s1.every((x) => x >= Q + 5)) return { estagio: 'S1', aprovado: true, mediaPct: media(s1), unidades: 6, Q };
    if (v.length < 12) return { estagio: 'S1', aprovado: false, precisaS2: true, mediaPct: media(s1), unidades: 6, Q };
    const s2 = v.slice(0, 12);
    if (media(s2) >= Q && s2.every((x) => x >= Q - 15)) return { estagio: 'S2', aprovado: true, mediaPct: media(s2), unidades: 12, Q };
    if (v.length < 24) return { estagio: 'S2', aprovado: false, precisaS3: true, mediaPct: media(s2), unidades: 12, Q };
    const s3 = v.slice(0, 24);
    const abaixo15 = s3.filter((x) => x < Q - 15).length;
    const ok = media(s3) >= Q && abaixo15 <= 2 && s3.every((x) => x >= Q - 25);
    return { estagio: 'S3', aprovado: ok, mediaPct: media(s3), unidades: 24, Q };
  }

  // ── Microbiologia (conceitual) ───────────────────────────────────────────
  // Limites por g ou mL; categorias simplificadas para fins didáticos.
  const LIMITES_MICROBIANOS = {
    oral_nao_aquoso: { tamc: 1000, tymc: 100, ausencia: ['Escherichia coli'] },
    oral_aquoso: { tamc: 100, tymc: 10, ausencia: ['Escherichia coli'] },
    cutaneo: { tamc: 100, tymc: 10, ausencia: ['Staphylococcus aureus', 'Pseudomonas aeruginosa'] }
  };

  /** contagens: { tamc, tymc, presentes: [micro-organismos encontrados] } por g ou mL. */
  function limiteMicrobiano(categoria, contagens) {
    const lim = LIMITES_MICROBIANOS[categoria];
    if (!lim) throw new Error(`categoria microbiológica desconhecida: ${categoria}`);
    const presentes = contagens.presentes || [];
    const proibidos = lim.ausencia.filter((m) => presentes.includes(m));
    const aprovado = contagens.tamc <= lim.tamc && contagens.tymc <= lim.tymc && proibidos.length === 0;
    return { categoria, limiteTamc: lim.tamc, limiteTymc: lim.tymc, ausencia: lim.ausencia, proibidosEncontrados: proibidos, aprovado };
  }

  function esterilidade(crescimento) { return { crescimento: !!crescimento, aprovado: !crescimento }; }

  // ── Critérios-padrão (a fonte e a conferência ficam em data/cq/ensaios.json) ─────────────────────
  const CRITERIOS = {
    peso_medio: { tipo: 'capsula', unidades: 20 },
    uniformidade: { L1, L2, unidades: 10 },
    desintegracao: { capsulaDuraMin: 45, comprimidoMin: 30, unidades: 6 },
    dissolucao: { QPct: 80, tempoMin: 30, unidades: 6 }
  };

  const API = {
    FAIXAS_PESO, L1, L2, LIMITES_MICROBIANOS, CRITERIOS, media, desvioPadrao, arred,
    limitePesoPct, pesoMedio, uniformidadeDoses, naFaixa, viscosidadeRotacional, teorTitulacao, fatorTitulante,
    desintegracao, dissolucaoEstagios, limiteMicrobiano, esterilidade
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabCq = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
