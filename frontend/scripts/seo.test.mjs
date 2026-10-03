/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SITE = 'https://laift.com.br';
const read = (name) => readFileSync(join(ROOT, name), 'utf8');

function metaContent(html, attr, key) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i');
  return re.exec(html)?.[1];
}

test('index.html: título com a marca LAIFT logo no início', () => {
  const title = /<title>([^<]*)<\/title>/i.exec(read('index.html'))?.[1] ?? '';
  assert.match(title, /^LAIFT/);
  assert.ok(title.length <= 75, `título longo demais (${title.length})`);
});

test('index.html: meta description entre 70 e 160 caracteres e com a marca', () => {
  const description = metaContent(read('index.html'), 'name', 'description') ?? '';
  assert.ok(description.length >= 70 && description.length <= 160, `tamanho ${description.length}`);
  assert.match(description, /LAIFT/);
});

test('index.html: canonical aponta para o domínio principal', () => {
  assert.match(read('index.html'), new RegExp(`<link\\s+rel="canonical"\\s+href="${SITE}/"`));
});

test('index.html: Open Graph e Twitter completos', () => {
  const html = read('index.html');
  for (const key of ['og:title', 'og:description', 'og:url', 'og:type', 'og:locale', 'og:site_name', 'og:image']) {
    assert.ok(metaContent(html, 'property', key), `falta ${key}`);
  }
  assert.equal(metaContent(html, 'property', 'og:url'), `${SITE}/`);
  assert.equal(metaContent(html, 'property', 'og:locale'), 'pt_BR');
  assert.ok(metaContent(html, 'name', 'twitter:card'), 'falta twitter:card');
});

test('index.html: JSON-LD válido com Organization e WebSite', () => {
  const html = read('index.html');
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(match, 'falta o bloco JSON-LD');
  const data = JSON.parse(match[1]);
  const types = data['@graph'].map((node) => node['@type']);
  assert.ok(types.includes('Organization') && types.includes('WebSite'));
  const org = data['@graph'].find((node) => node['@type'] === 'Organization');
  assert.equal(org.name, 'LAIFT');
  assert.equal(org.url, `${SITE}/`);
  assert.match(org.alternateName, /Farmacologia e Toxicologia/);
});

test('index.html: o texto público menciona o nome completo da liga', () => {
  assert.match(read('index.html'), /Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia/);
});

test('termos e privacidade: description e canonical sem a extensão .html', () => {
  for (const [file, path] of [['termos.html', 'termos'], ['privacidade.html', 'privacidade']]) {
    const html = read(file);
    assert.ok(metaContent(html, 'name', 'description'), `${file}: falta description`);
    assert.match(html, new RegExp(`<link\\s+rel="canonical"\\s+href="${SITE}/${path}"`));
  }
});

test('robots.txt: permite tudo, bloqueia páginas de desenvolvimento e aponta o sitemap', () => {
  assert.ok(existsSync(join(ROOT, 'robots.txt')), 'robots.txt ausente');
  const robots = read('robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \/modulos\/anatomia-3d\/dev\//);
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
    assert.match(robots, new RegExp(`User-agent: ${bot}`));
  }
});

test('robots.txt: Content-Signal declara o uso permitido (busca e resposta de IA sim, treino não)', () => {
  const robots = read('robots.txt');
  const signals = robots.match(/^Content-Signal: .+$/gm) ?? [];
  assert.ok(signals.length >= 2, 'o sinal deve estar no grupo "*" e no grupo dos bots de IA');
  for (const line of signals) {
    assert.equal(line, 'Content-Signal: search=yes, ai-input=yes, ai-train=no');
  }
});

function robotsGroups(text) {
  return text.split(/\n\s*\n/)
    .map((block) => ({
      agents: [...block.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1].trim()),
      lines: block.split('\n').map((line) => line.trim()),
    }))
    .filter((group) => group.agents.length);
}

test('robots.txt: coletores de treino de IA bloqueados; assistentes e buscadores de IA liberados', () => {
  const groups = robotsGroups(read('robots.txt'));
  const groupOf = (agent) => groups.find((group) => group.agents.includes(agent));
  for (const bot of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended']) {
    assert.ok(groupOf(bot)?.lines.includes('Disallow: /'), `${bot} deveria estar bloqueado`);
  }
  for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
    assert.ok(groupOf(bot)?.lines.includes('Allow: /'), `${bot} deveria estar liberado`);
  }
});

test('_headers: a página inicial aponta para o sitemap e o llms.txt via Link', () => {
  const headers = read('_headers');
  const block = /^\/\n((?:[ \t]+.+\n?)+)/m.exec(headers)?.[1] ?? '';
  assert.match(block, /Link: <\/sitemap\.xml>; rel="sitemap"/);
  assert.match(block, /<\/llms\.txt>; rel="describedby"/);
});

test('_headers: não publica API, OAuth ou cartão de agente (plataforma restrita)', () => {
  const headers = read('_headers');
  assert.ok(!/api-catalog|agent-card|oauth-/i.test(headers));
  assert.ok(!existsSync(join(ROOT, '.well-known')), 'não deve existir .well-known público');
});

test('sitemap.xml: XML com as páginas públicas no domínio principal', () => {
  assert.ok(existsSync(join(ROOT, 'sitemap.xml')), 'sitemap.xml ausente');
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /<urlset[^>]+sitemaps\.org/);
  for (const url of [`${SITE}/`, `${SITE}/termos`, `${SITE}/privacidade`]) {
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `falta ${url}`);
  }
  assert.ok(!sitemap.includes('.html'), 'sitemap não deve listar URLs .html');
});

test('llms.txt: descreve a LAIFT e aponta para o site', () => {
  assert.ok(existsSync(join(ROOT, 'llms.txt')), 'llms.txt ausente');
  const llms = read('llms.txt');
  assert.match(llms, /^# LAIFT/);
  assert.match(llms, /Farmacologia e Toxicologia/);
  assert.ok(llms.includes(`${SITE}/`));
});

test('build.js copia robots.txt, sitemap.xml e llms.txt para o dist', () => {
  const build = read('scripts/build.js');
  for (const name of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
    assert.ok(build.includes(name), `build.js não copia ${name}`);
  }
});
