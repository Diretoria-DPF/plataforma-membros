/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * library-v2.e2e.js — Biblioteca v2 (frontend/library-v2.js, library-v2.css) atrás da flag library_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho, cartões, sem selo de revisão, sem rolagem horizontal,
 *    alvos de 44 px, fontes de 12 px; busca, filtro, favorito, ficha e Citar continuam funcionando;
 *  - claro e escuro, movimento reduzido;
 *  - flag desligada: Biblioteca de sempre, sem nada do v2 (nem o pacote é baixado).
 * Capturas: defina BIBLIOTECA_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, cols: 1 },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, cols: 2 },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, cols: 3 },
];

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const TOPICOS = [{ slug: 'farmacologia', name: 'Farmacologia' }, { slug: 'toxicologia', name: 'Toxicologia' }];
const ITEM_A = {
  id: ID_A, title: 'Efeitos da dipirona em modelo murino', authors: [{ family: 'Silva', given: 'Ana Maria' }], authorCount: 1,
  journal: 'Revista de Farmacologia', year: 2021, doi: '10.1000/xyz1', pmid: null, type: 'artigo', topics: ['farmacologia'],
  openAccess: true, license: 'cc-by', landingUrl: 'https://doi.org/10.1000/xyz1', publishedAt: '2021-03-01', language: 'pt',
  hasSummary: true, isFavorite: false,
};
const ITEM_B = Object.assign({}, ITEM_A, {
  id: ID_B, title: 'Toxicidade hepática do paracetamol em jejum', type: 'revisao', topics: ['toxicologia'], openAccess: false,
  language: 'en', hasSummary: false,
});
const DETALHE = Object.assign({}, ITEM_A, {
  journalAbbrev: 'Rev Farmacol', volume: '12', issue: '3', pages: '45-67', oaStatus: 'gold', pmcid: null, pmcUrl: null,
  summary: { text: 'Resumo de teste escrito pela curadoria.', origin: 'curador', reviewerName: null, reviewedAt: null },
  clinicalReview: null, abstract: null, collections: [], membersOnly: false,
});

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { library_enabled: true, library_v2_enabled: flagOn } }),
    apiLearnLibrarySearch: () => ({ success: true, items: [ITEM_A, ITEM_B], total: 2, page: 1, pageSize: 20, topics: TOPICOS }),
    apiLearnLibraryGetArticle: () => ({ success: true, article: DETALHE }),
    apiLearnLibrarySetFavorite: (args) => ({ success: true, favorite: args[1].favorite }),
  }, extra || {});
}

async function boot(viewport, opts) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.page.waitForFunction(() => document.documentElement.hasAttribute('data-flag-library-v2-enabled'), null, { timeout: 15000 });
  await app.showPanel('panel-library');
  await app.page.waitForSelector('#panel-library[data-lib2] #library-resultados .library-titulo', { timeout: 15000 });
  return app;
}

