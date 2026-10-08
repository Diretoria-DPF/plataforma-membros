/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia (ADR 0003): matriz de estados, allowlists, arte gerada (sincronia com lia.svg)
// e montagem (mount, setState, ciclo de vida) com um DOM mínimo.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildLiaArtSource, extractArt } from '../modulos/shared/lia/build-lia-art.mjs';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIA = 'modulos/shared/lia';
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const norm = (text) => text.replace(/\r\n/g, '\n');
const require = createRequire(import.meta.url);
const States = require('../modulos/shared/lia/lia-states.js');
const Lia = require('../modulos/shared/lia/lia.js');
const art = require('../modulos/shared/lia/lia-art.js');
const RealLiaAnim = require('../modulos/shared/lia/lia-anim.js');

const SVG_NS = 'http://www.w3.org/2000/svg';
const EMOTIONS = ['neutral', 'curious', 'happy', 'worried', 'focused', 'sad'];

// ---------- ambiente: globais restaurados depois de cada teste ----------

const saved = new Map();
const mounted = [];

function setGlobal(name, value) {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

afterEach(() => {
  mounted.splice(0).forEach((instance) => instance.destroy());
  for (const [name, desc] of saved) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete globalThis[name];
  }
  saved.clear();
});

function captureWarn(fn) {
  const original = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    return { result: fn(), calls };
  } finally {
    console.warn = original;
  }
}

function findById(node, id) {
  for (const child of node.children) {
    if (child.attrs.id === id) return child;
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

/** Animação WAAPI falsa: cancelar rejeita `finished`, como o navegador faz. */
function fakeWaapiAnimation(frames, options) {
  let rejectFinished = () => {};
  const finished = new Promise((resolve, reject) => { rejectFinished = reject; });
  return {
    frames,
    options,
    cancelled: false,
    finished,
    cancel() {
      this.cancelled = true;
      rejectFinished(new Error('AbortError'));
    },
  };
}

/** DOM mínimo. innerHTML lança: a Lia nunca pode converter texto em marcação. */
function fakeEl(tag, ns, ownerDocument = null) {
  const el = {
    tag,
    ns,
    ownerDocument,
    attrs: {},
    children: [],
    animations: [],
    parentNode: null,
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    removeChild(child) {
      el.children = el.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
    /** Só seletores #id: é o que a Lia usa para achar olhos e braços. */
    querySelector(selector) { return selector.startsWith('#') ? findById(el, selector.slice(1)) : null; },
    animate(frames, options) {
      const anim = fakeWaapiAnimation(frames, options);
      el.animations.push(anim);
      return anim;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 180 }),
  };
  Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return el;
}

function fakeDocument(win = null) {
  const targets = {};
  const listeners = new Map();
  const doc = {
    targets,
    defaultView: win,
    createElement: (tag) => fakeEl(tag, null, doc),
    createElementNS: (ns, tag) => fakeEl(tag, ns, doc),
    querySelector: (selector) => targets[selector] || null,
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); },
    listenerCount: (type) => (listeners.get(type) || []).length,
    dispatch(type, ev) { (listeners.get(type) || []).forEach((fn) => fn(ev)); },
  };
  return doc;
}

/** Janela falsa para o LiaAnim real: sem preferências de movimento, rAF manual. */
function fakeWindow() {
  const frames = [];
  return {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (el) => ({ display: el.style.display || 'inline' }),
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    pending: () => frames.length,
    flushFrames() { while (frames.length) frames.shift()(); },
  };
}

function walk(node, out = []) {
  out.push(node);
  node.children.forEach((child) => walk(child, out));
  return out;
}

function artIds(nodes, out = new Set()) {
  nodes.forEach((node) => {
    if (node.attrs.id) out.add(node.attrs.id);
    artIds(node.children, out);
  });
  return out;
}

/** Relógio falso: registra os atrasos e dispara só o que ainda está pendente. */
function fakeTimers() {
  const pending = new Map();
  let seq = 0;
  const timers = {
    delays: [],
    pendingCount: () => pending.size,
    fire() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((fn) => fn());
    },
  };
  setGlobal('setTimeout', (fn, ms) => {
    seq += 1;
    pending.set(seq, fn);
    timers.delays.push(ms);
    return seq;
  });
  setGlobal('clearTimeout', (id) => { pending.delete(id); });
  return timers;
}

