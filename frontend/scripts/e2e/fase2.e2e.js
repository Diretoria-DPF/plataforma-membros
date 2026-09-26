/**
 * fase2.e2e.js — Fase 2 (Dados & Presença), com a Worker simulada pelo harness.
 *
 * Cobre: estatísticas/conquistas do hub a partir de apiLearnGetMyStats; a
 * ponte LaiftApi.call (token só da plataforma, allowlist recusando ações
 * fora dela sem chamar a Worker); tema da plataforma propagado aos
 * módulos; credencial com QR v2; métricas de aprendizagem no perfil;
 * terminal fiscal do admin (eventos, check-in manual e pela lista, CSV,
 * crachás em lote) em 360 px; e o fiscal barrado para quem não é admin.
 */
const fs = require('fs');
const { startApp, check } = require('./harness');

// Mesma lista do smoke: bibliotecas de CDN abortadas de propósito no teste.
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;

const QR_V2 = 'LAIFT:v2:11111111-1111-4111-8111-111111111111.AbCdEfGhIjKlMnOpQrStUv_-';
const STATS = {
  accuracyPct: 87,
  questionsAnswered: 30,
  quizzesCompleted: 3,
  clinicalCasesCompleted: 2,
  clinicalAvgScore: 83,
  labFormulations: 1,
  pkSimulations: 0,
  totalActivities: 6,
  byModule: {
    farmacologia: { attempts: 1, accuracyPct: 50 },
    toxicologia: { attempts: 2, accuracyPct: 90 },
    clinica: { attempts: 2, accuracyPct: 83 },
    laboratorio: { attempts: 1, accuracyPct: null },
    anatomia: { attempts: 0, accuracyPct: null },
  },
  badges: [
    { id: 'primeiro_simulado', label: 'Primeiro simulado', description: 'Concluir o primeiro simulado.', unlocked: true },
    { id: 'farmacologista', label: 'Farmacologista', description: '80% em Farmacologia.', unlocked: false },
    { id: 'toxicologista', label: 'Toxicologista', description: '80% em Toxicologia.', unlocked: true },
    { id: 'clinico', label: 'Clínico de plantão', description: 'Nota ≥ 90 num caso.', unlocked: false },
    { id: 'bancada', label: 'Mãos na bancada', description: 'Primeira formulação.', unlocked: true },
    { id: 'centena', label: 'Centena', description: '100 questões.', unlocked: false },
    { id: 'constancia', label: '<img src=x onerror=alert(1)>', description: 'Rótulo hostil deve virar texto.', unlocked: false },
  ],
};

/**
 * Clique real dentro do iframe de um módulo. Em 360 px a barra de navegação
 * fixa da plataforma cobre a parte de baixo do iframe; o Playwright não
 * detecta essa sobreposição entre frames e o clique cairia na barra. Centraliza
 * o alvo na tela (scrollIntoView rola também a página da plataforma), como a
 * pessoa faria rolando, e só então clica.
 */
async function tap(frame, selector) {
  await frame.locator(selector).evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await frame.click(selector);
}

function realErrors(app) {
  return app.errors.filter((e) => !IGNORABLE.test(e));
}

