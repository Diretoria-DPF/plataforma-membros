/**
 * smiles-corrigidos.js — SMILES verificados que substituem, no Estúdio, os
 * SMILES errados do catálogo compartilhado (LAB-04, auditoria do Laboratório).
 *
 * Cada entrada foi conferida contra a fórmula e a massa molar do catálogo
 * (frontend/scripts/estudio-quimica.test.mjs, com o RDKit) e contra o SMILES
 * isomérico do PubChem (PUG REST, consulta de 2026-11-04, CID indicado).
 * A chave é a do catálogo (LAB_DATABASE.species) ou o id do ACERVO_RESERVA.
 * Quando o catálogo for corrigido na origem, a entrada pode ser removida.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LaiftSmilesCorrigidos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    'C14H14N2O3_s': { nome: 'Fenobarbital', cid: 4763, smiles: 'CCC1(C(=O)NC(=O)NC1=O)C2=CC=CC=C2' },
    'C17H19NO3_s': { nome: 'Morfina', cid: 5288826, smiles: 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O' },
    'C6H8O6_s': { nome: 'Ácido ascórbico', cid: 54670067, smiles: 'C([C@@H]([C@@H]1C(=C(C(=O)O1)O)O)O)O' },
    'C20H22N2O2_s': { nome: 'Estricnina', cid: 441071, smiles: 'C1CN2CC3=CCO[C@H]4CC(=O)N5[C@H]6[C@H]4[C@H]3C[C@H]2[C@@]61C7=CC=CC=C75' },
    'C11H17N3O8_s': { nome: 'Tetrodotoxina', cid: 11174599, smiles: 'C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O' },
    'C31H42N2O6_s': { nome: 'Batracotoxina', cid: 6324647, smiles: 'CC1=CNC(=C1C(=O)O[C@@H](C)C2=CC[C@@]34[C@@]2(C[C@H]([C@@]56C3=CC[C@H]7[C@@]5(CC[C@](C7)(O6)O)C)O)CN(CCO4)C)C' },
    'Dipirona': { nome: 'Dipirona sódica', cid: 522325, smiles: 'CC1=C(C(=O)N(N1C)C2=CC=CC=C2)N(C)CS(=O)(=O)[O-].[Na+]' }
  };
});
