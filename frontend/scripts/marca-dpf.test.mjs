/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Marca da autoria técnica (dpflabs): onde ela pode aparecer, o toque triplo dos créditos, o selo da
// abertura, a marca d'água do 404 e o humans.txt. Sem telemetria: nada aqui grava ou envia dados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(frontend, '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const Sobre = require('../sobre.js');
const Marca = require('../modulos/shared/dpf-marca.js');
const Splash = require('../splash.js');

/** Arquivos em que o nome pode aparecer (caminho relativo à raiz do repositório). */
const PERMITIDOS = new Set([
  'frontend/index.html', // Perfil > Sobre e <meta name="author">
  'frontend/creditos.js', // tela de créditos (easter egg)
  'frontend/404.html', // meta author (e marca d'água sem texto)
  'frontend/humans.txt',
  'frontend/_headers', // frame-ancestors da /demo embutida no portfólio (cabeçalho, nunca texto visível)
  'frontend/scripts/marca-dpf.test.mjs',
  'frontend/scripts/e2e/marca.e2e.js',
  'LICENSE',
  'README.md',
]);

function arquivosDeTexto() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean).filter((f) => /\.(html|js|mjs|css|json|md|txt|toml|webmanifest|svg|yml|yaml)$/i.test(f)
    && !/(^|\/)(node_modules|dist|vendor|models)\//.test(f) && !/package-lock\.json$/.test(f));
}

test('o nome dpflabs só aparece nos arquivos permitidos', () => {
  const fora = arquivosDeTexto().filter((f) => {
    const abs = path.join(repo, f);
    if (!fs.existsSync(abs)) return false;
    return /dpflabs/i.test(fs.readFileSync(abs, 'utf8')) && !PERMITIDOS.has(f);
  });
  assert.deepEqual(fora, [], `dpflabs fora da lista permitida: ${fora.join(', ')}`);
});

test('index.html: dpflabs.com só no Sobre do Perfil e no meta author, nunca em rodapé', () => {
  const html = read('index.html');
  assert.equal((html.match(/dpflabs\.com/g) || []).length, 3, 'meta author + link + texto do Sobre');
  assert.match(html, /<meta name="author" content="dpflabs\.com">/);
  assert.match(html, /<link rel="author" href="\/humans\.txt">/);
  const sobre = /<div class="card sobre-card" id="about-card">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(sobre, 'cartão Sobre existe');
  assert.match(sobre[1], /Plataforma desenvolvida por <a href="https:\/\/dpflabs\.com" target="_blank" rel="noopener noreferrer">dpflabs\.com<\/a>/);
  assert.match(sobre[1], /<button type="button" id="about-version"/);
  for (const m of html.matchAll(/<footer[^>]*>([\s\S]*?)<\/footer>/g)) assert.ok(!/dpflabs/.test(m[1]), 'rodapé sem a marca');
  // O Sobre é o último cartão do painel do Perfil.
  const perfil = html.slice(html.indexOf('id="panel-profile"'));
  assert.ok(perfil.indexOf('id="about-card"') > perfil.indexOf('id="btn-app-update"'));
});

test('páginas públicas e geradas do blog: rodapé sem o crédito', () => {
  for (const f of ['liga.html', 'blog.html', 'edital.html', 'processo-seletivo.html', 'biblioteca.html', 'scripts/build-blog.js']) {
    const txt = read(f);
    assert.ok(!/desenvolvido por/i.test(txt), `${f} ainda exibe "desenvolvido por"`);
  }
});

test('toque triplo: três toques na janela abrem; fora da janela ou só dois, não', () => {
  assert.equal(Sobre.TAPS_NEEDED, 3);
  assert.equal(Sobre.TAP_WINDOW_MS, 1200);
  let tap = Sobre.createTapCounter(Sobre.TAPS_NEEDED, Sobre.TAP_WINDOW_MS);
  assert.equal(tap(0), false);
  assert.equal(tap(400), false);
  assert.equal(tap(1100), true, 'terceiro toque dentro de 1,2 s');
  assert.equal(tap(1200), false, 'a contagem recomeça depois de abrir');
  tap = Sobre.createTapCounter(3, 1200);
  tap(0); tap(500);
  assert.equal(tap(1300), false, 'o primeiro toque saiu da janela');
  assert.equal(tap(1400), true, 'três toques seguidos na janela (500, 1300, 1400)');
  tap = Sobre.createTapCounter(3, 1200);
  assert.equal(tap(0), false);
  assert.equal(tap(2000), false);
  assert.equal(tap(4000), false, 'toques lentos nunca somam');
});

test('Sobre: preenche a versão do <html> e o toque triplo pede o pacote "creditos"', () => {
  const clicks = [];
  const btn = { textContent: '', addEventListener: (_, fn) => clicks.push(fn) };
  const pedidos = [];
  const win = {
    document: { getElementById: (id) => (id === 'about-version' ? btn : null), documentElement: { getAttribute: () => 'v39' } },
    LaiftLazy: { load: (nome) => { pedidos.push(nome); return Promise.resolve(nome); } },
  };
  Sobre.start(win);
  assert.equal(btn.textContent, 'Versão v39');
  clicks[0](); clicks[0]();
  assert.deepEqual(pedidos, []);
  clicks[0]();
  assert.deepEqual(pedidos, ['creditos']);
});

