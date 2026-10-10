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
const { axeGate } = require('./axe-gate');

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

// ---- Moderação (ADR 0004): aviso, suspensão, redenção e consulta ao abrir ----
const WARN_TEXT = { 1: 'Isso não é permitido. Vamos manter o respeito.', 2: 'Se continuar, vou precisar me retirar.' };
const inADay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function warnReply(args) {
  const level = /\[aviso2\]/.test(String(args[1].message)) ? 2 : 1;
  return { success: true, source: 'moderation', reply: WARN_TEXT[level], message: WARN_TEXT[level], actions: [], suggestions: [], moderation: { level, suspended: false, until: null } };
}

function suspendedReply() {
  const text = 'Chat suspenso por mensagens ofensivas repetidas.';
  return { success: true, source: 'moderation', reply: text, message: text, actions: [], suggestions: [], moderation: { level: 3, suspended: true, until: inADay() } };
}

/** Faz login, abre a Lia e, se houver mensagem, envia. Devolve a página. */
async function openLia(app, message) {
  await app.login();
  const page = app.page;
  await page.waitForSelector('#lia-launcher:not(.hidden)');
  await page.click('#lia-launcher');
  if (message) {
    await page.fill('#lia-input', message);
    await page.press('#lia-input', 'Enter');
  }
  return page;
}