function fakeAnim(log, failing = null) {
  const record = (name) => () => {
    log.push(name);
    return () => log.push(`stop:${name}`);
  };
  return {
    startBlinkLoop: failing === 'blink' ? () => { throw new Error('boom'); } : record('blink'),
    startEyeTracking: record('eyes'),
    wave: record('wave'),
    heartBurst: record('heart'),
    thinkingDots: record('dots'),
  };
}

/** Monta a Lia numa seção nova e devolve o host (o <div class="lia">) junto com a instância. */
function mountLia(opts) {
  const doc = fakeDocument();
  const stage = fakeEl('section', null);
  setGlobal('document', doc);
  setGlobal('LiaArt', art);
  const lia = Lia.mount(stage, opts);
  if (lia) mounted.push(lia);
  return { stage, lia, host: lia ? stage.children[0] : null };
}

// ---------- matriz de estados (lia-states.js) ----------

test('idle: rosto neutro, braços parados, sem acessório, rótulo "Lia"', () => {
  const s = States.resolve('idle');
  assert.equal(s.state, 'idle');
  assert.equal(s.emotion, 'neutral');
  assert.equal(s.mouth, 'neutral');
  assert.equal(s.armLeft, 'idle');
  assert.equal(s.armRight, 'idle');
  assert.equal(s.prop, 'none');
  assert.equal(s.ariaLabel, 'Lia');
});

test('thinking: curiosa, boca reta, braço direito no queixo, cenário de bolha', () => {
  const s = States.resolve('thinking');
  assert.deepEqual([s.state, s.emotion, s.mouth, s.armRight, s.scene], ['thinking', 'curious', 'flat', 'chin', 'bubble']);
  assert.equal(s.ariaLabel, 'Lia está pensando');
});

test('speaking: boca aberta, braço direito apontando, emoção omitida para valer o CSS', () => {
  const s = States.resolve('speaking');
  assert.equal(s.state, 'speaking');
  assert.equal(s.emotion, null);
  assert.equal(s.mouth, 'open');
  assert.equal(s.armRight, 'point');
  assert.equal(s.ariaLabel, 'Lia está respondendo');
});

test('celebrating: feliz, sorriso, braços em coração e cenário completo', () => {
  const s = States.resolve('celebrating');
  assert.deepEqual([s.emotion, s.mouth, s.armLeft, s.armRight], ['happy', 'smile', 'heart', 'heart']);
  assert.equal(s.scene, 'glow heart sparkles');
  assert.equal(s.ariaLabel, 'Lia está celebrando');
});

test('confused: curiosa e simpática, sem cara de tristeza (erro ou pergunta não entendida)', () => {
  const s = States.resolve('confused');
  assert.equal(s.state, 'idle');
  assert.equal(s.emotion, 'curious');
  assert.equal(s.mouth, 'neutral');
});

test('alert e warning: focada no nível 1; preocupada de braços cruzados no nível 2 (cena 5)', () => {
  const alert = States.resolve('alert');
  const warning = States.resolve('warning');
  assert.deepEqual([alert.emotion, alert.mouth], ['focused', 'flat']);
  assert.deepEqual([warning.emotion, warning.mouth], ['worried', 'worried']);
  assert.equal(warning.ariaLabel, 'Lia emitiu um alerta');
});

test('redeem: feliz, sorrindo, com brilho e coração (pose final da cena 6)', () => {
  const s = States.resolve('redeem');
  assert.deepEqual([s.state, s.emotion, s.mouth, s.armLeft, s.armRight], ['idle', 'happy', 'smile', 'idle', 'idle']);
  assert.equal(s.scene, 'glow heart');
  assert.equal(s.ariaLabel, 'Lia', 'volta ao repouso: o rótulo é o de sempre');
});

