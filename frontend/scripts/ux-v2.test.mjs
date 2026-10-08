// Visual v2 (Fase A): flags -> data-flag-*, cache de flags, porta de rolagem, splash e tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Ux = require('../ux-v2.js');
const Splash = require('../splash.js');

function fakeElement(initial = {}) {
  const attrs = { ...initial };
  return {
    attrs,
    getAttributeNames: () => Object.keys(attrs),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: (k) => { delete attrs[k]; },
  };
}
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

// ---------- flags ----------
test('flagAttribute converte chave com sublinhado em atributo com hífen e rejeita lixo', () => {
  assert.equal(Ux.flagAttribute('ux_v2_enabled'), 'data-flag-ux-v2-enabled');
  assert.equal(Ux.flagAttribute('chatbot_enabled'), 'data-flag-chatbot-enabled');
  for (const bad of ['', 'Ux', '1abc', 'a b', 'a"onload=x', null, undefined, 42, 'x'.repeat(80)]) {
    assert.equal(Ux.flagAttribute(bad), null, String(bad));
  }
});

test('applyFlags põe "1" só para flags true e devolve as chaves ligadas', () => {
  const el = fakeElement();
  const on = Ux.applyFlags(el, { ux_v2_enabled: true, chatbot_enabled: false, feedback_enabled: 'yes' });
  assert.deepEqual(on, ['ux_v2_enabled']);
  assert.deepEqual(el.attrs, { 'data-flag-ux-v2-enabled': '1' });
});

test('applyFlags remove atributos de flags desligadas sem mexer em outros atributos', () => {
  const el = fakeElement({ 'data-flag-ux-v2-enabled': '1', 'data-theme': 'dark', lang: 'pt-BR' });
  Ux.applyFlags(el, { ux_v2_enabled: false });
  assert.deepEqual(el.attrs, { 'data-theme': 'dark', lang: 'pt-BR' });
});

test('applyFlags tolera entrada inválida (sem flags = UI anterior)', () => {
  for (const bad of [null, undefined, 'x', 7, []]) {
    const el = fakeElement({ 'data-flag-ux-v2-enabled': '1' });
    assert.deepEqual(Ux.applyFlags(el, bad), []);
    assert.deepEqual(el.attrs, {});
  }
});

test('applyAndRememberFlags guarda só booleanos válidos e restoreFlags os reaplica', () => {
  const storage = fakeStorage();
  const el = fakeElement();
  Ux.applyAndRememberFlags(el, { ux_v2_enabled: true, 'ruim"': true, outra: false }, storage);
  assert.deepEqual(JSON.parse(storage.data[Ux.CACHE_KEY]), { ux_v2_enabled: true });
  const later = fakeElement();
  assert.deepEqual(Ux.restoreFlags(later, storage), ['ux_v2_enabled']);
  assert.equal(later.attrs['data-flag-ux-v2-enabled'], '1');
});

test('restoreFlags ignora cache corrompido ou ausente', () => {
  assert.deepEqual(Ux.restoreFlags(fakeElement(), fakeStorage({ [Ux.CACHE_KEY]: '{nao-json' })), []);
  assert.deepEqual(Ux.restoreFlags(fakeElement(), null), []);
  assert.deepEqual(Ux.restoreFlags(fakeElement(), fakeStorage({ [Ux.CACHE_KEY]: '{"a_b":"x"}' })), []);
});

