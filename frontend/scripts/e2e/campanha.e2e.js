/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * campanha.e2e.js — post de campanha "Outubro Rosa 2026" (blog/outubro-rosa-2026.html), a 404
 * do blog e o link "Conheça a plataforma" do login. Roda sobre o BUILD (frontend/dist/), com
 * páginas públicas (sem login). Usa o nome do arquivo (.html), não a rota limpa.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const PAGINA = 'blog/outubro-rosa-2026.html';
const ALVO_MINIMO_PX = 44;
const TEMPO_PAINEL_MS = 1500;
const TAMANHOS = [[1280, 900], [375, 812]];
const EMOJI = /\p{Extended_Pictographic}/u;

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

/** Conta trocas de texto nos KPIs desde o DOMContentLoaded: o count-up do campanha.js muda o texto a cada quadro. */
async function observarKpis(app) {
  await app.context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.__kpiMutacoes = 0;
      new MutationObserver((lista) => {
        lista.forEach((m) => {
          const alvo = m.target.nodeType === 3 ? m.target.parentElement : m.target;
          if (alvo && alvo.closest && alvo.closest('.blog-kpi__num')) window.__kpiMutacoes += 1;
        });
      }).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    });
  });
}

async function checarSaude(app, respostas, rotulo) {
  const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
  check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? ': ' + violacoes.join(' | ') : ''));
  check(respostas.length === 0, `${rotulo}: nenhum recurso com erro HTTP` + (respostas.length ? ': ' + respostas.join(' | ') : ''));
  check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
}

/** 1 h1, recursos da página (CSS e JS próprios), sem rolagem horizontal. */
async function estrutura(page, rotulo) {
  check((await page.locator('h1').count()) === 1, `${rotulo}: exatamente 1 h1`);
  const recursos = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
  check(recursos.some((u) => /\/blog-campanha\.css$/.test(u)), `${rotulo}: carrega /blog-campanha.css`);
  check(recursos.some((u) => /\/blog\/campanha\.js$/.test(u)), `${rotulo}: carrega /blog/campanha.js`);
  const medidas = await page.evaluate(() => ({ larguraPagina: document.documentElement.scrollWidth, janela: window.innerWidth }));
  check(medidas.larguraPagina <= medidas.janela, `${rotulo}: sem rolagem horizontal (${medidas.larguraPagina} <= ${medidas.janela})`);
}

/** Sumário: um link por seção (h2 com id s-N); o 3º link leva ao h2 certo. */
async function sumario(page, rotulo) {
  const secoes = await page.locator('article h2[id^="s-"]').count();
  const links = page.locator('.blog-sumario__link');
  check(secoes > 0 && (await links.count()) === secoes, `${rotulo}: sumário com ${secoes} links, um por seção`);
  const terceiro = links.nth(2);
  const destino = ((await page.locator('#s-3').textContent()) || '').trim();
  check((await terceiro.getAttribute('href')) === '#s-3', `${rotulo}: 3º link do sumário aponta para #s-3`);
  await terceiro.click();
  await page.waitForFunction(() => window.location.hash === '#s-3', null, { timeout: 2000 }).catch(() => {});
  check((await page.evaluate(() => window.location.hash)) === '#s-3', `${rotulo}: clicar no 3º link muda o hash para #s-3`);
  const topo = await page.locator('#s-3').evaluate((e) => e.getBoundingClientRect().top);
  check(topo > -20 && topo < (await page.evaluate(() => window.innerHeight)), `${rotulo}: a seção "${destino}" fica na tela`);
}

