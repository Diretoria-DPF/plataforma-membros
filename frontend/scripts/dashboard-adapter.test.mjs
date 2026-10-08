/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Adaptador do Início (frontend/dashboardAdapter.js): funções puras sobre as
// respostas de apiGetHomeSummary, apiGetMyDashboardSeries e apiGetMyTimeseries.
// Nada de DOM aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../dashboardAdapter.js');
const Home = require('../home.js');
const Charts = require('../modulos/shared/charts.js');

const serie = (points, extra) => ({
  success: true, range: '30d', granularity: 'day', series: points.map(([date, value]) => ({ date, value })),
  ...(extra || {}),
});

test('normaliza a série: ordena por data, descarta datas inválidas e põe rótulo', () => {
  const res = A.normalizeSeries(serie([['2026-10-02', 3], ['lixo', 9], ['2026-10-01', 1], ['2026-13-01', 4], [null, 2]]));
  assert.equal(res.ok, true);
  assert.equal(res.granularity, 'day');
  assert.deepEqual(res.points, [
    { date: '2026-10-01', label: '01/10', value: 1 },
    { date: '2026-10-02', label: '02/10', value: 3 },
  ]);
});

test('valores ausentes ou não numéricos viram zero, nunca NaN', () => {
  const res = A.normalizeSeries(serie([['2026-10-01', null], ['2026-10-02', 'abc'], ['2026-10-03', '4']]));
  assert.deepEqual(res.points.map((p) => p.value), [0, 0, 4]);
});

test('rótulo mensal usa mês abreviado em pt-BR e ano curto', () => {
  const res = A.normalizeSeries({ success: true, granularity: 'month', series: [{ date: '2026-09-01', value: 2 }] });
  assert.equal(res.points[0].label, 'set/26');
  assert.equal(A.labelFor('2026-12-01', 'month'), 'dez/26');
});

test('falha da API (success falso, sem série ou formato errado) vira ok:false com mensagem', () => {
  assert.deepEqual(A.normalizeSeries({ success: false, message: 'Servidor ocupado.' }), { ok: false, message: 'Servidor ocupado.' });
  assert.equal(A.normalizeSeries({ success: false }).message, 'Não foi possível carregar os dados.');
  assert.equal(A.normalizeSeries({ success: true }).ok, false);
  assert.equal(A.normalizeSeries(null).ok, false);
  assert.equal(A.normalizeSeries(undefined).ok, false);
});

test('série vazia é válida (ok) e sem pontos', () => {
  const res = A.normalizeSeries(serie([]));
  assert.equal(res.ok, true);
  assert.deepEqual(res.points, []);
});

test('soma com duas casas (horas de estudo fracionadas) e vazia vale zero', () => {
  assert.equal(A.sumValues([{ value: 0.1 }, { value: 0.2 }]), 0.3);
  assert.equal(A.sumValues([{ value: 1.005 }, { value: 2 }]), 3.01);
  assert.equal(A.sumValues([]), 0);
});

test('série sem nenhum valor positivo é tratada como vazia', () => {
  assert.equal(A.isEmptySeries([]), true);
  assert.equal(A.isEmptySeries([{ value: 0 }, { value: 0 }]), true);
  assert.equal(A.isEmptySeries([{ value: 0 }, { value: 1 }]), false);
});

test('variação compara a metade final com a inicial', () => {
  const pts = [1, 1, 2, 4].map((value) => ({ value }));
  assert.deepEqual(A.variation(pts), { previous: 2, current: 6, percent: 200 });
  const queda = [4, 4, 2, 2].map((value) => ({ value }));
  assert.equal(A.variation(queda).percent, -50);
});

test('variação sem base de comparação é null, nunca infinito', () => {
  assert.equal(A.variation([0, 0, 3, 3].map((value) => ({ value }))).percent, null);
  assert.equal(A.variation([0, 0, 0, 0].map((value) => ({ value }))).percent, null);
  assert.equal(A.variation([]).percent, null);
  assert.equal(A.percentChange(0, 5), null);
});

