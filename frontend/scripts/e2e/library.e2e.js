/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * library.e2e.js — Biblioteca no painel do membro e na curadoria (CONTRATO-B2 §1, §3, §4, §6, §8),
 * sobre o BUILD (frontend/dist/). Cenários: (a) sem a flag library_enabled o grupo "Estudo" não
 * aparece no menu; (b) com a flag: busca, ficha, citação ABNT e Vancouver e favorito; (c) visitante
 * sem favoritos; (d) fila da curadoria no formato real; (e) 375 e 1280 px sem rolagem horizontal e axe;
 * (f) lote da curadoria (B3): importar lista com pausa no limite do servidor, aprovar e publicar selecionados.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const ALVO_MINIMO_PX = 44;
const PRAZO_MS = 5000;

const ARTIGO_ID = '11111111-1111-4111-8111-111111111111';
const ARTIGO_TITULO = 'Efeitos da dipirona em modelo murino';
const OUTRO_ID = '22222222-2222-4222-8222-222222222222';
const OUTRO_TITULO = 'Toxicidade hepática do paracetamol em jejum';

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

// ListItem (CONTRATO-B1 §4.1): o que a busca e a lista de favoritos devolvem.
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

// ArticleDetail (CONTRATO-B1 §4.1): a ficha do artigo.
const DETALHE = Object.assign({}, ITEM_ARTIGO, {
  journalAbbrev: 'Rev Farmacol', volume: '12', issue: '3', pages: '45-67', language: 'pt', oaStatus: 'gold',
  pmcid: null, pmcUrl: null,
  summary: { text: 'Resumo de teste escrito pela curadoria.', origin: 'curador', reviewerName: null, reviewedAt: null },
  clinicalReview: null, abstract: null, collections: [], membersOnly: false,
});

// Fila da curadoria (AdminListItem, como admin-library.js lê): campos pubYear, licenseConflict, isClinical.
const FILA = {
  success: true,
  counts: { em_triagem: 2, aprovado: 0, publicado: 1, rejeitado: 0, removido: 0 },
  topics: TOPICOS,
  page: 1,
  total: 2,
  items: [
    { id: '33333333-3333-4333-8333-333333333333', title: 'Pesquisa com conflito de licença', doi: '10.1000/xyz3', pmid: null, pubYear: 2020, license: 'outra', licenseConflict: true, isClinical: false, clinicalReviewedAt: null, status: 'em_triagem', version: 1 },
    { id: '44444444-4444-4444-8444-444444444444', title: 'Dose máxima em relato clínico', doi: null, pmid: '12345678', pubYear: 2018, license: 'cc-by', licenseConflict: false, isClinical: true, clinicalReviewedAt: null, status: 'em_triagem', version: 1 },
  ],
};

const FLAGS_ON = () => ({ success: true, flags: { library_enabled: true } });
const BUSCA = () => ({ success: true, items: [ITEM_ARTIGO, ITEM_OUTRO], total: 2, page: 1, pageSize: 20, topics: TOPICOS });
const FICHA = () => ({ success: true, article: DETALHE });
const FAVORITO = (args) => ({ success: true, favorite: args[1].favorite });

