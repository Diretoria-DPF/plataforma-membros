/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — tutor das missões sobre o executor de processos (O4). Funções puras, sem DOM e sem IA.
 *
 * Quem age é a pessoa, pelos controles da bancada (`alvoUI` das ações). O tutor:
 *   - mostra o que está acontecendo e o porquê da etapa, e aponta o controle correto (o "!", só no nível Completa);
 *   - dá dica gradual em 3 degraus (porquê, controle e conta, resposta), tudo tirado dos dados do processo;
 *   - avança por evento do motor: a etapa só passa quando o executor a conclui (concluída, aguardar, bloqueada);
 *   - deixa o erro acontecer com a consequência do processo (pesar sem tarar, transferir sem enxágue...);
 *   - no modo Prova não ajuda: nada de "!", porquê nem dica; a explicação dos desvios vem só no resultado.
 * Cada acerto, erro, dica, pulo ou ação fora de ordem vira um evento de competência (ponto de extensão da O8).
 * O estado do tutor é imutável: toda função devolve um tutor novo.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const P = emNode ? require('./lab-motor-processo.js') : raiz.LabMotorProcesso;
  const O = emNode ? require('./lab-motor-operacoes.js') : raiz.LabMotorOperacoes;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const K = emNode ? require('./lab-motor-caderno.js') : raiz.LabMotorCaderno;
  const Ca = emNode ? require('./lab-motor-calculos.js') : raiz.LabMotorCalculos;
  const C = emNode ? require('./lab-tutor-controles.js') : raiz.LabTutorControles;

  const NIVEIS = Object.freeze(['completa', 'dica', 'prova']);
  const DEGRAUS = 3;
  const MAX_EVENTOS = 400;
  const ENTRADAS_CADERNO = 12;
  const NEUTRO = 'Registrado no caderno.';
  const ROTULO_STATUS = { concluida: 'Etapa concluída.', bloqueada: 'Etapa não concluída: veja o motivo.', aguardar: 'Ainda não: continue esta etapa.', erro: 'Não foi possível executar.' };

  /** O que o nível de ajuda permite. Desligada: sem "!" e sem balão, mas a dica continua a pedido. */
  function apoio(ajuda) {
    const a = ajuda || {};
    const nivel = NIVEIS.includes(a.nivel) ? a.nivel : 'completa';
    if (nivel === 'prova') return { nivel, marca: false, balao: false, dicas: false, explica: false };
    if (a.ligada === false) return { nivel: 'desligada', marca: false, balao: false, dicas: true, explica: true };
    return { nivel, marca: nivel === 'completa', balao: true, dicas: true, explica: true };
  }

  function acoes(etapa) { return [].concat(etapa.acao || []); }
  function etapa(t, processo) { return P.etapaAtual(t.sessao, processo); }
  /** Próxima ação da etapa: a primeira depois da última já feita ou já aplicada. */
  function cursor(t) { return t.feitas.concat(t.aplicadas).reduce((m, x) => Math.max(m, (typeof x === 'number' ? x : x.i) + 1), 0); }

  function criar(processo, missao, ctx, opcoes) {
    const o = opcoes || {};
    const sessao = P.iniciarSessao(processo, ctx, { semente: Number.isInteger(o.semente) ? o.semente : 1 });
    return Object.freeze({
      missaoId: missao.id, processoId: processo.id, competenciasEtapas: Object.freeze({ ...(missao.etapas || {}) }),
      sessao, feitas: [], aplicadas: [], previa: null, degrau: 0, ajuda: o.ajuda || { ligada: true, nivel: missao.ajudaPadrao || 'completa' },
      competencias: Object.freeze([]), ultimo: null, seq: 0
    });
  }

  function com(t, mudancas) { return Object.freeze({ ...t, ...mudancas }); }

  function evento(t, etapaId, competencia, resultado, extra) {
    return Object.freeze({ tipo: 'competencia', missao: t.missaoId, processo: t.processoId, etapa: etapaId, competencia, resultado, ajuda: apoio(t.ajuda).nivel, degrau: t.degrau, seq: t.seq + 1, ...(extra || {}) });
  }
  function comEventos(t, lista) {
    const ev = lista.filter(Boolean);
    if (!ev.length) return t;
    const todos = t.competencias.concat(ev.map((e, i) => Object.freeze({ ...e, seq: t.seq + 1 + i })));
    return com(t, { competencias: Object.freeze(todos.slice(-MAX_EVENTOS)), seq: t.seq + ev.length });
  }
  function competenciaDa(t, etapaId) { return t.competenciasEtapas[etapaId] || 'geral'; }

  function dicasDa(processo, et, indice, ctx) {
    const acao = acoes(et)[indice];
    const def = C.controle(acao.alvoUI, ctx);
    const calc = et.calculoPrevio;
    const casas = calc && Math.abs(calc.resposta) >= 10 ? 0 : 2;
    return [
      et.porQue,
      `Controle: ${def ? def.rotulo : acao.alvoUI}.${calc ? ` Conta: ${calc.formula}.` : ''}`,
      `${C.descreverAcao(acao, ctx)}${calc ? ` Resultado da conta: ${Ca.formatarNumero(calc.resposta, casas)} ${calc.unidade}.` : ''}`
    ];
  }

  function fmt(v, c) { return Ca.formatarNumero(v, c); }

  /** Estado do vaso e dos equipamentos em texto (alternativa à figura; leitor de tela). */
  function leituras(estado, ctx) {
    const out = [{ id: 'epi', rotulo: 'EPI vestido', texto: estado.ambiente.epi.length ? estado.ambiente.epi.join(', ') : 'nenhum' }];
    const bal = estado.equipamentos.balanca;
    out.push({ id: 'balanca', rotulo: 'Balança', texto: bal.recipiente ? `tarada com ${C.rotuloRecipiente(bal.recipiente)}` : 'sem tara' });
    out.push({ id: 'phmetro', rotulo: 'pHmetro', texto: estado.equipamentos.phmetroCalibrado ? 'calibrado' : 'sem calibrar' });
    for (const id of Object.keys(estado.recipientes)) {
      const r = estado.recipientes[id];
      const vol = E.volumeLiquidoMl(r, ctx.especies);
      const solido = E.massaConteudo(r.solido, ctx.especies);
      const partes = [`${fmt(vol, 1)} mL`, `${fmt(E.massaRecipiente(r, ctx.especies), 2)} g de conteúdo`, `${fmt(r.tempC, 1)} °C`];
      if (solido > 0.0005) partes.push(`sólido no fundo: ${fmt(solido, 3)} g`);
      if (r.homogeneo) partes.push('homogêneo');
      if (r.rotulo && Object.keys(r.rotulo).length) partes.push('rotulado');
      out.push({ id, rotulo: C.rotuloRecipiente(id), texto: partes.join('; ') });
    }
    return out;
  }

  function cadernoRecente(sessao) { return sessao.caderno.entradas.slice(-ENTRADAS_CADERNO).map((x) => `${K.relogio(x.t)} ${x.texto}`); }

  /** O que a tela mostra agora. Campos que dariam pista vêm nulos conforme o nível de ajuda. */
  function vista(t, processo, ctx) {
    const ap = apoio(t.ajuda);
    const total = processo.etapas.length;
    const base = { titulo: processo.titulo, nivel: ap.nivel, ultimo: t.ultimo, podeVoltar: t.sessao.historico.length > 0, leituras: leituras(t.previa || t.sessao.estado, ctx), caderno: cadernoRecente(t.sessao) };
    if (t.sessao.terminado) return { ...base, terminado: true, progresso: `${total} de ${total} etapas` };
    const et = etapa(t, processo);
    const i = Math.min(cursor(t), acoes(et).length - 1);
    const acao = acoes(et)[i];
    const def = C.controle(acao.alvoUI, ctx);
    return {
      ...base, terminado: false,
      progresso: `Etapa ${t.sessao.indice + 1} de ${total}`, etapaId: et.id, etapaTitulo: et.titulo,
      acontecendo: ap.balao ? et.oQueEstaAcontecendo : null,
      porque: ap.balao ? et.porQue : null,
      alvo: ap.marca ? acao.alvoUI : null,
      rotuloAlvo: ap.balao && def ? def.rotulo : null,
      calculo: et.calculoPrevio ? { pergunta: et.calculoPrevio.pergunta, unidade: et.calculoPrevio.unidade } : null,
      dicas: ap.dicas ? dicasDa(processo, et, i, ctx).slice(0, t.degrau) : [],
      podePedirDica: ap.dicas && t.degrau < DEGRAUS
    };
  }

  function retornar(t, tipo, mensagens, extra) {
    const ultimo = Object.freeze({ tipo, mensagens: Object.freeze(mensagens.slice()) });
    return { tutor: com(t, { ultimo }), retorno: { tipo, mensagens, ...(extra || {}) } };
  }

  /** A pessoa usou um controle: { alvo, valores (campos do controle), resposta (cálculo prévio) }. */
  function agir(t, processo, ctx, entrada) {
    const en = entrada || {};
    const ap = apoio(t.ajuda);
    if (t.sessao.terminado) return retornar(t, 'terminado', ['Missão concluída.']);
    const et = etapa(t, processo);
    const lista = acoes(et);
    const def = C.controle(en.alvo, ctx);
    if (!def) return retornar(t, 'erro', ['Controle desconhecido.']);
    const cur = cursor(t);
    const idx = lista.findIndex((a, i) => i >= cur && a.alvoUI === en.alvo);
    if (idx < 0) {
      const jaFeito = lista.some((a, i) => i < cur && a.alvoUI === en.alvo);
      if (jaFeito) return retornar(t, 'repetido', [ap.explica ? `${def.rotulo}: já feito nesta etapa.` : NEUTRO]);
      const ev = evento(t, et.id, competenciaDa(t, et.id), 'fora_de_ordem', { controle: en.alvo });
      const msg = ap.explica ? `Ainda não é a vez de "${def.rotulo}". Etapa atual: ${et.titulo}.` : 'Esta ação não faz parte da etapa atual do procedimento.';
      const r = retornar(comEventos(t, [ev]), 'fora_de_ordem', [msg], { competencia: ev });
      return r;
    }
    const m = C.montarParametros(en.alvo, en.valores, ctx);
    if (!m.ok) return retornar(t, 'erro', [m.mensagem]);

    if (idx < lista.length - 1) return agirParcial(t, lista, idx, m.parametros, ctx, ap);
    return concluirEtapa(t, processo, ctx, et, lista, idx, m.parametros, en.resposta, ap);
  }

  /** Ação que não fecha a etapa: aplica numa prévia (para mostrar a leitura) e guarda os parâmetros. */
  function agirParcial(t, lista, idx, parametros, ctx, ap) {
    let r;
    try {
      r = O.executar(t.previa || t.sessao.estado, lista[idx].operacao, { ...lista[idx].parametros, ...parametros }, ctx);
    } catch (err) {
      return retornar(t, 'erro', [`Não foi possível executar: ${err.message}.`]);
    }
    const feitas = t.feitas.concat([Object.freeze({ i: idx, parametros })]);
    const textos = ap.explica ? r.eventos.map((e) => e.texto) : [NEUTRO];
    return retornar(com(t, { feitas, previa: r.estado }), 'parcial', textos, { eventos: r.eventos });
  }

  function desviosNovos(antes, depois, etapaId) {
    return depois.caderno.entradas.slice(antes.caderno.entradas.length).filter((e) => e.etapa === etapaId && (e.tipo === 'desvio' || e.tipo === 'incidente'));
  }

  /** Última ação da etapa: o executor roda a etapa inteira com o que a pessoa fez (o que ela pulou fica de fora). */
  function concluirEtapa(t, processo, ctx, et, lista, idx, parametros, resposta, ap) {
    const override = lista.map((a, i) => {
      if (t.aplicadas.includes(i)) return { omitir: true };
      if (i === idx) return parametros;
      const f = t.feitas.find((x) => x.i === i);
      return f ? f.parametros : { omitir: true };
    });
    const r = P.executarEtapa(t.sessao, processo, ctx, { parametros: override, resposta });
    const st = r.resultado.status;
    const comp = competenciaDa(t, et.id);
    const eventos = [];
    if (st === 'concluida') eventos.push(evento(t, et.id, comp, desviosNovos(t.sessao, r.sessao, et.id).length ? 'erro' : 'acerto'));
    if (st === 'bloqueada' || st === 'erro') eventos.push(evento(t, et.id, comp, 'erro'));
    const calc = r.resultado.calculo;
    if (calc && calc.respondida) eventos.push(evento(t, et.id, 'calculo', calc.ok ? 'acerto' : 'erro'));

    let novo;
    if (st === 'concluida') novo = com(t, { sessao: r.sessao, feitas: [], aplicadas: [], previa: null, degrau: 0 });
    else if (st === 'aguardar') novo = com(t, { sessao: r.sessao, feitas: [], aplicadas: lista.map((_, i) => i).filter((i) => i < lista.length - 1), previa: null });
    else novo = com(t, { sessao: r.sessao, feitas: [], previa: null });
    novo = comEventos(novo, eventos);

    const leiturasEv = r.resultado.eventos.filter((e) => !e.desvio).slice(-3).map((e) => e.texto);
    const mensagens = ap.explica ? [ROTULO_STATUS[st]].concat(leiturasEv, r.resultado.mensagens) : [NEUTRO];
    const fim = novo.sessao.terminado ? { terminado: true } : {};
    return retornar(novo, st, mensagens, { competencia: eventos[0] || null, ...fim });
  }

  /** Mais um degrau de dica (no máximo 3). No modo Prova, nada muda. */
  function pedirDica(t, processo, ctx) {
    const ap = apoio(t.ajuda);
    if (!ap.dicas || t.sessao.terminado || t.degrau >= DEGRAUS) return { tutor: t, dica: null };
    const et = etapa(t, processo);
    const degrau = t.degrau + 1;
    const ctxE = ctx || { especies: {} };
    const dica = dicasDa(processo, et, Math.min(cursor(t), acoes(et).length - 1), ctxE)[degrau - 1];
    const novo = comEventos(com(t, { degrau }), [evento(com(t, { degrau }), et.id, competenciaDa(t, et.id), 'dica')]);
    return { tutor: novo, dica };
  }

  function pular(t, processo, ctx) {
    if (t.sessao.terminado) return { tutor: t };
    const et = etapa(t, processo);
    const r = P.pularEtapa(t.sessao, processo, ctx);
    const novo = comEventos(com(t, { sessao: r.sessao, feitas: [], aplicadas: [], previa: null, degrau: 0 }), [evento(t, et.id, competenciaDa(t, et.id), 'pulado')]);
    return retornar(novo, 'pulado', ['Etapa pulada: o efeito padrão foi aplicado e o caderno registra o pulo.']);
  }

  function voltar(t) {
    if (!t.sessao.historico.length) return t;
    const novo = com(t, { sessao: P.voltarEtapa(t.sessao), feitas: [], aplicadas: [], previa: null, degrau: 0 });
    return retornar(novo, 'voltar', ['Voltou ao início da etapa anterior.']).tutor;
  }

  function mudarAjuda(t, ajuda) { return com(t, { ajuda: { ligada: !(ajuda && ajuda.ligada === false), nivel: ajuda && NIVEIS.includes(ajuda.nivel) ? ajuda.nivel : 'completa' } }); }

  /** Resultado e feedback da missão: conferências do lote, desvios explicados, cálculos e conclusão. */
  function resultado(t, processo, ctx, missao) {
    const rel = P.relatorio(t.sessao, processo, ctx);
    const titulo = (id) => { const e = processo.etapas.find((x) => x.id === id); return e ? e.titulo : id; };
    const desvios = t.sessao.caderno.entradas
      .filter((e) => (e.tipo === 'desvio' || e.tipo === 'incidente') && !e.operacao)
      .map((e) => ({ etapa: e.etapa, etapaTitulo: titulo(e.etapa), texto: e.texto }));
    return {
      concluido: rel.concluido, conforme: rel.conforme, conferencias: rel.conferencias, desvios,
      calculos: rel.calculos, puladas: rel.etapasPuladas,
      resumo: rel.conforme ? 'Lote conforme: todas as conferências passaram.' : `Lote não conforme ou com ${desvios.length} desvio(s): leia o que aconteceu e repita a missão.`,
      conclusao: (missao && missao.conclusao) || ''
    };
  }

  const TIPOS_LIDOS = ['etapa', 'acao', 'leitura', 'observacao', 'conclusao'];

  /** Nível 8: roda o processo com o desvio do cenário e devolve o caderno sem as explicações prontas. */
  function montarInvestigacao(missao, processo, ctx) {
    const c = missao.cenario;
    const { sessao } = P.rodarProcesso(processo, ctx, { semente: c.semente, parametros: c.parametros, respostas: c.respostas });
    const rel = P.relatorio(sessao, processo, ctx);
    const registros = sessao.caderno.entradas.filter((e) => TIPOS_LIDOS.includes(e.tipo)).map((e) => `${K.relogio(e.t)} ${e.texto}`);
    for (const cr of (processo.resultadoEsperado || {}).criterios || []) {
      const r = sessao.estado.recipientes[cr.recipiente];
      if (cr.grandeza !== 'concentracaoPV' || !r) continue;
      const v = E.volumeLiquidoMl(r, ctx.especies);
      const pv = v > 0 ? (100 * E.massaEspecie(r, cr.especie, ctx.especies)) / v : 0;
      registros.push(`Análise do ${C.rotuloRecipiente(cr.recipiente)}: ${fmt(pv, 2)} % p/v (especificação ${fmt(cr.valor[0], 2)} a ${fmt(cr.valor[1], 2)} %).`);
    }
    return {
      missaoId: missao.id, enunciado: c.enunciado, registros,
      conferencias: rel.conferencias.map((x) => `${x.ok ? 'Conforme' : 'Fora'}: ${x.descricao}`),
      opcoes: processo.etapas.map((e, i) => ({ id: e.id, texto: `${i + 1}. ${e.titulo}` }))
    };
  }

  function responderInvestigacao(inv, missao, etapaId) {
    const c = missao.cenario;
    const certo = etapaId === c.etapaCausa;
    const competencia = Object.freeze({ tipo: 'competencia', missao: missao.id, processo: missao.processoRef, etapa: etapaId, competencia: 'investigacao', resultado: certo ? 'acerto' : 'erro', ajuda: 'prova', degrau: 0, seq: 1 });
    return { certo, explicacao: certo ? c.explicacao : c.dicaSeErrar, acaoCorretiva: certo ? c.acaoCorretiva : null, competencia };
  }

  const API = { NIVEIS, apoio, criar, vista, agir, pedirDica, pular, voltar, mudarAjuda, resultado, leituras, montarInvestigacao, responderInvestigacao };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabTutor = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
