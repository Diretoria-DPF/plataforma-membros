/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * demo.e2e.js — modo demonstração (demo.html, servido em /demo): F-006 e F-035.
 *  - usar a demo (Farmacologia: responder questões) não grava nenhuma chave no localStorage do aparelho,
 *    nem cria banco no IndexedDB; o módulo guarda só em memória;
 *  - nada vai à Worker nem a outro host;
 *  - restos de versões antigas da demo (registro com dono vazio) são apagados; dados de uma conta, não;
 *  - entrar com uma conta simulada logo depois não herda erros, missão nem progresso;
 *  - em 320 px o aviso é legível (opaco, dentro da tela, alvos de 44 px) e a página não rola na horizontal.
 */
const { startApp, check, ONBOARDING_SEEN_PREFIX } = require('./harness');
const WHATS_NEW = require('../../whats-new.js');

const OWNER_TAG = (mail) => {
  let h = 0x811c9dc5;
  const s = String(mail).trim().toLowerCase();
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16);
};

// O harness semeia duas chaves de "já visto" em toda página (onboarding e novidades); elas não vêm da demo.
const SEMENTES_DO_HARNESS = (k) => k.startsWith(ONBOARDING_SEEN_PREFIX) || k === WHATS_NEW.STORAGE_KEY;
const storageKeys = async (page) => (await page.evaluate(() => Object.keys(window.localStorage).sort())).filter((k) => !SEMENTES_DO_HARNESS(k));

async function responder(frame, quantas) {
  await frame.waitForSelector('#startQuiz');
  await frame.click('#selectAll');
  await frame.click('#startQuiz');
  for (let i = 0; i < quantas; i++) {
    await frame.waitForSelector('#optionsContainer .option');
    await frame.click('#optionsContainer .option:nth-child(' + (i % 2 === 0 ? 1 : 2) + ')');
    if (i < quantas - 1) await frame.click('#nextBtn');
  }
}

async function usarDemo(app) {
  const { page } = app;
  await page.goto(app.baseUrl + 'demo.html');
  await page.waitForSelector('.demo-card[data-id="farmaco"]');
  await page.click('.demo-card[data-id="farmaco"]');
  const el = await page.waitForSelector('#demo-frame iframe');
  const frame = await el.contentFrame();
  await frame.waitForLoadState('load').catch(() => {});
  await responder(frame, 4);
  return frame;
}

