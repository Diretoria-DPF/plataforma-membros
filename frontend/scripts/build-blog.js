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
const SERIES = ['liga', 'modulos', 'plataforma'];
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
  'seguranca', 'offline', 'desempenho', 'roteiro', 'liga', 'bemvindo', 'novidades', 'ig', 'envelope',
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
      : '<p class="blog-cartao__pendente">Nome a definir pela diretoria</p>';
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

function renderCabecalho(ctx) {
  const insta = renderLink(INSTAGRAM_URL, `${icone('ig')}<span>Instagram</span>`, ctx, 'blog-topo__contato')
    .replace('<a ', '<a aria-label="Instagram da LAIFT, abre em nova aba" ');
  const email = ctx.site.email
    ? renderLink(`mailto:${ctx.site.email}`, `${icone('envelope')}<span>E-mail</span>`, ctx, 'blog-topo__contato')
        .replace('<a ', '<a aria-label="Enviar e-mail para a LAIFT" ')
    : '';
  return `<header class="blog-topo"><a class="blog-topo__marca" href="/blog.html">`
    + `<img src="/modulos/cracha/laift-marca.png" alt="LAIFT" width="40" height="40"><span>Blog LAIFT</span></a>`
    + `<nav class="blog-topo__contatos" aria-label="Contato">${insta}${email}</nav></header>`;
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
  + "connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";

/** Página de um post. ctx = { site, scripts[] }. */
function renderPostPage(post, ctxBase) {
  const ctx = { site: ctxBase.site, scripts: ctxBase.scripts || [], avisos: [], contador: { h2: 0, contato: 0 } };
  const corpo = post.blocos.map((b) => RENDER[b.t](b, ctx)).join('\n');
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
<title>${esc(post.titulo)} · Blog LAIFT</title>
<meta name="description" content="${esc(post.resumo)}">
<link rel="stylesheet" href="/modulos/shared/laift-tokens.css">
<link rel="stylesheet" href="/blog.css">
</head>
<body class="blog-page blog-post">
<a class="blog-skip" href="#conteudo">Pular para o conteúdo</a>
${renderCabecalho(ctx)}
<main id="conteudo">
<article class="blog-artigo" data-serie="${esc(post.serie)}">
<header class="blog-artigo__cabecalho">
${icone(post.icone, 'blog-artigo__icone')}
<h1>${esc(post.titulo)}</h1>
<p class="blog-artigo__resumo">${esc(post.resumo)}</p>
<p class="blog-artigo__meta"><span class="blog-status" data-status="${esc(post.status)}">${STATUS[post.status]}</span>
<time datetime="${esc(post.data)}">${dataPtBr(post.data)}</time> · <span>${post.leitura_min} min de leitura</span></p>
</header>
${corpo}
${rodape}
</article>
</main>
${scripts}
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
  if (!STATUS[post.status]) erros.push(`status inválido: ${post.status}`);
  if (!Array.isArray(post.fontes) || !post.fontes.length
    || post.fontes.some((f) => typeof f !== 'string' || !f.trim() || f.length > MAX.fonte)) erros.push('fontes obrigatórias (texto curto com arquivo:linha ou doc)');
  if (!Array.isArray(post.blocos) || !post.blocos.length) erros.push('blocos ausentes');
}

/** Devolve a lista de problemas do post (vazia = válido). */
function validatePost(post, site) {
  const erros = [];
  validarCampos(post, erros);
  const blocos = Array.isArray(post.blocos) ? post.blocos : [];
  blocos.forEach((b, i) => {
    if (!b || !BLOCOS.includes(b.t)) erros.push(`bloco ${i}: tipo desconhecido (${b && b.t})`);
  });
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
    status: p.status, href: `blog/${p.slug}.html`,
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
  const avisos = [];
  posts.forEach((p) => {
    const pagina = renderPostPage(p, { site, scripts });
    avisos.push(...pagina.avisos.map((a) => `${p.slug}: ${a}`));
    fs.writeFileSync(path.join(destino, `${p.slug}.html`), pagina.html);
  });
  const indice = indiceDe(posts);
  fs.writeFileSync(path.join(destino, 'index.json'), JSON.stringify({ total: indice.length, posts: indice }));
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
  build, loadPosts, loadSite, validatePost, renderPostPage, linkPermitido, indiceDe,
  FRASES_PROIBIDAS, ICONES, STATUS, SERIES, BLOCOS,
};
