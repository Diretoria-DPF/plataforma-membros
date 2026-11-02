/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Destaques da Liga (highlights.js e highlights-manage.js): funções puras, desenho do bloco "Na Liga" com um DOM
// mínimo, e a fiação (pacote sob demanda, index.html, build, sw, flag). Nada de innerHTML nem estilo inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda, assertAntes } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const hl = require('../highlights.js');
const manage = require('../highlights-manage.js');
const HTML = ler('index.html');

const NOW = Date.parse('2026-11-01T12:00:00-03:00');

/** DOM mínimo: o bastante para o desenho do bloco (createElement, filhos, classList, textContent). */
function fakeDoc(hostId) {
  function make(tag) {
    const el = {
      tag, children: [], attrs: {}, className: '', textContent: '', id: '', listeners: {},
      get firstChild() { return this.children[0] || null; },
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    };
    const classes = new Set();
    el.classList = {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
    };
    return el;
  }
  const host = make('section');
  host.classList.add('hidden');
  return { host, createElement: make, getElementById: (id) => (id === hostId ? host : null), head: null };
}
const textOf = (el) => [el.textContent].concat(el.children.map(textOf)).join('|');
const find = (el, tag) => (el.tag === tag ? [el] : []).concat(...el.children.map((c) => find(c, tag)));

test('linkTarget: caminho interno ou https; o resto não vira link', () => {
  assert.deepEqual(hl.linkTarget('/blog/x.html'), { href: '/blog/x.html', external: false });
  assert.deepEqual(hl.linkTarget('https://exemplo.org/a'), { href: 'https://exemplo.org/a', external: true });
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://exemplo.org', '//evil.example', '/a\\b', 'blog/x', 'https://u:p@exemplo.org/', '', null, 5, '/a b']) {
    assert.equal(hl.linkTarget(bad), null, String(bad));
  }
});

test('endOfDayIso: fim do dia local; inválido vira vazio', () => {
  const iso = hl.endOfDayIso('2026-11-30');
  const d = new Date(iso);
  assert.equal(d.getDate(), 30);
  assert.equal(d.getHours(), 23);
  assert.equal(hl.endOfDayIso(''), '');
  assert.equal(hl.endOfDayIso('2026-02-31'), '');
  assert.equal(hl.endOfDayIso('lixo'), '');
});

test('eventsToItems: só os próximos, em ordem, no máximo N, marcados como automáticos', () => {
  const events = [
    { id: 'c', title: 'Depois', eventDate: '2026-12-10T22:00:00Z', location: 'Sala 2' },
    { id: 'a', title: 'Passado', eventDate: '2026-10-01T22:00:00Z' },
    { id: 'b', title: 'Logo', eventDate: '2026-11-05T22:00:00Z' },
    { id: 'd', title: '  ', eventDate: '2026-11-06T22:00:00Z' },
    { id: 'e', title: 'Sem data', eventDate: 'lixo' },
  ];
  const out = hl.eventsToItems(events, NOW, 2);
  assert.deepEqual(out.map((i) => i.title), ['Logo', 'Depois']);
  assert.ok(out.every((i) => i.auto === true && i.kind === 'evento' && i.panel === 'panel-events'));
  assert.deepEqual(hl.eventsToItems(null, NOW, 3), []);
});

test('postsToItems: só a publicação recente com href válido', () => {
  const posts = [
    { titulo: 'Velha', href: 'blog/velha.html', data: '2026-01-01' },
    { titulo: 'Nova', href: 'blog/nova.html', data: '2026-10-28' },
    { titulo: 'Mais nova', href: 'blog/mais-nova.html', data: '2026-10-31' },
    { titulo: 'Ruim', href: 'https://evil.example/', data: '2026-10-31' },
  ];
  const out = hl.postsToItems(posts, NOW);
  assert.equal(out.length, 1);
  assert.deepEqual({ title: out[0].title, linkPath: out[0].linkPath, auto: out[0].auto }, { title: 'Mais nova', linkPath: '/blog/mais-nova.html', auto: true });
  assert.deepEqual(hl.postsToItems(undefined, NOW), []);
});

test('mergeItems: manuais primeiro, teto de 8 no conjunto, sem repetir título', () => {
  const manual = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, title: 'Manual ' + i, kind: 'aviso' }));
  const autos = [
    { id: 'a1', title: 'manual 0', kind: 'evento', auto: true },
    { id: 'a2', title: 'Auto 2', kind: 'evento', auto: true },
    { id: 'a3', title: 'Auto 3', kind: 'evento', auto: true },
    { id: 'a4', title: 'Auto 4', kind: 'blog', auto: true },
  ];
  const out = hl.mergeItems(manual, autos, 8);
  assert.equal(out.length, 8);
  assert.deepEqual(out.slice(0, 6).map((i) => i.id), manual.map((i) => i.id));
  assert.deepEqual(out.slice(6).map((i) => i.id), ['a2', 'a3']);
  assert.equal(hl.mergeItems(Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: 't' + i })), [], 8).length, 8);
});

