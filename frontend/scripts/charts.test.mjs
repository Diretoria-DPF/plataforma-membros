/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Biblioteca de gráficos SVG (frontend/modulos/shared/charts*.js e charts.css):
// funções puras, geração de SVG com um DOM mínimo e regras de higiene
// (sem innerHTML, sem style inline, cores e movimento só por tokens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);
const Core = require('../modulos/shared/charts-core.js');
const Charts = require('../modulos/shared/charts.js');

const NBSP_FREE = (s) => s.replace(/\s/g, '');

/** DOM mínimo: só o necessário para createElement/createElementNS, árvore e atributos. */
function fakeNode(tag, ns) {
  return {
    tag,
    ns: ns || null,
    attrs: {},
    children: [],
    textContent: '',
    style: {
      props: {},
      setProperty(key, value) { this.props[key] = value; }
    },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    setAttribute(key, value) { this.attrs[key] = String(value); }
  };
}

function fakeDoc() {
  return {
    createElement: (tag) => fakeNode(tag),
    createElementNS: (ns, tag) => fakeNode(tag, ns)
  };
}

function mountPoint(doc) {
  const container = fakeNode('div');
  container.ownerDocument = doc;
  // Medida do contêiner como o navegador daria: a largura de clientWidth, sem padding.
  container.getBoundingClientRect = () => ({ width: container.clientWidth || 0 });
  return container;
}

function walk(node, out = []) {
  out.push(node);
  node.children.forEach((child) => walk(child, out));
  return out;
}
const byTag = (node, tag) => walk(node).filter((n) => n.tag === tag);
const byClass = (node, cls) => walk(node).filter((n) => (n.attrs.class || '').split(/\s+/).includes(cls));
const classesOf = (node) => (node.attrs.class || '').split(/\s+/).filter(Boolean);
/** Rótulos de valor sempre visíveis (sem a classe de realce de hover). */
const persistentValues = (node) => byClass(node, 'laift-chart__value').filter((n) => !classesOf(n).includes('laift-chart__value--hover'));
/** Marcadores visíveis de ponto (o marcador quieto, só de hover, fica de fora). */
const visibleDots = (node) => byClass(node, 'laift-chart__dot').filter((n) => !classesOf(n).includes('laift-chart__dot--quiet'));

/** Troca matchMedia/rAF temporariamente e restaura, mesmo se o teste falhar. */
function withGlobal(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, name);
  const prev = globalThis[name];
  globalThis[name] = value;
  try {
    return fn();
  } finally {
    if (had) globalThis[name] = prev;
    else delete globalThis[name];
  }
}

// ---------- Funções puras ----------

test('linearScale leva o domínio ao intervalo e cai no meio quando o domínio é vazio', () => {
  assert.equal(Core.linearScale([0, 10], [0, 200])(5), 100);
  assert.equal(Core.linearScale([3, 3], [0, 100])(3), 50);
});

test('niceMax arredonda para cima em passos 1, 2, 2,5, 5 e 10', () => {
  assert.equal(Core.niceMax(0), 1);
  assert.equal(Core.niceMax(7), 10);
  assert.equal(Core.niceMax(10), 10);
  assert.equal(Core.niceMax(2.2), 2.5);
  assert.equal(Core.niceMax(1200), 2000);
  assert.equal(Core.niceMax(0.3), 0.5);
});

test('ticks divide de 0 até o máximo em partes iguais', () => {
  assert.deepEqual(Core.ticks(10, 4), [0, 2.5, 5, 7.5, 10]);
});

test('arcPath gera o arco de 0 a 90 graus a partir do topo, sentido horário', () => {
  assert.equal(Core.arcPath(50, 50, 40, 0, 90), 'M 50 10 A 40 40 0 0 1 90 50');
});

test('arcPath de anel cheio não colapsa e usa arco grande', () => {
  assert.match(Core.arcPath(50, 50, 40, 0, 360), /^M 50 10 A 40 40 0 1 1 /);
  assert.equal(Core.arcPath(50, 50, 40, 30, 30).includes(' A '), false);
});

