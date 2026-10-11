/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * build-biblioteca.js — gerador da página pública /biblioteca (roda em tempo de build, nunca no navegador).
 *
 * Lê o instantâneo (recente.json, se válido; senão reserva.json) de biblioteca/conteudo/, valida item a item
 * e escreve dist/biblioteca.html (lista pré-renderizada no modelo frontend/biblioteca.html),
 * dist/biblioteca/index.json, copia biblioteca/catalogo.js e atualiza sitemap.xml e llms.txt entre marcadores.
 * Dado ruim vira aviso: nunca derruba o build do site.
 *
 * Regra da página (CONTRATO-B2 §2): a página é SEMPRE gerada, porque o catálogo de verdade chega ao vivo
 * pela API (biblioteca/catalogo.js). O instantâneo é só a primeira pintura e a reserva. Sem artigos no
 * instantâneo (vazio ou desligado), a página sai com noindex e fora do sitemap e do llms.txt.
 *
 * Uso: require('./build-biblioteca.js').build({ outDir, srcDir }) (chamado por scripts/build.js).
 * A validação de item, `searchNorm` e os rótulos de tipo moram em biblioteca/catalogo.js (regra única do
 * build e do navegador); scripts/build-biblioteca.test.mjs confere que seguem iguais ao Worker e a library-cite.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const catalogoJs = require('../biblioteca/catalogo.js');

const { validarItem, searchNorm, montarCatalogo, itemPublico, rotulosDosSelos, metaDoItem, dataPt, rotuloDoTotal, TIPOS } = catalogoJs;

const ROOT = path.join(__dirname, '..');
const SITE = 'https://laift.com.br';
const CANONICA = `${SITE}/biblioteca`;
const DESCRICAO = 'Artigos científicos escolhidos e conferidos pela Diretoria Científica da LAIFT, com busca por título, autor, revista e área de estudo.';
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const LINHA_LLMS = '- [Biblioteca LAIFT](https://laift.com.br/biblioteca): artigos de farmacologia e toxicologia escolhidos e conferidos pela Diretoria Científica da LAIFT.';
const META_NOINDEX = '<meta name="robots" content="noindex">';
const CATALOGO_VAZIO = Object.freeze({ enabled: false, generatedAt: '', topics: [], items: [] });

const MARCADORES = Object.freeze({
  itens: '<!-- biblioteca:itens -->',
  topicos: '<!-- biblioteca:topicos -->',
  tipos: '<!-- biblioteca:tipos -->',
  total: '<!-- biblioteca:total -->',
  atualizado: '<!-- biblioteca:atualizado -->',
  jsonld: '<!-- biblioteca:jsonld -->',
  robots: '<!-- biblioteca:robots -->',
});

