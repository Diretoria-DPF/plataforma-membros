/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * capturas-biblioteca.js — capturas da Biblioteca LAIFT para o portão visual (CONTRATO-B2 §8).
 * Não é cenário da suíte (não termina em .e2e.js). Roda sobre o BUILD (frontend/dist/):
 *   cd frontend && node scripts/build.js && node scripts/e2e/capturas-biblioteca.js
 * Respostas da API iguais às de library.e2e.js (harness.js); página pública gerada do instantâneo
 * fixtures/biblioteca-snapshot.json, como biblioteca.e2e.js, e devolvida a dist/ no fim.
 * Grava docs/cortex/capturas/<tela>-<largura>-<tema>.png (375 e 1280 px; claro e escuro) e imprime a lista.
 */
const fs = require('fs');
const path = require('path');
const { startApp } = require('./harness');
const { build } = require('../build-biblioteca.js');

const SAIDA = path.join(__dirname, '..', '..', '..', 'docs', 'cortex', 'capturas');
const DIST = path.join(__dirname, '..', '..', 'dist');
const PASTA_BIBLIOTECA = path.join(DIST, 'biblioteca');
const FIXTURE = path.join(__dirname, 'fixtures', 'biblioteca-snapshot.json');
// Arquivos que o gerador cria ou altera em dist/ (mesma lista de biblioteca.e2e.js): voltam ao estado anterior.
const ARQUIVOS_GERADOS = ['biblioteca.html', 'biblioteca/index.json', 'biblioteca/catalogo.js', 'sitemap.xml', 'llms.txt'];

const LARGURAS = [
  { px: 375, viewport: { width: 375, height: 812 } },
  { px: 1280, viewport: { width: 1280, height: 900 } },
];
const TEMAS = [
  { nome: 'claro', esquema: 'light' },
  { nome: 'escuro', esquema: 'dark' },
];
const PRAZO_MS = 8000;
// Produção: ux_v2 ligada (docs/FEATURE_FLAGS.md); a Biblioteca ligada para o membro e o admin.
const FLAGS_LIGADAS = { library_enabled: true, ux_v2_enabled: true };

const AUTORES = [
  { family: 'Silva', given: 'Ana Maria' },
  { family: 'Souza', given: 'Bruno' },
  { family: 'Lima', given: 'Carla' },
  { family: 'Rocha', given: 'Diego' },
];
const TOPICOS = [
  { slug: 'farmacologia', name: 'Farmacologia' },
  { slug: 'toxicologia', name: 'Toxicologia' },
];
const ARTIGO_ID = '11111111-1111-4111-8111-111111111111';
const ARTIGO_TITULO = 'Efeitos da dipirona em modelo murino';
const OUTRO_ID = '22222222-2222-4222-8222-222222222222';
const OUTRO_TITULO = 'Toxicidade hepática do paracetamol em jejum';
const CLINICO_ID = '44444444-4444-4444-8444-444444444444';
const CLINICO_TITULO = 'Dose máxima em relato clínico';

// ListItem (CONTRATO-B1 §4.1): busca e favoritos.
const ITEM_ARTIGO = {
  id: ARTIGO_ID, title: ARTIGO_TITULO, authors: AUTORES, authorCount: 4, journal: 'Revista de Farmacologia',
  year: 2021, doi: '10.1000/xyz1', pmid: null, type: 'artigo', topics: ['farmacologia'], openAccess: true,
  license: 'cc-by', landingUrl: 'https://doi.org/10.1000/xyz1', publishedAt: '2021-03-01',
  hasSummary: true, isFavorite: false,
};
const ITEM_OUTRO = {
  id: OUTRO_ID, title: OUTRO_TITULO, authors: [{ family: 'Costa', given: 'Elisa' }], authorCount: 1,
  journal: 'Jornal de Toxicologia', year: 2019, doi: '10.1000/xyz2', pmid: null, type: 'revisao',
  topics: ['toxicologia'], openAccess: false, license: 'desconhecida', landingUrl: 'https://doi.org/10.1000/xyz2',
  publishedAt: '2019-05-10', hasSummary: false, isFavorite: false,
};

