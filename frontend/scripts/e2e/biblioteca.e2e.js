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
 * em claro e escuro, e axe. Catálogo ao vivo (API simulada): artigo novo entra sem rebuild, enabled:false
 * mostra o estado vazio, success:false ou catálogo igual deixam o instantâneo como está.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');
const { build } = require('../build-biblioteca.js');
const { API_PRODUCAO } = require('../../biblioteca/catalogo.js');

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const DIST = path.join(__dirname, '..', '..', 'dist');
const PASTA_BIBLIOTECA = path.join(DIST, 'biblioteca');
const FIXTURE = path.join(__dirname, 'fixtures', 'biblioteca-snapshot.json');
const TOTAL_ARTIGOS = 6;
const TOTAL_ACESSO_ABERTO = 3;
const ALVO_MINIMO_PX = 44;
const PRAZO_MS = 3000;
const ATRASO_API_MS = 400;
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

/**
 * Simula a API ao vivo (apiLearnLibraryPublicCatalog). Na página servida em 127.0.0.1, catalogo.js chama a
 * produção (https://api.laift.com.br/v1/). `api` = função que devolve o corpo da resposta; sem `api`, a chamada
 * é abortada (rede fora): a página fica com o instantâneo. Qualquer outro host é abortado.
 */
async function simularApi(contexto, app, { api, atrasoMs }, chamadas) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  await contexto.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(app.baseUrl)) return route.continue();
    if (!url.startsWith(API_PRODUCAO) || !api) return route.abort();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let corpo = {};
    try { corpo = JSON.parse(req.postData() || '{}'); } catch (err) { corpo = {}; }
    chamadas.push({ action: corpo.action, args: corpo.args, cookie: req.headers().cookie || '' });
    if (atrasoMs) await new Promise((resolve) => setTimeout(resolve, atrasoMs));
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(api(corpo)) });
  });
}

/** Abre a página num contexto próprio (tema, JavaScript e API simulada controlados aqui). */
async function abrirPagina(app, { viewport, colorScheme, javaScript = true, api = null, atrasoMs = 0 }) {
  const contexto = await app.browser.newContext({ viewport, colorScheme, javaScriptEnabled: javaScript });
  const chamadas = [];
  await simularApi(contexto, app, { api, atrasoMs }, chamadas);
  await contexto.addInitScript(() => {
    window.__cspViolacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolacoes.push(e.effectiveDirective));
  });
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`${app.baseUrl}biblioteca.html`);
  return { contexto, page, erros, chamadas };
}

/** Resposta da API com os artigos da fixture e, opcionalmente, itens e áreas a mais. */
function catalogoAoVivo({ extras = [], topicosExtras = [], enabled = true } = {}) {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  if (!enabled) return { success: true, enabled: false, topics: [], items: [] };
  return {
    success: true,
    enabled: true,
    generatedAt: '2026-10-11T15:30:00Z',
    topics: [...fixture.topics, ...topicosExtras],
    items: [...fixture.items, ...extras],
  };
}

const ARTIGO_NOVO = {
  id: 'e2e-0007',
  title: 'Cafeína e sono: artigo publicado agora no painel',
  authors: [{ family: 'Nunes', given: 'Paula' }],
  authorCount: 1,
  journal: 'Revista Nova',
  year: 2026,
  doi: '10.1000/bib7',
  pmid: null,
  type: 'ensaio_clinico',
  topics: ['farmacocinetica'],
  openAccess: true,
  license: 'cc-by',
  landingUrl: 'https://doi.org/10.1000/bib7',
  publishedAt: '2026-10-11T15:00:00Z',
};

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

    check((await page.locator('.bib-lista > li').first().getAttribute('id')) === 'a-e2e-0003', 'idioma: o primeiro da lista é um artigo em português');
    check(await page.locator('label[for="bib-idioma"]').textContent() === 'Idioma', 'idioma: o filtro tem rótulo visível "Idioma"');
    check((await page.locator('.bib-selo', { hasText: /^Português$/ }).count()) === 2 && (await page.locator('.bib-selo', { hasText: /^English$/ }).count()) === 1, 'idioma: selos em texto "Português" e "English"');
    await page.selectOption('#bib-idioma', 'pt');
    check(await esperar(async () => (await textoStatus(page)).includes('2 artigos')), 'idioma "Português": ficam 2 artigos');
    await page.selectOption('#bib-idioma', 'outros');
    check(await esperar(async () => (await textoStatus(page)).includes('4 artigos')), 'idioma "Inglês e outros": ficam 4 artigos');
    await page.selectOption('#bib-idioma', '');
    check(await esperar(async () => (await textoStatus(page)).includes(`${TOTAL_ARTIGOS} artigos`)), 'idioma "Todos": volta a lista completa');

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
    await page.selectOption('#bib-idioma', 'pt');
    await page.click('#bib-limpar');
    check(await esperar(async () => (await textoStatus(page)).includes(`${TOTAL_ARTIGOS} artigos`)) && (await page.inputValue('#bib-idioma')) === '', '"Limpar filtros": volta o idioma para "Todos"');

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

