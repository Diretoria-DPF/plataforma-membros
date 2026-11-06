/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * entrada-v2.e2e.js — Entrada v2 (flag entrada_v2_enabled; frontend/entrada-v2.js e entrada-v2.css).
 * Roda sobre o BUILD (frontend/dist/), sem login. Com a flag ligada, em 375x812 e 1280x800: herói, vitrine,
 * passos, seções com dado real, folha (abrir, fechar, Esc, foco preso, abas) e os MESMOS formulários do app
 * chegando aos mesmos handlers (apiLogin, apiRegister). Com a flag desligada: tela de login de sempre.
 * A flag é simulada pela resposta de apiGetFeatureFlags (a migração dela é de outro agente).
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const SHOTS_DIR = path.join(__dirname, '.shots');
const MIN_ALVO_PX = 44;
const DIA_MS = 24 * 60 * 60 * 1000;
const CENARIOS = [
  { esquema: 'light', largura: 375, altura: 812, celular: true },
  { esquema: 'dark', largura: 1280, altura: 800, celular: false },
];

const eventosFicticios = () => [
  { id: 'e1', title: 'Encontro de farmacologia (teste)', eventDate: new Date(Date.now() + 3 * DIA_MS).toISOString(), status: 'published', location: 'Auditório (teste)', capacity: null, spotsLeft: null },
  { id: 'e2', title: 'Evento já encerrado (teste)', eventDate: new Date(Date.now() - 9 * DIA_MS).toISOString(), status: 'published' },
];

function handlers({ flag, eventos }) {
  return {
    apiGetFeatureFlags: () => ({ success: true, flags: flag ? { entrada_v2_enabled: true } : {} }),
    apiListEvents: () => ({ success: true, events: eventos || [] }),
    apiRegister: () => ({ success: true, message: 'Cadastro recebido (teste).' }),
  };
}

