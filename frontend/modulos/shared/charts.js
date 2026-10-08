/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Gráficos SVG sem dependência (ver docs/CHART_PALETTE.md e ADR 0001/0002).
// Cada função de gráfico recebe (container, data, options) e devolve
// { el, update(data), destroy() }. Cores só por data-series (var(--chart-1..8)
// no CSS); movimento só em CSS por transform/opacity/stroke-dashoffset com
// --dur-*/--ease-*; nenhum HTML é montado a partir de string: os nós nascem
// com createElement/createElementNS. Expõe window.LaiftCharts; em Node, module.exports.
(function (root) {
  'use strict';

  var core = typeof module !== 'undefined' && module.exports
    ? require('./charts-core.js')
    : root.LaiftChartsCore;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var EMPTY_HEIGHT = 56;
  var LABEL_GAP = 8;
  var LABEL_BASELINE = 18;
  var RADIUS = 4;
  var PAD = 36;
  var DOT_R = 4;
  var DOT_HIT_R = 22;
  // Rótulo de valor: 11 px, linha de base VALUE_OFFSET acima da marca; VALUE_HEADROOM abre espaço no topo.
  var VALUE_SIZE = 11;
  var VALUE_OFFSET = 6;
  var VALUE_HEADROOM = 16;
  // Margem à esquerda da linha/área para os rótulos do eixo Y.
  var GUTTER = 36;
  var RESIZE_DEBOUNCE_MS = 120;
  var uid = 0;

  var DEFAULTS = {
    bars: { width: 320, labelWidth: 120, valueWidth: 56, rowHeight: 28, gap: 8, title: 'Gráfico de barras' },
    line: { width: 320, height: 160, labelHeight: 28, title: 'Gráfico de linha e área' },
    grouped: { width: 320, height: 200, labelHeight: 28, series: null, title: 'Gráfico de colunas agrupadas' },
    donut: { size: 180, thickness: 22, gapDeg: 2, centerLabel: 'Total', title: 'Gráfico de rosca' },
    radial: { size: 140, thickness: 14, max: 100, label: 'Progresso', title: 'Progresso circular' },
    spark: { width: 120, height: 32, live: false, title: 'Tendência' }
  };

  // ---------- DOM (sempre createElement / createElementNS) ----------

  function setAttrs(node, attrs) {
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] !== undefined && attrs[key] !== null) node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }

  function svgNode(doc, name, attrs, text) {
    var node = setAttrs(doc.createElementNS(SVG_NS, name), attrs);
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function htmlNode(doc, name, attrs, text) {
    var node = setAttrs(doc.createElement(name), attrs);
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function appendAll(parent, children) {
    children.forEach(function (child) { if (child) parent.appendChild(child); });
    return parent;
  }

  /** Propriedade CSS customizada (--i) via CSSOM: atributo style inline não é usado (CSP). */
  function setVar(node, name, value) {
    if (node.style && typeof node.style.setProperty === 'function') {
      node.style.setProperty(name, String(value));
    }
    return node;
  }

  function svgText(doc, cls, x, y, anchor, content) {
    return svgNode(doc, 'text', { class: cls, x: x, y: y, 'text-anchor': anchor }, content);
  }

  function isReducedMotion(options) {
    if (options && typeof options.reducedMotion === 'boolean') return options.reducedMotion;
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function nextId(prefix) {
    uid += 1;
    return prefix + '-' + uid;
  }

  function wrapClass(spec, ctx) {
    var names = ['laift-chart', 'laift-chart--' + spec.kind];
    if (spec.empty) names.push('laift-chart--empty');
    if (ctx.reduced) names.push('laift-chart--static');
    if (ctx.live) names.push('laift-chart--live');
    return names.join(' ');
  }

  /** Casca comum: raiz HTML + svg role=img com <title> e <desc>. */
  function frame(doc, ctx, spec) {
    var titleId = nextId('laift-chart-title');
    var descId = nextId('laift-chart-desc');
    // width em px = viewBox: 1 unidade do SVG é 1 px. Sem isso a fonte cresce com o contêiner.
    var svg = svgNode(doc, 'svg', {
      class: 'laift-chart__svg',
      width: spec.width,
      viewBox: '0 0 ' + spec.width + ' ' + spec.height,
      role: 'img',
      'aria-labelledby': titleId + ' ' + descId
    });
    appendAll(svg, [
      svgNode(doc, 'title', { id: titleId }, spec.title),
      svgNode(doc, 'desc', { id: descId }, spec.description)
    ]);
    return { wrap: htmlNode(doc, 'div', { class: wrapClass(spec, ctx) }), svg: svg };
  }

  /** Anexa svg e extras (legenda, tabela) à raiz. Tabela é irmã do svg: role=img esconde filhos. */
  function finish(parts, extras) {
    return appendAll(parts.wrap, [parts.svg].concat(extras || []));
  }

  /** Sem dados: aviso discreto de altura fixa (EMPTY_HEIGHT), nunca o bloco inteiro do gráfico. */
  function emptyParts(doc, ctx, kind, width, height, title) {
    var h = Math.min(height, EMPTY_HEIGHT);
    var parts = frame(doc, ctx, {
      kind: kind, width: width, height: h, title: title,
      description: core.EMPTY_LABEL + '.', empty: true
    });
    appendAll(parts.svg, [svgText(doc, 'laift-chart__empty', width / 2, h / 2 + 4, 'middle', core.EMPTY_LABEL)]);
    return finish(parts, []);
  }

  function legendNode(doc, items) {
    var list = htmlNode(doc, 'ul', { class: 'laift-chart__legend' });
    return appendAll(list, items.map(function (item) {
      var li = htmlNode(doc, 'li', { class: 'laift-chart__legend-item' });
      return appendAll(li, [
        htmlNode(doc, 'span', { class: 'laift-chart__swatch', 'data-series': item.slot, 'aria-hidden': 'true' }),
        htmlNode(doc, 'span', { class: 'laift-chart__legend-text' }, item.label)
      ]);
    }));
  }

  /** Agrupa marca e rótulos para o realce de hover. Sem tabindex nem aria: a tabela sr-only entrega os valores. */
  function item(doc, children) {
    return appendAll(svgNode(doc, 'g', { class: 'laift-chart__item' }), children);
  }

  /** Rótulo de valor: persistente, ou só realce de hover quando não cabe sem colidir. */
  function valueText(doc, at, value, persistent) {
    var cls = persistent ? 'laift-chart__value' : 'laift-chart__value laift-chart__value--hover';
    return svgNode(doc, 'text', {
      class: cls, x: at.x, y: at.y, 'text-anchor': at.anchor, 'dominant-baseline': at.baseline
    }, core.formatNumber(value));
  }

  // ---------- Tabela alternativa ----------

  function headRow(doc, headers) {
    var tr = htmlNode(doc, 'tr');
    return appendAll(tr, headers.map(function (h) { return htmlNode(doc, 'th', { scope: 'col' }, h); }));
  }

  function bodyRow(doc, cells) {
    var tr = htmlNode(doc, 'tr');
    return appendAll(tr, cells.map(function (cell, i) {
      return i === 0
        ? htmlNode(doc, 'th', { scope: 'row' }, cell)
        : htmlNode(doc, 'td', {}, cell);
    }));
  }

  /** Tabela acessível alternativa ao gráfico; oculta visualmente (.sr-only) por padrão. */
  function toTable(data, caption, options) {
    var opts = options || {};
    var doc = opts.doc || root.document;
    var format = typeof opts.format === 'function' ? opts.format : core.formatNumber;
    var headers = Array.isArray(opts.headers) ? opts.headers : ['Categoria', 'Valor'];
    var table = htmlNode(doc, 'table', { class: opts.className || 'sr-only' });
    var thead = appendAll(htmlNode(doc, 'thead'), [headRow(doc, headers)]);
    var tbody = htmlNode(doc, 'tbody');
    appendAll(tbody, core.tableRows(core.normalizeRows(data), format).map(function (cells) {
      return bodyRow(doc, cells);
    }));
    return appendAll(table, [htmlNode(doc, 'caption', {}, caption), thead, tbody]);
  }

  // ---------- countUp ----------

  function readDuration(el, opts) {
    if (typeof opts.duration === 'number') return opts.duration;
    var style = typeof root.getComputedStyle === 'function' ? root.getComputedStyle(el) : null;
    return core.parseDuration(style ? style.getPropertyValue('--dur-lazy') : '');
  }

  /**
   * Conta de 0 até valor dentro de el (textContent). Com reduced motion,
   * sem rAF ou duração zero, mostra o valor final direto. Devolve { cancel }.
   */
  function countUp(el, valor, options) {
    var opts = options || {};
    var format = typeof opts.format === 'function' ? opts.format : core.formatNumber;
    var target = core.toNumber(valor);
    var duration = readDuration(el, opts);
    if (isReducedMotion(opts) || duration <= 0 || typeof root.requestAnimationFrame !== 'function') {
      el.textContent = format(target);
      return { cancel: function () {} };
    }
    var start = null;
    var frameId = null;
    var stopped = false;
    function step(ts) {
      if (stopped) return;
      if (start === null) start = ts;
      var elapsed = ts - start;
      el.textContent = format(core.countUpValue(0, target, elapsed, duration));
      if (elapsed < duration) frameId = root.requestAnimationFrame(step);
    }
    frameId = root.requestAnimationFrame(step);
    return {
      cancel: function () {
        stopped = true;
        if (frameId !== null && typeof root.cancelAnimationFrame === 'function') {
          root.cancelAnimationFrame(frameId);
        }
        el.textContent = format(target);
      }
    };
  }

  /** Valor central que conta até o alvo; registra o handle para cancelar no update/destroy. */
  function centerValue(doc, ctx, spec) {
    var label = spec.label ? svgText(doc, 'laift-chart__center-label', spec.x, spec.y - 4, 'middle', spec.label) : null;
    var value = svgText(doc, 'laift-chart__center-value', spec.x, spec.y + 22, 'middle', '0');
    ctx.track(countUp(value, spec.target, {
      format: spec.format,
      duration: spec.duration,
      reducedMotion: ctx.reduced
    }));
    return [label, value];
  }

  // ---------- Montagem e ciclo de vida ----------

  /** Piso de largura: contêiner estreito não desenha menor que isso (o SVG encolhe pelo max-width). */
  var MIN_FLUID_WIDTH = 160;
  /** Variação mínima de largura para refazer o gráfico (evita laço de resize). */
  var RESIZE_MIN_DELTA_PX = 8;

  function paddingOf(el) {
    if (typeof root.getComputedStyle !== 'function') return 0;
    var style = root.getComputedStyle(el);
    return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }

  /** Largura útil do contêiner (border box menos padding) em px; sem medida usa a padrão. */
  function measureWidth(container, fallback) {
    if (!container || typeof container.getBoundingClientRect !== 'function') return fallback;
    var inner = Math.floor(container.getBoundingClientRect().width - paddingOf(container));
    return inner > 0 ? Math.max(MIN_FLUID_WIDTH, inner) : fallback;
  }

  /**
   * Liga o render ao container e devolve { el, update, destroy }. Com options.fluid,
   * o gráfico é desenhado na largura real do contêiner e refeito (com debounce)
   * quando ela muda, para o SVG nunca ser esticado.
   */
  function mount(container, data, options, defaults, paint) {
    if (!container) throw new Error('LaiftCharts: container obrigatório');
    var opts = Object.assign({}, defaults, options || {});
    var state = { node: null, handles: [], data: data, timer: null, observer: null };
    var ctx = {
      options: opts,
      reduced: isReducedMotion(opts),
      live: !!opts.live,
      track: function (handle) { state.handles.push(handle); return handle; }
    };

    function cancelHandles() {
      state.handles.forEach(function (handle) { handle.cancel(); });
      state.handles = [];
    }

    function render(next) {
      cancelHandles();
      var doc = container.ownerDocument || root.document;
      var width = opts.fluid ? measureWidth(container, opts.width) : opts.width;
      ctx.options = Object.assign({}, opts, { width: width });
      var node = paint(doc, next, ctx);
      if (state.node) container.removeChild(state.node);
      container.appendChild(node);
      state.node = node;
      state.data = next;
    }

    function refit() {
      state.timer = null;
      if (state.node && Math.abs(measureWidth(container, opts.width) - ctx.options.width) >= RESIZE_MIN_DELTA_PX) {
        render(state.data);
      }
    }

    function onResize() {
      if (state.timer !== null) root.clearTimeout(state.timer);
      state.timer = root.setTimeout(refit, RESIZE_DEBOUNCE_MS);
    }

    function observe() {
      var Observer = root.ResizeObserver;
      if (!opts.fluid || typeof Observer !== 'function') return null;
      var observer = new Observer(onResize);
      observer.observe(container);
      return observer;
    }

    render(data);
    state.observer = observe();

    var api = {
      get el() { return state.node; },
      update: function (next) { render(next); return api; },
      destroy: function () {
        if (state.observer) state.observer.disconnect();
        if (state.timer !== null) root.clearTimeout(state.timer);
        state.observer = null;
        state.timer = null;
        cancelHandles();
        if (state.node) container.removeChild(state.node);
        state.node = null;
      }
    };
    return api;
  }

  // ---------- Barras horizontais ----------

  function barItem(doc, bar, o) {
    var mid = bar.y + o.rowHeight / 2;
    var path = svgNode(doc, 'path', {
      class: 'laift-chart__bar laift-chart__bar--h',
      'data-series': bar.slot,
      d: core.barPath(o.labelWidth, bar.y, bar.length, o.rowHeight, RADIUS, 'horizontal')
    });
    setVar(path, '--i', bar.index);
    // Barra horizontal sempre cabe o valor: uma linha por categoria, sem colisão vertical.
    return item(doc, [
      svgNode(doc, 'rect', { class: 'laift-chart__hit', x: 0, y: bar.y - o.gap / 2, width: o.width, height: o.rowHeight + o.gap }),
      svgNode(doc, 'text', { class: 'laift-chart__label', x: o.labelWidth - LABEL_GAP, y: mid, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, bar.label),
      path,
      valueText(doc, { x: o.labelWidth + bar.length + LABEL_GAP, y: mid, baseline: 'middle' }, bar.value, true)
    ]);
  }

  function paintBars(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.capCategories(core.normalizeRows(data), core.MAX_SERIES);
    if (core.isEmpty(rows)) return emptyParts(doc, ctx, 'bars', o.width, EMPTY_HEIGHT, o.title);
    var model = core.barsModel(rows, {
      plotWidth: o.width - o.labelWidth - o.valueWidth,
      rowHeight: o.rowHeight,
      gap: o.gap
    });
    var parts = frame(doc, ctx, {
      kind: 'bars', width: o.width, height: model.height, title: o.title,
      description: core.describeRows(rows, core.formatNumber)
    });
    appendAll(parts.svg, model.bars.map(function (bar) { return barItem(doc, bar, o); }));
    return finish(parts, [toTable(rows, o.title, { doc: doc })]);
  }

  // ---------- Linha e área ----------

  /** Eixo Y com três marcas (0, metade e máximo): grade e rótulo na margem esquerda, entre o topo e a base. */
  function yAxis(doc, max, plotW, innerH, bottom) {
    var nodes = [];
    core.ticks(max, 2).forEach(function (tick) {
      var y = bottom - (tick / max) * innerH;
      nodes.push(svgNode(doc, 'line', { class: 'laift-chart__grid', x1: GUTTER, x2: GUTTER + plotW, y1: y, y2: y }));
      nodes.push(svgNode(doc, 'text', {
        class: 'laift-chart__axis-label', x: GUTTER - 6, y: y, 'text-anchor': 'end', 'dominant-baseline': 'middle'
      }, core.formatNumber(tick)));
    });
    return nodes;
  }

  /** Rótulos só do primeiro e do último período (rótulos seletivos). */
  function axisLabels(doc, rows, startX, endX, plotH) {
    if (!rows.length) return [];
    var base = plotH + LABEL_BASELINE;
    if (rows.length === 1) return [svgText(doc, 'laift-chart__label', (startX + endX) / 2, base, 'middle', rows[0].label)];
    return [
      svgText(doc, 'laift-chart__label', startX, base, 'start', rows[0].label),
      svgText(doc, 'laift-chart__label', endX, base, 'end', rows[rows.length - 1].label)
    ];
  }

  /** Índice do maior valor da linha (o primeiro, em empate). */
  function peakIndex(points) {
    return points.reduce(function (best, p, i) { return p.value > points[best].value ? i : best; }, 0);
  }

  /**
   * Quais pontos da linha mostram o valor de forma persistente: o último sempre; o máximo
   * quando não colide com ele. Os demais só realçam no hover. Coordenadas absolutas do SVG.
   */
  function linePointFlags(points, o) {
    var last = points.length - 1;
    var peak = peakIndex(points);
    var idx = peak === last ? [last] : [last, peak];
    var cands = idx.map(function (i) {
      var p = points[i];
      return {
        x: GUTTER + p.x,
        y: VALUE_HEADROOM + p.y - VALUE_OFFSET,
        text: core.formatNumber(p.value),
        anchor: i === last ? 'end' : 'middle',
        priority: 1,
        required: i === last
      };
    });
    var shown = core.placeValueLabels(cands, {
      size: VALUE_SIZE, bounds: { minX: 0, maxX: o.width, minY: 0, maxY: o.height }
    });
    var flags = points.map(function () { return false; });
    idx.forEach(function (i, k) { flags[i] = shown[k]; });
    return flags;
  }

  /** Ponto da linha (coordenadas do grupo da linha): alvo de hover, marcador e rótulo. */
  function linePoint(doc, p, state) {
    var dotClass = state.marker ? 'laift-chart__dot' : 'laift-chart__dot laift-chart__dot--quiet';
    return item(doc, [
      svgNode(doc, 'circle', { class: 'laift-chart__hit', cx: p.x, cy: p.y, r: DOT_HIT_R }),
      svgNode(doc, 'circle', { class: dotClass, 'data-series': 1, cx: p.x, cy: p.y, r: DOT_R }),
      valueText(doc, { x: p.x, y: p.y - VALUE_OFFSET, anchor: state.anchor }, p.value, state.show)
    ]);
  }

  function paintLine(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.normalizeRows(data);
    if (core.isEmpty(rows)) return emptyParts(doc, ctx, 'line', o.width, o.height, o.title);
    var bottom = o.height - o.labelHeight;
    var innerH = Math.max(1, bottom - VALUE_HEADROOM);
    var plotW = Math.max(1, o.width - GUTTER);
    var model = core.lineModel(rows.map(function (row) { return row.value; }), { width: plotW, height: innerH });
    var parts = frame(doc, ctx, {
      kind: 'line', width: o.width, height: o.height, title: o.title,
      description: core.describeRows(rows, core.formatNumber)
    });
    var last = model.points.length - 1;
    var peak = peakIndex(model.points);
    var flags = linePointFlags(model.points, o);
    var plot = svgNode(doc, 'g', { transform: 'translate(' + GUTTER + ' ' + VALUE_HEADROOM + ')' });
    appendAll(plot, [
      svgNode(doc, 'path', { class: 'laift-chart__area', 'data-series': 1, d: model.areaPath }),
      svgNode(doc, 'path', { class: 'laift-chart__line', 'data-series': 1, d: model.linePath, pathLength: '1' })
    ].concat(model.points.map(function (p, i) {
      return linePoint(doc, p, { marker: i === last || i === peak, anchor: i === last ? 'end' : 'middle', show: flags[i] });
    })));
    appendAll(parts.svg, yAxis(doc, model.max, plotW, innerH, bottom).concat([plot], axisLabels(doc, rows, GUTTER, o.width, bottom)));
    return finish(parts, [toTable(rows, o.title, { doc: doc, headers: ['Período', 'Valor'] })]);
  }

  // ---------- Colunas agrupadas ----------

  function seriesCount(rows) {
    return rows.reduce(function (best, row) { return Math.max(best, (row.values || []).length); }, 0);
  }

  function seriesNames(count, names) {
    var out = [];
    for (var i = 0; i < count; i += 1) {
      out.push(Array.isArray(names) && names[i] ? String(names[i]) : 'Série ' + (i + 1));
    }
    return out;
  }

  /** Posição do rótulo de uma coluna: linha de base logo acima do topo da barra (coordenadas do SVG). */
  function columnValueAt(bar, geo) {
    return { x: bar.x + bar.width / 2, y: geo.top + bar.y - VALUE_OFFSET, anchor: 'middle' };
  }

  /**
   * Rótulos das colunas: o maior valor primeiro (em empate, a coluna mais à direita). O que colide
   * vira só realce de hover; a legenda passa a trazer o total de cada série. Devolve [grupo][barra].
   */
  function columnLabelFlags(groups, geo, width) {
    var cands = [];
    groups.forEach(function (group) {
      group.bars.forEach(function (bar) {
        var at = columnValueAt(bar, geo);
        cands.push({ x: at.x, y: at.y, anchor: at.anchor, text: core.formatNumber(bar.value), priority: bar.value });
      });
    });
    var shown = core.placeValueLabels(cands, {
      size: VALUE_SIZE, bounds: { minX: 0, maxX: width, minY: 0, maxY: geo.bottom }
    });
    var offset = 0;
    return groups.map(function (group) {
      var row = shown.slice(offset, offset + group.bars.length);
      offset += group.bars.length;
      return row;
    });
  }

  /** Coluna de uma série: sobe da linha de base; o rótulo aparece se a decisão de colisão aprovar. */
  function groupItem(doc, group, index, geo, flags) {
    var children = [svgNode(doc, 'rect', {
      class: 'laift-chart__hit',
      x: group.center - geo.groupWidth / 2, y: 0, width: geo.groupWidth, height: geo.bottom + LABEL_BASELINE + 4
    })];
    group.bars.forEach(function (bar, i) {
      var path = svgNode(doc, 'path', {
        class: 'laift-chart__bar laift-chart__bar--v',
        'data-series': bar.slot,
        d: core.barPath(bar.x, bar.y + geo.top, bar.width, bar.height, RADIUS, 'vertical')
      });
      setVar(path, '--i', index);
      children.push(path, valueText(doc, columnValueAt(bar, geo), bar.value, flags[i]));
    });
    children.push(svgText(doc, 'laift-chart__label', group.center, geo.bottom + LABEL_BASELINE, 'middle', group.label));
    return item(doc, children);
  }

  function paintGrouped(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.normalizeRows(data);
    if (core.isEmpty(rows)) return emptyParts(doc, ctx, 'grouped', o.width, o.height, o.title);
    var count = Math.max(1, Math.min(seriesCount(rows), core.MAX_SERIES));
    var names = seriesNames(count, o.series);
    var bottom = o.height - o.labelHeight;
    // As colunas sobem até bottom - VALUE_HEADROOM; groupItem soma geo.top para assentá-las na linha de base.
    var model = core.groupedModel(rows, count, { plotWidth: o.width, plotHeight: bottom - VALUE_HEADROOM });
    var parts = frame(doc, ctx, {
      kind: 'grouped', width: o.width, height: o.height, title: o.title,
      description: rows.length + (rows.length === 1 ? ' grupo' : ' grupos') + ', ' + count + (count === 1 ? ' série.' : ' séries.')
    });
    var geo = { top: VALUE_HEADROOM, bottom: bottom, groupWidth: o.width / rows.length };
    var flags = columnLabelFlags(model.groups, geo, o.width);
    var nodes = [svgNode(doc, 'line', { class: 'laift-chart__axis', x1: 0, x2: o.width, y1: bottom, y2: bottom })];
    model.groups.forEach(function (group, g) { nodes.push(groupItem(doc, group, g, geo, flags[g])); });
    appendAll(parts.svg, nodes);
    var hidden = flags.some(function (row) { return row.some(function (shown) { return !shown; }); });
    var totals = core.seriesTotals(rows, count);
    var extras = [];
    if (count >= 2 || hidden) {
      extras.push(legendNode(doc, names.map(function (name, i) {
        return { slot: i + 1, label: hidden ? name + ' · ' + core.formatNumber(totals[i]) : name };
      })));
    }
    extras.push(toTable(rows, o.title, { doc: doc, headers: ['Grupo'].concat(names) }));
    return finish(parts, extras);
  }

  // ---------- Rosca ----------

  function anchorFor(deg) {
    var cos = Math.cos(((deg - 90) * Math.PI) / 180);
    if (cos > 0.3) return 'start';
    return cos < -0.3 ? 'end' : 'middle';
  }

  /** Rótulo de um segmento, fora do anel, no meio do arco (linha de base ajustada ao centro). */
  function donutValueAt(seg, center, radius, o) {
    var mid = (seg.start + seg.end) / 2;
    var outer = core.polarPoint(center, center, radius + o.thickness / 2 + LABEL_GAP * 2, mid);
    return { x: outer.x, y: outer.y + VALUE_SIZE * 0.35, anchor: anchorFor(mid) };
  }

  /** Rótulos da rosca: os que cabem dentro da caixa e não colidem. O resto fica só no hover; a legenda traz os valores. */
  function donutLabelFlags(segments, center, radius, o, box) {
    var cands = segments.map(function (seg) {
      var at = donutValueAt(seg, center, radius, o);
      return { x: at.x, y: at.y, anchor: at.anchor, text: core.formatNumber(seg.value), priority: seg.value };
    });
    return core.placeValueLabels(cands, { size: VALUE_SIZE, bounds: { minX: 0, maxX: box, minY: 0, maxY: box } });
  }

  function donutItem(doc, seg, center, radius, o, persistent) {
    var path = svgNode(doc, 'path', {
      class: 'laift-chart__seg',
      'data-series': seg.slot,
      d: seg.path,
      'stroke-width': o.thickness,
      pathLength: '1'
    });
    setVar(path, '--i', seg.index);
    return item(doc, [path, valueText(doc, donutValueAt(seg, center, radius, o), seg.value, persistent)]);
  }

  function paintDonut(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.capCategories(core.normalizeRows(data), core.MAX_SERIES);
    var box = o.size + PAD * 2;
    var center = box / 2;
    var radius = o.size / 2 - o.thickness / 2;
    var model = core.donutModel(rows, { cx: center, cy: center, r: radius, gapDeg: o.gapDeg });
    if (core.isEmpty(model.segments)) return emptyParts(doc, ctx, 'donut', box, box, o.title);
    var parts = frame(doc, ctx, {
      kind: 'donut', width: box, height: box, title: o.title,
      description: core.describeRows(rows, core.formatNumber)
    });
    var flags = donutLabelFlags(model.segments, center, radius, o, box);
    var nodes = [svgNode(doc, 'circle', { class: 'laift-chart__track', cx: center, cy: center, r: radius, 'stroke-width': o.thickness, fill: 'none' })];
    model.segments.forEach(function (seg, i) { nodes.push(donutItem(doc, seg, center, radius, o, flags[i])); });
    nodes = nodes.concat(centerValue(doc, ctx, { x: center, y: center, label: o.centerLabel, target: model.total, format: core.formatNumber, duration: o.duration }));
    appendAll(parts.svg, nodes.filter(Boolean));
    var legend = legendNode(doc, model.segments.map(function (seg) {
      return { slot: seg.slot, label: seg.label + ' · ' + core.formatNumber(seg.value) };
    }));
    return finish(parts, [legend, toTable(rows, o.title, { doc: doc })]);
  }

  // ---------- Progresso radial ----------

  function paintRadial(doc, data, ctx) {
    var o = ctx.options;
    var input = typeof data === 'number' ? { value: data } : data;
    var box = o.size;
    var center = box / 2;
    var radius = box / 2 - o.thickness / 2;
    if (input === null || typeof input !== 'object') return emptyParts(doc, ctx, 'radial', box, box, o.title);
    var model = core.radialModel(input.value, input.max !== undefined ? input.max : o.max);
    var parts = frame(doc, ctx, {
      kind: 'radial', width: box, height: box, title: o.title,
      description: core.formatPoints(model.percent) + ' concluído.'
    });
    var nodes = [
      svgNode(doc, 'circle', { class: 'laift-chart__track', cx: center, cy: center, r: radius, 'stroke-width': o.thickness, fill: 'none' }),
      svgNode(doc, 'path', {
        class: 'laift-chart__seg',
        'data-series': 1,
        d: core.arcPath(center, center, radius, 0, model.endDeg),
        'stroke-width': o.thickness,
        pathLength: '1'
      })
    ];
    nodes = nodes.concat(centerValue(doc, ctx, { x: center, y: center, target: model.percent, format: core.formatPoints, duration: o.duration }));
    appendAll(parts.svg, nodes);
    return finish(parts, [toTable([{ label: o.label, value: model.percent }], o.title, {
      doc: doc, headers: ['Indicador', 'Valor'], format: core.formatPoints
    })]);
  }

  // ---------- Sparkline ----------

  function paintSpark(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.normalizeRows(data);
    if (core.isEmpty(rows)) return emptyParts(doc, ctx, 'spark', o.width, o.height, o.title);
    var model = core.lineModel(rows.map(function (row) { return row.value; }), { width: o.width, height: o.height - VALUE_HEADROOM });
    var last = model.points[model.points.length - 1];
    var lastY = VALUE_HEADROOM + last.y;
    var parts = frame(doc, ctx, {
      kind: 'spark', width: o.width, height: o.height, title: o.title,
      description: core.describeRows(rows, core.formatNumber)
    });
    var pulse = svgNode(doc, 'g', { class: 'laift-chart__pulse', 'data-series': 1, transform: 'translate(0 ' + VALUE_HEADROOM + ')' });
    appendAll(pulse, [
      svgNode(doc, 'path', { class: 'laift-chart__area', d: model.areaPath }),
      svgNode(doc, 'path', { class: 'laift-chart__line', d: model.linePath, pathLength: '1' })
    ]);
    // Último valor sempre visível, ao lado do marcador; a faixa do topo (VALUE_HEADROOM) o acomoda.
    var end = item(doc, [
      svgNode(doc, 'circle', { class: 'laift-chart__hit', cx: last.x, cy: lastY, r: DOT_HIT_R }),
      svgNode(doc, 'circle', { class: 'laift-chart__dot', 'data-series': 1, cx: last.x, cy: lastY, r: DOT_R }),
      valueText(doc, { x: last.x, y: lastY - VALUE_OFFSET, anchor: 'end' }, last.value, true)
    ]);
    appendAll(parts.svg, [pulse, end]);
    return finish(parts, [toTable(rows, o.title, { doc: doc, headers: ['Período', 'Valor'] })]);
  }

  // ---------- API pública ----------

  var api = {
    barsHorizontal: function (container, data, options) {
      return mount(container, data, options, DEFAULTS.bars, paintBars);
    },
    lineArea: function (container, data, options) {
      return mount(container, data, options, DEFAULTS.line, paintLine);
    },
    groupedBars: function (container, data, options) {
      return mount(container, data, options, DEFAULTS.grouped, paintGrouped);
    },
    donut: function (container, data, options) {
      return mount(container, data, options, DEFAULTS.donut, paintDonut);
    },
    radialProgress: function (container, data, options) {
      return mount(container, data, options, DEFAULTS.radial, paintRadial);
    },
    sparkline: function (container, data, options) {
      return mount(container, data, options, DEFAULTS.spark, paintSpark);
    },
    countUp: countUp,
    toTable: toTable
  };

  var exported = Object.assign({}, core, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    root.LaiftCharts = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
