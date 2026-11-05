/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — controles da bancada do motor (O4). Funções puras, sem DOM.
 *
 * Cada `alvoUI` de uma ação de processo corresponde a um controle: rótulo, botão, campos que a pessoa preenche e
 * a conversão desses campos em parâmetros da operação. Também descreve cada ação em texto (degrau "resposta" da
 * dica). Texto determinístico, montado só dos dados do processo e das espécies.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const Ca = emNode ? require('./lab-motor-calculos.js') : raiz.LabMotorCalculos;

  const EPI = [['jaleco', 'Jaleco'], ['luvas_nitrila', 'Luvas nitrílicas'], ['oculos', 'Óculos de proteção'], ['touca', 'Touca'], ['mascara', 'Máscara']];
  const TAMPOES = [['4', 'Tampão pH 4'], ['7', 'Tampão pH 7'], ['10', 'Tampão pH 10']];
  const VIDRARIA = [['proveta', 'Proveta'], ['pipeta', 'Pipeta'], ['bequer', 'Béquer']];
  const DESTINOS = [
    ['pia', 'Pia, com água corrente'], ['neutralizar_e_pia', 'Neutralizar e depois pia'],
    ['organico_nao_halogenado', 'Resíduo orgânico não halogenado'], ['organico_halogenado', 'Resíduo orgânico halogenado'],
    ['metal_pesado', 'Resíduo de metal pesado'], ['solido_quimico', 'Resíduo sólido químico']
  ];
  const CAMPOS_ROTULO = [['produto', 'Produto'], ['concentracao', 'Concentração'], ['lote', 'Lote'], ['fabricacao', 'Fabricação'], ['validade', 'Validade'], ['responsavel', 'Responsável']];

  const CONTROLES = Object.freeze({
    painelSeguranca: { grupo: 'Segurança', rotulo: 'Painel de segurança (EPI)', botao: 'Vestir o EPI marcado', campos: [{ id: 'epi', tipo: 'marcas', rotulo: 'EPI', opcoes: EPI }] },
    balancaTara: { grupo: 'Balança', rotulo: 'Balança: botão Tara', botao: 'Tara', campos: [] },
    btnAgitar: {
      grupo: 'Bancada', rotulo: 'Agitar', botao: 'Agitar',
      campos: [{ id: 'tempoMin', tipo: 'numero', rotulo: 'Tempo (min)', padraoDe: 'tempoMin' }, { id: 'agitacao', tipo: 'marca', rotulo: 'Agitação magnética', padrao: true }]
    },
    btnTransferir: { grupo: 'Bancada', rotulo: 'Transferir para o balão', botao: 'Transferir', campos: [{ id: 'enxague', tipo: 'marca', rotulo: 'Enxaguar o béquer e o funil e juntar ao balão', padrao: false }] },
    btnAvolumar: { grupo: 'Bancada', rotulo: 'Completar o volume', botao: 'Completar o volume', campos: [{ id: 'volumeFinalMl', tipo: 'numero', rotulo: 'Completar até (mL)' }] },
    phmetroCalibrar: { grupo: 'pHmetro', rotulo: 'pHmetro: calibrar', botao: 'Calibrar', campos: [{ id: 'tampoes', tipo: 'marcas', rotulo: 'Tampões', opcoes: TAMPOES }] },
    phmetro: { grupo: 'pHmetro', rotulo: 'pHmetro: medir', botao: 'Medir o pH', campos: [] },
    btnEnvasar: { grupo: 'Envase', rotulo: 'Envasar', botao: 'Envasar no frasco', campos: [] },
    painelRotulo: { grupo: 'Envase', rotulo: 'Rótulo do frasco', botao: 'Colar o rótulo', campos: CAMPOS_ROTULO.map(([id, r]) => ({ id, tipo: 'texto', rotulo: r })) },
    painelDescarte: { grupo: 'Resíduos', rotulo: 'Descarte', botao: 'Descartar', campos: [{ id: 'destino', tipo: 'opcao', rotulo: 'Destino', opcoes: DESTINOS, vazio: 'Escolha o destino' }] }
  });

  function nomeEspecie(ctx, id) { const e = ctx && ctx.especies && ctx.especies[id]; return e && e.nome ? e.nome.toLowerCase() : id; }

  /** Definição do controle do alvo; `reagente:<id>` vira pesagem (sólido) ou medida de volume (líquido). */
  function controle(alvo, ctx) {
    if (typeof alvo !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(CONTROLES, alvo)) return CONTROLES[alvo];
    if (alvo.indexOf('reagente:') !== 0) return null;
    const id = alvo.slice(9);
    const e = ctx && ctx.especies && ctx.especies[id];
    if (!e) return null;
    const nome = e.nome || id;
    if (e.fase === 'liquido') {
      return { grupo: 'Reagentes', rotulo: `Reagente: ${nome}`, botao: `Medir e juntar ${nome.toLowerCase()}`, campos: [{ id: 'volumeMl', tipo: 'numero', rotulo: 'Volume (mL)' }, { id: 'vidraria', tipo: 'opcao', rotulo: 'Medir com', opcoes: VIDRARIA, padrao: 'proveta' }] };
    }
    return { grupo: 'Reagentes', rotulo: `Reagente: ${nome}`, botao: `Pesar ${nome.toLowerCase()}`, campos: [{ id: 'massaG', tipo: 'numero', rotulo: 'Massa (g)' }] };
  }

  function numero(valores, id, rotulo, min, max) {
    const v = Ca.lerNumero(valores && valores[id]);
    if (v === null) return { erro: `Preencha ${rotulo} com um número.` };
    if (v < min || v > max) return { erro: `${rotulo}: use um valor entre ${Ca.formatarNumero(min, 2)} e ${Ca.formatarNumero(max, 0)}.` };
    return { v };
  }
  function lista(valores, id, opcoes) {
    const bruto = Array.isArray(valores && valores[id]) ? valores[id] : [];
    const validos = opcoes.map((o) => o[0]);
    return bruto.filter((x) => validos.includes(x));
  }
  function opcao(valores, id, opcoes) {
    const v = valores && typeof valores[id] === 'string' ? valores[id] : '';
    return opcoes.some((o) => o[0] === v) ? v : null;
  }

  /** Converte os campos do controle em parâmetros da operação: { ok, parametros } ou { ok: false, mensagem }. */
  function montarParametros(alvo, valores, ctx) {
    const def = controle(alvo, ctx);
    if (!def) return { ok: false, mensagem: 'Controle desconhecido.' };
    const falha = (mensagem) => ({ ok: false, mensagem });
    if (alvo.indexOf('reagente:') === 0) {
      if (def.campos[0].id === 'massaG') {
        const m = numero(valores, 'massaG', 'Massa (g)', 0.01, 5000);
        return m.erro ? falha(m.erro) : { ok: true, parametros: { massaG: m.v } };
      }
      const v = numero(valores, 'volumeMl', 'Volume (mL)', 0.01, 5000);
      if (v.erro) return falha(v.erro);
      return { ok: true, parametros: { volumeMl: v.v, vidraria: opcao(valores, 'vidraria', VIDRARIA) || 'proveta' } };
    }
    switch (alvo) {
      case 'painelSeguranca': return { ok: true, parametros: { epi: lista(valores, 'epi', EPI) } };
      case 'btnAgitar': {
        const t = numero(valores, 'tempoMin', 'Tempo (min)', 0.1, 120);
        return t.erro ? falha(t.erro) : { ok: true, parametros: { tempoMin: t.v, agitacao: !(valores && valores.agitacao === false) } };
      }
      case 'btnTransferir': return { ok: true, parametros: { enxague: !!(valores && valores.enxague === true) } };
      case 'btnAvolumar': {
        const v = numero(valores, 'volumeFinalMl', 'Completar até (mL)', 1, 5000);
        return v.erro ? falha(v.erro) : { ok: true, parametros: { volumeFinalMl: v.v } };
      }
      case 'phmetroCalibrar': return { ok: true, parametros: { tampoes: lista(valores, 'tampoes', TAMPOES).map(Number) } };
      case 'painelRotulo': {
        const campos = {};
        for (const [id] of CAMPOS_ROTULO) campos[id] = valores && typeof valores[id] === 'string' ? valores[id].slice(0, 120) : '';
        return { ok: true, parametros: { campos } };
      }
      case 'painelDescarte': {
        const d = opcao(valores, 'destino', DESTINOS);
        return d ? { ok: true, parametros: { destino: d } } : falha('Escolha o destino do descarte.');
      }
      default: return { ok: true, parametros: {} };
    }
  }

  const TIPO_RECIPIENTE = { bequer: 'béquer', balao: 'balão volumétrico', frasco: 'frasco' };
  /** 'bequer_100' → 'béquer de 100 mL'. */
  function rotuloRecipiente(id) {
    const m = /^([a-z]+)_(\d+)$/.exec(String(id || ''));
    if (!m) return String(id || 'recipiente');
    return `${TIPO_RECIPIENTE[m[1]] || m[1]} de ${m[2]} mL`;
  }
  function rotuloDe(opcoes, v) { const o = opcoes.find((x) => x[0] === String(v)); return o ? o[1] : String(v); }
  function juntar(itens) { return itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`; }
  const f2 = (v) => Ca.formatarNumero(v, 2);
  const f0 = (v) => Ca.formatarNumero(v, 0);

  /** Frase com o que fazer exatamente na ação (valores do processo). */
  function descreverAcao(acao, ctx) {
    const p = (acao && acao.parametros) || {};
    switch (acao && acao.operacao) {
      case 'paramentar': return `Marque e vista: ${juntar((p.epi || []).map((x) => rotuloDe(EPI, x).toLowerCase()))}.`;
      case 'tarar': return `Com o ${rotuloRecipiente(p.recipiente)} vazio no prato, toque em Tara: a balança passa a mostrar 0,00 g.`;
      case 'pesar': return `Pese ${f2(p.massaG)} g de ${nomeEspecie(ctx, p.especie)} no ${rotuloRecipiente(p.recipiente)}.`;
      case 'medirVolume': return `Meça ${f0(p.volumeMl)} mL de ${nomeEspecie(ctx, p.especie)} com ${rotuloDe(VIDRARIA, p.vidraria).toLowerCase()} e junte ao ${rotuloRecipiente(p.recipiente)}.`;
      case 'dissolver': return `Agite por ${f0(p.tempoMin || 5)} min${p.agitacao === false ? '' : ', com agitação magnética,'} até não sobrar cristal.`;
      case 'agitar': return `Homogeneíze por ${f0(p.tempoMin || 5)} min.`;
      case 'transferir': return `Transfira do ${rotuloRecipiente(p.origem)} para o ${rotuloRecipiente(p.destino)}${p.enxague ? ', marcando o enxágue do béquer e do funil' : ''}.`;
      case 'avolumar': return `Complete com ${nomeEspecie(ctx, p.solvente || 'H2O_l')} até ${f0(p.volumeFinalMl)} mL.`;
      case 'calibrar': return `Calibre marcando ${juntar((p.tampoes || []).map((t) => rotuloDe(TAMPOES, t).toLowerCase()))}.`;
      case 'medirPH': return `Meça o pH da solução no ${rotuloRecipiente(p.recipiente)}.`;
      case 'envasar': return `Envase ${f0(p.volumeMl)} mL no ${rotuloRecipiente(p.frasco)}.`;
      case 'rotular': return `Preencha todos os campos do rótulo: ${juntar(Object.keys(p.campos || {}).map((k) => rotuloDe(CAMPOS_ROTULO, k).toLowerCase()))}.`;
      case 'descartar': return `Descarte o resto do ${rotuloRecipiente(p.recipiente)} no destino: ${rotuloDe(DESTINOS, p.destino).toLowerCase()}.`;
      default: return `Execute a operação ${acao && acao.operacao ? acao.operacao : 'indicada'}.`;
    }
  }

  /** Alvos do processo na ordem em que aparecem (sem repetir). */
  function alvosDoProcesso(processo) {
    const out = [];
    for (const e of processo.etapas || []) for (const a of [].concat(e.acao || [])) if (a.alvoUI && !out.includes(a.alvoUI)) out.push(a.alvoUI);
    return out;
  }

  const API = { CONTROLES, controle, montarParametros, descreverAcao, rotuloRecipiente, alvosDoProcesso };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabTutorControles = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
