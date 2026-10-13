/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory.e2e.js — Memória de estudo no Perfil (frontend/memory.js, ADR 0007, etapa 7).
 * A "flag" é o próprio mock de apiMemoryGet: MEMORY_DISABLED (ou resposta sem consentimento/estado) = sem cartão e o Perfil
 * segue normal. Com ele: texto da finalidade, ativar (confirmação real do app, com a purposeVersion do servidor), itens por
 * texto puro (HTML vira texto), preferências só de listas, apagar item/tudo e desligar com confirmação, "Baixar meus dados"
 * sem nenhuma chamada além de apiMemoryExport, texto que mudou (needsReconsent) e o atalho "Gerenciar memória" do Tutor.
 * axe claro e escuro; no celular a barra inferior não cobre os botões do fim do cartão.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const VERSION = 'memoria-2026-10-v1';
const VOCAB = {
  topics: [{ slug: 'farmacocinetica', label: 'Farmacocinética' }, { slug: 'antimicrobianos', label: 'Antimicrobianos' }],
  preferences: [{ slug: 'formato', values: ['exemplos', 'resumo', 'passo_a_passo'] }, { slug: 'ritmo', values: ['curto', 'detalhado'] }],
  goals: ['prova', 'revisao'],
};
const LIMITS = { maxItems: 60, retentionUnusedDays: 180, retentionMaxMonths: 12 };
const EVIL = '<img src=x onerror="window.__memXss=1">Tema';
const item = (id, o) => Object.assign({ id: `00000000-0000-4000-8000-00000000000${id}`, kind: 'topic_level', slug: 'farmacocinetica', label: 'Farmacocinética', level: 3, value: null, source: 'quiz', evidence: 2 }, o || {});

/** Servidor de memória em memória: consentimento + itens; devolve os manipuladores dos apiMemory*. */
function memoryServer(initial) {
  const s = Object.assign({ status: 'none', current: false, needsReconsent: false, items: [] }, initial || {});
  const consent = () => ({ status: s.status, current: s.current, needsReconsent: s.needsReconsent, purposeVersion: VERSION });
  return {
    state: s,
    handlers: {
      apiMemoryGet: () => ({
        success: true, alpha: true, available: true, consent: consent(), items: s.current ? s.items : [], vocabulary: VOCAB, limits: LIMITS,
      }),
      apiMemorySetConsent: (args) => {
        const granted = args[1] && args[1].granted === true;
        Object.assign(s, granted ? { status: 'granted', current: true, needsReconsent: false } : { status: 'revoked', current: false, needsReconsent: false, items: [] });
        return { success: true, consent: consent(), erased: !granted, queued: false };
      },
      apiMemoryDeleteItem: (args) => {
        s.items = s.items.filter((i) => i.id !== args[1].id);
        return { success: true, deleted: 1 };
      },
      apiMemoryDeleteAll: () => { const deleted = s.items.length; s.items = []; return { success: true, deleted }; },
      apiMemorySetPreference: (args) => {
        const saved = item(9, { kind: args[1].kind, slug: args[1].slug, label: null, level: args[1].level || null, value: args[1].value || 'ativo', source: 'member' });
        s.items = s.items.filter((i) => !(i.kind === saved.kind && i.slug === saved.slug)).concat([saved]);
        return { success: true, item: saved };
      },
      apiMemoryExport: () => ({
        success: true, format: 'laift-memory/v1', exportedAt: '2026-10-12T12:00:00.000Z', consent: consent(),
        items: s.items.map((i) => ({ kind: i.kind, slug: i.slug, label: i.label, level: i.level, value: i.value, source: i.source })),
      }),
    },
  };
}

const calls = (app, action) => app.calls.worker.filter((c) => c.action === action);
const visible = (page, sel) => page.locator(sel).first().isVisible();

async function confirmar(page) {
  await page.waitForSelector('#modal-confirm:not(.hidden)');
  await page.click('#modal-confirm-ok');
  await page.waitForSelector('#modal-confirm.hidden', { state: 'attached' });
}

