/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selection-admin.e2e.js — painel da comissão do processo seletivo (frontend/selection-admin.js), como admin,
 * com as cinco actions simuladas: contadores e filtros, lista em cartões, ficha com respostas e resumo da IA,
 * decisão com confirmação, configurações, estados de erro e vazio, 375 px e desktop, alvos >= 44 px, axe sem violações.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const TARGET_MIN_PX = 44;
const ITEMS = [
  { id: 'a1', name: 'Maria Exemplo', status: 'submitted', receiptCode: 'LAIFT-AAAA1111', course: 'Farmácia', semester: '5', submittedAt: '2026-10-05T12:00:00Z', signals: ['saude'], hasTriage: true, appeal: false },
  { id: 'a2', name: 'João Teste', status: 'in_review', receiptCode: 'LAIFT-BBBB2222', course: 'Biomedicina', semester: '3', submittedAt: '2026-10-06T12:00:00Z', signals: [], hasTriage: false, appeal: false },
];
const DETAIL = {
  id: 'a1', name: 'Maria Exemplo', email: 'maria@exemplo.com', status: 'submitted', receiptCode: 'LAIFT-AAAA1111', submittedAt: '2026-10-05T12:00:00Z',
  answers: {
    profile: { course: 'Farmácia', institution: 'UNINASSAU', semester: '5', areas: ['Toxicologia'], hoursPerWeek: 6, days: ['seg'], shifts: ['noite'], motivation: 'Quero aprender.' },
    scenario: { text: 'Minha análise do cenário clínico.' },
    thinking: { answers: { t01: 'Um projeto sobre farmacovigilância.', t04: 'Não sei interpretar meta-análises.' } },
    conduct: { answers: { c01: 'Avisaria a coordenação cedo.' } },
  },
  signals: ['saude'], triage: { summary: 'Boa base e clareza.', strengths: ['Cita fontes'], checks: ['Conferir menção a paciente'] },
  decisionNote: '', appealAt: null, appealNote: null, events: [],
};

function overview(filter, extra) {
  const items = filter === 'pending' ? ITEMS : [];
  return Object.assign({
    success: true, counts: { submitted: 1, in_review: 1, interview: 0, waitlist: 2, approved: 1, not_selected: 0 }, appeals: 1,
    settings: { isOpen: true, windowDays: 7, batchEveryDays: 15, nextReviewOn: '2026-11-05', vacanciesNote: 'Dez vagas' }, aiEnabled: true, items,
  }, extra || {});
}

function shortTargets(args) {
  return Array.from(document.querySelectorAll(args.selector)).filter((el) => el.getClientRects().length > 0).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: (el.textContent || el.id).trim().slice(0, 30), h: Math.round(r.height) };
  }).filter((t) => t.h < args.min);
}

async function bate(page, where) {
  const small = await page.evaluate(shortTargets, { selector: '#selection-admin-root button', min: TARGET_MIN_PX });
  check(small.length === 0, `${where}: botões abaixo de ${TARGET_MIN_PX}px de altura: ${small.map((t) => `"${t.label}" ${t.h}`).join('; ')}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: sem rolagem horizontal (${overflow}px)`);
}

async function abrir(app) {
  await app.login();
  await app.page.click('#btn-enter-admin-mode');
  await app.showPanel('panel-admin-selection');
}