// ---------- barra flutuante ----------
function fakeWindow() {
  const handlers = {};
  const timers = [];
  return {
    scrollY: 0,
    handlers,
    timers,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    removeEventListener: (type) => { delete handlers[type]; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    flush() { timers.splice(0).forEach((t) => t.fn && t.fn()); },
  };
}

test('createScrollGate marca data-scrolling ao rolar e tira depois do tempo parado', () => {
  const win = fakeWindow();
  const el = fakeElement();
  Ux.createScrollGate(win, el);
  win.scrollY = 120;
  win.handlers.scroll();
  assert.equal(el.attrs['data-scrolling'], '1');
  assert.equal(win.timers.at(-1).ms, Ux.SCROLL_IDLE_MS);
  win.flush();
  assert.equal('data-scrolling' in el.attrs, false);
});

test('createScrollGate ignora tremida menor que o limite e renova o tempo enquanto rola', () => {
  const win = fakeWindow();
  const el = fakeElement();
  Ux.createScrollGate(win, el);
  win.scrollY = 3;
  win.handlers.scroll();
  assert.equal('data-scrolling' in el.attrs, false);
  win.scrollY = 50; win.handlers.scroll();
  win.scrollY = 90; win.handlers.scroll();
  win.scrollY = 91; win.handlers.scroll();
  assert.equal(el.attrs['data-scrolling'], '1');
  win.flush();
  assert.equal('data-scrolling' in el.attrs, false);
});

test('createScrollGate.destroy solta o ouvinte e limpa o atributo', () => {
  const win = fakeWindow();
  const el = fakeElement();
  const gate = Ux.createScrollGate(win, el);
  win.scrollY = 200; win.handlers.scroll();
  gate.destroy();
  assert.equal('scroll' in win.handlers, false);
  assert.equal('data-scrolling' in el.attrs, false);
});

// ---------- splash ----------
test('splash: aparece 1x por sessão (gate em sessionStorage)', () => {
  const storage = fakeStorage();
  assert.equal(Splash.shouldShowSplash(storage), true);
  Splash.markShown(storage);
  assert.equal(Splash.shouldShowSplash(storage), false);
});

test('splash: storage indisponível não impede nem quebra', () => {
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(Splash.shouldShowSplash(broken), true);
  assert.doesNotThrow(() => Splash.markShown(broken));
  assert.equal(Splash.shouldShowSplash(null), true);
});

test('splash: tempo mínimo na tela, e nenhum sob movimento reduzido', () => {
  assert.equal(Splash.remainingMs(1000, 1200, false), Splash.MIN_VISIBLE_MS - 200);
  assert.equal(Splash.remainingMs(1000, 1000 + Splash.MIN_VISIBLE_MS + 5, false), 0);
  assert.equal(Splash.remainingMs(1000, 1001, true), 0);
});

test('splash: ícones são SVG criados por createElementNS, sem innerHTML', () => {
  const src = read('frontend/splash.js');
  assert.match(src, /createElementNS\(SVG_NS/);
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML/);
  const created = [];
  const mk = (ns, tag) => {
    const el = { ns, tag, attrs: {}, children: [], className: '', setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); }, classList: { add() {} } };
    created.push(el);
    return el;
  };
  const doc = { createElement: (t) => mk(null, t), createElementNS: (ns, t) => mk(ns, t) };
  const node = Splash.buildSplash(doc);
  assert.equal(node.attrs['aria-hidden'], 'true');
  const svgs = created.filter((e) => e.tag === 'svg');
  assert.equal(svgs.length, 3);
  assert.ok(svgs.every((e) => e.ns === 'http://www.w3.org/2000/svg' && e.attrs['aria-hidden'] === 'true'));
});

test('splash.js reage a laift:ready e app.js dispara o evento', () => {
  assert.equal(Splash.READY_EVENT, 'laift:ready');
  assert.match(read('frontend/app.js'), /dispatchEvent\(new Event\('laift:ready'\)\)/);
});

// ---------- tokens, CSS e registro de arquivos ----------
const tokens = read('frontend/modulos/shared/laift-tokens.css');
const tokenValue = (name, css = tokens) => {
  const m = css.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  return m ? m[1].trim() : undefined;
};

test('tokens de movimento exatamente como no ADR 0002', () => {
  const expected = {
    'dur-instant': '100ms', 'dur-fast': '180ms', 'dur-base': '280ms', 'dur-slow': '480ms', 'dur-lazy': '800ms',
    'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)', 'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
    'ease-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)', 'ease-anticipate': 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
    'move-xs': '4px', 'move-sm': '8px', 'move-md': '16px', 'move-lg': '32px',
  };
  for (const [k, v] of Object.entries(expected)) assert.equal(tokenValue(k), v, k);
});

test('camadas 0..3 e paleta de gráficos 1..8 (claro e escuro)', () => {
  const light = ['#fafaf7', '#f4f3ef', '#edebe5', '#e4e1d8'];
  const dark = ['#0e1114', '#14181c', '#1a1f24', '#22282e'];
  light.forEach((v, i) => assert.equal(tokenValue('layer-' + i), v));
  dark.forEach((v, i) => assert.equal(tokenValue('dk-layer-' + i), v));
  const chartsLight = ['#03483d', '#c05e05', '#0a5f75', '#8f6b09', '#194cb1', '#c03a4a', '#2e4600', '#a656bd'];
  const chartsDark = ['#3ef7d7', '#d8732b', '#1dcaf7', '#a1790c', '#91b7fe', '#ca545d', '#bbea7a', '#b872cd'];
  chartsLight.forEach((v, i) => assert.equal(tokenValue('chart-' + (i + 1)), v));
  chartsDark.forEach((v, i) => assert.equal(tokenValue('dk-chart-' + (i + 1)), v));
  for (let i = 1; i <= 3; i++) assert.ok(tokenValue('elev-' + i), 'elev-' + i);
});

