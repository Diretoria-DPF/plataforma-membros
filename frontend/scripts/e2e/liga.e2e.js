/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liga.e2e.js — página "Conheça a LAIFT" (liga.html) e a faixa da tela de
 * entrada (index.html). Roda sobre o BUILD (frontend/dist/).
 *
 * Confere o que o dono pediu: hero com nome, lema e oferta; botão do processo
 * seletivo só com a flag selection_open; cartões, áreas e "como funciona";
 * instituição com prédio, mapa só por clique e "abrir no app de mapas"; blog
 * na página; "voltar" no canto superior esquerdo; aviso de nova publicação na
 * tela inicial.
 *
 * A página da Liga é pública (sem login). Usa liga.html, não /liga: o servidor
 * local não faz o mapeamento de rotas.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const FRONT = path.join(__dirname, '..', '..');
// Índice do blog do build: cada href de novidade precisa existir aqui.
const BLOG = JSON.parse(fs.readFileSync(path.join(FRONT, 'dist', 'blog', 'index.json'), 'utf8'));
const LARGURA_CELULAR = 375;
const LARGURA_DESKTOP = 1280;
const ALTURA_CELULAR = 812;
const ALTURA_DESKTOP = 900;
const ALVO_MINIMO_PX = 44;
// Recuo máximo do "Voltar" à esquerda: celular encosta na borda; 1280 px alinha à coluna de 1120 px da barra.
const MARGEM_CANTO_PX = { [LARGURA_CELULAR]: 24, [LARGURA_DESKTOP]: 120 };
const AVISO_ABERTO = 'Processo seletivo aberto';
const AVISO_FECHADO = 'Inscrições fechadas no momento. Acompanhe @laift.liga.';
const LEMA = 'Nada se cria, nada se perde, tudo se transforma';
const OFERTA = ['conteúdo científico', 'projetos', 'capacitações'];
// Nomes do contrato (§11). A ficha fala em "5 nomes do dono"; o contrato lista 8, e conferimos os 8.
const AREAS = [
  'Farmacologia e Toxicologia',
  'Saúde coletiva e pessoal',
  'Atenção farmacêutica e automedicação',
  'Interação medicamentosa e farmacovigilância',
  'Pesquisa, escrita e publicação científica',
  'Farmacologia clínica e terapêutica',
  'Toxicologia ambiental e ocupacional',
  'Comunicação científica e extensão',
];
const CONTAGEM_ESPERADA = { cards: 7, areas: 8, compromissos: 5, beneficios: 6, secoes: 8 };
// Barra das páginas da Liga: marca, "Voltar" e os 4 links de navegação (CONTRATO §1).
const ALVOS_DA_BARRA = 6;
const LINKS_DA_BARRA = ['./', 'blog.html', './#entrar', './#cadastro'];
const REGEX_HREF_BLOG = /^blog\/[a-z0-9-]+\.html$/;
const SELOS_NOVIDADE = ['Nova publicação no blog', ''];
const MAPA_EMBED = 'https://www.openstreetmap.org/export/embed.html?bbox=';
// Imagem da Lia que outra ficha cria: se ela ainda não existir, o 404 é ignorado.
const IMAGEM_OPCIONAL = 'lia-estatica.svg';
const APARELHO_IPHONE = {
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 5,
};
const APARELHO_ANDROID = {
  ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
};
// "Abrir no app de mapas" (liga-mapa.js, destinoDoApp): destino esperado por aparelho.
const CASOS_APP_DE_MAPAS = [
  { rotulo: 'desktop', largura: LARGURA_DESKTOP, aparelho: null, prefixo: 'https://www.google.com/maps', target: '_blank' },
  { rotulo: 'iPhone', largura: LARGURA_CELULAR, aparelho: APARELHO_IPHONE, prefixo: 'https://maps.apple.com/', target: null },
  { rotulo: 'Android', largura: LARGURA_CELULAR, aparelho: APARELHO_ANDROID, prefixo: 'geo:', target: null },
];

