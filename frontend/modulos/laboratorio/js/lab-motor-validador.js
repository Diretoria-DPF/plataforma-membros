/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — validador de processos do motor (O3). Roda no CI (frontend/scripts/lab-motor-processos.test.mjs).
 *
 * Além da forma (etapas, condições, cálculos, espécies), aplica a regra de conteúdo do dono (2026-11-05):
 *   - nivel_conteudo 'completo' (executável) só para medicamentos, excipientes, formas farmacêuticas,
 *     manipulação, produtos gerais e CQ;
 *   - espécie de agente de guerra química/biológica/radiológica ou droga ilícita ⇒ só 'educacional';
 *   - rota de síntese de opioide ou psicoestimulante de alto potencial de abuso ⇒ só 'educacional';
 *   - processo 'educacional' não pode ter etapa executável, quantidade, condição nem rendimento.
 * Vocabulário de restrição igual ao do seed da O2 (tools/lab/validar-seed.mjs; o CI confere), restrição e nível
 * de cada espécie lidos do seed (ctx.especies) e listas de nomes vetados da O2 aceitas em `nomesVetados`.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const O = emNode ? require('./lab-motor-operacoes.js') : raiz.LabMotorOperacoes;
  const Cd = emNode ? require('./lab-motor-condicoes.js') : raiz.LabMotorCondicoes;
  const B = emNode ? require('./lab-motor-op-base.js') : raiz.LabMotorOpBase;
  const Q = emNode ? require('./lab-motor-op-cq.js') : raiz.LabMotorOpCq;
  const LQ = emNode ? require('./lab-quimica.js') : raiz.LabQuimica;

  const CATEGORIAS = ['sintese', 'farmacotecnica', 'cq', 'basico'];
  const NIVEIS_CONTEUDO = ['completo', 'educacional'];
  const RESTRICOES = ['agente_guerra', 'ilicita', 'opioide_sintese', 'psicoestimulante_sintese', 'toxina_potente'];
  const RESTRICOES_ABSOLUTAS = ['agente_guerra', 'ilicita'];
  const UNIDADES = ['g', 'mg', 'mL', 'L', 'gotas', 'mmol', 'unidade'];
  const CONSEQUENCIAS = ['bloqueia_etapa', 'aguardar', 'aviso', 'nao_conforme'];

  // Nomes sem acento, em minúsculas. Absolutos: nenhum processo executável. Síntese: nenhuma rota executável.
  const NOMES_ABSOLUTOS = /\b(sarin|soman|tabun|ciclosarin|vx|novichok|iperita|mostarda (sulfurada|nitrogenada)|gas mostarda|lewisita|fosgenio|cloropicrina|agente (de guerra|nervoso)|ricina|abrina|antraz|anthracis|toxina botulinica|variola|polonio|cesio-137|bomba suja|metanfetamina|mdma|ecstasy|cocaina|crack|heroina|lsd|ghb|catinona|mefedrona|canabinoide sintetico)\b/;
  const NOMES_SINTESE_RESTRITA = /\b(fentanil|carfentanil|sufentanil|morfina|oxicodona|hidrocodona|metadona|petidina|buprenorfina|anfetamina|lisdexanfetamina|metilfenidato|cetamina)\b/;
  const MARCAS_PROIBIDAS_EM_TEXTO = /\[NV\]|rascunho|n[aã]o revisad|revisad[oa] por|gerad[oa] por (ia|intelig)/i;
  const TAG_HTML = /<\/?[a-z][^>]*>/i;

  function normalizar(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  const ehTexto = (v) => typeof v === 'string' && v.trim().length > 0;

  /** Espécies citadas em parâmetros (especie, solvente, titulante.especie, lavagem.especie, reacao). */
  function especiesDosParametros(p) {
    const ids = [];
    if (!p || typeof p !== 'object') return ids;
    for (const k of ['especie', 'solvente']) if (typeof p[k] === 'string') ids.push(p[k]);
    if (p.titulante && p.titulante.especie) ids.push(p.titulante.especie);
    if (p.lavagem && p.lavagem.especie) ids.push(p.lavagem.especie);
    const est = p.reacao && p.reacao.estequiometria;
    if (est) {
      (est.reagentes || []).forEach((r) => ids.push(r.id));
      if (est.produto) ids.push(est.produto.id);
      (est.coprodutos || []).forEach((r) => ids.push(r.id));
    }
    return ids;
  }

  const CHAVES_DESTINO = ['destino', 'destinoSolido', 'destinoFiltrado', 'destinoCristais', 'destinoAguasMae', 'destinoOrganica', 'frasco'];
  const CHAVES_ORIGEM = ['recipiente', 'origem'];

  function acoes(etapa) { return Array.isArray(etapa.acao) ? etapa.acao : (etapa.acao ? [etapa.acao] : []); }

  function textosPublicos(proc) {
    const t = [proc.titulo].concat(proc.objetivos || []);
    for (const e of proc.etapas || []) {
      t.push(e.titulo, e.oQueEstaAcontecendo, e.porQue);
      if (e.calculoPrevio) t.push(e.calculoPrevio.pergunta);
      (e.preCondicoes || []).concat(e.verificacoes || []).forEach((c) => t.push(c.mensagemSeFalhar));
      (e.errosComuns || []).forEach((x) => t.push(x.explicacao, x.correcao));
    }
    if (proc.ficha) Object.values(proc.ficha).forEach((v) => t.push(typeof v === 'string' ? v : ''));
    return t.filter((x) => typeof x === 'string');
  }

  function restricaoDe(id, opcoes) {
    const e = opcoes.especies && opcoes.especies[id];
    const extra = typeof opcoes.nivelDe === 'function' ? (opcoes.nivelDe(id) || {}) : {};
    return {
      restricao: extra.restricao || (e && e.restricao) || null,
      nivel: extra.nivel_conteudo || (e && e.nivel_conteudo) || null,
      nome: (e && e.nome) || extra.nome || id
    };
  }

  function validarCondicoes(lista, rotulo, erros, etapasAnteriores) {
    for (const c of lista || []) {
      Cd.validarCondicao(c).forEach((m) => erros.push(`${rotulo}: ${m}`));
      if (c && c.grandeza === 'etapaConcluida') {
        for (const v of [].concat(c.valor)) if (!etapasAnteriores.includes(v)) erros.push(`${rotulo}: etapaConcluida cita etapa inexistente ou posterior (${v})`);
      }
      if (c && c.consequencia !== undefined && !CONSEQUENCIAS.includes(c.consequencia)) erros.push(`${rotulo}: consequência inválida (${c.consequencia})`);
    }
  }

  function validarForma(proc, opcoes, erros) {
    if (!/^proc_[a-z0-9_]+$/.test(proc.id || '')) erros.push('id deve começar com proc_ e usar [a-z0-9_]');
    if (!Number.isInteger(proc.versao) || proc.versao < 1) erros.push('versao inteira ≥ 1');
    if (!ehTexto(proc.titulo)) erros.push('titulo obrigatório');
    if (!CATEGORIAS.includes(proc.categoria)) erros.push(`categoria inválida: ${proc.categoria}`);
    if (!Number.isInteger(proc.nivel) || proc.nivel < 0 || proc.nivel > 8) erros.push('nivel de 0 a 8');
    if (!NIVEIS_CONTEUDO.includes(proc.nivel_conteudo)) erros.push(`nivel_conteudo inválido: ${proc.nivel_conteudo}`);
    if (proc.restricao !== undefined && proc.restricao !== null && !RESTRICOES.includes(proc.restricao)) erros.push(`restricao inválida: ${proc.restricao}`);
    if (proc.revisado_por !== undefined && proc.revisado_por !== null && typeof proc.revisado_por !== 'string') erros.push('revisado_por deve ser texto (opcional)');
    if (!Array.isArray(proc.referencias) || !proc.referencias.length || proc.referencias.some((r) => !ehTexto(r && r.titulo))) erros.push('referencias com ao menos um título');
    for (const t of textosPublicos(proc)) {
      if (TAG_HTML.test(t)) erros.push(`texto com marcação HTML: "${t.slice(0, 40)}"`);
      if (MARCAS_PROIBIDAS_EM_TEXTO.test(t)) erros.push(`texto público com marca de bastidor: "${t.slice(0, 40)}"`);
    }
  }

  function validarExecutavel(proc, opcoes, erros) {
    const especies = opcoes.especies || {};
    const ops = O.OPERACOES;
    const recipientes = new Set();
    for (const r of proc.recipientes || []) {
      if (!ehTexto(r && r.id) || !(r.capMl > 0)) erros.push('recipiente com id e capMl');
      else if (recipientes.has(r.id)) erros.push(`recipiente duplicado: ${r.id}`);
      else recipientes.add(r.id);
    }
    const mat = proc.materiais || {};
    for (const m of mat.especies || []) {
      if (!especies[m.id]) erros.push(`material com espécie desconhecida: ${m.id}`);
      if (m.quantidade && (!(m.quantidade.valor > 0) || !UNIDADES.includes(m.quantidade.unidade))) erros.push(`quantidade inválida de ${m.id}`);
    }
    const seg = proc.seguranca || {};
    for (const x of seg.epi || []) if (!B.EPI_VALIDOS.includes(x)) erros.push(`EPI desconhecido: ${x}`);
    for (const r of seg.residuos || []) if (!Object.prototype.hasOwnProperty.call(Q.DESTINOS, r.destino)) erros.push(`destino de resíduo desconhecido: ${r.destino}`);
    if (!Array.isArray(proc.etapas) || !proc.etapas.length) { erros.push('processo completo precisa de etapas'); return; }
    const vistas = [];
    for (const e of proc.etapas) {
      const rot = `etapa ${e && e.id}`;
      if (!ehTexto(e && e.id)) { erros.push('etapa sem id'); continue; }
      if (vistas.includes(e.id)) erros.push(`${rot}: id duplicado`);
      for (const k of ['titulo', 'oQueEstaAcontecendo', 'porQue']) if (!ehTexto(e[k])) erros.push(`${rot}: ${k} obrigatório`);
      const lista = acoes(e);
      if (!lista.length) erros.push(`${rot}: sem ação`);
      for (const a of lista) {
        if (!a || !Object.prototype.hasOwnProperty.call(ops, a.operacao)) { erros.push(`${rot}: operação desconhecida ${a && a.operacao}`); continue; }
        const p = a.parametros || {};
        for (const k of CHAVES_ORIGEM) if (typeof p[k] === 'string' && !recipientes.has(p[k])) erros.push(`${rot}: recipiente ${p[k]} não declarado nem criado antes`);
        for (const k of CHAVES_DESTINO) if (typeof p[k] === 'string') recipientes.add(p[k]);
        for (const id of especiesDosParametros(p)) if (!especies[id]) erros.push(`${rot}: espécie desconhecida ${id}`);
        if (p.reacao && typeof p.reacao.equacao === 'string' && LQ.equacaoBalanceada(p.reacao.equacao) === false) erros.push(`${rot}: equação não balanceada (${p.reacao.equacao})`);
      }
      validarCondicoes(e.preCondicoes, `${rot} pré-condição`, erros, vistas);
      validarCondicoes(e.verificacoes, `${rot} verificação`, erros, vistas.concat([e.id]));
      for (const ec of e.errosComuns || []) {
        validarCondicoes([ec.gatilho], `${rot} erro comum`, erros, vistas.concat([e.id]));
        for (const k of ['consequencia', 'explicacao', 'correcao']) if (!ehTexto(ec[k])) erros.push(`${rot}: erro comum sem ${k}`);
        if (ec.gravidade !== undefined && !['aviso', 'nao_conforme', 'incidente'].includes(ec.gravidade)) erros.push(`${rot}: gravidade inválida`);
      }
      const c = e.calculoPrevio;
      if (c && (!ehTexto(c.pergunta) || !ehTexto(c.formula) || !Number.isFinite(c.resposta) || !(c.tolerancia >= 0) || !ehTexto(c.unidade))) erros.push(`${rot}: cálculo prévio incompleto`);
      vistas.push(e.id);
    }
    validarCondicoes((proc.resultadoEsperado && proc.resultadoEsperado.criterios) || [], 'resultado esperado', erros, vistas);
  }

  /** Trava de conteúdo. Devolve lista de erros. */
  function validarConteudo(proc, opcoes) {
    const erros = [];
    const ids = new Set(((proc.materiais && proc.materiais.especies) || []).map((m) => m.id));
    for (const e of proc.etapas || []) for (const a of acoes(e)) especiesDosParametros(a.parametros).forEach((x) => ids.add(x));
    const completo = proc.nivel_conteudo === 'completo';
    const sintese = proc.categoria === 'sintese';
    const nomes = [normalizar(proc.titulo)];
    const brutos = [String(proc.titulo || '')];
    // Listas de nomes vetados extras (ex.: NOMES_GUERRA e NOMES_ILICITAS de tools/lab/validar-seed.mjs, a fonte da O2).
    const vetadosExtras = Array.isArray(opcoes.nomesVetados) ? opcoes.nomesVetados.filter((r) => r instanceof RegExp) : [];
    if (completo && proc.restricao) erros.push(`processo completo com restrição declarada (${proc.restricao})`);
    for (const id of ids) {
      const r = restricaoDe(id, opcoes);
      nomes.push(normalizar(r.nome), normalizar(id));
      brutos.push(String(r.nome), String(id));
      if (!completo) continue;
      if (r.restricao && RESTRICOES_ABSOLUTAS.includes(r.restricao)) erros.push(`processo completo com espécie restrita (${id}: ${r.restricao})`);
      else if (r.restricao && sintese) erros.push(`rota de síntese completa com espécie restrita (${id}: ${r.restricao})`);
      if (sintese && r.nivel === 'educacional') erros.push(`rota de síntese completa para espécie de nível educacional (${id})`);
    }
    if (completo) {
      const todos = nomes.join(' | ');
      const todosBrutos = brutos.join(' | ');
      const extra = vetadosExtras.some((r) => { r.lastIndex = 0; return r.test(todosBrutos) || r.test(todos); });
      if (NOMES_ABSOLUTOS.test(todos) || extra) erros.push('processo completo cita agente de guerra, agente biológico ou radiológico ou droga ilícita');
      if (sintese && NOMES_SINTESE_RESTRITA.test(todos)) erros.push('rota de síntese completa de opioide ou psicoestimulante controlado');
    } else {
      if ((proc.etapas || []).some((e) => acoes(e).length || e.calculoPrevio)) erros.push('processo educacional não pode ter etapas executáveis');
      if (((proc.materiais && proc.materiais.especies) || []).some((m) => m.quantidade)) erros.push('processo educacional não pode ter quantidades');
      if (proc.resultadoEsperado) erros.push('processo educacional não pode ter rendimento nem resultado esperado');
      if (proc.recipientes && proc.recipientes.length) erros.push('processo educacional não pode ter recipientes');
    }
    return erros;
  }

  /** validarProcesso(proc, { especies, nivelDe? }) → { ok, erros } */
  function validarProcesso(proc, opcoes) {
    const o = opcoes || {};
    const erros = [];
    if (!proc || typeof proc !== 'object') return { ok: false, erros: ['processo ausente'] };
    validarForma(proc, o, erros);
    if (proc.nivel_conteudo === 'completo') validarExecutavel(proc, o, erros);
    validarConteudo(proc, o).forEach((m) => erros.push(m));
    return { ok: erros.length === 0, erros };
  }

  const API = { CATEGORIAS, NIVEIS_CONTEUDO, RESTRICOES, RESTRICOES_ABSOLUTAS, validarProcesso, validarConteudo, normalizar };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorValidador = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
