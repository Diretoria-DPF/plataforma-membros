/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificador da ficha S2: miniatura visual do aviso do blog (tela de entrada e /liga)
// e rodapé público (footer.pub-rodape) no feed, nos posts e na 404 do blog.
// Uso, a partir da RAIZ do worktree: node docs/identidade/ajustes-2/verificadores/s2-blog.js
// Gera aviso-*.png, liga-blog-*.png e rodape-*.png em docs/identidade/ajustes-2/capturas/.
'use strict';

const fs = require('fs');
const path = require('path');
const v = require('./comum');

const novidade = require(path.join(v.FRONT, 'blog-novidade.js'));
const SPRITE = 'blog/icones.svg#';
const ROSA = {
  light: { fundo: 'rgb(252, 231, 243)', cor: 'rgb(166, 29, 86)' },
  dark: { fundo: 'rgb(58, 26, 43)', cor: 'rgb(255, 156, 203)' },
};
const LINKS_RODAPE = [
  ['/liga.html', 'Conheça a LAIFT'], ['/processo-seletivo.html', 'Processo seletivo'], ['/edital.html', 'Edital'],
  ['/blog.html', 'Blog'], ['/termos.html', 'Termos de Uso'], ['/privacidade.html', 'Privacidade'],
];

function estaticos(app) {
  console.log('\n▶ fonte');
  const js = v.lerFonte('blog-novidade.js');
  v.confere(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'blog-novidade.js sem innerHTML/outerHTML/insertAdjacentHTML/document.write');
  v.confere(/createElementNS\(\s*SVG_NS/.test(js) && js.includes("'blog/icones.svg'"), "blog-novidade.js cria o ícone com createElementNS(SVG_NS, …) e o sprite relativo 'blog/icones.svg'");
  v.confere(!js.includes("'Do blog'"), 'blog-novidade.js sem o selo escrito "Do blog"');
  const css = v.lerFonte('blog-novidade.css');
  v.confere(css.includes('#a61d56') && css.includes('#fce7f3') && css.includes('#ff9ccb') && css.includes('#3a1a2b'), 'blog-novidade.css com os tons rosa da campanha (claro e escuro)');
  v.confere(/\.blog-novidade__capa/.test(css) && /prefers-reduced-motion/.test(css), 'blog-novidade.css com .blog-novidade__capa e prefers-reduced-motion');
  v.confere(v.lerFonte('blog.css').includes('.blog-post .pub-rodape'), 'blog.css: folga do rodapé nos posts (.blog-post .pub-rodape)');
  v.confere(v.lerFonte('scripts/blog-novidade.test.mjs').includes('iconeDe'), 'scripts/blog-novidade.test.mjs testa iconeDe');
  v.confere(v.lerFonte('scripts/build-blog.test.mjs').includes('pub-rodape'), 'scripts/build-blog.test.mjs testa o rodapé');
  v.confere(v.lerFonte('scripts/e2e/blog.e2e.js').includes('pub-rodape'), 'scripts/e2e/blog.e2e.js confere o rodapé');
  const posts = fs.readdirSync(app.blog.pasta).filter((f) => f.endsWith('.html') && f !== '404.html');
  const semRodape = posts.filter((f) => !/<\/main>\s*<footer class="pub-rodape">[\s\S]*?<\/footer>/.test(fs.readFileSync(path.join(app.blog.pasta, f), 'utf8')));
  v.confere(posts.length === app.blog.indice.length && semRodape.length === 0, `${posts.length} posts gerados com footer.pub-rodape logo depois de </main> (sem: ${semRodape.join(', ') || 'nenhum'})`);
  for (const arquivo of ['blog.html', 'blog/404.html']) {
    v.confere(/<\/main>\s*<footer class="pub-rodape">/.test(v.lerFonte(arquivo)), `${arquivo}: footer.pub-rodape logo depois de </main>`);
  }
}

/** Itens do aviso: série, selo, capa e ícone (função serializada para a página). */
function lerAviso(seletor) {
  return Array.from(document.querySelectorAll(`${seletor} a.blog-novidade__item`)).map((a) => {
    const capa = a.querySelector('.blog-novidade__capa');
    const svg = capa && capa.querySelector('svg.blog-novidade__icone');
    const use = svg && svg.querySelector('use');
    const rc = capa ? capa.getBoundingClientRect() : { width: 0, height: 0 };
    const rs = svg ? svg.getBoundingClientRect() : { width: 0 };
    const estilo = getComputedStyle(a);
    const est = capa ? getComputedStyle(capa) : null;
    const selo = a.querySelector('.blog-novidade__selo');
    let desenhado = 0;
    try { desenhado = use ? use.getBBox().width : 0; } catch (e) { desenhado = 0; }
    return {
      href: a.getAttribute('href'), serie: a.getAttribute('data-serie'), texto: a.textContent,
      selo: selo ? selo.textContent.trim() : '', alturaItem: a.getBoundingClientRect().height,
      larguraUtil: a.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight),
      capa: capa ? { oculta: capa.getAttribute('aria-hidden'), w: rc.width, h: rc.height, fundo: est.backgroundColor, cor: est.color } : null,
      icone: use ? use.getAttribute('href') : null, svgW: rs.width, desenhado,
    };
  });
}

