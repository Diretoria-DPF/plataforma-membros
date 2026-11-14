/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * cursos.e2e.js — tela Cursos (frontend/modulos/cursos) e página pública /certificado/, em 375 e 320 px:
 *  - flag courses_enabled desligada: o item "Cursos" não aparece no menu;
 *  - ligada: lista → curso → aulas → prova (uma questão por tela) → resultado → certificado com carga e QR;
 *  - a tela nunca recebe gabarito (a Worker falsa só devolve enunciado e alternativas);
 *  - sem rolagem horizontal, alvos de toque de 44 px e axe sem violação séria em cada tela;
 *  - página pública: conferência por código, resultado só com nome, curso, carga e datas.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const VIEWPORTS = [{ width: 375, height: 812 }, { width: 320, height: 640 }];
const COURSE = { id: '11111111-1111-4111-8111-111111111111', slug: 'diretrizes', title: 'Diretrizes do laboratório + POP 01', summary: 'Trabalhar com segurança na bancada.', kind: 'diretriz', workloadMinutes: 30, version: 1, passPct: 80, maxAttempts: 3, validityMonths: 12 };
const CERT = { code: 'LAIFT-ABCDE-FGHJK', holderName: 'Ana Teste', courseId: COURSE.id, courseTitle: COURSE.title, courseVersion: 1, workloadMinutes: 30, scorePct: 100, issuedAt: '2026-11-14T15:00:00Z', validUntil: '2027-11-14T15:00:00Z', publicConsent: false, status: 'valido' };

function fakeServer(flag) {
  const state = { done: [], passed: false, cert: null };
  const lessons = () => [1, 2].map((p) => ({ position: p, title: 'Aula ' + p, minMinutes: 6, done: state.done.includes(p) }));
  const exam = () => (state.passed ? { state: 'aprovado', scorePct: 100 } : state.done.length === 2 ? { state: 'disponivel' } : { state: 'aulas_pendentes' });
  return {
    apiGetFeatureFlags: () => ({ success: true, flags: { courses_enabled: flag, certificates_enabled: flag } }),
    apiLearnCourseList: () => ({ success: true, enabled: true, courses: [Object.assign({ lessonCount: 2, lessonsDone: state.done.length, passed: state.passed }, COURSE)] }),
    apiLearnCertificateListMine: () => ({ success: true, enabled: true, certificates: state.cert ? [state.cert] : [] }),
    apiLearnCourseGet: () => ({ success: true, course: COURSE, lessons: lessons(), exam: exam() }),
    apiLearnCourseLesson: (args) => {
      const p = args[1].position;
      return { success: true, lesson: { position: p, title: 'Aula ' + p, total: 2, minMinutes: 6, sources: ['NR-32'], body: '## 1. Regras\nUse **jaleco fechado** e óculos.\n\n- Calçado fechado\n- Cabelo preso\n\n| Item | Uso |\n|---|---|\n| Jaleco | Protege a pele |' } };
    },
    apiLearnCourseMarkLesson: (args) => { const p = args[1].position; if (!state.done.includes(p)) state.done.push(p); return { success: true, lessonsDone: state.done }; },
    apiLearnCourseExamStart: () => ({ success: true, resumed: false, attemptId: '22222222-2222-4222-8222-222222222222', expiresAt: '2026-11-14T16:00:00Z',
      questions: [{ n: 1, stem: 'Qual é o EPI básico de bancada?', options: ['Sandália', 'Jaleco fechado e óculos'] }, { n: 2, stem: 'O que fazer com a luva suja?', options: ['Descartar', 'Guardar no bolso'] }] }),
    apiLearnCourseExamSubmit: () => { state.passed = true; return { success: true, passed: true, scorePct: 100, passPct: 80, correctCount: 2, total: 2, criticalMissed: 0, exam: { state: 'aprovado' }, review: [] }; },
    apiLearnCertificateIssue: () => { state.cert = CERT; return { success: true, created: true, certificate: CERT }; },
    apiCertificateVerify: (args) => ((args[0] || {}).code === CERT.code
      ? { success: true, found: true, status: 'valido', holderName: 'Ana Teste', courseTitle: COURSE.title, courseVersion: 1, workloadMinutes: 30, issuedAt: CERT.issuedAt, validUntil: CERT.validUntil }
      : { success: true, found: false }),
  };
}

async function layoutOk(frame, where) {
  const m = await frame.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll('button, .cr-option, input[type=checkbox]')]
      .filter((b) => b.offsetParent !== null && b.closest('label') === null)
      .filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim() || b.className);
    return { overflow: doc.scrollWidth - doc.clientWidth, small };
  });
  check(m.overflow <= 1, where + ': sem rolagem horizontal (' + m.overflow + ' px)');
  check(m.small.length === 0, where + ': alvos de toque ≥ 44 px' + (m.small.length ? ' (' + m.small.join(' | ') + ')' : ''));
  await axeGate(frame, where);
}