test('variação com tamanho ímpar descarta o ponto do meio', () => {
  const pts = [2, 9, 2, 4, 4].map((value) => ({ value }));
  assert.deepEqual(A.variation(pts), { previous: 11, current: 8, percent: -27 });
});

test('texto da variação: sinal, sem variação e sem base', () => {
  assert.equal(A.formatVariation(12), '+12%');
  assert.equal(A.formatVariation(-5), '−5%');
  assert.equal(A.formatVariation(0), 'sem variação');
  assert.equal(A.formatVariation(null), 'sem base de comparação');
});

test('resumo de membro: números presentes e selos', () => {
  const view = A.summaryView({
    tasks: { myPendingCount: 2, availableCount: 1, next: null },
    voting: { openCount: 1, pendingCount: 1, nextClosesAt: null },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 0, pendingConnectionRequests: 0 },
  });
  assert.equal(view.hasTasks, true);
  assert.equal(view.hasVoting, true);
  assert.equal(view.hasInbox, true);
  assert.equal(view.pendingTasks, 2);
  assert.equal(view.accuracyPct, 72);
  assert.deepEqual(view.badges, { unlocked: 2, total: 5, remaining: 3, percent: 40 });
});

test('resumo de visitante: seções nulas viram ausência, nunca zero', () => {
  const view = A.summaryView({
    tasks: null, voting: null, inbox: null,
    learning: { accuracyPct: null, questionsAnswered: 0, totalActivities: 0, unlockedBadges: 0, totalBadges: 0 },
  });
  assert.equal(view.hasTasks, false);
  assert.equal(view.hasVoting, false);
  assert.equal(view.hasInbox, false);
  assert.equal(view.pendingTasks, null);
  assert.equal(view.accuracyPct, null);
  assert.equal(view.badges, null);
});

test('resumo ausente não quebra', () => {
  const view = A.summaryView(undefined);
  assert.equal(view.hasTasks, false);
  assert.equal(view.pendingTasks, null);
});

test('selos: conquistados nunca passam do total e total zero não tem progresso', () => {
  assert.deepEqual(A.badgeProgress({ unlockedBadges: 9, totalBadges: 5 }), { unlocked: 5, total: 5, remaining: 0, percent: 100 });
  assert.deepEqual(A.badgeProgress({ unlockedBadges: -3, totalBadges: 4 }), { unlocked: 0, total: 4, remaining: 4, percent: 0 });
  assert.equal(A.badgeProgress({ unlockedBadges: 0, totalBadges: 0 }), null);
  assert.equal(A.badgeProgress(null), null);
});

test('linhas da rosca de selos: conquistados e a conquistar', () => {
  assert.deepEqual(A.badgeRows({ unlocked: 2, remaining: 3 }), [
    { label: 'Conquistados', value: 2 },
    { label: 'A conquistar', value: 3 },
  ]);
});

test('comparativo mensal: uma linha por métrica com o mês anterior e o atual', () => {
  const byMetric = {
    events: A.normalizeSeries({ success: true, granularity: 'month', series: [
      { date: '2026-08-01', value: 3 }, { date: '2026-09-01', value: 5 }, { date: '2026-10-01', value: 7 },
    ] }),
    learning: A.normalizeSeries({ success: true, granularity: 'month', series: [
      { date: '2026-09-01', value: 10 }, { date: '2026-10-01', value: 4 },
    ] }),
  };
  const cmp = A.monthlyComparison(byMetric);
  assert.deepEqual(cmp.seriesNames, ['set/26', 'out/26']);
  assert.deepEqual(cmp.rows, [
    { label: 'Eventos', values: [5, 7] },
    { label: 'Aprendizagem', values: [10, 4] },
  ]);
});

test('comparativo mensal isola a falha: métrica que falhou fica de fora', () => {
  const ok = A.normalizeSeries({ success: true, granularity: 'month', series: [
    { date: '2026-09-01', value: 1 }, { date: '2026-10-01', value: 2 },
  ] });
  const failed = A.normalizeSeries({ success: false, message: 'Falhou.' });
  const cmp = A.monthlyComparison({ events: failed, tasks: ok });
  assert.deepEqual(cmp.rows, [{ label: 'Tarefas', values: [1, 2] }]);
});