test('barPath arredonda só a ponta do dado e mantém a base reta', () => {
  assert.equal(
    Core.barPath(0, 0, 100, 20, 4, 'horizontal'),
    'M 0 0 H 96 A 4 4 0 0 1 100 4 V 16 A 4 4 0 0 1 96 20 H 0 Z'
  );
  assert.match(Core.barPath(0, 0, 6, 2, 4, 'vertical'), /A 1 1 /);
});

test('formatação pt-BR: milhar com ponto, decimal com vírgula, percentual e pontos', () => {
  assert.equal(Core.formatNumber(1234.5), '1.234,5');
  assert.equal(NBSP_FREE(Core.formatPercent(0.42)), '42%');
  assert.equal(Core.formatPoints(73.4), '73%');
});

test('linha suave: curvas Bézier com controles dentro da faixa, sem passar da base nem do topo', () => {
  const model = Core.lineModel([0, 10, 0, 10], { width: 300, height: 100 });
  assert.match(model.linePath, /^M \S+ \S+ C /);
  const nums = model.linePath.replace(/[MCL]/g, ' ').trim().split(/\s+/).map(Number);
  nums.forEach((n, i) => {
    if (i % 2 === 1) assert.ok(n >= 0 && n <= 100, `y fora da faixa: ${n}`);
  });
});

test('gráfico de linha usa a largura medida do contêiner: SVG em px igual ao viewBox', () => {
  const container = mountPoint(fakeDoc());
  container.clientWidth = 412;
  Charts.lineArea(container, [1, 2, 3], { fluid: true, width: 640, height: 220 });
  const svg = container.children[0].children[0];
  assert.equal(svg.attrs.width, '412');
  assert.equal(svg.attrs.viewBox, '0 0 412 220');
});

test('sem medida (painel oculto) o gráfico usa a largura padrão', () => {
  const container = mountPoint(fakeDoc());
  Charts.lineArea(container, [1, 2], { fluid: true, width: 640, height: 220 });
  assert.equal(container.children[0].children[0].attrs.width, '640');
});

test('eixo Y tem três rótulos (0, metade e máximo); marcador só no último ponto e no máximo', () => {
  const container = mountPoint(fakeDoc());
  Charts.lineArea(container, [0, 4, 8, 2], { width: 300, height: 220 });
  const wrap = container.children[0];
  assert.deepEqual(byClass(wrap, 'laift-chart__axis-label').map((n) => n.textContent), ['0', '5', '10']);
  assert.equal(visibleDots(wrap).length, 2);
  assert.equal(byClass(wrap, 'laift-chart__dot--quiet').length, 2);
});

test('linha: valor do último ponto é persistente e o do máximo também, quando não colidem', () => {
  const container = mountPoint(fakeDoc());
  Charts.lineArea(container, [0, 4, 8, 2], { width: 300, height: 220 });
  const wrap = container.children[0];
  assert.deepEqual(persistentValues(wrap).map((n) => n.textContent), ['8', '2']);
  assert.equal(byClass(wrap, 'laift-chart__value--hover').length, 2, 'pontos intermediários só realçam no hover');
});

test('linha: com o máximo no último ponto há um só rótulo persistente', () => {
  const container = mountPoint(fakeDoc());
  Charts.lineArea(container, [0, 2, 9], { width: 300, height: 220 });
  const wrap = container.children[0];
  assert.deepEqual(persistentValues(wrap).map((n) => n.textContent), ['9']);
});

test('largura medida tem piso de 160 px e variação menor que 8 px não refaz o gráfico', async () => {
  let fire = null;
  class FakeObserver {
    constructor(cb) { fire = cb; }
    observe() {}
    disconnect() {}
  }
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'ResizeObserver');
  const prev = globalThis.ResizeObserver;
  globalThis.ResizeObserver = FakeObserver;
  try {
    const narrow = mountPoint(fakeDoc());
    narrow.clientWidth = 120;
    const chart = Charts.lineArea(narrow, [1, 2], { fluid: true, width: 640, height: 220 });
    assert.equal(narrow.children[0].children[0].attrs.width, '160');
    narrow.clientWidth = 200;
    fire();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(narrow.children[0].children[0].attrs.width, '200');
    narrow.clientWidth = 205;
    fire();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(narrow.children[0].children[0].attrs.width, '200', 'variação de 5 px não refaz o gráfico');
    chart.destroy();
  } finally {
    if (had) globalThis.ResizeObserver = prev;
    else delete globalThis.ResizeObserver;
  }
});

