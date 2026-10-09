/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * navegacao.e2e.js — caminhos de navegação das páginas públicas e do app:
 * processo seletivo, edital, fluxo da Liga, atalhos /#cadastro e /#entrar,
 * o "Voltar" de cada módulo do app (membro e admin) e os ícones das páginas.
 * Roda sobre o BUILD (frontend/dist/). Cada cenário é independente: um erro
 * inesperado num cenário vira falha dele e não derruba os outros.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const FRONT = path.join(__dirname, '..', '..');
const CICLO = JSON.parse(fs.readFileSync(path.join(FRONT, 'liga-ciclo.json'), 'utf8'));
const ALVO_MINIMO_PX = 44;
const LARGURA_CELULAR = 375;
const TEMPO_ESPERA_MS = 4000;
const CABECALHO_ICO = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const SELETOR_FOCAVEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const LIMITE_X_VOLTAR_PUBLICO_CELULAR = 24;
const LIMITE_X_VOLTAR_PUBLICO_DESKTOP = 120;
const LIMITE_X_VOLTAR_APP_CELULAR = 40;
const LIMITE_X_VOLTAR_APP_DESKTOP = 80;
const PERGUNTAS_FAQ = [
  'Como se inscrever',
  'Quem pode participar?',
  'Quando são as inscrições?',
  'Quantas vagas há?',
  'Como acompanho o resultado?',
];
const PAGINAS_COM_ICONE = [
  'index.html',
  'liga.html',
  'processo-seletivo.html',
  'edital.html',
  'blog.html',
  'blog/bem-vindo-a-laift.html',
  'blog/404.html',
  'termos.html',
  'privacidade.html',
  '404.html',
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

/** Abre a página e espera a rede assentar (a consulta da flag termina antes). */
async function abrir(app, destino) {
  await app.page.goto(app.baseUrl + destino);
  await app.page.waitForLoadState('networkidle');
}

/** Checagens comuns a toda página pública: CSP, HTTP e JavaScript. Zera o que já foi visto. */
async function checarSaude(app, respostas, rotulo) {
  const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
  check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? ': ' + violacoes.join(' | ') : ''));
  check(respostas.length === 0, `${rotulo}: nenhum recurso com erro HTTP` + (respostas.length ? ': ' + respostas.join(' | ') : ''));
  check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  respostas.length = 0;
  app.errors.length = 0;
}

/** Espera o seletor ficar visível; devolve false em vez de lançar (o check registra a falha). */
function estaVisivel(page, seletor) {
  return page.waitForSelector(seletor, { state: 'visible', timeout: TEMPO_ESPERA_MS }).then(() => true, () => false);
}

/**
 * Altura medida com 2 casas. O Chromium devolve 43,99999237 para um botão de min-height 44 px
 * (erro de ponto flutuante); arredondar para centésimo mantém o limite de 44 px exato.
 */
function alturaMedida(valor) {
  return Math.round(valor * 100) / 100;
}

/** Clica com prazo curto: um alvo ausente ou coberto vira falha rápida, não espera de 30 s. */
function clicar(page, seletor) {
  return page.click(seletor, { timeout: TEMPO_ESPERA_MS });
}

/** Clica e espera a URL mudar para o padrão; devolve false se a navegação não acontecer. */
function irPara(page, acao, padraoUrl) {
  return Promise.all([
    page.waitForURL(padraoUrl, { timeout: TEMPO_ESPERA_MS }).then(() => true, () => false),
    acao(),
  ]).then(([chegou]) => chegou);
}

/** Roda um cenário isolado: erro inesperado vira falha dele, sem parar os outros. */
async function cenario(nome, fn) {
  try {
    await fn();
  } catch (err) {
    const linha = String((err && err.message) || err).split('\n')[0];
    check(false, `${nome}: erro inesperado: ${linha}`);
  }
}