/** Resposta do Worker para apiGetFeatureFlags, com as flags do cenário. */
function workerComFlags(flags) {
  return { apiGetFeatureFlags: () => ({ success: true, flags }) };
}

/** Antes do primeiro goto: guarda violações de CSP e respostas com erro HTTP. */
async function vigiar(app, respostas) {
  await app.context.addInitScript(() => {
    window.__cspViolacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolacoes.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  app.page.on('response', (resp) => {
    if (resp.status() >= 400) respostas.push(`${resp.status()} ${resp.url()}`);
  });
}

/** Simula o aparelho antes da página carregar. Roda no navegador: não usa nada do escopo do Node. */
function simularAparelho(aparelho) {
  Object.defineProperty(navigator, 'userAgent', { get: () => aparelho.ua });
  Object.defineProperty(navigator, 'platform', { get: () => aparelho.platform });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => aparelho.maxTouchPoints });
}

/** Abre a página e espera a rede assentar (a consulta da flag termina antes). */
async function abrir(app, destino) {
  await app.page.goto(app.baseUrl + destino);
  await app.page.waitForLoadState('networkidle');
}

/** Checagens comuns a toda página do cenário: CSP, recursos e JavaScript. */
async function checarSaude(app, respostas, rotulo) {
  const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
  check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? ': ' + violacoes.join(' | ') : ''));
  const quebradas = respostas.filter((url) => !url.includes(IMAGEM_OPCIONAL));
  check(quebradas.length === 0, `${rotulo}: nenhum recurso com erro HTTP` + (quebradas.length ? ': ' + quebradas.join(' | ') : ''));
  check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
}

/** Valor de um atributo; null se o elemento não existir (sem esperar o tempo limite do Playwright). */
async function atributoDe(locator, nome) {
  if ((await locator.count()) === 0) return null;
  return locator.getAttribute(nome);
}

/** Confere a contagem de elementos de um seletor. */
async function contar(page, seletor, esperado, rotulo) {
  const total = await page.locator(seletor).count();
  check(total === esperado, `${rotulo}: ${esperado} × ${seletor} (há ${total})`);
}

/** Estado e texto do aviso de processo (#liga-status). */
async function verificarStatus(page, estado, texto, rotulo) {
  const status = page.locator('#liga-status');
  check((await atributoDe(status, 'data-estado')) === estado, `${rotulo}: status com data-estado="${estado}"`);
  check((((await status.textContent()) || '').trim()) === texto, `${rotulo}: status com o texto "${texto}"`);
}

/** (a) Flag desligada: botão do processo escondido, link "Conheça o processo seletivo" visível e status fechado. */
async function verificarCtaFechado(page, rotulo) {
  check(!(await page.locator('#liga-cta-processo').isVisible()), `${rotulo}: botão "Processo seletivo" escondido`);
  const link = page.locator('[data-se-fechado]').first();
  check(await link.isVisible(), `${rotulo}: link "Conheça o processo seletivo" visível`);
  check((((await link.textContent()) || '').trim()) === 'Conheça o processo seletivo', `${rotulo}: texto do link "Conheça o processo seletivo"`);
  await verificarStatus(page, 'fechado', AVISO_FECHADO, rotulo);
}

/** (b) Flag ligada: botão "Processo seletivo" visível, link fechado escondido e aviso de processo aberto. */
async function verificarCtaAberto(page, rotulo) {
  const cta = page.locator('#liga-cta-processo');
  check(await cta.isVisible(), `${rotulo}: botão "Processo seletivo" visível`);
  check((await atributoDe(cta, 'href')) === 'processo-seletivo.html', `${rotulo}: botão aponta para processo-seletivo.html`);
  check(!(await page.locator('[data-se-fechado]').first().isVisible()), `${rotulo}: "Conheça o processo seletivo" escondido`);
  await verificarStatus(page, 'aberto', AVISO_ABERTO, rotulo);
}

