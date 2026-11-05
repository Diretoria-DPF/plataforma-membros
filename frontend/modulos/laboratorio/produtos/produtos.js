/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * produtos.js — interface de Produtos e Controle de qualidade do Laboratório (O5).
 * Só monta a tela se a flag local labProdutos estiver ligada (?flags=labProdutos).
 * Todo texto entra por textContent; os dados vêm dos JSON de ../data (mesma origem).
 * A execução passo a passo dos processos entra no Laboratório pela integração com o script.js (depois da O3).
 */
(function () {
  'use strict';
  var raiz = document.getElementById('prRaiz');
  var Reg = window.LabProdutos;
  var CQ = window.LabCq;
  var FC = window.LabFarmaCalculos;
  if (!raiz || !Reg || !CQ || !FC) return;

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
  function fmt(v, c) { return Number(v).toFixed(c === undefined ? 2 : c).replace('.', ','); }
  function numeros(txt) {
    return String(txt || '').split(/[\s;]+/).map(function (x) { return x.trim().replace(',', '.'); }).filter(Boolean).map(Number);
  }
  function buscarJson(caminho) {
    return fetch(caminho, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('falha ao carregar ' + caminho);
      return r.json();
    });
  }
  function lista(itens, classe) {
    var ul = h('ul', { class: classe || 'pr-lista-simples' });
    itens.forEach(function (t) { ul.appendChild(h('li', { text: t })); });
    return ul;
  }
  function aviso(texto, tipo) { return h('div', { class: 'pr-resultado ' + (tipo || 'pr-certo'), role: 'status', text: texto }); }
  function trocar(pai, novo) { var a = pai.querySelector('.pr-resultado'); if (a) pai.removeChild(a); pai.appendChild(novo); }

  var painel = h('div');
  var abas = h('div', { class: 'pr-abas', role: 'tablist' });
  var corpo = h('div');
  var estado = { aba: 'produtos', produto: null };

  if (!Reg.flagLigada(window.location.search)) {
    limpar(raiz);
    raiz.appendChild(h('p', { class: 'pr-aviso', text: 'Este recurso ainda não está disponível.' }));
    return;
  }

  // ── Produtos ──────────────────────────────────────────────────────────────
  function detalhe(p, alvo) {
    limpar(alvo);
    alvo.appendChild(h('p', { text: 'Carregando o processo...' }));
    buscarJson('../data/processos/' + p.id + '.json').then(function (proc) {
      limpar(alvo);
      alvo.appendChild(h('h2', { text: proc.titulo }));
      alvo.appendChild(h('p', { class: 'pr-sub', text: 'Nível ' + proc.nivel + ' de 8. Duração simulada: ' + (proc.duracaoSimuladaMin || '-') + ' minutos.' }));
      if (proc.objetivos) { alvo.appendChild(h('h3', { text: 'Objetivos' })); alvo.appendChild(lista(proc.objetivos)); }
      if (proc.formulacao) {
        alvo.appendChild(h('h3', { text: 'Formulação ' + proc.formulacao.base }));
        var tab = h('table', { class: 'pr-tabela' }, h('thead', null, h('tr', null, h('th', { text: 'Componente' }), h('th', { text: 'Função' }), h('th', { class: 'pr-num', text: 'Quantidade' }))));
        var tb = h('tbody');
        proc.formulacao.itens.forEach(function (it) {
          tb.appendChild(h('tr', null, h('td', { text: it.especie.replace(/_[a-z]+$/, '') }), h('td', { text: it.funcao }), h('td', { class: 'pr-num', text: (it.quantidade.qsp ? 'q.s.p. ' : '') + String(it.quantidade.valor).replace('.', ',') + ' ' + it.quantidade.unidade })));
        });
        tab.appendChild(tb);
        alvo.appendChild(tab);
      }
      if (proc.fontesOficiais) { alvo.appendChild(h('h3', { text: 'Fontes oficiais' })); alvo.appendChild(lista(proc.fontesOficiais.map(function (f) { return f.tipo + ': ' + f.citacao; }))); }
      if (proc.cq) { alvo.appendChild(h('h3', { text: 'Controle de qualidade' })); alvo.appendChild(lista(proc.cq.map(function (c) { return c.ensaio + ': ' + c.criterio; }))); }
      alvo.appendChild(h('h3', { text: 'Etapas' }));
      proc.etapas.forEach(function (e, i) {
        var d = h('details', { class: 'pr-etapa' }, h('summary', { text: (i + 1) + '. ' + e.titulo }));
        d.appendChild(h('p', null, h('strong', { text: 'O que está acontecendo: ' }), e.oQueEstaAcontecendo));
        d.appendChild(h('p', null, h('strong', { text: 'Por quê: ' }), e.porQue));
        if (e.calculoPrevio) d.appendChild(h('p', null, h('strong', { text: 'Cálculo: ' }), e.calculoPrevio.pergunta + ' (' + e.calculoPrevio.formula + ')'));
        (e.errosComuns || []).forEach(function (x) {
          d.appendChild(h('p', { class: 'pr-erro' }, h('strong', { text: 'Erro comum: ' }), x.explicacao + ' Como fazer certo: ' + x.correcao));
        });
        alvo.appendChild(d);
      });
    }).catch(function () { limpar(alvo); alvo.appendChild(aviso('Não foi possível carregar este processo agora.', 'pr-errado')); });
  }

  function telaProdutos() {
    var raizP = h('div');
    var det = h('div', { class: 'pr-card' });
    var grupos = Reg.porSetor();
    Object.keys(Reg.SETORES).forEach(function (s) {
      if (!grupos[s].length) return;
      raizP.appendChild(h('h2', { text: Reg.SETORES[s] }));
      var ul = h('ul', { class: 'pr-lista' });
      grupos[s].forEach(function (p) {
        var b = h('button', { type: 'button', class: 'pr-btn', text: p.titulo });
        b.addEventListener('click', function () { estado.produto = p.id; detalhe(p, det); det.scrollIntoView(); });
        ul.appendChild(h('li', null, b));
      });
      raizP.appendChild(ul);
    });
    raizP.appendChild(det);
    var inicial = new URLSearchParams(window.location.search).get('produto');
    var p0 = inicial && Reg.buscar(inicial);
    if (p0) detalhe(p0, det);
    return raizP;
  }

  // ── Controle de qualidade ─────────────────────────────────────────────────
  function linhaEntrada(rotulo, classe, valor) {
    var campo = h('input', { type: 'text', inputmode: 'decimal', class: 'pr-entrada ' + (classe || ''), value: valor || '' });
    return { campo: campo, linha: h('label', { class: 'pr-linha' }, h('span', { text: rotulo }), campo) };
  }
  function calculadoraCQ(titulo, entradas, botao, calcular) {
    var card = h('div', { class: 'pr-card' }, h('h3', { text: titulo }));
    entradas.forEach(function (e) { card.appendChild(e.linha); });
    var b = h('button', { type: 'button', class: 'pr-btn pr-principal', text: botao });
    b.addEventListener('click', function () {
      try { var r = calcular(); trocar(card, aviso(r.texto, r.ok === false ? 'pr-errado' : 'pr-certo')); }
      catch (e) { trocar(card, aviso(e.message, 'pr-errado')); }
    });
    card.appendChild(b);
    return card;
  }

  function telaCQ() {
    var s = h('div');
    s.appendChild(h('h2', { text: 'Calculadoras de ensaio' }));
    var pesos = linhaEntrada('Pesos individuais (mg), 20 unidades, separados por espaço', 'pr-larga');
    var tipo = h('select', { class: 'pr-entrada' }, h('option', { value: 'capsula', text: 'Cápsula' }), h('option', { value: 'comprimido', text: 'Comprimido' }));
    s.appendChild(calculadoraCQ('Peso médio', [pesos, { linha: h('label', { class: 'pr-linha' }, h('span', { text: 'Forma' }), tipo) }], 'Calcular', function () {
      var r = CQ.pesoMedio(numeros(pesos.campo.value), tipo.value);
      return { ok: r.aprovado, texto: 'Peso médio ' + fmt(r.mediaMg, 1) + ' mg; limite individual ±' + fmt(r.limitePct, 1) + ' % (' + fmt(r.inferiorMg, 1) + ' a ' + fmt(r.superiorMg, 1) + ' mg). Fora do limite: ' + r.fora + '; fora do dobro: ' + r.foraDobro + '. ' + (r.aprovado ? 'Dentro do critério.' : 'Fora do critério.') };
    }));
    var teores = linhaEntrada('Teor de cada unidade (% do declarado), 10 unidades', 'pr-larga');
    s.appendChild(calculadoraCQ('Uniformidade de doses unitárias', [teores], 'Calcular', function () {
      var r = CQ.uniformidadeDoses(numeros(teores.campo.value));
      return { ok: r.aprovado, texto: 'Média ' + fmt(r.mediaPct, 1) + ' %; desvio padrão ' + fmt(r.desvioPadraoPct, 2) + '; valor de aceitação ' + fmt(r.valorAceitacao, 1) + ' (limite ' + r.L1 + '). ' + (r.aprovado ? 'Dentro do critério.' : 'Fora do critério: repita com 30 unidades.') };
    }));
    var vg = linhaEntrada('Volume gasto (mL)'); var cm = linhaEntrada('Concentração do titulante (mol/L)', '', '0,1'); var mm = linhaEntrada('Massa molar do analito (g/mol)'); var ma = linhaEntrada('Massa da amostra (g)'); var rz = linhaEntrada('Razão analito:titulante', '', '1'); var fc = linhaEntrada('Fator de correção do titulante', '', '1');
    s.appendChild(calculadoraCQ('Teor por titulação', [vg, cm, mm, ma, rz, fc], 'Calcular', function () {
      var r = CQ.teorTitulacao({ volumeGastoMl: numeros(vg.campo.value)[0], concMolL: numeros(cm.campo.value)[0], massaMolar: numeros(mm.campo.value)[0], massaAmostraG: numeros(ma.campo.value)[0], razao: numeros(rz.campo.value)[0], fatorCorrecaoTitulante: numeros(fc.campo.value)[0] });
      return { texto: 'Massa do analito ' + fmt(r.massaAnalitoG, 4) + ' g; teor ' + fmt(r.teorPct, 2) + ' % na amostra.' };
    }));
    var dis = linhaEntrada('Percentual dissolvido de cada unidade (6, 12 ou 24 valores)', 'pr-larga'); var q = linhaEntrada('Q (%)', '', '80');
    s.appendChild(calculadoraCQ('Dissolução em estágios', [dis, q], 'Avaliar', function () {
      var r = CQ.dissolucaoEstagios(numeros(dis.campo.value), numeros(q.campo.value)[0]);
      return { ok: r.aprovado, texto: 'Estágio ' + r.estagio + ': média ' + fmt(r.mediaPct, 1) + ' % com ' + r.unidades + ' unidades. ' + (r.aprovado ? 'Aprovado.' : (r.precisaS2 ? 'Não aprovado em S1: teste mais 6 unidades.' : (r.precisaS3 ? 'Não aprovado em S2: teste mais 12 unidades.' : 'Reprovado.'))) };
    }));
    s.appendChild(h('h2', { text: 'Ensaios e critérios' }));
    var area = h('div', null, h('p', { text: 'Carregando os ensaios...' }));
    s.appendChild(area);
    buscarJson('../data/cq/ensaios.json').then(function (d) {
      limpar(area);
      d.ensaios.forEach(function (e) {
        var det = h('details', { class: 'pr-etapa' }, h('summary', { text: e.nome }));
        det.appendChild(h('p', null, h('strong', { text: 'O que mede: ' }), e.oQueMede));
        det.appendChild(h('p', { text: 'Método:' })); det.appendChild(lista(e.metodo));
        det.appendChild(h('p', null, h('strong', { text: 'Cálculo: ' }), e.calculo));
        det.appendChild(h('p', null, h('strong', { text: 'Critério de aprovação: ' }), e.criterio));
        e.errosComuns.forEach(function (x) { det.appendChild(h('p', { class: 'pr-erro' }, h('strong', { text: 'Erro comum: ' }), x.erro + '. Consequência: ' + x.consequencia)); });
        det.appendChild(h('p', { class: 'pr-fonte', text: 'Fonte: ' + e.referencia }));
        area.appendChild(det);
      });
    }).catch(function () { limpar(area); area.appendChild(aviso('Não foi possível carregar os ensaios agora.', 'pr-errado')); });
    return s;
  }

  // ── Calculadoras de farmacotécnica ────────────────────────────────────────
  function telaCalculos() {
    var s = h('div');
    var teor = linhaEntrada('Teor da matéria-prima (%)', '', '98'); var dose = linhaEntrada('Dose por unidade (mg)', '', '100'); var un = linhaEntrada('Unidades', '', '30'); var exc = linhaEntrada('Excesso para perdas (%)', '', '10');
    s.appendChild(calculadoraCQ('Fator de correção e massa do ativo', [teor, dose, un, exc], 'Calcular', function () {
      var t = numeros(teor.campo.value)[0];
      var g = FC.massaAtivoG({ doseMg: numeros(dose.campo.value)[0], unidades: numeros(un.campo.value)[0], teorPct: t }) * (1 + numeros(exc.campo.value)[0] / 100);
      return { texto: 'Fator de correção ' + fmt(FC.fatorCorrecao(t), 4) + '. Massa de ativo a pesar: ' + fmt(g, 3) + ' g.' };
    }));
    var ms = linhaEntrada('Massa molar do sal (g/mol)'); var mb = linhaEntrada('Massa molar da base (g/mol)');
    s.appendChild(calculadoraCQ('Fator de equivalência sal/base', [ms, mb], 'Calcular', function () {
      return { texto: 'Fator de equivalência ' + fmt(FC.fatorEquivalencia(numeros(ms.campo.value)[0], numeros(mb.campo.value)[0]), 4) + ': massa do sal = massa da base × este fator.' };
    }));
    var al = linhaEntrada('Teor desejado (% p/p)', '', '70'); var mf = linhaEntrada('Massa final (g)', '', '200'); var tm = linhaEntrada('Teor da matéria-prima (% p/p)', '', '92,8');
    s.appendChild(calculadoraCQ('Teor de álcool (massa da matéria-prima)', [al, mf, tm], 'Calcular', function () {
      return { texto: 'Massa de matéria-prima: ' + fmt(FC.massaParaTeorPp(numeros(al.campo.value)[0], numeros(mf.campo.value)[0], numeros(tm.campo.value)[0]), 2) + ' g.' };
    }));
    var ce = linhaEntrada('Concentração do estoque (%)', '', '2,5'); var cf = linhaEntrada('Concentração final (%)', '', '0,1'); var mfi = linhaEntrada('Massa final (g)', '', '1000');
    s.appendChild(calculadoraCQ('Diluição em massa (C1·m1 = C2·m2)', [ce, cf, mfi], 'Calcular', function () {
      return { texto: 'Massa de estoque: ' + fmt(FC.massaEstoqueDiluicao(numeros(ce.campo.value)[0], numeros(cf.campo.value)[0], numeros(mfi.campo.value)[0]), 2) + ' g.' };
    }));
    return s;
  }

  var TELAS = { produtos: ['Produtos', telaProdutos], cq: ['Controle de qualidade', telaCQ], calculos: ['Cálculos', telaCalculos] };
  function desenhar() {
    limpar(abas); limpar(corpo);
    Object.keys(TELAS).forEach(function (k) {
      var b = h('button', { type: 'button', class: 'pr-aba', role: 'tab', 'aria-selected': String(k === estado.aba), text: TELAS[k][0] });
      b.addEventListener('click', function () { estado.aba = k; desenhar(); });
      abas.appendChild(b);
    });
    corpo.appendChild(TELAS[estado.aba][1]());
  }
  limpar(raiz);
  painel.appendChild(abas); painel.appendChild(corpo);
  raiz.appendChild(painel);
  desenhar();
})();
