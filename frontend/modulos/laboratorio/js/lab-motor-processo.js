/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — executor de processos descritos em JSON (O3). Funções puras, sem DOM.
 *
 * Cada etapa: titulo, oQueEstaAcontecendo, porQue, preCondicoes[], acao {operacao, parametros} (ou lista),
 * calculoPrevio?, verificacoes[], errosComuns[]. A sessão é imutável: cada chamada devolve uma sessão nova.
 *
 * Ordem ao executar uma etapa:
 *   1. pré-condições (falhou → 'bloqueada', nada muda);
 *   2. cálculo prévio (confere a resposta, mostra a conta; não bloqueia);
 *   3. ação (operações unitárias; parâmetro inválido → 'erro', nada muda);
 *   4. erros comuns (gatilhos sobre o resultado ou os parâmetros → desvio explicado com correção);
 *   5. verificações (bloqueia_etapa → desfaz; aguardar → mantém e espera; aviso/não conforme → registra e segue).
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const O = emNode ? require('./lab-motor-operacoes.js') : raiz.LabMotorOperacoes;
  const K = emNode ? require('./lab-motor-caderno.js') : raiz.LabMotorCaderno;
  const Cd = emNode ? require('./lab-motor-condicoes.js') : raiz.LabMotorCondicoes;
  const Ca = emNode ? require('./lab-motor-calculos.js') : raiz.LabMotorCalculos;

  const MAX_HISTORICO = 60;
  const CONSEQUENCIAS_FORTES = ['bloqueia_etapa', 'aguardar'];

  function congelar(o) { return E.congelar(o); }

  function iniciarSessao(processo, ctx, opcoes) {
    const o = opcoes || {};
    if (!processo || processo.nivel_conteudo !== 'completo') throw new Error('processo de nível educacional não é executável');
    if (!Array.isArray(processo.etapas) || !processo.etapas.length) throw new Error('processo sem etapas executáveis');
    const estado = E.criarEstado({ semente: Number.isInteger(o.semente) ? o.semente : 1, recipientes: processo.recipientes || [] });
    const caderno = K.criarCaderno({ titulo: `Caderno: ${processo.titulo}`, processoId: processo.id });
    return congelar({ processoId: processo.id, indice: 0, concluidas: [], puladas: [], tentativas: {}, estado, caderno, historico: [], terminado: false });
  }

  function etapaAtual(sessao, processo) { return sessao.terminado ? null : processo.etapas[sessao.indice]; }

  function mesclarParametros(base, extra) {
    if (!extra) return base || {};
    return Object.assign({}, base || {}, extra);
  }

  function acoesDaEtapa(etapa, override) {
    const lista = Array.isArray(etapa.acao) ? etapa.acao : (etapa.acao ? [etapa.acao] : []);
    const ov = Array.isArray(override) ? override : null;
    return lista.map((a, i) => ({ operacao: a.operacao, parametros: mesclarParametros(a.parametros, ov ? ov[i] : (i === lista.length - 1 ? override : null)) }));
  }

  function contexto(estado, ctx, sessao, parametros, eventos) { return { estado, especies: ctx.especies, sessao, parametros, eventos }; }

  function mensagem(cond, padrao) { return cond.mensagemSeFalhar || padrao; }

  function registrarEtapaInicio(cad, sessao, etapa) {
    if (sessao.tentativas[etapa.id]) return cad;
    return K.registrar(cad, { tipo: 'etapa', t: sessao.estado.t, etapa: etapa.id, texto: `${etapa.titulo}. ${etapa.oQueEstaAcontecendo}` });
  }

  /**
   * executarEtapa(sessao, processo, ctx, { parametros?, resposta? })
   * → { sessao, resultado: { status, etapa, mensagens[], eventos[], calculo? } }
   * status: 'concluida' | 'bloqueada' | 'aguardar' | 'erro' | 'terminado'
   */
  function executarEtapa(sessao, processo, ctx, entrada) {
    const etapa = etapaAtual(sessao, processo);
    if (!etapa) return { sessao, resultado: { status: 'terminado', etapa: null, mensagens: ['Processo concluído.'], eventos: [] } };
    const en = entrada || {};
    const t0 = sessao.estado.t;
    let cad = registrarEtapaInicio(sessao.caderno, sessao, etapa);
    const tentativas = { ...sessao.tentativas, [etapa.id]: (sessao.tentativas[etapa.id] || 0) + 1 };
    const mensagens = [];

    // 1. Pré-condições
    const ctxAntes = contexto(sessao.estado, ctx, sessao, {}, []);
    const falhas = (etapa.preCondicoes || []).filter((c) => !Cd.avaliar(c, ctxAntes));
    if (falhas.length) {
      for (const c of falhas) {
        const m = mensagem(c, `Antes desta etapa: ${c.grandeza} ${c.op} ${JSON.stringify(c.valor)}.`);
        mensagens.push(m);
        cad = K.registrar(cad, { tipo: 'bloqueio', t: t0, etapa: etapa.id, texto: m });
      }
      return { sessao: congelar({ ...sessao, caderno: cad, tentativas }), resultado: { status: 'bloqueada', etapa: etapa.id, mensagens, eventos: [] } };
    }

    // 2. Cálculo prévio
    let calculo;
    if (etapa.calculoPrevio) {
      calculo = Ca.conferirResposta(etapa.calculoPrevio, en.resposta);
      cad = K.registrar(cad, { tipo: 'calculo', t: t0, etapa: etapa.id, texto: `${etapa.calculoPrevio.pergunta} ${calculo.texto}`, ok: calculo.respondida ? calculo.ok : undefined });
      mensagens.push(calculo.texto);
    }

    // 3. Ação
    const acoes = acoesDaEtapa(etapa, en.parametros);
    let estado = sessao.estado;
    let eventos = [];
    try {
      for (const a of acoes) {
        const r = O.executar(estado, a.operacao, a.parametros, ctx);
        estado = r.estado;
        eventos = eventos.concat(r.eventos);
      }
    } catch (err) {
      const m = `Não foi possível executar: ${err.message}.`;
      cad = K.registrar(cad, { tipo: 'bloqueio', t: t0, etapa: etapa.id, texto: m });
      return { sessao: congelar({ ...sessao, caderno: cad, tentativas }), resultado: { status: 'erro', etapa: etapa.id, mensagens: mensagens.concat([m]), eventos: [], calculo } };
    }
    cad = K.registrarEventos(cad, eventos, { t: estado.t, etapa: etapa.id });
    const parametros = acoes.length ? acoes[acoes.length - 1].parametros : {};
    const ctxDepois = contexto(estado, ctx, sessao, parametros, eventos);
    const ctxPre = contexto(sessao.estado, ctx, sessao, parametros, eventos);

    // 4. Erros comuns (explicação + consequência + correção)
    for (const ec of etapa.errosComuns || []) {
      if (!Cd.avaliar(ec.gatilho, ec.gatilho.momento === 'antes' ? ctxPre : ctxDepois)) continue;
      const m = `${ec.explicacao} Como fazer certo: ${ec.correcao}`;
      mensagens.push(m);
      cad = K.registrar(cad, { tipo: 'desvio', t: estado.t, etapa: etapa.id, texto: m, desvio: { codigo: ec.consequencia, gravidade: ec.gravidade || 'aviso' } });
    }

    // 5. Verificações
    let status = 'concluida';
    for (const v of etapa.verificacoes || []) {
      if (Cd.avaliar(v, v.momento === 'antes' ? ctxPre : ctxDepois)) continue;
      const m = mensagem(v, 'Verificação não atendida.');
      mensagens.push(m);
      const cons = v.consequencia || 'aviso';
      if (cons === 'bloqueia_etapa') status = 'bloqueada';
      else if (cons === 'aguardar' && status !== 'bloqueada') status = 'aguardar';
      const tipo = CONSEQUENCIAS_FORTES.includes(cons) ? 'bloqueio' : 'desvio';
      cad = K.registrar(cad, { tipo, t: estado.t, etapa: etapa.id, texto: m, desvio: tipo === 'desvio' ? { codigo: cons, gravidade: cons === 'aviso' ? 'aviso' : 'nao_conforme' } : undefined });
    }

    if (status === 'bloqueada') {
      cad = K.registrar(cad, { tipo: 'etapa', t: t0, etapa: etapa.id, texto: 'Etapa desfeita: corrija e repita.' });
      return { sessao: congelar({ ...sessao, caderno: cad, tentativas }), resultado: { status, etapa: etapa.id, mensagens, eventos, calculo } };
    }
    if (status === 'aguardar') {
      return { sessao: congelar({ ...sessao, estado, caderno: cad, tentativas }), resultado: { status, etapa: etapa.id, mensagens, eventos, calculo } };
    }
    return concluir(sessao, processo, estado, cad, tentativas, etapa, { mensagens, eventos, calculo }, false);
  }

  function concluir(sessao, processo, estado, cad, tentativas, etapa, res, pulada) {
    const historico = sessao.historico.concat([{ indice: sessao.indice, estado: sessao.estado }]).slice(-MAX_HISTORICO);
    const indice = sessao.indice + 1;
    const terminado = indice >= processo.etapas.length;
    let c = K.registrar(cad, { tipo: 'etapa', t: estado.t, etapa: etapa.id, texto: pulada ? `Etapa ${etapa.id} pulada (efeito padrão aplicado).` : `Etapa ${etapa.id} concluída.` });
    if (terminado) c = K.registrar(c, { tipo: 'conclusao', t: estado.t, etapa: etapa.id, texto: `Processo ${processo.titulo} concluído.` });
    const nova = congelar({
      ...sessao, estado, caderno: c, tentativas, historico, indice, terminado,
      concluidas: sessao.concluidas.concat([etapa.id]),
      puladas: pulada ? sessao.puladas.concat([etapa.id]) : sessao.puladas
    });
    return { sessao: nova, resultado: { status: 'concluida', etapa: etapa.id, mensagens: res.mensagens, eventos: res.eventos, calculo: res.calculo } };
  }

  /** Pula a etapa: aplica a ação padrão (para a simulação seguir coerente) e marca como pulada, sem conferir cálculo. */
  function pularEtapa(sessao, processo, ctx) {
    const etapa = etapaAtual(sessao, processo);
    if (!etapa) return { sessao, resultado: { status: 'terminado', etapa: null, mensagens: [], eventos: [] } };
    let estado = sessao.estado;
    let eventos = [];
    for (const a of acoesDaEtapa(etapa, null)) {
      const r = O.executar(estado, a.operacao, a.parametros, ctx);
      estado = r.estado;
      eventos = eventos.concat(r.eventos);
    }
    let cad = registrarEtapaInicio(sessao.caderno, sessao, etapa);
    cad = K.registrarEventos(cad, eventos, { t: estado.t, etapa: etapa.id });
    const tentativas = { ...sessao.tentativas, [etapa.id]: (sessao.tentativas[etapa.id] || 0) + 1 };
    return concluir(sessao, processo, estado, cad, tentativas, etapa, { mensagens: [], eventos }, true);
  }

  /** Volta à etapa anterior restaurando o estado salvo (o caderno guarda o registro da volta). */
  function voltarEtapa(sessao) {
    if (!sessao.historico.length) return sessao;
    const ult = sessao.historico[sessao.historico.length - 1];
    const etapaId = sessao.concluidas[sessao.concluidas.length - 1];
    const cad = K.registrar(sessao.caderno, { tipo: 'etapa', t: sessao.estado.t, etapa: etapaId, texto: `Voltou para refazer a etapa ${etapaId}.` });
    return congelar({
      ...sessao, estado: ult.estado, indice: ult.indice, terminado: false, caderno: cad,
      historico: sessao.historico.slice(0, -1),
      concluidas: sessao.concluidas.slice(0, -1),
      puladas: sessao.puladas.filter((x) => x !== etapaId)
    });
  }

  /** Roda todas as etapas com parâmetros padrão (e respostas opcionais por etapa). Para testes e demonstração. */
  function rodarProcesso(processo, ctx, opcoes) {
    const o = opcoes || {};
    let sessao = iniciarSessao(processo, ctx, o);
    const resultados = [];
    let guarda = processo.etapas.length * 3;
    while (!sessao.terminado && guarda-- > 0) {
      const etapa = etapaAtual(sessao, processo);
      const r = executarEtapa(sessao, processo, ctx, { resposta: o.respostas && o.respostas[etapa.id], parametros: o.parametros && o.parametros[etapa.id] });
      sessao = r.sessao;
      resultados.push(r.resultado);
      if (r.resultado.status === 'bloqueada' || r.resultado.status === 'erro') break;
    }
    return { sessao, resultados };
  }

  /** Resumo do lote: etapas, desvios do caderno e conferência do resultado esperado. */
  function relatorio(sessao, processo, ctx) {
    const res = K.resumo(sessao.caderno);
    const esperado = processo.resultadoEsperado || {};
    const conferencias = (esperado.criterios || []).map((c) => {
      let ok = false;
      try { ok = Cd.avaliar(c, contexto(sessao.estado, ctx, sessao, {}, [])); } catch (_) { ok = false; }
      return { descricao: c.descricao || c.grandeza, ok };
    });
    return {
      concluido: sessao.terminado,
      etapasConcluidas: sessao.concluidas.length,
      etapasPuladas: sessao.puladas.length,
      totalEtapas: processo.etapas.length,
      desvios: res.desvios,
      porGravidade: res.porGravidade,
      calculos: res.calculos,
      conferencias,
      conforme: sessao.terminado && conferencias.every((c) => c.ok) && res.porGravidade.nao_conforme === 0 && res.porGravidade.incidente === 0
    };
  }

  const API = { iniciarSessao, etapaAtual, executarEtapa, pularEtapa, voltarEtapa, rodarProcesso, relatorio };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorProcesso = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
