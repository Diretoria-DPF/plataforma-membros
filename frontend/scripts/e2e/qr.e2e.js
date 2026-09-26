/**
 * qr.e2e.js — Geração e leitura de QR Code (crachás e terminal fiscal).
 *
 * fase2.e2e.js e fase4.e2e.js já cobrem o fluxo do terminal fiscal e do
 * crachá (eventos, check-in, CSV, DOM seguro, layout); aqui o foco é o QR em
 * si, ponta a ponta, com um decodificador de verdade (jsQR — devDependency
 * só de teste, frontend/package.json), não só "começa com data:image/":
 *
 *  1. Crachás em lote (fiscal-engine.js: qrDataUrl/printSelectedBadges) —
 *     cada <img class="badge-qr"> decodifica de volta ao payload exato.
 *  2. Crachá individual aberto pelo botão "Crachá" da lista (openBadge, que
 *     passa por ../cracha/index.html?...&qr=... numa aba própria, achando a
 *     plataforma por window.opener.top) — o QR decodifica para o parâmetro
 *     `qr` recebido.
 *  3. Nenhuma violação de CSP nem erro de página nos dois fluxos acima (o
 *     vendor/qrcode-generator.js é local: ../../vendor/ a partir de
 *     modulos/fiscal e modulos/cracha — se o caminho não resolvesse no
 *     build, os QRs acima nem apareceriam).
 *  4. Leitor de QR (câmera): como o onScan() do fiscal-engine é uma closure
 *     interna (não fica em window), o teste substitui window.Html5QrcodeScanner
 *     por um dublê cujo .render(cb) guarda o callback — mesma técnica já usada
 *     em fase2.e2e.js para dublar window.print. Isso exercita o código de
 *     produção de verdade (parseQr, cooldown, check-in) sem precisar de vídeo
 *     de câmera sintético. Cobre: LAIFT:v2:... chega à Worker como check-in
 *     por QR; o mesmo QR de novo dentro do cooldown não duplica a chamada;
 *     LAIFT:ID:<e-mail> (formato antigo) preenche a presença manual sem
 *     chamar a Worker; LAIFT:ID:<não-e-mail> e texto não reconhecido viram
 *     avisos claros.
 *  5. Câmera de verdade: com a biblioteca real (html5-qrcode, via o espelho
 *     do jsDelivr) e o Chromium com câmera falsa (--use-fake-device-for-
 *     media-stream), confere que abrir o leitor não gera violação de CSP
 *     nem erro de página (worker-src 'none' preocupa: a biblioteca poderia
 *     usar Worker/eval para decodificar quadro a quadro).
 */
const fs = require('fs');
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

const JSQR_SOURCE = fs.readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8');

const IGNORABLE = /\b(Html5QrcodeScanner)\b/; // biblioteca de terceiro, já cotejada no csp.e2e.js

function realErrors(app) {
  return app.errors.filter((e) => !IGNORABLE.test(e));
}

/**
 * Decodificador de QR isolado: uma página about:blank (sem a CSP das
 * páginas do produto) no MESMO contexto do navegador, com o jsQR injetado
 * como <script> inline (permitido ali por não ter CSP nenhuma). Decodifica
 * a partir da própria data URL — não depende de rede nem do servidor
 * estático do harness.
 */
async function makeQrDecoder(context) {
  const page = await context.newPage();
  await page.addScriptTag({ content: JSQR_SOURCE });
  return async function decode(dataUrl) {
    return page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('QR: a imagem (data URL) não carregou'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx2d = canvas.getContext('2d');
      ctx2d.drawImage(img, 0, 0);
      const imageData = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
      const result = window.jsQR(imageData.data, imageData.width, imageData.height);
      return result ? result.data : null;
    }, dataUrl);
  };
}

/** Mesma instrumentação de csp.e2e.js: captura securitypolicyviolation em todo frame/página do contexto. */
async function watchCsp(app) {
  const violations = [];
  await app.context.exposeBinding('__e2eQrCspReport', (source, v) => {
    violations.push(Object.assign({ frame: source.frame.url() }, v));
  });
  await app.context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try {
        window.__e2eQrCspReport({ directive: e.effectiveDirective, blocked: e.blockedURI });
      } catch (err) { /* binding indisponível neste documento (ex.: about:blank do decodificador) */ }
    });
  });
  return violations;
}

function report(violations, label) {
  const list = violations.map((v) => `${v.frame} → ${v.directive} ${v.blocked}`);
  check(violations.length === 0, `${label}: nenhuma violação de CSP` + (list.length ? ': ' + [...new Set(list)].join(' | ') : ''));
}

async function tap(frame, selector) {
  await frame.locator(selector).evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await frame.click(selector);
}

