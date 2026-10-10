/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificador do Lote A (barra de progresso nos posts do blog; docs/ux-progresso/CONTRATO.md §2-§5).
// Uso, da RAIZ: node docs/ux-progresso/verificadores/a-progresso.js   (sai com código 1 se algo falhar)
// Fotos em docs/ux-progresso/capturas/progresso-*.png (portão visual do dono).
'use strict';

const v = require('./comum');

const POST = 'modulo-inicio';
const CAMPANHA = 'outubro-rosa-2026';
const CHAVE = 'laift_progresso_v1';
const SPRITE = '/blog/icones.svg';

function fontes() {
  console.log('\nFontes');
  const js = v.lerFonte('modulos/shared/laift-progress.js');
  const css = v.lerFonte('modulos/shared/laift-progress.css');
  v.confere(v.temCabecalho(js) && v.temCabecalho(css), 'laift-progress.js e laift-progress.css existem e têm o cabeçalho de copyright');
  v.confere(!/prefers-reduced-motion:s*reduce/.test(css), 'laift-progress.css não repete o @media de movimento reduzido (bloco único em laift-tokens.css)');
  v.confere(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'laift-progress.css sem cor solta (só tokens)');
  const sprite = v.lerFonte('blog/icones.svg');
  for (const id of ['meta', 'estrela']) {
    const m = sprite.match(new RegExp(`<symbol id="${id}" viewBox="0 0 24 24">([\\s\\S]*?)</symbol>`));
    v.confere(!!m && /stroke="currentColor"/.test(m[1]) && /stroke-width="1.8"/.test(m[1]), `sprite do blog com o símbolo #${id} (24x24, traço currentColor 1.8)`);
  }
  const post = v.lerFonte('blog/post.js');
  v.confere(!/blog-progresso/.test(post) && /LaiftProgress\.montarLeitura|LP\.montarLeitura/.test(post), 'post.js usa LaiftProgress e não cria mais .blog-progresso');
  v.confere(!/blog-progresso/.test(v.lerFonte('blog.css')), 'blog.css sem as regras antigas de .blog-progresso');
  const sw = v.lerFonte('blog-sw.js');
  v.confere(sw.includes("'/modulos/shared/laift-progress.js'") && sw.includes("'/modulos/shared/laift-progress.css'"), 'blog-sw.js guarda laift-progress.js e .css para ler offline');
  const politica = v.lerFonte('privacidade.html');
  v.confere(politica.includes('<strong>Progresso de leitura.</strong>') && politica.includes('neste aparelho'), 'privacidade.html explica o progresso guardado só neste aparelho');
  const md = v.lerRaiz('docs/POLITICA_DE_PRIVACIDADE.md');
  v.confere(md.includes('**Progresso de leitura.**') && md.includes(CHAVE), 'POLITICA_DE_PRIVACIDADE.md com a mesma nota e a chave laift_progresso_v1');
}

function paginaGerada(blog) {
  console.log('\nPágina gerada');
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(blog.pasta, `${POST}.html`), 'utf8');
  v.confere(html.includes(`</header>\n<div class="laift-progresso" data-laift-progresso="blog:${POST}" hidden></div>\n`),
    'marcador da barra logo depois do cabeçalho do artigo, oculto até o JS montar');
  v.confere(html.split('data-laift-progresso=').length === 2, 'um só marcador por post');
  const iCss = html.indexOf('<link rel="stylesheet" href="/modulos/shared/laift-progress.css">');
  v.confere(iCss > html.indexOf('href="/blog.css"'), 'laift-progress.css carregado depois de blog.css');
  const iJs = html.indexOf('<script src="/modulos/shared/laift-progress.js" defer></script>');
  v.confere(iJs > 0 && iJs < html.indexOf('<script type="module" src="/blog/post.js">'), 'laift-progress.js (defer) antes do post.js');
}

async function estado(page) {
  return page.evaluate((chave) => {
    const alvo = document.querySelector('.laift-progresso');
    const aviso = alvo && alvo.querySelector('.laift-progresso__aviso');
    const use = alvo && alvo.querySelector('.laift-progresso__icone use');
    const trilho = alvo && alvo.querySelector('.laift-progresso__trilho');
    const icone = alvo && alvo.querySelector('.laift-progresso__icone');
    const caixa = alvo && alvo.getBoundingClientRect();
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { salvo = 'erro'; }
    return {
      existe: !!alvo, oculto: !!alvo && alvo.hidden, marco: alvo && alvo.getAttribute('data-marco'), estadoAttr: alvo && alvo.getAttribute('data-estado'),
      texto: aviso ? aviso.textContent.replace(/\s+/g, ' ').trim() : '', role: aviso && aviso.getAttribute('role'), live: aviso && aviso.getAttribute('aria-live'),
      trilhoOculto: trilho && trilho.getAttribute('aria-hidden'), trilhoLargura: trilho ? trilho.getBoundingClientRect().width : 0,
      href: use ? use.getAttribute('href') : null, iconeVisivel: !!icone && icone.getBoundingClientRect().width > 0,
      p: alvo ? parseFloat(getComputedStyle(alvo).getPropertyValue('--laift-p')) : NaN,
      topo: caixa ? caixa.top : null, altura: caixa ? caixa.height : 0, salvo,
      corTexto: aviso ? getComputedStyle(aviso).color : '', corIcone: icone ? getComputedStyle(icone).color : '',
      fundo: getComputedStyle(document.body).backgroundColor, celebra: !!alvo && alvo.classList.contains('laift-progresso--celebra'),
      csp: window.__csp.slice(), rolagemX: document.documentElement.scrollWidth > innerWidth,
    };
  }, CHAVE);
}

