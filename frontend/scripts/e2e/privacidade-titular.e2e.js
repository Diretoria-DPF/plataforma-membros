/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * privacidade-titular.e2e.js — direitos do titular (LGPD): seção "Meus dados e privacidade" no Perfil
 * (frontend/privacy.js) e fila de exclusões do admin (frontend/privacy-admin.js), com as APIs simuladas.
 * Baixar dados gera o arquivo; pedir exclusão pede confirmação, mostra o pedido e permite cancelar;
 * o admin vê a fila, conclui com confirmação forte e vê erros do servidor; 375 px e desktop; axe sem violações.
 */
const fs = require('fs');
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const TARGET_MIN_PX = 44;
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

function shortTargets(args) {
  return Array.from(document.querySelectorAll(args.selector)).filter((el) => el.getClientRects().length > 0).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: (el.textContent || el.id).trim().slice(0, 30), h: Math.round(r.height) };
  }).filter((t) => t.h < args.min);
}

async function bate(page, selector, where) {
  const small = await page.evaluate(shortTargets, { selector, min: TARGET_MIN_PX });
  check(small.length === 0, `${where}: botões abaixo de ${TARGET_MIN_PX}px: ${small.map((t) => `"${t.label}" ${t.h}`).join('; ')}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: sem rolagem horizontal (${overflow}px)`);
}

async function titular(rotulo, viewport, role) {
  const seen = { exports: 0, requests: [], cancels: 0 };
  let current = null;
  const app = await startApp({
    role, viewport,
    workerHandlers: {
      apiPrivacyExportMyData: () => {
        seen.exports += 1;
        return { success: true, generatedAt: '2026-10-20T15:00:00.000Z', data: { profile: { fullName: 'Ana Teste', email: 'ana@exemplo.com' } }, notes: ['Mensagens privadas ficam cifradas e não entram no arquivo.'] };
      },
      apiPrivacyGetDeletionStatus: () => ({ success: true, request: current }),
      apiPrivacyRequestDeletion: (args) => {
        seen.requests.push(args[1]);
        current = { id: 'r1', status: 'requested', requestedAt: iso(0), dueAt: iso(180), processedAt: null };
        return { success: true, message: 'Pedido de exclusão registrado.', request: current };
      },
      apiPrivacyCancelDeletion: () => { seen.cancels += 1; current = null; return { success: true, message: 'Pedido cancelado.', request: null }; },
    },
  });
  const { page } = app;
  try {
    await app.login();
    await app.showPanel('panel-profile');
    await page.waitForSelector('#pv-request');
    check(await page.locator('#pv-title').isVisible(), `${rotulo}: seção Meus dados e privacidade aparece para ${role}`);
    check((await page.locator('#privacy-root a[href="privacidade.html"]').count()) === 1, `${rotulo}: link para a Política de Privacidade`);
    check(/180 dias/.test(await page.locator('#privacy-root').innerText()), `${rotulo}: texto do prazo de 180 dias`);
    await bate(page, '#privacy-root button', `${rotulo}/perfil`);
    await axeGate(page, `${rotulo}/perfil`);

    // Baixar os dados: arquivo gerado no navegador.
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pv-export')]);
    check(download.suggestedFilename() === 'meus-dados-laift-2026-10-20.json', `${rotulo}: nome do arquivo (${download.suggestedFilename()})`);
    const body = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    check(body.data && body.data.profile && body.data.profile.fullName === 'Ana Teste', `${rotulo}: conteúdo do arquivo`);
    await page.waitForFunction(() => /foi baixado/.test(document.getElementById('pv-export-live').textContent));
    check(/cifradas/.test(await page.locator('#pv-notes').innerText()), `${rotulo}: observações do servidor aparecem`);
    check((await page.getAttribute('#pv-export-live', 'aria-live')) === 'polite', `${rotulo}: região de aviso educada`);
    check(seen.exports === 1, `${rotulo}: uma chamada de exportação`);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /privac|titular|export|delet/i.test(k)));
    check(stored.length === 0, `${rotulo}: nada de privacidade no localStorage`);

    // Pedir exclusão: confirmação antes de enviar.
    await page.fill('#pv-reason', '  Não uso mais  ');
    await page.click('#pv-request');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    check(seen.requests.length === 0, `${rotulo}: pedido espera a confirmação`);
    await page.click('#modal-confirm-cancel');
    check(seen.requests.length === 0, `${rotulo}: cancelar a confirmação não envia`);
    await page.click('#pv-request');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    await page.click('#modal-confirm-ok');
    await page.waitForSelector('#pv-status');
    check(seen.requests.length === 1 && seen.requests[0].reason === 'Não uso mais', `${rotulo}: motivo enviado sem espaços`);
    const status = await page.locator('#pv-status').innerText();
    check(/em andamento/i.test(status) && /faltam 18\d dias|faltam 17\d dias/.test(status), `${rotulo}: mostra pedido em andamento com o prazo (${status.replace(/\s+/g, ' ')})`);
    check(/Pedido de exclusão registrado/.test(await page.locator('#pv-delete-live').innerText()), `${rotulo}: mensagem de sucesso`);
    await bate(page, '#privacy-root button', `${rotulo}/pedido`);
    await axeGate(page, `${rotulo}/pedido`);

    // Ao reabrir a seção, o estado vem do servidor.
    await app.showPanel('panel-home');
    await app.showPanel('panel-profile');
    await page.waitForSelector('#pv-status');
    check(true, `${rotulo}: estado do pedido volta ao reabrir o perfil`);

    await page.click('#pv-cancel');
    await page.waitForSelector('#pv-request');
    check(seen.cancels === 1 && /Pedido cancelado/.test(await page.locator('#pv-delete-live').innerText()), `${rotulo}: cancelar o pedido volta ao formulário`);
    check(app.errors.length === 0, `${rotulo}: sem erros de página (${app.errors.join('; ')})`);
    await page.click('#btn-logout');
    check((await page.evaluate(() => document.getElementById('privacy-root').childElementCount)) === 0, `${rotulo}: logout limpa a seção`);
  } finally { await app.close(); }
}