// ArticleDetail (CONTRATO-B1 §4.1): a ficha.
const DETALHE = Object.assign({}, ITEM_ARTIGO, {
  journalAbbrev: 'Rev Farmacol', volume: '12', issue: '3', pages: '45-67', language: 'pt', oaStatus: 'gold',
  pmcid: null, pmcUrl: null,
  summary: { text: 'Resumo de teste escrito pela curadoria.', origin: 'curador', reviewerName: null, reviewedAt: null },
  clinicalReview: null, abstract: null, collections: [], membersOnly: false,
});

// Fila e edição da curadoria (formato real de admin-library.js).
const FILA = {
  success: true,
  counts: { em_triagem: 2, aprovado: 0, publicado: 1, rejeitado: 0, removido: 0 },
  topics: TOPICOS,
  page: 1,
  total: 2,
  items: [
    { id: '33333333-3333-4333-8333-333333333333', title: 'Pesquisa com conflito de licença', doi: '10.1000/xyz3', pmid: null, pubYear: 2020, license: 'outra', licenseConflict: true, isClinical: false, clinicalReviewedAt: null, status: 'em_triagem', version: 1 },
    { id: CLINICO_ID, title: CLINICO_TITULO, doi: null, pmid: '12345678', pubYear: 2018, license: 'cc-by', licenseConflict: false, isClinical: true, clinicalReviewedAt: null, status: 'em_triagem', version: 1 },
  ],
};
const ARTIGO_CLINICO = {
  id: CLINICO_ID, title: CLINICO_TITULO, journal: 'Jornal de Clínica Terapêutica', journalAbbrev: 'J Clin Ther',
  pubYear: 2018, volume: '30', issue: '2', pages: '101-109', language: 'pt', articleType: 'relato_caso',
  topics: ['farmacologia'], license: 'cc-by', oaStatus: 'gold', isClinical: true, clinicalReviewedAt: null,
  summaryText: 'Relato de caso com dose máxima registrada.', status: 'em_triagem', version: 1,
  doi: null, pmid: '12345678', metadataSources: ['Europe PMC', 'Crossref'],
  metadataFetchedAt: '2026-10-09T12:00:00Z', sourceAbstract: 'Resumo original do editor.',
};
const SUGESTOES = {
  success: true,
  items: [
    { id: '55555555-5555-4555-8555-555555555555', identifierKind: 'doi', identifier: '10.1000/sug1', note: 'Estudo recente sobre cafeína e memória.', status: 'sugerido', createdAt: '2026-10-09T10:00:00Z', articleId: null },
    { id: '66666666-6666-4666-8666-666666666666', identifierKind: 'pmid', identifier: '87654321', note: null, status: 'sugerido', createdAt: '2026-10-10T09:30:00Z', articleId: null },
  ],
};

const BUSCA = { success: true, items: [ITEM_ARTIGO, ITEM_OUTRO], total: 2, page: 1, pageSize: 20, topics: TOPICOS };
const FAVORITOS = { success: true, items: [Object.assign({}, ITEM_ARTIGO, { isFavorite: true })], total: 1, page: 1, pageSize: 20, topics: TOPICOS };

function nomeArquivo(tela, largura, tema) {
  return `${tela}-${largura.px}-${tema.nome}.png`;
}

/** Grava a captura. 'pagina' = página inteira (sem barras fixas); 'janela' = o que está na tela. */
async function foto(page, arquivo, modo) {
  if (modo === 'pagina') await neutralizarFixos(page);
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: modo === 'pagina' });
  fs.writeFileSync(path.join(SAIDA, arquivo), png);
}

/** Só para captura de página inteira: barras fixas e sticky viram estáticas, para não cortar o texto. */
async function neutralizarFixos(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const posicao = getComputedStyle(el).position;
      if (posicao === 'fixed' || posicao === 'sticky') el.style.setProperty('position', 'static', 'important');
    }
  });
}

/** Roda um passo de captura; falha vira linha no relatório e a sessão segue. */
async function executar(relatorio, arquivo, passo) {
  try {
    await passo();
    relatorio.ok.push(arquivo);
  } catch (err) {
    relatorio.falhas.push({ arquivo, motivo: String(err && err.message ? err.message : err).split('\n')[0] });
  }
}

/** Abre o app com a largura e o tema da captura (tema também pelo prefers-color-scheme). */
async function abrirApp(largura, tema, opcoes) {
  const app = await startApp({
    role: opcoes.role,
    viewport: largura.viewport,
    theme: tema.nome,
    workerHandlers: opcoes.handlers,
  });
  await app.page.emulateMedia({ colorScheme: tema.esquema });
  return app;
}