function esc(valor) {
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON dentro de <script>: nenhum '<', '>' ou '&' cru, então nada fecha o bloco antes da hora. */
function jsonSeguro(valor) {
  return JSON.stringify(valor)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Lê um JSON de catálogo. motivo: 'ausente' (sem aviso), ou o problema encontrado. */
function lerCatalogo(arquivo) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (erro) {
    return { dados: null, motivo: 'ausente' };
  }
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (erro) {
    return { dados: null, motivo: 'JSON inválido' };
  }
  const formatoOk = dados && typeof dados === 'object' && typeof dados.enabled === 'boolean' && Array.isArray(dados.items);
  return formatoOk ? { dados, motivo: null } : { dados: null, motivo: 'formato inesperado' };
}

/** recente.json válido vence; se não, a reserva versionada. */
function escolherFonte(caminhos, avisos) {
  const recente = lerCatalogo(caminhos.recente);
  if (recente.dados) return recente.dados;
  if (recente.motivo !== 'ausente') avisos.push(`recente.json: ${recente.motivo}; usando a reserva`);
  const reserva = lerCatalogo(caminhos.reserva);
  if (reserva.motivo) avisos.push(`reserva.json: ${reserva.motivo}`);
  return reserva.dados;
}

function dataIso(generatedAt) {
  const casa = DATA_ISO.exec(generatedAt || '') || DATA_ISO.exec(new Date().toISOString());
  return `${casa[1]}-${casa[2]}-${casa[3]}`;
}

function renderSelos(item, nomesTopicos) {
  const selos = rotulosDosSelos(item, nomesTopicos);
  return `<ul class="bib-selos">${selos.map((s) => `<li><span class="bib-selo">${esc(s)}</span></li>`).join('')}</ul>`;
}

/** Um <li id="a-<id>"> por artigo: é a âncora /biblioteca#a-<id> e o alvo do filtro no navegador. */
function renderItem(item, nomesTopicos) {
  const meta = metaDoItem(item);
  return `<li id="a-${esc(item.id)}"><article class="bib-artigo">`
    + `<h2 class="bib-titulo">${esc(item.title)}</h2>`
    + (item.authors ? `<p class="bib-autores">${esc(item.authors)}</p>` : '')
    + (meta ? `<p class="bib-meta">${esc(meta)}</p>` : '')
    + renderSelos(item, nomesTopicos)
    + `<p class="bib-acao"><a class="bib-link" href="${esc(item.url)}" rel="noopener noreferrer" target="_blank">`
    + 'Abrir no site oficial<span class="visually-hidden"> (abre em nova aba)</span></a></p>'
    + '</article></li>';
}

function renderTopicos(topicos) {
  return topicos.map((t) => `<option value="${esc(t.slug)}">${esc(t.name)}</option>`).join('');
}

function renderTipos() {
  return Object.entries(TIPOS).map(([chave, rotulo]) => `<option value="${esc(chave)}">${esc(rotulo)}</option>`).join('');
}

function artigoJsonLd(item) {
  const artigo = {
    '@type': 'ScholarlyArticle',
    name: item.title,
    author: item.nomesAutores.map((nome) => ({ '@type': 'Person', name: nome })),
    sameAs: item.url,
  };
  if (item.year !== null) artigo.datePublished = String(item.year);
  if (item.journal) artigo.isPartOf = { '@type': 'Periodical', name: item.journal };
  return artigo;
}

function renderJsonLd(catalogo) {
  const grafo = [
    {
      '@type': 'CollectionPage',
      '@id': CANONICA,
      url: CANONICA,
      name: 'Biblioteca LAIFT',
      description: DESCRICAO,
      inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: 'LAIFT', url: SITE },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LAIFT', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Biblioteca', item: CANONICA },
      ],
    },
    {
      '@type': 'ItemList',
      numberOfItems: catalogo.items.length,
      itemListElement: catalogo.items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item: artigoJsonLd(item) })),
    },
  ];
  return `<script type="application/ld+json">${jsonSeguro({ '@context': 'https://schema.org', '@graph': grafo })}</script>`;
}

/** Troca os marcadores do modelo. split/join (e não replace) para o texto nunca virar padrão de regex. */
function renderPagina(modelo, catalogo, indexavel) {
  const nomesTopicos = new Map(catalogo.topics.map((t) => [t.slug, t.name]));
  const trocas = [
    [MARCADORES.itens, catalogo.items.map((i) => renderItem(i, nomesTopicos)).join('')],
    [MARCADORES.topicos, renderTopicos(catalogo.topics)],
    [MARCADORES.tipos, renderTipos()],
    [MARCADORES.total, esc(rotuloDoTotal(catalogo.items.length))],
    [MARCADORES.atualizado, dataPt(catalogo.generatedAt)],
    [MARCADORES.jsonld, renderJsonLd(catalogo)],
    [MARCADORES.robots, indexavel ? '' : META_NOINDEX],
  ];
  return trocas.reduce((html, [marcador, valor]) => html.split(marcador).join(valor), modelo);
}

function indiceDe(catalogo) {
  return {
    versao: 1,
    generatedAt: catalogo.generatedAt,
    total: catalogo.items.length,
    topics: catalogo.topics,
    items: catalogo.items.map(itemPublico),
  };
}

function removerBloco(conteudo, nome) {
  const bloco = new RegExp(`\\s*<!-- ${nome}:inicio -->[\\s\\S]*?<!-- ${nome}:fim -->`, 'g');
  return conteudo.replace(bloco, '');
}

