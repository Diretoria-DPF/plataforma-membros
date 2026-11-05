/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — dados mínimos de espécies para o motor de processos (O3).
 *
 * Tabela pequena e provisória: só o que os processos de exemplo e os testes usam.
 * Quando o seed único da O2 (data/lab-seed.js) entrar, um adaptador passa a
 * alimentar o motor a partir dele; o formato abaixo é o contrato do motor.
 *
 * Campos: nome, mm (g/mol), fase ('solido' | 'liquido'), densidade (g/mL, líquidos),
 * cp (J/(g·K)), teb e pf (°C), dHvap (J/g), solubilidade { solventeId: [[T °C, g/100 g]] },
 * ph (íons que entram no cálculo de pH do lab-quimica.js), residuo (classe de descarte),
 * perigos (classes GHS simplificadas), termolabil, nivel_conteudo, restricao, fonte, confianca.
 * Valores numéricos sem conferência com fonte primária: confianca 'NV'.
 */
(function (raiz) {
  'use strict';

  const NV = 'NV';
  const FONTE_PENDENTE = 'valor didático a conferir com fonte primária';

  const ESPECIES = {
    H2O_l: {
      nome: 'Água purificada', mm: 18.015, fase: 'liquido', densidade: 0.997, cp: 4.18,
      teb: 100, pf: 0, dHvap: 2257, residuo: 'aquoso_neutro', perigos: [],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    NaCl_s: {
      nome: 'Cloreto de sódio', mm: 58.44, fase: 'solido', cp: 0.86, pf: 801,
      solubilidade: { H2O_l: [[0, 35.7], [25, 36.0], [100, 39.1]] },
      ph: { 'Na+': 1, 'Cl-': 1 }, osmolar: 2, residuo: 'aquoso_neutro', perigos: [],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    Sacarose_s: {
      nome: 'Sacarose', mm: 342.30, fase: 'solido', cp: 1.25, pf: 186,
      solubilidade: { H2O_l: [[0, 179], [20, 204], [100, 487]] },
      residuo: 'aquoso_neutro', perigos: [], termolabil: true,
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    Etanol_l: {
      nome: 'Etanol', mm: 46.07, fase: 'liquido', densidade: 0.789, cp: 2.44,
      teb: 78.4, pf: -114, dHvap: 841, residuo: 'organico_nao_halogenado', perigos: ['inflamavel'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    AcetatoEtila_l: {
      nome: 'Acetato de etila', mm: 88.11, fase: 'liquido', densidade: 0.902, cp: 1.92,
      teb: 77.1, pf: -84, dHvap: 400, imiscivelEmAgua: true,
      residuo: 'organico_nao_halogenado', perigos: ['inflamavel'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    AcidoBenzoico_s: {
      nome: 'Ácido benzoico', mm: 122.12, fase: 'solido', cp: 1.2, pf: 122.4, pKa: 4.2,
      kd: { AcetatoEtila_l: 50 },
      solubilidade: { H2O_l: [[0, 0.17], [25, 0.34], [75, 2.2], [100, 5.6]] },
      residuo: 'organico_nao_halogenado', perigos: ['irritante'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    AcidoSalicilico_s: {
      nome: 'Ácido salicílico', mm: 138.12, fase: 'solido', cp: 1.16, pf: 159,
      solubilidade: { H2O_l: [[0, 0.12], [25, 0.22], [100, 6.7]], Etanol_l: [[25, 37]] },
      residuo: 'organico_nao_halogenado', perigos: ['irritante'], fenolLivre: true,
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    AnidridoAcetico_l: {
      nome: 'Anidrido acético', mm: 102.09, fase: 'liquido', densidade: 1.08, cp: 1.8,
      teb: 139.8, pf: -73, dHvap: 400, residuo: 'organico_nao_halogenado', perigos: ['corrosivo', 'inflamavel'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    AAS_s: {
      nome: 'Ácido acetilsalicílico', mm: 180.16, fase: 'solido', cp: 1.26, pf: 135,
      solubilidade: { H2O_l: [[0, 0.17], [25, 0.33], [100, 1.0]], Etanol_l: [[25, 20]] },
      residuo: 'organico_nao_halogenado', perigos: ['irritante'], termolabil: true,
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    CH3COOH: {
      nome: 'Ácido acético', mm: 60.05, fase: 'liquido', densidade: 1.049, cp: 2.05,
      teb: 118, pf: 16.6, dHvap: 395, ph: { CH3COOH: 1 }, residuo: 'aquoso_acido', perigos: ['corrosivo'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    HCl_aq: {
      nome: 'Cloreto de hidrogênio (em solução)', mm: 36.46, fase: 'solido', cp: 0.8,
      ph: { 'Cl-': 1 }, residuo: 'aquoso_acido', perigos: ['corrosivo'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    NaOH_s: {
      nome: 'Hidróxido de sódio', mm: 40.00, fase: 'solido', cp: 1.49, pf: 318,
      ph: { 'Na+': 1 }, residuo: 'aquoso_basico', perigos: ['corrosivo'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    },
    PbI2_s: {
      nome: 'Iodeto de chumbo(II)', mm: 461.01, fase: 'solido', cp: 0.33, ksp: 9.8e-9,
      residuo: 'metal_pesado', perigos: ['toxico'],
      nivel_conteudo: 'completo', restricao: null, fonte: FONTE_PENDENTE, confianca: NV
    }
  };

  // Rf ilustrativos (tabela de jogo) por eluente; sem fonte, não aparecem como valor real.
  const RF_ILUSTRATIVO = {
    hexano_acetato_7_3: { AcidoSalicilico_s: 0.35, AAS_s: 0.5, AcidoBenzoico_s: 0.45 }
  };

  function congelar(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.values(o).forEach(congelar);
      Object.freeze(o);
    }
    return o;
  }

  const API = congelar({ ESPECIES, RF_ILUSTRATIVO });
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorEspecies = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
