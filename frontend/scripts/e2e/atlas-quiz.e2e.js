/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-quiz.e2e.js — Quiz com escolha de sistema/dificuldade e sorteio (Onda 3.5, B.2).
 *  - Tela de escolha com contagem; filtros mudam o total.
 *  - Erro: a explicação aparece e a tela NÃO avança sozinha; "Próximo caso" avança.
 *  - Sessão salva a rodada (filtros + semente) e a retomada reproduz os casos.
 */
const { startApp, check } = require('./harness');

async function ready(frame) {
  await frame.waitForFunction(() => { const I = window.__atlasInternals; return !!I && I.store.get().loadedSystems.includes('esqueletico'); }, null, { timeout: 60000 });
}

module.exports = async function atlasQuiz() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, atlasFlags: { onboarding: false, hints: false, quizSetup: true } });
  try {
    await app.login();
    let frame = await app.openModule('anatomia');
    await ready(frame);
    await frame.evaluate(() => window.AtlasShell.setMode('quiz'));
    await frame.waitForSelector('#quizStartBtn', { timeout: 20000 });
    const info = async () => frame.evaluate(() => document.querySelector('.quiz-setup-info').textContent);
    check(/8 casos disponíveis; sorteio de 8/.test(await info()), `tela de escolha com o total (${await info()})`);
    await frame.selectOption('#quizSystem', 'digestorio');
    check(/2 casos disponíveis/.test(await info()), `filtro por sistema muda o total (${await info()})`);
    await frame.selectOption('#quizDifficulty', 'dificil');
    const none = await info();
    const disabled = await frame.evaluate(() => document.getElementById('quizStartBtn').disabled);
    check((/Nenhum caso/.test(none) && disabled) || /1 caso disponível/.test(none), `filtros combinados (${none})`);
    await frame.selectOption('#quizDifficulty', 'todas');

    await frame.locator('#quizStartBtn').click();
    await frame.waitForSelector('.quiz-step', { timeout: 10000 });
    const step = () => frame.evaluate(() => document.querySelector('.quiz-step').textContent);
    check(/Caso 1 de 2/.test(await step()), `rodada de 2 casos (${await step()})`);
    check(await frame.evaluate(() => /\d+s/.test(document.getElementById('quizTimer').textContent)), 'cronômetro visível');

    // erro: explicação aparece e não avança sozinho
    await frame.evaluate(() => window.__atlasInternals.selection.select('za:left-ventricle', 'pick'));
    await frame.waitForSelector('.quiz-explanation', { timeout: 10000 });
    check(await frame.evaluate(() => document.getElementById('quizFeedback').dataset.kind === 'erro' && !!document.querySelector('.quiz-next')), 'erro: explicação e botão "Próximo caso"');
    const progress = await frame.evaluate(() => window.__atlasInternals.contentStore && true);
    await frame.waitForTimeout(3500);
    check(/Caso 1 de 2/.test(await step()), 'erro: não avança sozinho (o aluno lê a explicação)');
    await frame.locator('.quiz-next').click();
    await frame.waitForFunction(() => /Caso 2 de 2/.test(document.querySelector('.quiz-step').textContent), null, { timeout: 5000 }).catch(() => {});
    check(/Caso 2 de 2/.test(await step()), 'o botão avança para o caso seguinte');

    // sessão: guarda a rodada e a retomada reproduz os casos
    await frame.waitForTimeout(800);
    const saved = await frame.evaluate(() => { try { return JSON.parse(localStorage.getItem('atlas.session.v1')); } catch (e) { return null; } });
    const sel = saved && saved.quiz && saved.quiz.selection;
    check(!!sel && sel.system === 'digestorio' && sel.difficulty === 'todas' && Number.isInteger(sel.seed), `sessão guarda a rodada (${JSON.stringify(sel)})`);
    const caseId = saved && saved.quiz && saved.quiz.caseId;
    await frame.goto(frame.url(), { waitUntil: 'load' });
    await ready(frame);
    const cont = await frame.waitForSelector('.atlas-continue', { timeout: 15000 }).then(() => true).catch(() => false);
    if (cont) {
      await frame.locator('.atlas-continue').click();
      await frame.waitForSelector('.quiz-step', { timeout: 15000 }).catch(() => {});
      check(/Caso 2 de 2/.test(await step()), 'retomada: volta ao caso 2 da mesma rodada');
    } else {
      check(false, `retomada: o chip Continuar apareceu (caso ${caseId})`);
    }
    check(app.errors.length === 0, 'atlas-quiz: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally { await app.close(); }
};