test('paleta escura escrita uma única vez: nomes --dk-* sem repetição e blocos só citam var(--dk-*)', () => {
  const defs = [...tokens.matchAll(/--dk-([a-z0-9-]+):\s*([^;]+);/g)];
  assert.ok(defs.length > 30);
  assert.equal(new Set(defs.map((m) => m[1])).size, defs.length, 'nome --dk-* repetido');
  const applied = [...tokens.matchAll(/--(?:layer|elev|chart|laift)-[a-z0-9-]+:\s*var\(--dk-/g)];
  assert.ok(applied.length >= defs.length - 2);
});

function lum(h) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('contraste 4,5:1 de texto e cores semânticas sobre as 4 camadas, nos dois temas', () => {
  const fg = ['text', 'muted', 'primary-strong', 'primary', 'danger', 'success', 'admin'];
  for (const [theme, layerKey, fgKey] of [['claro', 'layer', 'laift'], ['escuro', 'dk-layer', 'dk']]) {
    for (let i = 0; i < 4; i++) {
      const bg = tokenValue(layerKey + '-' + i);
      for (const name of fg) {
        const value = tokenValue(fgKey + '-' + name);
        assert.ok(contrast(value, bg) >= 4.5, theme + ': ' + name + ' ' + value + ' sobre camada ' + i + ' = ' + contrast(value, bg).toFixed(2));
      }
    }
  }
  assert.ok(contrast(tokenValue('laift-on-primary'), tokenValue('laift-primary')) >= 4.5);
  assert.ok(contrast(tokenValue('dk-on-primary'), tokenValue('dk-primary')) >= 4.5);
});

test('styles.css não repete a paleta escura e usa aliases dos tokens', () => {
  const css = read('frontend/styles.css');
  assert.doesNotMatch(css, /data-theme/);
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.match(css, /--bg:\s*var\(--laift-bg\)/);
  assert.match(css, /--surface:\s*var\(--laift-surface\)/);
});

test('um único bloco prefers-reduced-motion: reduce na plataforma (laift-tokens.css)', () => {
  assert.equal((tokens.match(/prefers-reduced-motion:\s*reduce/g) || []).length, 1);
  for (const f of ['styles.css', 'ux.css', 'splash.css']) {
    assert.doesNotMatch(read('frontend/' + f), /prefers-reduced-motion:\s*reduce/, f);
  }
});

test('CSS novo: sem duração nem curva literal em transition/animation', () => {
  for (const f of ['ux.css', 'splash.css']) {
    const css = read('frontend/' + f).replace(/\/\*[\s\S]*?\*\//g, '');
    const decl = [...css.matchAll(/((?:transition|animation)[a-z-]*):\s*([^;]+);/g)].map((m) => [m[1], m[2]]);
    assert.ok(decl.length > 3, f + ': nenhuma declaração de movimento encontrada');
    for (const [prop, d] of decl) {
      const noVars = d.replace(/var\([^)]*\)/g, '');
      assert.doesNotMatch(noVars, /cubic-bezier|\bease(-in|-out|-in-out)?\b/, f + ': curva literal em "' + d + '"');
      // atraso de escalonamento do splash (animation-delay) é a única duração literal tolerada
      if (!/delay/.test(prop)) assert.doesNotMatch(noVars, /\b\d+(\.\d+)?m?s\b/, f + ': duração literal em "' + d + '"');
    }
  }
});

test('visual v2 só vale sob data-flag-ux-v2-enabled (sem a flag, UI anterior)', () => {
  const css = read('frontend/ux.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const v2 = css.slice(css.indexOf(':root[data-flag-ux-v2-enabled] {'));
  const selectors = [...v2.matchAll(/(?:^|\})\s*([^@{}]+?)\s*\{/g)].map((m) => m[1])
    .filter((s) => !/^(from|to|\d+%)$/.test(s.trim()));
  const loose = selectors.filter((s) => !s.includes('data-flag-ux-v2-enabled') && !s.includes('.learn-viewer-immersive'));
  assert.deepEqual(loose, []);
});

test('glass: sem blur sobre o canvas 3D do Atlas imersivo; splash com @supports', () => {
  const css = read('frontend/ux.css');
  assert.match(css, /body:has\(\.learn-viewer-immersive:not\(\.hidden\)\) \.app-header/);
  assert.match(css, /backdrop-filter: none/);
  const splash = read('frontend/splash.css');
  assert.ok(splash.indexOf('backdrop-filter') > splash.indexOf('@supports'));
});

test('arquivos novos registrados: index.html, build.js e PRECACHE do sw.js (cache v3+)', () => {
  const html = read('frontend/index.html');
  const build = read('frontend/scripts/build.js');
  const sw = read('frontend/sw.js');
  assert.match(html, /<script src="ux-v2\.js"><\/script>/);
  assert.match(html, /<script src="splash\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="splash\.css">/);
  assert.match(html, /<link rel="stylesheet" href="modulos\/shared\/laift-tokens\.css">/);
  for (const f of ['ux-v2.js', 'splash.js', 'splash.css']) {
    assert.ok(build.includes("'" + f + "'"), 'build.js sem ' + f);
    assert.ok(sw.includes("'" + f + "'"), 'sw.js sem ' + f);
  }
  assert.ok(sw.includes("'modulos/shared/laift-tokens.css'"));
  assert.ok(Number(sw.match(/CACHE_PREFIX \+ 'v(\d+)'/)[1]) >= 3);
});

test('páginas que usam styles.css carregam laift-tokens.css antes dele', () => {
  for (const page of ['404.html', 'termos.html', 'privacidade.html', 'index.html']) {
    const html = read('frontend/' + page);
    const t = html.indexOf('laift-tokens.css');
    assert.ok(t > 0 && t < html.indexOf('styles.css'), page);
  }
});

test('app.js aplica as flags públicas via LaiftUx e usa esqueleto nos carregamentos', () => {
  const app = read('frontend/app.js');
  assert.match(app, /callApi\('apiGetFeatureFlags'/);
  assert.match(app, /applyAndRememberFlags\(document\.documentElement/);
  for (const id of ['events-list', 'my-proposals-list', 'voting-list']) assert.ok(app.includes("showSkeleton('" + id + "'"), id);
});

// Lê o CSS em regras (seletor, bloco) e devolve os seletores com :hover fora de @media (hover: hover).
function hoverSelectorsOutsideHoverMedia(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders = [];
  const stack = [];
  let prelude = '';
  for (const c of src) {
    if (c === '{') {
      const sel = prelude.trim();
      if (/:hover/.test(sel)) {
        const inHoverMedia = stack.some((p) => /@media\s*\(\s*hover:\s*hover\s*\)/.test(p));
        if (!inHoverMedia) offenders.push(sel);
      }
      stack.push(sel);
      prelude = '';
    } else if (c === '}') {
      stack.pop();
      prelude = '';
    } else if (c === ';') {
      prelude = '';
    } else {
      prelude += c;
    }
  }
  return offenders;
}

test('v2: cartões e listas sem borda sob a flag (border: 0 ou none)', () => {
  const css = read('frontend/ux.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /(^|[;\s])border:\s*(0|none)\s*(;|$)/.test(m[2]))
    .map((m) => m[1].split(',').map((s) => s.trim()));
  const cardSelectors = ['.card', '.learn-card', '.list-item', '.stat-card', '.learn-stat', '.orgchart-directorate-box',
    '.ai-key-card', '.ai-budget', '.checkbox-row', '.state', '.mfa-secret', '.learn-badge', '.modal-box', '.auth-card', '.lia-panel'];
  for (const sel of cardSelectors) {
    const flagged = rules.some((pieces) => pieces.some((p) => p.includes('data-flag-ux-v2-enabled') && p.endsWith(' ' + sel)));
    assert.ok(flagged, 'sem border: 0 sob a flag para ' + sel);
  }
});

test('hover visual fica só em @media (hover: hover) nos seletores de botão, cartão e item', () => {
  const targets = /\.card|\.list-item|\.btn|button/;
  const offenders = [];
  for (const f of ['frontend/styles.css', 'frontend/ux.css']) {
    for (const sel of hoverSelectorsOutsideHoverMedia(read(f))) {
      if (targets.test(sel)) offenders.push(f + ': ' + sel);
    }
  }
  assert.deepEqual(offenders, []);
});
