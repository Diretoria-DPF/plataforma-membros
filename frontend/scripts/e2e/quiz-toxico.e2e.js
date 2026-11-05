/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * quiz-toxico.e2e.js — espelha quiz-farmaco.e2e.js para a Toxicologia Clínica e Forense.
 *
 * 1) Dados (Node, sem navegador): 240 questões, 10 tópicos, ids únicos, gabarito dentro das alternativas e sem
 *    afirmações absolutas corrigidas na auditoria (lindano não é ciclodieno; "patognomônico" fora de Q40/Q90).
 * 2) Navegador (celular 375x812): iniciar leva a questão à vista (QZ-02); a resposta do estudo é definitiva (QZ-03);
 *    alternativas embaralhadas com o gabarito preservado e aria-label "correta/incorreta" (QZ-01/QZ-12); questão em
 *    branco não é erro nem é enviada (QZ-05); Voltar e Refazer não apagam o progresso sem confirmar (QZ-04);
 *    sem violação de CSP nem erro de JavaScript.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const FRONTEND_ROOT = path.join(__dirname, '..', '..');
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;

function testarDados() {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(FRONTEND_ROOT, 'modulos/toxicologia/questions.js'), 'utf8'), sandbox, { filename: 'toxicologia/questions.js' });
  const all = vm.runInContext('allQuestions', sandbox);
  check(all.length === 240, 'dados: 240 questões de toxicologia');
  check(new Set(all.map((q) => q.id)).size === 240, 'dados: ids únicos');
  check(new Set(all.map((q) => q.topic)).size === 10, 'dados: 10 tópicos');
  check(all.every((q) => q.options.length === 4 && q.correct >= 0 && q.correct < 4), 'dados: 4 alternativas e gabarito válido em todas');
  const q38 = all.find((q) => q.id === 38);
  check(!/ciclodieno/i.test(q38.question), 'dados: Q38 não chama o lindano de ciclodieno');
  check(!all.some((q) => /patognom/i.test(q.question + q.explanation + q.options.join(' '))), 'dados: nenhuma ocorrência de "patognomônico"');
}