/** Hero, cartões, áreas, "como funciona" e índice da página. */
async function verificarConteudo(page, rotulo) {
  const hero = (await page.locator('.lp-hero').textContent()) || '';
  check(hero.includes(LEMA), `${rotulo}: lema "${LEMA}" no hero`);
  for (const termo of OFERTA) check(hero.includes(termo), `${rotulo}: oferta contém "${termo}"`);
  await contar(page, '.lp-card', CONTAGEM_ESPERADA.cards, rotulo);
  await contar(page, '.lp-area', CONTAGEM_ESPERADA.areas, rotulo);
  await contar(page, '.lp-compromisso', CONTAGEM_ESPERADA.compromissos, rotulo);
  await contar(page, '.lp-beneficio', CONTAGEM_ESPERADA.beneficios, rotulo);
  await contar(page, '.lp-secoes__item', CONTAGEM_ESPERADA.secoes, rotulo);
  const nomes = await page.$$eval('.lp-area__nome', (els) => els.map((el) => el.textContent.trim()));
  const faltando = AREAS.filter((nome) => !nomes.includes(nome));
  check(faltando.length === 0, `${rotulo}: nomes das áreas do contrato` + (faltando.length ? ': faltam ' + faltando.join(' | ') : ''));
  const semDestino = await page.$$eval('.lp-secoes__item', (els) => els
    .map((a) => a.getAttribute('href') || '')
    .filter((href) => !href.startsWith('#') || !document.getElementById(href.slice(1))));
  check(semDestino.length === 0, `${rotulo}: índice da página aponta para ids que existem` + (semDestino.length ? ': ' + semDestino.join(' | ') : ''));
}

/** Celular: sem rolagem horizontal da página; a faixa de cartões rola na horizontal e é focável. */
async function verificarCelular(page, rotulo) {
  const larguraPagina = await page.evaluate(() => document.documentElement.scrollWidth);
  check(larguraPagina <= LARGURA_CELULAR, `${rotulo}: sem rolagem horizontal da página (scrollWidth ${larguraPagina} px)`);
  const cartoes = page.locator('.lp-cards');
  check((await atributoDe(cartoes, 'tabindex')) === '0', `${rotulo}: .lp-cards com tabindex="0"`);
  const rolagem = await cartoes.evaluate((el) => ({ eixo: getComputedStyle(el).overflowX, sobra: el.scrollWidth - el.clientWidth }));
  check((rolagem.eixo === 'auto' || rolagem.eixo === 'scroll') && rolagem.sobra > 0,
    `${rotulo}: .lp-cards rola na horizontal (overflow-x ${rolagem.eixo}, sobra ${rolagem.sobra} px)`);
}

