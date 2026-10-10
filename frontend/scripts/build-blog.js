/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * build-blog.js — gerador do blog (roda em tempo de build, nunca no navegador).
 *
 * Lê frontend/blog/conteudo/*.json (cada arquivo é { "posts": [...] }), valida
 * cada post e escreve dist/blog/<slug>.html + dist/blog/index.json. Todo texto
 * é escapado aqui; o navegador nunca recebe HTML montado a partir de dado cru.
 *
 * ESQUELETO (Onda 0): páginas de post com todos os tipos de bloco, validação do
 * esquema, da lista de links permitidos e das frases proibidas, e o índice.
 * Ficam para a Onda 2: relacionados, anterior/próximo, breadcrumbs, JSON-LD,
 * sitemap, og:image e canonical.
 *
 * Uso:  node scripts/build-blog.js [--out <pasta>] [--src <pasta>] [--incluir-exemplo]
 * Arquivos de conteúdo que começam com "_" (ex.: _EXEMPLO.json) só entram com
 * --incluir-exemplo, para o exemplo nunca ir para produção.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const campanha = require('./blog-blocos-campanha.js');

const SERIES = ['liga', 'modulos', 'plataforma', 'campanhas'];
const STATUS = {
  ativo: 'Disponível',
  'pronto-aguardando-ativacao': 'Pronto, aguardando ativação',
  planejado: 'Planejado',
  'em-estudo': 'Em estudo',
};
// Ids que o sprite blog/icones.svg precisa definir (contrato com o H2).
const ICONES = [
  'inicio', 'aprender', 'eventos', 'propostas', 'tarefas', 'equipe', 'mensagens', 'perfil',
  'quiz', 'toxicologia', 'clinica', 'laboratorio', 'anatomia', 'cracha', 'lia',
  'seguranca', 'offline', 'desempenho', 'roteiro', 'liga', 'bemvindo', 'novidades', 'ig', 'envelope', 'laco',
];
const BLOCOS = ['p', 'h2', 'lista', 'destaque', 'fatos', 'cta', 'etapas', 'cartoes', 'contato'];
const INSTAGRAM_URL = 'https://www.instagram.com/laift.liga';
const HTTPS_PREFIXOS = [
  'https://forms.gle/',
  'https://docs.google.com/forms/',
  'https://github.com/Diretoria-DPF/',
];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MAX = { titulo: 90, resumo: 200, fonte: 160, tags: 5, leitura: 20 };

// Frases que os posts nunca podem conter (ver docs/blog/FATOS_VERIFICADOS_*.md).
const FRASES_PROIBIDAS = [
  { re: /revisad[oa]s?\s+(por|pelo|pela)\b/i, motivo: 'afirma revisão profissional' },
  { re: /100\s*%\s*seguro/i, motivo: 'promessa absoluta de segurança' },
  { re: /garantid[oa]s?\b/i, motivo: 'promessa de garantia' },
  { re: /\b\d{1,2}\s*\/\s*\d{1,2}(\s*\/\s*\d{2,4})?\b/, motivo: 'data numérica (use "a divulgar")' },
  { re: new RegExp(`\\b\\d{1,2}\\s+de\\s+(${MESES.join('|')})\\b`, 'i'), motivo: 'data por extenso (use "a divulgar")' },
  { re: /\b\d+\s+vagas?\b/i, motivo: 'número de vagas (use "a divulgar")' },
  { re: /\b(Dr|Dra|Prof|Profa)\.\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/, motivo: 'nome de pessoa' },
];
const RE_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const RE_ARROBA = /(^|[\s(])@[\w.]+/g;

function esc(valor) {
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Link aceito em post: caminho interno, host da lista ou o e-mail do site.json. */
function linkPermitido(href, site) {
  if (typeof href !== 'string' || href.length > 300 || /[\s<>"']/.test(href)) return false;
  if (href === INSTAGRAM_URL || href === `${INSTAGRAM_URL}/`) return true;
  if (HTTPS_PREFIXOS.some((prefixo) => href.startsWith(prefixo))) return true;
  if (href.startsWith('mailto:')) return !!(site && site.email) && href === `mailto:${site.email}`;
  if (/^\/(?!\/)[\w\-./#?=&]*$/.test(href)) return true;
  if (/^(\.\/)?[\w\-./]+\.html(#[\w-]+)?$/.test(href)) return true;
  return /^#[\w-]+$/.test(href);
}

function dataPtBr(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

function icone(id, classe) {
  return `<svg class="${classe || 'blog-icone'}" aria-hidden="true" focusable="false"><use href="/blog/icones.svg#${esc(id)}"></use></svg>`;
}

function renderLink(href, rotuloHtml, ctx, classe) {
  if (!linkPermitido(href, ctx.site)) throw new Error(`link fora da lista permitida: ${href}`);
  const externo = /^https?:\/\//.test(href);
  const attrs = externo ? ' target="_blank" rel="noopener noreferrer"' : '';
  const aviso = externo ? '<span class="blog-sr-only"> (abre em nova aba)</span>' : '';
  const cls = classe ? ` class="${classe}"` : '';
  return `<a${cls} href="${esc(href)}"${attrs}>${rotuloHtml}${aviso}</a>`;
}

/** Texto com links no formato [rótulo](destino); o resto é sempre escapado. */
function renderInline(texto, ctx) {
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  const partes = [];
  let ultimo = 0;
  let achado;
  while ((achado = re.exec(texto))) {
    partes.push(esc(texto.slice(ultimo, achado.index)));
    partes.push(renderLink(achado[2], esc(achado[1]), ctx));
    ultimo = re.lastIndex;
  }
  partes.push(esc(texto.slice(ultimo)));
  return partes.join('');
}

function renderContato(ctx, titulo) {
  const id = `contato-${ctx.contador.contato += 1}`;
  const email = ctx.site.email
    ? renderLink(`mailto:${ctx.site.email}`, `${icone('envelope')}<span>E-mail</span>`, ctx, 'blog-contato__item')
        .replace('<a ', '<a aria-label="Enviar e-mail para a LAIFT" ')
    : `<span class="blog-contato__item" data-estado="pendente">${icone('envelope')}<span>E-mail a divulgar</span></span>`;
  const insta = renderLink(INSTAGRAM_URL, `${icone('ig')}<span>Instagram</span>`, ctx, 'blog-contato__item')
    .replace('<a ', '<a aria-label="Instagram da LAIFT, abre em nova aba" ');
  return `<section class="blog-contato" aria-labelledby="${id}"><h2 id="${id}">${esc(titulo || 'Fale com a Liga')}</h2>`
    + `<ul class="blog-contato__lista"><li>${insta}</li><li>${email}</li></ul></section>`;
}

function renderCartao(item, ctx) {
  const autorizado = item.autorizacaoEscrita === true;
  const pessoa = item.pessoa === true;
  if (!autorizado && (item.nome || item.foto)) ctx.avisos.push(`cartão "${item.titulo}": nome/foto ignorados (sem autorizacaoEscrita)`);
  const ic = item.icone ? icone(item.icone, 'blog-cartao__icone') : '';
  const foto = pessoa && autorizado && item.foto && /^blog\/fotos\/[\w\-./]+\.(png|jpe?g|webp)$/.test(item.foto)
    ? `<img class="blog-cartao__foto" src="/${esc(item.foto)}" alt="Foto de ${esc(item.nome || item.titulo)}" loading="lazy" width="96" height="96">` : '';
  let pessoaHtml = '';
  if (pessoa) {
    pessoaHtml = autorizado && item.nome
      ? `<p class="blog-cartao__nome">${esc(item.nome)}</p>`
      : '<p class="blog-cartao__pendente">Veja a equipe no Instagram da Liga</p>';
  }
  const texto = item.texto ? `<p>${renderInline(item.texto, ctx)}</p>` : '';
  return `<li class="blog-cartao">${ic}${foto}<h3>${esc(item.titulo)}</h3>${pessoaHtml}${texto}</li>`;
}

const RENDER = {
  p: (b, ctx) => `<p>${renderInline(b.texto, ctx)}</p>`,
  h2: (b, ctx) => `<h2 id="s-${ctx.contador.h2 += 1}">${esc(b.texto)}</h2>`,
  lista: (b, ctx) => {
    const tag = b.ordenada ? 'ol' : 'ul';
    return `<${tag} class="blog-lista">${b.itens.map((i) => `<li>${renderInline(i, ctx)}</li>`).join('')}</${tag}>`;
  },
  destaque: (b, ctx) => `<aside class="blog-destaque" data-tom="${b.tom === 'atencao' ? 'atencao' : 'info'}">`
    + `${b.titulo ? `<p class="blog-destaque__titulo">${esc(b.titulo)}</p>` : ''}<p>${renderInline(b.texto, ctx)}</p></aside>`,
  fatos: (b) => `<dl class="blog-fatos">${b.itens.map((i) => `<div><dt>${esc(i.rotulo)}</dt><dd>${esc(i.valor)}</dd></div>`).join('')}</dl>`,
  cta: (b, ctx) => `<p class="blog-cta">${renderLink(b.href, esc(b.rotulo || b.texto), ctx, 'blog-botao')}</p>`,
  etapas: (b, ctx) => `<ol class="blog-etapas">${b.itens.map((i) => `<li><h3>${esc(i.titulo)}</h3>`
    + `${i.selo ? `<span class="blog-selo">${esc(i.selo)}</span>` : ''}<p>${renderInline(i.texto, ctx)}</p></li>`).join('')}</ol>`,
  cartoes: (b, ctx) => `<ul class="blog-cartoes">${b.itens.map((i) => renderCartao(i, ctx)).join('')}</ul>`,
  contato: (b, ctx) => renderContato(ctx, b.titulo),
};

// Rodapé público (CONTRATO §3): mesmo texto de liga.html, com caminhos absolutos porque os posts ficam em /blog/.
const RODAPE = '<footer class="pub-rodape"><p class="pub-rodape__marca">LAIFT · Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia</p><p class="pub-rodape__local">UNINASSAU – Centro Universitário Maurício de Nassau · Salvador, Bahia</p><ul class="pub-rodape__links"><li><a href="/liga.html">Conheça a LAIFT</a></li><li><a href="/processo-seletivo.html">Processo seletivo</a></li><li><a href="/edital.html">Edital</a></li><li><a href="/blog.html">Blog</a></li><li><a href="/termos.html">Termos de Uso</a></li><li><a href="/privacidade.html">Privacidade</a></li></ul><p class="pub-rodape__copy">© 2026 LAIFT</p></footer>';

/** Barra pública do blog (CONTRATO §1, variante do blog). Os contatos ficam no bloco "Fale com a Liga". */
function renderCabecalho() {
  return '<header class="pub-barra"><div class="pub-barra__linha">'
    + '<a class="pub-voltar" href="/blog.html" data-history-back aria-label="Voltar à tela anterior">'
    + '<svg class="pub-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>'
    + '<span class="pub-voltar__rotulo">Voltar</span></a>'
    + '<a class="pub-barra__marca" href="/blog.html"><img src="/modulos/cracha/laift-marca.png" alt="" width="40" height="40"><span>Blog LAIFT</span></a>'
    + '<button class="pub-instalar" type="button" data-instalar hidden>'
    + '<svg class="pub-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>'
    + '<span>Instalar</span></button></div>'
    + '<nav class="pub-barra__nav" aria-label="Plataforma">'
    + '<a class="pub-barra__link" href="/"><svg class="pub-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-6h5v6"/></svg><span>Início</span></a>'
    + '<a class="pub-barra__link" href="/#entrar"><span>Entrar</span></a>'
    + '<a class="pub-barra__link pub-barra__link--destaque" href="/#cadastro"><span>Cadastrar</span></a>'
    + '</nav></header>';
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
  + "connect-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

const SERIE_ROTULO = { liga: 'A Liga', modulos: 'Módulos', plataforma: 'Plataforma', campanhas: 'Publicações' };

/** Canonical, Open Graph e JSON-LD (BlogPosting + BreadcrumbList) de um post. */
function renderMeta(post, ctx) {
  const url = `${ctx.site.url}/blog/${post.slug}`;
  const imagem = `${ctx.site.url}/blog/og-default.jpg`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting', headline: post.titulo, description: post.resumo, datePublished: post.data,
        dateModified: post.atualizado_em || post.data, inLanguage: 'pt-BR', mainEntityOfPage: url, image: imagem,
        author: { '@type': 'Organization', name: 'LAIFT' }, publisher: { '@type': 'Organization', name: 'LAIFT' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Blog', item: `${ctx.site.url}/blog` },
          { '@type': 'ListItem', position: 2, name: SERIE_ROTULO[post.serie], item: `${ctx.site.url}/blog#filtro=${post.serie}` },
          { '@type': 'ListItem', position: 3, name: post.titulo, item: url },
        ],
      },
    ],
  };
  const json = JSON.stringify(ld).replace(/</g, '\\u003c');
  return `<link rel="canonical" href="${esc(url)}">\n<meta property="og:type" content="article">\n`
    + `<meta property="og:title" content="${esc(post.titulo)}">\n<meta property="og:description" content="${esc(post.resumo)}">\n`
    + `<meta property="og:url" content="${esc(url)}">\n<meta property="og:image" content="${esc(imagem)}">\n`
    + `<meta name="twitter:card" content="summary_large_image">\n<script type="application/ld+json">${json}</script>`;
}

function renderBreadcrumbs(post) {
  return '<nav class="blog-breadcrumbs" aria-label="Você está em"><ol>'
    + '<li><a href="/blog.html">Blog</a></li>'
    + `<li><a href="/blog.html#filtro=${esc(post.serie)}">${esc(SERIE_ROTULO[post.serie])}</a></li>`
    + `<li aria-current="page">${esc(post.titulo)}</li></ol></nav>`;
}

function relacionadosDe(post, indice) {
  const tags = new Set(post.tags);
  return indice.filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, pontos: (p.serie === post.serie ? 10 : 0) + p.tags.filter((t) => tags.has(t)).length }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.p.slug.localeCompare(b.p.slug))
    .slice(0, 3).map((x) => x.p);
}

/** "Continue lendo": se não há relacionados, a seção inteira (título incluído) não existe. */
function renderRelacionados(post, ctx) {
  const lista = relacionadosDe(post, ctx.indice);
  if (!lista.length) return '';
  const itens = lista.map((p) => `<li><a class="blog-card" href="/${esc(p.href)}" data-serie="${esc(p.serie)}">`
    + `${icone(p.icone, 'blog-card__icone')}<span class="blog-card__titulo">${esc(p.titulo)}</span>`
    + `<span class="blog-card__meta">${p.leitura_min} min de leitura</span></a></li>`).join('');
  return `<section class="blog-relacionados" aria-labelledby="t-rel"><h2 id="t-rel">Continue lendo</h2><ul>${itens}</ul></section>`;
}

function renderNavPost(post, ctx) {
  const serie = ctx.indice.filter((p) => p.serie === post.serie && p.ordem_na_serie > 0)
    .sort((a, b) => a.ordem_na_serie - b.ordem_na_serie);
  const i = serie.findIndex((p) => p.slug === post.slug);
  if (i < 0 || (i === 0 && serie.length === 1)) return '';
  const link = (p, cls, rel, rotulo) => `<a class="${cls}" href="/${esc(p.href)}" rel="${rel}"><span>${rotulo}</span> ${esc(p.titulo)}</a>`;
  const ant = serie[i - 1] ? link(serie[i - 1], 'blog-nav-post__ant', 'prev', 'Anterior') : '';
  const prox = serie[i + 1] ? link(serie[i + 1], 'blog-nav-post__prox', 'next', 'Próximo') : '';
  return ant || prox ? `<nav class="blog-nav-post" aria-label="Mais posts da série">${ant}${prox}</nav>` : '';
}

/** Insere/atualiza as URLs do blog em sitemap.xml entre marcadores (idempotente). <lastmod> = atualizado_em ou data do post. */
function atualizarSitemap(arquivo, posts, site) {
  if (!fs.existsSync(arquivo)) return false;
  const inicio = '<!-- blog:inicio -->';
  const fim = '<!-- blog:fim -->';
  const limpo = fs.readFileSync(arquivo, 'utf8').replace(new RegExp(`\\s*${inicio}[\\s\\S]*?${fim}`), '');
  const datas = posts.map((p) => p.atualizado_em || p.data).sort();
  const url = (loc, lastmod) => `  <url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod></url>`;
  const linhas = [url(`${site.url}/blog`, datas[datas.length - 1] || ''), ...posts.map((p) => url(`${site.url}/blog/${p.slug}`, p.atualizado_em || p.data))];
  fs.writeFileSync(arquivo, limpo.replace('</urlset>', `  ${inicio}\n${linhas.join('\n')}\n  ${fim}\n</urlset>`));
  return true;
}

/** Página de um post. ctx = { site, scripts[], indice[] }. */
function renderPostPage(post, ctxBase) {
  const ctx = {
    site: { url: 'https://laift.com.br', ...ctxBase.site }, scripts: ctxBase.scripts || [], indice: ctxBase.indice || [], avisos: [], contador: { h2: 0, contato: 0 },
  };
  const ctxC = {
    esc, renderInline: (t) => renderInline(t, ctx), icone, avisos: ctx.avisos, contador: ctx.contador, blocos: post.blocos,
  };
  const corpo = post.blocos.map((b) => (RENDER[b.t] ? RENDER[b.t](b, ctx) : campanha.render(b, ctxC))).join('\n');
  const temContato = post.blocos.some((b) => b.t === 'contato');
  const rodape = temContato ? '' : renderContato(ctx);
  const scripts = ctx.scripts.map((s) => `<script type="module" src="${esc(s)}"></script>`).join('');
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#0f6f62">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/blog/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Blog LAIFT">
<title>${esc(post.titulo)} · Blog LAIFT</title>
<meta name="description" content="${esc(post.resumo)}">
${renderMeta(post, ctx)}
<link rel="stylesheet" href="/modulos/shared/laift-tokens.css">
<link rel="stylesheet" href="/publico.css">
<link rel="stylesheet" href="/blog.css">${post.serie === 'campanhas' ? '\n<link rel="stylesheet" href="/blog-campanha.css">' : ''}
</head>
<body class="blog-page blog-post">
<a class="blog-skip" href="#conteudo">Pular para o conteúdo</a>
${renderCabecalho()}
<main id="conteudo">
${renderBreadcrumbs(post)}
<article class="blog-artigo" data-serie="${esc(post.serie)}">
<header class="blog-artigo__cabecalho">
${icone(post.icone, 'blog-artigo__icone')}
<h1>${esc(post.titulo)}</h1>
<p class="blog-artigo__resumo">${esc(post.resumo)}</p>
<p class="blog-artigo__meta"><time datetime="${esc(post.data)}">${dataPtBr(post.data)}</time> · <span>${post.leitura_min} min de leitura</span></p>
</header>
${corpo}
${rodape}
</article>
${renderNavPost(post, ctx)}${renderRelacionados(post, ctx)}
</main>
${RODAPE}
${scripts}
<script src="/static-page.js" defer></script>
<script src="/blog/instalar.js" defer></script>
</body>
</html>
`;
  return { html, avisos: ctx.avisos };
}

function textosDoPost(post) {
  const textos = [post.titulo, post.resumo];
  const colher = (valor, chave) => {
    if (typeof valor === 'string') { if (!['href', 'foto', 'icone', 't', 'tom'].includes(chave)) textos.push(valor); return; }
    if (Array.isArray(valor)) valor.forEach((v) => colher(v, chave));
    else if (valor && typeof valor === 'object') Object.entries(valor).forEach(([k, v]) => colher(v, k));
  };
  colher(post.blocos, 'blocos');
  return textos;
}

function validarTextos(post, erros) {
  for (const texto of textosDoPost(post)) {
    if (/[<>]/.test(texto)) erros.push(`HTML cru em "${texto.slice(0, 40)}"`);
    if (RE_EMAIL.test(texto)) erros.push('e-mail em texto (use o bloco contato e frontend/blog/site.json)');
    const arrobas = (texto.match(RE_ARROBA) || []).map((s) => s.trim()).filter((s) => s.toLowerCase() !== '@laift.liga');
    if (arrobas.length) erros.push(`@menção não permitida: ${arrobas[0]}`);
    for (const { re, motivo } of FRASES_PROIBIDAS) {
      if (re.test(texto)) erros.push(`frase proibida (${motivo}): "${texto.slice(0, 50)}"`);
    }
  }
}

function validarCampos(post, erros) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug || '') || post.slug.length > 60) erros.push('slug inválido');
  if (!post.titulo || post.titulo.length > MAX.titulo) erros.push(`titulo ausente ou > ${MAX.titulo}`);
  if (!post.resumo || post.resumo.length > MAX.resumo) erros.push(`resumo ausente ou > ${MAX.resumo}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.data || '')) erros.push('data deve ser AAAA-MM-DD');
  if (post.atualizado_em !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(post.atualizado_em)) erros.push('atualizado_em deve ser AAAA-MM-DD');
  if (!Array.isArray(post.tags) || !post.tags.length || post.tags.length > MAX.tags
    || post.tags.some((t) => !/^[a-z0-9-]{2,24}$/.test(t))) erros.push('tags inválidas');
  if (!SERIES.includes(post.serie)) erros.push(`serie deve ser uma de ${SERIES.join(', ')}`);
  if (!ICONES.includes(post.icone)) erros.push(`icone desconhecido: ${post.icone}`);
  if (!(post.leitura_min >= 1 && post.leitura_min <= MAX.leitura)) erros.push('leitura_min fora de 1..20');
  if (post.status !== undefined && !STATUS[post.status]) erros.push(`status inválido: ${post.status}`);
  if (!Array.isArray(post.fontes) || !post.fontes.length
    || post.fontes.some((f) => typeof f !== 'string' || !f.trim() || f.length > MAX.fonte)) erros.push('fontes obrigatórias (texto curto com arquivo:linha ou doc)');
  if (!Array.isArray(post.blocos) || !post.blocos.length) erros.push('blocos ausentes');
}

/** Devolve a lista de problemas do post (vazia = válido). */
function validatePost(post, site) {
  const erros = [];
  validarCampos(post, erros);
  const blocos = Array.isArray(post.blocos) ? post.blocos : [];
  const ehCampanha = post.serie === 'campanhas';
  blocos.forEach((b, i) => {
    const comum = !!b && BLOCOS.includes(b.t);
    const extra = !!b && ehCampanha && campanha.BLOCOS_CAMPANHA.includes(b.t);
    if (!comum && !extra) { erros.push(`bloco ${i}: tipo desconhecido (${b && b.t})`); return; }
    if (extra) campanha.validar(b, { blocos, icones: ICONES }).forEach((e) => erros.push(`bloco ${i} (${b.t}): ${e}`));
  });
  if (ehCampanha && !erros.length) erros.push(...campanha.checarPost(blocos));
  if (!erros.length) {
    validarTextos(post, erros);
    try { renderPostPage(post, { site: site || { email: null } }); } catch (e) { erros.push(e.message); }
  }
  return erros;
}

function loadSite(arquivo) {
  const padrao = { email: null, instagram: INSTAGRAM_URL, url: 'https://laift.com.br' };
  if (!fs.existsSync(arquivo)) return padrao;
  const site = { ...padrao, ...JSON.parse(fs.readFileSync(arquivo, 'utf8')) };
  if (site.email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(site.email)) throw new Error('site.json: e-mail inválido');
  return site;
}

function loadPosts(srcDir, { incluirExemplo = false } = {}) {
  const arquivos = fs.readdirSync(srcDir).filter((nome) => nome.endsWith('.json')
    && (incluirExemplo || !nome.startsWith('_'))).sort();
  const posts = [];
  for (const nome of arquivos) {
    const dados = JSON.parse(fs.readFileSync(path.join(srcDir, nome), 'utf8'));
    if (!Array.isArray(dados.posts)) throw new Error(`${nome}: esperado { "posts": [...] }`);
    dados.posts.forEach((p) => posts.push({ ...p, _arquivo: nome }));
  }
  return posts;
}

function indiceDe(posts) {
  const meta = (p) => ({
    slug: p.slug, titulo: p.titulo, resumo: p.resumo, data: p.data, tags: p.tags, serie: p.serie,
    ordem_na_serie: p.ordem_na_serie || 0, icone: p.icone, fixado: !!p.fixado, leitura_min: p.leitura_min,
    href: `blog/${p.slug}.html`,
  });
  return posts.map(meta).sort((a, b) => (Number(b.fixado) - Number(a.fixado)) || b.data.localeCompare(a.data) || a.slug.localeCompare(b.slug));
}

/** Gera as páginas e o índice. Lança erro com todos os problemas de uma vez. */
function build(opcoes = {}) {
  const srcDir = opcoes.srcDir || path.join(ROOT, 'blog', 'conteudo');
  const outDir = opcoes.outDir || path.join(ROOT, 'dist');
  const site = loadSite(opcoes.siteFile || path.join(ROOT, 'blog', 'site.json'));
  const posts = loadPosts(srcDir, { incluirExemplo: !!opcoes.incluirExemplo });
  const problemas = [];
  const vistos = new Set();
  posts.forEach((p) => {
    if (vistos.has(p.slug)) problemas.push(`${p._arquivo}: slug repetido "${p.slug}"`);
    vistos.add(p.slug);
    validatePost(p, site).forEach((e) => problemas.push(`${p._arquivo} / ${p.slug}: ${e}`));
  });
  if (problemas.length) throw new Error(`Blog inválido:\n- ${problemas.join('\n- ')}`);
  const destino = path.join(outDir, 'blog');
  fs.mkdirSync(destino, { recursive: true });
  const scripts = ['post.js'].filter((s) => fs.existsSync(path.join(ROOT, 'blog', s))).map((s) => `/blog/${s}`);
  const scriptsCampanha = fs.existsSync(path.join(ROOT, 'blog', 'campanha.js')) ? [...scripts, '/blog/campanha.js'] : scripts;
  const avisos = [];
  const indice = indiceDe(posts);
  posts.forEach((p) => {
    const pagina = renderPostPage(p, { site, scripts: p.serie === 'campanhas' ? scriptsCampanha : scripts, indice });
    avisos.push(...pagina.avisos.map((a) => `${p.slug}: ${a}`));
    fs.writeFileSync(path.join(destino, `${p.slug}.html`), pagina.html);
  });
  fs.writeFileSync(path.join(destino, 'index.json'), JSON.stringify({ total: indice.length, posts: indice }));
  atualizarSitemap(path.join(outDir, 'sitemap.xml'), posts, site);
  return { posts: posts.length, avisos, indice };
}

function lerArgumento(argv, nome) {
  const i = argv.indexOf(nome);
  return i >= 0 ? path.resolve(argv[i + 1]) : undefined;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const resultado = build({
    outDir: lerArgumento(argv, '--out'),
    srcDir: lerArgumento(argv, '--src'),
    incluirExemplo: argv.includes('--incluir-exemplo'),
  });
  resultado.avisos.forEach((a) => console.warn(`aviso: ${a}`));
  console.log(`Blog: ${resultado.posts} post(s) gerado(s).`);
}

module.exports = {
  build, loadPosts, loadSite, validatePost, renderPostPage, linkPermitido, indiceDe, atualizarSitemap,
  FRASES_PROIBIDAS, ICONES, STATUS, SERIES, BLOCOS,
};
