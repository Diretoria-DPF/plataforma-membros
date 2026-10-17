// Gera o site estático (PT-BR e EN) a partir de data/dados.json.
// Uso: node src/build.mjs   (SITE_URL=https://seu-dominio npm run build)
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const require = createRequire(import.meta.url);
const qrcode = require(path.join(ROOT, 'vendor/qrcode-generator.cjs'));

const D = JSON.parse(await readFile(path.join(ROOT, 'data/dados.json'), 'utf8'));
const SITE = (process.env.SITE_URL || D.site.url).replace(/\/$/, '');
const P = D.pessoa;
const LANGS = ['pt', 'en'];
const HTML_LANG = { pt: 'pt-BR', en: 'en' };
const OG_LOCALE = { pt: 'pt_BR', en: 'en_US' };

// rotas por página e idioma (com barra final)
const ROUTES = {
  home: { pt: '/', en: '/en/' },
  resume: { pt: '/curriculo/', en: '/en/resume/' },
  card: { pt: '/cartao/', en: '/en/card/' },
  docs: { pt: '/documentacao/', en: '/en/documentation/' }
};

const UI = {
  pt: {
    skip: 'Ir para o conteúdo', nav: { about: 'Sobre', platform: 'Plataforma', modules: 'Módulos', path: 'Trajetória', docs: 'Documentação', contact: 'Contato' },
    heroCta1: 'Ver módulos', heroCta2: 'Currículo', heroCta3: 'Cartão',
    platformTitle: 'A plataforma', platformSub: 'Arquitetura de uma plataforma de ensino em saúde com IA, do navegador ao banco de dados.',
    platformOpen: 'Abrir laift.com.br', platformCode: 'Código no GitHub', archTitle: 'Arquitetura',
    modulesTitle: 'Módulos', modulesSub: 'Cada módulo é uma ferramenta de ensino independente, integrada à mesma plataforma.',
    all: 'Todos', withAi: 'Usa IA', code: 'Código', inPlatform: 'na plataforma', repoLabel: 'Repositório',
    aboutTitle: 'Sobre', skillsTitle: 'Competências', interests: 'Foco e interesses',
    pathTitle: 'Trajetória', eduTitle: 'Formação', certTitle: 'Certificações', prodTitle: 'Produção técnica', langTitle: 'Idiomas',
    docsTitle: 'Documentação', docsSub: 'Perguntas frequentes e descrição técnica da plataforma.', docsCta: 'Ler a documentação completa',
    contactTitle: 'Contato', contactText: 'Interessado em conversar sobre saúde digital, IA aplicada ao ensino ou pesquisa? Escreva.',
    copyEmail: 'Copiar e-mail', copied: 'Copiado!', footer: 'Todos os direitos reservados.', draftNote: 'Currículo e portfólio em construção; dados conferidos com LinkedIn e Lattes.',
    resumeTitle: 'Currículo', print: 'Imprimir / salvar em PDF', downloadPdf: 'Baixar PDF', back: 'Voltar ao portfólio',
    summary: 'Resumo', experience: 'Experiência', education: 'Formação acadêmica', certs: 'Certificações', production: 'Produção técnica e inovação', skills: 'Competências', languages: 'Idiomas', projects: 'Projetos em destaque', contactSec: 'Contato',
    cardTitle: 'Cartão de visita digital', saveContact: 'Salvar contato (.vcf)', scanMe: 'Escaneie para abrir o portfólio', cardPrint: 'Imprimir cartão',
    docsPageTitle: 'Documentação da plataforma', docsPageLead: 'Visão geral, arquitetura, módulos e perguntas frequentes sobre a plataforma LAIFT e o trabalho de Daniel P Francisco.',
    docsOverview: 'Visão geral', docsFaq: 'Perguntas frequentes', docsKeywords: 'Palavras-chave', langSwitch: 'English', langSwitchLabel: 'Read in English',
    metaHome: 'Portfólio de Daniel P Francisco (DPF Labs): estudante de Farmácia e Presidente da LAIFT. Plataformas de ensino em saúde com IA: clínica virtual, quiz de farmacologia, laboratório virtual e atlas 3D.',
    metaResume: 'Currículo de Daniel P Francisco: estudante de Farmácia, Presidente da LAIFT, IA aplicada à saúde e à educação.',
    metaCard: 'Cartão de visita digital de Daniel P Francisco: contato, LinkedIn, GitHub e Lattes.',
    metaDocs: 'Documentação da plataforma LAIFT: arquitetura (Cloudflare Workers, Neon PostgreSQL, IA), módulos de ensino e perguntas frequentes.'
  },
  en: {
    skip: 'Skip to content', nav: { about: 'About', platform: 'Platform', modules: 'Modules', path: 'Experience', docs: 'Docs', contact: 'Contact' },
    heroCta1: 'See modules', heroCta2: 'Resume', heroCta3: 'Card',
    platformTitle: 'The platform', platformSub: 'Architecture of an AI-powered health education platform, from the browser to the database.',
    platformOpen: 'Open laift.com.br', platformCode: 'Code on GitHub', archTitle: 'Architecture',
    modulesTitle: 'Modules', modulesSub: 'Each module is a standalone teaching tool, integrated into the same platform.',
    all: 'All', withAi: 'Uses AI', code: 'Code', inPlatform: 'in the platform', repoLabel: 'Repository',
    aboutTitle: 'About', skillsTitle: 'Skills', interests: 'Focus and interests',
    pathTitle: 'Experience', eduTitle: 'Education', certTitle: 'Certifications', prodTitle: 'Technical output', langTitle: 'Languages',
    docsTitle: 'Documentation', docsSub: 'Frequently asked questions and a technical description of the platform.', docsCta: 'Read the full documentation',
    contactTitle: 'Contact', contactText: 'Interested in talking about digital health, AI in education or research? Get in touch.',
    copyEmail: 'Copy email', copied: 'Copied!', footer: 'All rights reserved.', draftNote: 'Resume and portfolio in progress; data checked against LinkedIn and Lattes.',
    resumeTitle: 'Resume', print: 'Print / save as PDF', downloadPdf: 'Download PDF', back: 'Back to portfolio',
    summary: 'Summary', experience: 'Experience', education: 'Education', certs: 'Certifications', production: 'Technical output and innovation', skills: 'Skills', languages: 'Languages', projects: 'Featured projects', contactSec: 'Contact',
    cardTitle: 'Digital business card', saveContact: 'Save contact (.vcf)', scanMe: 'Scan to open the portfolio', cardPrint: 'Print card',
    docsPageTitle: 'Platform documentation', docsPageLead: 'Overview, architecture, modules and frequently asked questions about the LAIFT platform and the work of Daniel P Francisco.',
    docsOverview: 'Overview', docsFaq: 'Frequently asked questions', docsKeywords: 'Keywords', langSwitch: 'Português', langSwitchLabel: 'Ler em português',
    metaHome: 'Portfolio of Daniel P Francisco (DPF Labs): pharmacy student and LAIFT President. AI-powered health education platforms: virtual clinic, pharmacology quiz, virtual laboratory and 3D atlas.',
    metaResume: 'Resume of Daniel P Francisco: pharmacy student, LAIFT President, AI applied to health and education.',
    metaCard: 'Digital business card of Daniel P Francisco: contact, LinkedIn, GitHub and Lattes.',
    metaDocs: 'LAIFT platform documentation: architecture (Cloudflare Workers, Neon PostgreSQL, AI), teaching modules and FAQ.'
  }
};

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tr = (v, l) => (v && typeof v === 'object' && !Array.isArray(v) && (l in v) ? v[l] : v);
const abs = (p) => SITE + p;
const repoUrl = (m) => `${D.site.repoBase}/${m.repo}${m.caminho ? `/tree/main/${m.caminho}` : ''}`;
const icon = (name) => ({
  mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2m12 4v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.3 1.3a11.4 11.4 0 0 0-6 0C6.7 2.7 5.7 3 5.7 3a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.3 9.5c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21"/>',
  linkedin: '<path d="M6 9v10M6 5.5v.01M10 19v-6a3 3 0 0 1 6 0v6M10 9v10"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
}[name] || '');
const svgIcon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon(name)}</svg>`;

function qrSvg(text, size = 220) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const v = n + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${v}" height="${v}" fill="#fff"/><path d="${d}" fill="#07110f"/></svg>`;
}

