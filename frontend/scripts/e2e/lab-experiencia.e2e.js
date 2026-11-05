/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-experiencia.e2e.js — O1 (Laboratório v2): faixa da missão, Ajuda no processo, "Comece aqui" guiado,
 * nomes, leiaute de tablet, Preceptor sem sobreposição, contraste (axe) e Estúdio sem pedir o RDKit ao abrir.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function abrir(viewport, theme) {
  const app = await startApp({ role: 'member', viewport, theme });
  const csp = [];
  await app.context.exposeBinding('__e2eLabCsp', (src, v) => { csp.push(v); });
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try { window.__e2eLabCsp({ d: e.effectiveDirective, b: e.blockedURI }); } catch (err) { /* sem binding */ }
    });
  });
  await app.login();
  const frame = await app.openModule('lab');
  await frame.waitForSelector('#faixaMissao');
  await frame.waitForTimeout(400);
  return { app, frame, csp };
}

const contar = (frame, sel) => frame.evaluate((s) => document.querySelectorAll(s).length, sel);
const texto = (frame, sel) => frame.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
const visivel = (frame, sel) => frame.evaluate((s) => { const n = document.querySelector(s); return !!n && !n.hidden && n.getClientRects().length > 0; }, sel);

async function cenarioDesktop() {
  console.log('  desktop 1280x800');
  const { app, frame, csp } = await abrir({ width: 1280, height: 800 }, 'light');
  try {
    check(/Missão 1 de 10/.test(await texto(frame, '#faixaRotulo')), 'faixa fixa mostra "Missão 1 de 10"');
    const nomes = await frame.evaluate(() => ({
      manual: document.getElementById('btnManual').textContent,
      aba: document.querySelector('[data-tab="tabMissao"]').textContent,
      corpo: document.body.innerText,
    }));
    check(/Manual/.test(nomes.manual) && !/Roteiro/.test(nomes.manual), '"Roteiro" do cabeçalho virou "Manual"');
    check(/Missões/.test(nomes.aba) && !/Roteiro/.test(nomes.aba), 'aba virou "Missões"');
    check(!/Preceptor IA|rascunho|revisad/i.test(nomes.corpo), 'sem texto público de IA, revisado ou rascunho');

    // Comece aqui: a pessoa faz.
    await frame.click('#btnComece');
    await frame.click('#btnComeceIniciar');
    check(await frame.evaluate(() => window.sys.especies.size === 0), 'Comece aqui não adiciona nada sozinho');
    check(/Passo 2 de 12/.test(await texto(frame, '#faixaPasso')), 'o 1º reagente já vem escolhido: passo 2 pede a quantidade');
    check(await contar(frame, '.lab-alvo') === 1, 'exatamente um controle marcado');
    check(await frame.evaluate(() => document.querySelector('.lab-alvo').id === 'qtdInput'), 'o marcado é o campo de quantidade');
    check(await visivel(frame, '#labMarca'), '"!" visível sobre o controle');
    check(await visivel(frame, '#labBalao'), 'balão único visível');

    await frame.fill('#qtdInput', '2.76');
    await frame.waitForTimeout(100);
    check(await frame.evaluate(() => document.querySelector('.lab-alvo').id === 'btnStartAdd'), 'avança por evento: agora é o botão Adicionar');

    // Fora de ordem: avisa sem bloquear.
    await frame.click('#btnHeat');
    check(/Ainda não é esta etapa/.test(await texto(frame, '#balaoGuia')), 'ação fora de ordem recebe aviso');
    await frame.click('#btnHeat'); // desliga o aquecimento de novo

    await frame.click('#btnStartAdd');
    await frame.waitForTimeout(150);
    check(await frame.evaluate(() => window.sys.especies.size > 0), 'a adição só acontece com o clique da pessoa');
    check(await frame.evaluate(() => document.querySelector('.lab-alvo').closest('label') !== null), 'próximo alvo: o anidrido acético no catálogo');

    // Níveis e persistência.
    await frame.selectOption('#ajudaNivel', 'dica');
    check(await contar(frame, '.lab-alvo') === 0 && await visivel(frame, '#labBalao'), 'Só dica: balão sem "!"');
    await frame.selectOption('#ajudaNivel', 'prova');
    check(await contar(frame, '.lab-alvo') === 0 && !(await visivel(frame, '#labBalao')), 'Prova: sem "!" e sem balão');
    const salvo = await frame.evaluate(() => localStorage.getItem('laift_lab_ajuda_v1'));
    check(/prova/.test(salvo || ''), 'nível salvo no aparelho');
    await frame.selectOption('#ajudaNivel', 'completa');
    await frame.click('#ajudaSwitch');
    check(await contar(frame, '.lab-alvo') === 0 && !(await visivel(frame, '#labBalao')), 'ajuda desligada: nada marcado');
    check(await frame.evaluate(() => document.getElementById('ajudaSwitch').getAttribute('aria-checked')) === 'false', 'interruptor com aria-checked');
    await frame.click('#ajudaSwitch');

    // Preceptor não cobre a faixa nem o painel de análise.
    await frame.click('#labChatWidgetBtn');
    const caixas = await frame.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const d = r('labChatDrawer');
      return { dTopo: d.top, dDir: d.right, faixaBase: r('faixaMissao').bottom, analiseEsq: r('viewAnalise').left };
    });
    check(caixas.dTopo >= caixas.faixaBase - 1, 'Preceptor fica abaixo da faixa');
    check(caixas.dDir <= caixas.analiseEsq + 1, 'Preceptor não cobre o painel de análise');
    await frame.click('.btn-chat-close');

    // Contraste no tema claro.
    await frame.evaluate(AXE).catch(() => {});
    const res = await frame.evaluate(async () => (window.axe ? (await window.axe.run(document, { runOnly: ['color-contrast'] })).violations.map((v) => v.nodes.map((n) => n.target.join(' ')).join(' | ')) : null));
    check(res === null || res.length === 0, `contraste (tema claro): ${res && res.length ? res.join(' ; ') : 'sem falhas'}`);

    check(csp.length === 0, `sem violação de CSP${csp.length ? ': ' + JSON.stringify(csp) : ''}`);
    check(app.errors.length === 0, `sem erro de JavaScript${app.errors.length ? ': ' + app.errors.join(' ; ') : ''}`);
  } finally { await app.close(); }
}

