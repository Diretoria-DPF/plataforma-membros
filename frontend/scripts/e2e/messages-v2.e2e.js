/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * messages-v2.e2e.js — Mensagens v2 (frontend/messages-v2.js, messages-v2.css) atrás da flag messages_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho, aviso, lista; celular alterna lista/conversa, desktop lado a lado;
 *  - conversa aberta: cifragem de sempre (envio cifrado), contador 0/2000, "Limpar", sem rolagem horizontal, alvos de 44 px;
 *  - sem conversas: estado vazio com "Ir para a Equipe"; claro e escuro;
 *  - flag desligada: tela de sempre, sem nada do v2.
 * Capturas: defina MENSAGENS_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, wide: false },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, wide: false },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, wide: true },
];

const PEER = { id: 'peer-0000-4000-8000-000000000002', fullName: 'Marina Alves', username: 'marina.a', avatarUrl: null };
const PEER_KEY = 'q83vEjRWeJC6zeKTq83vEjRWeJC6zeKTq83vEjRWeJA'; // 32 bytes quaisquer em base64url (chave pública de teste)

function handlers(flagOn, conversations, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { messages_v2_enabled: flagOn } }),
    apiGetMyMessagingKey: async () => ({ success: true, profileId: 'e2e00000-0000-4000-8000-000000000001', hasKey: false }),
    apiPublishMessagingKey: async () => ({ success: true, keyVersion: 1 }),
    apiListConversations: async () => ({ success: true, conversations }),
    apiOpenConversation: async () => ({ success: true, conversationId: 'conv-1' }),
    apiGetPeerMessagingKeys: async () => ({ success: true, keys: [{ keyVersion: 1, active: true, publicKey: PEER_KEY }] }),
    apiListMessages: async () => ({ success: true, messages: [] }),
    apiMarkConversationRead: async () => ({ success: true }),
    apiMessagingSync: async () => ({ success: true, unreadMessages: 0 }),
  }, extra || {});
}

const ONE = [{ peer: PEER, unreadCount: 2, lastMessageAt: '2026-10-30T12:00:00Z', conversationId: 'conv-1' }];

async function boot(viewport, opts, flagOn, conversations, extra) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(flagOn, conversations, extra) }, opts || {}));
  await app.login();
  await app.showPanel('panel-messages');
  return app;
}

