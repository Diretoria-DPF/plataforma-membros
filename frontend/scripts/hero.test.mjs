/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Hero da tela de entrada (frontend/hero.js): a Lia (cabeça, idle) entra só com as flags
// ux_v2 e chatbot ligadas e com window.Lia carregada. Sem isso, nada muda na tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Hero = require('../hero.js');

const HTML = read('frontend/index.html');
/** Código sem comentários: as checagens de API proibida não podem pegar texto explicativo. */
const SOURCE = read('frontend/hero.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Contêiner mínimo: só o que hero.js usa (classList, atributos). */
function fakeContainer() {
  const attrs = {};
  const classes = new Set(['hero', 'hidden']);
  return {
    classes,
    attrs,
    classList: {
      remove: (name) => classes.delete(name),
      add: (name) => classes.add(name),
      contains: (name) => classes.has(name),
    },
    getAttribute: (name) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
    setAttribute: (name, value) => { attrs[name] = String(value); },
  };
}

function fakeDoc(container, { flags = [] } = {}) {
  const documentElement = {
    hasAttribute: (name) => flags.includes(name),
  };
  return {
    documentElement,
    getElementById: (id) => (id === 'hero-lia' ? container : null),
  };
}

const BOTH_FLAGS = ['data-flag-ux-v2-enabled', 'data-flag-chatbot-enabled'];

function fakeLia({ instance = { setState: () => instance }, mountResult } = {}) {
  const calls = [];
  return {
    calls,
    mount(target, options) {
      calls.push({ target, options });
      return mountResult === undefined ? instance : mountResult;
    },
  };
}

// ---------- marcação e carregamento ----------
test('index.html tem o contêiner decorativo do hero dentro da tela de entrada, oculto por padrão', () => {
  const start = HTML.indexOf('<section id="screen-welcome"');
  const end = HTML.indexOf('<section id="screen-register"');
  const screen = HTML.slice(start, end);
  const tag = /<div class="hero hidden" id="hero-lia" aria-hidden="true"><\/div>/;
  assert.match(screen, tag);
});

test('hero.js carrega com defer depois de lia.js (window.Lia já existe quando ele roda)', () => {
  const lia = HTML.indexOf('src="modulos/shared/lia/lia.js"');
  const hero = HTML.indexOf('src="hero.js"');
  assert.ok(lia > 0 && hero > lia, 'hero.js precisa vir depois de lia.js');
  assert.match(HTML.slice(hero - 20, hero + 40), /defer/);
});

test('hero.js não usa innerHTML, eval nem handler inline (CSP)', () => {
  assert.doesNotMatch(SOURCE, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.doesNotMatch(SOURCE, /\son[a-z]+\s*=/);
});

test('hero.js não cria animação própria: o movimento, se houver, é o da Lia (que respeita reduced motion)', () => {
  assert.doesNotMatch(SOURCE, /LiaAnim|requestAnimationFrame|setInterval|setTimeout/);
});

// ---------- decisão de montar ----------
test('só monta quando as duas flags (ux_v2 e chatbot) estão no <html>', () => {
  assert.equal(Hero.flagsOn({ hasAttribute: (n) => BOTH_FLAGS.includes(n) }), true);
  assert.equal(Hero.flagsOn({ hasAttribute: (n) => n === 'data-flag-ux-v2-enabled' }), false);
  assert.equal(Hero.flagsOn({ hasAttribute: (n) => n === 'data-flag-chatbot-enabled' }), false);
  assert.equal(Hero.flagsOn(null), false);
});

test('com as duas flags e window.Lia: monta a Lia com crop head, estado idle e mostra o contêiner', () => {
  const container = fakeContainer();
  const instance = { state: 'idle', setState(ctx) { this.state = ctx; return this; } };
  const lia = fakeLia({ instance });
  const result = Hero.heroMountIfEnabled(fakeDoc(container, { flags: BOTH_FLAGS }), lia);
  assert.equal(lia.calls.length, 1);
  assert.equal(lia.calls[0].target, container);
  assert.deepEqual(lia.calls[0].options, { crop: 'head' });
  assert.equal(instance.state, 'idle');
  assert.equal(result, instance);
  assert.equal(container.classList.contains('hidden'), false);
});

test('sem a flag do chatbot: não monta e o contêiner continua oculto (melhoria progressiva)', () => {
  const container = fakeContainer();
  const lia = fakeLia();
  const result = Hero.heroMountIfEnabled(fakeDoc(container, { flags: ['data-flag-ux-v2-enabled'] }), lia);
  assert.equal(result, null);
  assert.equal(lia.calls.length, 0);
  assert.equal(container.classList.contains('hidden'), true);
});

test('sem window.Lia: não faz nada e não lança erro', () => {
  const container = fakeContainer();
  assert.equal(Hero.heroMountIfEnabled(fakeDoc(container, { flags: BOTH_FLAGS }), null), null);
  assert.equal(container.classList.contains('hidden'), true);
});

test('se a Lia não montar (mount devolve null), o contêiner segue oculto', () => {
  const container = fakeContainer();
  const lia = fakeLia({ mountResult: null });
  assert.equal(Hero.mountHero(fakeDoc(container, { flags: BOTH_FLAGS }), lia), null);
  assert.equal(container.classList.contains('hidden'), true);
});

test('sem o contêiner no HTML: devolve null sem montar', () => {
  const lia = fakeLia();
  const doc = { documentElement: { hasAttribute: () => true }, getElementById: () => null };
  assert.equal(Hero.mountHero(doc, lia), null);
  assert.equal(lia.calls.length, 0);
});

test('chamadas repetidas não montam a Lia duas vezes', () => {
  const container = fakeContainer();
  const lia = fakeLia();
  const doc = fakeDoc(container, { flags: BOTH_FLAGS });
  Hero.heroMountIfEnabled(doc, lia);
  assert.equal(Hero.heroMountIfEnabled(doc, lia), null);
  assert.equal(lia.calls.length, 1);
});

// ---------- flags que chegam depois (primeira visita, pela rede) ----------
class FakeObserver {
  constructor(callback) {
    this.callback = callback;
    this.target = null;
    this.options = null;
    this.disconnected = false;
    FakeObserver.instances.push(this);
  }
  observe(target, options) { this.target = target; this.options = options; }
  disconnect() { this.disconnected = true; }
}

function liveHtml(initial = []) {
  const attrs = new Set(initial);
  return {
    hasAttribute: (name) => attrs.has(name),
    setFlag: (name) => { attrs.add(name); },
  };
}

function liveDoc(container, html) {
  return { documentElement: html, getElementById: (id) => (id === 'hero-lia' ? container : null) };
}

test('watchFlags: flags já ligadas montam na hora e não criam observador', () => {
  FakeObserver.instances = [];
  const container = fakeContainer();
  const lia = fakeLia();
  const result = Hero.watchFlags(liveDoc(container, liveHtml(BOTH_FLAGS)), lia, FakeObserver);
  assert.equal(result, null);
  assert.equal(FakeObserver.instances.length, 0);
  assert.equal(lia.calls.length, 1);
  assert.equal(container.classList.contains('hidden'), false);
});

test('watchFlags: flags que chegam depois observam o <html> e montam só quando as duas existem', () => {
  FakeObserver.instances = [];
  const html = liveHtml(['data-flag-ux-v2-enabled']);
  const container = fakeContainer();
  const lia = fakeLia();
  const observer = Hero.watchFlags(liveDoc(container, html), lia, FakeObserver);
  assert.equal(observer, FakeObserver.instances[0]);
  assert.equal(observer.target, html);
  assert.deepEqual(observer.options, { attributes: true, attributeFilter: BOTH_FLAGS });
  observer.callback();
  assert.equal(lia.calls.length, 0, 'com uma flag só não monta');
  assert.equal(observer.disconnected, false);
  html.setFlag('data-flag-chatbot-enabled');
  observer.callback();
  assert.equal(lia.calls.length, 1);
  assert.equal(observer.disconnected, true);
  assert.equal(container.classList.contains('hidden'), false, 'o contêiner aparece sem recarregar');
});

test('watchFlags: mutações repetidas depois de montar não montam de novo', () => {
  FakeObserver.instances = [];
  const html = liveHtml();
  const lia = fakeLia();
  const observer = Hero.watchFlags(liveDoc(fakeContainer(), html), lia, FakeObserver);
  BOTH_FLAGS.forEach((name) => html.setFlag(name));
  observer.callback();
  observer.callback();
  assert.equal(lia.calls.length, 1);
});

test('watchFlags: sem MutationObserver no navegador, não monta e não lança erro', () => {
  const lia = fakeLia();
  const container = fakeContainer();
  assert.equal(Hero.watchFlags(liveDoc(container, liveHtml()), lia, undefined), null);
  assert.equal(lia.calls.length, 0);
  assert.equal(container.classList.contains('hidden'), true);
});

test('watchFlags: sem <html> devolve null', () => {
  assert.equal(Hero.watchFlags({ getElementById: () => null }, fakeLia(), FakeObserver), null);
});

test('watchFlags: Lia ausente quando as flags chegam não lança, mantém o contêiner oculto e desliga o observador', () => {
  FakeObserver.instances = [];
  const html = liveHtml();
  const container = fakeContainer();
  const observer = Hero.watchFlags(liveDoc(container, html), null, FakeObserver);
  BOTH_FLAGS.forEach((name) => html.setFlag(name));
  assert.doesNotThrow(() => observer.callback());
  assert.equal(container.classList.contains('hidden'), true);
  assert.equal(observer.disconnected, true);
});

test('hero.js liga o observador no navegador (MutationObserver do window), não só no carregamento', () => {
  assert.match(SOURCE, /watchFlags\(doc, root\.Lia, root\.MutationObserver\)/);
});
