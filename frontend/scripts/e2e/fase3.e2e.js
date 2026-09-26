/**
 * fase3.e2e.js — IA na Worker, clínica virtual, preceptor do laboratório e
 * painel admin de IA (docs/FASE_3_IA_CLINICA.md).
 *
 * Ponte módulo↔plataforma: o Contrato 3 (window.LaiftApi, em
 * modulos/shared/laift-identity.js) é implementado pela Equipe 2 em
 * paralelo e ainda não existe neste worktree. Por isso este cenário injeta
 * nos IFRAMES uma ponte de teste (context.addInitScript) que segue o
 * contrato: mesma allowlist de ações, token só do app principal (via
 * App.callLearningApi quando existir, senão App.callApi com o token de
 * App.getState()), e { success:false, message } sem sessão. Quando a
 * ponte real chegar, laift-identity.js (que roda DEPOIS do init script)
 * substitui a de teste e o cenário passa a exercitar a ponte real, sem
 * mudança aqui.
 *
 * Todas as respostas da IA simuladas carregam HTML malicioso: o teste
 * exige que apareçam como TEXTO literal, sem criar nenhum elemento.
 */
const { startApp, check } = require('./harness');

const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;
const XSS = '<img src=x onerror="window.top.__xss=1">';
const LEGACY_ACTIONS = [
  'conversarComPaciente', 'avaliarCondutaPreceptor', 'gerarCasoProcedural', 'listarCasosAcervo',
  'obterDashboardEpidemiologico', 'consolidarDashboard', 'consultarPreceptorIA', 'consultarCacheGlobal', 'salvarCacheGlobal',
];
const ACERVO_ID = '44444444-4444-4444-8444-444444444444';

function bridgeStub() {
  if (window === window.top || window.LaiftApi) return;
  var ALLOW = /^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z][A-Za-z]*$/;
  var UNAVAILABLE = { success: false, message: 'Sessão indisponível.' };
  window.LaiftApi = {
    __e2eStub: true,
    call: function (action, input) {
      try {
        var app = window.top.App;
        if (!ALLOW.test(action) || !app) return Promise.resolve(UNAVAILABLE);
        if (typeof app.callLearningApi === 'function') return app.callLearningApi(action, input);
        var st = app.getState();
        if (!st || !st.sessionToken) return Promise.resolve(UNAVAILABLE);
        return app.callApi(action, st.sessionToken, input);
      } catch (e) {
        return Promise.resolve(UNAVAILABLE);
      }
    },
  };
}

function generatedCase() {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    titulo: 'Caso gerado <script>alert(1)</script>',
    tipo: 'emergencia', toxindrome: 'Colinérgica', agentePrincipal: 'Clorpirifós', dificuldade: 'Avançado',
    vitalidadeInicial: 90, pacienciaInicial: 90, taxaDecaimento: { vitalidadePorMinuto: 1, pacienciaPorMinuto: 1 },
    paciente: { nome: 'Paciente <b>Gerado</b>', idade: 40, peso: '70 kg', genero: 'Masculino', profissao: 'Agricultor', alergias: 'Nega' },
    queixaPrincipal: 'Tô babando ' + XSS, historicoAdmissao: 'Histórico ' + XSS,
    sinaisVitais: { pa: '90/60', fc: '45', fr: '30', temp: '36', spo2: '85%', glasgow: '13' },
    contextoOculto: { exposicaoReal: 'Clorpirifós', sintomas: 'baba', temperamento: 'Assustado' },
    guiaSemiologico: { cronologia: ['Quando ' + XSS + '?'], farmacoterapia: [], exposicao: [], sinaisAlarme: [] },
    perguntasSugeridas: [],
    examesDisponiveis: [
      { id: 'colinesterase', nome: 'Colinesterase ' + XSS, custoTempoMin: 1, impactoVitalidade: 0, impactoPaciencia: 0, essencial: true, resultado: 'Baixa ' + XSS },
      { id: 'tc', nome: 'Tomografia', custoTempoMin: 1, impactoVitalidade: 0, impactoPaciencia: 0, essencial: false, resultado: 'Normal' },
    ],
    gabaritoPreceptor: { diagnostico: 'Síndrome colinérgica', conduta: 'Atropina', palavrasChave: ['atropina'] },
  };
}

function libraryCase() {
  const c = generatedCase();
  delete c.gabaritoPreceptor;
  return Object.assign(c, {
    id: ACERVO_ID, caseSource: 'acervo', titulo: '<b>Caso</b> do acervo',
    paciente: { nome: 'Maria do Acervo', idade: 30 }, contextoOculto: { temperamento: 'Calma' },
  });
}

