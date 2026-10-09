/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * blog.e2e.js — blog "Conheça a LAIFT" (blog.html e blog/<slug>.html). Roda sobre o BUILD
 * (frontend/dist/), com páginas públicas (sem login). Usa o nome do arquivo (.html), não a
 * rota limpa: o servidor local não faz o mapeamento de rotas.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const ALVO_MINIMO_PX = 44;
const TOTAL_POSTS = 19;
const POSTS_DA_SERIE_CAMPANHAS = 1;
const POST_DA_CAMPANHA = '/blog/outubro-rosa-2026.html';
const POSTS_DA_SERIE_MODULOS = 11;
const POR_PAGINA = 6;
const TEMPO_MAX_WELCOME_MS = 2500;

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

async function checarSaude(app, respostas, rotulo) {
  const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
  check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? ': ' + violacoes.join(' | ') : ''));
  check(respostas.length === 0, `${rotulo}: nenhum recurso com erro HTTP` + (respostas.length ? ': ' + respostas.join(' | ') : ''));
  check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
}

async function contatosDoTopo(page, rotulo) {
  const insta = page.locator('.blog-topo__contatos a[href="https://www.instagram.com/laift.liga"]').first();
  check((await insta.getAttribute('target')) === '_blank' && /noopener/.test(await insta.getAttribute('rel')), `${rotulo}: Instagram abre em nova aba com noopener`);
  const email = page.locator('.blog-topo__contatos a[href^="mailto:"]').first();
  check((await email.count()) === 1, `${rotulo}: e-mail em mailto: no cabeçalho`);
  for (const link of [insta, email]) {
    const caixa = await link.boundingBox();
    check(caixa && caixa.height >= ALVO_MINIMO_PX, `${rotulo}: contato do cabeçalho com altura >= ${ALVO_MINIMO_PX} px`);
  }
}

async function cartoes(page) {
  return page.locator('#feed article.blog-card').count();
}

