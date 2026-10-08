/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Núcleo PURO dos gráficos SVG (ver charts.js): escalas, geometria de arcos
// e barras, modelos de dados, formatação pt-BR e a interpolação do countUp.
// Nada aqui toca no DOM; tudo é testado em Node (frontend/scripts/charts.test.mjs).
(function (root) {
  'use strict';

  var MAX_SERIES = 8;
  var NICE_STEPS = [1, 2, 2.5, 5, 10];
  var DEFAULT_DURATION_MS = 800;
  var DURATION_RE = /^(\d+(?:\.\d+)?)(ms|s)$/;
  var ARC_EPSILON = 0.01;
  var BAR_GAP = 2;
  var EMPTY_LABEL = 'Sem dados no período';
  /** Largura média de um caractere de rótulo, em múltiplos do corpo (dígitos tabulares). */
  var LABEL_EM = 0.62;
  /** Folga mínima entre dois rótulos de valor que não podem se tocar. */
  var LABEL_GAP_PX = 2;
  var LABEL_SIZE = 11;

  function toNumber(value) {
    var n = typeof value === 'number' ? value : Number(value);
    return isFinite(n) ? n : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** Arredonda para 3 casas: coordenadas SVG curtas e estáveis nos testes. */
  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  /** Remove ruído de ponto flutuante (0.1 * 3 → 0.3). */
  function clean(value) {
    return Number(value.toPrecision(12));
  }

  /** Escala linear: f(v) leva o domínio [d0, d1] ao intervalo [r0, r1]. */
  function linearScale(domain, range) {
    var d0 = toNumber(domain[0]);
    var span = toNumber(domain[1]) - d0;
    var r0 = toNumber(range[0]);
    var r1 = toNumber(range[1]);
    return function scale(value) {
      if (span === 0) return (r0 + r1) / 2;
      return r0 + ((toNumber(value) - d0) / span) * (r1 - r0);
    };
  }

  /** Maior valor "redondo" >= value: 1, 2, 2.5, 5 ou 10 vezes uma potência de 10. */
  function niceMax(value) {
    var v = toNumber(value);
    if (v <= 0) return 1;
    var base = Math.pow(10, Math.floor(Math.log10(v)));
    for (var i = 0; i < NICE_STEPS.length; i += 1) {
      if (NICE_STEPS[i] * base >= v) return clean(NICE_STEPS[i] * base);
    }
    return clean(10 * base);
  }

  /** count + 1 marcas uniformes de 0 até max (linhas de grade). */
  function ticks(max, count) {
    var n = Math.max(1, Math.floor(toNumber(count)) || 4);
    var out = [];
    for (var i = 0; i <= n; i += 1) out.push(clean((toNumber(max) * i) / n));
    return out;
  }

  /** Proporção value/max limitada a [0, 1]; max zero ou negativo vira 0. */
  function ratioOf(value, max) {
    var m = toNumber(max);
    return m > 0 ? clamp(toNumber(value) / m, 0, 1) : 0;
  }

  function polar(cx, cy, r, deg) {
    var rad = ((toNumber(deg) - 90) * Math.PI) / 180;
    return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
  }

  /** Caminho de um arco de startDeg a endDeg (0 = topo, sentido horário). Arco cheio não colapsa. */
  function arcPath(cx, cy, r, startDeg, endDeg) {
    var start = toNumber(startDeg);
    var end = Math.min(toNumber(endDeg), start + 360 - ARC_EPSILON);
    var from = polar(cx, cy, r, start);
    if (end <= start) return 'M ' + from.x + ' ' + from.y;
    var to = polar(cx, cy, r, end);
    var large = end - start > 180 ? 1 : 0;
    var rr = round(toNumber(r));
    return ['M', from.x, from.y, 'A', rr, rr, 0, large, 1, to.x, to.y].join(' ');
  }

  /**
   * Barra com a ponta de dado arredondada (raio máx. radius) e base reta.
   * orientation 'horizontal' arredonda a direita; 'vertical' arredonda o topo.
   */
  function barPath(x, y, w, h, radius, orientation) {
    var width = toNumber(w);
    var height = toNumber(h);
    var r = round(Math.max(0, Math.min(toNumber(radius), width / 2, height / 2)));
    var X = round(toNumber(x));
    var Y = round(toNumber(y));
    var W = round(width);
    var H = round(height);
    if (orientation === 'vertical') {
      return ['M', X, Y + H, 'V', Y + r, 'A', r, r, 0, 0, 1, X + r, Y,
        'H', X + W - r, 'A', r, r, 0, 0, 1, X + W, Y + r, 'V', Y + H, 'Z'].join(' ');
    }
    return ['M', X, Y, 'H', X + W - r, 'A', r, r, 0, 0, 1, X + W, Y + r,
      'V', Y + H - r, 'A', r, r, 0, 0, 1, X + W - r, Y + H, 'H', X, 'Z'].join(' ');
  }

  /** Cor categórica por posição: slot 1..8 (cores nunca se repetem nem giram). */
  function seriesSlot(index) {
    return clamp(Math.floor(toNumber(index)) + 1, 1, MAX_SERIES);
  }

  /** Normaliza entrada: [{label, value}] ou [{label, values}]; números nunca viram NaN. */
  function normalizeRows(data) {
    if (!Array.isArray(data)) return [];
    return data.map(function (row, i) {
      var item = row !== null && typeof row === 'object' ? row : { value: row };
      var out = {
        label: String(item.label !== undefined ? item.label : i + 1),
        value: toNumber(item.value)
      };
      if (Array.isArray(item.values)) out.values = item.values.map(toNumber);
      return out;
    });
  }

  function isEmpty(rows) {
    return !Array.isArray(rows) || rows.length === 0;
  }

  /** Nunca mais de 8 categorias: o excedente vira "Outros" (não se recicla cor). */
  function capCategories(rows, max) {
    var limit = clamp(Math.floor(toNumber(max)) || MAX_SERIES, 1, MAX_SERIES);
    if (rows.length <= limit) return rows.slice();
    var kept = rows.slice(0, limit - 1);
    var rest = rows.slice(limit - 1);
    var sum = rest.reduce(function (acc, row) { return acc + Math.max(0, row.value); }, 0);
    return kept.concat([{ label: 'Outros', value: sum, folded: rest.length }]);
  }

  function maxValue(rows) {
    return rows.reduce(function (best, row) { return Math.max(best, row.value); }, 0);
  }

  /** Barras horizontais: uma linha por categoria; comprimento proporcional ao máximo "redondo". */
  function barsModel(rows, options) {
    var opts = options || {};
    var plotWidth = toNumber(opts.plotWidth) || 200;
    var rowHeight = toNumber(opts.rowHeight) || 28;
    var gap = opts.gap !== undefined ? toNumber(opts.gap) : 8;
    var max = niceMax(maxValue(rows));
    var bars = rows.map(function (row, index) {
      var ratio = ratioOf(row.value, max);
      return {
        index: index,
        label: row.label,
        value: row.value,
        ratio: ratio,
        slot: 1,
        length: round(ratio * plotWidth),
        y: index * (rowHeight + gap),
        height: rowHeight
      };
    });
    var height = rows.length ? rows.length * (rowHeight + gap) - gap : 0;
    return { max: max, bars: bars, height: height };
  }

  /** Colunas agrupadas: uma coluna por série dentro de cada grupo; sobem da base. */
  function groupedModel(rows, seriesCount, options) {
    var opts = options || {};
    var plotWidth = toNumber(opts.plotWidth) || 300;
    var plotHeight = toNumber(opts.plotHeight) || 160;
    var series = clamp(Math.floor(toNumber(seriesCount)) || 1, 1, MAX_SERIES);
    var max = niceMax(rows.reduce(function (best, row) {
      return Math.max(best, maxOfList(row.values || []));
    }, 0));
    var groupWidth = plotWidth / Math.max(1, rows.length);
    var slot = Math.min(24, (groupWidth * 0.7) / series);
    var groups = rows.map(function (row, g) {
      var left = g * groupWidth + (groupWidth - slot * series) / 2;
      var bars = [];
      for (var s = 0; s < series; s += 1) {
        var value = toNumber((row.values || [])[s]);
        var height = ratioOf(value, max) * plotHeight;
        bars.push({
          series: s + 1,
          slot: s + 1,
          value: value,
          x: round(left + s * slot + BAR_GAP / 2),
          width: round(Math.max(1, slot - BAR_GAP)),
          height: round(height),
          y: round(plotHeight - height)
        });
      }
      return { label: row.label, center: round(g * groupWidth + groupWidth / 2), bars: bars };
    });
    return { max: max, slot: slot, groups: groups };
  }

  function maxOfList(list) {
    return list.reduce(function (best, v) { return Math.max(best, toNumber(v)); }, 0);
  }

  /** Controle de Bézier preso à faixa vertical [0, height]: a curva não passa da base nem do topo. */
  function controlPoint(x, y, height) {
    return { x: round(x), y: round(clamp(y, 0, height)) };
  }

  /**
   * Linha suave: Catmull-Rom uniforme convertido em Bézier cúbica (tensão 1/6).
   * Os pontos de controle ficam dentro de [0, height], então a área não vaza.
   */
  function linePathOf(points, height) {
    if (!points.length) return '';
    var out = ['M ' + points[0].x + ' ' + points[0].y];
    for (var i = 0; i < points.length - 1; i += 1) {
      var p0 = points[i - 1] || points[i];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[i + 2] || p2;
      var c1 = controlPoint(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, height);
      var c2 = controlPoint(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, height);
      out.push('C ' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + p2.x + ' ' + p2.y);
    }
    return out.join(' ');
  }

  /** Área fechada até a base (height) a partir da linha. */
  function areaPathOf(points, height) {
    if (!points.length) return '';
    var first = points[0];
    var last = points[points.length - 1];
    return linePathOf(points, height) + ' L ' + last.x + ' ' + height + ' L ' + first.x + ' ' + height + ' Z';
  }

  /** Linha/área sobre números: x uniforme, y proporcional ao máximo "redondo". */
  function lineModel(values, options) {
    var opts = options || {};
    var width = toNumber(opts.width) || 320;
    var height = toNumber(opts.height) || 160;
    var list = (Array.isArray(values) ? values : []).map(toNumber);
    var max = niceMax(maxOfList(list));
    var step = list.length > 1 ? width / (list.length - 1) : 0;
    var points = list.map(function (value, i) {
      return {
        x: round(list.length > 1 ? i * step : width / 2),
        y: round(height - ratioOf(value, max) * height),
        value: value
      };
    });
    return {
      max: max,
      points: points,
      linePath: linePathOf(points, height),
      areaPath: areaPathOf(points, height)
    };
  }

  /** Rosca: segmentos proporcionais, com folga angular entre eles (2px de superfície). */
  function donutModel(rows, options) {
    var opts = options || {};
    var cx = toNumber(opts.cx);
    var cy = toNumber(opts.cy);
    var r = toNumber(opts.r);
    var parts = rows.filter(function (row) { return row.value > 0; });
    var gap = parts.length > 1 ? (opts.gapDeg !== undefined ? toNumber(opts.gapDeg) : 2) : 0;
    var total = parts.reduce(function (acc, row) { return acc + row.value; }, 0);
    var cursor = 0;
    var segments = parts.map(function (row, index) {
      var share = total > 0 ? row.value / total : 0;
      var sweep = share * 360;
      var start = cursor + gap / 2;
      var end = cursor + sweep - gap / 2;
      cursor += sweep;
      return {
        index: index,
        label: row.label,
        value: row.value,
        share: share,
        slot: seriesSlot(index),
        start: round(start),
        end: round(end),
        path: arcPath(cx, cy, r, start, end)
      };
    });
    return { total: total, segments: segments };
  }

  /** Progresso radial: fração do máximo (padrão 100) e ângulo final do arco. */
  function radialModel(value, max) {
    var limit = toNumber(max) > 0 ? toNumber(max) : 100;
    var ratio = ratioOf(value, limit);
    return { ratio: ratio, endDeg: round(ratio * 360), percent: round(ratio * 100) };
  }

  var numberFormat = new Intl.NumberFormat('pt-BR');
  var percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

  function formatNumber(value) {
    return numberFormat.format(toNumber(value));
  }

  /** Fração 0..1 como "42%" (pt-BR). */
  function formatPercent(ratio) {
    return percentFormat.format(toNumber(ratio));
  }

  /** Pontos percentuais (0..100) como "73%". */
  function formatPoints(points) {
    return numberFormat.format(Math.round(toNumber(points))) + '%';
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /** Valor do countUp no instante elapsed; no fim devolve exatamente o alvo. */
  function countUpValue(from, to, elapsed, duration) {
    var a = toNumber(from);
    var b = toNumber(to);
    var t = toNumber(duration) > 0 ? clamp(toNumber(elapsed) / toNumber(duration), 0, 1) : 1;
    if (t >= 1) return b;
    return a + (b - a) * easeOutCubic(t);
  }

  /** "800ms" ou "0.5s" → milissegundos; texto inválido cai no padrão de 800 ms (--dur-lazy). */
  function parseDuration(text) {
    var match = DURATION_RE.exec(String(text || '').trim());
    if (!match) return DEFAULT_DURATION_MS;
    var n = parseFloat(match[1]);
    return match[2] === 's' ? n * 1000 : n;
  }

  /** Frase de resumo para <desc>: quantidade e maior valor. */
  function describeRows(rows, format) {
    if (isEmpty(rows)) return EMPTY_LABEL + '.';
    var top = rows.reduce(function (best, row) { return row.value > best.value ? row : best; }, rows[0]);
    var noun = rows.length === 1 ? ' item' : ' itens';
    return rows.length + noun + '. Maior valor: ' + top.label + ', ' + format(top.value) + '.';
  }

  /** Células da tabela alternativa: rótulo + valores formatados (uma coluna por série). */
  function tableRows(rows, format) {
    return rows.map(function (row) {
      var cells = Array.isArray(row.values) ? row.values : [row.value];
      return [row.label].concat(cells.map(function (v) { return format(v); }));
    });
  }

  /** Largura estimada (px) de um rótulo de `size` px, sem medir o DOM (o núcleo segue puro). */
  function estimateTextWidth(text, size) {
    return String(text).length * toNumber(size) * LABEL_EM;
  }

  function anchoredX(x, width, anchor) {
    if (anchor === 'end') return x - width;
    if (anchor === 'middle') return x - width / 2;
    return x;
  }

  /** Caixa do rótulo: y é a linha de base; a caixa sobe até a altura das maiúsculas. */
  function labelBox(cand, size) {
    var w = estimateTextWidth(cand.text, size);
    var x0 = anchoredX(toNumber(cand.x), w, cand.anchor);
    return { x0: x0, x1: x0 + w, y0: toNumber(cand.y) - size * 0.8, y1: toNumber(cand.y) + size * 0.25 };
  }

  function boxesTouch(a, b) {
    return a.x0 < b.x1 + LABEL_GAP_PX && b.x0 < a.x1 + LABEL_GAP_PX
      && a.y0 < b.y1 + LABEL_GAP_PX && b.y0 < a.y1 + LABEL_GAP_PX;
  }

  function insideBox(box, bounds) {
    if (!bounds) return true;
    return box.x0 >= bounds.minX && box.x1 <= bounds.maxX && box.y0 >= bounds.minY && box.y1 <= bounds.maxY;
  }

  /** Ordem de aceitação: obrigatórios; depois maior prioridade; empate: o de índice maior (as últimas). */
  function acceptanceOrder(list) {
    return list.map(function (_, i) { return i; }).sort(function (a, b) {
      var ca = list[a];
      var cb = list[b];
      if (!!ca.required !== !!cb.required) return ca.required ? -1 : 1;
      var diff = toNumber(cb.priority) - toNumber(ca.priority);
      return diff !== 0 ? diff : b - a;
    });
  }

  /**
   * Decide quais rótulos de valor aparecem sem colidir (função pura).
   * candidates: [{ x, y, text, anchor, priority, required }]; y é a linha de base.
   * Obrigatórios sempre entram. Os demais entram por prioridade, se a caixa cabe em
   * options.bounds e não toca os já aceitos. Devolve um boolean por candidato, na ordem de entrada.
   */
  function placeValueLabels(candidates, options) {
    var opts = options || {};
    var size = toNumber(opts.size) || LABEL_SIZE;
    var list = Array.isArray(candidates) ? candidates : [];
    var accepted = [];
    var show = list.map(function () { return false; });
    acceptanceOrder(list).forEach(function (i) {
      var cand = list[i];
      var box = labelBox(cand, size);
      if (!cand.required) {
        if (!insideBox(box, opts.bounds)) return;
        if (accepted.some(function (other) { return boxesTouch(box, other); })) return;
      }
      accepted.push(box);
      show[i] = true;
    });
    return show;
  }

  /** Soma de cada série (índice = série) nas linhas; valor ausente conta zero. */
  function seriesTotals(rows, count) {
    var n = clamp(Math.floor(toNumber(count)) || 1, 1, MAX_SERIES);
    var totals = [];
    for (var s = 0; s < n; s += 1) {
      totals.push(rows.reduce(function (acc, row) { return acc + toNumber((row.values || [])[s]); }, 0));
    }
    return totals;
  }

  var api = {
    MAX_SERIES: MAX_SERIES,
    EMPTY_LABEL: EMPTY_LABEL,
    DEFAULT_DURATION_MS: DEFAULT_DURATION_MS,
    toNumber: toNumber,
    clamp: clamp,
    linearScale: linearScale,
    niceMax: niceMax,
    ticks: ticks,
    ratioOf: ratioOf,
    polarPoint: polar,
    arcPath: arcPath,
    barPath: barPath,
    seriesSlot: seriesSlot,
    normalizeRows: normalizeRows,
    isEmpty: isEmpty,
    capCategories: capCategories,
    barsModel: barsModel,
    groupedModel: groupedModel,
    lineModel: lineModel,
    donutModel: donutModel,
    radialModel: radialModel,
    formatNumber: formatNumber,
    formatPercent: formatPercent,
    formatPoints: formatPoints,
    easeOutCubic: easeOutCubic,
    countUpValue: countUpValue,
    parseDuration: parseDuration,
    describeRows: describeRows,
    tableRows: tableRows,
    estimateTextWidth: estimateTextWidth,
    placeValueLabels: placeValueLabels,
    seriesTotals: seriesTotals
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftChartsCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
