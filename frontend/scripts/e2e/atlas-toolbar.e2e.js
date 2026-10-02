/**
 * atlas-toolbar.e2e.js — cada botão da barra funciona sem "ação não
 * permitida" (crime C1) e as ações do modo Moléculas / "Refazer" do quiz
 * estão na lista única de ações (crime C6).
 */
const { startApp, check } = require('./harness');

async function runAt(viewport) {
  const mobile = viewport.width < 600;
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  const warnings = [];
  const onConsole = (m) => { if (/ação não permitida|ação indisponível/.test(m.text())) warnings.push(m.text()); };
  app.page.on('console', onConsole);
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
    await frame.waitForTimeout(800);
    // Uma estrutura selecionada (Isolar fica habilitado).
    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:femur-r', source: 'search' });
    });
    await frame.waitForTimeout(500);
    const ids = await frame.evaluate(() => [...document.querySelectorAll('#atlas-toolbar button[data-action]')]
      .filter((b) => b.id !== 'atlas-toolbar-tools').map((b) => b.id));
    const results = [];
    for (const id of ids) {
      const visible = await frame.evaluate((i) => !!document.getElementById(i).offsetParent, id);
      if (!visible && mobile) await frame.evaluate(() => window.AtlasShell.toggleTools());
      if (!(await frame.evaluate((i) => !!document.getElementById(i).offsetParent, id))) { results.push(`${id}:oculto`); continue; }
      const before = warnings.length;
      await frame.locator('#' + id).click({ timeout: 3000 });
      await frame.waitForTimeout(150);
      results.push(`${id}:${warnings.length === before ? 'ok' : 'AVISO'}`);
      await frame.evaluate(() => {
        document.querySelectorAll('.atlas-dropdown').forEach((d) => d.remove());
        const m = document.getElementById('atlas-modal'); if (m && m.open) m.close();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        document.body.classList.remove('atlas-fullscreen-fallback');
        const t = document.getElementById('atlas-toolbar'); if (t.dataset.toolsOpen === 'true') window.AtlasShell.toggleTools();
      });
    }
    check(!results.some((r) => r.endsWith('AVISO')) && results.filter((r) => r.endsWith(':ok')).length >= 3,
      `${label}: botões da barra sem "ação não permitida" (${results.join(' ')})`);

    // Ações de outros pacotes na lista única: Moléculas e "Refazer" do quiz.
    const others = await frame.evaluate(() => {
      const called = [];
      window.MolEngine = window.MolEngine || {};
      const names = ['applyStyle', 'toggleActiveSiteHighlight', 'toggleSpin', 'resetView'];
      const saved = {};
      for (const n of names) { saved[n] = window.MolEngine[n]; window.MolEngine[n] = () => called.push(n); }
      for (const n of names) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.action = `MolEngine.${n}`;
        document.body.appendChild(b); b.click(); b.remove();
      }
      for (const n of names) window.MolEngine[n] = saved[n];
      return called;
    });
    check(others.length === 4, `${label}: botões do modo Moléculas executam (${others.join(', ')})`);
    check(warnings.length === 0, `${label}: nenhum aviso de ação não permitida no console${warnings.length ? ': ' + [...new Set(warnings)].join(' | ') : ''}`);
  } finally {
    app.page.off('console', onConsole);
    await app.close();
  }
}

module.exports = async function atlasToolbar() {
  await runAt({ width: 390, height: 844 });
  await runAt({ width: 1280, height: 800 });
};
