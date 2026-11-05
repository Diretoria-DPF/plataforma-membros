/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O8: cartão "Desempenho" no Perfil (desempenho.js): pacote sob demanda, formato extensível para outros módulos,
// só da própria pessoa, sem nota/ranking. Lê o mesmo armazenamento que a trilha do Laboratório alimenta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda, assertAntes } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (a) => fs.readFileSync(path.join(raiz, a), 'utf8').replace(/\r\n/g, '\n');
const D = require('../desempenho.js');
const B = require('../modulos/laboratorio/js/lab-boletim.js');
const TRILHA = JSON.parse(ler('modulos/laboratorio/data/trilha/trilha_v1.json'));
const SRC = ler('desempenho.js');

/** DOM mínimo: elementos com filhos, atributos, textContent, busca por id e inserção antes de um nó. */
function fakeDoc() {
  const ids = new Map();
  function make(tag) {
    const el = {
      tag, children: [], attrs: {}, listeners: {}, className: '', textContent: '', parentNode: null, _id: '',
      get firstChild() { return this.children[0] || null; },
      get id() { return this._id; }, set id(v) { this._id = v; ids.set(v, el); },
      get nextSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] || null : null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; },
      insertBefore(c, ref) { c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
      addEventListener(t, fn) { this.listeners[t] = fn; }
    };
    return el;
  }
  const body = make('body');
  const head = make('head');
  const grid = make('div'); grid.id = 'profile-grid'; body.appendChild(grid);
  return { body, head, ids, createElement: make, getElementById: (i) => ids.get(i) || null, querySelector: () => null };
}
const todos = (n) => [n].concat(...n.children.map(todos));
const textos = (n) => todos(n).map((x) => x.textContent).filter(Boolean);
const esperar = () => new Promise((r) => setImmediate(r));

function janela(armazenado) {
  const mem = new Map(armazenado ? [[B.CHAVE, armazenado]] : []);
  const abertos = [];
  return {
    abertos, LabBoletim: B,
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) },
    fetch: async (url) => { assert.equal(url, D.RUBRICA_LAB); return { ok: true, json: async () => TRILHA }; },
    LaiftLearning: { openModule: (id) => abertos.push(id) }
  };
}

test('pacote sob demanda: lab-boletim antes de desempenho.js; fora do shell e do precache; CSS publicado', () => {
  assertSobDemanda('desempenho', 'desempenho.js');
  assertAntes('desempenho', 'modulos/laboratorio/js/lab-boletim.js', 'desempenho.js');
  assert.ok(ler('scripts/build.js').includes("'desempenho.css'"));
  assert.doesNotMatch(ler('index.html'), /desempenho\.(js|css)/);
  assert.ok(!ler('sw.js').includes('desempenho.'));
});