// ---------- blocos reutilizáveis ----------
function head({ lang, page, title, desc, ld = [], noindex = false }) {
  const other = LANGS.find((l) => l !== lang);
  const url = abs(ROUTES[page][lang]);
  const ogImg = abs('/assets/og.png');
  return `<!doctype html>
<html lang="${HTML_LANG[lang]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(P.nomePublico)}">
<meta name="keywords" content="${esc(D.palavrasChave[lang].join(', '))}">
<meta name="theme-color" content="#07110f">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="pt-BR" href="${abs(ROUTES[page].pt)}">
<link rel="alternate" hreflang="en" href="${abs(ROUTES[page].en)}">
<link rel="alternate" hreflang="x-default" href="${abs(ROUTES[page].pt)}">
<meta property="og:type" content="${page === 'home' ? 'profile' : 'website'}">
<meta property="og:site_name" content="${D.site.brand}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta property="og:locale:alternate" content="${OG_LOCALE[other]}">
<meta property="og:image" content="${ogImg}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="stylesheet" href="/assets/style.css">
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>`;
}

function nav(lang, page) {
  const u = UI[lang];
  const other = LANGS.find((l) => l !== lang);
  const home = ROUTES.home[lang];
  const anchor = (id) => (page === 'home' ? `#${id}` : `${home}#${id}`);
  const items = [['about', 'about'], ['platform', 'platform'], ['modules', 'modules'], ['path', 'path'], ['docs', 'docs'], ['contact', 'contact']];
  return `<a class="skip" href="#main">${u.skip}</a>
<header class="site-nav" id="top">
  <div class="nav-inner">
    <a class="brand" href="${home}" aria-label="${D.site.brand}"><span class="brand-mark">DPF</span><span class="brand-text">Labs</span></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu"><span></span><span></span><span></span></button>
    <nav id="nav-links" class="nav-links" aria-label="${lang === 'pt' ? 'Principal' : 'Main'}">
      ${items.map(([k, id]) => (k === 'docs' ? `<a href="${ROUTES.docs[lang]}">${u.nav[k]}</a>` : `<a href="${anchor(id)}" data-section="${id}">${u.nav[k]}</a>`)).join('\n      ')}
      <a class="lang-switch" href="${ROUTES[page][other]}" hreflang="${HTML_LANG[other]}" lang="${HTML_LANG[other]}" aria-label="${UI[lang].langSwitchLabel}">${svgIcon('globe')}${UI[lang].langSwitch}</a>
    </nav>
  </div>
</header>`;
}

