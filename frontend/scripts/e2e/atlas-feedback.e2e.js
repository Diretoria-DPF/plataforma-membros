/**
 * atlas-feedback.e2e.js — resposta visual ao tocar (Onda 2).
 *   - Pulso no destaque: anima alguns quadros e o 3D volta a ficar parado.
 *   - "Reduzir movimento": sem pulso (no máximo 1–2 quadros da seleção).
 *   - Quiz: acerto mostra os pontos; erro mostra a resposta certa e a
 *     explicação do caso, com "Próximo caso".
 */
const { startApp, check } = require('./harness');

const renders = (frame) => frame.evaluate(() => window.__atlasPerf.getStats().renders);

async function settle(app, frame) {
  for (let i = 0; i < 20; i++) {
    const a = await renders(frame);
    await app.page.waitForTimeout(600);
    if ((await renders(frame)) === a) return true;
  }
  return false;
}

async function pulseRun(reducedMotion) {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
  try {
    if (reducedMotion) await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 30000 });
    await settle(app, frame);
    const before = await renders(frame);
    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:femur-r', source: 'pick' });
    });
    await app.page.waitForTimeout(700);
    const during = (await renders(frame)) - before;
    const stopped = await settle(app, frame);
    return { during, stopped, errors: app.errors };
  } finally {
    await app.close();
  }
}

