/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selection-v2.e2e.js — Processo seletivo v2 (frontend/selection-v2.js, selection-v2.css) atrás da flag selection_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: apresentação, jornada inteira (aceite a envio com confirmação), progresso,
 *    aviso sobre dados de saúde, lista de etapas do rascunho, comprovante; sem rolagem horizontal, alvos de 44 px, fontes de 12 px;
 *  - regras de sempre intactas: sem mínimo de caracteres, sem questões objetivas, erro do servidor visível, cancelar não envia;
 *  - claro e escuro, movimento reduzido, erro de carregamento;
 *  - flag desligada: jornada de sempre, sem nada do v2.
 * Capturas: defina SELETIVO_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const THK = ['t01', 't02'].map((id, i) => ({ id, title: 'Pergunta ' + (i + 1), prompt: 'Explique seu raciocínio na pergunta ' + (i + 1) + '.', min: 1, max: 600 }));
const CND = ['c01', 'c02'].map((id, i) => ({ id, title: 'Situação ' + (i + 1), situation: 'Descrição da situação de conduta ' + (i + 1) + '.', min: 1, max: 600 }));
const CONTENT = {
  version: 'v1', courses: ['Farmácia', 'Biomedicina'], areas: ['Toxicologia', 'Farmacologia clínica'], days: ['seg', 'ter', 'qua'], shifts: ['manha', 'noite'],
  semesters: ['1', '2', '3', '4', '5', 'concluido'],
  scenario: { prompt: 'Escolha um ponto de partida e escreva sua análise.', hints: ['Cite a fonte.'], minChars: 1, maxChars: 2000 },
  thinking: THK, conduct: CND,
  limits: { institution: 120, motivation: 400, why: 200, whyMin: 10, hoursMax: 40, areasMax: 4 },
};
const ORDER = ['intro', 'profile', 'scenario', 'thinking', 'conduct', 'review'];
const FULL = {
  intro: { acceptedEdital: true, acceptedPrivacy: true, acceptedAiNotice: true },
  profile: { course: 'Farmácia', institution: 'UNINASSAU', semester: '5', areas: ['Toxicologia'], hoursPerWeek: 6, days: ['seg'], shifts: ['noite'], motivation: '' },
  scenario: { text: 'Análise de cenário.' }, thinking: { answers: { t01: 'a', t02: 'b' } }, conduct: { answers: { c01: 'a', c02: 'b' } },
};

function fakeServer(opts) {
  const o = opts || {};
  const state = { app: o.draftDone ? { id: 'app-1', status: 'draft', step: 'done', deadlineAt: new Date(Date.now() + 4.5 * 86400000).toISOString(), receiptCode: null, data: JSON.parse(JSON.stringify(FULL)) } : null, saves: [] };
  const dto = () => (state.app ? Object.assign({}, state.app) : null);
  return {
    state,
    handlers: {
      apiGetFeatureFlags: () => ({ success: true, flags: { selection_enabled: true, selection_v2_enabled: o.flag !== false } }),
      apiSelectionOverview: () => (o.loadError ? { success: false, networkUnavailable: true } : { success: true, enabled: true, open: true, windowDays: 7, nextReviewOn: '2026-11-05' }),
      apiSelectionGetMine: () => ({ success: true, application: dto(), content: CONTENT }),
      apiSelectionStart: () => {
        if (!state.app) state.app = { id: 'app-1', status: 'draft', step: 'intro', deadlineAt: new Date(Date.now() + 6.5 * 86400000).toISOString(), receiptCode: null, data: {} };
        return { success: true, application: dto(), content: CONTENT };
      },
      apiSelectionSaveStep: (args) => {
        const input = args[1] || {};
        state.saves.push(input.step);
        state.app.data[input.step] = input.data;
        state.app.step = ORDER[Math.min(ORDER.indexOf(input.step) + 1, ORDER.length - 1)];
        return { success: true, message: 'Etapa salva.', warnings: [], application: dto() };
      },
      apiSelectionSubmit: () => {
        state.app.status = 'submitted'; state.app.step = 'done'; state.app.receiptCode = 'LAIFT-ABCD2345';
        return { success: true, message: 'Inscrição enviada.', application: dto() };
      },
      apiSelectionWithdraw: () => ({ success: true, message: 'Inscrição retirada.' }),
    },
  };
}

async function openPanel(app) {
  await app.login();
  await app.page.waitForFunction(() => document.documentElement.hasAttribute('data-flag-selection-enabled'), null, { timeout: 10000 });
  await app.page.click('#app-menu-btn');
  await app.page.click('#app-menu [data-panel="panel-selection"]');
  await app.page.waitForSelector('#selection-root .sel-card', { timeout: 10000 });
}

