/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liga.e2e.js — página pública da Liga (liga.html) e a faixa "Conheça a
 * LAIFT" da tela de entrada (index.html). Roda sobre o BUILD (frontend/dist/).
 *
 * A flag pública selection_open chega por apiGetFeatureFlags (o Worker é
 * simulado pelo harness). Sem a flag: status "fechado" e CTA escondido. Com a
 * flag e um formularioUrl válido em liga-ciclo.json: status "aberto" e CTA
 * com o link do formulário, em nova aba.
 *
 * A página da Liga é pública (sem login). Usa liga.html, não /liga: o servidor
 * local não faz o mapeamento de rotas.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const FRONT = path.join(__dirname, '..', '..');
const CICLO = JSON.parse(fs.readFileSync(path.join(FRONT, 'liga-ciclo.json'), 'utf8'));
const ALVO_MINIMO_PX = 44;
const AVISO_ABERTO = 'Processo seletivo aberto';
const AVISO_FECHADO = 'Inscrições fechadas no momento. Acompanhe @laift.liga.';
// Imagem da Lia que outra ficha cria: se ela ainda não existir, o 404 é ignorado.
const IMAGEM_OPCIONAL = 'lia-estatica.svg';

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

/** Checagens comuns a toda página do cenário: CSP, recursos e JavaScript. */
async function checarSaude(app, respostas, rotulo) {
  const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
  check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? ': ' + violacoes.join(' | ') : ''));
  const quebradas = respostas.filter((url) => !url.includes(IMAGEM_OPCIONAL));
  check(quebradas.length === 0, `${rotulo}: nenhum recurso com erro HTTP` + (quebradas.length ? ': ' + quebradas.join(' | ') : ''));
  check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
}

/** (a) Flag desligada: CTA escondido e status "fechado". */
async function verificarCtaFechado(page, rotulo) {
  const cta = page.locator('#liga-cta-inscricao');
  const status = page.locator('#liga-status');
  check(!(await cta.isVisible()), `${rotulo}: CTA de inscrição escondido`);
  check((await status.getAttribute('data-estado')) === 'fechado', `${rotulo}: status com data-estado="fechado"`);
  check((await status.textContent()).trim() === AVISO_FECHADO, `${rotulo}: texto do status é o de fechado`);
}

/** (b) Flag ligada: CTA visível com o link de liga-ciclo.json, em nova aba. */
async function verificarCtaAberto(page, rotulo) {
  const cta = page.locator('#liga-cta-inscricao');
  const status = page.locator('#liga-status');
  check(await cta.isVisible(), `${rotulo}: CTA de inscrição visível`);
  check((await cta.getAttribute('href')) === CICLO.formularioUrl, `${rotulo}: CTA aponta para o formulário de liga-ciclo.json`);
  check((await cta.getAttribute('target')) === '_blank', `${rotulo}: CTA abre em nova aba`);
  const estado = await status.getAttribute('data-estado');
  const texto = (await status.textContent()).trim();
  check(estado === 'aberto' && texto === AVISO_ABERTO, `${rotulo}: status "aberto" com o texto de processo aberto`);
}

/** (d) Todo link visível de .liga-cta mede pelo menos 44 px de altura. */
async function verificarAlvosDeToque(page, rotulo) {
  const alvos = [];
  for (const link of await page.$$('.liga-cta a')) {
    if (!(await link.isVisible())) continue;
    const caixa = await link.boundingBox();
    alvos.push({ texto: (await link.textContent()).trim(), altura: caixa.height });
  }
  const pequenos = alvos.filter((alvo) => alvo.altura < ALVO_MINIMO_PX);
  const detalhe = pequenos.map((alvo) => `${alvo.texto} ${Math.round(alvo.altura)} px`).join(' | ');
  check(alvos.length >= 2 && pequenos.length === 0,
    `${rotulo}: links de .liga-cta com altura >= ${ALVO_MINIMO_PX} px` + (detalhe ? ': ' + detalhe : ` (${alvos.length} links visíveis)`));
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
    if (ligada) {
      await verificarCtaAberto(app.page, rotulo);
      await verificarAlvosDeToque(app.page, rotulo);
    } else {
      await verificarCtaFechado(app.page, rotulo);
    }
    await axeGate(app.page, `${rotulo}: axe`);
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
    const aviso = app.page.locator('.welcome-liga__aviso');
    const avisoVisivel = await aviso.isVisible();
    check(avisoVisivel === ligada, `${rotulo}: aviso "Processo seletivo aberto" ${ligada ? 'visível' : 'escondido'}`);
    if (ligada) check((await aviso.textContent()).trim() === AVISO_ABERTO, `${rotulo}: texto do aviso é o de processo aberto`);
    const link = app.page.locator('.welcome-liga__link');
    const linkVisivel = await link.isVisible();
    const linkDestino = await link.getAttribute('href');
    check(linkVisivel && linkDestino === 'liga.html', `${rotulo}: link "Conheça a LAIFT" visível e aponta para liga.html`);
    await checarSaude(app, respostas, rotulo);
  } finally {
    await app.close();
  }
}

module.exports = async function liga() {
  await paginaDaLiga(1280, 900, true);
  await paginaDaLiga(375, 812, true);
  await paginaDaLiga(375, 812, false);
  await movimentoReduzido();
  await faixaDoLogin(true);
  await faixaDoLogin(false);
};
