/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — operações de farmacotécnica e controle de qualidade do motor (O5): misturar, encapsular,
 * completarMassa e ensaioCQ. Mesmo contrato de lab-motor-op-base.js: aplicar(estado, parametros, ctx) → { estado, eventos }.
 * Ordem de <script> no navegador: estado, fisica, relogio, calculos, lab-quimica, op-base, op-separacao, op-cq,
 * lab-farma-calculos, lab-cq, op-farma, operacoes.
 *
 * O lote de cápsulas fica em estado.lotes[recipiente] (imutável): pesos individuais, conteúdo de ativo de cada
 * unidade e compactação, para que o ensaio de peso médio e a uniformidade leiam o que a pessoa fez de fato.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const B = emNode ? require('./lab-motor-op-base.js') : raiz.LabMotorOpBase;
  const FC = emNode ? require('./lab-farma-calculos.js') : raiz.LabFarmaCalculos;
  const CQ = emNode ? require('./lab-cq.js') : raiz.LabCq;
  const { ev, nome, num, texto, recipiente, garantirRecipiente, especie, sortearUniforme, adicionar, moverFracao, phDoRecipiente, fmt } = B.ajudantes;

  // Volume interno das cápsulas de gelatina dura (mL), valores de referência didáticos.
  const CAPSULAS_ML = Object.freeze({ n00: 0.95, n0: 0.68, n1: 0.50, n2: 0.37, n3: 0.30, n4: 0.21 });
  const TECNICAS_MISTURA = ['simples', 'diluicao_geometrica', 'levigacao', 'agitacao_mecanica'];
  const CV_ENCHIMENTO = { encapsulador: 0.025, manual: 0.05 };
  const CV_SEM_HOMOGENEIDADE = 0.15;
  const DENSIDADE_APARENTE_PADRAO = 0.6;

  function massasPorEspecie(rec, ctx) {
    const m = {};
    for (const f of ['liquido', 'organica', 'solido']) {
      for (const id of Object.keys(rec[f])) m[id] = (m[id] || 0) + E.massaDeMmol(especie(ctx, id), rec[f][id]);
    }
    return m;
  }
  const somar = (o) => Object.keys(o).reduce((a, k) => a + o[k], 0);

  function comLote(estado, id, lote) {
    return E.com(estado, { lotes: { ...(estado.lotes || {}), [id]: lote } });
  }

  // ---------------------------------------------------------------------------
  // misturar
  // ---------------------------------------------------------------------------
  const misturar = {
    id: 'misturar', titulo: 'Misturar pós ou semissólidos', regras: ['mistura_homogeneidade'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const tempoMin = num(p, 'tempoMin', { min: 0.5, max: 120, padrao: 5 });
      const tecnica = texto(p, 'tecnica', { lista: TECNICAS_MISTURA, padrao: 'simples' });
      const rec = recipiente(estado, id);
      const m = massasPorEspecie(rec, ctx);
      const total = somar(m);
      if (!(total > 0)) throw new Error(`não há nada em ${id} para misturar`);
      const menorFracao = Math.min.apply(null, Object.keys(m).map((k) => m[k] / total));
      const geometrica = tecnica === 'diluicao_geometrica' || tecnica === 'levigacao';
      let cv = geometrica ? 0.01 : (tecnica === 'agitacao_mecanica' ? 0.015 : (menorFracao < 0.05 ? 0.12 : 0.03));
      if (tempoMin < 3) cv *= 2;
      const homogeneo = cv <= 0.05;
      const semDiluicao = tecnica === 'simples' && menorFracao < 0.05;
      const s = E.comRecipiente(estado, id, (r) => ({ ...r, homogeneo, cvMistura: cv }));
      const s2 = E.com(s, { t: s.t + tempoMin * 60 });
      const desvio = semDiluicao
        ? { codigo: 'mistura_sem_diluicao_geometrica', gravidade: 'aviso' }
        : (!homogeneo ? { codigo: 'mistura_curta', gravidade: 'aviso' } : undefined);
      const texto1 = `${tecnica.replace('_', ' ').replace('_', ' ')} por ${fmt(tempoMin, 0)} min: ${homogeneo ? 'mistura homogênea' : 'mistura ainda desigual'}${semDiluicao ? '; o componente minoritário (' + fmt(menorFracao * 100, 1) + ' %) pede diluição geométrica' : ''}.`;
      return { estado: s2, eventos: [ev('mistura', 'misturar', texto1, { regra: 'mistura_homogeneidade', recipiente: id, leitura: cv, unidade: 'cv', desvio })] };
    }
  };

  // ---------------------------------------------------------------------------
  // encapsular
  // ---------------------------------------------------------------------------
  const encapsular = {
    id: 'encapsular', titulo: 'Encapsular', regras: ['enchimento_capsula'],
    aplicar(estado, p, ctx) {
      const origem = texto(p, 'origem');
      const destino = texto(p, 'destino', { padrao: 'capsulas' });
      const tamanho = texto(p, 'capsula', { lista: Object.keys(CAPSULAS_ML) });
      const n = Math.round(num(p, 'quantidade', { min: 1, max: 500 }));
      const massaAlvoMg = num(p, 'massaPorCapsulaMg', { min: 10, max: 1000 });
      const tecnica = texto(p, 'tecnica', { lista: Object.keys(CV_ENCHIMENTO), padrao: 'encapsulador' });
      const compactacao = texto(p, 'compactacao', { lista: ['leve', 'moderada', 'forte'], padrao: 'leve' });
      const ativoId = p && p.especieAtiva ? texto(p, 'especieAtiva') : null;
      const doseMg = ativoId ? num(p, 'doseMg', { min: 0.1, max: 2000 }) : null;
      const rec = recipiente(estado, origem);
      const m = massasPorEspecie({ liquido: {}, organica: {}, solido: rec.solido }, ctx);
      const disponivelG = somar(m);
      if (!(disponivelG > 0)) throw new Error(`não há pó em ${origem}`);
      if (ativoId) especie(ctx, ativoId);

      const volumeUtil = CAPSULAS_ML[tamanho];
      let volDeMassa = 0;
      Object.keys(m).forEach((k) => { volDeMassa += m[k] / (especie(ctx, k).densidadeAparente || DENSIDADE_APARENTE_PADRAO); });
      const densMistura = disponivelG / volDeMassa;
      const maxPorVolumeMg = volumeUtil * densMistura * 1000;
      const eventos = [];
      let porCapsulaMg = massaAlvoMg;
      let desvioCapsula;
      if (massaAlvoMg > maxPorVolumeMg + 1e-9) {
        porCapsulaMg = maxPorVolumeMg;
        desvioCapsula = { codigo: 'capsula_pequena', gravidade: 'nao_conforme' };
        eventos.push(ev('enchimento', 'encapsular', `A cápsula ${tamanho} comporta cerca de ${fmt(maxPorVolumeMg, 0)} mg deste pó; ${fmt(massaAlvoMg, 0)} mg não cabem. O enchimento foi limitado e a dose por cápsula fica menor.`, { regra: 'enchimento_capsula', recipiente: destino, desvio: desvioCapsula }));
      } else if (massaAlvoMg < 0.5 * maxPorVolumeMg) {
        eventos.push(ev('enchimento', 'encapsular', `A cápsula ${tamanho} ficará com muito espaço vazio (${fmt(100 * massaAlvoMg / maxPorVolumeMg, 0)} % do volume). Uma cápsula menor dá enchimento mais regular.`, { regra: 'enchimento_capsula', recipiente: destino, desvio: { codigo: 'capsula_grande', gravidade: 'aviso' } }));
      }
      let total = (n * porCapsulaMg) / 1000;
      let unidades = n;
      if (total > disponivelG + 1e-9) {
        unidades = Math.max(1, Math.floor((disponivelG * 1000) / porCapsulaMg));
        total = (unidades * porCapsulaMg) / 1000;
        eventos.push(ev('enchimento', 'encapsular', `O pó só dá para ${unidades} cápsula(s) de ${fmt(porCapsulaMg, 0)} mg; pese uma quantidade maior de pó da próxima vez.`, { regra: 'enchimento_capsula', recipiente: destino, desvio: { codigo: 'po_insuficiente', gravidade: 'aviso' } }));
      }
      const fr = Math.min(1, total / disponivelG);
      let s = garantirRecipiente(estado, destino, { tipo: 'frasco', capMl: 250 });
      s = moverFracao(s, origem, destino, fr, ctx, ['solido']);

      const homogeneo = rec.homogeneo === true;
      const cvMistura = homogeneo && Number.isFinite(rec.cvMistura) ? rec.cvMistura : CV_SEM_HOMOGENEIDADE;
      const xAtivo = ativoId ? (m[ativoId] || 0) / disponivelG : 0;
      const brutos = [];
      const ruidos = [];
      let st = s;
      for (let i = 0; i < unidades; i++) {
        const a = E.sortearNormal(st, 1, CV_ENCHIMENTO[tecnica]);
        const b = E.sortearNormal(a.estado, 0, cvMistura);
        st = b.estado;
        brutos.push(Math.max(0.2, a.valor));
        ruidos.push(b.valor);
      }
      const somaB = somar(brutos);
      const movidoMg = total * 1000;
      const pesos = brutos.map((x) => (x / somaB) * movidoMg);
      const conteudo = ativoId ? pesos.map((w, i) => w * xAtivo * (1 + ruidos[i])) : [];
      st = comLote(st, destino, {
        tipo: 'capsula', capsula: tamanho, compactacao, unidadesMg: pesos, conteudoAtivoMg: conteudo,
        especieAtiva: ativoId, doseMg, homogeneo, massaAlvoMg: porCapsulaMg
      });
      const mediaMg = movidoMg / unidades;
      eventos.unshift(ev('encapsulamento', 'encapsular', `${unidades} cápsulas ${tamanho} cheias com cerca de ${fmt(mediaMg, 0)} mg cada (${compactacao === 'leve' ? 'compactação leve' : 'compactação ' + compactacao}${homogeneo ? '' : '; o pó não estava homogêneo'}).`, {
        regra: 'enchimento_capsula', recipiente: destino, leitura: mediaMg, unidade: 'mg',
        desvio: !homogeneo && ativoId ? { codigo: 'enchimento_com_mistura_desigual', gravidade: 'aviso' } : undefined
      }));
      return { estado: st, eventos };
    }
  };

  // ---------------------------------------------------------------------------
  // completarMassa (q.s.p. em massa)
  // ---------------------------------------------------------------------------
  const completarMassa = {
    id: 'completarMassa', titulo: 'Completar a massa (q.s.p.)', regras: ['qsp_massa', 'ruido_balanca'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const espId = texto(p, 'especie');
      const alvo = num(p, 'massaFinalG', { min: 0.1, max: 5000 });
      const rec = recipiente(estado, id);
      const e = especie(ctx, espId);
      const atual = E.massaRecipiente(rec, ctx.especies);
      if (atual > alvo + 0.005) throw new Error(`a massa (${fmt(atual, 2)} g) já passa de ${fmt(alvo, 2)} g`);
      const u = sortearUniforme(estado, -0.005, 0.005);
      const real = Math.max(0, alvo - atual + u.valor);
      const ad = adicionar(u.estado, id, espId, E.mmolDeMassa(e, real), ctx);
      const depois = E.massaRecipiente(recipiente(ad.estado, id), ctx.especies);
      return {
        estado: ad.estado,
        eventos: [ev('qsp_massa', 'completarMassa', `Massa completada a ${fmt(alvo, 2)} g com ${nome(ctx, espId)} (adicionados ${fmt(real, 2)} g).`, { regra: 'qsp_massa', recipiente: id, leitura: depois, unidade: 'g' })].concat(ad.eventos)
      };
    }
  };

  // ---------------------------------------------------------------------------
  // ensaioCQ
  // ---------------------------------------------------------------------------
  const TESTES = ['peso_medio', 'uniformidade', 'homogeneidade', 'ph', 'densidade', 'viscosidade', 'teor_ativo', 'teor_alcoolico', 'cloro_ativo', 'desintegracao', 'dissolucao', 'limite_microbiano', 'esterilidade'];

  /** Valor de uma variável da composição: pp (% p/p), pv (g/100 mL) ou razao (massa da espécie ÷ massa de `por`). */
  function valorVariavel(rec, v, ctx) {
    const mEsp = E.massaEspecie(rec, v.especie, ctx.especies);
    if (v.base === 'razao') {
      const d = E.massaEspecie(rec, v.por, ctx.especies);
      return d > 0 ? mEsp / d : 0;
    }
    if (v.base === 'pv') {
      const vol = E.volumeLiquidoMl(rec, ctx.especies);
      return vol > 0 ? (100 * mEsp) / vol : 0;
    }
    const tot = E.massaRecipiente(rec, ctx.especies);
    return tot > 0 ? (100 * mEsp) / tot : 0;
  }

  function resultado(teste, id, texto1, extra) {
    const aprovado = extra.aprovado;
    return ev(`cq_${teste}`, 'ensaioCQ', `${texto1} ${aprovado ? 'Dentro do critério.' : 'Fora do critério: resultado não conforme.'}`, Object.assign({
      regra: 'cq_estatistica', recipiente: id,
      desvio: aprovado ? undefined : { codigo: `cq_${teste}_reprovado`, gravidade: 'nao_conforme' }
    }, extra));
  }

  function faixaDe(p, nomeP) {
    const f = p && p[nomeP];
    if (!Array.isArray(f) || f.length !== 2 || !(f[0] <= f[1])) throw new Error(`parâmetro ${nomeP} deve ser [mínimo, máximo]`);
    return f;
  }

  function precisaLote(estado, id) {
    const lote = estado.lotes && estado.lotes[id];
    if (!lote) throw new Error(`não há unidades contadas em ${id}; encapsule antes`);
    return lote;
  }

  const ENSAIOS = {
    peso_medio(estado, p, ctx, id) {
      const lote = precisaLote(estado, id);
      const unid = lote.unidadesMg.slice(0, 20);
      const r = CQ.pesoMedio(unid, lote.tipo);
      const teor = Number.isFinite(p.pesoTeoricoMg) ? p.pesoTeoricoMg : lote.massaAlvoMg;
      const tol = Number.isFinite(p.tolMediaPct) ? p.tolMediaPct : 5;
      const desvioMedia = (100 * (r.mediaMg - teor)) / teor;
      const aprovado = r.aprovado && Math.abs(desvioMedia) <= tol;
      return { estado, eventos: [resultado('peso_medio', id, `Peso médio de ${r.n} cápsulas: ${fmt(r.mediaMg, 1)} mg (teórico ${fmt(teor, 0)} mg; desvio ${fmt(desvioMedia, 1)} %). Limite individual ±${fmt(r.limitePct, 1)} % (${fmt(r.inferiorMg, 0)} a ${fmt(r.superiorMg, 0)} mg); ${r.fora} unidade(s) fora, ${r.foraDobro} fora do dobro do limite.`, { aprovado, leitura: r.mediaMg, unidade: 'mg', detalhe: r })] };
    },
    uniformidade(estado, p, ctx, id) {
      const lote = precisaLote(estado, id);
      if (!lote.especieAtiva) throw new Error('o lote não declara o ativo; informe especieAtiva ao encapsular');
      const n = p.unidades === 30 ? 30 : 10;
      const teores = lote.conteudoAtivoMg.slice(0, n).map((c) => (100 * c) / lote.doseMg);
      if (teores.length < n) throw new Error(`o lote tem só ${teores.length} unidades para o ensaio`);
      const r = CQ.uniformidadeDoses(teores);
      return { estado, eventos: [resultado('uniformidade', id, `Uniformidade de conteúdo (${r.n} unidades): média ${fmt(r.mediaPct, 1)} % do declarado, desvio padrão ${fmt(r.desvioPadraoPct, 2)} %, valor de aceitação ${fmt(r.valorAceitacao, 1)} (limite ${r.L1}).`, { aprovado: r.aprovado, leitura: r.valorAceitacao, unidade: 'VA', detalhe: r })] };
    },
    homogeneidade(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const ok = rec.homogeneo === true;
      return { estado, eventos: [resultado('homogeneidade', id, `Aspecto e homogeneidade: ${ok ? 'aspecto uniforme, sem grumos nem separação de fases' : 'aspecto desigual, com grumos ou separação de fases'}.`, { aprovado: ok, leitura: ok ? 'homogêneo' : 'heterogêneo', regra: 'mistura_homogeneidade' })] };
    },
    ph(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const faixa = faixaDe(p, 'faixa');
      const mod = p.modelo;
      const real = mod && mod.variavel ? FC.interpolar(mod.pontos, valorVariavel(rec, mod.variavel, ctx)) : phDoRecipiente(rec, ctx);
      const u = sortearUniforme(estado, -0.02, 0.02);
      const calibrado = estado.equipamentos.phmetroCalibrado;
      const leitura = Math.round((real + u.valor + (calibrado ? 0 : 0.3)) * 100) / 100;
      const aprovado = leitura >= faixa[0] && leitura <= faixa[1];
      return { estado: u.estado, eventos: [resultado('ph', id, `pH ${fmt(leitura, 2)} (faixa ${fmt(faixa[0], 1)} a ${fmt(faixa[1], 1)}).`, {
        aprovado, leitura, unidade: 'pH', regra: 'cq_curva_didatica',
        desvio: aprovado ? (calibrado ? undefined : { codigo: 'phmetro_sem_calibrar', gravidade: 'aviso' }) : { codigo: 'cq_ph_reprovado', gravidade: 'nao_conforme' }
      })] };
    },
    densidade(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const faixa = faixaDe(p, 'faixa');
      const vol = E.volumeLiquidoMl(rec, ctx.especies);
      if (!(vol > 0)) throw new Error(`não há líquido em ${id} para medir a densidade`);
      const u = sortearUniforme(estado, -0.002, 0.002);
      const leitura = Math.round((E.massaRecipiente(rec, ctx.especies) / vol + u.valor) * 1000) / 1000;
      const aprovado = leitura >= faixa[0] && leitura <= faixa[1];
      return { estado: u.estado, eventos: [resultado('densidade', id, `Densidade ${fmt(leitura, 3)} g/mL (faixa ${fmt(faixa[0], 3)} a ${fmt(faixa[1], 3)}).`, { aprovado, leitura, unidade: 'g/mL' })] };
    },
    viscosidade(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const faixa = faixaDe(p, 'faixa');
      const mod = p.modelo;
      if (!mod || !mod.variavel) throw new Error('viscosidade exige modelo com variavel e pontos');
      let real = FC.interpolar(mod.pontos, valorVariavel(rec, mod.variavel, ctx));
      let ativado = true;
      if (mod.ativacao) {
        ativado = valorVariavel(rec, mod.ativacao.variavel, ctx) >= mod.ativacao.minimo;
        if (!ativado) real *= mod.ativacao.fatorSeNaoAtivado === undefined ? 0.01 : mod.ativacao.fatorSeNaoAtivado;
      }
      const u = sortearUniforme(estado, -0.02, 0.02);
      const leitura = Math.round(real * (1 + u.valor));
      const fator = Number.isFinite(p.fator) && p.fator > 0 ? p.fator : 100;
      const torque = leitura / fator;
      const torqueOk = torque >= 10 && torque <= 100;
      const aprovado = leitura >= faixa[0] && leitura <= faixa[1];
      return { estado: u.estado, eventos: [resultado('viscosidade', id, `Viscosidade ${fmt(leitura, 0)} mPa·s (torque ${fmt(torque, 0)} %${torqueOk ? '' : ', fora de 10 a 100 %: troque o fuso'}); faixa ${fmt(faixa[0], 0)} a ${fmt(faixa[1], 0)}.`, {
        aprovado, leitura, unidade: 'mPa·s', regra: 'cq_curva_didatica',
        desvio: aprovado ? (torqueOk ? undefined : { codigo: 'torque_fora_da_faixa', gravidade: 'aviso' }) : { codigo: 'cq_viscosidade_reprovado', gravidade: 'nao_conforme' }
      })] };
    },
    teor_ativo(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const ativo = texto(p, 'especie');
      const nominal = num(p, 'nominal', { min: 1e-6 });
      const unidade = texto(p, 'unidade', { lista: ['g', 'g/100mL', 'mg/unidade'] });
      const faixa = Array.isArray(p.faixaPct) ? p.faixaPct : [95, 105];
      let real;
      if (unidade === 'g') real = E.massaEspecie(rec, ativo, ctx.especies);
      else if (unidade === 'g/100mL') {
        const vol = E.volumeLiquidoMl(rec, ctx.especies);
        if (!(vol > 0)) throw new Error(`não há líquido em ${id}`);
        real = (100 * E.massaEspecie(rec, ativo, ctx.especies)) / vol;
      } else {
        const lote = precisaLote(estado, id);
        real = CQ.media(lote.conteudoAtivoMg);
      }
      const u = sortearUniforme(estado, -0.005, 0.005);
      const pct = Math.round(10000 * (real / nominal) * (1 + u.valor)) / 100;
      const aprovado = pct >= faixa[0] && pct <= faixa[1];
      return { estado: u.estado, eventos: [resultado('teor_ativo', id, `Teor de ${nome(ctx, ativo)}: ${fmt(pct, 1)} % do declarado (faixa ${fmt(faixa[0], 1)} a ${fmt(faixa[1], 1)} %).`, { aprovado, leitura: pct, unidade: '% do declarado' })] };
    },
    teor_alcoolico(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const faixa = faixaDe(p, 'faixa');
      const m = massasPorEspecie(rec, ctx);
      const tot = somar(m);
      if (!(tot > 0)) throw new Error(`não há produto em ${id}`);
      let alc = 0;
      Object.keys(m).forEach((k) => { alc += (m[k] * (especie(ctx, k).teorEtanolPp || 0)) / 100; });
      const u = sortearUniforme(estado, -0.003, 0.003);
      const leitura = Math.round(1000 * ((100 * alc) / tot) * (1 + u.valor)) / 1000;
      const aprovado = leitura >= faixa[0] && leitura <= faixa[1];
      return { estado: u.estado, eventos: [resultado('teor_alcoolico', id, `Teor alcoólico ${fmt(leitura, 1)} % p/p (faixa ${fmt(faixa[0], 1)} a ${fmt(faixa[1], 1)}).`, { aprovado, leitura, unidade: '% p/p' })] };
    },
    cloro_ativo(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const faixa = faixaDe(p, 'faixa');
      const m = massasPorEspecie(rec, ctx);
      const tot = somar(m);
      if (!(tot > 0)) throw new Error(`não há produto em ${id}`);
      let cl = 0;
      Object.keys(m).forEach((k) => { cl += (m[k] * (especie(ctx, k).cloroAtivoPp || 0)) / 100; });
      const u = sortearUniforme(estado, -0.005, 0.005);
      const pp = ((100 * cl) / tot) * (1 + u.valor);
      const ppm = Math.round(FC.ppmDePp(pp));
      const aprovado = ppm >= faixa[0] && ppm <= faixa[1];
      return { estado: u.estado, eventos: [resultado('cloro_ativo', id, `Cloro ativo ${fmt(ppm, 0)} ppm (faixa ${fmt(faixa[0], 0)} a ${fmt(faixa[1], 0)} ppm).`, { aprovado, leitura: ppm, unidade: 'ppm' })] };
    },
    desintegracao(estado, p, ctx, id) {
      const lote = precisaLote(estado, id);
      const tabela = p.porCompactacao;
      if (!tabela || !Number.isFinite(tabela[lote.compactacao])) throw new Error('desintegração exige porCompactacao com o tempo base de cada compactação');
      const limite = num(p, 'limiteMin', { min: 1 });
      let st = estado;
      const tempos = [];
      for (let i = 0; i < 6; i++) {
        const r = E.sortearNormal(st, 1, 0.1);
        st = r.estado;
        tempos.push(Math.max(0.5, tabela[lote.compactacao] * r.valor));
      }
      const r = CQ.desintegracao(tempos, limite);
      return { estado: st, eventos: [resultado('desintegracao', id, `Desintegração de 6 cápsulas: a última abriu em ${fmt(r.maximoMin, 1)} min (limite ${fmt(limite, 0)} min).`, { aprovado: r.aprovado, leitura: r.maximoMin, unidade: 'min', regra: 'cq_curva_didatica', detalhe: r })] };
    },
    dissolucao(estado, p, ctx, id) {
      const lote = precisaLote(estado, id);
      const tabela = p.porCompactacao;
      if (!tabela || !Number.isFinite(tabela[lote.compactacao])) throw new Error('dissolução exige porCompactacao com o percentual base de cada compactação');
      const Q = num(p, 'QPct', { min: 10, max: 100 });
      let st = estado;
      const valores = [];
      for (let i = 0; i < 24; i++) {
        const r = E.sortearNormal(st, tabela[lote.compactacao], 3);
        st = r.estado;
        valores.push(Math.min(100, Math.max(0, r.valor)));
      }
      const r = CQ.dissolucaoEstagios(valores, Q);
      return { estado: st, eventos: [resultado('dissolucao', id, `Dissolução em ${fmt(num(p, 'tempoMin', { min: 1, padrao: 30 }), 0)} min: média ${fmt(r.mediaPct, 1)} % no estágio ${r.estagio}${r.aprovado ? '' : ' (reprovado)'}; Q = ${fmt(Q, 0)} %.`, { aprovado: r.aprovado, leitura: r.mediaPct, unidade: '%', regra: 'cq_curva_didatica', detalhe: r })] };
    },
    limite_microbiano(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const categoria = texto(p, 'categoria', { lista: Object.keys(CQ.LIMITES_MICROBIANOS) });
      const m = massasPorEspecie(rec, ctx);
      const tot = somar(m) || 1;
      const aquoso = (rec.liquido.H2O_l || 0) > 0;
      let alc = 0;
      let conserv = false;
      Object.keys(m).forEach((k) => {
        const e = especie(ctx, k);
        alc += (m[k] * (e.teorEtanolPp || 0)) / 100;
        if (e.conservante) conserv = true;
      });
      const autoconservado = 100 * alc / tot >= 15 || !!(p.autoconservadoSe && valorVariavel(rec, p.autoconservadoSe.variavel, ctx) >= p.autoconservadoSe.minimo);
      const protegido = !aquoso || conserv || autoconservado;
      const epi = estado.ambiente.epi;
      const boasPraticas = epi.includes('luvas_nitrila') && epi.includes('jaleco');
      const a = sortearUniforme(estado, -0.2, 0.2);
      const b = sortearUniforme(a.estado, -0.2, 0.2);
      const logTamc = (protegido ? 0.8 : 3.6) + a.valor + (boasPraticas ? 0 : 1.6);
      const logTymc = (protegido ? 0.2 : 2.4) + b.valor + (boasPraticas ? 0 : 0.8);
      const tamc = Math.round(Math.pow(10, logTamc));
      const tymc = Math.round(Math.pow(10, logTymc));
      const presentes = boasPraticas || protegido ? [] : (categoria === 'cutaneo' ? ['Staphylococcus aureus'] : ['Escherichia coli']);
      const r = CQ.limiteMicrobiano(categoria, { tamc, tymc, presentes });
      return { estado: b.estado, eventos: [resultado('limite_microbiano', id, `Contagem de aeróbios totais: ${fmt(tamc, 0)} UFC/g ou mL (limite ${fmt(r.limiteTamc, 0)}); bolores e leveduras: ${fmt(tymc, 0)} (limite ${fmt(r.limiteTymc, 0)})${r.proibidosEncontrados.length ? '; encontrado ' + r.proibidosEncontrados.join(', ') : ''}. Ensaio conceitual.`, { aprovado: r.aprovado, leitura: tamc, unidade: 'UFC/g', regra: 'cq_microbiano_conceitual', detalhe: r })] };
    },
    esterilidade(estado, p, ctx, id) {
      const rec = recipiente(estado, id);
      const r = CQ.esterilidade(!rec.esteril);
      return { estado, eventos: [resultado('esterilidade', id, `Teste de esterilidade conceitual: ${r.crescimento ? 'houve crescimento microbiano' : 'sem crescimento'}.`, { aprovado: r.aprovado, leitura: r.crescimento ? 'crescimento' : 'sem crescimento', regra: 'cq_microbiano_conceitual' })] };
    }
  };

  const ensaioCQ = {
    id: 'ensaioCQ', titulo: 'Ensaio de controle de qualidade', regras: ['cq_estatistica', 'cq_curva_didatica', 'cq_microbiano_conceitual'],
    aplicar(estado, p, ctx) {
      const teste = texto(p, 'teste', { lista: TESTES });
      const id = texto(p, 'recipiente');
      recipiente(estado, id);
      return ENSAIOS[teste](estado, p, ctx, id);
    }
  };

  const OPERACOES = { misturar, encapsular, completarMassa, ensaioCQ };
  const API = { OPERACOES, CAPSULAS_ML, TESTES, TECNICAS_MISTURA, valorVariavel };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorOpFarma = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
