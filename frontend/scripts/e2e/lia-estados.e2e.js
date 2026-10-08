/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lia-estados.e2e.js — estados da Lia das ondas 2–4 (lia-props.js, lia-scenes.js, lia-props-art.js),
 * com os gatilhos reais. A Lia de cabeçalho monta ao abrir o painel e reage à tela corrente: abrir a Lia
 * em Aprender pede as peças; em aviso de nível 2 (gate de moderação) e em falha do chat (confusa), o estado muda.
 *  (a) lia-props-art.js é pedido só com a Lia aberta num módulo com peças, e uma única vez; se a arte
 *      não carrega, a Lia segue base, sem erro de JavaScript e sem erro no console;
 *  (b) prefers-reduced-motion mostra a pose final (peças aplicadas, nenhuma animação finita rodando);
 *  (c) a bolha de 48 px do launcher nunca recebe peças nem cenas;
 *  (d) axe sem violações serious/critical com a Lia nos estados aviso e confuso (tema claro e escuro).
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const ART = 'lia-props-art.js';
const LAUNCHER_PX = 48;
const AVISO_TEXT = 'Se continuar, vou precisar me retirar.';
const FLAGS = () => ({ success: true, flags: { ux_v2_enabled: true, chatbot_enabled: true } });
const AVISO_NIVEL_2 = () => ({ success: true, source: 'moderation', reply: AVISO_TEXT, message: AVISO_TEXT, actions: [], suggestions: [], moderation: { level: 2, suspended: false, until: null } });
const CHAT_FALHOU = () => ({ success: false, message: 'Servidor ocupado.' });

function iniciar(chat, opts) {
  const workerHandlers = { apiGetFeatureFlags: FLAGS };
  if (chat) workerHandlers.apiAssistantChat = chat;
  return startApp(Object.assign({ role: 'member', workerHandlers }, opts || {}));
}

/** Vai ao painel (se houver) e abre a Lia de cabeçalho. A Lia reage à tela corrente ao abrir. */
async function abrirLiaEm(page, painel) {
  if (painel) await page.click(`#app-nav [data-panel="${painel}"]`);
  await page.waitForSelector('#lia-launcher:not(.hidden)');
  await page.click('#lia-launcher');
  await page.waitForSelector('#lia-panel:not(.hidden)');
}

async function fecharLia(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('#lia-panel.hidden', { state: 'attached' });
}

async function perguntar(page, texto) {
  await page.fill('#lia-input', texto);
  await page.press('#lia-input', 'Enter');
}

/** Pedidos de rede para lia-props-art.js (o script de peças). */
function pedidosDaArte(page) {
  const pedidos = [];
  page.on('request', (req) => { if (req.url().endsWith('/' + ART)) pedidos.push(req.url()); });
  return pedidos;
}

/** Dentro da página: peças aplicadas no painel e animações finitas ainda rodando (infinitas não contam). */
function estadoDaLia() {
  const host = document.querySelector('#lia-panel .lia');
  const finitas = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
  return {
    extras: host ? (host.getAttribute('data-extras') || '').split(' ').filter(Boolean) : [],
    animacoesFinitas: finitas.length,
  };
}

async function cargaSobDemanda() {
  const app = await iniciar();
  try {
    const page = app.page;
    const pedidos = pedidosDaArte(page);
    await app.login();
    await abrirLiaEm(page, null);
    check(pedidos.length === 0, 'Lia aberta no Início não pede lia-props-art.js');
    await fecharLia(page);
    await abrirLiaEm(page, 'panel-learn');
    await page.waitForFunction(() => !!window.LIA_PROPS_ART, null, { timeout: 10000 });
    check(pedidos.length === 1, `Lia aberta em Aprender pede lia-props-art.js uma única vez (${pedidos.length})`);
    await fecharLia(page);
    await abrirLiaEm(page, null);
    await page.waitForTimeout(500);
    check(pedidos.length === 1, 'reabrir a Lia em Aprender não pede a arte de novo (cache na sessão)');
    const bolha = await page.evaluate(() => {
      const figura = document.querySelector('#lia-launcher .lia-launcher-figure').getBoundingClientRect();
      return {
        peças: document.querySelectorAll('#lia-launcher [id^="lia-pv-"], #lia-launcher [data-extras]').length,
        figura: [Math.round(figura.width), Math.round(figura.height)],
      };
    });
    check(bolha.peças === 0 && bolha.figura[0] === LAUNCHER_PX && bolha.figura[1] === LAUNCHER_PX, `bolha de ${LAUNCHER_PX} px sem peças nem cenas (${JSON.stringify(bolha)})`);
    check(app.errors.length === 0, `sem erro de JavaScript na carga da arte (${app.errors.join(' | ')})`);
  } finally {
    await app.close();
  }
}