/** Deck: filtro mitos, abrir uma carta (verso e placar), alvos de toque >= 44 px. */
async function deck(page, rotulo) {
  check(await page.locator('.blog-deck__filtros').isVisible(), `${rotulo}: filtros do deck visíveis (JS ativo)`);
  await page.locator('.blog-deck [data-filtro="mito"]').click();
  const visiveis = await page.locator('.blog-carta').evaluateAll((els) => els
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => e.getAttribute('data-veredito')));
  const mitos = await page.locator('.blog-carta[data-veredito="mito"]').count();
  check(visiveis.length > 0 && visiveis.length === mitos && visiveis.every((v) => v === 'mito'),
    `${rotulo}: filtro "Mitos" deixa só as cartas de mito (${visiveis.length})`);

  await page.locator('.blog-deck [data-filtro="verdade"]').click();
  const verdades = await page.locator('.blog-carta').evaluateAll((els) => els
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => e.getAttribute('data-veredito')));
  const esperadas = await page.locator('.blog-carta[data-veredito="verdade"]').count();
  check(verdades.length > 0 && verdades.length === esperadas && verdades.every((v) => v === 'verdade'),
    `${rotulo}: filtro "Verdades" deixa só as cartas de verdade (${verdades.length})`);
  await page.locator('.blog-deck [data-filtro="mito"]').click();

  const carta = page.locator('.blog-carta[data-veredito="mito"]').first();
  const placarAntes = ((await page.locator('.blog-deck__placar').textContent()) || '').trim();
  await carta.locator('.blog-carta__frente').click();
  check(await carta.locator('details').evaluate((d) => d.open), `${rotulo}: abrir uma carta abre o detalhe`);
  check(await carta.locator('.blog-carta__verso').isVisible(), `${rotulo}: verso da carta aparece`);
  await page.waitForFunction((antes) => {
    const placar = document.querySelector('.blog-deck__placar');
    return !!placar && placar.textContent !== antes;
  }, placarAntes, { timeout: 2000 }).catch(() => {});
  const placarDepois = ((await page.locator('.blog-deck__placar').textContent()) || '').trim();
  check(placarDepois !== placarAntes && /abriu 1 de \d+/.test(placarDepois),
    `${rotulo}: placar muda ao abrir a carta ("${placarDepois}")`);

  await page.locator('.blog-deck [data-filtro="todas"]').click();
  const alvos = await page.locator('.blog-deck summary.blog-carta__frente, .blog-deck__filtros .blog-chip').evaluateAll((els) => els
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => e.getBoundingClientRect().height));
  check(alvos.length > 0 && alvos.every((h) => h >= ALVO_MINIMO_PX),
    `${rotulo}: resumos das cartas e chips com altura >= ${ALVO_MINIMO_PX} px`);
}

/** Painel: rola pelos blocos, espera 1,5 s; KPIs no valor final e barras com --v = data-v. */
async function painel(page, rotulo) {
  await page.locator('.blog-painel').scrollIntoViewIfNeeded();
  const blocos = await page.locator('.blog-painel .blog-kpi, .blog-painel .blog-grafico__barra, .blog-painel .blog-tabela-dados').all();
  for (const bloco of blocos) await bloco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(TEMPO_PAINEL_MS);
  const mudancas = await page.evaluate(() => window.__kpiMutacoes);
  check(mudancas > 0, `${rotulo}: KPIs animam ao entrar na tela (${mudancas} trocas de texto)`);
  await verificarPainelFinal(page, rotulo);
}

async function verificarPainelFinal(page, rotulo) {
  const kpis = await page.locator('.blog-kpi__num').evaluateAll((els) => els.map((e) => ({
    texto: e.textContent,
    sr: e.nextElementSibling && e.nextElementSibling.classList.contains('blog-sr-only') ? e.nextElementSibling.textContent : null,
  })));
  check(kpis.length > 0 && kpis.every((k) => k.sr !== null && k.texto === k.sr),
    `${rotulo}: KPIs no valor final (${kpis.map((k) => k.texto).join(', ')})`);
  const barras = await page.locator('.blog-grafico__barra').evaluateAll((els) => els.map((e) => ({
    v: parseFloat(getComputedStyle(e).getPropertyValue('--v')),
    dv: parseFloat(e.getAttribute('data-v')),
  })));
  check(barras.length > 0 && barras.every((b) => Math.abs(b.v - b.dv) < 0.001),
    `${rotulo}: barras com --v igual a data-v (${barras.length})`);
}

/** Tabelas, hábitos com emoji, referências (links externos e âncoras), emoji só nos hábitos, avisos de saúde. */
async function conteudo(page, rotulo) {
  const tabelas = await page.locator('table').count();
  const semLegenda = await page.locator('table').evaluateAll((ts) => ts.filter((t) => !t.querySelector('caption')).length);
  check((await page.locator('.blog-tabela-dados table').count()) >= 1 && (await page.locator('.blog-comparativo__tabela').count()) >= 1 && semLegenda === 0,
    `${rotulo}: tabelas presentes e com legenda (${tabelas})`);

  const emojis = await page.locator('.blog-habito__emoji').allTextContents();
  check(emojis.length >= 4 && emojis.every((t) => EMOJI.test(t)), `${rotulo}: hábitos com emoji (${emojis.length})`);

  const links = await page.locator('.blog-referencias a').evaluateAll((as) => as.map((a) => ({
    href: a.getAttribute('href') || '',
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel') || '',
  })));
  const externos = links.filter((l) => /^https:\/\//.test(l.href));
  check(externos.length > 0 && externos.every((l) => l.target === '_blank' && /\bnoopener\b/.test(l.rel)),
    `${rotulo}: ${externos.length} links externos das referências abrem em nova aba com noopener`);
  const ancorasSemAlvo = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#ref-"]'))
    .map((a) => a.getAttribute('href').slice(1))
    .filter((id) => !document.getElementById(id)));
  check(ancorasSemAlvo.length === 0, `${rotulo}: toda âncora #ref- aponta para uma referência` + (ancorasSemAlvo.length ? ': ' + ancorasSemAlvo.join(', ') : ''));

  const textoArtigo = await page.locator('article.blog-artigo').evaluate((el) => {
    const copia = el.cloneNode(true);
    copia.querySelectorAll('.blog-habito__emoji').forEach((n) => n.remove());
    return copia.textContent;
  });
  check(!EMOJI.test(textoArtigo), `${rotulo}: sem emoji fora do bloco de hábitos`);

  const avisos = await page.locator('article .blog-destaque[data-tom="atencao"]').allTextContents();
  check(avisos.length >= 2 && /Não substitui/.test(avisos[0]) && /Não substitui/.test(avisos[avisos.length - 1]),
    `${rotulo}: aviso de saúde no topo e no fim do artigo`);
}

