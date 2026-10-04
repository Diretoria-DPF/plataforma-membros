/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * home.e2e.js — painel Início (frontend/home.js + apiGetHomeSummary).
 */
const { startApp, check } = require('./harness');

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

function summary(extra) {
  return Object.assign({
    nextEvents: [
      { id: 'e1', title: 'Aula de Toxicologia', eventDate: inDays(1), location: 'Sala 2', isRegistered: true, spotsLeft: 3 },
      { id: 'e2', title: 'Simpósio', eventDate: inDays(9), location: null, isRegistered: false, spotsLeft: null },
    ],
    tasks: { myPendingCount: 2, availableCount: 1, next: { id: 't1', title: 'Revisar casos', dueDate: inDays(3) } },
    voting: { openCount: 2, pendingCount: 1, nextClosesAt: inDays(2) },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 3, pendingConnectionRequests: 1 },
  }, extra || {});
}

module.exports = async function home() {
  // ---- Membro: cinco cartões, uma única chamada, navegação pelos botões ----
  let calls = 0;
  const member = await startApp({
    role: 'member',
    workerHandlers: { apiGetHomeSummary: () => { calls += 1; return { success: true, summary: summary() }; } },
  });
  try {
    await member.login();
    await member.page.waitForSelector('#home-dashboard .home-card');
    const ids = await member.page.$$eval('#home-dashboard .home-card', (n) => n.map((c) => c.className.split(' ').pop()));
    check(ids.join(',') === 'home-card-events,home-card-tasks,home-card-voting,home-card-learning,home-card-inbox',
      'membro vê os cinco cartões do Início, na ordem');
    check(calls === 1, 'o Início faz UMA chamada de resumo (' + calls + ')');

    const metrics = await member.page.$$eval('#home-dashboard .home-metric-value', (n) => n.map((c) => c.textContent));
    check(metrics.join(',') === '2,1,72%,3', 'números dos cartões: tarefas, votações, aprendizado e mensagens (' + metrics + ')');
    check((await member.page.textContent('#home-dashboard .home-card-events')).includes('Inscrito'), 'evento em que o membro está inscrito traz o selo "Inscrito"');
    check(/^(Bom dia|Boa tarde|Boa noite), /.test(await member.page.textContent('#home-greeting')), 'saudação com o primeiro nome');

    await member.page.click('#home-dashboard .home-card-events button');
    await member.page.waitForSelector('#panel-events:not(.hidden)');
    check(true, 'o botão "Ver eventos" abre o painel de eventos');
    await member.page.click('#app-nav [data-panel="panel-home"]');
    await member.page.waitForSelector('#home-dashboard .home-card');
    check(calls === 2, 'voltar ao Início recarrega o resumo');
  } finally {
    await member.close();
  }

  // ---- Visitante: só eventos e aprendizado ----
  const visitor = await startApp({
    role: 'visitor',
    workerHandlers: { apiGetHomeSummary: () => ({ success: true, summary: summary({ tasks: null, voting: null, inbox: null }) }) },
  });
  try {
    await visitor.login();
    await visitor.page.waitForSelector('#home-dashboard .home-card');
    const count = await visitor.page.locator('#home-dashboard .home-card').count();
    check(count === 2, 'visitante vê só 2 cartões (eventos e aprendizado): ' + count);
  } finally {
    await visitor.close();
  }

  // ---- Texto malicioso da API vira texto, não HTML ----
  const evil = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({
        success: true,
        summary: summary({ nextEvents: [{ id: 'x', title: '<img src=x onerror="window.__xss=1">', eventDate: inDays(1), location: '<b>l</b>', isRegistered: false, spotsLeft: 1 }] }),
      }),
    },
  });
  try {
    await evil.login();
    await evil.page.waitForSelector('#home-dashboard .home-card');
    check((await evil.page.evaluate(() => window.__xss)) === undefined, 'título malicioso não executa script');
    check((await evil.page.textContent('#home-dashboard .home-card-events')).includes('<img src=x'), 'o título malicioso aparece como texto');
  } finally {
    await evil.close();
  }

  // ---- Falha da API: estado de erro com "Tentar de novo" ----
  let attempt = 0;
  const failing = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => {
        attempt += 1;
        return attempt === 1 ? { success: false, message: 'Servidor ocupado.' } : { success: true, summary: summary() };
      },
    },
  });
  try {
    await failing.login();
    await failing.page.waitForSelector('#home-dashboard .state-error');
    check((await failing.page.textContent('#home-dashboard .state-error')).includes('Servidor ocupado.'), 'erro do resumo é mostrado ao membro');
    check((await failing.page.getAttribute('#home-dashboard .state-error', 'role')) === 'alert', 'o erro é anunciado a leitores de tela (role=alert)');
    await failing.page.click('#home-dashboard .state-error button');
    await failing.page.waitForSelector('#home-dashboard .home-card');
    check(true, '"Tentar de novo" recarrega o Início');
  } finally {
    await failing.close();
  }
};
