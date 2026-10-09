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
const LARGURA_DESKTOP_PX = 760;
const LIMITE_X_CELULAR_PX = 24;
const LIMITE_X_DESKTOP_PX = 120;
const CONTRASTE_MINIMO_TEXTO = 4.5;
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

/** Barra do topo (header.pub-barra): Voltar no canto superior esquerdo; Início, Entrar e Cadastrar; todos >= 44 px. Chamar sem rolar. */
async function barraDoTopo(page, rotulo, voltarPara) {
  const barra = page.locator('header.pub-barra');
  check((await barra.count()) === 1, `${rotulo}: uma header.pub-barra`);
  const voltar = barra.locator('.pub-voltar[data-history-back]');
  check((await voltar.count()) === 1 && (await voltar.getAttribute('href')) === voltarPara, `${rotulo}: .pub-voltar[data-history-back] aponta para ${voltarPara}`);
  const caixaVoltar = await voltar.boundingBox();
  // Celular: encostado na borda (x ≤ 24). Desktop: alinhado à coluna de conteúdo (x ≤ 120).
  const limiteX = ((await page.viewportSize()) || { width: 0 }).width >= LARGURA_DESKTOP_PX ? LIMITE_X_DESKTOP_PX : LIMITE_X_CELULAR_PX;
  check(caixaVoltar && caixaVoltar.x <= limiteX && caixaVoltar.y <= 24, `${rotulo}: Voltar no canto superior (x ≤ ${limiteX}, y ≤ 24)`);
  const primeiroFocavel = await page.evaluate(() => {
    const focavel = [...document.querySelectorAll('header.pub-barra a[href], header.pub-barra button')].find((el) => el.offsetParent !== null);
    return !!focavel && focavel.classList.contains('pub-voltar');
  });
  check(primeiroFocavel, `${rotulo}: Voltar é o primeiro elemento focável da barra`);
  const alvos = {
    Voltar: voltar,
    Início: barra.locator('.pub-barra__link[href="/"]'),
    Entrar: barra.locator('.pub-barra__link[href="/#entrar"]'),
    Cadastrar: barra.locator('.pub-barra__link[href="/#cadastro"]'),
  };
  for (const [nome, link] of Object.entries(alvos)) {
    check((await link.count()) === 1, `${rotulo}: link "${nome}" existe na barra`);
    const caixa = await link.first().boundingBox();
    check(caixa && caixa.height >= ALVO_MINIMO_PX, `${rotulo}: link "${nome}" com altura >= ${ALVO_MINIMO_PX} px`);
  }
}