async function paginaCampanha(largura, altura) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const respostas = [];
  const rotulo = `${PAGINA} ${largura}px`;
  try {
    await vigiar(app, respostas);
    await observarKpis(app);
    await app.page.goto(app.baseUrl + PAGINA);
    await app.page.waitForLoadState('networkidle');
    await estrutura(app.page, rotulo);
    await axeGate(app.page, `${rotulo}: axe`);
    await sumario(app.page, rotulo);
    await deck(app.page, rotulo);
    await painel(app.page, rotulo);
    await conteudo(app.page, rotulo);
    await axeGate(app.page, `${rotulo}: axe depois da interação`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Movimento reduzido: KPIs já no valor final e barras com --v = data-v ao carregar; nenhuma animação em execução. */
async function movimentoReduzido() {
  const app = await startApp({ viewport: { width: 1280, height: 900 } });
  const rotulo = `${PAGINA} movimento reduzido`;
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.page.goto(app.baseUrl + PAGINA);
    await app.page.waitForLoadState('networkidle');
    await verificarPainelFinal(app.page, rotulo);
    const emExecucao = await app.page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => a.animationName || a.transitionProperty || 'animação'));
    check(emExecucao.length === 0, `${rotulo}: nenhuma animação em execução` + (emExecucao.length ? ': ' + emExecucao.join(', ') : ''));
  } finally {
    await app.close();
  }
}

/** 404 do blog: noindex, dois atalhos (plataforma e Instagram em nova aba), axe, sem violação de CSP. */
async function paginaNaoEncontrada() {
  const app = await startApp({ viewport: { width: 1280, height: 900 } });
  const respostas = [];
  const rotulo = 'blog/404.html 1280px';
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + 'blog/404.html');
    await app.page.waitForLoadState('networkidle');
    check((await app.page.locator('meta[name="robots"][content*="noindex"]').count()) === 1, `${rotulo}: meta robots noindex`);
    check((await app.page.locator('a.blog-404__atalho').count()) === 2, `${rotulo}: 2 atalhos`);
    const insta = app.page.locator('a.blog-404__atalho[href="https://www.instagram.com/laift.liga"]');
    check((await insta.getAttribute('target')) === '_blank', `${rotulo}: atalho do Instagram abre em nova aba`);
    check((await app.page.locator('a.blog-404__atalho[href="/"]').count()) === 1, `${rotulo}: atalho para a plataforma`);
    await axeGate(app.page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Login: o link "Conheça a plataforma" (classe welcome-liga__blog) leva ao blog; o link da Liga continua único. */
async function linkDoLogin() {
  const app = await startApp();
  const rotulo = 'login (/)';
  try {
    await app.page.goto(app.baseUrl);
    await app.page.waitForLoadState('networkidle');
    const blog = app.page.locator('.welcome-liga__blog');
    await blog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check((await blog.count()) === 1 && (await blog.isVisible()), `${rotulo}: "Conheça a plataforma" visível`);
    check((await blog.getAttribute('href')) === 'blog.html', `${rotulo}: "Conheça a plataforma" leva a blog.html`);
    check((await app.page.locator('.welcome-liga__link').count()) === 1, `${rotulo}: link "Conheça a LAIFT" continua único`);
  } finally {
    await app.close();
  }
}

module.exports = async function campanha() {
  for (const [largura, altura] of TAMANHOS) await paginaCampanha(largura, altura);
  await movimentoReduzido();
  await paginaNaoEncontrada();
  await linkDoLogin();
};