/** (1) Página pública /biblioteca: lista cheia e estado vazio do filtro. */
async function sessaoPublica(largura, tema, relatorio) {
  const app = await abrirApp(largura, tema, { role: 'visitor', handlers: {} });
  const page = app.page;
  try {
    await page.goto(`${app.baseUrl}biblioteca.html`);
    await page.waitForSelector('.bib-filtros:not([hidden])', { timeout: PRAZO_MS });
    await page.waitForFunction(() => /artigo/.test((document.querySelector('#bib-status') || {}).textContent || ''), null, { timeout: PRAZO_MS });
    await executar(relatorio, nomeArquivo('publica-lista', largura, tema), () => foto(page, nomeArquivo('publica-lista', largura, tema), 'pagina'));
    await executar(relatorio, nomeArquivo('publica-vazia', largura, tema), async () => {
      await page.fill('#bib-q', 'zzz termo sem resultado');
      await page.waitForSelector('text=Nenhum artigo com esses filtros', { timeout: PRAZO_MS });
      await foto(page, nomeArquivo('publica-vazia', largura, tema), 'pagina');
    });
  } finally {
    await app.close();
  }
}

function handlersMembro() {
  return {
    apiGetFeatureFlags: () => ({ success: true, flags: FLAGS_LIGADAS }),
    apiLearnLibrarySearch: () => BUSCA,
    apiLearnLibraryGetArticle: () => ({ success: true, article: DETALHE }),
    apiLearnLibraryListFavorites: () => FAVORITOS,
    apiLearnLibrarySetFavorite: (args) => ({ success: true, favorite: args[1].favorite }),
  };
}

/** (2) Membro com a flag ligada: menu, lista, filtro aberto, ficha com citação e Favoritos. */
async function sessaoMembro(largura, tema, relatorio) {
  const app = await abrirApp(largura, tema, { role: 'member', handlers: handlersMembro() });
  const page = app.page;
  const cena = (tela, passo) => executar(relatorio, nomeArquivo(tela, largura, tema), passo);
  const arquivo = (tela) => nomeArquivo(tela, largura, tema);
  try {
    await app.login();
    await page.waitForSelector('html[data-flag-library-enabled]', { state: 'attached', timeout: PRAZO_MS });
    await cena('membro-menu', async () => {
      await page.click('#app-menu-btn');
      await page.waitForSelector('#app-menu[open] [data-grupo="estudo"]', { timeout: PRAZO_MS });
      await foto(page, arquivo('membro-menu'), 'janela');
    });
    await cena('membro-lista', async () => {
      await page.click('#app-menu [data-panel="panel-library"]');
      await page.waitForSelector('#library-resultados .library-titulo', { timeout: PRAZO_MS });
      await foto(page, arquivo('membro-lista'), 'janela');
    });
    await cena('membro-filtros', async () => {
      await page.click('#panel-library details.library-filtros > summary');
      await page.waitForSelector('#panel-library details.library-filtros[open]', { timeout: PRAZO_MS });
      await foto(page, arquivo('membro-filtros'), 'janela');
    });
    await cena('membro-ficha', async () => {
      await page.locator('#library-resultados .library-titulo', { hasText: ARTIGO_TITULO }).click();
      await page.waitForSelector('#library-root .library-ficha', { timeout: PRAZO_MS });
      await page.locator('#library-root .library-citacao-bloco').scrollIntoViewIfNeeded();
      await foto(page, arquivo('membro-ficha'), 'janela');
    });
    await cena('membro-favoritos', async () => {
      await page.locator('#library-root button', { hasText: 'Voltar à lista' }).click();
      await page.locator('#panel-library .library-abas button', { hasText: 'Favoritos' }).click();
      await page.waitForSelector('#library-resultados .library-titulo', { timeout: PRAZO_MS });
      await foto(page, arquivo('membro-favoritos'), 'janela');
    });
  } catch (err) {
    relatorio.falhas.push({ arquivo: `sessão membro ${largura.px}-${tema.nome}`, motivo: String(err.message).split('\n')[0] });
  } finally {
    await app.close();
  }
}

