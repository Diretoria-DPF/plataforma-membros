/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cenas de movimento das ondas 2-4 (frontend/modulos/shared/lia/lia-scenes.js): linhas do tempo aprovadas em
// preview-ondas.js, só transform/opacity (e rotate/translate individuais), tokens de duração e curva,
// pose final sob movimento reduzido e parada limpa.
import { test, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Scenes = require('../modulos/shared/lia/lia-scenes.js');
const LiaAnim = require('../modulos/shared/lia/lia-anim.js');
const States = require('../modulos/shared/lia/lia-states.js');
const T = LiaAnim.tokens;

const ALLOWED_KEYS = new Set(['transform', 'opacity', 'rotate', 'translate', 'offset', 'easing']);
const BACK = ['costas-cabeca', 'costas-costura'];

// ---------- DOM mínimo ----------

function fakeAnimation(frames, options) {
  return {
    frames,
    options,
    finished: false,
    cancelled: false,
    finish() { this.finished = true; },
    cancel() { this.cancelled = true; },
  };
}

function fakeEl() {
  return {
    animations: [],
    attrs: {},
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    animate(frames, options) {
      const anim = fakeAnimation(frames, options);
      this.animations.push(anim);
      return anim;
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    removeAttribute(name) { delete this.attrs[name]; },
  };
}

/** Palco: host + svg cujo querySelectorAll responde só aos seletores que a cena usa. */
function stage(def, { reduced = false, missing = [] } = {}) {
  const host = fakeEl();
  const nodes = {};
  def.anima.forEach((part) => {
    if (part.sel !== Scenes.HOST && !missing.includes(part.sel) && !nodes[part.sel]) nodes[part.sel] = [fakeEl()];
  });
  def.origins.forEach(([sel]) => {
    if (!missing.includes(sel) && !nodes[sel]) nodes[sel] = [fakeEl()];
  });
  const svg = { querySelectorAll: (sel) => nodes[sel] || [] };
  const detached = [];
  const env = { host, svg, reduced, detach: (names) => detached.push(...names) };
  return { host, nodes, env, detached };
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

const scene = (name) => Scenes.scenes[name];
const allFrames = (def) => def.anima.flatMap((part) => part.frames);

// ---------- Definições ----------

test('as sete cenas aprovadas existem: 4 de módulo, aviso, redenção e confusa', () => {
  assert.deepEqual([...Scenes.names].sort(), ['atlas', 'clinic', 'confused', 'lab', 'learn', 'redeem', 'warning']);
});

test('durações batem com as linhas do tempo de preview-ondas.js (em ms)', () => {
  const expected = { lab: 2960, clinic: 4400, atlas: 3160, learn: 2960, warning: 1680, redeem: 2160, confused: 1600 };
  Object.entries(expected).forEach(([name, ms]) => assert.equal(Scenes.durationOf(name), ms, name));
  assert.equal(Scenes.durationOf('nope'), 0);
});

test('só transform e opacity, mais rotate/translate individuais (desvio aprovado) e offset/easing', () => {
  Scenes.names.forEach((name) => {
    allFrames(scene(name)).forEach((frame) => {
      Object.keys(frame).forEach((key) => assert.ok(ALLOWED_KEYS.has(key), `${name}: ${key}`));
    });
  });
});

test('rotate e translate individuais só aparecem em confusa (cabeça e ombros) e no giro do esqueleto', () => {
  const users = Scenes.names.filter((name) => allFrames(scene(name)).some((f) => 'rotate' in f || 'translate' in f)).sort();
  assert.deepEqual(users, ['atlas', 'confused']);
  const confused = scene('confused');
  const head = confused.anima.find((part) => part.sel === '#lia-head');
  assert.equal(Math.max(...head.frames.map((f) => Math.abs(parseFloat(f.rotate)))), 9, 'cabeça balança até 9 graus');
  const shoulders = confused.anima.find((part) => part.sel === '#lia-coat, #lia-limbs');
  assert.ok(shoulders.frames.some((f) => f.translate === '0px -2.5px'), 'ombros sobem 2,5 unidades');
});

test('toda curva vem dos tokens (ou é linear) e toda duração é múltipla de 20 ms', () => {
  const curves = new Set([T.EASE_OUT, T.EASE_IN_OUT, T.EASE_SPRING, 'linear']);
  Scenes.names.forEach((name) => {
    scene(name).anima.forEach((part) => {
      assert.ok(curves.has(part.ease), `${name} ${part.sel}: ${part.ease}`);
      assert.equal(part.dur % 20, 0, `${name} ${part.sel}: dur ${part.dur}`);
      assert.equal(part.at % 20, 0, `${name} ${part.sel}: at ${part.at}`);
    });
  });
});

test('laboratório: líquido sobe, troca de cor, frasco chacoalha e as três bolhas sobem em sequência', () => {
  const lab = scene('lab');
  const mix = 2 * T.DUR_BASE + T.DUR_LAZY;
  const bySel = (sel) => lab.anima.filter((part) => part.sel === sel);
  assert.equal(bySel('#lia-prop-flask > path.a')[0].at, 2 * T.DUR_BASE);
  assert.deepEqual(bySel('#lia-prop-flask > path.a')[0].frames, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }]);
  assert.equal(bySel('#lia-pv-liquido-b')[0].at, mix);
  assert.equal(bySel('#lia-prop-flask')[0].dur, 2 * T.DUR_LAZY);
  assert.deepEqual([1, 2, 3].map((n) => bySel(`#lia-pv-bolha-${n}`)[0].at), [mix, mix + T.DUR_BASE, mix + 2 * T.DUR_BASE]);
  assert.deepEqual(lab.steps.at(-1).attrs, { 'data-emotion': 'happy', 'data-mouth': 'smile', 'data-scene': 'sparkles' });
});

test('clínica: estetoscópio aproxima, monitor com ECG por scaleX e coração, depois o termômetro', () => {
  const clinic = scene('clinic');
  const part = (sel) => clinic.anima.find((p) => p.sel === sel);
  assert.equal(part('#lia-pv-monitor').at, 2 * T.DUR_LAZY);
  assert.deepEqual(part('#lia-pv-ecg').frames, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }]);
  assert.equal(part('#lia-pv-ecg').dur, 1.5 * T.DUR_LAZY);
  assert.equal(part('#lia-prop-thermometer path.g').at, 4 * T.DUR_LAZY);
  assert.deepEqual(clinic.steps.map((s) => [s.at, s.attrs['data-prop']]), [[2 * T.DUR_LAZY, 'none'], [4 * T.DUR_LAZY, 'thermometer']]);
  assert.equal(clinic.steps[0].attrs['data-arm-right'], 'point');
  assert.deepEqual(clinic.origins.find(([sel]) => sel === '#lia-pv-ecg'), ['#lia-pv-ecg', '0% 50%'], 'o ECG cresce da esquerda para a direita');
});

