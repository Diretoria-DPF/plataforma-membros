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
 * Uso: require('./build-biblioteca.js').build({ outDir, srcDir }) (chamado por scripts/build.js).
 * `searchNorm` e os rótulos de tipo são cópias de worker/src/library/normalize.js e frontend/library-cite.js;
 * scripts/build-biblioteca.test.mjs confere que continuam iguais.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://laift.com.br';
const CANONICA = `${SITE}/biblioteca`;
const DESCRICAO = 'Artigos científicos escolhidos e conferidos pela Diretoria Científica da LAIFT, com busca por título, autor, revista e área de estudo.';
const LINK_PERMITIDO = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\/[^\s<>"']{1,260}$/;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;
const SLUG_VALIDO = /^[a-z0-9-]{1,60}$/;
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const ANO_MIN = 1800;
const ANO_MAX = 2100;
const AUTORES_NA_LISTA = 3;
const AUTORES_MAX = 30;
const SEARCH_MAX = 4000;
const LINHA_LLMS = '- [Biblioteca LAIFT](https://laift.com.br/biblioteca): artigos de farmacologia e toxicologia escolhidos e conferidos pela Diretoria Científica da LAIFT.';

// Mesma tabela de rótulos de tipo de frontend/library-cite.js (LABELS.type).
const TIPOS = Object.freeze({
  artigo: 'Artigo original',
  revisao: 'Revisão',
  revisao_sistematica: 'Revisão sistemática',
  meta_analise: 'Metanálise',
  ensaio_clinico: 'Ensaio clínico',
  relato_caso: 'Relato de caso',
  diretriz: 'Diretriz',
  outro: 'Outro',
});

const MARCADORES = Object.freeze({
  itens: '<!-- biblioteca:itens -->',
  topicos: '<!-- biblioteca:topicos -->',
  tipos: '<!-- biblioteca:tipos -->',
  total: '<!-- biblioteca:total -->',
  atualizado: '<!-- biblioteca:atualizado -->',
  jsonld: '<!-- biblioteca:jsonld -->',
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

function textoLimpo(valor, max) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Cópia de searchNorm (worker/src/library/normalize.js): mesma ordem de passos. */
function searchNorm(registro) {
  const r = registro || {};
  const sobrenomes = Array.isArray(r.authors) ? r.authors.map((a) => a?.family) : [];
  return [r.title, ...sobrenomes, r.journal, r.journalAbbrev, r.doi, r.pmid]
    .filter((p) => p != null)
    .map(String)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, SEARCH_MAX)
    .trim();
}

function lerId(bruto) {
  if (typeof bruto === 'number' && Number.isSafeInteger(bruto) && bruto > 0) return String(bruto);
  if (typeof bruto === 'string' && ID_VALIDO.test(bruto)) return bruto;
  return null;
}

/** Ano ausente vira null; ano presente fora de 1800-2100 é inválido. */
function lerAno(bruto) {
  if (bruto === null || bruto === undefined) return { ok: true, valor: null };
  const ano = Number(bruto);
  const valido = Number.isInteger(ano) && ano >= ANO_MIN && ano <= ANO_MAX;
  return valido ? { ok: true, valor: ano } : { ok: false, valor: null };
}

function lerLink(bruto) {
  return typeof bruto === 'string' && bruto.length <= 300 && LINK_PERMITIDO.test(bruto) ? bruto : null;
}

function lerTopicos(bruto) {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.filter((s) => typeof s === 'string' && SLUG_VALIDO.test(s)))];
}

function tipoValido(bruto) {
  return Object.prototype.hasOwnProperty.call(TIPOS, bruto) ? bruto : 'outro';
}

function listarAutores(bruto) {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({ family: textoLimpo(a.family, 120), given: textoLimpo(a.given, 120) }))
    .filter((a) => a.family)
    .slice(0, AUTORES_MAX);
}

/** Iniciais sem ponto: "Ana Maria" -> "AM", "Jean-Paul" -> "JP". */
function iniciais(prenome) {
  return prenome.split(/[\s-]+/).filter(Boolean).map((p) => Array.from(p)[0].toUpperCase()).join('');
}