test('planFor: peças e cena de cada contexto das ondas 2-4; os demais não têm plano', () => {
  const plan = (name) => States.planFor(name);
  assert.deepEqual([...plan('warning').extras], ['veu', 'cruzados', 'aviso']);
  assert.equal(plan('warning').scene, 'warning');
  assert.deepEqual([...plan('suspended').extras], ['costas-cabeca', 'costas-costura']);
  assert.equal(plan('suspended').scene, null);
  assert.deepEqual([...plan('redeem').extras], []);
  assert.deepEqual([...plan('redeem').sceneExtras], ['costas-cabeca', 'costas-costura']);
  assert.equal(plan('redeem').late, false);
  assert.equal(plan('confused').scene, 'confused');
  assert.deepEqual([...plan('lab').extras], ['liquido-b', 'bolha-1', 'bolha-2', 'bolha-3']);
  assert.deepEqual([...plan('clinic').extras], ['monitor']);
  assert.deepEqual([...plan('atlas').extras], ['osso', 'estrela']);
  assert.deepEqual([...plan('learn').extras], ['folha', 'interrogacao', 'tela']);
  ['idle', 'thinking', 'events', 'proposals', 'nope', 'constructor'].forEach((name) => {
    assert.equal(plan(name).scene, null, name);
    assert.deepEqual([...plan(name).extras], [], name);
  });
});

test('planFor: toda peça pedida está na lista de nomes conhecidos e o plano é imutável', () => {
  States.CONTEXTS.forEach((name) => {
    const p = States.planFor(name);
    [...p.extras, ...p.sceneExtras].forEach((extra) => assert.ok(States.EXTRA_NAMES.includes(extra), `${name} -> ${extra}`));
    assert.ok(Object.isFrozen(p), name);
  });
});

test('suspended: estado suspended com rótulo "Lia está suspensa"', () => {
  const s = States.resolve('suspended');
  assert.equal(s.state, 'suspended');
  assert.equal(s.ariaLabel, 'Lia está suspensa');
});

test('módulos: cada um com o prop e a emoção do mapa', () => {
  const expected = {
    events: ['calendar', 'curious'],
    proposals: ['pencil', 'focused'],
    lab: ['flask', 'focused'],
    clinic: ['stethoscope', 'neutral'],
    atlas: ['skeleton', 'curious'],
    learn: ['book', 'neutral'],
  };
  Object.entries(expected).forEach(([name, [prop, emotion]]) => {
    const s = States.resolve(name);
    assert.equal(s.prop, prop, name);
    assert.equal(s.emotion, emotion, name);
    assert.equal(s.state, 'idle', name);
  });
});

test('todo contexto usa somente valores das allowlists', () => {
  const { ALLOWED } = States;
  States.CONTEXTS.forEach((name) => {
    const s = States.resolve(name);
    assert.ok(['idle', 'thinking', 'speaking', 'celebrating', 'suspended'].includes(s.state), name);
    if (s.emotion !== null) assert.ok(ALLOWED.emotion.includes(s.emotion), name);
    assert.ok(ALLOWED.mouth.includes(s.mouth), name);
    assert.ok(ALLOWED.arm.includes(s.armLeft) && ALLOWED.arm.includes(s.armRight), name);
    assert.ok(ALLOWED.prop.includes(s.prop), name);
    (s.scene && s.scene !== 'none' ? s.scene.split(' ') : []).forEach((tok) => assert.ok(ALLOWED.scene.includes(tok), name));
  });
});

test('resolve devolve objeto novo e congelado, sem alterar o contexto base', () => {
  const first = States.resolve('thinking', { emotion: 'happy' });
  const again = States.resolve('thinking');
  assert.equal(first.emotion, 'happy');
  assert.equal(again.emotion, 'curious');
  assert.ok(Object.isFrozen(first));
  assert.notEqual(first, again);
});

test('override válido troca emoção e prop', () => {
  const s = States.resolve('idle', { emotion: 'sad', prop: 'book' });
  assert.equal(s.emotion, 'sad');
  assert.equal(s.prop, 'book');
});

test('override inválido é ignorado em emoção, boca, braços e prop', () => {
  const base = States.resolve('idle');
  const s = States.resolve('idle', { emotion: 'angry', mouth: 'laugh', armLeft: 'dance', armRight: 'x', prop: 'dragon' });
  assert.deepEqual(s, base);
});

test('overrides nulos, ausentes ou não-objeto não quebram a resolução', () => {
  const base = States.resolve('idle');
  assert.deepEqual(States.resolve('idle', null), base);
  assert.deepEqual(States.resolve('idle', 'emotion'), base);
  assert.deepEqual(States.resolve('idle'), base);
});

test('cena: filtra tokens desconhecidos, mantém ordem canônica e aceita array', () => {
  assert.equal(States.resolve('idle', { scene: 'sparkles bogus glow' }).scene, 'glow sparkles');
  assert.equal(States.resolve('idle', { scene: ['heart', 'particles'] }).scene, 'particles heart');
});

