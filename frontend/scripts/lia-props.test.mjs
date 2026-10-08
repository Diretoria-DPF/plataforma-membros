/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Carregamento sob demanda das props da Lia (frontend/modulos/shared/lia/lia-props.js): um único <script> da mesma
// origem, cache, falha sem erro visível, validação da arte e montagem das peças nos pais certos.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIA = 'modulos/shared/lia';
const require = createRequire(import.meta.url);
const Props = require('../modulos/shared/lia/lia-props.js');
const States = require('../modulos/shared/lia/lia-states.js');
const ART_PATH = path.join(frontend, LIA, 'lia-props-art.js');
const HAS_REAL_ART = fs.existsSync(ART_PATH);
const ORIGIN = 'https://laift.test';

// ---------- DOM mínimo ----------

function findById(el, id) {
  for (const child of el.children) {
    if (child.attrs.id === id) return child;
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

function fakeNode(tag, ns = null) {
  const listeners = {};
  const el = {
    tag,
    ns,
    attrs: {},
    children: [],
    parentNode: null,
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return name in el.attrs ? el.attrs[name] : null; },
    removeAttribute(name) { delete el.attrs[name]; },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    insertBefore(child, ref) {
      child.parentNode = el;
      const at = el.children.indexOf(ref);
      el.children.splice(at < 0 ? el.children.length : at, 0, child);
      return child;
    },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); child.parentNode = null; return child; },
    querySelector(selector) { return selector.startsWith('#') ? findById(el, selector.slice(1)) : null; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { (listeners[type] || []).forEach((fn) => fn({ type })); },
  };
  Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return el;
}

function fakeDoc() {
  const head = fakeNode('head');
  const doc = {
    head,
    baseURI: `${ORIGIN}/`,
    defaultView: { location: { href: `${ORIGIN}/`, origin: ORIGIN } },
    createElement: (tag) => fakeNode(tag),
    createElementNS: (ns, tag) => fakeNode(tag, ns),
  };
  return doc;
}

const scripts = (doc) => doc.head.children.filter((c) => c.tag === 'script');

function realArt() {
  return require(ART_PATH);
}

const SMALL_ART = {
  viewBox: '0 0 200 300',
  tree: [
    { tag: 'g', attrs: { id: 'lia-pv-veu', 'data-pai': 'svg', 'data-posicao': 'primeiro', opacity: '0' }, children: [{ tag: 'rect', attrs: { class: 'vu', x: '0', y: '0', width: '9', height: '9' }, children: [] }] },
    { tag: 'g', attrs: { id: 'lia-pv-aviso', 'data-pai': 'svg' }, children: [{ tag: 'circle', attrs: { class: 'al', cx: '1', cy: '1', r: '1' }, children: [] }] },
    { tag: 'g', attrs: { id: 'lia-pv-bolha-1', 'data-pai': '#lia-prop-flask' }, children: [{ tag: 'circle', attrs: { cx: '1', cy: '1', r: '1' }, children: [] }] },
    { tag: 'g', attrs: { id: 'lia-pv-orfa', 'data-pai': '#nao-existe' }, children: [] },
    { tag: 'g', attrs: { id: 'lia-pv-solta', 'data-pai': 'body > script' }, children: [] },
  ],
};

function baseSvg() {
  const svg = fakeNode('svg', 'svg');
  const body = fakeNode('g');
  body.setAttribute('id', 'lia-body');
  const flask = fakeNode('g');
  flask.setAttribute('id', 'lia-prop-flask');
  svg.appendChild(fakeNode('defs'));
  svg.appendChild(body);
  svg.appendChild(flask);
  return svg;
}

const globals = new Set();
function setGlobal(name, value) {
  globals.add(name);
  globalThis[name] = value;
}

beforeEach(() => {
  Props.reset();
});

afterEach(() => {
  mock.restoreAll();
  globals.forEach((name) => { delete globalThis[name]; });
  globals.clear();
});

// ---------- URL do script ----------

test('resolveSrc: lia-props-art.js fica ao lado do script que carregou o loader', () => {
  assert.equal(Props.resolveSrc(`${ORIGIN}/modulos/shared/lia/lia-props.js`, `${ORIGIN}/`, ORIGIN), `${ORIGIN}/modulos/shared/lia/lia-props-art.js`);
  assert.equal(Props.resolveSrc('', `${ORIGIN}/app/`, ORIGIN), `${ORIGIN}/app/modulos/shared/lia/lia-props-art.js`);
});

test('resolveSrc: outra origem ou URL inválida não vira script', () => {
  assert.equal(Props.resolveSrc('https://evil.example/lia/lia-props.js', `${ORIGIN}/`, ORIGIN), null);
  assert.equal(Props.resolveSrc('', 'não é url', ORIGIN), null);
});

// ---------- Validação ----------