async function openCourses(app) {
  await app.page.click('#app-menu-btn');
  await app.page.click('#app-menu [data-panel="panel-courses"]');
  await app.page.waitForSelector('#panel-courses:not(.hidden)');
  const el = await app.page.waitForSelector('#courses-frame-wrap iframe');
  const frame = await el.contentFrame();
  await frame.waitForSelector('.cr-card__btn', { timeout: 15000 });
  return frame;
}

async function flowScenario(viewport) {
  const label = viewport.width + 'px';
  console.log('\n— fluxo completo em ' + label);
  const app = await startApp({ role: 'member', viewport, workerHandlers: fakeServer(true) });
  try {
    await app.login();
    const frame = await openCourses(app);
    await layoutOk(frame, label + '/lista');
    await frame.click('.cr-card__btn');
    await frame.waitForSelector('text=Leia todas as aulas');
    await layoutOk(frame, label + '/curso');
    await frame.click('text=1. Aula 1');
    await frame.waitForSelector('.cr-lesson table');
    check(await frame.locator('.cr-lesson strong').count() === 1, label + ': aula mostra negrito, lista e tabela');
    await layoutOk(frame, label + '/aula');
    await frame.click('text=Marcar como lida e seguir');
    await frame.waitForSelector('#cr-title:has-text("2. Aula 2")');
    await frame.click('text=Marcar como lida');
    await frame.click('text=Começar a prova');
    await frame.waitForSelector('.cr-option');
    check((await frame.textContent('#cr-title')).trim() === 'Questão 1 de 2', label + ': uma questão por tela');
    await layoutOk(frame, label + '/prova');
    await frame.click('.cr-option >> nth=1');
    await frame.click('text=Próxima');
    await frame.click('.cr-option >> nth=0');
    await frame.click('text=Enviar respostas');
    await frame.waitForSelector('.cr-score');
    check((await frame.textContent('.cr-score')).includes('100%'), label + ': resultado com a nota da Worker');
    await layoutOk(frame, label + '/resultado');
    await frame.click('text=Meu certificado');
    await frame.click('text=Gerar certificado');
    await frame.waitForSelector('.cr-cert');
    const text = await frame.textContent('.cr-cert');
    check(/Carga horária: 30 minutos/.test(text) && text.includes(CERT.code), label + ': certificado com carga horária e código');
    check(await frame.locator('.cr-cert img.cr-qr').count() === 1, label + ': certificado com QR de conferência');
    check(!/revis|rascunho|\bIA\b|VERIFICAR/i.test(await frame.textContent('body')), label + ': sem texto interno de conferência');
    await layoutOk(frame, label + '/certificado');
    const submit = app.calls.worker.find((c) => c.action === 'apiLearnCourseExamSubmit');
    check(submit && JSON.stringify(submit.args[1].answers) === '[1,0]', label + ': envia só as posições escolhidas');
    check(app.errors.length === 0, label + ': sem erro de script' + (app.errors.length ? ' (' + app.errors.join(' | ') + ')' : ''));
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: VIEWPORTS[0], workerHandlers: fakeServer(false) });
  try {
    await app.login();
    await app.page.click('#app-menu-btn');
    check(!(await app.page.isVisible('#app-menu [data-panel="panel-courses"]')), 'item Cursos escondido sem a flag');
  } finally {
    await app.close();
  }
}

async function publicScenario(viewport) {
  const label = 'pública ' + viewport.width + 'px';
  console.log('\n— ' + label);
  const app = await startApp({ role: 'member', viewport, workerHandlers: fakeServer(true) });
  try {
    await app.page.goto(app.baseUrl + 'certificado/index.html?c=' + CERT.code);
    await app.page.waitForSelector('.cv-status');
    const text = await app.page.textContent('#cv-result');
    check(/Certificado válido/.test(text) && /Ana Teste/.test(text) && /30 minutos/.test(text), label + ': conferência por código mostra nome, curso e carga');
    check(!/@|nota|score/i.test(text), label + ': sem e-mail e sem nota');
    await app.page.fill('#cv-code', 'LAIFT-ZZZZZ-ZZZZZ');
    await app.page.click('#cv-submit');
    await app.page.waitForSelector('text=Certificado não encontrado');
    const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, label + ': sem rolagem horizontal');
    await axeGate(app.page, label);
  } finally {
    await app.close();
  }
}

module.exports = async function run() {
  await flagOffScenario();
  for (const vp of VIEWPORTS) await flowScenario(vp);
  for (const vp of VIEWPORTS) await publicScenario(vp);
};