test('cena: só tokens inválidos mantém o padrão; "none" desliga o cenário', () => {
  assert.equal(States.resolve('thinking', { scene: 'confetti' }).scene, 'bubble');
  assert.equal(States.resolve('thinking', { scene: 'bubble none' }).scene, 'none');
});

test('rótulo ARIA: aceita texto limpo e rejeita vazio, longo ou não-texto', () => {
  assert.equal(States.resolve('idle', { ariaLabel: '  Lia feliz  ' }).ariaLabel, 'Lia feliz');
  assert.equal(States.resolve('idle', { ariaLabel: 'Lia\u0000 ok' }).ariaLabel, 'Lia ok');
  assert.equal(States.resolve('thinking', { ariaLabel: '   ' }).ariaLabel, 'Lia está pensando');
  assert.equal(States.resolve('thinking', { ariaLabel: 'x'.repeat(121) }).ariaLabel, 'Lia está pensando');
  assert.equal(States.resolve('thinking', { ariaLabel: 42 }).ariaLabel, 'Lia está pensando');
});

test('contexto desconhecido, inclusive nomes de Object.prototype, cai em idle', () => {
  ['constructor', '__proto__', 'toString', undefined, 7].forEach((name) => {
    assert.equal(States.resolve(name).context, 'idle', String(name));
  });
});

test('ariaLabelFor: rótulo do contexto, ou "Lia" para contexto desconhecido', () => {
  assert.equal(States.ariaLabelFor('celebrating'), 'Lia está celebrando');
  assert.equal(States.ariaLabelFor('nada'), 'Lia');
});

test('isModule reconhece só os seis módulos', () => {
  assert.deepEqual([...States.MODULES], ['events', 'proposals', 'lab', 'clinic', 'atlas', 'learn']);
  assert.ok(States.isModule('lab'));
  assert.ok(!States.isModule('idle'));
  assert.ok(!States.isModule('alert'));
});

// ---------- arte gerada (build-lia-art.mjs -> lia-art.js) ----------

test('lia-art.js está em sincronia com lia.svg (regenera em memória e compara)', () => {
  const generated = buildLiaArtSource(read(`${LIA}/lia.svg`));
  assert.equal(norm(read(`${LIA}/lia-art.js`)), norm(generated));
});

test('todo id listado em "Grupos" do README existe na árvore da arte', () => {
  const readme = read(`${LIA}/README.md`);
  const groups = readme.slice(readme.indexOf('## Grupos'), readme.indexOf('## Controle'));
  const ids = expandReadmeIds(groups);
  assert.ok(ids.size > 40, `esperado >40 ids, lidos ${ids.size}`);
  const tree = artIds(art.tree);
  const missing = [...ids].filter((id) => !tree.has(id));
  assert.deepEqual(missing, []);
});

const README_TOKEN = /lia-(?:[a-z0-9-]|\{[a-z,]+\})+/g;

/** Expande "lia-arm-{left,right}-{idle,wave}" em todos os ids. "{mesmos}" = as seis emoções. */
function expandReadmeIds(text) {
  const ids = new Set();
  for (const [token] of text.matchAll(README_TOKEN)) {
    const parts = token.split(/(\{[a-z,]+\})/).filter(Boolean);
    let names = [''];
    for (const part of parts) {
      const options = part.startsWith('{') ? braceOptions(part) : [part];
      names = names.flatMap((prefix) => options.map((option) => prefix + option));
    }
    names.forEach((name) => ids.add(name));
  }
  return ids;
}

function braceOptions(part) {
  const inner = part.slice(1, -1);
  return inner === 'mesmos' ? EMOTIONS : inner.split(',');
}

test('árvore tem viewBox 0 0 200 300 e só dados (nenhum valor é marcação HTML)', () => {
  assert.equal(art.viewBox, '0 0 200 300');
  const values = walk({ children: art.tree, attrs: {}, tag: 'root' }).flatMap((n) => Object.values(n.attrs));
  assert.ok(values.every((v) => typeof v === 'string' && !/[<>]/.test(v)));
});

