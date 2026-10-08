/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * admin-moderation.e2e.js — seção "Moderação da Lia" do painel admin de IA
 * (frontend/admin-moderation.js), como admin, em celular 375x812: carregando
 * (aria-busy), dados (agregados, níveis, pessoas e redenção, sem nome), vazio,
 * erro com "Tentar de novo", sem rolagem horizontal, alvos >= 44 px, axe sem
 * violações serious/critical (axe-gate.js) e logout que limpa a seção.
 */
const { startApp, check, moderationSummary } = require('./harness');
const { axeGate } = require('./axe-gate');

const MOBILE = { width: 375, height: 812 };
const TARGET_MIN_PX = 44;
const EMPTY_SUMMARY = {
  success: true,
  windowDays: 90,
  incidents: { total: 0, byDetection: { terms: 0, llm: 0 }, byLevelAfter: { 1: 0, 2: 0, 3: 0 } },
  people: [],
  currentLevels: { 1: 0, 2: 0, 3: 0 },
  redemption: { accepted: 0, refused: 0, rate: null },
};

/** Abre o painel de IA como admin (mesmo caminho do visual-qa). */
async function openAdminAi(app) {
  await app.login();
  await app.page.click('#btn-enter-admin-mode');
  await app.showPanel('panel-admin-ai');
}

async function sectionText(page) {
  return page.textContent('#admin-moderation');
}

/** Dentro da página: controles visíveis de `selector` que medem menos que `min` px em largura ou altura. */
function smallTargets(args) {
  return Array.from(document.querySelectorAll(args.selector))
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.textContent || el.id || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((t) => t.w < args.min || t.h < args.min);
}

async function checkTargets(page, where) {
  const small = await page.evaluate(smallTargets, { selector: '#admin-moderation-card button, #admin-moderation-card a[href]', min: TARGET_MIN_PX });
  const lista = small.map((t) => `"${t.label}" ${t.w}x${t.h}`).join('; ');
  check(small.length === 0, `${where}: alvos da moderação abaixo de ${TARGET_MIN_PX}x${TARGET_MIN_PX}${lista ? ': ' + lista : ''}`);
}

async function checkNoHorizontalScroll(page, where) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: sem rolagem horizontal a 375 px (${overflow}px além da largura)`);
}

async function checarDados(page) {
  const texto = await sectionText(page);
  check(texto.includes('7 incidentes nos últimos 90 dias'), 'dados: o total de incidentes vem com a janela de 90 dias (7)');
  check(texto.includes('Motivo: 5 detectados por termo ofensivo') && texto.includes('2 confirmados pela avaliação da IA'), 'dados: o motivo separa detecção por termo (5) e avaliação da IA (2)');
  check(texto.includes('Nível atingido no incidente — nível 1: 3 · nível 2: 2 · nível 3: 2'), 'dados: o nível atingido em cada incidente aparece por nível');
  check(texto.includes('Taxa de redenção: 75%') && texto.includes('3 aceitas · 1 recusada (4 tentativas)'), 'dados: a taxa de redenção vem em porcentagem, com aceitas e recusadas');
  check(texto.includes('Nível 1 — alerta') && texto.includes('Nível 3 — suspensão de 24 h'), 'dados: a situação atual lista as pessoas em cada nível');
  check(texto.includes('Conta a1b2c3d4') && texto.includes('Conta e5f6a7b8') && texto.includes('Conta c9d0e1f2'), 'dados: cada pessoa aparece só pelo começo do identificador');
  check(texto.includes('Maior nível no período: Nível 3 — suspensão de 24 h'), 'dados: o maior nível de cada pessoa aparece com o nome do nível');
  check(!texto.includes('Maria Exemplo') && !texto.includes('João Teste') && !texto.includes('Ana Modelo') && !texto.includes('a1b2c3d4-0000'), 'dados: nenhum nome nem identificador completo aparece na seção (LGPD)');
  check((await page.locator('#admin-moderation .list-item').count()) >= 3, 'dados: as três pessoas com incidente têm linha própria');
}

/** Carregando, dados, 375 px, alvos, axe e logout, numa mesma sessão de admin. */
async function fluxoPrincipal() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const app = await startApp({
    role: 'admin',
    viewport: MOBILE,
    workerHandlers: { apiAdminAssistantModeration: async () => { await gate; return moderationSummary(); } },
  });
  try {
    await openAdminAi(app);
    const page = app.page;
    await page.waitForSelector('#admin-moderation[aria-busy="true"]', { timeout: 15000 });
    check((await sectionText(page)).includes('Carregando…'), 'carregando: a seção mostra "Carregando…" enquanto espera a resposta');
    check((await page.getAttribute('#admin-moderation .state-loading', 'role')) === 'status', 'carregando: o aviso é anunciado (role=status)');
    release();
    await page.waitForSelector('#admin-moderation .stat-grid', { timeout: 15000 });
    check((await page.locator('#admin-moderation[aria-busy]').count()) === 0, 'carregando: aria-busy sai da seção quando os dados chegam');
    await checarDados(page);
    await checkNoHorizontalScroll(page, 'dados');
    await checkTargets(page, 'dados');
    await axeGate(page, 'admin/moderação 375x812 (dados)');
    await page.click('#btn-logout');
    check((await page.evaluate(() => document.getElementById('admin-moderation').childElementCount)) === 0, 'logout: a seção de moderação some da tela');
    check(app.errors.length === 0, `dados: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

async function estadoVazio() {
  const app = await startApp({ role: 'admin', viewport: MOBILE, workerHandlers: { apiAdminAssistantModeration: () => EMPTY_SUMMARY } });
  try {
    await openAdminAi(app);
    await app.page.waitForSelector('#admin-moderation .empty-state');
    const texto = await sectionText(app.page);
    check(texto.includes('Nenhum incidente de moderação nos últimos 90 dias.'), 'vazio: a seção diz que não há incidentes na janela');
    check(texto.includes('Como funciona'), 'vazio: a regra dos níveis continua visível');
    await checkNoHorizontalScroll(app.page, 'vazio');
    await axeGate(app.page, 'admin/moderação 375x812 (vazio)');
  } finally {
    await app.close();
  }
}

async function estadoErro() {
  let pedidos = 0;
  const app = await startApp({
    role: 'admin',
    viewport: MOBILE,
    workerHandlers: {
      apiAdminAssistantModeration: () => {
        pedidos += 1;
        return pedidos === 1 ? { success: false, message: 'Servidor ocupado.' } : moderationSummary();
      },
    },
  });
  try {
    await openAdminAi(app);
    const page = app.page;
    await page.waitForSelector('#admin-moderation .state-error');
    check((await page.getAttribute('#admin-moderation .state-error', 'role')) === 'alert', 'erro: a falha é anunciada (role=alert)');
    const texto = await sectionText(page);
    check(texto.includes('Não foi possível carregar a moderação da Lia.') && texto.includes('Servidor ocupado.'), 'erro: mostra o título e a mensagem da API como texto');
    await checkTargets(page, 'erro');
    await axeGate(page, 'admin/moderação 375x812 (erro)');
    await page.click('#admin-moderation .state-error button');
    await page.waitForSelector('#admin-moderation .stat-grid');
    check(pedidos === 2, `erro: "Tentar de novo" refaz o pedido uma única vez (${pedidos})`);
  } finally {
    await app.close();
  }
}

module.exports = async function adminModeration() {
  await fluxoPrincipal();
  await estadoVazio();
  await estadoErro();
};
