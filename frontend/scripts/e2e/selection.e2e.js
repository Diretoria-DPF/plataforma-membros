/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selection.e2e.js — jornada do candidato no processo seletivo (frontend/selection.js), com a API simulada em memória.
 *  - o item "Processo seletivo" aparece no menu só para visitante e só com a flag selection_enabled;
 *  - aceite, perfil, cenário, questões, conduta, revisão e envio, no celular e no computador;
 *  - o passo a passo só abre etapas alcançadas; as questões já respondidas não voltam a ser editáveis;
 *  - erros do servidor aparecem para a pessoa; a isca fica fora da tela; sem erros de JavaScript e sem falha de acessibilidade.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const OBJ = ['o01', 'o02', 'o03', 'o04', 'o05', 'o06', 'o07', 'o08'].map((id, i) => ({
  id, area: 'Farmacocinética', stem: 'Questão ' + (i + 1) + ': qual alternativa está correta?',
  options: [{ id: 'a', text: 'Alternativa A' }, { id: 'b', text: 'Alternativa B' }, { id: 'c', text: 'Alternativa C' }, { id: 'd', text: 'Alternativa D' }],
}));
const CND = ['c01', 'c02', 'c03'].map((id, i) => ({
  id, title: 'Situação ' + (i + 1), situation: 'Descrição da situação de conduta ' + (i + 1) + '.',
  options: [{ id: 'a', text: 'Atitude A' }, { id: 'b', text: 'Atitude B' }, { id: 'c', text: 'Atitude C' }, { id: 'd', text: 'Atitude D' }],
}));
const CONTENT = {
  version: 'v1', courses: ['Farmácia', 'Biomedicina'], areas: ['Toxicologia', 'Farmacologia clínica'], days: ['seg', 'ter', 'qua'], shifts: ['manha', 'noite'],
  semesters: ['1', '2', '3', '4', '5', 'concluido'],
  scenario: { prompt: 'Escolha um ponto de partida e escreva sua análise.', hints: ['Cite a fonte.'], minChars: 400, maxChars: 2000 },
  limits: { institution: 120, motivation: 400, why: 200, whyMin: 10, hoursMax: 40, areasMax: 4, minFillMinutes: 5 },
};
const ORDER = ['intro', 'profile', 'scenario', 'quiz', 'conduct', 'review'];

function fakeServer(options) {
  const opts = options || {};
  const state = { app: null, saves: [], honeypots: [] };
  const dto = () => (state.app ? Object.assign({ quiz: { version: 'v1', objectives: OBJ, conduct: CND }, quizLocked: !!state.app.data.quiz }, state.app) : null);
  const overview = () => ({ success: true, enabled: true, open: opts.open !== false, windowDays: 7, batchEveryDays: 15, nextReviewOn: '2026-11-05', vacanciesNote: null, mine: state.app ? { status: state.app.status, step: state.app.step } : null });
  return {
    state,
    handlers: {
      apiGetFeatureFlags: () => ({ success: true, flags: { selection_enabled: opts.flag !== false } }),
      apiSelectionOverview: () => overview(),
      apiSelectionGetMine: () => ({ success: true, application: dto(), content: CONTENT }),
      apiSelectionStart: () => {
        if (!state.app) state.app = { id: 'app-1', status: 'draft', step: 'intro', startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 6.5 * 86400000).toISOString(), submittedAt: null, receiptCode: null, data: {}, result: null };
        return { success: true, application: dto(), content: CONTENT };
      },
      apiSelectionSaveStep: (args) => {
        const input = args[1] || {};
        state.saves.push(input.step);
        state.honeypots.push(input.website || '');
        if (opts.failScenarioOnce && input.step === 'scenario' && !state.failed) { state.failed = true; return { success: false, message: 'Retire e-mail, telefone ou documento do texto: não precisamos dessas informações aqui.' }; }
        if (ORDER.slice(0, ORDER.indexOf(input.step)).some((s) => s !== 'review' && !state.app.data[s])) return { success: false, message: 'Conclua as etapas anteriores antes desta.' };
        state.app.data[input.step] = input.data;
        state.app.step = ORDER[Math.min(ORDER.indexOf(input.step) + 1, ORDER.length - 1)];
        return { success: true, message: 'Etapa salva.', warnings: [], application: dto() };
      },
      apiSelectionSubmit: () => {
        state.app.status = 'submitted'; state.app.step = 'done'; state.app.receiptCode = 'LAIFT-ABCD2345';
        state.app.result = { objectives: { correct: 6, total: 8 }, conduct: { points: 5, max: 6 } };
        state.app.submittedAt = new Date().toISOString();
        return { success: true, message: 'Inscrição enviada. Guarde o comprovante.', application: dto() };
      },
      apiSelectionWithdraw: () => { state.app.status = 'withdrawn'; return { success: true, message: 'Inscrição retirada.' }; },
    },
  };
}

