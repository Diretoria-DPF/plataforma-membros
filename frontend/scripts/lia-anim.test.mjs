/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia - animacoes WAAPI (modulos/shared/lia/lia-anim.js). Fakes de DOM, sem navegador.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const LiaAnim = require('../modulos/shared/lia/lia-anim.js');

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

// ---------- fakes ----------
function fakeAnimation(frames, options) {
  return { frames, options, cancelled: false, finished: Promise.resolve(), cancel() { this.cancelled = true; } };
}

function fakeElement(id, { hidden = false, children = [] } = {}) {
  return {
    id,
    hidden,
    children,
    query: {},
    style: { display: '' },
    animations: [],
    ownerDocument: null,
    animate(frames, options) {
      const anim = fakeAnimation(frames, options);
      this.animations.push(anim);
      return anim;
    },
    querySelector(sel) { return this.query[sel] || null; },
  };
}

function fakeWindow({ reduced = false, coarse = false } = {}) {
  const frames = [];
  return {
    matchMedia(query) {
      const matches = (query.includes('reduce') && reduced) || (query.includes('coarse') && coarse);
      return { matches };
    },
    getComputedStyle(el) {
      return { display: el.style.display || (el.hidden ? 'none' : 'inline') };
    },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    pending: () => frames.length,
    flushFrames() { while (frames.length) frames.shift()(); },
  };
}

function fakeDocument(win) {
  const listeners = new Map();
  return {
    defaultView: win,
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); },
    listenerCount: (type) => (listeners.get(type) || []).length,
    dispatch(type, ev) { (listeners.get(type) || []).forEach((fn) => fn(ev)); },
  };
}

const EYES = ['lia-eyes-neutral', 'lia-eyes-curious', 'lia-eyes-happy', 'lia-eyes-worried', 'lia-eyes-focused', 'lia-eyes-sad'];
const ARMS = [
  'lia-arm-right-idle', 'lia-arm-right-wave', 'lia-arm-right-point', 'lia-arm-right-chin', 'lia-arm-right-heart',
  'lia-arm-left-idle', 'lia-arm-left-wave', 'lia-arm-left-point', 'lia-arm-left-chin', 'lia-arm-left-heart',
];
const SCENE = ['lia-scene-heart', 'lia-scene-sparkles', 'lia-scene-bubble'];
const ALL_IDS = [...EYES, ...ARMS, ...SCENE];
const DEFAULT_VISIBLE = ['lia-eyes-neutral', 'lia-arm-right-idle'];

function makeScene({ visible = DEFAULT_VISIBLE, known = ALL_IDS, reduced = false, coarse = false, dots = true } = {}) {
  const win = fakeWindow({ reduced, coarse });
  const doc = fakeDocument(win);
  const els = {};
  known.forEach((id) => {
    els[id] = fakeElement(id, { hidden: !visible.includes(id) });
    els[id].ownerDocument = doc;
  });
  let dotEls = [];
  if (els['lia-scene-bubble'] && dots) {
    dotEls = [fakeElement(null), fakeElement(null), fakeElement(null)];
    els['lia-scene-bubble'].query['g.f'] = fakeElement(null, { children: dotEls });
  }
  const host = {
    ownerDocument: doc,
    querySelector: (sel) => (sel.startsWith('#') ? els[sel.slice(1)] || null : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 180 }),
  };
  return { host, win, doc, els, dotEls };
}

// ---------- asserts de movimento ----------
const ALLOWED_KEYS = new Set(['transform', 'opacity', 'offset', 'easing']);
function assertMotionOnly(anim) {
  for (const frame of anim.frames) {
    for (const key of Object.keys(frame)) {
      assert.ok(ALLOWED_KEYS.has(key), `propriedade proibida nos keyframes: ${key}`);
    }
    if (frame.transform !== undefined) {
      for (const part of frame.transform.split(/\)\s*/).filter(Boolean)) {
        assert.match(part, /^(translate|rotate|scale)/, `transform inesperado: ${frame.transform}`);
      }
    }
  }
}
const parseShift = (value) => value.split(' ').map((v) => parseFloat(v));
// Avanca o relogio falso em passos de 1 s: timers recriados dentro de um tick so disparam no tick seguinte.
const advance = (ms) => { for (let i = 0; i < ms / 1000; i += 1) mock.timers.tick(1000); };
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