function marcosSalvos(s, slug = POST) {
  const item = s.salvo && s.salvo.itens && s.salvo.itens[`blog:${slug}`];
  return item ? item.marcos : null;
}

/** Rola em passos de 1/4 de tela até o fim do artigo; confere o 25, fotografa no 50 e no 100. */
async function lerAteOFim(page, rotulo, nome) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(150);
  let fotografou50 = false;
  let viu25 = false;
  for (let i = 0; i < 400; i += 1) {
    const fim = await page.evaluate(() => {
      const a = document.querySelector('.blog-artigo').getBoundingClientRect();
      if (a.bottom <= innerHeight) return true;
      window.scrollBy({ top: Math.round(innerHeight * 0.25), behavior: 'instant' });
      return false;
    });
    await page.waitForTimeout(60);
    const s = await estado(page);
    if (!viu25 && s.marco === '25') {
      viu25 = true;
      v.confere(s.texto === '25% Bom começo' && !s.iconeVisivel && JSON.stringify(marcosSalvos(s)) === '[25]', `${rotulo}: 25% só depois de ler o trecho ("${s.texto}", grava [25])`);
    }
    if (!fotografou50 && s.marco === '50') {
      fotografou50 = true;
      v.confere(s.iconeVisivel && s.href === `${SPRITE}#meta`, `${rotulo}: no 50% aparece o ícone de meta`);
      v.confere(s.texto === '50% Metade do caminho', `${rotulo}: frase do 50% ("${s.texto}")`);
      await page.waitForTimeout(700);
      if (nome) await page.screenshot({ path: v.captura(`${nome}-50`) });
    }
    if (fim) break;
  }
  v.confere(viu25 && fotografou50, `${rotulo}: passou pelos marcos 25 e 50 um de cada vez`);
  await page.waitForTimeout(250);
  return estado(page);
}

