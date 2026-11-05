/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * para-hoje.e2e.js — A3: "Para hoje" unificado, a Guia sugerindo o próximo passo e a revisão espaçada de erros
 * guardada no aparelho (nada sai para o servidor).
 *  - Aprender v2 e Início v3: com erros vencidos no aparelho da conta, "Revisar N erros" é o primeiro item; sem erros,
 *    a lista é a de sempre; outra conta no mesmo aparelho não vê os erros;
 *  - tocar em "Revisar" abre o módulo certo e, no Quiz, a sessão de revisão começa sozinha;
 *  - a Guia diz quantos erros vencem e oferece o botão que abre o módulo;
 *  - nenhuma chamada à Worker leva dado da revisão.
 */
const { startApp, check } = require('./harness');

const DAY = 24 * 60 * 60 * 1000;
const EMAIL = 'ana@exemplo.com';

const ENGAGEMENT = () => ({
  success: true,
  engagement: {
    today: new Date().toISOString().slice(0, 10),
    streak: { current: 2, best: 3, activeToday: true },
    goal: { target: 10, todayQuestions: 3, reached: false, persisted: true },
    dailyQuizDone: false,
    last: { module: 'farmacologia', activity: 'quiz_estudo', at: new Date().toISOString() },
  },
});
const STATS = () => ({ success: true, stats: { accuracyPct: 70, questionsAnswered: 10, quizzesCompleted: 1, clinicalCasesCompleted: 0, labFormulations: 0, badges: [], byModule: {} } });

function handlers(extraFlags) {
  return {
    apiGetFeatureFlags: async () => ({ success: true, flags: Object.assign({ learn_v2_enabled: true, chatbot_enabled: true }, extraFlags || {}) }),
    apiLearnGetEngagement: ENGAGEMENT,
    apiLearnGetMyStats: STATS,
    apiLearnGetWeakTopics: async () => ({ success: true, topics: [] }),
    apiAssistantChat: async () => ({ success: true, source: 'fallback', reply: 'Ainda não sei responder isso.', actions: [], suggestions: [] }),
  };
}

/** Grava no aparelho (mesma chave e mesmo dono de quiz-errors.js): 3 erros de Farmacologia, 1 do Atlas, 1 da Clínica. */
async function seed(page, email) {
  await page.evaluate(([mail, day]) => {
    let h = 0x811c9dc5;
    const s = String(mail).trim().toLowerCase();
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    const owner = h.toString(16);
    const old = new Date(Date.now() - 3 * day).toISOString();
    const due = new Date(Date.now() - day).toISOString();
    const items = {};
    [['farmacologia', 1, 'Farmacodinâmica'], ['farmacologia', 2, 'Farmacodinâmica'], ['farmacologia', 3, 'Farmacodinâmica'],
      ['anatomia', 'caso_a', 'Fêmur'], ['clinica', 'caso_tox_01', 'Intoxicação']].forEach(([module, id, topic]) => {
      items[module + ':' + id] = { module, id, topic, wrong: 1, streak: 0, last: old, due };
    });
    window.localStorage.setItem('laiftQuizErrors', JSON.stringify({ v: 1, owner, items }));
  }, [email, DAY]);
}

async function listaDoAprender(page) {
  await page.waitForSelector('#learn-v2 .l2-today');
  return page.$$eval('#learn-v2 .l2-today li', (n) => n.map((li) => ({ title: li.querySelector('strong').textContent, sub: li.querySelector('small').textContent })));
}