test('sem dados, o aviso ocupa uma faixa de 56 px e não a altura do gráfico', () => {
  const container = mountPoint(fakeDoc());
  Charts.lineArea(container, [], { width: 300, height: 220 });
  assert.equal(container.children[0].children[0].attrs.viewBox, '0 0 300 56');
});

test('mudança de largura refaz o gráfico com debounce; destroy desliga o observador', async () => {
  let fire = null;
  let disconnected = false;
  class FakeObserver {
    constructor(cb) { fire = cb; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'ResizeObserver');
  const prev = globalThis.ResizeObserver;
  globalThis.ResizeObserver = FakeObserver;
  try {
    const container = mountPoint(fakeDoc());
    container.clientWidth = 300;
    const chart = Charts.lineArea(container, [1, 2, 3], { fluid: true, width: 640, height: 220 });
    assert.equal(container.children[0].children[0].attrs.width, '300');
    container.clientWidth = 520;
    fire();
    fire();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(container.children[0].children[0].attrs.width, '520');
    chart.destroy();
    assert.equal(disconnected, true);
    assert.equal(container.children.length, 0);
  } finally {
    if (had) globalThis.ResizeObserver = prev;
    else delete globalThis.ResizeObserver;
  }
});

test('countUpValue parte do início, termina exatamente no alvo e desacelera', () => {
  assert.equal(Core.countUpValue(0, 100, 0, 800), 0);
  assert.equal(Core.countUpValue(0, 100, 800, 800), 100);
  assert.equal(Core.countUpValue(0, 100, 0, 0), 100);
  assert.ok(Core.countUpValue(0, 100, 400, 800) > 50);
});

test('parseDuration lê ms e s de tokens CSS e cai no padrão de 800 ms', () => {
  assert.equal(Core.parseDuration('800ms'), 800);
  assert.equal(Core.parseDuration('0.5s'), 500);
  assert.equal(Core.parseDuration('garbage'), 800);
  assert.equal(Core.parseDuration(''), 800);
});

test('normalizeRows converte valores ruins em 0 e aceita números soltos e values[]', () => {
  const out = Core.normalizeRows([{ label: 'A', value: '12' }, { label: 'B', value: 'x' }, 5, { label: 'C', values: ['1', '2'] }]);
  assert.deepEqual(out.map((r) => r.value), [12, 0, 5, 0]);
  assert.deepEqual(out.map((r) => r.label), ['A', 'B', '3', 'C']);
  assert.deepEqual(out[3].values, [1, 2]);
});

test('capCategories nunca passa de 8 categorias e agrupa o excedente em Outros', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ label: 'c' + i, value: i + 1 }));
  const capped = Core.capCategories(rows, 8);
  assert.equal(capped.length, 8);
  assert.deepEqual(capped[7], { label: 'Outros', value: 27, folded: 3 });
  const small = rows.slice(0, 3);
  assert.deepEqual(Core.capCategories(small, 8), small);
});

test('barsModel calcula comprimento proporcional ao máximo redondo e alturas de linha', () => {
  const model = Core.barsModel([{ label: 'a', value: 50 }, { label: 'b', value: 25 }], { plotWidth: 200, rowHeight: 20, gap: 4 });
  assert.equal(model.max, 50);
  assert.deepEqual(model.bars.map((b) => b.length), [200, 100]);
  assert.deepEqual(model.bars.map((b) => b.y), [0, 24]);
  assert.equal(model.height, 44);
});