async function postNaTela(app, opcoes) {
  const { largura, tema } = opcoes;
  const rotulo = `post ${largura} ${tema}`;
  const nome = `progresso-${tema === 'dark' ? 'escuro' : 'claro'}-${largura}`;
  console.log(`\n${rotulo}`);
  const aberto = await app.abrir(`blog/${POST}.html`, { largura, altura: largura < 600 ? 812 : 800, tema });
  const { page, erros } = aberto;
  try {
    let s = await estado(page);
    v.confere(s.existe && !s.oculto, `${rotulo}: barra montada e visível`);
    v.confere(s.marco === '0' && s.texto === '0% Boa leitura' && !s.iconeVisivel, `${rotulo}: abre vazia, "0% Boa leitura", sem ícone ("${s.texto}")`);
    v.confere(s.role === 'status' && s.live === 'polite' && s.trilhoOculto === 'true', `${rotulo}: aviso role="status" aria-live="polite"; trilho decorativo`);
    v.confere(Math.abs(s.p) < 0.001, `${rotulo}: preenchimento inicial em 0% (--laift-p ${s.p})`);
    v.confere(marcosSalvos(s) === null, `${rotulo}: nada gravado em ${CHAVE} antes de ler`);
    v.confere(s.trilhoLargura >= 96, `${rotulo}: trilho com pelo menos 96 px (${Math.round(s.trilhoLargura)})`);
    v.confere(!s.rolagemX, `${rotulo}: sem rolagem horizontal`);
    await page.screenshot({ path: v.captura(`${nome}-inicio`) });

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(250);
    s = await estado(page);
    v.confere(marcosSalvos(s) === null && s.marco === '0' && Math.abs(s.p) < 0.001, `${rotulo}: salto direto para o fim não conta marco (guarda contra salto)`);

    s = await lerAteOFim(page, rotulo, nome);
    v.confere(JSON.stringify(marcosSalvos(s)) === '[25,50,75,100]', `${rotulo}: leitura contínua grava 25, 50, 75 e 100 (${JSON.stringify(marcosSalvos(s))})`);
    const item = s.salvo && s.salvo.itens && s.salvo.itens[`blog:${POST}`];
    v.confere(!!item && /^\d{4}-\d{2}-\d{2}$/.test(item.concluidoEm || ''), `${rotulo}: concluidoEm em AAAA-MM-DD (${item && item.concluidoEm})`);
    v.confere(s.estadoAttr === 'concluido' && s.texto === '100% Leitura concluída' && s.href === `${SPRITE}#estrela`, `${rotulo}: 100% com estrela e "Leitura concluída"`);
    v.confere(s.celebra, `${rotulo}: resposta visual (classe laift-progresso--celebra) ao concluir`);
    v.confere(Math.abs(s.p - 1) < 0.01, `${rotulo}: preenchimento cheio`);
    const topoEsperado = await page.evaluate(() => {
      const c = document.querySelector('.pub-barra');
      return c && getComputedStyle(c).position === 'sticky' ? c.getBoundingClientRect().height : 0;
    });
    v.confere(Math.abs(s.topo - topoEsperado) <= 1, `${rotulo}: barra presa no topo da leitura (top ${Math.round(s.topo)} px; esperado ${Math.round(topoEsperado)})`);
    v.confere(v.contraste(s.corTexto, s.fundo) >= 4.5, `${rotulo}: texto do aviso com contraste AA (${v.contraste(s.corTexto, s.fundo).toFixed(2)})`);
    v.confere(v.contraste(s.corIcone, s.fundo) >= 3, `${rotulo}: estrela com contraste >= 3 (${v.contraste(s.corIcone, s.fundo).toFixed(2)})`);
    await page.waitForTimeout(500);
    await page.evaluate(() => { const a = document.querySelector('.blog-artigo').getBoundingClientRect(); window.scrollBy({ top: a.bottom - innerHeight + 4, behavior: 'instant' }); });
    await page.screenshot({ path: v.captura(`${nome}-100`) });
    const sobra = await v.axeSerio(page);
    v.confere(sobra.length === 0, `${rotulo}: axe sem violação séria${sobra.length ? ': ' + sobra.join(', ') : ''}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    s = await estado(page);
    v.confere(s.estadoAttr === 'concluido' && s.texto === '100% Leitura concluída' && Math.abs(s.p - 1) < 0.01 && !s.celebra,
      `${rotulo}: ao voltar ao post concluído, a estrela fica no lugar da barra, sem nova comemoração`);
    v.confere(s.csp.length === 0, `${rotulo}: sem violação de CSP${s.csp.length ? ': ' + s.csp.join(', ') : ''}`);
    v.confere(erros.length === 0, `${rotulo}: sem erro de JavaScript${erros.length ? ': ' + erros.join(' | ') : ''}`);
  } finally {
    await aberto.fechar();
  }
}

async function semArmazenamento(app) {
  console.log('\nArmazenamento bloqueado');
  const aberto = await app.abrir(`blog/${POST}.html`, { largura: 375, altura: 812, semStorage: true });
  try {
    const s = await estado(aberto.page);
    v.confere(s.existe && s.texto === '0% Boa leitura', 'localStorage bloqueado: a barra aparece mesmo assim (0%)');
    v.confere(aberto.erros.length === 0, `localStorage bloqueado: sem erro de JavaScript${aberto.erros.length ? ': ' + aberto.erros.join(' | ') : ''}`);
  } finally {
    await aberto.fechar();
  }
}

async function movimentoReduzido(app) {
  console.log('\nMovimento reduzido');
  const aberto = await app.abrir(`blog/${CAMPANHA}.html`, { largura: 375, altura: 812, tema: 'dark', reduzido: true });
  try {
    const { page } = aberto;
    let s = await estado(page);
    v.confere(s.existe && s.marco === '0', 'post da campanha (série campanhas) também tem a barra, vazia ao abrir');
    for (let i = 0; i < 400 && s.marco !== '50'; i += 1) {
      await page.evaluate(() => window.scrollBy({ top: Math.round(innerHeight * 0.5), behavior: 'instant' }));
      await page.waitForTimeout(40);
      s = await estado(page);
    }
    v.confere(s.marco === '50', `movimento reduzido: chegou ao marco 50 (${s.marco})`);
    const rodando = await page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.laift-progresso')).length);
    v.confere(rodando === 0, `movimento reduzido: nenhuma animação rodando na barra (${rodando})`);
  } finally {
    await aberto.fechar();
  }
}

(async () => {
  fontes();
  const app = await v.iniciar();
  try {
    paginaGerada(app.blog);
    await postNaTela(app, { largura: 375, tema: 'light' });
    await postNaTela(app, { largura: 1280, tema: 'dark' });
    await semArmazenamento(app);
    await movimentoReduzido(app);
  } finally {
    await app.fechar();
  }
  v.concluir('Lote A progresso');
})().catch((e) => { console.error(e); process.exitCode = 1; });