module.exports = async function () {
  // ---- Aprender v2 com erros vencidos ----
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers() });
  try {
    await app.login();
    await seed(app.page, EMAIL);
    await app.showPanel('panel-learn');
    const itens = await listaDoAprender(app.page);
    check(itens.length === 4, 'Aprender: revisão, quiz do dia, missão da semana e simulado (' + itens.length + ' itens)');
    check(itens[0].title === 'Revisar 5 erros', 'Aprender: "Revisar 5 erros" é o primeiro item (' + itens[0].title + ')');
    check(/Farmacologia 3/.test(itens[0].sub) && /Atlas 3D 1/.test(itens[0].sub) && /Clínica virtual 1/.test(itens[0].sub), 'Aprender: o detalhe diz quantos erros em cada módulo (' + itens[0].sub + ')');
    check(itens[1].title === 'Quiz do dia', 'Aprender: o quiz do dia vem logo depois');
    check(itens[2].title === 'Missão da semana', 'Aprender: a missão da semana vem depois do quiz (' + itens[2].title + ')');

    // Tocar em "Revisar": abre Farmacologia (mais erros) e a sessão de revisão começa sozinha.
    await app.page.click('#learn-v2 .l2-today li:first-child button');
    await app.page.waitForSelector('#learn-viewer:not(.hidden)');
    check(((await app.page.textContent('#learn-viewer-title')) || '').includes('Farmacologia'), 'Revisar abre o módulo com mais erros (Farmacologia)');
    const el = await app.page.waitForSelector('.learn-frame:not(.hidden)');
    const frame = await el.contentFrame();
    await frame.waitForFunction(() => window.LaiftQuiz && window.LaiftQuiz.state && window.LaiftQuiz.state.active, null, { timeout: 15000 });
    const sessao = await frame.evaluate(() => ({ n: window.LaiftQuiz.state.questions.length, ids: window.LaiftQuiz.state.questions.map((q) => q.id).sort() }));
    check(sessao.n === 3 && sessao.ids.join() === '1,2,3', 'a sessão do Quiz traz exatamente os 3 erros guardados (' + sessao.ids.join() + ')');

    const chamadas = app.calls.worker.map((c) => c.action + ' ' + JSON.stringify(c.args));
    check(!chamadas.some((c) => /caso_a|caso_tox_01|laiftQuizErrors|revis/i.test(c)), 'nenhuma chamada à Worker leva dado da revisão');

    // Voltar ao hub e abrir de novo: o iframe já aberto não reinicia o simulado em andamento.
    await app.page.click('#learn-back');
    await app.page.waitForSelector('#learn-v2 .l2-today');
    await app.page.click('#learn-v2 .l2-today li:first-child button');
    await app.page.waitForSelector('#learn-viewer:not(.hidden)');
    check(await frame.evaluate(() => window.LaiftQuiz.state.active && window.LaiftQuiz.state.questions.length === 3), 'reabrir não interrompe a sessão em andamento');
    await app.page.click('#learn-back');

    // Outra conta no mesmo aparelho não vê os erros.
    await app.page.evaluate(() => window.localStorage.setItem('laiftQuizErrors', window.localStorage.getItem('laiftQuizErrors').replace(/"owner":"[0-9a-f]+"/, '"owner":"deadbeef"')));
    await app.showPanel('panel-home');
    await app.showPanel('panel-learn');
    const outra = await listaDoAprender(app.page);
    check(outra.length === 4 && outra.every((i) => !/Revisar/.test(i.title)), 'erros de outra conta no aparelho não aparecem');
    check(app.errors.length === 0, 'sem erros de JavaScript (' + app.errors.join(' | ') + ')');
  } finally { await app.close(); }

  // ---- A Guia sugere o próximo passo e o botão abre o módulo ----
  const guia = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers() });
  try {
    await guia.login();
    await seed(guia.page, EMAIL);
    await guia.page.waitForSelector('#lia-launcher:not(.hidden)');
    await guia.page.click('#lia-launcher');
    await guia.page.waitForSelector('#lia-log .lia-msg-lia');
    const texto = (await guia.page.textContent('#lia-log .lia-msg-lia')) || '';
    check(/Você tem 5 erros para rever hoje/.test(texto) && /Vale começar por Farmacologia/.test(texto), 'a Guia diz quantos erros vencem e por onde começar');
    check(!/\bLia\b/.test(texto), 'o texto da Guia não usa o nome interno');
    const botao = guia.page.locator('#lia-log .lia-chip-action');
    check((await botao.count()) === 1 && /Revisar 3 erros/.test((await botao.textContent()) || ''), 'a Guia oferece "Revisar 3 erros · Farmacologia"');
    await botao.click();
    await guia.page.waitForSelector('#learn-viewer:not(.hidden)');
    check(((await guia.page.textContent('#learn-viewer-title')) || '').includes('Farmacologia'), 'o botão da Guia abre o MÓDULO, não só o painel Aprender');
    check(!guia.calls.worker.some((c) => /caso_a|laiftQuizErrors/.test(JSON.stringify(c.args))), 'a Guia não envia dado da revisão ao servidor');
  } finally { await guia.close(); }

  // ---- Sem erros no aparelho: a lista é a de sempre e a Guia fica calada ----
  const limpo = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers() });
  try {
    await limpo.login();
    await limpo.page.waitForSelector('#lia-launcher:not(.hidden)');
    await limpo.page.click('#lia-launcher');
    await limpo.page.waitForSelector('#lia-log .lia-msg-lia');
    check((await limpo.page.locator('#lia-log .lia-chip-action').count()) === 0 && !/para rever hoje/.test((await limpo.page.textContent('#lia-log')) || ''), 'sem erros, a Guia não sugere revisão');
    await limpo.showPanel('panel-learn');
    const itens = await listaDoAprender(limpo.page);
    check(itens.length === 4 && itens[0].title === 'Quiz do dia' && itens[1].title === 'Missão da semana', 'sem erros, "Para hoje" começa por quiz do dia e missão da semana');
  } finally { await limpo.close(); }

  // ---- Início v3: o mesmo item de revisão no topo de "Para hoje" ----
  const v3 = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: handlers({ home_v2_enabled: true, learn_v2_enabled: false }) });
  try {
    await v3.login();
    await seed(v3.page, EMAIL);
    await v3.showPanel('panel-learn');
    await v3.showPanel('panel-home');
    await v3.page.waitForSelector('#home-v3 .v3-today');
    const linhas = await v3.page.$$eval('#home-v3 .v3-today li', (n) => n.map((li) => li.querySelector('strong').textContent));
    check(linhas[0] === 'Revisar 5 erros' && linhas[1] === 'Quiz do dia', 'Início v3: revisão e quiz do dia no topo de "Para hoje" (' + linhas.join(' | ') + ')');
    const alvo = await v3.page.$eval('#home-v3 .v3-today li:first-child button', (b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    check(alvo[0] >= 44 && alvo[1] >= 44, 'Início v3: alvo de toque de pelo menos 44 px (' + alvo.join('x') + ')');
    const overflowX = await v3.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'Início v3: a página não rola na horizontal');
    await v3.page.click('#home-v3 .v3-today li:first-child button');
    await v3.page.waitForSelector('#learn-viewer:not(.hidden)');
    check(((await v3.page.textContent('#learn-viewer-title')) || '').includes('Farmacologia'), 'Início v3: tocar em Revisar abre o módulo');
    check(v3.errors.length === 0, 'Início v3: sem erros de JavaScript (' + v3.errors.join(' | ') + ')');
  } finally { await v3.close(); }
};
