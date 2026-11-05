/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-motor.e2e.js — O3: "Processo guiado" com o motor novo (chave labMotor).
 * Desligado: nada muda na bancada. Ligado: o motor só baixa ao toque, roda o NaCl 0,9 % inteiro, sem violar a CSP.
 */
const { startApp, check } = require('./harness');

async function abrir(flags, viewport) {
  const app = await startApp({ role: 'member', viewport: viewport || { width: 1280, height: 800 }, theme: 'dark' });
  const csp = [];
  await app.context.exposeBinding('__e2eMotorCsp', (src, v) => { csp.push(v); });
  await app.context.addInitScript((f) => {
    if (f) window.__labFlags = f;
    document.addEventListener('securitypolicyviolation', (e) => {
      try { window.__e2eMotorCsp({ d: e.effectiveDirective, b: e.blockedURI }); } catch (err) { /* sem binding */ }
    });
  }, flags || null);
  await app.login();
  const frame = await app.openModule('lab');
  await frame.waitForSelector('#faixaMissao');
  await frame.waitForTimeout(300);
  return { app, frame, csp };
}

async function cenarioDesligado() {
  console.log('  chaves desligadas (rollback: ?flags=-nome ou __labFlags)');
  const { app, frame } = await abrir({ labMotor: false, labProdutos: false, labRegulacao: false });
  try {
    check(await frame.evaluate(() => !document.getElementById('btnProcessoGuiado')), 'sem botão "Processo guiado" com a chave desligada');
    check(await frame.evaluate(() => !document.getElementById('labAtalhos')), 'sem atalhos de Produtos e Regulação com as chaves desligadas');
    check(await frame.evaluate(() => typeof window.LabMotorProcesso === 'undefined'), 'motor não carregado');
    check(await frame.evaluate(() => window.LabMissoes.MISSOES.length === 10 && /Missão 1 de 10/.test(document.getElementById('faixaRotulo').textContent)), 'missões e faixa da O1 seguem iguais');
    check(app.errors.length === 0, 'sem erro de JavaScript');
  } finally { await app.close(); }
}

async function cenarioLigado(viewport, nome) {
  console.log(`  chave ligada (${nome})`);
  const { app, frame, csp } = await abrir({ labMotor: true }, viewport);
  try {
    check(await frame.evaluate(() => typeof window.LabMotorProcesso === 'undefined'), 'motor ainda não baixado antes do toque');
    await frame.evaluate(() => { if (window.switchRightTab) window.switchRightTab('tabMissao'); if (window.innerWidth < 640 && window.setMobileView) window.setMobileView('analise'); });
    const atalhos = await frame.evaluate(() => [...document.querySelectorAll('#labAtalhos a')].map((a) => ({ href: a.getAttribute('href'), h: Math.round(a.getBoundingClientRect().height), texto: a.textContent })));
    check(atalhos.length === 2 && atalhos[0].href === 'produtos/index.html' && atalhos[1].href === 'regulacao/index.html', `atalhos de Produtos e Regulação visíveis por padrão (${JSON.stringify(atalhos)})`);
    check(atalhos.every((a) => a.h >= 44), 'atalhos com alvo de toque de 44 px');
    await frame.evaluate(() => { if (window.switchRightTab) window.switchRightTab('tabMissao'); if (window.innerWidth < 640 && window.setMobileView) window.setMobileView('analise'); });
    await frame.click('#btnProcessoGuiado');
    await frame.waitForSelector('#labProcesso #lpProgresso');
    check(/Etapa 1 de 10: Paramentação/.test(await frame.textContent('#lpProgresso')), 'abre na etapa 1');
    check(/O que está acontecendo/.test(await frame.textContent('#lpAcontecendo')), 'mostra o que está acontecendo');
    const respostas = { 2: '0,90', 7: '308' };
    for (let i = 1; i <= 10; i++) {
      if (respostas[i]) await frame.fill('#lpResposta', respostas[i]);
      await frame.click('#lpExecutar');
      await frame.waitForTimeout(60);
    }
    check(/Lote conforme/.test(await frame.textContent('#lpRelatorio')), 'NaCl 0,9 % concluído e conforme');
    check(await frame.evaluate(() => document.querySelectorAll('#lpCaderno li').length > 0), 'caderno preenchido');
    await frame.click('#lpVoltar');
    check(/Etapa 10 de 10/.test(await frame.textContent('#lpProgresso')), 'voltar reabre a última etapa');
    await frame.click('#lpFechar');
    check(await frame.evaluate(() => !document.getElementById('labProcesso')), 'fechar remove o painel');
    check(await frame.evaluate(() => window.sys.especies.size === 0), 'a bancada clássica não foi tocada pelo processo guiado');
    check(csp.length === 0, `sem violação de CSP (${JSON.stringify(csp)})`);
    check(await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal');
    check(app.errors.length === 0, `sem erro de JavaScript (${app.errors.join(' | ')})`);
  } finally { await app.close(); }
}

module.exports = async function () {
  await cenarioDesligado();
  await cenarioLigado({ width: 1280, height: 800 }, 'desktop');
  await cenarioLigado({ width: 390, height: 844 }, 'celular');
};