/** Limite de x do "Voltar" público: 24 px no celular; no desktop, a coluna de 1120 px tem folga de até 120 px. */
function limiteDoVoltarPublico(largura) {
  return largura === LARGURA_CELULAR ? LIMITE_X_VOLTAR_PUBLICO_CELULAR : LIMITE_X_VOLTAR_PUBLICO_DESKTOP;
}

/**
 * Dentro do contêiner, o 1º elemento focável visível (ordem do DOM) é o botão "Voltar",
 * e nenhum focável visível na mesma linha fica à sua esquerda (o botão é o mais à esquerda).
 */
function voltarEhOPrimeiroFocavel(page, seletorContainer, seletorVoltar) {
  return page.evaluate(({ container, voltar, focaveis }) => {
    const raiz = document.querySelector(container);
    const alvo = raiz && raiz.querySelector(voltar);
    if (!raiz || !alvo) return { ok: false, motivo: 'contêiner ou botão ausente' };
    const visiveis = Array.from(raiz.querySelectorAll(focaveis)).filter((el) => el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden');
    const primeiro = visiveis[0];
    if (primeiro !== alvo) {
      const nome = primeiro ? (primeiro.textContent || primeiro.id || primeiro.tagName).trim().slice(0, 40) : 'nenhum';
      return { ok: false, motivo: `o primeiro focável é "${nome}"` };
    }
    const caixaAlvo = alvo.getBoundingClientRect();
    const aEsquerda = visiveis.filter((el) => {
      const caixa = el.getBoundingClientRect();
      return el !== alvo && Math.abs(caixa.top - caixaAlvo.top) < 20 && caixa.left < caixaAlvo.left - 1;
    });
    if (aEsquerda.length) return { ok: false, motivo: `${aEsquerda.length} focável(is) à esquerda na mesma linha` };
    return { ok: true, motivo: '' };
  }, { container: seletorContainer, voltar: seletorVoltar, focaveis: SELETOR_FOCAVEL });
}

/** Confere se o primeiro filho da tela é o botão "Voltar" da entrada (auth-voltar). */
function primeiroFilhoEhVoltar(page, seletorTela) {
  return page.evaluate((seletor) => {
    const tela = document.querySelector(seletor);
    const primeiro = tela && tela.firstElementChild;
    return !!primeiro && primeiro.matches('button.auth-voltar[data-nav="screen-welcome"]');
  }, seletorTela);
}

/* ---------- processo-seletivo.html ---------- */

/** Inscrições abertas: CTA com o link de liga-ciclo.json, em nova aba e com 44 px. */
async function verificarInscricaoAberta(page, rotulo) {
  const cta = page.locator('#liga-cta-inscricao');
  check(await cta.isVisible(), `${rotulo}: CTA "Participar do processo seletivo" visível`);
  check((await cta.getAttribute('href')) === CICLO.formularioUrl, `${rotulo}: CTA aponta para o formulário de liga-ciclo.json`);
  check((await cta.getAttribute('target')) === '_blank', `${rotulo}: CTA abre em nova aba`);
  const caixa = await cta.boundingBox();
  check(!!caixa && alturaMedida(caixa.height) >= ALVO_MINIMO_PX, `${rotulo}: CTA com altura >= ${ALVO_MINIMO_PX} px` + (caixa ? ` (${alturaMedida(caixa.height)} px)` : ''));
  check(!(await page.locator('.ps-cta__fechado').isVisible()), `${rotulo}: aviso de fechado escondido`);
}

/** Inscrições fechadas: CTA escondido e aviso de fechado visível. */
async function verificarInscricaoFechada(page, rotulo) {
  check(!(await page.locator('#liga-cta-inscricao').isVisible()), `${rotulo}: CTA de inscrição escondido`);
  check(await page.locator('.ps-cta__fechado').isVisible(), `${rotulo}: aviso "Inscrições fechadas no momento." visível`);
}

/** Datas e vagas têm de bater com liga-ciclo.json. */
async function verificarCiclo(page, rotulo) {
  const datas = await page.$$eval('[data-ciclo-data]', (els) => els.map((e) => [e.getAttribute('data-ciclo-data'), e.textContent.trim()]));
  const divergentes = datas.filter(([chave, texto]) => texto !== CICLO.datas[chave]);
  check(datas.length > 0 && divergentes.length === 0, `${rotulo}: [data-ciclo-data] iguais ao JSON` + (divergentes.length ? ': ' + divergentes.map(([c, t]) => `${c}="${t}"`).join(' | ') : ''));
  const vagas = await page.$$eval('[data-ciclo-vagas]', (els) => els.map((e) => e.textContent.trim()));
  check(vagas.length > 0 && vagas.every((v) => v === CICLO.vagas), `${rotulo}: [data-ciclo-vagas] igual ao JSON`);
}

/** FAQ: cinco perguntas com o texto do contrato, cada uma com 44 px; a 1ª abre a resposta. */
async function verificarFaq(page, rotulo) {
  const perguntas = await page.$$eval('.ps-faq__pergunta', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(perguntas) === JSON.stringify(PERGUNTAS_FAQ), `${rotulo}: 5 perguntas do FAQ na ordem do contrato` + (perguntas.length ? ': ' + perguntas.join(' | ') : ''));
  const alturas = await page.$$eval('.ps-faq__pergunta', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 100) / 100));
  check(alturas.length === PERGUNTAS_FAQ.length && alturas.every((h) => h >= ALVO_MINIMO_PX), `${rotulo}: cada pergunta do FAQ com altura >= ${ALVO_MINIMO_PX} px (${alturas.join(', ')})`);
  await page.locator('#faq-inscricao > summary').click();
  check(await page.locator('#faq-inscricao').evaluate((d) => d.open), `${rotulo}: clicar na 1ª pergunta abre a resposta`);
}

