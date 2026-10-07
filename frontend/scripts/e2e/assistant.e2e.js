/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant.e2e.js — Lia, guia da plataforma (frontend/assistant.js).
 * Flag desligada = sem botão; ligada = conversa, botões que levam às telas,
 * botão fora da lista branca descartado, histórico só com perguntas da pessoa,
 * conversa zerada ao trocar de conta, "disabled" do servidor esconde a Lia.
 */
const { startApp, check } = require('./harness');

const FLAGS_ON = () => ({ success: true, flags: { chatbot_enabled: true } });

function liaReply(args) {
  const message = String((args[1] && args[1].message) || '').toLowerCase();
  if (message.includes('evento')) {
    return {
      success: true, source: 'live',
      reply: 'Eventos abertos agora:\n• Workshop de Toxicologia · qui 16/10 às 19:00',
      actions: [{ type: 'navigate', target: 'panel-events', label: 'Eventos' }],
      suggestions: ['Meu crachá'],
    };
  }
  if (message.includes('laborat')) {
    return {
      success: true, source: 'kb',
      reply: 'O Laboratório Virtual é uma bancada de ensino. Dentro dele fica o Estúdio 3D.',
      // O segundo botão é hostil: nunca pode aparecer nem funcionar.
      actions: [
        { type: 'open_module', target: 'lab', label: 'Laboratório Virtual' },
        { type: 'navigate', target: 'https://evil.example', label: 'Clique aqui' },
      ],
      suggestions: [],
    };
  }
  if (message.includes('crach')) {
    return { success: true, source: 'kb', reply: 'Seu crachá virtual mostra o QR de presença.', actions: [{ type: 'open_credential', target: 'credential', label: 'Meu crachá' }], suggestions: [] };
  }
  return { success: true, source: 'fallback', reply: 'Ainda não sei responder isso.', actions: [], suggestions: [] };
}

