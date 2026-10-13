/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia: "Artigos na Biblioteca" (references) e "Ver na Biblioteca" com a busca pronta (query).
// Tudo vindo do servidor é dado não confiável: texto por textContent, link só de host permitido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);
const Sources = require('../assistant-sources.js');
const Lia = require('../assistant.js');

function makeDoc() {
  const create = (tag) => {
    const n = { tag, className: '', children: [], attrs: {}, textContent: '' };
    n.appendChild = (c) => { n.children.push(c); return c; };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    Object.defineProperty(n, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
    return n;
  };
  return { createElement: create };
}
const walk = (node, out = []) => { out.push(node); node.children.forEach((c) => walk(c, out)); return out; };

const REF = { id: 'a-1', title: 'Paracetamol e o fígado', authors: 'Silva A, Souza B et al.', journal: 'Rev Toxicol', year: 2021, url: 'https://doi.org/10.1000/x1' };

test('sanitizeReferences: até 3, só com título e url de doi.org ou PubMed; ano válido; texto curto', () => {
  const out = Sources.sanitizeReferences([
    REF,
    { ...REF, id: 'a-2', url: 'https://pubmed.ncbi.nlm.nih.gov/123456/' },
    { ...REF, id: 'a-3', url: 'https://evil.example/doi.org/x' },
    { ...REF, id: 'a-4', url: 'http://doi.org/10.1/x' },
    { ...REF, id: 'a-5', url: 'javascript:alert(1)' },
    { ...REF, id: 'a-6', title: '   ' },
    { ...REF, id: 'a-7', url: 'https://doi.org.evil.example/x' },
    { ...REF, id: 'a-8', url: 'https://doi.org/x y' },
    { ...REF, id: 'a-9', year: 'ontem', title: 'T'.repeat(500) },
    { ...REF, id: 'a-10' }, { ...REF, id: 'a-11' },
    null, 'texto', 42,
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { title: REF.title, authors: REF.authors, journal: REF.journal, year: 2021, url: REF.url });
  assert.equal(out[1].url, 'https://pubmed.ncbi.nlm.nih.gov/123456/');
  assert.equal(out[2].year, null);
  assert.ok(out[2].title.length <= 300);
  assert.deepEqual(Sources.sanitizeReferences(null), []);
  assert.deepEqual(Sources.sanitizeReferences('x'), []);
});

test('renderReferences: título "Artigos na Biblioteca", link com href do host da lista fixa, resto por textContent', () => {
  const doc = makeDoc();
  const box = Sources.renderReferences(doc, Sources.sanitizeReferences([REF, { ...REF, url: 'https://pubmed.ncbi.nlm.nih.gov/9/', title: '<b>x</b>' }]));
  const nodes = walk(box);
  assert.equal(nodes.find((n) => n.className === 'lia-sources-title').textContent, 'Artigos na Biblioteca');
  const links = nodes.filter((n) => n.tag === 'a');
  assert.equal(links.length, 2);
  assert.equal(links[0].attrs.href, 'https://doi.org/10.1000/x1');
  assert.equal(links[0].attrs.target, '_blank');
  assert.match(links[0].attrs.rel, /noopener/);
  assert.equal(links[1].attrs.href, 'https://pubmed.ncbi.nlm.nih.gov/9/');
  assert.equal(links[1].textContent, '<b>x</b>'); // texto puro, nunca HTML
  const meta = nodes.filter((n) => n.className === 'lia-reference-meta');
  assert.equal(meta[0].textContent, ' Silva A, Souza B et al. · Rev Toxicol · 2021');
});

test('renderReferences: entrada com url fora da regra não vira link (defesa em profundidade)', () => {
  const box = Sources.renderReferences(makeDoc(), [{ ...REF, url: 'https://evil.example/x' }]);
  assert.equal(walk(box).filter((n) => n.tag === 'a').length, 0);
});

test('cleanQuery: texto simples, sem controle nem marcação, até 120', () => {
  assert.equal(Sources.cleanQuery('  paracetamol   hepático  '), 'paracetamol hepático');
  assert.equal(Sources.cleanQuery('<script>x</script> dose'), 'script x /script dose');
  assert.equal(Sources.cleanQuery('a\u0000b\nc'), 'a b c');
  assert.equal(Sources.cleanQuery('x'.repeat(300)).length, 120);
  for (const bad of [null, undefined, 42, {}, [], { toString: () => 'dose' }]) assert.equal(Sources.cleanQuery(bad), '');
});

test('sanitizeActions mantém a busca (query limpa) SÓ em open_library; nos outros botões ela é descartada', () => {
  const out = Lia.sanitizeActions([
    { type: 'open_library', target: 'search', label: 'Ver na Biblioteca', query: '  paracetamol   hepático ' },
    { type: 'navigate', target: 'panel-library', label: 'Biblioteca', query: 'dose' },
  ]);
  assert.deepEqual(out[0], { type: 'open_library', target: 'search', label: 'Ver na Biblioteca', query: 'paracetamol hepático' });
  assert.deepEqual(out[1], { type: 'navigate', target: 'panel-library', label: 'Biblioteca' });
  assert.deepEqual(Lia.sanitizeActions([{ type: 'open_library', target: 'search', label: 'Ver', query: { x: 1 } }]), [{ type: 'open_library', target: 'search', label: 'Ver' }]);
});

test('o botão "Ver na Biblioteca" prepara a busca ANTES de abrir o painel; sem query só abre', () => {
  const src = read('assistant.js');
  const at = src.indexOf("action.type === 'open_library'");
  const block = src.slice(at, at + 400);
  assert.ok(block.indexOf('searchFor(action.query)') !== -1 && block.indexOf('searchFor') < block.indexOf("showPanel('panel-library')"));
  assert.match(block, /action\.query && root\.LaiftLibrary/);
});

test('as referências entram na mensagem da Lia sem tocar nas fontes (assistant.js usa só o módulo de fontes)', () => {
  const src = read('assistant.js');
  assert.match(src, /references: Sources\.sanitizeReferences\(res\.references\)/);
  assert.match(src, /Sources\.renderReferences\(ui\.doc, msg\.references\)/);
  assert.doesNotMatch(src, /innerHTML/);
  assert.ok(src.split('\n').length < 760);
});