const E1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const PARTICIPANTS = [
  { profileId: '11111111-1111-4111-8111-111111111111', fullName: 'Ana Souza', email: 'ana@x.com', role: 'member', registered: true, checkedInAt: null },
  { profileId: '22222222-2222-4222-8222-222222222222', fullName: 'Beto Diretor', email: 'beto@x.com', role: 'member', registered: true, checkedInAt: null },
];

function fiscalWorkerHandlers(extra) {
  return Object.assign({
    apiAdminAttendanceListEvents: () => ({
      success: true,
      events: [{ id: E1, title: 'Simpósio de Toxicologia', eventDate: '2026-09-26T13:00:00Z', status: 'in_progress', capacity: 50, registeredCount: 10, checkedInCount: 3, checkInOpen: true }],
    }),
    apiAdminAttendanceSearch: () => ({ success: true, participants: PARTICIPANTS }),
    apiAdminAttendanceBadges: (args) => ({
      success: true,
      badges: (args[1].profileIds || []).map((id) => ({
        profileId: id,
        fullName: (PARTICIPANTS.find((p) => p.profileId === id) || {}).fullName || 'X',
        role: 'member',
        // "Diretor" é sempre o segundo participante (PARTICIPANTS[1]), não a
        // posição dentro do array pedido — o crachá individual pede só 1 id.
        leaguePosition: id === PARTICIPANTS[1].profileId ? 'diretor' : null,
        qrPayload: 'LAIFT:v2:' + id + '.AbCdEfGhIjKlMnOpQrStUv_-',
      })),
    }),
  }, extra || {});
}

/** Login admin + abre o terminal fiscal embutido no painel admin (como fase2.e2e.js). */
async function openFiscalFrame(app) {
  await app.login();
  await app.page.click('#btn-enter-admin-mode');
  await app.showPanel('panel-admin-fiscal');
  const handle = await app.page.waitForSelector('#admin-fiscal-frame-wrap iframe');
  const frame = await handle.contentFrame();
  await frame.waitForLoadState('load').catch(() => {});
  await frame.waitForSelector('#fiscalArea:not(.hidden)', { timeout: 5000 }).catch(() => {});
  await frame.waitForFunction(() => document.querySelectorAll('#fiscalEvent option').length >= 1, null, { timeout: 5000 }).catch(() => {});
  return frame;
}

