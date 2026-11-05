/**
 * chem-core.js — regras químicas puras do Estúdio 3D (sem DOM).
 *
 * Separadas de studio.js para serem testadas em Node (frontend/scripts/
 * estudio-quimica.test.mjs, com o RDKit real quando disponível):
 *   - fórmula e massa a partir de SMILES e de fórmula (sem RDKit);
 *   - valência pela SOMA DAS ORDENS DE LIGAÇÃO (LAB-07);
 *   - bioisosterismo por substituição estrutural (reações SMARTS do RDKit,
 *     com sanitização) em vez de troca de texto no SMILES (LAB-08);
 *   - alertas estruturais (LAB-09) e propriedades sem RDKit (LAB-15).
 *
 * Carregado por studio/index.html antes de studio.js (window.LaiftChemCore).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LaiftChemCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── Massas atômicas (IUPAC, valores abreviados) ───────────────────────
  var PESOS = {
    H: 1.008, D: 2.014, T: 3.016, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007,
    O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974,
    S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942,
    Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723,
    Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906,
    Zr: 91.224, Nb: 92.906, Mo: 95.95, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41,
    In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33,
    La: 138.91, Ce: 140.12, Gd: 157.25, Pt: 195.08, Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2,
    Bi: 208.98, U: 238.03
  };

  function massaDoElemento(sym, isotopo) {
    if (isotopo) {
      if (sym === 'H' && isotopo === 2) return PESOS.D;
      if (sym === 'H' && isotopo === 3) return PESOS.T;
      return isotopo;
    }
    return PESOS[sym];
  }

  function arredondar(x) { return Math.round(x * 1000) / 1000; }

  /** Fórmula de Hill a partir de contagens {C:6,H:6}. */
  function formulaHill(contagens) {
    var chaves = Object.keys(contagens).filter(function (k) { return contagens[k] > 0; });
    var temC = chaves.indexOf('C') >= 0;
    var ordem = chaves.slice().sort();
    if (temC) {
      ordem = ['C'].concat(chaves.indexOf('H') >= 0 ? ['H'] : [], ordem.filter(function (k) { return k !== 'C' && k !== 'H'; }));
    }
    return ordem.map(function (k) { return k + (contagens[k] > 1 ? contagens[k] : ''); }).join('');
  }

  // ─── Massa a partir de uma fórmula escrita (ex.: C9H8O4, Ca(OH)2) ──────
  function massaPorFormula(formula) {
    if (typeof formula !== 'string') return null;
    var f = formula.trim();
    if (!f || !/^[A-Za-z0-9()]+$/.test(f)) return null;
    var pos = 0;
    function numero() {
      var m = /^\d+/.exec(f.slice(pos));
      if (!m) return 1;
      pos += m[0].length;
      return parseInt(m[0], 10);
    }
    function grupo() {
      var total = 0;
      while (pos < f.length && f[pos] !== ')') {
        if (f[pos] === '(') {
          pos++;
          var interno = grupo();
          if (interno === null || f[pos] !== ')') return null;
          pos++;
          total += interno * numero();
        } else {
          var m = /^[A-Z][a-z]?/.exec(f.slice(pos));
          if (!m) return null;
          var sym = m[0];
          if (PESOS[sym] === undefined) return null;
          pos += sym.length;
          total += PESOS[sym] * numero();
        }
      }
      return total;
    }
    var massa = grupo();
    if (massa === null || pos !== f.length || massa <= 0) return null;
    return arredondar(massa);
  }

  // ─── SMILES → fórmula/massa, sem RDKit ─────────────────────────────────
  var ORGANICOS = { B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1] };
  var AROMATICOS = { b: 'B', c: 'C', n: 'N', o: 'O', p: 'P', s: 'S', se: 'Se', as: 'As' };

  function lerAtomoColchete(corpo) {
    var m = /^(\d+)?(\*|[A-Z][a-z]?|[a-z][a-z]?)(@{1,2}(?:TH|AL|SP|TB|OH)?\d*)?(?:H(\d*))?([+-]+\d*|[+-]\d+)?(?::\d+)?$/.exec(corpo);
    if (!m) return null;
    var simbolo = m[2];
    var aromatico = false;
    if (simbolo === '*') return null;
    if (/^[a-z]/.test(simbolo)) {
      if (!AROMATICOS[simbolo]) return null;
      simbolo = AROMATICOS[simbolo];
      aromatico = true;
    }
    if (PESOS[simbolo] === undefined) return null;
    var carga = 0;
    if (m[5]) {
      var s = m[5];
      var sinal = s[0] === '+' ? 1 : -1;
      var resto = s.slice(1);
      carga = /^\d+$/.test(resto) ? sinal * parseInt(resto, 10) : sinal * s.length;
    }
    var h = 0;
    if (m[4] !== undefined) h = m[4] === '' ? 1 : parseInt(m[4], 10);
    return { sym: simbolo, arom: aromatico, colchete: true, h: h, carga: carga, isotopo: m[1] ? parseInt(m[1], 10) : 0 };
  }

  /**
   * Interpreta um SMILES e devolve {formula, contagens, massa, atomosPesados,
   * totalAtomos} ou null se não conseguir interpretar com segurança.
   */
  function analisarSmiles(smiles) {
    if (typeof smiles !== 'string' || !smiles || smiles === '--') return null;
    var atomos = [];
    var anterior = -1;
    var pilha = [];
    var aneis = {};
    var ordemPendente = 0;

    function ligar(a, b, ordem, aromaticaImplicita) {
      var aA = atomos[a], aB = atomos[b];
      var arom = ordem === 0 && aromaticaImplicita && aA.arom && aB.arom;
      var o = ordem || 1;
      aA.vizinhos++; aB.vizinhos++;
      if (arom) { aA.nArom++; aB.nArom++; }
      if (!arom && o >= 2) { aA.exoDuplo = true; aB.exoDuplo = true; }
      aA.soma += o; aB.soma += o;
    }

    function novoAtomo(a) {
      a.vizinhos = 0; a.soma = 0; a.nArom = 0; a.exoDuplo = false;
      atomos.push(a);
      var idx = atomos.length - 1;
      if (anterior >= 0) ligar(anterior, idx, ordemPendente, true);
      ordemPendente = 0;
      anterior = idx;
    }

    var i = 0;
    while (i < smiles.length) {
      var ch = smiles[i];
      if (ch === '[') {
        var fim = smiles.indexOf(']', i);
        if (fim < 0) return null;
        var at = lerAtomoColchete(smiles.slice(i + 1, fim));
        if (!at) return null;
        novoAtomo(at);
        i = fim + 1;
      } else if (ch === '(') { pilha.push(anterior); i++; }
      else if (ch === ')') { if (!pilha.length) return null; anterior = pilha.pop(); i++; }
      else if (ch === '.') { anterior = -1; ordemPendente = 0; i++; }
      else if (ch === '-' || ch === '/' || ch === '\\' || ch === ':') { ordemPendente = 0; i++; }
      else if (ch === '=') { ordemPendente = 2; i++; }
      else if (ch === '#') { ordemPendente = 3; i++; }
      else if (ch === '$') { ordemPendente = 4; i++; }
      else if (/\d/.test(ch) || ch === '%') {
        var rotulo;
        if (ch === '%') { rotulo = smiles.substr(i + 1, 2); i += 3; } else { rotulo = ch; i++; }
        if (anterior < 0) return null;
        if (aneis[rotulo] !== undefined) {
          var o = aneis[rotulo].ordem || ordemPendente;
          ligar(aneis[rotulo].idx, anterior, o, true);
          delete aneis[rotulo];
        } else {
          aneis[rotulo] = { idx: anterior, ordem: ordemPendente };
        }
        ordemPendente = 0;
      } else {
        var dois = smiles.substr(i, 2);
        var sym, arom = false, tam = 1;
        if (dois === 'Cl' || dois === 'Br') { sym = dois; tam = 2; }
        else if (ORGANICOS[ch]) sym = ch;
        else if (AROMATICOS[ch] && ch.length === 1) { sym = AROMATICOS[ch]; arom = true; }
        else return null;
        if (PESOS[sym] === undefined) return null;
        novoAtomo({ sym: sym, arom: arom, colchete: false, h: 0, carga: 0, isotopo: 0 });
        i += tam;
      }
    }
    if (pilha.length || Object.keys(aneis).length || !atomos.length) return null;

    var contagens = {};
    var massa = 0;
    var pesados = 0;
    var total = 0;
    for (var k = 0; k < atomos.length; k++) {
      var a = atomos[k];
      var h = a.h;
      if (!a.colchete) {
        var b = a.soma;
        if (a.arom && !a.exoDuplo) {
          if (a.sym === 'C') b += 1;
          else if ((a.sym === 'N' || a.sym === 'P') && a.vizinhos === 2) b += 1;
        }
        var permitidas = ORGANICOS[a.sym];
        h = 0;
        for (var v = 0; v < permitidas.length; v++) {
          if (permitidas[v] >= b) { h = permitidas[v] - b; break; }
        }
        h = Math.round(h);
      }
      var simbolo = a.sym === 'H' && a.isotopo === 2 ? 'D' : a.sym === 'H' && a.isotopo === 3 ? 'T' : a.sym;
      contagens[simbolo] = (contagens[simbolo] || 0) + 1;
      massa += massaDoElemento(a.sym, a.isotopo);
      pesados += a.sym === 'H' ? 0 : 1;
      total += 1;
      if (h > 0) {
        contagens.H = (contagens.H || 0) + h;
        massa += PESOS.H * h;
        total += h;
      }
    }
    return {
      formula: formulaHill(contagens), contagens: contagens, massa: arredondar(massa),
      atomosPesados: pesados, totalAtomos: total
    };
  }

  // ─── Valência (LAB-07) ─────────────────────────────────────────────────
  // Valências usuais do elemento NEUTRO. Elementos fora da lista usam a
  // lista que o chamador passar (a tabela periódica do Estúdio).
  var VALENCIAS_USUAIS = {
    H: [1], B: [3], C: [4], N: [3], O: [2], F: [1], Si: [4], P: [3, 5], S: [2, 4, 6],
    Cl: [1], Se: [2, 4, 6], Br: [1], I: [1]
  };
  var PERIODO2 = ['Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'];
  var PERIODO3 = ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'];
  var VAL_P2 = [[1], [2], [3], [4], [3], [2], [1], [0]];
  var VAL_P3 = [[1], [2], [3], [4], [3, 5], [2, 4, 6], [1], [0]];

  /** Valências aceitáveis; a carga desloca para o elemento isoeletrônico (N+ ~ C). */
  function valenciasUsuais(simbolo, carga, alternativa) {
    carga = carga || 0;
    var i2 = PERIODO2.indexOf(simbolo), i3 = PERIODO3.indexOf(simbolo);
    if (carga !== 0 && (i2 >= 0 || i3 >= 0)) {
      var idx = (i2 >= 0 ? i2 : i3) - carga;
      if (idx >= 0 && idx <= 7) return (i2 >= 0 ? VAL_P2 : VAL_P3)[idx];
    }
    if (VALENCIAS_USUAIS[simbolo]) return VALENCIAS_USUAIS[simbolo];
    if (alternativa && alternativa.length) return alternativa;
    return [4];
  }

  /** Soma das ordens de uma lista de tipos de ligação do molfile (4 = aromática = 1,5). */
  function somaOrdens(tipos) {
    var s = 0;
    for (var i = 0; i < tipos.length; i++) {
      var t = tipos[i];
      s += t === 4 ? 1.5 : (t >= 1 && t <= 3 ? t : 1);
    }
    return s;
  }

  /**
   * Avalia a valência de um átomo: soma das ordens, máxima usual, livres.
   * `excedida` só é verdadeira quando a soma passa da maior valência usual.
   * Átomos com ligação aromática não são marcados como excedidos (a ordem
   * 1,5 não decide a valência de heteroátomos aromáticos).
   */
  function avaliarValencia(simbolo, carga, tipos, alternativa) {
    var permitidas = valenciasUsuais(simbolo, carga, alternativa);
    var maxima = Math.max.apply(null, permitidas);
    var soma = somaOrdens(tipos);
    var temArom = tipos.indexOf(4) >= 0;
    if (temArom && soma > maxima) soma = maxima;
    return {
      soma: soma, maxima: maxima, permitidas: permitidas,
      livres: Math.max(0, Math.floor(maxima - soma)),
      excedida: soma > maxima
    };
  }

  /** Lê um molfile V2000 (átomos, ligações, cargas). */
  function parseSDF(texto) {
    if (!texto || typeof texto !== 'string') return null;
    var linhas = texto.split('\n');
    if (linhas.length < 5) return null;
    var nA = parseInt(linhas[3].substring(0, 3).trim(), 10);
    var nB = parseInt(linhas[3].substring(3, 6).trim(), 10);
    if (isNaN(nA) || isNaN(nB)) return null;
    var CARGAS = { 0: 0, 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
    var atoms = [], bonds = [], i;
    for (i = 0; i < nA; i++) {
      var l = linhas[4 + i];
      if (!l || l.length < 34) return null;
      var codigo = parseInt(l.substring(36, 39).trim(), 10);
      atoms.push({
        x: parseFloat(l.substring(0, 10)), y: parseFloat(l.substring(10, 20)),
        z: parseFloat(l.substring(20, 30)), elem: l.substring(31, 34).trim(),
        carga: CARGAS[codigo] || 0
      });
    }
    for (i = 0; i < nB; i++) {
      var lb = linhas[4 + nA + i];
      if (!lb || lb.length < 9) return null;
      bonds.push({
        a1: parseInt(lb.substring(0, 3).trim(), 10), a2: parseInt(lb.substring(3, 6).trim(), 10),
        tipo: parseInt(lb.substring(6, 9).trim(), 10) || 1
      });
    }
    for (i = 4 + nA + nB; i < linhas.length; i++) {
      var lc = linhas[i];
      if (lc.indexOf('M  CHG') === 0) {
        var n = parseInt(lc.substring(6, 9).trim(), 10);
        for (var j = 0; j < n; j++) {
          var ai = parseInt(lc.substring(9 + j * 8, 13 + j * 8).trim(), 10);
          var ch = parseInt(lc.substring(13 + j * 8, 17 + j * 8).trim(), 10);
          if (atoms[ai - 1] && !isNaN(ch)) atoms[ai - 1].carga = ch;
        }
      }
      if (lc.indexOf('M  END') === 0) break;
    }
    return { atoms: atoms, bonds: bonds, numAtoms: nA, numBonds: nB, linhas: linhas };
  }

  /** Diagnóstico de adição de um átomo ao átomo `idx` (0-based) do molfile. */
  function diagnosticoAdicao(parsed, idx, alternativa) {
    var atomo = parsed.atoms[idx];
    if (!atomo) return null;
    var ligacoes = parsed.bonds.filter(function (b) { return b.a1 === idx + 1 || b.a2 === idx + 1; });
    var tipos = ligacoes.map(function (b) { return b.tipo; });
    var temH = ligacoes.some(function (b) {
      var o = parsed.atoms[(b.a1 === idx + 1 ? b.a2 : b.a1) - 1];
      return o && o.elem === 'H';
    });
    var v = avaliarValencia(atomo.elem, atomo.carga, tipos, alternativa);
    var status = v.livres >= 1 ? 'ok' : (temH ? 'remover_h' : 'excedida');
    return {
      soma: v.soma, maxima: v.maxima, livres: v.livres, temH: temH, status: status,
      vizinhos: ligacoes.length
    };
  }

  /** Soma das ordens do átomo `idx` e se o elemento `simbolo` comporta essa soma. */
  function comportaSubstituicao(parsed, idx, simbolo, alternativa) {
    var atomo = parsed.atoms[idx];
    if (!atomo) return null;
    var tipos = parsed.bonds.filter(function (b) { return b.a1 === idx + 1 || b.a2 === idx + 1; })
      .map(function (b) { return b.tipo; });
    var v = avaliarValencia(simbolo, 0, tipos, alternativa);
    return { soma: v.soma, maxima: v.maxima, compativel: !v.excedida && v.maxima > 0 };
  }

  // ─── Bioisosterismo por reação estrutural (LAB-08) ─────────────────────
  var REACOES_BIOISOSTERISMO = [
    {
      id: 'carboxila_tetrazol', nome: 'Bioisóstero de tetrazol', tag: 'Não clássico',
      esquema: 'R-COOH ➔ R-(1H-tetrazol-5-il)',
      descricao: 'Mantém carga negativa deslocalizada e acidez (pKa próximo de 4,5); mais lipofílico.',
      alvoSmarts: '[CX3](=O)[OX2H1]',
      reacao: '[#6:4][CX3](=[O])[OX2H1]>>[#6:4]c1nnn[nH]1'
    },
    {
      id: 'esterificacao_metilica', nome: 'Éster metílico (pró-fármaco)', tag: 'Pró-fármaco',
      esquema: 'R-COOH ➔ R-COOCH₃',
      descricao: 'Mascara a carga aniônica; o grupo é regenerado no plasma por esterases.',
      alvoSmarts: '[CX3](=O)[OX2H1]',
      reacao: '[CX3:1](=[O:2])[OX2H1:3]>>[C:1](=[O:2])[O:3]C'
    },
    {
      id: 'amidacao_primaria', nome: 'Amidação de carboxila', tag: 'Clássico',
      esquema: 'R-COOH ➔ R-CONH₂',
      descricao: 'Neutraliza a acidez e mantém ligações de hidrogênio.',
      alvoSmarts: '[CX3](=O)[OX2H1]',
      reacao: '[CX3:1](=[O:2])[OX2H1]>>[C:1](=[O:2])[NH2]'
    },
    {
      id: 'o_metilacao', nome: 'O-metilação (éter metílico)', tag: 'Bloqueio de fase II',
      esquema: 'R-OH ➔ R-OCH₃',
      descricao: 'Protege hidroxilas de álcool ou fenol contra glicuronidação e sulfatação.',
      alvoSmarts: '[OX2H1;$(O[CX4,c])]',
      reacao: '[OX2H1;$(O[CX4,c]):1]>>[O:1]C'
    },
    {
      id: 'o_acetilacao', nome: 'O-acetilação (éster acetílico)', tag: 'Pró-fármaco',
      esquema: 'R-OH ➔ R-OCOCH₃',
      descricao: 'Esterifica a hidroxila (por exemplo, ácido salicílico ➔ ácido acetilsalicílico); aumenta a lipofilicidade.',
      alvoSmarts: '[OX2H1;$(O[CX4,c])]',
      reacao: '[OX2H1;$(O[CX4,c]):1]>>[O:1]C(=O)C'
    },
    {
      id: 'n_acetilacao', nome: 'N-acetilação de amina primária', tag: 'Otimização',
      esquema: 'R-NH₂ ➔ R-NHCOCH₃',
      descricao: 'Por exemplo, 4-aminofenol ➔ paracetamol; reduz a basicidade da amina livre.',
      alvoSmarts: '[NX3;H2;!$(N[C,S,P]=[O,S,N]);!$(N-N)]',
      reacao: '[NX3;H2;!$(N[C,S,P]=[O,S,N]);!$(N-N):1]>>[N:1]C(=O)C'
    },
    {
      id: 'cloro_fluor_aromatico', nome: 'Troca de cloro por flúor (aromático)', tag: 'Cl ➔ F',
      esquema: 'Ar-Cl ➔ Ar-F',
      descricao: 'O flúor é menor e menos lipofílico que o cloro; a ligação C-F resiste mais à oxidação.',
      alvoSmarts: 'c[Cl]',
      reacao: '[c:1][Cl]>>[c:1]F'
    },
    {
      id: 'metila_trifluormetila', nome: 'Metila ➔ trifluormetila', tag: 'Bloqueio metabólico',
      esquema: 'Ar-CH₃ ➔ Ar-CF₃',
      descricao: 'Troca um sítio de oxidação benzílica por um grupo estável; aumenta a lipofilicidade.',
      alvoSmarts: 'c[CH3]',
      reacao: '[CH3;$(C[c]):1]>>[C:1](F)(F)F'
    },
    {
      id: 'benzeno_piridina', nome: 'Anel aromático ➔ piridina', tag: 'Escalonamento de anel',
      esquema: 'C-H aromático ➔ N aromático',
      descricao: 'Troca um CH do anel por nitrogênio; reduz a lipofilicidade e adiciona um aceptor de hidrogênio.',
      alvoSmarts: '[cH]',
      reacao: '[cH;r6:1]>>[n:1]'
    },
    {
      id: 'fluorizacao_aromatica', nome: 'Fluorização aromática (bloqueio de CYP)', tag: 'H ➔ F',
      esquema: 'Ar-H ➔ Ar-F',
      descricao: 'O flúor imita o hidrogênio no tamanho; o efeito indutivo dificulta a oxidação por CYP450.',
      alvoSmarts: '[cH]',
      reacao: '[cH:1]>>[c:1]F'
    }
  ];

  function extrairPrincipal(smiles) {
    if (!smiles || smiles === '--') return null;
    if (smiles.indexOf('.') < 0) return smiles;
    var partes = smiles.split('.').filter(function (p) { return p.length > 1; });
    if (!partes.length) return null;
    return partes.sort(function (a, b) { return b.length - a.length; })[0];
  }

  function descarte(obj) { try { if (obj && typeof obj.delete === 'function') obj.delete(); } catch (e) { /* já liberado */ } }

  function canonico(rdkit, smiles) {
    var m = rdkit.get_mol(smiles);
    if (!m || (typeof m.is_valid === 'function' && !m.is_valid())) { descarte(m); return null; }
    var s = m.get_smiles();
    descarte(m);
    return s;
  }

  /**
   * Roda a reação sobre o SMILES e devolve os produtos distintos, já
   * sanitizados (o RDKit precisa conseguir ler cada um). Núcleo comum de
   * aplicarBioisosterismo (um único sítio) e aplicarBioisosterismoTodos
   * (vários sítios, para a geração de análogos).
   */
  function produtosDistintos(rdkit, smiles, rx) {
    if (!rdkit || typeof rdkit.get_rxn !== 'function') return { ok: false, motivo: 'Exige o RDKit.' };
    var principal = extrairPrincipal(smiles);
    if (!principal) return { ok: false, motivo: 'Molécula sem SMILES.' };
    var mol = null, reacao = null, lista = null, resultados = null;
    try {
      mol = rdkit.get_mol(principal);
      if (!mol || (typeof mol.is_valid === 'function' && !mol.is_valid())) return { ok: false, motivo: 'SMILES inválido.' };
      var original = mol.get_smiles();
      reacao = rdkit.get_rxn(rx.reacao);
      if (!reacao) return { ok: false, motivo: 'Reação indisponível.' };
      lista = new rdkit.MolList();
      lista.append(mol);
      resultados = reacao.run_reactants(lista, 1000);
      var vistos = {};
      var distintos = [];
      for (var i = 0; i < resultados.size(); i++) {
        var produtos = resultados.get(i);
        var p = produtos.next();
        var smi = null;
        try { smi = p.get_smiles(); } catch (e) { smi = null; }
        descarte(p);
        descarte(produtos);
        if (!smi) continue;
        var limpo = canonico(rdkit, smi);
        if (!limpo || limpo === original || limpo.indexOf('.') >= 0) continue;
        if (!vistos[limpo]) { vistos[limpo] = true; distintos.push(limpo); }
      }
      return { ok: true, original: original, distintos: distintos };
    } catch (e) {
      return { ok: false, motivo: 'Falha ao aplicar a reação.' };
    } finally {
      descarte(resultados); descarte(lista); descarte(reacao); descarte(mol);
    }
  }

  function descreverProduto(smiles) {
    var info = analisarSmiles(smiles);
    return { smiles: smiles, formula: info ? info.formula : null, massa: info ? info.massa : null };
  }

  function acharReacao(id) {
    return REACOES_BIOISOSTERISMO.filter(function (r) { return r.id === id; })[0] || null;
  }

  /**
   * Aplica uma reação de bioisosterismo ao SMILES por substituição estrutural.
   * Seguro por construção: só devolve `ok` se houver exatamente UM produto
   * distinto (sem ambiguidade de sítio), diferente do original e que o RDKit
   * consiga ler (sanitização). Nos demais casos devolve `ok:false` + motivo
   * e a interface desativa a sugestão.
   */
  function aplicarBioisosterismo(rdkit, smiles, id) {
    var rx = acharReacao(id);
    if (!rx) return { ok: false, motivo: 'Transformação desconhecida.' };
    var r = produtosDistintos(rdkit, smiles, rx);
    if (!r.ok) return r;
    if (r.distintos.length === 0) return { ok: false, motivo: 'Grupo não encontrado ou produto inválido.' };
    if (r.distintos.length > 1) {
      return { ok: false, motivo: 'Mais de um sítio possível (' + r.distintos.length + '); sem escolha segura.' };
    }
    var d = descreverProduto(r.distintos[0]);
    return { ok: true, smiles: d.smiles, formula: d.formula, massa: d.massa };
  }

  /**
   * Como aplicarBioisosterismo, mas aceita vários sítios: devolve até `max`
   * produtos distintos (cada um é uma ideia de análogo para estudo, em um
   * sítio diferente). `truncado` avisa que havia mais do que o limite.
   */
  function aplicarBioisosterismoTodos(rdkit, smiles, id, max) {
    var rx = acharReacao(id);
    if (!rx) return { ok: false, motivo: 'Transformação desconhecida.' };
    var r = produtosDistintos(rdkit, smiles, rx);
    if (!r.ok) return r;
    if (r.distintos.length === 0) return { ok: false, motivo: 'Grupo não encontrado ou produto inválido.' };
    var limite = max > 0 ? max : 4;
    return {
      ok: true,
      produtos: r.distintos.slice(0, limite).map(descreverProduto),
      truncado: r.distintos.length > limite,
      total: r.distintos.length
    };
  }

  // ─── Alertas estruturais (LAB-09) ──────────────────────────────────────
  // Triagem por subestruturas reativas ou problemáticas. NÃO são os filtros
  // PAINS de Baell e Holloway (o build RDKit_minimal não traz FilterCatalog).
  var ALERTAS_ESTRUTURAIS = [
    { nome: 'Quinona', smarts: 'O=C1C=CC(=O)C=C1', risco: 'Aceptor de Michael com ciclagem redox; pode gerar espécies reativas de oxigênio.' },
    { nome: 'Catecol', smarts: '[OH]c:c[OH]', risco: 'Oxida a orto-quinona; quela metais.' },
    { nome: 'Hidroquinona', smarts: '[OH]c1ccc([OH])cc1', risco: 'Interferência redox em ensaios colorimétricos.' },
    { nome: 'Rodanina', smarts: 'S1C(=S)NC(=O)C1', risco: 'Eletrófilo promíscuo; reage com cisteínas.' },
    { nome: 'Aceptor de Michael', smarts: '[CX3]=[CX3][CX3]=O', risco: 'Reatividade inespecífica com tióis.' },
    { nome: 'Azo-composto', smarts: 'N=NC', risco: 'A redução metabólica pode liberar aminas carcinogênicas.' },
    { nome: 'Nitroaromático', smarts: '[$([NX3](=O)=O),$([NX3+](=O)[O-])][c]', risco: 'Biorredução a radical nitro aniônico tóxico.' },
    { nome: 'Epóxido', smarts: 'C1OC1', risco: 'Eletrófilo alquilante de DNA e proteínas.' },
    { nome: 'Aziridina', smarts: 'C1CN1', risco: 'Análoga ao epóxido; alquilante de DNA.' },
    { nome: 'Aldeído', smarts: '[CX3H1](=O)[#6]', risco: 'Forma bases de Schiff com lisinas.' },
    { nome: 'Haleto de acila', smarts: '[CX3](=O)[Cl,Br,I]', risco: 'Acilante muito reativo; hidrolisa rapidamente.' },
    { nome: 'Anidrido', smarts: '[CX3](=O)[OX2][CX3](=O)', risco: 'Acilante de nucleófilos.' },
    { nome: 'Isocianato', smarts: '[NX2]=[CX2]=[OX1]', risco: 'Carbamoila aminas primárias.' },
    { nome: 'Tiol livre', smarts: '[SX2H]', risco: 'Oxida a dissulfeto de forma inespecífica.' },
    { nome: 'Furano', smarts: 'c1ccoc1', risco: 'Oxidação a epóxido furânico reativo.' },
    { nome: 'Hidrazina', smarts: '[NX3][NX3]', risco: 'Forma hidrazonas com carbonilas de proteínas.' },
    { nome: 'Peróxido', smarts: '[OX2][OX2]', risco: 'Fonte de radicais; degrada reagentes.' }
  ];

  /** Devolve os alertas cujo SMARTS casa com a molécula (objeto Mol do RDKit). */
  function alertasEstruturais(rdkit, mol) {
    var achados = [];
    for (var i = 0; i < ALERTAS_ESTRUTURAIS.length; i++) {
      var a = ALERTAS_ESTRUTURAIS[i];
      var q = null;
      try {
        q = rdkit.get_qmol(a.smarts);
        if (!q) continue;
        var r = mol.get_substruct_match(q);
        if (r && r !== '{}' && r.indexOf('atoms') >= 0) achados.push(a);
      } catch (e) { /* padrão inválido nesta versão: ignora */ } finally { descarte(q); }
    }
    return achados;
  }

  // ─── Propriedades sem RDKit (LAB-15) ───────────────────────────────────
  /**
   * Sem RDKit só é honesto informar o que se calcula de fato: massa e
   * contagem de átomos (por SMILES ou, se faltar, pela fórmula). logP, TPSA,
   * HBD/HBA e regras (Lipinski, Veber, Ghose) NÃO são estimados: ficam nulos.
   */
  function propriedadesSemRDKit(smiles, massaMolar, formula) {
    var principal = extrairPrincipal(smiles);
    var info = principal ? analisarSmiles(principal) : null;
    var massa = (typeof massaMolar === 'number' && massaMolar > 0) ? massaMolar : null;
    if (massa === null && info) massa = info.massa;
    if (massa === null && formula) massa = massaPorFormula(formula);
    if (massa === null) return null;
    return {
      mw: massa, logp: null, mr: null, tpsa: null, hbd: null, hba: null, rotb: null,
      heavyAtoms: info ? info.atomosPesados : null, totalAtoms: info ? info.totalAtomos : null,
      csp3: null, falhasLipinski: [], falhasVeber: [], falhasGhose: [], alertasEstruturais: [],
      _fallback: true, _semDescritores: true
    };
  }

  return {
    PESOS: PESOS,
    formulaHill: formulaHill,
    massaPorFormula: massaPorFormula,
    analisarSmiles: analisarSmiles,
    VALENCIAS_USUAIS: VALENCIAS_USUAIS,
    valenciasUsuais: valenciasUsuais,
    somaOrdens: somaOrdens,
    avaliarValencia: avaliarValencia,
    parseSDF: parseSDF,
    diagnosticoAdicao: diagnosticoAdicao,
    comportaSubstituicao: comportaSubstituicao,
    REACOES_BIOISOSTERISMO: REACOES_BIOISOSTERISMO,
    extrairPrincipal: extrairPrincipal,
    aplicarBioisosterismo: aplicarBioisosterismo,
    aplicarBioisosterismoTodos: aplicarBioisosterismoTodos,
    ALERTAS_ESTRUTURAIS: ALERTAS_ESTRUTURAIS,
    alertasEstruturais: alertasEstruturais,
    propriedadesSemRDKit: propriedadesSemRDKit
  };
});