async function moderacao() {
  // ---- Aviso nível 1 e 2: faixa com ícone e texto, Lia em alerta, chat continua ----
  const warn = await startApp({ role: 'member', workerHandlers: { apiGetFeatureFlags: FLAGS_ON, apiAssistantChat: warnReply } });
  try {
    const page = await openLia(warn, '[aviso1] oi');
    await page.waitForSelector('#lia-log .lia-warning-1');
    check(/Aviso 1 de 3/.test(await page.textContent('#lia-log .lia-warning-1')), 'o nível 1 mostra a faixa "Aviso 1 de 3" (texto, não só cor)');
    check(await page.getAttribute('#lia-log .lia-warning-1', 'role') === 'status', 'a faixa de aviso tem papel de status');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está atenta"]');
    check(await page.isEnabled('#lia-input'), 'com aviso, o chat continua disponível');
    await page.fill('#lia-input', '[aviso2] oi');
    await page.press('#lia-input', 'Enter');
    await page.waitForSelector('#lia-log .lia-warning-2');
    check(/Aviso 2 de 3/.test(await page.textContent('#lia-log .lia-warning-2')), 'o nível 2 mostra a faixa "Aviso 2 de 3"');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia emitiu um alerta"]');
    check(await page.locator('#lia-redeem.hidden').count() === 1, 'sem suspensão, o pedido de redenção continua escondido');
    check(warn.errors.length === 0, 'sem erros de página nos avisos (' + warn.errors.join('; ') + ')');
  } finally {
    await warn.close();
  }

  // ---- Suspensão + redenção aceita: campo travado, pedido, campo liberado ----
  const redeemed = [];
  const sus = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: suspendedReply,
      apiAssistantRedeem: (args) => {
        redeemed.push(args);
        return { success: true, accepted: true, level: 0, message: 'Redenção aceita.' };
      },
    },
  });
  try {
    const page = await openLia(sus, '[suspende] oi');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está suspensa"]');
    check(await page.isDisabled('#lia-input'), 'com o chat suspenso, o campo de pergunta fica desabilitado');
    check(await page.isVisible('#lia-redeem'), 'a suspensão mostra o pedido de redenção');
    check(/\d{2}\/\d{2} às \d{2}:\d{2} \(horário de Brasília\)/.test(await page.textContent('.lia-redeem-return')), 'a suspensão informa o horário de retorno em Brasília');
    check(await page.evaluate(() => document.activeElement.classList.contains('lia-redeem-open')), 'ao suspender, o foco vai para "Pedir redenção"');
    await page.click('.lia-redeem-open');
    check(await page.evaluate(() => document.activeElement.id) === 'lia-redeem-text', 'ao abrir o formulário, o foco vai para o campo da explicação');
    await page.fill('#lia-redeem-text', 'a'.repeat(39));
    check(await page.isDisabled('.lia-redeem-send'), 'com 39 caracteres, o Enviar fica desabilitado');
    await page.fill('#lia-redeem-text', 'Errei ao xingar a colega. Vou responder com respeito daqui em diante.');
    check(await page.isEnabled('.lia-redeem-send'), 'com 40 a 600 caracteres, o Enviar é liberado');
    await page.click('.lia-redeem-send');
    await page.waitForSelector('#lia-redeem.hidden', { state: 'attached' });
    check(redeemed.length === 1 && redeemed[0][0] === 'e2e-session-token' && /Errei ao xingar/.test(redeemed[0][1].message), 'a redenção vai com a sessão da pessoa e com a explicação');
    check(await page.isEnabled('#lia-input'), 'redenção aceita: o campo de pergunta volta');
    check(await page.evaluate(() => document.activeElement.id) === 'lia-input', 'ao aceitar, o foco vai para a pergunta');
    check(await page.locator('#lia-panel .lia[aria-label="Lia"]').count() === 1, 'a Lia volta ao repouso depois da redenção');
    check(/O chat voltou ao normal/.test(await page.textContent('#lia-log')), 'a Lia dá as boas-vindas de volta');
    check(sus.errors.length === 0, 'sem erros de página na redenção (' + sus.errors.join('; ') + ')');
  } finally {
    await sus.close();
  }

  // ---- Redenção recusada: mensagem, contador e nada reenviado sozinho ----
  const refusedCalls = [];
  const refusal = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: suspendedReply,
      apiAssistantRedeem: (args) => {
        refusedCalls.push(args);
        return { success: true, accepted: false, level: 3, retryAfterSeconds: 3, message: 'Não consegui perceber sinceridade no seu texto. Tente de novo em instantes.' };
      },
    },
  });
  try {
    const page = await openLia(refusal, '[suspende] oi');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está suspensa"]');
    await page.click('.lia-redeem-open');
    await page.fill('#lia-redeem-text', 'Peço desculpas e vou manter o respeito com a equipe.');
    await page.click('.lia-redeem-send');
    await page.waitForSelector('.lia-redeem-timer:has-text("Você poderá tentar de novo em")');
    check(/Não consegui perceber sinceridade/.test(await page.textContent('.lia-redeem-status')), 'a recusa mostra a mensagem num aviso de status');
    check(/em \d+ s\./.test(await page.textContent('.lia-redeem-timer')), 'a recusa mostra o contador até a nova tentativa');
    check(await page.isDisabled('.lia-redeem-send'), 'durante a espera, o Enviar fica desabilitado');
    await page.waitForSelector('.lia-redeem-send:not([disabled])', { timeout: 10000 });
    check(refusedCalls.length === 1, 'o contador acaba e nada é reenviado sozinho (sem polling)');
    check(await page.isDisabled('#lia-input'), 'recusada, o chat segue suspenso');
    check(refusal.errors.length === 0, 'sem erros de página na recusa (' + refusal.errors.join('; ') + ')');
  } finally {
    await refusal.close();
  }

  // ---- Falha de rede ao enviar a redenção: aviso de alerta, texto preservado, Enviar volta e a 2ª tentativa vale ----
  const flaky = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: suspendedReply,
      apiAssistantRedeem: () => ({ success: true, accepted: true, level: 0, message: 'Redenção aceita.' }),
    },
  });
  try {
    const page = await openLia(flaky, '[suspende] oi');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está suspensa"]');
    await page.click('.lia-redeem-open');
    const explanation = 'Errei ao xingar a colega. Vou responder com respeito daqui em diante.';
    await page.fill('#lia-redeem-text', explanation);
    // A primeira tentativa cai na rede (requisição abortada); a segunda segue para o servidor de teste.
    let sends = 0;
    await page.route((url) => url.toString().includes('.workers.dev'), (route) => {
      if (!/apiAssistantRedeem/.test(route.request().postData() || '')) return route.fallback();
      sends += 1;
      return sends === 1 ? route.abort('failed') : route.fallback();
    });
    await page.click('.lia-redeem-send');
    await page.waitForSelector('.lia-redeem-alert', { state: 'visible' });
    check(/Não foi possível enviar agora/.test(await page.textContent('.lia-redeem-alert')), 'a falha de rede aparece em português, como aviso de alerta');
    check(await page.getAttribute('.lia-redeem-alert', 'role') === 'alert', 'o aviso de falha tem papel de alerta');
    check(await page.textContent('.lia-redeem-status') === '', 'a falha não deixa "Enviando…" preso');
    check(await page.isEnabled('.lia-redeem-send'), 'depois da falha, Enviar volta ao normal');
    check(await page.inputValue('#lia-redeem-text') === explanation, 'depois da falha, a explicação continua no campo');
    check(await page.evaluate(() => document.activeElement.classList.contains('lia-redeem-send')), 'o foco volta para Enviar, para tentar de novo');
    check(await page.isDisabled('#lia-input'), 'a falha não libera o chat: segue suspenso');
    await page.click('.lia-redeem-send');
    await page.waitForSelector('#lia-redeem.hidden', { state: 'attached' });
    check(sends === 2 && await page.isEnabled('#lia-input'), 'a segunda tentativa é aceita e o chat volta');
    check(flaky.errors.length === 0, 'sem erros de página na falha de rede (' + flaky.errors.join('; ') + ')');
  } finally {
    await flaky.close();
  }

  // ---- Consulta ao abrir: restaura a suspensão; uma vez por página; sair da conta limpa tudo ----
  const stateCalls = [];
  const restore = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantModerationState: (args) => {
        stateCalls.push(args[0]);
        return { success: true, moderated: true, level: 3, suspended: true, until: inADay(), canRedeem: true, retryAfterSeconds: 0 };
      },
    },
  });
  try {
    await restore.login();
    const page = restore.page;
    await page.waitForSelector('#lia-launcher:not(.hidden)');
    check(stateCalls.length === 0, 'a página não consulta a moderação antes de abrir a Lia');
    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está suspensa"]');
    check(stateCalls.length === 1 && stateCalls[0] === 'e2e-session-token', 'ao abrir a Lia, a suspensão é consultada uma vez, com a sessão da pessoa');
    check(await page.isDisabled('#lia-input'), 'após recarregar a página, a suspensão volta a valer na tela');
    await page.keyboard.press('Escape');
    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está suspensa"]');
    check(stateCalls.length === 1, 'reabrir o painel não consulta de novo nesta página');
    await page.click('#btn-logout');
    await page.waitForSelector('#public-shell:not(.hidden)');
    check(await page.locator('#lia-redeem.hidden').count() === 1, 'sair da conta esconde o bloco de suspensão');
    check(restore.errors.length === 0, 'sem erros de página na restauração (' + restore.errors.join('; ') + ')');
  } finally {
    await restore.close();
  }

  // ---- Falha ao consultar não trava o chat (falha aberta) ----
  const open = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantModerationState: () => ({ success: false, message: 'Sistema indisponível.' }),
      apiAssistantChat: () => ({ success: true, source: 'fallback', reply: 'Ainda não sei responder isso.', actions: [], suggestions: [] }),
    },
  });
  try {
    const page = await openLia(open, 'oi');
    await page.waitForSelector('#lia-log .lia-bubble:has-text("Ainda não sei responder")');
    check(await page.isEnabled('#lia-input') && await page.locator('#lia-redeem.hidden').count() === 1, 'se a consulta falha, o chat segue normal');
    check(open.calls.worker.filter((c) => c.action === 'apiAssistantModerationState').length === 1, 'a consulta foi feita uma vez, mesmo com falha');
  } finally {
    await open.close();
  }

  // ---- Visitante não consulta a moderação ----
  const guest = await startApp({
    role: 'visitor',
    workerHandlers: {
      apiGetFeatureFlags: FLAGS_ON,
      apiAssistantChat: () => ({ success: true, source: 'fallback', reply: 'Ainda não sei responder isso.', actions: [], suggestions: [] }),
    },
  });
  try {
    const page = await openLia(guest, 'oi');
    await page.waitForSelector('#lia-log .lia-bubble:has-text("Ainda não sei responder")');
    check(guest.calls.worker.every((c) => c.action !== 'apiAssistantModerationState'), 'visitante não consulta a moderação');
  } finally {
    await guest.close();
  }
}