test('atlas: esqueleto gira 360 graus em 1,6 s, o osso encaixa com ease-spring e a estrela marca a conexão', () => {
  const atlas = scene('atlas');
  const spin = atlas.anima.find((p) => p.sel === '#lia-prop-skeleton');
  assert.deepEqual(spin.frames, [{ rotate: '0deg' }, { rotate: '360deg' }]);
  assert.equal(spin.dur, 1600);
  const bone = atlas.anima.find((p) => p.sel === '#lia-pv-osso');
  assert.equal(bone.ease, T.EASE_SPRING);
  assert.equal(bone.at, T.DUR_BASE + 2 * T.DUR_LAZY);
  const star = atlas.anima.find((p) => p.sel === '#lia-pv-estrela');
  assert.equal(star.at, bone.at + T.DUR_LAZY);
  assert.equal(star.frames[1].transform, 'scale(1.3)');
});

test('aprender: olhar acompanha a linha, página vira (1, 0, -1), "?" sobe e a tela aparece ao apontar', () => {
  const learn = scene('learn');
  const part = (sel) => learn.anima.find((p) => p.sel === sel);
  assert.deepEqual(part('#lia-pv-folha').frames.map((f) => f.transform), ['scaleX(1)', 'scaleX(0)', 'scaleX(-1)']);
  assert.equal(part('#lia-pv-interrogacao').at, 2 * T.DUR_LAZY);
  assert.equal(part('#lia-pv-tela').at, 3 * T.DUR_LAZY);
  assert.deepEqual(learn.steps.map((s) => s.attrs), [{ 'data-arm-right': 'point' }, { 'data-mouth': 'smile' }]);
  assert.deepEqual(learn.from, { 'data-emotion': 'focused', 'data-mouth': 'flat' }, 'os olhos de leitura são os de #lia-eyes-focused');
});

