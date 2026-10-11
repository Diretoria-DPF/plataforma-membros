/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes de frontend/biblioteca/catalogo.js (CONTRATO-B2 §2.2 e §8): normalização igual à do
// Worker (searchNorm, CONTRATO-B1 §5), filtros combinados, contagem, validação do índice
// e higiene do JS e do CSS (sem innerHTML, sem style, hover só com ponteiro, só tokens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(frontend, '..');
const catalogo = require('../biblioteca/catalogo.js');
const { normalizar, filtrar, contagem, validarIndice, ATRASO_DIGITACAO } = catalogo;

// Fonte da verdade: searchNorm do Worker. Importa o ESM direto para que o teste quebre se a regra divergir.
const { searchNorm } = await import(
  pathToFileURL(path.join(repo, 'worker', 'src', 'library', 'normalize.js')).href
);

const lerArquivo = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');

const FRASES = [
  'Farmacocinética da Dipirona',
  'Ação antimicrobiana: ensaio clínico',
  'Toxicologia ÁGUA, óleo & sal!',
  'Fármacos — revisão (2020)',
  'Relato de caso: intoxicação por Paracetamol',
  'Ômega-3 e função cardíaca',
  'DOI 10.1000/XYZ.123',
  'PMID: 12345678',
  'Crianças, adultos e idosos?',
  'Ação   múltipla\tcom\tespaços',
];

/** Item como o gerador grava em index.json: `n` é o searchNorm do registro. */
function item(id, extra) {
  const base = { id, title: extra.title, authors: extra.authors ?? [], journal: extra.journal ?? '' };
  return {
    id,
    title: base.title,
    authors: base.authors.map((a) => ({ family: a.family, given: '' })),
    journal: base.journal,
    year: extra.year ?? null,
    type: extra.type ?? 'artigo',
    topics: extra.topics ?? [],
    openAccess: extra.openAccess ?? false,
    license: 'desconhecida',
    url: 'https://doi.org/10.1000/' + id,
    doi: '10.1000/' + id,
    n: searchNorm(base),
  };
}

const ITENS = [
  item('a1', { title: 'Farmacocinética da dipirona', authors: [{ family: 'Silva' }], journal: 'Rev Farm', year: 2021, topics: ['farmacologia'], type: 'artigo', openAccess: true }),
  item('a2', { title: 'Intoxicação por paracetamol em adultos', authors: [{ family: 'Souza' }], journal: 'Rev Tox', year: 2019, topics: ['toxicologia'], type: 'relato_caso', openAccess: false }),
  item('a3', { title: 'Revisão sobre dipirona e analgesia', authors: [{ family: 'Lima' }], journal: 'Arq Med', year: 2020, topics: ['farmacologia', 'toxicologia'], type: 'revisao', openAccess: true }),
  item('a4', { title: 'Ensaio sem ano informado', authors: [{ family: 'Costa' }], journal: 'Jornal X', year: null, topics: ['farmacologia'], type: 'ensaio_clinico', openAccess: false }),
];

const ids = (lista) => lista.map((i) => i.id);

test('normalizar é igual ao searchNorm do Worker em 10 frases', () => {
  for (const frase of FRASES) {
    assert.equal(normalizar(frase), searchNorm({ title: frase }), frase);
  }
});

test('normalizar tira acento, põe minúsculas e troca pontuação por espaço', () => {
  assert.equal(normalizar('Ação, DIPIRONA!'), 'acao dipirona');
  assert.equal(normalizar('  10.1000/XYZ  '), '10.1000/xyz');
  assert.equal(normalizar(null), '');
});

test('filtrar sem filtros devolve todos os itens', () => {
  assert.deepEqual(ids(filtrar(ITENS, {})), ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(ids(filtrar(ITENS, { q: '   ', area: '', tipo: '', de: '', ate: '' })), ['a1', 'a2', 'a3', 'a4']);
});

test('filtrar busca por termos em AND, sem acento e sem caixa', () => {
  assert.deepEqual(ids(filtrar(ITENS, { q: 'silva dipirona' })), ['a1']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'DIPIRONA' })), ['a1', 'a3']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'farmacocinetica' })), ['a1']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'dipirona paracetamol' })), []);
});

test('filtrar por área, tipo, ano e acesso aberto, sozinhos', () => {
  assert.deepEqual(ids(filtrar(ITENS, { area: 'toxicologia' })), ['a2', 'a3']);
  assert.deepEqual(ids(filtrar(ITENS, { tipo: 'revisao' })), ['a3']);
  assert.deepEqual(ids(filtrar(ITENS, { de: 2020, ate: 2021 })), ['a1', 'a3']);
  assert.deepEqual(ids(filtrar(ITENS, { de: 2020 })), ['a1', 'a3']);
  assert.deepEqual(ids(filtrar(ITENS, { ate: 2019 })), ['a2']);
  assert.deepEqual(ids(filtrar(ITENS, { aberto: true })), ['a1', 'a3']);
  assert.deepEqual(ids(filtrar(ITENS, { aberto: false })), ['a1', 'a2', 'a3', 'a4']);
});