function workerHandlers(state) {
  const quota = () => ({
    success: true, aiConfigured: true,
    quotas: {
      chat: { used: 2, limit: 150, remaining: 148 },
      evaluate: { used: 1, limit: 20, remaining: 19 },
      generateCase: { used: 8 - state.generateRemaining, limit: 8, remaining: state.generateRemaining },
      labPreceptor: { used: 0, limit: 80, remaining: 80 },
    },
  });
  return {
    apiLearnGetMyAiQuota: quota,
    apiLearnClinicalChat: () => ({ success: true, patientReply: XSS + ' Tô sem ar, doutor.' }),
    apiLearnClinicalEvaluate: () => ({
      success: true, saved: true,
      result: { score: 87, verdict: '<b>Bom atendimento</b>', feedback: XSS + ' Raciocínio correto.', strengths: ['Pediu colinesterase ' + XSS], improvements: ['Revise a dose'] },
    }),
    apiLearnClinicalGenerateCase: () => {
      if (state.generateExceeded) {
        state.generateRemaining = 0;
        return { success: false, quotaExceeded: true, message: 'Você atingiu o limite diário de 8 casos gerados com IA; a cota volta amanhã.' };
      }
      state.generateRemaining = Math.max(0, state.generateRemaining - 1);
      return { success: true, caseSource: 'ia', case: generatedCase() };
    },
    apiLearnClinicalLibrary: () => ({ success: true, cases: [libraryCase()] }),
    apiLearnClinicalEpidemiology: () => ({
      success: true, survivalRatePct: 75, totalAttended: 8,
      topToxindromes: [{ name: 'Colinérgica', count: 5 }], topAgents: [{ name: '<i>Paracetamol</i>', count: 3 }],
    }),
    apiLearnLabPreceptor: (args) => {
      const input = args[1] || {};
      return input.synthesisTerm
        ? { success: true, cached: true, answer: 'Rota didática de ' + input.synthesisTerm + ' ' + XSS }
        : { success: true, cached: false, answer: 'pKa ≠ pH. ' + XSS };
    },
    apiAdminAiHealth: () => ({
      success: true, configured: true, overallPct: 67,
      keys: [
        { index: 0, masked: '…ab12', ok: true, latencyMs: 120, status: 200 },
        { index: 1, masked: '…cd34', ok: true, latencyMs: 180, status: 200 },
        { index: 2, masked: '…ef56', ok: false, latencyMs: 8000, status: 'timeout' },
      ],
      config: { models: { fast: 'openai/gpt-oss-20b', smart: 'openai/gpt-oss-120b' }, quotas: { chat: { visitor: 40, member: 150, admin: 300 } }, globalDailyMax: 3000 },
      usage24h: [{ feature: 'chat', calls: 10, failures: 1, promptTokens: 1000, completionTokens: 500 }],
    }),
    apiAdminLearnListPendingCases: () => ({
      success: true,
      cases: state.pendingReviewed ? [] : [{
        id: ACERVO_ID, title: 'Pendente <script>window.top.__xss=1</script>', toxindrome: 'Colinérgica', agent: 'Clorpirifós',
        createdAt: '2026-09-26T10:00:00Z', createdByName: 'Ana',
        summary: { difficulty: 'Avançado', patient: 'José, 45 anos', chiefComplaint: XSS, diagnosis: 'Colinérgica', conduct: 'Atropina', examsCount: 2 },
      }],
    }),
    apiAdminLearnReviewCase: (args) => {
      state.pendingReviewed = true;
      state.lastReview = args[1];
      return { success: true, message: 'Caso aprovado e publicado no acervo.' };
    },
  };
}

function lastCall(app, action) {
  const list = app.calls.worker.filter((c) => c.action === action);
  return list[list.length - 1];
}

/** Espera uma condição do lado do Node (ex.: um diálogo registrado pelo handler). */
async function until(cond, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return cond();
}

async function waitText(frame, selector, fragment) {
  await frame.waitForFunction(
    ([sel, frag]) => [...document.querySelectorAll(sel)].some((n) => (n.textContent || '').includes(frag)),
    [selector, fragment],
    { timeout: 8000 }
  );
}

