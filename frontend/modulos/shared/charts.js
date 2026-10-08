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
    var svg = svgNode(doc, 'svg', {
      class: 'laift-chart__svg',
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

  function emptyParts(doc, ctx, kind, width, height, title) {
    var parts = frame(doc, ctx, {
      kind: kind, width: width, height: height, title: title,
      description: core.EMPTY_LABEL + '.', empty: true
    });
    appendAll(parts.svg, [svgText(doc, 'laift-chart__empty', width / 2, height / 2, 'middle', core.EMPTY_LABEL)]);
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

  /** Item focável (hover e teclado): aria-label com rótulo e valor. */
  function item(doc, label, value, children) {
    var g = svgNode(doc, 'g', {
      class: 'laift-chart__item',
      tabindex: '0',
      'aria-label': label + ': ' + core.formatNumber(value)
    });
    return appendAll(g, children);
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

  /** Liga o render ao container e devolve { el, update, destroy }. */
  function mount(container, data, options, defaults, paint) {
    if (!container) throw new Error('LaiftCharts: container obrigatório');
    var opts = Object.assign({}, defaults, options || {});
    var state = { node: null, handles: [] };
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
      var node = paint(doc, next, ctx);
      if (state.node) container.removeChild(state.node);
      container.appendChild(node);
      state.node = node;
    }

    render(data);

    var api = {
      get el() { return state.node; },
      update: function (next) { render(next); return api; },
      destroy: function () {
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
    return item(doc, bar.label, bar.value, [
      svgNode(doc, 'rect', { class: 'laift-chart__hit', x: 0, y: bar.y - o.gap / 2, width: o.width, height: o.rowHeight + o.gap }),
      svgNode(doc, 'text', { class: 'laift-chart__label', x: o.labelWidth - LABEL_GAP, y: mid, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, bar.label),
      path,
      svgNode(doc, 'text', { class: 'laift-chart__value', x: o.labelWidth + bar.length + LABEL_GAP, y: mid, 'dominant-baseline': 'middle' }, core.formatNumber(bar.value))
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

  function gridLines(doc, max, width, plotH) {
    return core.ticks(max, 4).map(function (tick) {
      var y = plotH - (tick / max) * plotH;
      return svgNode(doc, 'line', { class: 'laift-chart__grid', x1: 0, x2: width, y1: y, y2: y });
    });
  }

  function pointItem(doc, label, point) {
    return item(doc, label, point.value, [
      svgNode(doc, 'circle', { class: 'laift-chart__hit', cx: point.x, cy: point.y, r: DOT_HIT_R }),
      svgNode(doc, 'circle', { class: 'laift-chart__dot', 'data-series': 1, cx: point.x, cy: point.y, r: DOT_R }),
      svgNode(doc, 'text', { class: 'laift-chart__value', x: point.x, y: point.y - 12, 'text-anchor': 'middle' }, core.formatNumber(point.value))
    ]);
  }

  /** Rótulos só do primeiro e do último período (rótulos seletivos). */
  function axisLabels(doc, rows, width, plotH) {
    if (!rows.length) return [];
    var base = plotH + LABEL_BASELINE;
    if (rows.length === 1) return [svgText(doc, 'laift-chart__label', width / 2, base, 'middle', rows[0].label)];
    return [
      svgText(doc, 'laift-chart__label', 0, base, 'start', rows[0].label),
      svgText(doc, 'laift-chart__label', width, base, 'end', rows[rows.length - 1].label)
    ];
  }

  function paintLine(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.normalizeRows(data);
    if (core.isEmpty(rows)) return emptyParts(doc, ctx, 'line', o.width, o.height, o.title);
    var plotH = o.height - o.labelHeight;
    var model = core.lineModel(rows.map(function (row) { return row.value; }), { width: o.width, height: plotH });
    var parts = frame(doc, ctx, {
      kind: 'line', width: o.width, height: o.height, title: o.title,
      description: core.describeRows(rows, core.formatNumber)
    });
    var nodes = gridLines(doc, model.max, o.width, plotH).concat([
      svgNode(doc, 'path', { class: 'laift-chart__area', 'data-series': 1, d: model.areaPath }),
      svgNode(doc, 'path', { class: 'laift-chart__line', 'data-series': 1, d: model.linePath, pathLength: '1' })
    ]);
    nodes = nodes.concat(model.points.map(function (p, i) { return pointItem(doc, rows[i].label, p); }));
    appendAll(parts.svg, nodes.concat(axisLabels(doc, rows, o.width, plotH)));
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

  function groupItem(doc, group, index, geo, names) {
    var summary = group.bars.map(function (bar, i) {
      return names[i] + ' ' + core.formatNumber(bar.value);
    }).join(' · ');
    var g = svgNode(doc, 'g', {
      class: 'laift-chart__item',
      tabindex: '0',
      'aria-label': group.label + ': ' + summary
    });
    var children = [svgNode(doc, 'rect', {
      class: 'laift-chart__hit',
      x: group.center - geo.groupWidth / 2, y: 0, width: geo.groupWidth, height: geo.plotH + LABEL_BASELINE + 4
    })];
    group.bars.forEach(function (bar) {
      var path = svgNode(doc, 'path', {
        class: 'laift-chart__bar laift-chart__bar--v',
        'data-series': bar.slot,
        d: core.barPath(bar.x, bar.y, bar.width, bar.height, RADIUS, 'vertical')
      });
      setVar(path, '--i', index);
      children.push(path, svgText(doc, 'laift-chart__value', bar.x + bar.width / 2, bar.y - LABEL_GAP / 2, 'middle', core.formatNumber(bar.value)));
    });
    children.push(svgText(doc, 'laift-chart__label', group.center, geo.plotH + LABEL_BASELINE, 'middle', group.label));
    return appendAll(g, children);
  }

  function paintGrouped(doc, data, ctx) {
    var o = ctx.options;
    var rows = core.normalizeRows(data);
    if (core.isEmpty(rows)) return emptyParts(doc, ctx, 'grouped', o.width, o.height, o.title);
    var count = Math.max(1, Math.min(seriesCount(rows), core.MAX_SERIES));
    var names = seriesNames(count, o.series);
    var plotH = o.height - o.labelHeight;
    var model = core.groupedModel(rows, count, { plotWidth: o.width, plotHeight: plotH });
    var parts = frame(doc, ctx, {
      kind: 'grouped', width: o.width, height: o.height, title: o.title,
      description: rows.length + (rows.length === 1 ? ' grupo' : ' grupos') + ', ' + count + (count === 1 ? ' série.' : ' séries.')
    });
    var geo = { plotH: plotH, groupWidth: o.width / rows.length };
    var nodes = [svgNode(doc, 'line', { class: 'laift-chart__axis', x1: 0, x2: o.width, y1: plotH, y2: plotH })];
    model.groups.forEach(function (group, g) { nodes.push(groupItem(doc, group, g, geo, names)); });
    appendAll(parts.svg, nodes);
    var extras = [];
    if (count >= 2) extras.push(legendNode(doc, names.map(function (name, i) { return { slot: i + 1, label: name }; })));
    extras.push(toTable(rows, o.title, { doc: doc, headers: ['Grupo'].concat(names) }));
    return finish(parts, extras);
  }

  // ---------- Rosca ----------

  function anchorFor(deg) {
    var cos = Math.cos(((deg - 90) * Math.PI) / 180);
    if (cos > 0.3) return 'start';
    return cos < -0.3 ? 'end' : 'middle';
  }

  function donutItem(doc, seg, center, radius, o) {
    var mid = (seg.start + seg.end) / 2;
    var outer = core.polarPoint(center, center, radius + o.thickness / 2 + LABEL_GAP * 2, mid);
    var path = svgNode(doc, 'path', {
      class: 'laift-chart__seg',
      'data-series': seg.slot,
      d: seg.path,
      'stroke-width': o.thickness,
      pathLength: '1'
    });
    setVar(path, '--i', seg.index);
    return item(doc, seg.label, seg.value, [
      path,
      svgNode(doc, 'text', { class: 'laift-chart__value', x: outer.x, y: outer.y, 'text-anchor': anchorFor(mid), 'dominant-baseline': 'middle' }, core.formatNumber(seg.value))
    ]);
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
    var nodes = [svgNode(doc, 'circle', { class: 'laift-chart__track', cx: center, cy: center, r: radius, 'stroke-width': o.thickness, fill: 'none' })];
    model.segments.forEach(function (seg) { nodes.push(donutItem(doc, seg, center, radius, o)); });
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
    var model = core.lineModel(rows.map(function (row) { return row.value; }), { width: o.width, height: o.height });
    var last = model.points[model.points.length - 1];
    var parts = frame(doc, ctx, {
      kind: 'spark', width: o.width, height: o.height, title: o.title,
      description: core.describeRows(rows, core.formatNumber)
    });
    var pulse = svgNode(doc, 'g', { class: 'laift-chart__pulse', 'data-series': 1 });
    appendAll(pulse, [
      svgNode(doc, 'path', { class: 'laift-chart__area', d: model.areaPath }),
      svgNode(doc, 'path', { class: 'laift-chart__line', d: model.linePath, pathLength: '1' })
    ]);
    var end = item(doc, 'Último valor', last.value, [
      svgNode(doc, 'circle', { class: 'laift-chart__hit', cx: last.x, cy: last.y, r: DOT_HIT_R }),
      svgNode(doc, 'circle', { class: 'laift-chart__dot', 'data-series': 1, cx: last.x, cy: last.y, r: DOT_R }),
      svgNode(doc, 'text', { class: 'laift-chart__value', x: last.x, y: last.y - 8, 'text-anchor': 'end' }, core.formatNumber(last.value))
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