test('renderBlock: título "Na Liga", lista acessível, link seguro e sem itens esconde o bloco', () => {
  const doc = fakeDoc('home-highlights');
  hl.renderBlock(doc, doc.host, [
    { id: '1', kind: 'edital', title: 'Edital aberto', subtitle: 'Até 30/11', linkPath: '/edital.html' },
    { id: '2', kind: 'link', title: 'Externo', linkPath: 'https://exemplo.org/x' },
    { id: '3', kind: 'aviso', title: 'Sem link', linkPath: 'javascript:alert(1)' },
  ], null);
  assert.equal(doc.host.classList.contains('hidden'), false);
  assert.equal(doc.host.attrs['aria-labelledby'], 'home-highlights-title');
  assert.match(textOf(doc.host), /Na Liga/);
  const links = find(doc.host, 'a');
  assert.equal(links.length, 2);
  assert.equal(links[0].href, '/edital.html');
  assert.equal(links[1].target, '_blank');
  assert.equal(links[1].rel, 'noopener noreferrer');
  assert.equal(find(doc.host, 'div').filter((d) => d.className.includes('hl-card--static')).length, 1);
  hl.renderBlock(doc, doc.host, [], null);
  assert.equal(doc.host.classList.contains('hidden'), true);
  assert.equal(doc.host.children.length, 0);
});

test('mount: sem a flag (enabled false) ou com erro, o bloco fica escondido e a Início segue', async () => {
  const doc = fakeDoc('home-highlights');
  const state = { getState: () => ({ sessionToken: 't' }) };
  await hl.mount({ ...state, callApi: async () => ({ success: true, enabled: false, highlights: [] }) }, doc);
  assert.equal(doc.host.classList.contains('hidden'), true);
  await hl.mount({ ...state, callApi: async () => { throw new Error('rede'); } }, doc);
  assert.equal(doc.host.classList.contains('hidden'), true);
});

test('mount: mescla manuais e eventos automáticos (apiListEvents), respeitando o teto', async () => {
  const doc = fakeDoc('home-highlights');
  const futuro = new Date(Date.now() + 3 * 86400000).toISOString();
  const calls = [];
  const app = {
    getState: () => ({ sessionToken: 't' }),
    showPanel() {},
    callApi: async (name) => {
      calls.push(name);
      if (name === 'apiListHighlights') return { success: true, enabled: true, highlights: [{ id: '1', kind: 'aviso', title: 'Manual', subtitle: '', linkPath: null }] };
      return { success: true, events: [{ id: 'e1', title: 'Evento X', eventDate: futuro, location: 'Online' }] };
    },
  };
  await hl.mount(app, doc);
  assert.deepEqual(calls.sort(), ['apiListEvents', 'apiListHighlights']);
  const text = textOf(doc.host);
  assert.match(text, /Manual/);
  assert.match(text, /Evento X/);
  assert.equal(doc.host.classList.contains('hidden'), false);
});

test('mount: resposta atrasada de uma chamada já trocada não toca a tela', async () => {
  const doc = fakeDoc('home-highlights');
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const app = {
    getState: () => ({ sessionToken: 't' }), showPanel() {},
    callApi: async (name) => (name === 'apiListHighlights' ? slow : { success: true, events: [] }),
  };
  const first = hl.mount(app, doc);
  hl.reset(doc);
  release({ success: true, enabled: true, highlights: [{ id: '1', kind: 'aviso', title: 'Atrasado' }] });
  await first;
  assert.equal(doc.host.classList.contains('hidden'), true);
  assert.doesNotMatch(textOf(doc.host), /Atrasado/);
});

