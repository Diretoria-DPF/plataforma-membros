/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — missões da bancada (extraídas do script.js na O3, sem mudar o comportamento).
 *
 * Cada missão tem `check(leitura)`, puro. `leitura` é montada pelo script.js a partir da bancada:
 *   { ph: () => número, vol, temp, qtd: (id) => mmol, reacoes: Set de ids de síntese catalogados }.
 * O progresso é só um número no aparelho (chave 'laift_lab_missoes_v1'), como antes.
 */
(function (raiz) {
  'use strict';

  const MISSOES = [
    { titulo: 'Missão 1: Neutralização Básica', desc: 'Neutraliza um ácido forte com uma base forte até pH entre 7,0 e 7,5 (volume de pelo menos 20 mL).', check: (l) => l.ph() >= 7.0 && l.ph() <= 7.5 && l.vol >= 20 && (l.qtd('Cl-') + l.qtd('NO3-') + l.qtd('SO4_2-') + l.qtd('ClO4-') > 0) && (l.qtd('Na+') + l.qtd('K+') + l.qtd('Li+') > 0) },
    { titulo: 'Missão 2: Chuva de Ouro', desc: 'Forma um precipitado amarelo intenso de Iodeto de Chumbo (PbI₂).', check: (l) => l.qtd('PbI2_s') > 0.1 },
    { titulo: 'Missão 3: Libertação de Gás H₂', desc: 'Faz um metal sólido reagir com ácido para gerar gás Hidrogénio.', check: (l) => l.qtd('H2_g') > 1 },
    { titulo: 'Missão 4: Ponto de Ebulição', desc: 'Aquece a água no laboratório até que comece a evaporar ativamente (100°C).', check: (l) => l.temp >= 100 && l.qtd('H2O_l') > 0 },
    { titulo: 'Missão 5: Síntese da Aspirina', desc: 'Mistura Ácido Salicílico + Anidrido Acético (1:1 em mol) com H₂SO₄, agitação e 60 a 80°C por 30 minutos simulados.', check: (l) => l.reacoes.has('sintese_aspirina') },
    { titulo: 'Missão 6: Chuva de Prata', desc: 'Mistura Nitrato de Prata (AgNO₃) com Cloreto (Ex: NaCl ou HCl) para formar AgCl.', check: (l) => l.qtd('AgCl_s') > 0.1 },
    { titulo: 'Missão 7: Síntese de Paracetamol', desc: 'Mistura 4-Aminofenol + Anidrido Acético sob aquecimento (80 a 100°C) e agitação, por 45 minutos simulados.', check: (l) => l.reacoes.has('sintese_paracetamol') },
    { titulo: 'Missão 8: Ambiente Super Ácido', desc: 'Cria uma solução altamente corrosiva com pH menor ou igual a 2.0.', check: (l) => l.ph() <= 2.0 && l.vol > 10 },
    { titulo: 'Missão 9: Aroma de Banana (Éster)', desc: 'Mistura Ácido Acético com Álcool Isopentílico catalisado por H₂SO₄ sob calor.', check: (l) => l.reacoes.has('sintese_aroma_banana') },
    { titulo: 'Missão 10: Efervescência de Carbonato', desc: 'Mistura um carbonato (como NaHCO₃ ou CaCO₃) com ácido para liberar CO₂.', check: (l) => l.qtd('CO2_g') > 0.5 }
  ];
  MISSOES.forEach(Object.freeze);
  Object.freeze(MISSOES);

  const CHAVE = 'laift_lab_missoes_v1';

  /** Índice salvo (0..total); 0 se ausente, inválido ou armazenamento indisponível. */
  function lerProgresso(armazenamento) {
    try {
      const n = parseInt(armazenamento.getItem(CHAVE), 10);
      return Number.isInteger(n) && n >= 0 && n <= MISSOES.length ? n : 0;
    } catch (e) { return 0; }
  }

  function salvarProgresso(armazenamento, indice) {
    try { armazenamento.setItem(CHAVE, String(indice)); return true; } catch (e) { return false; }
  }

  /** Leitura a partir do estado da bancada (`sys` com Map em mmol) e de uma função de pH. */
  function leituraDaBancada(sys, ph, reacoes) {
    return { ph, vol: sys.vol, temp: sys.temp, qtd: (id) => sys.especies.get(id) || 0, reacoes: reacoes || new Set() };
  }

  const API = { MISSOES, CHAVE, lerProgresso, salvarProgresso, leituraDaBancada };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMissoes = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
