/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * biblioteca.e2e.js — página pública /biblioteca (biblioteca.html, CONTRATO-B2 §2), sobre o BUILD
 * (frontend/dist/). Gera a página a partir da fixture de 6 artigos (um deles com <script> no título)
 * e, ao fim, devolve dist/ ao estado anterior. Confere: h1 único, lista visível sem JavaScript, filtro
 * por termo com acento, "Só acesso aberto", "Limpar filtros", escape e JSON-LD válido, 375 e 1280 px
 * em claro e escuro, e axe.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');
const { build } = require('../build-biblioteca.js');

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const DIST = path.join(__dirname, '..', '..', 'dist');
const PASTA_BIBLIOTECA = path.join(DIST, 'biblioteca');
const FIXTURE = path.join(__dirname, 'fixtures', 'biblioteca-snapshot.json');
const TOTAL_ARTIGOS = 6;
const TOTAL_ACESSO_ABERTO = 3;
const ALVO_MINIMO_PX = 44;
const PRAZO_MS = 3000;
// Arquivos que o gerador cria ou altera dentro de dist/. Antes da geração, guarda-se o estado de cada um.
const ARQUIVOS_GERADOS = ['biblioteca.html', 'biblioteca/index.json', 'biblioteca/catalogo.js', 'sitemap.xml', 'llms.txt'];

/** Gera a página com a fixture e devolve a função que desfaz tudo (dist/ volta ao estado anterior). */
function gerarPaginaDeTeste() {
  const pastaExistia = fs.existsSync(PASTA_BIBLIOTECA);
  const antes = Object.fromEntries(ARQUIVOS_GERADOS.map((nome) => {
    const caminho = path.join(DIST, nome);
    return [nome, fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : null];
  }));
  const resultado = build({ outDir: DIST, recente: FIXTURE });
  return {
    resultado,
    desfazer() {
      for (const nome of ARQUIVOS_GERADOS) {
        const caminho = path.join(DIST, nome);
        if (antes[nome] === null) fs.rmSync(caminho, { force: true });
        else fs.writeFileSync(caminho, antes[nome]);
      }
      if (!pastaExistia && fs.existsSync(PASTA_BIBLIOTECA) && fs.readdirSync(PASTA_BIBLIOTECA).length === 0) {
        fs.rmdirSync(PASTA_BIBLIOTECA);
      }
    },
  };
}

/** Abre a página num contexto próprio (tema e JavaScript controlados aqui). */
async function abrirPagina(app, { viewport, colorScheme, javaScript = true }) {
  const contexto = await app.browser.newContext({ viewport, colorScheme, javaScriptEnabled: javaScript });
  await contexto.addInitScript(() => {
    window.__cspViolacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolacoes.push(e.effectiveDirective));
  });
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`${app.baseUrl}biblioteca.html`);
  return { contexto, page, erros };
}

