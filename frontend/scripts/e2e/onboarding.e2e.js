/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * onboarding.e2e.js — onboarding por papel (frontend/onboarding.js). Na primeira entrada
 * autenticada, um <dialog> modal com 3 passos (4 com a Lia ligada), diferente por papel.
 * Verifica: passos de visitante, membro e admin; foco inicial e preso no diálogo; Esc e
 * "Pular" fecham e marcam como visto; nova entrada (logout e login) não reabre; logout e
 * sessão expirada fecham sem marcar; o passo da Lia só com chatbot_enabled; os botões da
 * Lia e do crachá; 375x812 sem rolagem horizontal, alvos >= 44 px e axe (axe-gate.js).
 */
const { startApp, check, E2E_PROFILE_ID, ONBOARDING_SEEN_PREFIX } = require('./harness');
const { axeGate } = require('./axe-gate');

const DIALOG = 'dialog.onboarding-dialog';
const KEY = ONBOARDING_SEEN_PREFIX + E2E_PROFILE_ID;
const MOBILE = { width: 375, height: 812 };
const TARGET_MIN_PX = 44;
const LIA_TITLE = 'Conheça a Lia';
const FLAGS_LIA = { ux_v2_enabled: true, chatbot_enabled: true };
const FLAGS_SEM_LIA = { ux_v2_enabled: true, chatbot_enabled: false };
const PASSOS = {
  visitor: ['Bem-vindo(a) à LAIFT', 'Aprender e eventos', LIA_TITLE, 'Seu crachá'],
  member: ['Bem-vindo(a) de volta', 'Tarefas, equipe e votações', LIA_TITLE, 'Seu QR de presença'],
  admin: ['Bem-vindo(a), administrador(a)', 'Moderação e IA', LIA_TITLE, 'Seu crachá'],
};
const PISTA_PAPEL = { visitor: 'Você entrou como visitante', member: 'Você entrou como membro', admin: 'Além da área de membro' };

function comFlags(flags) {
  return { apiGetFeatureFlags: () => ({ success: true, flags }) };
}

async function esperaDialogo(page) {
  await page.waitForSelector(`${DIALOG}[open]`, { timeout: 15000 });
}

function dialogoAberto(page) {
  return page.locator(`${DIALOG}[open]`).count();
}

async function tituloAtual(page) {
  return page.textContent(`${DIALOG} h2`);
}

async function progresso(page) {
  return page.textContent(`${DIALOG} .onboarding-progress`);
}

async function focoNoDialogo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return !!el && !!el.closest && !!el.closest('dialog.onboarding-dialog');
  });
}

/** Anda com "Próximo" até o último passo ("Concluir") e devolve os títulos, na ordem. */
async function percorrer(page) {
  const titulos = [];
  for (let i = 0; i < 6; i += 1) {
    titulos.push(await tituloAtual(page));
    if ((await page.locator(`${DIALOG} button`, { hasText: 'Concluir' }).count()) === 1) break;
    await page.click(`${DIALOG} button:has-text("Próximo")`);
  }
  return titulos;
}

/** Avança com "Próximo" até o passo com o título dado. */
async function irAte(page, titulo) {
  for (let i = 0; i < 6; i += 1) {
    if ((await tituloAtual(page)) === titulo) return true;
    await page.click(`${DIALOG} button:has-text("Próximo")`);
  }
  return false;
}

/** Tab e Shift+Tab repetidos: o foco tem de ficar sempre dentro do diálogo. */
async function prendeFoco(page, rotulo) {
  const dentro = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    dentro.push(await focoNoDialogo(page));
  }
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+Tab');
    dentro.push(await focoNoDialogo(page));
  }
  check(dentro.every(Boolean), `${rotulo}: Tab e Shift+Tab mantêm o foco dentro do diálogo`);
}

/** Dentro da página: botões visíveis do diálogo que medem menos que o mínimo. */
function alvosPequenos(min) {
  return Array.from(document.querySelectorAll('dialog.onboarding-dialog button'))
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.textContent || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((t) => t.w < min || t.h < min);
}

