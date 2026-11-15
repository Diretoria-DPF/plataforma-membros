/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Personagem do Tutor em 3 variações (Átomo, Coruja, Frasco). Carregado SOB DEMANDA (pacote `tutor` de lazy-bundles.js,
// pedido por agents-tutor.js e memory.js; fora do shell): SVG escrito à mão, montado por createElementNS (CSP), sem imagem raster e sem texto dentro da arte.
//   - Estados: idle (parado), thinking (pensando), speaking (explicando), celebrating (comemorando).
//   - Tamanhos: avatar (40 px), card (72 px) e tela (144 px), todos pelo mesmo viewBox 120x120.
//   - A escolha fica neste aparelho (localStorage, com try/catch). O servidor não tem campo para isso sem migração:
//     preferências do banco são lista fechada (theme, email) e a memória de estudo é vocabulário fechado (ADR 0007).
//   - Sem telemetria: nada sai do aparelho. Movimento só com prefers-reduced-motion: no-preference (tutor-persona.css).
// Expõe window.LaiftTutorPersona (ou module.exports, no Node, para os testes).
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var STORE_NAME = 'laift_tutor_persona_v1';
  var EVENT = 'laift:tutor-persona';
  var STATES = ['idle', 'thinking', 'speaking', 'celebrating'];
  var SIZES = ['avatar', 'card', 'tela'];
  var TEXT = {
    legend: 'Escolha o seu tutor',
    hint: 'A escolha vale em toda a interface do Tutor, neste aparelho.',
    chosen: 'Tutor escolhido: ',
    figure: 'Personagem do Tutor: ',
  };
  var PERSONAS = [
    { id: 'atomo', name: 'Átomo', about: 'Esfera lilás com uma órbita. Curioso e calmo.' },
    { id: 'coruja', name: 'Coruja', about: 'Olhos grandes e óculos redondos. Atenta e paciente.' },
    { id: 'frasco', name: 'Frasco', about: 'Frasco de laboratório com bolhas. Direto e acolhedor.' },
  ];
  var DEFAULT_ID = PERSONAS[0].id;

  function byId(id) {
    for (var i = 0; i < PERSONAS.length; i += 1) if (PERSONAS[i].id === id) return PERSONAS[i];
    return null;
  }

  // ---------------------------------------------------------------------------
  // Arte: especificação ['tag', {atributos}, ...filhos]
  // ---------------------------------------------------------------------------
  function g(cls) { return ['g', { class: cls }].concat([].slice.call(arguments, 1)); }
  function gs(cls, list) { return ['g', { class: cls }].concat(list); }
  function line(d) { return ['path', { d: d, class: 'tut-line' }]; }

  function faceParts(c) {
    var eyes = function (dx, dy) {
      return c.ex.map(function (x) {
        return ['circle', { cx: x + dx, cy: c.ey + dy, r: 4, class: 'tut-ink' }];
      }).concat(c.ex.map(function (x) {
        return ['circle', { cx: x + dx + 1.3, cy: c.ey + dy - 1.3, r: 1.2, class: 'tut-hi' }];
      }));
    };
    var happy = c.ex.map(function (x) { return line('M' + (x - 4.5) + ' ' + (c.ey + 2) + 'q4.5 -7 9 0'); });
    var mouths = c.mouths || [
      g('tut-m-neutral', line('M' + (c.mx - 6) + ' ' + c.my + 'q6 4 12 0')),
      g('tut-m-smile', line('M' + (c.mx - 8) + ' ' + c.my + 'q8 9 16 0')),
      g('tut-m-open', ['ellipse', { cx: c.mx, cy: c.my + 2, rx: 5, ry: 4.5, class: 'tut-ink' }]),
    ];
    return [g.apply(null, ['tut-eyes-open'].concat(eyes(0, 0))), g.apply(null, ['tut-eyes-up'].concat(eyes(1.5, -2))),
      g.apply(null, ['tut-eyes-happy'].concat(happy))].concat(mouths);
  }

  function fxParts() {
    var badge = function (cls, inner) {
      return g.apply(null, [cls, ['circle', { cx: 98, cy: 22, r: 13, class: 'tut-badge' }]].concat(inner));
    };
    var star = function (x, y, s) {
      return ['path', { d: 'M0-6 1.6-1.6 6 0 1.6 1.6 0 6-1.6 1.6-6 0-1.6-1.6z', transform: 'translate(' + x + ' ' + y + ') scale(' + s + ')', class: 'tut-star' }];
    };
    return [
      badge('tut-fx-think', [['circle', { cx: 91, cy: 22, r: 2.6, class: 'tut-dot' }], ['circle', { cx: 98, cy: 22, r: 2.6, class: 'tut-dot' }], ['circle', { cx: 105, cy: 22, r: 2.6, class: 'tut-dot' }]]),
      badge('tut-fx-speak', [['path', { d: 'M94 16q-5 6 0 12M100 14q-8 8 0 16', class: 'tut-wave' }]]),
      g('tut-fx-spark', star(94, 14, 1.3), star(108, 24, 1), star(88, 32, 0.8)),
    ];
  }

  var ART = {
    atomo: function () {
      return [
        g('tut-body',
          ['path', { d: 'M24 120c2-22 14-30 36-30s34 8 36 30z', class: 'tut-soft tut-o' }],
          ['circle', { cx: 60, cy: 58, r: 33, class: 'tut-main tut-o' }],
          g('tut-ring', ['ellipse', { cx: 60, cy: 58, rx: 50, ry: 15, transform: 'rotate(-22 60 58)', class: 'tut-orbit' }],
            ['circle', { cx: 104, cy: 42, r: 5, class: 'tut-accent tut-o' }])
        ),
        gs('tut-face', faceParts({ ex: [48, 72], ey: 56, mx: 60, my: 72 })),
      ].concat(fxParts());
    },
    coruja: function () {
      return [
        g('tut-body',
          ['path', { d: 'M26 58c-4-16 2-30 10-38l14 14h20l14-14c8 8 14 22 10 38 4 22-6 48-34 48S22 80 26 58z', class: 'tut-main tut-o' }],
          ['ellipse', { cx: 60, cy: 92, rx: 20, ry: 14, class: 'tut-soft' }],
          ['circle', { cx: 46, cy: 56, r: 15, class: 'tut-soft tut-o' }],
          ['circle', { cx: 74, cy: 56, r: 15, class: 'tut-soft tut-o' }],
          line('M61 56h-2')
        ),
        gs('tut-face', faceParts({
          ex: [46, 74], ey: 56, mx: 60, my: 80,
          mouths: [
            g('tut-m-neutral', ['path', { d: 'M54 66h12l-6 9z', class: 'tut-accent tut-o' }]),
            g('tut-m-smile', ['path', { d: 'M54 66h12l-6 9z', class: 'tut-accent tut-o' }], ['circle', { cx: 36, cy: 70, r: 3.5, class: 'tut-blush' }], ['circle', { cx: 84, cy: 70, r: 3.5, class: 'tut-blush' }]),
            g('tut-m-open', ['path', { d: 'M54 65h12l-6 6z', class: 'tut-accent tut-o' }], ['path', { d: 'M55 74h10l-5 8z', class: 'tut-accent tut-o' }]),
          ],
        })),
      ].concat(fxParts());
    },
    frasco: function () {
      return [
        g('tut-body',
          ['path', { d: 'M50 10h20v28l30 62c3 6-1 12-8 12H28c-7 0-11-6-8-12l30-62z', class: 'tut-glass tut-o' }],
          ['path', { d: 'M36 78q12-5 24 0t24 0l16 22c3 6-1 12-8 12H28c-7 0-11-6-8-12z', class: 'tut-main' }],
          ['circle', { cx: 44, cy: 104, r: 3, class: 'tut-hi tut-bub' }],
          ['circle', { cx: 80, cy: 98, r: 2.4, class: 'tut-hi tut-bub' }],
          ['circle', { cx: 66, cy: 110, r: 2, class: 'tut-hi tut-bub' }],
          ['path', { d: 'M46 10h28', class: 'tut-line' }]
        ),
        gs('tut-face', faceParts({ ex: [47, 73], ey: 90, mx: 60, my: 100 })),
      ].concat(fxParts());
    },
  };

  function build(doc, spec) {
    var node = doc.createElementNS(NS, spec[0]);
    var attrs = spec[1] || {};
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, String(attrs[k])); });
    for (var i = 2; i < spec.length; i += 1) node.appendChild(build(doc, spec[i]));
    return node;
  }

  // ---------------------------------------------------------------------------
  // Escolha salva (só neste aparelho)
  // ---------------------------------------------------------------------------
  function storage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  function getPersona() {
    var s = storage();
    var raw = null;
    try { raw = s ? s.getItem(STORE_NAME) : null; } catch (e) { raw = null; }
    return byId(raw) ? raw : (memory || DEFAULT_ID);
  }

  function figureLabel(id) { return TEXT.figure + (byId(id) || byId(DEFAULT_ID)).name; }

  // ---------------------------------------------------------------------------
  // Figura
  // ---------------------------------------------------------------------------
  function fill(doc, host, id) {
    var persona = byId(id) ? id : DEFAULT_ID;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.setAttribute('data-persona', persona);
    var svg = build(doc, ['svg', { viewBox: '0 0 120 120', focusable: 'false', class: 'tut-svg' }].concat(ART[persona]()));
    if (host.getAttribute('data-decorative') === '1') {
      host.setAttribute('aria-hidden', 'true');
      host.removeAttribute('role');
      host.removeAttribute('aria-label');
    } else {
      host.removeAttribute('aria-hidden');
      host.setAttribute('role', 'img');
      host.setAttribute('aria-label', figureLabel(persona));
    }
    host.appendChild(svg);
  }

  /** Figura. opts: { persona, state, size, decorative, live }. `live` troca de personagem quando a escolha muda. */
  function render(doc, opts) {
    var o = opts || {};
    var size = SIZES.indexOf(o.size) >= 0 ? o.size : 'card';
    var state = STATES.indexOf(o.state) >= 0 ? o.state : 'idle';
    var host = doc.createElement('span');
    host.className = 'tut tut--' + size;
    host.setAttribute('data-state', state);
    if (o.decorative) host.setAttribute('data-decorative', '1');
    if (o.live !== false && !o.persona) host.setAttribute('data-tut-live', '1');
    fill(doc, host, o.persona || getPersona());
    return host;
  }

  function setState(host, state) {
    if (host && STATES.indexOf(state) >= 0) host.setAttribute('data-state', state);
  }

  function refreshAll(doc) {
    var id = getPersona();
    var hosts = doc.querySelectorAll ? doc.querySelectorAll('[data-tut-live]') : [];
    for (var i = 0; i < hosts.length; i += 1) fill(doc, hosts[i], id);
  }

  function setPersona(id, doc) {
    if (!byId(id)) return false;
    var s = storage();
    try { if (s) s.setItem(STORE_NAME, id); } catch (e) { /* sem storage: vale só até fechar a página */ }
    memory = id;
    var d = doc || root.document;
    if (d) {
      refreshAll(d);
      if (typeof root.CustomEvent === 'function' && d.dispatchEvent) d.dispatchEvent(new root.CustomEvent(EVENT, { detail: { persona: id } }));
    }
    return true;
  }
  var memory = null;

  // ---------------------------------------------------------------------------
  // Seletor "Escolha o seu tutor": grupo de 3 botões de opção nativos (teclado e leitor de tela de graça)
  // ---------------------------------------------------------------------------
  var pickerCount = 0;

  function buildPicker(doc) {
    pickerCount += 1;
    var uid = 'tut-pick-' + pickerCount;
    var current = getPersona();
    var set = doc.createElement('fieldset');
    set.className = 'tut-picker';
    var legend = doc.createElement('legend');
    legend.textContent = TEXT.legend;
    set.appendChild(legend);
    var preview = render(doc, { persona: current, size: 'tela', decorative: true, live: false });
    preview.classList.add('tut-picker-preview');
    var status = doc.createElement('p');
    status.className = 'tut-sr';
    status.setAttribute('role', 'status');
    var list = doc.createElement('div');
    list.className = 'tut-picker-list';
    PERSONAS.forEach(function (p) {
      var label = doc.createElement('label');
      label.className = 'tut-opt';
      var input = doc.createElement('input');
      input.type = 'radio';
      input.name = uid;
      input.value = p.id;
      input.checked = p.id === current;
      var thumb = render(doc, { persona: p.id, size: 'avatar', decorative: true, live: false });
      var text = doc.createElement('span');
      text.className = 'tut-opt-text';
      var name = doc.createElement('strong');
      name.textContent = p.name;
      var about = doc.createElement('span');
      about.className = 'tut-opt-about';
      about.textContent = p.about;
      text.appendChild(name);
      text.appendChild(about);
      [input, thumb, text].forEach(function (n) { label.appendChild(n); });
      input.addEventListener('change', function () {
        if (!input.checked) return;
        setPersona(p.id, doc);
        fill(doc, preview, p.id);
        setState(preview, 'celebrating');
        status.textContent = TEXT.chosen + p.name;
      });
      list.appendChild(label);
    });
    var hint = doc.createElement('p');
    hint.className = 'tut-picker-hint';
    hint.textContent = TEXT.hint;
    [preview, list, hint, status].forEach(function (n) { set.appendChild(n); });
    return set;
  }

  var SPEAK_MS = 4000; // tempo do estado "explicando" depois de uma resposta

  function addAvatar(doc, who) {
    who.insertBefore(render(doc, { size: 'avatar', decorative: true }), who.firstChild);
    who.className += ' agents-tutor-who-avatar';
  }

  /**
   * Cartão do Tutor: figura ao lado do título e seletor recolhível no fim. Sem mexer no código da conversa, acompanha
   * o cartão: "pensando" enquanto a espera está visível, "explicando" ao chegar uma resposta e avatar nas respostas.
   */
  function decorateCard(doc, card, title) {
    var head = doc.createElement('div');
    head.className = 'agents-tutor-head';
    var figure = render(doc, { size: 'card' });
    card.insertBefore(head, title);
    head.appendChild(figure);
    head.appendChild(title);
    var pick = doc.createElement('details');
    pick.className = 'agents-tutor-pick';
    var sum = doc.createElement('summary');
    sum.className = 'agents-tutor-pick-sum';
    sum.textContent = TEXT.legend;
    pick.appendChild(sum);
    pick.appendChild(buildPicker(doc));
    card.appendChild(pick);
    watch(doc, card, figure);
    return figure;
  }

  function watch(doc, card, figure) {
    var Obs = root.MutationObserver;
    var log = card.querySelector('#agents-tutor-log');
    var wait = card.querySelector('.agents-tutor-wait');
    if (!Obs || !log || !wait) return;
    var timer = null;
    var settle = function () { setState(figure, wait.hidden ? 'idle' : 'thinking'); };
    new Obs(settle).observe(wait, { attributes: true, attributeFilter: ['hidden'] });
    new Obs(function () {
      var who = log.querySelectorAll('.agents-tutor-msg:not(.agents-tutor-msg-user) .agents-tutor-who:not(.agents-tutor-who-avatar)');
      for (var i = 0; i < who.length; i += 1) addAvatar(doc, who[i]);
      if (!who.length) return;
      setState(figure, 'speaking');
      root.clearTimeout(timer);
      timer = root.setTimeout(settle, SPEAK_MS);
    }).observe(log, { childList: true });
  }

  var api = {
    STORE_NAME: STORE_NAME, EVENT: EVENT, STATES: STATES, SIZES: SIZES, PERSONAS: PERSONAS, DEFAULT_ID: DEFAULT_ID, TEXT: TEXT,
    getPersona: getPersona, setPersona: setPersona, render: render, setState: setState, buildPicker: buildPicker, decorateCard: decorateCard,
    figureLabel: figureLabel, refreshAll: refreshAll, art: ART,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.LaiftTutorPersona = api;
    var css = root.document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'tutor-persona.css';
    root.document.head.appendChild(css);
  }
})(typeof window !== 'undefined' ? window : globalThis);