async function openPanel(app) {
  await app.page.click('#app-menu-btn');
  await app.page.click('#app-menu [data-panel="panel-selection"]');
  await app.page.waitForSelector('#selection-root .sel-card', { timeout: 10000 });
}

const text = (n) => ('Mecanismo de ação, evidência e impacto clínico. ').repeat(Math.ceil(n / 47)).slice(0, n);

async function jornada(rotulo, viewport) {
  const server = fakeServer({ failScenarioOnce: true });
  const app = await startApp({ role: 'visitor', viewport, workerHandlers: server.handlers });
  const { page } = app;
  try {
    await app.login();
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-flag-selection-enabled'), null, { timeout: 10000 });
    await openPanel(app);
    check(await page.locator('#sel-start').isVisible(), `${rotulo}: a apresentação mostra "Começar inscrição"`);
    check((await page.locator('.sel-points li').count()) === 4, `${rotulo}: quatro pontos explicam o processo`);
    check(/05\/11/.test(await page.locator('#selection-root').innerText()), `${rotulo}: mostra a data da próxima análise`);
    await axeGate(page, `${rotulo}: apresentação`);

    await page.click('#sel-start');
    await page.waitForSelector('[data-sel-step="intro"]');
    check((await page.locator('.sel-step[aria-current="step"]').innerText()).includes('Aceite'), `${rotulo}: o passo a passo marca a etapa atual`);
    check(await page.locator('.sel-step:has-text("Questões")').isDisabled(), `${rotulo}: etapas futuras ficam desabilitadas`);
    const isca = await page.locator('.sel-ot').boundingBox();
    check(!isca || isca.x < 0 || isca.width <= 1, `${rotulo}: a isca fica fora da tela`);

    for (const name of ['acceptedEdital', 'acceptedPrivacy', 'acceptedAiNotice']) await page.check(`input[name="${name}"]`);
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="profile"]');

    await page.selectOption('#sel-course', 'Farmácia');
    await page.fill('#sel-institution', 'UNINASSAU');
    await page.selectOption('#sel-semester', '5');
    await page.check('input[name="areas"][value="Toxicologia"]');
    await page.fill('#sel-hours', '6');
    await page.check('input[name="days"][value="seg"]');
    await page.check('input[name="shifts"][value="noite"]');
    await axeGate(page, `${rotulo}: perfil`);
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="scenario"]');

    await page.fill('#sel-scenario', text(120));
    check(/no mínimo/.test(await page.locator('#sel-counter').innerText()), `${rotulo}: o contador avisa que falta texto`);
    await page.fill('#sel-scenario', text(500) + ' contato: a@b.com');
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('.sel-live.error', { timeout: 5000 });
    check(/e-mail|contato|documento/i.test(await page.locator('.sel-live').innerText()), `${rotulo}: o erro do servidor aparece para a pessoa`);
    await page.fill('#sel-scenario', text(500));
    check(/de 2000 caracteres/.test(await page.locator('#sel-counter').innerText()), `${rotulo}: contador ok dentro do limite`);
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="quiz"]');

    check((await page.locator('.sel-question').count()) === 8, `${rotulo}: oito questões objetivas`);
    await page.click('#selection-root button[type="submit"]');
    check(/Responda todas/.test(await page.locator('.sel-live').innerText()), `${rotulo}: pede para responder todas antes de salvar`);
    for (const q of OBJ) await page.check(`input[name="q-${q.id}"][value="b"]`);
    await axeGate(page, `${rotulo}: questões`);
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="conduct"]');

    for (const q of CND) {
      await page.check(`input[name="best-${q.id}"][value="a"]`);
      await page.check(`input[name="worst-${q.id}"][value="d"]`);
      await page.fill(`#why-${q.id}`, 'Porque é o mais responsável e transparente.');
    }
    await page.click('#selection-root button[type="submit"]');
    await page.waitForSelector('[data-sel-step="review"]');
    check((await page.locator('.sel-sum').count()) === 5, `${rotulo}: a revisão lista as cinco partes`);

    await page.click('.sel-step:has-text("Questões")');
    await page.waitForSelector('[data-sel-step="quiz"]');
    check(/só podem ser respondidas uma vez|já foram registradas/.test(await page.locator('.sel-intro').innerText()), `${rotulo}: questões respondidas não voltam a ser editáveis`);
    await page.click('.sel-step:has-text("Revisão")');
    await page.waitForSelector('[data-sel-step="review"]');

    await page.click('#sel-send');
    await page.waitForSelector('[data-sel-step="status"]');
    const status = await page.locator('#selection-root').innerText();
    check(/LAIFT-ABCD2345/.test(status), `${rotulo}: mostra o comprovante`);
    check(/6 de 8/.test(status) && /5 de 6/.test(status), `${rotulo}: mostra o resumo de apoio (sem eliminar ninguém)`);
    check((await page.locator('.sel-timeline li').count()) === 4, `${rotulo}: linha do tempo do andamento`);
    await axeGate(page, `${rotulo}: status`);
    check(JSON.stringify(server.state.saves) === JSON.stringify(['intro', 'profile', 'scenario', 'scenario', 'quiz', 'conduct']), `${rotulo}: etapas salvas em ordem (${server.state.saves.join(',')})`);
    check(server.state.honeypots.every((v) => v === ''), `${rotulo}: a isca nunca é preenchida`);
    check(app.errors.length === 0, `${rotulo}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function portoes() {
  // Flag desligada: o item some do menu.
  const off = fakeServer({ flag: false });
  const a = await startApp({ role: 'visitor', viewport: { width: 390, height: 800 }, workerHandlers: off.handlers });
  try {
    await a.login();
    await a.page.click('#app-menu-btn');
    check(!(await a.page.locator('#app-menu [data-panel="panel-selection"]').isVisible()), 'flag desligada: "Processo seletivo" não aparece no menu');
  } finally { await a.close(); }

  // Membro não vê o item (escopo "visitor").
  const on = fakeServer({});
  const m = await startApp({ role: 'member', viewport: { width: 390, height: 800 }, workerHandlers: on.handlers });
  try {
    await m.login();
    await m.page.waitForFunction(() => document.documentElement.hasAttribute('data-flag-selection-enabled'), null, { timeout: 10000 });
    await m.page.click('#app-menu-btn');
    check(!(await m.page.locator('#app-menu [data-panel="panel-selection"]').isVisible()), 'membro: "Processo seletivo" não aparece no menu');
  } finally { await m.close(); }

  // Inscrições fechadas: aviso no lugar do botão.
  const closed = fakeServer({ open: false });
  const c = await startApp({ role: 'visitor', viewport: { width: 390, height: 800 }, workerHandlers: closed.handlers });
  try {
    await c.login();
    await c.page.waitForFunction(() => document.documentElement.hasAttribute('data-flag-selection-enabled'), null, { timeout: 10000 });
    await openPanel(c);
    check((await c.page.locator('#sel-start').count()) === 0 && /fechadas/.test(await c.page.locator('.sel-notice').innerText()), 'fechado: sem botão de começar e com aviso');
  } finally { await c.close(); }
}

// Página pública do processo seletivo no modo contínuo: datas do fluxo contínuo no lugar de "a divulgar" e botão para a jornada.
async function paginaPublica() {
  const server = fakeServer({});
  const app = await startApp({ viewport: { width: 390, height: 844 }, workerHandlers: server.handlers });
  try {
    await app.page.goto(app.baseUrl + 'processo-seletivo.html');
    await app.page.waitForFunction(() => document.documentElement.getAttribute('data-processo') === 'aberto', null, { timeout: 10000 });
    const texto = await app.page.locator('main').innerText();
    check(/Inscrições abertas o ano todo/.test(texto), 'página pública: mostra "inscrições abertas o ano todo"');
    check(/próxima análise: 05[/]11/i.test(texto), 'página pública: mostra a próxima análise (05/11)');
    check(!/Datas: a divulgar/.test(texto), 'página pública: sem "a divulgar" nas datas');
    const cta = app.page.locator('#liga-cta-inscricao');
    check((await cta.getAttribute('href')) === './#inscricao' && (await cta.isVisible()), 'página pública: o botão leva à jornada na plataforma (#inscricao)');
    check((await cta.getAttribute('target')) === null, 'página pública: o botão abre na mesma aba');
    check(app.errors.length === 0, 'página pública: sem erros de JavaScript');
  } finally { await app.close(); }
}

module.exports = async function selection() {
  await jornada('celular 390', { width: 390, height: 844 });
  await jornada('desktop 1280', { width: 1280, height: 800 });
  await portoes();
  await paginaPublica();
};