module.exports = async function atlasFeedback() {
  // O pulso dura 400 ms de RELÓGIO: no Chromium sem GPU (quadros lentos) cabe
  // em poucos quadros; o número exato de quadros é coberto pelo teste
  // unitário (scripts/atlas/selection.test.mjs).
  const normal = await pulseRun(false);
  const reduced = await pulseRun(true);
  check(normal.during > reduced.during && normal.during >= 3 && normal.stopped,
    `pulso ao selecionar anima (${normal.during} quadros contra ${reduced.during} sem pulso) e depois o 3D para de redesenhar (${normal.stopped})`);
  check(reduced.during <= 3 && reduced.stopped, `com "reduzir movimento" não há pulso (${reduced.during} quadros)`);
  check(normal.errors.length + reduced.errors.length === 0, 'atlas-feedback (pulso): sem erros de JavaScript');

  // Quiz: erro com explicação, acerto com pontos.
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
    // Peek útil: nome, selos de sistema/lado, selo de revisão, "Novo" na 1ª
    // abertura e "Ver mais" abrindo a ficha (painel em metade).
    const selectAndRead = (sid) => frame.evaluate(async (s) => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: s, source: 'search' });
      const t0 = Date.now();
      while (Date.now() - t0 < 10000) {
        const sheet = document.getElementById('atlas-sheet');
        const name = sheet.querySelector('.atlas-card-name');
        if (name && sheet.querySelector('.atlas-card-status, .atlas-card-tabbar')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 400)); // 2ª renderização (com o conteúdo) e foco
      const sheet = document.getElementById('atlas-sheet');
      const q = (sel) => sheet.querySelector(sel);
      return {
        name: q('.atlas-card-name') && q('.atlas-card-name').textContent,
        system: q('.atlas-card-system') && q('.atlas-card-system').textContent,
        side: q('.atlas-card-side') && q('.atlas-card-side').textContent,
        isNew: !!q('.atlas-card-new'),
        more: !!(q('.atlas-card-more') && q('.atlas-card-more').offsetParent),
        focusMore: document.activeElement === q('.atlas-card-more'),
      };
    }, sid);
    await frame.evaluate(() => { try { indexedDB.deleteDatabase('LAIFT_Study_DB'); } catch (e) { /* */ } });
    const kidney = await selectAndRead('za:kidney-r');
    check(kidney.name && kidney.system === 'Urinário' && kidney.side === 'Direito' && kidney.more,
      `peek mostra nome, sistema, lado e "Ver mais" (${JSON.stringify(kidney)})`);
    check(kidney.isNew, `1ª abertura mostra o chip "Novo" (${kidney.isNew})`);
    check(kidney.focusMore, `seleção pelo teclado/busca leva o foco a "Ver mais" (${kidney.focusMore})`);
    await frame.locator('#atlas-sheet .atlas-card-more').click();
    await frame.waitForTimeout(400);
    const state = await frame.evaluate(() => document.getElementById('atlas-sheet').dataset.sheetState);
    check(state === 'half', `"Ver mais" abre a ficha (painel em "${state}")`);
    await selectAndRead('za:liver');
    const again = await selectAndRead('za:kidney-r');
    check(!again.isNew, '"Novo" não aparece na segunda abertura');
    // Voltar do celular: tela cheia → metade; depois limpa a seleção.
    await frame.evaluate(() => window.AtlasSheet.snapFull());
    await frame.waitForTimeout(400);
    await frame.evaluate(() => history.back()); // o mesmo que o botão Voltar do Android (histórico da aba)
    await frame.waitForTimeout(400);
    const afterBack1 = await frame.evaluate(() => ({ state: document.getElementById('atlas-sheet').dataset.sheetState, sid: window.__atlasInternals.store.get().selectedSid }));
    await frame.evaluate(() => history.back()); // o mesmo que o botão Voltar do Android (histórico da aba)
    await frame.waitForTimeout(400);
    const afterBack2 = await frame.evaluate(() => ({ state: document.getElementById('atlas-sheet').dataset.sheetState, sid: window.__atlasInternals.store.get().selectedSid, url: window.location.pathname }));
    check(afterBack1.state === 'half' && afterBack1.sid && !afterBack2.sid && /anatomia-3d/.test(afterBack2.url),
      `Voltar fecha do mais aberto para o menos e não sai do atlas (${JSON.stringify(afterBack1)} → ${JSON.stringify(afterBack2)})`);

    await frame.evaluate(() => window.AtlasShell.setMode('quiz'));
    await frame.waitForSelector('#quizQuestionCard .quiz-card', { timeout: 15000 });
    const wrong = await frame.evaluate(async () => {
      const { bus } = window.__atlasInternals;
      bus.emit(bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:femur-r', source: 'pick' }); // fêmur não é resposta de nenhum caso
      await new Promise((r) => setTimeout(r, 100));
      const fb = document.querySelector('#quizFeedback');
      return { kind: fb.dataset.kind, text: fb.textContent, next: !!fb.querySelector('.quiz-next'), hidden: fb.hidden };
    });
    check(!wrong.hidden && wrong.kind === 'erro' && /Resposta correta:/.test(wrong.text) && wrong.text.length > 80 && wrong.next,
      `erro no quiz mostra a resposta certa, a explicação e "Próximo caso" (${wrong.text.slice(0, 100)}…)`);
    await frame.locator('#quizFeedback .quiz-next').click();
    const right = await frame.evaluate(async () => {
      const { registry, bus } = window.__atlasInternals;
      const cases = await (await fetch('data/atlas/quiz-cases.json')).json();
      const text = document.querySelector('#quizQuestionCard').textContent;
      const caso = cases.find((c) => text.includes(c.prompt_pt.slice(0, 60)));
      const wanted = caso.correctSids || [caso.correctSid];
      const t0 = Date.now();
      let rec = null;
      while (!rec && Date.now() - t0 < 20000) {
        rec = wanted.map((sid) => registry.getBySid(sid)).find(Boolean);
        if (!rec) await new Promise((r) => setTimeout(r, 200));
      }
      bus.emit(bus.EVENTS.STRUCTURE_SELECT, { sid: rec.sid, source: 'pick' });
      await new Promise((r) => setTimeout(r, 100));
      const fb = document.querySelector('#quizFeedback');
      return { kind: fb.dataset.kind, text: fb.textContent, confetti: document.querySelectorAll('.quiz-confetti span').length, step: /Caso 2 de/.test(text) };
    });
    // 20 confetes em aparelho bom, 5 no nível gráfico baixo (o Chromium sem
    // GPU dos testes cai no baixo).
    check(right.step && right.kind === 'acerto' && /\+\d+ pontos/.test(right.text) && [5, 20].includes(right.confetti),
      `acerto mostra "+N pontos" e confetes conforme o aparelho (${right.text.slice(0, 60)}…; confetes: ${right.confetti})`);
    check(app.errors.length === 0, 'atlas-feedback (quiz): sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
