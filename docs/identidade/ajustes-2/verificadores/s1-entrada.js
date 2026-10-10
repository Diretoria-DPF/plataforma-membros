/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificador da ficha S1 (tela de entrada em cartões, sem a Lia do hero).
// Uso, a partir da RAIZ do worktree: node docs/identidade/ajustes-2/verificadores/s1-entrada.js
// Gera as capturas entrada-*.png em docs/identidade/ajustes-2/capturas/ (portão visual do dono).
'use strict';

const fs = require('fs');
const path = require('path');
const v = require('./comum');

const FLAGS_ON = { ux_v2_enabled: true, chatbot_enabled: true, selection_open: true };
const CENARIOS = [
  { tema: 'light', slug: 'claro', largura: 375, altura: 812 },
  { tema: 'dark', slug: 'escuro', largura: 375, altura: 812 },
  { tema: 'light', slug: 'claro', largura: 1280, altura: 800 },
  { tema: 'dark', slug: 'escuro', largura: 1280, altura: 800 },
];
const SEPARACAO_PX = 12;

function estaticos() {
  console.log('\n▶ fonte');
  const html = v.lerFonte('index.html');
  v.confere(!html.includes('hero-lia') && !html.includes('src="hero.js"'), 'index.html sem #hero-lia e sem hero.js');
  v.confere(!/conheça a plataforma/i.test(html), 'index.html sem "Blog: conheça a plataforma"');
  v.confere(html.includes('<section id="screen-welcome" class="auth-pilha"'), 'index.html: <section id="screen-welcome" class="auth-pilha"');
  v.confere(!v.lerFonte('scripts/build.js').includes("'hero.js'"), "scripts/build.js sem 'hero.js'");
  v.confere(!v.lerFonte('sw.js').includes("'hero.js'"), "sw.js sem 'hero.js' no PRECACHE");
  const ux = v.lerFonte('ux.css');
  v.confere(!/\.hero\b/.test(ux), 'ux.css sem regras .hero');
  v.confere(ux.includes('.auth-pilha') && ux.includes('.welcome-liga__botao'), 'ux.css com .auth-pilha e .welcome-liga__botao');
  v.confere(!/prefers-reduced-motion:\s*reduce/.test(ux), 'ux.css sem @media (prefers-reduced-motion: reduce) (o bloco único fica em laift-tokens.css)');
  const teste = fs.existsSync(path.join(v.FRONT, 'scripts', 'entrada.test.mjs')) ? v.lerFonte('scripts/entrada.test.mjs') : '';
  const e2e = fs.existsSync(path.join(v.FRONT, 'scripts', 'e2e', 'entrada.e2e.js')) ? v.lerFonte('scripts/e2e/entrada.e2e.js') : '';
  v.confere(/\btest\(/.test(teste) && teste.includes('Acessar blog') && teste.includes('hero'), 'scripts/entrada.test.mjs com testes de verdade (textos do dono e ausência do hero)');
  v.confere(e2e.includes('lia-launcher') && e2e.includes('Acessar blog') && e2e.includes('module.exports'), 'scripts/e2e/entrada.e2e.js confere botões e a Lia flutuante');
  v.confere(!v.lerFonte('styles.css').includes('.welcome-liga'), 'styles.css sem .welcome-liga (regras migraram para ux.css)');
  for (const morto of ['hero.js', 'scripts/hero.test.mjs', 'scripts/e2e/hero-ux2.e2e.js']) {
    v.confere(!fs.existsSync(path.join(v.FRONT, morto)), `${morto} removido`);
  }
  v.confere(fs.existsSync(path.join(v.FRONT, 'scripts', 'e2e', 'entrada.e2e.js')), 'scripts/e2e/entrada.e2e.js existe');
  v.confere(fs.existsSync(path.join(v.FRONT, 'scripts', 'entrada.test.mjs')), 'scripts/entrada.test.mjs existe');
}

/** Estado da tela de entrada (função serializada para a página). */
function lerTela() {
  const tela = document.getElementById('screen-welcome');
  const q = (s) => document.querySelector(s);
  const botoes = Array.from(document.querySelectorAll('#screen-welcome .welcome-liga__botao'));
  const nav = q('#screen-welcome > nav.welcome-liga');
  const navEstilo = nav ? getComputedStyle(nav) : null;
  const larguraUtil = nav ? nav.clientWidth - parseFloat(navEstilo.paddingLeft) - parseFloat(navEstilo.paddingRight) : 0;
  const cartoes = tela ? Array.from(tela.children).filter((el) => el.classList.contains('auth-card')) : [];
  return {
    visivel: !!tela && !tela.classList.contains('hidden') && tela.getBoundingClientRect().height > 0,
    h1: tela ? Array.from(tela.querySelectorAll('h1')).map((h) => h.textContent.trim()) : [],
    hero: document.querySelectorAll('#hero-lia, #screen-welcome .hero, #screen-welcome .lia, #screen-welcome svg.lia-svg').length,
    cartoes: cartoes.map((c) => c.tagName.toLowerCase() + (c.classList.contains('welcome-liga') ? '.welcome-liga' : '')),
    loginCompleto: !!(cartoes[0] && cartoes[0].querySelector('#form-login') && cartoes[0].querySelector('[data-nav="screen-register"]')
      && cartoes[0].querySelector('[data-nav="screen-forgot"]')),
    botoes: botoes.map((b) => {
      const r = b.getBoundingClientRect();
      return { texto: b.textContent.trim(), href: b.getAttribute('href'), classe: b.className, w: r.width, h: r.height };
    }),
    larguraUtil,
    aviso: (() => { const a = q('.welcome-liga__aviso'); return a && a.getBoundingClientRect().height > 0 ? a.textContent.trim() : ''; })(),
    textoAntigo: /conheça a plataforma/i.test(document.body.innerText),
    transborda: document.scrollingElement.scrollWidth - window.innerWidth,
    csp: window.__csp || [],
  };
}

async function cenario(app, c, flags, nomeCaptura) {
  const onde = `${c.slug}/${c.largura}${flags === FLAGS_ON ? '' : ' (flags desligadas)'}`;
  console.log(`\n▶ ${onde}`);
  const { page, erros, fechar } = await app.abrir('', { ...c, flags });
  try {
    if (flags.chatbot_enabled) await page.waitForSelector('#lia-launcher:not(.hidden)', { timeout: 8000 }).catch(() => null);
    const s = await page.evaluate(lerTela);
    v.confere(s.visivel, `${onde}: #screen-welcome visível`);
    v.confere(s.hero === 0, `${onde}: nenhuma Lia dentro da tela de entrada (achou ${s.hero})`);
    v.confere(s.h1.length === 1 && s.h1[0] === 'Entrar', `${onde}: um h1 "Entrar" (achou ${JSON.stringify(s.h1)})`);
    v.confere(s.cartoes.length === 2 && s.cartoes[0] === 'div' && s.cartoes[1] === 'nav.welcome-liga', `${onde}: cartões div.auth-card + nav.auth-card.welcome-liga (achou ${JSON.stringify(s.cartoes)})`);
    v.confere(s.loginCompleto, `${onde}: cartão de login com formulário, Criar conta e Esqueci minha senha`);
    const liga = s.botoes.find((b) => /welcome-liga__link/.test(b.classe));
    const blog = s.botoes.find((b) => /welcome-liga__blog/.test(b.classe));
    v.confere(s.botoes.length === 2 && liga && liga.texto === 'Conheça a LAIFT' && liga.href === 'liga.html', `${onde}: botão "Conheça a LAIFT" → liga.html`);
    v.confere(blog && blog.texto === 'Acessar blog' && blog.href === 'blog.html', `${onde}: botão "Acessar blog" → blog.html`);
    for (const b of s.botoes) {
      v.confere(b.h >= 56 && b.w >= s.larguraUtil - 2, `${onde}: "${b.texto}" com ${Math.round(b.w)}x${Math.round(b.h)} px (mín. ${Math.round(s.larguraUtil)}x56)`);
    }
    v.confere(!s.textoAntigo, `${onde}: sem o texto "conheça a plataforma"`);
    v.confere(s.transborda <= 0, `${onde}: sem rolagem horizontal (${s.transborda} px)`);
    v.confere(s.aviso === '', `${onde}: sem o título "Processo seletivo aberto" sobre os botões (achou "${s.aviso}")`);
    const login = await v.caixa(page, '#screen-welcome > .auth-card:first-child');
    const nav = await v.caixa(page, '#screen-welcome > nav.welcome-liga');
    const faixa = await v.caixa(page, '#screen-welcome > .blog-novidade--faixa');
    v.confere(faixa !== null, `${onde}: cartão da publicação visível`);
    v.confere(!v.cruzam(login, nav, SEPARACAO_PX - 0.5) && !v.cruzam(nav, faixa, SEPARACAO_PX - 0.5) && !v.cruzam(login, faixa, SEPARACAO_PX - 0.5),
      `${onde}: login, atalhos e publicação separados por >= ${SEPARACAO_PX} px`);
    if (c.largura >= 960) {
      v.confere(login && nav && faixa && nav.x >= login.d + SEPARACAO_PX - 0.5 && Math.abs(faixa.x - nav.x) < 1 && faixa.y >= nav.b + SEPARACAO_PX - 0.5,
        `${onde}: desktop em duas colunas (login à esquerda; atalhos e publicação à direita)`);
    } else {
      v.confere(login && nav && faixa && nav.y >= login.b && faixa.y >= nav.b, `${onde}: celular em coluna (login, atalhos, publicação)`);
    }
    if (flags.chatbot_enabled) {
      await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
      await page.waitForTimeout(250);
      const lancador = await page.evaluate(() => { const r = document.getElementById('lia-launcher')?.getBoundingClientRect(); return r && r.width ? { x: r.left, y: r.top, d: r.right, b: r.bottom } : null; });
      const alvos = await page.evaluate(() => Array.from(document.querySelectorAll('#form-login button[type="submit"], .welcome-liga__botao, .blog-novidade--faixa .blog-novidade__item'))
        .map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, d: r.right, b: r.bottom, nome: el.textContent.trim().slice(0, 24) }; }));
      v.confere(lancador !== null, `${onde}: botão flutuante da Lia visível embaixo`);
      const cobertos = alvos.filter((a) => v.cruzam(lancador, a)).map((a) => a.nome);
      v.confere(cobertos.length === 0, `${onde}: no fim da rolagem a Lia flutuante não cobre botões nem a publicação (${cobertos.join(' | ') || 'nada coberto'})`);
      await page.evaluate(() => window.scrollTo(0, 0));
    } else {
      v.confere(await page.locator('#lia-launcher:not(.hidden)').count() === 0, `${onde}: sem chatbot, sem botão da Lia`);
    }
    v.confere(s.csp.length === 0, `${onde}: sem violação de CSP (${s.csp.join(' | ')})`);
    v.confere(erros.length === 0, `${onde}: sem erro de JavaScript (${erros.join(' | ')})`);
    await page.screenshot({ path: v.captura(nomeCaptura), fullPage: true });
  } finally {
    await fechar();
  }
}