async function aviso(app, tema, largura) {
  const onde = `entrada ${tema === 'dark' ? 'escuro' : 'claro'}/${largura}`;
  console.log(`\n▶ ${onde}`);
  const esperado = novidade.escolherNovidades(app.blog.indice, 1)[0];
  const { page, erros, respostas, fechar } = await app.abrir('', { tema, largura, altura: largura < 600 ? 812 : 800 });
  try {
    await page.waitForSelector('[data-blog-novidade="1"]:not([hidden])', { timeout: 8000 }).catch(() => null);
    const itens = await page.evaluate(lerAviso, '[data-blog-novidade="1"]');
    const it = itens[0];
    v.confere(itens.length === 1 && it.href === esperado.href, `${onde}: 1 publicação (${esperado.slug})`);
    if (!it) return;
    v.confere(it.serie === esperado.serie, `${onde}: item com data-serie="${esperado.serie}" (achou ${it.serie})`);
    v.confere(it.capa && it.capa.oculta === 'true', `${onde}: miniatura .blog-novidade__capa decorativa (aria-hidden="true")`);
    v.confere(it.icone === SPRITE + esperado.icone, `${onde}: ícone ${SPRITE}${esperado.icone} (achou ${it.icone})`);
    v.confere(it.capa && Math.abs(it.capa.w - 64) <= 1 && Math.abs(it.capa.h - 64) <= 1, `${onde}: miniatura 64x64 (achou ${it.capa ? `${Math.round(it.capa.w)}x${Math.round(it.capa.h)}` : '-'})`);
    v.confere(it.svgW >= 24 && it.desenhado > 0, `${onde}: ícone desenhado (svg ${Math.round(it.svgW)} px, bbox ${Math.round(it.desenhado)})`);
    v.confere(respostas.some((r) => r.url.endsWith('/blog/icones.svg') && r.status === 200), `${onde}: /blog/icones.svg carregado (200)`);
    v.confere(!/\bDo blog\b/.test(it.texto), `${onde}: sem o selo escrito "Do blog"`);
    v.confere(it.selo === '' || it.selo === 'Nova publicação no blog', `${onde}: selo vazio ou "Nova publicação no blog" (achou "${it.selo}")`);
    v.confere(it.alturaItem >= 44, `${onde}: item com alvo de toque >= 44 px (${Math.round(it.alturaItem)})`);
    if (esperado.serie === 'campanhas') {
      v.confere(!!it.capa && it.capa.fundo === ROSA[tema].fundo && it.capa.cor === ROSA[tema].cor, `${onde}: laço em rosa discreto (${it.capa ? `${it.capa.fundo} / ${it.capa.cor}` : 'sem capa'})`);
    }
    if (it.capa) v.confere(v.contraste(it.capa.cor, it.capa.fundo) >= 4.5, `${onde}: contraste do ícone ${v.contraste(it.capa.cor, it.capa.fundo).toFixed(2)}:1 (>= 4,5)`);
    v.confere((await page.evaluate(() => window.__csp)).length === 0 && erros.length === 0, `${onde}: sem CSP violada nem erro de JS (${erros.join(' | ')})`);
    const alvo = page.locator('[data-blog-novidade="1"]');
    if (await alvo.count()) await alvo.screenshot({ path: v.captura(`aviso-${tema === 'dark' ? 'escuro' : 'claro'}-${largura}`) });
  } finally {
    await fechar();
  }
}