test('aviso: véu até 35%, braços cruzados entram, balão pula (0,4 a 1,08 a 1) e a Lia fica preocupada', () => {
  const warning = scene('warning');
  const veil = warning.anima.find((p) => p.sel === '#lia-pv-veu');
  assert.deepEqual(veil.frames, [{ opacity: 0 }, { opacity: 0.35 }]);
  const pop = warning.anima.find((p) => p.sel === '#lia-pv-aviso');
  assert.deepEqual(pop.frames.map((f) => f.transform), ['scale(0.4)', 'scale(1.08)', 'scale(1)']);
  assert.equal(pop.at, 1.5 * T.DUR_LAZY);
  assert.deepEqual(warning.from, { 'data-emotion': 'neutral', 'data-mouth': 'neutral' });
  assert.deepEqual(warning.steps[0].attrs, { 'data-emotion': 'worried', 'data-mouth': 'worried' });
  assert.equal(warning.steps[0].at, 2 * T.DUR_LAZY);
});

test('redenção: UMA animação de escala X no host (1, 0,04, 1), a troca de costas para frente no meio e corações no fim', () => {
  const redeem = scene('redeem');
  assert.equal(redeem.anima.length, 1);
  const flip = redeem.anima[0];
  assert.equal(flip.sel, Scenes.HOST);
  assert.deepEqual(flip.frames.map((f) => f.transform), ['scaleX(1)', 'scaleX(1)', 'scaleX(0.04)', 'scaleX(1)']);
  assert.deepEqual(flip.frames.map((f) => f.offset), [0, 1200 / 2160, 1680 / 2160, 1]);
  assert.deepEqual(flip.frames.map((f) => f.easing), [undefined, T.EASE_IN_OUT, T.EASE_SPRING, undefined]);
  assert.equal(flip.dur, 2160);
  const swap = redeem.steps[0];
  assert.equal(swap.at, 1680);
  assert.equal(swap.attrs['data-state'], 'idle');
  assert.deepEqual([...swap.detach], BACK);
  assert.deepEqual(redeem.steps[1].attrs, {
    'data-emotion': 'happy', 'data-mouth': 'smile', 'data-scene': 'glow heart',
  });
  assert.equal(redeem.from['data-state'], 'suspended');
  assert.equal('aria-label' in redeem.from, false, 'o rótulo da Lia é o do estado, não muda no meio da cena');
});

test('toda cena cita só ids que existem em lia.svg ou no contrato dos props (lia-pv-*)', () => {
  const art = require('../modulos/shared/lia/lia-art.js');
  const ids = new Set();
  const collect = (nodes) => nodes.forEach((n) => { if (n.attrs.id) ids.add(n.attrs.id); collect(n.children); });
  collect(art.tree);
  Scenes.names.forEach((name) => {
    const def = scene(name);
    [...def.anima.map((p) => p.sel), ...def.origins.map((o) => o[0])].forEach((sel) => {
      if (sel === Scenes.HOST) return;
      sel.split(',').forEach((part) => {
        const id = /#([\w-]+)/.exec(part)[1];
        assert.ok(ids.has(id) || (id.startsWith('lia-pv-') && States.EXTRA_NAMES.concat(['ecg', 'coracao']).some((n) => id === `lia-pv-${n}`)), `${name}: ${id}`);
      });
    });
  });
});

// ---------- Motor ----------

test('play: cena desconhecida ou sem host devolve null', () => {
  assert.equal(Scenes.play('nope', { host: fakeEl() }), null);
  assert.equal(Scenes.play('warning', null), null);
  assert.equal(Scenes.play('warning', {}), null);
});

