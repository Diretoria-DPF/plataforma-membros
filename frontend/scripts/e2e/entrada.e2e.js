/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * entrada.e2e.js — tela de entrada (#screen-welcome) em cartões, sem a Lia do hero.
 * Substitui hero-ux2.e2e.js (apagado). Roda sobre o BUILD (frontend/dist/), sem login.
 * Cenários: claro e escuro em 375x812 e 1280x800 com as flags ligadas; 375 claro com as flags
 * desligadas; 375 escuro com movimento reduzido. Fotos: .shots/entrada-<tema>-<largura>x<altura>.png.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const SHOTS_DIR = path.join(__dirname, '.shots');
const FLAGS_ON = { ux_v2_enabled: true, chatbot_enabled: true, feedback_enabled: true, selection_open: true };
const FLAGS_OFF = {};
const CENARIOS = [
  { tema: 'claro', esquema: 'light', largura: 375, altura: 812 },
  { tema: 'escuro', esquema: 'dark', largura: 375, altura: 812 },
  { tema: 'claro', esquema: 'light', largura: 1280, altura: 800 },
  { tema: 'escuro', esquema: 'dark', largura: 1280, altura: 800 },
];
const ALTURA_MINIMA_BOTAO_PX = 56;
const SEPARACAO_PX = 12;
const LARGURA_DUAS_COLUNAS_PX = 960;
const SELETOR_LIA_NA_TELA = '#hero-lia, #screen-welcome .hero, #screen-welcome .lia, #screen-welcome svg.lia-svg';

/** Leituras da tela de entrada (função autocontida: é serializada para a página). */
function lerTela(seletorLia) {
  const tela = document.getElementById('screen-welcome');
  const nav = document.querySelector('#screen-welcome > nav.welcome-liga');
  const cartoes = tela ? Array.from(tela.children).filter((el) => el.classList.contains('auth-card')) : [];
  const caixa = (el) => {
    if (!el || el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, d: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const estilo = nav ? getComputedStyle(nav) : null;
  const aviso = document.querySelector('.welcome-liga__aviso');
  return {
    visivel: !!tela && !tela.classList.contains('hidden') && tela.getBoundingClientRect().height > 0,
    h1: tela ? Array.from(tela.querySelectorAll('h1')).map((h) => h.textContent.trim()) : [],
    liaNaTela: document.querySelectorAll(seletorLia).length,
    blocos: cartoes.map((c) => c.tagName.toLowerCase() + (c.classList.contains('welcome-liga') ? '.welcome-liga' : '')),
    botoes: Array.from(document.querySelectorAll('#screen-welcome .welcome-liga__botao')).map((b) => ({
      texto: b.textContent.trim(), href: b.getAttribute('href'), classe: b.className, ...caixa(b),
    })),
    larguraUtil: nav ? nav.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight) : 0,
    login: caixa(document.querySelector('#screen-welcome > .auth-card:first-child')),
    atalhos: caixa(nav),
    publicacao: caixa(document.querySelector('#screen-welcome > .blog-novidade--faixa')),
    aviso: aviso && aviso.getBoundingClientRect().height > 0 ? aviso.textContent.trim() : '',
    transborda: document.scrollingElement.scrollWidth - window.innerWidth,
  };
}

/** Lia flutuante e alvos que ela pode cobrir (chamada com a rolagem no fim). */
function lerLiaNoFimDaRolagem() {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, d: b.right, b: b.bottom };
  };
  const lancador = document.getElementById('lia-launcher');
  const visivel = !!lancador && lancador.getBoundingClientRect().width > 0;
  const seletorAlvos = '#form-login button[type="submit"], .welcome-liga__botao, .blog-novidade--faixa .blog-novidade__item';
  return {
    lancador: visivel ? r(lancador) : null,
    alvos: Array.from(document.querySelectorAll(seletorAlvos))
      .map((el) => ({ nome: (el.textContent || '').trim().slice(0, 30), ...r(el) })),
  };
}

/** Sobreposição de duas caixas; a margem aumenta as duas para medir a folga mínima. */
function cruzam(a, b, margem = 0) {
  return !!a && !!b && a.x - margem < b.d && b.x - margem < a.d && a.y - margem < b.b && b.y - margem < a.b;
}

function handlersDeFlags(flags) {
  return { apiGetFeatureFlags: () => ({ success: true, flags }) };
}