test('filtrar combina busca e filtros, todos em AND', () => {
  assert.deepEqual(ids(filtrar(ITENS, { q: 'dipirona', area: 'farmacologia', aberto: true })), ['a1', 'a3']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'dipirona', tipo: 'revisao', de: 2020, ate: 2020 })), ['a3']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'dipirona', area: 'toxicologia', aberto: true })), ['a3']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'dipirona', area: 'toxicologia', de: 2021 })), []);
});

test('filtro de ano deixa de fora item sem ano', () => {
  assert.deepEqual(ids(filtrar(ITENS, { q: 'ensaio' })), ['a4']);
  assert.deepEqual(ids(filtrar(ITENS, { q: 'ensaio', de: 1800 })), []);
});

test('contagem: vazio, singular e plural', () => {
  assert.equal(contagem(0), 'Nenhum artigo com esses filtros.');
  assert.equal(contagem(1), '1 artigo');
  assert.equal(contagem(3), '3 artigos');
});

test('validarIndice aceita o formato versao 1 e descarta item sem id ou n', () => {
  assert.equal(validarIndice(null), null);
  assert.equal(validarIndice({ versao: 1 }), null);
  assert.equal(validarIndice({ versao: 2, items: [] }), null);
  assert.equal(validarIndice({ versao: 1, items: 'x' }), null);
  const valido = validarIndice({
    versao: 1,
    items: [ITENS[0], { id: 'sem-n' }, { n: 'sem id' }, null],
  });
  assert.deepEqual(ids(valido), ['a1']);
});

test('espera de digitação é 250 ms', () => {
  assert.equal(ATRASO_DIGITACAO, 250);
});

test('JS do catálogo: sem innerHTML, outerHTML, insertAdjacentHTML nem style', () => {
  const js = lerArquivo('biblioteca/catalogo.js');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(js, /\.style\b|['"]style['"]|style=/);
  assert.doesNotMatch(js, /\son[a-z]+\s*=/);
});

test('CSS: sem media de movimento próprio e hover só em (hover: hover)', () => {
  const css = lerArquivo('biblioteca.css');
  assert.doesNotMatch(css, /prefers-reduced-motion/);
  const inicio = css.indexOf('@media (hover: hover)');
  assert.notEqual(inicio, -1, 'falta o bloco @media (hover: hover)');
  const abre = css.indexOf('{', inicio);
  let profundidade = 0;
  let fim = abre;
  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === '{') profundidade += 1;
    if (css[i] === '}') profundidade -= 1;
    if (profundidade === 0) { fim = i; break; }
  }
  const bloco = css.slice(inicio, fim + 1);
  const totalHover = (css.match(/:hover/g) || []).length;
  assert.ok(totalHover > 0, 'deveria haver ao menos um :hover');
  assert.equal((bloco.match(/:hover/g) || []).length, totalHover);
});

test('CSS: só classes bib-* e só cores por token', () => {
  const css = lerArquivo('biblioteca.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = [...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  assert.ok(classes.length > 0);
  for (const nome of classes) assert.ok(nome.startsWith('bib-'), `classe fora do padrão: ${nome}`);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla)\(/);
});

test('CSS: alvos de toque com 44 px nos controles', () => {
  const css = lerArquivo('biblioteca.css');
  const regra = (seletor) => {
    const ini = css.indexOf(seletor);
    assert.notEqual(ini, -1, `falta a regra ${seletor}`);
    return css.slice(css.indexOf('{', ini), css.indexOf('}', ini));
  };
  assert.match(regra('.bib-limpar'), /min-height:\s*var\(--laift-touch\)/);
  assert.match(regra('.bib-filtros input[type="search"]'), /min-height:\s*var\(--laift-touch\)/);
  assert.match(regra('.bib-filtros select'), /min-height:\s*var\(--laift-touch\)/);
});

test('CSS: esconde o formulário e as linhas com o atributo hidden', () => {
  const css = lerArquivo('biblioteca.css');
  assert.match(css, /\.bib-filtros\[hidden\]\s*{\s*display:\s*none;?\s*}/);
  assert.match(css, /\.bib-lista\s*>\s*li\[hidden\]\s*{\s*display:\s*none;?\s*}/);
});
