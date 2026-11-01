/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Posição livre de Guia (assistant.js): a pessoa arrasta a bolha (e o painel, pelo cabeçalho) para qualquer ponto
// da tela, para que ela não cubra o que está sendo usado. A posição é só uma conveniência de quem usa o aparelho:
// fica em localStorage (fração da área livre, então sobrevive a girar a tela ou mudar o tamanho da janela) e nunca
// vai ao servidor. Sem arrastar, nada muda: Guia continua no canto de sempre.
//
// Como funciona (sem style inline no HTML; só variáveis CSS pelo CSSOM, como o resto do app):
//   - html[data-lia-moved] + --lia-x/--lia-y/--lia-w/--lia-h: posição da bolha (a dica acompanha, ver ux.css);
//   - html[data-lia-panel] + --lia-px/--lia-py: posição do painel (só em telas largas; no celular o painel
//     continua ocupando a largura, como uma folha).
// Acessível: Alt + setas movem a bolha pelo teclado (Shift = passo maior) e "Voltar ao canto" desfaz tudo.
// Um toque ou clique sem arrastar abre Guia como antes: só passa de 6 px vira arrasto.
// Expõe window.AssistantDrag (ou module.exports, no Node).
(function (root) {
  'use strict';

  var STORAGE_KEY = 'laift_lia_pos_v1';
  var MARGIN = 8;
  var DRAG_THRESHOLD = 6;
  var KEY_STEP = 16;
  var KEY_STEP_BIG = 64;
  var PANEL_MIN_WIDTH = 481; // até 480 px o painel ocupa a largura (CSS): sem posição própria
  var ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  // ---------- Funções puras ----------

  function isNum(value) { return typeof value === 'number' && isFinite(value); }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  /** Canto superior esquerdo válido para uma caixa `size` dentro da janela `view`, com folga das bordas. */
  function clampPosition(pos, size, view) {
    return {
      x: clamp(pos.x, MARGIN, view.width - size.width - MARGIN),
      y: clamp(pos.y, MARGIN, view.height - size.height - MARGIN),
    };
  }

  /** Posição em pixels -> fração (0 a 1) da área livre; vale para qualquer tamanho de janela. */
  function toStored(pos, size, view) {
    var rangeX = view.width - size.width - 2 * MARGIN;
    var rangeY = view.height - size.height - 2 * MARGIN;
    return {
      fx: rangeX > 0 ? clamp((pos.x - MARGIN) / rangeX, 0, 1) : 0,
      fy: rangeY > 0 ? clamp((pos.y - MARGIN) / rangeY, 0, 1) : 0,
    };
  }

  /** Fração guardada -> pixels na janela de agora (sempre dentro da tela). */
  function fromStored(stored, size, view) {
    var rangeX = Math.max(0, view.width - size.width - 2 * MARGIN);
    var rangeY = Math.max(0, view.height - size.height - 2 * MARGIN);
    return { x: Math.round(MARGIN + stored.fx * rangeX), y: Math.round(MARGIN + stored.fy * rangeY) };
  }

  function validPoint(point) {
    return !!point && isNum(point.fx) && isNum(point.fy) && point.fx >= 0 && point.fx <= 1 && point.fy >= 0 && point.fy <= 1;
  }

  /** Texto guardado -> { launcher, panel } (cada um {fx, fy} ou null). Qualquer coisa estranha vira "sem posição". */
  function parseStored(raw) {
    var empty = { launcher: null, panel: null };
    if (typeof raw !== 'string' || !raw) return empty;
    var data;
    try { data = JSON.parse(raw); } catch (err) { return empty; }
    if (!data || typeof data !== 'object') return empty;
    return {
      launcher: validPoint(data.l) ? { fx: data.l.fx, fy: data.l.fy } : null,
      panel: validPoint(data.p) ? { fx: data.p.fx, fy: data.p.fy } : null,
    };
  }

  function serialize(state) {
    var out = {};
    if (state.launcher) out.l = state.launcher;
    if (state.panel) out.p = state.panel;
    return JSON.stringify(out);
  }

  /** Onde abrir o painel junto da bolha: acima dela, alinhado pela direita; sem espaço em cima, abaixo. */
  function panelPlacement(anchor, panel, view) {
    var x = anchor.x + anchor.width - panel.width;
    var above = anchor.y - panel.height - MARGIN;
    var y = above >= MARGIN ? above : anchor.y + anchor.height + MARGIN;
    return clampPosition({ x: x, y: y }, panel, view);
  }

  /** Só vira arrasto depois de passar do limite (um toque com tremida não arrasta). */
  function pastThreshold(dx, dy) {
    return Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
  }

  /** Alt + seta (Shift = passo maior) -> deslocamento em pixels; qualquer outra tecla, null. */
  function keyDelta(evt) {
    var dir = evt && evt.altKey ? ARROWS[evt.key] : null;
    if (!dir) return null;
    var step = evt.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    return { dx: dir[0] * step, dy: dir[1] * step };
  }

  // ---------- Navegador ----------

  function readStore(win) {
    try { return parseStored(win.localStorage.getItem(STORAGE_KEY)); } catch (err) { return parseStored(''); }
  }

  function writeStore(win, state) {
    try {
      if (!state.launcher && !state.panel) win.localStorage.removeItem(STORAGE_KEY);
      else win.localStorage.setItem(STORAGE_KEY, serialize(state));
    } catch (err) { /* sem armazenamento: a posição vale só nesta sessão */ }
  }

  function rectOf(node) {
    var box = node.getBoundingClientRect();
    return { x: box.left, y: box.top, width: box.width, height: box.height };
  }

  function viewOf(win) {
    var el = win.document.documentElement;
    return { width: el.clientWidth || win.innerWidth, height: win.innerHeight || el.clientHeight };
  }

  /**
   * Liga o arrastar à bolha (`launcher`) e ao painel (`panel`, pelo `handle`).
   * Devolve { refresh, placePanel, reset }: refresh() reaplica depois de a bolha aparecer ou da janela mudar;
   * placePanel() posiciona o painel logo depois de aberto; reset() volta tudo ao canto de origem.
   */
  function attach(opts) {
    var win = opts.win;
    var doc = opts.doc;
    var html = doc.documentElement;
    var state = readStore(win);
    var suppressClick = false;

    function setVars(map) { Object.keys(map).forEach(function (key) { html.style.setProperty(key, map[key] + 'px'); }); }

    function placeLauncher(pos, size) {
      setVars({ '--lia-x': pos.x, '--lia-y': pos.y, '--lia-w': size.width, '--lia-h': size.height });
      html.setAttribute('data-lia-moved', '1');
      html.setAttribute('data-lia-hint', pos.y < 120 ? 'below' : 'above');
    }

    function refresh() {
      if (!state.launcher) { html.removeAttribute('data-lia-moved'); return; }
      var size = rectOf(opts.launcher);
      if (!size.width) return; // bolha escondida: reaplica quando aparecer
      placeLauncher(fromStored(state.launcher, size, viewOf(win)), size);
    }

    function placePanel() {
      var wide = viewOf(win).width >= PANEL_MIN_WIDTH;
      if (!wide || (!state.panel && !state.launcher)) { html.removeAttribute('data-lia-panel'); return; }
      var size = rectOf(opts.panel);
      if (!size.width) return;
      var view = viewOf(win);
      var pos = state.panel ? fromStored(state.panel, size, view) : panelPlacement(rectOf(opts.launcher), size, view);
      setVars({ '--lia-px': pos.x, '--lia-py': pos.y });
      html.setAttribute('data-lia-panel', '1');
    }

    function reset() {
      state = { launcher: null, panel: null };
      writeStore(win, state);
      html.removeAttribute('data-lia-moved');
      html.removeAttribute('data-lia-panel');
      html.removeAttribute('data-lia-hint');
    }

    /** Arrasto genérico: `onMove(origem, dx, dy)` enquanto arrasta, `onEnd(moved)` ao soltar. */
    function dragWith(node, canStart, onStart, onMove, onEnd) {
      var start = null;
      node.addEventListener('pointerdown', function (evt) {
        if (evt.isPrimary === false || (evt.button != null && evt.button !== 0) || !canStart(evt)) return;
        start = { id: evt.pointerId, x: evt.clientX, y: evt.clientY, moved: false, origin: onStart() };
        if (node.setPointerCapture) { try { node.setPointerCapture(evt.pointerId); } catch (err) { /* ignora */ } }
      });
      node.addEventListener('pointermove', function (evt) {
        if (!start || evt.pointerId !== start.id) return;
        var dx = evt.clientX - start.x;
        var dy = evt.clientY - start.y;
        if (!start.moved && !pastThreshold(dx, dy)) return;
        if (!start.moved) { start.moved = true; html.setAttribute('data-lia-dragging', '1'); }
        evt.preventDefault();
        onMove(start.origin, dx, dy);
      });
      var finish = function (evt) {
        if (!start || (evt && evt.pointerId !== start.id)) return;
        var moved = start.moved;
        start = null;
        html.removeAttribute('data-lia-dragging');
        onEnd(moved);
      };
      node.addEventListener('pointerup', finish);
      node.addEventListener('pointercancel', finish);
    }

    // Bolha: arrastar em qualquer tela.
    var launcherDrag = { size: null, last: null };
    dragWith(opts.launcher, function () { return true; },
      function () { launcherDrag.size = rectOf(opts.launcher); return launcherDrag.size; },
      function (origin, dx, dy) {
        var pos = clampPosition({ x: origin.x + dx, y: origin.y + dy }, origin, viewOf(win));
        placeLauncher(pos, origin);
        launcherDrag.last = pos;
      },
      function (moved) {
        if (!moved) return;
        suppressClick = true; // o clique que acompanha o fim do arrasto não abre nem fecha Guia
        win.setTimeout(function () { suppressClick = false; }, 0);
        state = { launcher: toStored(launcherDrag.last, launcherDrag.size, viewOf(win)), panel: null };
        writeStore(win, state);
        if (!opts.panel.classList.contains('hidden')) placePanel(); // painel aberto: vai junto da bolha
      });
    opts.launcher.addEventListener('click', function (evt) {
      if (!suppressClick) return;
      suppressClick = false;
      evt.stopImmediatePropagation();
      evt.preventDefault();
    }, true);

    // Painel: arrastar pelo cabeçalho (telas largas; botões e campos do cabeçalho continuam funcionando).
    var panelDrag = { size: null, last: null };
    if (opts.handle) {
      dragWith(opts.handle,
        function (evt) { return viewOf(win).width >= PANEL_MIN_WIDTH && !(evt.target && evt.target.closest && evt.target.closest('button, input, a')); },
        function () { panelDrag.size = rectOf(opts.panel); return panelDrag.size; },
        function (origin, dx, dy) {
          panelDrag.last = clampPosition({ x: origin.x + dx, y: origin.y + dy }, origin, viewOf(win));
          setVars({ '--lia-px': panelDrag.last.x, '--lia-py': panelDrag.last.y });
          html.setAttribute('data-lia-panel', '1');
        },
        function (moved) {
          if (!moved) return;
          state = { launcher: state.launcher, panel: toStored(panelDrag.last, panelDrag.size, viewOf(win)) };
          writeStore(win, state);
        });
    }

    // Teclado: Alt + setas movem a bolha (Shift = passo maior).
    opts.launcher.addEventListener('keydown', function (evt) {
      var delta = keyDelta(evt);
      if (!delta) return;
      evt.preventDefault();
      var size = rectOf(opts.launcher);
      var view = viewOf(win);
      var pos = clampPosition({ x: size.x + delta.dx, y: size.y + delta.dy }, size, view);
      placeLauncher(pos, size);
      state = { launcher: toStored(pos, size, view), panel: null };
      writeStore(win, state);
    });

    // Voltar ao canto: botão na nota do painel.
    if (opts.note) {
      var back = doc.createElement('button');
      back.type = 'button';
      back.className = 'link-btn lia-reset-pos';
      back.textContent = 'Voltar ao canto';
      back.addEventListener('click', reset);
      opts.note.appendChild(doc.createTextNode(' '));
      opts.note.appendChild(back);
    }

    // O app mostra/esconde a bolha e o painel pela classe 'hidden': o módulo observa e se ajusta sozinho.
    if (typeof win.MutationObserver === 'function') {
      new win.MutationObserver(function () { if (!opts.panel.classList.contains('hidden')) placePanel(); }).observe(opts.panel, { attributes: true, attributeFilter: ['class'] });
      new win.MutationObserver(refresh).observe(opts.launcher, { attributes: true, attributeFilter: ['class'] });
    }
    win.addEventListener('resize', function () { refresh(); if (!opts.panel.classList.contains('hidden')) placePanel(); });
    refresh();
    return { refresh: refresh, placePanel: placePanel, reset: reset };
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    clamp: clamp,
    clampPosition: clampPosition,
    toStored: toStored,
    fromStored: fromStored,
    parseStored: parseStored,
    serialize: serialize,
    panelPlacement: panelPlacement,
    pastThreshold: pastThreshold,
    keyDelta: keyDelta,
    attach: attach,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AssistantDrag = api;
})(typeof window !== 'undefined' ? window : globalThis);