test('validate: aceita a arte bem formada e indexa os nós de topo por id', () => {
  const index = Props.validate(SMALL_ART);
  assert.ok(index);
  assert.ok(index.byId['lia-pv-veu'] && index.byId['lia-pv-aviso']);
});

test('validate: recusa tag fora da lista, handler, style, href externo, id sem prefixo e id repetido', () => {
  const art = (node) => ({ tree: [node] });
  const g = (attrs, children = []) => ({ tag: 'g', attrs: { id: 'lia-pv-x', ...attrs }, children });
  assert.equal(Props.validate(art({ tag: 'script', attrs: { id: 'lia-pv-x' }, children: [] })), null);
  assert.equal(Props.validate(art(g({ onclick: 'x()' }))), null);
  assert.equal(Props.validate(art(g({ style: 'fill:red' }))), null);
  assert.equal(Props.validate(art(g({ href: 'https://evil.example/x.svg' }))), null);
  assert.equal(Props.validate(art(g({ xmlns: 'http://www.w3.org/2000/svg' }))), null);
  assert.equal(Props.validate(art({ tag: 'g', attrs: { id: 'outro-id' }, children: [] })), null);
  assert.equal(Props.validate(art(g({}, [{ tag: 'foreignObject', attrs: {}, children: [] }]))), null);
  assert.equal(Props.validate({ tree: [g({}), g({})] }), null);
  assert.equal(Props.validate(null), null);
  assert.equal(Props.validate({ tree: 'x' }), null);
});

// ---------- Carregamento ----------

test('load: injeta UM <script> da mesma origem, sem fetch, e resolve true quando a arte chega', async () => {
  const doc = fakeDoc();
  const pending = Props.load(doc);
  assert.equal(Props.ready(), false);
  const [script] = scripts(doc);
  assert.equal(scripts(doc).length, 1);
  assert.equal(script.src, `${ORIGIN}/modulos/shared/lia/lia-props-art.js`);
  assert.equal(script.async, true);
  setGlobal('LIA_PROPS_ART', SMALL_ART);
  script.fire('load');
  assert.equal(await pending, true);
  assert.equal(Props.ready(), true);
});

test('load: chamadas repetidas dividem a mesma promessa e depois do sucesso não há novo <script>', async () => {
  const doc = fakeDoc();
  const first = Props.load(doc);
  const second = Props.load(doc);
  assert.equal(first, second);
  assert.equal(scripts(doc).length, 1);
  setGlobal('LIA_PROPS_ART', SMALL_ART);
  scripts(doc)[0].fire('load');
  await first;
  assert.equal(await Props.load(doc), true);
  assert.equal(scripts(doc).length, 1);
});

test('load: arte já presente na página não injeta nada', async () => {
  const doc = fakeDoc();
  setGlobal('LIA_PROPS_ART', SMALL_ART);
  assert.equal(await Props.load(doc), true);
  assert.equal(scripts(doc).length, 0);
});

test('load: falha de rede resolve false (sem lançar) e a Lia base segue', async () => {
  const doc = fakeDoc();
  const pending = Props.load(doc);
  scripts(doc)[0].fire('error');
  assert.equal(await pending, false);
  assert.equal(Props.ready(), false);
});

test('load: arte inválida depois do carregamento também é falha', async () => {
  const doc = fakeDoc();
  const pending = Props.load(doc);
  setGlobal('LIA_PROPS_ART', { tree: [{ tag: 'script', attrs: { id: 'lia-pv-x' }, children: [] }] });
  scripts(doc)[0].fire('load');
  assert.equal(await pending, false);
});

test('load: depois de uma falha só tenta de novo passada a janela de espera', async () => {
  const doc = fakeDoc();
  let clock = 1_000_000;
  mock.method(Date, 'now', () => clock);
  const first = Props.load(doc);
  scripts(doc)[0].fire('error');
  await first;
  clock += Props.RETRY_AFTER_MS - 1;
  assert.equal(await Props.load(doc), false);
  assert.equal(scripts(doc).length, 1, 'ainda dentro da janela: nenhum pedido novo');
  clock += 2;
  const retry = Props.load(doc);
  assert.equal(scripts(doc).length, 2);
  setGlobal('LIA_PROPS_ART', SMALL_ART);
  scripts(doc)[1].fire('load');
  assert.equal(await retry, true);
});

test('load: sem documento, ou com script que não pode ser inserido, é falha silenciosa', async () => {
  assert.equal(await Props.load(null), false);
  Props.reset();
  const doc = fakeDoc();
  doc.head.appendChild = () => { throw new Error('bloqueado'); };
  assert.equal(await Props.load(doc), false);
});

// ---------- Montagem ----------

async function readyProps(art = SMALL_ART) {
  setGlobal('LIA_PROPS_ART', art);
  await Props.load(fakeDoc());
}