test('comparativo mensal sem métrica utilizável devolve null', () => {
  assert.equal(A.monthlyComparison({ events: A.normalizeSeries({ success: false }) }), null);
  const umMes = A.normalizeSeries({ success: true, granularity: 'month', series: [{ date: '2026-10-01', value: 2 }] });
  assert.equal(A.monthlyComparison({ events: umMes }), null);
  assert.equal(A.monthlyComparison(undefined), null);
});

/** Pacote como a Worker devolve: cada série sem `success`, ou null se aquela falhou. */
const bundleItem = (points, granularity) => ({
  range: granularity === 'month' ? '6m' : '30d',
  granularity: granularity || 'day',
  series: points.map(([date, value]) => ({ date, value })),
});
const dashboardOk = (series) => ({ success: true, series });

test('pacote: falha da chamada inteira vira ok:false com mensagem', () => {
  assert.deepEqual(A.normalizeDashboard({ success: false, message: 'Sessão expirou.' }), { ok: false, message: 'Sessão expirou.' });
  assert.equal(A.normalizeDashboard({ success: true }).ok, false);
  assert.equal(A.normalizeDashboard(null).ok, false);
  assert.equal(A.normalizeDashboard(null).message, 'Não foi possível carregar os dados.');
});

test('pacote: cada chave do pacote resolve a série certa, no formato do adaptador', () => {
  const dash = A.normalizeDashboard(dashboardOk({
    activity30d: bundleItem([['2026-10-02', 3], ['2026-10-01', 1]]),
    events6m: bundleItem([['2026-09-01', 5], ['2026-10-01', 7]], 'month'),
  }));
  const act = A.pickSeries(dash, 'activity30d');
  assert.equal(act.ok, true);
  assert.equal(act.missing, false);
  assert.equal(act.granularity, 'day');
  assert.deepEqual(act.points, [
    { date: '2026-10-01', label: '01/10', value: 1 },
    { date: '2026-10-02', label: '02/10', value: 3 },
  ]);
  assert.deepEqual(A.pickSeries(dash, 'events6m').points.map((p) => p.label), ['set/26', 'out/26']);
});

test('pacote: série null vem como ausente, e as outras seguem intactas (falha isolada)', () => {
  const dash = A.normalizeDashboard(dashboardOk({
    events30d: null,
    learning30d: bundleItem([['2026-10-01', 2]]),
  }));
  const missing = A.pickSeries(dash, 'events30d');
  assert.deepEqual(missing, { ok: true, missing: true, granularity: 'day', points: [] });
  assert.equal(A.isEmptySeries(missing.points), true);
  const other = A.pickSeries(dash, 'learning30d');
  assert.equal(other.missing, false);
  assert.equal(A.sumValues(other.points), 2);
  // Chave que o servidor não mandou também conta como ausente.
  assert.equal(A.pickSeries(dash, 'tasks6m').missing, true);
});

test('pacote: série com formato errado é ausente, nunca lança', () => {
  const dash = A.normalizeDashboard(dashboardOk({ tasks30d: { series: 'lixo' }, events30d: 5 }));
  assert.equal(A.pickSeries(dash, 'tasks30d').missing, true);
  assert.equal(A.pickSeries(dash, 'events30d').missing, true);
});

test('pacote: com a chamada inteira falha, toda série vira ok:false com a mesma mensagem', () => {
  const failed = A.normalizeDashboard({ success: false, message: 'Servidor ocupado.' });
  assert.deepEqual(A.pickSeries(failed, 'activity30d'), { ok: false, message: 'Servidor ocupado.' });
  assert.deepEqual(A.pickSeries(undefined, 'activity30d').ok, false);
});

test('pacote: chave por métrica e período; fora do pacote, null', () => {
  assert.equal(A.bundleKey('activity', '30d'), 'activity30d');
  assert.equal(A.bundleKey('study_hours', '30d'), 'studyHours30d');
  assert.equal(A.bundleKey('tasks', '6m'), 'tasks6m');
  assert.equal(A.bundleKey('activity', '90d'), null);
  assert.equal(A.bundleKey('activity', '12m'), null);
  assert.equal(A.bundleKey('events', '12m'), null);
  assert.equal(A.bundleKey('senhas', '30d'), null);
  assert.equal(A.bundleKey('constructor', '30d'), null);
});

