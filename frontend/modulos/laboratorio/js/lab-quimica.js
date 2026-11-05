/**
 * LAIFT — núcleo de química da bancada (funções puras, sem DOM).
 *
 * Unidade de quantidade: `sys.especies` (Map id -> número) guarda MILIMOL (mmol).
 *   - sólido:   mmol = g * 1000 / massa molar
 *   - líquido:  mmol = mL * densidade(g/mL) * 1000 / massa molar
 *   - solução:  mmol = concentração(mol/L) * mL ; o solvente entra como H2O_l em mmol
 *   - volume:   `sys.vol` em mL
 *   - pH:       concentração em mol/L = mmol / mL (mmol/mL equivale a mol/L)
 * Carregado antes de script.js (window.LabQuimica) e também em Node (testes).
 */
(function (raiz) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Contagem de átomos e balanço de equações
  // ---------------------------------------------------------------------------
  const ELEMENTOS = new Set((
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
    'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U D'
  ).split(' '));

  function somar(destino, origem, fator) {
    for (const el of Object.keys(origem)) destino[el] = (destino[el] || 0) + origem[el] * fator;
  }

  /** Átomos de uma fórmula (aceita parênteses e hidratos com "·"). null se não for fórmula. */
  function contarAtomos(formula) {
    if (typeof formula !== 'string') return null;
    const partes = formula.replace(/\s+/g, '').split('·');
    const total = {};
    for (const parte of partes) {
      const m = /^(\d*)(.+)$/.exec(parte);
      if (!m) return null;
      const mult = m[1] ? parseInt(m[1], 10) : 1;
      const atomos = contarSimples(m[2]);
      if (!atomos) return null;
      somar(total, atomos, mult);
    }
    return Object.keys(total).length ? total : null;
  }

  function contarSimples(texto) {
    const pilha = [{}];
    let i = 0;
    while (i < texto.length) {
      const c = texto[i];
      if (c === '(') { pilha.push({}); i++; continue; }
      if (c === ')') {
        if (pilha.length < 2) return null;
        i++;
        let j = i;
        while (j < texto.length && /\d/.test(texto[j])) j++;
        const mult = j > i ? parseInt(texto.slice(i, j), 10) : 1;
        i = j;
        const topo = pilha.pop();
        somar(pilha[pilha.length - 1], topo, mult);
        continue;
      }
      const el = /^[A-Z][a-z]?/.exec(texto.slice(i));
      if (!el) return null;
      let simbolo = el[0];
      if (!ELEMENTOS.has(simbolo)) {
        simbolo = simbolo[0];
        if (!ELEMENTOS.has(simbolo)) return null;
      }
      i += simbolo.length;
      let j = i;
      while (j < texto.length && /\d/.test(texto[j])) j++;
      const n = j > i ? parseInt(texto.slice(i, j), 10) : 1;
      i = j;
      somar(pilha[pilha.length - 1], { [simbolo]: n }, 1);
    }
    return pilha.length === 1 ? pilha[0] : null;
  }

  function atomosDoLado(lado) {
    const total = {};
    for (const termo of lado.split(/\s\+\s/)) {
      const m = /^\s*(\d*)\s*(\S.*?)\s*$/.exec(termo);
      if (!m) return null;
      const atomos = contarAtomos(m[2]);
      if (!atomos) return null;
      somar(total, atomos, m[1] ? parseInt(m[1], 10) : 1);
    }
    return total;
  }

  function iguais(a, b) {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chaves) if ((a[k] || 0) !== (b[k] || 0)) return false;
    return true;
  }

  /** true só se TODAS as etapas ("a -> b; c -> d") fecham o balanço atômico. */
  function equacaoBalanceada(equacao) {
    if (typeof equacao !== 'string' || !equacao.trim()) return false;
    const etapas = equacao.split(';').map((s) => s.trim()).filter(Boolean);
    if (!etapas.length) return false;
    for (const etapa of etapas) {
      const lados = etapa.split('->');
      if (lados.length !== 2) return false;
      const esq = atomosDoLado(lados[0]);
      const dir = atomosDoLado(lados[1]);
      if (!esq || !dir || !iguais(esq, dir)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // 2. Soluções e pH (eletroneutralidade + equilíbrios fracos)
  // ---------------------------------------------------------------------------
  const KW = 1e-14;

  // Famílias ácido-base: formas da mais protonada para a menos; pKa de cada passo.
  const FAMILIAS = [
    { nome: 'fluoreto', formas: ['HF', 'F-'], cargas: [0, -1], pKa: [3.17] },
    { nome: 'acetato', formas: ['CH3COOH', 'CH3COO-'], cargas: [0, -1], pKa: [4.76] },
    { nome: 'hipoclorito', formas: ['HClO', 'ClO-'], cargas: [0, -1], pKa: [7.54] },
    { nome: 'amônio', formas: ['NH4+', 'NH3'], cargas: [1, 0], pKa: [9.25] },
    { nome: 'carbonato', formas: ['H2CO3', 'HCO3-', 'CO3_2-'], cargas: [0, -1, -2], pKa: [6.35, 10.33] }
  ];
  const MEMBROS_FAMILIA = new Set();
  FAMILIAS.forEach((f) => f.formas.forEach((x) => MEMBROS_FAMILIA.add(x)));

  /** Carga elétrica inferida do id da espécie (Na+, Fe3+, SO4_2-, NO3-, CH3COO-...). */
  function cargaDaEspecie(id) {
    const s = String(id);
    let m = /_(\d)([+-])$/.exec(s);
    if (m) return (m[2] === '+' ? 1 : -1) * parseInt(m[1], 10);
    m = /^[A-Z][a-z]?(\d)\+$/.exec(s);
    if (m) return parseInt(m[1], 10);
    if (/\+$/.test(s)) return 1;
    if (/-$/.test(s)) return -1;
    return 0;
  }

  function fracoes(familia, h) {
    const termos = [1];
    for (let k = 0; k < familia.pKa.length; k++) {
      termos.push(termos[k] * Math.pow(10, -familia.pKa[k]) / h);
    }
    const soma = termos.reduce((a, b) => a + b, 0);
    return termos.map((t) => t / soma);
  }

  /**
   * pH a partir do estado (Map em mmol) e do volume (mL). Resolve a eletroneutralidade:
   *   [H+] + (Q + soma T_f * carga média_f(pH)) / V = [OH-]
   * H+ e OH- do mapa são ignorados (o pH é o resultado, não a entrada).
   */
  function calcularPH(especies, volMl) {
    if (!(volMl > 0) || !especies) return 7;
    let q = 0;
    const totais = FAMILIAS.map(() => 0);
    for (const [id, mmol] of especies) {
      if (!(mmol > 0) || id === 'H+' || id === 'OH-') continue;
      const fi = FAMILIAS.findIndex((f) => f.formas.includes(id));
      if (fi >= 0) { totais[fi] += mmol; continue; }
      q += cargaDaEspecie(id) * mmol;
    }
    const f = (pH) => {
      const h = Math.pow(10, -pH);
      let carga = q;
      FAMILIAS.forEach((fam, i) => {
        if (!totais[i]) return;
        const fr = fracoes(fam, h);
        let media = 0;
        fr.forEach((p, k) => { media += p * fam.cargas[k]; });
        carga += totais[i] * media;
      });
      return h - KW / h + carga / volMl;
    };
    let lo = -2, hi = 16;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return Math.max(0, Math.min(14, (lo + hi) / 2));
  }

  // ---------------------------------------------------------------------------
  // 3. Conversões de quantidade e adição de reagentes
  // ---------------------------------------------------------------------------
  const MMOL_POR_ML_PADRAO = 10; // líquido sem dados no catálogo (mesmo valor histórico)

  function mmolDeSolido(gramas, massaMolar) { return (gramas * 1000) / massaMolar; }
  function mmolDeLiquido(ml, densidade, massaMolar) {
    if (!(densidade > 0) || !(massaMolar > 0)) return ml * MMOL_POR_ML_PADRAO;
    return (ml * densidade * 1000) / massaMolar;
  }
  const MMOL_AGUA_POR_ML = mmolDeLiquido(1, 1, 18.015);

  // Concentração (mol/L) de cada reagente em solução do catálogo.
  const CONC_AQ = {
    H2O2_aq: 3.0, PbNO3_aq: 1.0, AgNO3_aq: 1.0, CdNO3_aq: 1.0, CuSO4_aq: 1.0, FeCl3_aq: 1.0, ZnSO4_aq: 1.0,
    NiCl2_aq: 1.0, SbCl3_aq: 1.0, CaCl2_aq: 1.0, BaCl2_aq: 1.0, CoCl2_aq: 1.0, SCN_aq: 1.0, HCl_aq: 6.0,
    H2SO4_aq: 9.0, AcidoAcetico_aq: 1.0, KI_aq: 1.0, NH42S_aq: 1.0, NaOH_aq: 6.0, NH3_aq: 5.0, Na2CO3_aq: 1.0,
    NaClO_aq: 2.0, NaHCO3_aq: 1.0, K2CO3_aq: 1.0, KOH_aq: 6.0, LiOH_aq: 5.0, CaOH2_aq: 0.5, HNO3_aq: 6.0,
    HClO4_aq: 6.0, H3PO4_aq: 4.0, HF_aq: 1.0
  };

  // Espécies liberadas por mmol de soluto (ácidos fracos e amônia ficam como forma molecular).
  const DISSOCIACAO = {
    HCl_aq: [['H+', 1], ['Cl-', 1]],
    H2SO4_aq: [['H+', 2], ['SO4_2-', 1]],
    HNO3_aq: [['H+', 1], ['NO3-', 1]],
    HClO4_aq: [['H+', 1], ['ClO4-', 1]],
    H3PO4_aq: [['H+', 3], ['PO4_3-', 1]],
    HF_aq: [['HF', 1]],
    AcidoAcetico_aq: [['CH3COOH', 1]],
    NaOH_aq: [['Na+', 1], ['OH-', 1]],
    NH3_aq: [['NH3', 1]],
    NaClO_aq: [['Na+', 1], ['ClO-', 1]],
    KI_aq: [['K+', 1], ['I-', 1]],
    NH42S_aq: [['NH4+', 2], ['S_2-', 1]],
    Na2CO3_aq: [['Na+', 2], ['CO3_2-', 1]],
    PbNO3_aq: [['Pb2+', 1], ['NO3-', 2]],
    AgNO3_aq: [['Ag+', 1], ['NO3-', 1]],
    CdNO3_aq: [['Cd2+', 1], ['NO3-', 2]],
    CuSO4_aq: [['Cu2+', 1], ['SO4_2-', 1]],
    FeCl3_aq: [['Fe3+', 1], ['Cl-', 3]],
    ZnSO4_aq: [['Zn2+', 1], ['SO4_2-', 1]],
    NiCl2_aq: [['Ni2+', 1], ['Cl-', 2]],
    SbCl3_aq: [['Sb3+', 1], ['Cl-', 3]],
    CaCl2_aq: [['Ca2+', 1], ['Cl-', 2]],
    BaCl2_aq: [['Ba2+', 1], ['Cl-', 2]],
    CoCl2_aq: [['Co2+', 1], ['Cl-', 2]],
    SCN_aq: [['K+', 1], ['SCN-', 1]],
    H2O2_aq: [['H2O2', 1]],
    NaHCO3_aq: [['Na+', 1], ['HCO3-', 1]],
    K2CO3_aq: [['K+', 2], ['CO3_2-', 1]],
    KOH_aq: [['K+', 1], ['OH-', 1]],
    LiOH_aq: [['Li+', 1], ['OH-', 1]],
    CaOH2_aq: [['Ca2+', 1], ['OH-', 2]]
  };

  /**
   * Efeito de adicionar `quantidade` (g para sólido, mL para líquido/solução) de `id`.
   * `info` = entrada do banco de espécies ({phase, molarMass, density, dissociation}) ou null.
   * Devolve { especies: [[id, mmol]...], volumeMl }.
   */
  function efeitoDaAdicao(id, quantidade, info, massaPadrao) {
    const fase = info && info.phase ? info.phase : (id.slice(-1) === 'q' ? 'aq' : id.slice(-1));
    const massa = info && info.molarMass ? info.molarMass : (massaPadrao || 100);
    const lista = [];
    let volumeMl = 0;
    if (fase === 'l') {
      lista.push([id, mmolDeLiquido(quantidade, info && info.density, massa)]);
      volumeMl = quantidade;
    } else if (fase === 'aq') {
      const mmol = (CONC_AQ[id] || 1.0) * quantidade;
      lista.push(['H2O_l', quantidade * MMOL_AGUA_POR_ML]);
      volumeMl = quantidade;
      const diss = DISSOCIACAO[id] || (info && Array.isArray(info.dissociation) ? info.dissociation : null);
      if (diss) diss.forEach(([sp, fator]) => lista.push([sp, mmol * fator]));
    } else if (fase === 's') {
      lista.push([id, mmolDeSolido(quantidade, massa)]);
    }
    return { especies: lista, volumeMl };
  }

  // ---------------------------------------------------------------------------
  // 4. Reações da bancada
  // ---------------------------------------------------------------------------
  const PRECIP_TABLE = [
    { cat: 'Ag+', an: 'Cl-', cC: 1, cA: 1, prod: 'AgCl_s', cor: '#f5f5f5', nomePubChem: 'Silver chloride' },
    { cat: 'Pb2+', an: 'Cl-', cC: 1, cA: 2, prod: 'PbCl2_s', cor: '#eceff1', nomePubChem: 'Lead(II) chloride' },
    { cat: 'Pb2+', an: 'I-', cC: 1, cA: 2, prod: 'PbI2_s', cor: '#ffeb3b', nomePubChem: 'Lead(II) iodide' },
    { cat: 'Ag+', an: 'I-', cC: 1, cA: 1, prod: 'AgI_s', cor: '#fff9c4', nomePubChem: 'Silver iodide' },
    { cat: 'Cu2+', an: 'OH-', cC: 1, cA: 2, prod: 'Cu(OH)2_s', cor: '#4dd0e1', nomePubChem: 'Copper(II) hydroxide' },
    { cat: 'Fe3+', an: 'OH-', cC: 1, cA: 3, prod: 'Fe(OH)3_s', cor: '#8d6e63', nomePubChem: 'Iron(III) hydroxide' },
    { cat: 'Ni2+', an: 'OH-', cC: 1, cA: 2, prod: 'Ni(OH)2_s', cor: '#a5d6a7', nomePubChem: 'Nickel(II) hydroxide' },
    { cat: 'Ca2+', an: 'CO3_2-', cC: 1, cA: 1, prod: 'CaCO3_s', cor: '#fafafa', nomePubChem: 'Calcium carbonate' },
    { cat: 'Ba2+', an: 'CO3_2-', cC: 1, cA: 1, prod: 'BaCO3_s', cor: '#f5f5f5', nomePubChem: 'Barium carbonate' },
    { cat: 'Pb2+', an: 'S_2-', cC: 1, cA: 1, prod: 'PbS_s', cor: '#212121', nomePubChem: 'Lead(II) sulfide' },
    { cat: 'Ag+', an: 'S_2-', cC: 2, cA: 1, prod: 'Ag2S_s', cor: '#1a1a1a', nomePubChem: 'Silver sulfide' },
    { cat: 'Cu2+', an: 'S_2-', cC: 1, cA: 1, prod: 'CuS_s', cor: '#1b1b1b', nomePubChem: 'Copper(II) sulfide' },
    { cat: 'Cd2+', an: 'S_2-', cC: 1, cA: 1, prod: 'CdS_s', cor: '#fdd835', nomePubChem: 'Cadmium sulfide' },
    { cat: 'Zn2+', an: 'S_2-', cC: 1, cA: 1, prod: 'ZnS_s', cor: '#e8eaf6', nomePubChem: 'Zinc sulfide' },
    { cat: 'Sb3+', an: 'S_2-', cC: 2, cA: 3, prod: 'Sb2S3_s', cor: '#ff7043', nomePubChem: 'Antimony trisulfide' },
    { cat: 'Ca2+', an: 'SO4_2-', cC: 1, cA: 1, prod: 'CaSO4_s', cor: '#f5f5f5', nomePubChem: 'Calcium sulfate' },
    { cat: 'Ba2+', an: 'SO4_2-', cC: 1, cA: 1, prod: 'BaSO4_s', cor: '#ffffff', nomePubChem: 'Barium sulfate' },
    { cat: 'Pb2+', an: 'SO4_2-', cC: 1, cA: 1, prod: 'PbSO4_s', cor: '#eceff1', nomePubChem: 'Lead(II) sulfate' }
  ];

  // Metais que deslocam H2 de ácido diluído (série de reatividade: E° < 0 e sem passivação por sal insolúvel).
  // Cu, Ag, Au ficam abaixo do hidrogênio; Pb forma PbCl2/PbSO4 insolúvel e passiva em HCl/H2SO4 diluídos.
  const METAIS_ATIVOS = {
    Li_s: { ion: 'Li+', valencia: 1 }, Na_s: { ion: 'Na+', valencia: 1 }, K_s: { ion: 'K+', valencia: 1 },
    Mg_s: { ion: 'Mg2+', valencia: 2 }, Ca_s: { ion: 'Ca2+', valencia: 2 }, Al_s: { ion: 'Al3+', valencia: 3 },
    Zn_s: { ion: 'Zn2+', valencia: 2 }, Fe_s: { ion: 'Fe2+', valencia: 2 }, Ni_s: { ion: 'Ni2+', valencia: 2 },
    Sn_s: { ion: 'Sn2+', valencia: 2 }
  };
  const METAIS_SEM_REACAO_COM_ACIDO_DILUIDO = ['Cu_s', 'Pb_s'];

  function qtd(sys, id) { return sys.especies.get(id) || 0; }
  function mais(sys, id, n) { if (n > 0) sys.especies.set(id, qtd(sys, id) + n); }
  function menos(sys, id, n) {
    const novo = Math.max(0, qtd(sys, id) - n);
    if (novo < 1e-12) sys.especies.delete(id); else sys.especies.set(id, novo);
  }

  /** Tira `n` mmol de prótons: H+ forte primeiro, depois ácidos fracos (vira a base conjugada). */
  function consumirProtons(sys, n) {
    let falta = n;
    const doH = Math.min(qtd(sys, 'H+'), falta);
    if (doH > 0) { menos(sys, 'H+', doH); falta -= doH; }
    for (const [acido, base] of [['CH3COOH', 'CH3COO-'], ['HF', 'F-']]) {
      if (falta <= 1e-12) break;
      const x = Math.min(qtd(sys, acido), falta);
      if (x > 0) { menos(sys, acido, x); mais(sys, base, x); falta -= x; }
    }
    return n - falta;
  }
  function protonsDisponiveis(sys) { return qtd(sys, 'H+') + qtd(sys, 'CH3COOH') + qtd(sys, 'HF'); }

  /**
   * Passo de equilíbrio químico (dissolução, neutralização, metais, carbonatos, cloro, alcalinos,
   * precipitação). Altera sys.especies e sys.temp. Devolve a lista de eventos para a interface.
   */
  function equilibrar(sys, ctx) {
    const eventos = [];
    const agitado = !!(ctx && ctx.agitadorAtivo);

    if (sys.vol > 0 && qtd(sys, 'H2O_l') > 0) {
      const tx = agitado ? 1.0 : 0.25;
      [['NaCl_s', 'Na+', 'Cl-', 1], ['CuSO4_s', 'Cu2+', 'SO4_2-', 1], ['NaHCO3_s', 'Na+', 'HCO3-', 1]].forEach(([sol, cat, an]) => {
        const s = qtd(sys, sol);
        if (s > 0) { const r = s * tx; menos(sys, sol, r); mais(sys, cat, r); mais(sys, an, r); }
      });
    }

    // Neutralização forte: H+ + OH- -> H2O
    const hOh = Math.min(qtd(sys, 'H+'), qtd(sys, 'OH-'));
    if (hOh > 0) {
      menos(sys, 'H+', hOh); menos(sys, 'OH-', hOh); mais(sys, 'H2O_l', hOh);
      sys.temp += hOh * 0.05;
    }
    // OH- residual neutraliza ácidos fracos e amônio; H+ residual protona NH3.
    [['CH3COOH', 'CH3COO-'], ['HF', 'F-'], ['NH4+', 'NH3'], ['HCO3-', 'CO3_2-']].forEach(([ac, ba]) => {
      const r = Math.min(qtd(sys, 'OH-'), qtd(sys, ac));
      if (r > 0) { menos(sys, 'OH-', r); menos(sys, ac, r); mais(sys, ba, r); mais(sys, 'H2O_l', r); }
    });
    const hNh3 = Math.min(qtd(sys, 'H+'), qtd(sys, 'NH3'));
    if (hNh3 > 0) { menos(sys, 'H+', hNh3); menos(sys, 'NH3', hNh3); mais(sys, 'NH4+', hNh3); }

    // Metais com ácido (H+ forte ou ácido fraco)
    if (protonsDisponiveis(sys) > 0) {
      for (const [metal, d] of Object.entries(METAIS_ATIVOS)) {
        const qm = qtd(sys, metal);
        const prot = protonsDisponiveis(sys);
        if (qm <= 0 || prot < d.valencia) continue;
        let r = Math.min(qm, prot / d.valencia);
        if (!agitado) r *= 0.5;
        menos(sys, metal, r);
        consumirProtons(sys, d.valencia * r);
        mais(sys, d.ion, r);
        mais(sys, 'H2_g', (r * d.valencia) / 2);
        sys.temp += r * 2;
      }
      METAIS_SEM_REACAO_COM_ACIDO_DILUIDO.forEach((m) => {
        if (qtd(sys, m) > 0) eventos.push({ tipo: 'sem_reacao', metal: m });
      });

      // Carbonatos: CO3 2- -> HCO3- -> CO2 (um próton por etapa)
      const aCO3 = Math.min(qtd(sys, 'CO3_2-'), protonsDisponiveis(sys));
      if (aCO3 > 0) { const r = consumirProtons(sys, aCO3); menos(sys, 'CO3_2-', r); mais(sys, 'HCO3-', r); }
      const aHCO3 = Math.min(qtd(sys, 'HCO3-'), protonsDisponiveis(sys));
      if (aHCO3 > 0) {
        const r = consumirProtons(sys, aHCO3);
        menos(sys, 'HCO3-', r); mais(sys, 'H2O_l', r); mais(sys, 'CO2_g', r);
      }
      const caco3 = qtd(sys, 'CaCO3_s');
      if (caco3 > 0 && protonsDisponiveis(sys) >= 2) {
        const r = Math.min(caco3, protonsDisponiveis(sys) / 2);
        menos(sys, 'CaCO3_s', r); consumirProtons(sys, 2 * r);
        mais(sys, 'Ca2+', r); mais(sys, 'H2O_l', r); mais(sys, 'CO2_g', r);
      }

      const clo = qtd(sys, 'ClO-'), cl = qtd(sys, 'Cl-');
      if (clo > 0 && cl > 0 && qtd(sys, 'H+') >= 2) {
        const r = Math.min(clo, cl, qtd(sys, 'H+') / 2);
        menos(sys, 'ClO-', r); menos(sys, 'Cl-', r); menos(sys, 'H+', 2 * r);
        mais(sys, 'H2O_l', r); mais(sys, 'Cl2_g', r);
        eventos.push({ tipo: 'cloro' });
      }
    }

    // Metais alcalinos com água
    ['Na_s', 'Li_s', 'K_s'].forEach((m) => {
      const qm = qtd(sys, m), agua = qtd(sys, 'H2O_l');
      if (qm <= 0 || agua <= 0) return;
      const r = Math.min(qm, agua);
      menos(sys, m, r); menos(sys, 'H2O_l', r);
      mais(sys, METAIS_ATIVOS[m].ion, r); mais(sys, 'OH-', r); mais(sys, 'H2_g', r / 2);
      sys.temp += r * 5.5;
      if (r > 12) eventos.push({ tipo: 'ignicao', metal: m });
    });

    // Precipitação
    PRECIP_TABLE.forEach((p) => {
      const cq = qtd(sys, p.cat), aq = qtd(sys, p.an);
      if (!(cq > 0 && aq > 0)) return;
      const m = Math.min(cq / p.cC, aq / p.cA);
      menos(sys, p.cat, m * p.cC); menos(sys, p.an, m * p.cA); mais(sys, p.prod, m);
      if (m > 0.1) eventos.push({ tipo: 'precipitado', regra: p, mmol: m });
    });
    return eventos;
  }

  // ---------------------------------------------------------------------------
  // 5. Síntese por estequiometria (reagente limitante, rendimento, tempo e faixa de temperatura)
  // ---------------------------------------------------------------------------
  /**
   * rx.estequiometria = { reagentes:[{id, chave, coef}], produto:{id, coef}, coprodutos:[{id, coef}] }
   *   chave = id da espécie no mapa (padrão: id). rx.rendimentoPercentual, rx.tempoReacaoMin,
   *   rx.tempMinima, rx.tempMaxima, rx.precisaAgitador, rx.catalisador.
   * `est` guarda o andamento: { xiConsumido, concluida, produtoMmol }.
   */
  function extensaoLimitante(sys, rx) {
    let xi = Infinity, limitante = null;
    for (const r of rx.estequiometria.reagentes) {
      const e = qtd(sys, r.chave || r.id) / r.coef;
      if (e < xi) { xi = e; limitante = r.id; }
    }
    return { xi: isFinite(xi) ? xi : 0, limitante };
  }

  function condicoesDaSintese(sys, rx, ctx) {
    const faltando = [];
    if (rx.estequiometria.reagentes.some((r) => qtd(sys, r.chave || r.id) <= 1e-9)) faltando.push('reagentes');
    if (rx.catalisador && !(ctx.catalisadores && ctx.catalisadores.has(rx.catalisador))) faltando.push('catalisador');
    if (rx.precisaAgitador && !ctx.agitadorAtivo) faltando.push('agitação');
    if (sys.temp < rx.tempMinima) faltando.push('temperatura mínima');
    if (rx.tempMaxima !== undefined && sys.temp > rx.tempMaxima) faltando.push('temperatura máxima');
    return faltando;
  }

  /** Avança a síntese `minSimulados` minutos. Devolve { est, progresso, concluiu, faltando, limitante }. */
  function avancarSintese(sys, rx, est, minSimulados, ctx) {
    const atual = est || { xiConsumido: 0, concluida: false, produtoMmol: 0 };
    if (atual.concluida) return { est: atual, progresso: 1, concluiu: false, faltando: [], limitante: null };
    const faltando = condicoesDaSintese(sys, rx, ctx);
    const { xi: disp, limitante } = extensaoLimitante(sys, rx);
    const potencial = atual.xiConsumido + disp;
    const progressoAtual = potencial > 0 ? atual.xiConsumido / potencial : 0;
    if (faltando.length) return { est: atual, progresso: progressoAtual, concluiu: false, faltando, limitante };

    const dxi = Math.min(disp, potencial * (minSimulados / rx.tempoReacaoMin));
    const rend = (rx.rendimentoPercentual || 100) / 100;
    const e = rx.estequiometria;
    e.reagentes.forEach((r) => menos(sys, r.chave || r.id, r.coef * dxi));
    mais(sys, e.produto.id, e.produto.coef * dxi * rend);
    (e.coprodutos || []).forEach((c) => mais(sys, c.id, c.coef * dxi));
    if (rx.volumeProdutoMlPorMmol) sys.vol += e.produto.coef * dxi * rend * rx.volumeProdutoMlPorMmol;

    const novo = {
      xiConsumido: atual.xiConsumido + dxi,
      produtoMmol: atual.produtoMmol + e.produto.coef * dxi * rend,
      concluida: false
    };
    const restante = extensaoLimitante(sys, rx).xi;
    const prog = novo.xiConsumido + restante > 0 ? novo.xiConsumido / (novo.xiConsumido + restante) : 0;
    const concluiu = restante <= 1e-9 && novo.produtoMmol >= (rx.produtoMinimoMmol || 0.05);
    novo.concluida = concluiu;
    return { est: novo, progresso: concluiu ? 1 : prog, concluiu, faltando: [], limitante };
  }

  const API = {
    contarAtomos, equacaoBalanceada, cargaDaEspecie, calcularPH, FAMILIAS,
    mmolDeSolido, mmolDeLiquido, MMOL_AGUA_POR_ML, CONC_AQ, DISSOCIACAO, efeitoDaAdicao,
    PRECIP_TABLE, METAIS_ATIVOS, equilibrar, extensaoLimitante, avancarSintese, condicoesDaSintese
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabQuimica = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