function footer(lang) {
  const u = UI[lang];
  return `<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-links">
      <a href="${P.links.linkedin}" rel="me noopener" target="_blank">LinkedIn</a>
      <a href="${P.links.github}" rel="me noopener" target="_blank">GitHub</a>
      <a href="${P.links.lattes}" rel="me noopener" target="_blank">Lattes</a>
      <a href="${P.links.plataforma}" rel="noopener" target="_blank">laift.com.br</a>
      <a href="${ROUTES.resume[lang]}">${u.resumeTitle}</a>
      <a href="${ROUTES.card[lang]}">${u.heroCta3}</a>
    </div>
    <p class="footer-copy">&copy; ${new Date().getFullYear()} ${esc(P.nomePublico)} · ${D.site.brand}. ${u.footer}</p>
  </div>
</footer>`;
}

const personLd = (lang) => ({
  '@type': 'Person',
  '@id': abs('/#person'),
  name: P.nomePublico,
  alternateName: P.nomeCompleto,
  url: abs(ROUTES.home[lang]),
  email: `mailto:${P.email}`,
  jobTitle: lang === 'pt' ? 'Presidente da LAIFT; estudante de Farmácia' : 'LAIFT President; pharmacy student',
  description: tr(P.tagline, lang),
  address: { '@type': 'PostalAddress', addressLocality: 'Salvador', addressRegion: 'BA', addressCountry: 'BR' },
  worksFor: { '@type': 'Organization', name: 'LAIFT — Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia' },
  affiliation: { '@type': 'EducationalOrganization', name: 'UNINASSAU Salvador' },
  knowsAbout: ['Farmacologia', 'Toxicologia', 'Inteligência artificial', 'Engenharia de prompt', 'Saúde digital', 'Tecnologias educacionais', 'Pharmacology', 'Toxicology', 'Artificial intelligence', 'Digital health'],
  sameAs: [P.links.linkedin, P.links.github, P.links.lattes]
});