test('play: cria cada animação com atraso, duração, curva e fill both; origens por CSSOM', () => {
  const def = scene('warning');
  const { env, nodes } = stage(def);
  Scenes.play('warning', env);
  const pop = nodes['#lia-pv-aviso'][0].animations[0];
  assert.deepEqual(pop.options, { delay: 1200, duration: T.DUR_SLOW, easing: T.EASE_OUT, fill: 'both' });
  assert.equal(nodes['#lia-pv-veu'][0].animations[0].options.delay, 0);
  assert.equal(nodes['#lia-pv-aviso'][0].style.props['transform-box'], 'fill-box');
  assert.equal(nodes['#lia-pv-aviso'][0].style.props['transform-origin'], '50% 50%');
});

test('play: o início aplica "from" e cada passo vale no seu instante; no fim a promessa resolve', async () => {
  const { env, host } = stage(scene('warning'));
  const handle = Scenes.play('warning', env);
  assert.equal(host.attrs['data-emotion'], 'neutral');
  assert.equal(host.attrs['data-mouth'], 'neutral');
  mock.timers.tick(1599);
  assert.equal(host.attrs['data-emotion'], 'neutral');
  mock.timers.tick(1);
  assert.equal(host.attrs['data-emotion'], 'worried');
  assert.equal(host.attrs['data-mouth'], 'worried');
  mock.timers.tick(80);
  await handle.finished;
});

test('redenção: o passo do meio tira as costas pelo callback e põe o host de frente', () => {
  const { env, host, detached } = stage(scene('redeem'));
  Scenes.play('redeem', env);
  assert.equal(host.attrs['data-state'], 'suspended');
  mock.timers.tick(1679);
  assert.deepEqual(detached, []);
  mock.timers.tick(1);
  assert.deepEqual(detached, BACK);
  assert.equal(host.attrs['data-state'], 'idle');
  mock.timers.tick(480);
  assert.equal(host.attrs['data-emotion'], 'happy');
  assert.equal(host.attrs['data-scene'], 'glow heart');
  assert.equal(host.attrs['aria-label'], undefined);
});

test('stop: cancela as animações, apaga os relógios e não deixa passo atrasado mexer nos atributos', async () => {
  const { env, host, nodes } = stage(scene('warning'));
  const handle = Scenes.play('warning', env);
  handle.stop();
  assert.ok(Object.values(nodes).every((list) => list[0].animations.every((a) => a.cancelled)));
  host.attrs['data-emotion'] = 'sad'; // o próximo estado já escreveu o dele
  mock.timers.tick(5000);
  assert.equal(host.attrs['data-emotion'], 'sad');
  await handle.finished;
  assert.doesNotThrow(() => handle.stop());
});

test('movimento reduzido: pose final na hora (animações terminadas, todos os passos, sem relógio)', async () => {
  const { env, host, detached } = stage(scene('redeem'), { reduced: true });
  const handle = Scenes.play('redeem', env);
  assert.equal(host.animations[0].finished, true);
  assert.equal(host.attrs['data-state'], 'idle');
  assert.equal(host.attrs['data-emotion'], 'happy');
  assert.deepEqual(detached, BACK);
  assert.equal(host.attrs['data-scene'], 'glow heart');
  await handle.finished;
  const warning = stage(scene('warning'), { reduced: true });
  Scenes.play('warning', warning.env);
  assert.equal(warning.nodes['#lia-pv-veu'][0].animations[0].finished, true, 'véu já em 35%');
  assert.equal(warning.host.attrs['data-emotion'], 'worried');
});

test('seletor sem elemento (peça não carregada) é ignorado sem erro', () => {
  const { env } = stage(scene('lab'), { missing: ['#lia-pv-liquido-b', '#lia-pv-bolha-1'] });
  assert.doesNotThrow(() => Scenes.play('lab', env).stop());
});

test('lia-scenes.js nunca converte texto em HTML nem usa style inline, fetch ou eval', () => {
  const src = fs.readFileSync(path.join(frontend, 'modulos/shared/lia/lia-scenes.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function|\bfetch\(|setAttribute\('style'/);
});
