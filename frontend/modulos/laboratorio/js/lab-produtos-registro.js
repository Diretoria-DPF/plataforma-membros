/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — registro da lista "Produtos" do Laboratório (O5). Sem DOM.
 *
 * Ponto de extensão simples para o menu do Laboratório: depois da refatoração do script.js (O3 parte 2), basta
 * ler window.LabProdutos.lista() e abrir cada item pelo arquivo de processo (data/processos/<id>.json) ou pela
 * página produtos/index.html?produto=<id>. Um teste confere que cada item existe e que nenhum processo de
 * farmacotécnica ou de CQ fica fora da lista.
 */
(function (raiz) {
  'use strict';

  var SETORES = {
    farmacotecnica: 'Farmacotécnica',
    saneante: 'Saneantes',
    cosmetico: 'Cosméticos',
    hospitalar: 'Estéreis e hospitalar',
    cq: 'Controle de qualidade'
  };

  var CATALOGO = [
    { id: 'proc_nacl_09_v1', titulo: 'Solução de cloreto de sódio a 0,9 % (p/v)', setor: 'farmacotecnica', forma: 'solucao', nivel: 1 },
    { id: 'proc_xarope_simples_v1', titulo: 'Xarope simples a 85 % (p/v)', setor: 'farmacotecnica', forma: 'xarope', nivel: 2 },
    { id: 'proc_capsulas_vitc_v1', titulo: 'Cápsulas de ácido ascórbico 100 mg', setor: 'farmacotecnica', forma: 'capsula', nivel: 3 },
    { id: 'proc_suspensao_mgoh2_v1', titulo: 'Suspensão oral de hidróxido de magnésio a 8 % (p/v)', setor: 'farmacotecnica', forma: 'suspensao', nivel: 4 },
    { id: 'proc_pomada_zno_v1', titulo: 'Pomada de óxido de zinco a 10 % (p/p)', setor: 'farmacotecnica', forma: 'pomada', nivel: 4 },
    { id: 'proc_alcool_gel_70_v1', titulo: 'Álcool em gel antisséptico a 70 % (p/p)', setor: 'saneante', forma: 'gel_antisseptico', nivel: 4 },
    { id: 'proc_desinfetante_cloro_v1', titulo: 'Desinfetante de superfícies a 0,1 % de cloro ativo', setor: 'saneante', forma: 'desinfetante', nivel: 2 },
    { id: 'proc_home_spray_v1', titulo: 'Home spray (aromatizador de ambiente)', setor: 'saneante', forma: 'aromatizador', nivel: 3 },
    { id: 'proc_sabonete_liquido_v1', titulo: 'Sabonete líquido com ajuste de pH e viscosidade', setor: 'cosmetico', forma: 'sabonete_liquido', nivel: 3 },
    { id: 'proc_sf09_esteril_v1', titulo: 'Soro fisiológico a 0,9 % estéril (esterilização terminal)', setor: 'hospitalar', forma: 'solucao_esteril', nivel: 4 },
    { id: 'proc_vitc_filtrada_v1', titulo: 'Solução de ácido ascórbico a 5 % estéril por filtração', setor: 'hospitalar', forma: 'solucao_esteril', nivel: 5 },
    { id: 'proc_cq_titulacao_hcl_v1', titulo: 'Controle de qualidade: teor de uma solução de HCl 0,1 mol/L por titulação', setor: 'cq', forma: 'reagente_analitico', nivel: 3 }
  ];

  function lista() { return CATALOGO.slice(); }

  function porSetor() {
    var out = {};
    Object.keys(SETORES).forEach(function (s) { out[s] = []; });
    CATALOGO.forEach(function (p) { out[p.setor].push(p); });
    return out;
  }

  function buscar(id) {
    for (var i = 0; i < CATALOGO.length; i++) if (CATALOGO[i].id === id) return CATALOGO[i];
    return null;
  }

  /** Flag local (ligada por padrão): ?flags=-labProdutos desliga. */
  function flagLigada(search) {
    var ligada = true;
    var bruto = '';
    try { bruto = new URLSearchParams(search || '').get('flags') || ''; } catch (e) { bruto = ''; }
    bruto.split(',').forEach(function (parte) {
      var p = parte.trim();
      if (p.replace(/^[-+]/, '') === 'labProdutos') ligada = p.charAt(0) !== '-';
    });
    return ligada;
  }

  var API = { SETORES: SETORES, lista: lista, porSetor: porSetor, buscar: buscar, flagLigada: flagLigada };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabProdutos = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