function handlersAdmin() {
  return {
    apiGetFeatureFlags: () => ({ success: true, flags: FLAGS_LIGADAS }),
    apiAdminLearnLibraryListQueue: () => FILA,
    apiAdminLearnLibraryGetArticle: () => ({ success: true, article: ARTIGO_CLINICO, allowedTransitions: ['aprovado', 'rejeitado'] }),
    apiAdminLearnLibraryListSuggestions: () => SUGESTOES,
  };
}

/** (3) Admin: Biblioteca > Artigos (fila e edição com o motivo ao desmarcar clínico) e a subaba Sugestões. */
async function sessaoAdmin(largura, tema, relatorio) {
  const app = await abrirApp(largura, tema, { role: 'admin', handlers: handlersAdmin() });
  const page = app.page;
  const cena = (tela, passo) => executar(relatorio, nomeArquivo(tela, largura, tema), passo);
  const arquivo = (tela) => nomeArquivo(tela, largura, tema);
  try {
    await app.login();
    await page.click('#btn-enter-admin-mode');
    await app.showPanel('panel-admin-library');
    await page.waitForSelector('#admin-library-root h3 button', { timeout: PRAZO_MS });
    await cena('admin-fila', () => foto(page, arquivo('admin-fila'), 'janela'));
    await cena('admin-edicao', async () => {
      await page.locator('#admin-library-root h3 button', { hasText: CLINICO_TITULO }).click();
      await page.waitForSelector('#adm-lib-clinico', { timeout: PRAZO_MS });
      await page.click('#adm-lib-clinico');
      await page.waitForSelector('#adm-lib-motivo-clinico', { timeout: PRAZO_MS });
      await page.locator('#adm-lib-motivo-clinico').scrollIntoViewIfNeeded();
      await foto(page, arquivo('admin-edicao'), 'janela');
    });
    await cena('admin-sugestoes', async () => {
      await page.locator('#admin-library-root button', { hasText: /^Sugestões$/ }).click();
      await page.waitForSelector('#admin-library-root .list-item', { timeout: PRAZO_MS });
      await foto(page, arquivo('admin-sugestoes'), 'janela');
    });
  } catch (err) {
    relatorio.falhas.push({ arquivo: `sessão admin ${largura.px}-${tema.nome}`, motivo: String(err.message).split('\n')[0] });
  } finally {
    await app.close();
  }
}

/** Guarda o estado dos arquivos que o gerador mexe em dist/, para devolvê-los ao fim. */
function guardarDist() {
  const pastaExistia = fs.existsSync(PASTA_BIBLIOTECA);
  const antes = Object.fromEntries(ARQUIVOS_GERADOS.map((nome) => {
    const caminho = path.join(DIST, nome);
    return [nome, fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : null];
  }));
  return function restaurar() {
    for (const nome of ARQUIVOS_GERADOS) {
      const caminho = path.join(DIST, nome);
      if (antes[nome] === null) fs.rmSync(caminho, { force: true });
      else fs.writeFileSync(caminho, antes[nome]);
    }
    if (!pastaExistia && fs.existsSync(PASTA_BIBLIOTECA) && fs.readdirSync(PASTA_BIBLIOTECA).length === 0) {
      fs.rmdirSync(PASTA_BIBLIOTECA);
    }
  };
}

function imprimirRelatorio(relatorio) {
  console.log(`Capturas gravadas (${relatorio.ok.length}) em ${SAIDA}:`);
  for (const arquivo of relatorio.ok) console.log(`  ${arquivo}`);
  if (relatorio.falhas.length) {
    console.log(`Não montadas (${relatorio.falhas.length}):`);
    for (const falha of relatorio.falhas) console.log(`  ✘ ${falha.arquivo}: ${falha.motivo}`);
  }
}

async function main() {
  const restaurar = guardarDist();
  try {
    const gerada = build({ outDir: DIST, recente: FIXTURE });
    if (!gerada.gerada) throw new Error('a página da biblioteca não foi gerada a partir do instantâneo');
    fs.mkdirSync(SAIDA, { recursive: true });
    const relatorio = { ok: [], falhas: [] };
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        await sessaoPublica(largura, tema, relatorio);
        await sessaoMembro(largura, tema, relatorio);
        await sessaoAdmin(largura, tema, relatorio);
      }
    }
    imprimirRelatorio(relatorio);
    if (relatorio.falhas.length) process.exitCode = 1;
  } finally {
    restaurar();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { nomeArquivo, LARGURAS, TEMAS };
