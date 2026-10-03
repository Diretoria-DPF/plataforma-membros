/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-layers-mobile.e2e.js — painel de Camadas legível e utilizável em
 * qualquer tela (crime C7 da Onda 3). Antes o painel entrava no <body> sem
 * posição e ficava atrás do canvas: só os interruptores apareciam, sem nome
 * nem fundo.
 */
const { startApp, check } = require('./harness');

async function runAt(viewport) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 30000 });
    await frame.waitForTimeout(500);
    await frame.evaluate(() => window.AtlasShell.toggleLayers());
    await frame.waitForTimeout(300);
    const info = await frame.evaluate(() => {
      const host = document.querySelector('.atlas-layers-host');
      if (!host || host.hidden) return { open: false };
      const r = host.getBoundingClientRect();
      const rows = [...host.querySelectorAll('.atlas-layers-label')];
      const first = rows[0] && rows[0].getBoundingClientRect();
      const hit = first ? document.elementFromPoint(first.left + first.width / 2, first.top + first.height / 2) : null;
      return {
        open: true,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
        width: Math.round(r.width), vw: innerWidth,
        bg: getComputedStyle(host.querySelector('.atlas-layers-panel')).backgroundColor,
        labelOnTop: !!hit && host.contains(hit),
        labelText: rows[0] ? rows[0].textContent.trim() : '',
        rows: rows.length,
        // Todos os nomes inteiros na horizontal: sem corte e dentro do painel.
        cut: rows.filter((l) => {
          const lr = l.getBoundingClientRect();
          return l.scrollWidth > l.clientWidth + 1 || lr.width < 10 || lr.left < r.left || lr.right > r.right;
        }).map((l) => l.textContent.trim()),
        names: rows.map((l) => l.textContent.trim()),
      };
    });
    check(info.open, `${label}: painel de camadas abre`);
    if (!info.open) return;
    check(info.inside, `${label}: painel inteiro dentro da tela`);
    check(info.labelOnTop, `${label}: nome da camada visível por cima do canvas ("${info.labelText}")`);
    check(info.bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(info.bg), `${label}: painel com fundo (${info.bg})`);
    check(info.rows >= 7, `${label}: as 7 camadas listadas (${info.rows})`);
    check(['Pele', 'Músculos', 'Esqueleto'].every((n) => info.names.includes(n)) && info.cut.length === 0,
      `${label}: nomes das camadas inteiros${info.cut.length ? ' — cortados: ' + info.cut.join(', ') : ''}`);
    // Interruptor funciona: liga a Pele e o estado da camada muda.
    const toggled = await frame.evaluate(async () => {
      const I = window.__atlasInternals;
      const before = !!(I.store.get().layers.pele || {}).visible;
      const sw = [...document.querySelectorAll('.atlas-layers-host .atlas-layers-row')]
        .find((row) => /Pele/.test(row.textContent)).querySelector('.atlas-layers-toggle');
      sw.click();
      await new Promise((r) => setTimeout(r, 150));
      const after = !!(I.store.get().layers.pele || {}).visible;
      sw.click();
      return { before, after };
    });
    check(toggled.before !== toggled.after, `${label}: interruptor da Pele muda a camada (${JSON.stringify(toggled)})`);
    if (viewport.width < 600) check(info.width >= info.vw - 24, `${label}: celular — painel de largura total (${info.width}/${info.vw} px)`);

    // Fecha pelo botão × (no celular a barra pode ficar coberta)
    await frame.locator('.atlas-layers-close').click();
    await frame.waitForTimeout(150);
    check(await frame.evaluate(() => document.querySelector('.atlas-layers-host').hidden), `${label}: botão fechar fecha o painel`);
    // E pelo Esc
    await frame.evaluate(() => window.AtlasShell.toggleLayers());
    await frame.locator('.atlas-layers-host input').first().focus();
    await app.page.keyboard.press('Escape');
    await frame.waitForTimeout(150);
    check(await frame.evaluate(() => document.querySelector('.atlas-layers-host').hidden), `${label}: Esc fecha o painel`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasLayersMobile() {
  for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await runAt(vp);
  }
};