/** API ao vivo com um artigo novo: a lista, as áreas, a contagem e a data mudam sem rebuild. */
async function aoVivoComArtigoNovo(app) {
  const api = () => catalogoAoVivo({ extras: [ARTIGO_NOVO], topicosExtras: [{ slug: 'farmacocinetica', name: 'Farmacocinética' }] });
  const { contexto, page, erros, chamadas } = await abrirPagina(app, { viewport: DESKTOP, api });
  try {
    const total = TOTAL_ARTIGOS + 1;
    check(await esperar(async () => (await textoStatus(page)).includes(`${total} artigos`)), `ao vivo: o status passa a ${total} artigos`);
    check((await page.locator('#a-e2e-0007 .bib-titulo').textContent()) === ARTIGO_NOVO.title, 'ao vivo: o artigo novo aparece na lista');
    check((await page.locator('.bib-lista > li').count()) === total, `ao vivo: a lista tem ${total} itens (sem duplicar)`);
    check((await page.locator('#bib-area option[value="farmacocinetica"]').count()) === 1, 'ao vivo: a área nova entra no filtro');
    check((await page.textContent('.bib-atualizado')).includes('11/10/2026'), 'ao vivo: "Atualizado em" usa a data do catálogo ao vivo');
    const link = await page.locator('#a-e2e-0007 a.bib-link');
    check((await link.getAttribute('href')) === ARTIGO_NOVO.landingUrl && /noopener/.test(await link.getAttribute('rel')), 'ao vivo: link do artigo novo com noopener');
    check((await page.evaluate(() => window.__xss)) === undefined, 'ao vivo: o <script> do título continua só texto');

    await page.fill('#bib-q', 'cafeína');
    check(await esperar(async () => (await textoStatus(page)).includes('2 artigos')), 'ao vivo: busca "cafeína" acha o artigo novo e o antigo');
    await page.fill('#bib-q', '');
    await page.selectOption('#bib-area', 'farmacocinetica');
    check(await esperar(async () => (await artigosVisiveis(page)) === 1), 'ao vivo: filtro pela área nova deixa 1 artigo');

    check(chamadas.length === 1 && chamadas[0].action === 'apiLearnLibraryPublicCatalog' && chamadas[0].args.length === 0, `ao vivo: uma chamada à API, ação certa (${chamadas.length})`);
    check(chamadas.every((c) => c.cookie === ''), 'ao vivo: a chamada sai sem cookie (credentials: omit)');
    const violacoes = await page.evaluate(() => window.__cspViolacoes);
    check(violacoes.length === 0, `ao vivo: CSP sem violações${violacoes.length ? ' (' + violacoes.join(', ') + ')' : ''}`);
    check(erros.length === 0, `ao vivo: sem erros de JavaScript (${erros.join('; ')})`);
    await axeGate(page, 'biblioteca ao vivo');
  } finally {
    await contexto.close();
  }
}

/** API com a flag desligada: estado vazio, página de pé. */
async function aoVivoDesligado(app) {
  const { contexto, page, erros } = await abrirPagina(app, { viewport: MOBILE, api: () => catalogoAoVivo({ enabled: false }) });
  try {
    check(await esperar(async () => (await textoStatus(page)).includes('Nenhum artigo publicado ainda.')), 'enabled:false: mostra "Nenhum artigo publicado ainda."');
    check((await page.locator('.bib-lista > li').count()) === 0, 'enabled:false: a lista fica vazia');
    check(await page.locator('.bib-filtros').isHidden(), 'enabled:false: o formulário de filtros some');
    check(await page.locator('h1').isVisible(), 'enabled:false: a página continua de pé (h1 visível)');
    check(erros.length === 0, `enabled:false: sem erros de JavaScript (${erros.join('; ')})`);
  } finally {
    await contexto.close();
  }
}

/** API com success:false ou igual ao instantâneo: a tela fica como o build fez. */
async function aoVivoSemMudanca(app) {
  for (const [rotulo, api] of [['success:false', () => ({ success: false, error: 'Muitas requisições.' })], ['igual ao instantâneo', () => catalogoAoVivo()]]) {
    // A resposta demora: dá tempo de marcar a lista do build antes de o catálogo ao vivo chegar.
    const { contexto, page, erros, chamadas } = await abrirPagina(app, { viewport: DESKTOP, api, atrasoMs: ATRASO_API_MS });
    try {
      await page.waitForSelector('.bib-filtros:not([hidden])');
      await page.evaluate(() => { document.querySelector('.bib-lista > li').dataset.marca = 'build'; });
      check(await esperar(async () => chamadas.length === 1), `${rotulo}: a API foi chamada`);
      await page.waitForResponse((r) => r.url().startsWith(API_PRODUCAO) && r.request().method() === 'POST', { timeout: PRAZO_MS }).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, ATRASO_API_MS));
      check((await textoStatus(page)).includes(`${TOTAL_ARTIGOS} artigos`), `${rotulo}: continuam os ${TOTAL_ARTIGOS} artigos do instantâneo`);
      check((await page.locator('.bib-lista > li[data-marca="build"]').count()) === 1, `${rotulo}: a lista do build não é refeita`);
      check((await page.textContent('.bib-atualizado')).includes('10/10/2026'), `${rotulo}: a data do instantâneo fica`);
      check(erros.length === 0, `${rotulo}: sem erro visível nem de JavaScript (${erros.join('; ')})`);
    } finally {
      await contexto.close();
    }
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
      await aoVivoComArtigoNovo(app);
      await aoVivoDesligado(app);
      await aoVivoSemMudanca(app);
      await layoutETemas(app);
    } finally {
      await app.close();
    }
  } finally {
    pagina.desfazer();
  }
};
