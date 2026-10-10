/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * menu.e2e.js — barra inferior de 4 itens e menu (hambúrguer) do app logado. Roda sobre o BUILD.
 * Cobre: só Início, Aprender, Eventos e Perfil na barra; aviso com o total de pendências no botão dos três
 * tracinhos; itens do menu com o que está esperando; abrir, escolher um item, Esc e foco de volta; membro sem
 * pendência; visitante só com Propostas. Fotos: .shots/menu-<estado>-<tema>-375x812.png.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const SHOTS_DIR = path.join(__dirname, '.shots');
const ALVO_MINIMO_PX = 44;
const ROTULO_MINIMO_PX = 12;
const VIEWPORT = { width: 375, height: 812 };

const COM_PENDENCIAS = {
  apiListTasks: () => ({ success: true, tasks: [
    { id: 't1', title: 'Organizar cadeiras', description: 'Montar o espaço.', dueDate: '2026-10-20T12:00:00Z', alreadySignedUp: false, completed: false, signupCount: 0 },
    { id: 't2', title: 'Divulgar o evento', description: 'Postar nas redes.', dueDate: '2026-10-21T12:00:00Z', alreadySignedUp: false, completed: false, signupCount: 0 },
  ] }),
  apiListOpenProposalsForVoting: () => ({ success: true, proposals: [{ id: 'p1', title: 'Novo horário das reuniões', alreadyVoted: false }] }),
  apiListIncomingConnectionRequests: () => ({ success: true, requests: [{ id: 'c1', fullName: 'Bia Souza' }] }),
};

const SEM_PENDENCIAS = {
  apiListTasks: () => ({ success: true, tasks: [] }),
  apiListOpenProposalsForVoting: () => ({ success: true, proposals: [] }),
  apiListIncomingConnectionRequests: () => ({ success: true, requests: [] }),
};

async function foto(app, nome) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await app.page.screenshot({ path: path.join(SHOTS_DIR, `${nome}.png`) });
}

async function iniciar(opts) {
  const app = await startApp(Object.assign({ viewport: VIEWPORT }, opts));
  await app.login();
  return app;
}

async function barraEBotao(app, rotulo) {
  const rotulos = await app.page.$$eval('#nav-group-member button[data-panel]:not(.hidden)', (botoes) => botoes.map((b) => ({
    painel: b.getAttribute('data-panel'),
    texto: b.querySelector('span:not(.nav-badge)').textContent.trim(),
    fonte: parseFloat(getComputedStyle(b.querySelector('span:not(.nav-badge)')).fontSize),
    largura: b.getBoundingClientRect().width,
    altura: b.getBoundingClientRect().height,
  })));
  check(rotulos.map((r) => r.texto).join('|') === 'Início|Aprender|Eventos|Perfil', `${rotulo}: a barra tem só Início, Aprender, Eventos e Perfil (achou ${rotulos.map((r) => r.texto).join(', ')})`);
  check(rotulos.every((r) => r.fonte >= ROTULO_MINIMO_PX), `${rotulo}: rótulos da barra com ${ROTULO_MINIMO_PX} px ou mais (${rotulos.map((r) => r.fonte).join(', ')})`);
  check(rotulos.every((r) => r.largura >= 64 && r.altura >= ALVO_MINIMO_PX), `${rotulo}: alvos da barra com 64 px de largura e ${ALVO_MINIMO_PX} px de altura (${rotulos.map((r) => Math.round(r.largura)).join(', ')})`);
  const caixa = await app.page.locator('#app-menu-btn').boundingBox();
  check(!!caixa && caixa.width >= ALVO_MINIMO_PX && caixa.height >= ALVO_MINIMO_PX, `${rotulo}: botão dos três tracinhos com alvo de ${ALVO_MINIMO_PX} px ou mais`);
}