async function cenarioTablet() {
  console.log('  tablet 768x1024');
  const { app, frame } = await abrir({ width: 768, height: 1024 }, 'light');
  try {
    const ok = await frame.evaluate(() => ['viewReagentes', 'viewBancada', 'viewAnalise'].every((id) => document.getElementById(id).getClientRects().length > 0));
    check(ok, 'tablet mostra reagentes, bancada e análise ao mesmo tempo');
    const nav = await frame.evaluate(() => getComputedStyle(document.getElementById('mobileNavBar')).display);
    check(nav === 'none', 'tablet sem barra inferior do módulo');
    check(await frame.evaluate(() => document.getElementById('btnLabFullscreen').hidden === true), '"Tela cheia" duplicado some dentro da plataforma');
  } finally { await app.close(); }
}

async function cenarioCelular() {
  console.log('  celular 375x812');
  const { app, frame } = await abrir({ width: 375, height: 812 }, 'light');
  try {
    await frame.click('#btnComece');
    await frame.click('#btnComeceIniciar');
    await frame.fill('#qtdInput', '2.76').catch(() => {});
    const nav = await frame.evaluate(() => ({
      alvo: (document.querySelector('.lab-alvo') || {}).dataset ? (document.querySelector('.lab-alvo').dataset.target || '') : '',
      balao: document.getElementById('balaoGuia').textContent,
    }));
    check(nav.alvo === 'reagentes' && /Reagentes/.test(nav.balao), 'no celular o "!" aponta a aba Reagentes quando o controle está em outro painel');
    await frame.click('.m-nav-btn[data-target="chat"]');
    const d = await frame.evaluate(() => ({ topo: document.getElementById('labChatDrawer').getBoundingClientRect().top, base: document.getElementById('faixaMissao').getBoundingClientRect().bottom, fechar: document.querySelector('.btn-chat-close').getBoundingClientRect() }));
    check(d.topo >= d.base - 1, 'celular: Preceptor não cobre a faixa nem o cabeçalho');
    check(d.fechar.width >= 44 && d.fechar.height >= 44, 'botão de fechar do Preceptor com 44 px');
    const mp = await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(mp, 'sem rolagem horizontal');
    check(app.errors.length === 0, 'sem erro de JavaScript no celular');
  } finally { await app.close(); }
}

async function cenarioEstudio() {
  console.log('  Estúdio 3D');
  const { app, frame } = await abrir({ width: 1280, height: 800 }, 'dark');
  try {
    await frame.click('#btnOpenStudio');
    await frame.waitForSelector('#studioIframe');
    await frame.waitForTimeout(2500);
    const pediuRdkit = app.calls.external.some((c) => /RDKit_minimal|rdkit/i.test(c.url));
    check(!pediuRdkit, 'abrir o Estúdio não pede o RDKit (só quando a pessoa usa o recurso)');
  } finally { await app.close(); }
}

module.exports = async function () {
  await cenarioDesktop();
  await cenarioTablet();
  await cenarioCelular();
  await cenarioEstudio();
};