async function shot(page, name) {
  const dir = process.env.BIBLIOTECA_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size);
  const { page } = app;
  try {
    await page.waitForSelector('.library-item', { timeout: 8000 });
    check((await page.locator('.lib2-selo, .lib2-nota').count()) === 0, 'sem selo nem nota de revisão na lista pública');
    check(!/revisad|gerado por ia|rascunho|\[NV\]/i.test(await page.locator('#library-root').innerText()), 'sem texto de revisão ou de IA na lista pública');

    const cols = await page.locator('.library-lista').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    check(cols === Math.min(vp.cols, 2) || cols === vp.cols, vp.name + ': colunas da lista (' + cols + ')');
    const hero = await page.locator('.library-cabecalho').evaluate((n) => getComputedStyle(n).backgroundImage);
    check(/gradient/.test(hero), 'cabeçalho em gradiente');
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');

    const sizes = await page.$$eval('#panel-library .library-abas button, #panel-library .library-chip, #panel-library .library-titulo, #panel-library .library-favorito, #panel-library .library-busca button', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(sizes.length >= 8 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#panel-library *', (nodes) => nodes.filter((n) => n.getClientRects().length && Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 10 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');

    await shot(page, 'biblioteca-' + vp.size.width + '-claro');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function functionsScenario() {
  console.log('\n— funções de sempre');
  const favs = [];
  const buscas = [];
  const app = await boot({ width: 1280, height: 800 }, {
    workerHandlers: handlers(true, {
      apiLearnLibrarySetFavorite: (args) => { favs.push(args[1]); return { success: true, favorite: args[1].favorite }; },
      apiLearnLibrarySearch: (args) => { buscas.push(args[1]); return { success: true, items: [ITEM_A, ITEM_B], total: 2, page: 1, pageSize: 20, topics: TOPICOS }; },
    }),
  });
  const { page } = app;
  try {
    await page.click('.library-favorito >> nth=0');
    await page.waitForFunction(() => document.querySelector('.library-favorito').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
    check(favs.length === 1 && favs[0].id === ID_A && favs[0].favorite === true, 'favoritar chama a ação de sempre');

    const antes = buscas.length;
    await page.fill('#library-q', 'dipirona');
    await page.waitForFunction((n) => true, antes);
    await page.waitForTimeout(900);
    check(buscas.length > antes && buscas[buscas.length - 1].q === 'dipirona', 'busca com espera continua enviando q');
    await page.click('.library-chip >> text=Farmacologia');
    await page.waitForTimeout(300);
    check(buscas[buscas.length - 1].topic === 'farmacologia', 'filtro rápido de área continua valendo');

    await page.locator('.library-titulo', { hasText: ITEM_A.title }).first().click();
    await page.waitForSelector('#library-root .library-ficha');
    check((await page.locator('.library-ficha .library-citacao').count()) >= 1, 'ficha com Citar continua aparecendo');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function darkAndMotionScenario(size) {
  console.log('\n— tema escuro e movimento reduzido ' + size.width + 'x' + size.height);
  const app = await boot(size, { theme: 'dark' });
  const { page } = app;
  try {
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const hero = await page.locator('.library-cabecalho').evaluate((n) => getComputedStyle(n).backgroundImage);
    check(/rgb\(18, 58, 102\)/.test(hero), 'cabeçalho com o gradiente escuro');
    const card = await page.locator('.library-item').first().evaluate((n) => getComputedStyle(n).backgroundColor);
    check(lum(card) < 0.35, 'cartões escuros no tema escuro (luminância ' + lum(card).toFixed(2) + ')');
    await shot(page, 'biblioteca-' + size.width + '-escuro');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const trans = await page.locator('.library-item').first().evaluate((n) => getComputedStyle(n).transitionDuration);
    check(/^(0s|1e-05s)/.test(trans), 'movimento reduzido: sem transição (' + trans + ')');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada: Biblioteca de sempre');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  try {
    await app.login();
    await app.showPanel('panel-library');
    await app.page.waitForSelector('#library-resultados .library-titulo', { timeout: 15000 });
    await app.page.waitForTimeout(600);
    check((await app.page.locator('[data-lib2], .lib2-selo, .lib2-nota').count()) === 0, 'sem marca nem selo do v2');
    check((await app.page.locator('link[data-library-v2-css]').count()) === 0, 'estilo do v2 não carregado');
    check(!(await app.page.evaluate(() => !!window.LaiftLibraryV2)), 'pacote biblioteca2 não baixado');
    const bg = await app.page.locator('.library-cabecalho').evaluate((n) => getComputedStyle(n).backgroundImage);
    check(!/gradient/.test(bg), 'cabeçalho sem gradiente (visual de sempre)');
    check((await app.page.locator('.library-favorito').count()) === 2, 'favoritos de sempre presentes');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function main() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await functionsScenario();
  await darkAndMotionScenario({ width: 375, height: 812 });
  await darkAndMotionScenario({ width: 1280, height: 800 });
  await flagOffScenario();
};