/** Feed completo em uma largura: welcome, páginas de 6, "Carregar mais", filtro, modal, axe. */
async function feed(largura, altura) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const respostas = [];
  const rotulo = `blog.html ${largura}px`;
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog.html', { waitUntil: 'domcontentloaded' });
    await app.page.waitForSelector('#welcome:not([hidden])', { timeout: 2000 }).catch(() => {});
    const inertEnquanto = await app.page.evaluate(() => !!document.getElementById('welcome') && document.getElementById('conteudo').hasAttribute('inert'));
    check(inertEnquanto, `${rotulo}: conteúdo fica inerte enquanto o "Bem-vindo" aparece`);
    await app.page.waitForSelector('#welcome', { state: 'detached', timeout: TEMPO_MAX_WELCOME_MS });
    check(await app.page.evaluate(() => !document.getElementById('conteudo').hasAttribute('inert')), `${rotulo}: conteúdo volta a ser interativo depois do "Bem-vindo"`);
    await app.page.waitForLoadState('networkidle');

    check((await app.page.locator('h1').count()) === 1, `${rotulo}: exatamente 1 h1`);
    check((await cartoes(app.page)) === POR_PAGINA, `${rotulo}: primeira página com ${POR_PAGINA} cards`);
    const tamanho = await app.page.locator('#feed article.blog-card').first().getAttribute('aria-setsize');
    check(Number(tamanho) === TOTAL_POSTS, `${rotulo}: aria-setsize = ${TOTAL_POSTS}`);
    check((await app.page.locator('#feed').getAttribute('aria-busy')) === 'false', `${rotulo}: aria-busy volta a false`);
    await contatosDoTopo(app.page, rotulo);

    const mais = app.page.locator('#mais');
    // O scroll infinito (sentinela) e o botão levam ao mesmo resultado: aciona o botão pelo DOM enquanto houver o que carregar.
    for (let i = 0; i < 5 && (await cartoes(app.page)) < TOTAL_POSTS; i += 1) {
      await app.page.evaluate(() => { const b = document.getElementById('mais'); if (b && !b.hidden) b.click(); });
      await app.page.waitForTimeout(300);
    }
    check((await cartoes(app.page)) === TOTAL_POSTS, `${rotulo}: "Carregar mais" leva a ${TOTAL_POSTS} cards`);
    check(!(await mais.isVisible()), `${rotulo}: "Carregar mais" some quando tudo está na tela`);
    check(/19 de 19/.test(await app.page.locator('#feed-status').textContent()), `${rotulo}: anúncio "19 de 19 posts"`);

    await app.page.locator('.blog-chip[data-filtro="modulos"]').click();
    check((await cartoes(app.page)) <= POSTS_DA_SERIE_MODULOS && Number(await app.page.locator('#feed article.blog-card').first().getAttribute('aria-setsize')) === POSTS_DA_SERIE_MODULOS,
      `${rotulo}: filtro "modulos" ajusta aria-setsize para ${POSTS_DA_SERIE_MODULOS}`);
    check((await app.page.evaluate(() => location.hash)) === '#filtro=modulos', `${rotulo}: filtro gravado em #filtro=`);

    await app.page.locator('.blog-mapa__item[data-modulo="quiz"]').click();
    check(await app.page.locator('#modal[open]').count() === 1, `${rotulo}: modal do módulo abre`);
    check(await app.page.locator('#modal a[href="/blog/modulo-farmacologia.html"]').count() === 1, `${rotulo}: modal liga ao post do módulo`);
    await app.page.keyboard.press('Escape');
    check(await app.page.locator('#modal[open]').count() === 0, `${rotulo}: Esc fecha o modal`);

    await app.page.locator('.blog-chip[data-filtro="campanhas"]').click();
    check((await cartoes(app.page)) === POSTS_DA_SERIE_CAMPANHAS
      && Number(await app.page.locator('#feed article.blog-card').first().getAttribute('aria-setsize')) === POSTS_DA_SERIE_CAMPANHAS,
    `${rotulo}: chip "Publicações" mostra ${POSTS_DA_SERIE_CAMPANHAS} card e aria-setsize ${POSTS_DA_SERIE_CAMPANHAS}`);
    check((await app.page.locator('#feed article.blog-card[data-serie="campanhas"]').count()) === POSTS_DA_SERIE_CAMPANHAS,
      `${rotulo}: chip "Publicações" só mostra cards da série campanhas`);
    check(/1 de 1/.test(await app.page.locator('#feed-status').textContent()), `${rotulo}: anúncio "1 de 1 post" no filtro Publicações`);

    await axeGate(app.page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Destaque da campanha do mês: hash #filtro=campanhas ativa o chip, a seção aparece e leva ao post. */
async function destaqueDaCampanha(largura, altura) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const respostas = [];
  const rotulo = `blog.html destaque ${largura}px`;
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog.html#filtro=campanhas', { waitUntil: 'domcontentloaded' });
    await app.page.waitForSelector('#welcome:not([hidden])', { timeout: 2000 }).catch(() => {});
    await app.page.waitForSelector('#welcome', { state: 'detached', timeout: TEMPO_MAX_WELCOME_MS });
    await app.page.waitForLoadState('networkidle');
    await app.page.waitForSelector('#feed article.blog-card', { timeout: 5000 });

    check((await app.page.locator('.blog-chip[data-filtro="campanhas"]').getAttribute('aria-pressed')) === 'true', `${rotulo}: #filtro=campanhas ativa o chip "Publicações"`);
    check((await app.page.locator('#feed article.blog-card').count()) === POSTS_DA_SERIE_CAMPANHAS, `${rotulo}: #filtro=campanhas deixa ${POSTS_DA_SERIE_CAMPANHAS} card`);

    const destaque = app.page.locator('#campanha');
    await destaque.waitFor({ state: 'visible', timeout: 5000 });
    check(await destaque.isVisible(), `${rotulo}: destaque "#campanha" visível`);
    const titulo = ((await app.page.locator('.blog-campanha-destaque__titulo').textContent()) || '').trim();
    check(titulo.length > 0, `${rotulo}: destaque com título`);
    const link = app.page.locator('.blog-campanha-destaque__link');
    check((await link.getAttribute('href')) === POST_DA_CAMPANHA, `${rotulo}: destaque aponta para ${POST_DA_CAMPANHA}`);

    await link.click();
    await app.page.waitForURL('**' + POST_DA_CAMPANHA, { timeout: 5000 });
    check(new URL(app.page.url()).pathname === POST_DA_CAMPANHA, `${rotulo}: clicar no destaque abre o post da campanha`);
    check((await app.page.locator('h1').count()) === 1, `${rotulo}: post da campanha tem 1 h1`);
  } finally {
    await app.close();
  }
}