async function abrir(app, { esquema, reduzido = false, aguardar = '.ev2' }) {
  await app.context.addInitScript(() => {
    window.__cspViolacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolacoes.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  await app.page.emulateMedia({ colorScheme: esquema, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
  await app.page.goto(app.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await app.page.waitForSelector(aguardar, { timeout: 15000 });
}

const folhaAberta = (page) => page.waitForSelector('#ev2-folha.ev2-on', { timeout: 2000 }).then(() => true, () => false);

async function aguardarFolhaFechada(page) {
  await page.waitForFunction(() => document.getElementById('ev2-folha').hidden === true, null, { timeout: 4000 });
}

/** Alvos de toque visíveis (botões e links) menores que 44 px, dentro do seletor. */
function alvosPequenos({ seletor, minimo }) {
  return Array.from(document.querySelectorAll(seletor)).filter((el) => el.getClientRects().length > 0).map((el) => {
    const r = el.getBoundingClientRect();
    return { nome: (el.textContent || el.id || el.tagName).trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) };
  }).filter((a) => a.h < minimo || a.w < minimo);
}

async function verificarPagina(app, rotulo) {
  const { page } = app;
  const s = await page.evaluate(() => ({
    h1: Array.from(document.querySelectorAll('h1')).filter((h) => h.getClientRects().length).map((h) => h.textContent.trim()),
    cartoes: document.querySelectorAll('.ev2-cartao').length,
    passos: document.querySelectorAll('.ev2-passo').length,
    transborda: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    legado: Array.from(document.querySelectorAll('#screen-welcome > .auth-card, #screen-welcome > nav')).filter((e) => e.getClientRects().length).length,
    folhaOculta: document.getElementById('ev2-folha').hidden,
    formNaFolha: !!document.querySelector('#ev2-painel-entrar #form-login') && !!document.querySelector('#ev2-painel-criar #form-register'),
    links: Array.from(document.querySelectorAll('.ev2-rodape a')).map((a) => a.getAttribute('href')),
    explorar: Array.from(document.querySelectorAll('.ev2-explorar__item')).map((a) => a.getAttribute('href')),
    heroiHref: (document.querySelector('.ev2-btn--sec') || {}).getAttribute ? document.querySelector('.ev2-btn--sec').getAttribute('href') : null,
    rotulos: Array.from(document.querySelectorAll('.ev2-btn--pri, .ev2-btn--sec')).map((b) => b.textContent.trim()),
  }));
  check(s.h1.length === 1 && /farmacologia/i.test(s.h1[0]), `${rotulo}: um único h1 visível com a promessa (${JSON.stringify(s.h1)})`);
  check(s.rotulos.includes('Criar conta') && s.rotulos.includes('Conheça a LAIFT'), `${rotulo}: botões "Criar conta" e "Conheça a LAIFT"`);
  check(JSON.stringify(s.explorar) === JSON.stringify(['/liga', '/blog', '/biblioteca', '/processo-seletivo']), `${rotulo}: seção Explore com Liga, Blog, Biblioteca e Processo seletivo no corpo (${JSON.stringify(s.explorar)})`);
  check(s.heroiHref === '/liga', `${rotulo}: "Conheça a LAIFT" do herói é link para /liga (${s.heroiHref})`);
  check(s.cartoes === 5, `${rotulo}: vitrine com 5 cartões com cadeado (${s.cartoes})`);
  check(s.passos === 3, `${rotulo}: "Como funciona" em 3 passos (${s.passos})`);
  check(s.legado === 0, `${rotulo}: cartões antigos de login e atalhos escondidos (${s.legado})`);
  check(s.folhaOculta, `${rotulo}: folha fechada ao abrir a página`);
  check(s.formNaFolha, `${rotulo}: #form-login e #form-register estão na folha (mesmos elementos do app)`);
  check(['/termos', '/privacidade', '/blog', '/processo-seletivo'].every((l) => s.links.includes(l)), `${rotulo}: links Termos, Privacidade, Blog e Processo seletivo (${s.links.join(', ')})`);
  check(s.transborda <= 0, `${rotulo}: sem rolagem horizontal (${s.transborda} px)`);
  const pequenos = await page.evaluate(alvosPequenos, { seletor: '.ev2 button, .ev2 a', minimo: MIN_ALVO_PX });
  check(pequenos.length === 0, `${rotulo}: alvos de toque >= ${MIN_ALVO_PX} px (${JSON.stringify(pequenos)})`);
}

async function verificarDados(app, rotulo) {
  const { page } = app;
  const liga = await page.evaluate(() => {
    const s = document.getElementById('ev2-liga');
    return { oculta: s.hidden, itens: Array.from(s.querySelectorAll('.ev2-item strong')).map((e) => e.textContent) };
  });
  check(!liga.oculta && liga.itens.length === 1 && /Encontro de farmacologia/.test(liga.itens[0]), `${rotulo}: "Acontecendo na Liga" mostra só o evento futuro vindo de apiListEvents (${JSON.stringify(liga.itens)})`);
  const blog = await page.evaluate(() => Array.from(document.querySelectorAll('#ev2-blog a')).map((a) => a.getAttribute('href')));
  check(blog.every((h) => /^blog\/[a-z0-9-]+\.html$/.test(h)), `${rotulo}: links do blog vêm do índice real (${blog.length})`);
}

async function verificarFolha(app, rotulo, celular) {
  const { page } = app;
  await page.click('.ev2-heroi .ev2-btn--pri');
  check(await folhaAberta(page), `${rotulo}: "Criar conta" abre a folha`);
  await page.waitForTimeout(450); // fim da animação de entrada
  const d = await page.evaluate(() => {
    const f = document.getElementById('ev2-folha');
    const r = f.getBoundingClientRect();
    return {
      papel: f.getAttribute('role'), modal: f.getAttribute('aria-modal'), titulo: document.getElementById('ev2-titulo').textContent,
      abas: Array.from(f.querySelectorAll('[role=tab]')).map((t) => t.getAttribute('aria-selected')),
      lista: !!f.querySelector('[role=tablist]'), registroVisivel: document.getElementById('form-register').getClientRects().length > 0,
      baixo: Math.round(window.innerHeight - r.bottom), largura: Math.round(r.width), travado: document.documentElement.classList.contains('ev2-travado'),
      foco: document.activeElement.id,
    };
  });
  check(d.papel === 'dialog' && d.modal === 'true' && d.lista, `${rotulo}: dialog modal com tablist`);
  check(d.abas.join() === 'false,true' && d.registroVisivel && /Criar conta/.test(d.titulo), `${rotulo}: abre na aba Criar conta com o cadastro visível`);
  check(d.foco === 'ev2-aba-criar' && d.travado, `${rotulo}: foco na aba e rolagem da página travada (${d.foco})`);
  if (celular) check(d.baixo <= 1 && d.largura >= 374, `${rotulo}: no celular a folha encosta embaixo e ocupa a largura (${d.baixo}, ${d.largura})`);
  else check(d.largura >= 430 && d.largura <= 450 && d.baixo > 20, `${rotulo}: a partir de 768 px vira modal centralizado (${d.largura}x, base ${d.baixo})`);
  const pequenos = await page.evaluate(alvosPequenos, { seletor: '#ev2-folha .ev2-abas button, #ev2-folha .ev2-fechar, #ev2-folha .ev2-agora-nao, #ev2-folha button[type=submit]', minimo: MIN_ALVO_PX });
  check(pequenos.length === 0, `${rotulo}: alvos da folha >= ${MIN_ALVO_PX} px (${JSON.stringify(pequenos)})`);
  await page.screenshot({ path: path.join(SHOTS_DIR, `entrada-v2-folha-${rotulo.replace(/\W+/g, '-')}.png`) });

  await page.keyboard.press('Escape');
  await aguardarFolhaFechada(page);
  const foco = await page.evaluate(() => document.activeElement.textContent.trim());
  check(foco === 'Criar conta', `${rotulo}: Esc fecha e devolve o foco ao botão que abriu (${foco})`);

  await page.click('.ev2-btn-fantasma');
  check(await folhaAberta(page), `${rotulo}: "Entrar" da barra abre a folha`);
  const aba = await page.evaluate(() => document.getElementById('ev2-aba-entrar').getAttribute('aria-selected'));
  check(aba === 'true', `${rotulo}: abre na aba Entrar`);
  await page.keyboard.press('ArrowRight');
  const depois = await page.evaluate(() => ({ criar: document.getElementById('ev2-aba-criar').getAttribute('aria-selected'), reg: document.getElementById('form-register').getClientRects().length > 0, login: document.getElementById('form-login').getClientRects().length > 0 }));
  check(depois.criar === 'true' && depois.reg && !depois.login, `${rotulo}: seta direita troca para Criar conta`);
  await page.click('#ev2-aba-entrar');
  const volta = await page.evaluate(() => document.getElementById('form-login').getClientRects().length > 0);
  check(volta, `${rotulo}: clique na aba Entrar mostra o login`);

  let saiu = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
    if (!(await page.evaluate(() => document.getElementById('ev2-folha').contains(document.activeElement)))) saiu++;
  }
  check(saiu === 0, `${rotulo}: foco preso na folha em 40 Tab/Shift+Tab (saiu ${saiu}x)`);

  await page.click('.ev2-veu', { position: { x: 5, y: 5 } });
  await aguardarFolhaFechada(page);
  check(!(await folhaAberta(page)), `${rotulo}: clique no fundo fecha a folha`);
  await page.click('.ev2-btn-fantasma');
  await page.click('#ev2-folha .ev2-fechar');
  await aguardarFolhaFechada(page);
  await page.click('.ev2-btn-fantasma');
  await page.click('#ev2-folha .ev2-agora-nao');
  await aguardarFolhaFechada(page);
  check(true, `${rotulo}: botões "Fechar" e "Agora não" fecham a folha`);
}

async function verificarCartaoELogin(app, rotulo) {
  const { page, calls } = app;
  await page.locator('.ev2-cartao').first().click();
  const nome = await page.evaluate(() => document.getElementById('ev2-titulo').textContent);
  check(await folhaAberta(page) && /Criar conta/.test(nome), `${rotulo}: cartão com cadeado leva ao cadastro`);
  await page.click('#ev2-aba-entrar');
  await page.fill('#login-email', 'ana@exemplo.com');
  await page.fill('#login-password', 'senha-de-teste-123');
  await page.click('#form-login button[type=submit]');
  await page.waitForSelector('#app-root:not(.hidden)', { timeout: 15000 });
  const login = calls.worker.find((c) => c.action === 'apiLogin');
  check(!!login && login.args[0] === 'ana@exemplo.com', `${rotulo}: o login da folha chega ao mesmo handler apiLogin`);
  const estado = await page.evaluate(() => ({ travado: document.documentElement.classList.contains('ev2-travado'), folha: document.getElementById('ev2-folha') ? document.getElementById('ev2-folha').getClientRects().length : 0 }));
  check(!estado.travado && estado.folha === 0, `${rotulo}: ao entrar no app a folha some e a rolagem destrava`);
}

async function verificarCadastro(app, rotulo) {
  const { page, calls } = app;
  await page.click('.ev2-heroi .ev2-btn--pri');
  await page.fill('#reg-name', 'Maria Teste');
  await page.fill('#reg-username', 'maria.teste');
  await page.fill('#reg-email', 'maria@exemplo.com');
  await page.fill('#reg-phone', '11999990000');
  await page.fill('#reg-password', 'senha-de-teste-123');
  await page.check('#reg-terms');
  await page.check('#reg-privacy');
  await page.click('#form-register button[type=submit]');
  await page.waitForFunction(() => /Cadastro recebido/.test(document.getElementById('msg-register').textContent));
  const reg = calls.worker.find((c) => c.action === 'apiRegister');
  const p = reg && reg.args[0];
  check(!!p && p.email === 'maria@exemplo.com' && p.termsAccepted === true && p.privacyAccepted === true && p.fullName === 'Maria Teste', `${rotulo}: o cadastro da folha chega ao mesmo handler apiRegister, com os termos`);
  const msgVisivel = await page.evaluate(() => document.getElementById('msg-register').getClientRects().length > 0);
  check(msgVisivel, `${rotulo}: a resposta do cadastro aparece dentro da folha`);
}

async function verificarEsqueci(app, rotulo) {
  const { page } = app;
  await page.click('.ev2-btn-fantasma');
  await page.click('#ev2-folha .auth-esqueci');
  await page.waitForSelector('#screen-forgot:not(.hidden)');
  await aguardarFolhaFechada(page);
  check(true, `${rotulo}: "Esqueci minha senha" fecha a folha e abre a tela de redefinição`);
  await page.click('#screen-forgot .auth-links [data-nav="screen-welcome"]');
  await page.waitForSelector('.ev2', { state: 'visible' });
  check(true, `${rotulo}: voltar da redefinição leva à Entrada v2`);
}

async function cenarioLigado(cen) {
  const rotulo = `${cen.esquema}/${cen.largura}x${cen.altura}`;
  console.log(`\n▶ flag ligada ${rotulo}`);
  const viewport = { width: cen.largura, height: cen.altura };
  let app = await startApp({ viewport, workerHandlers: handlers({ flag: true, eventos: eventosFicticios() }) });
  try {
    await abrir(app, cen);
    await app.page.waitForSelector('#ev2-liga:not([hidden])', { timeout: 8000 });
    await verificarPagina(app, rotulo);
    await verificarDados(app, rotulo);
    await app.page.screenshot({ path: path.join(SHOTS_DIR, `entrada-v2-${cen.esquema}-${cen.largura}x${cen.altura}.png`), fullPage: true });
    await verificarFolha(app, rotulo, cen.celular);
    await verificarEsqueci(app, rotulo);
    await app.page.reload();
    await app.page.waitForSelector('.ev2');
    await verificarCartaoELogin(app, rotulo);
    const violacoes = await app.page.evaluate(() => window.__cspViolacoes || []);
    check(violacoes.length === 0, `${rotulo}: sem violação de CSP` + (violacoes.length ? `: ${violacoes.join(' | ')}` : ''));
    check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? `: ${app.errors.join(' | ')}` : ''));
  } finally {
    await app.close();
  }
  app = await startApp({ viewport, workerHandlers: handlers({ flag: true, eventos: [] }) });
  try {
    await abrir(app, cen);
    await verificarCadastro(app, rotulo);
    const oculta = await app.page.evaluate(() => document.getElementById('ev2-liga').hidden);
    check(oculta, `${rotulo}: sem evento público, a seção "Acontecendo na Liga" fica escondida`);
  } finally {
    await app.close();
  }
}

async function cenarioReduzido() {
  console.log('\n▶ flag ligada, movimento reduzido (375x812)');
  const app = await startApp({ viewport: { width: 375, height: 812 }, workerHandlers: handlers({ flag: true }) });
  try {
    await abrir(app, { esquema: 'light', reduzido: true });
    await app.page.click('.ev2-btn-fantasma');
    check(await folhaAberta(app.page), 'reduzido: a folha abre');
    await app.page.keyboard.press('Escape');
    const oculta = await app.page.evaluate(() => document.getElementById('ev2-folha').hidden);
    check(oculta, 'reduzido: a folha fecha na hora, sem esperar animação');
  } finally {
    await app.close();
  }
}

async function cenarioDesligado() {
  console.log('\n▶ flag desligada (375x812)');
  const app = await startApp({ viewport: { width: 375, height: 812 }, workerHandlers: handlers({ flag: false }) });
  const pedidos = [];
  app.page.on('request', (r) => pedidos.push(r.url()));
  try {
    await abrir(app, { esquema: 'light', aguardar: '#screen-welcome:not(.hidden)' });
    await app.page.waitForLoadState('networkidle');
    const s = await app.page.evaluate(() => ({
      v2: document.querySelectorAll('.ev2, #ev2-folha').length,
      h1: document.querySelector('#screen-welcome h1').textContent.trim(),
      login: document.getElementById('form-login').getClientRects().length > 0,
      pai: document.getElementById('form-login').closest('.auth-card') !== null,
    }));
    check(s.v2 === 0 && s.h1 && /^LAIFT/.test(s.h1) && s.login && s.pai, 'desligada: tela de login de sempre, sem nada da Entrada v2');
    check(!pedidos.some((u) => /entrada-v2\.(js|css)/.test(u)), 'desligada: entrada-v2.js e entrada-v2.css nem são baixados');
    await app.login();
    check((await app.page.locator('#app-root:not(.hidden)').count()) === 1, 'desligada: o login de sempre continua entrando no app');
    check(app.errors.length === 0, 'desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function entradaV2() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const cen of CENARIOS) await cenarioLigado(cen);
  await cenarioReduzido();
  await cenarioDesligado();
};
