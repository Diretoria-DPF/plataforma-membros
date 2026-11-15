/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Personagem do Tutor (frontend/tutor-persona.js): 3 variações, estados, escolha salva só no aparelho,
// arte sem raster e sem texto, peso total <= 25 KB gz, e o carregamento fora do shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);

function makeStorage(throwing) {
  const data = new Map();
  return {
    getItem(k) { if (throwing) throw new Error('bloqueado'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (throwing) throw new Error('bloqueado'); data.set(k, String(v)); },
  };
}

function fakeNode(tag) {
  const attrs = {};
  const n = {
    tag, children: [], className: '', parentNode: null, textContent: '', checked: false, listeners: {},
    classList: { add(c) { n.className += ' ' + c; } },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
    removeChild(c) { n.children = n.children.filter((x) => x !== c); return c; },
    addEventListener(t, f) { n.listeners[t] = f; },
    get firstChild() { return n.children[0] || null; },
    attrs,
  };
  return n;
}
const fakeDoc = () => ({ createElement: fakeNode, createElementNS: (ns, tag) => fakeNode(tag), querySelectorAll: () => [] });

function load(storage) {
  delete require.cache[require.resolve('../tutor-persona.js')];
  globalThis.localStorage = storage;
  return require('../tutor-persona.js');
}

function walk(node, visit) { visit(node); node.children.forEach((c) => walk(c, visit)); }

test('três variações com identidade própria, sem texto nem imagem raster dentro da arte', () => {
  const P = load(makeStorage());
  assert.equal(P.PERSONAS.length, 3);
  assert.equal(new Set(P.PERSONAS.map((p) => p.name)).size, 3);
  for (const p of P.PERSONAS) {
    const host = P.render(fakeDoc(), { persona: p.id, size: 'card' });
    const tags = [];
    walk(host, (n) => tags.push(n.tag));
    for (const banned of ['image', 'text', 'tspan', 'foreignObject', 'script', 'style']) assert.ok(!tags.includes(banned), `${p.id}: ${banned}`);
    assert.ok(tags.filter((t) => t === 'path' || t === 'circle' || t === 'ellipse').length > 8);
  }
});

test('acessibilidade: figura solta tem role img e rótulo; figura decorativa some do leitor de tela', () => {
  const P = load(makeStorage());
  const solta = P.render(fakeDoc(), { persona: 'coruja', size: 'tela' });
  assert.equal(solta.getAttribute('role'), 'img');
  assert.equal(solta.getAttribute('aria-label'), 'Personagem do Tutor: Coruja');
  const deco = P.render(fakeDoc(), { persona: 'frasco', size: 'avatar', decorative: true });
  assert.equal(deco.getAttribute('aria-hidden'), 'true');
  assert.equal(deco.getAttribute('role'), null);
});

test('estados e tamanhos inválidos caem no padrão; setState só aceita os quatro estados', () => {
  const P = load(makeStorage());
  const host = P.render(fakeDoc(), { state: 'dancando', size: 'gigante' });
  assert.equal(host.getAttribute('data-state'), 'idle');
  assert.ok(host.className.includes('tut--card'));
  for (const s of ['thinking', 'speaking', 'celebrating', 'idle']) { P.setState(host, s); assert.equal(host.getAttribute('data-state'), s); }
  P.setState(host, 'xyz');
  assert.equal(host.getAttribute('data-state'), 'idle');
});

test('escolha: padrão, salva, valor inválido ignorado e storage bloqueado não quebra', () => {
  let P = load(makeStorage());
  assert.equal(P.getPersona(), 'atomo');
  assert.equal(P.setPersona('coruja', fakeDoc()), true);
  assert.equal(P.getPersona(), 'coruja');
  assert.equal(P.setPersona('robo', fakeDoc()), false);
  assert.equal(P.getPersona(), 'coruja');
  P = load(makeStorage(true));
  assert.equal(P.setPersona('frasco', fakeDoc()), true);
  assert.equal(P.getPersona(), 'frasco');
});

test('seletor: 3 botões de opção nativos em um grupo, e a escolha chama setPersona', () => {
  const P = load(makeStorage());
  const set = P.buildPicker(fakeDoc());
  const inputs = [];
  walk(set, (n) => { if (n.tag === 'input') inputs.push(n); });
  assert.equal(inputs.length, 3);
  assert.equal(new Set(inputs.map((i) => i.name)).size, 1);
  assert.equal(inputs.filter((i) => i.checked).length, 1);
  inputs[2].checked = true;
  inputs[2].listeners.change();
  assert.equal(P.getPersona(), 'frasco');
});

test('peso: as três variações (JS + CSS) cabem em 25 KB gz e ficam fora do shell', () => {
  const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(frontend, f)), { level: 9 }).length;
  assert.ok(gz('tutor-persona.js') + gz('tutor-persona.css') <= 25 * 1024);
  const html = read('index.html');
  assert.ok(!html.includes('tutor-persona'), 'nada no index.html: carga sob demanda');
  assert.ok(!read('sw.js').includes('tutor-persona'));
  assert.match(read('scripts/build.js'), /'tutor-persona\.js', 'tutor-persona\.css'/);
});

test('movimento só com prefers-reduced-motion: no-preference', () => {
  const css = read('tutor-persona.css');
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, '');
  assert.ok(!/animation\s*:/.test(outside), 'animação fora do bloco no-preference');
  assert.match(css, /prefers-reduced-motion: no-preference/);
});