async function fluxo(rotulo, viewport) {
  const seen = { decide: [], settings: [], triage: [], filters: [] };
  const app = await startApp({
    role: 'admin', viewport,
    workerHandlers: {
      apiSelectionCommitteeOverview: (args) => { const f = (args[1] || {}).filter; seen.filters.push(f); return overview(f); },
      apiSelectionCommitteeGet: () => ({ success: true, application: DETAIL }),
      apiSelectionCommitteeTriage: (args) => { seen.triage.push(args[1]); return { success: true, message: 'Resumos gerados.' }; },
      apiSelectionCommitteeDecide: (args) => { seen.decide.push(args[1]); return { success: true, message: 'Decisão registrada.' }; },
      apiSelectionCommitteeSettings: (args) => { seen.settings.push(args[1]); return { success: true, message: 'Configurações salvas.' }; },
    },
  });
  const { page } = app;
  try {
    await abrir(app);
    await page.waitForSelector('.sa-item');
    const cards = await page.locator('.sa-counter').allInnerTexts();
    check(cards.length === 4 && /2\s+Para analisar/.test(cards[0]) && /2\s+Lista de espera/.test(cards[1]) && /1\s+Decididas/.test(cards[2]) && /1\s+Pedidos de revisão/.test(cards[3]), `${rotulo}: quatro contadores corretos`);
    check((await page.locator('.sa-item').count()) === 2, `${rotulo}: dois cartões na lista`);
    const txt = await page.locator('#selection-admin-root').innerText();
    check(/ler com atenção/.test(txt) && /Resumo da IA/.test(txt), `${rotulo}: etiquetas de sinal e selo do resumo`);
    check(await page.locator('#sa-triage-all').isVisible(), `${rotulo}: botão de gerar resumos aparece com IA ligada`);
    await bate(page, `${rotulo}/lista`);
    await axeGate(page, `${rotulo}/lista`);

    await page.click('.sa-counter >> nth=1');
    await page.waitForSelector('.sa-empty');
    check(seen.filters.includes('waitlist') && /Ninguém na lista de espera/.test(await page.locator('.sa-empty').innerText()), `${rotulo}: filtro lista de espera e estado vazio`);
    await page.click('.sa-counter >> nth=0');
    await page.waitForSelector('.sa-item');

    await page.click('#sa-triage-all');
    await page.waitForFunction(() => /Resumos gerados/.test(document.querySelector('.sa-live').textContent));
    check(seen.triage.length === 1, `${rotulo}: gerar resumos chama a API`);

    await page.click('#sa-settings-toggle');
    check((await page.getAttribute('#sa-settings-toggle', 'aria-expanded')) === 'true', `${rotulo}: configurações abrem`);
    await page.fill('#sa-window', '0');
    await page.click('#sa-save-settings');
    check(/prazo individual/i.test(await page.locator('.sa-live').innerText()) && seen.settings.length === 0, `${rotulo}: valor inválido é barrado antes da API`);
    await page.fill('#sa-window', '10');
    await bate(page, `${rotulo}/configurações`);
    await axeGate(page, `${rotulo}/configurações`);
    await page.click('#sa-save-settings');
    await page.waitForFunction(() => /Configurações salvas/.test(document.querySelector('.sa-live').textContent));
    check(seen.settings[0].windowDays === 10 && seen.settings[0].nextReviewOn === '2026-11-05' && seen.settings[0].isOpen === true, `${rotulo}: carga das configurações correta`);

    await page.click('.sa-item >> nth=0');
    await page.waitForSelector('[data-sa-view="detail"]');
    const ficha = await page.locator('#selection-admin-root').innerText();
    check(/Seu projeto/.test(ficha) && /Limite do que você sabe/.test(ficha) && /Prazo em risco/.test(ficha) && /Minha análise do cenário/.test(ficha), `${rotulo}: ficha com respostas e rótulos fixos`);
    check(/A IA só resume; quem decide é a comissão\./.test(ficha) && /Cita fontes/.test(ficha), `${rotulo}: resumo da IA com aviso fixo`);
    await bate(page, `${rotulo}/ficha`);
    await axeGate(page, `${rotulo}/ficha`);

    await page.fill('#sa-note', 'Boa candidata');
    await page.click('[data-decision="interview"]');
    await page.waitForSelector('[data-sa-view="list"]');
    check(seen.decide.length === 1 && seen.decide[0].decision === 'interview' && seen.decide[0].note === 'Boa candidata' && seen.decide[0].id === 'a1', `${rotulo}: decisão sem confirmação enviada`);

    await page.click('.sa-item >> nth=0');
    await page.waitForSelector('[data-sa-view="detail"]');
    await page.click('[data-decision="not_selected"]');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    check(seen.decide.length === 1, `${rotulo}: "Não selecionar" espera a confirmação`);
    await page.click('#modal-confirm-cancel');
    await page.click('[data-decision="approved"]');
    await page.waitForSelector('#modal-confirm:not(.hidden)');
    await page.click('#modal-confirm-ok');
    await page.waitForSelector('[data-sa-view="list"]');
    check(seen.decide.length === 2 && seen.decide[1].decision === 'approved', `${rotulo}: aprovar só vai depois de confirmar`);

    check(app.errors.length === 0, `${rotulo}: sem erros de página (${app.errors.join('; ')})`);
    await page.click('#btn-logout');
    check((await page.evaluate(() => document.getElementById('selection-admin-root').childElementCount)) === 0, `${rotulo}: logout limpa o painel`);
  } finally { await app.close(); }
}

async function erroEVazio() {
  let n = 0;
  const app = await startApp({
    role: 'admin', viewport: { width: 375, height: 812 },
    workerHandlers: {
      apiSelectionCommitteeOverview: () => { n += 1; return n === 1 ? { success: false, message: 'Servidor ocupado.' } : overview('pending', { items: [], aiEnabled: false }); },
    },
  });
  try {
    await abrir(app);
    await app.page.waitForSelector('#selection-admin-root .sa-error');
    check((await app.page.getAttribute('.sa-error', 'role')) === 'alert' && /Servidor ocupado/.test(await app.page.locator('.sa-error').innerText()), 'erro: mensagem anunciada');
    await axeGate(app.page, 'erro');
    await app.page.click('#sa-retry');
    await app.page.waitForSelector('.sa-empty');
    check(/Nada para analisar/.test(await app.page.locator('.sa-empty').innerText()), 'vazio: mensagem de lista vazia');
    check((await app.page.locator('#sa-triage-all').count()) === 0, 'vazio: sem botão de resumos com a IA desligada');
    await axeGate(app.page, 'vazio');
  } finally { await app.close(); }
}

module.exports = async function selectionAdmin() {
  await fluxo('celular 375', { width: 375, height: 812 });
  await fluxo('desktop 1280', { width: 1280, height: 800 });
  await erroEVazio();
};
