/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — estado do motor de processos (O3). Funções puras, sem DOM.
 *
 * O estado é um objeto congelado e serializável. Toda mudança devolve um estado novo
 * (os ramos que não mudam são compartilhados). Quantidades em MILIMOL (mmol), como no
 * lab-quimica.js; massas em g; volumes em mL; temperatura em °C; tempo em s simulados.
 * O gerador pseudoaleatório (mulberry32) vive no estado: a mesma semente e a mesma
 * sequência de ações dão sempre o mesmo resultado.
 */
(function (raiz) {
  'use strict';

  const VERSAO = 2;
  const EPS = 1e-9;
  const TEMP_AMBIENTE_PADRAO = 25;
  const MASSA_VIDRO_PADRAO_G = { bequer: 100, erlenmeyer: 80, balao_volumetrico: 60, frasco: 40, funil_separacao: 150, filtro: 5, tubo: 10 };
  const PARCELAS_BALANCO = ['entradas_g', 'perdas_g', 'evaporado_g', 'descartado_g', 'amostras_g', 'reacao_g'];

  function congelar(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.values(o).forEach(congelar);
      Object.freeze(o);
    }
    return o;
  }

  // ---------------------------------------------------------------------------
  // Gerador pseudoaleatório (mulberry32): estado inteiro de 32 bits dentro do estado.
  // ---------------------------------------------------------------------------
  function proximoAleatorio(s) {
    const t = (s + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return { valor: ((r ^ (r >>> 14)) >>> 0) / 4294967296, s: t };
  }

  /** Sorteia em [0, 1). Devolve { valor, estado } sem alterar o estado recebido. */
  function sortear(estado) {
    const r = proximoAleatorio(estado.rng);
    return { valor: r.valor, estado: congelar({ ...estado, rng: r.s }) };
  }

  /** Normal(media, desvio) por Box-Muller (duas sorteadas). */
  function sortearNormal(estado, media, desvio) {
    const a = sortear(estado);
    const b = sortear(a.estado);
    const u1 = Math.max(a.valor, 1e-12);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * b.valor);
    return { valor: media + desvio * z, estado: b.estado };
  }

  // ---------------------------------------------------------------------------
  // Criação
  // ---------------------------------------------------------------------------
  function criarRecipiente(def, tempC) {
    if (!def || typeof def.id !== 'string' || !def.id) throw new Error('recipiente sem id');
    if (!(Number(def.capMl) > 0)) throw new Error(`recipiente ${def.id}: capMl inválido`);
    const tipo = def.tipo || 'bequer';
    return {
      id: def.id, tipo, capMl: Number(def.capMl),
      massaVazio_g: Number.isFinite(def.massaVazio_g) ? def.massaVazio_g : (MASSA_VIDRO_PADRAO_G[tipo] || 50),
      tempC, aberto: def.aberto !== false, condensador: !!def.condensador,
      liquido: {}, organica: {}, solido: {},
      esteril: false, rotulo: null
    };
  }

  /**
   * criarEstado({ semente, tempAmbienteC, recipientes: [{ id, tipo, capMl, massaVazio_g? }] })
   */
  function criarEstado(opcoes) {
    const o = opcoes || {};
    if (!Number.isInteger(o.semente)) throw new Error('semente inteira obrigatória');
    const tempC = Number.isFinite(o.tempAmbienteC) ? o.tempAmbienteC : TEMP_AMBIENTE_PADRAO;
    const recipientes = {};
    for (const def of o.recipientes || []) {
      const r = criarRecipiente(def, tempC);
      if (recipientes[r.id]) throw new Error(`recipiente duplicado: ${r.id}`);
      recipientes[r.id] = r;
    }
    const balanco = {};
    PARCELAS_BALANCO.forEach((p) => { balanco[p] = 0; });
    return congelar({
      versao: VERSAO, semente: o.semente, rng: o.semente >>> 0, t: 0,
      ambiente: { tempC, capelaLigada: false, epi: [] },
      recipientes,
      equipamentos: { balanca: { recipiente: null, tara_g: 0 }, phmetroCalibrado: false },
      balanco,
      residuos: []
    });
  }

  // ---------------------------------------------------------------------------
  // Atualização imutável
  // ---------------------------------------------------------------------------
  function com(estado, patch) { return congelar({ ...estado, ...patch }); }

  function comRecipiente(estado, id, fn) {
    const atual = estado.recipientes[id];
    if (!atual) throw new Error(`recipiente inexistente: ${id}`);
    const novo = fn(atual);
    return congelar({ ...estado, recipientes: { ...estado.recipientes, [id]: congelar(novo) } });
  }

  function comNovoRecipiente(estado, def) {
    if (estado.recipientes[def.id]) throw new Error(`recipiente duplicado: ${def.id}`);
    const r = criarRecipiente(def, estado.ambiente.tempC);
    return congelar({ ...estado, recipientes: { ...estado.recipientes, [r.id]: r } });
  }

  function comBalanco(estado, delta) {
    const b = { ...estado.balanco };
    for (const k of Object.keys(delta)) {
      if (!PARCELAS_BALANCO.includes(k)) throw new Error(`parcela de balanço desconhecida: ${k}`);
      b[k] += delta[k];
    }
    return congelar({ ...estado, balanco: b });
  }

  /** Soma `delta` mmol de `id` num conteúdo { id: mmol }. Recusa resultado negativo. */
  function somarEspecie(conteudo, id, delta) {
    const novo = (conteudo[id] || 0) + delta;
    if (novo < -EPS) throw new Error(`quantidade negativa de ${id}`);
    const c = { ...conteudo };
    if (novo <= EPS) delete c[id]; else c[id] = novo;
    return Object.freeze(c);
  }

  function somarConteudos(a, b) {
    let c = { ...a };
    for (const id of Object.keys(b)) c = somarEspecie(c, id, b[id]);
    return Object.freeze(c);
  }

  function escalarConteudo(c, fator) {
    const out = {};
    for (const id of Object.keys(c)) if (c[id] * fator > EPS) out[id] = c[id] * fator;
    return Object.freeze(out);
  }

  // ---------------------------------------------------------------------------
  // Massas e volumes
  // ---------------------------------------------------------------------------
  /** Dados da espécie; "X__degradado" herda a massa molar de X. */
  function info(especies, id) {
    if (especies[id]) return especies[id];
    const m = /^(.+)__degradado$/.exec(id);
    if (m && especies[m[1]]) return { ...especies[m[1]], nome: `produto de degradação (${especies[m[1]].nome})`, fase: 'solido', solubilidade: undefined, termolabil: false };
    throw new Error(`espécie desconhecida: ${id}`);
  }

  function mmolDeMassa(esp, g) {
    if (!esp || !(esp.mm > 0)) throw new Error('massa molar ausente');
    return (g * 1000) / esp.mm;
  }
  function massaDeMmol(esp, mmol) {
    if (!esp || !(esp.mm > 0)) throw new Error('massa molar ausente');
    return (mmol * esp.mm) / 1000;
  }

  function massaConteudo(c, especies) {
    let g = 0;
    for (const id of Object.keys(c)) g += massaDeMmol(info(especies, id), c[id]);
    return g;
  }

  function massaRecipiente(rec, especies) {
    return massaConteudo(rec.liquido, especies) + massaConteudo(rec.organica, especies) + massaConteudo(rec.solido, especies);
  }

  function massaTotal(estado, especies) {
    let g = 0;
    for (const id of Object.keys(estado.recipientes)) g += massaRecipiente(estado.recipientes[id], especies);
    return g;
  }

  /**
   * Volume (mL) de uma fase líquida: soma dos líquidos com densidade. O soluto dissolvido não soma volume
   * (aproximação didática), salvo se a espécie declarar `volumeEspecificoMLg` (mL por g dissolvido; O5):
   * soluções concentradas, como xarope, não fecham o volume sem isso.
   */
  function volumeFaseMl(c, especies) {
    let v = 0;
    for (const id of Object.keys(c)) {
      const e = info(especies, id);
      if (e.fase === 'liquido' && e.densidade > 0) v += massaDeMmol(e, c[id]) / e.densidade;
      else if (e.volumeEspecificoMLg > 0) v += massaDeMmol(e, c[id]) * e.volumeEspecificoMLg;
    }
    return v;
  }
  function volumeLiquidoMl(rec, especies) { return volumeFaseMl(rec.liquido, especies) + volumeFaseMl(rec.organica, especies); }

  /** Massa da espécie (g) somando todas as fases de um recipiente. */
  function massaEspecie(rec, id, especies) {
    const n = (rec.liquido[id] || 0) + (rec.organica[id] || 0) + (rec.solido[id] || 0);
    return n ? massaDeMmol(info(especies, id), n) : 0;
  }

  // ---------------------------------------------------------------------------
  // Serialização
  // ---------------------------------------------------------------------------
  function serializar(estado) { return JSON.stringify(estado); }

  function desserializar(texto) {
    let o;
    try { o = JSON.parse(texto); } catch (_) { throw new Error('estado inválido (JSON)'); }
    if (!o || typeof o !== 'object') throw new Error('estado inválido');
    if (o.versao !== VERSAO) throw new Error(`versão de estado não suportada: ${o.versao}`);
    return congelar(o);
  }

  const API = {
    VERSAO, EPS, PARCELAS_BALANCO, congelar,
    sortear, sortearNormal, criarEstado, criarRecipiente,
    com, comRecipiente, comNovoRecipiente, comBalanco,
    somarEspecie, somarConteudos, escalarConteudo,
    info, mmolDeMassa, massaDeMmol, massaConteudo, massaRecipiente, massaTotal, massaEspecie,
    volumeFaseMl, volumeLiquidoMl, serializar, desserializar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorEstado = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