async function arteFalha() {
  const app = await iniciar();
  const consoleErros = [];
  try {
    const page = app.page;
    await page.route('**/' + ART, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErros.push(msg.text()); });
    await app.login();
    await abrirLiaEm(page, 'panel-learn');
    await page.waitForTimeout(800);
    check((await page.evaluate(() => !!window.LIA_PROPS_ART)) === false, 'arte ausente: LIA_PROPS_ART não existe');
    check((await page.locator('#lia-panel .lia').count()) === 1, 'arte ausente: a Lia base continua na tela');
    check((await page.locator('#lia-panel [data-extras]').count()) === 0, 'arte ausente: sem peças (Lia base)');
    // O navegador registra "Failed to load resource" para o 404 da própria arte; isso é esperado. Qualquer outro erro conta.
    const outros = consoleErros.filter((texto) => !/Failed to load resource/.test(texto));
    check(app.errors.length === 0 && outros.length === 0, `arte ausente: sem erro de JavaScript e sem erro no console além do 404 da arte (${[...app.errors, ...outros].join(' | ')})`);
  } finally {
    await app.close();
  }
}

async function movimentoReduzido() {
  const app = await iniciar(AVISO_NIVEL_2);
  try {
    const page = app.page;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.login();
    await abrirLiaEm(page, 'panel-learn');
    await page.waitForFunction(() => !!window.LIA_PROPS_ART, null, { timeout: 10000 });
    await page.waitForTimeout(400);
    const aprender = await page.evaluate(estadoDaLia);
    check(aprender.extras.includes('folha') && aprender.animacoesFinitas === 0, `movimento reduzido, Aprender: pose final com peças e nenhuma animação (${JSON.stringify(aprender)})`);
    await fecharLia(page);
    await abrirLiaEm(page, 'panel-home');
    await perguntar(page, '[aviso2] oi');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia emitiu um alerta"]', { timeout: 10000 });
    await page.waitForTimeout(400);
    const aviso = await page.evaluate(estadoDaLia);
    check(aviso.extras.includes('cruzados') && aviso.animacoesFinitas === 0, `movimento reduzido, aviso: pose final (braços cruzados) e nenhuma animação (${JSON.stringify(aviso)})`);
  } finally {
    await app.close();
  }
}

async function axeNoEstado(tema, chat, enviar, aria, rotulo) {
  const app = await iniciar(chat, { theme: tema });
  try {
    await app.login();
    await abrirLiaEm(app.page, null);
    await perguntar(app.page, enviar);
    await app.page.waitForSelector(`#lia-panel .lia[aria-label="${aria}"]`, { timeout: 10000 });
    await axeGate(app.page, `${rotulo} (${tema})`);
  } finally {
    await app.close();
  }
}

module.exports = async function liaEstados() {
  await cargaSobDemanda();
  await arteFalha();
  await movimentoReduzido();
  await axeNoEstado('light', AVISO_NIVEL_2, '[aviso2] oi', 'Lia emitiu um alerta', 'Lia aviso nível 2');
  await axeNoEstado('dark', AVISO_NIVEL_2, '[aviso2] oi', 'Lia emitiu um alerta', 'Lia aviso nível 2');
  await axeNoEstado('light', CHAT_FALHOU, 'oi', 'Lia não entendeu', 'Lia confusa');
};
