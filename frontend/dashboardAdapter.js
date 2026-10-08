/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Adaptador do painel Início: isola o formato das respostas da Worker
// (apiGetHomeSummary, apiGetMyDashboardSeries e apiGetMyTimeseries). Se a API
// mudar, só este arquivo muda. Funções puras (sem DOM nem rede), testadas em
// Node; no navegador expõe window.LaiftDashboardAdapter.
(function (root) {
  'use strict';

  var METRIC_LABELS = {
    activity: 'Atividade',
    events: 'Eventos',
    learning: 'Aprendizagem',
    tasks: 'Tarefas',
    study_hours: 'Horas de estudo'
  };
  var RANGE_OPTIONS = [
    { range: '30d', label: '30 dias' },
    { range: '90d', label: '90 dias' },
    { range: '12m', label: '12 meses' }
  ];
  var COMPARISON_METRICS = ['events', 'learning', 'tasks'];
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var DEFAULT_ERROR = 'Não foi possível carregar os dados.';
  var DECIMALS = 2;

  function toNumber(value) {
    var n = typeof value === 'number' ? value : Number(value);
    return isFinite(n) ? n : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundTo(value, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /** Data real no calendário (AAAA-MM-DD): 31 de fevereiro e 29 de fevereiro de ano comum são ausentes. */
  function isValidDate(value) {
    var m = typeof value === 'string' ? DATE_RE.exec(value) : null;
    if (!m) return false;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1) return false;
    var probe = new Date(Date.UTC(2000, 0, 1));
    probe.setUTCFullYear(year, month - 1, day);
    return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  }

  /** Rótulo curto do período: "08/10" (dia ou semana) e "set/26" (mês). */
  function labelFor(date, granularity) {
    var m = DATE_RE.exec(date);
    if (!m) return String(date);
    if (granularity === 'month') return MONTHS[Number(m[2]) - 1] + '/' + m[1].slice(2);
    return m[3] + '/' + m[2];
  }

  function messageOf(res) {
    var text = res && typeof res.message === 'string' ? res.message.trim() : '';
    return text || DEFAULT_ERROR;
  }

  function byDateAsc(a, b) {
    if (a.date < b.date) return -1;
    return a.date > b.date ? 1 : 0;
  }

  function toPoint(granularity) {
    return function (p) {
      return { date: p.date, label: labelFor(p.date, granularity), value: toNumber(p.value) };
    };
  }

  /**
   * Resposta de apiGetMyTimeseries -> { ok, range, granularity, points }.
   * points: [{ date, label, value }] em ordem crescente; datas inválidas saem.
   * Falha (success falso ou formato errado) -> { ok: false, message }.
   */
  function normalizeSeries(res) {
    if (!res || res.success !== true || !Array.isArray(res.series)) {
      return { ok: false, message: messageOf(res) };
    }
    var granularity = typeof res.granularity === 'string' ? res.granularity : 'day';
    var points = res.series
      .filter(function (p) { return p && isValidDate(p.date); })
      .map(function (p) { return { date: p.date, value: p.value }; })
      .sort(byDateAsc)
      .map(toPoint(granularity));
    return { ok: true, range: res.range, granularity: granularity, points: points };
  }

  /**
   * Resposta de apiGetMyDashboardSeries -> { ok, series }. Falha da chamada
   * inteira vira ok:false com mensagem; cada série fica crua em series[chave].
   */
  function normalizeDashboard(res) {
    if (!res || res.success !== true || !res.series || typeof res.series !== 'object') {
      return { ok: false, message: messageOf(res) };
    }
    return { ok: true, series: res.series };
  }

  // Espelha DASHBOARD_SERIES de worker/src/services/timeseriesService.js: "métrica|período" -> chave.
  var BUNDLE_KEYS = {
    'activity|30d': 'activity30d',
    'events|30d': 'events30d',
    'learning|30d': 'learning30d',
    'tasks|30d': 'tasks30d',
    'study_hours|30d': 'studyHours30d',
    'events|6m': 'events6m',
    'learning|6m': 'learning6m',
    'tasks|6m': 'tasks6m'
  };

  /** Chave da série no pacote; null fora dele (ex.: atividade em 90 dias ou 12 meses). */
  function bundleKey(metric, range) {
    var id = metric + '|' + range;
    return Object.prototype.hasOwnProperty.call(BUNDLE_KEYS, id) ? BUNDLE_KEYS[id] : null;
  }

  /**
   * Uma série do pacote já normalizada. Série que falhou no servidor vem null:
   * vira { ok: true, missing: true, points: [] }, e só esse gráfico fica sem dados.
   * Falha da chamada inteira passa adiante como ok:false.
   */
  function pickSeries(dashboard, key) {
    if (!dashboard || !dashboard.ok) return { ok: false, message: messageOf(dashboard) };
    var raw = dashboard.series ? dashboard.series[key] : null;
    if (!raw || !Array.isArray(raw.series)) return { ok: true, missing: true, granularity: 'day', points: [] };
    var body = normalizeSeries({ success: true, range: raw.range, granularity: raw.granularity, series: raw.series });
    return { ok: true, missing: false, range: body.range, granularity: body.granularity, points: body.points };
  }

  /** Soma dos valores com 2 casas (horas de estudo vêm fracionadas). */
  function sumValues(points) {
    var total = points.reduce(function (acc, p) { return acc + toNumber(p.value); }, 0);
    return roundTo(total, DECIMALS);
  }

  /** Verdadeiro quando não há nenhum valor positivo: o gráfico mostra "Sem dados no período". */
  function isEmptySeries(points) {
    return !points.some(function (p) { return toNumber(p.value) > 0; });
  }

  /** Variação em % (inteiro); sem base (período anterior zero) é null, nunca infinito. */
  function percentChange(previous, current) {
    if (!(previous > 0)) return null;
    return Math.round(((current - previous) / previous) * 100);
  }

  /** Compara a metade final do período com a inicial. */
  function variation(points) {
    var half = Math.floor(points.length / 2);
    if (half === 0) return { previous: 0, current: 0, percent: null };
    var previous = sumValues(points.slice(0, half));
    var current = sumValues(points.slice(-half));
    return { previous: previous, current: current, percent: percentChange(previous, current) };
  }

  function formatVariation(percent) {
    if (percent === null || percent === undefined) return 'sem base de comparação';
    if (percent === 0) return 'sem variação';
    return (percent > 0 ? '+' : '−') + Math.abs(percent) + '%';
  }

  /** Selos: conquistados e total; null quando a conta não tem selos. */
  function badgeProgress(learning) {
    if (!learning) return null;
    var total = toNumber(learning.totalBadges);
    if (total <= 0) return null;
    var unlocked = clamp(toNumber(learning.unlockedBadges), 0, total);
    return {
      unlocked: unlocked,
      total: total,
      remaining: total - unlocked,
      percent: Math.round((unlocked / total) * 100)
    };
  }

  /** Linhas da rosca de selos: conquistados e a conquistar. */
  function badgeRows(progress) {
    return [
      { label: 'Conquistados', value: progress.unlocked },
      { label: 'A conquistar', value: progress.remaining }
    ];
  }

  function accuracyOf(learning) {
    if (!learning || learning.accuracyPct === null || learning.accuracyPct === undefined) return null;
    return toNumber(learning.accuracyPct);
  }

  /**
   * Visão do resumo do Início. Seção ausente (visitante) vira false/null,
   * nunca zero: um zero enganoso seria pior que não mostrar o número.
   */
  function summaryView(summary) {
    var s = summary || {};
    return {
      hasTasks: !!s.tasks,
      hasVoting: !!s.voting,
      hasInbox: !!s.inbox,
      pendingTasks: s.tasks ? toNumber(s.tasks.myPendingCount) : null,
      accuracyPct: accuracyOf(s.learning),
      badges: badgeProgress(s.learning)
    };
  }

  /**
   * Comparativo mensal: para cada métrica com ao menos 2 meses válidos, o
   * mês anterior e o atual. Métrica que falhou fica de fora (falha isolada).
   * Devolve null se nenhuma métrica serve.
   */
  function monthlyComparison(byMetric) {
    var source = byMetric || {};
    var names = null;
    var rows = Object.keys(source).reduce(function (acc, key) {
      var series = source[key];
      if (!series || !series.ok || series.points.length < 2) return acc;
      var pts = series.points;
      var prev = pts[pts.length - 2];
      var last = pts[pts.length - 1];
      if (!names) names = [prev.label, last.label];
      return acc.concat([{ label: METRIC_LABELS[key] || key, values: [prev.value, last.value] }]);
    }, []);
    return rows.length ? { seriesNames: names, rows: rows } : null;
  }

  /** Argumentos de apiGetMyTimeseries após o token de sessão. */
  function seriesInput(metric, range) {
    return { range: range, metric: metric };
  }

  /** Métricas de série que o membro enxerga: visitante não tem tarefas. */
  function secondaryMetrics(hasTasks) {
    return hasTasks ? ['events', 'learning', 'tasks', 'study_hours'] : ['events', 'learning', 'study_hours'];
  }

  var api = {
    METRIC_LABELS: METRIC_LABELS,
    RANGE_OPTIONS: RANGE_OPTIONS,
    COMPARISON_METRICS: COMPARISON_METRICS,
    normalizeSeries: normalizeSeries,
    normalizeDashboard: normalizeDashboard,
    bundleKey: bundleKey,
    pickSeries: pickSeries,
    labelFor: labelFor,
    sumValues: sumValues,
    isEmptySeries: isEmptySeries,
    percentChange: percentChange,
    variation: variation,
    formatVariation: formatVariation,
    badgeProgress: badgeProgress,
    badgeRows: badgeRows,
    summaryView: summaryView,
    monthlyComparison: monthlyComparison,
    seriesInput: seriesInput,
    secondaryMetrics: secondaryMetrics
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftDashboardAdapter = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
