/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * confirm-a11y.e2e.js — diálogo de confirmação acessível (openConfirm em frontend/app.js,
 * createConfirmDialog). Ação real: "Rejeitar" de um caso aguardando revisão no painel de IA
 * (frontend/admin-ai.js). Verifica: foco inicial em Cancelar; Tab e Shift+Tab presos entre
 * Cancelar e Confirmar; Enter fora dos botões não confirma; Esc cancela (o callback não roda)
 * e devolve o foco ao botão que abriu; Confirmar executa o callback uma única vez.
 */
const { startApp, check } = require('./harness');

const MODAL = '#modal-confirm';
const CASO = {
  id: 'caso-1',
  title: 'Intoxicação por anticolinérgico',
  toxindrome: 'Anticolinérgica',
  summary: {},
  createdByName: 'Ana',
  createdAt: new Date().toISOString(),
};

/** Id do elemento com foco; o botão que abriu o diálogo é marcado com data-qa-opener. */
function focusedName(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return el.id || (el.getAttribute('data-qa-opener') ? 'opener' : el.tagName);
  });
}

/** Clica em "Rejeitar" do primeiro caso e espera o diálogo abrir. Devolve o botão que abriu. */
async function abrirRejeicao(page) {
  const botao = page.locator('#admin-ai-pending .ai-case button.danger').first();
  await botao.evaluate((el) => el.setAttribute('data-qa-opener', '1'));
  await botao.click();
  await page.waitForSelector(`${MODAL}:not(.hidden)`);
  return botao;
}

function reviewCalls(app) {
  return app.calls.worker.filter((c) => c.action === 'apiAdminLearnReviewCase').length;
}

/** Tab (ou Shift+Tab) repetido: cada passo tem de ficar em Cancelar ou Confirmar. */
async function presoNoDialogo(page, teclas, rotulo) {
  const visitados = [];
  for (let i = 0; i < teclas; i += 1) {
    await page.keyboard.press(rotulo.tecla);
    visitados.push(await focusedName(page));
  }
  const soDentro = visitados.every((nome) => nome === 'modal-confirm-cancel' || nome === 'modal-confirm-ok');
  check(soDentro, `${rotulo.texto}: o foco fica preso no diálogo (${visitados.join(' → ')})`);
  return visitados;
}

async function fluxo() {
  const app = await startApp({
    role: 'admin',
    workerHandlers: {
      apiAdminLearnListPendingCases: () => ({ success: true, cases: [CASO] }),
      apiAdminLearnReviewCase: () => ({ success: true, message: 'Caso rejeitado.' }),
    },
  });
  try {
    const page = app.page;
    await app.login();
    await page.click('#btn-enter-admin-mode');
    await app.showPanel('panel-admin-ai');
    await page.waitForSelector('#admin-ai-pending .ai-case');

    // 1. Abrir: foco inicial em Cancelar (o botão seguro)
    const opener = await abrirRejeicao(page);
    check((await focusedName(page)) === 'modal-confirm-cancel', 'foco inicial do diálogo vai para Cancelar');

    // 2. Tab/Shift+Tab presos entre Cancelar e Confirmar
    await presoNoDialogo(page, 4, { tecla: 'Shift+Tab', texto: 'Shift+Tab (a partir de Cancelar)' });
    await page.focus('#modal-confirm-cancel');
    await presoNoDialogo(page, 4, { tecla: 'Tab', texto: 'Tab' });

    // 3. Enter fora dos botões não confirma (foco no próprio diálogo, sem botão)
    await page.evaluate(() => {
      const overlay = document.getElementById('modal-confirm');
      overlay.setAttribute('tabindex', '-1');
      overlay.focus();
    });
    await page.keyboard.press('Enter');
    check((await page.locator(`${MODAL}:not(.hidden)`).count()) === 1, 'Enter fora dos botões: o diálogo continua aberto');
    check(reviewCalls(app) === 0, 'Enter fora dos botões: nenhuma confirmação foi enviada');
    await page.evaluate(() => document.getElementById('modal-confirm').removeAttribute('tabindex'));

    // 4. Esc cancela: callback não roda e o foco volta a quem abriu
    await page.focus('#modal-confirm-cancel');
    await page.keyboard.press('Escape');
    await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
    check(reviewCalls(app) === 0, 'Esc: cancelar não executa o callback (nenhuma confirmação enviada)');
    check((await focusedName(page)) === 'opener' && (await opener.getAttribute('data-qa-opener')) === '1', 'Esc: o foco volta ao botão "Rejeitar" que abriu o diálogo');

    // 5. Confirmar executa o callback uma única vez
    await abrirRejeicao(page);
    await page.keyboard.press('Tab');
    check((await focusedName(page)) === 'modal-confirm-ok', 'Tab a partir de Cancelar leva o foco a Confirmar');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const status = document.getElementById('msg-admin-ai-cases');
      return !!status && status.textContent.includes('Caso rejeitado.');
    }, null, { timeout: 10000 });
    check(reviewCalls(app) === 1, `Confirmar: o callback roda uma única vez (${reviewCalls(app)} chamada à API)`);
    check((await page.locator(`${MODAL}.hidden`).count()) === 1, 'Confirmar: o diálogo fecha');
    check(app.errors.length === 0, `sem erros de página no diálogo (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

module.exports = async function confirmA11y() {
  await fluxo();
};