test('cada contexto aponta só para nós que existem na árvore', () => {
  const tree = artIds(art.tree);
  States.CONTEXTS.forEach((name) => {
    const s = States.resolve(name);
    const needed = [`lia-prop-${s.prop}`, `lia-mouth-${s.mouth}`, `lia-arm-left-${s.armLeft}`, `lia-arm-right-${s.armRight}`];
    if (s.emotion) needed.push(`lia-eyes-${s.emotion}`, `lia-brows-${s.emotion}`);
    (s.scene && s.scene !== 'none' ? s.scene.split(' ') : []).forEach((tok) => needed.push(`lia-scene-${tok}`));
    needed.forEach((id) => assert.ok(tree.has(id), `${name} -> ${id}`));
  });
});

test('allowlists batem com os seletores de lia.css', () => {
  const css = read(`${LIA}/lia.css`);
  const { ALLOWED } = States;
  ALLOWED.emotion.forEach((v) => assert.ok(css.includes(`data-emotion="${v}"`), v));
  ALLOWED.mouth.forEach((v) => assert.ok(css.includes(`data-mouth="${v}"`), v));
  ALLOWED.arm.forEach((v) => {
    assert.ok(css.includes(`data-arm-left="${v}"`), `left ${v}`);
    assert.ok(css.includes(`data-arm-right="${v}"`), `right ${v}`);
  });
  ALLOWED.prop.filter((v) => v !== 'none').forEach((v) => assert.ok(css.includes(`data-prop="${v}"`), v));
  ALLOWED.scene.forEach((v) => assert.ok(css.includes(`data-scene~="${v}"`), v));
});

test('gerador recusa script, handler on*, style, href externo e tag desconhecida', () => {
  const head = '<svg viewBox="0 0 200 300">';
  const bad = [
    `${head}<script>alert(1)</script></svg>`,
    `${head}<g onclick="x()"/></svg>`,
    `${head}<g style="fill:red"/></svg>`,
    `${head}<use href="https://evil.example/x.svg#a"/></svg>`,
    `${head}<foreignObject/></svg>`,
  ];
  bad.forEach((svg) => assert.throws(() => extractArt(svg), /lia\.svg/, svg));
});

test('gerador recusa texto solto, elemento sem fechamento e atributo repetido', () => {
  const head = '<svg viewBox="0 0 200 300">';
  assert.throws(() => extractArt(`${head}texto solto</svg>`), /trecho nao suportado/);
  assert.throws(() => extractArt(`${head}<g>`), /sem fechamento/);
  assert.throws(() => extractArt(`${head}<g><path></g></svg>`), /sem abertura/);
  assert.throws(() => extractArt(`${head}<g id="a" id="b"/></svg>`), /repetido/);
});

test('gerador aceita instrução <?xml e comentários, e ignora-os na árvore', () => {
  const source = buildLiaArtSource('<?xml version="1.0"?><!-- x --><svg viewBox="0 0 200 300"><g id="a"/></svg>');
  assert.ok(source.includes('"id":"a"'));
  assert.ok(!source.includes('x --'));
});

// ---------- higiene: nenhum innerHTML nos arquivos da Lia ----------