/** Página 404 do blog: noindex, dois atalhos (plataforma e Instagram em nova aba), texto educado, axe, sem CSP. */
async function pagina404(largura, altura) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const respostas = [];
  const rotulo = `blog/404.html ${largura}px`;
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog/404.html');
    await app.page.waitForLoadState('networkidle');
    check((await app.page.locator('meta[name="robots"][content*="noindex"]').count()) === 1, `${rotulo}: meta robots noindex`);
    check((await app.page.locator('h1').count()) === 1, `${rotulo}: exatamente 1 h1`);
    const textoH1 = ((await app.page.locator('h1').textContent()) || '').trim();
    const textoPagina = ((await app.page.locator('main').textContent()) || '').toLowerCase();
    check(textoH1.length > 0 && !/erro|proibido|fatal/.test(textoPagina), `${rotulo}: texto educado (sem palavras de culpa)`);

    const atalhos = app.page.locator('a.blog-404__atalho');
    check((await atalhos.count()) === 2, `${rotulo}: exatamente 2 atalhos (plataforma e Instagram)`);
    check((await app.page.locator('a.blog-404__atalho[href="/"]').count()) === 1, `${rotulo}: atalho para a plataforma (/)`);
    const insta = app.page.locator('a.blog-404__atalho[href="https://www.instagram.com/laift.liga"]');
    check((await insta.count()) === 1, `${rotulo}: atalho para o Instagram da Liga`);
    check((await insta.getAttribute('target')) === '_blank' && /noopener/.test((await insta.getAttribute('rel')) || ''), `${rotulo}: Instagram abre em nova aba com noopener`);
    for (const atalho of await atalhos.all()) {
      const caixa = await atalho.boundingBox();
      check(caixa && caixa.height >= ALVO_MINIMO_PX && caixa.width >= ALVO_MINIMO_PX, `${rotulo}: atalho com alvo >= ${ALVO_MINIMO_PX} px`);
    }

    await axeGate(app.page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Um post: 1 h1, contatos, barra de progresso, barra flutuante após rolar, axe. */
async function post(largura, altura) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const respostas = [];
  const rotulo = `blog/modulo-inicio.html ${largura}px`;
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog/modulo-inicio.html');
    await app.page.waitForLoadState('networkidle');
    check((await app.page.locator('h1').count()) === 1, `${rotulo}: exatamente 1 h1`);
    check((await app.page.locator('link[rel="canonical"]').getAttribute('href')) === 'https://laift.com.br/blog/modulo-inicio', `${rotulo}: canonical limpo`);
    check((await app.page.locator('.blog-progresso').count()) === 1, `${rotulo}: barra de progresso criada`);
    check(!(await app.page.locator('.blog-barra').isVisible()), `${rotulo}: barra flutuante escondida no topo`);
    await app.page.evaluate(() => window.scrollTo(0, 900));
    await app.page.waitForSelector('.blog-barra--visivel', { timeout: 2000 });
    check(await app.page.locator('.blog-barra').isVisible(), `${rotulo}: barra flutuante aparece depois de rolar`);
    check((await app.page.locator('.blog-barra a[href^="mailto:"]').count()) === 1, `${rotulo}: barra flutuante tem o e-mail`);
    check((await app.page.locator('.blog-contato a[href="https://www.instagram.com/laift.liga"]').count()) >= 1, `${rotulo}: bloco de contato com Instagram`);
    check((await app.page.locator('.blog-status').count()) === 0, `${rotulo}: nenhum selo de status na interface`);
    await contatosDoTopo(app.page, rotulo);
    await axeGate(app.page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Movimento reduzido: sem "Bem-vindo" e nenhuma animação em execução no feed. */
async function movimentoReduzido() {
  const app = await startApp();
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.page.goto(app.baseUrl + 'blog.html');
    await app.page.waitForLoadState('networkidle');
    check((await app.page.locator('#welcome').count()) === 0, 'blog.html com movimento reduzido: sem tela "Bem-vindo"');
    const emExecucao = await app.page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => a.animationName || a.transitionProperty || 'animação'));
    check(emExecucao.length === 0, 'blog.html com movimento reduzido: nenhuma animação em execução' + (emExecucao.length ? ': ' + emExecucao.join(', ') : ''));
  } finally {
    await app.close();
  }
}

/** Índice indisponível: mensagem de erro com "Tentar novamente", sem skeleton eterno. */
async function falhaDoIndice() {
  const app = await startApp();
  try {
    await app.context.route('**/blog/index.json', (route) => route.abort());
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.page.goto(app.baseUrl + 'blog.html');
    await app.page.waitForLoadState('networkidle');
    check(await app.page.locator('#feed').getByText('Não foi possível carregar os posts.').isVisible(), 'blog.html sem índice: mensagem de erro visível');
    check(await app.page.getByRole('button', { name: 'Tentar novamente' }).isVisible(), 'blog.html sem índice: botão "Tentar novamente"');
    check((await app.page.locator('.blog-skeleton').count()) === 0, 'blog.html sem índice: skeleton removido');
  } finally {
    await app.close();
  }
}

module.exports = async function blog() {
  await feed(1280, 900);
  await feed(375, 812);
  await destaqueDaCampanha(1280, 900);
  await destaqueDaCampanha(375, 812);
  await post(375, 812);
  await pagina404(375, 812);
  await pagina404(1280, 900);
  await movimentoReduzido();
  await falhaDoIndice();
};
