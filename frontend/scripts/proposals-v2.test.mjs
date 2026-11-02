/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Propostas v2 (proposals-v2.js, proposals-v2.css): funções puras, fiação (pacote sob demanda, tela de sempre intacta sem a flag) e regras do código e do CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const mod = require('../proposals-v2.js');
const SRC = ler('proposals-v2.js');
const CSS = ler('proposals-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('código: sem innerHTML, sem estilo inline, só DOM seguro', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(/aria-/.test(SRC));
});

test('textos: a Guia, sem diminutivos nem "grátis"', () => {
  for (const texto of [SRC, CSS, ler('../docs/propostas-v2.md')]) assert.ok(!/gr[áa]tis/i.test(texto));
});

test('CSS: toda regra sob a flag, movimento reduzido, foco visível e tamanhos mínimos', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.replace(/@media[^{]*\{/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const seletor of seletores) {
    for (const parte of seletor.split(',')) assert.ok(parte.trim().startsWith(':root[data-flag-proposals-v2-enabled]'), `fora da flag: ${parte.trim()}`);
  }
  assert.ok(CSS.includes('focus-visible'));
  assert.ok(/min-height: 44px/.test(CSS));
  assert.ok(!/font-size:\s*(1[01]|[0-9])px/.test(CSS), 'fontes de pelo menos 12 px');
});

test('fiação: pacote sob demanda, flag no app.js e tela de sempre sem a flag', () => {
  assertSobDemanda('propostas2', 'proposals-v2.js');
  assert.ok(ler('scripts/build.js').includes("'proposals-v2.css'"));
  assert.ok(APP.includes('data-flag-proposals-v2-enabled'));
  assert.ok(APP.includes("withBundle('propostas2'"));
  assert.ok(APP.includes('else if (window.LaiftProposalsV2) window.LaiftProposalsV2.reset(document)'));
  assert.ok(!HTML.includes('proposals-v2'), 'o index.html não carrega nada da v2');
});

test('mount sem o painel não faz nada', () => {
  assert.equal(mod.mount(null, { getElementById: () => null }), null);
  assert.doesNotThrow(() => mod.reset());
});

test('voteCounts e votingSummary', () => {
  assert.deepEqual(mod.voteCounts([true, false, false]), { total: 3, voted: 1, pending: 2 });
  assert.deepEqual(mod.voteCounts(), { total: 0, voted: 0, pending: 0 });
  assert.equal(mod.votingSummary({ total: 3, voted: 1, pending: 2 }, 'ready').title, '3 votações abertas');
  assert.equal(mod.votingSummary({ total: 3, voted: 1, pending: 2 }, 'ready').sub, '2 aguardam o seu voto');
  assert.equal(mod.votingSummary({ total: 1, voted: 0, pending: 1 }, 'ready').title, '1 votação aberta');
  assert.equal(mod.votingSummary({ total: 2, voted: 2, pending: 0 }, 'ready').canVote, false);
  assert.equal(mod.votingSummary({ total: 0, voted: 0, pending: 0 }, 'ready').title, 'Nenhuma votação aberta');
  assert.equal(mod.votingSummary({ total: 0 }, 'loading').title, 'Carregando votações');
  assert.match(mod.votingSummary({ total: 0 }, 'error').title, /Não foi possível/);
  assert.equal(mod.votingSummary({ total: 1, voted: 0, pending: 1 }, 'ready').canVote, true);
});

test('proposalFilters e matchesFilter: só as situações que existem', () => {
  const f = mod.proposalFilters(['submitted', 'approved', 'approved']);
  assert.deepEqual(f.map((x) => [x.key, x.count]), [['all', 3], ['submitted', 1], ['approved', 2]]);
  assert.equal(f[2].label, 'Aprovada');
  assert.ok(mod.matchesFilter('approved', 'all') && mod.matchesFilter('approved', 'approved') && !mod.matchesFilter('approved', 'submitted'));
  assert.deepEqual(Object.keys(mod.STATUS_LABELS), mod.STATUS_ORDER);
});

test('o formulário de sempre segue com as validações do index.html (título mín. 3, descrição mín. 5)', () => {
  assert.ok(/id="proposal-title"[^>]*minlength="3"/.test(HTML));
  assert.ok(/id="proposal-description"[^>]*minlength="5"/.test(HTML));
  assert.ok(!/\.id\s*=\s*'(proposal-|form-proposal|voting-|my-proposals)/.test(SRC), 'nenhum id de sempre é reatribuído');
  assert.ok(APP.includes("'data-voted'") && APP.includes("'data-status'"));
});
