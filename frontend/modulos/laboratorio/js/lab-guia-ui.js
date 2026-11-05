/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-guia-ui.js — faixa fixa da missão, "Ajuda no processo" e roteiro "Comece aqui" guiado (O1).
 *
 * Quem age é a pessoa: o sistema só aponta. Um único "!" pulsante marca o controle correto (nível Completa), um único
 * balão mostra a dica da Guia e o porquê técnico do Preceptor. O passo avança por evento (o estado da bancada muda).
 * Sem innerHTML: tudo entra como texto. Respeita prefers-reduced-motion (o "!" fica fixo) e usa alvos de 44 px.
 * Depende de LabGuia (lab-guia.js) e da ponte window.LabBancada que script.js oferece.
 */
(function (raiz) {
  'use strict';

  var G = raiz.LabGuia;
  if (!G) return;

  var doc = raiz.document;
  var ponte = null;
  var pref = G.lerPreferencia(armazenamento());
  var modo = 'missao';        // 'missao' (segue a missão atual) | 'comece' (roteiro da aspirina iniciado pela pessoa)
  var pulados = [];           // ids de passos pulados, na ordem
  var ultimaChave = '';
  var ultimoPassoId = null;
  var avisoAte = 0;
  var avisoTimer = null;
  var quadro = 0;
  var alvoAtual = null;       // elemento que recebe o contorno
  var marca = null;

  function armazenamento() {
    try { return raiz.localStorage; } catch (e) { return null; }
  }
  function el(id) { return doc.getElementById(id); }
  function reduzMovimento() {
    try { return raiz.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Retrato da bancada e escolha do roteiro
  // ---------------------------------------------------------------------------
  function roteiroAtivo() {
    if (modo === 'comece') return G.ROTEIROS.aspirina;
    var m = ponte.missao();
    var id = G.roteiroDaMissao(m.indice);
    return id ? G.ROTEIROS[id] : null;
  }

  function resolverAlvo(alvo) {
    if (!alvo) return null;
    if (alvo.indexOf('reagente:') === 0) {
      var id = alvo.slice(9);
      var radio = null;
      doc.querySelectorAll('input[name="reagenteSel"]').forEach(function (r) { if (r.value === id) radio = r; });
      return radio;
    }
    return doc.querySelector(alvo);
  }

  function visivel(no) {
    return !!no && no.getClientRects().length > 0;
  }

  function painelDe(no) {
    if (no.closest('#viewReagentes')) return 'reagentes';
    if (no.closest('#viewAnalise')) return 'analise';
    return 'bancada';
  }
  var ROTULO_PAINEL = { reagentes: 'Reagentes', analise: 'Análise', bancada: 'Bancada' };

  // ---------------------------------------------------------------------------
  // Marcação do controle: contorno + "!" pulsante (um só de cada vez)
  // ---------------------------------------------------------------------------
  function criarMarca() {
    if (marca) return marca;
    marca = doc.createElement('span');
    marca.className = 'lab-marca';
    marca.id = 'labMarca';
    marca.setAttribute('aria-hidden', 'true');
    marca.textContent = '!';
    marca.hidden = true;
    doc.body.appendChild(marca);
    return marca;
  }

  function limparAlvo() {
    if (alvoAtual) {
      alvoAtual.classList.remove('lab-alvo');
      alvoAtual.removeAttribute('aria-description');
      alvoAtual = null;
    }
    if (marca) marca.hidden = true;
  }

  function posicionarMarca() {
    if (!marca || !alvoAtual) return;
    if (!visivel(alvoAtual)) { marca.hidden = true; return; }
    var r = alvoAtual.getBoundingClientRect();
    var esq = Math.min(r.right - 12, raiz.innerWidth - 30);
    var topo = Math.max(r.top - 12, 2);
    marca.style.left = Math.max(esq, 2) + 'px';
    marca.style.top = topo + 'px';
    marca.hidden = false;
  }

  function agendarPosicao() {
    if (quadro) return;
    quadro = raiz.requestAnimationFrame(function () { quadro = 0; posicionarMarca(); });
  }

  /** Marca o controle; no celular, se o painel dele está fechado, marca o botão da barra inferior. */
  function marcar(alvoEl, mostrarMarca, rolar) {
    limparAlvo();
    if (!alvoEl || !mostrarMarca) return { caminho: null };
    var real = alvoEl.tagName === 'INPUT' && alvoEl.type === 'radio' ? (alvoEl.closest('label') || alvoEl) : alvoEl;
    var caminho = null;
    if (!visivel(real)) {
      var nav = doc.querySelector('.m-nav-btn[data-target="' + painelDe(alvoEl) + '"]');
      if (nav && visivel(nav)) { real = nav; caminho = ROTULO_PAINEL[painelDe(alvoEl)]; }
    } else if (rolar) {
      var det = alvoEl.closest && alvoEl.closest('details');
      if (det) det.open = true;
      try { real.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch (e) { /* sem rolagem */ }
    }
    real.classList.add('lab-alvo');
    real.setAttribute('aria-description', 'Indicado pela Ajuda no processo');
    alvoAtual = real;
    criarMarca();
    posicionarMarca();
    return { caminho: caminho };
  }

  // ---------------------------------------------------------------------------
  // Faixa
  // ---------------------------------------------------------------------------
  function texto(id, valor) {
    var n = el(id);
    if (n && n.textContent !== valor) n.textContent = valor;
  }
  function mostrar(id, sim) {
    var n = el(id);
    if (n) n.hidden = !sim;
  }

  function atualizarControlesDeAjuda() {
    var sw = el('ajudaSwitch');
    var nivel = el('ajudaNivel');
    if (sw) {
      sw.setAttribute('aria-checked', pref.ligada ? 'true' : 'false');
      sw.textContent = pref.ligada ? 'Ajuda no processo: ligada' : 'Ajuda no processo: desligada';
    }
    if (nivel) {
      nivel.value = pref.nivel;
      nivel.disabled = !pref.ligada;
    }
  }

  function renderizar(forcar) {
    if (!ponte) return;
    var m = ponte.missao();
    var roteiro = roteiroAtivo();
    var estado = ponte.estado();
    var apoio = G.apoioDaPreferencia(pref);
    var rot = roteiro ? G.passoAtual(roteiro, estado, pulados) : null;
    var passoId = rot && rot.passo ? rot.passo.id : (rot ? 'fim' : '-');
    var chave = [modo, m.indice, m.concluida ? 1 : 0, passoId, pref.ligada ? 1 : 0, pref.nivel, pulados.length, raiz.innerWidth >= 640 ? 'l' : 's',
      (doc.getElementById('mainGrid') || {}).getAttribute ? doc.getElementById('mainGrid').getAttribute('data-mobile-view') : ''].join('|');
    if (!forcar && chave === ultimaChave) { agendarPosicao(); return; }
    ultimaChave = chave;
    raiz.setTimeout(atualizarTopo, 0);

    atualizarControlesDeAjuda();

    var emComece = modo === 'comece';
    texto('faixaRotulo', emComece ? 'Comece aqui' : (m.indice >= m.total ? 'Missões' : 'Missão ' + (m.indice + 1) + ' de ' + m.total));
    texto('faixaTitulo', emComece ? roteiro.titulo : m.tituloCurto);

    var concluidoRoteiro = !!(rot && rot.concluido);
    var emProva = pref.ligada && pref.nivel === 'prova';
    var mostrarPassos = !!rot && !concluidoRoteiro;

    // Progresso e contagem de passos (não aparecem em Prova: dariam pista do que falta).
    var barra = el('faixaProgresso');
    if (barra) {
      var exibirBarra = !!roteiro && !emProva;
      barra.hidden = !exibirBarra;
      if (exibirBarra) barra.value = G.progressoPct(roteiro, estado, pulados);
    }

    var objetivo = emComece && roteiro ? roteiro.objetivo : m.descricao;
    var contagem = rot && !concluidoRoteiro ? 'Passo ' + (rot.indice + 1) + ' de ' + rot.total + ': ' : '';
    var linha = objetivo;
    if (!roteiro && m.concluida) linha = 'Missão concluída. Toque em Avançar para a próxima.';
    else if (roteiro && emProva) linha = 'Modo Prova: sem apoio. ' + objetivo;
    else if (concluidoRoteiro) linha = roteiro.conclusao;
    else if (roteiro && apoio.marca) linha = contagem + rot.passo.texto;
    else if (roteiro && apoio.balao) linha = contagem + objetivo;
    texto('faixaPasso', linha);

    // Balão único: dica da Guia e porquê do Preceptor.
    var balaoVisivel = apoio.balao && !concluidoRoteiro && (!!rot || !m.concluida);
    var guia = '';
    var porque = '';
    if (apoio.balao && rot && rot.passo) {
      guia = rot.passo.dica;
      porque = rot.passo.porque;
    } else if (apoio.balao && !roteiro && !m.concluida) {
      guia = 'Esta missão é livre: explore a bancada. Para um roteiro guiado, toque em "Comece aqui".';
    } else {
      balaoVisivel = false;
    }
    mostrar('labBalao', balaoVisivel);
    if (balaoVisivel && Date.now() >= avisoAte) {
      texto('balaoGuia', guia);
      texto('balaoPorque', porque);
      mostrar('balaoPorqueWrap', !!porque);
      el('labBalao').classList.remove('faixa-balao--aviso');
    }

    // Botões da faixa.
    var ajudando = mostrarPassos && apoio.balao;
    mostrar('btnPassoVoltar', ajudando);
    mostrar('btnPassoRepetir', ajudando);
    mostrar('btnPassoPular', ajudando);
    var voltar = el('btnPassoVoltar');
    if (voltar) voltar.disabled = pulados.length === 0;
    mostrar('btnVerAndamento', emComece && concluidoRoteiro);
    mostrar('btnSairRoteiro', emComece);
    mostrar('btnFaixaAvancar', !emComece && m.concluida && m.indice < m.total);

    // Controle correto: contorno + "!" só no nível Completa e só com passo pendente.
    var mudouDePasso = passoId !== ultimoPassoId;
    ultimoPassoId = passoId;
    if (ajudando && apoio.marca && rot.passo) {
      var res = marcar(resolverAlvo(rot.passo.alvo), true, mudouDePasso || forcar);
      if (res.caminho && balaoVisivel && Date.now() >= avisoAte) {
        texto('balaoGuia', 'Abra "' + res.caminho + '" na barra inferior. ' + guia);
      }
    } else {
      limparAlvo();
    }
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------
  function avisoForaDeOrdem(controle) {
    var roteiro = roteiroAtivo();
    var apoio = G.apoioDaPreferencia(pref);
    if (!roteiro || !apoio.balao) return;
    var rot = G.passoAtual(roteiro, ponte.estado(), pulados);
    if (rot.concluido || !G.acaoForaDeOrdem(rot.passo, controle.id)) return;
    var balao = el('labBalao');
    if (!balao) return;
    balao.hidden = false;
    balao.classList.add('faixa-balao--aviso');
    texto('balaoGuia', G.mensagemEtapaErrada(rot.passo));
    texto('balaoPorque', '');
    mostrar('balaoPorqueWrap', false);
    avisoAte = Date.now() + 4500;
    if (avisoTimer) raiz.clearTimeout(avisoTimer);
    avisoTimer = raiz.setTimeout(function () { avisoAte = 0; renderizar(true); }, 4600);
    if (!reduzMovimento()) {
      controle.classList.remove('lab-tremor');
      void controle.offsetWidth;
      controle.classList.add('lab-tremor');
      raiz.setTimeout(function () { controle.classList.remove('lab-tremor'); }, 340);
    }
  }

  function aoClicar(ev) {
    var alvo = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (alvo && G.CONTROLES_DE_ACAO.indexOf(alvo.id) >= 0) avisoForaDeOrdem(alvo);
    raiz.setTimeout(function () { renderizar(false); }, 0);
  }

  function aoMudar() { raiz.setTimeout(function () { renderizar(false); }, 0); }

  function persistir() {
    G.salvarPreferencia(armazenamento(), pref);
    renderizar(true);
  }

  function alternarAjuda() {
    pref = { ligada: !pref.ligada, nivel: pref.nivel };
    persistir();
  }
  function mudarNivel() {
    var sel = el('ajudaNivel');
    if (!sel) return;
    pref = G.normalizarPreferencia({ ligada: pref.ligada, nivel: sel.value });
    persistir();
  }

  function comecar() {
    var modal = el('comeceModal');
    if (modal) modal.style.display = 'none';
    ponte.resetar();
    modo = 'comece';
    pulados = [];
    if (!pref.ligada || pref.nivel === 'prova') {
      pref = { ligada: true, nivel: pref.nivel === 'prova' ? 'completa' : pref.nivel };
      G.salvarPreferencia(armazenamento(), pref);
    }
    renderizar(true);
  }

  function sairDoRoteiro() {
    modo = 'missao';
    pulados = [];
    renderizar(true);
  }

  function pular() {
    var roteiro = roteiroAtivo();
    if (!roteiro) return;
    var rot = G.passoAtual(roteiro, ponte.estado(), pulados);
    if (rot.concluido) return;
    pulados.push(rot.passo.id);
    renderizar(true);
  }
  function voltar() {
    if (!pulados.length) return;
    pulados.pop();
    renderizar(true);
  }
  function repetir() {
    avisoAte = 0;
    renderizar(true);
    if (marca) {
      marca.classList.remove('lab-marca--reiniciar');
      void marca.offsetWidth;
      marca.classList.add('lab-marca--reiniciar');
    }
  }

  function atualizarTopo() {
    var grade = el('mainGrid');
    if (!grade) return;
    var topo = Math.round(grade.getBoundingClientRect().top);
    if (topo > 0) doc.documentElement.style.setProperty('--lab-topo', topo + 'px');
  }

  function iniciar(pontes) {
    ponte = pontes;
    atualizarTopo();
    var ligado = G.flagLigada('labGuiado', raiz.location ? raiz.location.search : '', raiz.__labFlags || null);
    doc.documentElement.classList.toggle('lab-sem-guia', !ligado);
    if (!ligado) return;

    function ligar(id, evento, fn) {
      var n = el(id);
      if (n) n.addEventListener(evento, fn);
    }
    ligar('ajudaSwitch', 'click', alternarAjuda);
    ligar('ajudaNivel', 'change', mudarNivel);
    ligar('btnComeceIniciar', 'click', comecar);
    ligar('btnPassoVoltar', 'click', voltar);
    ligar('btnPassoPular', 'click', pular);
    ligar('btnPassoRepetir', 'click', repetir);
    ligar('btnSairRoteiro', 'click', sairDoRoteiro);
    ligar('btnVerAndamento', 'click', function () { ponte.verAndamento(); });
    ligar('btnFaixaAvancar', 'click', function () { ponte.avancarMissao(); });

    doc.addEventListener('click', aoClicar);
    doc.addEventListener('change', aoMudar);
    doc.addEventListener('input', aoMudar);
    doc.addEventListener('scroll', agendarPosicao, true);
    raiz.addEventListener('resize', function () { atualizarTopo(); ultimaChave = ''; renderizar(true); });
    renderizar(true);
  }

  raiz.LabGuiaUI = { iniciar: iniciar, atualizar: function () { renderizar(false); }, comecar: comecar, sairDoRoteiro: sairDoRoteiro };
})(window);