async function checaMobile(page, rotulo) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${rotulo}: sem rolagem horizontal a 375 px (${overflow}px além da largura)`);
  const small = await page.evaluate(alvosPequenos, TARGET_MIN_PX);
  const lista = small.map((t) => `"${t.label}" ${t.w}x${t.h}`).join('; ');
  check(small.length === 0, `${rotulo}: botões do diálogo abaixo de ${TARGET_MIN_PX}x${TARGET_MIN_PX}${lista ? ': ' + lista : ''}`);
}

/** Passos por papel: 4 passos com a Lia ligada, títulos próprios e progresso correto. */
async function passosPorPapel() {
  for (const role of Object.keys(PASSOS)) {
    const app = await startApp({ role, firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
    try {
      await app.login();
      await esperaDialogo(app.page);
      check((await progresso(app.page)) === 'Passo 1 de 4', `${role}: o progresso começa em "Passo 1 de 4"`);
      check((await app.page.textContent(`${DIALOG} p:not(.onboarding-progress)`)).includes(PISTA_PAPEL[role]), `${role}: o primeiro passo fala com o papel da pessoa`);
      check(await focoNoDialogo(app.page), `${role}: o foco inicial está dentro do diálogo`);
      const titulos = await percorrer(app.page);
      check(JSON.stringify(titulos) === JSON.stringify(PASSOS[role]), `${role}: passos da primeira entrada (${titulos.join(' → ')})`);
    } finally {
      await app.close();
    }
  }
}

/** Esc fecha, grava "visto" e, depois de sair e entrar de novo, o diálogo não reabre. */
async function escEnovaEntrada() {
  const app = await startApp({ role: 'member', firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    const page = app.page;
    await app.login();
    await esperaDialogo(page);
    await prendeFoco(page, 'membro');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.onboarding-dialog').open, null, { timeout: 5000 });
    check((await page.evaluate((k) => localStorage.getItem(k), KEY)) === '1', 'Esc fecha o diálogo e grava "visto"');
    await page.click('#btn-logout');
    await app.login();
    await page.waitForTimeout(300);
    check((await dialogoAberto(page)) === 0, 'nova entrada depois de "visto" não reabre o diálogo');
  } finally {
    await app.close();
  }
}

/** "Pular" fecha e grava "visto" (admin). */
async function pular() {
  const app = await startApp({ role: 'admin', firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    await app.login();
    await esperaDialogo(app.page);
    await app.page.click(`${DIALOG} button:has-text("Pular")`);
    check((await dialogoAberto(app.page)) === 0, 'Pular fecha o diálogo');
    check((await app.page.evaluate((k) => localStorage.getItem(k), KEY)) === '1', 'Pular grava "visto"');
  } finally {
    await app.close();
  }
}

/** Logout com o diálogo aberto fecha sem gravar "visto" (o clique por script passa por cima da inércia do modal). */
async function logoutFecha() {
  const app = await startApp({ role: 'member', firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    await app.login();
    await esperaDialogo(app.page);
    await app.page.evaluate(() => document.getElementById('btn-logout').click());
    await app.page.waitForFunction(() => !document.querySelector('dialog.onboarding-dialog').open, null, { timeout: 5000 });
    check((await app.page.evaluate((k) => localStorage.getItem(k), KEY)) === null, 'logout fecha o diálogo sem gravar "visto"');
  } finally {
    await app.close();
  }
}

/** Sessão expirada (30 min) fecha o diálogo sem gravar "visto". Usa o relógio falso do Playwright. */
async function sessaoExpirada() {
  const app = await startApp({ role: 'member', firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    await app.page.clock.install();
    await app.login();
    await esperaDialogo(app.page);
    await app.page.clock.fastForward(31 * 60 * 1000);
    await app.page.waitForFunction(() => !document.querySelector('dialog.onboarding-dialog').open, null, { timeout: 5000 });
    check((await app.page.evaluate((k) => localStorage.getItem(k), KEY)) === null, 'sessão expirada fecha o diálogo sem gravar "visto"');
    check((await app.page.textContent('#msg-login')).includes('Sua sessão expirou'), 'sessão expirada volta à tela de login com aviso');
  } finally {
    await app.close();
  }
}

/** Sem chatbot_enabled, o passo da Lia não existe: são 3 passos. */
async function semLia() {
  const app = await startApp({ role: 'member', firstLogin: true, workerHandlers: comFlags(FLAGS_SEM_LIA) });
  try {
    await app.login();
    await esperaDialogo(app.page);
    const titulos = await percorrer(app.page);
    check(titulos.length === 3 && !titulos.includes(LIA_TITLE), `sem a flag da Lia: são 3 passos e nenhum é da Lia (${titulos.join(' → ')})`);
  } finally {
    await app.close();
  }
}

/** Botões do passo da Lia (abre a Lia) e do crachá (abre o crachá); ambos fecham e gravam "visto". */
async function botoesAbremLiaECracha() {
  const lia = await startApp({ role: 'member', firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    await lia.login();
    await esperaDialogo(lia.page);
    check(await irAte(lia.page, LIA_TITLE), 'o passo "Conheça a Lia" é alcançado com Próximo');
    await lia.page.click(`${DIALOG} button:has-text("Abrir a Lia")`);
    await lia.page.waitForSelector('#lia-panel:not(.hidden)', { timeout: 10000 });
    check((await dialogoAberto(lia.page)) === 0, 'o botão "Abrir a Lia" fecha o diálogo e abre a Lia');
    check((await lia.page.evaluate((k) => localStorage.getItem(k), KEY)) === '1', 'abrir a Lia pelo diálogo grava "visto"');
  } finally {
    await lia.close();
  }
  const cracha = await startApp({ role: 'member', firstLogin: true, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    await cracha.login();
    await esperaDialogo(cracha.page);
    await irAte(cracha.page, 'Seu QR de presença');
    await cracha.page.click(`${DIALOG} button:has-text("Abrir meu crachá")`);
    await cracha.page.waitForSelector('#modal-learn-credential:not(.hidden)', { timeout: 10000 });
    check((await dialogoAberto(cracha.page)) === 0, 'o botão "Abrir meu crachá" fecha o diálogo e abre o crachá');
  } finally {
    await cracha.close();
  }
}

/** 375x812: sem rolagem, alvos >= 44 px, axe nos passos (com e sem a Lia). */
async function celularEAxe() {
  const app = await startApp({ role: 'member', firstLogin: true, viewport: MOBILE, workerHandlers: comFlags(FLAGS_LIA) });
  try {
    await app.login();
    await esperaDialogo(app.page);
    await checaMobile(app.page, 'passo 1');
    await axeGate(app.page, 'onboarding 375x812 (passo 1)');
    await irAte(app.page, LIA_TITLE);
    await checaMobile(app.page, 'passo da Lia');
    await axeGate(app.page, 'onboarding 375x812 (Lia)');
  } finally {
    await app.close();
  }
}

module.exports = async function onboarding() {
  await passosPorPapel();
  await escEnovaEntrada();
  await pular();
  await logoutFecha();
  await sessaoExpirada();
  await semLia();
  await botoesAbremLiaECracha();
  await celularEAxe();
};