test('gestão: movedIds, formInput, aviso do teto e descrição', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(manage.movedIds(list, 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(manage.movedIds(list, 1, 1), ['a', 'c', 'b']);
  assert.equal(manage.movedIds(list, 0, -1), null);
  assert.equal(manage.movedIds(list, 2, 1), null);

  assert.match(manage.formInput({ title: ' ', kind: 'aviso' }).error, /título/);
  assert.match(manage.formInput({ title: 'x'.repeat(121), kind: 'aviso' }).error, /120/);
  assert.match(manage.formInput({ title: 'x', kind: 'aviso', link: 'javascript:alert(1)' }).error, /link/);
  assert.match(manage.formInput({ title: 'x', kind: 'aviso', end: '2020-01-01' }).error, /futura/);
  const ok = manage.formInput({ title: ' Edital ', kind: 'edital', subtitle: ' até dia 30 ', link: '/edital.html', end: '2099-12-31' });
  assert.equal(ok.input.title, 'Edital');
  assert.equal(ok.input.subtitle, 'até dia 30');
  assert.equal(ok.input.linkPath, '/edital.html');
  assert.equal(new Date(ok.input.endsAt).getDate(), 31); // fim do dia 31 no horário local
  assert.deepEqual(manage.formInput({ title: 'x', kind: 'link' }).input, { kind: 'link', title: 'x', subtitle: '', linkPath: null, endsAt: null });

  const ativos = Array.from({ length: 9 }, (_, i) => ({ isActive: true, inWindow: true, visible: i < 8 }));
  assert.match(manage.capText(ativos, 8), /Aparecendo agora: 8 de 8/);
  assert.match(manage.capText(ativos, 8), /9 ativos: só os 8 primeiros/);
  assert.doesNotMatch(manage.capText(ativos.slice(0, 3), 3), /ativos: só/);
  assert.match(manage.describe({ kind: 'aviso', isActive: false, inWindow: true, visible: false }), /oculto/);
  assert.match(manage.describe({ kind: 'edital', isActive: true, inWindow: true, visible: false }), /acima do teto de 8/);
  assert.match(manage.describe({ kind: 'blog', isActive: true, inWindow: true, visible: true, endsAt: '2026-11-30T23:00:00Z' }), /sai em 30\/11/);
});

test('edição: data do campo, botão Editar por item e salvar com id', () => {
  assert.equal(manage.toDateInput('2026-11-30T15:00:00'), '2026-11-30');
  assert.equal(manage.toDateInput(null), '');
  assert.equal(manage.toDateInput('lixo'), '');
  const src = ler('highlights-manage.js');
  assert.match(src, /button\('Editar', 'secondary hl-icon-btn', 'Editar: ' \+ item\.title/);
  assert.match(src, /setAttribute\('data-action', 'edit'\)/);
  assert.match(src, /if \(id\) input\.id = id;/);
  assert.match(src, /focusAfter = id \? \{ id: id, action: 'edit' \}/);
  assert.match(HTML, /id="btn-highlight-save"/);
  // automáticos: só texto "Automático", sem botões
  const auto = /hl-row--auto'\);[\s\S]*?autoUl\.appendChild/.exec(src)[0];
  assert.match(auto, /Automático/);
  assert.doesNotMatch(auto, /button\(/);
});

test('fiação: pacote sob demanda, ordem, build, fora do shell e do precache', () => {
  assertSobDemanda('destaques', 'highlights.js');
  assertSobDemanda('destaques', 'highlights-manage.js');
  assertAntes('destaques', 'highlights.js', 'highlights-manage.js');
  assert.ok(ler('scripts/build.js').includes("'highlights.css'"));
  assert.ok(!ler('sw.js').includes("'highlights.css'"), 'o CSS também é sob demanda');
  assert.doesNotMatch(HTML, /highlights\.css/);
});

test('index.html: bloco da Início fora de #home-dashboard, escondido; painel e entradas de menu por capacidade', () => {
  assert.match(HTML, /<section id="home-highlights" class="card home-highlights hidden"><\/section>\s*<div id="home-dashboard" class="home-grid"><\/div>/);
  assert.match(HTML, /<section id="panel-admin-highlights" class="hidden">/);
  assert.match(HTML, /data-panel="panel-admin-highlights" data-cap="home\.curate" data-cap-cargo/);
  assert.match(HTML, /<button type="button" data-panel="panel-admin-highlights">/);
  const painel = /<section id="panel-admin-highlights"[\s\S]*?<\/section>/.exec(HTML)[0];
  for (const id of ['hl-title', 'hl-kind', 'hl-sub', 'hl-link', 'hl-end']) assert.match(painel, new RegExp(`<label for="${id}">[\\s\\S]*?id="${id}"`));
  assert.match(painel, /id="msg-highlights" class="status-msg" role="status" aria-live="polite"/);
  assert.match(painel, /id="btn-highlight-add"[^>]*aria-expanded="false" aria-controls="highlight-form"/);
});

test('app.js: bloco só baixa o pacote com a flag; a tela de gestão pede o pacote; logout esconde', () => {
  const app = ler('app.js');
  assert.match(app, /'panel-admin-highlights': function \(\) \{ withBundle\('destaques'/);
  assert.match(app, /hasAttribute\('data-flag-highlights-enabled'\)/);
  assert.match(app, /withBundle\('destaques', function \(\) \{ if \(window\.LaiftHighlights\) window\.LaiftHighlights\.mount/);
  assert.ok((app.match(/window\.LaiftHighlights\.reset\(document\)/g) || []).length >= 3);
});

test('sem innerHTML, estilo inline nem script inline nos módulos novos', () => {
  for (const f of ['highlights.js', 'highlights-manage.js']) {
    assert.doesNotMatch(ler(f), /\.innerHTML|\.outerHTML|insertAdjacentHTML|\.style\.|document\.write|eval\(/, f);
  }
  const painel = /<section id="panel-admin-highlights"[\s\S]*?<\/section>/.exec(HTML)[0];
  assert.doesNotMatch(painel, /\sstyle=|\sonclick=/);
});

test('versão: sw.js e data-app-version estão iguais (v28 ou maior)', () => {
  const sw = /CACHE_PREFIX \+ 'v(\d+)'/.exec(ler('sw.js'));
  const html = /data-app-version="v(\d+)"/.exec(HTML);
  assert.equal(sw[1], html[1]);
  assert.ok(Number(sw[1]) >= 28);
});

test('CSS: alvos de 44 px e foco visível nos controles do bloco e da gestão', () => {
  const css = ler('highlights.css');
  assert.match(css, /\.hl-card \{[^}]*min-height: 44px/);
  assert.match(css, /\.hl-row__actions button \{[^}]*min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /!important/);
});