function moduleCard(m, lang) {
  const u = UI[lang];
  const areas = m.area.join(' ');
  return `<article class="card module${m.destaque ? ' featured' : ''}" data-areas="${areas}" data-ai="${m.ia ? '1' : '0'}">
  <span class="card-accent" aria-hidden="true"></span>
  <div class="card-head">
    <h3>${esc(tr(m.nome, lang))}</h3>
    ${m.ia ? `<span class="badge ai">${svgIcon('spark', 'ic sm')}${u.withAi}</span>` : ''}
  </div>
  <p>${esc(tr(m.texto, lang))}</p>
  <ul class="tags">${m.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  <a class="card-link" href="${repoUrl(m)}" target="_blank" rel="noopener">${svgIcon('github')}<span>${m.caminho ? `${m.repo} · ${u.inPlatform}` : m.repo}</span>${svgIcon('arrow', 'ic arrow')}</a>
</article>`;
}

// ---------- páginas ----------
function homePage(lang) {
  const u = UI[lang];
  const ld = [{
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'ProfilePage', '@id': abs(ROUTES.home[lang]), url: abs(ROUTES.home[lang]), name: `${P.nomePublico} — ${D.site.brand}`, inLanguage: HTML_LANG[lang], mainEntity: { '@id': abs('/#person') } },
      personLd(lang),
      ...D.modulos.map((m) => ({ '@type': 'SoftwareSourceCode', name: tr(m.nome, lang), description: tr(m.texto, lang), codeRepository: repoUrl(m), author: { '@id': abs('/#person') }, inLanguage: 'JavaScript' }))
    ]
  }];
  const areaChips = [`<button class="chip active" data-filter="all">${u.all}</button>`, `<button class="chip" data-filter="ai">${svgIcon('spark', 'ic sm')}${u.withAi}</button>`]
    .concat(D.areas.map((a) => `<button class="chip" data-filter="${a.id}">${esc(tr(a.nome, lang))}</button>`)).join('');
  return `${head({ lang, page: 'home', title: `${P.nomePublico} — ${tr(P.headline, lang).split(' · ').slice(0, 2).join(' · ')} | ${D.site.brand}`, desc: u.metaHome, ld })}
<body class="page-home">
${nav(lang, 'home')}
<aside class="side-hud" aria-hidden="true"><ul>${['hero', 'about', 'platform', 'modules', 'path', 'contact'].map((s, i) => `<li data-target="${s}"${i === 0 ? ' class="active"' : ''}>${s === 'hero' ? (lang === 'pt' ? 'Início' : 'Home') : u.nav[s]}</li>`).join('')}</ul></aside>
<main id="main">
  <section class="hero" id="hero">
    <div class="hero-inner">
      <div class="hero-text reveal">
        <p class="eyebrow">${esc(D.site.brand)}</p>
        <h1>${esc(P.nomePublico)}</h1>
        <p class="hero-sub">${esc(tr(P.headline, lang))}</p>
        <p class="hero-desc">${esc(tr(P.tagline, lang))}</p>
        <div class="hero-cta">
          <a class="btn primary" href="#modules">${u.heroCta1}${svgIcon('arrow')}</a>
          <a class="btn ghost" href="${ROUTES.resume[lang]}">${u.heroCta2}</a>
          <a class="btn ghost" href="${ROUTES.card[lang]}">${u.heroCta3}</a>
        </div>
        <ul class="social">
          <li><a href="${P.links.github}" target="_blank" rel="me noopener" aria-label="GitHub">${svgIcon('github')}</a></li>
          <li><a href="${P.links.linkedin}" target="_blank" rel="me noopener" aria-label="LinkedIn">${svgIcon('linkedin')}</a></li>
          <li><a href="${P.links.lattes}" target="_blank" rel="me noopener" aria-label="Lattes">${svgIcon('book')}</a></li>
          <li><a href="mailto:${P.email}" aria-label="E-mail">${svgIcon('mail')}</a></li>
        </ul>
      </div>
      <div class="hero-visual reveal" aria-hidden="true">
        <div class="monogram"><span>DPF</span></div>
      </div>
    </div>
  </section>

  <section class="band about" id="about">
    <div class="wrap">
      <h2 class="section-title reveal">${u.aboutTitle}</h2>
      <div class="about-text reveal">${tr(P.resumo, lang).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <h3 class="sub reveal">${u.skillsTitle}</h3>
      <div class="grid skills">
        ${D.competencias.map((c) => `<article class="card skill reveal"><span class="card-accent" aria-hidden="true"></span><h3>${esc(tr(c.titulo, lang))}</h3><p>${esc(tr(c.texto, lang))}</p><ul class="tags">${c.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></article>`).join('')}
      </div>
      <h3 class="sub reveal">${u.interests}</h3>
      <ul class="interest reveal">${D.interesses[lang].map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>
  </section>

  <section class="band platform" id="platform">
    <div class="wrap">
      <h2 class="section-title reveal">${u.platformTitle}</h2>
      <p class="section-sub reveal">${u.platformSub}</p>
      <div class="platform-card card reveal">
        <span class="card-accent" aria-hidden="true"></span>
        <h3>${esc(D.plataforma.nome)}</h3>
        <p>${esc(tr(D.plataforma.descricao, lang))}</p>
        <div class="hero-cta">
          <a class="btn primary" href="${D.plataforma.url}" target="_blank" rel="noopener">${u.platformOpen}${svgIcon('arrow')}</a>
          <a class="btn ghost" href="${D.site.repoBase}/${D.plataforma.repo}" target="_blank" rel="noopener">${svgIcon('github')}${u.platformCode}</a>
        </div>
      </div>
      <h3 class="sub reveal">${u.archTitle}</h3>
      <ol class="arch reveal">
        ${D.plataforma.arquitetura.map((a, i) => `<li class="arch-step"><span class="arch-n">${i + 1}</span><div><h4>${esc(tr(a.titulo, lang))}</h4><p>${esc(tr(a.texto, lang))}</p><ul class="tags">${a.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></li>`).join('')}
      </ol>
      <p class="center reveal"><a class="btn ghost" href="${ROUTES.docs[lang]}">${u.docsCta}${svgIcon('arrow')}</a></p>
    </div>
  </section>

  <section class="band modules" id="modules">
    <div class="wrap">
      <h2 class="section-title reveal">${u.modulesTitle}</h2>
      <p class="section-sub reveal">${u.modulesSub}</p>
      <div class="chips reveal" role="group" aria-label="${lang === 'pt' ? 'Filtrar módulos' : 'Filter modules'}">${areaChips}</div>
      <div class="grid modules-grid">
        ${D.modulos.map((m) => moduleCard(m, lang)).join('\n')}
      </div>
    </div>
  </section>

  <section class="band path" id="path">
    <div class="wrap">
      <h2 class="section-title reveal">${u.pathTitle}</h2>
      <ol class="timeline">
        ${D.trajetoria.map((t) => `<li class="reveal"><span class="when">${esc(tr(t.periodo, lang))}</span><div><h3>${esc(tr(t.cargo, lang))}</h3><p class="org">${esc(tr(t.org, lang))}</p><p>${esc(tr(t.texto, lang))}</p></div></li>`).join('')}
      </ol>
      <div class="grid three">
        <div class="card reveal"><span class="card-accent" aria-hidden="true"></span><h3>${u.eduTitle}</h3><ul class="plain">${D.formacao.map((f) => `<li><strong>${esc(tr(f.titulo, lang))}</strong><br>${esc(f.org)} · ${esc(f.periodo)}</li>`).join('')}</ul></div>
        <div class="card reveal"><span class="card-accent" aria-hidden="true"></span><h3>${u.certTitle}</h3><ul class="plain">${D.certificacoes.map((c) => `<li>${esc(tr(c.nome, lang))}${c.emissor ? ` · ${esc(c.emissor)}` : ''}</li>`).join('')}</ul></div>
        <div class="card reveal"><span class="card-accent" aria-hidden="true"></span><h3>${u.prodTitle}</h3><ul class="plain">${D.producao.map((p) => `<li>${esc(tr(p.titulo, lang))} <em>(${p.ano})</em></li>`).join('')}</ul><h3 class="mt">${u.langTitle}</h3><ul class="plain">${D.idiomas.map((i) => `<li>${esc(tr(i.nome, lang))} · ${esc(tr(i.nivel, lang))}</li>`).join('')}</ul></div>
      </div>
    </div>
  </section>

  <section class="band docs" id="docs">
    <div class="wrap">
      <h2 class="section-title reveal">${u.docsTitle}</h2>
      <p class="section-sub reveal">${u.docsSub}</p>
      <div class="faq reveal">
        ${D.faq.map((f) => `<details><summary>${esc(tr(f.q, lang))}</summary><p>${esc(tr(f.a, lang))}</p></details>`).join('')}
      </div>
      <p class="center reveal"><a class="btn primary" href="${ROUTES.docs[lang]}">${u.docsCta}${svgIcon('arrow')}</a></p>
    </div>
  </section>

  <section class="band contact" id="contact">
    <div class="wrap narrow">
      <h2 class="section-title reveal">${u.contactTitle}</h2>
      <p class="section-sub reveal">${u.contactText}</p>
      <div class="contact-links reveal">
        <a class="contact-link" href="mailto:${P.email}">${svgIcon('mail')}<span>${P.email}</span></a>
        <button class="contact-link copy" type="button" data-copy="${P.email}" data-done="${u.copied}">${svgIcon('mail')}<span>${u.copyEmail}</span></button>
        <a class="contact-link" href="${P.links.linkedin}" target="_blank" rel="me noopener">${svgIcon('linkedin')}<span>LinkedIn</span></a>
        <a class="contact-link" href="${P.links.github}" target="_blank" rel="me noopener">${svgIcon('github')}<span>GitHub</span></a>
        <a class="contact-link" href="${P.links.lattes}" target="_blank" rel="me noopener">${svgIcon('book')}<span>Lattes</span></a>
        <span class="contact-link static">${svgIcon('pin')}<span>${esc(tr(P.local, lang))}</span></span>
      </div>
    </div>
  </section>
</main>
${footer(lang)}
<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

function resumePage(lang) {
  const u = UI[lang];
  const ld = [{ '@context': 'https://schema.org', '@type': 'ProfilePage', url: abs(ROUTES.resume[lang]), inLanguage: HTML_LANG[lang], mainEntity: personLd(lang) }];
  const featured = D.modulos.filter((m) => m.destaque);
  return `${head({ lang, page: 'resume', title: `${u.resumeTitle} — ${P.nomePublico}`, desc: u.metaResume, ld })}
<body class="page-resume">
${nav(lang, 'resume')}
<main id="main" class="doc-main">
  <div class="doc-actions no-print">
    <a class="btn ghost" href="${ROUTES.home[lang]}">${u.back}</a>
    <button class="btn primary" type="button" data-print>${u.print}</button>
    <a class="btn ghost" href="/${lang === 'pt' ? 'Daniel-P-Francisco-Curriculo-PT.pdf' : 'Daniel-P-Francisco-Resume-EN.pdf'}" download>${u.downloadPdf}</a>
  </div>
  <article class="paper">
    <header class="paper-head">
      <h1>${esc(P.nomePublico)}</h1>
      <p class="paper-sub">${esc(tr(P.headline, lang))}</p>
      <p class="paper-contact">${esc(tr(P.local, lang))} · <a href="mailto:${P.email}">${P.email}</a><br>
        <a href="${P.links.linkedin}">linkedin.com/in/daniel-pires-farmacia</a> · <a href="${P.links.github}">github.com/Diretoria-DPF</a> · <a href="${P.links.lattes}">lattes.cnpq.br/5041510175000740</a></p>
    </header>
    <section><h2>${u.summary}</h2>${tr(P.resumo, lang).map((p) => `<p>${esc(p)}</p>`).join('')}</section>
    <section><h2>${u.experience}</h2>${D.trajetoria.map((t) => `<div class="job"><div class="job-head"><span class="job-title"><strong>${esc(tr(t.cargo, lang))}</strong> · ${esc(tr(t.org, lang))}</span><span class="job-when">${esc(tr(t.periodo, lang))}</span></div><p>${esc(tr(t.texto, lang))}</p></div>`).join('')}</section>
    <section><h2>${u.projects}</h2>${featured.map((m) => `<div class="job"><div class="job-head"><span class="job-title"><strong>${esc(tr(m.nome, lang))}</strong></span><span class="job-when">${esc(m.repo)}</span></div><p>${esc(tr(m.texto, lang))}</p></div>`).join('')}<p class="small">${esc(tr(D.plataforma.descricao, lang))} — <a href="${P.links.plataforma}">laift.com.br</a></p></section>
    <section class="cols">
      <div><h2>${u.education}</h2><ul>${D.formacao.map((f) => `<li><strong>${esc(tr(f.titulo, lang))}</strong>, ${esc(f.org)} (${esc(f.periodo)})</li>`).join('')}</ul>
      <h2>${u.languages}</h2><ul>${D.idiomas.map((i) => `<li>${esc(tr(i.nome, lang))}: ${esc(tr(i.nivel, lang))}</li>`).join('')}</ul></div>
      <div><h2>${u.certs}</h2><ul>${D.certificacoes.map((c) => `<li>${esc(tr(c.nome, lang))}${c.emissor ? ` (${esc(c.emissor)})` : ''}</li>`).join('')}</ul></div>
    </section>
    <section><h2>${u.production}</h2><ul>${D.producao.map((p) => `<li>${esc(tr(p.titulo, lang))} (${p.ano})</li>`).join('')}</ul></section>
    <section><h2>${u.skills}</h2><p>${D.competencias.flatMap((c) => c.tags).map(esc).join(' · ')}</p></section>
  </article>
</main>
${footer(lang)}
<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

function cardPage(lang) {
  const u = UI[lang];
  const home = abs(ROUTES.home[lang]);
  const ld = [{ '@context': 'https://schema.org', '@type': 'ProfilePage', url: abs(ROUTES.card[lang]), inLanguage: HTML_LANG[lang], mainEntity: personLd(lang) }];
  return `${head({ lang, page: 'card', title: `${u.cardTitle} — ${P.nomePublico}`, desc: u.metaCard, ld })}
<body class="page-card">
${nav(lang, 'card')}
<main id="main" class="card-main">
  <article class="bizcard">
    <div class="bizcard-info">
      <p class="eyebrow">${esc(D.site.brand)}</p>
      <h1>${esc(P.nomePublico)}</h1>
      <p class="hero-sub">${esc(tr(P.headline, lang))}</p>
      <ul class="contact-list">
        <li>${svgIcon('mail')}<a href="mailto:${P.email}">${P.email}</a></li>
        <li>${svgIcon('pin')}${esc(tr(P.local, lang))}</li>
        <li>${svgIcon('linkedin')}<a href="${P.links.linkedin}" rel="me noopener" target="_blank">LinkedIn</a></li>
        <li>${svgIcon('github')}<a href="${P.links.github}" rel="me noopener" target="_blank">GitHub</a></li>
        <li>${svgIcon('book')}<a href="${P.links.lattes}" rel="me noopener" target="_blank">Lattes</a></li>
        <li>${svgIcon('globe')}<a href="${home}">${home.replace(/^https?:\/\//, '')}</a></li>
      </ul>
    </div>
    <figure class="bizcard-qr">${qrSvg(home)}<figcaption>${u.scanMe}</figcaption></figure>
  </article>
  <div class="doc-actions no-print center">
    <a class="btn primary" href="/daniel-p-francisco.vcf" download>${u.saveContact}</a>
    <button class="btn ghost" type="button" data-print>${u.cardPrint}</button>
    <a class="btn ghost" href="${ROUTES.home[lang]}">${u.back}</a>
  </div>
</main>
${footer(lang)}
<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

function docsPage(lang) {
  const u = UI[lang];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: HTML_LANG[lang], mainEntity: D.faq.map((f) => ({ '@type': 'Question', name: tr(f.q, lang), acceptedAnswer: { '@type': 'Answer', text: tr(f.a, lang) } })) },
    { '@context': 'https://schema.org', '@type': 'TechArticle', headline: u.docsPageTitle, inLanguage: HTML_LANG[lang], author: { '@id': abs('/#person') }, about: D.plataforma.nome, keywords: D.palavrasChave[lang].join(', '), url: abs(ROUTES.docs[lang]) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: D.site.brand, item: abs(ROUTES.home[lang]) }, { '@type': 'ListItem', position: 2, name: u.docsPageTitle, item: abs(ROUTES.docs[lang]) }] }
  ];
  return `${head({ lang, page: 'docs', title: `${u.docsPageTitle} — ${D.site.brand}`, desc: u.metaDocs, ld })}
<body class="page-docs">
${nav(lang, 'docs')}
<main id="main" class="doc-main">
  <article class="prose">
    <nav class="crumbs" aria-label="breadcrumb"><a href="${ROUTES.home[lang]}">${D.site.brand}</a> / ${u.docsPageTitle}</nav>
    <h1>${u.docsPageTitle}</h1>
    <p class="lead">${u.docsPageLead}</p>
    <h2>${u.docsOverview}</h2>
    <p>${esc(tr(D.plataforma.descricao, lang))}</p>
    <p><a class="btn primary" href="${D.plataforma.url}" target="_blank" rel="noopener">${u.platformOpen}${svgIcon('arrow')}</a> <a class="btn ghost" href="${D.site.repoBase}/${D.plataforma.repo}" target="_blank" rel="noopener">${svgIcon('github')}${u.platformCode}</a></p>
    <h2>${u.archTitle}</h2>
    <figure class="diagram">${archDiagram(lang)}</figure>
    <ol class="arch">${D.plataforma.arquitetura.map((a, i) => `<li class="arch-step"><span class="arch-n">${i + 1}</span><div><h3>${esc(tr(a.titulo, lang))}</h3><p>${esc(tr(a.texto, lang))}</p><ul class="tags">${a.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></li>`).join('')}</ol>
    <h2>${u.modulesTitle}</h2>
    <div class="grid modules-grid">${D.modulos.map((m) => moduleCard(m, lang)).join('')}</div>
    <h2>${u.docsFaq}</h2>
    <div class="faq">${D.faq.map((f) => `<details open><summary>${esc(tr(f.q, lang))}</summary><p>${esc(tr(f.a, lang))}</p></details>`).join('')}</div>
    <h2>${u.docsKeywords}</h2>
    <ul class="tags">${D.palavrasChave[lang].map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
  </article>
</main>
${footer(lang)}
<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

function archDiagram(lang) {
  const t = (pt, en) => (lang === 'pt' ? pt : en);
  const box = (x, y, w, h, title, sub, c) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="var(--bg-card)" stroke="${c}" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)">${esc(title)}</text><text x="${x + w / 2}" y="${y + 52}" text-anchor="middle" font-size="12" fill="var(--muted)">${esc(sub)}</text></g>`;
  const arrow = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="var(--muted)" stroke-width="1.5" marker-end="url(#ah)"/>`;
  return `<svg viewBox="0 0 760 250" role="img" aria-label="${t('Diagrama da arquitetura: navegador, Worker, Neon PostgreSQL e Groq', 'Architecture diagram: browser, Worker, Neon PostgreSQL and Groq')}" font-family="inherit">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted)"/></marker></defs>
${box(10, 90, 190, 70, t('Navegador', 'Browser'), 'HTML · CSS · JS', 'var(--cyan)')}
${box(285, 90, 190, 70, 'Cloudflare Worker', 'API_REGISTRY · sessão · CSP', 'var(--green)')}
${box(560, 20, 190, 70, 'Neon PostgreSQL', t('dados · migrações', 'data · migrations'), 'var(--violet)')}
${box(560, 160, 190, 70, t('Groq (LLM)', 'Groq (LLM)'), t('IA · cota · disjuntor', 'AI · quota · breaker'), 'var(--amber)')}
${arrow(200, 125, 283, 125)}${arrow(475, 110, 558, 70)}${arrow(475, 140, 558, 180)}
<text x="242" y="115" text-anchor="middle" font-size="11" fill="var(--muted)">fetch JSON</text>
</svg>`;
}

function vcard() {
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:Francisco;Daniel P;;;`, `FN:${P.nomePublico}`,
    'ORG:DPF Labs;LAIFT', 'TITLE:Presidente da LAIFT / President of LAIFT',
    `EMAIL;TYPE=INTERNET:${P.email}`, `URL:${abs('/')}`,
    `X-SOCIALPROFILE;TYPE=linkedin:${P.links.linkedin}`, `X-SOCIALPROFILE;TYPE=github:${P.links.github}`,
    'ADR;TYPE=WORK:;;;Salvador;BA;;Brasil', 'END:VCARD', ''
  ].join('\r\n');
}

function sitemap() {
  const urls = Object.values(ROUTES).map((r) => `  <url><loc>${abs(r.pt)}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HTML_LANG[l]}" href="${abs(r[l])}"/>`).join('')}</url>\n  <url><loc>${abs(r.en)}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HTML_LANG[l]}" href="${abs(r[l])}"/>`).join('')}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------- saída ----------
await rm(DIST, { recursive: true, force: true });
await cp(path.join(ROOT, 'src/assets'), path.join(DIST, 'assets'), { recursive: true });

const PAGES = { home: homePage, resume: resumePage, card: cardPage, docs: docsPage };
for (const [page, render] of Object.entries(PAGES)) {
  for (const lang of LANGS) {
    const dir = path.join(DIST, ROUTES[page][lang]);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), render(lang));
  }
}
await writeFile(path.join(DIST, 'daniel-p-francisco.vcf'), vcard());
await writeFile(path.join(DIST, 'sitemap.xml'), sitemap());
await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);
await writeFile(path.join(DIST, '404.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>404 — ${D.site.brand}</title><link rel="stylesheet" href="/assets/style.css"></head><body><main class="doc-main center"><h1>404</h1><p>Página não encontrada · Page not found</p><p><a class="btn primary" href="/">DPF Labs</a> <a class="btn ghost" href="/en/">English</a></p></main></body></html>\n`);
console.log(`build ok → ${path.relative(process.cwd(), DIST) || DIST}  (SITE_URL=${SITE})`);