test('pacote: comparativo mensal deixa de fora a série ausente e usa as demais', () => {
  const dash = A.normalizeDashboard(dashboardOk({
    events6m: null,
    learning6m: bundleItem([['2026-09-01', 4], ['2026-10-01', 6]], 'month'),
    tasks6m: bundleItem([['2026-09-01', 1], ['2026-10-01', 2]], 'month'),
  }));
  const byMetric = {
    events: A.pickSeries(dash, 'events6m'),
    learning: A.pickSeries(dash, 'learning6m'),
    tasks: A.pickSeries(dash, 'tasks6m'),
  };
  assert.deepEqual(A.monthlyComparison(byMetric).rows, [
    { label: 'Aprendizagem', values: [4, 6] },
    { label: 'Tarefas', values: [1, 2] },
  ]);
});

test('entrada da API e métricas do membro', () => {
  assert.deepEqual(A.seriesInput('study_hours', '12m'), { range: '12m', metric: 'study_hours' });
  assert.deepEqual(A.secondaryMetrics(true), ['events', 'learning', 'tasks', 'study_hours']);
  assert.deepEqual(A.secondaryMetrics(false), ['events', 'learning', 'study_hours']);
  assert.deepEqual(A.RANGE_OPTIONS.map((o) => o.range), ['30d', '90d', '12m']);
});

test('data impossível (31 de fevereiro, 29 de fevereiro fora de bissexto) é ausente, não entra na série', () => {
  const res = A.normalizeSeries(serie([
    ['2026-02-31', 1], ['2026-02-29', 2], ['2028-02-29', 3], ['2026-04-31', 4], ['2026-02-28', 5],
  ]));
  assert.deepEqual(res.points.map((p) => p.date), ['2026-02-28', '2028-02-29']);
});

test('total do sparkline usa singular só para exatamente 1 ("1 evento", "1 hora")', () => {
  assert.equal(Home.sparkTotalText('events', 1, String), '1 evento');
  assert.equal(Home.sparkTotalText('events', 3, String), '3 eventos');
  assert.equal(Home.sparkTotalText('events', 0, String), '0 eventos');
  assert.equal(Home.sparkTotalText('study_hours', 1, String), '1 hora');
  assert.equal(Home.sparkTotalText('study_hours', 15, String), '15 horas');
  assert.equal(Home.sparkTotalText('learning', 1, String), '1 atividade');
  assert.equal(Home.sparkTotalText('tasks', 1, String), '1 concluída');
});

test('selos: "de N selo" no singular só quando o total é 1', () => {
  assert.equal(Home.badgeCountText(0, 1), '0 de 1 selo');
  assert.equal(Home.badgeCountText(2, 5), '2 de 5 selos');
});

// ---------- Ciclo de vida: Início e gráficos, sem navegador ----------

