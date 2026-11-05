/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-seed-leitor.js — leitura do seed único (data/lab-seed.js) pelo Laboratório.
 *
 * Funções puras sobre o objeto do seed, mais um ajuste automático no navegador:
 * o LAB_DATABASE segue como fachada (a bancada e o Preceptor continuam lendo
 * LAB_DATABASE.species), e este leitor só troca o SMILES das espécies cuja
 * estrutura foi corrigida e conferida com o PubChem (ver `smiles_fonte` no seed).
 * Substâncias novas do seed não entram na bancada por aqui: ficam disponíveis
 * por LabSeedLeitor.especieLegada() até o motor novo consumi-las.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.LabSeedLeitor = api;
    if (root.LAB_SEED && root.LAB_DATABASE) api.aplicar(root.LAB_DATABASE, root.LAB_SEED);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Substância e alias de um id legado (ex.: "AAS_s"), ou null. */
  function acharAlias(seed, id) {
    var subs = (seed && seed.substancias) || [];
    for (var i = 0; i < subs.length; i++) {
      var aliases = subs[i].aliases || [];
      for (var j = 0; j < aliases.length; j++) {
        if (aliases[j].id === id) return { substancia: subs[i], alias: aliases[j] };
      }
    }
    return null;
  }

  /** Linhas de uma propriedade que valem para a fase do alias (todas, se a propriedade não varia por fase). */
  function linhasDaFase(linhas, fase) {
    if (!linhas || !linhas.length) return [];
    if (linhas.length === 1) return linhas;
    var daFase = linhas.filter(function (l) { return l.fases && fase && l.fases.indexOf(fase) >= 0; });
    return daFase.length ? daFase : [linhas[0]];
  }

  function valor(sub, chave, fase) {
    var l = linhasDaFase(sub.props && sub.props[chave], fase)[0];
    return l ? l.v : null;
  }

  /** Objeto no formato antigo de LAB_DATABASE.species[id], ou null. */
  function especieLegada(seed, id) {
    var achado = acharAlias(seed, id);
    if (!achado) return null;
    var s = achado.substancia;
    var fase = achado.alias.fase;
    return {
      label: achado.alias.label,
      phase: fase,
      molarMass: valor(s, 'massa_molar', fase),
      density: valor(s, 'densidade', fase),
      bp: valor(s, 'bp', fase),
      fp: valor(s, 'fp', fase),
      formula: s.formula,
      smiles: s.smiles,
      iupac: s.iupac,
      pubchemQuery: s.pubchem_query,
      dissociation: achado.alias.dissociation === undefined ? null : achado.alias.dissociation
    };
  }

  /** Proveniência de uma propriedade: [{ valor, unidade, fonte, licenca, data, confianca }]. */
  function proveniencia(seed, id, chave) {
    var achado = acharAlias(seed, id);
    if (!achado) return [];
    var fontes = seed.fontes || {};
    return linhasDaFase(achado.substancia.props && achado.substancia.props[chave], achado.alias.fase).map(function (l) {
      return { valor: l.v, unidade: l.u, fonte: l.s, licenca: fontes[l.s] ? fontes[l.s].licenca : null, data: l.d, confianca: l.c };
    });
  }

  function porInchikey(seed, chave) {
    var subs = (seed && seed.substancias) || [];
    for (var i = 0; i < subs.length; i++) if (subs[i].inchikey === chave) return subs[i];
    return null;
  }

  /** Nível de conteúdo de um id legado: 'completo', 'educacional' ou null se o id não está no seed. */
  function nivelConteudo(seed, id) {
    var achado = acharAlias(seed, id);
    return achado ? achado.substancia.nivel_conteudo : null;
  }

  /**
   * Troca o SMILES das espécies de LAB_DATABASE cuja estrutura foi corrigida no seed.
   * Não cria nem remove espécie, não mexe em nenhum outro campo. Devolve quantas trocou.
   */
  function aplicar(labDatabase, seed) {
    if (!labDatabase || !labDatabase.species || !seed) return 0;
    var trocadas = 0;
    (seed.substancias || []).forEach(function (s) {
      if (!s.smiles_corrigido) return;
      (s.aliases || []).forEach(function (a) {
        var esp = labDatabase.species[a.id];
        if (esp && esp.smiles !== s.smiles) { esp.smiles = s.smiles; trocadas++; }
      });
    });
    return trocadas;
  }

  return { acharAlias: acharAlias, especieLegada: especieLegada, proveniencia: proveniencia, porInchikey: porInchikey, nivelConteudo: nivelConteudo, aplicar: aplicar };
});
