/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — nome legível e unidade de uma espécie da bancada (extraídos do script.js na O3, mesmo comportamento).
 * Funções puras: as tabelas (LAB_DATABASE.species e o dicionário da bancada) entram por parâmetro.
 */
(function (raiz) {
  'use strict';

  const NOMES = Object.freeze({
    H2O_l: 'Água', 'H+': 'H⁺', 'OH-': 'OH⁻', H2_g: 'Hidrogênio (H₂)', CO2_g: 'Dióxido de carbono (CO₂)', Cl2_g: 'Cloro (Cl₂)',
    CH3COOH: 'Ácido acético', 'CH3COO-': 'Acetato', NH3: 'Amônia', 'NH4+': 'Amônio', Cu_s: 'Cobre', Pb_s: 'Chumbo', BaSO4_s: 'Sulfato de bário'
  });

  /** Nome legível de uma espécie para o log e as etiquetas (nunca o id interno). */
  function rotulo(id, especies, dicionario) {
    const info = (especies && especies[id]) || (dicionario && dicionario[id]) || null;
    if (info && info.label) return info.label;
    if (NOMES[id]) return NOMES[id];
    return String(id).replace(/_s$|_g$|_l$|_aq$/, '')
      .replace(/_(\d)-$/, (m, n) => ({ 2: '²⁻', 3: '³⁻' }[n] || '⁻'))
      .replace(/(\d)\+$/, (m, n) => ({ 2: '²⁺', 3: '³⁺' }[n] || '⁺'))
      .replace(/\+$/, '⁺').replace(/-$/, '⁻');
  }

  /** 'g' para sólido, 'mL' para líquido ou solução, '' para o resto. */
  function unidadeDe(id, especies) {
    const info = (especies && especies[id]) || null;
    const fase = info && info.phase ? info.phase : String(id).slice(-1);
    return (fase === 's') ? 'g' : (fase === 'l' || fase === 'q' || fase === 'aq') ? 'mL' : '';
  }

  const API = { NOMES, rotulo, unidadeDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabRotulos = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
