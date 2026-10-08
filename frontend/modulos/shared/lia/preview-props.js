/* Prova de fidelidade (P-2): desenha, estaticos, cada id de LIA_PROPS_ART e as composicoes finais
   das cenas 1-7, para comparar com preview-ondas.html. Nao entra no build (LIA_REVIEW_ONLY).
   A insercao segue o contrato do README: data-pai, data-posicao e data-cena de lia-props.svg. Sem innerHTML. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // Ajustes de cada id para o estado isolado (o que o S2 faria ao montar a pose).
  var ESPEC_ID = {
    'lia-pv-veu': { ajustes: [{ sel: '#lia-pv-veu', attrs: { opacity: '0.35' } }] },
    'lia-pv-liquido-b': { host: { 'data-prop': 'flask' } },
    'lia-pv-bolha-1': { host: { 'data-prop': 'flask' } },
    'lia-pv-bolha-2': { host: { 'data-prop': 'flask' } },
    'lia-pv-bolha-3': { host: { 'data-prop': 'flask' } },
    'lia-pv-folha': { host: { 'data-prop': 'book' } },
    'lia-pv-cruzados': { classe: 'sem-bracos' },
    'lia-pv-costas-cabeca': { classe: 'pose-costas', host: { 'data-state': 'suspended' } },
    'lia-pv-costas-costura': { classe: 'pose-costas', host: { 'data-state': 'suspended' } }
  };

  // Estados finais das cenas (mesmos atributos e ajustes que o preview-ondas.js deixa no fim de cada cena).
  var COMPOSICOES = [
    { titulo: '1 Laboratório (final)', host: { 'data-prop': 'flask', 'data-emotion': 'happy', 'data-scene': 'sparkles' },
      ids: ['lia-pv-liquido-b'], ajustes: [{ sel: '#lia-prop-flask > path.a', attrs: { opacity: '0' } }] },
    { titulo: '2 Clínica (monitor e ECG)', host: { 'data-prop': 'none', 'data-arm-right': 'point', 'data-emotion': 'focused' },
      ids: ['lia-pv-monitor'], ajustes: [] },
    { titulo: '2 Clínica (final: termômetro)', host: { 'data-prop': 'thermometer', 'data-emotion': 'worried', 'data-arm-right': 'idle' },
      ids: [], ajustes: [] },
    { titulo: '3 Atlas (final)', host: { 'data-prop': 'skeleton', 'data-emotion': 'happy' },
      ids: ['lia-pv-osso'], ajustes: [] },
    { titulo: '4 Aprender (final)', host: { 'data-prop': 'book', 'data-emotion': 'focused', 'data-arm-right': 'point', 'data-mouth': 'smile' },
      ids: ['lia-pv-folha', 'lia-pv-interrogacao', 'lia-pv-tela'],
      ajustes: [{ sel: '#lia-pv-folha', attrs: { transform: 'matrix(-1 0 0 1 200 0)' } }] },
    { titulo: '5 Aviso (final)', host: { 'data-emotion': 'worried' }, classe: 'sem-bracos',
      ids: ['lia-pv-veu', 'lia-pv-cruzados', 'lia-pv-aviso'], ajustes: [{ sel: '#lia-pv-veu', attrs: { opacity: '0.35' } }] },
    { titulo: '6 Suspensa (costas)', host: { 'data-state': 'suspended' }, classe: 'pose-costas',
      ids: ['lia-pv-costas-cabeca', 'lia-pv-costas-costura'], ajustes: [] },
    { titulo: '6 Redenção (frente final)', host: { 'data-emotion': 'happy', 'data-scene': 'heart glow' }, ids: [], ajustes: [] },
    { titulo: '7 Erro (final)', host: { 'data-emotion': 'worried' }, ids: [], ajustes: [] }
  ];

  function svgEl(tag, attrs, filhos) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (filhos || []).forEach(function (f) { el.appendChild(f); });
    return el;
  }

  function daArte(item) {
    return svgEl(item.tag, item.attrs, (item.children || []).map(daArte));
  }

  function criaLia(attrs, classe) {
    var s = svgEl('svg', { 'class': 'lia-svg', viewBox: window.LiaArt.viewBox, 'aria-hidden': 'true', focusable: 'false' }, window.LiaArt.tree.map(daArte));
    var host = document.createElement('div');
    host.className = classe ? 'lia ' + classe : 'lia';
    Object.keys(attrs || {}).forEach(function (k) { host.setAttribute(k, attrs[k]); });
    host.appendChild(s);
    return host;
  }

  function noDoProp(id) {
    var achado = window.LIA_PROPS_ART.tree.filter(function (n) { return n.attrs.id === id; })[0];
    if (!achado) throw new Error('id ausente em LIA_PROPS_ART: ' + id);
    return achado;
  }

  /* Insere o no do id no pai indicado por data-pai (svg = raiz; demais = seletor dentro do .lia). */
  function insere(host, id) {
    var item = noDoProp(id);
    var pai = item.attrs['data-pai'] === 'svg' ? host.querySelector('svg') : host.querySelector(item.attrs['data-pai']);
    if (!pai) throw new Error('pai ausente para ' + id + ': ' + item.attrs['data-pai']);
    var no = daArte(item);
    if (item.attrs['data-posicao'] === 'primeiro') pai.insertBefore(no, host.querySelector('#lia-body'));
    else pai.appendChild(no);
  }

  function ajusta(host, lista) {
    lista.forEach(function (a) {
      host.querySelectorAll(a.sel).forEach(function (el) {
        Object.keys(a.attrs).forEach(function (k) { el.setAttribute(k, a.attrs[k]); });
      });
    });
  }

  function monta(spec) {
    var host = criaLia(spec.host, spec.classe);
    (spec.ids || []).forEach(function (id) { insere(host, id); });
    ajusta(host, spec.ajustes || []);
    return host;
  }

  function figura(titulo, host, classe) {
    var fig = document.createElement('figure');
    fig.className = classe;
    var palco = document.createElement('div');
    palco.className = 'palco';
    palco.appendChild(host);
    var legenda = document.createElement('figcaption');
    legenda.textContent = titulo;
    fig.appendChild(palco);
    fig.appendChild(legenda);
    return fig;
  }

  function preencheIds() {
    var grade = document.getElementById('ids');
    window.LIA_PROPS_ART.tree.forEach(function (no) {
      var id = no.attrs.id;
      var espec = ESPEC_ID[id] || {};
      var host = monta({ host: espec.host, classe: espec.classe, ids: [id], ajustes: espec.ajustes });
      grade.appendChild(figura('cena ' + no.attrs['data-cena'] + ' · ' + id, host, 'celula'));
    });
  }

  function preencheCenas() {
    var grade = document.getElementById('cenas');
    COMPOSICOES.forEach(function (c) {
      grade.appendChild(figura(c.titulo, monta(c), 'comp'));
    });
  }

  function alternaTema(botao) {
    var escuro = document.documentElement.getAttribute('data-theme') !== 'dark';
    document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
    botao.setAttribute('aria-pressed', String(escuro));
  }

  if (window.LiaArt && window.LIA_PROPS_ART) {
    preencheIds();
    preencheCenas();
    document.getElementById('btn-tema').addEventListener('click', function (ev) { alternaTema(ev.currentTarget); });
  } else {
    document.querySelector('main').textContent = 'Falha: carregue lia-art.js e lia-props-art.js (gerados por build-lia-art.mjs).';
  }
})();