/** DOM mínimo com remoção real: removeChild de nó que não é filho lança, como no navegador. */
function fakeNode(tag, ns) {
  return {
    tag,
    ns: ns || null,
    attrs: {},
    children: [],
    parentNode: null,
    ownerDocument: null,
    className: '',
    clientWidth: 0,
    style: { setProperty() {} },
    listeners: {},
    _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(value) {
      this.children.forEach((c) => { c.parentNode = null; });
      this.children = [];
      this._text = String(value);
    },
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      if (!this.children.includes(child)) throw new Error('NotFoundError: o nó não é filho deste contêiner');
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    removeAttribute(key) { delete this.attrs[key]; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    getBoundingClientRect() { return { width: this.clientWidth }; },
  };
}

function fakeDom() {
  const byId = new Map();
  function own(node) { node.ownerDocument = doc; return node; }
  const doc = {
    createElement: (tag) => own(fakeNode(tag)),
    createElementNS: (ns, tag) => own(fakeNode(tag, ns)),
    getElementById: (id) => byId.get(id) || null,
    mountHost(id) { const host = own(fakeNode('section')); byId.set(id, host); return host; },
  };
  return doc;
}

function walk(node) { return [node, ...node.children.flatMap(walk)]; }
const byClass = (node, cls) => walk(node).filter((n) => (n.attrs.class || '').split(/\s+/).includes(cls));

async function withGlobals(values, run) {
  const saved = Object.keys(values).map((key) => [key, Object.prototype.hasOwnProperty.call(globalThis, key), globalThis[key]]);
  Object.assign(globalThis, values);
  try {
    return await run();
  } finally {
    saved.forEach(([key, had, prev]) => { if (had) globalThis[key] = prev; else delete globalThis[key]; });
  }
}

/** Espiões: observers ativos (observe liga, disconnect desliga) e contagens rAF pendentes. */
function withLifecycleSpies(run) {
  const spy = { created: 0, active: 0, frames: new Map(), nextFrame: 1 };
  class FakeResizeObserver {
    constructor() { spy.created += 1; this.on = false; }
    observe() { if (!this.on) { this.on = true; spy.active += 1; } }
    disconnect() { if (this.on) { this.on = false; spy.active -= 1; } }
  }
  return withGlobals({
    LaiftCharts: Charts,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame: (cb) => { const id = spy.nextFrame; spy.nextFrame += 1; spy.frames.set(id, cb); return id; },
    cancelAnimationFrame: (id) => { spy.frames.delete(id); },
  }, () => run(spy));
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function summaryWith(title) {
  return {
    success: true,
    summary: {
      nextEvents: [{ id: 'e1', title, eventDate: '2026-10-11T15:00:00Z', location: 'Sala 2', isRegistered: true, spotsLeft: 3 }],
      tasks: { myPendingCount: 1, availableCount: 0, next: null },
      voting: { openCount: 0, pendingCount: 0, nextClosesAt: null },
      learning: { accuracyPct: 50, questionsAnswered: 4, totalActivities: 2, unlockedBadges: 1, totalBadges: 3 },
      inbox: { unreadMessages: 0, pendingConnectionRequests: 0 },
    },
  };
}

function dashboardPayload() {
  const days = Array.from({ length: 30 }, (_, i) => ({ date: '2026-09-' + String(i + 1).padStart(2, '0'), value: 1 }));
  const months = ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((date) => ({ date, value: 2 }));
  const daily = { range: '30d', granularity: 'day', series: days };
  const monthly = { range: '6m', granularity: 'month', series: months };
  return {
    success: true,
    series: {
      activity30d: daily, events30d: daily, learning30d: daily, tasks30d: daily, studyHours30d: daily,
      events6m: monthly, learning6m: monthly, tasks6m: monthly,
    },
  };
}

/** window.App mínimo: getState, showPanel e callApi roteado pelo nome da action. */
function fakeApp(route) {
  return {
    getState: () => ({ sessionToken: 'tok', profile: { fullName: 'Maria Souza' } }),
    showPanel() {},
    callApi: (name, token, args) => route(name, args),
  };
}

test('Início: três entradas seguidas não acumulam observers nem contagens', async () => {
  await withLifecycleSpies(async (spy) => {
    const doc = fakeDom();
    doc.mountHost('home-dashboard');
    const app = fakeApp((name) => Promise.resolve(name === 'apiGetHomeSummary' ? summaryWith('Aula A') : dashboardPayload()));
    await Home.load(app, doc);
    const firstEntry = { active: spy.active, frames: spy.frames.size };
    await Home.load(app, doc);
    await Home.load(app, doc);
    assert.ok(firstEntry.active > 0, 'a entrada deixa gráficos observados');
    assert.ok(firstEntry.frames > 0, 'a entrada deixa contagens animando');
    assert.equal(spy.active, firstEntry.active);
    assert.equal(spy.frames.size, firstEntry.frames);
  });
});

test('Início: resposta velha do resumo não renderiza por cima da entrada mais recente', async () => {
  await withLifecycleSpies(async (spy) => {
    const doc = fakeDom();
    const host = doc.mountHost('home-dashboard');
    let releaseOld;
    const oldSummary = new Promise((resolve) => { releaseOld = resolve; });
    let summaryCalls = 0;
    const app = fakeApp((name) => {
      if (name !== 'apiGetHomeSummary') return Promise.resolve(dashboardPayload());
      summaryCalls += 1;
      return summaryCalls === 1 ? oldSummary : Promise.resolve(summaryWith('Aula nova'));
    });
    const older = Home.load(app, doc);
    await Home.load(app, doc);
    const active = spy.active;
    releaseOld(summaryWith('Aula velha'));
    await older;
    assert.match(host.textContent, /Aula nova/);
    assert.doesNotMatch(host.textContent, /Aula velha/);
    assert.equal(spy.active, active);
  });
});

test('Início: série de uma entrada já trocada não desenha gráfico depois', async () => {
  await withLifecycleSpies(async (spy) => {
    const doc = fakeDom();
    doc.mountHost('home-dashboard');
    let releaseSeries;
    const slowSeries = new Promise((resolve) => { releaseSeries = resolve; });
    let bundleCalls = 0;
    const app = fakeApp((name) => {
      if (name === 'apiGetHomeSummary') return Promise.resolve(summaryWith('Aula'));
      bundleCalls += 1;
      return bundleCalls === 1 ? slowSeries : Promise.resolve(dashboardPayload());
    });
    const older = Home.load(app, doc);
    await flush();
    await Home.load(app, doc);
    const active = spy.active;
    const frames = spy.frames.size;
    releaseSeries(dashboardPayload());
    await older;
    assert.equal(bundleCalls, 2);
    assert.equal(spy.active, active);
    assert.equal(spy.frames.size, frames);
  });
});

test('Início: reset solta gráficos e contagens, e resposta em voo não desenha depois', async () => {
  await withLifecycleSpies(async (spy) => {
    const doc = fakeDom();
    doc.mountHost('home-dashboard');
    const app = fakeApp((name) => Promise.resolve(name === 'apiGetHomeSummary' ? summaryWith('Aula') : dashboardPayload()));
    await Home.load(app, doc);
    assert.ok(spy.active > 0);
    Home.reset();
    assert.equal(spy.active, 0);
    assert.equal(spy.frames.size, 0);

    const gateDoc = fakeDom();
    gateDoc.mountHost('home-dashboard');
    let releaseSummary;
    const gate = new Promise((resolve) => { releaseSummary = resolve; });
    const pending = Home.load(fakeApp((name) => (name === 'apiGetHomeSummary' ? gate : dashboardPayload())), gateDoc);
    Home.reset();
    releaseSummary(summaryWith('Aula tardia'));
    await pending;
    assert.equal(spy.active, 0);
    assert.equal(spy.frames.size, 0);
  });
});

test('gráfico: destroy é idempotente e update depois de destroy não volta a desenhar', () => {
  const container = fakeNode('div');
  container.ownerDocument = fakeDom();
  const chart = Charts.lineArea(container, [1, 2, 3], { width: 300, height: 120 });
  chart.destroy();
  chart.destroy();
  chart.update([4, 5]);
  assert.equal(container.children.length, 0);
  assert.equal(chart.el, null);
});

test('countUp do centro da rosca lê --dur-lazy do contêiner montado, não do nó novo (sempre 800 ms antes)', async () => {
  const container = fakeNode('div');
  container.ownerDocument = fakeDom();
  const queue = [];
  const styleOf = (node) => ({
    getPropertyValue: (name) => (node === container && name === '--dur-lazy' ? '320ms' : ''),
  });
  await withGlobals({
    getComputedStyle: styleOf,
    requestAnimationFrame: (cb) => { queue.push(cb); return queue.length; },
    cancelAnimationFrame() {},
  }, () => {
    Charts.donut(container, [{ label: 'A', value: 60 }, { label: 'B', value: 40 }], { size: 120 });
    queue.shift()(0);
    queue.shift()(320);
    assert.equal(byClass(container, 'laift-chart__center-value')[0].textContent, '100');
  });
});
