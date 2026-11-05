/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — operações de análise e acabamento do motor (O3): titular, calibrar, medirPH, pontoFusao,
 * ccd, ensaioFeCl3, esterilizar, envasar, rotular e descartar.
 * Mesmo contrato de lab-motor-op-base.js: aplicar(estado, parametros, ctx) → { estado, eventos }.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const F = emNode ? require('./lab-motor-fisica.js') : raiz.LabMotorFisica;
  const B = emNode ? require('./lab-motor-op-base.js') : raiz.LabMotorOpBase;
  const { ev, num, texto, recipiente, garantirRecipiente, especie, sortearUniforme, transbordo, moverFracao, phDoRecipiente, fmt } = B.ajudantes;

  const INDICADORES = { fenolftaleina: { viragem: 8.2, acida: 'incolor', basica: 'rosa' }, nenhum: null };

  /** Fração molar de cada espécie não solvente (sólidos e solutos) do recipiente. */
  function fracoesAmostra(rec, ctx) {
    const tot = {};
    for (const f of ['liquido', 'organica', 'solido']) {
      for (const id of Object.keys(rec[f])) {
        if (especie(ctx, id).fase === 'liquido') continue;
        tot[id] = (tot[id] || 0) + rec[f][id];
      }
    }
    const soma = Object.values(tot).reduce((a, b) => a + b, 0);
    const out = {};
    for (const id of Object.keys(tot)) out[id] = soma > 0 ? tot[id] / soma : 0;
    return out;
  }

  const titular = {
    id: 'titular', titulo: 'Titular', regras: ['ph_eletroneutralidade'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const t = p && p.titulante;
      if (!t) throw new Error('titulante obrigatório');
      const espId = texto(t, 'especie');
      const conc = num(t, 'concMolL', { min: 1e-6, max: 20 });
      const volMl = num(p, 'volumeMl', { min: 0.01, max: 100 });
      const ind = texto(p, 'indicador', { lista: Object.keys(INDICADORES), padrao: 'fenolftaleina' });
      const agua = especie(ctx, 'H2O_l');
      especie(ctx, espId);
      let s = E.comRecipiente(estado, id, (r) => ({
        ...r,
        liquido: E.somarEspecie(E.somarEspecie(r.liquido, 'H2O_l', E.mmolDeMassa(agua, volMl * agua.densidade)), espId, conc * volMl)
      }));
      s = E.comBalanco(s, { entradas_g: volMl * agua.densidade + E.massaDeMmol(especie(ctx, espId), conc * volMl) });
      const tb = transbordo(s, id, ctx);
      s = tb.estado;
      const pH = phDoRecipiente(recipiente(s, id), ctx);
      const i = INDICADORES[ind];
      const cor = i ? (pH >= i.viragem ? i.basica : i.acida) : null;
      return {
        estado: s,
        eventos: [ev('titulacao', 'titular', `Adicionados ${fmt(volMl, 2)} mL de ${espId} ${fmt(conc, 3)} mol/L${cor ? `: a solução está ${cor}` : ''}.`, { regra: 'ph_eletroneutralidade', recipiente: id, leitura: volMl, unidade: 'mL', pH, cor })].concat(tb.eventos)
      };
    }
  };

  const calibrar = {
    id: 'calibrar', titulo: 'Calibrar o pHmetro', regras: ['medida_ph_instrumento'],
    aplicar(estado, p) {
      const tampoes = Array.isArray(p && p.tampoes) ? p.tampoes.filter((x) => Number.isFinite(x)) : [];
      const ok = new Set(tampoes).size >= 2;
      const s = E.com(estado, { equipamentos: { ...estado.equipamentos, phmetroCalibrado: ok } });
      return { estado: s, eventos: [ev('calibracao', 'calibrar', ok ? `pHmetro calibrado com tampões pH ${tampoes.join(' e ')}.` : 'Calibração exige ao menos dois tampões diferentes.', { regra: 'medida_ph_instrumento', desvio: ok ? undefined : { codigo: 'calibracao_incompleta', gravidade: 'aviso' } })] };
    }
  };

  const medirPH = {
    id: 'medirPH', titulo: 'Medir o pH', regras: ['ph_eletroneutralidade', 'medida_ph_instrumento'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const inst = texto(p, 'instrumento', { lista: ['phmetro', 'fita'], padrao: 'phmetro' });
      const real = phDoRecipiente(recipiente(estado, id), ctx);
      let s = estado;
      let leitura;
      let desvio;
      if (inst === 'fita') {
        leitura = Math.round(real * 2) / 2;
      } else {
        const u = sortearUniforme(estado, -0.02, 0.02);
        s = u.estado;
        const calibrado = estado.equipamentos.phmetroCalibrado;
        leitura = Math.round((real + u.valor + (calibrado ? 0 : 0.3)) * 100) / 100;
        if (!calibrado) desvio = { codigo: 'phmetro_sem_calibrar', gravidade: 'aviso' };
      }
      return { estado: s, eventos: [ev('ph', 'medirPH', `${inst === 'fita' ? 'Fita indicadora' : 'pHmetro'}: pH ${fmt(leitura, inst === 'fita' ? 1 : 2)}.`, { regra: 'medida_ph_instrumento', recipiente: id, leitura, unidade: 'pH', desvio })] };
    }
  };

  const pontoFusao = {
    id: 'pontoFusao', titulo: 'Ponto de fusão', regras: ['ponto_fusao_impureza'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const espId = texto(p, 'especie');
      const taxa = num(p, 'taxaCMin', { min: 0.1, max: 20, padrao: 1 });
      const e = especie(ctx, espId);
      if (!Number.isFinite(e.pf)) throw new Error(`${espId} sem ponto de fusão de referência`);
      const fr = fracoesAmostra(recipiente(estado, id), ctx);
      if (!fr[espId]) throw new Error(`não há ${espId} em ${id}`);
      const pf = F.pontoFusaoObservado(e.pf, 1 - fr[espId]);
      const extra = taxa > 2 ? 2 : 0;
      const leitura = [Math.round((pf.inicioC + extra) * 10) / 10, Math.round((pf.fimC + extra) * 10) / 10];
      return { estado, eventos: [ev('ponto_fusao', 'pontoFusao', `Faixa de fusão observada: ${fmt(leitura[0], 1)} a ${fmt(leitura[1], 1)} °C${extra ? ' (aquecimento rápido eleva a leitura)' : ''}.`, {
        regra: 'ponto_fusao_impureza', recipiente: id, especie: espId, leitura, unidade: '°C',
        desvio: extra ? { codigo: 'aquecimento_rapido_pf', gravidade: 'aviso' } : undefined
      })] };
    }
  };

  const ccd = {
    id: 'ccd', titulo: 'Cromatografia em camada delgada', regras: ['ccd_rf_ilustrativo'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const eluente = texto(p, 'eluente');
      const tabela = (ctx.rf && ctx.rf[eluente]) || {};
      const manchas = F.manchasCCD(fracoesAmostra(recipiente(estado, id), ctx), tabela);
      const desc = manchas.map((m) => `${m.especie}${m.rf === null ? '' : ` (Rf ${fmt(m.rf, 2)})`}`).join(', ');
      return { estado, eventos: [ev('ccd', 'ccd', `Placa revelada: ${manchas.length} mancha(s): ${desc || 'nenhuma'}.`, { regra: 'ccd_rf_ilustrativo', recipiente: id, leitura: manchas.length, unidade: 'manchas', manchas })] };
    }
  };

  const LIMIAR_FENOL = 0.005;
  const ensaioFeCl3 = {
    id: 'ensaioFeCl3', titulo: 'Ensaio com cloreto férrico', regras: ['ccd_rf_ilustrativo'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const fr = fracoesAmostra(recipiente(estado, id), ctx);
      const fenol = Object.keys(fr).filter((x) => especie(ctx, x).fenolLivre).reduce((a, x) => a + fr[x], 0);
      const positivo = fenol > LIMIAR_FENOL;
      return { estado, eventos: [ev('fecl3', 'ensaioFeCl3', positivo ? 'Cor violeta: há fenol livre (ácido salicílico residual).' : 'Sem cor violeta: fenol livre abaixo do limite de detecção.', {
        recipiente: id, leitura: positivo ? 'positivo' : 'negativo', fracaoFenol: fenol,
        desvio: positivo ? { codigo: 'fecl3_positivo', gravidade: 'nao_conforme' } : undefined
      })] };
    }
  };

  const esterilizar = {
    id: 'esterilizar', titulo: 'Esterilizar', regras: ['esterilizacao_parametros'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const metodo = texto(p, 'metodo', { lista: ['autoclave', 'filtracao_022'] });
      const rec = recipiente(estado, id);
      const eventos = [];
      let s = estado;
      let ok;
      if (metodo === 'autoclave') {
        const tempC = num(p, 'tempC', { min: 50, max: 140 });
        const tempoMin = num(p, 'tempoMin', { min: 1, max: 240 });
        ok = tempC >= 121 && tempoMin >= 15;
        const termolabeis = Object.keys(rec.liquido).concat(Object.keys(rec.solido)).filter((x) => especie(ctx, x).termolabil);
        for (const x of termolabeis) {
          const fase = rec.liquido[x] ? 'liquido' : 'solido';
          const d = rec[fase][x] * 0.1;
          s = E.comRecipiente(s, id, (r) => {
            const sem = { ...r, [fase]: E.somarEspecie(r[fase], x, -d) };
            return { ...sem, solido: E.somarEspecie(sem.solido, `${x}__degradado`, d) };
          });
          eventos.push(ev('degradacao', 'esterilizar', `${x} é termolábil: parte se degradou na autoclave. Prefira filtração esterilizante.`, { especie: x, recipiente: id, desvio: { codigo: 'termolabil_autoclavado', gravidade: 'nao_conforme' } }));
        }
        s = E.com(s, { t: s.t + tempoMin * 60 });
        eventos.unshift(ev('esterilizacao', 'esterilizar', `Autoclave a ${fmt(tempC, 0)} °C por ${fmt(tempoMin, 0)} min: ${ok ? 'ciclo válido' : 'ciclo insuficiente (mínimo 121 °C por 15 min)'}.`, { regra: 'esterilizacao_parametros', recipiente: id, leitura: ok, desvio: ok ? undefined : { codigo: 'ciclo_insuficiente', gravidade: 'nao_conforme' } }));
      } else {
        const poro = num(p, 'membranaUm', { min: 0.01, max: 10, padrao: 0.22 });
        ok = poro <= 0.22 + 1e-9;
        eventos.push(ev('esterilizacao', 'esterilizar', `Filtração em membrana de ${fmt(poro, 2)} µm: ${ok ? 'esterilizante' : 'poro grande demais, não esteriliza'}.`, { regra: 'esterilizacao_parametros', recipiente: id, leitura: ok, desvio: ok ? undefined : { codigo: 'membrana_inadequada', gravidade: 'nao_conforme' } }));
      }
      s = E.comRecipiente(s, id, (r) => ({ ...r, esteril: ok }));
      return { estado: s, eventos };
    }
  };

  const envasar = {
    id: 'envasar', titulo: 'Envasar', regras: ['perda_transferencia'],
    aplicar(estado, p, ctx) {
      const origem = texto(p, 'origem');
      const frasco = texto(p, 'frasco');
      const volMl = num(p, 'volumeMl', { min: 0.1, max: 5000 });
      const capMl = num(p, 'capMl', { min: 1, max: 5000, padrao: Math.max(volMl, 1) * 1.1 });
      const o = recipiente(estado, origem);
      const volO = E.volumeLiquidoMl(o, ctx.especies);
      if (!(volO > 0)) throw new Error(`não há líquido em ${origem}`);
      let s = garantirRecipiente(estado, frasco, { tipo: 'frasco', capMl });
      s = moverFracao(s, origem, frasco, Math.min(1, volMl / volO) * 0.995, ctx);
      const tb = transbordo(s, frasco, ctx);
      s = E.comRecipiente(tb.estado, frasco, (r) => ({ ...r, esteril: !!(o.esteril && p.assepsia) }));
      const v = E.volumeLiquidoMl(recipiente(s, frasco), ctx.especies);
      return { estado: s, eventos: [ev('envase', 'envasar', `Envasados ${fmt(v, 1)} mL em ${frasco}${o.esteril && !p.assepsia ? ' sem técnica asséptica: o produto deixa de ser estéril' : ''}.`, {
        regra: 'perda_transferencia', recipiente: frasco, leitura: v, unidade: 'mL',
        desvio: o.esteril && !p.assepsia ? { codigo: 'perdeu_esterilidade', gravidade: 'nao_conforme' } : undefined
      })].concat(tb.eventos) };
    }
  };

  // Campos mínimos didáticos; a lista oficial depende da norma aplicável e é definida no processo.
  const CAMPOS_ROTULO_PADRAO = ['produto', 'concentracao', 'lote', 'fabricacao', 'validade', 'responsavel'];

  const rotular = {
    id: 'rotular', titulo: 'Rotular', regras: ['rotulagem_campos'],
    aplicar(estado, p) {
      const id = texto(p, 'recipiente');
      recipiente(estado, id);
      const campos = (p && p.campos) || {};
      const obrig = Array.isArray(p && p.camposObrigatorios) ? p.camposObrigatorios : CAMPOS_ROTULO_PADRAO;
      const rotulo = {};
      for (const k of Object.keys(campos)) {
        if (typeof campos[k] !== 'string') continue;
        const v = campos[k].trim().slice(0, 120);
        if (v) rotulo[k] = v;
      }
      const faltam = obrig.filter((k) => !rotulo[k]);
      const s = E.comRecipiente(estado, id, (r) => ({ ...r, rotulo }));
      return { estado: s, eventos: [ev('rotulo', 'rotular', faltam.length ? `Rótulo incompleto: falta ${faltam.join(', ')}.` : 'Rótulo com todos os campos mínimos.', {
        regra: 'rotulagem_campos', recipiente: id, leitura: faltam.length === 0, faltam,
        desvio: faltam.length ? { codigo: 'rotulo_incompleto', gravidade: 'nao_conforme' } : undefined
      })] };
    }
  };

  // Destino → classes de resíduo aceitas (regra de jogo; o POP local manda).
  const DESTINOS = {
    pia: ['aquoso_neutro'],
    neutralizar_e_pia: ['aquoso_neutro', 'aquoso_acido', 'aquoso_basico'],
    organico_nao_halogenado: ['organico_nao_halogenado', 'aquoso_neutro', 'aquoso_acido'],
    organico_halogenado: ['organico_halogenado', 'organico_nao_halogenado', 'aquoso_neutro'],
    metal_pesado: ['metal_pesado', 'aquoso_neutro', 'aquoso_acido', 'aquoso_basico'],
    solido_quimico: ['organico_nao_halogenado', 'aquoso_neutro', 'metal_pesado']
  };

  const descartar = {
    id: 'descartar', titulo: 'Descartar resíduo', regras: ['descarte_classes'],
    aplicar(estado, p, ctx) {
      const id = texto(p, 'recipiente');
      const destino = texto(p, 'destino', { lista: Object.keys(DESTINOS) });
      const rec = recipiente(estado, id);
      const classes = new Set();
      for (const f of ['liquido', 'organica', 'solido']) for (const x of Object.keys(rec[f])) classes.add(especie(ctx, x).residuo || 'organico_nao_halogenado');
      const fora = Array.from(classes).filter((c) => !DESTINOS[destino].includes(c));
      const g = E.massaRecipiente(rec, ctx.especies);
      let s = E.comRecipiente(estado, id, (r) => ({ ...r, liquido: {}, organica: {}, solido: {}, homogeneo: false }));
      s = E.comBalanco(s, { descartado_g: g });
      s = E.com(s, { residuos: estado.residuos.concat([{ recipiente: id, destino, classes: Array.from(classes).sort(), massaG: g, conforme: fora.length === 0 }]) });
      return { estado: s, eventos: [ev('descarte', 'descartar', fora.length ? `Descarte em ${destino} não aceita ${fora.join(', ')}.` : `${fmt(g, 2)} g descartados em ${destino}.`, {
        regra: 'descarte_classes', recipiente: id, leitura: g, unidade: 'g', destino,
        desvio: fora.length ? { codigo: 'descarte_incorreto', gravidade: 'nao_conforme' } : undefined
      })] };
    }
  };

  const OPERACOES = { titular, calibrar, medirPH, pontoFusao, ccd, ensaioFeCl3, esterilizar, envasar, rotular, descartar };
  const API = { OPERACOES, INDICADORES, CAMPOS_ROTULO_PADRAO, DESTINOS, fracoesAmostra };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorOpCq = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
