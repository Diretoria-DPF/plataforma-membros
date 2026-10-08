/* Lia Lab - ajuste interativo da arte da Lia.
 * Script classico (nao modulo) para funcionar com duplo clique (file://).
 * Sem innerHTML: markup estatico vem do lab.html; valores dinamicos vao por setProperty/setAttribute/textContent.
 */
(function () {
  'use strict';

  // Geometria do lia.svg (unidades do viewBox 200x300).
  var BASE_SAPATOS = 277;      // base da arte sem pernas extras
  var ALTURA_CABECA = 118;     // topo do cabelo ate a base da cabeca, com escala 1
  var PESCOCO_PADRAO = 10;
  var BASE_TRONCO = 188;       // ombro, sem deslocamento

  function arred(v, casas) {
    var f = Math.pow(10, casas);
    return Math.round(v * f) / f;
  }

  // Preset: cabeca = 1/razao da altura total (topo do cabelo ate os sapatos).
  // A escala e arredondada e as pernas fecham a base exatamente em BASE_SAPATOS.
  function presetPorRazao(razao, topo) {
    var escala = arred((BASE_SAPATOS - topo) / razao / ALTURA_CABECA, 3);
    var base = topo + ALTURA_CABECA * escala;
    return {
      topo: topo,
      escala: escala,
      pescoco: PESCOCO_PADRAO,
      pernas: arred(BASE_TRONCO - base - PESCOCO_PADRAO, 2)
    };
  }

  var PRESETS = {
    atual: { topo: 60, escala: 1, pescoco: 10, pernas: 0 },
    chibi: presetPorRazao(3, 20),
    estilizada: presetPorRazao(4, 20),
    equilibrada: presetPorRazao(5, 20)
  };

  var PALETAS = {
    marca: { claro: '#0f6f62', escuro: '#3fcfb6' },
    oceano: { claro: '#1d5fa6', escuro: '#6aa9ec' },
    ambar: { claro: '#b8560f', escuro: '#f0a070' },
    ameixa: { claro: '#6b3fa0', escuro: '#b594e6' }
  };

  var PADRAO_RESERVA = {
    topo: 20, escala: 0.544, pescoco: 10, pernas: 93.81,
    ombros: 1, bracos: 1, olhos: 1, distancia: 0, traco: 1.5, raio: 4, mechaX: 0, mechaY: 0
  };

  var sonda = document.getElementById('sonda');
  var modelo = document.getElementById('lia-src').content.querySelector('svg');
  var botaoTema = document.getElementById('btn-tema');
  var painelExport = document.getElementById('painel-export');
  var textoExport = document.getElementById('export-texto');
  var statusEl = document.getElementById('status');
  var razaoEl = document.getElementById('o-razao');

  var SLIDERS = Array.prototype.map.call(document.querySelectorAll('input[type="range"][data-geo]'), function (el) {
    return {
      el: el,
      geo: el.getAttribute('data-geo'),
      dec: parseInt(el.getAttribute('data-dec'), 10),
      out: document.querySelector('output[for="' + el.id + '"]')
    };
  });

  // ---------- leitura e escrita dos controles ----------

  function formata(v, casas) {
    return v.toFixed(casas).replace('.', ',');
  }

  function lerGeo() {
    var g = {};
    SLIDERS.forEach(function (s) { g[s.geo] = parseFloat(s.el.value); });
    return g;
  }

  function escreverGeo(g) {
    SLIDERS.forEach(function (s) {
      s.el.value = String(g[s.geo]);
    });
  }

  function atualizarSaidas() {
    SLIDERS.forEach(function (s) {
      if (s.out) s.out.textContent = formata(parseFloat(s.el.value), s.dec);
    });
  }

  function valorSel(id) {
    return document.getElementById(id).value;
  }

  function marcado(nome) {
    var r = document.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : '';
  }

  function lerExpressao() {
    var cenas = [];
    document.querySelectorAll('input[name="cena"]:checked').forEach(function (c) { cenas.push(c.value); });
    return {
      estado: valorSel('sel-estado'),
      emocao: valorSel('sel-emocao'),
      boca: valorSel('sel-boca'),
      bracoEsq: valorSel('sel-braco-esq'),
      bracoDir: valorSel('sel-braco-dir'),
      prop: valorSel('sel-prop'),
      acessorio: marcado('acessorio'),
      paleta: marcado('paleta'),
      cenaAuto: document.getElementById('cena-auto').checked,
      cenas: cenas
    };
  }

  // ---------- proporcao ----------

  // Razao cabeca:corpo = altura total / altura da cabeca (mesma conta do lia.css).
  function razaoCabecaCorpo(g) {
    var hb = g.topo + ALTURA_CABECA * g.escala;
    var dy = hb + g.pescoco - BASE_TRONCO;
    var base = BASE_SAPATOS + dy + g.pernas;
    return (base - g.topo) / (ALTURA_CABECA * g.escala);
  }

  function mesmoPreset(g, p) {
    var tol = 0.005;
    return Math.abs(g.topo - p.topo) < tol && Math.abs(g.escala - p.escala) < tol &&
      Math.abs(g.pescoco - p.pescoco) < tol && Math.abs(g.pernas - p.pernas) < tol;
  }

  function marcarPresetAtivo(g) {
    document.querySelectorAll('[data-aplicar]').forEach(function (b) {
      var p = PRESETS[b.getAttribute('data-aplicar')];
      b.setAttribute('aria-pressed', String(mesmoPreset(g, p)));
    });
  }

  // ---------- aplicacao na arte ----------

  function definirAtributo(el, nome, valor) {
    if (valor) el.setAttribute(nome, valor);
    else el.removeAttribute(nome);
  }

  function valorCenas(e) {
    if (e.cenaAuto) return '';
    return e.cenas.length ? e.cenas.join(' ') : 'none';
  }

  function corAcento(paleta) {
    var cor = PALETAS[paleta] || PALETAS.marca;
    var escuro = document.documentElement.getAttribute('data-theme') === 'dark';
    return escuro ? cor.escuro : cor.claro;
  }

  function aplicarHost(host, g, e, opcoes) {
    var st = host.style;
    st.setProperty('--lia-top', String(g.topo));
    st.setProperty('--lia-head-scale', String(g.escala));
    st.setProperty('--lia-neck', String(g.pescoco));
    st.setProperty('--lia-leg-len', String(g.pernas));
    st.setProperty('--lia-shoulder', String(g.ombros));
    st.setProperty('--lia-arm-len', String(g.bracos));
    st.setProperty('--lia-eye-size', String(g.olhos));
    st.setProperty('--lia-eye-gap', String(g.distancia));
    st.setProperty('--lia-stroke', String(g.traco));
    st.setProperty('--lia-radius', g.raio + 'px');
    st.setProperty('--lia-lock-x', String(g.mechaX));
    st.setProperty('--lia-lock-y', String(g.mechaY));
    var acento = corAcento(e.paleta);
    st.setProperty('--lia-accent', acento);
    st.setProperty('--lia-glow', acento);

    definirAtributo(host, 'data-state', opcoes.estado);
    definirAtributo(host, 'data-accessory', e.acessorio === 'glasses' ? 'glasses' : '');
    var completo = opcoes.completo;
    definirAtributo(host, 'data-emotion', completo ? e.emocao : '');
    definirAtributo(host, 'data-mouth', completo ? e.boca : '');
    definirAtributo(host, 'data-arm-left', completo ? e.bracoEsq : '');
    definirAtributo(host, 'data-arm-right', completo ? e.bracoDir : '');
    definirAtributo(host, 'data-prop', completo ? e.prop : '');
    definirAtributo(host, 'data-scene', completo ? valorCenas(e) : '');
  }

  function atualizar() {
    var g = lerGeo();
    var e = lerExpressao();
    atualizarSaidas();
    razaoEl.textContent = '1 : ' + formata(razaoCabecaCorpo(g), 1);

    document.querySelectorAll('[data-lia]').forEach(function (host) {
      var tipo = host.getAttribute('data-lia');
      if (tipo === 'preset') {
        // Preset so define a proporcao; ombros, bracos, olhos etc. seguem os controles.
        var geoPreset = Object.assign({}, g, PRESETS[host.getAttribute('data-preset')]);
        aplicarHost(host, geoPreset, e, { estado: e.estado, completo: true });
      } else if (tipo === 'galeria') {
        aplicarHost(host, g, e, { estado: host.getAttribute('data-state'), completo: false });
      } else {
        aplicarHost(host, g, e, { estado: e.estado, completo: true });
      }
    });

    marcarPresetAtivo(g);
    if (!painelExport.hidden) preencherExportacao();
  }

  // ---------- exportacao ----------

  function nomeDoPreset(g) {
    var nomes = { atual: 'Atual', chibi: 'Chibi suave (1:3)', estilizada: 'Estilizada (1:4)', equilibrada: 'Equilibrada (1:5)' };
    var achado = Object.keys(PRESETS).filter(function (k) { return mesmoPreset(g, PRESETS[k]); })[0];
    return achado ? nomes[achado] : 'Personalizado';
  }

  function montarCss(g, e) {
    var linhas = [
      '.lia {',
      '  --lia-top: ' + arred(g.topo, 3) + ';',
      '  --lia-head-scale: ' + arred(g.escala, 3) + ';',
      '  --lia-neck: ' + arred(g.pescoco, 3) + ';',
      '  --lia-leg-len: ' + arred(g.pernas, 2) + ';',
      '  --lia-shoulder: ' + arred(g.ombros, 3) + ';',
      '  --lia-arm-len: ' + arred(g.bracos, 3) + ';',
      '  --lia-eye-size: ' + arred(g.olhos, 3) + ';',
      '  --lia-eye-gap: ' + arred(g.distancia, 3) + ';',
      '  --lia-stroke: ' + arred(g.traco, 2) + ';',
      '  --lia-radius: ' + arred(g.raio, 2) + 'px;',
      '  --lia-lock-x: ' + arred(g.mechaX, 2) + '; --lia-lock-y: ' + arred(g.mechaY, 2) + ';',
      '}'
    ];
    return linhas.join('\n');
  }

  function preencherExportacao() {
    var g = lerGeo();
    var e = lerExpressao();
    var dados = {
      versao: 1,
      preset: nomeDoPreset(g),
      razaoCabecaCorpo: arred(razaoCabecaCorpo(g), 2),
      geometria: {
        topo: arred(g.topo, 3), escalaCabeca: arred(g.escala, 3), pescoco: arred(g.pescoco, 3),
        pernas: arred(g.pernas, 2), ombros: arred(g.ombros, 3), bracos: arred(g.bracos, 3),
        olhos: arred(g.olhos, 3), distanciaOlhos: arred(g.distancia, 3), traco: arred(g.traco, 2),
        arredondamentoPx: arred(g.raio, 2), mechaX: arred(g.mechaX, 2), mechaY: arred(g.mechaY, 2)
      },
      paleta: e.paleta,
      acessorio: e.acessorio,
      css: montarCss(g, e)
    };
    textoExport.value = JSON.stringify(dados, null, 2);
  }

  function copiarExportacao() {
    function fallback() {
      textoExport.focus();
      textoExport.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      statusEl.textContent = ok ? 'Copiado.' : 'Selecione o texto e copie com Ctrl+C.';
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textoExport.value).then(
        function () { statusEl.textContent = 'Copiado para a área de transferência.'; },
        fallback
      );
    } else {
      fallback();
    }
  }

  // ---------- eventos ----------

  function ligarEventos() {
    SLIDERS.forEach(function (s) { s.el.addEventListener('input', atualizar); });
    document.querySelectorAll('select[data-expr]').forEach(function (s) { s.addEventListener('change', atualizar); });
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(function (i) {
      i.addEventListener('change', atualizar);
    });

    document.querySelectorAll('[data-aplicar]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[b.getAttribute('data-aplicar')];
        var g = lerGeo();
        g.topo = p.topo; g.escala = p.escala; g.pescoco = p.pescoco; g.pernas = p.pernas;
        escreverGeo(g);
        statusEl.textContent = 'Preset aplicado: ' + b.parentNode.querySelector('h3').textContent + '.';
        atualizar();
      });
    });

    document.getElementById('btn-restaurar').addEventListener('click', function () {
      escreverGeo(lerPadraoCss());
      statusEl.textContent = 'Parâmetros restaurados para o padrão de lia.css.';
      atualizar();
    });

    botaoTema.addEventListener('click', function () {
      var escuro = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
      botaoTema.setAttribute('aria-pressed', String(escuro));
      botaoTema.textContent = escuro ? 'Modo claro' : 'Modo escuro';
      atualizar();
    });

    var botaoGaleria = document.getElementById('btn-galeria');
    botaoGaleria.addEventListener('click', function () {
      var galeria = document.getElementById('galeria');
      galeria.hidden = !galeria.hidden;
      botaoGaleria.setAttribute('aria-expanded', String(!galeria.hidden));
    });

    var botaoExport = document.getElementById('btn-export');
    botaoExport.addEventListener('click', function () {
      painelExport.hidden = false;
      botaoExport.setAttribute('aria-expanded', 'true');
      preencherExportacao();
      textoExport.focus();
    });
    document.getElementById('btn-fechar-export').addEventListener('click', function () {
      painelExport.hidden = true;
      botaoExport.setAttribute('aria-expanded', 'false');
      botaoExport.focus();
    });
    document.getElementById('btn-copiar').addEventListener('click', copiarExportacao);
  }

  // Valores padrao = lia.css (lidos da sonda; se lia.css nao carregar, usa a reserva).
  function lerPadraoCss() {
    var cs = window.getComputedStyle(sonda);
    function num(nome, reserva) {
      var v = parseFloat(cs.getPropertyValue(nome));
      return isNaN(v) ? reserva : v;
    }
    return {
      topo: num('--lia-top', PADRAO_RESERVA.topo),
      escala: num('--lia-head-scale', PADRAO_RESERVA.escala),
      pescoco: num('--lia-neck', PADRAO_RESERVA.pescoco),
      pernas: num('--lia-leg-len', PADRAO_RESERVA.pernas),
      ombros: num('--lia-shoulder', PADRAO_RESERVA.ombros),
      bracos: num('--lia-arm-len', PADRAO_RESERVA.bracos),
      olhos: num('--lia-eye-size', PADRAO_RESERVA.olhos),
      distancia: num('--lia-eye-gap', PADRAO_RESERVA.distancia),
      traco: num('--lia-stroke', PADRAO_RESERVA.traco),
      raio: num('--lia-radius', PADRAO_RESERVA.raio),
      mechaX: num('--lia-lock-x', PADRAO_RESERVA.mechaX),
      mechaY: num('--lia-lock-y', PADRAO_RESERVA.mechaY)
    };
  }

  // ---------- inicio ----------

  document.querySelectorAll('.lia[data-lia]').forEach(function (host) {
    host.appendChild(document.importNode(modelo, true));
  });
  escreverGeo(lerPadraoCss());
  ligarEventos();
  atualizar();
})();