async function titularComErros() {
  const app = await startApp({
    role: 'visitor', viewport: { width: 375, height: 812 },
    workerHandlers: {
      apiPrivacyGetDeletionStatus: () => ({ success: false, message: 'Servidor ocupado.' }),
      apiPrivacyExportMyData: () => ({ success: false, message: 'Muitas tentativas. Aguarde.' }),
    },
  });
  try {
    await app.login();
    await app.showPanel('panel-profile');
    await app.page.waitForSelector('#pv-request');
    await app.page.waitForFunction(() => /Servidor ocupado/.test(document.getElementById('pv-delete-live').textContent));
    await app.page.click('#pv-export');
    await app.page.waitForFunction(() => /Muitas tentativas/.test(document.getElementById('pv-export-live').textContent));
    check((await app.page.getAttribute('#pv-delete-live', 'data-kind')) === 'error', 'erros: aviso de erro marcado');
    await axeGate(app.page, 'erros');
  } finally { await app.close(); }
}

function fila(status) {
  const all = {
    requested: [
      { id: 'd1', label: 'Maria', status: 'requested', requestedAt: iso(-170), dueAt: iso(10) },
      { id: 'd2', label: 'João', status: 'requested', requestedAt: iso(-185), dueAt: iso(-5) },
      { id: 'd3', label: 'Ana', status: 'requested', requestedAt: iso(-5), dueAt: iso(175) },
    ],
    completed: [{ id: 'd4', label: 'Pedro', status: 'completed', requestedAt: iso(-90), dueAt: iso(90) }],
    cancelled: [],
  };
  return { success: true, status, items: all[status] || [] };
}

