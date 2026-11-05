/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — operações de separação do motor (O3): filtrar, recristalizar, extrair, destilar e secar.
 * Mesmo contrato de lab-motor-op-base.js: aplicar(estado, parametros, ctx) → { estado, eventos }.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const F = emNode ? require('./lab-motor-fisica.js') : raiz.LabMotorFisica;
  const B = emNode ? require('./lab-motor-op-base.js') : raiz.LabMotorOpBase;
  const { ev, nome, num, texto, recipiente, garantirRecipiente, especie, adicionar, moverFracao, phDoRecipiente, aplicarTermico, eventosFisicos, fmt } = B.ajudantes;

  const RETENCAO = { simples: 0.05, vacuo: 0.02 };

  /** Dissolve sólidos de `solido` num líquido de lavagem conforme S(T) do solvente; devolve conteúdos novos. */
  function lavar(solido, lavagem, tempC, ctx) {
    let sol = solido;
    let liq = lavagem;
    for (const id of Object.keys(solido)) {
      const e = especie(ctx, id);
      const cap = F.capacidadeG({ liquido: liq, tempC }, id, ctx.especies);
      if (cap === null) continue;
      const d = Math.min(sol[id], E.mmolDeMassa(e, cap));
      sol = E.somarEspecie(sol, id, -d);
      liq = E.somarEspecie(liq, id, d);
    }
    return { solido: sol, liquido: liq };
  }

  const filtrar = {
    id: 'filtrar', titulo: 'Filtrar', regras: ['retencao_filtro', 'solubilidade_interpolada'],
    aplicar(estado, p, ctx) {
      const origem = texto(p, 'origem');
      const destSol = texto(p, 'destinoSolido', { padrao: 'filtro' });
      const destFil = texto(p, 'destinoFiltrado', { padrao: 'filtrado' });
      const tipo = texto(p, 'tipo', { lista: Object.keys(RETENCAO), padrao: 'vacuo' });
      const o = recipiente(estado, origem);
      let s = garantirRecipiente(estado, destSol, { tipo: 'filtro', capMl: 250, massaVazio_g: 5 });
      s = garantirRecipiente(s, destFil, { tipo: 'kitassato', capMl: Math.max(250, o.capMl), massaVazio_g: 150 });
      // Sólido vai ao filtro; o líquido passa, exceto a fração retida no bolo.
      const ret = RETENCAO[tipo];
      s = moverFracao(s, origem, destSol, 1, ctx, ['solido']);
      s = moverFracao(s, origem, destFil, 1 - ret, ctx, ['liquido', 'organica']);
      s = moverFracao(s, origem, destSol, 1, ctx, ['liquido', 'organica']);
      const eventos = [];
      const lav = p && p.lavagem;
      if (lav) {
        const solv = texto(lav, 'especie');
        const volMl = num(lav, 'volumeMl', { min: 0.1, max: 1000 });
        const tempC = num(lav, 'tempC', { min: -10, max: 100, padrao: 25 });
        const e = especie(ctx, solv);
        if (e.fase !== 'liquido' || !(e.densidade > 0)) throw new Error(`${solv} não serve para lavagem`);
        const mmolLav = E.mmolDeMassa(e, volMl * e.densidade);
        s = E.comBalanco(s, { entradas_g: volMl * e.densidade });
        const bolo = recipiente(s, destSol);
        const antesSolidoG = E.massaConteudo(bolo.solido, ctx.especies);
        const r = lavar(bolo.solido, { [solv]: mmolLav }, tempC, ctx);
        // A lavagem desloca a água-mãe retida: o líquido antigo vai ao filtrado e fica retida só a fração da lavagem.
        const lavagemTotal = E.somarConteudos(r.liquido, {});
        const passa = E.somarConteudos(E.escalarConteudo(lavagemTotal, 1 - ret), bolo.liquido);
        s = E.comRecipiente(s, destSol, (x) => ({ ...x, solido: r.solido, liquido: E.escalarConteudo(lavagemTotal, ret), organica: {} }));
        s = E.comRecipiente(s, destFil, (x) => ({ ...x, liquido: E.somarConteudos(x.liquido, E.somarConteudos(passa, bolo.organica)) }));
        const perdidoG = antesSolidoG - E.massaConteudo(r.solido, ctx.especies);
        eventos.push(ev('lavagem', 'filtrar', `Lavagem com ${fmt(volMl, 1)} mL de ${nome(ctx, solv)} a ${fmt(tempC, 0)} °C: ${fmt(perdidoG, 3)} g de sólido se dissolveram na lavagem.`, {
          regra: 'solubilidade_interpolada', recipiente: destSol, leitura: perdidoG, unidade: 'g', tempLavagemC: tempC,
          desvio: tempC >= 25 && perdidoG > 0.01 ? { codigo: 'perda_por_dissolucao', gravidade: 'aviso' } : undefined
        }));
      }
      const solG = E.massaConteudo(recipiente(s, destSol).solido, ctx.especies);
      eventos.unshift(ev('filtracao', 'filtrar', `Filtração ${tipo === 'vacuo' ? 'a vácuo' : 'simples'}: ${fmt(solG, 3)} g de sólido retidos em ${destSol}; o líquido foi para ${destFil}.`, { regra: 'retencao_filtro', recipiente: destSol, leitura: solG, unidade: 'g' }));
      return { estado: s, eventos };
    }
  };

  const recristalizar = {
    id: 'recristalizar', titulo: 'Recristalizar', regras: ['solubilidade_interpolada', 'retencao_filtro'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const solv = texto(p, 'solvente');
      const volMl = num(p, 'volumeMl', { min: 0.1, max: 2000 });
      const quente = num(p, 'tempQuenteC', { min: 30, max: 150, padrao: 75 });
      const frio = num(p, 'tempFrioC', { min: -10, max: 30, padrao: 0 });
      const destCristais = texto(p, 'destinoCristais', { padrao: 'cristais' });
      const destAgua = texto(p, 'destinoAguasMae', { padrao: 'aguas_mae' });
      const e = especie(ctx, solv);
      if (e.fase !== 'liquido' || !(e.densidade > 0)) throw new Error(`${solv} não serve para recristalizar`);
      let s = adicionar(estado, id, solv, E.mmolDeMassa(e, volMl * e.densidade), ctx).estado;
      // Dissolve a quente (equilíbrio completo, agitação) e registra o que não dissolveu.
      s = E.comRecipiente(s, id, (r) => ({ ...r, tempC: Math.min(quente, Number.isFinite(e.teb) ? e.teb : quente) }));
      const q = F.equilibrarSolubilidade(recipiente(s, id), ctx.especies);
      s = E.comRecipiente(s, id, () => q.rec);
      const naoDissolveuG = E.massaConteudo(q.rec.solido, ctx.especies);
      const totalSolutoG = naoDissolveuG + Object.keys(q.rec.liquido).filter((x) => especie(ctx, x).fase === 'solido').reduce((g, x) => g + E.massaDeMmol(especie(ctx, x), q.rec.liquido[x]), 0);
      s = E.comRecipiente(s, id, (r) => ({ ...r, tempC: frio }));
      const f = F.equilibrarSolubilidade(recipiente(s, id), ctx.especies);
      s = E.comRecipiente(s, id, () => f.rec);
      s = E.com(s, { t: s.t + 30 * 60 });
      const filt = filtrar.aplicar(s, { origem: id, destinoSolido: destCristais, destinoFiltrado: destAgua, tipo: 'vacuo' }, ctx);
      const cristaisG = E.massaConteudo(recipiente(filt.estado, destCristais).solido, ctx.especies);
      const eventos = [ev('recristalizacao', 'recristalizar', `Dissolvido em ${fmt(volMl, 1)} mL de ${nome(ctx, solv)} a ${fmt(quente, 0)} °C e resfriado a ${fmt(frio, 0)} °C: ${fmt(cristaisG, 3)} g de cristais.`, {
        regra: 'solubilidade_interpolada', recipiente: destCristais, leitura: cristaisG, unidade: 'g', volumeSolventeMl: volMl,
        desvio: naoDissolveuG > 0.02 * totalSolutoG ? { codigo: 'solvente_insuficiente', gravidade: 'aviso' } : undefined
      })];
      return { estado: filt.estado, eventos: eventos.concat(eventosFisicos('recristalizar', f.eventos, ctx)) };
    }
  };

  const extrair = {
    id: 'extrair', titulo: 'Extrair (funil de separação)', regras: ['particao_kd', 'ph_eletroneutralidade'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const solv = texto(p, 'solvente');
      const volMl = num(p, 'volumeMl', { min: 0.1, max: 2000 });
      const e = especie(ctx, solv);
      if (!e.imiscivelEmAgua) throw new Error(`${solv} não forma fase separada com a água`);
      const rec = recipiente(estado, id);
      const pH = p && Number.isFinite(p.pH) ? p.pH : phDoRecipiente(rec, ctx);
      let s = E.comRecipiente(estado, id, (r) => ({ ...r, organica: E.somarEspecie(r.organica, solv, E.mmolDeMassa(e, volMl * e.densidade)) }));
      s = E.comBalanco(s, { entradas_g: volMl * e.densidade });
      const r1 = recipiente(s, id);
      const volAq = E.volumeFaseMl(r1.liquido, ctx.especies);
      const volOrg = E.volumeFaseMl(r1.organica, ctx.especies);
      let liquido = r1.liquido;
      let organica = r1.organica;
      const partes = [];
      for (const x of Object.keys(r1.liquido)) {
        const ex = especie(ctx, x);
        const kd = ex.kd && ex.kd[solv];
        if (!(kd > 0)) continue;
        const fr = F.fracaoOrganica({ kd, pKa: ex.pKa, pH, volOrgMl: volOrg, volAqMl: volAq });
        const d = r1.liquido[x] * fr;
        liquido = E.somarEspecie(liquido, x, -d);
        organica = E.somarEspecie(organica, x, d);
        partes.push(`${fmt(fr * 100, 0)} % de ${nome(ctx, x)}`);
      }
      s = E.comRecipiente(s, id, (r) => ({ ...r, liquido, organica }));
      const eventos = [ev('extracao', 'extrair', `Extração com ${fmt(volMl, 0)} mL de ${nome(ctx, solv)} com a fase aquosa em pH ${fmt(pH, 1)}: ${partes.join('; ') || 'nenhum soluto com partição conhecida'} passou à fase orgânica.`, { regra: 'particao_kd', recipiente: id, pH })];
      if (p && p.aliviarPressao === false) eventos.push(ev('aviso', 'extrair', 'Agitar o funil sem aliviar a pressão pode estourar a tampa e espirrar solvente.', { recipiente: id, desvio: { codigo: 'pressao_no_funil', gravidade: 'aviso' } }));
      if (p && p.destinoOrganica) {
        const dest = texto(p, 'destinoOrganica');
        s = garantirRecipiente(s, dest, { tipo: 'erlenmeyer', capMl: 250 });
        const org = recipiente(s, id).organica;
        s = E.comRecipiente(s, id, (r) => ({ ...r, organica: {} }));
        s = E.comRecipiente(s, dest, (r) => ({ ...r, liquido: E.somarConteudos(r.liquido, org) }));
        eventos.push(ev('separacao_fases', 'extrair', `Fase orgânica recolhida em ${dest}.`, { recipiente: dest }));
      }
      return { estado: s, eventos };
    }
  };

  const destilar = {
    id: 'destilar', titulo: 'Destilar', regras: ['patamar_ebulicao', 'termica_newton'],
    aplicar(estado, p, ctx) {
      const origem = texto(p, 'origem');
      const destino = texto(p, 'destino', { padrao: 'destilado' });
      const tempoMin = num(p, 'tempoMin', { min: 0, max: 600 });
      const potenciaW = num(p, 'potenciaW', { min: 10, max: 2000, padrao: 300 });
      let s = garantirRecipiente(estado, destino, { tipo: 'erlenmeyer', capMl: 250 });
      const r = aplicarTermico(s, origem, { potenciaW }, tempoMin * 60, ctx, { destinoVapor: destino });
      s = r.estado;
      const seco = !Object.keys(recipiente(s, origem).liquido).some((x) => especie(ctx, x).fase === 'liquido');
      const eventos = [ev('destilacao', 'destilar', `Destilação por ${fmt(tempoMin, 0)} min: ${fmt(r.resumo.condensadoG, 2)} g recolhidos em ${destino} (cabeça a ${fmt(r.resumo.tMaxC, 1)} °C).`, {
        regra: 'patamar_ebulicao', recipiente: destino, leitura: r.resumo.condensadoG, unidade: 'g',
        desvio: seco ? { codigo: 'destilou_ate_secura', gravidade: 'aviso' } : undefined
      })];
      return { estado: s, eventos: eventos.concat(eventosFisicos('destilar', r.eventos.filter((e) => e.tipo !== 'ebulicao'), ctx)) };
    }
  };

  const secar = {
    id: 'secar', titulo: 'Secar em estufa', regras: ['cinetica_fator2', 'ponto_fusao_impureza'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const tempC = num(p, 'tempC', { min: 20, max: 250 });
      const tempoMin = num(p, 'tempoMin', { min: 1, max: 1440 });
      const rec = recipiente(estado, id);
      const tau = 30 / F.fatorCinetico(tempC, 60); // min; 30 min a 60 °C (regra didática)
      const fr = 1 - Math.exp(-tempoMin / tau);
      let liquido = rec.liquido;
      let organica = rec.organica;
      let solido = rec.solido;
      let evapG = 0;
      for (const fase of ['liquido', 'organica']) {
        for (const x of Object.keys(rec[fase])) {
          const e = especie(ctx, x);
          if (e.fase !== 'liquido') { // soluto da água-mãe fica no sólido ao secar
            solido = E.somarEspecie(solido, x, rec[fase][x]);
            if (fase === 'liquido') liquido = E.somarEspecie(liquido, x, -rec[fase][x]); else organica = E.somarEspecie(organica, x, -rec[fase][x]);
            continue;
          }
          const d = rec[fase][x] * fr;
          evapG += E.massaDeMmol(e, d);
          if (fase === 'liquido') liquido = E.somarEspecie(liquido, x, -d); else organica = E.somarEspecie(organica, x, -d);
        }
      }
      const eventos = [];
      let s = E.comRecipiente(estado, id, (r) => ({ ...r, liquido, organica, solido, tempC }));
      s = E.comBalanco(s, { evaporado_g: evapG });
      for (const x of Object.keys(solido)) {
        const e = especie(ctx, x);
        if (Number.isFinite(e.pf) && tempC >= e.pf - 15 && !/__degradado$/.test(x)) {
          const d = solido[x] * 0.3;
          s = E.comRecipiente(s, id, (r) => ({ ...r, solido: E.somarEspecie(E.somarEspecie(r.solido, x, -d), `${x}__degradado`, d) }));
          eventos.push(ev('incidente', 'secar', `Estufa a ${fmt(tempC, 0)} °C, perto do ponto de fusão de ${nome(ctx, x)} (${fmt(e.pf, 0)} °C): parte funde e se decompõe.`, { especie: x, recipiente: id, desvio: { codigo: 'fusao_decomposicao', gravidade: 'nao_conforme' } }));
        }
      }
      const restante = E.massaConteudo(recipiente(s, id).liquido, ctx.especies) + E.massaConteudo(recipiente(s, id).organica, ctx.especies);
      const massaG = E.massaRecipiente(recipiente(s, id), ctx.especies);
      s = E.com(s, { t: s.t + tempoMin * 60 });
      eventos.unshift(ev('secagem', 'secar', `Estufa a ${fmt(tempC, 0)} °C por ${fmt(tempoMin, 0)} min: saíram ${fmt(evapG, 3)} g de solvente; massa ${fmt(massaG, 3)} g${restante < 0.001 * Math.max(massaG, 1e-9) ? ' (massa constante)' : ''}.`, {
        regra: 'cinetica_fator2', recipiente: id, leitura: massaG, unidade: 'g', massaConstante: restante < 0.001 * Math.max(massaG, 1e-9)
      }));
      return { estado: s, eventos };
    }
  };

  const OPERACOES = { filtrar, recristalizar, extrair, destilar, secar };
  const API = { OPERACOES, RETENCAO };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorOpSeparacao = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