test('monograma: uma cor (currentColor), decorativo, mesma geometria do 404', () => {
  const attrs = {};
  const filhos = [];
  const doc = { createElementNS: (_, tag) => ({ tag, a: {}, setAttribute(k, v) { this.a[k] = v; }, appendChild(c) { filhos.push(c); } }) };
  const svg = Marca.create(doc, { className: 'x', width: 34 });
  assert.equal(svg.a.stroke, 'currentColor');
  assert.equal(svg.a['aria-hidden'], 'true');
  assert.equal(svg.a.viewBox, Marca.VIEWBOX);
  assert.equal(filhos[0].a.d, Marca.PATH);
  Object.assign(attrs, svg.a);
  const html404 = read('404.html');
  assert.ok(html404.includes(`d="${Marca.PATH}"`), 'o 404 usa o mesmo desenho');
  assert.match(html404, /<svg class="marca-dagua"[^>]*aria-hidden="true"/);
  assert.match(read('styles.css'), /\.marca-dagua \{[^}]*opacity: 0\.25[^}]*pointer-events: none/);
  assert.ok(!/<svg class="marca-dagua"[^>]*style=/.test(html404), 'sem estilo inline');
});

test('abertura: selo apagado, sem captura de toque, movimento reduzido pelo bloco único dos tokens', () => {
  const css = read('splash.css');
  const bloco = /\.splash-selo \{([^}]*)\}/.exec(css)[1];
  assert.match(bloco, /animation: splash-selo var\(--dur-slow\)/);
  assert.match(bloco, /opacity: 0\.5/);
  assert.match(bloco, /pointer-events: none/);
  assert.match(css, /@keyframes splash-selo \{\s*from \{ opacity: 0; \}\s*to \{ opacity: 0\.5; \}/);
  assert.equal(Splash.MIN_VISIBLE_MS, 900, 'o tempo da abertura não mudou');
  assert.match(read('splash.js'), /root\.LaiftMarca/);
  const html = read('index.html');
  assert.ok(html.indexOf('modulos/shared/dpf-marca.js') < html.indexOf('src="splash.js"'), 'monograma carrega antes da abertura');
});

test('créditos: sob demanda, diálogo acessível, sem innerHTML, fechar de 44 px, movimento reduzido', () => {
  const { BUNDLES } = require('../lazy-bundles.js');
  assert.deepEqual(BUNDLES.creditos, ['creditos.js']);
  const index = read('index.html');
  assert.ok(!index.includes('src="creditos.js"'), 'fora da carga inicial');
  assert.ok(!read('sw.js').includes("'creditos.js'"), 'fora do pré-cache');
  const build = read('scripts/build.js');
  for (const f of ['creditos.js', 'creditos.css', 'sobre.js', 'humans.txt']) assert.ok(build.includes(`'${f}'`), `build publica ${f}`);
  const js = read('creditos.js');
  assert.match(js, /setAttribute\('role', 'dialog'\)/);
  assert.match(js, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(js, /setAttribute\('data-close', ''\)/, 'o Voltar do Android (panel-history.js) clica neste botão');
  assert.match(js, /evt\.key === 'Escape'/);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
  assert.ok(!/fetch\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|console\./.test(js + read('sobre.js')), 'sem telemetria nem registro');
  const css = read('creditos.css');
  assert.match(css, /\.creditos__fechar \{[^}]*min-height: 44px/);
  assert.doesNotMatch(css, /prefers-reduced-motion/, 'o bloco único dos tokens já zera a animação');
  assert.match(css, /transform: translateX\(-100%\);\s*animation: creditos-passa/, 'sem animação o nome fica fora da tela');
  assert.match(css, /@keyframes creditos-passa/);
  assert.ok(!/getContext|createElement('canvas')/.test(js), 'sem canvas');
});

test('humans.txt: sem dados pessoais, publicado pelo build; sem mudar a CSP', () => {
  const txt = read('humans.txt');
  assert.match(txt, /dpflabs\.com/);
  assert.ok(!/@|\+?\d{8,}/.test(txt), 'sem e-mail nem telefone');
  assert.match(txt, /\/\* TEAM \*\//);
  assert.match(txt, /Tecnologias:/);
  assert.match(read('404.html'), /<link rel="author" href="\/humans\.txt">/);
  assert.ok(!/script-src[^"]*dpflabs/.test(read('index.html')), 'a CSP não ganhou origem nova');
});

test('créditos no LICENSE e no README', () => {
  assert.match(fs.readFileSync(path.join(repo, 'LICENSE'), 'utf8'), /dpflabs\.com/);
  assert.match(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), /dpflabs\.com/);
});

test('cache sobe uma vez: v42 no sw.js e no index.html', () => {
  assert.match(read('sw.js'), /CACHE_PREFIX \+ 'v42'/);
  assert.match(read('index.html'), /data-app-version="v42"/);
});
