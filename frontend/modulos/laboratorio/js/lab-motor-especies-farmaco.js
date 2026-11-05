/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — espécies de farmacotécnica, saneantes e cosméticos para o motor (O5).
 *
 * Complementa lab-motor-especies.js com ativos de uso comum, excipientes, veículos, conservantes e matérias-primas
 * de saneantes e cosméticos. Mesmo contrato da tabela base. Campos novos:
 *   volumeEspecificoMLg  mL por g de soluto dissolvido (soluções concentradas fecham o volume);
 *   densidadeAparente    g/mL do pó solto (enchimento de cápsulas);
 *   teorEtanolPp         % p/p de etanol absoluto na matéria-prima (álcool 96 °GL);
 *   cloroAtivoPp         % p/p de cloro ativo (hipoclorito);
 *   funcao, conservante, espessante.
 * Valores numéricos sem conferência com fonte primária: confianca 'NV'. Todos 'completo' (medicamentos comuns,
 * excipientes, saneantes e cosméticos).
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const Base = emNode ? require('./lab-motor-especies.js') : raiz.LabMotorEspecies;
  const NV = 'NV';
  const FONTE = 'valor didático a conferir com fonte primária';
  const comum = { nivel_conteudo: 'completo', restricao: null, fonte: FONTE, confianca: NV };

  const NOVAS = {
    Lactose_s: {
      nome: 'Lactose', mm: 342.30, fase: 'solido', cp: 1.25, pf: 202, densidadeAparente: 0.6,
      solubilidade: { H2O_l: [[20, 19], [40, 29]] }, residuo: 'aquoso_neutro', perigos: [], funcao: 'diluente', ...comum
    },
    AcidoAscorbico_s: {
      nome: 'Ácido ascórbico', mm: 176.12, fase: 'solido', cp: 1.2, pf: 190, densidadeAparente: 0.7, volumeEspecificoMLg: 0.61, termolabil: true,
      solubilidade: { H2O_l: [[20, 33], [40, 45]] }, residuo: 'aquoso_neutro', perigos: [], funcao: 'ativo', ...comum
    },
    Glicose_s: {
      nome: 'Glicose', mm: 180.16, fase: 'solido', cp: 1.25, pf: 146, volumeEspecificoMLg: 0.62, osmolar: 1,
      solubilidade: { H2O_l: [[0, 53], [25, 91], [50, 244]] }, residuo: 'aquoso_neutro', perigos: [], funcao: 'ativo', ...comum
    },
    HidroxidoMg_s: {
      nome: 'Hidróxido de magnésio', mm: 58.32, fase: 'solido', cp: 1.3, densidadeAparente: 0.35,
      solubilidade: { H2O_l: [[25, 0.0009]] }, residuo: 'aquoso_neutro', perigos: [], funcao: 'ativo', ...comum
    },
    OxidoZinco_s: {
      nome: 'Óxido de zinco', mm: 81.38, fase: 'solido', cp: 0.5, densidadeAparente: 0.5,
      solubilidade: { H2O_l: [[20, 0.0004]] }, residuo: 'metal_pesado', perigos: ['irritante'], funcao: 'ativo', ...comum
    },
    GomaXantana_s: {
      nome: 'Goma xantana', mm: 100, fase: 'solido', cp: 1.4, densidadeAparente: 0.8, residuo: 'aquoso_neutro', perigos: [],
      funcao: 'agente suspensor', espessante: true, ...comum
    },
    Carbomer_s: {
      nome: 'Carbômero', mm: 72.06, fase: 'solido', cp: 1.4, densidadeAparente: 0.2, residuo: 'aquoso_neutro', perigos: [],
      funcao: 'gelificante', espessante: true, ...comum
    },
    MetilParabeno_s: {
      nome: 'Metilparabeno', mm: 152.15, fase: 'solido', cp: 1.3, pf: 127,
      solubilidade: { H2O_l: [[25, 0.25], [80, 2.0]] }, residuo: 'aquoso_neutro', perigos: ['irritante'], conservante: true, funcao: 'conservante', ...comum
    },
    AcidoCitrico_s: {
      nome: 'Ácido cítrico', mm: 192.12, fase: 'solido', cp: 1.1, pf: 153,
      solubilidade: { H2O_l: [[20, 59], [40, 73]] }, residuo: 'aquoso_acido', perigos: ['irritante'], funcao: 'ajuste de pH', ...comum
    },
    Vaselina_s: {
      nome: 'Vaselina sólida', mm: 400, fase: 'solido', cp: 2.2, pf: 45, residuo: 'organico_nao_halogenado', perigos: [], funcao: 'base oleosa', ...comum
    },
    Lanolina_s: {
      nome: 'Lanolina anidra', mm: 600, fase: 'solido', cp: 2.0, pf: 40, residuo: 'organico_nao_halogenado', perigos: [], funcao: 'emoliente', ...comum
    },
    Etanol96_l: {
      nome: 'Álcool etílico 96 °GL', mm: 46.07, fase: 'liquido', densidade: 0.807, cp: 2.4, teb: 78.2, dHvap: 850, teorEtanolPp: 92.8,
      residuo: 'organico_nao_halogenado', perigos: ['inflamavel'], funcao: 'ativo antisséptico', ...comum
    },
    Glicerina_l: {
      nome: 'Glicerina', mm: 92.09, fase: 'liquido', densidade: 1.261, cp: 2.4, teb: 290, dHvap: 660,
      residuo: 'aquoso_neutro', perigos: [], funcao: 'umectante', ...comum
    },
    Trietanolamina_l: {
      nome: 'Trietanolamina', mm: 149.19, fase: 'liquido', densidade: 1.124, cp: 2.6, teb: 335, dHvap: 500,
      residuo: 'organico_nao_halogenado', perigos: ['irritante'], funcao: 'neutralizante', ...comum
    },
    Fenoxietanol_l: {
      nome: 'Fenoxietanol', mm: 138.16, fase: 'liquido', densidade: 1.107, cp: 2.0, teb: 247, dHvap: 500,
      residuo: 'aquoso_neutro', perigos: ['irritante'], conservante: true, funcao: 'conservante', ...comum
    },
    LaurilEterSulfatoNa_l: {
      nome: 'Lauril éter sulfato de sódio (solução a 27 %)', mm: 420, fase: 'liquido', densidade: 1.03, cp: 3.6, teb: 105, dHvap: 2000,
      residuo: 'aquoso_neutro', perigos: ['irritante'], funcao: 'tensoativo', ...comum
    },
    CocoamidopropilBetaina_l: {
      nome: 'Cocoamidopropil betaína (solução a 30 %)', mm: 342, fase: 'liquido', densidade: 1.05, cp: 3.6, teb: 105, dHvap: 2000,
      residuo: 'aquoso_neutro', perigos: ['irritante'], funcao: 'tensoativo anfótero', ...comum
    },
    Polissorbato20_l: {
      nome: 'Polissorbato 20', mm: 1228, fase: 'liquido', densidade: 1.1, cp: 2.2, teb: 300, dHvap: 400,
      residuo: 'aquoso_neutro', perigos: [], funcao: 'solubilizante', ...comum
    },
    Fragrancia_l: {
      nome: 'Fragrância', mm: 150, fase: 'liquido', densidade: 0.95, cp: 2.0, teb: 220, dHvap: 400,
      residuo: 'aquoso_neutro', perigos: ['inflamavel'], funcao: 'fragrância', ...comum
    },
    HCl_01M_l: {
      nome: 'Solução de ácido clorídrico 0,1 mol/L (amostra)', mm: 10000, fase: 'liquido', densidade: 1.0, cp: 4.1, teb: 100, dHvap: 2257,
      ph: { 'Cl-': 1 }, residuo: 'aquoso_acido', perigos: ['corrosivo'], funcao: 'amostra de CQ', ...comum
    },
    AguaSanitaria_l: {
      nome: 'Água sanitária (hipoclorito de sódio, 2,5 % de cloro ativo)', mm: 74.44, fase: 'liquido', densidade: 1.06, cp: 3.9, teb: 102, dHvap: 2100, cloroAtivoPp: 2.5,
      residuo: 'aquoso_basico', perigos: ['corrosivo'], funcao: 'ativo desinfetante', ...comum
    }
  };

  // Ajustes sobre a tabela base: volume dos solutos concentrados.
  const AJUSTES = {
    Sacarose_s: { volumeEspecificoMLg: 0.63, osmolar: 1 },
    NaCl_s: { volumeEspecificoMLg: 0.46 }
  };

  function congelar(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.values(o).forEach(congelar);
      Object.freeze(o);
    }
    return o;
  }

  const ESPECIES = {};
  for (const id of Object.keys(Base.ESPECIES)) ESPECIES[id] = AJUSTES[id] ? { ...Base.ESPECIES[id], ...AJUSTES[id] } : Base.ESPECIES[id];
  for (const id of Object.keys(NOVAS)) ESPECIES[id] = NOVAS[id];
  congelar(ESPECIES);

  const API = congelar({ ESPECIES, NOVAS: Object.keys(NOVAS), RF_ILUSTRATIVO: Base.RF_ILUSTRATIVO });
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorEspeciesFarmaco = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
