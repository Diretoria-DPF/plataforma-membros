/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — tela da trilha e bancada do motor para a Missão 1 (O4). Baixado sob demanda (chave labMotor).
 *
 * Enquanto a tela está aberta, a bancada clássica fica oculta (classe `lab-motor-ativo` no <html>); ao sair, ela
 * volta como estava. Todo texto entra por textContent (LaiftDom.h); ouvintes por addEventListener; nada de HTML
 * montado a partir de dado. O "!" fica sobre o controle correto só no nível Completa da Ajuda no processo.
 * Eventos de competência saem como CustomEvent('lab:competencia') no document (ponto de extensão da O8).
 */
(function (raiz) {
  'use strict';

  const doc = raiz.document;
  const LT = raiz.LabTutor;
  const C = raiz.LabTutorControles;
  const Tr = raiz.LabTrilha;
  const ESP = raiz.LabMotorEspecies;
  const ctx = { especies: ESP.ESPECIES, rf: ESP.RF_ILUSTRATIVO };

  let tela = null;
  let dados = null;        // { trilha, processos }
  let jogo = null;         // { missao, processo, tutor, etapaId }
  let marca = null;
  let alvoEl = null;
  let quadro = 0;

  const h = (...a) => raiz.LaiftDom.h(...a);
  function armazenamento() { try { return raiz.localStorage; } catch (e) { return null; } }
  function botao(id, texto, fn, classe) { return h('button', { type: 'button', id, className: classe || 'btn btn-clear', text: texto, onClick: fn }); }
  function slug(t) { return String(t).replace(/[^A-Za-z0-9]/g, '-'); }

  function preferencia(missao) {
    const G = raiz.LabGuia;
    if (!G || doc.documentElement.classList.contains('lab-sem-guia')) return { ligada: true, nivel: missao.ajudaPadrao || 'completa' };
    return G.lerPreferencia(armazenamento());
  }

  // ---------------------------------------------------------------- tela e saída
  function montarTela() {
    if (!tela || !doc.body.contains(tela)) {
      tela = h('section', { id: 'labMotorTela', className: 'lab-motor-tela', 'aria-label': 'Missões no motor do Laboratório' });
      const grade = doc.getElementById('mainGrid');
      grade.parentNode.insertBefore(tela, grade);
      tela.addEventListener('scroll', agendarMarca, { passive: true });
    }
    doc.documentElement.classList.add('lab-motor-ativo');
    limparMarca();
    raiz.LaiftDom.clear(tela);
    tela.scrollTop = 0;
    return tela;
  }

  function sair() {
    limparMarca();
    jogo = null;
    if (tela) tela.remove();
    tela = null;
    doc.documentElement.classList.remove('lab-motor-ativo');
    const b = doc.getElementById('btnTrilha');
    if (b) b.focus();
  }

  function focar(id) { const n = doc.getElementById(id); if (n) { n.tabIndex = -1; n.focus(); } }

  function emitir(lista) {
    for (const ev of lista) {
      try { doc.dispatchEvent(new raiz.CustomEvent('lab:competencia', { detail: ev })); } catch (e) { /* sem CustomEvent */ }
    }
  }

  // ---------------------------------------------------------------- trilha
  const ROTULO_BOTAO = { disponivel: 'Jogar', concluida: 'Jogar de novo' };

  function abrirTrilha(_janela, d) {
    if (d) dados = d;
    const t = montarTela();
    const sit = Tr.situacao(dados.trilha, Tr.lerProgresso(armazenamento()));
    const porId = Object.fromEntries(sit.map((s) => [s.missao.id, s]));
    t.appendChild(h('div', { className: 'lmt-cabecalho' }, [
      h('h2', { id: 'ttTitulo', text: dados.trilha.titulo }),
      botao('ttVoltarBancada', 'Voltar à bancada', sair)
    ]));
    t.appendChild(h('p', { className: 'lmt-nota', text: 'Cada nível treina competências do curso. O progresso fica guardado neste aparelho.' }));
    for (const g of Tr.porNivel(dados.trilha)) {
      t.appendChild(h('h3', { className: 'lmt-nivel', text: `Nível ${g.nivel}: ${g.nome}` }));
      t.appendChild(h('ul', { className: 'lmt-cartoes' }, g.missoes.map((m) => cartao(porId[m.id]))));
    }
    focar('ttTitulo');
  }

  function cartao(s) {
    const m = s.missao;
    const rotulo = m.tipo === 'investigacao' && s.estado === 'disponivel' ? 'Investigar' : ROTULO_BOTAO[s.estado];
    return h('li', { className: 'lmt-cartao', dataset: { estado: s.estado, missao: m.id } }, [
      h('h4', { text: m.titulo }),
      h('p', { className: 'lmt-estado', text: `${Tr.ESTADOS[s.estado]}. ${s.estado === 'disponivel' ? '' : s.motivo}`.trim() }),
      h('ul', { className: 'lmt-objetivos' }, m.objetivos.map((o) => h('li', { text: o }))),
      rotulo ? botao(`ttJogar-${m.id}`, rotulo, () => (m.tipo === 'investigacao' ? investigar(m) : jogar(m)), 'btn btn-play') : null
    ]);
  }

  // ---------------------------------------------------------------- missão no motor
  function jogar(missao) {
    const processo = dados.processos[missao.processoRef];
    const semente = (Date.now() % 2147483646) + 1;
    jogo = { missao, processo, tutor: LT.criar(processo, missao, ctx, { semente, ajuda: preferencia(missao) }), etapaId: null };
    const t = montarTela();
    t.appendChild(h('div', { className: 'lmt-cabecalho' }, [
      h('h2', { id: 'tmTitulo', text: missao.titulo }),
      h('div', { className: 'lmt-acoes' }, [botao('tmTrilha', 'Trilha', () => abrirTrilha()), botao('tmSair', 'Voltar à bancada', sair)])
    ]));
    t.appendChild(h('details', { className: 'lmt-objetivos-missao' }, [h('summary', { text: 'Objetivos da missão' }), h('ul', {}, missao.objetivos.map((o) => h('li', { text: o })))]));
    t.appendChild(h('div', { className: 'lmt-grade' }, [zonaTutor(), zonaControles(processo), zonaEstado()]));
    desenhar(true);
    focar('tmTitulo');
  }

  function zonaTutor() {
    return h('section', { className: 'lmt-tutor', 'aria-label': 'O que está acontecendo' }, [
      h('p', { id: 'tmProgresso', className: 'lmt-progresso' }),
      h('p', { id: 'tmAcontecendo' }),
      h('details', { id: 'tmPorque', className: 'lmt-porque' }, [h('summary', { text: 'Por quê?' }), h('p', { id: 'tmPorqueTexto' })]),
      h('p', { id: 'tmInstrucao', className: 'lmt-instrucao' }),
      h('div', { id: 'tmCalculo', className: 'lmt-calculo', hidden: true }, [
        h('label', { id: 'tmCalculoRotulo', for: 'tmResposta' }),
        h('span', { className: 'lmt-campo' }, [h('input', { id: 'tmResposta', type: 'text', inputmode: 'decimal', autocomplete: 'off' }), h('span', { id: 'tmCalculoUnidade' })])
      ]),
      h('ol', { id: 'tmDicas', className: 'lmt-dicas' }),
      h('div', { id: 'tmRetorno', className: 'lmt-retorno', role: 'status', 'aria-live': 'polite' }),
      h('div', { className: 'lmt-acoes' }, [
        botao('tmDica', 'Preciso de dica', pedirDica),
        botao('tmIrControle', 'Ir para o controle', irParaControle),
        botao('tmVoltar', 'Voltar etapa', voltar),
        botao('tmPular', 'Pular etapa', pular)
      ])
    ]);
  }

  function campoDe(alvo, c) {
    const id = `tm-${slug(alvo)}-${c.id}`;
    if (c.tipo === 'marcas') {
      return h('fieldset', { className: 'lmt-marcas' }, [h('legend', { text: c.rotulo })].concat(c.opcoes.map(([v, r]) => h('label', { className: 'lmt-marca-op' }, [
        h('input', { type: 'checkbox', id: `${id}-${slug(v)}`, value: v, dataset: { campo: c.id } }), ` ${r}`
      ]))));
    }
    if (c.tipo === 'marca') {
      return h('label', { className: 'lmt-marca-op' }, [h('input', { type: 'checkbox', id, checked: !!c.padrao, dataset: { campo: c.id } }), ` ${c.rotulo}`]);
    }
    if (c.tipo === 'opcao') {
      const ops = (c.vazio ? [['', c.vazio]] : []).concat(c.opcoes);
      const sel = h('select', { id, dataset: { campo: c.id } }, ops.map(([v, r]) => h('option', { value: v, text: r })));
      if (c.padrao) sel.value = c.padrao;
      return h('label', { className: 'lmt-rotulo-campo' }, [c.rotulo, sel]);
    }
    const attrs = { id, type: 'text', autocomplete: 'off', maxlength: '120', dataset: { campo: c.id } };
    if (c.tipo === 'numero') attrs.inputmode = 'decimal';
    if (c.padraoDe) attrs.dataset.padraoDe = c.padraoDe;
    return h('label', { className: 'lmt-rotulo-campo' }, [c.rotulo, h('input', attrs)]);
  }

  function zonaControles(processo) {
    const grupos = [];
    for (const alvo of C.alvosDoProcesso(processo)) {
      const def = C.controle(alvo, ctx);
      if (!def) continue;
      let g = grupos.find((x) => x.nome === def.grupo);
      if (!g) { g = { nome: def.grupo, itens: [] }; grupos.push(g); }
      g.itens.push(h('div', { className: 'lmt-controle', dataset: { tutor: alvo } }, [
        h('p', { className: 'lmt-controle-nome', text: def.rotulo }),
        ...def.campos.map((c) => campoDe(alvo, c)),
        h('button', { type: 'button', className: 'btn btn-play lmt-executar', id: `tmBtn-${slug(alvo)}`, text: def.botao, onClick: () => usar(alvo) })
      ]));
    }
    return h('section', { className: 'lmt-controles', 'aria-label': 'Controles da bancada' }, grupos.map((g) => h('fieldset', { className: 'lmt-grupo' }, [h('legend', { text: g.nome })].concat(g.itens))));
  }

  function zonaEstado() {
    return h('section', { className: 'lmt-estado', 'aria-label': 'Estado da bancada' }, [
      h('h3', { text: 'Estado da bancada' }),
      h('dl', { id: 'tmLeituras', className: 'lmt-leituras' }),
      h('details', { className: 'lmt-caderno' }, [h('summary', { text: 'Caderno (últimas entradas)' }), h('ol', { id: 'tmCaderno' })])
    ]);
  }

  function valoresDe(alvo) {
    const caixa = controleEl(alvo);
    const v = {};
    if (!caixa) return v;
    caixa.querySelectorAll('[data-campo]').forEach((n) => {
      const k = n.dataset.campo;
      if (n.type === 'checkbox' && n.closest('.lmt-marcas')) { v[k] = (v[k] || []).concat(n.checked ? [n.value] : []); return; }
      v[k] = n.type === 'checkbox' ? n.checked : n.value;
    });
    return v;
  }

  function controleEl(alvo) {
    if (!tela) return null;
    return Array.from(tela.querySelectorAll('.lmt-controle')).find((n) => n.dataset.tutor === alvo) || null;
  }

  function aplicar(res) {
    const antes = jogo.tutor.competencias.length;
    jogo.tutor = res.tutor;
    emitir(jogo.tutor.competencias.slice(antes));
  }

  function usar(alvo) {
    if (!jogo) return;
    const campo = doc.getElementById('tmResposta');
    const calcVisivel = campo && !doc.getElementById('tmCalculo').hidden;
    aplicar(LT.agir(jogo.tutor, jogo.processo, ctx, { alvo, valores: valoresDe(alvo), resposta: calcVisivel ? campo.value : undefined }));
    if (jogo.tutor.sessao.terminado) { mostrarResultado(); return; }
    desenhar(false);
  }

  function pedirDica() { aplicar(LT.pedirDica(jogo.tutor, jogo.processo, ctx)); desenhar(false); }
  function voltar() { jogo.tutor = LT.voltar(jogo.tutor, jogo.processo); desenhar(true); }
  function pular() {
    aplicar(LT.pular(jogo.tutor, jogo.processo, ctx));
    if (jogo.tutor.sessao.terminado) { mostrarResultado(); return; }
    desenhar(true);
  }
  function irParaControle() {
    const v = LT.vista(jogo.tutor, jogo.processo, ctx);
    const caixa = v.alvo ? controleEl(v.alvo) : null;
    const alvo = caixa && caixa.querySelector('input, select, button');
    if (alvo) alvo.focus();
  }

  function texto(id, valor) { const n = doc.getElementById(id); if (n) n.textContent = valor || ''; }
  function mostrar(id, sim) { const n = doc.getElementById(id); if (n) n.hidden = !sim; }
  function lista(id, itens, prefixo) {
    const n = doc.getElementById(id);
    if (!n) return;
    raiz.LaiftDom.clear(n);
    itens.forEach((t, i) => n.appendChild(h('li', { text: prefixo ? `${prefixo} ${i + 1}: ${t}` : t })));
  }

  function desenhar(rolar) {
    const v = LT.vista(jogo.tutor, jogo.processo, ctx);
    const mudou = v.etapaId !== jogo.etapaId;
    jogo.etapaId = v.etapaId;
    texto('tmProgresso', `${v.progresso}: ${v.etapaTitulo}`);
    texto('tmAcontecendo', v.acontecendo ? `O que está acontecendo: ${v.acontecendo}` : 'Siga o procedimento: escolha o controle e preencha os valores.');
    texto('tmPorqueTexto', v.porque ? `Preceptor: ${v.porque}` : '');
    mostrar('tmPorque', !!v.porque);
    texto('tmInstrucao', v.alvo ? `A Guia: use o controle "${v.rotuloAlvo}", marcado com "!".` : (v.rotuloAlvo ? 'A Guia: se travar, peça uma dica.' : ''));
    mostrar('tmInstrucao', !!v.rotuloAlvo);
    mostrar('tmCalculo', !!v.calculo);
    if (v.calculo) { texto('tmCalculoRotulo', `Cálculo antes de executar: ${v.calculo.pergunta}`); texto('tmCalculoUnidade', ` ${v.calculo.unidade}`); }
    if (mudou) { const r = doc.getElementById('tmResposta'); if (r) r.value = ''; atualizarPadroes(); }
    lista('tmDicas', v.dicas, 'Dica');
    mostrar('tmDica', v.podePedirDica);
    const bDica = doc.getElementById('tmDica');
    if (bDica) bDica.textContent = `Preciso de dica (${v.dicas.length + 1} de 3)`;
    mostrar('tmIrControle', !!v.alvo);
    const bVoltar = doc.getElementById('tmVoltar');
    if (bVoltar) bVoltar.disabled = !v.podeVoltar;
    const ret = doc.getElementById('tmRetorno');
    raiz.LaiftDom.clear(ret);
    if (v.ultimo) { ret.dataset.tipo = v.ultimo.tipo; v.ultimo.mensagens.forEach((m) => ret.appendChild(h('p', { text: m }))); }
    const dl = doc.getElementById('tmLeituras');
    raiz.LaiftDom.clear(dl);
    v.leituras.forEach((l) => { dl.appendChild(h('dt', { text: l.rotulo })); dl.appendChild(h('dd', { text: l.texto })); });
    lista('tmCaderno', v.caderno);
    marcar(v.alvo, rolar || mudou);
  }

  /** Campo com padrão vindo do processo (ex.: tempo de agitação) recebe o valor da etapa atual. */
  function atualizarPadroes() {
    const et = jogo.processo.etapas[jogo.tutor.sessao.indice];
    if (!et) return;
    for (const a of [].concat(et.acao || [])) {
      const caixa = controleEl(a.alvoUI);
      if (!caixa) continue;
      caixa.querySelectorAll('[data-padrao-de]').forEach((n) => {
        const v = a.parametros && a.parametros[n.dataset.padraoDe];
        if (typeof v === 'number') n.value = String(v).replace('.', ',');
      });
    }
  }

  // ---------------------------------------------------------------- "!" sobre o controle correto
  function limparMarca() {
    if (alvoEl) { alvoEl.classList.remove('lab-alvo'); alvoEl = null; }
    if (marca) marca.hidden = true;
  }
  function marcar(alvo, rolar) {
    limparMarca();
    const caixa = alvo ? controleEl(alvo) : null;
    if (!caixa) return;
    caixa.classList.add('lab-alvo');
    alvoEl = caixa;
    if (!marca) {
      marca = h('span', { id: 'tmMarca', className: 'lab-marca', 'aria-hidden': 'true', text: '!' });
      doc.body.appendChild(marca);
    }
    if (rolar) { try { caixa.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch (e) { /* sem rolagem */ } }
    posicionarMarca();
  }
  function posicionarMarca() {
    if (!marca || !alvoEl) return;
    const r = alvoEl.getBoundingClientRect();
    const t = tela ? tela.getBoundingClientRect() : { top: 0, bottom: raiz.innerHeight };
    if (r.bottom < t.top || r.top > t.bottom) { marca.hidden = true; return; }
    marca.style.left = `${Math.max(2, Math.min(r.right - 14, raiz.innerWidth - 30))}px`;
    marca.style.top = `${Math.max(2, r.top - 12)}px`;
    marca.hidden = false;
  }
  function agendarMarca() {
    if (quadro) return;
    quadro = raiz.requestAnimationFrame(() => { quadro = 0; posicionarMarca(); });
  }

  // ---------------------------------------------------------------- resultado
  function mostrarResultado() {
    const { missao, processo, tutor } = jogo;
    const res = LT.resultado(tutor, processo, ctx, missao);
    const p = Tr.registrarConclusao(Tr.lerProgresso(armazenamento()), missao.id, { conforme: res.conforme, desvios: res.desvios.length });
    Tr.salvarProgresso(armazenamento(), p);
    try { doc.dispatchEvent(new raiz.CustomEvent('lab:missao-concluida', { detail: { missao: missao.id, conforme: res.conforme, desvios: res.desvios.length } })); } catch (e) { /* sem CustomEvent */ }
    const t = montarTela();
    t.appendChild(h('div', { className: 'lmt-cabecalho' }, [h('h2', { id: 'tmResultadoTitulo', text: `Resultado: ${missao.titulo}` })]));
    t.appendChild(h('p', { id: 'tmResumo', className: res.conforme ? 'lmt-ok' : 'lmt-fora', text: res.resumo }));
    t.appendChild(h('ul', { id: 'tmConferencias' }, res.conferencias.map((c) => h('li', { text: `${c.ok ? 'Conforme' : 'Fora'}: ${c.descricao}` }))));
    t.appendChild(h('p', { text: `Cálculos certos: ${res.calculos.certos}; a refazer: ${res.calculos.errados}. Etapas puladas: ${res.puladas}.` }));
    if (res.desvios.length) {
      t.appendChild(h('h3', { text: 'O que aconteceu e como fazer certo' }));
      t.appendChild(h('ul', { id: 'tmDesvios' }, res.desvios.map((d) => h('li', { text: `${d.etapaTitulo}: ${d.texto}` }))));
    }
    if (res.conclusao) t.appendChild(h('p', { className: 'lmt-conclusao', text: res.conclusao }));
    t.appendChild(h('details', { className: 'lmt-caderno' }, [h('summary', { text: 'Caderno completo' }), h('pre', { className: 'lmt-caderno-texto', text: raiz.LabMotorCaderno.paraTexto(tutor.sessao.caderno) })]));
    t.appendChild(h('div', { className: 'lmt-acoes' }, [
      botao('tmDeNovo', 'Fazer de novo', () => jogar(missao), 'btn btn-play'), botao('tmVerTrilha', 'Ver a trilha', () => abrirTrilha()), botao('tmSair', 'Voltar à bancada', sair)
    ]));
    focar('tmResultadoTitulo');
  }

  // ---------------------------------------------------------------- investigação (nível 8)
  function investigar(missao) {
    const processo = dados.processos[missao.processoRef];
    const inv = LT.montarInvestigacao(missao, processo, ctx);
    const t = montarTela();
    t.appendChild(h('div', { className: 'lmt-cabecalho' }, [
      h('h2', { id: 'tiTitulo', text: missao.titulo }),
      h('div', { className: 'lmt-acoes' }, [botao('tmTrilha', 'Trilha', () => abrirTrilha()), botao('tmSair', 'Voltar à bancada', sair)])
    ]));
    t.appendChild(h('p', { className: 'lmt-instrucao', text: inv.enunciado }));
    t.appendChild(h('h3', { text: 'Caderno do lote' }));
    t.appendChild(h('ol', { id: 'tiRegistros', className: 'lmt-registros' }, inv.registros.map((r) => h('li', { text: r }))));
    t.appendChild(h('ul', { id: 'tiConferencias' }, inv.conferencias.map((c) => h('li', { text: c }))));
    const opcoes = h('fieldset', { className: 'lmt-marcas' }, [h('legend', { text: 'Qual etapa causou o desvio?' })].concat(inv.opcoes.map((o) => h('label', { className: 'lmt-marca-op' }, [
      h('input', { type: 'radio', name: 'tiCausa', id: `tiCausa-${o.id}`, value: o.id }), ` ${o.texto}`
    ]))));
    t.appendChild(opcoes);
    const ret = h('div', { id: 'tiRetorno', className: 'lmt-retorno', role: 'status', 'aria-live': 'polite' });
    t.appendChild(h('div', { className: 'lmt-acoes' }, [botao('tiConfirmar', 'Confirmar a causa', () => {
      const marcada = opcoes.querySelector('input[name="tiCausa"]:checked');
      raiz.LaiftDom.clear(ret);
      if (!marcada) { ret.appendChild(h('p', { text: 'Escolha uma etapa.' })); return; }
      const r = LT.responderInvestigacao(inv, missao, marcada.value);
      emitir([r.competencia]);
      ret.dataset.tipo = r.certo ? 'concluida' : 'erro';
      ret.appendChild(h('p', { text: r.certo ? 'Causa encontrada.' : 'Ainda não é essa etapa.' }));
      ret.appendChild(h('p', { text: r.explicacao }));
      if (r.acaoCorretiva) {
        ret.appendChild(h('p', { text: `Ação corretiva: ${r.acaoCorretiva}` }));
        Tr.salvarProgresso(armazenamento(), Tr.registrarConclusao(Tr.lerProgresso(armazenamento()), missao.id, { conforme: true, desvios: 0 }));
      }
    }, 'btn btn-play')]));
    t.appendChild(ret);
    focar('tiTitulo');
  }

  // A Ajuda no processo (faixa da O1) muda o nível do tutor na hora.
  function aoMudarAjuda() {
    raiz.setTimeout(() => {
      if (!jogo || !tela) return;
      jogo.tutor = LT.mudarAjuda(jogo.tutor, preferencia(jogo.missao));
      if (!jogo.tutor.sessao.terminado) desenhar(false);
    }, 0);
  }
  const sw = doc.getElementById('ajudaSwitch');
  const nv = doc.getElementById('ajudaNivel');
  if (sw) sw.addEventListener('click', aoMudarAjuda);
  if (nv) nv.addEventListener('change', aoMudarAjuda);
  raiz.addEventListener('resize', agendarMarca);

  raiz.LabTutorUI = { abrirTrilha, jogar: (m) => jogar(m), investigar: (m) => investigar(m), sair, estado: () => (jogo ? jogo.tutor : null) };
})(window);