async function admin(rotulo, viewport) {
  const seen = { lists: [], completes: [] };
  let falha = null;
  const app = await startApp({
    role: 'admin', viewport,
    workerHandlers: {
      apiAdminListDeletionRequests: (args) => { seen.lists.push((args[1] || {}).status); return fila((args[1] || {}).status); },
      apiAdminCompleteDeletion: (args) => {
        seen.completes.push(args[1]);
        return falha ? { success: false, message: falha } : { success: true, message: 'Exclusão concluída.' };
      },
    },
  });
  const { page } = app;
  try {
    await app.login();
    await page.click('#btn-enter-admin-mode');
    check(await page.locator('#app-nav [data-panel="panel-admin-privacy"]').isVisible(), `${rotulo}: item Exclusões no menu admin`);
    await app.showPanel('panel-admin-privacy');
    await page.waitForSelector('.pv-row');
    check((await page.locator('.pv-row').count()) === 3, `${rotulo}: três pedidos em andamento`);
    const txt = await page.locator('#privacy-admin-root').innerText();
    check(/Maria/.test(txt) && !/@/.test(txt), `${rotulo}: só o primeiro nome, sem e-mail`);
    check(/Prazo vencido/.test(txt) && /Prazo perto do fim/.test(txt), `${rotulo}: destaque de prazo vencido e perto do fim`);
    check((await page.locator('.pv-row--overdue').count()) === 1 && (await page.locator('.pv-row--soon').count()) === 1, `${rotulo}: uma linha vencida e uma quase vencida`);
    check(/faltam 10 dias|faltam 9 dias/.test(txt) && /venceu há 5 dias/.test(txt), `${rotulo}: contagem de dias`);
    check(/2 com prazo vencido ou perto do fim/.test(txt), `${rotulo}: resumo de urgentes`);
    await bate(page, '#privacy-admin-root button', `${rotulo}/fila`);
    await axeGate(page, `${rotulo}/fila`);

    await page.click('.pv-tab[data-status="completed"]');
    await page.waitForFunction(() => /Pedro/.test(document.getElementById('privacy-admin-root').textContent));
    check((await page.locator('.pv-row button').count()) === 0, `${rotulo}: concluídas não têm botão`);
    await page.click('.pv-tab[data-status="cancelled"]');
    await page.waitForSelector('.pv-empty');
    check(/Nenhum pedido cancelado/.test(await page.locator('.pv-empty').innerText()), `${rotulo}: estado vazio`);
    await axeGate(page, `${rotulo}/vazio`);
    await page.click('.pv-tab[data-status="requested"]');
    await page.waitForSelector('.pv-row');

    // Concluir: confirmação forte.
    await page.click('.pv-row button[data-id="d2"]');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    check(/apaga a conta de forma definitiva e não pode ser desfeito/.test(await page.locator('#modal-confirm').innerText()), `${rotulo}: confirmação forte`);
    check(seen.completes.length === 0, `${rotulo}: concluir espera a confirmação`);
    await page.click('#modal-confirm-cancel');
    check(seen.completes.length === 0, `${rotulo}: cancelar a confirmação não conclui`);

    // Depois da confirmação, pede a senha (reautenticação); com erro do servidor a janela fica aberta para tentar de novo.
    falha = 'Não é possível excluir o último administrador.';
    await page.click('.pv-row button[data-id="d2"]');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    await page.click('#modal-confirm-ok');
    await page.waitForSelector('#modal-stepup:not(.hidden)');
    check(seen.completes.length === 0, `${rotulo}: concluir espera a senha`);
    await page.fill('#stepup-password', 'senha-de-teste');
    await page.click('#modal-stepup-ok');
    await page.waitForFunction(() => /último administrador/.test(document.querySelector('#privacy-admin-root .pv-live').textContent));
    check((await page.locator('.pv-row').count()) === 3, `${rotulo}: conflito mantém a lista`);
    check(await page.locator('#modal-stepup').isVisible(), `${rotulo}: com erro, a janela da senha continua aberta`);

    falha = null;
    await page.click('#modal-stepup-ok');
    await page.waitForFunction(() => /Exclusão concluída/.test(document.querySelector('#privacy-admin-root .pv-live').textContent));
    check(seen.completes.length === 2 && seen.completes[1].password === 'senha-de-teste', `${rotulo}: a senha segue no pedido de conclusão`);
    check(seen.completes.length === 2 && seen.completes[1].id === 'd2', `${rotulo}: concluir envia o id`);
    check(seen.lists.filter((s) => s === 'requested').length >= 3, `${rotulo}: lista recarregada depois de concluir`);
    check(app.errors.length === 0, `${rotulo}: sem erros de página (${app.errors.join('; ')})`);
    await page.click('#btn-logout');
    check((await page.evaluate(() => document.getElementById('privacy-admin-root').childElementCount)) === 0, `${rotulo}: logout limpa a fila`);
  } finally { await app.close(); }
}

async function filaComErro() {
  let n = 0;
  const app = await startApp({
    role: 'admin', viewport: { width: 375, height: 812 },
    workerHandlers: { apiAdminListDeletionRequests: () => { n += 1; return n === 1 ? { success: false, message: 'Servidor ocupado.' } : fila('requested'); } },
  });
  try {
    await app.login();
    await app.page.click('#btn-enter-admin-mode');
    await app.showPanel('panel-admin-privacy');
    await app.page.waitForSelector('#privacy-admin-root .pv-error');
    check((await app.page.getAttribute('.pv-error', 'role')) === 'alert' && /Servidor ocupado/.test(await app.page.locator('.pv-error').innerText()), 'fila: erro anunciado');
    await axeGate(app.page, 'fila erro');
    await app.page.click('#pv-retry');
    await app.page.waitForSelector('.pv-row');
    check(true, 'fila: tentar de novo carrega');
  } finally { await app.close(); }
}

module.exports = async function privacidadeTitular() {
  await titular('celular 375', { width: 375, height: 812 }, 'member');
  await titular('desktop 1280', { width: 1280, height: 800 }, 'admin');
  await titularComErros();
  await admin('celular 375', { width: 375, height: 812 });
  await admin('desktop 1280', { width: 1280, height: 800 });
  await filaComErro();
};
