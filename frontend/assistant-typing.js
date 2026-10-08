/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Efeito de digitação do balão da Lia (onda 4): o texto aparece caractere a caractere, em requestAnimationFrame,
// num tempo total limitado. O leitor de tela NUNCA ouve letra por letra: o texto completo entra de uma vez num
// <span> só para leitores (visually-hidden) e a camada que digita fica em aria-hidden. Quem tem
// prefers-reduced-motion (ou navegador sem requestAnimationFrame) recebe o texto inteiro, sem efeito.
// A parte ainda não digitada fica transparente e ocupa o lugar dela, então o balão não cresce linha a linha.
// Texto sempre por textContent. Módulo opcional de assistant.js: sem ele, a Lia mostra o texto direto.
// Expõe window.AssistantTyping (ou module.exports, no Node).
(function (root) {
  'use strict';

  var CHARS_PER_SECOND = 90;
  var MAX_MS = 2500; // respostas longas aceleram: ninguém espera mais que isto
  var REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

  // ---------- Funções puras ----------

  /** Tempo total do efeito: proporcional ao tamanho, no máximo MAX_MS. */
  function durationFor(length) {
    var count = Math.max(0, Math.floor(Number(length) || 0));
    return Math.min(MAX_MS, Math.round((count / CHARS_PER_SECOND) * 1000));
  }

  /** Quantos caracteres já aparecem depois de `elapsed` ms (linear; nunca passa do total). */
  function visibleCount(elapsed, total, duration) {
    if (!(total > 0)) return 0;
    if (!(duration > 0) || elapsed >= duration) return total;
    return Math.max(0, Math.min(total, Math.floor((total * elapsed) / duration)));
  }

  /** Movimento reduzido? Sem como saber (erro), fica conservador; sem matchMedia, não é reduzido. */
  function reducedMotion(win) {
    try {
      return !!(win && typeof win.matchMedia === 'function' && win.matchMedia(REDUCED_QUERY).matches);
    } catch (err) {
      return true;
    }
  }

  function canType(text, win) {
    return typeof text === 'string' && text.length > 0 && !!win && typeof win.requestAnimationFrame === 'function' && !reducedMotion(win);
  }

  // ---------- DOM (createElement + textContent; nada vira HTML) ----------

  function span(doc, className, text) {
    var node = doc.createElement('span');
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  /** Camada visual: parte digitada + parte futura transparente (opacity por CSSOM, sem atributo style). */
  function buildLayer(doc, text) {
    var layer = span(doc, 'lia-typed');
    layer.setAttribute('aria-hidden', 'true');
    var shown = span(doc, 'lia-typed-shown');
    var rest = span(doc, 'lia-typed-rest', text);
    if (rest.style && typeof rest.style.setProperty === 'function') rest.style.setProperty('opacity', '0');
    layer.appendChild(shown);
    layer.appendChild(rest);
    return { layer: layer, shown: shown, rest: rest };
  }

  function startLoop(win, chars, parts, duration, complete) {
    var state = { frame: null, startAt: null, done: false };
    function paint(count) {
      parts.shown.textContent = chars.slice(0, count).join('');
      parts.rest.textContent = chars.slice(count).join('');
    }
    function step(stamp) {
      state.frame = null;
      if (state.done) return;
      if (state.startAt === null) state.startAt = stamp;
      var count = visibleCount(stamp - state.startAt, chars.length, duration);
      if (count >= chars.length) { complete(); return; }
      paint(count);
      state.frame = win.requestAnimationFrame(step);
    }
    paint(0);
    state.frame = win.requestAnimationFrame(step);
    return {
      state: state,
      stop: function () {
        state.done = true;
        if (state.frame !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(state.frame);
        state.frame = null;
      },
    };
  }

  /**
   * Põe o texto no balão (<p>). Com efeito: devolve { finish(), cancel(), isDone() } e chama opts.onDone() ao terminar
   * (também em finish()). Sem efeito: o balão já fica com o texto inteiro e devolve null (onDone não é chamado).
   * opts: { win (padrão: window), onDone }.
   */
  function render(doc, bubble, text, opts) {
    var options = opts || {};
    var win = options.win || root;
    if (!canType(text, win)) {
      bubble.textContent = typeof text === 'string' ? text : '';
      return null;
    }
    var chars = Array.from(text);
    var parts = buildLayer(doc, text);
    bubble.appendChild(span(doc, 'visually-hidden', text)); // o que o leitor de tela lê, de uma vez
    bubble.appendChild(parts.layer);
    var finished = false;
    var loop = null;
    function complete() {
      if (finished) return;
      finished = true;
      if (loop) loop.stop();
      parts.shown.textContent = text;
      parts.layer.removeChild(parts.rest);
      if (typeof options.onDone === 'function') options.onDone();
    }
    loop = startLoop(win, chars, parts, durationFor(chars.length), complete);
    return {
      finish: complete,
      cancel: function () { finished = true; loop.stop(); },
      isDone: function () { return finished; },
    };
  }

  var api = {
    CHARS_PER_SECOND: CHARS_PER_SECOND,
    MAX_MS: MAX_MS,
    durationFor: durationFor,
    visibleCount: visibleCount,
    reducedMotion: reducedMotion,
    canType: canType,
    render: render,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AssistantTyping = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