/** Sitemap: o bloco entra antes de </urlset>; bloco vazio só remove a entrada. */
function atualizarSitemap(arquivo, linhas) {
  if (!fs.existsSync(arquivo)) return;
  const limpo = removerBloco(fs.readFileSync(arquivo, 'utf8'), 'biblioteca');
  const bloco = linhas ? `  <!-- biblioteca:inicio -->\n${linhas}\n  <!-- biblioteca:fim -->\n` : '';
  fs.writeFileSync(arquivo, limpo.replace('</urlset>', () => `${bloco}</urlset>`));
}

/** llms.txt: a linha vai para a seção "Observações" (ou para o fim, se ela não existir). */
function atualizarLlms(arquivo, linha) {
  if (!fs.existsSync(arquivo)) return;
  const limpo = removerBloco(fs.readFileSync(arquivo, 'utf8'), 'biblioteca');
  const bloco = linha ? `<!-- biblioteca:inicio -->\n${linha}\n<!-- biblioteca:fim -->` : '';
  const alvo = '\n## Observações';
  let novo = limpo;
  if (bloco && limpo.includes(alvo)) novo = limpo.replace(alvo, () => `\n${bloco}\n${alvo}`);
  else if (bloco) novo = `${limpo.trimEnd()}\n\n${bloco}\n`;
  fs.writeFileSync(arquivo, novo);
}

function linhaSitemap(generatedAt) {
  return `  <url>\n    <loc>${CANONICA}</loc>\n    <lastmod>${dataIso(generatedAt)}</lastmod>\n    <priority>0.6</priority>\n  </url>`;
}

function copiarCatalogo(origem, pasta) {
  if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(pasta, 'catalogo.js'));
}

/** Escreve página, índice e catálogo.js; sitemap e llms.txt só listam a página quando ela é indexável. */
function escrever(opcoes, outDir, catalogo, indexavel) {
  const modelo = fs.readFileSync(opcoes.modelo || path.join(ROOT, 'biblioteca.html'), 'utf8');
  const pasta = path.join(outDir, 'biblioteca');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'biblioteca.html'), renderPagina(modelo, catalogo, indexavel));
  fs.writeFileSync(path.join(pasta, 'index.json'), JSON.stringify(indiceDe(catalogo)));
  copiarCatalogo(opcoes.catalogo || path.join(ROOT, 'biblioteca', 'catalogo.js'), pasta);
  atualizarSitemap(path.join(outDir, 'sitemap.xml'), indexavel ? linhaSitemap(catalogo.generatedAt) : '');
  atualizarLlms(path.join(outDir, 'llms.txt'), indexavel ? LINHA_LLMS : '');
}

/** Instantâneo -> catálogo da primeira pintura. Desligado ou ausente vira lista vazia (a página existe igual). */
function catalogoDoInstantaneo(dados, avisos) {
  if (!dados) return CATALOGO_VAZIO;
  const catalogo = montarCatalogo(dados, avisos);
  if (!catalogo.enabled) return { ...catalogo, items: [] };
  if (dados.items.length > 0 && catalogo.items.length === 0) avisos.push('nenhum item válido: página gerada sem artigos (noindex)');
  return catalogo;
}

function construir(opcoes, avisos) {
  const srcDir = opcoes.srcDir || path.join(ROOT, 'biblioteca', 'conteudo');
  const outDir = opcoes.outDir || path.join(ROOT, 'dist');
  const dados = escolherFonte({
    recente: opcoes.recente || path.join(srcDir, 'recente.json'),
    reserva: opcoes.reserva || path.join(srcDir, 'reserva.json'),
  }, avisos);
  const catalogo = catalogoDoInstantaneo(dados, avisos);
  const indexavel = catalogo.enabled && catalogo.items.length > 0;
  escrever(opcoes, outDir, catalogo, indexavel);
  return { gerada: true, indexavel, itens: catalogo.items.length, avisos };
}

/**
 * Gera a página e o índice. Nunca lança: qualquer falha vira aviso e gerada: false.
 * @returns {{ gerada: boolean, indexavel: boolean, itens: number, avisos: string[] }}
 */
function build(opcoes = {}) {
  const avisos = [];
  try {
    return construir(opcoes, avisos);
  } catch (erro) {
    avisos.push(`página da biblioteca não gerada: ${erro.message}`);
    return { gerada: false, indexavel: false, itens: 0, avisos };
  }
}

module.exports = { build, validarItem, searchNorm, TIPOS, DESCRICAO };