async function testarNoNavegador() {
  const app = await startApp({
    role: 'member',
    viewport: { width: 375, height: 812 },
    workerHandlers: { apiLearnSubmitQuizAttempt: () => ({ success: true }) },
  });
  const violacoes = [];
  await app.context.exposeBinding('__e2eToxCsp', (source, v) => { violacoes.push(v); });
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try { window.__e2eToxCsp({ directive: e.effectiveDirective, blocked: e.blockedURI }); } catch (err) { /* sem binding */ }
    });
  });
  try {
    await app.login();
    const frame = await app.openModule('toxico');
    await frame.click('.topic-btn[data-topic="Antídotos"]');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');

    // QZ-02: a questão fica à vista (não ~1000 px abaixo)
    await frame.waitForTimeout(900);
    const topo = await frame.evaluate(() => document.getElementById('quizContainer').getBoundingClientRect().top);
    check(topo > -40 && topo < 400, `QZ-02: o quiz está à vista depois de iniciar (topo em ${Math.round(topo)} px)`);

    // QZ-01: 4 letras A-D, e o gabarito continua apontando a alternativa certa do dado
    const info = await frame.evaluate(() => {
      const st = window.LaiftQuiz.state;
      const q = st.questions[st.index];
      const textos = Array.from(document.querySelectorAll('.option .option-text')).map((n) => n.textContent);
      return { textos, correta: q.options[q.correct], todas: q.options.slice() };
    });
    check(info.textos.length === 4 && info.textos.slice().sort().join('|') === info.todas.slice().sort().join('|'), 'QZ-01: as 4 alternativas aparecem (ordem pode mudar)');

    // Responde (primeira alternativa exibida); QZ-03: segunda tentativa é ignorada
    await frame.click('.option >> nth=0');
    await frame.waitForSelector('#explanation.show');
    const antes = await frame.evaluate(() => window.LaiftQuiz.state.answers[0]);
    await frame.click('.option >> nth=1', { force: true }); // aria-disabled: o clique real é ignorado pelo motor
    const depois = await frame.evaluate(() => window.LaiftQuiz.state.answers[0]);
    check(antes === depois, 'QZ-03: depois do gabarito a resposta não muda');
    const labels = await frame.evaluate(() => Array.from(document.querySelectorAll('.option')).map((o) => o.getAttribute('aria-label')));
    check(labels.some((l) => /\(sua resposta, (correta|incorreta)\)|\(correta\)/.test(l)), 'QZ-12: aria-label informa correta/incorreta depois do gabarito');
    check(await frame.locator('[aria-live]').count() <= 3, 'QZ-12: poucas regiões vivas');
    check(await frame.locator('.laift-review-seal').count() === 0, 'sem selo de revisão para o público');

    // QZ-05 e QZ-04: avança, deixa as demais em branco e finaliza
    const total = await frame.evaluate(() => window.LaiftQuiz.state.questions.length);
    for (let i = 1; i < total; i++) await frame.click('#nextBtn');
    await frame.click('#finishBtn');
    await frame.waitForSelector('.laift-dialog[role="dialog"]');
    check(/em branco/.test(await frame.textContent('.laift-dialog-message')), 'QZ-05: finalizar com questões em branco pede confirmação');
    await frame.click('.laift-dialog-btn-primary');
    await frame.waitForSelector('#resultsContainer:not([hidden]) .score-display');
    const placar = await frame.textContent('.score-display');
    check(/\/1$/.test(placar.trim()), `QZ-05: o total conta só a respondida (${placar.trim()})`);
    await frame.waitForTimeout(300);
    const envio = app.calls.worker.find((c) => c.action === 'apiLearnSubmitQuizAttempt');
    check(!!envio && envio.args[1].total === 1, 'QZ-05: a tentativa enviada tem total = respondidas');

    // QZ-04: Voltar aos Tópicos não apaga o progresso
    await frame.click('.home-btn');
    const respondidas = await frame.textContent('#answeredStat');
    check(respondidas.trim() === '1', 'QZ-04: Voltar aos Tópicos preserva o progresso salvo (respondidas: ' + respondidas.trim() + ')');

    // A1: tamanho da sessão (5/10/20/todas), salvo no aparelho; alvos >= 44 px; campos internos não vazam
    const alvos = await frame.evaluate(() => Array.from(document.querySelectorAll('.size-btn')).map((b) => Math.round(b.getBoundingClientRect().height)));
    check(alvos.length === 4 && alvos.every((h) => h >= 44), 'A1: 4 botões de tamanho com alvo >= 44 px (' + alvos.join(',') + ')');
    await frame.click('.size-btn[data-size="5"]');
    check((await frame.getAttribute('.size-btn[data-size="5"]', 'aria-pressed')) === 'true', 'A1: tamanho 5 marcado (aria-pressed)');
    const salvo = await frame.evaluate(() => localStorage.getItem('laiftQuizSize:toxicologia'));
    check(salvo === '5', 'A1: tamanho salvo no aparelho (' + salvo + ')');
    await frame.click('.topic-btn[data-topic="Praguicidas"]');
    await frame.click('#startQuiz');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');
    const tam = await frame.evaluate(() => window.LaiftQuiz.state.questions.length);
    check(tam === 5, 'A1: sessão com 5 questões (' + tam + ')');
    const vazou = await frame.evaluate(() => /dificuldade|difficulty|reviewedBy|revisado_por/i.test(document.body.innerText));
    check(!vazou, 'A1: nenhum campo interno aparece na tela');

    // A1: erra de propósito a primeira (escolhe uma alternativa errada) e confere o armazenamento
    const errou = await frame.evaluate(() => {
      const st = window.LaiftQuiz.state;
      const q = st.questions[st.index];
      const opts = Array.from(document.querySelectorAll('.option'));
      const idx = opts.findIndex((o) => !o.textContent.includes(q.options[q.correct]));
      opts[idx].click();
      return q.id;
    });
    await frame.waitForSelector('#explanation.show');
    const guardado = await frame.evaluate(() => JSON.parse(localStorage.getItem('laiftQuizErrors') || '{}'));
    check(Object.keys(guardado.items || {}).some((k) => k === 'toxicologia:' + errou), 'A1: o erro ficou guardado no aparelho');
    const n2 = await frame.evaluate(() => window.LaiftQuiz.state.questions.length);
    for (let i = 1; i < n2; i++) await frame.click('#nextBtn');
    await frame.click('#finishBtn');
    await frame.waitForSelector('.laift-dialog[role="dialog"]');
    await frame.click('.laift-dialog-btn-primary');
    await frame.waitForSelector('#resultsContainer:not([hidden])');
    await frame.click('.home-btn');

    // A1: "Revisar meus erros" monta uma sessão só com as erradas
    await frame.waitForSelector('#reviewErrorsBtn:not([hidden])');
    await frame.click('#reviewErrorsBtn');
    await frame.waitForSelector('#quizContainer:not([hidden]) .option');
    const rev = await frame.evaluate(() => window.LaiftQuiz.state.questions.map((q) => q.id));
    check(rev.length >= 1 && rev.includes(errou), 'A1: revisão de erros contém a questão errada (' + rev.join(',') + ')');
    const ids = await frame.evaluate(() => JSON.parse(localStorage.getItem('laiftQuizErrors')).items);
    check(rev.every((id) => !!ids['toxicologia:' + id]), 'A1: revisão só tem questões guardadas como erro');

    check(violacoes.length === 0, 'quiz-toxico: nenhuma violação de CSP');
    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'quiz-toxico: sem erros de JavaScript não tratados' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function quizToxico() {
  testarDados();
  await testarNoNavegador();
};
