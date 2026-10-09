/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes do gerador do blog (scripts/build-blog.js). Sem rede, sem navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const gerador = require('./build-blog.js');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONTEUDO = path.join(AQUI, '..', 'blog', 'conteudo');
const SITE_SEM_EMAIL = { email: null };
const SITE_COM_EMAIL = { email: 'contato@exemplo.org' };

function postBase(extra = {}) {
  return {
    slug: 'post-de-teste', titulo: 'Post de teste', resumo: 'Resumo curto.', data: '2026-10-09',
    tags: ['teste'], serie: 'plataforma', icone: 'novidades', fixado: false, leitura_min: 1,
    status: 'ativo', fontes: ['docs/exemplo.md'], blocos: [{ t: 'p', texto: 'Texto simples.' }], ...extra,
  };
}

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'laift-blog-'));
}

test('linkPermitido aceita só interno, hosts da lista e o e-mail do site.json', () => {
  const ok = ['/liga.html', 'blog/x.html', '#secao', 'https://www.instagram.com/laift.liga',
    'https://forms.gle/abc', 'https://docs.google.com/forms/d/1', 'https://github.com/Diretoria-DPF/plataforma-membros'];
  for (const href of ok) assert.equal(gerador.linkPermitido(href, SITE_SEM_EMAIL), true, href);
  const ruins = ['javascript:alert(1)', 'http://evil.example', '//evil.example/x', 'https://evil.example',
    'https://www.instagram.com/outra.conta', 'mailto:alguem@exemplo.org', '/a b', 'data:text/html,x'];
  for (const href of ruins) assert.equal(gerador.linkPermitido(href, SITE_SEM_EMAIL), false, href);
  assert.equal(gerador.linkPermitido('mailto:contato@exemplo.org', SITE_COM_EMAIL), true);
  assert.equal(gerador.linkPermitido('mailto:outro@exemplo.org', SITE_COM_EMAIL), false);
});

test('um post correto não tem problemas', () => {
  assert.deepEqual(gerador.validatePost(postBase(), SITE_SEM_EMAIL), []);
});

test('recusa HTML cru, e-mail em texto e @menção de terceiros', () => {
  const html = gerador.validatePost(postBase({ blocos: [{ t: 'p', texto: 'Olá <b>mundo</b>' }] }), SITE_SEM_EMAIL);
  assert.ok(html.some((e) => e.includes('HTML cru')));
  const email = gerador.validatePost(postBase({ blocos: [{ t: 'p', texto: 'Escreva para fulano@gmail.com' }] }), SITE_SEM_EMAIL);
  assert.ok(email.some((e) => e.includes('e-mail em texto')));
  const arroba = gerador.validatePost(postBase({ blocos: [{ t: 'p', texto: 'Siga @outra.conta' }] }), SITE_SEM_EMAIL);
  assert.ok(arroba.some((e) => e.includes('@menção')));
  const propria = gerador.validatePost(postBase({ blocos: [{ t: 'p', texto: 'Siga @laift.liga' }] }), SITE_SEM_EMAIL);
  assert.deepEqual(propria, []);
});

test('recusa as frases proibidas (revisão, garantia, datas e vagas)', () => {
  const textos = ['Conteúdo revisado por especialistas', 'Segurança 100% segura é 100% seguro', 'Resultado garantido',
    'Inscrições até 10/11/2026', 'Inscrições em 12 de novembro', 'São 20 vagas', 'Orientação do Prof. Fulano'];
  for (const texto of textos) {
    const erros = gerador.validatePost(postBase({ blocos: [{ t: 'p', texto }] }), SITE_SEM_EMAIL);
    assert.ok(erros.some((e) => e.includes('frase proibida')), texto);
  }
  const permitido = gerador.validatePost(postBase({ blocos: [{ t: 'p', texto: 'Vagas e datas: a divulgar. Edital 2026.' }] }), SITE_SEM_EMAIL);
  assert.deepEqual(permitido, []);
});

test('recusa post sem fontes, ícone desconhecido, slug ruim, link fora da lista e bloco desconhecido', () => {
  assert.ok(gerador.validatePost(postBase({ fontes: [] }), SITE_SEM_EMAIL).some((e) => e.includes('fontes')));
  assert.ok(gerador.validatePost(postBase({ icone: 'nao-existe' }), SITE_SEM_EMAIL).some((e) => e.includes('icone')));
  assert.ok(gerador.validatePost(postBase({ slug: 'Slug Ruim' }), SITE_SEM_EMAIL).some((e) => e.includes('slug')));
  assert.ok(gerador.validatePost(postBase({ blocos: [{ t: 'cta', rotulo: 'Ir', href: 'https://evil.example' }] }), SITE_SEM_EMAIL)
    .some((e) => e.includes('link fora da lista')));
  assert.ok(gerador.validatePost(postBase({ blocos: [{ t: 'script', texto: 'x' }] }), SITE_SEM_EMAIL)
    .some((e) => e.includes('tipo desconhecido')));
});

