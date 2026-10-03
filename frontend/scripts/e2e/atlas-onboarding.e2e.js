/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-onboarding.e2e.js — apresentação de 3 telas (js/ui/onboarding.js).
 * Abre uma vez; "Pular" em todas as telas com o foco inicial; Tab não sai do
 * diálogo; Esc fecha e marca como vista; não reabre (mesma aba nem nova
 * visita); reabre por "Como usar" sem regravar; link direto não interrompe;
 * no celular ocupa a tela toda.
 */
const { startApp, check } = require('./harness');

const reload = async (frame) => {
  await frame.evaluate(() => window.location.reload());
  await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
};
const isOpen = (frame) => frame.evaluate(() => {
  const d = document.getElementById('atlas-onboarding');
  return !!(d && d.open);
});

module.exports = async function atlasOnboarding() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, atlasFlags: { hints: false } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
    const opened = await frame.waitForFunction(() => {
      const d = document.getElementById('atlas-onboarding');
      return d && d.open;
    }, null, { timeout: 8000 }).then(() => true).catch(() => false);
    check(opened, 'apresentação abre sozinha na primeira visita');

    const first = await frame.evaluate(() => ({
      title: document.querySelector('#atlas-onboarding h2').textContent,
      focus: document.activeElement && document.activeElement.textContent,
      labelled: document.getElementById('atlas-onboarding').getAttribute('aria-labelledby'),
    }));
    check(first.title === 'Toque numa estrutura' && first.focus === 'Pular' && first.labelled === 'atlas-onboarding-title',
      `tela 1 com título <h2> e foco inicial em "Pular" (${JSON.stringify(first)})`);

    for (let i = 0; i < 7; i++) await app.page.keyboard.press('Tab');
    const trapped = await frame.evaluate(() => document.getElementById('atlas-onboarding').contains(document.activeElement));
    check(trapped, 'Tab não sai do diálogo (foco preso)');

    const screens = [];
    for (let i = 0; i < 2; i++) {
      await frame.locator('#atlas-onboarding .atlas-onb-primary').click();
      screens.push(await frame.evaluate(() => ({
        title: document.querySelector('#atlas-onboarding h2').textContent,
        skip: !!document.querySelector('#atlas-onboarding .atlas-onb-skip'),
        back: !!document.querySelector('#atlas-onboarding .atlas-onb-back'),
      })));
    }
    check(screens[0].title === 'Ferramentas essenciais' && screens[1].title === 'Comece por onde quiser' && screens.every((s) => s.skip && s.back),
      `"Próximo" passa pelas 3 telas; "Pular" e "Voltar" visíveis (${screens.map((s) => s.title).join(' → ')})`);
    await frame.locator('#atlas-onboarding .atlas-onb-back').click();
    check((await frame.evaluate(() => document.querySelector('#atlas-onboarding h2').textContent)) === 'Ferramentas essenciais', '"Voltar" volta uma tela');

    await app.page.keyboard.press('Escape');
    const afterEsc = await frame.evaluate(() => ({
      open: document.getElementById('atlas-onboarding').open,
      saved: (() => { try { return !!JSON.parse(localStorage.getItem('atlas.onboarded.v2')).at; } catch (e) { return false; } })(),
    }));
    check(!afterEsc.open && afterEsc.saved, `Esc fecha e marca como vista (${JSON.stringify(afterEsc)})`);

    await reload(frame);
    await frame.waitForTimeout(2500);
    check(!(await isOpen(frame)), 'recarregar na mesma aba não reabre');

    await frame.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* */ } });
    await reload(frame);
    await frame.waitForTimeout(2500);
    check(!(await isOpen(frame)), 'nova visita (outra sessão) não reabre dentro de 30 dias');

    const savedAt = await frame.evaluate(() => localStorage.getItem('atlas.onboarded.v2'));
    await frame.evaluate(() => window.AtlasShell.openMoreMenu());
    await frame.locator('.atlas-dropdown button', { hasText: 'Como usar' }).click();
    const replay = await isOpen(frame);
    await frame.locator('#atlas-onboarding .atlas-onb-skip').click();
    const savedAfter = await frame.evaluate(() => localStorage.getItem('atlas.onboarded.v2'));
    check(replay && savedAfter === savedAt, `"Como usar" reabre sem regravar a data (${replay})`);

    // Último quadro: "Ir para o Quiz" leva ao Quiz.
    await frame.evaluate(() => window.AtlasShell.openOnboarding());
    await frame.locator('#atlas-onboarding .atlas-onb-primary').click();
    await frame.locator('#atlas-onboarding .atlas-onb-primary').click();
    await frame.locator('#atlas-onboarding button', { hasText: 'Ir para o Quiz' }).click();
    await frame.waitForTimeout(300);
    check((await frame.evaluate(() => window.__atlasInternals.store.get().mode)) === 'quiz', '"Ir para o Quiz" abre o modo Quiz');
    await frame.evaluate(() => window.AtlasShell.setMode('explorar'));

    // Link direto não interrompe, mesmo para quem nunca viu.
    await frame.evaluate(() => { localStorage.removeItem('atlas.onboarded.v2'); sessionStorage.clear(); window.location.hash = '#sid=za:liver'; });
    await reload(frame);
    await frame.waitForTimeout(2500);
    check(!(await isOpen(frame)), 'aberto por link direto (#sid=…) não mostra a apresentação');
    check(app.errors.length === 0, 'atlas-onboarding: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }

  // Celular: tela cheia.
  const phone = await startApp({ role: 'member', viewport: { width: 390, height: 844 }, atlasFlags: { hints: false } });
  try {
    await phone.login();
    const frame = await phone.openModule('anatomia');
    await frame.waitForFunction(() => {
      const d = document.getElementById('atlas-onboarding');
      return d && d.open;
    }, null, { timeout: 15000 });
    const box = await frame.evaluate(() => {
      const r = document.getElementById('atlas-onboarding').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight };
    });
    check(box.w >= box.vw - 1 && box.h >= box.vh - 1, `no celular a apresentação ocupa a tela toda (${JSON.stringify(box)})`);
  } finally {
    await phone.close();
  }
};