/** Instagram e e-mail continuam no bloco "Fale com a Liga" (.blog-contato), com alvo >= 44 px. */
async function contatosNoBloco(page, rotulo) {
  const insta = page.locator('.blog-contato a[href="https://www.instagram.com/laift.liga"]');
  check((await insta.count()) === 1, `${rotulo}: Instagram no bloco .blog-contato`);
  check((await insta.getAttribute('target')) === '_blank' && /noopener/.test((await insta.getAttribute('rel')) || ''), `${rotulo}: Instagram abre em nova aba com noopener`);
  const email = page.locator('.blog-contato a[href^="mailto:"]');
  check((await email.count()) === 1, `${rotulo}: e-mail em mailto: no bloco .blog-contato`);
  for (const link of [insta, email]) {
    const caixa = await link.first().boundingBox();
    check(caixa && caixa.height >= ALVO_MINIMO_PX, `${rotulo}: contato do bloco com altura >= ${ALVO_MINIMO_PX} px`);
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
    await barraDoTopo(app.page, rotulo, '/');
    await contatosNoBloco(app.page, rotulo);

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
    await barraDoTopo(app.page, rotulo, '/blog.html');
    check(!(await app.page.locator('.blog-barra').isVisible()), `${rotulo}: barra flutuante escondida no topo`);
    await app.page.evaluate(() => window.scrollTo(0, 900));
    await app.page.waitForSelector('.blog-barra--visivel', { timeout: 2000 });
    check(await app.page.locator('.blog-barra').isVisible(), `${rotulo}: barra flutuante aparece depois de rolar`);
    check((await app.page.locator('.blog-barra a[href="https://www.instagram.com/laift.liga"]').count()) === 1, `${rotulo}: barra flutuante tem o Instagram`);
    check((await app.page.locator('.blog-barra a[href^="mailto:"]').count()) === 1, `${rotulo}: barra flutuante tem o e-mail`);
    await contatosNoBloco(app.page, rotulo);
    check((await app.page.locator('.blog-status').count()) === 0, `${rotulo}: nenhum selo de status na interface`);
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

/** Luminância relativa (WCAG 2.x) de uma cor [r, g, b] em 0–255. */
function luminancia(rgb) {
  const [r, g, b] = rgb.map((canal) => {
    const s = canal / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores [r, g, b]. */
function razaoDeContraste(corA, corB) {
  const [claro, escuro] = [luminancia(corA), luminancia(corB)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Lê "rgb(r, g, b)" ou "rgba(r, g, b, a)" do getComputedStyle. */
function lerRgb(texto) {
  const m = /rgba?\(([^)]+)\)/.exec(texto || '');
  if (!m) return null;
  const partes = m[1].split(',').map((v) => Number(v.trim()));
  return { rgb: partes.slice(0, 3), alpha: partes.length > 3 ? partes[3] : 1 };
}

/** Link "Cadastrar" da barra: o texto precisa ter >= 4.5:1 sobre o fundo sólido, no tema claro e no escuro. */
async function contrasteDoCadastrar(largura, altura, esquema) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const rotulo = `blog.html Cadastrar ${esquema} ${largura}px`;
  try {
    await app.page.emulateMedia({ colorScheme: esquema });
    await app.page.goto(app.baseUrl + 'blog.html', { waitUntil: 'domcontentloaded' });
    await app.page.waitForSelector('#welcome', { state: 'detached', timeout: TEMPO_MAX_WELCOME_MS });
    await app.page.waitForLoadState('networkidle');
    const cores = await app.page.evaluate(() => {
      const link = document.querySelector('header.pub-barra .pub-barra__link--destaque');
      if (!link) return null;
      const texto = link.querySelector('span') || link;
      return { texto: getComputedStyle(texto).color, fundo: getComputedStyle(link).backgroundColor };
    });
    const corTexto = lerRgb(cores && cores.texto);
    const corFundo = lerRgb(cores && cores.fundo);
    const opacos = !!corTexto && !!corFundo && corTexto.alpha === 1 && corFundo.alpha === 1;
    check(opacos, `${rotulo}: texto e fundo do link com cor sólida`);
    if (!opacos) return;
    const razao = razaoDeContraste(corTexto.rgb, corFundo.rgb);
    check(razao >= CONTRASTE_MINIMO_TEXTO, `${rotulo}: contraste ${razao.toFixed(2)}:1 (mínimo ${CONTRASTE_MINIMO_TEXTO}:1)`);
  } finally {
    await app.close();
  }
}

/** Instalação com aviso nativo (Android e computador): manifesto, botões escondidos, aceite e somem. */
async function instalavelComAvisoNativo() {
  const app = await startApp({ viewport: { width: 1280, height: 900 } });
  const respostas = [];
  const rotulo = 'blog.html instalável (aviso nativo)';
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog.html', { waitUntil: 'domcontentloaded' });
    await app.page.waitForSelector('#welcome', { state: 'detached', timeout: TEMPO_MAX_WELCOME_MS });
    await app.page.waitForLoadState('networkidle');

    check((await app.page.locator('link[rel="manifest"]').getAttribute('href')) === '/blog/manifest.webmanifest', `${rotulo}: link[rel=manifest] aponta para /blog/manifest.webmanifest`);
    const manifesto = await app.context.request.get(app.baseUrl + 'blog/manifest.webmanifest');
    const corpo = manifesto.ok() ? await manifesto.json().catch(() => null) : null;
    check(!!corpo && corpo.scope === '/blog', `${rotulo}: manifesto responde JSON com scope /blog`);

    const botoes = app.page.locator('[data-instalar]');
    check((await botoes.count()) === 2, `${rotulo}: dois botões [data-instalar] (topo e hero)`);
    const visiveisAoNascer = await Promise.all((await botoes.all()).map((b) => b.isVisible()));
    check(visiveisAoNascer.every((v) => v === false), `${rotulo}: botões [data-instalar] nascem escondidos`);

    const cancelado = await app.page.evaluate(() => {
      const evento = new Event('beforeinstallprompt', { cancelable: true });
      window.__chamadasPrompt = 0;
      evento.prompt = () => { window.__chamadasPrompt += 1; return Promise.resolve(); };
      evento.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(evento);
      return evento.defaultPrevented;
    });
    check(cancelado, `${rotulo}: beforeinstallprompt recebe preventDefault`);
    await app.page.waitForFunction(() => [...document.querySelectorAll('[data-instalar]')].every((b) => !b.hidden));
    const visiveisComAviso = await Promise.all((await botoes.all()).map((b) => b.isVisible()));
    check(visiveisComAviso.length === 2 && visiveisComAviso.every(Boolean), `${rotulo}: com o aviso, os dois botões aparecem`);

    await botoes.first().click();
    await app.page.waitForFunction(() => [...document.querySelectorAll('[data-instalar]')].every((b) => b.hidden));
    check((await app.page.evaluate(() => window.__chamadasPrompt)) === 1, `${rotulo}: clique chama prompt() uma vez`);
    const visiveisDepois = await Promise.all((await botoes.all()).map((b) => b.isVisible()));
    check(visiveisDepois.every((v) => v === false), `${rotulo}: depois do aceite, os botões somem`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** iPhone: sem aviso nativo, os botões aparecem; o clique abre o diálogo com 3 passos; "Entendi" fecha. */
async function instalavelNoIphone() {
  const app = await startApp({ viewport: { width: 375, height: 812 } });
  const respostas = [];
  const rotulo = 'blog.html iPhone';
  try {
    await app.context.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
      Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    });
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog.html', { waitUntil: 'domcontentloaded' });
    await app.page.waitForSelector('#welcome', { state: 'detached', timeout: TEMPO_MAX_WELCOME_MS });
    await app.page.waitForLoadState('networkidle');

    const botoes = app.page.locator('[data-instalar]');
    const visiveis = await Promise.all((await botoes.all()).map((b) => b.isVisible()));
    check(visiveis.length === 2 && visiveis.every(Boolean), `${rotulo}: botões [data-instalar] visíveis`);

    await botoes.first().click();
    const dialogo = app.page.locator('dialog.pub-instalar-dialogo[open]');
    await dialogo.waitFor({ state: 'visible', timeout: 2000 });
    check((await dialogo.count()) === 1, `${rotulo}: clique abre dialog.pub-instalar-dialogo[open]`);
    check((await dialogo.locator('ol > li').count()) === 3, `${rotulo}: diálogo com 3 passos`);
    await axeGate(app.page, `${rotulo}: axe com o diálogo aberto`);

    await dialogo.getByRole('button', { name: 'Entendi' }).click();
    check((await app.page.locator('dialog.pub-instalar-dialogo[open]').count()) === 0, `${rotulo}: "Entendi" fecha o diálogo`);
    await checarSaude(app, respostas, rotulo);
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
  await instalavelComAvisoNativo();
  await instalavelNoIphone();
  for (const esquema of ['light', 'dark']) {
    await contrasteDoCadastrar(375, 812, esquema);
    await contrasteDoCadastrar(1280, 900, esquema);
  }
};