// ---------- nextBlinkDelay ----------
test('nextBlinkDelay: rand 0 devolve o minimo de 4000 ms', () => {
  assert.equal(LiaAnim.nextBlinkDelay(() => 0), 4000);
});

test('nextBlinkDelay: rand perto de 1 nunca passa de 7999 ms', () => {
  assert.equal(LiaAnim.nextBlinkDelay(() => 1), 7999);
  assert.equal(LiaAnim.nextBlinkDelay(() => 0.999999999), 7999);
});

test('nextBlinkDelay: qualquer valor de rand cai em [4000, 8000)', () => {
  for (let r = 0; r <= 1; r += 0.01) {
    const delay = LiaAnim.nextBlinkDelay(() => r);
    assert.ok(delay >= 4000 && delay < 8000, `fora do intervalo: ${delay}`);
  }
});

test('nextBlinkDelay: rand invalido usa o meio do intervalo (6000 ms)', () => {
  assert.equal(LiaAnim.nextBlinkDelay(() => NaN), 6000);
  assert.equal(LiaAnim.nextBlinkDelay(undefined), 6000);
});

// ---------- eyeOffset ----------
const RECT = { left: 0, top: 0, width: 120, height: 180 };

test('eyeOffset: ponteiro no centro nao desloca', () => {
  assert.deepEqual(LiaAnim.eyeOffset(RECT, { x: 60, y: 90 }), { x: 0, y: 0 });
});

test('eyeOffset: ponteiro longe chega exatamente a 3 px', () => {
  const o = LiaAnim.eyeOffset(RECT, { x: 5000, y: 90 });
  assert.ok(Math.abs(Math.hypot(o.x, o.y) - 3) < 1e-9);
});

test('eyeOffset: nunca passa de 3 px em 500 pontos aleatorios', () => {
  const rand = lcg(42);
  for (let i = 0; i < 500; i += 1) {
    const o = LiaAnim.eyeOffset(RECT, { x: (rand() - 0.5) * 4000, y: (rand() - 0.5) * 4000 });
    assert.ok(Math.hypot(o.x, o.y) <= 3 + 1e-9, `passou de 3 px: ${Math.hypot(o.x, o.y)}`);
  }
});

test('eyeOffset: respeita o max customizado', () => {
  const o = LiaAnim.eyeOffset(RECT, { x: 5000, y: 90 }, 1);
  assert.ok(Math.abs(Math.hypot(o.x, o.y) - 1) < 1e-9);
});

test('eyeOffset: segue a direcao do ponteiro', () => {
  const right = LiaAnim.eyeOffset(RECT, { x: 900, y: 90 });
  assert.ok(right.x > 0 && right.y === 0);
  const up = LiaAnim.eyeOffset(RECT, { x: 60, y: -900 });
  assert.ok(up.y < 0 && up.x === 0);
});

test('eyeOffset: entrada invalida devolve zero', () => {
  assert.deepEqual(LiaAnim.eyeOffset(null, { x: 1, y: 1 }), { x: 0, y: 0 });
  assert.deepEqual(LiaAnim.eyeOffset(RECT, { x: NaN, y: 1 }), { x: 0, y: 0 });
  assert.deepEqual(LiaAnim.eyeOffset(RECT, { x: 1, y: 1 }, 0), { x: 0, y: 0 });
});

// ---------- piscada ----------
test('piscada: primeira em 4000 ms e nao antes', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const { host, els } = makeScene();
  const stop = LiaAnim.startBlinkLoop(host);
  mock.timers.tick(3999);
  assert.equal(els['lia-eyes-neutral'].animations.length, 0);
  mock.timers.tick(1);
  assert.equal(els['lia-eyes-neutral'].animations.length, 1);
  stop();
});