// ---- Dica contextual (plano §3.4): um balão por módulo por sessão, perto da Lia ----
const DICA = {
  eventos: 'Quer ajuda com sua inscrição?',
  propostas: 'Posso te levar para criar uma proposta.',
  aprender: 'Quer sugestão por onde começar a estudar?',
  lab: 'Dúvida sobre vidraria ou preparo?',
};

async function dicas() {
  const app = await startApp({ role: 'member', workerHandlers: { apiGetFeatureFlags: FLAGS_ON } });
  try {
    const page = app.page;
    await app.login();
    await page.waitForSelector('#lia-launcher:not(.hidden)');
    const textoDaDica = () => page.$eval('.lia-hint-open', (b) => b.textContent).catch(() => '');

    // Entrar em Eventos mostra a dica, sem abrir o painel da Lia
    await page.click('#app-nav [data-panel="panel-events"]');
    await page.waitForSelector('.lia-hint[role="status"]');
    check(await textoDaDica() === DICA.eventos, 'entrar em Eventos mostra a dica da Lia');
    check(await page.locator('#lia-panel.hidden').count() === 1, 'a dica não abre o painel da Lia sozinha');

    // Fechar pelo × some a dica; voltar a Eventos na mesma sessão não a repete
    await page.click('.lia-hint-close');
    await page.waitForSelector('.lia-hint', { state: 'detached' });
    await page.click('#app-menu-btn');
    await page.click('#app-menu [data-panel="panel-proposals"]');
    await page.waitForSelector('.lia-hint-open');
    check(await textoDaDica() === DICA.propostas, 'Propostas tem a sua dica');
    await page.click('.lia-hint-close');
    await page.waitForSelector('.lia-hint', { state: 'detached' });
    await page.click('#app-nav [data-panel="panel-events"]');
    await page.waitForTimeout(400);
    check(await page.locator('.lia-hint').count() === 0, 'voltar a Eventos na mesma sessão não repete a dica');

    // Ao abrir a Lia, ela já vem com o prop da tela (Eventos); com o painel aberto, nenhuma dica
    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    check(await page.locator('#lia-panel .lia[aria-label="Lia, assistente de Eventos"]').count() === 1, 'a Lia abre já com o prop de Eventos');
    check(await page.locator('.lia-hint').count() === 0, 'com o painel da Lia aberto, nenhuma dica aparece');
    await page.keyboard.press('Escape');

    // Tocar na dica abre a Lia com a pergunta no campo; nada é enviado
    await page.click('#app-nav [data-panel="panel-learn"]');
    await page.waitForSelector('.lia-hint-open');
    check(await textoDaDica() === DICA.aprender, 'Aprender tem a sua dica');
    await page.click('.lia-hint-open');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    check(await page.inputValue('#lia-input') === DICA.aprender, 'tocar na dica abre a Lia com a pergunta pronta no campo');
    check(await page.locator('.lia-msg-user').count() === 0, 'a pergunta não foi enviada');
    check(app.calls.worker.every((c) => c.action !== 'apiAssistantChat'), 'tocar na dica não chama o chat');
    await page.keyboard.press('Escape');

    // Laboratório: a dica do módulo, que some sozinha em alguns segundos
    await page.click('.learn-card[data-module="lab"]');
    await page.waitForSelector('#learn-viewer:not(.hidden)');
    await page.waitForSelector('.lia-hint-open');
    check(await textoDaDica() === DICA.lab, 'entrar no Laboratório mostra a dica do módulo');
    await page.waitForSelector('.lia-hint', { state: 'detached', timeout: 12000 });
    check(true, 'a dica some sozinha depois de alguns segundos');
    check(app.errors.length === 0, 'sem erros de página na dica (' + app.errors.join('; ') + ')');
  } finally {
    await app.close();
  }
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
      // "[lento]" simula uma resposta demorada, para observar o estado "pensando" da Lia.
      apiAssistantChat: async (args) => {
        chats.push(args);
        if (/\[lento\]/.test(String(args[1].message))) await new Promise((resolve) => setTimeout(resolve, 600));
        return liaReply(args);
      },
    },
  });
  try {
    const page = app.page;
    await app.login();
    await page.waitForSelector('#lia-launcher:not(.hidden)');
    check(true, 'com a flag ligada o botão da Lia aparece');
    check(await page.locator('#lia-panel.hidden').count() === 1, 'o painel começa fechado');
    const crop = await page.getAttribute('#lia-launcher .lia-launcher-figure svg.lia-svg', 'viewBox');
    check(!!crop && crop !== '0 0 200 300', 'a bolha fechada mostra a Lia recortada na cabeça (viewBox ' + crop + ')');

    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    check(await page.getAttribute('#lia-launcher', 'aria-expanded') === 'true', 'o botão informa que o painel está aberto (aria-expanded)');
    check(await page.getAttribute('#lia-panel .lia-head-figure svg.lia-svg', 'viewBox') === '0 0 200 300', 'o painel mostra a Lia de corpo inteiro no cabeçalho');
    check(await page.getAttribute('#lia-panel .lia', 'aria-label') === 'Lia', 'a Lia do painel começa com o rótulo de repouso');
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
    await axeGate(page, 'Lia aberta com resposta (membro)');
    await page.click('#lia-log .lia-chip-action:has-text("Eventos")');
    await page.waitForSelector('#panel-events:not(.hidden)');
    check(await page.locator('#lia-panel.hidden').count() === 1, 'ao clicar no botão a Lia sai da frente e a tela de eventos abre');
    check(await page.locator('#lia-panel .lia').count() === 0, 'ao fechar o painel, a Lia do cabeçalho é desmontada');

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

    // Reações: pensa enquanto a resposta demora, fala quando ela chega
    await page.click('#lia-launcher');
    await page.waitForSelector('#lia-panel:not(.hidden)');
    await page.fill('#lia-input', '[lento] meu crachá');
    await page.press('#lia-input', 'Enter');
    await page.waitForSelector('#lia-panel .lia[aria-label="Lia está pensando"]');
    check(true, 'enquanto a resposta vem, o rótulo da Lia diz que ela está pensando');
    // "digitando" some quando a resposta chega (o texto já existia de um passo anterior, então não serve de sinal)
    await page.waitForSelector('#lia-log .lia-typing', { state: 'detached' });
    check(await page.locator('#lia-panel .lia[aria-label="Lia está respondendo"]').count() === 1, 'quando a resposta chega, a Lia fala');
    await page.keyboard.press('Escape');
    check(await page.locator('#lia-panel .lia').count() === 0, 'fechar o painel desmonta a Lia do cabeçalho');

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
    check(await err.page.locator('#lia-panel .lia[aria-label="Lia não entendeu"]').count() === 1, 'um erro do servidor deixa a Lia confusa');
    check(await err.page.locator('.lia-send:not([disabled])').count() === 1, 'o envio é liberado de novo depois do erro');
  } finally {
    await err.close();
  }

  // ---- O 👍 no micro-card faz a Lia comemorar ----
  const fb = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetFeatureFlags: () => ({ success: true, flags: { chatbot_enabled: true, feedback_enabled: true } }),
      apiAssistantChat: () => ({
        success: true, source: 'kb', reply: 'Seu crachá fica na tela Meu crachá.', actions: [], suggestions: [],
        messageId: '6f1c2b8e-3d4a-4b5c-8d9e-0f1a2b3c4d5e',
      }),
      apiAssistantFeedback: () => ({ success: true }),
    },
  });
  try {
    await fb.login();
    await fb.page.waitForSelector('#lia-launcher:not(.hidden)');
    await fb.page.click('#lia-launcher');
    await fb.page.fill('#lia-input', 'oi');
    await fb.page.press('#lia-input', 'Enter');
    await fb.page.waitForSelector('#lia-log .lia-fb-choice');
    await fb.page.click('#lia-log .lia-fb-choice:has-text("Útil")');
    await fb.page.waitForSelector('#lia-panel .lia[aria-label="Lia está celebrando"]');
    check(fb.calls.worker.some((c) => c.action === 'apiAssistantFeedback'), 'o 👍 vai ao servidor');
    check(true, 'o 👍 aceito faz a Lia comemorar');
  } finally {
    await fb.close();
  }

  // ---- Humor (L7): a saudação abre com uma variação, não repete ao reabrir e a conversa segue sem erro ----
  const mood = await startApp({ role: 'member', workerHandlers: { apiGetFeatureFlags: FLAGS_ON, apiAssistantChat: liaReply } });
  try {
    const page = await openLia(mood, null);
    await page.waitForSelector('#lia-log .lia-msg-lia .lia-bubble');
    const greeting = await page.textContent('#lia-log .lia-msg-lia .lia-bubble');
    check(/^(Oi!|Olá!|E aí!|Bem-vindo!|Chegou!) Eu sou a Lia, a guia da plataforma LAIFT\./.test(greeting), 'a saudação abre com uma variação e mantém a apresentação');
    await page.keyboard.press('Escape'); // fecha
    await page.click('#lia-launcher'); // reabre
    check(await page.locator('#lia-log .lia-msg-lia').count() === 1, 'reabrir o painel não repete a saudação');
    await page.fill('#lia-input', 'explique melhor');
    await page.press('#lia-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#lia-log .lia-msg-lia').length === 2);
    check(mood.errors.length === 0, 'o humor não gera erros de página (' + mood.errors.join('; ') + ')');
  } finally {
    await mood.close();
  }

  await moderacao();
  await dicas();
};