async function movimentoReduzido(app) {
  const onde = 'escuro/375 (movimento reduzido)';
  console.log(`\n▶ ${onde}`);
  const { page, fechar } = await app.abrir('', { tema: 'dark', largura: 375, altura: 812, reduzido: true, flags: FLAGS_ON });
  try {
    const rodando = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running'
      && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#screen-welcome')).length);
    v.confere(rodando === 0, `${onde}: nenhuma animação rodando na tela de entrada (${rodando})`);
  } finally {
    await fechar();
  }
}

async function acessibilidade(app) {
  const onde = 'claro/375 (axe)';
  console.log(`\n▶ ${onde}`);
  const { page, fechar } = await app.abrir('', { tema: 'light', largura: 375, altura: 812, flags: FLAGS_ON });
  try {
    const serios = (await v.axeSerio(page)).filter((t) => /screen-welcome|welcome-liga|blog-novidade|auth-/.test(t));
    v.confere(serios.length === 0, `${onde}: sem violação axe séria/crítica na tela de entrada (${serios.join(' ; ')})`);
  } finally {
    await fechar();
  }
}

(async () => {
  estaticos();
  const app = await v.iniciar();
  try {
    for (const c of CENARIOS) await cenario(app, c, FLAGS_ON, `entrada-${c.slug}-${c.largura}`);
    await cenario(app, CENARIOS[0], {}, 'entrada-claro-375-sem-flags');
    await movimentoReduzido(app);
    await acessibilidade(app);
  } finally {
    await app.fechar();
  }
  v.concluir('S1 entrada');
})().catch((e) => { console.error(e); process.exitCode = 1; });
