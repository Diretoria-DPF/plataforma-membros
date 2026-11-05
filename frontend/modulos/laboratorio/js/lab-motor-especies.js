/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — espécies do motor de processos (O3), montadas a partir do seed único da O2
 * (data/lab-seed.js, carregado antes na página) mais um complemento didático.
 *
 * Do seed (fonte única, com proveniência): nome, massa molar, densidade, pontos de fusão e
 * ebulição, dissociação, nivel_conteudo e restricao. Do complemento: só o que o seed ainda
 * não tem. Espécie fora do seed (ex.: sacarose) fica só no complemento, marcada 'NV'.
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

  // Campos didáticos que o seed ainda não tem (cp, ΔHvap, S(T), pKa, K_D, Ksp, perigos, descarte).
  // Massa molar, densidade, pontos de fusão e ebulição, nome e nível de conteúdo vêm do seed quando existem.
  const COMPLEMENTO = {
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

  const FASES = { l: 'liquido', s: 'solido', aq: 'solido', g: 'gas' };

  function linha(sub, chave, fase) {
    const ls = (sub.props && sub.props[chave]) || [];
    if (!ls.length) return null;
    const daFase = ls.filter((l) => l.fases && l.fases.indexOf(fase) >= 0);
    return (daFase[0] || ls[0]);
  }
  function v(sub, chave, fase) { const l = linha(sub, chave, fase); return l && Number.isFinite(l.v) ? l.v : null; }

  /** Tabela do motor: cada alias do seed vira uma espécie; o complemento preenche o que faltar. */
  function montarEspecies(seed, complemento) {
    const out = {};
    for (const sub of (seed && seed.substancias) || []) {
      for (const a of sub.aliases || []) {
        const fase = FASES[a.fase] || 'solido';
        const c = complemento[a.id] || {};
        const mm = v(sub, 'massa_molar', a.fase);
        if (!(mm > 0) && !(c.mm > 0)) continue;
        const ph = Array.isArray(a.dissociation) ? Object.fromEntries(a.dissociation.map(([ion, n]) => [ion, n])) : null;
        const e = Object.assign({}, c, {
          nome: a.label || sub.nome_pt || c.nome || a.id,
          mm: mm > 0 ? mm : c.mm,
          fase: c.fase || fase,
          nivel_conteudo: sub.nivel_conteudo || 'completo',
          restricao: sub.restricao || null,
          fonte: `seed ${seed.data_version}`,
          confianca: (linha(sub, 'massa_molar', a.fase) || {}).c === undefined ? 'NV' : `seed-c${linha(sub, 'massa_molar', a.fase).c}`
        });
        const dens = v(sub, 'densidade', a.fase);
        if (e.fase === 'liquido') e.densidade = dens > 0 ? dens : c.densidade;
        const teb = v(sub, 'bp', a.fase);
        const pf = v(sub, 'fp', a.fase);
        if (teb !== null) e.teb = teb;
        if (pf !== null) e.pf = pf;
        if (!e.ph && ph) e.ph = ph;
        out[a.id] = e;
      }
    }
    for (const id of Object.keys(complemento)) if (!out[id]) out[id] = Object.assign({ restricao: null, nivel_conteudo: 'completo' }, complemento[id]);
    return out;
  }

  const SEED = (typeof module !== 'undefined' && module.exports) ? require('../data/lab-seed.js') : (raiz && raiz.LAB_SEED);
  const ESPECIES = montarEspecies(SEED, COMPLEMENTO);

  const API = congelar({ ESPECIES, COMPLEMENTO, RF_ILUSTRATIVO, montarEspecies, versaoSeed: SEED ? SEED.data_version : null });
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorEspecies = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