test('cartão de pessoa sem autorizacaoEscrita não mostra nome nem foto', () => {
  const cartoes = { t: 'cartoes', itens: [
    { titulo: 'Presidência', pessoa: true, nome: 'Nome Secreto', foto: 'blog/fotos/a.webp' },
    { titulo: 'Diretoria', pessoa: true, nome: 'Nome Autorizado', foto: 'blog/fotos/b.webp', autorizacaoEscrita: true },
    { titulo: 'Diretoria 2', pessoa: true, nome: 'Foto Fora', foto: '../../etc/passwd', autorizacaoEscrita: true },
  ] };
  const { html, avisos } = gerador.renderPostPage(postBase({ blocos: [cartoes] }), { site: SITE_SEM_EMAIL });
  assert.ok(!html.includes('Nome Secreto'));
  assert.ok(!html.includes('blog/fotos/a.webp'));
  assert.ok(html.includes('Nome a definir pela diretoria'));
  assert.ok(html.includes('Nome Autorizado') && html.includes('/blog/fotos/b.webp'));
  assert.ok(!html.includes('passwd'), 'caminho de foto fora de blog/fotos/ é ignorado');
  assert.ok(avisos.some((a) => a.includes('Presidência')));
});

test('bloco de contato: "e-mail a divulgar" sem endereço, mailto com endereço', () => {
  const sem = gerador.renderPostPage(postBase(), { site: SITE_SEM_EMAIL }).html;
  assert.ok(sem.includes('E-mail a divulgar') && !sem.includes('mailto:'));
  assert.ok(sem.includes('href="https://www.instagram.com/laift.liga"') && sem.includes('rel="noopener noreferrer"'));
  const com = gerador.renderPostPage(postBase(), { site: SITE_COM_EMAIL }).html;
  assert.ok(com.includes('href="mailto:contato@exemplo.org"') && com.includes('Enviar e-mail para a LAIFT'));
  assert.ok(!com.includes('E-mail a divulgar'));
});

test('escapa texto e não deixa atributo ou script inline na página', () => {
  const { html } = gerador.renderPostPage(postBase({ titulo: 'Fármacos & "dose"' }), { site: SITE_SEM_EMAIL });
  assert.ok(html.includes('Fármacos &amp; &quot;dose&quot;'));
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html), 'nenhum <script> inline');
  assert.ok(!/\son\w+=/i.test(html), 'nenhum handler on*= inline');
  assert.ok(html.includes("script-src 'self'") && !html.includes("'unsafe-inline'"));
});

test('indiceDe põe fixados primeiro e depois a data mais recente', () => {
  const lista = [
    postBase({ slug: 'antigo', data: '2026-01-01' }),
    postBase({ slug: 'novo', data: '2026-09-01' }),
    postBase({ slug: 'fixo', data: '2025-01-01', fixado: true }),
  ];
  assert.deepEqual(gerador.indiceDe(lista).map((p) => p.slug), ['fixo', 'novo', 'antigo']);
});

test('build gera páginas e índice do exemplo, ignora arquivos "_" sem a opção e é idempotente', () => {
  const sem = pastaTemporaria();
  const resultadoSem = gerador.build({ srcDir: CONTEUDO, outDir: sem });
  assert.equal(resultadoSem.posts, 0, 'o exemplo não entra no build normal');

  const saida = pastaTemporaria();
  const primeira = gerador.build({ srcDir: CONTEUDO, outDir: saida, incluirExemplo: true });
  assert.equal(primeira.posts, 1);
  const pagina = path.join(saida, 'blog', 'exemplo-todos-os-blocos.html');
  const indice = path.join(saida, 'blog', 'index.json');
  const antesPagina = fs.readFileSync(pagina, 'utf8');
  const antesIndice = fs.readFileSync(indice, 'utf8');
  gerador.build({ srcDir: CONTEUDO, outDir: saida, incluirExemplo: true });
  assert.equal(fs.readFileSync(pagina, 'utf8'), antesPagina);
  assert.equal(fs.readFileSync(indice, 'utf8'), antesIndice);
  assert.ok(Buffer.byteLength(antesIndice) <= 20 * 1024, 'index.json respeita o teto de 20 KB');
  for (const tipo of gerador.BLOCOS) {
    const marca = { p: '<p>', h2: '<h2 id="s-', lista: 'blog-lista', destaque: 'blog-destaque', fatos: 'blog-fatos',
      cta: 'blog-botao', etapas: 'blog-etapas', cartoes: 'blog-cartoes', contato: 'blog-contato' }[tipo];
    assert.ok(antesPagina.includes(marca), `o exemplo renderiza o bloco ${tipo}`);
  }
});

test('build recusa slug repetido e lista todos os problemas juntos', () => {
  const src = pastaTemporaria();
  const a = postBase({ blocos: [{ t: 'p', texto: 'Resultado garantido' }] });
  fs.writeFileSync(path.join(src, 'a.json'), JSON.stringify({ posts: [a, postBase()] }));
  assert.throws(() => gerador.build({ srcDir: src, outDir: pastaTemporaria() }), /slug repetido[\s\S]*frase proibida|frase proibida[\s\S]*slug repetido/);
});