async function memberScenario() {
  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiLearnGetMyStats: () => ({ success: true, stats: STATS }),
      apiLearnGetMyAttendanceQr: () => ({ success: true, qrPayload: QR_V2 }),
      apiLearnSubmitQuizAttempt: () => ({ success: true, attemptId: 'att-e2e-1' }),
    },
  });
  try {
    await app.login();
    await app.showPanel('panel-learn');
    await app.page.waitForSelector('#learn-progress:not(.hidden)', { timeout: 5000 }).catch(() => {});

    // ---- Estatísticas e conquistas ----
    const stats = await app.page.evaluate(() => ({
      accuracy: document.getElementById('learn-stat-accuracy').textContent,
      answered: document.getElementById('learn-stat-answered').textContent,
      sims: document.getElementById('learn-stat-sims').textContent,
      cases: document.getElementById('learn-stat-cases').textContent,
      lab: document.getElementById('learn-stat-lab').textContent,
      modules: document.querySelectorAll('#learn-by-module .learn-module-row').length,
      toxPct: (document.querySelector('[data-module-stat="toxicologia"] .learn-module-pct') || {}).textContent,
      labPct: (document.querySelector('[data-module-stat="laboratorio"] .learn-module-pct') || {}).textContent,
      badges: document.querySelectorAll('#learn-badges .learn-badge').length,
      unlocked: document.querySelectorAll('#learn-badges .learn-badge.unlocked').length,
      hostileAsText: !!Array.from(document.querySelectorAll('#learn-badges strong')).find((s) => s.textContent === '<img src=x onerror=alert(1)>'),
      injectedImg: document.querySelectorAll('#learn-badges img').length,
    }));
    check(stats.accuracy === '87%' && stats.answered === '30' && stats.sims === '3' && stats.cases === '2' && stats.lab === '1',
      'hub mostra as estatísticas de apiLearnGetMyStats (' + [stats.accuracy, stats.answered, stats.sims, stats.cases, stats.lab].join(', ') + ')');
    check(stats.modules === 5 && stats.toxPct === '90%' && stats.labPct === '—', 'desempenho por módulo renderizado (5 módulos; sem nota → "—")');
    check(stats.badges === 7 && stats.unlocked === 3, 'conquistas renderizadas com o estado vindo do servidor (3 de 7)');
    check(stats.hostileAsText && stats.injectedImg === 0, 'rótulo de conquista é renderizado como texto (sem HTML injetado)');
    const statsCall = app.calls.worker.find((c) => c.action === 'apiLearnGetMyStats');
    check(!!statsCall && statsCall.args[0] === app.ctx.sessionToken, 'apiLearnGetMyStats vai à Worker com o token da sessão');
    check(app.calls.appsScript.every((c) => c.acao !== 'obterDashboardAluno'), 'o hub não consulta mais o Apps Script');

    // ---- Credencial com QR v2 ----
    await app.page.click('#btn-learn-credential');
    await app.page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 5000 }).catch(() => {});
    const kind = await app.page.getAttribute('#learn-credential-qr', 'data-qr-kind');
    const qrCall = app.calls.worker.find((c) => c.action === 'apiLearnGetMyAttendanceQr');
    check(kind === 'v2', 'credencial usa o QR assinado v2 (data-qr-kind=' + kind + ')');
    check(!!qrCall && qrCall.args[0] === app.ctx.sessionToken, 'apiLearnGetMyAttendanceQr vai com o token da sessão');
    await app.page.click('#learn-credential-close');

    // ---- Ponte LaiftApi.call a partir de um módulo ----
    const frame = await app.openModule('farmaco');
    const before = app.calls.worker.length;
    const input = { module: 'farmacologia', mode: 'prova', correct: 7, total: 10, durationSeconds: 90, topics: ['Receptores'] };
    const reply = await frame.evaluate((inp) => window.LaiftApi.call('apiLearnSubmitQuizAttempt', inp).then((res) => ({
      res, sameRealmArray: Array.isArray(res.list || []) && (res.list || []) instanceof Array,
    })), input);
    const sent = app.calls.worker.slice(before).find((c) => c.action === 'apiLearnSubmitQuizAttempt');
    check(reply.res.success === true && reply.res.attemptId === 'att-e2e-1', 'LaiftApi.call devolve a resposta da Worker ao módulo');
    check(!!sent && sent.args[0] === app.ctx.sessionToken && JSON.stringify(sent.args[1]) === JSON.stringify(input),
      'a chamada chega à Worker com o token como 1º argumento e o input intacto');
    check(!JSON.stringify(reply).includes(app.ctx.sessionToken), 'o token não é devolvido ao módulo');

    const realm = await frame.evaluate(() => window.LaiftApi.call('apiLearnGetMyStats').then((res) => res.stats.badges instanceof Array));
    check(realm === true, 'a resposta é copiada para o realm do módulo (instanceof Array funciona)');

    const beforeBlocked = app.calls.worker.length;
    const blocked = await frame.evaluate(() => Promise.all([
      window.LaiftApi.call('apiAdminBanUser', { targetProfileId: 'x' }),
      window.LaiftApi.call('apiSendMessage', {}),
      window.LaiftApi.call('apiLearn', {}),
      window.LaiftApi.call({ toString: () => 'apiLearnGetMyStats' }, {}),
    ]));
    await app.page.waitForTimeout(200);
    check(blocked.every((r) => r && r.success === false && typeof r.message === 'string'), 'allowlist recusa ações fora dela com {success:false, message}');
    check(app.calls.worker.length === beforeBlocked && !app.calls.worker.some((c) => c.action === 'apiAdminBanUser'),
      'ações recusadas pela allowlist nem chegam à Worker');
    await app.page.click('#learn-back');

    // ---- Métricas de aprendizagem no perfil ----
    await app.showPanel('panel-profile');
    await app.page.waitForSelector('#profile-learning-metrics .stat-card', { timeout: 5000 }).catch(() => {});
    const profileCards = await app.page.locator('#profile-learning-metrics .stat-card').allTextContents();
    check(profileCards.length === 4 && profileCards.some((t) => t.includes('30')) && profileCards.some((t) => t.includes('3 de 7')),
      'perfil mostra as métricas de aprendizagem (' + profileCards.length + ' cartões)');

    // ---- Não-admin: terminal fiscal barrado ----
    check(!(await app.page.locator('#btn-enter-admin-mode').isVisible()), 'membro não vê a entrada do modo admin');
    const fiscalEl = await app.page.evaluate(() => {
      const f = document.createElement('iframe');
      f.id = 'e2e-fiscal';
      f.src = 'modulos/fiscal/index.html';
      document.body.appendChild(f);
      return true;
    });
    const fiscalHandle = fiscalEl && await app.page.waitForSelector('#e2e-fiscal');
    const fiscal = await fiscalHandle.contentFrame();
    await fiscal.waitForLoadState('load').catch(() => {});
    await app.page.waitForTimeout(300);
    const denied = await fiscal.evaluate(() => ({
      denied: !document.getElementById('fiscalDenied').classList.contains('hidden'),
      area: !document.getElementById('fiscalArea').classList.contains('hidden'),
    }));
    check(denied.denied && !denied.area, 'fiscal aberto por um membro mostra "acesso restrito" e esconde o terminal');
    check(!app.calls.worker.some((c) => /^apiAdminAttendance/.test(c.action)), 'nenhuma chamada apiAdminAttendance* parte de um não-admin');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (membro)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function themeScenario() {
  const app = await startApp({ role: 'member', theme: 'dark' });
  try {
    await app.login();
    await app.showPanel('panel-learn');
    const frame = await app.openModule('toxico');
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 5000 }).catch(() => {});
    const initial = await frame.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), api: window.LaiftIdentity.getTheme() }));
    check(initial.attr === 'dark' && initial.api === 'dark', 'módulo abre com o tema escuro da plataforma');

    await frame.evaluate(() => {
      window.__themeEvents = [];
      window.addEventListener('laift:themechange', (e) => window.__themeEvents.push(e.detail.theme));
    });
    await app.page.click('#learn-back');
    await app.showPanel('panel-profile');
    await app.page.selectOption('#pref-theme', 'light');
    await app.page.click('#form-preferences button[type=submit]');
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 5000 }).catch(() => {});
    const afterLight = await frame.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), events: window.__themeEvents }));
    check(afterLight.attr === 'light' && afterLight.events.join() === 'light', 'trocar o tema na plataforma atualiza o módulo já aberto (+ evento laift:themechange)');

    await app.page.emulateMedia({ colorScheme: 'dark' });
    await app.page.selectOption('#pref-theme', 'system');
    await app.page.click('#form-preferences button[type=submit]');
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 5000 }).catch(() => {});
    check((await frame.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', '"sistema" é resolvido pelo matchMedia da plataforma (escuro)');

    await app.page.emulateMedia({ colorScheme: 'light' });
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 5000 }).catch(() => {});
    check((await frame.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light', 'com "sistema", a troca de tema do sistema chega ao módulo aberto');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (tema)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function adminFiscalScenario() {
  const E1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  const E2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  const PARTICIPANTS = [
    { profileId: '11111111-1111-4111-8111-111111111111', fullName: 'Ana Souza', email: 'ana@x.com', role: 'member', registered: true, checkedInAt: null },
    { profileId: '22222222-2222-4222-8222-222222222222', fullName: '=Beto <b>Visitante</b>', email: 'beto@x.com', role: 'visitor', registered: false, checkedInAt: null },
  ];
  const CSV = String.fromCharCode(0xfeff) + '"Nome";"E-mail"\r\n"\'=Beto";"beto@x.com"\r\n';

  const app = await startApp({
    role: 'admin',
    viewport: { width: 360, height: 740 },
    workerHandlers: {
      apiAdminAttendanceListEvents: () => ({
        success: true,
        events: [
          { id: E1, title: 'Simpósio de Toxicologia', eventDate: '2026-09-26T13:00:00Z', status: 'in_progress', capacity: 50, registeredCount: 10, checkedInCount: 3, checkInOpen: true },
          { id: E2, title: 'Jornada antiga', eventDate: '2026-08-01T13:00:00Z', status: 'completed', capacity: null, registeredCount: 4, checkedInCount: 4, checkInOpen: false },
        ],
      }),
      apiAdminAttendanceCheckIn: (args) => {
        const input = args[1] || {};
        if (input.method === 'manual') {
          return { success: true, message: 'Presença registrada: Carla (inscrição criada na portaria).', participant: { profileId: '33333333-3333-4333-8333-333333333333', fullName: 'Carla', alreadyCheckedIn: false, walkIn: true, checkedInAt: '2026-09-26T13:10:00Z' } };
        }
        return { success: true, message: 'Presença registrada: Ana Souza.', participant: { profileId: input.profileId, fullName: 'Ana Souza', alreadyCheckedIn: false, walkIn: false, checkedInAt: '2026-09-26T13:11:00Z' } };
      },
      apiAdminAttendanceSearch: () => ({ success: true, participants: PARTICIPANTS }),
      apiAdminAttendanceExportCsv: () => ({ success: true, filename: 'presenca-simposio-2026-09-26.csv', csv: CSV, rows: 1 }),
      apiAdminAttendanceBadges: (args) => ({
        success: true,
        badges: (args[1].profileIds || []).map((id, i) => ({ profileId: id, fullName: PARTICIPANTS[i] ? PARTICIPANTS[i].fullName : 'X', role: 'member', leaguePosition: i ? null : 'diretor', qrPayload: 'LAIFT:v2:' + id + '.AbCdEfGhIjKlMnOpQrStUv_-' })),
      }),
    },
  });
  try {
    await app.login();
    await app.page.click('#btn-enter-admin-mode');
    await app.showPanel('panel-admin-fiscal');
    const handle = await app.page.waitForSelector('#admin-fiscal-frame-wrap iframe');
    const frame = await handle.contentFrame();
    await frame.waitForLoadState('load').catch(() => {});
    await frame.waitForSelector('#fiscalArea:not(.hidden)', { timeout: 5000 }).catch(() => {});
    await frame.waitForFunction(() => document.querySelectorAll('#fiscalEvent option').length === 2, null, { timeout: 5000 }).catch(() => {});

    // ---- Seletor de eventos ----
    const ev = await frame.evaluate(() => ({
      options: document.querySelectorAll('#fiscalEvent option').length,
      selected: document.getElementById('fiscalEvent').value,
      info: document.getElementById('fiscalEventInfo').textContent,
      noPasswordModal: !document.getElementById('modalFiscalLogin') && !document.getElementById('inputSenhaFiscalModal'),
      noGroqCard: !document.getElementById('aiNodesGrid'),
    }));
    check(ev.options === 2 && ev.selected === E1, 'fiscal lista os eventos e seleciona o que está em andamento');
    check(/3 presente\(s\) de 10 inscrito\(s\)/.test(ev.info), 'contagem de presentes/inscritos do evento (' + ev.info + ')');
    check(ev.noPasswordModal && ev.noGroqCard, 'sem senha fiscal e sem o cartão de saúde do Groq');

    // ---- Check-in manual por e-mail ----
    await frame.fill('#manualEmail', 'carla@x.com');
    await tap(frame, '#manualSubmit');
    await frame.waitForFunction(() => /Presença registrada/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    const manualCall = app.calls.worker.find((c) => c.action === 'apiAdminAttendanceCheckIn');
    check(!!manualCall && manualCall.args[0] === app.ctx.sessionToken &&
      JSON.stringify(manualCall.args[1]) === JSON.stringify({ eventId: E1, method: 'manual', email: 'carla@x.com' }),
      'check-in manual vai à Worker com token + {eventId, method:"manual", email}');
    const afterManual = await frame.evaluate(() => ({
      info: document.getElementById('fiscalEventInfo').textContent, email: document.getElementById('manualEmail').value,
    }));
    check(/4 presente\(s\) de 11 inscrito\(s\)/.test(afterManual.info) && afterManual.email === '', 'contadores atualizados após entrada na porta e campo limpo');

    // ---- Lista de inscritos e check-in pela lista ----
    await tap(frame, '#listRegistered');
    await frame.waitForFunction(() => document.querySelectorAll('#memberList .fiscal-item').length === 2, null, { timeout: 5000 }).catch(() => {});
    const listInfo = await frame.evaluate(() => ({
      items: document.querySelectorAll('#memberList .fiscal-item').length,
      hostileText: !!Array.from(document.querySelectorAll('.fiscal-item-name')).find((n) => n.textContent === '=Beto <b>Visitante</b>'),
      injectedBold: document.querySelectorAll('#memberList b').length,
    }));
    check(listInfo.items === 2, 'lista nominal do evento renderizada');
    check(listInfo.hostileText && listInfo.injectedBold === 0, 'nome hostil aparece como texto (sem HTML injetado)');
    await tap(frame, '[data-profile-id="11111111-1111-4111-8111-111111111111"] [data-action="presence"]');
    await frame.waitForFunction(() => document.querySelector('[data-profile-id="11111111-1111-4111-8111-111111111111"]').classList.contains('is-present'), null, { timeout: 5000 }).catch(() => {});
    const listCall = app.calls.worker.filter((c) => c.action === 'apiAdminAttendanceCheckIn')[1];
    check(!!listCall && listCall.args[1].method === 'lista' && listCall.args[1].profileId === '11111111-1111-4111-8111-111111111111',
      'check-in pela lista envia method "lista" com o profileId da busca');
    check(await frame.evaluate(() => document.querySelector('[data-profile-id="11111111-1111-4111-8111-111111111111"] [data-action="presence"]').disabled),
      'participante marcado como presente na lista');

    // ---- Exportação CSV ----
    const [download] = await Promise.all([
      app.page.waitForEvent('download', { timeout: 5000 }),
      tap(frame, '#exportCsv'),
    ]);
    const csvPath = await download.path();
    const csvText = csvPath ? fs.readFileSync(csvPath, 'utf8') : '';
    const exportCall = app.calls.worker.find((c) => c.action === 'apiAdminAttendanceExportCsv');
    check(download.suggestedFilename() === 'presenca-simposio-2026-09-26.csv', 'CSV baixado com o nome sugerido pela Worker');
    check(csvText.charCodeAt(0) === 0xfeff && csvText.includes('"\'=Beto"'), 'conteúdo do CSV preservado (BOM + célula neutralizada)');
    check(!!exportCall && exportCall.args[1].eventId === E1 && exportCall.args[1].excel === true, 'exportação pede o formato Excel do evento selecionado');

    // ---- Crachás em lote com QR v2 ----
    await frame.locator('#selectAll').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await frame.check('#selectAll');
    await frame.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await tap(frame, '#printBadges');
    await frame.waitForFunction(() => document.querySelectorAll('#printArea .badge-card').length === 2, null, { timeout: 5000 }).catch(() => {});
    const print = await frame.evaluate(() => ({
      cards: document.querySelectorAll('#printArea .badge-card').length,
      qrs: Array.from(document.querySelectorAll('#printArea .badge-qr')).filter((i) => i.src.startsWith('data:image/')).length,
      board: document.querySelectorAll('#printArea .badge-role.is-board').length,
      printed: window.__printed,
      hostile: !!Array.from(document.querySelectorAll('#printArea .badge-name')).find((n) => n.textContent === '=Beto <b>Visitante</b>'),
      injectedBold: document.querySelectorAll('#printArea b').length,
    }));
    const badgesCall = app.calls.worker.find((c) => c.action === 'apiAdminAttendanceBadges');
    check(!!badgesCall && badgesCall.args[1].profileIds.length === 2, 'crachás em lote pedem os perfis selecionados');
    check(print.cards === 2 && print.qrs === 2 && print.printed === 1, 'folha de crachás montada no próprio documento, com QR local, e impressão disparada');
    check(print.hostile && print.injectedBold === 0 && print.board === 1, 'crachás montados com DOM seguro (nome como texto; diretoria destacada)');

    // ---- Leitor sem a biblioteca (CDN bloqueada no teste) falha com mensagem, sem quebrar ----
    await tap(frame, '#scannerStart');
    const scanMsg = await frame.evaluate(() => document.getElementById('status').textContent);
    check(/Leitor de QR indisponível/.test(scanMsg), 'leitor indisponível vira mensagem clara ao admin');

    // ---- 360 px sem rolagem horizontal ----
    const overflow = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const pageOverflow = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0 && pageOverflow <= 0, 'terminal fiscal cabe em 360 px sem rolagem horizontal (' + overflow + '/' + pageOverflow + ')');

    check(app.calls.appsScript.length === 0, 'o terminal fiscal não fala mais com o Apps Script');
    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (fiscal)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function fase2() {
  await memberScenario();
  await themeScenario();
  await adminFiscalScenario();
};