test('piscada: anima so os olhos visiveis, em 120 ms e so com transform', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const { host, els } = makeScene({ visible: ['lia-eyes-neutral'] });
  const stop = LiaAnim.startBlinkLoop(host);
  mock.timers.tick(4000);
  assert.equal(els['lia-eyes-curious'].animations.length, 0);
  const anim = els['lia-eyes-neutral'].animations[0];
  assert.equal(anim.options.duration, 120);
  assertMotionOnly(anim);
  stop();
});

test('piscada: continua em loop ate o stop', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const { host, els } = makeScene();
  const stop = LiaAnim.startBlinkLoop(host);
  advance(24000);
  assert.equal(els['lia-eyes-neutral'].animations.length, 6);
  stop();
});

test('piscada: stop cancela a animacao pendente e impede novas', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const { host, els } = makeScene();
  const stop = LiaAnim.startBlinkLoop(host);
  advance(4000);
  const anim = els['lia-eyes-neutral'].animations[0];
  stop();
  assert.equal(anim.cancelled, true);
  advance(40000);
  assert.equal(els['lia-eyes-neutral'].animations.length, 1);
});

test('piscada: stop e idempotente', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { host } = makeScene();
  const stop = LiaAnim.startBlinkLoop(host);
  stop();
  assert.doesNotThrow(() => stop());
});

test('piscada: reduced-motion nao inicia o loop', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const { host, els } = makeScene({ reduced: true });
  const stop = LiaAnim.startBlinkLoop(host);
  mock.timers.tick(20000);
  assert.equal(els['lia-eyes-neutral'].animations.length, 0);
  assert.equal(typeof stop, 'function');
  stop();
});

test('piscada: host sem grupos nao quebra', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const { host } = makeScene({ known: [] });
  const stop = LiaAnim.startBlinkLoop(host);
  assert.doesNotThrow(() => mock.timers.tick(8000));
  stop();
});

// ---------- olhar ----------
test('olhar: move os olhos na direcao do cursor com no maximo 3 px', () => {
  const { host, win, doc, els } = makeScene();
  const stop = LiaAnim.startEyeTracking(host, doc);
  doc.dispatch('mousemove', { clientX: 1000, clientY: 90 });
  win.flushFrames();
  const [x, y] = parseShift(els['lia-eyes-neutral'].style.translate);
  assert.ok(Math.abs(x - 3) < 1e-9 && Math.abs(y) < 1e-9, `deslocamento: ${x} ${y}`);
  assert.equal(els['lia-eyes-curious'].style.translate, els['lia-eyes-neutral'].style.translate);
  stop();
});

test('olhar: varios mousemove viram um unico frame com o ultimo ponteiro', () => {
  const { host, win, doc, els } = makeScene();
  const stop = LiaAnim.startEyeTracking(host, doc);
  doc.dispatch('mousemove', { clientX: 0, clientY: 0 });
  doc.dispatch('mousemove', { clientX: 10, clientY: 10 });
  doc.dispatch('mousemove', { clientX: 1000, clientY: 90 });
  assert.equal(win.pending(), 1);
  win.flushFrames();
  assert.equal(parseShift(els['lia-eyes-neutral'].style.translate)[0].toFixed(3), '3.000');
  stop();
});

test('olhar: pointer coarse (toque) nao registra listener', () => {
  const { host, doc } = makeScene({ coarse: true });
  const stop = LiaAnim.startEyeTracking(host, doc);
  assert.equal(doc.listenerCount('mousemove'), 0);
  assert.equal(typeof stop, 'function');
  stop();
});

test('olhar: reduced-motion nao registra listener', () => {
  const { host, doc } = makeScene({ reduced: true });
  const stop = LiaAnim.startEyeTracking(host, doc);
  assert.equal(doc.listenerCount('mousemove'), 0);
  stop();
});

