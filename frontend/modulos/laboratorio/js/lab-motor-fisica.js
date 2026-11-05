/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — física do motor de processos (O3). Funções puras, sem DOM.
 *
 * Cada regra declara o nível de honestidade do modelo:
 *   - 'exata'                : correta dentro do modelo ideal declarado (ex.: gás ideal, Ksp com atividade = concentração);
 *   - 'aproximacao_didatica' : simplificação útil para ensinar, com erro conhecido (ex.: solubilidade interpolada);
 *   - 'regra_de_jogo'        : escolha da simulação, sem pretensão física (ex.: ruído da balança, limiares).
 * Os eventos devolvidos levam o id da regra, para o caderno e a interface mostrarem o porquê.
 */
(function (raiz) {
  'use strict';

  const E = (typeof module !== 'undefined' && module.exports) ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;

  const NIVEIS = Object.freeze(['exata', 'aproximacao_didatica', 'regra_de_jogo']);
  const ROTULOS = Object.freeze({ exata: 'exata', aproximacao_didatica: 'aproximação didática', regra_de_jogo: 'regra de jogo' });

  const REGRAS = E.congelar({
    termica_newton: { nivel: 'aproximacao_didatica', texto: 'Aquecimento por Q = m·c·ΔT, com troca de calor de Newton com o ambiente ou com o banho.' },
    patamar_ebulicao: { nivel: 'aproximacao_didatica', texto: 'Com líquido presente, a temperatura não passa do ponto de ebulição; a energia excedente evapora m = Q/ΔHvap.' },
    refluxo: { nivel: 'regra_de_jogo', texto: 'Com condensador, todo vapor volta ao frasco (perda considerada zero).' },
    sistema_fechado: { nivel: 'regra_de_jogo', texto: 'Frasco fechado aquecido acima da ebulição acumula pressão; a simulação avisa e não deixa perder massa.' },
    solubilidade_interpolada: { nivel: 'aproximacao_didatica', texto: 'Solubilidade S(T) por interpolação linear de pontos tabelados; em mistura de solventes, soma ponderada pela massa.' },
    solubilidade_sem_dado: { nivel: 'regra_de_jogo', texto: 'Sólido sem dado de solubilidade é tratado como totalmente solúvel no líquido.' },
    ksp_ideal: { nivel: 'exata', texto: 'Precipita até o produto iônico igualar o Ksp, com atividade igual à concentração (modelo ideal).' },
    cinetica_fator2: { nivel: 'aproximacao_didatica', texto: 'Velocidade dobra a cada 10 °C (regra prática), não uma equação de Arrhenius com energia medida.' },
    ponto_fusao_impureza: { nivel: 'aproximacao_didatica', texto: 'Impureza abaixa o ponto de fusão e alarga a faixa (tendência qualitativa).' },
    ccd_rf_ilustrativo: { nivel: 'regra_de_jogo', texto: 'Valores de Rf ilustrativos por eluente; uma mancha por espécie acima de 2 % da amostra.' },
    gas_ideal: { nivel: 'exata', texto: 'Pressão pela equação dos gases ideais, PV = nRT.' },
    estequiometria: { nivel: 'exata', texto: 'Reagente limitante e quantidades pela estequiometria da equação balanceada.' },
    ph_eletroneutralidade: { nivel: 'exata', texto: 'pH pela eletroneutralidade com constantes de acidez (modelo ideal, sem coeficiente de atividade).' },
    ruido_balanca: { nivel: 'regra_de_jogo', texto: 'Balança com resolução de 0,01 g e variação de um dígito na leitura.' },
    erro_vidraria: { nivel: 'regra_de_jogo', texto: 'Erro de medida de volume conforme a vidraria: pipeta e balão menores que proveta e béquer.' },
    perda_transferencia: { nivel: 'regra_de_jogo', texto: 'Cada transferência deixa parte do material no frasco; enxaguar reduz a perda.' },
    retencao_filtro: { nivel: 'regra_de_jogo', texto: 'O sólido filtrado retém parte do líquido; a lavagem dissolve produto conforme S(T) do solvente.' },
    rendimento_semeado: { nivel: 'aproximacao_didatica', texto: 'Rendimento da reação sorteado com média e desvio, reprodutível pela semente.' },
    particao_kd: { nivel: 'aproximacao_didatica', texto: 'Partição entre fases pelo coeficiente K_D, corrigido pela ionização do ácido fraco no pH da fase aquosa.' },
    volume_aditivo: { nivel: 'aproximacao_didatica', texto: 'O volume da solução é o dos líquidos; o soluto dissolvido não soma volume.' },
    esterilizacao_parametros: { nivel: 'regra_de_jogo', texto: 'Estéril só se os parâmetros mínimos do método forem cumpridos (autoclave a 121 °C por 15 min ou membrana de 0,22 µm).' },
    rotulagem_campos: { nivel: 'regra_de_jogo', texto: 'Rótulo conforme se tiver os campos mínimos definidos no processo.' },
    descarte_classes: { nivel: 'regra_de_jogo', texto: 'Resíduo conforme se o destino escolhido aceitar todas as classes de resíduo presentes.' },
    mistura_homogeneidade: { nivel: 'regra_de_jogo', texto: 'Mistura de pós e semissólidos: a diluição geométrica (ou levigação) dá homogeneidade; mistura simples com componente abaixo de 5 % da massa deixa variação alta entre unidades.' },
    enchimento_capsula: { nivel: 'aproximacao_didatica', texto: 'Enchimento por volume: massa por cápsula limitada por volume da cápsula × densidade aparente do pó; variação entre unidades sorteada pela semente.' },
    qsp_massa: { nivel: 'regra_de_jogo', texto: 'Completar a massa final (q.s.p.) com o veículo, na resolução da balança.' },
    cq_curva_didatica: { nivel: 'regra_de_jogo', texto: 'pH, viscosidade, desintegração e dissolução do produto vêm de curvas didáticas por composição, sem medida real; os critérios de aceitação seguem o processo.' },
    cq_estatistica: { nivel: 'aproximacao_didatica', texto: 'Critérios de peso médio, uniformidade (valor de aceitação) e dissolução em estágios aplicados como no método geral citado.' },
    cq_microbiano_conceitual: { nivel: 'regra_de_jogo', texto: 'Contagem microbiana conceitual: produto aquoso sem conservante ou envase sem assepsia cresce; com conservante e boas práticas, fica abaixo do limite.' },
    medida_ph_instrumento: { nivel: 'regra_de_jogo', texto: 'pHmetro calibrado lê com ±0,02; sem calibrar, desvio sistemático; fita lê em passos de 0,5.' }
  });

  function regra(id) {
    const r = REGRAS[id];
    if (!r) throw new Error(`regra desconhecida: ${id}`);
    return { id, nivel: r.nivel, rotulo: ROTULOS[r.nivel], texto: r.texto };
  }
  function rotuloNivel(nivel) { return ROTULOS[nivel] || String(nivel); }

  // ---------------------------------------------------------------------------
  // Térmica
  // ---------------------------------------------------------------------------
  const CP_VIDRO = 0.84; // J/(g·K), vidro borossilicato (valor didático)

  function capacidadeTermicaJK(rec, especies) {
    let c = (rec.massaVazio_g || 0) * CP_VIDRO;
    for (const fase of ['liquido', 'organica', 'solido']) {
      for (const id of Object.keys(rec[fase])) {
        const e = E.info(especies, id);
        c += E.massaDeMmol(e, rec[fase][id]) * (e.cp > 0 ? e.cp : 2.0);
      }
    }
    return c;
  }

  /** Líquido de menor ponto de ebulição presente (define o patamar). */
  function liquidoMaisVolatil(rec, especies) {
    let melhor = null;
    for (const fase of ['liquido', 'organica']) {
      for (const id of Object.keys(rec[fase])) {
        const e = E.info(especies, id);
        if (e.fase !== 'liquido' || !Number.isFinite(e.teb) || !(e.dHvap > 0)) continue;
        if (!melhor || e.teb < melhor.e.teb) melhor = { id, e, fase };
      }
    }
    return melhor;
  }

  /**
   * passoTermico(rec, { dtS, potenciaW, alvoC, banhoC, kBanhoWK, tempAmbienteC, kAmbienteWK }, especies)
   * → { rec, evaporado: { id: mmol }, eventos, regra }
   * Resolve dT/dt = (P + kB·(Tb − T) − kA·(T − Ta)) / C exatamente no passo (estável para qualquer dt).
   */
  function passoTermico(rec, opcoes, especies) {
    const o = opcoes || {};
    const dt = o.dtS > 0 ? o.dtS : 0;
    const termostato = Number.isFinite(o.alvoC);
    const P = o.potenciaW > 0 && !(termostato && rec.tempC >= o.alvoC) ? o.potenciaW : 0;
    const kB = Number.isFinite(o.banhoC) ? (o.kBanhoWK > 0 ? o.kBanhoWK : 5) : 0;
    const Tb = Number.isFinite(o.banhoC) ? o.banhoC : 0;
    const kA = o.kAmbienteWK === undefined ? 0.3 : Math.max(0, o.kAmbienteWK);
    const Ta = Number.isFinite(o.tempAmbienteC) ? o.tempAmbienteC : 25;
    const C = capacidadeTermicaJK(rec, especies);
    const eventos = [];
    if (!(dt > 0) || !(C > 0)) return { rec, evaporado: {}, eventos, regra: 'termica_newton' };

    const T0 = rec.tempC;
    const K = kB + kA;
    let T;
    if (K > 0) {
      const Tinf = (P + kB * Tb + kA * Ta) / K;
      T = Tinf + (T0 - Tinf) * Math.exp(-K * dt / C);
    } else {
      T = T0 + (P * dt) / C;
    }
    if (P > 0 && termostato && T > o.alvoC) T = o.alvoC;

    let novo = { ...rec, tempC: T };
    const evaporado = {};
    const volatil = liquidoMaisVolatil(rec, especies);
    if (volatil && T > volatil.e.teb) {
      const excessoJ = (T - volatil.e.teb) * C;
      novo.tempC = volatil.e.teb;
      const disponivel = rec[volatil.fase][volatil.id];
      const mmolEvap = Math.min(disponivel, E.mmolDeMassa(volatil.e, excessoJ / volatil.e.dHvap));
      if (rec.condensador) {
        eventos.push({ tipo: 'refluxo', especie: volatil.id, regra: 'refluxo', tempC: volatil.e.teb });
      } else if (rec.aberto === false) {
        eventos.push({ tipo: 'pressao_sobe', especie: volatil.id, regra: 'sistema_fechado', tempC: volatil.e.teb });
      } else {
        novo = { ...novo, [volatil.fase]: E.somarEspecie(rec[volatil.fase], volatil.id, -mmolEvap) };
        evaporado[volatil.id] = mmolEvap;
        eventos.push({ tipo: 'ebulicao', especie: volatil.id, regra: 'patamar_ebulicao', tempC: volatil.e.teb, mmol: mmolEvap });
      }
    }
    return { rec: E.congelar(novo), evaporado, eventos, regra: 'termica_newton' };
  }

  // ---------------------------------------------------------------------------
  // Solubilidade, cristalização e Ksp
  // ---------------------------------------------------------------------------
  function solubilidadeG100(especie, solventeId, tempC) {
    const pts = especie && especie.solubilidade && especie.solubilidade[solventeId];
    if (!pts || !pts.length) return null;
    if (tempC <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [t1, s1] = pts[i];
      if (tempC <= t1) {
        const [t0, s0] = pts[i - 1];
        return s0 + (s1 - s0) * (tempC - t0) / (t1 - t0);
      }
    }
    return pts[pts.length - 1][1];
  }

  /** Massa máxima (g) da espécie que a fase líquida dissolve à temperatura do recipiente. */
  function capacidadeG(rec, idSoluto, especies) {
    const e = E.info(especies, idSoluto);
    if (!e.solubilidade) return null;
    let cap = 0;
    let algum = false;
    for (const solv of Object.keys(rec.liquido)) {
      const s = solubilidadeG100(e, solv, rec.tempC);
      if (s === null) continue;
      algum = true;
      cap += s * E.massaDeMmol(E.info(especies, solv), rec.liquido[solv]) / 100;
    }
    return algum ? cap : null;
  }

  /**
   * Move soluto entre a fase líquida e a sólida conforme S(T).
   * Excesso cristaliza todo; falta dissolve `fracaoDissolucao` do que cabe (agitação, tempo).
   */
  function equilibrarSolubilidade(rec, especies, opcoes) {
    const fr = opcoes && Number.isFinite(opcoes.fracaoDissolucao) ? Math.max(0, Math.min(1, opcoes.fracaoDissolucao)) : 1;
    let liquido = rec.liquido;
    let solido = rec.solido;
    const eventos = [];
    const ids = new Set([...Object.keys(rec.liquido), ...Object.keys(rec.solido)]);
    for (const id of ids) {
      const e = E.info(especies, id);
      if (e.fase !== 'solido') continue;
      const cap = capacidadeG({ ...rec, liquido }, id, especies);
      if (cap === null) continue;
      const dissG = E.massaDeMmol(e, liquido[id] || 0);
      const solG = E.massaDeMmol(e, solido[id] || 0);
      const alvo = Math.min(dissG + solG, cap);
      if (alvo < dissG - 1e-12) {
        const d = E.mmolDeMassa(e, dissG - alvo);
        liquido = E.somarEspecie(liquido, id, -d);
        solido = E.somarEspecie(solido, id, d);
        eventos.push({ tipo: 'cristalizacao', especie: id, g: dissG - alvo, regra: 'solubilidade_interpolada' });
      } else if (alvo > dissG + 1e-12 && fr > 0) {
        const g = (alvo - dissG) * fr;
        const d = Math.min(solido[id] || 0, E.mmolDeMassa(e, g));
        liquido = E.somarEspecie(liquido, id, d);
        solido = E.somarEspecie(solido, id, -d);
        eventos.push({ tipo: 'dissolucao', especie: id, g, regra: 'solubilidade_interpolada' });
      }
      if ((solido[id] || 0) > 0 && cap > 0 && E.massaDeMmol(e, liquido[id] || 0) >= cap - 1e-9) {
        eventos.push({ tipo: 'saturada', especie: id, capacidadeG: cap, regra: 'solubilidade_interpolada' });
      }
    }
    return { rec: E.congelar({ ...rec, liquido, solido }), eventos };
  }

  /** mmol de sal M_aX_b que precipitam para o produto iônico voltar ao Ksp (bisseção). */
  function precipitarKsp(p) {
    const { cationMmol: M, anionMmol: X, a, b, ksp, volMl: V } = p;
    if (!(V > 0) || !(M > 0) || !(X > 0)) return 0;
    const q = (x) => Math.pow((M - a * x) / V, a) * Math.pow((X - b * x) / V, b);
    if (q(0) <= ksp) return 0;
    let lo = 0;
    let hi = Math.min(M / a, X / b);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (q(mid) > ksp) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ---------------------------------------------------------------------------
  // Cinética, fusão, CCD, gás, partição
  // ---------------------------------------------------------------------------
  function fatorCinetico(tempC, tempRefC) { return Math.pow(2, (tempC - tempRefC) / 10); }

  const K_DEPRESSAO = 100; // °C por unidade de fração de impureza (regra didática)
  function pontoFusaoObservado(pfLitC, fracaoImpureza) {
    const x = Math.max(0, Math.min(1, fracaoImpureza || 0));
    const fim = pfLitC - K_DEPRESSAO * x;
    return { inicioC: fim - (1 + 50 * x), fimC: fim, regra: 'ponto_fusao_impureza' };
  }

  const LIMIAR_MANCHA = 0.02;
  function manchasCCD(fracoes, tabelaRf) {
    return Object.keys(fracoes)
      .filter((id) => fracoes[id] > LIMIAR_MANCHA)
      .map((id) => ({ especie: id, rf: tabelaRf && Number.isFinite(tabelaRf[id]) ? tabelaRf[id] : null, regra: 'ccd_rf_ilustrativo' }))
      .sort((m, n) => (n.rf || 0) - (m.rf || 0));
  }

  const R_L_ATM = 0.082057;
  function pressaoGasIdealAtm(nMol, tempC, volL) { return (nMol * R_L_ATM * (tempC + 273.15)) / volL; }

  /** Fração do soluto que vai à fase orgânica. Ácido fraco: D = K_D / (1 + 10^(pH − pKa)). */
  function fracaoOrganica(p) {
    const D = Number.isFinite(p.pKa) && Number.isFinite(p.pH) ? p.kd / (1 + Math.pow(10, p.pH - p.pKa)) : p.kd;
    return (D * p.volOrgMl) / (D * p.volOrgMl + p.volAqMl);
  }

  const API = {
    NIVEIS, REGRAS, regra, rotuloNivel, CP_VIDRO,
    capacidadeTermicaJK, liquidoMaisVolatil, passoTermico,
    solubilidadeG100, capacidadeG, equilibrarSolubilidade, precipitarKsp,
    fatorCinetico, pontoFusaoObservado, manchasCCD, pressaoGasIdealAtm, fracaoOrganica
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorFisica = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