test('build-lia-art, lia-art, lia-states e lia não usam innerHTML, outerHTML, insertAdjacentHTML ou DOMParser', () => {
  const forbidden = /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|document\.write/;
  // Comentários de cabeçalho podem citar a regra; o que vale é o código.
  const code = (file) => read(`${LIA}/${file}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['build-lia-art.mjs', 'lia-art.js', 'lia-states.js', 'lia.js'].forEach((file) => {
    assert.equal(forbidden.test(code(file)), false, file);
  });
  assert.ok(read(`${LIA}/lia.js`).includes('createElementNS'));
});

// ---------- montagem e API pública (lia.js) ----------

test('mount cria host .lia com role img, aria-label e data-state idle', () => {
  const { host } = mountLia();
  assert.equal(host.attrs.class, 'lia');
  assert.equal(host.attrs.role, 'img');
  assert.equal(host.attrs['aria-label'], 'Lia');
  assert.equal(host.attrs['data-state'], 'idle');
  assert.equal(host.attrs['data-prop'], 'none');
});

test('mount monta o SVG com namespace SVG e uma cópia fiel da árvore', () => {
  const { host } = mountLia();
  const svg = host.children[0];
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.ns, SVG_NS);
  assert.equal(svg.attrs.class, 'lia-svg');
  assert.equal(svg.attrs.viewBox, '0 0 200 300');
  const nodes = walk(svg).slice(1);
  const expected = walk({ children: art.tree, attrs: {}, tag: 'root' }).slice(1).length;
  assert.equal(nodes.length, expected);
  assert.ok(nodes.every((n) => n.ns === SVG_NS));
});

test('mount aceita elemento ou seletor; alvo ausente ou sem arte devolve null com aviso', () => {
  const doc = fakeDocument();
  const stage = fakeEl('section', null);
  doc.targets['#stage'] = stage;
  setGlobal('document', doc);
  setGlobal('LiaArt', art);
  const bySelector = Lia.mount('#stage');
  mounted.push(bySelector);
  assert.equal(stage.children.length, 1);
  const missing = captureWarn(() => Lia.mount('#nao-existe'));
  assert.equal(missing.result, null);
  assert.equal(missing.calls.length, 1);
  setGlobal('LiaArt', undefined);
  const noArt = captureWarn(() => Lia.mount(fakeEl('div', null)));
  assert.equal(noArt.result, null);
});

test('tamanho e tom: px válidos entram, valores inválidos são ignorados, tom admin', () => {
  const { host } = mountLia({ size: 48.4, tone: 'admin' });
  assert.equal(host.style.props['--lia-size'], '48px');
  assert.equal(host.attrs['data-tone'], 'admin');
  assert.equal(Lia.sizeCss(9999), null);
  assert.equal(Lia.sizeCss(8), null);
  assert.equal(Lia.sizeCss('48'), null);
  assert.equal(Lia.toneAttr('root'), null);
  const plain = mountLia({ size: 'grande', tone: 'x' });
  assert.equal(plain.host.style.props['--lia-size'], undefined);
  assert.equal(plain.host.attrs['data-tone'], undefined);
});

test('react(modulo) troca prop e rótulo; módulo desconhecido volta para idle', () => {
  const { lia, host } = mountLia();
  lia.react('events');
  assert.equal(host.attrs['data-prop'], 'calendar');
  assert.equal(host.attrs['aria-label'], 'Lia, assistente de Eventos');
  lia.react('nope');
  assert.equal(host.attrs['data-state'], 'idle');
  assert.equal(host.attrs['data-prop'], 'none');
});

test('think, say e setEmotion: setEmotion mantém o contexto e ignora emoção inválida', () => {
  const { lia, host } = mountLia();
  lia.think();
  assert.equal(host.attrs['data-state'], 'thinking');
  lia.setEmotion('sad');
  assert.equal(host.attrs['data-state'], 'thinking');
  assert.equal(host.attrs['data-emotion'], 'sad');
  lia.setEmotion('angry');
  assert.equal(host.attrs['data-emotion'], 'sad');
  lia.say('olá');
  assert.equal(host.attrs['data-state'], 'speaking');
  assert.equal(host.attrs['data-emotion'], undefined);
});

test('setState aceita contexto e overrides; override inválido não entra no DOM', () => {
  const { lia, host } = mountLia();
  lia.setState('idle', { prop: 'bone', emotion: 'worried', mouth: 'nope' });
  assert.equal(host.attrs['data-prop'], 'bone');
  assert.equal(host.attrs['data-emotion'], 'worried');
  assert.equal(host.attrs['data-mouth'], 'neutral');
});

test('celebrate volta ao idle após 2,5 s, mas não reverte se outra mudança ocorreu', () => {
  const timers = fakeTimers();
  const { lia, host } = mountLia();
  lia.celebrate();
  assert.equal(host.attrs['data-state'], 'celebrating');
  assert.deepEqual(timers.delays, [2500]);
  timers.fire();
  assert.equal(host.attrs['data-state'], 'idle');
  lia.celebrate();
  lia.think();
  assert.equal(timers.pendingCount(), 0);
  timers.fire();
  assert.equal(host.attrs['data-state'], 'thinking');
});

test('suspend muda para suspensa; redeem (sem a arte das cenas) volta ao idle feliz, com braço direito em aceno', () => {
  const { lia, host } = mountLia();
  lia.suspend();
  assert.equal(host.attrs['data-state'], 'suspended');
  assert.equal(host.attrs['aria-label'], 'Lia está suspensa');
  lia.redeem();
  assert.equal(host.attrs['data-state'], 'idle');
  assert.equal(host.attrs['data-arm-right'], 'wave');
  assert.equal(host.attrs['data-emotion'], 'happy');
  assert.equal(host.attrs['aria-label'], 'Lia');
});

test('destroy remove o host, cancela o retorno do celebrate e deixa as chamadas inertes', () => {
  const timers = fakeTimers();
  const { stage, lia, host } = mountLia();
  lia.celebrate();
  lia.destroy();
  assert.equal(stage.children.length, 0);
  assert.equal(timers.pendingCount(), 0);
  assert.doesNotThrow(() => lia.destroy());
  lia.think();
  assert.equal(host.attrs['data-state'], 'celebrating');
});

test('atalhos globais operam na última instância; ao destruí-la, voltam para a anterior', () => {
  const first = mountLia();
  const second = mountLia();
  Lia.think();
  assert.equal(second.host.attrs['data-state'], 'thinking');
  assert.equal(first.host.attrs['data-state'], 'idle');
  second.lia.destroy();
  Lia.think();
  assert.equal(first.host.attrs['data-state'], 'thinking');
  first.lia.destroy();
  assert.equal(Lia.think(), null);
});

test('LiaAnim: loops de piscar e olhar iniciam no mount e param no destroy', () => {
  const log = [];
  setGlobal('LiaAnim', fakeAnim(log));
  const { lia } = mountLia();
  assert.deepEqual(log, ['blink', 'eyes']);
  lia.destroy();
  assert.deepEqual(log.slice(2), ['stop:blink', 'stop:eyes']);
});

test('LiaAnim: sob prefers-reduced-motion nada é iniciado', () => {
  const log = [];
  setGlobal('LiaAnim', fakeAnim(log));
  setGlobal('matchMedia', () => ({ matches: true }));
  const { lia, host } = mountLia();
  lia.think();
  lia.celebrate();
  lia.redeem();
  assert.deepEqual(log, []);
  assert.equal(host.attrs['data-state'], 'idle');
  assert.equal(Lia.reducedMotion(), true);
});

test('LiaAnim: thinkingDots roda em thinking e para quando o estado muda', () => {
  const log = [];
  setGlobal('LiaAnim', fakeAnim(log));
  const { lia } = mountLia();
  lia.think();
  assert.ok(log.includes('dots'));
  lia.setState('idle');
  assert.equal(log.at(-1), 'stop:dots');
});

test('LiaAnim: falha numa animação vira aviso e não quebra a montagem', () => {
  setGlobal('LiaAnim', fakeAnim([], 'blink'));
  const { result, calls } = captureWarn(() => mountLia());
  assert.ok(result.lia);
  assert.ok(calls.length >= 1);
});

test('sem LiaAnim, a montagem e os estados funcionam normalmente', () => {
  setGlobal('LiaAnim', undefined);
  const { lia, host } = mountLia();
  lia.celebrate();
  assert.equal(host.attrs['data-state'], 'celebrating');
  assert.equal(host.attrs['data-scene'], 'glow heart sparkles');
});

// ---------- recorte da cabeça (bolha fechada de 48 px, ADR 0003) ----------

// bbox real de #lia-head no lab.html com o lia.css padrão (medido no navegador, unidades do viewBox 200x300).
const HEAD_BBOX = { x: 68.45, y: 52.5, w: 63.1, h: 75.72 };
const FULL_VIEWBOX = '0 0 200 300';

test('crop head: o viewBox é quadrado e contém a cabeça inteira com margem de pelo menos 3 unidades', () => {
  const { host } = mountLia({ crop: 'head' });
  const [x, y, w, h] = host.children[0].attrs.viewBox.split(' ').map(Number);
  assert.equal(w, h, 'recorte quadrado para a bolha');
  assert.ok(HEAD_BBOX.x - x >= 3, 'margem esquerda');
  assert.ok(x + w - (HEAD_BBOX.x + HEAD_BBOX.w) >= 3, 'margem direita');
  assert.ok(HEAD_BBOX.y - y >= 3, 'margem superior');
  assert.ok(y + h - (HEAD_BBOX.y + HEAD_BBOX.h) >= 3, 'margem inferior');
});

test('crop head: monta a mesma árvore de nós e só troca o viewBox', () => {
  const full = mountLia();
  const head = mountLia({ crop: 'head' });
  assert.equal(full.host.children[0].attrs.viewBox, FULL_VIEWBOX);
  assert.notEqual(head.host.children[0].attrs.viewBox, FULL_VIEWBOX);
  assert.equal(walk(head.host.children[0]).length, walk(full.host.children[0]).length);
});

test('crop: valor desconhecido, ausente ou não-objeto mantém o corpo inteiro', () => {
  assert.equal(mountLia({ crop: 'full' }).host.children[0].attrs.viewBox, FULL_VIEWBOX);
  assert.equal(mountLia({ crop: true }).host.children[0].attrs.viewBox, FULL_VIEWBOX);
  assert.equal(mountLia(null).host.children[0].attrs.viewBox, FULL_VIEWBOX);
});

test('crop head: o recorte sobrevive às mudanças de estado e o tom admin continua valendo', () => {
  const { lia, host } = mountLia({ crop: 'head', tone: 'admin' });
  const cropped = host.children[0].attrs.viewBox;
  lia.think();
  lia.celebrate();
  lia.setState('idle');
  assert.equal(host.children[0].attrs.viewBox, cropped);
  assert.notEqual(cropped, FULL_VIEWBOX);
  assert.equal(host.attrs['data-tone'], 'admin');
});

// ---------- integração: lia-anim.js real (sem stub), documento e janela falsos ----------

/** Monta a Lia com o LiaAnim de verdade; o host herda o documento (ownerDocument) como no navegador. */
function mountWithRealAnim(opts) {
  const win = fakeWindow();
  const doc = fakeDocument(win);
  const stage = fakeEl('section', null, doc);
  setGlobal('document', doc);
  setGlobal('LiaArt', art);
  setGlobal('LiaAnim', RealLiaAnim);
  const lia = Lia.mount(stage, opts);
  if (lia) mounted.push(lia);
  return { win, doc, lia, host: stage.children[0] };
}

test('integração: o olhar segue o cursor com LiaAnim real; o listener entra no mount e sai no destroy', () => {
  const timers = fakeTimers();
  const { win, doc, lia, host } = mountWithRealAnim();
  assert.equal(doc.listenerCount('mousemove'), 1, 'mousemove registrado no mount');
  doc.dispatch('mousemove', { clientX: 1000, clientY: 90 });
  win.flushFrames();
  const eyes = host.querySelector('#lia-eyes-neutral');
  assert.ok(parseFloat(eyes.style.translate.split(' ')[0]) > 2.9, `olhos não seguiram: ${eyes.style.translate}`);
  lia.destroy();
  assert.equal(doc.listenerCount('mousemove'), 0, 'mousemove removido no destroy');
  assert.equal(timers.pendingCount(), 0, 'piscada agendada também para no destroy');
});

test('integração: destroy cancela o aceno em andamento; depois do destroy, redeem não anima de novo', async () => {
  fakeTimers();
  const { lia, host } = mountWithRealAnim();
  lia.redeem();
  const arm = host.querySelector('#lia-arm-right-idle');
  assert.equal(arm.animations.length, 1, 'o aceno começa no redeem');
  lia.destroy();
  assert.equal(arm.animations[0].cancelled, true, 'destroy cancela a animação pontual');
  assert.doesNotThrow(() => lia.redeem());
  assert.equal(arm.animations.length, 1, 'instância destruída não anima mais');
  for (let i = 0; i < 5; i += 1) await Promise.resolve(); // a Promise do aceno assenta sem reabrir nada
  assert.equal(arm.animations.length, 1);
});

test('piscada: só a WAAPI pisca; lia.css não tem keyframes de piscar e mantém o eixo do olho e a respiração', () => {
  const css = read(`${LIA}/lia.css`);
  assert.equal(/lia-blink/.test(css), false, 'piscada em CSS duplicaria a WAAPI');
  assert.match(css, /@keyframes lia-breathe/, 'respiração segue em CSS');
  assert.match(css, /lia-eyes-"\] \{ transform-box: fill-box; transform-origin: center; \}/, 'eixo do olho para o scaleY da WAAPI');
});

test('sem LiaAnim: estados, aceno e destroy funcionam sem lançar', () => {
  setGlobal('LiaAnim', undefined);
  const { lia, host } = mountLia();
  assert.doesNotThrow(() => {
    lia.think();
    lia.redeem();
    lia.destroy();
  });
  assert.equal(host.attrs['data-arm-right'], 'wave');
});