async function ligaBlog(app, tema, largura) {
  const onde = `/liga ${tema === 'dark' ? 'escuro' : 'claro'}/${largura}`;
  console.log(`\n▶ ${onde}`);
  const esperados = novidade.escolherNovidades(app.blog.indice, 3);
  const { page, erros, fechar } = await app.abrir('liga.html', { tema, largura, altura: largura < 600 ? 812 : 800 });
  try {
    await page.waitForSelector('[data-blog-novidade="3"]:not([hidden])', { timeout: 8000 }).catch(() => null);
    const itens = await page.evaluate(lerAviso, '[data-blog-novidade="3"]');
    v.confere(itens.length === 3, `${onde}: 3 cartões "Do blog" (achou ${itens.length})`);
    itens.forEach((it, i) => {
      const e = esperados[i];
      v.confere(it.icone === SPRITE + e.icone && it.serie === e.serie, `${onde}: cartão ${i + 1} (${e.slug}) com ícone ${e.icone} e data-serie ${e.serie} (achou ${it.icone}, ${it.serie})`);
      v.confere(it.capa && it.capa.w >= it.larguraUtil - 2 && it.capa.h >= 96, `${onde}: cartão ${i + 1} com imagem de capa larga (${it.capa ? `${Math.round(it.capa.w)}x${Math.round(it.capa.h)}` : '-'}; mín. ${Math.round(it.larguraUtil)}x96)`);
      v.confere(it.desenhado > 0, `${onde}: cartão ${i + 1} com ícone desenhado`);
      if (e.serie === 'campanhas') v.confere(!!it.capa && it.capa.fundo === ROSA[tema].fundo && it.capa.cor === ROSA[tema].cor, `${onde}: cartão da campanha em rosa discreto`);
      if (it.capa) v.confere(v.contraste(it.capa.cor, it.capa.fundo) >= 3, `${onde}: cartão ${i + 1}, contraste do ícone ${v.contraste(it.capa.cor, it.capa.fundo).toFixed(2)}:1 (>= 3)`);
    });
    v.confere((await page.evaluate(() => window.__csp)).length === 0 && erros.length === 0, `${onde}: sem CSP violada nem erro de JS (${erros.join(' | ')})`);
    await page.evaluate(() => { const b = document.querySelector('.lp-secoes'); if (b) b.style.position = 'static'; });
    await page.locator('#blog').screenshot({ path: v.captura(`liga-blog-${tema === 'dark' ? 'escuro' : 'claro'}-${largura}`) });
  } finally {
    await fechar();
  }
}

/** Rodapé: posição, links, alvos e (nos posts) a barra flutuante sem cobrir os links. */
function lerRodape() {
  const footers = document.querySelectorAll('footer.pub-rodape');
  const f = footers[0];
  const main = document.querySelector('main');
  const contatos = document.querySelectorAll('.blog-contato');
  const ultimoContato = contatos[contatos.length - 1];
  const links = f ? Array.from(f.querySelectorAll('a')).map((a) => ({ href: a.getAttribute('href'), texto: a.textContent.trim(), h: a.getBoundingClientRect().height })) : [];
  return {
    total: footers.length,
    depoisDoMain: !!(main && main.nextElementSibling === f),
    topo: f ? f.getBoundingClientRect().top + scrollY : 0,
    fimContato: ultimoContato ? ultimoContato.getBoundingClientRect().bottom + scrollY : null,
    borda: f ? parseFloat(getComputedStyle(f).borderTopWidth) : 0,
    links,
    transborda: document.scrollingElement.scrollWidth - window.innerWidth,
  };
}