/**
 * "Voltar" da barra pública: aponta para `href`, fica no canto superior esquerdo (x <= limiteX,
 * y <= 24), tem 44 px de altura e é o 1º elemento focável da barra e o mais à esquerda.
 */
async function verificarVoltarNoCanto(page, rotulo, { href, limiteX }) {
  const voltar = page.locator('.pub-voltar').first();
  if ((await voltar.count()) === 0) {
    check(false, `${rotulo}: .pub-voltar presente na barra`);
    return;
  }
  check((await voltar.getAttribute('href')) === href, `${rotulo}: .pub-voltar aponta para ${href}`);
  const caixa = await voltar.boundingBox();
  check(!!caixa && caixa.x <= limiteX && caixa.y <= 24, `${rotulo}: .pub-voltar no canto superior esquerdo, x <= ${limiteX} px` + (caixa ? ` (x ${Math.round(caixa.x)}, y ${Math.round(caixa.y)})` : ''));
  check(!!caixa && alturaMedida(caixa.height) >= ALVO_MINIMO_PX, `${rotulo}: .pub-voltar com altura >= ${ALVO_MINIMO_PX} px`);
  const foco = await voltarEhOPrimeiroFocavel(page, 'header.pub-barra', '.pub-voltar');
  check(foco.ok, `${rotulo}: .pub-voltar é o 1º elemento focável da barra e o mais à esquerda` + (foco.ok ? '' : ` (${foco.motivo})`));
}

