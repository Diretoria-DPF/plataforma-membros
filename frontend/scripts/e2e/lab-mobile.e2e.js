/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-mobile.e2e.js — QA mobile do Laboratório: sem rolagem horizontal, campos de 16 px, bancada com altura útil,
 * 1ª adição em 2 toques com o botão visível, paisagem com barra inferior alcançável.
 */
const fs = require('fs');
const { startApp, check } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const contraste = (fr) => fr.evaluate(async () => {
  const r = await axe.run(document, { runOnly: ['wcag2aa'] });
  return r.violations.filter((v) => v.id === 'color-contrast').flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
});

async function abrir(viewport, theme = 'light') {
  const app = await startApp({ role: 'member', viewport, theme });
  await app.login();
  const frame = await app.openModule('lab');
  await frame.waitForSelector('#faixaMissao');
  await frame.waitForTimeout(400);
  return { app, frame };
}

async function retrato(w, h, alturaMin, exigeSemRolar = true) {
  console.log(`  retrato ${w}x${h}`);
  const { app, frame } = await abrir({ width: w, height: h });
  try {
    const m = await frame.evaluate(() => {
      const g = document.getElementById('mainGrid').getBoundingClientRect();
      const nav = document.getElementById('mobileNavBar').getBoundingClientRect();
      return { grid: g.height, navBottom: nav.bottom, ih: innerHeight, hs: document.documentElement.scrollWidth - innerWidth };
    });
    check(m.hs <= 0, 'sem rolagem horizontal');
    check(m.grid >= alturaMin, `bancada com altura útil (${Math.round(m.grid)} px, mínimo ${alturaMin})`);
    check(m.navBottom <= m.ih + 1, 'barra inferior do Laboratório dentro da janela do módulo');
    const fr = await app.page.evaluate(() => { const i = document.querySelector('.learn-frame:not(.hidden)'); const r = i.getBoundingClientRect(); const n = document.getElementById('app-nav').getBoundingClientRect(); return { fim: r.bottom, nav: n.top }; });
    check(fr.fim <= fr.nav + 1, 'o módulo não termina por baixo da barra da plataforma');
    await frame.tap('.m-nav-btn[data-target=reagentes]');
    await frame.waitForTimeout(200);
    const fontes = await frame.evaluate(() => [...document.querySelectorAll('select,input[type=number],input[type=text]')].filter((e) => e.getClientRects().length).map((e) => parseFloat(getComputedStyle(e).fontSize)));
    check(fontes.length > 0 && fontes.every((f) => f >= 16), `campos visíveis com 16 px ou mais (${fontes.join(',')})`);
    const pos = await frame.evaluate(() => { const b = document.getElementById('btnStartAdd').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, ih: innerHeight, h: b.height }; });
    // Janela do módulo abaixo de 540 px (ex.: 320x568): vale o modo com rolagem da janela; ali basta o alvo de 44 px.
    check(pos.h >= 44 && (!exigeSemRolar || (pos.top >= 0 && pos.bottom <= pos.ih)), `"Adicionar" com 44 px${exigeSemRolar ? ' e visível sem rolar' : ''} (${Math.round(pos.top)}-${Math.round(pos.bottom)} de ${pos.ih})`);
    await frame.tap('#btnStartAdd');
    await frame.waitForTimeout(250);
    check(await frame.evaluate(() => window.sys.especies.size > 0), '1ª adição na bancada em 2 toques (Reagentes, Adicionar)');
    check(app.errors.length === 0, `sem erro de JavaScript (${app.errors.join(' | ')})`);
  } finally { await app.close(); }
}

async function paisagem() {
  console.log('  paisagem 667x375');
  const { app, frame } = await abrir({ width: 667, height: 375 });
  try {
    const m = await frame.evaluate(() => {
      const nav = document.getElementById('mobileNavBar').getBoundingClientRect();
      return { rola: document.documentElement.scrollHeight > innerHeight, navBottom: nav.bottom, ih: innerHeight, grid: document.getElementById('mainGrid').getBoundingClientRect().height, hs: document.documentElement.scrollWidth - innerWidth };
    });
    check(m.rola, 'a janela do módulo rola na paisagem');
    check(m.grid >= 250, `bancada com altura própria (${Math.round(m.grid)} px)`);
    check(m.navBottom <= m.ih + 1, 'barra inferior fixa no fim da janela');
    check(m.hs <= 0, 'sem rolagem horizontal');
  } finally { await app.close(); }
}

async function cores(theme) {
  console.log(`  contraste AA (axe) no tema ${theme}: abas da bancada, trilha e Estúdio`);
  const { app, frame } = await abrir({ width: 360, height: 800 }, theme);
  try {
    await frame.evaluate(AXE);
    for (const aba of ['tabMol', 'tabMissao']) {
      await frame.evaluate((a) => { window.switchRightTab(a); window.setMobileView('analise'); }, aba);
      await frame.waitForTimeout(500); // as transições de cor (0,25 s) terminam antes da medição
      const ruins = await contraste(frame);
      check(ruins.length === 0, `aba ${aba} sem falha de contraste (${ruins.join(' | ')})`);
    }
    await frame.evaluate(() => window.setMobileView('reagentes'));
    const rr = await contraste(frame);
    check(rr.length === 0, `reagentes sem falha de contraste (${rr.join(' | ')})`);
    await frame.click('#btnOpenStudio');
    const sf = await (await frame.waitForSelector('#studioIframe')).contentFrame();
    await sf.waitForLoadState('load').catch(() => {});
    await sf.waitForTimeout(800);
    await sf.evaluate(AXE);
    const rs = await contraste(sf);
    check(rs.length === 0, `Estúdio 3D sem falha de contraste (${rs.join(' | ')})`);
    const busca = await sf.evaluate(() => { const i = document.getElementById('studioSearchInput'); return { f: parseFloat(getComputedStyle(i).fontSize), h: i.getBoundingClientRect().height }; });
    check(busca.f >= 16 && busca.h >= 44, `busca do Estúdio com 16 px e 44 px de altura (${busca.f}/${Math.round(busca.h)})`);
  } finally { await app.close(); }
}

module.exports = async function () {
  await retrato(320, 568, 280, false);
  await retrato(360, 740, 280);
  await retrato(375, 667, 240);
  await retrato(390, 844, 340);
  await paisagem();
  await cores('light');
  await cores('dark');
};