/** Abre a tela de entrada, sem login, e espera ela aparecer. Vigia violações de CSP desde o início. */
async function abrirEntrada(app, { esquema, reduzido = false, comLia = false }) {
  await app.context.addInitScript(() => {
    window.__cspViolacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolacoes.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  await app.page.emulateMedia({ colorScheme: esquema, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
  await app.page.goto(app.baseUrl);
  await app.page.waitForLoadState('networkidle');
  await app.page.waitForSelector('#screen-welcome:not(.hidden)', { timeout: 15000 });
  if (comLia) await app.page.waitForSelector('#lia-launcher:not(.hidden)', { timeout: 8000 }).catch(() => null);
}

/** Login: formulário e os dois links dentro do cartão, visíveis. */
async function verificarLogin(page, rotulo) {
  const cartao = page.locator('#screen-welcome > .auth-card').first();
  check((await cartao.locator('#form-login').count()) === 1, `${rotulo}: cartão de login com o formulário`);
  for (const [nome, seletor] of [['Criar conta', '[data-nav="screen-register"]'], ['Esqueci minha senha', '[data-nav="screen-forgot"]']]) {
    const link = cartao.locator(seletor).first();
    const visivel = (await link.count()) > 0 && (await link.isVisible());
    const texto = visivel ? (await link.innerText()).trim() : '';
    check(visivel && texto.includes(nome), `${rotulo}: "${nome}" visível dentro do cartão de login (achou "${texto}")`);
  }
}

/** Três blocos separados: login, atalhos e publicação. Duas colunas no desktop; uma coluna no celular. */
function verificarBlocos(s, rotulo, largura) {
  const { login, atalhos, publicacao } = s;
  check(!!login && !!atalhos && !!publicacao, `${rotulo}: cartões de login, atalhos e publicação visíveis`);
  if (!login || !atalhos || !publicacao) return;
  const folga = SEPARACAO_PX - 0.5;
  const separados = !cruzam(login, atalhos, folga) && !cruzam(atalhos, publicacao, folga) && !cruzam(login, publicacao, folga);
  check(separados, `${rotulo}: login, atalhos e publicação separados por ${SEPARACAO_PX} px`);
  if (largura >= LARGURA_DUAS_COLUNAS_PX) {
    const duasColunas = atalhos.x >= login.d + folga && Math.abs(publicacao.x - atalhos.x) < 1 && publicacao.y >= atalhos.b + folga;
    check(duasColunas, `${rotulo}: desktop em duas colunas (login à esquerda; atalhos e publicação à direita)`);
  } else {
    check(atalhos.y >= login.b && publicacao.y >= atalhos.b, `${rotulo}: celular em coluna (login, atalhos, publicação)`);
  }
}

/** Conferências da tela: Lia fora do topo, cartões, botões, aviso, rolagem. */
async function verificarTela(page, s, rotulo, flags, largura) {
  check(s.visivel, `${rotulo}: tela de entrada visível`);
  check(s.liaNaTela === 0, `${rotulo}: nenhuma Lia no topo da tela de entrada (achou ${s.liaNaTela})`);
  check(s.h1.length === 1 && s.h1[0] === 'Entrar', `${rotulo}: um único h1 "Entrar" (achou ${JSON.stringify(s.h1)})`);
  check(JSON.stringify(s.blocos) === JSON.stringify(['div', 'nav.welcome-liga']),
    `${rotulo}: dois cartões, login (div) e atalhos (nav.welcome-liga) (achou ${JSON.stringify(s.blocos)})`);
  const liga = s.botoes.find((b) => b.classe.includes('welcome-liga__link'));
  const blog = s.botoes.find((b) => b.classe.includes('welcome-liga__blog'));
  check(s.botoes.length === 2 && !!liga && liga.texto === 'Conheça a LAIFT' && liga.href === 'liga.html',
    `${rotulo}: botão "Conheça a LAIFT" leva a liga.html`);
  check(!!blog && blog.texto === 'Acessar blog' && blog.href === 'blog.html', `${rotulo}: botão "Acessar blog" leva a blog.html`);
  for (const b of s.botoes) {
    const medida = `${Math.round(b.w)}x${Math.round(b.h)} px (largura útil ${Math.round(s.larguraUtil)} px)`;
    check(b.h >= ALTURA_MINIMA_BOTAO_PX && b.w >= s.larguraUtil - 2, `${rotulo}: "${b.texto}" com ${medida}`);
  }
  await verificarLogin(page, rotulo);
  check(s.aviso === '', `${rotulo}: sem o título "Processo seletivo aberto" sobre os botões (achou "${s.aviso}")`);
  check(s.transborda <= 0, `${rotulo}: sem rolagem horizontal (${s.transborda} px)`);
  verificarBlocos(s, rotulo, largura);
}

/** Com a rolagem no fim, a Lia flutuante não pode cobrir botões nem a publicação. */
async function verificarLiaNoFim(page, rotulo) {
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.waitForTimeout(250);
  const { lancador, alvos } = await page.evaluate(lerLiaNoFimDaRolagem);
  await page.evaluate(() => window.scrollTo(0, 0));
  check(lancador !== null, `${rotulo}: botão flutuante da Lia (#lia-launcher) visível`);
  const cobertos = alvos.filter((a) => cruzam(lancador, a)).map((a) => a.nome);
  check(lancador !== null && cobertos.length === 0,
    `${rotulo}: no fim da rolagem a Lia não cobre botões nem a publicação (${cobertos.join(' | ') || 'nada coberto'})`);
}

/** Violações de CSP e erros de JavaScript da página. */
async function verificarSaude(app, rotulo) {
  const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
  check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? ': ' + violacoes.join(' | ') : ''));
  check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
}

/** Cenário com as flags ligadas: claro e escuro, 375 e 1280. */
async function cenarioComFlags(cen) {
  const rotulo = `${cen.tema}/${cen.largura}x${cen.altura}`;
  console.log(`\n▶ ${rotulo}`);
  const app = await startApp({
    viewport: { width: cen.largura, height: cen.altura },
    workerHandlers: handlersDeFlags(FLAGS_ON),
  });
  try {
    await abrirEntrada(app, { esquema: cen.esquema, comLia: true });
    const s = await app.page.evaluate(lerTela, SELETOR_LIA_NA_TELA);
    await verificarTela(app.page, s, rotulo, FLAGS_ON, cen.largura);
    await verificarLiaNoFim(app.page, rotulo);
    await axeGate(app.page, `${rotulo}: axe`, { enforce: false });
    await verificarSaude(app, rotulo);
    await app.page.screenshot({ path: path.join(SHOTS_DIR, `entrada-${cen.tema}-${cen.largura}x${cen.altura}.png`), fullPage: true });
  } finally {
    await app.close();
  }
}

/** Flags desligadas (375 claro): sem botão da Lia, sem aviso, mesmos cartões. */
async function cenarioSemFlags() {
  const rotulo = 'claro/375x812 (flags desligadas)';
  console.log(`\n▶ ${rotulo}`);
  const app = await startApp({
    viewport: { width: 375, height: 812 },
    workerHandlers: handlersDeFlags(FLAGS_OFF),
  });
  try {
    await abrirEntrada(app, { esquema: 'light' });
    const s = await app.page.evaluate(lerTela, SELETOR_LIA_NA_TELA);
    await verificarTela(app.page, s, rotulo, FLAGS_OFF, 375);
    const lia = await app.page.locator('#lia-launcher:not(.hidden)').count();
    check(lia === 0, `${rotulo}: sem chatbot, sem botão da Lia (achou ${lia})`);
    await verificarSaude(app, rotulo);
    await app.page.screenshot({ path: path.join(SHOTS_DIR, 'entrada-claro-375x812-sem-flags.png'), fullPage: true });
  } finally {
    await app.close();
  }
}

/** Movimento reduzido (375 escuro): nenhuma animação rodando dentro da tela de entrada. */
async function movimentoReduzido() {
  const rotulo = 'escuro/375x812 (movimento reduzido)';
  console.log(`\n▶ ${rotulo}`);
  const app = await startApp({
    viewport: { width: 375, height: 812 },
    workerHandlers: handlersDeFlags(FLAGS_ON),
  });
  try {
    await abrirEntrada(app, { esquema: 'dark', reduzido: true, comLia: true });
    const rodando = await app.page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running'
      && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#screen-welcome')).length);
    check(rodando === 0, `${rotulo}: nenhuma animação rodando na tela de entrada (${rodando})`);
    await verificarSaude(app, rotulo);
  } finally {
    await app.close();
  }
}

module.exports = async function entrada() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const cen of CENARIOS) await cenarioComFlags(cen);
  await cenarioSemFlags();
  await movimentoReduzido();
};