async function semCartao() {
  const cenarios = [
    ['MEMORY_DISABLED', { apiMemoryGet: () => ({ success: false, code: 'MEMORY_DISABLED', reason: 'flag', message: 'x' }) }],
    ['resposta sem consentimento (flag desligada)', {}],
  ];
  for (const [nome, handlers] of cenarios) {
    const app = await startApp({ role: 'member', workerHandlers: handlers });
    try {
      await app.login();
      await app.showPanel('panel-profile');
      await app.page.waitForSelector('#mfa-card');
      await app.page.waitForTimeout(300);
      check(await app.page.locator('#memory-card').count() === 0, `${nome}: o cartão de memória não aparece`);
      check(await app.page.locator('#form-profile').count() === 1, `${nome}: o resto do Perfil segue na tela`);
      await app.showPanel('panel-home');
      await app.showPanel('panel-profile');
      check(calls(app, 'apiMemoryGet').length === 1, `${nome}: o estado foi pedido uma vez só, mesmo reabrindo o Perfil`);
      check(app.errors.length === 0, `${nome}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
}

async function ativar(app, server) {
  const page = app.page;
  await app.showPanel('panel-profile');
  await page.waitForSelector('#memory-card');
  const text = await page.textContent('#memory-card');
  check(/Para que serve/.test(text) && /O que NÃO guardamos/.test(text) && /180 dias sem uso/.test(text) && /Base legal/.test(text), 'a tela mostra o texto da finalidade com os prazos do servidor');
  check(await page.locator('#memory-card .memory-items').count() === 0, 'sem consentimento nada guardado aparece');
  await axeGate(page, 'Memória de estudo: consentimento (claro, desktop)');
  await page.click('#memory-card [data-key="activate"]');
  await page.waitForSelector('#modal-confirm:not(.hidden)');
  check(calls(app, 'apiMemorySetConsent').length === 0, 'antes de confirmar nada é enviado');
  check(/nunca o texto das suas conversas/.test(await page.textContent('#modal-confirm-message')), 'a confirmação explica o que é guardado');
  await confirmar(page);
  await page.waitForSelector('#memory-card [data-key="revoke"]');
  const set = calls(app, 'apiMemorySetConsent')[0];
  check(set.args[0] === 'e2e-session-token' && set.args[1].granted === true && set.args[1].purposeVersion === VERSION, 'o aceite leva a purposeVersion lida do servidor');
  check(server.state.current === true, 'o servidor registrou o consentimento');
}

async function usar(app) {
  const page = app.page;
  check(await page.locator('#memory-card .memory-item').count() === 2, 'os itens do servidor aparecem');
  check((await page.textContent('#memory-card .memory-item-title')).includes('<img src=x'), 'o HTML do tema aparece como texto');
  check(await page.locator('#memory-card img').count() === 0, 'nenhuma tag <img> nasceu do item');
  check(await page.evaluate(() => window.__memXss === undefined), 'o onerror do item nunca rodou');
  await page.selectOption('#memory-goal-slug', 'prova');
  await page.click('#memory-card [data-key="save-memory-goal"]');
  await page.waitForFunction(() => /Salvo/.test(document.getElementById('memory-status').textContent));
  check(calls(app, 'apiMemorySetPreference')[0].args[1].kind === 'goal', 'o objetivo foi salvo por apiMemorySetPreference');
  check(await page.locator('#memory-card .memory-item').count() === 3, 'o objetivo entra na lista');
  const antes = await page.locator('#memory-card .memory-item').count();
  await page.locator('#memory-card .memory-item-delete').first().click();
  await page.waitForSelector('#modal-confirm:not(.hidden)');
  check(calls(app, 'apiMemoryDeleteItem').length === 0, 'apagar item espera a confirmação');
  await confirmar(page);
  await page.waitForFunction((n) => document.querySelectorAll('#memory-card .memory-item').length === n, antes - 1);
  check(calls(app, 'apiMemoryDeleteItem').length === 1, 'o item foi apagado depois de confirmar');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'memory-items-title', 'o foco vai ao título da lista depois de apagar');
}

async function baixar(app) {
  const page = app.page;
  const antes = app.calls.worker.length;
  const externos = app.calls.external.length;
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#memory-card [data-key="export"]')]);
  check(/^laift-memoria-de-estudo-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), 'o arquivo tem nome previsível');
  const fs = require('fs');
  const conteudo = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  check(conteudo.format === 'laift-memory/v1' && Array.isArray(conteudo.items) && conteudo.items.length >= 1, 'o JSON baixado traz os itens');
  check(conteudo.items.every((i) => !('id' in i)), 'o arquivo não leva identificadores internos');
  await page.waitForFunction(() => /Nada foi enviado/.test(document.getElementById('memory-status').textContent));
  const novas = app.calls.worker.slice(antes).map((c) => c.action);
  check(novas.length === 1 && novas[0] === 'apiMemoryExport', `a exportação só chamou apiMemoryExport (${novas.join(', ')})`);
  check(app.calls.external.length === externos, 'a exportação não foi para fora da Worker');
}

async function apagarEDesligar(app) {
  const page = app.page;
  await page.click('#memory-card [data-key="delete-all"]');
  await page.waitForSelector('#modal-confirm:not(.hidden)');
  check(calls(app, 'apiMemoryDeleteAll').length === 0, 'apagar tudo espera a confirmação');
  await confirmar(page);
  await page.waitForFunction(() => document.querySelectorAll('#memory-card .memory-item').length === 0);
  check(calls(app, 'apiMemoryDeleteAll').length === 1, 'tudo foi apagado depois de confirmar');
  check(await visible(page, '#memory-card [data-key="revoke"]'), 'a memória continua ativada');
  await page.click('#memory-card [data-key="revoke"]');
  await page.waitForSelector('#modal-confirm:not(.hidden)');
  await confirmar(page);
  await page.waitForSelector('#memory-card [data-key="activate"]');
  check(calls(app, 'apiMemorySetConsent')[1].args[1].granted === false, 'desligar revoga o consentimento');
  check(/desativada e apagada/.test(await page.textContent('#memory-status')), 'a pessoa é avisada do apagamento');
}

async function fluxo() {
  const server = memoryServer({ items: [item(1, { label: EVIL }), item(2, { kind: 'difficulty', slug: 'antimicrobianos', label: 'Antimicrobianos', level: 2, source: 'tutor' })] });
  const app = await startApp({ role: 'member', workerHandlers: server.handlers });
  try {
    await app.login();
    check(calls(app, 'apiMemoryGet').length === 0, 'antes de abrir o Perfil o estado não é pedido');
    await ativar(app, server);
    await usar(app);
    await axeGate(app.page, 'Memória de estudo: ativa (claro, desktop)');
    await baixar(app);
    await apagarEDesligar(app);
    check(app.errors.length === 0, `sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

async function textoMudou() {
  const server = memoryServer({ status: 'granted', current: false, needsReconsent: true, items: [item(1)] });
  const app = await startApp({ role: 'member', theme: 'dark', workerHandlers: server.handlers });
  try {
    await app.login();
    await app.showPanel('panel-profile');
    await app.page.waitForSelector('#memory-card');
    check(/O texto da memória de estudo mudou/.test(await app.page.textContent('#memory-card')), 'avisa que o texto mudou');
    check(await app.page.locator('#memory-card .memory-items').count() === 0, 'nada guardado é lido antes do novo aceite');
    check((await app.page.textContent('#memory-card [data-key="activate"]')) === 'Aceitar o novo texto', 'o botão pede o novo aceite');
    await axeGate(app.page, 'Memória de estudo: texto mudou (escuro, desktop)');
    await app.page.click('#memory-card [data-key="activate"]');
    await confirmar(app.page);
    await app.page.waitForSelector('#memory-card [data-key="revoke"]');
    check(calls(app, 'apiMemorySetConsent')[0].args[1].purposeVersion === VERSION, 'o novo aceite leva a versão atual');
    check(app.errors.length === 0, `sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

async function celular() {
  const server = memoryServer({ status: 'granted', current: true, items: [item(1), item(2, { kind: 'difficulty', slug: 'antimicrobianos', label: 'Antimicrobianos', level: 2, source: 'tutor' })] });
  const app = await startApp({ role: 'member', theme: 'dark', viewport: { width: 360, height: 740 }, workerHandlers: server.handlers });
  try {
    await app.login();
    await app.showPanel('panel-profile');
    await app.page.waitForSelector('#memory-card [data-key="revoke"]');
    await app.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await app.page.waitForTimeout(200);
    const r = await app.page.evaluate(() => {
      const nav = document.getElementById('app-nav').getBoundingClientRect();
      const last = document.querySelector('#memory-card [data-key="revoke"]').getBoundingClientRect();
      const small = Array.from(document.querySelectorAll('#memory-card button, #memory-card select')).filter((b) => b.getBoundingClientRect().height < 44).length;
      return { navTop: nav.top, lastBottom: last.bottom, small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    check(r.lastBottom <= r.navTop, 'no celular a barra inferior não cobre o último botão do cartão');
    check(r.small === 0, 'botões e listas do cartão têm alvo de toque de 44 px');
    check(r.overflow <= 0, 'sem rolagem horizontal em 360 px');
    await axeGate(app.page, 'Memória de estudo: ativa (escuro, 360x740)');
    check(app.errors.length === 0, `sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

async function atalhoDoTutor() {
  const server = memoryServer({ status: 'granted', current: true, items: [item(1)] });
  const tutor = { id: 'tutor-clinico', name: 'Tutor Clínico', version: '1.0.0', description: 'x', capabilities: [], quota: {}, memory: { available: true } };
  const app = await startApp({
    role: 'member',
    workerHandlers: Object.assign({}, server.handlers, {
      apiAgentsList: () => ({ success: true, alpha: true, agents: [tutor] }),
      apiAgentsInvoke: () => ({ success: true, reply: 'A meia-vida é o tempo para a concentração cair à metade.', sources: [], memory: { available: true, used: true, count: 2 } }),
    }),
  });
  try {
    await app.login();
    await app.showPanel('panel-learn');
    await app.page.waitForSelector('#agents-tutor');
    await app.page.fill('#agents-tutor-input', 'O que é meia-vida?');
    await app.page.press('#agents-tutor-input', 'Control+Enter');
    await app.page.waitForSelector('.agents-tutor-memory-link');
    check(/Usou sua memória de estudo \(2 itens\)/.test(await app.page.textContent('.agents-tutor-memory')), 'o selo mostra quantos itens foram usados');
    await app.page.click('.agents-tutor-memory-link');
    await app.page.waitForSelector('#panel-profile:not(.hidden)');
    await app.page.waitForSelector('#memory-card');
    await app.page.waitForFunction(() => document.activeElement && document.activeElement.id === 'memory-card-title');
    check(true, 'o atalho leva ao Perfil e o foco vai ao cartão de memória');
    check(app.errors.length === 0, `sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

module.exports = async function () {
  await semCartao();
  await fluxo();
  await textoMudou();
  await celular();
  await atalhoDoTutor();
};