test('app.js monta o cartão ao abrir o Perfil, só com a flag da Início v3', () => {
  assert.match(ler('app.js'), /if \(homeV2On\(\)\) withBundle\('desempenho', function \(\) \{ if \(window\.LaiftDesempenho\) window\.LaiftDesempenho\.mount\(/);
});

test('formato extensível: registrar fonte válida; recusar inválida; trocar fonte do mesmo id', () => {
  D.reset();
  assert.throws(() => D.registrarFonte({ id: 'Quiz', nome: 'x', carregar() {} }));
  assert.throws(() => D.registrarFonte({ id: 'quiz', nome: 'x' }));
  assert.equal(D.registrarFonte({ id: 'quiz', nome: 'Quiz', carregar: async () => ({}) }), 1);
  assert.equal(D.registrarFonte({ id: 'atlas', nome: 'Atlas', carregar: async () => ({}) }), 2);
  assert.equal(D.registrarFonte({ id: 'quiz', nome: 'Quiz 2', carregar: async () => ({}) }), 2);
  D.reset();
});

test('normalizarPainel descarta item com nível desconhecido e sugestão malformada', () => {
  const p = D.normalizarPainel({ itens: [{ id: 'a', nome: 'A', nivel: 'proficiente', rotulo: 'Proficiente' }, { id: 'b', nome: 'B', nivel: 'nota_10', rotulo: 'x' }, null], sugestao: { nome: 5 } });
  assert.deepEqual(p, { itens: [{ id: 'a', nome: 'A', nivel: 'proficiente', rotulo: 'Proficiente', texto: '' }], sugestao: null });
  assert.deepEqual(D.normalizarPainel(null), { itens: [], sugestao: null });
});

test('cartão no Perfil: Laboratório com as seis competências, valor em texto, "Praticar X" e atalho para a trilha', async () => {
  D.reset();
  const j = janela(JSON.stringify({ v: 1, c: { tecnica: { acertos: 5, erros: 0, dicas: 0, pulos: 0, foraDeOrdem: 0, semApoio: 2 } } }));
  D.registrarFonte(D.fonteLab(j));
  D.registrarFonte({ id: 'quiz', nome: 'Quiz', carregar: async () => ({ itens: [{ id: 'q', nome: 'Toxicologia', nivel: 'iniciando', rotulo: 'Iniciando' }], sugestao: { id: 'q', nome: 'Toxicologia' } }) });
  const doc = fakeDoc();
  const card = D.mount({}, doc);
  await esperar(); await esperar(); await esperar();
  const itens = todos(card).filter((n) => n.tag === 'li');
  assert.equal(itens.filter((n) => n.attrs['data-nivel']).length, 7, 'seis do Laboratório + um do Quiz');
  const t = textos(card).join('\n');
  assert.match(t, /Técnica de bancada/);
  assert.match(t, /Domínio/, 'cinco acertos, dois sem apoio');
  assert.match(t, /Praticar Segurança e EPI\./);
  assert.match(t, /Praticar Toxicologia\./);
  assert.match(t, /Só você vê/);
  assert.doesNotMatch(t, /ranking|posição \d|nota \d|revisad|rascunho|\bIA\b/i);
  const meters = todos(card).filter((n) => n.tag === 'meter');
  assert.ok(meters.length === 7 && meters.every((m) => m.attrs['aria-label'] && m.attrs.max === '4'));
  const atalho = todos(card).find((n) => n.tag === 'button' && /trilha do Laboratório/.test(n.textContent));
  atalho.listeners.click();
  assert.deepEqual(j.abertos, ['lab']);
  assert.equal(D.mount({}, doc), card, 'montar de novo reaproveita o cartão');
  D.reset();
});

test('falha de uma fonte não derruba as outras; mensagem fixa, sem detalhe do erro', async () => {
  D.reset();
  D.registrarFonte({ id: 'ruim', nome: 'Ruim', carregar: async () => { throw new Error('segredo interno'); } });
  D.registrarFonte({ id: 'bom', nome: 'Bom', carregar: async () => ({ itens: [], sugestao: null }) });
  const doc = fakeDoc();
  const card = D.mount({}, doc);
  await esperar(); await esperar();
  const t = textos(card).join('\n');
  assert.match(t, /Não foi possível carregar este desempenho agora/);
  assert.match(t, /Bom/);
  assert.doesNotMatch(t, /segredo interno/);
  D.reset();
});

test('sem armazenamento (bloqueado) o Laboratório aparece sem registro, sem erro', async () => {
  D.reset();
  const j = janela();
  j.localStorage = { getItem() { throw new Error('bloqueado'); } };
  D.registrarFonte(D.fonteLab(j));
  const card = D.mount({}, fakeDoc());
  await esperar(); await esperar(); await esperar();
  assert.match(textos(card).join('\n'), /Sem registro/);
  D.reset();
});

test('segurança: só busca a rubrica fixa; sem innerHTML, eval, beacon, WebSocket nem XHR', () => {
  assert.doesNotMatch(SRC, /innerHTML|insertAdjacentHTML|eval\(|sendBeacon|WebSocket|XMLHttpRequest|document\.write/);
  assert.equal((SRC.match(/\.fetch\(/g) || []).length, 1);
  assert.equal(D.RUBRICA_LAB, 'modulos/laboratorio/data/trilha/trilha_v1.json');
});

test('CSS do cartão: em fluxo normal, sem position fixed/absolute/sticky', () => {
  assert.doesNotMatch(ler('desempenho.css'), /position\s*:/);
});