/** Espera uma condição (até PRAZO_MS). Devolve true se ela se cumpriu. */
async function esperar(condicao) {
  const fim = Date.now() + PRAZO_MS;
  while (Date.now() < fim) {
    if (await condicao()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

/** Chamadas registradas ao Worker para uma action. args = [token, input]. */
function chamadas(app, acao) {
  return app.calls.worker.filter((c) => c.action === acao);
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

async function checarAlvos(page, seletor, rotulo) {
  const pequenos = await page.evaluate(alvosPequenos, { selector: seletor, min: ALVO_MINIMO_PX });
  const lista = pequenos.map((t) => `"${t.label}" ${t.w}x${t.h}`).join('; ');
  check(pequenos.length === 0, `${rotulo}: alvos abaixo de ${ALVO_MINIMO_PX}x${ALVO_MINIMO_PX}${lista ? ': ' + lista : ''}`);
}

async function checarSemRolagem(page, rotulo) {
  const excedente = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(excedente <= 1, `${rotulo}: sem rolagem horizontal (${excedente}px além da largura)`);
}

/** Abre o painel de Biblioteca pelo menu (o cenário já fez login e a flag chegou). */
async function abrirBiblioteca(app) {
  await app.showPanel('panel-library');
  await app.page.waitForSelector('#library-resultados .library-titulo');
}

/** Abre a ficha do artigo pelo título da lista. */
async function abrirFicha(page) {
  await page.locator('#library-resultados .library-titulo', { hasText: ARTIGO_TITULO }).click();
  await page.waitForSelector('#library-root .library-ficha');
}

/** (a) Sem a flag, o grupo "Estudo" não aparece no menu. */
async function semFlagSemGrupoEstudo() {
  const app = await startApp({ role: 'member', viewport: DESKTOP });
  try {
    await app.login();
    await esperar(() => chamadas(app, 'apiGetFeatureFlags').length > 0);
    await app.page.click('#app-menu-btn');
    const grupo = app.page.locator('#app-menu [data-grupo="estudo"]');
    check((await grupo.count()) === 1 && !(await grupo.isVisible()), 'sem a flag: o grupo "Estudo" fica escondido no menu');
    check(!(await app.page.locator('#app-menu [data-panel="panel-library"]').isVisible()), 'sem a flag: o item "Biblioteca" não aparece');
    check(app.errors.length === 0, `sem a flag: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

/** (b) Com a flag: busca, ficha, citação ABNT e Vancouver, favorito. */
async function fluxoDoMembro() {
  const app = await startApp({
    role: 'member',
    viewport: DESKTOP,
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiLearnLibrarySearch: BUSCA,
      apiLearnLibraryGetArticle: FICHA,
      apiLearnLibrarySetFavorite: FAVORITO,
    },
  });
  try {
    await app.login();
    const page = app.page;
    await esperar(() => chamadas(app, 'apiGetFeatureFlags').length > 0);
    await page.click('#app-menu-btn');
    check(await page.locator('#app-menu [data-grupo="estudo"]').isVisible(), 'com a flag: o grupo "Estudo" aparece no menu');
    await page.click('#app-menu [data-panel="panel-library"]');
    await abrirBiblioteca(app);
    check(await page.locator('#library-resultados .library-titulo', { hasText: ARTIGO_TITULO }).count() === 1, 'busca: a lista mostra o artigo que veio do servidor');

    await page.fill('#library-q', 'dipirona');
    check(await esperar(() => chamadas(app, 'apiLearnLibrarySearch').some((c) => c.args[1] && c.args[1].q === 'dipirona')), 'busca: o termo digitado vai ao servidor');

    await abrirFicha(page);
    check(await page.locator('#library-root h3', { hasText: 'Resumo da LAIFT' }).count() === 1, 'ficha: traz o bloco "Resumo da LAIFT"');
    check(chamadas(app, 'apiLearnLibraryGetArticle').some((c) => c.args[1] && c.args[1].id === ARTIGO_ID), 'ficha: o servidor recebe o id do artigo');

    const abnt = page.locator('#library-root button', { hasText: /^ABNT$/ });
    await abnt.click();
    await esperar(async () => (await abnt.getAttribute('aria-pressed')) === 'true');
    const textoAbnt = await page.locator('#library-root .library-citacao').textContent();
    check(textoAbnt.includes('SILVA, A. M.') && textoAbnt.includes(ARTIGO_TITULO) && textoAbnt.includes('Disponível em'), `citação ABNT: autor, título e "Disponível em" (${textoAbnt.slice(0, 80)}…)`);

    const vancouver = page.locator('#library-root button', { hasText: /^Vancouver$/ });
    await vancouver.click();
    await esperar(async () => (await vancouver.getAttribute('aria-pressed')) === 'true');
    const textoVancouver = await page.locator('#library-root .library-citacao').textContent();
    check(textoVancouver.includes('Silva AM, Souza B, Lima C, Rocha D') && textoVancouver.includes('Rev Farmacol') && textoVancouver.includes('2021;12(3):45-67'), 'citação Vancouver: autores com iniciais, abreviatura, ano, volume e páginas');

    const favorito = page.locator('#library-root button[aria-pressed]', { hasText: 'favoritos' });
    check((await favorito.getAttribute('aria-pressed')) === 'false', 'favorito: começa desmarcado');
    await favorito.click();
    check(await esperar(async () => (await favorito.getAttribute('aria-pressed')) === 'true'), 'favorito: aria-pressed vira "true" depois da resposta do servidor');
    check(chamadas(app, 'apiLearnLibrarySetFavorite').some((c) => c.args[1].id === ARTIGO_ID && c.args[1].favorite === true), 'favorito: o servidor recebe id e favorite=true');
    check(app.errors.length === 0, `membro: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

/** (c) Visitante vê o catálogo, mas não vê favoritos nem coleções. */
async function visitanteSemFavoritos() {
  const app = await startApp({
    role: 'visitor',
    viewport: DESKTOP,
    workerHandlers: { apiGetFeatureFlags: FLAGS_ON, apiLearnLibrarySearch: BUSCA },
  });
  try {
    await app.login();
    await abrirBiblioteca(app);
    const page = app.page;
    check((await page.locator('#panel-library .library-abas button').count()) === 1, 'visitante: só a aba "Catálogo" (sem Favoritos e Coleções)');
    check((await page.locator('#panel-library .library-favorito').count()) === 0, 'visitante: nenhum botão de favorito na lista');
    check((await page.locator('#panel-library .library-aviso').count()) === 1, 'visitante: aviso de que resumo, favoritos e coleções são para membros');
    check(chamadas(app, 'apiLearnLibraryListFavorites').length === 0, 'visitante: a lista de favoritos nunca é pedida');
    check(app.errors.length === 0, `visitante: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

/** (d) Curadoria: a fila mostra os itens do formato real e pede o estado "em_triagem". */
async function filaDaCuradoria(viewport) {
  const rotulo = viewport.width < 600 ? '375x812' : '1280x900';
  const app = await startApp({
    role: 'admin',
    viewport,
    workerHandlers: { apiAdminLearnLibraryListQueue: () => FILA },
  });
  try {
    await app.login();
    const page = app.page;
    await page.click('#btn-enter-admin-mode');
    await app.showPanel('panel-admin-library');
    await page.waitForSelector('#admin-library-root h3 button');
    const texto = await page.textContent('#admin-library-root');
    check(texto.includes('Em triagem (2)') && texto.includes('Publicados (1)'), `${rotulo} curadoria: contagens por estado (Em triagem 2, Publicados 1)`);
    check(await page.locator('#admin-library-root h3 button', { hasText: 'Pesquisa com conflito de licença' }).count() === 1, `${rotulo} curadoria: a fila mostra o artigo do servidor`);
    check(texto.includes('Conflito de licença') && texto.includes('Clínico: aguarda revisor'), `${rotulo} curadoria: selos de conflito de licença e de revisão clínica`);
    check(chamadas(app, 'apiAdminLearnLibraryListQueue').some((c) => c.args[1] && c.args[1].status === 'em_triagem'), `${rotulo} curadoria: a fila pede o estado "em_triagem"`);
    await checarSemRolagem(page, `${rotulo} curadoria`);
    await checarAlvos(page, '#admin-library-root button', `${rotulo} curadoria`);
    await axeGate(page, `admin/biblioteca ${rotulo} (fila)`);
    check(app.errors.length === 0, `${rotulo} curadoria: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

// (f) Lote: a fila traz um artigo com resumo de IA ainda não aprovado e um clínico.
const LOTE_A = '55555555-5555-4555-8555-555555555555';
const LOTE_CLINICO = '66666666-6666-4666-8666-666666666666';
const FILA_LOTE = {
  success: true,
  counts: { em_triagem: 2, aprovado: 0, publicado: 0, rejeitado: 0, removido: 0 },
  topics: TOPICOS,
  page: 1,
  total: 2,
  items: [
    { id: LOTE_A, title: 'Hepatotoxicidade do paracetamol', doi: '10.1000/lote1', pmid: null, pubYear: 2022, license: 'cc-by', licenseConflict: false, isClinical: false, clinicalReviewedAt: null, status: 'em_triagem', version: 2, topics: ['toxicologia'], summaryText: 'Resumo sugerido.', summaryOrigin: 'ia', summaryReviewedAt: null, sourceAbstract: 'Original.' },
    { id: LOTE_CLINICO, title: 'Dose de acetilcisteína', doi: '10.1000/lote2', pmid: null, pubYear: 2021, license: 'cc-by', licenseConflict: false, isClinical: true, clinicalReviewedAt: null, status: 'em_triagem', version: 1, topics: ['toxicologia'], summaryText: 'Dose de 150 mg/kg.', summaryOrigin: 'ia', summaryReviewedAt: null, sourceAbstract: 'Original.' },
  ],
};
const LIMITE = { success: false, message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', code: 'rate_limited' };
const DUPLICATA = { success: false, message: 'Este artigo já está na Biblioteca.', articleId: OUTRO_ID };

/** Simula o Worker do lote: um identificador estoura o limite uma vez; os passos devolvem versão + 1. */
function handlersDoLote() {
  let limiteUsado = false;
  const versaoSeguinte = (args) => ({ success: true, article: { id: args[1].id, version: args[1].version + 1, status: args[1].to || 'em_triagem' } });
  return {
    apiAdminLearnLibraryListQueue: () => FILA_LOTE,
    apiAdminLearnLibraryImport: (args) => {
      const id = args[1].identifier;
      if (id === '10.1000/dup') return DUPLICATA;
      if (id === '10.1000/limite' && !limiteUsado) { limiteUsado = true; return LIMITE; }
      return { success: true, article: { id: ARTIGO_ID, version: 1 }, warnings: [] };
    },
    apiAdminLearnLibrarySetStatus: versaoSeguinte,
    apiAdminLearnLibraryReviewSummary: versaoSeguinte,
  };
}

async function textoDoLote(page) {
  return page.textContent('#admin-library-root section[aria-labelledby="adm-lib-lote-titulo"]');
}

/** (f) Lote: importar lista (pausa e "Continuar") e aprovar e publicar selecionados (clínico fica de fora). */
async function loteDaCuradoria(viewport) {
  const rotulo = viewport.width < 600 ? '375x812' : '1280x900';
  const app = await startApp({ role: 'admin', viewport, workerHandlers: handlersDoLote() });
  try {
    await app.login();
    const page = app.page;
    await page.click('#btn-enter-admin-mode');
    await app.showPanel('panel-admin-library');
    await page.waitForSelector('#adm-lib-lote-lista');
    await page.fill('#adm-lib-lote-lista', ['10.1000/novo1', '10.1000/dup', '10.1000/limite'].join(String.fromCharCode(10)));
    await page.click('#admin-library-root button:has-text("Importar")');
    const continuar = page.locator('#admin-library-root button', { hasText: /^Continuar$/ });
    check(await esperar(async () => (await continuar.count()) === 1), `${rotulo} lote: pausa no limite do servidor com "Continuar"`);
    check((await textoDoLote(page)).includes('limite de importações por hora'), `${rotulo} lote: a pausa explica o limite`);
    await continuar.click();
    check(await esperar(async () => (await textoDoLote(page)).includes('Concluído')), `${rotulo} lote: a importação termina depois de "Continuar"`);
    const resumo = await textoDoLote(page);
    check(resumo.includes('3 de 3 processados') && resumo.includes('2 importados') && resumo.includes('1 já existia'), `${rotulo} lote: contagem com duplicata (${resumo.slice(0, 160)})`);
    const importacoes = chamadas(app, 'apiAdminLearnLibraryImport').map((c) => c.args[1].identifier);
    check(JSON.stringify(importacoes) === JSON.stringify(['10.1000/novo1', '10.1000/dup', '10.1000/limite', '10.1000/limite']), `${rotulo} lote: uma por vez, repetindo só a que pausou (${importacoes.join(', ')})`);

    await page.waitForSelector(`#adm-lib-lote-sel-${LOTE_A}`);
    await page.check(`#adm-lib-lote-sel-${LOTE_A}`);
    await page.check(`#adm-lib-lote-sel-${LOTE_CLINICO}`);
    await page.click('#admin-library-root button:has-text("Aprovar e publicar selecionados (2)")');
    await page.click('#modal-confirm-ok');
    check(await esperar(async () => (await textoDoLote(page)).includes('1 publicados')), `${rotulo} lote: um artigo publicado`);
    const texto = await textoDoLote(page);
    check(texto.includes('Dose de acetilcisteína: aguarda revisor clínico'), `${rotulo} lote: o clínico fica de fora com o motivo`);
    const passos = app.calls.worker
      .filter((c) => /SetStatus|ReviewSummary/.test(c.action))
      .map((c) => `${c.action.replace('apiAdminLearnLibrary', '')}:${c.args[1].to || ''}:${c.args[1].version}`);
    check(JSON.stringify(passos) === JSON.stringify(['SetStatus:aprovado:2', 'ReviewSummary::3', 'SetStatus:publicado:4']), `${rotulo} lote: aprovar → aprovar resumo de IA → publicar, com a versão de cada resposta (${passos.join(', ')})`);
    check(!app.calls.worker.some((c) => c.args[1] && c.args[1].id === LOTE_CLINICO && /SetStatus|ReviewSummary/.test(c.action)), `${rotulo} lote: nada é enviado para o clínico`);
    await checarSemRolagem(page, `${rotulo} lote`);
    await checarAlvos(page, '#admin-library-root button', `${rotulo} lote`);
    await axeGate(page, `admin/biblioteca ${rotulo} (lote)`);
    check(app.errors.length === 0, `${rotulo} lote: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

/** (e) Membro em 375 e 1280 px: lista e ficha sem rolagem horizontal, alvos e axe. */
async function layoutDoMembro(viewport) {
  const rotulo = viewport.width < 600 ? '375x812' : '1280x900';
  const app = await startApp({
    role: 'member',
    viewport,
    workerHandlers: { apiGetFeatureFlags: FLAGS_ON, apiLearnLibrarySearch: BUSCA, apiLearnLibraryGetArticle: FICHA },
  });
  try {
    await app.login();
    const page = app.page;
    await abrirBiblioteca(app);
    await checarSemRolagem(page, `${rotulo} lista`);
    await checarAlvos(page, '#panel-library .library-abas button, #panel-library .library-titulo, #panel-library .library-favorito', `${rotulo} lista`);
    await axeGate(page, `membro/biblioteca ${rotulo} (lista)`);
    await abrirFicha(page);
    await checarSemRolagem(page, `${rotulo} ficha`);
    await checarAlvos(page, '#library-root button', `${rotulo} ficha`);
    await axeGate(page, `membro/biblioteca ${rotulo} (ficha)`);
    check(app.errors.length === 0, `${rotulo}: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

module.exports = async function library() {
  await semFlagSemGrupoEstudo();
  await fluxoDoMembro();
  await visitanteSemFavoritos();
  await filaDaCuradoria(MOBILE);
  await filaDaCuradoria(DESKTOP);
  await loteDaCuradoria(MOBILE);
  await loteDaCuradoria(DESKTOP);
  await layoutDoMembro(MOBILE);
  await layoutDoMembro(DESKTOP);
};