test('olhar: stop remove o listener e zera o deslocamento', () => {
  const { host, win, doc, els } = makeScene();
  const stop = LiaAnim.startEyeTracking(host, doc);
  doc.dispatch('mousemove', { clientX: 1000, clientY: 90 });
  win.flushFrames();
  stop();
  assert.equal(doc.listenerCount('mousemove'), 0);
  assert.equal(els['lia-eyes-neutral'].style.translate, '0px 0px');
});

test('olhar: host sem olhos nao registra listener', () => {
  const { host, doc } = makeScene({ known: SCENE });
  const stop = LiaAnim.startEyeTracking(host, doc);
  assert.equal(doc.listenerCount('mousemove'), 0);
  stop();
});

test('olhar: frame já agendado que chega depois do stop não mexe mais nos olhos', () => {
  const { host, win, doc, els } = makeScene();
  win.cancelAnimationFrame = () => {}; // navegador que ignora o cancelamento: o guarda interno precisa segurar
  const stop = LiaAnim.startEyeTracking(host, doc);
  doc.dispatch('mousemove', { clientX: 1000, clientY: 90 });
  stop();
  win.flushFrames();
  assert.equal(els['lia-eyes-neutral'].style.translate, '0px 0px');
});

// ---------- aceno ----------
test('aceno: anima o braco visivel por 700 ms, so com transform, e resolve', async () => {
  const { host, els } = makeScene({ visible: ['lia-arm-right-idle'] });
  const done = LiaAnim.wave(host);
  assert.ok(done instanceof Promise);
  const arm = els['lia-arm-right-idle'];
  assert.equal(arm.animations.length, 1);
  assert.equal(arm.animations[0].options.duration, 700);
  assertMotionOnly(arm.animations[0]);
  await done;
});

test('aceno: braco direito abre para fora (rotacao negativa) e o esquerdo no sentido oposto', async () => {
  const right = makeScene({ visible: ['lia-arm-right-idle'] });
  await LiaAnim.wave(right.host);
  assert.equal(right.els['lia-arm-right-idle'].animations[0].frames[1].transform, 'rotate(-14deg)');
  const left = makeScene({ visible: ['lia-arm-left-idle'] });
  await LiaAnim.wave(left.host);
  assert.equal(left.els['lia-arm-left-idle'].animations[0].frames[1].transform, 'rotate(14deg)');
});

test('aceno: reduced-motion resolve sem animar', async () => {
  const { host, els } = makeScene({ visible: ['lia-arm-right-idle'], reduced: true });
  await LiaAnim.wave(host);
  assert.equal(els['lia-arm-right-idle'].animations.length, 0);
});

test('aceno: host sem bracos resolve sem erro', async () => {
  const { host } = makeScene({ known: SCENE });
  await assert.doesNotReject(LiaAnim.wave(host));
});

// ---------- coracao ----------
test('coracao: sobe e esmaece em ~1,2 s com sparkles e restaura o display', async () => {
  const { host, els } = makeScene({ visible: ['lia-scene-sparkles'] });
  const heart = els['lia-scene-heart'];
  const pending = LiaAnim.heartBurst(host);
  assert.equal(heart.style.display, 'inline');
  await pending;
  assert.equal(heart.animations[0].options.duration, 1200);
  assert.equal(heart.animations[0].frames.length, 3);
  assert.equal(els['lia-scene-sparkles'].animations[0].options.delay, 280);
  assertMotionOnly(heart.animations[0]);
  assertMotionOnly(els['lia-scene-sparkles'].animations[0]);
  assert.equal(heart.style.display, '');
  assert.equal(heart.hidden, true);
});

test('coracao: reduced-motion resolve sem animar', async () => {
  const { host, els } = makeScene({ reduced: true });
  await LiaAnim.heartBurst(host);
  assert.equal(els['lia-scene-heart'].animations.length, 0);
});

test('coracao: host sem grupos resolve sem erro', async () => {
  const { host } = makeScene({ known: EYES });
  await assert.doesNotReject(LiaAnim.heartBurst(host));
});