module.exports = async function () {
  // ---- 1. Usar a demo não grava no aparelho ----
  const app = await startApp({ role: 'visitor', viewport: { width: 1280, height: 800 } });
  try {
    // Restos da demo antiga (dono vazio) e dados de uma conta, antes de abrir a demo.
    await app.page.goto(app.baseUrl + 'demo.html');
    const dono = OWNER_TAG('ana@exemplo.com');
    await app.page.evaluate((owner) => {
      localStorage.setItem('laiftQuizErrors', JSON.stringify({ v: 1, owner: '', items: {} }));
      localStorage.setItem('laiftMissao', JSON.stringify({ v: 1, owner: '', weeks: {}, topics: {}, earned: {}, weeksDone: [] }));
      localStorage.setItem('toxicoQuizProgress', JSON.stringify({ v: 2, byId: {}, owner: '' }));
      localStorage.setItem('pharmaQuizProgress', JSON.stringify({ v: 2, byId: {}, owner }));
    }, dono);
    await app.page.reload();
    await app.page.waitForSelector('.demo-card[data-id="farmaco"]');
    check(JSON.stringify(await storageKeys(app.page)) === JSON.stringify(['pharmaQuizProgress']),
      'ao abrir a demo, os restos com dono vazio somem e o progresso de uma conta fica intacto');
    await app.page.evaluate(() => localStorage.clear());

    const frame = await usarDemo(app);
    const dentro = await frame.evaluate(() => ({
      progresso: localStorage.getItem('pharmaQuizProgress') !== null,
      missao: localStorage.getItem('laiftMissao') !== null,
      respondidas: document.getElementById('answeredStat').textContent,
    }));
    check(dentro.progresso && dentro.missao && Number(dentro.respondidas) >= 1, 'o módulo funciona na demo: guarda progresso e missão na memória (' + dentro.respondidas + ' respondidas)');
    check((await storageKeys(app.page)).length === 0, 'localStorage do aparelho sem nenhuma chave depois de usar a demo (' + (await storageKeys(app.page)).join(',') + ')');
    check(await app.page.evaluate(() => sessionStorage.length === 0), 'sessionStorage do aparelho vazio');
    const bancos = await app.page.evaluate(() => (indexedDB.databases ? indexedDB.databases() : []));
    check(bancos.length === 0, 'nenhum banco IndexedDB criado pela demo (' + bancos.length + ')');
    check(app.calls.worker.length === 0, 'nenhuma chamada à Worker na demo (' + app.calls.worker.length + ')');
    check(!app.calls.external.some((c) => c.method !== 'GET'), 'nenhum POST a outro host na demo');
    check(!(await app.page.evaluate(() => document.cookie)), 'nenhum cookie na demo');
    check(app.errors.length === 0, 'sem erro de página na demo' + (app.errors.length ? ': ' + app.errors[0] : ''));

    // ---- 2. A conta que entra depois não herda nada ----
    // Simula também o legado: restos com dono vazio gravados por uma demo antiga, que a demo nova não apagou.
    await app.page.evaluate(() => {
      localStorage.setItem('laiftQuizErrors', JSON.stringify({ v: 1, owner: '', items: { 'farmacologia:1': { module: 'farmacologia', id: 1, topic: 'X', wrong: 1, streak: 0, last: new Date(0).toISOString(), due: new Date(0).toISOString() } } }));
      localStorage.setItem('laiftMissao', JSON.stringify({ v: 1, owner: '', weeks: {}, topics: {}, earned: {}, weeksDone: [] }));
      localStorage.setItem('pharmaQuizProgress', JSON.stringify({ v: 2, byId: { 1: 0, 2: 1, 3: 0 }, seed: 1, owner: '', timestamp: Date.now() }));
    });
    await app.login();
    const conta = await app.openModule('farmaco');
    await conta.waitForSelector('#answeredStat');
    const herdado = await conta.evaluate(() => ({
      respondidas: document.getElementById('answeredStat').textContent,
      erros: window.LaiftQuizErrors.createStore(localStorage, () => '').pending().length,
    }));
    check(herdado.respondidas === '0', 'a conta não herda o progresso da demo (respondidas: ' + herdado.respondidas + ')');
    const visto = await conta.evaluate(() => {
      const raw = localStorage.getItem('laiftQuizErrors');
      return { botaoRevisar: !document.getElementById('reviewErrorsBtn').hidden, raw: raw && JSON.parse(raw).owner };
    });
    check(!visto.botaoRevisar, 'a conta não vê "Revisar meus erros" vindos da demo');
  } finally {
    await app.close();
  }

  // ---- 3. Aviso legível em 320 px, sem rolagem horizontal ----
  const cel = await startApp({ role: 'visitor', viewport: { width: 320, height: 640 } });
  try {
    await cel.page.goto(cel.baseUrl + 'demo.html');
    await cel.page.waitForSelector('.demo-card[data-id="farmaco"]');
    const aviso = await cel.page.evaluate(() => {
      const a = document.getElementById('demo-aviso');
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const cor = cs.backgroundColor.match(/[\d.]+/g).map(Number);
      const alvos = Array.from(a.querySelectorAll('a, button')).map((b) => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height }; });
      const p = a.querySelector('p').getBoundingClientRect();
      return {
        visivel: !a.hidden && r.width > 0,
        dentro: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
        opaco: cor.length < 4 || cor[3] === 1,
        textoLargo: p.width >= 200,
        alvos,
        rolagem: document.documentElement.scrollWidth > 320 || window.innerWidth !== 320,
        cabecalhoDentro: Array.from(document.querySelectorAll('.demo-topo > *')).every((n) => n.getBoundingClientRect().right <= 320),
      };
    });
    check(aviso.visivel, 'aviso visível em 320 px');
    check(aviso.dentro, 'aviso inteiro dentro da tela em 320 px');
    check(aviso.opaco, 'fundo do aviso opaco');
    check(aviso.textoLargo, 'texto do aviso com largura legível (coluna não estreita)');
    check(aviso.alvos.every((b) => b.h >= 44 && b.w >= 44), 'botões do aviso com alvo de 44 px');
    check(!aviso.rolagem, 'sem rolagem horizontal em 320 px (a página não alarga o layout)');
    check(aviso.cabecalhoDentro, 'cabeçalho da demo inteiro dentro de 320 px');
    const cobre = await cel.page.evaluate(() => {
      const a = document.getElementById('demo-aviso').getBoundingClientRect();
      const topoDoAviso = document.elementFromPoint(a.left + a.width / 2, a.top + 4);
      return !!topoDoAviso && document.getElementById('demo-aviso').contains(topoDoAviso);
    });
    check(cobre, 'o aviso fica por cima do conteúdo (nada aparece por trás do texto)');
    await cel.page.click('#demo-aviso [data-fechar]');
    check(await cel.page.evaluate(() => document.getElementById('demo-aviso').hidden), 'o aviso fecha');
    check(!(await cel.page.evaluate(() => document.documentElement.scrollWidth > 320 || window.innerWidth !== 320)), 'sem rolagem horizontal com o aviso fechado');

    // Embutido no portfólio (?embed=1): sem cabeçalho e ainda sem gravar no aparelho.
    await cel.page.goto(cel.baseUrl + 'demo.html?embed=1');
    check(await cel.page.evaluate(() => document.documentElement.classList.contains('is-embed')), '?embed=1 aplica o modo embutido');
    check((await storageKeys(cel.page)).length === 0, 'embed: localStorage continua vazio');
  } finally {
    await cel.close();
  }
};