/** "Silva AM, Souza B, Lima C et al." (até três autores; mais que três ganha "et al."). */
function textoAutores(autores, total) {
  const curtos = autores.slice(0, AUTORES_NA_LISTA)
    .map((a) => (a.given ? `${a.family} ${iniciais(a.given)}` : a.family));
  const maisDeTres = Math.max(total, autores.length) > AUTORES_NA_LISTA;
  return curtos.join(', ') + (maisDeTres ? ' et al.' : '');
}

function nomeCompleto(autor) {
  return [autor.given, autor.family].filter(Boolean).join(' ');
}

/**
 * Valida e normaliza um item de PublicItem (ou da reserva). Devolve { item, erro }.
 * item tem os campos de index.json mais nomesAutores (só para o JSON-LD; sai do index.json).
 */
function validarItem(bruto) {
  if (!bruto || typeof bruto !== 'object') return { item: null, erro: 'registro não é objeto' };
  const id = lerId(bruto.id);
  if (!id) return { item: null, erro: 'id inválido' };
  const titulo = textoLimpo(bruto.title, 300);
  if (!titulo) return { item: null, erro: 'sem título' };
  const ano = lerAno(bruto.year);
  if (!ano.ok) return { item: null, erro: 'ano inválido' };
  const url = lerLink(bruto.landingUrl ?? bruto.url);
  if (!url) return { item: null, erro: 'link fora da lista permitida' };
  const autores = listarAutores(bruto.authors);
  const revista = textoLimpo(bruto.journal, 200);
  const doi = textoLimpo(bruto.doi, 200);
  const pmid = textoLimpo(bruto.pmid == null ? '' : String(bruto.pmid), 20);
  const item = {
    id,
    title: titulo,
    authors: textoAutores(autores, Number(bruto.authorCount) || 0),
    journal: revista,
    year: ano.valor,
    type: tipoValido(bruto.type),
    topics: lerTopicos(bruto.topics),
    openAccess: bruto.openAccess === true,
    license: textoLimpo(bruto.license, 40),
    url,
    doi,
    n: searchNorm({ title: titulo, authors: autores, journal: revista, doi: doi || null, pmid: pmid || null }),
    nomesAutores: autores.map(nomeCompleto),
  };
  return { item, erro: null };
}

function montarTopicos(bruto) {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set();
  return bruto.reduce((lista, t) => {
    const slug = t && t.slug;
    const nome = textoLimpo(t && t.name, 80);
    if (typeof slug !== 'string' || !SLUG_VALIDO.test(slug) || !nome || vistos.has(slug)) return lista;
    vistos.add(slug);
    return [...lista, { slug, name: nome }];
  }, []);
}