// ---------- pensando ----------
test('pensando: tres pontinhos com atraso 0/180/360 ms em loop infinito', () => {
  const { host, dotEls } = makeScene({ visible: ['lia-scene-bubble'] });
  const stop = LiaAnim.thinkingDots(host);
  const delays = dotEls.map((dot) => dot.animations[0].options.delay);
  assert.deepEqual(delays, [0, 180, 360]);
  dotEls.forEach((dot) => {
    assert.equal(dot.animations.length, 1);
    assert.equal(dot.animations[0].options.iterations, Infinity);
    assert.equal(dot.animations[0].options.duration, 480);
    assertMotionOnly(dot.animations[0]);
  });
  stop();
});

test('pensando: stop cancela os pontinhos e restaura o balao', () => {
  const { host, els, dotEls } = makeScene({ visible: [] });
  const bubble = els['lia-scene-bubble'];
  const stop = LiaAnim.thinkingDots(host);
  assert.equal(bubble.style.display, 'inline');
  stop();
  dotEls.forEach((dot) => assert.equal(dot.animations[0].cancelled, true));
  assert.equal(bubble.style.display, '');
  assert.doesNotThrow(() => stop());
});

test('pensando: sem balao devolve stop vazio', () => {
  const { host } = makeScene({ known: EYES });
  const stop = LiaAnim.thinkingDots(host);
  assert.equal(typeof stop, 'function');
  stop();
});

test('pensando: reduced-motion nao anima', () => {
  const { host, dotEls } = makeScene({ reduced: true });
  const stop = LiaAnim.thinkingDots(host);
  assert.equal(dotEls[0].animations.length, 0);
  stop();
});

// ---------- destroy, keyframes e tokens ----------
test('destroy cancela tudo que estiver pendente no host', () => {
  const { host, dotEls } = makeScene();
  LiaAnim.thinkingDots(host);
  LiaAnim.destroy(host);
  dotEls.forEach((dot) => assert.equal(dot.animations[0].cancelled, true));
});

test('keyframes: todas as animacoes geradas usam so transform e opacity', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(Math, 'random', () => 0);
  const visible = ['lia-eyes-neutral', 'lia-arm-right-idle', 'lia-scene-bubble', 'lia-scene-heart', 'lia-scene-sparkles'];
  const { host, els, dotEls } = makeScene({ visible });
  const stopBlink = LiaAnim.startBlinkLoop(host);
  advance(4000);
  await LiaAnim.wave(host);
  await LiaAnim.heartBurst(host);
  const stopDots = LiaAnim.thinkingDots(host);
  const all = [...Object.values(els), ...dotEls].flatMap((el) => el.animations);
  assert.ok(all.length >= 6, `poucas animacoes: ${all.length}`);
  all.forEach(assertMotionOnly);
  stopBlink();
  stopDots();
});

test('tokens: espelham modulos/shared/laift-tokens.css', () => {
  const css = fs.readFileSync(path.join(root, 'modulos/shared/laift-tokens.css'), 'utf8');
  const cssValue = (name) => {
    const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
    return match ? match[1].trim() : null;
  };
  const t = LiaAnim.tokens;
  assert.equal(`${t.DUR_FAST}ms`, cssValue('--dur-fast'));
  assert.equal(`${t.DUR_BASE}ms`, cssValue('--dur-base'));
  assert.equal(`${t.DUR_SLOW}ms`, cssValue('--dur-slow'));
  assert.equal(`${t.DUR_LAZY}ms`, cssValue('--dur-lazy'));
  assert.equal(t.EASE_OUT, cssValue('--ease-out'));
  assert.equal(t.EASE_IN_OUT, cssValue('--ease-in-out'));
  assert.equal(t.EASE_SPRING, cssValue('--ease-spring'));
});

test('interface: expoe as funcoes esperadas', () => {
  ['startBlinkLoop', 'startEyeTracking', 'wave', 'heartBurst', 'thinkingDots', 'nextBlinkDelay', 'eyeOffset', 'destroy']
    .forEach((name) => assert.equal(typeof LiaAnim[name], 'function', name));
});