async function comPendencias() {
  const app = await iniciar({ role: 'member', workerHandlers: COM_PENDENCIAS });
  try {
    await app.page.waitForFunction(() => document.getElementById('app-menu-badge') && !document.getElementById('app-menu-badge').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    await barraEBotao(app, 'membro com pendências');
    const aviso = (await app.page.textContent('#app-menu-badge')).trim();
    check(aviso === '4', `membro com pendências: aviso do botão mostra o total 4 (votação 1 + tarefas 2 + solicitação 1) (achou "${aviso}")`);
    check((await app.page.getAttribute('#app-menu-btn', 'aria-label')) === 'Menu, 4 pendências', 'membro com pendências: nome acessível do botão é "Menu, 4 pendências"');
    await app.page.waitForSelector('.splash', { state: 'detached', timeout: 8000 }).catch(() => {});
    await foto(app, 'menu-fechado-claro-375x812');

    await app.page.click('#app-menu-btn');
    await app.page.waitForSelector('#app-menu[open]');
    check((await app.page.getAttribute('#app-menu-btn', 'aria-expanded')) === 'true', 'menu aberto: aria-expanded é true');
    const itens = await app.page.$$eval('#app-menu [data-panel]:not(.hidden)', (bs) => bs.map((b) => ({
      painel: b.getAttribute('data-panel'),
      titulo: b.querySelector('.app-menu__titulo').textContent.trim(),
      info: b.querySelector('.app-menu__info').textContent.trim(),
      altura: b.getBoundingClientRect().height,
    })));
    check(itens.map((i) => i.titulo).join('|') === 'Propostas|Tarefas|Mensagens|Equipe', `menu aberto: Propostas, Tarefas, Mensagens e Equipe, em grupos (achou ${itens.map((i) => i.titulo).join(', ')})`);
    const info = Object.fromEntries(itens.map((i) => [i.painel, i.info]));
    check(info['panel-proposals'] === 'Votação aberta', `menu aberto: Propostas diz "Votação aberta" (achou "${info['panel-proposals']}")`);
    check(info['panel-tasks'] === '2 tarefas em aberto', `menu aberto: Tarefas diz "2 tarefas em aberto" (achou "${info['panel-tasks']}")`);
    check(info['panel-orgchart'] === '1 solicitação de conexão', `menu aberto: Equipe diz "1 solicitação de conexão" (achou "${info['panel-orgchart']}")`);
    check(itens.every((i) => i.altura >= ALVO_MINIMO_PX), `menu aberto: itens com alvo de ${ALVO_MINIMO_PX} px ou mais`);
    await app.page.waitForTimeout(450);
    await foto(app, 'menu-aberto-claro-375x812');

    await app.page.keyboard.press('Escape');
    await app.page.waitForSelector('#app-menu:not([open])', { state: 'attached' });
    check((await app.page.getAttribute('#app-menu-btn', 'aria-expanded')) === 'false', 'Esc fecha o menu e aria-expanded volta a false');
    check(await app.page.evaluate(() => document.activeElement && document.activeElement.id === 'app-menu-btn'), 'ao fechar com Esc, o foco volta ao botão do menu');

    await app.page.click('#app-menu-btn');
    await app.page.click('#app-menu [data-panel="panel-tasks"]');
    await app.page.waitForSelector('#panel-tasks:not(.hidden)');
    check(await app.page.evaluate(() => !document.getElementById('app-menu').open), 'escolher Tarefas leva ao painel e fecha o menu');
    check((await app.page.getAttribute('#app-menu [data-panel="panel-tasks"]', 'aria-current')) === 'page', 'o item do menu do painel atual fica com aria-current="page"');

    await app.page.click('#app-menu-btn');
    await app.page.mouse.click(10, 400);
    await app.page.waitForSelector('#app-menu:not([open])', { state: 'attached' });
    check(true, 'toque fora do painel (no fundo) fecha o menu');
    check(app.errors.length === 0, `membro com pendências: sem erros de JavaScript (${app.errors.join(' | ')})`);
  } finally {
    await app.close();
  }
}

async function escuro() {
  const app = await iniciar({ role: 'member', theme: 'dark', workerHandlers: COM_PENDENCIAS });
  try {
    await app.page.waitForFunction(() => !document.getElementById('app-menu-badge').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    await app.page.click('#app-menu-btn');
    await app.page.waitForSelector('#app-menu[open]');
    await app.page.waitForTimeout(450);
    await foto(app, 'menu-aberto-escuro-375x812');
    const fundo = await app.page.$eval('#app-menu', (el) => getComputedStyle(el).backgroundColor);
    check(fundo !== 'rgba(0, 0, 0, 0)', `tema escuro: o painel do menu tem fundo próprio (${fundo})`);
  } finally {
    await app.close();
  }
}

async function semPendencias() {
  const app = await iniciar({ role: 'member', workerHandlers: SEM_PENDENCIAS });
  try {
    await app.page.waitForTimeout(600);
    check(await app.page.$eval('#app-menu-badge', (el) => el.classList.contains('hidden')), 'membro sem pendência: o botão dos três tracinhos fica sem aviso');
    check((await app.page.getAttribute('#app-menu-btn', 'aria-label')) === 'Menu', 'membro sem pendência: nome acessível é só "Menu"');
    await app.page.click('#app-menu-btn');
    await app.page.waitForSelector('#app-menu[open]');
    const infos = await app.page.$$eval('#app-menu .app-menu__info', (els) => els.map((e) => e.textContent.trim()));
    check(infos.every((t) => t === ''), 'membro sem pendência: nenhum item mostra aviso de pendência');
  } finally {
    await app.close();
  }
}

async function visitante() {
  const app = await iniciar({ role: 'visitor' });
  try {
    await app.page.waitForTimeout(400);
    const visiveis = await app.page.$$eval('#app-menu [data-panel]:not(.hidden)', (bs) => bs.map((b) => b.getAttribute('data-panel')));
    check(visiveis.join('|') === 'panel-proposals', `visitante: o menu só oferece Propostas (achou ${visiveis.join(', ')})`);
    check(await app.page.$eval('#app-menu [data-grupo="comunicacao"]', (el) => el.classList.contains('hidden')), 'visitante: o grupo Comunicação não aparece');
  } finally {
    await app.close();
  }
}

async function admin() {
  const app = await iniciar({ role: 'admin', workerHandlers: SEM_PENDENCIAS });
  try {
    check(await app.page.isVisible('#app-menu-btn'), 'admin no modo membro: botão do menu visível');
    await app.page.click('#btn-enter-admin-mode');
    await app.page.waitForTimeout(300);
    check(!(await app.page.isVisible('#app-menu-btn')), 'admin no modo administração: o menu do membro some');
  } finally {
    await app.close();
  }
}

module.exports = async function menu() {
  await comPendencias();
  await escuro();
  await semPendencias();
  await visitante();
  await admin();
};