/** Converte o catálogo bruto em { enabled, generatedAt, topics, items }; erros de item viram aviso. */
function montarCatalogo(dados, avisos) {
  const vistos = new Set();
  const items = dados.items.reduce((lista, bruto, indice) => {
    const { item, erro } = validarItem(bruto);
    const rotulo = bruto && bruto.id != null ? String(bruto.id) : `posição ${indice + 1}`;
    if (erro) {
      avisos.push(`item ${rotulo}: ${erro}`);
      return lista;
    }
    if (vistos.has(item.id)) {
      avisos.push(`item ${rotulo}: id repetido`);
      return lista;
    }
    vistos.add(item.id);
    return [...lista, item];
  }, []);
  return {
    enabled: dados.enabled === true,
    generatedAt: textoLimpo(dados.generatedAt, 40),
    topics: montarTopicos(dados.topics),
    items,
  };
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

function dataPt(generatedAt) {
  const [ano, mes, dia] = dataIso(generatedAt).split('-');
  return `${dia}/${mes}/${ano}`;
}

function rotuloTotal(total) {
  return `${total} ${total === 1 ? 'artigo' : 'artigos'}`;
}

function renderSelos(item, nomesTopicos) {
  const areas = item.topics.map((slug) => nomesTopicos.get(slug)).filter(Boolean);
  const selos = [TIPOS[item.type], ...areas, ...(item.openAccess ? ['Acesso aberto'] : [])];
  return `<ul class="bib-selos">${selos.map((s) => `<li><span class="bib-selo">${esc(s)}</span></li>`).join('')}</ul>`;
}

/** Um <li id="a-<id>"> por artigo: é a âncora /biblioteca#a-<id> e o alvo do filtro no navegador. */
function renderItem(item, nomesTopicos) {
  const meta = [item.journal, item.year].filter((p) => p !== '' && p != null).join(' · ');
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
function renderPagina(modelo, catalogo) {
  const nomesTopicos = new Map(catalogo.topics.map((t) => [t.slug, t.name]));
  const trocas = [
    [MARCADORES.itens, catalogo.items.map((i) => renderItem(i, nomesTopicos)).join('')],
    [MARCADORES.topicos, renderTopicos(catalogo.topics)],
    [MARCADORES.tipos, renderTipos()],
    [MARCADORES.total, rotuloTotal(catalogo.items.length)],
    [MARCADORES.atualizado, dataPt(catalogo.generatedAt)],
    [MARCADORES.jsonld, renderJsonLd(catalogo)],
  ];
  return trocas.reduce((html, [marcador, valor]) => html.split(marcador).join(valor), modelo);
}

function indiceDe(catalogo) {
  return {
    versao: 1,
    generatedAt: catalogo.generatedAt,
    total: catalogo.items.length,
    topics: catalogo.topics,
    items: catalogo.items.map(({ nomesAutores, ...publico }) => publico),
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

/** Tira a página e o índice da saída e as URLs do sitemap e do llms.txt (rota cai no 404). */
function desligar(outDir) {
  fs.rmSync(path.join(outDir, 'biblioteca.html'), { force: true });
  fs.rmSync(path.join(outDir, 'biblioteca', 'index.json'), { force: true });
  atualizarSitemap(path.join(outDir, 'sitemap.xml'), '');
  atualizarLlms(path.join(outDir, 'llms.txt'), '');
}

function copiarCatalogo(origem, pasta) {
  if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(pasta, 'catalogo.js'));
}

function escrever(opcoes, outDir, catalogo) {
  const modelo = fs.readFileSync(opcoes.modelo || path.join(ROOT, 'biblioteca.html'), 'utf8');
  const pasta = path.join(outDir, 'biblioteca');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'biblioteca.html'), renderPagina(modelo, catalogo));
  fs.writeFileSync(path.join(pasta, 'index.json'), JSON.stringify(indiceDe(catalogo)));
  copiarCatalogo(opcoes.catalogo || path.join(ROOT, 'biblioteca', 'catalogo.js'), pasta);
  atualizarSitemap(path.join(outDir, 'sitemap.xml'), linhaSitemap(catalogo.generatedAt));
  atualizarLlms(path.join(outDir, 'llms.txt'), LINHA_LLMS);
}

function construir(opcoes, avisos) {
  const srcDir = opcoes.srcDir || path.join(ROOT, 'biblioteca', 'conteudo');
  const outDir = opcoes.outDir || path.join(ROOT, 'dist');
  const dados = escolherFonte({
    recente: opcoes.recente || path.join(srcDir, 'recente.json'),
    reserva: opcoes.reserva || path.join(srcDir, 'reserva.json'),
  }, avisos);
  const catalogo = dados ? montarCatalogo(dados, avisos) : null;
  if (!catalogo || !catalogo.enabled || catalogo.items.length === 0) {
    if (catalogo && catalogo.enabled) avisos.push('nenhum item válido: página da biblioteca não gerada');
    desligar(outDir);
    return { gerada: false, itens: 0, avisos };
  }
  escrever(opcoes, outDir, catalogo);
  return { gerada: true, itens: catalogo.items.length, avisos };
}

/**
 * Gera a página e o índice. Nunca lança: qualquer falha vira aviso e gerada: false.
 * @returns {{ gerada: boolean, itens: number, avisos: string[] }}
 */
function build(opcoes = {}) {
  const avisos = [];
  try {
    return construir(opcoes, avisos);
  } catch (erro) {
    avisos.push(`página da biblioteca não gerada: ${erro.message}`);
    return { gerada: false, itens: 0, avisos };
  }
}

module.exports = { build, validarItem, searchNorm, TIPOS, DESCRICAO };
