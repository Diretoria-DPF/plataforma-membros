/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * regulacao-ui.js — interface do balcão simulado de controlados.
 * Só monta a tela se a flag local labRegulacao estiver ligada (?flags=labRegulacao).
 * Todo texto entra por textContent; os dados vêm dos JSON de data/ (mesma origem).
 */
(function () {
  'use strict';
  var R = window.LaiftRegulacao;
  var raiz = document.getElementById('rgRaiz');
  var elProgresso = document.getElementById('rgProgresso');
  if (!R || !raiz) return;

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k]; else if (k === 'text') el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var f = arguments[i];
      if (f == null) continue;
      el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    }
    return el;
  }
  function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function guardado() { try { return window.localStorage; } catch (e) { return null; } }
  var progresso = R.criarProgresso(guardado());
  var dados = null;
  var contador = 0;
  function uid(p) { contador += 1; return p + '-' + contador; }

  function fonte(txt) { return h('p', { class: 'rg-fonte', text: 'Fonte: ' + txt }); }
  function resultado(ok, titulo, linhas) {
    var caixa = h('div', { class: 'rg-resultado ' + (ok ? 'rg-certo' : 'rg-errado'), role: 'status' }, h('strong', { text: titulo }));
    (linhas || []).forEach(function (l) { caixa.appendChild(h('p', { text: l })); });
    return caixa;
  }
  function trocarResultado(pai, caixa) {
    var antigo = pai.querySelector('.rg-resultado');
    if (antigo) pai.removeChild(antigo);
    pai.appendChild(caixa);
  }

  function ids() {
    return dados.receitas.casos.map(function (c) { return c.id; })
      .concat(dados.escrituracao.exercicios.map(function (e) { return e.id; }), ['rotulagem', 'producao_calculo', 'producao_cq_lote_a', 'producao_cq_lote_b']);
  }
  function atualizarProgresso() {
    var r = progresso.resumo(ids());
    elProgresso.textContent = 'Seu progresso neste aparelho: ' + r.concluidos + ' de ' + r.total + ' atividades concluídas.';
  }
  function registrar(id, nota) { progresso.registrar(id, nota); atualizarProgresso(); }

  // ---------- Balcão: conferência de receituário ----------
  var DECISOES = { dispensar: 'Dispensar', recusar: 'Recusar a dispensação', contatar_prescritor: 'Contatar o prescritor antes de decidir' };

  function telaReceita(c) {
    var caixa = h('div', { class: 'rg-card' });
    var nomeDecisao = uid('decisao');
    caixa.appendChild(h('h2', { text: c.titulo }));
    caixa.appendChild(h('p', { text: c.contexto }));
    caixa.appendChild(h('p', { class: 'rg-aviso', text: 'Marque cada campo que tem problema e escolha a conduta.' }));
    var marcas = c.campos.map(function (campo) {
      var cb = h('input', { type: 'checkbox', value: campo.id });
      var rot = h('label', { class: 'rg-campo' }, cb, h('span', null, h('span', { class: 'rg-rotulo', text: campo.rotulo }), campo.valor));
      caixa.appendChild(rot);
      return cb;
    });
    var conj = h('fieldset', null, h('legend', { text: 'Conduta' }));
    var radios = R.DECISOES.map(function (d) {
      var r = h('input', { type: 'radio', name: nomeDecisao, value: d });
      conj.appendChild(h('label', { class: 'rg-campo' }, r, h('span', { text: DECISOES[d] })));
      return r;
    });
    caixa.appendChild(conj);
    var botao = h('button', { type: 'button', class: 'rg-btn rg-principal', text: 'Conferir' });
    botao.addEventListener('click', function () {
      var sel = radios.filter(function (r) { return r.checked; })[0];
      var r = R.conferirReceita(c, { problemas: marcas.filter(function (m) { return m.checked; }).map(function (m) { return m.value; }), decisao: sel ? sel.value : '' });
      var nome = function (id) { return c.campos.filter(function (x) { return x.id === id; })[0].rotulo; };
      var linhas = [];
      if (r.faltaram.length) linhas.push('Problemas que passaram despercebidos: ' + r.faltaram.map(function (id) { return nome(id) + ' (' + c.campos.filter(function (x) { return x.id === id; })[0].problema + ')'; }).join('; ') + '.');
      if (r.excedentes.length) linhas.push('Campos marcados sem problema: ' + r.excedentes.map(nome).join(', ') + '.');
      if (!r.decisaoCorreta) linhas.push('Conduta correta: ' + DECISOES[c.decisao_correta] + '.');
      linhas.push(c.explicacao);
      trocarResultado(caixa, resultado(r.aprovado, r.aprovado ? 'Conferência correta.' : 'Há pontos a rever.', linhas));
      registrar(c.id, r.nota);
    });
    caixa.appendChild(botao);
    caixa.appendChild(fonte(c.fonte));
    return caixa;
  }

  function secaoBalcao() {
    var s = h('section');
    dados.receitas.casos.forEach(function (c) { s.appendChild(telaReceita(c)); });
    return s;
  }

  // ---------- Livro e balanço ----------
  function entradaNumero(rotulo) {
    var campo = h('input', { type: 'number', step: '1', class: 'rg-entrada', inputmode: 'numeric' });
    return { campo: campo, linha: h('label', { class: 'rg-linha' }, h('span', { text: rotulo }), campo) };
  }

  function telaExercicio(e) {
    var caixa = h('div', { class: 'rg-card' });
    caixa.appendChild(h('h2', { text: e.titulo }));
    caixa.appendChild(h('p', { text: e.medicamento + '. Estoque inicial: ' + e.estoque_inicial + ' ' + e.unidade + '. Contagem física no fechamento: ' + e.contagem_fisica + '.' }));
    var tab = h('table', { class: 'rg-tabela' }, h('thead', null, h('tr', null, h('th', { text: 'Movimento' }), h('th', { text: 'Documento' }), h('th', { class: 'rg-num', text: 'Quantidade' }))));
    var corpo = h('tbody');
    e.movimentos.forEach(function (m) {
      corpo.appendChild(h('tr', null, h('td', { text: m.tipo }), h('td', { text: m.documento }), h('td', { class: 'rg-num', text: String(m.qtd) })));
    });
    tab.appendChild(corpo);
    caixa.appendChild(tab);
    var saldo = entradaNumero('Saldo escriturado no livro');
    var dif = entradaNumero('Divergência (contagem menos livro)');
    caixa.appendChild(saldo.linha);
    caixa.appendChild(dif.linha);
    var botao = h('button', { type: 'button', class: 'rg-btn rg-principal', text: 'Conferir' });
    botao.addEventListener('click', function () {
      var r = R.conferirBalanco(e, { saldo_escriturado: saldo.campo.value === '' ? NaN : Number(saldo.campo.value), divergencia: dif.campo.value === '' ? NaN : Number(dif.campo.value) });
      var linhas = ['Saldo do livro: ' + r.esperado.saldo_escriturado + '. Divergência: ' + r.esperado.divergencia + '.', e.explicacao];
      trocarResultado(caixa, resultado(r.aprovado, r.aprovado ? 'Balanço correto.' : 'Refaça a conta.', linhas));
      registrar(e.id, r.aprovado ? 1 : 0.5);
    });
    caixa.appendChild(botao);
    caixa.appendChild(fonte(e.fonte));
    return caixa;
  }

  function secaoLivro() {
    var s = h('section');
    s.appendChild(h('p', { class: 'rg-aviso', text: 'Entrada soma, saída e perda subtraem. A divergência é a contagem física menos o saldo do livro.' }));
    dados.escrituracao.exercicios.forEach(function (e) { s.appendChild(telaExercicio(e)); });
    return s;
  }

  // ---------- Rotulagem ----------
  function secaoRotulagem() {
    var s = h('section');
    var caixa = h('div', { class: 'rg-card' }, h('h2', { text: 'Tarja por lista' }), h('p', { text: 'Para cada lista, escolha a cor da tarja do rótulo.' }));
    var seletores = dados.norma.rotulagem.map(function (t) {
      var sel = h('select', { class: 'rg-entrada' }, h('option', { value: '', text: 'Escolha' }), h('option', { value: 'preta', text: 'Preta' }), h('option', { value: 'vermelha', text: 'Vermelha' }));
      caixa.appendChild(h('label', { class: 'rg-linha' }, h('span', { text: 'Lista ' + t.lista }), sel));
      return { t: t, sel: sel };
    });
    var botao = h('button', { type: 'button', class: 'rg-btn rg-principal', text: 'Conferir' });
    botao.addEventListener('click', function () {
      var erradas = seletores.filter(function (x) { return x.sel.value !== x.t.tarja; });
      var linhas = dados.norma.rotulagem.map(function (t) { return 'Lista ' + t.lista + ': tarja ' + t.tarja + '. ' + t.frase; });
      trocarResultado(caixa, resultado(!erradas.length, erradas.length ? erradas.length + ' lista(s) com tarja errada ou em branco.' : 'Todas as tarjas corretas.', linhas));
      registrar('rotulagem', (seletores.length - erradas.length) / seletores.length);
    });
    caixa.appendChild(botao);
    caixa.appendChild(fonte(dados.norma.rotulagem[0].fonte));
    s.appendChild(caixa);
    return s;
  }

  // ---------- Produção do medicamento (farmacotécnica) ----------
  function secaoProducao() {
    var p = dados.producao.processo;
    var s = h('section');
    s.appendChild(h('div', { class: 'rg-card' }, h('h2', { text: p.titulo }), h('p', { text: p.resumo })));
    p.etapas.forEach(function (e, i) {
      var d = h('details', { class: 'rg-card rg-etapa' }, h('summary', { text: (i + 1) + '. ' + e.titulo }),
        h('p', null, h('strong', { text: 'O que está acontecendo: ' }), e.o_que_acontece),
        h('p', null, h('strong', { text: 'Por quê: ' }), e.porque),
        h('p', null, h('strong', { text: 'Como verificar: ' }), e.verificacao),
        h('p', null, h('strong', { text: 'Erro comum: ' }), e.erro_comum));
      s.appendChild(d);
    });
    // cálculo de enchimento
    var calc = h('div', { class: 'rg-card' }, h('h2', { text: 'Cálculo de enchimento' }),
      h('p', { text: 'Exemplo: ' + p.exemplo.n + ' cápsulas de ' + p.exemplo.dose_mg + ' mg, insumo com teor de ' + p.exemplo.teor_pc + ' % e cápsula com ' + p.exemplo.massa_cap_mg + ' mg de enchimento. Quantos mg de insumo pesar no total?' }));
    var resp = entradaNumero('Insumo total (mg), duas casas decimais');
    resp.campo.step = '0.01';
    calc.appendChild(resp.linha);
    var bc = h('button', { type: 'button', class: 'rg-btn rg-principal', text: 'Conferir' });
    bc.addEventListener('click', function () {
      var r = R.calcularEnchimento(p.exemplo);
      var ok = Math.abs(Number(resp.campo.value) - r.insumo_mg) < 0.02;
      trocarResultado(calc, resultado(ok, ok ? 'Cálculo correto.' : 'Refaça o cálculo.', ['Insumo: ' + r.insumo_mg.toFixed(2) + ' mg. Excipiente: ' + r.excipiente_mg.toFixed(2) + ' mg. Total: ' + r.total_mg.toFixed(0) + ' mg.']));
      registrar('producao_calculo', ok ? 1 : 0.5);
    });
    calc.appendChild(bc);
    calc.appendChild(fonte('Cálculo farmacotécnico padrão; valores do exemplo são didáticos.'));
    s.appendChild(calc);
    // controle de qualidade por peso
    p.lotes_cq.forEach(function (lote) {
      var cq = h('div', { class: 'rg-card' }, h('h2', { text: 'Controle de qualidade: ' + lote.id.replace('_', ' ') }),
        h('p', { text: 'Peso alvo ' + lote.alvo_mg + ' mg, tolerância de ' + p.tolerancia_peso_pc + ' % por unidade. Pesos (mg): ' + lote.pesos_mg.join(', ') + '.' }));
      var nome = uid('cq');
      var conj = h('fieldset', null, h('legend', { text: 'O lote' }));
      var rs = [['aprovar', 'Aprovar'], ['reprovar', 'Reprovar']].map(function (par) {
        var r = h('input', { type: 'radio', name: nome, value: par[0] });
        conj.appendChild(h('label', { class: 'rg-campo' }, r, h('span', { text: par[1] })));
        return r;
      });
      cq.appendChild(conj);
      var b = h('button', { type: 'button', class: 'rg-btn rg-principal', text: 'Conferir' });
      b.addEventListener('click', function () {
        var av = R.avaliarPesos(lote.pesos_mg, lote.alvo_mg, p.tolerancia_peso_pc);
        var sel = rs.filter(function (r) { return r.checked; })[0];
        var ok = !!sel && (sel.value === 'aprovar') === av.aprovado;
        var linhas = ['Média: ' + av.media.toFixed(1) + ' mg.'];
        linhas.push(av.fora.length ? 'Fora do limite: ' + av.fora.map(function (f) { return f.peso + ' mg (' + f.desvio_pc.toFixed(1) + ' %)'; }).join(', ') + '. Uma unidade fora já reprova; a média não compensa.' : 'Nenhuma unidade fora do limite.');
        trocarResultado(cq, resultado(ok, ok ? 'Decisão correta.' : 'Confira unidade por unidade.', linhas));
        registrar('producao_cq_' + lote.id, ok ? 1 : 0.5);
      });
      cq.appendChild(b);
      cq.appendChild(fonte(p.tolerancia_fonte));
      s.appendChild(cq);
    });
    return s;
  }

  // ---------- Consulta ----------
  function secaoConsulta() {
    var n = dados.norma;
    var s = h('section');
    s.appendChild(h('p', { class: 'rg-aviso', text: n.aviso }));
    var rec = h('div', { class: 'rg-card' }, h('h2', { text: 'Receituários' }));
    n.receituarios.forEach(function (r) {
      rec.appendChild(h('p', null, h('strong', { text: r.nome + ' (' + r.cor + '): ' }), 'listas ' + r.listas.join(', ') + '; validade de ' + r.validade_dias + ' dias; tratamento de até ' + r.tratamento_max_dias + ' dias. ' + r.retencao));
      rec.appendChild(fonte(r.fonte));
    });
    s.appendChild(rec);
    [['Escrituração', n.escrituracao], ['Balanços', n.balancos], ['Guarda e descarte', n.guarda_descarte]].forEach(function (par) {
      var c = h('div', { class: 'rg-card' }, h('h2', { text: par[0] }));
      par[1].forEach(function (it) {
        c.appendChild(h('p', null, h('strong', { text: it.titulo + ': ' }), it.texto));
        c.appendChild(fonte(it.fonte));
      });
      s.appendChild(c);
    });
    return s;
  }

  // ---------- Abas ----------
  var ABAS = [['balcao', 'Balcão', secaoBalcao], ['livro', 'Livro e balanço', secaoLivro], ['rotulagem', 'Rotulagem', secaoRotulagem], ['producao', 'Produção', secaoProducao], ['consulta', 'Consulta', secaoConsulta]];

  function montar() {
    limpar(raiz);
    var barra = h('div', { class: 'rg-abas', role: 'tablist' });
    var painel = h('div', { role: 'tabpanel' });
    var botoes = ABAS.map(function (a) {
      var b = h('button', { type: 'button', class: 'rg-aba', role: 'tab', text: a[1], 'aria-selected': 'false' });
      b.addEventListener('click', function () { abrir(a[0]); });
      barra.appendChild(b);
      return b;
    });
    function abrir(id) {
      ABAS.forEach(function (a, i) { botoes[i].setAttribute('aria-selected', a[0] === id ? 'true' : 'false'); });
      limpar(painel);
      painel.appendChild(ABAS.filter(function (a) { return a[0] === id; })[0][2]());
    }
    raiz.appendChild(barra);
    raiz.appendChild(painel);
    abrir('balcao');
    atualizarProgresso();
  }

  function aviso(txt) { limpar(raiz); raiz.appendChild(h('p', { text: txt })); }

  function carregar(nome) {
    return fetch('data/' + nome, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('falha ' + nome);
      return r.json();
    });
  }

  if (!R.flagLigada('labRegulacao', window.location.search, window.__labFlags)) {
    aviso('Este recurso ainda não está disponível.');
    return;
  }
  Promise.all(['portaria-344.json', 'receitas.json', 'escrituracao.json', 'producao.json'].map(carregar)).then(function (v) {
    dados = { norma: v[0], receitas: v[1], escrituracao: v[2], producao: v[3] };
    montar();
  }).catch(function () { aviso('Não foi possível carregar o conteúdo agora. Tente novamente em instantes.'); });
})();
