/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * tutor-persona.e2e.js — personagem do Tutor em 3 variações (frontend/tutor-persona.js): figura e seletor "Escolha o
 * seu tutor" no cartão do Tutor (Aprender) e em Perfil > Memória de estudo, em 375x812 e 320x640, com axe, teclado,
 * escolha salva no aparelho, avatar na resposta, carga sob demanda e movimento desligado com reduced-motion.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const KEY = 'laift_tutor_persona_v1';
const TUTOR = {
  id: 'tutor-clinico', name: 'Tutor Clínico', version: '1.0.0', description: 'Tutor de estudo.', capabilities: ['explicar_mecanismo'],
  quota: { used: 0, limit: 30, remaining: 30, resetsAt: null }, memory: { available: false },
};
const LIST_ON = () => ({ success: true, alpha: true, apiVersion: 'agents/v1-alpha', agents: [TUTOR] });
const INVOKE = () => ({ success: true, alpha: true, traceId: 't1', reply: 'A atropina bloqueia receptores muscarínicos.', sources: [], usage: { tokensIn: 1, tokensOut: 1, estimated: false }, memory: { available: false, used: false } });
const VOCAB = { topics: [{ slug: 'farmacocinetica', label: 'Farmacocinética' }], preferences: [{ slug: 'ritmo', values: ['curto', 'detalhado'] }], goals: ['prova'] };
const MEMORY_GET = () => ({
  success: true, alpha: true, available: true, vocabulary: VOCAB, items: [],
  consent: { status: 'granted', current: true, needsReconsent: false, purposeVersion: 'memoria-2026-10-v1' },
  limits: { maxItems: 60, retentionUnusedDays: 180, retentionMaxMonths: 12 },
});

async function semRolagemHorizontal(page, nome) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `${nome}: sem rolagem horizontal`);
}

async function seletor(page, escopo, nome) {
  check(await page.locator(`${escopo} .tut-picker input[type="radio"]`).count() === 3, `${nome}: três opções de tutor`);
  check((await page.locator(`${escopo} .tut-picker legend`).textContent()) === 'Escolha o seu tutor', `${nome}: o grupo tem legenda`);
  const alturas = await page.locator(`${escopo} .tut-opt`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(alturas.every((h) => h >= 44), `${nome}: alvos de toque >= 44 px (${alturas.join(',')})`);
  check(await page.locator(`${escopo} .tut-picker [role="img"]`).count() === 0, `${nome}: prévias decorativas não duplicam o leitor de tela`);
}

async function cenario(viewport, rotulo) {
  const app = await startApp({ role: 'member', viewport, workerHandlers: { apiAgentsList: LIST_ON, apiAgentsInvoke: INVOKE, apiMemoryGet: MEMORY_GET } });
  try {
    const page = app.page;
    const baixou = [];
    page.on('request', (r) => { if (/tutor-persona/.test(r.url())) baixou.push(r.url()); });
    await app.login();
    await app.showPanel('panel-home');
    check(baixou.length === 0, `${rotulo}: a arte do Tutor não é baixada fora do Tutor (carga sob demanda)`);

    await app.showPanel('panel-learn');
    await page.waitForSelector('#agents-tutor .tut--card');
    check(baixou.length > 0, `${rotulo}: a arte é baixada ao abrir o Tutor`);
    check(await page.locator('#agents-tutor .tut--card svg').count() === 1, `${rotulo}: figura no cartão`);
    check(await page.locator('#agents-tutor .tut--card[role="img"]').count() === 1, `${rotulo}: a figura tem role img`);
    check((await page.getAttribute('#agents-tutor .tut--card', 'aria-label')).startsWith('Personagem do Tutor: '), `${rotulo}: rótulo da figura`);
    await page.click('#agents-tutor .agents-tutor-pick-sum');
    await seletor(page, '#agents-tutor', `${rotulo} cartão`);

    // Teclado: foca a opção marcada e desce com a seta.
    await page.focus('#agents-tutor .tut-picker input:checked');
    await page.keyboard.press('ArrowDown');
    const escolhido = await page.evaluate((k) => localStorage.getItem(k), KEY);
    check(escolhido === 'coruja', `${rotulo}: a seta escolhe o segundo tutor e salva no aparelho (${escolhido})`);
    check(await page.getAttribute('#agents-tutor .tut--card', 'data-persona') === 'coruja', `${rotulo}: a figura do cartão muda na hora`);
    check((await page.textContent('#agents-tutor .tut-sr')).includes('Coruja'), `${rotulo}: o leitor de tela recebe a confirmação`);

    // Pergunta: pensando -> explicando; avatar de 40 px na resposta.
    await page.fill('#agents-tutor-input', 'Como a atropina age?');
    await page.press('#agents-tutor-input', 'Control+Enter');
    await page.waitForSelector('#agents-tutor-log[aria-busy="false"]');
    await page.waitForSelector('#agents-tutor-log .tut--avatar');
    const av = await page.locator('#agents-tutor-log .tut--avatar').first().boundingBox();
    check(Math.round(av.width) === 40 && Math.round(av.height) === 40, `${rotulo}: avatar de 40 px na resposta`);
    check(await page.getAttribute('#agents-tutor-log .tut--avatar', 'aria-hidden') === 'true', `${rotulo}: avatar decorativo`);
    const estado = await page.getAttribute('#agents-tutor .tut--card', 'data-state');
    check(estado === 'speaking' || estado === 'idle', `${rotulo}: estado válido após a resposta (${estado})`);
    await semRolagemHorizontal(page, `${rotulo} Aprender`);
    await axeGate(page, `Tutor com personagem e seletor (${rotulo})`);

    // Perfil > Memória de estudo: a mesma escolha.
    await app.showPanel('panel-profile');
    await page.waitForSelector('#memory-card .tut-picker', { state: 'attached' });
    await seletor(page, '#memory-card', `${rotulo} memória`);
    check(await page.locator('#memory-card .tut-picker input:checked').getAttribute('value') === 'coruja', `${rotulo}: o Perfil mostra a escolha salva`);
    await page.locator('#memory-card .tut-opt', { hasText: 'Frasco' }).click();
    check(await page.evaluate((k) => localStorage.getItem(k), KEY) === 'frasco', `${rotulo}: escolher no Perfil salva`);
    await semRolagemHorizontal(page, `${rotulo} Perfil`);
    await axeGate(page, `Memória de estudo com seletor de tutor (${rotulo})`);
    await app.showPanel('panel-learn');
    check(await page.getAttribute('#agents-tutor .tut--card', 'data-persona') === 'frasco', `${rotulo}: a escolha do Perfil vale no cartão do Tutor`);
    check(app.errors.length === 0, `${rotulo}: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

async function movimentoReduzido() {
  const app = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: { apiAgentsList: LIST_ON } });
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.login();
    await app.showPanel('panel-learn');
    await app.page.waitForSelector('#agents-tutor .tut--card');
    const nome = await app.page.evaluate(() => getComputedStyle(document.querySelector('#agents-tutor .tut-body')).animationName);
    check(nome === 'none', `reduced-motion: sem animação (${nome})`);
  } finally {
    await app.close();
  }
}

module.exports = async function () {
  await cenario({ width: 375, height: 812 }, '375');
  await cenario({ width: 320, height: 640 }, '320');
  await movimentoReduzido();
};