async function shot(page, name) {
  const dir = process.env.MENSAGENS_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size, {}, true, ONE);
  const { page } = app;
  try {
    await page.waitForSelector('#panel-messages[data-m2="1"] .m2-hero', { timeout: 15000 });
    await page.waitForSelector('#messaging-conversations-list .chat-list-item', { timeout: 15000 });
    check((await page.textContent('.m2-hero__title')) === 'Mensagens', 'cabeçalho "Mensagens"');
    check((await page.locator('.m2-note').count()) === 1, 'aviso de cifragem de ponta a ponta');
    check((await page.getAttribute('.chat-list-item', 'role')) === 'button' && (await page.getAttribute('.chat-list-item', 'tabindex')) === '0', 'linha da conversa é botão para o teclado');
    check((await page.textContent('.chat-list-item')).includes('Marina Alves'), 'conversa real listada');
    check(await page.locator('.m2-empty').isVisible() === vp.wide, vp.wide ? 'desktop: "Escolha uma conversa" ao lado da lista' : 'celular: sem espaço vazio ao lado');
    await shot(app.page, 'mensagens-' + vp.size.width + '-lista-claro');

    await page.focus('.chat-list-item');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#messaging-thread-view:not(.hidden)', { timeout: 10000 });
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'messaging-send-text', null, { timeout: 8000 });
    const listVisible = await page.locator('#messaging-conversations-view').isVisible();
    check(listVisible === vp.wide, vp.wide ? 'desktop: lista e conversa lado a lado' : 'celular: a conversa substitui a lista');
    if (vp.wide) {
      const a = await page.locator('#messaging-conversations-view').boundingBox();
      const b = await page.locator('#messaging-thread-view').boundingBox();
      check(a.x + a.width <= b.x + 1 && Math.abs(a.y - b.y) < 4, 'colunas lado a lado (' + Math.round(a.width) + ' + ' + Math.round(b.width) + ' px)');
      check(await page.locator('.m2-empty').isHidden(), 'espaço vazio some com a conversa aberta');
    }
    check((await page.textContent('#messaging-thread-peer-name')) === 'Marina Alves', 'conversa de Marina aberta');
    check((await page.textContent('#messaging-char-counter')).trim() === '0 / 2000', 'contador 0 / 2000');
    await page.fill('#messaging-send-text', 'olá');
    check((await page.textContent('#messaging-char-counter')).trim() === '3 / 2000', 'contador acompanha o texto');
    check((await page.getAttribute('#messaging-thread-list', 'role')) === 'log', 'fio da conversa é um log (leitor de tela)');
    check((await page.textContent('#messaging-tofu-banner')).includes('Primeira conversa'), 'banner de chave não verificada continua');

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');
    const sizes = await page.$$eval('#btn-messaging-clear, #btn-messaging-send, #btn-messaging-back, .chat-list-item', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 2 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + JSON.stringify(sizes) + ')');
    const fonts = await page.$$eval('#panel-messages .m2-hero *, #panel-messages .m2-note *, #messaging-main-card *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 5 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
    await shot(page, 'mensagens-' + vp.size.width + '-conversa-claro');

    if (!vp.wide) {
      await page.click('#btn-messaging-back');
      await page.waitForSelector('#messaging-conversations-view:not(.hidden)', { timeout: 5000 });
      check(await page.locator('#messaging-thread-view').isHidden(), 'celular: "Voltar" devolve a lista');
    }
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function sendScenario() {
  console.log('\n— envio cifrado de sempre');
  const sent = [];
  const app = await boot({ width: 1280, height: 800 }, {}, true, ONE, {
    apiSendMessage: async (args) => { sent.push(args); return { success: true, messageId: 1, createdAt: '2026-10-30T12:05:00Z' }; },
    apiClearConversation: async () => ({ success: true, message: 'Conversa limpa.' }),
  });
  const { page } = app;
  try {
    await page.waitForSelector('#messaging-conversations-list .chat-list-item', { timeout: 15000 });
    await page.click('.chat-list-item');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'messaging-send-text', null, { timeout: 8000 });
    await page.fill('#messaging-send-text', 'mensagem de teste');
    await page.click('#btn-messaging-send');
    await page.waitForFunction(() => document.querySelectorAll('.chat-bubble').length === 1, null, { timeout: 8000 });
    check(sent.length === 1, 'enviou uma mensagem');
    const body = sent[0] && sent[0][2] ? sent[0][2] : sent[0];
    const raw = JSON.stringify(sent[0]);
    check(!raw.includes('mensagem de teste'), 'o servidor só recebe texto cifrado (sem o texto em claro)');
    check(typeof (body && body.ciphertext) === 'string' && body.ciphertext.length > 0, 'a mensagem vai cifrada (ciphertext)');
    check((await page.textContent('.chat-bubble-text')) === 'mensagem de teste', 'a bolha mostra a mensagem decifrada');
    check((await page.getAttribute('#messaging-send-text', 'maxlength')) === '2000', 'limite de 2000 caracteres');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function emptyAndDarkScenario() {
  console.log('\n— sem conversas, tema escuro');
  const app = await boot({ width: 375, height: 812 }, { theme: 'dark' }, true, []);
  const { page } = app;
  try {
    await page.waitForSelector('.m2-cta:not([hidden])', { timeout: 15000 });
    check(true, 'estado vazio mostra "Ir para a Equipe"');
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const card = await page.locator('#messaging-main-card').evaluate((n) => getComputedStyle(n).backgroundColor);
    check(lum(card) < 0.3, 'cartão escuro no tema escuro');
    await shot(page, 'mensagens-375-vazio-escuro');
    await page.click('.m2-cta');
    await page.waitForSelector('#panel-orgchart:not(.hidden)', { timeout: 8000 });
    check(true, '"Ir para a Equipe" abre a Equipe');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await boot({ width: 1280, height: 800 }, {}, false, ONE);
  const { page } = app;
  try {
    await page.waitForSelector('#messaging-conversations-list .chat-list-item', { timeout: 15000 });
    check((await page.locator('.m2-hero, .m2-note, .m2-empty, .m2-cta, [data-m2], [data-m2-item]').count()) === 0, 'nenhum elemento de Mensagens v2');
    check((await page.locator('link[data-messages-v2-css]').count()) === 0, 'o CSS de Mensagens v2 nem é carregado');
    check((await page.locator('#messaging-conversations-view').isVisible()) && (await page.locator('#messaging-thread-view').isHidden()), 'lista de sempre, sem conversa ao lado');
    check((await page.getAttribute('.chat-list-item', 'role')) === null, 'linha de conversa como sempre');
    await shot(page, 'mensagens-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function messagesV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await sendScenario();
  await emptyAndDarkScenario();
  await flagOffScenario();
};