module.exports = async function fase3() {
  // ======================= Membro: clínica + laboratório =======================
  const state = { generateRemaining: 6, generateExceeded: false };
  const app = await startApp({ role: 'member', workerHandlers: workerHandlers(state) });
  const dialogs = [];
  try {
    await app.context.addInitScript(bridgeStub);
    app.page.on('dialog', (d) => {
      dialogs.push(d.message());
      if (d.type() === 'prompt') d.accept('Intoxicação por organofosforado');
      else d.accept();
    });

    await app.login();
    const clinic = await app.openModule('clinica');
    check(await clinic.evaluate(() => typeof ApiService === 'undefined'), 'clínica não carrega mais o api-service.js (Apps Script)');

    await waitText(clinic, '#aiQuotaInfo', 'casos');
    check((await clinic.textContent('#aiQuotaInfo')).includes('6 de 8 casos'), 'cota restante de IA aparece perto de "Gerar Caso com IA"');

    // ---- Paciente virtual: resposta com HTML aparece como texto ----
    await clinic.click('#patientBedsGrid .bed-card button');
    await clinic.click('#tab-dialogo');
    await clinic.fill('#patientQuestionInput', 'O que o senhor estava aplicando na lavoura?');
    await clinic.click('#sendQuestionBtn');
    await waitText(clinic, '#chatHistory .chat-bubble p', 'Tô sem ar');
    const bubbleText = await clinic.evaluate(() => [...document.querySelectorAll('#chatHistory .chat-bubble p')].map((p) => p.textContent).join('\n'));
    check(bubbleText.includes('<img src=x onerror='), 'fala do paciente com <img onerror> aparece como TEXTO literal');
    check((await clinic.locator('#chatHistory img').count()) === 0, 'nenhum elemento <img> criado no chat');
    const chatCall = lastCall(app, 'apiLearnClinicalChat');
    const chatInput = chatCall && chatCall.args[1];
    check(chatInput && chatInput.caseSource === 'builtin' && chatInput.caseId === 'caso_tox_01' && chatInput.question.includes('lavoura'),
      'chat vai para apiLearnClinicalChat com caso, origem e pergunta');
    check(chatInput && Array.isArray(chatInput.history) && chatInput.history.length <= 8 && chatInput.patientContext && chatInput.patientContext.nome,
      'chat envia histórico (≤ 8 turnos) e contexto do paciente');
    check(chatCall && chatCall.args[0] === app.ctx.sessionToken, 'o token só é anexado pelo app principal (o módulo nunca o manipula)');

    // ---- Avaliação: modal do preceptor com nota ----
    await clinic.click('#tab-fechamento');
    await clinic.fill('#studentDiagnosisInput', 'Síndrome colinérgica por organofosforado');
    await clinic.fill('#studentConductInput', 'Atropina e pralidoxima');
    await clinic.click('#submitCaseResolutionBtn');
    await clinic.waitForSelector('#preceptorModal.active', { timeout: 8000 });
    check((await clinic.textContent('#preceptorGrade')).trim() === '87', 'avaliação abre o modal do preceptor com a nota do servidor');
    check((await clinic.textContent('#preceptorFeedbackText')).includes('<img src=x'), 'parecer do preceptor exibido como texto');
    check((await clinic.locator('#preceptorModal img, #preceptorModal b').count()) === 0, 'nenhum elemento criado a partir do parecer/veredito');
    const evalInput = (lastCall(app, 'apiLearnClinicalEvaluate') || { args: [] }).args[1];
    check(evalInput && evalInput.caseSource === 'builtin' && evalInput.answerKey && evalInput.attendance.outcome === 'concluido' && evalInput.attendance.diagnosis.includes('colinérgica'),
      'avaliação envia atendimento e, para caso embutido, o gabarito do cliente');
    await clinic.click('#btnClosePreceptor');

    // ---- Geração de caso com IA ----
    await clinic.waitForSelector('#clinicDashboardView:not(.hidden)');
    await clinic.click('#btnGenerateAiCase');
    await waitText(clinic, '#clinicPatientName', 'Gerado');
    check((await clinic.textContent('#clinicPatientName')) === 'Paciente <b>Gerado</b>', 'caso gerado abre no leito, com nome exibido como texto');
    check((await clinic.locator('#clinicWorkspaceView b, #clinicWorkspaceView img, #clinicWorkspaceView script').count()) === 0,
      'prontuário, guia e exames do caso gerado não criam elementos a partir do conteúdo da IA');
    const genInput = (lastCall(app, 'apiLearnClinicalGenerateCase') || { args: [] }).args[1];
    check(genInput && genInput.topic === 'Intoxicação por organofosforado', 'geração vai para apiLearnClinicalGenerateCase com o tema');
    check(dialogs.some((m) => m.includes('revisão da diretoria')), 'aviso de que o caso gerado passa por revisão antes do acervo');

    // ---- Acervo ----
    await clinic.click('#btnReturnToBeds');
    await clinic.waitForSelector('#clinicDashboardView:not(.hidden)');
    await clinic.click('#btnModoAcervo');
    await clinic.waitForSelector('#communityBedsGrid .bed-card', { timeout: 8000 });
    check((await clinic.textContent('#communityBedsGrid h4')).includes('<b>Caso</b> do acervo'), 'acervo lista casos aprovados com texto literal');
    check((await clinic.locator('#communityBedsGrid b, #communityBedsGrid img').count()) === 0, 'nenhum elemento criado a partir do acervo');
    await clinic.click('#communityBedsGrid .bed-card button');
    await clinic.click('#tab-fechamento');
    await clinic.fill('#studentDiagnosisInput', 'Colinérgica');
    await clinic.click('#submitCaseResolutionBtn');
    await clinic.waitForSelector('#preceptorModal.active', { timeout: 8000 });
    const acervoEval = (lastCall(app, 'apiLearnClinicalEvaluate') || { args: [] }).args[1];
    check(acervoEval && acervoEval.caseSource === 'acervo' && acervoEval.caseId === ACERVO_ID && acervoEval.answerKey === undefined,
      'caso do acervo é avaliado SEM gabarito do cliente (vale o do servidor)');
    await clinic.click('#btnClosePreceptor');

    // ---- Radar epidemiológico ----
    await clinic.click('#btnRadar');
    await waitText(clinic, '#radarTaxaSobrevivencia', '75%');
    check((await clinic.textContent('#radarTotalAtendimentos')) === '8', 'radar mostra sobrevida e total vindos de apiLearnClinicalEpidemiology');
    check((await clinic.textContent('#radarAgentesList')).includes('<i>Paracetamol</i>') && (await clinic.locator('#radarAgentesList i').count()) === 0,
      'radar exibe agentes como texto');
    await clinic.click('#btnCloseRadar');

    // ---- Cota de geração estourada ----
    state.generateExceeded = true;
    dialogs.length = 0;
    await clinic.click('#btnModoPlantao');
    await clinic.click('#btnGenerateAiCase');
    await clinic.waitForFunction(() => document.getElementById('btnGenerateAiCase').textContent.includes('esgotada'), null, { timeout: 8000 });
    await until(() => dialogs.some((m) => m.includes('limite diário')), 5000);
    check(dialogs.some((m) => m.includes('limite diário de 8 casos')), 'cota estourada mostra a mensagem clara do servidor');
    check((await clinic.textContent('#btnGenerateAiCase')).includes('esgotada'), 'botão "Gerar Caso com IA" fica desabilitado com cota esgotada');
    check((await clinic.textContent('#aiQuotaInfo')).includes('0 de 8 casos'), 'cota exibida é atualizada para 0');

    // ---- Preceptor do laboratório ----
    await app.page.click('#learn-back');
    const lab = await app.openModule('lab');
    await lab.waitForFunction(() => !!window.LabPreceptorEngine, null, { timeout: 8000 });
    const answer = await lab.evaluate(() => window.LabPreceptorEngine.processarMensagem('Qual a diferença entre pKa e pH?', null, null, false));
    const labInput = (lastCall(app, 'apiLearnLabPreceptor') || { args: [] }).args[1];
    check(labInput && labInput.question.includes('pKa') && !labInput.synthesisTerm && typeof labInput.benchContext === 'string',
      'dúvida do laboratório vai para apiLearnLabPreceptor com o contexto da bancada');
    check(answer.includes('pKa ≠ pH') && !answer.includes('<img'), 'resposta do preceptor chega como texto, com < e > neutralizados');
    const synth = await lab.evaluate(() => window.LabPreceptorEngine.processarMensagem('Como sintetizar cafeína?', null, null, false));
    const synthInput = (lastCall(app, 'apiLearnLabPreceptor') || { args: [] }).args[1];
    check(synthInput && synthInput.synthesisTerm === 'cafeina', 'pedido de síntese manda o termo; o cache é do servidor');
    check(synth.includes('acervo coletivo'), 'resposta do cache do servidor é identificada como tal');
    const local = await lab.evaluate(() => window.LabPreceptorEngine.processarMensagem('Como sintetizar aspirina?', null, null, false));
    check(local.includes('Ácido Acetilsalicílico') && app.calls.worker.filter((c) => c.action === 'apiLearnLabPreceptor').length === 2,
      'acervo local do laboratório continua respondendo sem chamar o servidor');
    await lab.evaluate(() => {
      const input = document.getElementById('labChatInput');
      if (input && typeof window.enviarDuvidaLab === 'function') { input.value = 'Explique titulação'; return window.enviarDuvidaLab(); }
      return null;
    });
    check((await lab.locator('#labChatMessages img').count()) === 0, 'chat do laboratório não cria <img> a partir da resposta da IA');

    // ---- Nada de Apps Script e nenhum XSS executado ----
    const legacy = app.calls.appsScript.filter((c) => LEGACY_ACTIONS.indexOf(c.acao) !== -1);
    check(legacy.length === 0, 'nenhuma chamada da clínica/laboratório ao Apps Script' + (legacy.length ? ': ' + legacy.map((c) => c.acao).join(', ') : ''));
    check((await app.page.evaluate(() => window.__xss)) === undefined, 'nenhum payload de XSS executou');

    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'sem erros de JavaScript nas páginas' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }

  // ======================= Sem ponte: mensagem amigável =======================
  const noBridge = await startApp({ role: 'member' });
  try {
    await noBridge.login();
    const clinic = await noBridge.openModule('clinica');
    const res = await clinic.evaluate(() => (window.LaiftApi && !window.LaiftApi.__e2eStub) ? null : ClinicEngine.refreshAiQuota().then(() => document.getElementById('aiQuotaInfo').textContent));
    if (res === null) {
      check(true, 'ponte real presente (integração): cenário sem ponte não se aplica');
    } else {
      await clinic.click('#btnModoAcervo');
      await waitText(clinic, '#communityBedsGrid', 'dentro da plataforma');
      check(true, 'sem a ponte LaiftApi, a clínica mostra mensagem amigável em vez de quebrar');
    }
  } finally {
    await noBridge.close();
  }

  // ======================= Admin: painel "IA" em 360 px =======================
  const adminState = { pendingReviewed: false };
  const admin = await startApp({ role: 'admin', viewport: { width: 360, height: 740 }, workerHandlers: workerHandlers(adminState) });
  try {
    await admin.login();
    await admin.page.click('#btn-enter-admin-mode');
    await admin.showPanel('panel-admin-ai');
    await admin.page.waitForSelector('#admin-ai-keys .ai-key-card', { timeout: 8000 });
    check((await admin.page.locator('#admin-ai-keys .ai-key-card').count()) === 3, 'um cartão por chave do pool');
    const keysText = await admin.page.textContent('#admin-ai-keys');
    check(keysText.includes('…ab12') && keysText.includes('timeout'), 'cartões mostram só o final mascarado, status e latência');
    check((await admin.page.textContent('#admin-ai-health-summary')).includes('67%'), 'percentual geral de saúde do pool');
    check((await admin.page.textContent('#admin-ai-quotas')).includes('150'), 'cotas atuais por papel exibidas');

    await admin.page.waitForSelector('#admin-ai-pending .ai-case', { timeout: 8000 });
    check((await admin.page.textContent('#admin-ai-pending')).includes('<script>window.top.__xss=1</script>'), 'caso pendente exibido com resumo em texto');
    check((await admin.page.locator('#admin-ai-pending script, #admin-ai-pending img').count()) === 0, 'nenhum elemento criado a partir do caso pendente');

    await admin.page.click('#admin-ai-pending .ai-case button:has-text("Aprovar")');
    await admin.page.waitForSelector('#modal-confirm:not(.hidden)');
    await admin.page.click('#modal-confirm-ok');
    await admin.page.waitForFunction(() => document.getElementById('msg-admin-ai-cases').textContent.includes('aprovado'), null, { timeout: 8000 });
    check(adminState.lastReview && adminState.lastReview.caseId === ACERVO_ID && adminState.lastReview.decision === 'approved', 'aprovar caso chama apiAdminLearnReviewCase com a decisão');
    check((await admin.page.locator('#admin-ai-pending .ai-case').count()) === 0, 'lista de pendentes recarrega após a revisão');

    const overflow = await admin.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, 'painel de IA sem rolagem horizontal em 360 px' + (overflow > 0 ? ' (' + overflow + 'px a mais)' : ''));
    const smallTargets = await admin.page.evaluate(() => [...document.querySelectorAll('#panel-admin-ai button')]
      .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length);
    check(smallTargets === 0, 'botões do painel de IA com alvo de toque ≥ 44 px');
    check((await admin.page.evaluate(() => window.__xss)) === undefined, 'nenhum payload de XSS executou no painel admin');

    await admin.page.click('#btn-logout');
    check((await admin.page.locator('#admin-ai-keys .ai-key-card').count()) === 0, 'logout limpa o painel de IA');
  } finally {
    await admin.close();
  }
};