test('createSet.add: cada peça vai para o pai de data-pai; "primeiro" entra antes de #lia-body', async () => {
  await readyProps();
  const svg = baseSvg();
  const set = Props.createSet(svg, fakeDoc());
  assert.deepEqual(set.add(['veu', 'aviso', 'bolha-1']), ['veu', 'aviso', 'bolha-1']);
  const ids = svg.children.map((c) => c.attrs.id);
  assert.deepEqual(ids, [undefined, 'lia-pv-veu', 'lia-body', 'lia-prop-flask', 'lia-pv-aviso']);
  assert.equal(findById(svg, 'lia-prop-flask').children[0].attrs.id, 'lia-pv-bolha-1');
  assert.equal(svg.children[1].ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg.children[1].attrs.opacity, '0');
  assert.deepEqual(set.names().sort(), ['aviso', 'bolha-1', 'veu']);
});

test('createSet.add: nome desconhecido, repetido, pai ausente ou pai fora do formato não entram', async () => {
  await readyProps();
  const svg = baseSvg();
  const set = Props.createSet(svg, fakeDoc());
  assert.deepEqual(set.add(['aviso']), ['aviso']);
  assert.deepEqual(set.add(['aviso', 'nao-existe', 'orfa', 'solta']), []);
  assert.equal(svg.children.filter((c) => c.attrs.id === 'lia-pv-aviso').length, 1);
});

test('createSet.remove e clear tiram as peças do DOM; sem arte carregada nada entra', async () => {
  const none = Props.createSet(baseSvg(), fakeDoc());
  assert.deepEqual(none.add(['aviso']), []);
  await readyProps();
  const svg = baseSvg();
  const set = Props.createSet(svg, fakeDoc());
  set.add(['veu', 'aviso']);
  set.remove(['veu', 'nunca-entrou']);
  assert.equal(findById(svg, 'lia-pv-veu'), null);
  assert.equal(set.has('aviso'), true);
  set.clear();
  assert.deepEqual(set.names(), []);
  assert.equal(findById(svg, 'lia-pv-aviso'), null);
  assert.deepEqual(set.add(['veu']), ['veu'], 'depois de remover, pode entrar de novo');
});

test('lia-props.js nunca converte texto em HTML nem usa style inline, fetch ou eval', () => {
  const src = fs.readFileSync(path.join(frontend, LIA, 'lia-props.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|document\.write|\beval\b|new Function|\bfetch\(|XMLHttpRequest/);
  assert.match(code, /createElementNS/);
});

// ---------- Contrato com a arte real (H2): só roda quando lia-props-art.js está no repositório ----------

const real = { skip: HAS_REAL_ART ? false : 'lia-props-art.js ainda não integrado nesta branch' };

test('arte real: formato { viewBox, tree }, validada, com todos os nomes que lia-states.js pede', real, () => {
  const art = realArt();
  assert.equal(art.viewBox, '0 0 200 300');
  const index = Props.validate(art);
  assert.ok(index, 'arte válida');
  States.EXTRA_NAMES.forEach((name) => assert.ok(index.byId[`lia-pv-${name}`], `falta lia-pv-${name}`));
  assert.equal(Object.keys(index.byId).length, States.EXTRA_NAMES.length, 'nenhuma peça sem nome conhecido');
});

test('arte real: cada peça tem data-pai válido e os filhos ecg e coração existem dentro do monitor', real, () => {
  const art = realArt();
  art.tree.forEach((node) => assert.match(node.attrs['data-pai'], /^(svg|#[A-Za-z][\w-]*)$/, node.attrs.id));
  const monitor = art.tree.find((n) => n.attrs.id === 'lia-pv-monitor');
  const nested = monitor.children.map((c) => c.attrs.id);
  assert.ok(nested.includes('lia-pv-ecg') && nested.includes('lia-pv-coracao'));
  assert.equal(art.tree.find((n) => n.attrs.id === 'lia-pv-veu').attrs['data-posicao'], 'primeiro');
});

test('arte real: montada num svg de teste, entra toda no lugar certo', real, async () => {
  await readyProps(realArt());
  const svg = baseSvg();
  ['lia-prop-thermometer', 'lia-prop-skeleton', 'lia-head', 'lia-coat'].forEach((id) => {
    const g = fakeNode('g');
    g.setAttribute('id', id);
    svg.appendChild(g);
  });
  const set = Props.createSet(svg, fakeDoc());
  const added = set.add(States.EXTRA_NAMES);
  assert.deepEqual(added.sort(), [...States.EXTRA_NAMES].sort());
  assert.equal(findById(svg, 'lia-prop-flask').children.length, 4, 'líquido B e três bolhas dentro do frasco');
  assert.equal(findById(svg, 'lia-head').children[0].attrs.id, 'lia-pv-costas-cabeca');
  assert.equal(findById(svg, 'lia-coat').children[0].attrs.id, 'lia-pv-costas-costura');
  assert.ok(findById(svg, 'lia-pv-ecg'), 'o traço do ECG vem aninhado no monitor');
});
