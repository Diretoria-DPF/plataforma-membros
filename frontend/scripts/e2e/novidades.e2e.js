/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * novidades.e2e.js — Novidades in-app (ENG-07; frontend/whats-new.js) e preferência "Vibração" (ENG-05).
 * Verifica: o aviso abre uma vez por versão ao entrar, é um diálogo acessível (role, aria-modal, nome,
 * foco dentro) e dispensável (Esc e "Entendi", foco volta); a Guia é a primeira entrada; "Na Liga" só com
 * a flag highlights_enabled; nova entrada não reabre; "Ver novidades" no Perfil reabre; quem vê o onboarding
 * não recebe segundo diálogo; 375x812 sem rolagem horizontal e alvos >= 44 px; Vibração no Perfil.
 */
const { startApp, check } = require('./harness');

const DIALOG = '.laift-dialog';
const KEY = 'laift_whats_new_seen';
const MOBILE = { width: 375, height: 812 };
const TARGET_MIN_PX = 44;

const comFlags = (flags) => ({ apiGetFeatureFlags: () => ({ success: true, flags }) });

const esperaAviso = (page) => page.waitForSelector(DIALOG, { timeout: 15000 });
const avisoAberto = (page) => page.locator(DIALOG).count();

async function fechado(page) {
  await page.waitForFunction((sel) => !document.querySelector(sel), DIALOG, { timeout: 5000 });
}

async function abreEAcessibilidade() {
  const app = await startApp({ role: 'member', whatsNew: true, workerHandlers: comFlags({ ux_v2_enabled: true, highlights_enabled: false }) });
  try {
    const page = app.page;
    await app.login();
    await esperaAviso(page);
    const texto = await page.textContent(`${DIALOG}-message`);
    check((await page.getAttribute(DIALOG, 'role')) === 'dialog' && (await page.getAttribute(DIALOG, 'aria-modal')) === 'true', 'aviso: role="dialog" e aria-modal');
    check((await page.textContent(`${DIALOG}-title`)) === 'Novidades da plataforma', 'aviso: título "Novidades da plataforma"');
    check(await page.evaluate(() => {
      const box = document.querySelector('.laift-dialog');
      return box.getAttribute('aria-labelledby') && box.getAttribute('aria-describedby') && box.contains(document.activeElement);
    }), 'aviso: nome e descrição ligados e foco dentro do diálogo');
    check(texto.split('\n')[0].includes('Guia'), 'aviso: a primeira entrada é a Guia');
    check(!texto.includes('ⓘ') && /acessíveis/.test(texto), 'aviso: sem selo; cita os diálogos acessíveis');
    check(!texto.includes('Na Liga'), 'aviso: sem destaques da Liga com a flag highlights_enabled desligada');
    check((await page.evaluate((k) => localStorage.getItem(k), KEY)) !== null, 'aviso: grava a versão vista em localStorage');
    await page.keyboard.press('Escape');
    await fechado(page);
    check(true, 'aviso: Esc dispensa o diálogo');
    // Sem bloqueio: o app segue utilizável logo depois.
    await app.showPanel('panel-learn');
    check(await page.locator('#panel-learn:not(.hidden)').count() === 1, 'aviso: depois de dispensar, a navegação funciona');
    await page.click('#btn-logout');
    await app.login();
    await page.waitForTimeout(600);
    check((await avisoAberto(page)) === 0, 'nova entrada na mesma versão não reabre o aviso');
  } finally {
    await app.close();
  }
}

async function comDestaques() {
  const app = await startApp({ role: 'member', whatsNew: true, workerHandlers: comFlags({ ux_v2_enabled: true, highlights_enabled: true }) });
  try {
    await app.login();
    await esperaAviso(app.page);
    const texto = await app.page.textContent(`${DIALOG}-message`);
    check(texto.includes('Na Liga'), 'aviso: com highlights_enabled ligada, menciona os destaques da Liga');
    await app.page.click(`${DIALOG} button:has-text("Entendi")`);
    await fechado(app.page);
    check(true, '"Entendi" dispensa o diálogo');
  } finally {
    await app.close();
  }
}

async function verNovidadesNoPerfil() {
  const app = await startApp({ role: 'member', workerHandlers: comFlags({ ux_v2_enabled: true }) });
  try {
    const page = app.page;
    await app.login();
    await page.waitForTimeout(400);
    check((await avisoAberto(page)) === 0, 'versão já vista: não abre ao entrar');
    await app.showPanel('panel-profile');
    await page.click('#btn-whats-new');
    await esperaAviso(page);
    check(true, 'Perfil: "Ver novidades" reabre o aviso');
    await page.keyboard.press('Escape');
    await fechado(page);
    check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-whats-new'), 'Perfil: o foco volta para "Ver novidades"');
  } finally {
    await app.close();
  }
}

async function onboardingSemSegundoDialogo() {
  const app = await startApp({ role: 'member', firstLogin: true, whatsNew: true, workerHandlers: comFlags({ ux_v2_enabled: true }) });
  try {
    await app.login();
    await app.page.waitForSelector('dialog.onboarding-dialog[open]', { timeout: 15000 });
    await app.page.waitForTimeout(500);
    check((await avisoAberto(app.page)) === 0, 'primeira entrada: o onboarding aparece e as Novidades não abrem por cima');
    check((await app.page.evaluate((k) => localStorage.getItem(k), KEY)) !== null, 'primeira entrada: a versão das Novidades fica como vista');
  } finally {
    await app.close();
  }
}

async function mobileEVibracao() {
  const app = await startApp({ role: 'member', whatsNew: true, viewport: MOBILE, workerHandlers: comFlags({ ux_v2_enabled: true }) });
  try {
    const page = app.page;
    await app.login();
    await esperaAviso(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `375 px: sem rolagem horizontal (${overflow}px além da largura)`);
    const pequenos = await page.evaluate((min) => Array.from(document.querySelectorAll('.laift-dialog button'))
      .map((b) => b.getBoundingClientRect()).filter((r) => r.width < min || r.height < min).length, TARGET_MIN_PX);
    check(pequenos === 0, `375 px: botões do aviso com pelo menos ${TARGET_MIN_PX}x${TARGET_MIN_PX}`);
    await page.click(`${DIALOG} button:has-text("Entendi")`);
    await fechado(page);

    await app.showPanel('panel-profile');
    check(await page.isChecked('#pref-vibration'), 'Perfil: "Vibração" vem ligada por padrão');
    await page.uncheck('#pref-vibration');
    await page.click('#form-preferences button[type=submit]');
    check((await page.evaluate(() => localStorage.getItem('laift_vibration'))) === '0', 'Perfil: desligar a Vibração grava a preferência em localStorage');
  } finally {
    await app.close();
  }
}

module.exports = async function novidades() {
  await abreEAcessibilidade();
  await comDestaques();
  await verNovidadesNoPerfil();
  await onboardingSemSegundoDialogo();
  await mobileEVibracao();
};