test('groupedModel faz cada coluna subir a partir da base, sem passar do plano', () => {
  const rows = [{ label: 'x', values: [10, 40] }, { label: 'y', values: [20, 0] }];
  const model = Core.groupedModel(rows, 2, { plotWidth: 200, plotHeight: 100 });
  assert.equal(model.max, 50);
  assert.equal(model.groups[0].bars[1].height, 80);
  assert.equal(model.groups[0].bars[1].y, 20);
  assert.ok(model.groups.every((g) => g.bars.every((b) => b.height <= 100)));
});

test('lineModel posiciona pontos e fecha a área na base', () => {
  const model = Core.lineModel([0, 5, 10], { width: 100, height: 50 });
  assert.deepEqual(model.points.map((p) => p.x), [0, 50, 100]);
  assert.deepEqual(model.points.map((p) => p.y), [50, 25, 0]);
  assert.ok(model.linePath.startsWith('M 0 50'));
  assert.ok(model.areaPath.endsWith(' L 100 50 L 0 50 Z'));
});

test('donutModel soma as parcelas positivas e ignora zero e negativos', () => {
  const rows = [{ label: 'a', value: 1 }, { label: 'b', value: 3 }, { label: 'c', value: 0 }, { label: 'd', value: -2 }];
  const model = Core.donutModel(rows, { cx: 50, cy: 50, r: 40 });
  assert.equal(model.total, 4);
  assert.equal(model.segments.length, 2);
  assert.deepEqual(model.segments.map((s) => s.share), [0.25, 0.75]);
  assert.deepEqual(model.segments.map((s) => s.slot), [1, 2]);
});

test('radialModel limita o progresso entre 0 e 100%', () => {
  assert.equal(Core.radialModel(150, 100).percent, 100);
  assert.equal(Core.radialModel(150, 100).endDeg, 360);
  assert.equal(Core.radialModel(25).endDeg, 90);
});

test('tableRows formata cada célula, com uma coluna por série', () => {
  assert.deepEqual(Core.tableRows([{ label: 'a', values: [1234, 5] }], Core.formatNumber), [['a', '1.234', '5']]);
  assert.deepEqual(Core.tableRows([{ label: 'b', value: 7 }], Core.formatNumber), [['b', '7']]);
});

test('describeRows usa o texto de vazio ou resume quantidade e maior valor', () => {
  assert.equal(Core.describeRows([], Core.formatNumber), 'Sem dados no período.');
  assert.equal(
    Core.describeRows([{ label: 'a', value: 2 }, { label: 'b', value: 9 }], Core.formatNumber),
    '2 itens. Maior valor: b, 9.'
  );
});

// ---------- Renderização SVG (DOM mínimo) ----------

test('barsHorizontal monta svg role=img com título, descrição, valores e tabela irmã, sem foco', () => {
  const doc = fakeDoc();
  const container = mountPoint(doc);
  const chart = Charts.barsHorizontal(container, [{ label: 'Ana', value: 30 }, { label: 'Bia', value: 12 }], { title: 'Presenças' });
  const wrap = container.children[0];
  const svg = byTag(wrap, 'svg')[0];
  assert.equal(svg.attrs.role, 'img');
  assert.equal(byTag(svg, 'title')[0].textContent, 'Presenças');
  assert.ok(byTag(svg, 'desc')[0].textContent.length > 0);
  assert.equal(byClass(svg, 'laift-chart__bar').length, 2);
  assert.equal(byClass(svg, 'laift-chart__item').length, 2);
  assert.deepEqual(persistentValues(svg).map((n) => n.textContent), ['30', '12'], 'valor de cada barra visível sem hover');
  assert.ok(walk(svg).every((n) => !('tabindex' in n.attrs)), 'nenhum elemento do gráfico recebe foco');
  assert.equal(byClass(svg, 'laift-chart__bar')[0].attrs['data-series'], '1');
  const table = byTag(wrap, 'table')[0];
  assert.equal(table.attrs.class, 'sr-only');
  assert.equal(byTag(table, 'caption')[0].textContent, 'Presenças');
  chart.destroy();
});

