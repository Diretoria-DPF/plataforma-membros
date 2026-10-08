/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Integração das ondas 2-4 em lia.js: props sob demanda (LiaProps), cenas (LiaScenes) e pose final sob movimento
// reduzido, com a arte de lia-art.js e uma arte sintética de props (o contrato da arte real fica em lia-props.test.mjs).
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lia = require('../modulos/shared/lia/lia.js');
const Props = require('../modulos/shared/lia/lia-props.js');
const Scenes = require('../modulos/shared/lia/lia-scenes.js');
const art = require('../modulos/shared/lia/lia-art.js');

const ORIGIN = 'https://laift.test';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------- DOM mínimo (só o que a Lia, as props e as cenas usam) ----------

function findAll(el, test, out = []) {
  el.children.forEach((child) => {
    if (test(child)) out.push(child);
    findAll(child, test, out);
  });
  return out;
}

const byId = (root, id) => findAll(root, (n) => n.attrs.id === id)[0] || null;
const hasClass = (n, name) => (n.attrs.class || '').split(/\s+/).includes(name);

/** Seletores usados pelas cenas: "#id", "#id > tag.cls", "#id tag.cls", "#id > *" e listas com vírgula. */
function select(root, selector) {
  return selector.split(',').flatMap((raw) => {
    const m = /^\s*#([\w-]+)(?:\s+(>\s*)?(\*|[a-z]+)?(?:\.([\w-]+))?)?\s*$/.exec(raw);
    if (!m) return [];
    const base = byId(root, m[1]);
    if (!base) return [];
    if (!m[3] && !m[4]) return [base];
    const pool = m[2] ? base.children : findAll(base, () => true);
    return pool.filter((n) => (m[3] === '*' || !m[3] || n.tag === m[3]) && (!m[4] || hasClass(n, m[4])));
  });
}

function fakeEl(tag, ns, doc) {
  const el = {
    tag,
    ns,
    ownerDocument: doc,
    attrs: {},
    children: [],
    parentNode: null,
    animations: [],
    listeners: {},
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
    querySelector(selector) { return select(el, selector)[0] || null; },
    querySelectorAll(selector) { return select(el, selector); },
    addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
    fire(type) { (el.listeners[type] || []).forEach((fn) => fn({ type })); },
    animate(frames, options) {
      const anim = { frames, options, cancelled: false, finished: false, finish() { this.finished = true; }, cancel() { this.cancelled = true; } };
      el.animations.push(anim);
      return anim;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 180 }),
  };
  Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return el;
}

