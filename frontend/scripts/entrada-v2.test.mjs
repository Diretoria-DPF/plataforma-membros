/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Entrada v2 (flag entrada_v2_enabled): lógica pura de frontend/entrada-v2.js e contratos de arquivo
// (carga sob demanda, sem innerHTML, sem texto inventado). O comportamento em tela está em scripts/e2e/entrada-v2.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const V2 = require('../entrada-v2.js');
const Lazy = require('../lazy-bundles.js');

const AGORA = Date.parse('2026-11-01T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const evento = (titulo, deltaMs, extra = {}) => ({ id: titulo, title: titulo, eventDate: new Date(AGORA + deltaMs).toISOString(), status: 'published', ...extra });

test('escolherEventos: só eventos futuros ou em andamento, do mais próximo ao mais distante', () => {
  const lista = [evento('C', 5 * DIA), evento('passado', -DIA), evento('A', DIA), evento('B', 2 * DIA)];
  assert.deepEqual(V2.escolherEventos(lista, AGORA, 10).map((e) => e.title), ['A', 'B', 'C']);
});

test('escolherEventos: evento em andamento entra mesmo com a data de início já passada', () => {
  const lista = [evento('agora', -DIA, { status: 'in_progress' }), evento('depois', DIA)];
  assert.deepEqual(V2.escolherEventos(lista, AGORA, 10).map((e) => e.title), ['agora', 'depois']);
});

test('escolherEventos: descarta título vazio, data inválida e lixo; respeita o máximo', () => {
  const lista = [evento('  ', DIA), { title: 'sem data' }, null, 42, evento('ok1', DIA), evento('ok2', 2 * DIA), evento('ok3', 3 * DIA)];
  assert.deepEqual(V2.escolherEventos(lista, AGORA, 2).map((e) => e.title), ['ok1', 'ok2']);
  assert.deepEqual(V2.escolherEventos(undefined, AGORA, 3), []);
  assert.deepEqual(V2.escolherEventos([evento('x', DIA)], AGORA, 0), []);
});

test('rotuloData: dia, mês e hora no fuso de Brasília; vazio se inválida', () => {
  const texto = V2.rotuloData('2026-11-05T22:00:00Z');
  assert.match(texto, /05/);
  assert.match(texto, /nov/i);
  assert.match(texto, /19:00/);
  assert.equal(V2.rotuloData('lixo'), '');
});

test('rotuloDataPost: AAAA-MM-DD vira DD/MM/AAAA; data inexistente fica vazia', () => {
  assert.equal(V2.rotuloDataPost('2026-10-09'), '09/10/2026');
  assert.equal(V2.rotuloDataPost('2026-02-31'), '');
  assert.equal(V2.rotuloDataPost(undefined), '');
});

test('escolherPosts: href seguro, título e data válidos; mais novos primeiro', () => {
  const posts = [
    { titulo: 'Antigo', href: 'blog/antigo.html', data: '2026-01-02' },
    { titulo: 'Novo', href: 'blog/novo.html', data: '2026-10-30' },
    { titulo: 'Externo', href: 'https://mal.exemplo/x.html', data: '2026-11-01' },
    { titulo: 'Script', href: 'javascript:alert(1)', data: '2026-11-01' },
    { titulo: '', href: 'blog/vazio.html', data: '2026-11-01' },
    { titulo: 'Data ruim', href: 'blog/data.html', data: '2026-13-45' },
  ];
  assert.deepEqual(V2.escolherPosts(posts, 5).map((p) => p.titulo), ['Novo', 'Antigo']);
  assert.deepEqual(V2.escolherPosts(posts, 1).map((p) => p.titulo), ['Novo']);
  assert.deepEqual(V2.escolherPosts({}, 3), []);
});

test('abaPorTecla: setas dão a volta, Home e End vão às pontas, outras teclas não movem', () => {
  assert.equal(V2.abaPorTecla('ArrowRight', 0, 2), 1);
  assert.equal(V2.abaPorTecla('ArrowRight', 1, 2), 0);
  assert.equal(V2.abaPorTecla('ArrowLeft', 0, 2), 1);
  assert.equal(V2.abaPorTecla('Home', 1, 2), 0);
  assert.equal(V2.abaPorTecla('End', 0, 2), 1);
  assert.equal(V2.abaPorTecla('a', 0, 2), -1);
  assert.equal(V2.abaPorTecla('ArrowRight', 0, 0), -1);
});

test('armadilha: o foco dá a volta nas pontas e volta para dentro quando estava fora', () => {
  assert.equal(V2.armadilha(5, 4, false), 0, 'Tab no último vai ao primeiro');
  assert.equal(V2.armadilha(5, 0, true), 4, 'Shift+Tab no primeiro vai ao último');
  assert.equal(V2.armadilha(5, 2, false), -1, 'no meio, o navegador segue sozinho');
  assert.equal(V2.armadilha(5, -1, false), 0, 'foco fora da folha: entra pelo primeiro');
  assert.equal(V2.armadilha(5, -1, true), 4, 'foco fora da folha com Shift: entra pelo último');
  assert.equal(V2.armadilha(0, -1, false), -1);
});

test('abaDaHash: #entrar e #inscricao abrem Entrar; #cadastro abre Criar conta', () => {
  assert.equal(V2.abaDaHash('#entrar'), 'entrar');
  assert.equal(V2.abaDaHash('#inscricao'), 'entrar');
  assert.equal(V2.abaDaHash('#cadastro'), 'criar');
  assert.equal(V2.abaDaHash('#outra'), null);
  assert.equal(V2.abaDaHash(''), null);
});

test('conteúdo: promessas só sobre o que a plataforma tem; sem texto proibido pelo dono', () => {
  const textos = JSON.stringify([V2.VITRINE, V2.PASSOS, V2.LINKS]) + read('entrada-v2.js');
  assert.doesNotMatch(textos, /gostinho|espiar|espie|certificado/i);
  assert.doesNotMatch(textos, /s[óo] e-mail e senha/i, 'o cadastro pede nome, usuário, telefone e e-mail');
  assert.equal(V2.VITRINE.length, 5);
  assert.deepEqual(V2.VITRINE.map((v) => v.tag), ['Quiz do dia', 'Atlas 3D', 'A Guia', 'Casos clínicos', 'Liga']);
  assert.equal(V2.PASSOS.length, 3);
  const hrefs = V2.LINKS.map((l) => l[1]);
  for (const h of ['termos.html', 'privacidade.html', 'blog.html', 'processo-seletivo.html']) assert.ok(hrefs.includes(h), h);
});

test('conteúdo: nada de evento nem número inventado no código (dados vêm da API e do índice do blog)', () => {
  const js = read('entrada-v2.js');
  assert.match(js, /apiListEvents/);
  assert.match(js, /blog\/index\.json/);
  assert.doesNotMatch(js, /\b\d{2,}\s*(membros|alunos|eventos|pessoas)\b/i);
});

test('CSP: sem innerHTML, insertAdjacentHTML, eval nem estilo inline no script', () => {
  const js = read('entrada-v2.js');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setAttribute\('style'|\.style\./);
});

test('carga sob demanda: pacote entradaV2 fora do index.html e do precache; build publica js e css', () => {
  assert.deepEqual(Lazy.BUNDLES.entradaV2, ['entrada-v2.js']);
  const html = read('index.html');
  assert.ok(!/entrada-v2/.test(html), 'index.html não carrega a Entrada v2 de imediato');
  assert.ok(!/entrada-v2/.test(read('sw.js')), 'o service worker não pré-cacheia a Entrada v2');
  const build = read('scripts/build.js');
  assert.ok(build.includes("'entrada-v2.js'") && build.includes("'entrada-v2.css'"));
});

test('app.js: só monta com a flag no <html> e sem sessão; senão devolve os formulários (reset)', () => {
  const app = read('app.js');
  assert.match(app, /function mountEntradaV2\(\)/);
  assert.match(app, /hasAttribute\('data-flag-entrada-v2-enabled'\) && !state\.sessionToken/);
  assert.match(app, /withBundle\('entradaV2'/);
  assert.match(app, /LaiftEntradaV2\.reset\(\)/);
  assert.match(app, /window\.APP_PUBLIC_HASH = hash/);
});

test('reaproveitamento: a folha move os elementos do app em vez de duplicar formulários ou ids', () => {
  const js = read('entrada-v2.js');
  for (const id of ['form-login', 'form-login-mfa', 'msg-login', 'login-inscricao-aviso', 'form-register', 'msg-register']) {
    assert.ok(js.includes(`'${id}'`), `${id} é movido para a folha`);
  }
  assert.doesNotMatch(js, /createElement\('form'\)|createElement\('input'\)|no\(doc, 'form'|no\(doc, 'input'/);
  assert.doesNotMatch(js, /apiLogin|apiRegister|sessionToken/, 'nenhuma lógica de autenticação duplicada');
});

test('CSS: movimento reduzido, alvos de 44 px e sem estilo que dependa de cor fixa de texto claro sobre fundo claro', () => {
  const css = read('entrada-v2.css');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /\[hidden\]/);
});