test('groupedBars mostra legenda com uma marca por série quando há duas ou mais', () => {
  const container = mountPoint(fakeDoc());
  Charts.groupedBars(container, [{ label: 'Jan', values: [3, 4] }, { label: 'Fev', values: [5, 1] }], { series: ['Entradas', 'Saídas'] });
  const wrap = container.children[0];
  const items = byClass(wrap, 'laift-chart__legend-item');
  assert.equal(items.length, 2);
  const swatches = byClass(wrap, 'laift-chart__swatch');
  assert.deepEqual(swatches.map((s) => s.attrs['data-series']), ['1', '2']);
  assert.equal(byClass(wrap, 'laift-chart__legend-text')[0].textContent, 'Entradas');
});

test('dados vazios mostram "Sem dados no período" sem quebrar, em barras e rosca', () => {
  const container = mountPoint(fakeDoc());
  Charts.barsHorizontal(container, []);
  const wrap = container.children[0];
  assert.ok(wrap.attrs.class.includes('laift-chart--empty'));
  assert.equal(byClass(wrap, 'laift-chart__empty')[0].textContent, 'Sem dados no período');
  assert.equal(byClass(wrap, 'laift-chart__bar').length, 0);

  const zeros = mountPoint(fakeDoc());
  Charts.donut(zeros, [{ label: 'a', value: 0 }]);
  assert.equal(byClass(zeros.children[0], 'laift-chart__empty')[0].textContent, 'Sem dados no período');
});

test('update troca o conteúdo sem duplicar e destroy esvazia o container', () => {
  const container = mountPoint(fakeDoc());
  const chart = Charts.lineArea(container, [1, 2, 3]);
  chart.update([4, 5]);
  assert.equal(container.children.length, 1);
  assert.equal(byClass(container.children[0], 'laift-chart__dot').length, 2);
  chart.destroy();
  assert.equal(container.children.length, 0);
  assert.equal(chart.el, null);
});

test('donut desenha um segmento por parcela e mostra o total no centro (reduced motion)', () => {
  const container = mountPoint(fakeDoc());
  Charts.donut(container, [{ label: 'a', value: 3 }, { label: 'b', value: 1 }], { reducedMotion: true });
  const wrap = container.children[0];
  assert.ok(wrap.attrs.class.includes('laift-chart--static'));
  const segments = byClass(wrap, 'laift-chart__seg');
  assert.equal(segments.length, 2);
  assert.ok(segments.every((s) => s.attrs.pathLength === '1'));
  assert.equal(byClass(wrap, 'laift-chart__center-value')[0].textContent, '4');
});

test('sparkline com live marca o pulso e mostra o último valor, sem foco', () => {
  const container = mountPoint(fakeDoc());
  Charts.sparkline(container, [1, 4, 2], { live: true });
  const wrap = container.children[0];
  assert.ok(wrap.attrs.class.includes('laift-chart--live'));
  assert.equal(byClass(wrap, 'laift-chart__pulse').length, 1);
  assert.deepEqual(persistentValues(wrap).map((n) => n.textContent), ['2']);
  assert.ok(walk(wrap).every((n) => !('tabindex' in n.attrs)), 'sparkline sem foco');
});

test('prefers-reduced-motion ativo vira classe estática em qualquer gráfico', () => {
  withGlobal('matchMedia', () => ({ matches: true }), () => {
    const container = mountPoint(fakeDoc());
    Charts.sparkline(container, [1, 2, 3]);
    assert.ok(container.children[0].attrs.class.includes('laift-chart--static'));
  });
});

test('countUp com reduced motion mostra o valor final direto', () => {
  const el = fakeNode('span');
  Charts.countUp(el, 1234, { reducedMotion: true });
  assert.equal(el.textContent, '1.234');
});

test('countUp anima por requestAnimationFrame e termina exatamente no alvo', () => {
  const queue = [];
  withGlobal('requestAnimationFrame', (cb) => { queue.push(cb); return queue.length; }, () => {
    const el = fakeNode('span');
    Charts.countUp(el, 100, { duration: 800, reducedMotion: false, format: (v) => String(Math.round(v)) });
    queue.shift()(0);
    assert.equal(el.textContent, '0');
    queue.shift()(400);
    const mid = Number(el.textContent);
    assert.ok(mid > 50 && mid < 100, 'valor intermediário: ' + mid);
    queue.shift()(800);
    assert.equal(el.textContent, '100');
  });
});