/** Espera uma condição assíncrona (até PRAZO_MS). Devolve true se ela se cumpriu. */
async function esperar(condicao) {
  const fim = Date.now() + PRAZO_MS;
  while (Date.now() < fim) {
    if (await condicao()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function textoStatus(page) {
  return page.textContent('#bib-status');
}

// Só o <li id="a-<id>"> filho direto de .bib-lista recebe hidden; os <li> dos selos ficam dentro dele.
function artigosVisiveis(page) {
  return page.locator('.bib-lista > li:not([hidden])').count();
}

/** Dentro da página: controles visíveis de `selector` com largura ou altura abaixo de `min` px. */
function alvosPequenos(args) {
  return Array.from(document.querySelectorAll(args.selector))
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.textContent || el.id || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((t) => t.w < args.min || t.h < args.min);
}

async function checarSemRolagem(page, rotulo) {
  const excedente = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(excedente <= 1, `${rotulo}: sem rolagem horizontal (${excedente}px além da largura)`);
}

async function checarAlvos(page, seletor, rotulo) {
  const pequenos = await page.evaluate(alvosPequenos, { selector: seletor, min: ALVO_MINIMO_PX });
  const lista = pequenos.map((t) => `"${t.label}" ${t.w}x${t.h}`).join('; ');
  check(pequenos.length === 0, `${rotulo}: alvos abaixo de ${ALVO_MINIMO_PX}x${ALVO_MINIMO_PX}${lista ? ': ' + lista : ''}`);
}

/** Sem JavaScript: a lista inteira aparece e o formulário de filtros fica escondido. */
async function semJavaScript(app) {
  const { contexto, page } = await abrirPagina(app, { viewport: DESKTOP, javaScript: false });
  try {
    check((await page.locator('.bib-titulo').count()) === TOTAL_ARTIGOS, `sem JavaScript: os ${TOTAL_ARTIGOS} artigos aparecem na lista`);
    check(await page.locator('.bib-lista > li').first().isVisible(), 'sem JavaScript: a lista está visível');
    check(await page.locator('.bib-filtros').isHidden(), 'sem JavaScript: o formulário de filtros fica escondido');
  } finally {
    await contexto.close();
  }
}

/** Página com JavaScript: h1 único, JSON-LD válido, escape do título, filtros e "Limpar filtros". */
async function paginaComFiltros(app) {
  const { contexto, page, erros } = await abrirPagina(app, { viewport: DESKTOP });
  try {
    await page.waitForSelector('.bib-filtros:not([hidden])');
    check((await page.locator('h1').count()) === 1 && (await page.textContent('h1')).trim() === 'Biblioteca LAIFT', 'página: um único h1 "Biblioteca LAIFT"');
    check(await esperar(async () => (await textoStatus(page)).includes(`${TOTAL_ARTIGOS} artigos`)), `página: o status mostra ${TOTAL_ARTIGOS} artigos`);

    const jsonLd = await page.textContent('script[type="application/ld+json"]');
    let valido = false;
    try { JSON.parse(jsonLd); valido = true; } catch (err) { valido = false; }
    check(valido, 'JSON-LD: o bloco é JSON válido (um título com </script> não quebra o bloco)');
    check((await page.evaluate(() => window.__xss)) === undefined, 'escape: o <script> do título não é executado');
    check((await page.locator('.bib-titulo', { hasText: '<script>' }).count()) === 1, 'escape: o título com <script> aparece como texto');

    await page.fill('#bib-q', 'cafeína');
    check(await esperar(async () => (await textoStatus(page)).includes('1 artigo')), 'busca "cafeína" (com acento): sobra 1 artigo');
    check((await artigosVisiveis(page)) === 1, 'busca "cafeína": 1 item visível na lista');

    await page.fill('#bib-q', 'acao');
    check(await esperar(async () => (await textoStatus(page)).includes('1 artigo')), 'busca "acao" (sem acento): encontra o mesmo artigo');

    await page.fill('#bib-q', '');
    check(await esperar(async () => (await textoStatus(page)).includes(`${TOTAL_ARTIGOS} artigos`)), 'busca vazia: a lista volta aos 6 artigos');

    await page.check('#bib-aberto');
    check(await esperar(async () => (await textoStatus(page)).includes(`${TOTAL_ACESSO_ABERTO} artigos`)), `"Só acesso aberto": ficam ${TOTAL_ACESSO_ABERTO} artigos`);

    await page.click('#bib-limpar');
    check(await esperar(async () => (await textoStatus(page)).includes(`${TOTAL_ARTIGOS} artigos`)), '"Limpar filtros": volta a lista completa');
    check((await page.inputValue('#bib-q')) === '' && !(await page.isChecked('#bib-aberto')), '"Limpar filtros": limpa o termo e o acesso aberto');

    const linksDeArtigo = await page.$$eval('.bib-lista a[target="_blank"]', (links) => links.map((a) => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel') || '' })));
    const todosSeguros = linksDeArtigo.length === TOTAL_ARTIGOS && linksDeArtigo.every((l) => /noopener/.test(l.rel) && /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\//.test(l.href));
    check(todosSeguros, 'links: cada artigo abre o site oficial em nova aba com noopener (doi.org ou PubMed)');
    const violacoes = await page.evaluate(() => window.__cspViolacoes);
    check(violacoes.length === 0, `CSP: sem violações${violacoes.length ? ' (' + violacoes.join(', ') + ')' : ''}`);
    check(erros.length === 0, `página: sem erros de JavaScript (${erros.join('; ')})`);
  } finally {
    await contexto.close();
  }
}

/** 375 e 1280 px, claro e escuro: sem rolagem horizontal, alvos e axe. */
async function layoutETemas(app) {
  for (const viewport of [MOBILE, DESKTOP]) {
    for (const colorScheme of ['light', 'dark']) {
      const rotulo = `${viewport.width}px ${colorScheme === 'dark' ? 'escuro' : 'claro'}`;
      const { contexto, page } = await abrirPagina(app, { viewport, colorScheme });
      try {
        await page.waitForSelector('.bib-filtros:not([hidden])');
        await checarSemRolagem(page, `biblioteca ${rotulo}`);
        await checarAlvos(page, '.bib-filtros button, .bib-filtros select, .bib-filtros input[type="search"], .bib-lista a, .bib-botao', `biblioteca ${rotulo}`);
        await axeGate(page, `biblioteca ${rotulo}`);
      } finally {
        await contexto.close();
      }
    }
  }
}

module.exports = async function biblioteca() {
  const pagina = gerarPaginaDeTeste();
  try {
    check(pagina.resultado.gerada === true && pagina.resultado.itens === TOTAL_ARTIGOS, `gerador: página gerada com ${TOTAL_ARTIGOS} artigos (${pagina.resultado.avisos.join('; ') || 'sem avisos'})`);
    const app = await startApp({ role: 'visitor', viewport: DESKTOP });
    try {
      await semJavaScript(app);
      await paginaComFiltros(app);
      await layoutETemas(app);
    } finally {
      await app.close();
    }
  } finally {
    pagina.desfazer();
  }
};