/** Página da Liga em uma largura, com a flag ligada ou desligada. */
async function paginaDaLiga(largura, altura, ligada) {
  const app = await startApp({ viewport: { width: largura, height: altura }, workerHandlers: workerComFlags({ selection_open: ligada }) });
  const respostas = [];
  const rotulo = `liga.html ${largura}px, selection_open ${ligada ? 'ligada' : 'desligada'}`;
  try {
    await vigiar(app, respostas);
    await abrir(app, 'liga.html');
    check(app.calls.worker.some((c) => c.action === 'apiGetFeatureFlags' && c.args[0] === ''), `${rotulo}: consulta apiGetFeatureFlags no Worker com args [""]`);
    check((await app.page.locator('h1').count()) === 1, `${rotulo}: exatamente 1 h1`);
    if (ligada) await verificarCtaAberto(app.page, rotulo);
    else await verificarCtaFechado(app.page, rotulo);
    await verificarConteudo(app.page, rotulo);
    if (largura < 600) await verificarCelular(app.page, rotulo);
    // O contraste mede o estado final. Sem isso, a revelação ao rolar (`lp-revela` em liga.css, sobre
    // `.lp-conteudo > .pub-sec`) deixa as seções fora da tela com opacidade parcial e o axe acusa falso contraste.
    // Movimento reduzido mostra o estado final (ORDEM §6).
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await axeGate(app.page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Barra superior: links na ordem do contrato e todo link/botão visível com pelo menos 44 px de altura. */
async function verificarBarra(page, rotulo) {
  const links = await page.$$eval('header.pub-barra .pub-barra__nav a', (els) => els.map((a) => a.getAttribute('href')));
  const correta = JSON.stringify(links) === JSON.stringify(LINKS_DA_BARRA);
  check(correta, `${rotulo}: barra com os links ${LINKS_DA_BARRA.join(' ')}` + (correta ? '' : ` (há ${links.join(' ')})`));
  const alvos = [];
  for (const el of await page.$$('header.pub-barra a, header.pub-barra button')) {
    if (!(await el.isVisible())) continue;
    const caixa = await el.boundingBox();
    alvos.push({ texto: (((await el.textContent()) || '').trim()), altura: caixa ? caixa.height : 0 });
  }
  const pequenos = alvos.filter((alvo) => alvo.altura < ALVO_MINIMO_PX);
  const detalhe = pequenos.map((alvo) => `${alvo.texto} ${Math.round(alvo.altura)} px`).join(' | ');
  check(alvos.length >= ALVOS_DA_BARRA && pequenos.length === 0,
    `${rotulo}: links e botões da barra com altura >= ${ALVO_MINIMO_PX} px` + (detalhe ? ': ' + detalhe : ` (${alvos.length} visíveis)`));
}

/** O "Voltar" é o primeiro elemento focável da barra (ordem do DOM) e também o mais à esquerda. */
async function verificarPrimeiroFocavel(page, rotulo) {
  const ordem = await page.evaluate(() => {
    const visiveis = Array.from(document.querySelectorAll('header.pub-barra a[href], header.pub-barra button'))
      .filter((el) => !el.hasAttribute('hidden') && el.getClientRects().length > 0);
    if (visiveis.length === 0) return { primeiro: false, maisEsquerda: false };
    const maisEsquerda = visiveis.reduce((a, b) => (b.getBoundingClientRect().left < a.getBoundingClientRect().left ? b : a));
    return {
      primeiro: visiveis[0].classList.contains('pub-voltar'),
      maisEsquerda: maisEsquerda.classList.contains('pub-voltar'),
    };
  });
  check(ordem.primeiro, `${rotulo}: "Voltar" é o primeiro elemento focável da barra`);
  check(ordem.maisEsquerda, `${rotulo}: "Voltar" é o elemento mais à esquerda da barra`);
}

/** (3) "Voltar" no canto superior esquerdo; aberta direto, a página leva à tela inicial. */
async function voltarParaInicio(largura) {
  const app = await startApp({ viewport: { width: largura, height: ALTURA_CELULAR }, workerHandlers: workerComFlags({ selection_open: true }) });
  const respostas = [];
  const rotulo = `liga.html ${largura}px, voltar`;
  try {
    await vigiar(app, respostas);
    await abrir(app, 'liga.html');
    const voltar = app.page.locator('.pub-voltar');
    check(await voltar.isVisible(), `${rotulo}: "Voltar" visível`);
    check((await atributoDe(voltar, 'data-history-back')) !== null, `${rotulo}: "Voltar" com data-history-back`);
    check((await atributoDe(voltar, 'href')) === './', `${rotulo}: "Voltar" com href="./"`);
    const caixa = await voltar.boundingBox();
    const limiteX = MARGEM_CANTO_PX[largura];
    const noCanto = Boolean(caixa) && caixa.x <= limiteX && caixa.y <= MARGEM_CANTO_PX[LARGURA_CELULAR];
    check(noCanto, `${rotulo}: "Voltar" no canto superior esquerdo (x ${caixa ? Math.round(caixa.x) : '?'} ≤ ${limiteX}, y ${caixa ? Math.round(caixa.y) : '?'} ≤ ${MARGEM_CANTO_PX[LARGURA_CELULAR]})`);
    await verificarBarra(app.page, rotulo);
    await verificarPrimeiroFocavel(app.page, rotulo);
    await checarSaude(app, respostas, rotulo);
    await voltar.click();
    const chegou = await app.page
      .waitForURL((url) => url.pathname === '/' || url.pathname === '/index.html', { timeout: 5000 })
      .then(() => true, () => false);
    check(chegou, `${rotulo}: clique leva à tela inicial (${app.page.url()})`);
  } finally {
    await app.close();
  }
}

/** Prédio, endereço e links de mapa, sem nenhuma requisição a terceiros antes do clique. */
async function verificarEndereco(page, rotulo) {
  const carregou = await page.locator('img.lp-instituicao__predio').evaluate((img) => img.complete && img.naturalWidth > 0);
  check(carregou, `${rotulo}: prédio da instituição carregado`);
  const endereco = (await page.locator('#instituicao').textContent()) || '';
  check(endereco.includes('UNINASSAU - Salvador') && endereco.includes('Rua dos Maçons, 364') && endereco.includes('Salvador-Bahia, 41810'),
    `${rotulo}: endereço "UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia, 41810-205, Brasil"`);
  const site = await atributoDe(page.locator('.lp-instituicao__site a'), 'href');
  check(site === 'https://www.uninassau.edu.br', `${rotulo}: link do site da UNINASSAU`);
  const mapas = await page.locator('.lp-mapa__link').allTextContents();
  for (const nome of ['Google Maps', 'Apple Mapas', 'OpenStreetMap']) {
    check(mapas.some((texto) => texto.includes(nome)), `${rotulo}: link "${nome}" presente`);
  }
}

/** Mapa: só o clique cria o iframe do OpenStreetMap; antes disso não há requisição a terceiros. */
async function verificarMapaPorClique(app, rotulo) {
  const page = app.page;
  const antes = app.calls.external.filter((c) => c.url.includes('openstreetmap.org'));
  check(antes.length === 0, `${rotulo}: antes do clique, nenhuma requisição ao OpenStreetMap`);
  check((await page.locator('iframe').count()) === 0, `${rotulo}: antes do clique, sem iframe`);
  await page.locator('.lp-mapa__carregar').click();
  const frame = page.locator('iframe.lp-mapa__frame');
  check((await frame.count()) === 1, `${rotulo}: após o clique, iframe.lp-mapa__frame`);
  const src = (await atributoDe(frame, 'src')) || '';
  check(src.startsWith(MAPA_EMBED), `${rotulo}: iframe com src do OpenStreetMap (bbox)`);
  check((((await atributoDe(frame, 'title')) || '').trim()) !== '', `${rotulo}: iframe com title`);
  check((await atributoDe(frame, 'referrerpolicy')) === 'strict-origin-when-cross-origin', `${rotulo}: iframe com referrerpolicy strict-origin-when-cross-origin`);
  check((await atributoDe(frame, 'sandbox')) !== null, `${rotulo}: iframe com sandbox`);
  const status = (((await page.locator('[data-mapa-status]').textContent()) || '').trim());
  check(status === 'Mapa carregado.', `${rotulo}: status do mapa "Mapa carregado."`);
}

/** Instituição: prédio, endereço, links de mapa e o mapa só depois do clique. */
async function instituicaoEMapa() {
  const app = await startApp({ viewport: { width: LARGURA_DESKTOP, height: ALTURA_DESKTOP }, workerHandlers: workerComFlags({ selection_open: true }) });
  const respostas = [];
  const rotulo = `liga.html ${LARGURA_DESKTOP}px, instituição`;
  try {
    await vigiar(app, respostas);
    await abrir(app, 'liga.html');
    await verificarEndereco(app.page, rotulo);
    await verificarMapaPorClique(app, rotulo);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** "Abrir no app de mapas": o destino muda conforme o aparelho (liga-mapa.js). */
async function appDeMapas(caso) {
  const app = await startApp({ viewport: { width: caso.largura, height: ALTURA_CELULAR }, workerHandlers: workerComFlags({ selection_open: true }) });
  const respostas = [];
  const rotulo = `liga.html, app de mapas (${caso.rotulo})`;
  try {
    if (caso.aparelho) await app.context.addInitScript(simularAparelho, caso.aparelho);
    await vigiar(app, respostas);
    await abrir(app, 'liga.html');
    const link = app.page.locator('a[data-mapa-app]');
    const href = (await atributoDe(link, 'href')) || '';
    const target = await atributoDe(link, 'target');
    check(href.startsWith(caso.prefixo), `${rotulo}: link começa com ${caso.prefixo} (href ${href.slice(0, 40)}…)`);
    check(target === caso.target, `${rotulo}: target ${caso.target || 'ausente'} (há ${target || 'ausente'})`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Blog na página: três novidades válidas e existentes no índice do build. */
async function verificarBlog(page, rotulo) {
  const bloco = page.locator('[data-blog-novidade="3"]');
  check(await bloco.isVisible(), `${rotulo}: bloco do blog visível`);
  const hrefs = await page.$$eval('[data-blog-novidade="3"] a.blog-novidade__item', (els) => els.map((a) => a.getAttribute('href') || ''));
  check(hrefs.length === 3, `${rotulo}: 3 novidades do blog (há ${hrefs.length})`);
  const invalidos = hrefs.filter((href) => !REGEX_HREF_BLOG.test(href) || !BLOG.posts.some((post) => post.href === href));
  check(invalidos.length === 0, `${rotulo}: novidades com href válido e existente em blog/index.json` + (invalidos.length ? ': ' + invalidos.join(' | ') : ''));
  const capas = await page.$$eval('[data-blog-novidade="3"] a.blog-novidade__item', (els) => els.map((a) => {
    const use = a.querySelector('.blog-novidade__capa svg use');
    return use ? use.getAttribute('href') || '' : '';
  }));
  check(capas.length === 3 && capas.every((href) => /^blog\/icones\.svg#[a-z]+$/.test(href)),
    `${rotulo}: cada novidade com miniatura do sprite do blog (${capas.join(' | ')})`);
}

async function blogNaPagina() {
  const app = await startApp({ viewport: { width: LARGURA_DESKTOP, height: ALTURA_DESKTOP }, workerHandlers: workerComFlags({ selection_open: true }) });
  const respostas = [];
  const rotulo = `liga.html ${LARGURA_DESKTOP}px, blog`;
  try {
    await vigiar(app, respostas);
    await abrir(app, 'liga.html');
    await verificarBlog(app.page, rotulo);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Sem o índice do blog, o bloco continua escondido e a página não tem erro de JavaScript. */
async function blogSemIndice() {
  const app = await startApp({ viewport: { width: LARGURA_DESKTOP, height: ALTURA_DESKTOP }, workerHandlers: workerComFlags({ selection_open: true }) });
  const respostas = [];
  const rotulo = `liga.html ${LARGURA_DESKTOP}px, blog sem índice`;
  try {
    await vigiar(app, respostas);
    await app.page.route('**/blog/index.json', (route) => route.abort());
    await abrir(app, 'liga.html');
    check(!(await app.page.locator('[data-blog-novidade="3"]').isVisible()), `${rotulo}: bloco do blog escondido`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** (f) Com prefers-reduced-motion: reduce, nenhuma animação em execução na liga.html. */
async function movimentoReduzido() {
  const app = await startApp({ workerHandlers: workerComFlags({ selection_open: true }) });
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await abrir(app, 'liga.html');
    const emExecucao = await app.page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => a.animationName || a.transitionProperty || 'animação'));
    check(emExecucao.length === 0,
      'liga.html com prefers-reduced-motion: reduce, nenhuma animação em execução' + (emExecucao.length ? ': ' + emExecucao.join(', ') : ''));
  } finally {
    await app.close();
  }
}

/** Tela inicial: um aviso de nova publicação, com 1 item válido, miniatura do sprite e selo "Nova publicação no blog" ou nenhum. */
async function verificarNovidadeDaTela(page, rotulo) {
  check(await page.locator('[data-blog-novidade="1"]').isVisible(), `${rotulo}: aviso do blog visível`);
  const itens = await page.$$eval('[data-blog-novidade="1"] a.blog-novidade__item', (els) => els.map((a) => {
    const selo = a.querySelector('.blog-novidade__selo');
    const use = a.querySelector('.blog-novidade__capa svg use');
    return { href: a.getAttribute('href') || '', selo: selo ? selo.textContent.trim() : '', icone: use ? use.getAttribute('href') || '' : '' };
  }));
  check(itens.length === 1, `${rotulo}: 1 item no aviso do blog (há ${itens.length})`);
  const item = itens[0];
  const valido = Boolean(item) && REGEX_HREF_BLOG.test(item.href) && BLOG.posts.some((post) => post.href === item.href);
  check(valido, `${rotulo}: item do aviso com href válido existente em blog/index.json`);
  const selo = item ? item.selo : '';
  check(SELOS_NOVIDADE.includes(selo), `${rotulo}: selo "${selo}" (válidos: ${SELOS_NOVIDADE.join(' ou ')})`);
  check(Boolean(item) && /^blog\/icones\.svg#[a-z]+$/.test(item.icone), `${rotulo}: aviso com miniatura do sprite do blog`);
}

/** (e) Faixa "Conheça a LAIFT" da tela de entrada (index.html), com a flag ligada ou desligada. */
async function faixaDoLogin(ligada) {
  const app = await startApp({ workerHandlers: workerComFlags({ selection_open: ligada }) });
  const respostas = [];
  const rotulo = `index.html, selection_open ${ligada ? 'ligada' : 'desligada'}`;
  try {
    await vigiar(app, respostas);
    await abrir(app, '');
    check(app.calls.worker.some((c) => c.action === 'apiGetFeatureFlags'), `${rotulo}: consulta apiGetFeatureFlags no Worker`);
    const flagAplicada = await app.page.evaluate(() => document.documentElement.hasAttribute('data-flag-selection-open'));
    check(flagAplicada === ligada, `${rotulo}: <html> ${ligada ? 'recebe' : 'não recebe'} data-flag-selection-open`);
    check((await app.page.locator('.welcome-liga__aviso').count()) === 0, `${rotulo}: sem o título "Processo seletivo aberto" sobre os botões`);
    const link = app.page.locator('.welcome-liga__link');
    const linkVisivel = await link.isVisible();
    const linkDestino = await atributoDe(link, 'href');
    check(linkVisivel && linkDestino === 'liga.html', `${rotulo}: link "Conheça a LAIFT" visível e aponta para liga.html`);
    const linkBlog = await atributoDe(app.page.locator('.welcome-liga__blog'), 'href');
    const textoBlog = (((await app.page.locator('.welcome-liga__blog').textContent()) || '').trim());
    check(linkBlog === 'blog.html' && textoBlog === 'Acessar blog', `${rotulo}: botão "Acessar blog" aponta para blog.html`);
    await verificarNovidadeDaTela(app.page, rotulo);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

module.exports = async function liga() {
  await paginaDaLiga(LARGURA_DESKTOP, ALTURA_DESKTOP, true);
  await paginaDaLiga(LARGURA_CELULAR, ALTURA_CELULAR, true);
  await paginaDaLiga(LARGURA_CELULAR, ALTURA_CELULAR, false);
  await voltarParaInicio(LARGURA_CELULAR);
  await voltarParaInicio(LARGURA_DESKTOP);
  await instituicaoEMapa();
  for (const caso of CASOS_APP_DE_MAPAS) await appDeMapas(caso);
  await blogNaPagina();
  await blogSemIndice();
  await movimentoReduzido();
  await faixaDoLogin(true);
  await faixaDoLogin(false);
};