test('toTable devolve tabela sr-only com cabeçalho, linhas formatadas e legenda', () => {
  const doc = fakeDoc();
  const table = Charts.toTable([{ label: 'Mar', value: 1500 }], 'Mensal', { doc });
  assert.equal(table.tag, 'table');
  assert.equal(table.attrs.class, 'sr-only');
  assert.equal(byTag(table, 'caption')[0].textContent, 'Mensal');
  assert.deepEqual(byTag(table, 'th').map((th) => th.textContent), ['Categoria', 'Valor', 'Mar']);
  assert.equal(byTag(table, 'td')[0].textContent, '1.500');
});

test('colunas agrupadas mostram o valor de cada barra de forma persistente quando cabem', () => {
  const container = mountPoint(fakeDoc());
  Charts.groupedBars(container, [{ label: 'Jan', values: [3, 4] }, { label: 'Fev', values: [5, 1] }], { series: ['Entradas', 'Saídas'] });
  const wrap = container.children[0];
  assert.deepEqual(persistentValues(wrap).map((n) => n.textContent), ['3', '4', '5', '1']);
  assert.equal(byClass(wrap, 'laift-chart__value--hover').length, 0);
});

test('colunas estreitas: rótulo persistente só onde cabe e legenda com o total de cada série', () => {
  const container = mountPoint(fakeDoc());
  const rows = Array.from({ length: 12 }, (_, i) => ({ label: 'g' + i, values: [10, 10] }));
  Charts.groupedBars(container, rows, { width: 160, height: 200, series: ['set/26', 'out/26'] });
  const wrap = container.children[0];
  const shown = persistentValues(wrap);
  assert.ok(shown.length >= 1 && shown.length < 24, 'alguns rótulos cabem, outros não');
  assert.ok(byClass(wrap, 'laift-chart__value--hover').length > 0, 'rótulo que colide vira só realce');
  assert.deepEqual(byClass(wrap, 'laift-chart__legend-text').map((n) => n.textContent), ['set/26 · 120', 'out/26 · 120']);
});

test('nenhum gráfico tem elemento focável: tabindex fica fora de todas as marcas', () => {
  const doc = fakeDoc();
  const charts = [
    Charts.barsHorizontal(mountPoint(doc), [{ label: 'a', value: 2 }]),
    Charts.groupedBars(mountPoint(doc), [{ label: 'a', values: [1, 2] }, { label: 'b', values: [2, 1] }]),
    Charts.lineArea(mountPoint(doc), [1, 3, 2]),
    Charts.donut(mountPoint(doc), [{ label: 'a', value: 1 }, { label: 'b', value: 2 }]),
    Charts.radialProgress(mountPoint(doc), 40),
    Charts.sparkline(mountPoint(doc), [1, 2, 3])
  ];
  charts.forEach((chart) => {
    assert.equal(walk(chart.el).filter((n) => 'tabindex' in n.attrs).length, 0);
    assert.equal(walk(chart.el).filter((n) => 'aria-label' in n.attrs && n.tag === 'g').length, 0, 'aria-label em g sem papel não é exposto');
  });
});

test('placeValueLabels: o maior valor entra primeiro e o que colide some sem tocar os aceitos', () => {
  const shown = Core.placeValueLabels([
    { x: 10, y: 20, text: '100', priority: 100 },
    { x: 14, y: 20, text: '200', priority: 200 },
    { x: 80, y: 20, text: '5', priority: 5 }
  ], { size: 11 });
  assert.deepEqual(shown, [false, true, true]);
});

