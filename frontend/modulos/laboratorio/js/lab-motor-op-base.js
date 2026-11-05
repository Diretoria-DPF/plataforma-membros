/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — operações unitárias básicas do motor (O3): paramentar, tarar, pesar, medirVolume,
 * transferir, dissolver, agitar, aquecer, refluxo, resfriar, avolumar e reagir.
 *
 * Contrato de toda operação: aplicar(estado, parametros, ctx) → { estado, eventos }.
 * Pura: não altera o estado recebido; usa o gerador semeado do estado para qualquer variação.
 * ctx = { especies } (tabela de espécies). Parâmetro inválido lança Error com mensagem em pt-BR.
 * Evento: { tipo, operacao, texto, regra?, leitura?, unidade?, especie?, recipiente?, desvio? }.
 * desvio = { codigo, gravidade: 'aviso' | 'nao_conforme' | 'incidente' }.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const F = emNode ? require('./lab-motor-fisica.js') : raiz.LabMotorFisica;
  const R = emNode ? require('./lab-motor-relogio.js') : raiz.LabMotorRelogio;
  const LQ = emNode ? require('./lab-quimica.js') : raiz.LabQuimica;
  const C = emNode ? require('./lab-motor-calculos.js') : raiz.LabMotorCalculos;

  const DT_S = 5;
  const fmt = C.formatarNumero;

  // ---------------------------------------------------------------------------
  // Ajudantes compartilhados (também usados pelos outros arquivos de operações)
  // ---------------------------------------------------------------------------
  function ev(tipo, operacao, texto, extra) { return Object.assign({ tipo, operacao, texto }, extra || {}); }

  function num(p, nome, opcoes) {
    const o = opcoes || {};
    let v = p ? p[nome] : undefined;
    if (v === undefined && o.padrao !== undefined) v = o.padrao;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`parâmetro ${nome} deve ser número`);
    if (o.min !== undefined && v < o.min) throw new Error(`parâmetro ${nome} abaixo do mínimo (${o.min})`);
    if (o.max !== undefined && v > o.max) throw new Error(`parâmetro ${nome} acima do máximo (${o.max})`);
    return v;
  }
  function texto(p, nome, opcoes) {
    const o = opcoes || {};
    const v = p && p[nome] !== undefined ? p[nome] : o.padrao;
    if (typeof v !== 'string' || !v) throw new Error(`parâmetro ${nome} obrigatório`);
    if (o.lista && !o.lista.includes(v)) throw new Error(`parâmetro ${nome} inválido: ${v}`);
    return v;
  }
  function recipiente(estado, id) {
    const r = estado.recipientes[id];
    if (!r) throw new Error(`recipiente inexistente: ${id}`);
    return r;
  }
  function garantirRecipiente(estado, id, def) {
    return estado.recipientes[id] ? estado : E.comNovoRecipiente(estado, Object.assign({ id }, def));
  }
  function especie(ctx, id) { return E.info(ctx.especies, id); }

  function sortearUniforme(estado, a, b) {
    const r = E.sortear(estado);
    return { valor: a + (b - a) * r.valor, estado: r.estado };
  }

  /** Derrama o que passar da capacidade (fração igual de todas as fases) e conta como perda. */
  function transbordo(estado, recId, ctx) {
    const rec = recipiente(estado, recId);
    const vol = E.volumeLiquidoMl(rec, ctx.especies);
    if (vol <= rec.capMl + 1e-9) return { estado, eventos: [] };
    const fica = rec.capMl / vol;
    const antes = E.massaRecipiente(rec, ctx.especies);
    let s = E.comRecipiente(estado, recId, (r) => ({
      ...r, liquido: E.escalarConteudo(r.liquido, fica), organica: E.escalarConteudo(r.organica, fica), solido: E.escalarConteudo(r.solido, fica)
    }));
    const perdido = antes - E.massaRecipiente(s.recipientes[recId], ctx.especies);
    s = E.comBalanco(s, { perdas_g: perdido });
    return { estado: s, eventos: [ev('transbordou', 'transbordo', `O ${recId} transbordou: ${fmt(perdido, 2)} g perdidos (capacidade ${fmt(rec.capMl, 0)} mL).`, { recipiente: recId, desvio: { codigo: 'transbordou', gravidade: 'nao_conforme' } })] };
  }

  /** Adiciona `mmol` da espécie ao recipiente (líquido na fase líquida, sólido na sólida) e conta a entrada. */
  function adicionar(estado, recId, espId, mmol, ctx) {
    const e = especie(ctx, espId);
    const fase = e.fase === 'liquido' ? 'liquido' : 'solido';
    let s = E.comRecipiente(estado, recId, (r) => ({ ...r, [fase]: E.somarEspecie(r[fase], espId, mmol), homogeneo: false }));
    s = E.comBalanco(s, { entradas_g: E.massaDeMmol(e, mmol) });
    return transbordo(s, recId, ctx);
  }

  /** Move a fração `fr` das fases de origem para destino; a temperatura do destino é a média ponderada pela capacidade térmica. */
  function moverFracao(estado, origemId, destinoId, fr, ctx, fases) {
    const lista = fases || ['liquido', 'organica', 'solido'];
    const o = recipiente(estado, origemId);
    const d = recipiente(estado, destinoId);
    const movido = {};
    let origem = { ...o };
    let destino = { ...d };
    for (const f of lista) {
      movido[f] = E.escalarConteudo(o[f], fr);
      origem[f] = E.escalarConteudo(o[f], 1 - fr);
      destino[f] = E.somarConteudos(d[f], movido[f]);
    }
    const cMov = F.capacidadeTermicaJK({ massaVazio_g: 0, liquido: movido.liquido || {}, organica: movido.organica || {}, solido: movido.solido || {} }, ctx.especies);
    const cDest = F.capacidadeTermicaJK(d, ctx.especies);
    if (cMov + cDest > 0) destino.tempC = (cMov * o.tempC + cDest * d.tempC) / (cMov + cDest);
    destino.homogeneo = false;
    let s = E.comRecipiente(estado, origemId, () => origem);
    s = E.comRecipiente(s, destinoId, () => destino);
    return s;
  }

  /** pH da fase líquida pelo núcleo lab-quimica.js (íons declarados em especie.ph). */
  function phDoRecipiente(rec, ctx) {
    const mapa = new Map();
    for (const id of Object.keys(rec.liquido)) {
      const e = especie(ctx, id);
      if (!e.ph) continue;
      for (const ion of Object.keys(e.ph)) mapa.set(ion, (mapa.get(ion) || 0) + rec.liquido[id] * e.ph[ion]);
    }
    const vol = E.volumeFaseMl(rec.liquido, ctx.especies);
    return LQ.calcularPH(mapa, vol);
  }

  /**
   * Avança `segundos` com a térmica de `opTermica` em passos fixos; acumula vapor (perdido ou no destino),
   * tempo na faixa e extremos de temperatura. Devolve { estado, resumo, eventos (sem repetição) }.
   */
  function aplicarTermico(estado, recId, opTermica, segundos, ctx, extra) {
    const x = extra || {};
    const faixa = x.faixaC;
    const resumo = { tMinC: recipiente(estado, recId).tempC, tMaxC: recipiente(estado, recId).tempC, tempoNaFaixaS: 0, evaporadoG: 0, condensadoG: 0 };
    const vistos = new Set();
    const eventos = [];
    const passo = (s, dt) => {
      const rec = recipiente(s, recId);
      const r = F.passoTermico(rec, Object.assign({ dtS: dt, tempAmbienteC: s.ambiente.tempC }, opTermica), ctx.especies);
      let novo = E.comRecipiente(s, recId, () => r.rec);
      for (const id of Object.keys(r.evaporado)) {
        const g = E.massaDeMmol(especie(ctx, id), r.evaporado[id]);
        if (x.destinoVapor) {
          novo = E.comRecipiente(novo, x.destinoVapor, (d) => ({ ...d, liquido: E.somarEspecie(d.liquido, id, r.evaporado[id]) }));
          resumo.condensadoG += g;
        } else {
          novo = E.comBalanco(novo, { evaporado_g: g });
          resumo.evaporadoG += g;
        }
      }
      const eq = F.equilibrarSolubilidade(recipiente(novo, recId), ctx.especies, { fracaoDissolucao: x.agitacao ? 1 : 0.1 });
      novo = E.comRecipiente(novo, recId, () => eq.rec);
      for (const e of r.eventos.concat(eq.eventos)) {
        const chave = `${e.tipo}:${e.especie || ''}`;
        if (!vistos.has(chave)) { vistos.add(chave); eventos.push(e); }
      }
      const T = eq.rec.tempC;
      resumo.tMinC = Math.min(resumo.tMinC, T);
      resumo.tMaxC = Math.max(resumo.tMaxC, T);
      if (faixa && T >= faixa[0] && T <= faixa[1]) resumo.tempoNaFaixaS += dt;
      return E.com(novo, { t: novo.t + dt });
    };
    const fim = R.avancar(estado, segundos, DT_S, passo);
    return { estado: fim, resumo, eventos };
  }

  function eventosFisicos(op, lista) {
    const textos = {
      ebulicao: (e) => `Ebulição de ${e.especie} a ${fmt(e.tempC, 1)} °C: a temperatura para no patamar e o líquido evapora.`,
      refluxo: (e) => `Refluxo: o vapor de ${e.especie} condensa e volta ao frasco a ${fmt(e.tempC, 1)} °C.`,
      pressao_sobe: (e) => `Frasco fechado acima da ebulição de ${e.especie}: a pressão sobe. Abra ou use condensador.`,
      cristalizacao: (e) => `Cristalizaram ${fmt(e.g, 3)} g de ${e.especie}: a solubilidade caiu com a temperatura.`,
      dissolucao: (e) => `Dissolveram ${fmt(e.g, 3)} g de ${e.especie}.`,
      saturada: (e) => `Solução saturada de ${e.especie}: cabem ${fmt(e.capacidadeG, 2)} g nesta temperatura; o resto fica sólido.`
    };
    return lista.map((e) => {
      const extra = { regra: e.regra, especie: e.especie };
      if (e.tipo === 'pressao_sobe') extra.desvio = { codigo: 'pressao_sobe', gravidade: 'aviso' };
      return ev(e.tipo, op, (textos[e.tipo] || (() => e.tipo))(e), extra);
    });
  }

  // ---------------------------------------------------------------------------
  // Operações
  // ---------------------------------------------------------------------------
  const EPI_VALIDOS = ['jaleco', 'luvas_nitrila', 'oculos', 'mascara', 'touca', 'protetor_facial'];

  const paramentar = {
    id: 'paramentar', titulo: 'Paramentar e preparar a capela', regras: [],
    aplicar(estado, p) {
      const epi = Array.isArray(p && p.epi) ? p.epi : [];
      for (const item of epi) if (!EPI_VALIDOS.includes(item)) throw new Error(`EPI desconhecido: ${item}`);
      const capela = !!(p && p.capela);
      const s = E.com(estado, { ambiente: { ...estado.ambiente, epi: Array.from(new Set(estado.ambiente.epi.concat(epi))).sort(), capelaLigada: capela || estado.ambiente.capelaLigada } });
      return { estado: s, eventos: [ev('paramentacao', 'paramentar', `EPI: ${s.ambiente.epi.join(', ') || 'nenhum'}; capela ${s.ambiente.capelaLigada ? 'ligada' : 'desligada'}.`)] };
    }
  };

  const tarar = {
    id: 'tarar', titulo: 'Tarar a balança', regras: [],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const rec = recipiente(estado, id);
      const tara = rec.massaVazio_g + E.massaRecipiente(rec, ctx.especies);
      const s = E.com(estado, { equipamentos: { ...estado.equipamentos, balanca: { recipiente: id, tara_g: tara } } });
      return { estado: s, eventos: [ev('tara', 'tarar', `Balança tarada com ${id}: leitura 0,00 g.`, { recipiente: id, leitura: 0, unidade: 'g' })] };
    }
  };

  const pesar = {
    id: 'pesar', titulo: 'Pesar', regras: ['ruido_balanca'],
    aplicar(estado, p, ctx) {
      const espId = texto(p, 'especie');
      const id = texto(p, 'recipiente');
      const alvo = num(p, 'massaG', { min: 0.01, max: 5000 });
      const rec = recipiente(estado, id);
      especie(ctx, espId);
      const r = E.sortear(estado);
      const ruido = r.valor < 1 / 3 ? -0.01 : (r.valor < 2 / 3 ? 0 : 0.01);
      const real = Math.max(0.01, Math.round(alvo * 100) / 100 + ruido);
      const ad = adicionar(r.estado, id, espId, E.mmolDeMassa(especie(ctx, espId), real), ctx);
      const depois = recipiente(ad.estado, id);
      const tarada = estado.equipamentos.balanca.recipiente === id && Math.abs(estado.equipamentos.balanca.tara_g - (rec.massaVazio_g + E.massaRecipiente(rec, ctx.especies))) < 1e-6;
      const bruta = depois.massaVazio_g + E.massaRecipiente(depois, ctx.especies);
      const leitura = Math.round((tarada ? bruta - estado.equipamentos.balanca.tara_g : bruta) * 100) / 100;
      const eventos = [ev('pesagem', 'pesar', `Pesados ${fmt(real, 2)} g de ${espId} em ${id}; a balança mostra ${fmt(leitura, 2)} g.`, {
        regra: 'ruido_balanca', especie: espId, recipiente: id, leitura, unidade: 'g', massaRealG: real,
        desvio: tarada ? undefined : { codigo: 'sem_tara', gravidade: 'aviso' }
      })];
      return { estado: ad.estado, eventos: eventos.concat(ad.eventos) };
    }
  };

  const ERRO_VIDRARIA = { pipeta: 0.005, bureta: 0.002, balao: 0.001, proveta: 0.01, bequer: 0.05 };

  const medirVolume = {
    id: 'medirVolume', titulo: 'Medir volume', regras: ['erro_vidraria'],
    aplicar(estado, p, ctx) {
      const espId = texto(p, 'especie');
      const id = texto(p, 'recipiente');
      const vidraria = texto(p, 'vidraria', { lista: Object.keys(ERRO_VIDRARIA) });
      const vol = num(p, 'volumeMl', { min: 0.01, max: 5000 });
      const e = especie(ctx, espId);
      if (e.fase !== 'liquido' || !(e.densidade > 0)) throw new Error(`${espId} não é líquido com densidade conhecida`);
      recipiente(estado, id);
      const u = sortearUniforme(estado, -1, 1);
      const real = vol * (1 + ERRO_VIDRARIA[vidraria] * u.valor);
      const ad = adicionar(u.estado, id, espId, E.mmolDeMassa(e, real * e.densidade), ctx);
      return { estado: ad.estado, eventos: [ev('volume', 'medirVolume', `Medidos ${fmt(vol, 2)} mL de ${espId} com ${vidraria} (incerteza ±${fmt(ERRO_VIDRARIA[vidraria] * 100, 1)} %).`, { regra: 'erro_vidraria', especie: espId, recipiente: id, leitura: vol, unidade: 'mL', volumeRealMl: real })].concat(ad.eventos) };
    }
  };

  const transferir = {
    id: 'transferir', titulo: 'Transferir', regras: ['perda_transferencia'],
    aplicar(estado, p, ctx) {
      const origem = texto(p, 'origem');
      const destino = texto(p, 'destino');
      if (origem === destino) throw new Error('origem e destino iguais');
      const fracao = num(p, 'fracao', { min: 0, max: 1, padrao: 1 });
      recipiente(estado, origem); recipiente(estado, destino);
      const enxague = !!(p && p.enxague);
      const retido = enxague ? 0.002 : 0.02;
      const fr = fracao * (1 - retido);
      const antes = E.massaRecipiente(recipiente(estado, origem), ctx.especies);
      let s = moverFracao(estado, origem, destino, fr, ctx);
      const ficou = E.massaRecipiente(recipiente(s, origem), ctx.especies);
      const t = transbordo(s, destino, ctx);
      const eventos = [ev('transferencia', 'transferir', `Transferidos ${fmt(antes - ficou, 2)} g de ${origem} para ${destino}; ${enxague ? 'com enxágue, quase nada' : `sem enxágue, ${fmt(ficou, 2)} g`} ficou na parede.`, {
        regra: 'perda_transferencia', recipiente: destino, leitura: antes - ficou, unidade: 'g',
        desvio: enxague || fracao < 1 ? undefined : { codigo: 'sem_enxague', gravidade: 'aviso' }
      })];
      return { estado: t.estado, eventos: eventos.concat(t.eventos) };
    }
  };

  function dissolverComum(op, estado, p, ctx, agitacaoPadrao) {
    const id = texto(p, 'recipiente');
    const tempoMin = num(p, 'tempoMin', { min: 0, max: 600, padrao: 5 });
    const agitacao = p && p.agitacao !== undefined ? !!p.agitacao : agitacaoPadrao;
    const rec = recipiente(estado, id);
    if (!Object.keys(rec.liquido).length) throw new Error(`não há líquido em ${id} para dissolver`);
    const tau = agitacao ? 1 : 10;
    const fr = 1 - Math.exp(-tempoMin / tau);
    let liquido = rec.liquido;
    let solido = rec.solido;
    const extras = [];
    for (const sid of Object.keys(rec.solido)) {
      const e = especie(ctx, sid);
      if (e.solubilidade) continue;
      const d = rec.solido[sid] * fr;
      liquido = E.somarEspecie(liquido, sid, d);
      solido = E.somarEspecie(solido, sid, -d);
      extras.push(ev('dissolucao', op, `${sid} sem dado de solubilidade: considerado solúvel.`, { regra: 'solubilidade_sem_dado', especie: sid }));
    }
    const eq = F.equilibrarSolubilidade({ ...rec, liquido, solido }, ctx.especies, { fracaoDissolucao: fr });
    let s = E.comRecipiente(estado, id, () => ({ ...eq.rec, homogeneo: agitacao && fr > 0.99 }));
    s = aplicarTermico(s, id, {}, tempoMin * 60, ctx, { agitacao }).estado;
    const resto = Object.keys(recipiente(s, id).solido).length;
    return {
      estado: s,
      eventos: [ev('dissolucao_resumo', op, `${agitacao ? 'Com' : 'Sem'} agitação por ${fmt(tempoMin, 0)} min: ${resto ? 'ainda há sólido no fundo' : 'tudo dissolvido'}.`, { recipiente: id })].concat(extras, eventosFisicos(op, eq.eventos))
    };
  }

  const dissolver = { id: 'dissolver', titulo: 'Dissolver', regras: ['solubilidade_interpolada'], aplicar: (s, p, c) => dissolverComum('dissolver', s, p, c, true) };
  const agitar = { id: 'agitar', titulo: 'Agitar e homogeneizar', regras: ['solubilidade_interpolada'], aplicar: (s, p, c) => dissolverComum('agitar', s, p, c, true) };

  const FONTES = { banho_maria: { banho: true, max: 100 }, chapa: { potenciaW: 300 }, manta: { potenciaW: 250 }, chama: { potenciaW: 500 } };

  function aquecerComum(op, estado, p, ctx) {
    const id = texto(p, 'recipiente');
    const fonte = texto(p, 'fonte', { lista: Object.keys(FONTES), padrao: 'chapa' });
    const alvoC = num(p, 'alvoC', { min: -20, max: 400 });
    const tempoMin = num(p, 'tempoMin', { min: 0, max: 600 });
    const rec = recipiente(estado, id);
    const eventos = [];
    const inflamavel = Object.keys(rec.liquido).concat(Object.keys(rec.organica)).some((x) => (especie(ctx, x).perigos || []).includes('inflamavel'));
    if (fonte === 'chama' && inflamavel) {
      eventos.push(ev('incidente', op, 'Chama aberta com solvente inflamável: risco de incêndio. Use banho-maria ou manta.', { recipiente: id, desvio: { codigo: 'chama_com_inflamavel', gravidade: 'incidente' } }));
    }
    const f = FONTES[fonte];
    const termica = f.banho ? { banhoC: Math.min(alvoC, f.max), kBanhoWK: 8 } : { potenciaW: p && p.potenciaW > 0 ? p.potenciaW : f.potenciaW, alvoC };
    const faixa = Array.isArray(p && p.faixaC) ? p.faixaC : null;
    const r = aplicarTermico(estado, id, termica, tempoMin * 60, ctx, { faixaC: faixa, agitacao: !!(p && p.agitacao) });
    const T = recipiente(r.estado, id).tempC;
    eventos.unshift(ev('aquecimento', op, `${fonte.replace('_', '-')} por ${fmt(tempoMin, 0)} min: ${fmt(rec.tempC, 1)} → ${fmt(T, 1)} °C (máx. ${fmt(r.resumo.tMaxC, 1)} °C)${faixa ? `; ${fmt(r.resumo.tempoNaFaixaS / 60, 1)} min na faixa ${faixa[0]}-${faixa[1]} °C` : ''}.`, {
      regra: 'termica_newton', recipiente: id, leitura: T, unidade: '°C', tMaxC: r.resumo.tMaxC, tempoNaFaixaMin: r.resumo.tempoNaFaixaS / 60, evaporadoG: r.resumo.evaporadoG
    }));
    return { estado: r.estado, eventos: eventos.concat(eventosFisicos(op, r.eventos)) };
  }

  const aquecer = { id: 'aquecer', titulo: 'Aquecer', regras: ['termica_newton', 'patamar_ebulicao'], aplicar: (s, p, c) => aquecerComum('aquecer', s, p, c) };

  const refluxo = {
    id: 'refluxo', titulo: 'Aquecer sob refluxo', regras: ['termica_newton', 'refluxo'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const s = E.comRecipiente(estado, id, (r) => ({ ...r, condensador: true }));
      return aquecerComum('refluxo', s, Object.assign({ fonte: 'manta' }, p), ctx);
    }
  };

  const resfriar = {
    id: 'resfriar', titulo: 'Resfriar', regras: ['termica_newton', 'solubilidade_interpolada'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const banho = texto(p, 'banho', { lista: ['gelo', 'ambiente'], padrao: 'ambiente' });
      const tempoMin = num(p, 'tempoMin', { min: 0, max: 600 });
      const antes = recipiente(estado, id).tempC;
      const termica = banho === 'gelo' ? { banhoC: 0, kBanhoWK: 6 } : {};
      const r = aplicarTermico(estado, id, termica, tempoMin * 60, ctx, {});
      const T = recipiente(r.estado, id).tempC;
      const rapido = banho === 'gelo' && antes - T > 40 && tempoMin < 5;
      const eventos = [ev('resfriamento', 'resfriar', `${banho === 'gelo' ? 'Banho de gelo' : 'Ar ambiente'} por ${fmt(tempoMin, 0)} min: ${fmt(antes, 1)} → ${fmt(T, 1)} °C.`, {
        regra: 'termica_newton', recipiente: id, leitura: T, unidade: '°C',
        desvio: rapido ? { codigo: 'resfriamento_brusco', gravidade: 'aviso' } : undefined
      })];
      return { estado: r.estado, eventos: eventos.concat(eventosFisicos('resfriar', r.eventos)) };
    }
  };

  const avolumar = {
    id: 'avolumar', titulo: 'Completar o volume (q.s.p.)', regras: ['erro_vidraria', 'volume_aditivo'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const solv = texto(p, 'solvente', { padrao: 'H2O_l' });
      const rec = recipiente(estado, id);
      const alvo = num(p, 'volumeFinalMl', { min: 0.1, max: rec.capMl, padrao: rec.capMl });
      const e = especie(ctx, solv);
      if (e.fase !== 'liquido' || !(e.densidade > 0)) throw new Error(`${solv} não serve para completar volume`);
      const atual = E.volumeLiquidoMl(rec, ctx.especies);
      if (atual > alvo + 1e-9) throw new Error(`o volume (${fmt(atual, 1)} mL) já passa de ${fmt(alvo, 1)} mL`);
      const u = sortearUniforme(estado, -1, 1);
      const erro = rec.tipo === 'balao_volumetrico' ? ERRO_VIDRARIA.balao : ERRO_VIDRARIA.proveta;
      const final = alvo * (1 + erro * u.valor);
      const ad = adicionar(u.estado, id, solv, E.mmolDeMassa(e, Math.max(0, final - atual) * e.densidade), ctx);
      const quente = rec.tempC > 30;
      return {
        estado: ad.estado,
        eventos: [ev('avolumar', 'avolumar', `Volume completado a ${fmt(alvo, 1)} mL com ${solv}${quente ? ` a ${fmt(rec.tempC, 0)} °C: ao esfriar, o volume diminui` : ''}.`, {
          regra: 'erro_vidraria', recipiente: id, leitura: alvo, unidade: 'mL',
          desvio: quente ? { codigo: 'avolumado_quente', gravidade: 'aviso' } : undefined
        })].concat(ad.eventos)
      };
    }
  };

  const reagir = {
    id: 'reagir', titulo: 'Reagir', regras: ['estequiometria', 'cinetica_fator2', 'rendimento_semeado'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const rx = p && p.reacao;
      if (!rx || !rx.estequiometria || !Array.isArray(rx.estequiometria.reagentes) || !rx.estequiometria.produto) throw new Error('reação sem estequiometria');
      const tempoMin = num(p, 'tempoMin', { min: 0, max: 1440 });
      const rec = recipiente(estado, id);
      const especiesMap = new Map();
      for (const f of ['liquido', 'solido']) for (const x of Object.keys(rec[f])) especiesMap.set(x, (especiesMap.get(x) || 0) + rec[f][x]);
      const sigma = rx.desvioRendimento > 0 ? rx.desvioRendimento : 0;
      const mu = rx.rendimentoPercentual || 100;
      const n = E.sortearNormal(estado, mu, sigma);
      const rend = Math.max(0, Math.min(100, mu + 2 * sigma, n.valor));
      const sys = { especies: especiesMap, temp: rec.tempC, vol: E.volumeLiquidoMl(rec, ctx.especies) };
      const fator = F.fatorCinetico(rec.tempC, Number.isFinite(rx.tempRefC) ? rx.tempRefC : (rx.tempMinima || 25));
      const catalisadores = new Set(rx.catalisador && especiesMap.has(rx.catalisador) ? [rx.catalisador] : []);
      const res = LQ.avancarSintese(sys, { ...rx, rendimentoPercentual: rend }, p.andamento || null, tempoMin * fator, { catalisadores, agitadorAtivo: !!p.agitacao });
      const antesG = E.massaRecipiente(rec, ctx.especies);
      let liquido = {};
      let solido = {};
      for (const [x, mm] of sys.especies) {
        if (!(mm > E.EPS)) continue;
        const destino = especie(ctx, x).fase === 'liquido' ? 'liquido' : (rec.liquido[x] && !rec.solido[x] ? 'liquido' : 'solido');
        if (destino === 'liquido') liquido = E.somarEspecie(liquido, x, mm); else solido = E.somarEspecie(solido, x, mm);
      }
      let s = E.comRecipiente(n.estado, id, (r) => ({ ...r, liquido, solido }));
      const eq = F.equilibrarSolubilidade(recipiente(s, id), ctx.especies);
      s = E.comRecipiente(s, id, () => eq.rec);
      const depoisG = E.massaRecipiente(recipiente(s, id), ctx.especies);
      s = E.comBalanco(s, { reacao_g: antesG - depoisG });
      s = E.com(s, { t: s.t + tempoMin * 60 });
      const eventos = [];
      if (res.faltando.length) {
        eventos.push(ev('reacao_parada', 'reagir', `A reação não avança: falta ${res.faltando.join(', ')}.`, { recipiente: id, desvio: { codigo: 'condicao_reacao', gravidade: 'aviso' } }));
      } else {
        eventos.push(ev('reacao', 'reagir', `Reação por ${fmt(tempoMin, 0)} min a ${fmt(rec.tempC, 1)} °C (velocidade ×${fmt(fator, 2)}): conversão ${fmt(res.progresso * 100, 0)} %, limitante ${res.limitante}.`, {
          regra: 'estequiometria', recipiente: id, leitura: res.progresso, unidade: 'fração', limitante: res.limitante, andamento: res.est, rendimentoPct: rend
        }));
      }
      return { estado: s, eventos: eventos.concat(eventosFisicos('reagir', eq.eventos)) };
    }
  };

  const OPERACOES = { paramentar, tarar, pesar, medirVolume, transferir, dissolver, agitar, aquecer, refluxo, resfriar, avolumar, reagir };

  const API = {
    DT_S, OPERACOES, EPI_VALIDOS, ERRO_VIDRARIA,
    ajudantes: { ev, num, texto, recipiente, garantirRecipiente, especie, sortearUniforme, transbordo, adicionar, moverFracao, phDoRecipiente, aplicarTermico, eventosFisicos, fmt }
  };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorOpBase = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