async function shot(page, name) {
  const dir = process.env.SELETIVO_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function layoutChecks(page, vp) {
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflowX <= 0, vp.name + ': a página não rola na horizontal (' + overflowX + ' px)');
  const sizes = await page.$$eval('#selection-root button, #selection-root .s2-how__links a, #selection-root .sel-link', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 1));
  check(sizes.length >= 2 && sizes.every((s) => s[1] >= 44), vp.name + ': alvos de pelo menos 44 px de altura (' + sizes.length + ' controles)');
  const fonts = await page.$$eval('#selection-root .s2-hero *, #selection-root .s2-notice *, #selection-root .s2-steps *, #selection-root .s2-how *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
  check(fonts.length > 4 && fonts.every((f) => f >= 12), vp.name + ': fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
}

async function jornada(vp) {
  console.log('\n— ' + vp.name + ': jornada inteira');
  const server = fakeServer();
  const app = await startApp({ role: 'visitor', viewport: vp.size, workerHandlers: server.handlers });
  const { page } = app;
  try {
    await openPanel(app);
    check((await page.locator('.s2-hero #sel-title').count()) === 1 && (await page.locator('.s2-hero #sel-start').count()) === 1, 'apresentação: título e "Começar inscrição" no cabeçalho');
    check(await page.locator('.s2-notice[role="note"]').isVisible() && /dados de saúde/.test(await page.locator('.s2-notice').innerText()), 'aviso sobre dados de saúde visível');
    check((await page.locator('.sel-how li').count()) === 4 && (await page.locator('.sel-points li').count()) === 4, 'Como funciona e pontos de sempre continuam');
    check((await page.locator('#selection-root a[href="edital.html"]').count()) >= 1, 'link para o edital continua');
    await layoutChecks(page, vp);
    await shot(page, 'seletivo-' + vp.size.width + '-apresentacao');

    await page.click('#sel-start');
    await page.waitForSelector('[data-sel-step="intro"].s2-card');
    check(/Etapa 1 de 6/i.test(await page.locator('.s2-hero__kicker').textContent()), 'etapa 1 de 6 no cabeçalho');
    check((await page.getAttribute('.s2-bar', 'aria-valuenow')) === '0' && (await page.getAttribute('.s2-bar', 'role')) === 'progressbar', 'barra de progresso acessível (0%)');
    check(/Você tem \d dias para concluir/.test(await page.locator('.sel-deadline').innerText()), 'prazo do servidor continua visível');
    check((await page.evaluate(() => document.activeElement.id)) === 'sel-title', 'o foco vai ao título');
    for (const name of ['acceptedEdital', 'acceptedPrivacy', 'acceptedAiNotice']) await page.check(`input[name="${name}"]`);
    await shot(page, 'seletivo-' + vp.size.width + '-etapa1');
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="profile"].s2-card');
    check((await page.getAttribute('.s2-bar', 'aria-valuenow')) === '17', 'progresso 1 de 6 (17%)');

    await page.selectOption('#sel-course', 'Farmácia');
    await page.fill('#sel-institution', 'UNINASSAU');
    await page.selectOption('#sel-semester', '5');
    await page.check('input[name="areas"][value="Toxicologia"]');
    await page.fill('#sel-hours', '6');
    await page.check('input[name="days"][value="seg"]');
    await page.check('input[name="shifts"][value="noite"]');
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="scenario"].s2-card');
    check(!/mínimo/.test(await page.locator('#selection-root').innerText()), 'cenário sem mínimo de caracteres');
    await page.click('#selection-root button[type="submit"]');
    check(/Escreva sua resposta/.test(await page.locator('.sel-live').innerText()), 'campo vazio continua pedindo resposta');
    await page.fill('#sel-scenario', 'Mecanismo de ação e impacto clínico.');
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="thinking"].s2-card');
    check((await page.locator('input[type="radio"]').count()) === 0, 'raciocínio sem questões objetivas');
    for (const q of THK) await page.fill(`#thinking-${q.id}`, 'ok');
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="conduct"].s2-card');
    for (const q of CND) await page.fill(`#conduct-${q.id}`, 'ok');
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="review"].s2-card');
    check((await page.locator('.s2-notice').count()) === 0, 'revisão sem o aviso (não há campo de texto)');
    check((await page.getAttribute('.s2-bar', 'aria-valuenow')) === '83', 'progresso 5 de 6 (83%) na revisão');
    await shot(page, 'seletivo-' + vp.size.width + '-revisao');

    await page.click('#sel-send');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    await page.click('#modal-confirm-cancel');
    check(server.state.app.status === 'draft', 'cancelar a confirmação não envia');
    await page.click('#sel-send');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    await page.click('#modal-confirm-ok');
    await page.waitForSelector('[data-sel-step="status"].s2-card');
    check(/LAIFT-ABCD2345/.test(await page.locator('.s2-hero .sel-receipt').innerText()), 'comprovante no cabeçalho');
    check((await page.locator('.sel-timeline li').count()) === 4, 'linha do tempo do andamento continua');
    await shot(page, 'seletivo-' + vp.size.width + '-enviada');
    check(JSON.stringify(server.state.saves) === JSON.stringify(['intro', 'profile', 'scenario', 'thinking', 'conduct']), 'etapas salvas em ordem (' + server.state.saves.join(',') + ')');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function hubScenario(size, theme) {
  console.log('\n— rascunho (hub) ' + size.width + 'x' + size.height + (theme ? ' ' + theme : ''));
  const app = await startApp({ role: 'visitor', viewport: size, theme, workerHandlers: fakeServer({ draftDone: true }).handlers });
  const { page } = app;
  try {
    await openPanel(app);
    await page.waitForSelector('[data-s2="status-draft"]');
    check((await page.locator('.s2-steps li').count()) === 6, 'seis etapas listadas');
    check((await page.locator('.s2-steps .is-done').count()) === 5 && (await page.locator('.s2-steps button').count()) === 1 && (await page.locator('.s2-steps button[aria-current="step"]').innerText()).includes('Revisão'), 'cinco concluídas; só a revisão abre (regra canVisit de sempre para rascunho completo)');
    check((await page.getAttribute('.s2-bar', 'aria-valuetext')) === '5 de 6 etapas concluídas', 'progresso em texto real');
    check(/Você tem \d dias/.test(await page.locator('.sel-deadline').innerText()), 'prazo real do servidor');
    check((await page.locator('.s2-hero .sel-actions button').count()) === 1, 'botão "Continuar inscrição" de sempre no cabeçalho');
    check(await page.locator('.s2-notice').isVisible() && (await page.locator('.s2-how li').count()) === 4, 'aviso e Como funciona presentes');
    check(/05\/11/.test(await page.locator('.s2-how').innerText()) && /7 dias/.test(await page.locator('.s2-how').innerText()), 'Como funciona usa prazo e data do servidor');
    await layoutChecks(page, { name: size.width + 'px' });
    if (theme === 'dark') {
      const hero = await page.locator('.s2-hero').evaluate((n) => getComputedStyle(n).backgroundImage);
      check(/rgb\(12, 63, 58\)/.test(hero), 'cabeçalho com o gradiente escuro');
      const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      check(lum(await page.locator('.sel-card').evaluate((n) => getComputedStyle(n).backgroundColor)) < 0.3, 'cartão escuro no tema escuro');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const t = await page.locator('.s2-steps button').first().evaluate((n) => getComputedStyle(n).transitionDuration);
      check(/^(0s|1e-05s)/.test(t), 'movimento reduzido: sem transição (' + t + ')');
    }
    await shot(page, 'seletivo-' + size.width + '-rascunho' + (theme ? '-' + theme : ''));
    await page.click('.s2-steps button:has-text("Revisão")');
    await page.waitForSelector('[data-sel-step="review"]');
    check(true, 'a lista abre a revisão pelo mesmo caminho do passo a passo');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function loadErrorScenario() {
  console.log('\n— erro de carregamento');
  const app = await startApp({ role: 'visitor', viewport: { width: 375, height: 812 }, workerHandlers: fakeServer({ loadError: true }).handlers });
  try {
    await openPanel(app);
    check(await app.page.locator('#sel-retry').isVisible(), 'erro de rede mostra "Tentar de novo" (não "inscrições fechadas")');
    await shot(app.page, 'seletivo-375-erro');
  } finally { await app.close(); }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'visitor', viewport: { width: 1280, height: 800 }, workerHandlers: fakeServer({ flag: false, draftDone: true }).handlers });
  const { page } = app;
  try {
    await openPanel(app);
    check((await page.locator('.s2-hero, .s2-notice, .s2-steps, .s2-how, [data-s2], .s2-card').count()) === 0, 'nenhum elemento do Processo seletivo v2');
    check((await page.locator('link[data-selection-v2-css]').count()) === 0, 'o CSS do v2 nem é carregado');
    check(/Inscrição em andamento/.test(await page.locator('#sel-title').innerText()) && (await page.locator('.sel-actions button').count()) === 1, 'tela de sempre do rascunho');
    await shot(page, 'seletivo-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally { await app.close(); }
}

module.exports = async function selectionV2() {
  await jornada({ name: 'celular 375x812', size: { width: 375, height: 812 } });
  await jornada({ name: 'desktop 1280x800', size: { width: 1280, height: 800 } });
  await hubScenario({ width: 375, height: 812 });
  await hubScenario({ width: 768, height: 1024 });
  await hubScenario({ width: 1280, height: 800 });
  await hubScenario({ width: 375, height: 812 }, 'dark');
  await hubScenario({ width: 1280, height: 800 }, 'dark');
  await loadErrorScenario();
  await flagOffScenario();
};