function fakeDocument() {
  const doc = {
    baseURI: `${ORIGIN}/`,
    defaultView: { location: { href: `${ORIGIN}/`, origin: ORIGIN } },
    createElement: (tag) => fakeEl(tag, null, doc),
    createElementNS: (ns, tag) => fakeEl(tag, ns, doc),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  doc.head = fakeEl('head', null, doc);
  return doc;
}

// ---------- Arte sintética das props (mesmos ids e pais do contrato de lia-props-art.js) ----------

function piece(id, pai, children = [], extra = {}) {
  return { tag: 'g', attrs: { id: `lia-pv-${id}`, 'data-pai': pai, ...extra }, children };
}
const dot = (cls = 'p') => ({ tag: 'circle', attrs: { class: cls, cx: '1', cy: '1', r: '1' }, children: [] });

const PROPS_ART = {
  viewBox: '0 0 200 300',
  tree: [
    piece('veu', 'svg', [dot('vu')], { 'data-posicao': 'primeiro', opacity: '0' }),
    piece('liquido-b', '#lia-prop-flask', [dot('s')]),
    piece('bolha-1', '#lia-prop-flask', [dot()]),
    piece('bolha-2', '#lia-prop-flask', [dot()]),
    piece('bolha-3', '#lia-prop-flask', [dot()]),
    piece('monitor', 'svg', [{ tag: 'g', attrs: { id: 'lia-pv-ecg' }, children: [dot('ln')] }, { tag: 'g', attrs: { id: 'lia-pv-coracao' }, children: [dot('t')] }]),
    piece('osso', 'svg', [dot()]),
    piece('estrela', 'svg', [dot('s')]),
    piece('folha', 'svg', [dot()]),
    piece('interrogacao', 'svg', [dot()]),
    piece('tela', 'svg', [dot()]),
    piece('cruzados', 'svg', [dot('c')]),
    piece('aviso', 'svg', [dot('al')]),
    piece('costas-cabeca', '#lia-head', [dot('h')]),
    piece('costas-costura', '#lia-coat', [dot()]),
  ],
};

// ---------- ambiente ----------

const saved = new Map();
function setGlobal(name, value) {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const mounted = [];

beforeEach(() => {
  Props.reset();
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mounted.splice(0).forEach((instance) => instance.destroy());
  mock.timers.reset();
  mock.restoreAll();
  for (const [name, desc] of saved) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete globalThis[name];
  }
  saved.clear();
});

/** Monta a Lia com props e cenas ligadas. `ready`: a arte já foi carregada antes do primeiro estado. */
async function mountStaged({ opts, ready = true, scenes = true, props = true, reduced = false } = {}) {
  const doc = fakeDocument();
  setGlobal('document', doc);
  setGlobal('LiaArt', art);
  setGlobal('matchMedia', () => ({ matches: reduced }));
  if (props) setGlobal('LiaProps', Props);
  if (scenes) setGlobal('LiaScenes', Scenes);
  if (ready) {
    setGlobal('LIA_PROPS_ART', PROPS_ART);
    await Props.load(doc);
  }
  const stageEl = fakeEl('section', null, doc);
  const lia = Lia.mount(stageEl, opts);
  mounted.push(lia);
  const host = stageEl.children[0];
  return { doc, lia, host, svg: host.children[0] };
}

const extrasOf = (host) => (host.attrs['data-extras'] || '').split(' ').filter(Boolean);
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

// ---------- aviso (cena 5) ----------

test('warning: com a arte pronta entram véu, braços cruzados e balão; o aria-label é o do estado; a cena toca', async () => {
  const { lia, host, svg } = await mountStaged();
  lia.setState('warning');
  assert.deepEqual(extrasOf(host), ['veu', 'cruzados', 'aviso']);
  assert.equal(host.attrs['aria-label'], 'Lia emitiu um alerta');
  assert.equal(host.attrs['data-emotion'], 'neutral', 'começa neutra, como na cena');
  const veil = byId(svg, 'lia-pv-veu');
  assert.equal(svg.children.indexOf(veil) < svg.children.indexOf(byId(svg, 'lia-body')), true, 'véu atrás do corpo');
  assert.equal(veil.animations[0].frames[1].opacity, 0.35);
  assert.equal(veil.animations[0].finished, false);
  mock.timers.tick(1600);
  assert.equal(host.attrs['data-emotion'], 'worried');
  assert.equal(host.attrs['data-mouth'], 'worried');
});

test('warning: ao sair do estado, as peças somem, data-extras sai e as animações são canceladas', async () => {
  const { lia, host, svg } = await mountStaged();
  lia.setState('warning');
  const cruzados = byId(svg, 'lia-pv-cruzados');
  const anim = cruzados.animations[0];
  lia.setState('idle');
  assert.equal(anim.cancelled, true);
  assert.equal(byId(svg, 'lia-pv-cruzados'), null);
  assert.equal(byId(svg, 'lia-pv-aviso'), null);
  assert.equal('data-extras' in host.attrs, false);
  assert.equal(host.attrs['aria-label'], 'Lia');
  mock.timers.tick(5000);
  assert.equal(host.attrs['data-emotion'], 'neutral', 'passo atrasado da cena não escreve no estado novo');
});

test('warning: um aria-label dado pelo chamador não é trocado pelo da pose', async () => {
  const { lia, host } = await mountStaged();
  lia.setState('warning', { ariaLabel: 'Aviso nível 2' });
  assert.equal(host.attrs['aria-label'], 'Aviso nível 2');
  assert.deepEqual(extrasOf(host), ['veu', 'cruzados', 'aviso']);
});

test('warning com a arte ainda carregando: começa na Lia base e a pose entra quando a arte chega', async () => {
  const { doc, lia, host, svg } = await mountStaged({ ready: false });
  lia.setState('warning');
  assert.deepEqual(extrasOf(host), []);
  assert.equal(host.attrs['aria-label'], 'Lia emitiu um alerta');
  const script = doc.head.children.find((c) => c.tag === 'script');
  assert.ok(script, 'o pedido da arte só sai porque um contexto precisou dela');
  assert.equal(script.src, `${ORIGIN}/modulos/shared/lia/lia-props-art.js`);
  setGlobal('LIA_PROPS_ART', PROPS_ART);
  script.fire('load');
  await flush();
  assert.deepEqual(extrasOf(host), ['veu', 'cruzados', 'aviso']);
  assert.ok(byId(svg, 'lia-pv-aviso'));
});

test('arte que chega depois de outra mudança de estado não é aplicada', async () => {
  const { doc, lia, host, svg } = await mountStaged({ ready: false });
  lia.setState('warning');
  lia.setState('idle');
  setGlobal('LIA_PROPS_ART', PROPS_ART);
  doc.head.children.find((c) => c.tag === 'script').fire('load');
  await flush();
  assert.deepEqual(extrasOf(host), []);
  assert.equal(byId(svg, 'lia-pv-aviso'), null);
});

test('arte que chega depois do destroy não mexe em nada', async () => {
  const { doc, lia, host } = await mountStaged({ ready: false });
  lia.setState('warning');
  lia.destroy();
  setGlobal('LIA_PROPS_ART', PROPS_ART);
  doc.head.children.find((c) => c.tag === 'script').fire('load');
  await flush();
  assert.deepEqual(extrasOf(host), []);
});

test('falha ao carregar a arte: Lia base, sem erro, sem peças e sem novo pedido a cada estado', async () => {
  const { doc, lia, host } = await mountStaged({ ready: false });
  lia.setState('warning');
  doc.head.children.find((c) => c.tag === 'script').fire('error');
  await flush();
  assert.deepEqual(extrasOf(host), []);
  assert.equal(host.attrs['data-emotion'], 'worried', 'a cena não roda sem as peças: vale direto o rosto final do contexto');
  lia.setState('idle');
  lia.setState('warning');
  assert.equal(doc.head.children.filter((c) => c.tag === 'script').length, 1);
});

test('sem LiaProps na página, a Lia segue base e sem lançar', async () => {
  const { lia, host } = await mountStaged({ props: false, ready: false });
  assert.doesNotThrow(() => { lia.setState('warning'); lia.suspend(); lia.redeem(); });
  assert.deepEqual(extrasOf(host), []);
});

// ---------- suspensa e redenção (cena 6) ----------

test('suspended: as costas entram (cabeça e costura) e o rótulo diz "de costas"', async () => {
  const { lia, host, svg } = await mountStaged();
  lia.suspend();
  assert.deepEqual(extrasOf(host), ['costas-cabeca', 'costas-costura']);
  assert.equal(byId(svg, 'lia-pv-costas-cabeca').parentNode.attrs.id, 'lia-head');
  assert.equal(byId(svg, 'lia-pv-costas-costura').parentNode.attrs.id, 'lia-coat');
  assert.equal(host.attrs['data-state'], 'suspended');
  assert.equal(host.attrs['aria-label'], 'Lia está suspensa');
});

test('redeem animado: gira no host, troca costas por frente no meio e termina feliz com corações', async () => {
  const { lia, host } = await mountStaged();
  lia.suspend();
  lia.redeem();
  assert.equal(host.attrs['data-state'], 'suspended', 'frame 0: ainda de costas e esmaecida');
  assert.deepEqual(extrasOf(host), ['costas-cabeca', 'costas-costura']);
  assert.equal(host.animations.length, 1);
  assert.equal(host.animations[0].options.duration, 2160);
  assert.equal(host.attrs['data-arm-right'], 'idle');
  mock.timers.tick(1680);
  assert.equal(host.attrs['data-state'], 'idle');
  assert.deepEqual(extrasOf(host), [], 'costas saem na troca');
  mock.timers.tick(480);
  assert.equal(host.attrs['data-emotion'], 'happy');
  assert.equal(host.attrs['data-scene'], 'glow heart');
  assert.equal(host.attrs['aria-label'], 'Lia', 'o rótulo não muda no meio da cena: vale o de repouso');
});

test('redeem sem a arte pronta: o que valia antes (braço direito em aceno), já feliz, sem cena', async () => {
  const { lia, host } = await mountStaged({ ready: false });
  lia.suspend();
  lia.redeem();
  assert.equal(host.attrs['data-arm-right'], 'wave');
  assert.equal(host.attrs['data-emotion'], 'happy');
  assert.equal(host.animations.length, 0);
  assert.equal(host.attrs['data-state'], 'idle');
});

test('redeem sob movimento reduzido: pose final parada (de frente, feliz, corações), sem costas e sem giro', async () => {
  const { lia, host } = await mountStaged({ reduced: true });
  lia.suspend();
  assert.deepEqual(extrasOf(host), ['costas-cabeca', 'costas-costura'], 'suspensa também é pose parada');
  lia.redeem();
  assert.deepEqual(extrasOf(host), []);
  assert.equal(host.attrs['data-state'], 'idle');
  assert.equal(host.attrs['data-emotion'], 'happy');
  assert.equal(host.attrs['data-scene'], 'glow heart');
  assert.equal(host.attrs['data-arm-right'], 'idle');
  assert.ok(host.animations.every((a) => a.finished), 'nenhuma animação em curso');
});

// ---------- movimento reduzido nas demais cenas ----------

test('warning sob movimento reduzido: peças na tela, véu já em 35% e rosto preocupado, sem relógio', async () => {
  const { lia, host, svg } = await mountStaged({ reduced: true });
  lia.setState('warning');
  assert.deepEqual(extrasOf(host), ['veu', 'cruzados', 'aviso']);
  assert.equal(byId(svg, 'lia-pv-veu').animations[0].finished, true);
  assert.equal(host.attrs['data-emotion'], 'worried');
  assert.equal(host.attrs['data-mouth'], 'worried');
});

// ---------- confusa (cena 7) ----------

test('confused: cabeça balança por rotate e ombros sobem por translate, mesmo sem LiaProps', async () => {
  const { lia, host, svg } = await mountStaged({ props: false, ready: false });
  lia.setState('confused');
  assert.equal(host.attrs['data-emotion'], 'curious');
  const head = byId(svg, 'lia-head');
  assert.equal(head.animations.length, 1);
  assert.equal(head.animations[0].frames[1].rotate, '-9deg');
  const coat = byId(svg, 'lia-coat');
  assert.equal(coat.animations[0].frames[1].translate, '0px -2.5px');
  assert.equal(byId(svg, 'lia-limbs').animations.length, 1);
  lia.setState('idle');
  assert.equal(head.animations[0].cancelled, true);
});

// ---------- módulos (cenas 1 a 4) ----------

test('módulos: cada contexto traz as suas peças (no pai certo) e toca a cena; a arte só é pedida quando um módulo a pede', async () => {
  const { doc, lia, svg, host } = await mountStaged({ ready: false });
  assert.equal(doc.head.children.length, 0, 'montar a Lia não carrega a arte');
  lia.react('events');
  assert.equal(doc.head.children.length, 0, 'módulo sem peças não carrega a arte');
  lia.react('lab');
  assert.equal(doc.head.children.filter((c) => c.tag === 'script').length, 1);
  setGlobal('LIA_PROPS_ART', PROPS_ART);
  doc.head.children[0].fire('load');
  await flush();
  assert.deepEqual(extrasOf(host), ['liquido-b', 'bolha-1', 'bolha-2', 'bolha-3']);
  assert.equal(byId(svg, 'lia-pv-bolha-1').parentNode.attrs.id, 'lia-prop-flask');
  assert.equal(byId(svg, 'lia-prop-flask').animations.length >= 1, true);
  lia.react('clinic');
  assert.deepEqual(extrasOf(host), ['monitor']);
  assert.equal(byId(svg, 'lia-pv-bolha-1'), null);
  lia.react('atlas');
  assert.deepEqual(extrasOf(host), ['osso', 'estrela']);
  lia.react('learn');
  assert.deepEqual(extrasOf(host), ['folha', 'interrogacao', 'tela']);
  lia.react('events');
  assert.deepEqual(extrasOf(host), []);
});

test('módulo: repetir o mesmo contexto reaproveita as peças e recomeça a cena', async () => {
  const { lia, svg, host } = await mountStaged();
  lia.react('atlas');
  const bone = byId(svg, 'lia-pv-osso');
  lia.react('atlas');
  assert.equal(byId(svg, 'lia-pv-osso'), bone);
  assert.equal(bone.animations.length, 2);
  assert.equal(bone.animations[0].cancelled, true);
  assert.equal(bone.animations[1].cancelled, false);
  assert.deepEqual(extrasOf(host), ['osso', 'estrela']);
});

// ---------- bolha fechada (recorte da cabeça) ----------

test('a Lia da bolha (crop head) nunca recebe peças nem cenas', async () => {
  const { lia, host, svg } = await mountStaged({ opts: { crop: 'head' } });
  lia.setState('warning');
  lia.suspend();
  lia.redeem();
  lia.setState('confused');
  lia.react('lab');
  assert.deepEqual(extrasOf(host), []);
  assert.equal(byId(svg, 'lia-pv-aviso'), null);
  assert.equal(host.animations.length, 0);
  assert.equal(byId(svg, 'lia-head').animations.length, 0);
  assert.equal(svg.attrs.viewBox === '0 0 200 300', false);
});

// ---------- namespace ----------

test('as peças nascem com o namespace SVG', async () => {
  const { lia, svg } = await mountStaged();
  lia.setState('warning');
  assert.equal(byId(svg, 'lia-pv-aviso').ns, SVG_NS);
  assert.equal(byId(svg, 'lia-pv-aviso').children[0].ns, SVG_NS);
});