// ---------------------------------------------------------------------------
// 1. Crachás em lote — cada QR decodifica para o payload exato da Worker
// ---------------------------------------------------------------------------
async function batchBadgesScenario() {
  const app = await startApp({ role: 'admin', workerHandlers: fiscalWorkerHandlers() });
  const violations = await watchCsp(app);
  const decode = await makeQrDecoder(app.context);
  const vendorRequests = [];
  app.page.on('response', (res) => { if (/\/vendor\/qrcode-generator\.js$/.test(res.url())) vendorRequests.push(res.status()); });
  try {
    const frame = await openFiscalFrame(app);
    await tap(frame, '#listRegistered');
    await frame.waitForFunction(() => document.querySelectorAll('#memberList .fiscal-item').length === 2, null, { timeout: 5000 }).catch(() => {});
    await frame.check('#selectAll');
    await frame.evaluate(() => { window.print = () => {}; }); // não abre o diálogo real de impressão
    await tap(frame, '#printBadges');
    await frame.waitForFunction(() => document.querySelectorAll('#printArea .badge-card').length === 2, null, { timeout: 5000 }).catch(() => {});

    const badgesCall = app.calls.worker.find((c) => c.action === 'apiAdminAttendanceBadges');
    check(!!badgesCall, 'apiAdminAttendanceBadges foi chamada para montar os crachás em lote');
    const expected = new Map(PARTICIPANTS.map((p) => ['LAIFT:v2:' + p.profileId + '.AbCdEfGhIjKlMnOpQrStUv_-', p]));

    const cards = await frame.evaluate(() => Array.from(document.querySelectorAll('#printArea .badge-card')).map((card) => ({
      profileId: card.getAttribute('data-profile-id'),
      src: card.querySelector('img.badge-qr').getAttribute('src'),
    })));
    check(cards.length === 2 && cards.every((c) => /^data:image\//.test(c.src)), 'cada crachá tem <img class="badge-qr"> com uma data URL');

    const decoded = await Promise.all(cards.map((c) => decode(c.src)));
    check(decoded.every((text, i) => text === 'LAIFT:v2:' + cards[i].profileId + '.AbCdEfGhIjKlMnOpQrStUv_-'),
      'o QR de cada crachá em lote decodifica de volta ao qrPayload exato da Worker (' + decoded.join(' | ') + ')');
    check(vendorRequests.length > 0 && vendorRequests.every((s) => s === 200), 'vendor/qrcode-generator.js resolve em ../../vendor/ a partir do fiscal (status ' + vendorRequests.join(',') + ')');

    report(violations, 'crachás em lote');
    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (crachás em lote)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------------------
// 2. Crachá individual — botão "Crachá" da lista (openBadge) numa aba própria
// ---------------------------------------------------------------------------
async function singleBadgeScenario() {
  const app = await startApp({ role: 'admin', workerHandlers: fiscalWorkerHandlers() });
  const violations = await watchCsp(app);
  const decode = await makeQrDecoder(app.context);
  try {
    const frame = await openFiscalFrame(app);
    await tap(frame, '#listRegistered');
    await frame.waitForFunction(() => document.querySelectorAll('#memberList .fiscal-item').length === 2, null, { timeout: 5000 }).catch(() => {});

    const [popup] = await Promise.all([
      app.context.waitForEvent('page'),
      tap(frame, '[data-profile-id="22222222-2222-4222-8222-222222222222"] [data-action="badge"]'),
    ]);
    await popup.waitForLoadState('load');
    await popup.waitForFunction(() => (document.querySelector('#qrCode img') || {}).src, null, { timeout: 5000 }).catch(() => {});

    const badgesCall = app.calls.worker.find((c) => c.action === 'apiAdminAttendanceBadges');
    check(!!badgesCall && badgesCall.args[1].profileIds[0] === '22222222-2222-4222-8222-222222222222', 'abrir o crachá individual pede só o perfil clicado');
    const expectedQr = 'LAIFT:v2:22222222-2222-4222-8222-222222222222.AbCdEfGhIjKlMnOpQrStUv_-';

    const info = await popup.evaluate(() => ({
      nome: document.querySelector('.bind-name').textContent,
      cargo: document.getElementById('roleInput').value,
      qrInput: document.getElementById('qrInput').value,
      src: (document.querySelector('#qrCode img') || {}).src || '',
    }));
    check(info.nome === 'Beto Diretor' && info.cargo === 'DIRETORIA' && info.qrInput === expectedQr,
      'crachá individual chega com nome/cargo/qr corretos (via window.opener, aberto de dentro do iframe fiscal)');
    check(/^data:image\//.test(info.src), 'crachá individual mostra o QR como <img> com data URL');

    const decoded = await decode(info.src);
    check(decoded === expectedQr, 'o QR do crachá individual decodifica exatamente para o parâmetro `qr` recebido');

    report(violations, 'crachá individual');
    await popup.close();
    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (crachá individual)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------------------
// 3. Leitor de QR — lógica de scan (dublê de Html5QrcodeScanner)
// ---------------------------------------------------------------------------
async function scannerLogicScenario() {
  const checkInCalls = [];
  const app = await startApp({
    role: 'admin',
    workerHandlers: fiscalWorkerHandlers({
      apiAdminAttendanceCheckIn: (args) => {
        const input = args[1] || {};
        checkInCalls.push(input);
        return { success: true, message: 'Presença registrada: Ana Souza.', participant: { profileId: '11111111-1111-4111-8111-111111111111', fullName: 'Ana Souza', alreadyCheckedIn: false, walkIn: false, checkedInAt: '2026-09-26T13:11:00Z' } };
      },
    }),
  });
  try {
    const frame = await openFiscalFrame(app);

    // Dublê de Html5QrcodeScanner: guarda o callback de sucesso passado pelo
    // fiscal-engine.js a .render(onScan, ...) — mesma técnica de fase2.e2e.js
    // (que já dubla window.print para não abrir o diálogo real).
    await frame.evaluate(() => {
      window.Html5QrcodeScanner = function FakeScanner() {
        this.render = (successCb) => { window.__qrOnScan = successCb; };
        this.clear = () => Promise.resolve();
      };
    });
    await tap(frame, '#scannerStart');
    const started = await frame.evaluate(() => ({
      readerVisible: !document.getElementById('reader').classList.contains('hidden'),
      startHidden: document.getElementById('scannerStart').classList.contains('hidden'),
      stopVisible: !document.getElementById('scannerStop').classList.contains('hidden'),
      hasCallback: typeof window.__qrOnScan === 'function',
    }));
    check(started.readerVisible && started.startHidden && started.stopVisible && started.hasCallback,
      'com a biblioteca "disponível" (dublê), o leitor abre de verdade (sem a mensagem de indisponível)');

    // ---- LAIFT:v2:... chega à Worker como check-in por QR ----
    const QR_V2 = 'LAIFT:v2:11111111-1111-4111-8111-111111111111.AbCdEfGhIjKlMnOpQrStUv_-';
    await frame.evaluate((text) => window.__qrOnScan(text), QR_V2);
    await frame.waitForFunction(() => /Presença registrada/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    check(checkInCalls.length === 1 && checkInCalls[0].method === 'qr' && checkInCalls[0].qrPayload === QR_V2 && checkInCalls[0].eventId === E1,
      'QR v2 lido pela câmera vira apiAdminAttendanceCheckIn com {method:"qr", qrPayload}');

    // ---- mesmo QR de novo dentro do cooldown: não duplica a chamada ----
    await frame.evaluate((text) => window.__qrOnScan(text), QR_V2);
    await frame.waitForTimeout(150);
    check(checkInCalls.length === 1, 'o mesmo QR lido de novo dentro do cooldown (4 s) não duplica o check-in');

    // ---- formato antigo (LAIFT:ID:<e-mail>): preenche a presença manual, sem chamar a Worker ----
    await frame.evaluate(() => window.__qrOnScan('LAIFT:ID:carla@x.com'));
    await frame.waitForFunction(() => /Credencial antiga/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    const legacyEmail = await frame.evaluate(() => ({ email: document.getElementById('manualEmail').value, status: document.getElementById('status').textContent, kind: document.getElementById('status').className }));
    check(legacyEmail.email === 'carla@x.com', 'LAIFT:ID:<e-mail> (formato antigo) preenche o campo de presença manual');
    check(/warning/.test(legacyEmail.kind) && /confira a pessoa e confirme/i.test(legacyEmail.status), 'aviso pede para o admin conferir e confirmar manualmente (não registra sozinho)');
    check(checkInCalls.length === 1, 'formato antigo com e-mail não chama apiAdminAttendanceCheckIn sozinho');

    // ---- formato antigo sem e-mail: aviso diferente, não mexe no campo ----
    await frame.evaluate(() => { document.getElementById('manualEmail').value = ''; window.__qrOnScan('LAIFT:ID:12345'); });
    await frame.waitForFunction(() => /credencial atualizada/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    const legacyNoEmail = await frame.evaluate(() => document.getElementById('manualEmail').value);
    check(legacyNoEmail === '', 'LAIFT:ID:<identificador sem @> não mexe no campo de e-mail (só avisa para abrir a credencial atualizada)');

    // ---- texto não reconhecido ----
    await frame.evaluate(() => window.__qrOnScan('qualquer-coisa'));
    await frame.waitForFunction(() => /não reconhecido/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    check(checkInCalls.length === 1, 'texto sem o prefixo LAIFT: vira aviso, sem chamar a Worker');

    // ---- parar o leitor ----
    await tap(frame, '#scannerStop');
    await frame.waitForFunction(() => document.getElementById('reader').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    const stopped = await frame.evaluate(() => ({
      readerHidden: document.getElementById('reader').classList.contains('hidden'),
      startVisible: !document.getElementById('scannerStart').classList.contains('hidden'),
    }));
    check(stopped.readerHidden && stopped.startVisible, '"Parar leitor" esconde a câmera e volta o botão de iniciar');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (lógica do leitor)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------------------
// 4. Câmera de verdade (html5-qrcode real + Chromium com câmera falsa)
// ---------------------------------------------------------------------------
async function scannerCameraScenario() {
  const pkgs = mirror.ensureMirror();
  if (!pkgs) {
    console.log('  (aviso: espelho do npm indisponível — cenário de câmera real pulado, como o csp.e2e.js faz sem rede)');
    return;
  }
  const app = await startApp({
    role: 'admin',
    workerHandlers: fiscalWorkerHandlers(),
    launchArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    permissions: ['camera'],
  });
  const violations = await watchCsp(app);
  // Mesma técnica do csp.e2e.js: serve o jsDelivr a partir do espelho local do npm.
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const file = mirror.resolveCdnUrl(pkgs, route.request().url());
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  try {
    const frame = await openFiscalFrame(app);
    check(await frame.evaluate(() => typeof window.Html5QrcodeScanner === 'function'), 'html5-qrcode real carregou (SRI conferido) antes de abrir o leitor');
    await tap(frame, '#scannerStart');
    await frame.waitForTimeout(1500); // getUserMedia + UI própria da biblioteca (câmera falsa do Chromium)
    const state = await frame.evaluate(() => ({
      readerVisible: !document.getElementById('reader').classList.contains('hidden'),
      unavailableMsg: /indisponível/.test(document.getElementById('status').textContent || ''),
    }));
    check(state.readerVisible && !state.unavailableMsg, 'com a biblioteca real e câmera falsa, o leitor abre (sem cair no aviso de "indisponível")');
    await tap(frame, '#scannerStop');
    await frame.waitForTimeout(300);

    report(violations, 'leitor com câmera real (fake device)');
    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript ao abrir/fechar a câmera' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function qr() {
  await batchBadgesScenario();
  await singleBadgeScenario();
  await scannerLogicScenario();
  await scannerCameraScenario();
};
