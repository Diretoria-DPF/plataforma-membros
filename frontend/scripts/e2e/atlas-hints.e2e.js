/**
 * atlas-hints.e2e.js — dicas contextuais (js/ui/hints.js).
 * 1ª seleção mostra a dica (anunciada por role="status"); × dispensa e ela
 * não volta; abrir Ferramentas mostra a dica dela depois do intervalo; com
 * campo focado ou no Quiz, nada aparece.
 */
const { startApp, check } = require('./harness');

const pill = (frame) => frame.evaluate(() => {
  const p = document.querySelector('.atlas-hint');
  return p ? { visible: !p.hidden, id: p.dataset.hint || null, role: p.getAttribute('role'), text: p.textContent } : null;
});
const select = (frame, sid) => frame.evaluate((s) => {
  const I = window.__atlasInternals;
  I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: s, source: 'pick' });
}, sid);
async function resetHints(frame) {
  await frame.evaluate(() => { localStorage.removeItem('atlas.hints.v1'); window.__e2eOldDoc = true; });
  await frame.evaluate(() => window.location.reload()).catch(() => {});
  // A navegação destrói o contexto: tenta até o atlas novo responder.
  for (let i = 0; i < 60; i++) {
    const ready = await frame.evaluate(() => !window.__e2eOldDoc && !!window.__atlasInternals && document.readyState === 'complete').catch(() => false);
    if (ready) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

module.exports = async function atlasHints() {
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 }, atlasFlags: { onboarding: false } });
  try {
    await app.login();
    let frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });

    await select(frame, 'za:femur-r');
    await frame.waitForTimeout(200);
    const p1 = await pill(frame);
    check(p1 && p1.visible && p1.id === 'primeira-selecao' && p1.role === 'status', `1ª seleção mostra "Deslize a ficha…" anunciada (${JSON.stringify(p1)})`);
    await frame.locator('.atlas-hint-close').click();
    const p2 = await pill(frame);
    const stored = await frame.evaluate(() => localStorage.getItem('atlas.hints.v1'));
    check(p2 && !p2.visible && /primeira-selecao/.test(stored), `× dispensa e fica registrada (${stored})`);
    await select(frame, 'za:liver');
    await frame.waitForTimeout(200);
    check(!(await pill(frame)).visible, 'a mesma dica não volta');

    await frame.waitForTimeout(2100); // intervalo mínimo entre dicas
    await frame.click('#atlas-toolbar-tools');
    await frame.waitForTimeout(200);
    const p3 = await pill(frame);
    check(p3 && p3.visible && p3.id === 'ferramentas', `abrir Ferramentas mostra a dica dela (${JSON.stringify(p3)})`);
    await frame.locator('.atlas-hint-close').click();
    await frame.evaluate(() => window.AtlasShell.toggleTools());

    // Digitando: nada aparece.
    await resetHints(frame);
    await frame.evaluate(() => {
      const i = document.createElement('input');
      i.id = 'e2e-campo'; document.body.appendChild(i); i.focus();
    });
    await select(frame, 'za:femur-r');
    await frame.waitForTimeout(200);
    check(!(await pill(frame)).visible, 'com um campo de texto focado a dica não aparece');

    // Quiz: nada aparece.
    await resetHints(frame);
    await frame.evaluate(() => window.AtlasShell.setMode('quiz'));
    await frame.waitForTimeout(500);
    await select(frame, 'za:femur-r');
    await frame.waitForTimeout(200);
    check(!(await pill(frame)).visible, 'durante o Quiz a dica não aparece');
    check(app.errors.length === 0, 'atlas-hints: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