/** processo-seletivo.html com a flag ligada ou desligada, em 375 ou 1280 px. */
async function processoSeletivo(largura, altura, ligada) {
  const app = await startApp({ viewport: { width: largura, height: altura }, workerHandlers: workerComFlags({ selection_open: ligada }) });
  const respostas = [];
  const rotulo = `processo-seletivo.html ${largura}px, selection_open ${ligada ? 'ligada' : 'desligada'}`;
  try {
    await vigiar(app, respostas);
    await abrir(app, 'processo-seletivo.html');
    const { page } = app;
    if (ligada) await verificarInscricaoAberta(page, rotulo);
    else await verificarInscricaoFechada(page, rotulo);
    await verificarCiclo(page, rotulo);
    check(await page.locator('a[href="edital.html"]').first().isVisible(), `${rotulo}: link para edital.html visível`);
    await verificarVoltarNoCanto(page, rotulo, { href: 'liga.html', limiteX: limiteDoVoltarPublico(largura) });
    await verificarFaq(page, rotulo);
    if (largura === LARGURA_CELULAR) {
      const rolagem = await page.evaluate(() => document.documentElement.scrollWidth);
      check(rolagem <= LARGURA_CELULAR, `${rotulo}: sem rolagem horizontal (scrollWidth ${rolagem} px)`);
    }
    await axeGate(page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/* ---------- liga.html → processo-seletivo.html → liga.html ---------- */

/** Flag ligada: "Processo seletivo" leva ao processo e "Voltar" devolve à Liga. */
async function fluxoDaLiga() {
  const app = await startApp({ viewport: { width: 1280, height: 900 }, workerHandlers: workerComFlags({ selection_open: true }) });
  const respostas = [];
  const rotulo = 'fluxo liga.html → processo-seletivo.html → liga.html, selection_open ligada';
  try {
    await vigiar(app, respostas);
    await abrir(app, 'liga.html');
    const { page } = app;
    await verificarVoltarNoCanto(page, `${rotulo} (liga.html)`, { href: './', limiteX: limiteDoVoltarPublico(1280) });
    const ctaVisivel = await estaVisivel(page, '#liga-cta-processo');
    check(ctaVisivel, `${rotulo}: "Processo seletivo" visível em liga.html`);
    if (!ctaVisivel) return;
    const foi = await irPara(page, () => clicar(page, '#liga-cta-processo'), /\/processo-seletivo\.html$/);
    check(foi, `${rotulo}: clique em "Processo seletivo" leva a processo-seletivo.html`);
    await page.waitForLoadState('networkidle');
    await checarSaude(app, respostas, `${rotulo} (processo-seletivo.html)`);
    const voltou = await irPara(page, () => page.locator('.pub-voltar').first().click({ timeout: TEMPO_ESPERA_MS }), /\/liga\.html$/);
    check(voltou, `${rotulo}: "Voltar" devolve a liga.html`);
    await page.waitForLoadState('networkidle');
    await checarSaude(app, respostas, `${rotulo} (liga.html)`);
  } finally {
    await app.close();
  }
}

/* ---------- edital.html ---------- */

/** Sumário: 10 links, cada um com alvo existente na página. */
async function verificarSumarioDoEdital(page, rotulo) {
  const itens = await page.evaluate(() => Array.from(document.querySelectorAll('.ed-sumario__lista a')).map((a) => {
    const destino = a.getAttribute('href') || '';
    let existe = false;
    try { existe = destino.startsWith('#') && document.querySelector(destino) !== null; } catch (e) { existe = false; }
    return { destino, existe };
  }));
  const semAlvo = itens.filter((item) => !item.existe).map((item) => item.destino);
  check(itens.length === 10 && semAlvo.length === 0, `${rotulo}: 10 links do sumário com alvo existente` + (semAlvo.length ? ': sem alvo: ' + semAlvo.join(' ') : ` (${itens.length} links)`));
}

/** "Imprimir ou salvar em PDF" aparece e, no clique, chama window.print (espião em addInitScript). */
async function verificarImpressao(page, rotulo) {
  const botao = page.locator('[data-imprimir]');
  const visivel = await botao.isVisible();
  check(visivel, `${rotulo}: botão "Imprimir ou salvar em PDF" visível`);
  if (!visivel) return;
  await botao.click({ timeout: TEMPO_ESPERA_MS });
  const chamadas = await page.evaluate(() => window.__imprimirChamadas);
  check(chamadas === 1, `${rotulo}: clique em imprimir chama window.print (${chamadas} chamada(s))`);
}

/** Botão de inscrição: visível com a flag ligada, escondido com a flag desligada. */
async function verificarFormularioNoEdital(page, rotulo, ligada) {
  const formulario = page.locator('a[data-formulario]').first();
  const visivel = await formulario.isVisible();
  if (!ligada) {
    check(!visivel, `${rotulo}: botão de inscrição escondido`);
    return;
  }
  check(visivel, `${rotulo}: botão "Participar do processo seletivo" visível`);
  if (visivel) {
    check((await formulario.getAttribute('href')) === CICLO.formularioUrl, `${rotulo}: botão de inscrição aponta para o formulário de liga-ciclo.json`);
  }
}

/** edital.html em 375 ou 1280 px, com a flag ligada ou desligada. */
async function edital(largura, altura, ligada) {
  const app = await startApp({ viewport: { width: largura, height: altura }, workerHandlers: workerComFlags({ selection_open: ligada }) });
  const respostas = [];
  const rotulo = `edital.html ${largura}px, selection_open ${ligada ? 'ligada' : 'desligada'}`;
  try {
    await app.context.addInitScript(() => {
      window.__imprimirChamadas = 0;
      window.print = () => { window.__imprimirChamadas += 1; };
    });
    await vigiar(app, respostas);
    await abrir(app, 'edital.html');
    const { page } = app;
    check((await page.locator('h1').count()) === 1, `${rotulo}: exatamente 1 h1`);
    await verificarVoltarNoCanto(page, rotulo, { href: 'processo-seletivo.html', limiteX: limiteDoVoltarPublico(largura) });
    await verificarSumarioDoEdital(page, rotulo);
    await verificarImpressao(page, rotulo);
    await verificarFormularioNoEdital(page, rotulo, ligada);
    await axeGate(page, `${rotulo}: axe`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Com prefers-reduced-motion: reduce, nenhuma animação em execução no edital. */
async function movimentoReduzidoNoEdital() {
  const app = await startApp();
  const respostas = [];
  const rotulo = 'edital.html com prefers-reduced-motion: reduce';
  try {
    await vigiar(app, respostas);
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await abrir(app, 'edital.html');
    const emExecucao = await app.page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => a.animationName || a.transitionProperty || 'animação'));
    check(emExecucao.length === 0, `${rotulo}, nenhuma animação em execução` + (emExecucao.length ? ': ' + emExecucao.join(', ') : ''));
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/* ---------- atalhos de URL da tela de entrada ---------- */

/** /#cadastro abre o cadastro e o hash sai da URL; "Voltar" é o primeiro filho da tela. */
async function atalhoCadastro() {
  const app = await startApp();
  const respostas = [];
  const rotulo = 'atalho /#cadastro';
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + '#cadastro');
    await app.page.waitForLoadState('networkidle');
    const { page } = app;
    check(await estaVisivel(page, '#screen-register'), `${rotulo}: #screen-register visível`);
    check(new URL(page.url()).hash === '', `${rotulo}: o hash sai da URL`);
    check(await primeiroFilhoEhVoltar(page, '#screen-register'), `${rotulo}: "Voltar" é o primeiro filho de #screen-register`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** /#entrar abre o login com foco no e-mail; "Esqueci minha senha" abre a recuperação com "Voltar". */
async function atalhoEntrar() {
  const app = await startApp();
  const respostas = [];
  const rotulo = 'atalho /#entrar';
  try {
    await vigiar(app, respostas);
    await app.page.goto(app.baseUrl + '#entrar');
    await app.page.waitForLoadState('networkidle');
    const { page } = app;
    check(await estaVisivel(page, '#screen-welcome'), `${rotulo}: #screen-welcome visível`);
    const focoNoEmail = await page.evaluate(() => !!document.activeElement && document.activeElement.id === 'login-email');
    check(focoNoEmail, `${rotulo}: foco em #login-email`);
    await clicar(page, '#screen-welcome button[data-nav="screen-forgot"]');
    check(await estaVisivel(page, '#screen-forgot'), `${rotulo}: "Esqueci minha senha" abre #screen-forgot`);
    check(await primeiroFilhoEhVoltar(page, '#screen-forgot'), `${rotulo}: "Voltar" é o primeiro filho de #screen-forgot`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/* ---------- "Voltar" dentro do app ---------- */

/**
 * Painel de Propostas: o .app-voltar é o 1º filho, visível, com 44 px, x <= limiteX, é o 1º focável
 * do painel e o mais à esquerda, e o aria-label cita "Eventos".
 */
async function verificarVoltarDoPainel(page, rotulo, limiteX) {
  const voltar = page.locator('#panel-proposals > .app-voltar');
  if ((await voltar.count()) === 0) {
    check(false, `${rotulo}: .app-voltar presente em #panel-proposals`);
    return;
  }
  const primeiroEhVoltar = await page.evaluate(() => {
    const painel = document.getElementById('panel-proposals');
    const primeiro = painel && painel.firstElementChild;
    return !!primeiro && primeiro.classList.contains('app-voltar');
  });
  check(primeiroEhVoltar, `${rotulo}: .app-voltar é o primeiro filho de #panel-proposals`);
  check(await voltar.isVisible(), `${rotulo}: .app-voltar de #panel-proposals visível`);
  const caixa = await voltar.boundingBox();
  check(!!caixa && alturaMedida(caixa.height) >= ALVO_MINIMO_PX && caixa.x <= limiteX, `${rotulo}: .app-voltar com altura >= ${ALVO_MINIMO_PX} px e x <= ${limiteX} px` + (caixa ? ` (x ${Math.round(caixa.x)}, altura ${alturaMedida(caixa.height)})` : ''));
  const foco = await voltarEhOPrimeiroFocavel(page, '#panel-proposals', ':scope > .app-voltar');
  check(foco.ok, `${rotulo}: .app-voltar é o 1º elemento focável do painel e o mais à esquerda` + (foco.ok ? '' : ` (${foco.motivo})`));
  const rotuloAcessivel = (await voltar.getAttribute('aria-label')) || '';
  check(rotuloAcessivel.includes('Eventos'), `${rotulo}: aria-label do .app-voltar cita "Eventos" ("${rotuloAcessivel}")`);
}

/** Módulo "Aprender" aberto: o .app-voltar some e o "← Voltar" do módulo leva ao hub. */
async function verificarModuloAberto(app, rotulo) {
  const { page } = app;
  await app.openModule('farmaco');
  check(!(await page.locator('#panel-learn > .app-voltar').isVisible()), `${rotulo}: .app-voltar de #panel-learn escondido com módulo aberto`);
  const textoDoVoltar = ((await page.locator('#learn-back').textContent()) || '').trim();
  check(textoDoVoltar.includes('Voltar'), `${rotulo}: #learn-back com texto "Voltar" ("${textoDoVoltar}")`);
  await clicar(page, '#learn-back');
  check(await estaVisivel(page, '.learn-card[data-module="farmaco"]'), `${rotulo}: #learn-back devolve ao hub de módulos`);
  check(await estaVisivel(page, '#panel-learn > .app-voltar'), `${rotulo}: .app-voltar de #panel-learn visível de novo`);
}

/** Membro: "Voltar" de Propostas leva a Eventos, de Eventos leva ao Início; depois o módulo "Aprender". */
async function voltarNoApp(largura, altura) {
  const app = await startApp({ viewport: { width: largura, height: altura } });
  const respostas = [];
  const rotulo = `voltar no app, membro ${largura}×${altura}`;
  const limiteX = largura === LARGURA_CELULAR ? LIMITE_X_VOLTAR_APP_CELULAR : LIMITE_X_VOLTAR_APP_DESKTOP;
  try {
    await vigiar(app, respostas);
    await app.login();
    const { page } = app;
    check((await page.locator('#panel-home .app-voltar').count()) === 0, `${rotulo}: #panel-home sem .app-voltar`);
    await app.showPanel('panel-events');
    await app.showPanel('panel-proposals');
    await verificarVoltarDoPainel(page, rotulo, limiteX);
    await clicar(page, '#panel-proposals > .app-voltar');
    check(await estaVisivel(page, '#panel-events'), `${rotulo}: "Voltar" de #panel-proposals leva a #panel-events`);
    await clicar(page, '#panel-events > .app-voltar');
    check(await estaVisivel(page, '#panel-home'), `${rotulo}: "Voltar" de #panel-events leva a #panel-home`);
    await verificarModuloAberto(app, rotulo);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/** Admin: "Voltar" do painel de administração leva ao Início e devolve o menu de membro. */
async function voltarNoAdmin() {
  const app = await startApp({ role: 'admin' });
  const respostas = [];
  const rotulo = 'voltar no app, admin 1280×900';
  try {
    await vigiar(app, respostas);
    await app.login();
    const { page } = app;
    await clicar(page, '#btn-enter-admin-mode');
    check(await estaVisivel(page, '#panel-admin-dashboard'), `${rotulo}: #panel-admin-dashboard visível`);
    await clicar(page, '#panel-admin-dashboard > .app-voltar');
    check(await estaVisivel(page, '#panel-home'), `${rotulo}: "Voltar" do painel admin leva a #panel-home`);
    const menuDeMembro = await page.evaluate(() => {
      const nav = document.getElementById('nav-group-member');
      return !!nav && !nav.hidden && !nav.classList.contains('hidden');
    });
    check(menuDeMembro, `${rotulo}: #nav-group-member sem hidden`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

/* ---------- ícones ---------- */

/** Cada link[rel=icon] da página responde 200. */
async function verificarIconesDaPagina(app, pagina) {
  const { page } = app;
  const hrefs = await page.$$eval('link[rel=icon]', (els) => els.map((e) => e.getAttribute('href')));
  check(hrefs.length > 0, `${pagina}: tem link[rel=icon]`);
  for (const href of hrefs) {
    const resposta = await page.request.get(new URL(href, page.url()).href);
    check(resposta.status() === 200, `${pagina}: ícone ${href} responde 200` + (resposta.status() === 200 ? '' : ` (HTTP ${resposta.status()})`));
  }
}

/** Todas as páginas públicas têm ícone; /favicon.ico é um ICO de verdade (cabeçalho 00 00 01 00). */
async function icones() {
  const app = await startApp();
  const respostas = [];
  try {
    await vigiar(app, respostas);
    for (const pagina of PAGINAS_COM_ICONE) {
      await cenario(`${pagina}: ícone`, async () => {
        await abrir(app, pagina);
        await verificarIconesDaPagina(app, pagina);
        await checarSaude(app, respostas, pagina);
      });
    }
    await cenario('/favicon.ico', async () => {
      const resposta = await app.page.request.get(app.baseUrl + 'favicon.ico');
      const bytes = await resposta.body();
      const ehIco = bytes.subarray(0, 4).equals(CABECALHO_ICO);
      check(resposta.status() === 200 && ehIco, `GET /favicon.ico responde 200 com cabeçalho ICO (HTTP ${resposta.status()}, ${ehIco ? 'ICO' : 'não é ICO'})`);
    });
  } finally {
    await app.close();
  }
}

module.exports = async function navegacao() {
  await cenario('processo-seletivo 375px, ligada', () => processoSeletivo(375, 812, true));
  await cenario('processo-seletivo 1280px, ligada', () => processoSeletivo(1280, 900, true));
  await cenario('processo-seletivo 375px, desligada', () => processoSeletivo(375, 812, false));
  await cenario('fluxo da Liga', fluxoDaLiga);
  await cenario('edital 375px, ligada', () => edital(375, 812, true));
  await cenario('edital 1280px, ligada', () => edital(1280, 900, true));
  await cenario('edital 375px, desligada', () => edital(375, 812, false));
  await cenario('edital com movimento reduzido', movimentoReduzidoNoEdital);
  await cenario('atalho /#cadastro', atalhoCadastro);
  await cenario('atalho /#entrar', atalhoEntrar);
  await cenario('voltar do membro 375px', () => voltarNoApp(375, 812));
  await cenario('voltar do membro 1280px', () => voltarNoApp(1280, 900));
  await cenario('voltar do admin', voltarNoAdmin);
  await cenario('ícones', icones);
};