module.exports = async function assistant() {
  // ---- Flag desligada (padrão): a Lia não existe na tela ----
  const off = await startApp({ role: 'member' });
  try {
    await off.login();
    // Espera a resposta da flag chegar (o botão já nasce escondido; sem isto o teste passaria à toa).
    for (let i = 0; i < 50 && !off.calls.worker.some((c) => c.action === 'apiGetFeatureFlags' && c.args[0] === 'e2e-session-token'); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    check(off.calls.worker.some((c) => c.action === 'apiGetFeatureFlags'), 'a Lia perguntou ao servidor se está ligada');
    check(await off.page.locator('#lia-launcher.hidden').count() === 1, 'com a flag desligada o botão da Lia fica escondido');
    check(off.calls.worker.every((c) => c.action !== 'apiAssistantChat'), 'sem a flag, nenhuma chamada ao chat');
  } finally {
    await off.close();
  }

  // ---- Flag ligada: conversa e navegação ----
  const chats = [];
  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: (args) => { chats.push(args); return liaReply(args); },
    },
  });
  try {
    const page = app.page;
    await app.login();
    await page.waitForSelector('#lia-launcher:not(.hidden)');
    check(true, 'com a flag ligada o botão da Lia aparece');
    check(await page.locator('#lia-panel.hidden').count() === 1, 'o painel começa fechado');

    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    check(await page.getAttribute('#lia-launcher', 'aria-expanded') === 'true', 'o botão informa que o painel está aberto (aria-expanded)');
    check(/Eu sou a Lia/.test(await page.textContent('#lia-log')), 'a Lia se apresenta ao abrir');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'lia-input', 'o foco vai para o campo de pergunta');

    // Pergunta sobre eventos → texto com dado + botão que leva à tela de eventos
    await page.fill('#lia-input', 'quais eventos estão abertos?');
    await page.press('#lia-input', 'Enter');
    await page.waitForFunction(() => /Workshop de Toxicologia/.test(document.getElementById('lia-log').textContent));
    check(chats.length === 1 && chats[0][0] === 'e2e-session-token', 'a pergunta vai com a sessão da própria pessoa');
    check(chats[0][1].message === 'quais eventos estão abertos?' && Array.isArray(chats[0][1].history) && chats[0][1].history.length === 0, 'a primeira pergunta não leva histórico');
    check(/^panel-/.test(chats[0][1].context.panel), 'o painel atual vai como contexto (' + chats[0][1].context.panel + ')');
    check(!JSON.stringify(chats[0]).includes('ana@exemplo.com'), 'o e-mail da pessoa nunca vai na pergunta');
    await page.click('#lia-log .lia-chip-action:has-text("Eventos")');
    await page.waitForSelector('#panel-events:not(.hidden)');
    check(await page.locator('#lia-panel.hidden').count() === 1, 'ao clicar no botão a Lia sai da frente e a tela de eventos abre');

    // Laboratório → botão abre o módulo; o botão hostil não existe
    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    await page.fill('#lia-input', 'como funciona o laboratório?');
    await page.press('#lia-input', 'Enter');
    await page.waitForFunction(() => /Estúdio 3D/.test(document.getElementById('lia-log').textContent));
    check(chats[1][1].history.length === 1 && chats[1][1].history[0].role === 'user' && chats[1][1].history[0].text === 'quais eventos estão abertos?', 'o histórico leva só a pergunta anterior da pessoa, nunca a resposta da Lia');
    const chipLabels = await page.$$eval('#lia-log .lia-chip-action', (nodes) => nodes.map((n) => n.textContent));
    check(chipLabels.includes('Laboratório Virtual') && !chipLabels.includes('Clique aqui'), 'o botão fora da lista branca é descartado (' + chipLabels.join(' | ') + ')');
    await page.click('#lia-log .lia-chip-action:has-text("Laboratório Virtual")');
    await page.waitForSelector('#learn-viewer:not(.hidden)');
    const frameSrc = await page.$eval('.learn-frame:not(.hidden)', (f) => f.getAttribute('src'));
    check(/modulos\/laboratorio\//.test(frameSrc), 'o botão abre o módulo do laboratório (' + frameSrc + ')');

    // Crachá pela Lia
    await page.click('#lia-launcher');
    await page.fill('#lia-input', 'meu crachá');
    await page.press('#lia-input', 'Enter');
    await page.waitForFunction(() => /QR de presença/.test(document.getElementById('lia-log').textContent));
    await page.click('#lia-log .lia-chip-action:has-text("Meu crachá")');
    await page.waitForSelector('#modal-learn-credential:not(.hidden)');
    check(true, 'o botão "Meu crachá" da Lia abre o crachá virtual');
    await page.click('#learn-credential-close');

    // Esc fecha e devolve o foco
    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    await page.keyboard.press('Escape');
    check(await page.locator('#lia-panel.hidden').count() === 1, 'Esc fecha o painel');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'lia-launcher', 'o foco volta para o botão da Lia');

    // Texto da resposta é texto, nunca HTML
    check(await page.locator('#lia-log script, #lia-log img').count() === 0, 'a conversa não tem elementos ativos');

    // Sair da conta zera a conversa
    await page.click('#btn-logout');
    await page.waitForSelector('#public-shell:not(.hidden)');
    await page.waitForFunction(() => document.getElementById('lia-log').children.length === 0);
    check(true, 'ao sair da conta a conversa some');
    check(app.errors.length === 0, 'sem erros de página (' + app.errors.join('; ') + ')');
    // O laboratório aberto pelo botão já busca imagens públicas (PubChem/Cactus) e bibliotecas da CDN: só GET.
    check(app.calls.external.every((c) => c.method === 'GET' && !/lia-|quais eventos|crach/i.test(c.url + c.body)), 'a conversa não vai para fora da Worker (só GET de bibliotecas/imagens dos módulos)');
  } finally {
    await app.close();
  }

  // ---- O servidor desliga a Lia no meio da conversa ----
  const kill = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: () => ({ success: false, disabled: true, message: 'A Lia está indisponível no momento.' }),
    },
  });
  try {
    await kill.login();
    await kill.page.waitForSelector('#lia-launcher:not(.hidden)');
    await kill.page.click('#lia-launcher');
    await kill.page.fill('#lia-input', 'oi');
    await kill.page.press('#lia-input', 'Enter');
    await kill.page.waitForSelector('#lia-launcher.hidden', { state: 'attached' });
    check(await kill.page.locator('#lia-panel.hidden').count() === 1, 'se o servidor desligar a Lia, o botão e o painel somem');
  } finally {
    await kill.close();
  }

  // ---- Erro do servidor (ex.: limite por hora): mensagem clara, sem travar ----
  const err = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: () => ({ success: false, message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }),
    },
  });
  try {
    await err.login();
    await err.page.waitForSelector('#lia-launcher:not(.hidden)');
    await err.page.click('#lia-launcher');
    await err.page.fill('#lia-input', 'oi');
    await err.page.press('#lia-input', 'Enter');
    await err.page.waitForSelector('#lia-log .lia-msg-error');
    check(/Muitas tentativas/.test(await err.page.textContent('#lia-log .lia-msg-error')), 'o erro do servidor aparece como mensagem da Lia');
    check(await err.page.locator('.lia-send:not([disabled])').count() === 1, 'o envio é liberado de novo depois do erro');
  } finally {
    await err.close();
  }
};
