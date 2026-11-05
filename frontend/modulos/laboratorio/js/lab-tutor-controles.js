/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — controles da bancada do motor (O4). Puro, sem DOM. Um controle por `alvoUI` (campos → parâmetros da
 * operação, ajustados à ação), descrição da ação em texto (degrau "resposta" da dica) e competência da etapa.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const Ca = emNode ? require('./lab-motor-calculos.js') : raiz.LabMotorCalculos;

  const EPI = [['jaleco', 'Jaleco'], ['luvas_nitrila', 'Luvas nitrílicas'], ['oculos', 'Óculos de proteção'], ['touca', 'Touca'], ['mascara', 'Máscara'], ['protetor_facial', 'Protetor facial']];
  const TAMPOES = [['4', 'Tampão pH 4'], ['7', 'Tampão pH 7'], ['10', 'Tampão pH 10']];
  const VIDRARIA = [['proveta', 'Proveta'], ['pipeta', 'Pipeta'], ['bequer', 'Béquer']];
  const DESTINOS = [
    ['pia', 'Pia, com água corrente'], ['neutralizar_e_pia', 'Neutralizar e depois pia'],
    ['organico_nao_halogenado', 'Resíduo orgânico não halogenado'], ['organico_halogenado', 'Resíduo orgânico halogenado'],
    ['metal_pesado', 'Resíduo de metal pesado'], ['solido_quimico', 'Resíduo sólido químico']
  ];
  const ROTULOS_CAMPO = { produto: 'Produto', concentracao: 'Concentração', lote: 'Lote', fabricacao: 'Fabricação', validade: 'Validade', responsavel: 'Responsável', advertencias: 'Advertências' };
  const CAMPOS_ROTULO = ['produto', 'concentracao', 'lote', 'fabricacao', 'validade', 'responsavel'];

  const tempo = (padraoDe) => ({ id: 'tempoMin', tipo: 'numero', rotulo: 'Tempo (min)', min: 0.1, max: 600, padraoDe });
  const CONTROLES = Object.freeze({
    painelSeguranca: { grupo: 'Segurança', rotulo: 'Painel de segurança (EPI)', botao: 'Vestir o EPI marcado', campos: [{ id: 'epi', tipo: 'marcas', rotulo: 'EPI', opcoes: EPI }] },
    balancaTara: { grupo: 'Balança', rotulo: 'Balança: botão Tara', botao: 'Tara', campos: [] },
    btnAgitar: { grupo: 'Bancada', rotulo: 'Agitar', botao: 'Agitar', campos: [tempo('tempoMin'), { id: 'agitacao', tipo: 'marca', rotulo: 'Agitação magnética', padrao: true }] },
    btnMisturar: { grupo: 'Bancada', rotulo: 'Misturar', botao: 'Misturar', campos: [tempo('tempoMin')] },
    btnTransferir: { grupo: 'Bancada', rotulo: 'Transferir', botao: 'Transferir', campos: [{ id: 'enxague', tipo: 'marca', rotulo: 'Enxaguar o recipiente de origem e juntar o enxágue', padrao: false }] },
    btnAvolumar: { grupo: 'Bancada', rotulo: 'Completar o volume', botao: 'Completar o volume', campos: [{ id: 'volumeFinalMl', tipo: 'numero', rotulo: 'Completar até (mL)', min: 1, max: 5000 }] },
    btnCompletarMassa: { grupo: 'Balança', rotulo: 'Completar a massa', botao: 'Completar a massa', campos: [{ id: 'massaFinalG', tipo: 'numero', rotulo: 'Completar até (g)', min: 0.01, max: 5000, padraoDe: 'massaFinalG' }] },
    btnAquecer: { grupo: 'Aquecimento', rotulo: 'Aquecer', botao: 'Aquecer', campos: [{ id: 'alvoC', tipo: 'numero', rotulo: 'Temperatura alvo (°C)', min: -20, max: 400, padraoDe: 'alvoC' }, tempo('tempoMin')] },
    btnResfriar: { grupo: 'Aquecimento', rotulo: 'Resfriar', botao: 'Resfriar', campos: [tempo('tempoMin')] },
    btnTitular: { grupo: 'Controle de qualidade', rotulo: 'Bureta: titular', botao: 'Titular', campos: [{ id: 'volumeMl', tipo: 'numero', rotulo: 'Volume de titulante (mL)', min: 0.01, max: 100, padraoDe: 'volumeMl' }] },
    painelCQ: { grupo: 'Controle de qualidade', rotulo: 'Ensaio de controle de qualidade', botao: 'Fazer o ensaio', campos: [] },
    phmetroCalibrar: { grupo: 'pHmetro', rotulo: 'pHmetro: calibrar', botao: 'Calibrar', campos: [{ id: 'tampoes', tipo: 'marcas', rotulo: 'Tampões', opcoes: TAMPOES, numerico: true }] },
    phmetro: { grupo: 'pHmetro', rotulo: 'pHmetro: medir', botao: 'Medir o pH', campos: [] },
    btnEsterilizar: { grupo: 'Envase', rotulo: 'Esterilizar', botao: 'Esterilizar', campos: [] },
    btnEncapsular: { grupo: 'Envase', rotulo: 'Encapsulador', botao: 'Encapsular', campos: [] },
    btnEnvasar: { grupo: 'Envase', rotulo: 'Envasar', botao: 'Envasar no frasco', campos: [] },
    painelRotulo: { grupo: 'Envase', rotulo: 'Rótulo do frasco', botao: 'Colar o rótulo', campos: CAMPOS_ROTULO.map((id) => ({ id, tipo: 'texto', rotulo: ROTULOS_CAMPO[id], agrupar: 'campos' })) },
    painelDescarte: { grupo: 'Resíduos', rotulo: 'Descarte', botao: 'Descartar', campos: [{ id: 'destino', tipo: 'opcao', rotulo: 'Destino', opcoes: DESTINOS, vazio: 'Escolha o destino', obrigatorio: true }] }
  });

  function nomeEspecie(ctx, id) { const e = ctx && ctx.especies && ctx.especies[id]; return e && e.nome ? e.nome.toLowerCase() : String(id); }
  function humano(t) { return String(t || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(); }

  /** Definição do controle. Com a `acao`, os campos se ajustam a ela (reagente, rótulo, capela). */
  function controle(alvo, ctx, acao) {
    if (typeof alvo !== 'string') return null;
    const p = (acao && acao.parametros) || {};
    if (alvo === 'painelRotulo' && acao) {
      const ids = Array.isArray(p.camposObrigatorios) ? p.camposObrigatorios : Object.keys(p.campos || {}).length ? Object.keys(p.campos) : CAMPOS_ROTULO;
      return { ...CONTROLES.painelRotulo, campos: ids.map((id) => ({ id, tipo: 'texto', rotulo: ROTULOS_CAMPO[id] || humano(id), agrupar: 'campos' })) };
    }
    if (alvo === 'painelSeguranca' && acao && p.capela !== undefined) {
      return { ...CONTROLES.painelSeguranca, campos: CONTROLES.painelSeguranca.campos.concat([{ id: 'capela', tipo: 'marca', rotulo: 'Ligar a capela', padrao: false }]) };
    }
    if (Object.prototype.hasOwnProperty.call(CONTROLES, alvo)) return CONTROLES[alvo];
    if (alvo.indexOf('reagente:') !== 0) return null;
    const id = alvo.slice(9);
    const e = ctx && ctx.especies && ctx.especies[id];
    if (!e) return null;
    const nome = e.nome || id;
    const porVolume = acao ? acao.operacao === 'medirVolume' : e.fase === 'liquido';
    if (porVolume) {
      return { grupo: 'Reagentes', rotulo: `Reagente: ${nome}`, botao: `Medir e juntar ${nome.toLowerCase()}`, campos: [{ id: 'volumeMl', tipo: 'numero', rotulo: 'Volume (mL)', min: 0.01, max: 5000 }, { id: 'vidraria', tipo: 'opcao', rotulo: 'Medir com', opcoes: VIDRARIA, padrao: 'proveta' }] };
    }
    return { grupo: 'Reagentes', rotulo: `Reagente: ${nome}`, botao: `Pesar ${nome.toLowerCase()}`, campos: [{ id: 'massaG', tipo: 'numero', rotulo: 'Massa (g)', min: 0.01, max: 5000 }] };
  }

  function lerCampo(c, valores) {
    const bruto = valores ? valores[c.id] : undefined;
    if (c.tipo === 'numero') {
      const v = Ca.lerNumero(bruto);
      if (v === null) return { erro: `Preencha ${c.rotulo} com um número.` };
      if (v < c.min || v > c.max) return { erro: `${c.rotulo}: use um valor entre ${Ca.formatarNumero(c.min, 2)} e ${Ca.formatarNumero(c.max, 0)}.` };
      return { v };
    }
    if (c.tipo === 'marca') return { v: bruto === undefined ? !!c.padrao : bruto === true };
    if (c.tipo === 'marcas') {
      const validos = c.opcoes.map((o) => o[0]);
      const lista = (Array.isArray(bruto) ? bruto : []).map(String).filter((x) => validos.includes(x));
      return { v: c.numerico ? lista.map(Number) : lista };
    }
    if (c.tipo === 'opcao') {
      const v = typeof bruto === 'string' && c.opcoes.some((o) => o[0] === bruto) ? bruto : (c.obrigatorio ? null : c.padrao || null);
      if (v === null && c.obrigatorio) return { erro: `Escolha: ${c.rotulo.toLowerCase()}.` };
      return { v };
    }
    return { v: typeof bruto === 'string' ? bruto.slice(0, 120) : '' };
  }

  /** Converte os campos do controle em parâmetros da operação: { ok, parametros } ou { ok: false, mensagem }. */
  function montarParametros(alvo, valores, ctx, acao) {
    const def = controle(alvo, ctx, acao);
    if (!def) return { ok: false, mensagem: 'Controle desconhecido.' };
    const parametros = {};
    for (const c of def.campos) {
      const r = lerCampo(c, valores);
      if (r.erro) return { ok: false, mensagem: r.erro };
      if (r.v === null) continue;
      if (c.agrupar) parametros[c.agrupar] = { ...(parametros[c.agrupar] || {}), [c.id]: r.v };
      else parametros[c.id] = r.v;
    }
    return { ok: true, parametros };
  }

  const TIPO_RECIPIENTE = { bequer: 'béquer', balao: 'balão volumétrico', frasco: 'frasco', proveta: 'proveta', gral: 'gral', erlenmeyer: 'erlenmeyer', capsulas: 'cápsulas' };
  /** 'bequer_100' → 'béquer de 100 mL'; 'bequer_a' → 'béquer A'. */
  function rotuloRecipiente(id) {
    const m = /^([a-z]+)(?:_([a-z0-9]+))?$/.exec(String(id || ''));
    if (!m) return String(id || 'recipiente');
    const tipo = TIPO_RECIPIENTE[m[1]] || m[1];
    if (!m[2]) return tipo;
    return /^\d+$/.test(m[2]) ? `${tipo} de ${m[2]} mL` : `${tipo} ${m[2].toUpperCase()}`;
  }
  function rotuloDe(opcoes, v) { const o = opcoes.find((x) => x[0] === String(v)); return o ? o[1] : humano(v); }
  function juntar(itens) { return itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`; }
  const f2 = (v) => Ca.formatarNumero(v, 2);
  const f0 = (v) => Ca.formatarNumero(v, 0);
  const num = (v) => (Number.isInteger(v) ? f0(v) : f2(v));

  /** Frase com o que fazer exatamente na ação (valores do processo). */
  function descreverAcao(acao, ctx) {
    const p = (acao && acao.parametros) || {};
    switch (acao && acao.operacao) {
      case 'paramentar': return `Marque e vista: ${juntar((p.epi || []).map((x) => rotuloDe(EPI, x).toLowerCase()))}${p.capela ? ', e ligue a capela' : ''}.`;
      case 'tarar': return `Com o ${rotuloRecipiente(p.recipiente)} vazio no prato, toque em Tara: a balança passa a mostrar 0,00 g.`;
      case 'pesar': return `Pese ${f2(p.massaG)} g de ${nomeEspecie(ctx, p.especie)} no ${rotuloRecipiente(p.recipiente)}.`;
      case 'medirVolume': return `Meça ${num(p.volumeMl)} mL de ${nomeEspecie(ctx, p.especie)} com ${rotuloDe(VIDRARIA, p.vidraria).toLowerCase()} e junte ao ${rotuloRecipiente(p.recipiente)}.`;
      case 'dissolver': return `Agite por ${num(p.tempoMin || 5)} min${p.agitacao === false ? '' : ', com agitação magnética,'} até não sobrar cristal.`;
      case 'agitar': return `Homogeneíze por ${num(p.tempoMin || 5)} min.`;
      case 'misturar': return `Misture por ${num(p.tempoMin || 5)} min (${humano(p.tecnica || 'agitação')}).`;
      case 'transferir': return `Transfira do ${rotuloRecipiente(p.origem)} para o ${rotuloRecipiente(p.destino)}${p.enxague ? ', marcando o enxágue' : ''}.`;
      case 'avolumar': return `Complete com ${nomeEspecie(ctx, p.solvente || 'H2O_l')} até ${num(p.volumeFinalMl)} mL.`;
      case 'completarMassa': return `Complete com ${nomeEspecie(ctx, p.especie)} até ${num(p.massaFinalG)} g.`;
      case 'aquecer': return `Aqueça em ${humano(p.fonte || 'chapa')} até ${num(p.alvoC)} °C por ${num(p.tempoMin)} min.`;
      case 'resfriar': return `Resfrie em ${p.banho === 'gelo' ? 'banho de gelo' : 'temperatura ambiente'} por ${num(p.tempoMin)} min.`;
      case 'calibrar': return `Calibre marcando ${juntar((p.tampoes || []).map((t) => rotuloDe(TAMPOES, t).toLowerCase()))}.`;
      case 'medirPH': return `Meça o pH da solução no ${rotuloRecipiente(p.recipiente)}.`;
      case 'ensaioCQ': return `Faça o ensaio de ${humano(p.teste)}${Array.isArray(p.faixa) ? ` e confira a faixa de ${num(p.faixa[0])} a ${num(p.faixa[1])}` : ''}.`;
      case 'titular': return `Titule com ${p.titulante ? nomeEspecie(ctx, p.titulante.especie) : 'o titulante'} até ${num(p.volumeMl)} mL${p.indicador ? `, com ${humano(p.indicador)}` : ''}.`;
      case 'esterilizar': return p.metodo === 'autoclave' ? `Esterilize em autoclave a ${num(p.tempC)} °C por ${num(p.tempoMin)} min.` : `Filtre em membrana de ${f2(p.membranaUm || 0.22)} µm.`;
      case 'encapsular': return `Encapsule ${num(p.quantidade)} cápsulas número ${p.capsula ? String(p.capsula).replace(/^n/, '') : ''}.`;
      case 'envasar': return `Envase ${num(p.volumeMl)} mL no ${rotuloRecipiente(p.frasco)}.`;
      case 'rotular': return `Preencha todos os campos do rótulo: ${juntar((p.camposObrigatorios || Object.keys(p.campos || {})).map((k) => (ROTULOS_CAMPO[k] || humano(k)).toLowerCase()))}.`;
      case 'descartar': return `Descarte o resto do ${rotuloRecipiente(p.recipiente)} no destino: ${rotuloDe(DESTINOS, p.destino).toLowerCase()}.`;
      default: return `Execute a operação ${humano(acao && acao.operacao ? acao.operacao : 'indicada')}.`;
    }
  }

  const COMPETENCIA_POR_OPERACAO = Object.freeze({
    paramentar: 'biosseguranca', tarar: 'pesagem', pesar: 'pesagem', completarMassa: 'pesagem',
    medirVolume: 'volumetria', dissolver: 'volumetria', agitar: 'volumetria', transferir: 'volumetria', avolumar: 'volumetria',
    misturar: 'farmacotecnica', aquecer: 'farmacotecnica', resfriar: 'farmacotecnica', encapsular: 'farmacotecnica', envasar: 'farmacotecnica',
    calibrar: 'cq', medirPH: 'cq', ensaioCQ: 'cq', titular: 'titulacao', esterilizar: 'esterilizacao', rotular: 'rotulagem', descartar: 'residuos'
  });

  /** Competência da etapa: a da missão, se houver; senão, a da última operação da etapa. */
  function competenciaDaEtapa(missao, etapa) {
    const explicita = missao && missao.etapas && missao.etapas[etapa.id];
    if (explicita) return explicita;
    const ops = [].concat(etapa.acao || []);
    const ultima = ops.length ? ops[ops.length - 1].operacao : null;
    return COMPETENCIA_POR_OPERACAO[ultima] || 'geral';
  }

  /** Um controle por alvo, na ordem em que aparece, com a primeira ação que o usa. */
  function controlesDoProcesso(processo, ctx) {
    const out = [];
    for (const e of processo.etapas || []) {
      for (const a of [].concat(e.acao || [])) {
        if (!a.alvoUI || out.some((x) => x.alvo === a.alvoUI)) continue;
        out.push({ alvo: a.alvoUI, acao: a, def: controle(a.alvoUI, ctx, a) });
      }
    }
    return out;
  }
  function alvosDoProcesso(processo) { return controlesDoProcesso(processo, null).map((x) => x.alvo); }

  const API = { CONTROLES, COMPETENCIA_POR_OPERACAO, controle, montarParametros, descreverAcao, rotuloRecipiente, competenciaDaEtapa, controlesDoProcesso, alvosDoProcesso };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabTutorControles = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
