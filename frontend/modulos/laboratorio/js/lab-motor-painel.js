/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — painel "Processo guiado" da bancada (O3). Baixado sob demanda pelo lab-motor-carregador.js.
 *
 * vistaDaEtapa() é pura (testada em Node). A montagem usa LaiftDom.h e textContent (nunca HTML como texto)
 * e ouvintes por addEventListener (sem handler inline). A sessão do motor fica só na memória da página.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const P = emNode ? require('./lab-motor-processo.js') : raiz.LabMotorProcesso;
  const K = emNode ? require('./lab-motor-caderno.js') : raiz.LabMotorCaderno;
  const ESP = emNode ? require('./lab-motor-especies.js') : raiz.LabMotorEspecies;

  const ENTRADAS_CADERNO = 12;
  const ROTULO_STATUS = { concluida: 'Etapa concluída.', bloqueada: 'Etapa não feita: veja o motivo.', aguardar: 'Ainda não: continue esta etapa.', erro: 'Não foi possível executar.', terminado: 'Processo concluído.' };

  /** O que a tela mostra para a sessão atual. */
  function vistaDaEtapa(sessao, processo, ctx) {
    const total = processo.etapas.length;
    if (sessao.terminado) {
      const rel = P.relatorio(sessao, processo, ctx);
      return {
        terminado: true, titulo: processo.titulo, progresso: `${total} de ${total} etapas`,
        resumo: rel.conforme ? 'Lote conforme: todas as conferências passaram.' : `Lote com ${rel.desvios} desvio(s): leia o caderno e repita o que for preciso.`,
        conferencias: rel.conferencias.map((c) => `${c.ok ? 'Conforme' : 'Fora'}: ${c.descricao}`),
        podeVoltar: sessao.historico.length > 0, caderno: ultimas(sessao)
      };
    }
    const e = processo.etapas[sessao.indice];
    return {
      terminado: false, titulo: processo.titulo,
      progresso: `Etapa ${sessao.indice + 1} de ${total}: ${e.titulo}`,
      acontecendo: e.oQueEstaAcontecendo, porque: e.porQue,
      calculo: e.calculoPrevio ? { pergunta: e.calculoPrevio.pergunta, unidade: e.calculoPrevio.unidade } : null,
      podeVoltar: sessao.historico.length > 0, caderno: ultimas(sessao)
    };
  }

  function ultimas(sessao) {
    return sessao.caderno.entradas.slice(-ENTRADAS_CADERNO).map((x) => `${K.relogio(x.t)} ${x.texto}`);
  }

  function abrir(janela, processo) {
    const doc = janela.document;
    const h = janela.LaiftDom.h;
    const ctx = { especies: ESP.ESPECIES, rf: ESP.RF_ILUSTRATIVO };
    const semente = (Date.now() % 2147483646) + 1;
    let sessao = P.iniciarSessao(processo, ctx, { semente });
    let mensagens = [];

    const antigo = doc.getElementById('labProcesso');
    if (antigo) antigo.remove();
    const raizPainel = h('section', { id: 'labProcesso', className: 'panel lab-processo', 'aria-labelledby': 'lpTitulo' });
    const aba = doc.getElementById('tabMissao');
    aba.appendChild(raizPainel);

    function botao(id, texto, fn, extra) {
      return h('button', Object.assign({ type: 'button', id, className: 'btn btn-clear', text: texto, onClick: fn }, extra || {}));
    }

    function executar() {
      const campo = doc.getElementById('lpResposta');
      const r = P.executarEtapa(sessao, processo, ctx, { resposta: campo ? campo.value : undefined });
      sessao = r.sessao;
      mensagens = [ROTULO_STATUS[r.resultado.status] || ''].concat(r.resultado.mensagens || []);
      desenhar();
    }
    function voltar() { sessao = P.voltarEtapa(sessao); mensagens = ['Voltou ao início da etapa anterior.']; desenhar(); }
    function pular() { sessao = P.pularEtapa(sessao, processo, ctx).sessao; mensagens = ['Etapa pulada: o efeito padrão foi aplicado.']; desenhar(); }
    function reiniciar() { sessao = P.iniciarSessao(processo, ctx, { semente: semente + 1 }); mensagens = []; desenhar(); }
    function fechar() { raizPainel.remove(); const b = doc.getElementById('btnProcessoGuiado'); if (b) b.focus(); }

    function desenhar() {
      const v = vistaDaEtapa(sessao, processo, ctx);
      const filhos = [
        h('div', { className: 'panel-section-header' }, [h('h3', { id: 'lpTitulo', text: v.titulo }), botao('lpFechar', 'Fechar', fechar)]),
        h('p', { id: 'lpProgresso', className: 'lab-processo-progresso', text: v.progresso })
      ];
      if (v.terminado) {
        filhos.push(h('p', { id: 'lpRelatorio', text: v.resumo }));
        filhos.push(h('ul', { id: 'lpConferencias' }, v.conferencias.map((c) => h('li', { text: c }))));
        filhos.push(h('div', { className: 'lab-processo-acoes' }, [botao('lpReiniciar', 'Fazer de novo', reiniciar), v.podeVoltar ? botao('lpVoltar', 'Voltar', voltar) : null]));
      } else {
        filhos.push(h('p', { id: 'lpAcontecendo' }, [h('strong', { text: 'O que está acontecendo: ' }), v.acontecendo]));
        filhos.push(h('p', { id: 'lpPorque' }, [h('strong', { text: 'Por quê: ' }), v.porque]));
        if (v.calculo) {
          filhos.push(h('div', { className: 'lab-processo-calculo' }, [
            h('label', { for: 'lpResposta', text: `Cálculo antes de executar: ${v.calculo.pergunta}` }),
            h('span', { className: 'lab-processo-campo' }, [h('input', { id: 'lpResposta', type: 'text', inputmode: 'decimal', autocomplete: 'off' }), h('span', { text: ` ${v.calculo.unidade}` })])
          ]));
        }
        filhos.push(h('div', { className: 'lab-processo-acoes' }, [
          botao('lpExecutar', 'Executar etapa', executar, { className: 'btn btn-play' }),
          v.podeVoltar ? botao('lpVoltar', 'Voltar', voltar) : null,
          botao('lpPular', 'Pular', pular)
        ]));
      }
      filhos.push(h('div', { id: 'lpMensagens', role: 'status', 'aria-live': 'polite' }, mensagens.filter(Boolean).map((m) => h('p', { text: m }))));
      filhos.push(h('details', { className: 'lab-processo-caderno' }, [h('summary', { text: 'Caderno (últimas entradas)' }), h('ol', { id: 'lpCaderno' }, v.caderno.map((t) => h('li', { text: t })))]));
      janela.LaiftDom.clear(raizPainel);
      filhos.forEach((f) => raizPainel.appendChild(f));
    }

    desenhar();
    if (typeof janela.switchRightTab === 'function') janela.switchRightTab('tabMissao');
    const titulo = doc.getElementById('lpTitulo');
    if (titulo) { titulo.tabIndex = -1; titulo.focus(); }
    return { sessao: () => sessao };
  }

  const API = { vistaDaEtapa, abrir };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorPainel = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