test('placeValueLabels: candidato obrigatório aparece mesmo colidindo; fora dos limites some', () => {
  const shown = Core.placeValueLabels([
    { x: 50, y: 20, text: '9', priority: 0, required: true },
    { x: 52, y: 20, text: '8', priority: 9 },
    { x: 2, y: 20, text: '1234', anchor: 'middle', priority: 3 }
  ], { size: 11, bounds: { minX: 0, maxX: 100, minY: 0, maxY: 40 } });
  assert.deepEqual(shown, [true, false, false]);
});

test('placeValueLabels: rótulos afastados cabem todos; lista vazia devolve lista vazia', () => {
  assert.deepEqual(Core.placeValueLabels([{ x: 10, y: 20, text: '1' }, { x: 60, y: 20, text: '2' }]), [true, true]);
  assert.deepEqual(Core.placeValueLabels([]), []);
});

test('estimateTextWidth cresce com o texto e com o corpo do rótulo; seriesTotals soma por série', () => {
  assert.ok(Core.estimateTextWidth('12345', 11) > Core.estimateTextWidth('1', 11));
  assert.ok(Core.estimateTextWidth('12', 16) > Core.estimateTextWidth('12', 11));
  assert.deepEqual(Core.seriesTotals([{ values: [1, 2] }, { values: [3] }], 2), [4, 2]);
});

// ---------- Higiene do código e do CSS ----------

test('charts.js e charts-core.js não usam innerHTML nem style inline', () => {
  for (const rel of ['modulos/shared/charts.js', 'modulos/shared/charts-core.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, rel);
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, rel);
  }
});

test('charts-core.js é puro: não toca em document nem window', () => {
  assert.doesNotMatch(read('modulos/shared/charts-core.js'), /\bdocument\.|\bwindow\./);
});

test('charts.js e charts-core.js ficam abaixo de 800 linhas', () => {
  for (const rel of ['modulos/shared/charts.js', 'modulos/shared/charts-core.js']) {
    assert.ok(read(rel).split('\n').length < 800, rel);
  }
});

test('charts.css usa só cores de token: sem hex, rgb ou hsl literal', () => {
  const css = read('modulos/shared/charts.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla|oklch)\(/);
});

test('charts.css move só transform, opacity e stroke-dashoffset, com duração e curva de token', () => {
  const css = read('modulos/shared/charts.css');
  const allowed = new Set(['transform', 'opacity', 'stroke-dashoffset', 'none']);
  const declarations = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  assert.ok(declarations.length > 0);
  for (const declaration of declarations) {
    for (const part of declaration.split(',')) {
      const prop = part.trim().split(/\s+/)[0];
      assert.ok(allowed.has(prop), 'propriedade animada proibida: ' + prop);
    }
  }
  assert.doesNotMatch(css, /\b\d+(\.\d+)?(ms|s)\b/, 'duração literal');
  assert.doesNotMatch(css, /cubic-bezier\(/, 'curva literal');
});

test('charts.css: valor de série é persistente; só o realce de hover o esconde', () => {
  const css = read('modulos/shared/charts.css');
  const base = css.match(/\.laift-chart__svg \.laift-chart__value\s*\{([^}]*)\}/);
  assert.ok(base, 'regra do valor persistente');
  assert.doesNotMatch(base[1], /opacity/, 'valor persistente não pode nascer invisível');
  assert.match(css, /@media \(hover: hover\) \{[\s\S]*?\.laift-chart__item:hover \.laift-chart__value--hover\s*\{\s*opacity:\s*1/);
});

test('charts.css: nenhum item de gráfico recebe foco (sem regras :focus de item)', () => {
  assert.doesNotMatch(read('modulos/shared/charts.css'), /laift-chart__item:focus|laift-chart__dot--quiet:focus/);
});

test('charts.css: fundo do gráfico é camada 0 ou 1, nunca superfície 2 ou 3', () => {
  assert.match(read('modulos/shared/charts.css'), /\.laift-chart \{[^}]*background:\s*var\(--layer-[01]\)/);
});

test('charts.css: rótulo de valor de 11 px, acima da regra geral de texto de 12 px', () => {
  assert.match(read('modulos/shared/charts.css'), /\.laift-chart__svg \.laift-chart__value \{[^}]*font-size:\s*11px/);
});
