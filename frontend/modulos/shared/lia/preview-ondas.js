/* Preview das ondas 2-4 da Lia (revisao de arte; nao entra no build, ver LIA_REVIEW_ONLY em scripts/build.js).
   A arte vem de LiaArt (lia-art.js, gerado de lia.svg) e e montada com createElementNS (sem innerHTML).
   Cada cena e uma linha do tempo WAAPI: so transform e opacity; duracoes e curvas vem de --dur-* e --ease-*.
   Movimento reduzido mostra a pose final parada. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var estilo = getComputedStyle(document.documentElement);
  var cenas = [];

  function tokenMs(nome, padrao) {
    var v = estilo.getPropertyValue(nome).trim();
    if (!v) return padrao;
    return v.slice(-2) === 'ms' ? parseFloat(v) : parseFloat(v) * 1000;
  }

  function tokenCurva(nome, padrao) {
    return estilo.getPropertyValue(nome).trim() || padrao;
  }

  var D = {
    base: tokenMs('--dur-base', 280),
    slow: tokenMs('--dur-slow', 480),
    lazy: tokenMs('--dur-lazy', 800)
  };
  var E = {
    out: tokenCurva('--ease-out', 'ease-out'),
    inOut: tokenCurva('--ease-in-out', 'ease-in-out'),
    spring: tokenCurva('--ease-spring', 'ease-out')
  };

  /* ---------- Construcao da arte ---------- */

  function svgEl(tag, attrs, filhos) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (filhos || []).forEach(function (f) { el.appendChild(f); });
    return el;
  }

  function daArte(item) {
    return svgEl(item.tag, item.attrs, (item.children || []).map(daArte));
  }

  function criaLia(attrs) {
    var arte = window.LiaArt;
    var s = svgEl('svg', { 'class': 'lia-svg', viewBox: arte.viewBox, 'aria-hidden': 'true', focusable: 'false' }, arte.tree.map(daArte));
    var host = document.createElement('div');
    host.className = 'lia';
    Object.keys(attrs || {}).forEach(function (k) { host.setAttribute(k, attrs[k]); });
    host.appendChild(s);
    return host;
  }

  function raizSvg(host) {
    return host.querySelector('svg');
  }

  /* ---------- Pecas extras (mesmas classes da arte: traco, paleta e raio) ---------- */

  /* Monitor a direita da mao que aponta (mao em x 149-161, y 105-117): a ponta do dedo fica a 5 unidades da borda. */
  function monitor() {
    return svgEl('g', { 'data-pv': 'monitor' }, [
      svgEl('rect', { 'class': 'p rd', x: 166, y: 86, width: 52, height: 38 }),
      svgEl('path', { 'class': 'pv-ecg pv-esq', 'data-pv': 'ecg', d: 'M171 112h9l3-12 4 22 3-16 3 6h7l3-4 2 4h9' }),
      svgEl('circle', { 'class': 't', 'data-pv': 'coracao', cx: 211, cy: 95, r: 2.6 })
    ]);
  }

  /* Osso encaixado na mao direita do esqueleto (mao em x 168, y 172). */
  function osso() {
    return svgEl('g', { 'data-pv': 'osso' }, [
      svgEl('rect', { 'class': 'p', x: 170, y: 168, width: 16, height: 6, rx: 3 }),
      svgEl('circle', { 'class': 'p', cx: 168, cy: 166, r: 3 }),
      svgEl('circle', { 'class': 'p', cx: 168, cy: 172, r: 3 }),
      svgEl('circle', { 'class': 'p', cx: 188, cy: 166, r: 3 }),
      svgEl('circle', { 'class': 'p', cx: 188, cy: 172, r: 3 })
    ]);
  }

  function estrela() {
    return svgEl('g', { 'data-pv': 'estrela', 'class': 'pv-centro' }, [
      svgEl('use', { href: '#lia-star', transform: 'translate(184 150) scale(1.4)' })
    ]);
  }

  function interrogacao() {
    return svgEl('g', { 'data-pv': 'interrogacao' }, [
      svgEl('ellipse', { 'class': 'p', cx: 156, cy: 40, rx: 13, ry: 12 }),
      svgEl('path', { 'class': 'pv-glifo', d: 'M152 37a4 4 0 1 1 6.2 3.3c-1.2.8-2.2 1.6-2.2 3.2' }),
      svgEl('circle', { 'class': 'pv-glifo-ponto', cx: 156.2, cy: 49, r: 1.6 })
    ]);
  }

  /* Tela com suporte, a direita da mao que aponta (ponta em x 161, y 111). */
  function tela() {
    return svgEl('g', { 'data-pv': 'tela' }, [
      svgEl('rect', { 'class': 'p rd', x: 166, y: 94, width: 32, height: 24 }),
      svgEl('path', { d: 'M172 102h20M172 108h13M172 114h17M182 118v5M177 123h10' })
    ]);
  }

  function bracosCruzados() {
    return svgEl('g', { 'data-pv': 'cruzados' }, [
      svgEl('path', { 'class': 'c', d: 'M62 180L126 160L130 172L66 192Z' }),
      svgEl('path', { 'class': 'c', d: 'M138 180L74 160L70 172L134 192Z' }),
      svgEl('circle', { 'class': 'k', cx: 127, cy: 165, r: 5.5 }),
      svgEl('circle', { 'class': 'k', cx: 73, cy: 165, r: 5.5 })
    ]);
  }

  function balao() {
    return svgEl('g', { 'data-pv': 'aviso', 'class': 'pv-centro' }, [
      svgEl('path', { 'class': 'pv-aviso-bal', d: 'M150 58l-8 16 17-10z' }),
      svgEl('ellipse', { 'class': 'pv-aviso-bal', cx: 164, cy: 48, rx: 26, ry: 17 }),
      svgEl('rect', { 'class': 'pv-glifo-claro', x: 162, y: 38, width: 4.4, height: 12, rx: 2.2 }),
      svgEl('circle', { 'class': 'pv-glifo-claro', cx: 164.2, cy: 56, r: 2.4 })
    ]);
  }

  /* Costas da Lia (suspensa): mesma silhueta da frente, sem rosto, sem mecha, sem lapela. */
  function criaCostas() {
    var lia = criaLia({ 'data-state': 'suspended', 'data-pv': 'costas' });
    var s = raizSvg(lia);
    s.querySelectorAll('[id^="lia-eyes-"], [id^="lia-brows-"], [id^="lia-mouth-"], [id^="lia-prop-"], [id^="lia-scene-"], #lia-lock, #lia-glasses, .bl, #lia-coat > .a')
      .forEach(function (n) { n.remove(); });
    s.querySelector('#lia-head > ellipse.k').setAttribute('class', 'h');
    s.querySelector('#lia-coat').appendChild(svgEl('path', { d: 'M100 190v70' }));
    return lia;
  }

  /* ---------- Cenas (monta = DOM; passos e anima = linha do tempo, em ms) ---------- */

  function cenaFrasco() {
    var lia = criaLia({ 'data-prop': 'flask', 'data-emotion': 'focused' });
    var frasco = lia.querySelector('#lia-prop-flask');
    var liquido = frasco.querySelector(':scope > path.a');
    liquido.classList.add('pv-base');
    frasco.appendChild(svgEl('path', { 'class': 's pv-base', d: liquido.getAttribute('d'), 'data-pv': 'liquido-b' }));
    [[140, 241, 'bolha-1'], [148, 237, 'bolha-2'], [153, 243, 'bolha-3']].forEach(function (b) {
      frasco.appendChild(svgEl('circle', { 'class': 'p', cx: b[0], cy: b[1], r: 1.6, 'data-pv': b[2] }));
    });
    return [lia];
  }

  function cenaClinica() {
    var lia = criaLia({ 'data-prop': 'stethoscope', 'data-emotion': 'focused' });
    lia.querySelector('#lia-prop-thermometer path.g').classList.add('pv-base');
    raizSvg(lia).appendChild(monitor());
    return [lia];
  }

  function cenaAtlas() {
    var lia = criaLia({ 'data-prop': 'skeleton', 'data-emotion': 'focused' });
    lia.querySelector('#lia-prop-skeleton').classList.add('pv-centro');
    raizSvg(lia).appendChild(osso());
    raizSvg(lia).appendChild(estrela());
    return [lia];
  }

  function cenaAprender() {
    var lia = criaLia({ 'data-prop': 'book', 'data-emotion': 'focused' });
    var s = raizSvg(lia);
    s.appendChild(svgEl('path', { 'class': 'p pv-esq', 'data-pv': 'folha', d: 'M100 160c12-5 24-5 36 0v28c-12-5-24-5-36 0z' }));
    s.appendChild(interrogacao());
    s.appendChild(tela());
    return [lia];
  }

  function cenaAviso() {
    var veu = document.createElement('div');
    veu.className = 'veu';
    var lia = criaLia({ 'data-emotion': 'neutral' });
    raizSvg(lia).appendChild(bracosCruzados());
    raizSvg(lia).appendChild(balao());
    return [veu, lia];
  }

  function cenaSuspensa() {
    return [criaCostas(), criaLia({ 'data-pv': 'frente', 'data-emotion': 'neutral' })];
  }

  function cenaErro() {
    return [criaLia({ 'data-emotion': 'worried' })];
  }

  function defLaboratorio() {
    var mistura = 2 * D.base + D.lazy;
    return {
      id: 'laboratorio',
      titulo: 'Laboratório',
      legenda: 'Segura o frasco vazio. O líquido sobe (escala Y); a Lia mistura e o líquido troca de cor por opacidade; termina com brilhos.',
      monta: cenaFrasco,
      anima: [
        { sel: '#lia-prop-flask > path.a', frames: [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], at: 2 * D.base, dur: D.lazy, ease: E.out },
        { sel: '#lia-prop-flask > path.a', frames: [{ opacity: 1 }, { opacity: 0 }], at: mistura, dur: D.lazy, ease: E.inOut },
        { sel: '[data-pv="liquido-b"]', frames: [{ opacity: 0 }, { opacity: 1 }], at: mistura, dur: D.lazy, ease: E.inOut },
        { sel: '#lia-prop-flask', frames: [{ transform: 'translateX(0px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0px)' }], at: mistura, dur: 2 * D.lazy, ease: E.inOut },
        { sel: '[data-pv="bolha-1"]', frames: bolhaFrames(), at: mistura, dur: D.lazy, ease: E.out },
        { sel: '[data-pv="bolha-2"]', frames: bolhaFrames(), at: mistura + D.base, dur: D.lazy, ease: E.out },
        { sel: '[data-pv="bolha-3"]', frames: bolhaFrames(), at: mistura + 2 * D.base, dur: D.lazy, ease: E.out }
      ],
      passos: [
        { at: mistura + 2 * D.lazy, sel: '.lia', attrs: { 'data-emotion': 'happy', 'data-scene': 'sparkles' } }
      ]
    };
  }

  function bolhaFrames() {
    return [
      { opacity: 0, transform: 'translateY(0px)' },
      { opacity: 1, transform: 'translateY(-6px)', offset: 0.5 },
      { opacity: 0, transform: 'translateY(-12px)' }
    ];
  }

  function defClinica() {
    var monitorEm = 2 * D.lazy;
    var termometroEm = 4 * D.lazy;
    return {
      id: 'clinica',
      titulo: 'Clínica',
      legenda: 'O estetoscópio aproxima do peito; a Lia aponta para o monitor e o ECG desenha a linha; depois o termômetro sobe o mercúrio.',
      monta: cenaClinica,
      anima: [
        { sel: '#lia-prop-stethoscope', frames: [{ transform: 'translate(-18px, -26px)', opacity: 0.2 }, { transform: 'translate(0px, 0px)', opacity: 1 }], at: 0, dur: D.lazy, ease: E.out },
        { sel: '[data-pv="monitor"]', frames: [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)', offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0, offset: 1 }], at: monitorEm, dur: termometroEm + D.base - monitorEm, ease: 'linear' },
        { sel: '[data-pv="ecg"]', frames: [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], at: monitorEm + D.base, dur: 1.5 * D.lazy, ease: E.inOut },
        { sel: '[data-pv="coracao"]', frames: [{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], at: monitorEm + D.base, dur: 1.5 * D.lazy, ease: E.inOut },
        { sel: '#lia-prop-thermometer path.g', frames: [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], at: termometroEm, dur: 1.5 * D.lazy, ease: E.inOut }
      ],
      passos: [
        { at: monitorEm, sel: '.lia', attrs: { 'data-prop': 'none', 'data-arm-right': 'point' } },
        { at: termometroEm, sel: '.lia', attrs: { 'data-prop': 'thermometer', 'data-arm-right': 'idle', 'data-emotion': 'worried' } }
      ]
    };
  }

  function defAtlas() {
    var encaixe = D.base + 2 * D.lazy;
    return {
      id: 'atlas',
      titulo: 'Atlas',
      legenda: 'Gira o esqueleto (uma volta em 1,6 s); um osso desliza e encaixa com retorno elástico; a estrela marca a conexão.',
      monta: cenaAtlas,
      anima: [
        { sel: '#lia-prop-skeleton', frames: [{ rotate: '0deg' }, { rotate: '360deg' }], at: D.base, dur: 2 * D.lazy, ease: E.inOut },
        { sel: '[data-pv="osso"]', frames: [{ transform: 'translate(26px, -18px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 }], at: encaixe, dur: D.lazy, ease: E.spring },
        { sel: '[data-pv="estrela"]', frames: [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.5 }, { transform: 'scale(1)', opacity: 0 }], at: encaixe + D.lazy, dur: D.slow, ease: E.out }
      ],
      passos: [
        { at: encaixe + D.lazy, sel: '.lia', attrs: { 'data-emotion': 'happy' } }
      ]
    };
  }

  function defAprender() {
    var virar = D.lazy;
    var apontar = 3 * D.lazy;
    return {
      id: 'aprender',
      titulo: 'Aprender',
      legenda: 'Vira a página; lê com o olhar acompanhando a linha; um "?" surge sobre a cabeça e a Lia aponta para a tela.',
      monta: cenaAprender,
      anima: [
        { sel: '#lia-eyes-focused > *', frames: [{ transform: 'translateX(0px)' }, { transform: 'translateX(-1.6px)' }, { transform: 'translateX(1.6px)' }, { transform: 'translateX(-1.6px)' }, { transform: 'translateX(1.6px)' }, { transform: 'translateX(0px)' }], at: 2 * D.base, dur: 3 * D.lazy, ease: E.inOut },
        { sel: '[data-pv="folha"]', frames: [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)', offset: 0.5 }, { transform: 'scaleX(-1)' }], at: virar, dur: D.lazy, ease: E.inOut },
        { sel: '[data-pv="interrogacao"]', frames: [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }], at: 2 * D.lazy, dur: D.base, ease: E.out },
        { sel: '[data-pv="tela"]', frames: [{ opacity: 0 }, { opacity: 1 }], at: apontar, dur: D.base, ease: E.out }
      ],
      passos: [
        { at: apontar, sel: '.lia', attrs: { 'data-arm-right': 'point' } },
        { at: apontar + D.slow, sel: '.lia', attrs: { 'data-mouth': 'smile' } }
      ]
    };
  }

  function defAviso() {
    var balaoEm = D.lazy * 1.5;
    return {
      id: 'aviso',
      titulo: 'Moderação: aviso',
      legenda: 'Braços cruzados e balão vermelho com "!"; o fundo escurece suavemente (até 35%) e a Lia fica preocupada.',
      monta: cenaAviso,
      anima: [
        { sel: '.veu', frames: [{ opacity: 0 }, { opacity: 0.35 }], at: 0, dur: D.lazy, ease: E.out },
        { sel: '[data-pv="cruzados"]', frames: [{ opacity: 0 }, { opacity: 1 }], at: D.lazy, dur: D.base, ease: E.out },
        { sel: '[data-pv="aviso"]', frames: [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], at: balaoEm, dur: D.slow, ease: E.out }
      ],
      passos: [
        { at: 2 * D.lazy, sel: '.lia', attrs: { 'data-emotion': 'worried' } }
      ]
    };
  }

  function defSuspensa() {
    var virar = D.lazy * 1.5;
    var troca = virar + D.slow;
    var sorriso = troca + D.slow;
    return {
      id: 'suspensa',
      titulo: 'Moderação: suspensa',
      legenda: 'Suspensa: de costas e esmaecida (estado suspended). Redenção: gira em escala X, volta de frente, sorri e ganha corações.',
      monta: cenaSuspensa,
      anima: [
        { sel: '.lia[data-pv="costas"]', frames: [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.04)' }], at: virar, dur: D.slow, ease: E.inOut },
        { sel: '.lia[data-pv="costas"]', frames: [{ opacity: 0.55 }, { opacity: 0 }], at: troca, dur: 1, ease: 'linear' },
        { sel: '.lia[data-pv="frente"]', frames: [{ transform: 'scaleX(0.04)' }, { transform: 'scaleX(1)' }], at: troca, dur: D.slow, ease: E.spring },
        { sel: '.lia[data-pv="frente"]', frames: [{ opacity: 0 }, { opacity: 1 }], at: troca, dur: 1, ease: 'linear' }
      ],
      passos: [
        { at: sorriso, sel: '.lia[data-pv="frente"]', attrs: { 'data-emotion': 'happy', 'data-scene': 'heart glow' } }
      ]
    };
  }

  function defErro() {
    var tremor = 2 * D.lazy;
    return {
      id: 'erro',
      titulo: 'Erro',
      legenda: 'Confusa: a cabeça balança até 9° e os ombros sobem 2,5 unidades; sobrancelhas e boca preocupadas.',
      monta: cenaErro,
      anima: [
        { sel: '#lia-head', frames: [{ rotate: '0deg' }, { rotate: '-9deg', offset: 0.2 }, { rotate: '9deg', offset: 0.45 }, { rotate: '-6deg', offset: 0.7 }, { rotate: '3deg', offset: 0.88 }, { rotate: '0deg' }], at: 0, dur: tremor, ease: E.inOut },
        { sel: '#lia-coat, #lia-limbs', frames: [{ translate: '0px 0px' }, { translate: '0px -2.5px', offset: 0.25 }, { translate: '0px 0px', offset: 0.5 }, { translate: '0px -2.5px', offset: 0.75 }, { translate: '0px 0px' }], at: 0, dur: tremor, ease: E.inOut }
      ],
      passos: []
    };
  }

  var CENAS = [defLaboratorio(), defClinica(), defAtlas(), defAprender(), defAviso(), defSuspensa(), defErro()];

  /* ---------- Motor: duracao, rest, reproducao e pose final ---------- */

  function duracaoDe(def) {
    var fim = 0;
    def.anima.forEach(function (a) { fim = Math.max(fim, a.at + a.dur); });
    def.passos.forEach(function (p) { fim = Math.max(fim, p.at); });
    return fim;
  }

  function formataSeg(ms) {
    return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  }

  function guardaInicial(cena) {
    var lista = [];
    cena.def.passos.forEach(function (p) {
      cena.palco.querySelectorAll(p.sel).forEach(function (el) {
        Object.keys(p.attrs).forEach(function (k) { lista.push({ el: el, k: k, v: el.getAttribute(k) }); });
      });
    });
    return lista;
  }

  function restaura(lista) {
    lista.forEach(function (r) {
      if (r.v === null) r.el.removeAttribute(r.k);
      else r.el.setAttribute(r.k, r.v);
    });
  }

  function aplicaAtributos(palco, sel, attrs) {
    palco.querySelectorAll(sel).forEach(function (el) {
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    });
  }

  /* Cria as animacoes pausadas em t=0: o repouso mostra o primeiro quadro. */
  function criaAnimacoes(cena) {
    var lista = [];
    cena.def.anima.forEach(function (a) {
      cena.palco.querySelectorAll(a.sel).forEach(function (el) {
        var anim = el.animate(a.frames, { delay: a.at, duration: a.dur, easing: a.ease, fill: 'both' });
        anim.pause();
        lista.push(anim);
      });
    });
    return lista;
  }

  function limpa(cena) {
    cena.timers.forEach(clearTimeout);
    cena.timers = [];
    cena.anims.forEach(function (a) { a.cancel(); });
    cena.anims = [];
    restaura(cena.inicial);
  }

  function repouso(cena) {
    limpa(cena);
    cena.anims = criaAnimacoes(cena);
  }

  function poseFinal(cena) {
    limpa(cena);
    cena.def.passos.forEach(function (p) { aplicaAtributos(cena.palco, p.sel, p.attrs); });
    cena.anims = criaAnimacoes(cena);
    cena.anims.forEach(function (a) { a.finish(); });
  }

  function reproduz(cena) {
    if (movimentoReduzido()) {
      poseFinal(cena);
      return;
    }
    limpa(cena);
    cena.anims = criaAnimacoes(cena);
    cena.anims.forEach(function (a) { a.play(); });
    cena.def.passos.forEach(function (p) {
      cena.timers.push(setTimeout(function () { aplicaAtributos(cena.palco, p.sel, p.attrs); }, p.at));
    });
  }

  function movimentoReduzido() {
    return document.documentElement.getAttribute('data-movimento') === 'reduzido';
  }

  function ajustaMovimento(reduz) {
    document.documentElement.setAttribute('data-movimento', reduz ? 'reduzido' : 'normal');
    cenas.forEach(function (c) { if (reduz) poseFinal(c); else repouso(c); });
  }

  /* ---------- Pagina ---------- */

  function criaCabecalho(def, indice) {
    var topo = document.createElement('div');
    topo.className = 'cena-topo';
    var h = document.createElement('h2');
    h.textContent = (indice + 1) + '. ' + def.titulo;
    var dur = document.createElement('span');
    dur.className = 'duracao';
    dur.textContent = 'Duração: ' + formataSeg(duracaoDe(def));
    topo.appendChild(h);
    topo.appendChild(dur);
    return topo;
  }

  function criaCartao(def, indice) {
    var card = document.createElement('article');
    card.className = 'cena';
    card.setAttribute('data-cena', def.id);
    var palco = document.createElement('div');
    palco.className = 'palco';
    def.monta().forEach(function (n) { palco.appendChild(n); });
    var legenda = document.createElement('p');
    legenda.className = 'legenda';
    legenda.textContent = def.legenda;
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao reproduzir';
    botao.textContent = 'Reproduzir';
    botao.setAttribute('aria-label', 'Reproduzir: ' + def.titulo);
    card.appendChild(criaCabecalho(def, indice));
    card.appendChild(palco);
    card.appendChild(legenda);
    card.appendChild(botao);
    var cena = { def: def, palco: palco, anims: [], timers: [], inicial: [] };
    botao.addEventListener('click', function () { reproduz(cena); });
    cenas.push(cena);
    return card;
  }

  function alternaTema(botao) {
    var escuro = document.documentElement.getAttribute('data-theme') !== 'dark';
    document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
    botao.setAttribute('aria-pressed', String(escuro));
  }

  function alternaReduzido(botao) {
    var ligado = botao.getAttribute('aria-pressed') !== 'true';
    botao.setAttribute('aria-pressed', String(ligado));
    ajustaMovimento(ligado);
  }

  function inicia() {
    var lista = document.getElementById('cenas');
    CENAS.forEach(function (def, i) { lista.appendChild(criaCartao(def, i)); });
    cenas.forEach(function (c) { c.inicial = guardaInicial(c); });
    var reduz = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var btnReduz = document.getElementById('btn-reduzido');
    btnReduz.setAttribute('aria-pressed', String(reduz));
    btnReduz.addEventListener('click', function () { alternaReduzido(btnReduz); });
    document.getElementById('btn-tema').addEventListener('click', function (ev) { alternaTema(ev.currentTarget); });
    ajustaMovimento(reduz);
  }

  if (window.LiaArt) {
    inicia();
  } else {
    document.getElementById('cenas').textContent = 'Falha ao carregar lia-art.js (gerado de lia.svg).';
  }
})();
