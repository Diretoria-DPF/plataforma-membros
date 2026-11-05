/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * descoberta-core.js — regras puras da Descoberta de moléculas no Estúdio 3D (O7).
 *
 *   - portão de segurança: quais moléculas podem ter análogos gerados (nível de
 *     conteúdo do seed, lista de nomes espelhada do Worker e classes estruturais);
 *   - geração de análogos por reação estrutural (RDKit, via LaiftChemCore);
 *   - comparação lado a lado com a molécula original (propriedades, regras de
 *     Lipinski e Veber, alertas estruturais);
 *   - perfil por regras (triagem), que NÃO substitui ensaio nem é ADMET medido.
 *
 * Tudo é educacional: análogos são ideias para estudo, sem rota de síntese nem dose.
 * Sem DOM. Carregado por studio/index.html depois de chem-core.js (window.LaiftDescoberta).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LaiftDescoberta = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AVISO_EDUCACIONAL = 'Ideias para estudo: sem rota de síntese e sem dose. As propriedades vêm de regras calculadas, não de ensaio.';

  // ─── Portão de segurança ───────────────────────────────────────────────
  // Espelha as listas de worker/src/ai/safetyBlocklist.js (o teste
  // estudio-descoberta.test.mjs confere que o Worker bloqueia cada termo).
  var TERMOS_AGENTES = [
    'sarin', 'soman', 'tabun', 'ciclosarin', 'cyclosarin', 'novichok', 'agente nervoso', 'nerve agent',
    'gas mostarda', 'mostarda sulfurada', 'sulfur mustard', 'mustard gas', 'iperita', 'yperite', 'lewisita', 'lewisite',
    'cloropicrina', 'chloropicrin', 'difosgenio', 'diphosgene', 'vx', 'ricina', 'ricin', 'abrina', 'abrin'
  ];
  var TERMOS_ILICITOS = [
    'metanfetamina', 'methamphetamine', 'cocaina', 'cocaine', 'crack', 'heroina', 'heroin', 'lsd', 'mdma', 'ecstasy',
    'extase', 'fentanil', 'fentanyl', 'carfentanil', 'carfentanila', 'dmt', 'ghb', 'gbl', 'pcp', 'fenciclidina',
    'mefedrona', 'mephedrone', 'catinona', 'cathinone', 'nitazeno', 'nitazene'
  ];
  // Opioides de alto potencial de abuso (nível "educacional" no seed): reforço por nome.
  var TERMOS_OPIOIDES = [
    'morfina', 'morphine', 'codeina', 'codeine', 'oxicodona', 'oxycodone', 'hidrocodona', 'hydrocodone',
    'hidromorfona', 'hydromorphone', 'metadona', 'methadone', 'petidina', 'meperidine', 'tebaina', 'thebaine',
    'buprenorfina', 'buprenorphine', 'ecgonina', 'ecgonine'
  ];

  // Classes estruturais bloqueadas, para moléculas que não estão no seed (SMILES livre).
  // Complementam a lista de nomes e o seed; não são exaustivas.
  var ESTRUTURAS_BLOQUEADAS = [
    { id: 'organofosforado_guerra', nome: 'organofosforado com ligação P-F ou P-CN', smarts: '[PX4](=[O,S])[F,$(C#N)]' },
    { id: 'mostarda_enxofre', nome: 'mostarda de enxofre', smarts: '[Cl,Br,I][CH2][CH2][SX2]' },
    { id: 'mostarda_nitrogenada', nome: 'mostarda nitrogenada', smarts: '[Cl,Br,I][CH2][CH2][NX3][CH2][CH2][Cl,Br,I]' },
    { id: 'organoarsenico', nome: 'organoarsênico', smarts: '[As]' },
    { id: 'anilidopiperidina', nome: 'anilidopiperidina (classe do fentanil)', smarts: '[CX3](=O)N(c)[CH]1CC[NX3]CC1' },
    { id: 'morfinano', nome: 'morfinano (classe da morfina)', smarts: 'C1~C~C~C2~C3~C~c4ccccc4~C2(~C1)~C~C~N3' },
    { id: 'ergolina', nome: 'ergolina (classe do LSD)', smarts: 'c1cc2c3c(c1)[nX3]cc3C~C1~N(~C)~C~C~C~C~2~1' },
    { id: 'feniletilamina_alfa_metil', nome: 'anfetamina ou catinona', smarts: 'c[CX4,$([CX3]=O)][CH]([CH3])[NX3;!$(N[CX3]=O)]' }
  ];

  function normalizar(texto) {
    return String(texto === undefined || texto === null ? '' : texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Primeiro termo da lista que aparece como palavra inteira no texto, ou null. */
  function termoBloqueado(texto) {
    var norm = ' ' + normalizar(texto) + ' ';
    var todos = TERMOS_AGENTES.concat(TERMOS_ILICITOS, TERMOS_OPIOIDES);
    for (var i = 0; i < todos.length; i++) {
      if (norm.indexOf(' ' + todos[i] + ' ') >= 0) return todos[i];
    }
    return null;
  }

  function principal(smiles) {
    if (!smiles || smiles === '--') return null;
    var partes = String(smiles).split('.').filter(function (p) { return p.length > 1; });
    if (!partes.length) return null;
    return partes.sort(function (a, b) { return b.length - a.length; })[0];
  }

  function descarte(obj) { try { if (obj && typeof obj.delete === 'function') obj.delete(); } catch (e) { /* já liberado */ } }

  function canonicoOuNulo(rdkit, smiles) {
    if (!rdkit || !smiles) return null;
    var m = null;
    try {
      m = rdkit.get_mol(smiles);
      if (!m || (typeof m.is_valid === 'function' && !m.is_valid())) return null;
      return m.get_smiles();
    } catch (e) { return null; } finally { descarte(m); }
  }

  /** Substância do seed que corresponde ao composto (id legado, SMILES ou nome), ou null. */
  function acharNoSeed(seed, composto, rdkit) {
    var subs = (seed && seed.substancias) || [];
    if (!subs.length || !composto) return null;
    var ids = [composto.id, composto.chaveOriginal].filter(Boolean);
    var smiles = principal(composto.smiles);
    var canon = canonicoOuNulo(rdkit, smiles);
    var nomes = [composto.nome, composto.pubchemQuery].filter(Boolean).map(normalizar).filter(Boolean);
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i];
      var aliases = s.aliases || [];
      for (var a = 0; a < aliases.length; a++) if (ids.indexOf(aliases[a].id) >= 0) return s;
      if (smiles && (s.smiles === smiles || s.smiles_canon === smiles || (canon && (s.smiles_canon === canon || s.smiles === canon)))) return s;
      var seus = [s.nome_pt, s.pubchem_query, s.iupac].filter(Boolean).map(normalizar);
      for (var n = 0; n < nomes.length; n++) if (seus.indexOf(nomes[n]) >= 0) return s;
    }
    return null;
  }

  function estruturaBloqueada(rdkit, smiles) {
    var p = principal(smiles);
    if (!rdkit || !p || typeof rdkit.get_qmol !== 'function') return null;
    var mol = null;
    try {
      mol = rdkit.get_mol(p);
      if (!mol || (typeof mol.is_valid === 'function' && !mol.is_valid())) return null;
      for (var i = 0; i < ESTRUTURAS_BLOQUEADAS.length; i++) {
        var q = null;
        try {
          q = rdkit.get_qmol(ESTRUTURAS_BLOQUEADAS[i].smarts);
          if (!q) continue;
          var r = mol.get_substruct_match(q);
          if (r && r !== '{}' && r.indexOf('atoms') >= 0) return ESTRUTURAS_BLOQUEADAS[i];
        } catch (e) { /* padrão inválido nesta versão: ignora */ } finally { descarte(q); }
      }
      return null;
    } catch (e) { return null; } finally { descarte(mol); }
  }

  var MOTIVO_PADRAO = 'Por segurança, a Guia não gera análogos desta substância. A ficha de estudo segue disponível.';

  /**
   * Decide se o composto pode ter análogos gerados.
   * composto: { id, chaveOriginal, nome, smiles, pubchemQuery }; seed: objeto de data/lab-seed.js
   * (opcional: sem ele valem a lista de nomes e as classes estruturais).
   * Devolve { permitido, codigo, motivo }.
   */
  function avaliarPermissao(composto, seed, rdkit) {
    if (!composto) return { permitido: false, codigo: 'sem_composto', motivo: 'Selecione uma molécula.' };
    var achado = acharNoSeed(seed, composto, rdkit);
    if (achado) {
      if (achado.nivel_conteudo !== 'completo') return { permitido: false, codigo: 'educacional', motivo: MOTIVO_PADRAO };
      if (achado.restricao) return { permitido: false, codigo: 'restrita', motivo: MOTIVO_PADRAO };
      if (achado.controlado_br) {
        return { permitido: false, codigo: 'controlada', motivo: 'Substância sob controle especial: a Guia não gera análogos. Estude a ficha e a regulação.' };
      }
    }
    if (termoBloqueado(composto.nome) || termoBloqueado(composto.pubchemQuery) || termoBloqueado(composto.id)) {
      return { permitido: false, codigo: 'nome_bloqueado', motivo: MOTIVO_PADRAO };
    }
    var estrutura = estruturaBloqueada(rdkit, composto.smiles);
    if (estrutura) return { permitido: false, codigo: 'estrutura_bloqueada', motivo: MOTIVO_PADRAO, classe: estrutura.id };
    return { permitido: true, codigo: 'ok', motivo: '' };
  }

  // ─── Geração de análogos ───────────────────────────────────────────────
  /**
   * Gera ideias de análogos por reação estrutural, em todas as transformações
   * do chem-core. Cada produto passa pelo mesmo portão estrutural e é descartado
   * se a classe for bloqueada. Devolve [] se o composto não for permitido.
   * opcoes: { seed, porTransformacao (padrão 3), maximo (padrão 12) }
   */
  function gerarAnalogos(rdkit, core, composto, opcoes) {
    var op = opcoes || {};
    var permissao = avaliarPermissao(composto, op.seed, rdkit);
    if (!permissao.permitido) return { permitido: false, motivo: permissao.motivo, codigo: permissao.codigo, analogos: [] };
    var maximo = op.maximo > 0 ? op.maximo : 12;
    var porTransf = op.porTransformacao > 0 ? op.porTransformacao : 3;
    var vistos = {};
    var lista = [];
    var reacoes = core.REACOES_BIOISOSTERISMO;
    for (var i = 0; i < reacoes.length && lista.length < maximo; i++) {
      var rx = reacoes[i];
      var r = core.aplicarBioisosterismoTodos(rdkit, composto.smiles, rx.id, porTransf);
      if (!r.ok) continue;
      for (var j = 0; j < r.produtos.length && lista.length < maximo; j++) {
        var p = r.produtos[j];
        if (vistos[p.smiles]) continue;
        if (estruturaBloqueada(rdkit, p.smiles)) continue;
        vistos[p.smiles] = true;
        lista.push({
          id: rx.id + '#' + (j + 1),
          transformacaoId: rx.id,
          nome: rx.nome,
          tag: rx.tag,
          esquema: rx.esquema,
          descricao: rx.descricao,
          sitio: r.produtos.length > 1 ? j + 1 : null,
          smiles: p.smiles,
          formula: p.formula,
          massa: p.massa
        });
      }
    }
    return { permitido: true, motivo: '', codigo: 'ok', analogos: lista };
  }

  // ─── Perfil por regras e comparação ────────────────────────────────────
  function numero(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  /** Lipinski e Veber a partir dos números (sem estimar o que falta). */
  function perfilPorRegras(p) {
    var criterios = [
      { regra: 'Lipinski', chave: 'mw', rotulo: 'Massa molar ≤ 500', limite: function (v) { return v <= 500; } },
      { regra: 'Lipinski', chave: 'logp', rotulo: 'logP ≤ 5', limite: function (v) { return v <= 5; } },
      { regra: 'Lipinski', chave: 'hbd', rotulo: 'Doadores de H ≤ 5', limite: function (v) { return v <= 5; } },
      { regra: 'Lipinski', chave: 'hba', rotulo: 'Aceptores de H ≤ 10', limite: function (v) { return v <= 10; } },
      { regra: 'Veber', chave: 'rotb', rotulo: 'Ligações rotáveis ≤ 10', limite: function (v) { return v <= 10; } },
      { regra: 'Veber', chave: 'tpsa', rotulo: 'TPSA ≤ 140 Å²', limite: function (v) { return v <= 140; } }
    ];
    var itens = criterios.map(function (c) {
      var v = numero(p && p[c.chave]);
      return { regra: c.regra, chave: c.chave, rotulo: c.rotulo, valor: v, atende: v === null ? null : c.limite(v) };
    });
    function resumo(regra) {
      var grupo = itens.filter(function (i) { return i.regra === regra; });
      if (grupo.some(function (i) { return i.atende === null; })) return { disponivel: false, violacoes: null, conforme: null };
      var viol = grupo.filter(function (i) { return !i.atende; }).length;
      return { disponivel: true, violacoes: viol, conforme: regra === 'Lipinski' ? viol <= 1 : viol === 0 };
    }
    return { itens: itens, lipinski: resumo('Lipinski'), veber: resumo('Veber') };
  }

  var LINHAS = [
    { chave: 'mw', rotulo: 'Massa molar', unidade: 'g/mol', casas: 1 },
    { chave: 'logp', rotulo: 'logP', unidade: '', casas: 2 },
    { chave: 'tpsa', rotulo: 'TPSA', unidade: 'Å²', casas: 1 },
    { chave: 'hbd', rotulo: 'Doadores de H', unidade: '', casas: 0 },
    { chave: 'hba', rotulo: 'Aceptores de H', unidade: '', casas: 0 },
    { chave: 'rotb', rotulo: 'Ligações rotáveis', unidade: '', casas: 0 }
  ];

  function leitura(chave, delta) {
    if (delta === null) return 'sem dado';
    var d = Math.abs(delta);
    if (chave === 'logp') return d < 0.1 ? 'quase igual' : (delta > 0 ? 'mais lipofílico' : 'mais hidrofílico');
    if (chave === 'tpsa') return d < 1 ? 'quase igual' : (delta > 0 ? 'mais polar' : 'menos polar');
    if (chave === 'mw') return d < 0.5 ? 'quase igual' : (delta > 0 ? 'mais pesado' : 'mais leve');
    if (chave === 'hbd') return d === 0 ? 'igual' : (delta > 0 ? 'mais doadores' : 'menos doadores');
    if (chave === 'hba') return d === 0 ? 'igual' : (delta > 0 ? 'mais aceptores' : 'menos aceptores');
    return d === 0 ? 'igual' : (delta > 0 ? 'mais flexível' : 'mais rígido');
  }

  function nomesDosAlertas(p) {
    return ((p && p.alertasEstruturais) || []).map(function (a) { return a.nome; });
  }

  /**
   * Compara o análogo com a molécula original. Os objetos de propriedades
   * seguem a forma de calcularPropriedadesMoleculares do Estúdio
   * (mw, logp, tpsa, hbd, hba, rotb, alertasEstruturais).
   */
  function compararMoleculas(original, analogo) {
    var linhas = LINHAS.map(function (l) {
      var a = numero(original && original[l.chave]);
      var b = numero(analogo && analogo[l.chave]);
      var delta = a === null || b === null ? null : b - a;
      return {
        chave: l.chave, rotulo: l.rotulo, unidade: l.unidade, casas: l.casas,
        original: a, analogo: b, delta: delta, leitura: leitura(l.chave, delta)
      };
    });
    var perfilA = perfilPorRegras(original);
    var perfilB = perfilPorRegras(analogo);
    var alA = nomesDosAlertas(original);
    var alB = nomesDosAlertas(analogo);
    var alertas = {
      novos: alB.filter(function (n) { return alA.indexOf(n) < 0; }),
      removidos: alA.filter(function (n) { return alB.indexOf(n) < 0; }),
      mantidos: alB.filter(function (n) { return alA.indexOf(n) >= 0; })
    };
    var resumo = [];
    if (perfilA.lipinski.disponivel && perfilB.lipinski.disponivel && perfilA.lipinski.violacoes !== perfilB.lipinski.violacoes) {
      resumo.push('Violações de Lipinski: ' + perfilA.lipinski.violacoes + ' ➔ ' + perfilB.lipinski.violacoes + '.');
    }
    if (alertas.novos.length) resumo.push('Novo alerta estrutural: ' + alertas.novos.join(', ') + '.');
    if (alertas.removidos.length) resumo.push('Alerta estrutural removido: ' + alertas.removidos.join(', ') + '.');
    if (!resumo.length) resumo.push('Sem mudança nas regras de triagem nem nos alertas estruturais.');
    return {
      linhas: linhas,
      lipinski: { original: perfilA.lipinski, analogo: perfilB.lipinski },
      veber: { original: perfilA.veber, analogo: perfilB.veber },
      perfilAnalogo: perfilB,
      alertas: alertas,
      resumo: resumo,
      aviso: AVISO_EDUCACIONAL
    };
  }

  return {
    AVISO_EDUCACIONAL: AVISO_EDUCACIONAL,
    TERMOS_AGENTES: TERMOS_AGENTES,
    TERMOS_ILICITOS: TERMOS_ILICITOS,
    TERMOS_OPIOIDES: TERMOS_OPIOIDES,
    ESTRUTURAS_BLOQUEADAS: ESTRUTURAS_BLOQUEADAS,
    normalizar: normalizar,
    termoBloqueado: termoBloqueado,
    acharNoSeed: acharNoSeed,
    estruturaBloqueada: estruturaBloqueada,
    avaliarPermissao: avaliarPermissao,
    gerarAnalogos: gerarAnalogos,
    perfilPorRegras: perfilPorRegras,
    compararMoleculas: compararMoleculas
  };
});
