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
  const app = await startApp({ role: 'member', viewport, theme, touch: true });
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

/** Retângulo de um elemento do módulo (ou null). */
const caixa = (frame, sel) => frame.evaluate((q) => { const e = document.querySelector(q); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);

async function paisagem(w, h, larga) {
  console.log(`  paisagem ${w}x${h}${larga ? '' : ' (estreita)'}`);
  const { app, frame } = await abrir({ width: w, height: h });
  try {
    const m = await frame.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(m.sh <= m.ih + 1, `o módulo não rola na paisagem (${m.sh} de ${m.ih} px)`);
    check(m.sw <= m.iw, 'sem rolagem horizontal');
    const shell = await app.page.evaluate(() => { const i = document.querySelector('.learn-frame:not(.hidden)').getBoundingClientRect(); const n = document.getElementById('app-nav'); return { fim: i.bottom, ih: innerHeight, nav: getComputedStyle(n).display }; });
    check(shell.nav === 'none' && shell.fim >= shell.ih - 1, 'a barra da plataforma sai e o módulo usa a altura toda');
    const bancada = await caixa(frame, '#viewBancada');
    const trilho = await caixa(frame, '#mobileNavBar');
    check(bancada && bancada.h >= 150, `bancada com altura própria (${bancada && Math.round(bancada.h)} px)`);
    check(trilho && trilho.r <= m.iw + 1 && trilho.b <= m.ih + 1 && trilho.w >= 44 && trilho.h >= m.ih - 2, 'trilho de navegação na borda direita, na altura toda');
    const botoes = await frame.evaluate(() => [...document.querySelectorAll('.m-nav-btn')].map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    check(botoes.every(([bw, bh]) => bw >= 44 && bh >= 44), 'botões do trilho com 44 px ou mais');
    const topo = await frame.evaluate(() => [...document.querySelectorAll('.lab-header .manual-btn')].map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    check(topo.every(([bw, bh]) => bw >= 44 && bh >= 44), 'botões do topo (ícones) com 44 px ou mais');
    if (larga) {
      const reag = await caixa(frame, '#viewReagentes');
      check(reag && reag.r <= bancada.x + 1 && reag.y <= bancada.y + 1, 'reagentes ao lado da bancada (esquerda)');
      const add = await caixa(frame, '#btnStartAdd');
      check(add && add.h >= 44 && add.b <= m.ih && add.y >= 0, `"Adicionar" visível sem rolar e com 44 px (${add && Math.round(add.y)}-${add && Math.round(add.b)})`);
      check(add && add.x < m.iw / 2, '"Adicionar" no lado esquerdo (polegar esquerdo)');
      await frame.tap('#btnStartAdd');
      await frame.waitForTimeout(250);
      check(await frame.evaluate(() => window.sys.especies.size > 0), '1ª adição em 1 toque na paisagem');
      await frame.tap('.m-nav-btn[data-target=analise]');
      await frame.waitForTimeout(200);
      check(await frame.evaluate(() => getComputedStyle(document.getElementById('viewAnalise')).display !== 'none' && getComputedStyle(document.getElementById('viewBancada')).display !== 'none'), 'Análise ao lado da bancada');
      const tab = await frame.evaluate(() => [...document.querySelectorAll('.rtab-btn')].map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
      check(tab.every(([bw, bh]) => bw >= 40 && bh >= 44), 'abas da Análise com altura de 44 px');
    } else {
      check(await frame.evaluate(() => getComputedStyle(document.getElementById('viewReagentes')).display === 'none'), 'estreita: a visão Bancada mostra só a bancada');
      await frame.tap('.m-nav-btn[data-target=reagentes]');
      await frame.waitForTimeout(200);
      const add = await caixa(frame, '#btnStartAdd');
      check(add && add.h >= 44 && add.b <= m.ih && add.y >= 0, 'estreita: Reagentes mostra o painel e "Adicionar" sem rolar');
    }
    const preceptor = await frame.evaluate(() => { document.getElementById('mobileNavBar').querySelector('[data-action="toggleLabChat"]').click(); const d = document.getElementById('labChatDrawer').getBoundingClientRect(); return { r: d.right, t: d.top, b: d.bottom, ih: innerHeight, iw: innerWidth }; });
    check(preceptor.t >= 0 && preceptor.b <= preceptor.ih && preceptor.r <= preceptor.iw - 60, 'gaveta do Preceptor dentro da janela e sem cobrir o trilho');
    check(app.errors.length === 0, `sem erro de JavaScript (${app.errors.join(' | ')})`);
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
  await paisagem(667, 375, true);
  await paisagem(844, 390, true);
  await paisagem(568, 320, false);
  await cores('light');
  await cores('dark');
};