async function rodape(app, caminho, tema, largura) {
  const onde = `${caminho} ${tema === 'dark' ? 'escuro' : 'claro'}/${largura}`;
  console.log(`\n▶ ${onde}`);
  const { page, erros, fechar } = await app.abrir(caminho, { tema, largura, altura: largura < 600 ? 812 : 800 });
  try {
    const s = await page.evaluate(lerRodape);
    v.confere(s.total === 1 && s.depoisDoMain, `${onde}: um footer.pub-rodape logo depois de <main> (achou ${s.total})`);
    v.confere(s.borda >= 1, `${onde}: estilo do rodapé de publico.css aplicado (borda superior ${s.borda} px)`);
    if (s.fimContato !== null) v.confere(s.fimContato <= s.topo, `${onde}: rodapé abaixo de "Fale com a Liga"`);
    const pares = s.links.map((l) => [l.href, l.texto]);
    v.confere(JSON.stringify(pares) === JSON.stringify(LINKS_RODAPE), `${onde}: 6 links do rodapé, absolutos e na ordem (${pares.map((p) => p[0]).join(' ')})`);
    v.confere(s.links.length > 0 && s.links.every((l) => l.h >= 44), `${onde}: links do rodapé com alvo >= 44 px`);
    v.confere(s.transborda <= 0, `${onde}: sem rolagem horizontal`);
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(400);
    const cobre = await page.evaluate(() => {
      const barra = document.querySelector('.blog-barra.blog-barra--visivel');
      if (!barra) return [];
      const b = barra.getBoundingClientRect();
      return Array.from(document.querySelectorAll('footer.pub-rodape a')).filter((a) => {
        const r = a.getBoundingClientRect();
        return r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
      }).map((a) => a.textContent.trim());
    });
    v.confere(cobre.length === 0, `${onde}: barra flutuante do post não cobre os links do rodapé (${cobre.join(', ') || 'ok'})`);
    v.confere((await page.evaluate(() => window.__csp)).length === 0 && erros.length === 0, `${onde}: sem CSP violada nem erro de JS (${erros.join(' | ')})`);
    const foot = page.locator('footer.pub-rodape');
    if (await foot.count()) {
      const caixaContato = await v.caixa(page, '.blog-contato:last-of-type');
      const caixaFoot = await v.caixa(page, 'footer.pub-rodape');
      const y0 = Math.max(0, (caixaContato ? caixaContato.y : caixaFoot.y) - 16);
      const nome = `rodape-${caminho.replace(/[/.]/g, '-').replace(/-html$/, '')}-${tema === 'dark' ? 'escuro' : 'claro'}-${largura}`;
      await page.screenshot({ path: v.captura(nome), fullPage: true, clip: { x: 0, y: y0, width: largura, height: caixaFoot.b - y0 + 8 } });
    }
  } finally {
    await fechar();
  }
}

(async () => {
  const app = await v.iniciar();
  try {
    estaticos(app);
    await aviso(app, 'light', 375);
    await aviso(app, 'dark', 375);
    await aviso(app, 'light', 1280);
    await ligaBlog(app, 'light', 375);
    await ligaBlog(app, 'light', 1280);
    await ligaBlog(app, 'dark', 1280);
    await rodape(app, 'blog.html', 'light', 375);
    await rodape(app, 'blog.html', 'dark', 1280);
    await rodape(app, 'blog/outubro-rosa-2026.html', 'light', 375);
    await rodape(app, 'blog/bem-vindo-a-laift.html', 'dark', 375);
    await rodape(app, 'blog/404.html', 'light', 1280);
  } finally {
    await app.fechar();
  }
  v.concluir('S2 blog');
})().catch((e) => { console.error(e); process.exitCode = 1; });
