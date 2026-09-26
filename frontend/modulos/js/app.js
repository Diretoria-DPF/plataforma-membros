/* ========================================================================= */
/* ARQUIVO: js/app.js (Raiz do Projeto)                                      */
/* ========================================================================= */

/**
 * CONTROLADOR PRINCIPAL SPA, GESTÃO DE SESSÃO E ROTEAMENTO
 * Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT)
 */

const STORAGE_SESSION_KEY = 'laift_student_session';
const SESSION_TTL_DAYS = 15;

const appState = {
  activeView: 'authSection',
  user: null
};

// =========================================================
// ROTEAMENTO E TRANSIÇÃO DE TELAS SPA (BLINDADO)
// =========================================================

function navigateTo(viewId) {
  const views = [
    'authSection',
    'dashboardSection',
    'quizSection',
    'toxicoSection',
    'clinicSection',
    'labSection',
    'anatomiaSection'
  ];

  let target = document.getElementById(viewId);

  // Proteção contra tela em branco: se o contêiner não existir, redireciona ao Hub
  if (!target) {
    console.warn(`[LAIFT] Tentativa de navegar para tela inexistente: #${viewId}. Redirecionando para o Hub.`);
    if (viewId !== 'dashboardSection') {
      navigateTo('dashboardSection');
    }
    return;
  }

  // Autocorreção: se a seção estiver aninhada por engano dentro de outra, move para a raiz da viewport
  const viewport = document.querySelector('.app-viewport');
  if (viewport && target.parentElement && target.parentElement.closest('#dashboardSection')) {
    viewport.appendChild(target);
  }

  // Oculta todos os painéis gerenciados
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('active');
    }
  });

  // Torna o painel de destino visível
  target.classList.remove('hidden');
  target.classList.add('active');
  appState.activeView = viewId;

  // Gerenciamento do cabeçalho de controle de sessão
  const controls = document.getElementById('sessionHeaderControls');
  if (viewId === 'authSection') {
    if (controls) controls.classList.add('hidden');
    document.body.className = 'theme-default';
  } else {
    if (controls) controls.classList.remove('hidden');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function launchModule(moduleType) {
  switch (moduleType) {
    case 'farmaco': {
      document.body.className = 'theme-default';
      const quizFrame = document.getElementById('quizFrame');
      if (quizFrame && (!quizFrame.src || !quizFrame.src.includes('quiz/index.html'))) {
        quizFrame.src = 'quiz/index.html';
      }
      navigateTo('quizSection');
      break;
    }

    case 'toxico': {
      document.body.className = 'theme-toxico';
      const toxFrame = document.getElementById('toxicoFrame');
      if (toxFrame && (!toxFrame.src || !toxFrame.src.includes('toxicologia/index.html'))) {
        toxFrame.src = 'toxicologia/index.html';
      }
      navigateTo('toxicoSection');
      break;
    }

    case 'clinica': {
      document.body.className = 'theme-clinic';
      navigateTo('clinicSection');
      if (typeof ClinicEngine !== 'undefined' && typeof ClinicEngine.showBedsDashboard === 'function') {
        ClinicEngine.showBedsDashboard();
      }
      break;
    }

    case 'lab': {
      document.body.className = 'theme-default';
      const labFrame = document.getElementById('labFrame') || document.querySelector('#labSection iframe');
      if (labFrame && (!labFrame.src || !labFrame.src.includes('laboratorio/index.html'))) {
        labFrame.src = 'laboratorio/index.html';
      }
      navigateTo('labSection');
      break;
    }

    case 'anatomia': {
      document.body.className = 'theme-default';
      const anatomiaFrame = document.getElementById('anatomiaFrame');
      if (anatomiaFrame && (!anatomiaFrame.src || !anatomiaFrame.src.includes('anatomia-3d/index.html'))) {
        anatomiaFrame.src = 'anatomia-3d/index.html';
      }
      navigateTo('anatomiaSection');
      break;
    }

    default:
      navigateTo('dashboardSection');
  }
}

function transitionToDashboard() {
  navigateTo('dashboardSection');
  document.body.className = 'theme-default';
  refreshDashboard();
}

// =========================================================
// SESSÃO DO ALUNO E RESTAURAÇÃO DA CREDENCIAL
// =========================================================

function checkExistingSession() {
  const raw = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!raw) return false;

  try {
    const session = JSON.parse(raw);
    if (session && session.identifier && (!session.expiresAt || Date.now() < session.expiresAt)) {
      appState.user = session;
      applyUserToUI(session);
      showCredentialScreen();
      return true;
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  } catch (e) {
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }
  return false;
}

function persistSession(userData) {
  const session = {
    ...userData,
    expiresAt: Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  };
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
  appState.user = session;
  applyUserToUI(session);
}

function applyUserToUI(user) {
  const hName = document.getElementById('headerUserName');
  const hBadge = document.getElementById('headerUserBadge');
  const dName = document.getElementById('dashUserName');
  const dRole = document.getElementById('dashUserRole');
  const dId = document.getElementById('dashUserId');
  const dInitials = document.getElementById('userInitials');

  if (hName) hName.textContent = user.name || 'Estudante';
  if (hBadge) hBadge.textContent = user.type || 'Membro';
  if (dName) dName.textContent = user.name || 'Estudante';
  if (dRole) dRole.textContent = user.type || 'Membro';
  if (dId) dId.textContent = user.identifier || '---';

  if (dInitials) {
    const initials = (user.name || 'LA')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0].toUpperCase())
      .join('');
    dInitials.textContent = initials || 'LF';
  }
}

function showCredentialScreen() {
  const session = appState.user || JSON.parse(localStorage.getItem(STORAGE_SESSION_KEY) || '{}');
  
  navigateTo('authSection');
  showPublicStep('credentialScreen');

  const qrImg = document.getElementById('credentialQrImage');
  const nameEl = document.getElementById('credUserName');
  const roleEl = document.getElementById('credRoleBadge');
  const idEl = document.getElementById('credUserId');

  if (nameEl) nameEl.textContent = session.name || 'Estudante LAIFT';
  if (roleEl) roleEl.textContent = session.type || 'Membro';
  if (idEl) idEl.textContent = `ID / Matrícula: ${session.identifier || '---'}`;

  if (qrImg && session.identifier) {
    const qrPayload = session.sessionToken ? `LAIFT:v1:${session.sessionToken}` : `LAIFT:ID:${session.identifier}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(qrPayload)}`;
  }
}

function logout() {
  if (confirm('Deseja realmente encerrar sua sessão?')) {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    appState.user = null;
    navigateTo('authSection');
    restartPublicFlow();
  }
}

// =========================================================
// DASHBOARD E MÉTRICAS
// =========================================================

async function refreshDashboard() {
  if (!appState.user || !appState.user.identifier) return;

  try {
    if (typeof ApiService !== 'undefined' && typeof ApiService.obterDashboardAluno === 'function') {
      const data = await ApiService.obterDashboardAluno(appState.user.identifier);
      if (data && data.sucesso && data.aluno) {
        const elAcc = document.getElementById('statAccuracy');
        const elAns = document.getElementById('statAnswered');
        const elCases = document.getElementById('statCasesSolved');

        if (elAcc) elAcc.textContent = `${data.aluno.taxaAcertoGeral}%`;
        if (elAns) elAns.textContent = data.aluno.totalQuestoes;
        if (elCases) elCases.textContent = data.aluno.simuladosConcluidos;

        if (data.aluno.totalQuestoes > 0) {
          document.getElementById('badgeTox')?.classList.remove('locked');
        }
        if (data.aluno.simuladosConcluidos > 0) {
          document.getElementById('badgeClinic')?.classList.remove('locked');
        }
      }
    }
  } catch (err) {
    console.warn('Dashboard carregado em modo offline.');
  }
}

function resetVisualMetrics() {
  if (confirm('Deseja zerar os contadores visuais locais da tela?')) {
    const elAcc = document.getElementById('statAccuracy');
    const elAns = document.getElementById('statAnswered');
    const elCases = document.getElementById('statCasesSolved');
    if (elAcc) elAcc.textContent = '0%';
    if (elAns) elAns.textContent = '0';
    if (elCases) elCases.textContent = '0';
  }
}

// =========================================================
// FLUXO PÚBLICO DE AUTENTICAÇÃO
// =========================================================

function showPublicStep(stepId) {
  ['identityForm', 'registrationForm', 'otpForm', 'credentialScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(stepId);
  if (target) target.classList.remove('hidden');
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  if (el) {
    el.textContent = msg;
    el.className = `status-banner ${type}`;
    el.classList.remove('hidden');
  }
}

function hideStatus() {
  const el = document.getElementById('status');
  if (el) el.classList.add('hidden');
}

async function requestAccessCode() {
  hideStatus();
  const idInput = document.getElementById('studentId');
  const emailInput = document.getElementById('studentEmail');
  const identifier = idInput ? idInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';

  if (!identifier || !email) {
    showStatus('Preencha a matrícula/CPF e seu e-mail.', 'error');
    return;
  }

  showStatus('Verificando cadastro...', 'loading');

  try {
    const res = await ApiService.solicitarCodigoAcesso(identifier, email, '', '', false);
    hideStatus();

    if (res && res.novoCadastro) {
      showPublicStep('registrationForm');
    } else if (res && res.sucesso) {
      showPublicStep('otpForm');
    } else {
      showStatus((res && res.mensagem) || 'Não foi possível solicitar o código.', 'error');
    }
  } catch (err) {
    console.error(err);
    showStatus('Erro ao conectar com a portaria digital.', 'error');
  }
}

async function sendRegistrationCode() {
  hideStatus();
  const identifier = document.getElementById('studentId').value.trim();
  const email = document.getElementById('studentEmail').value.trim().toLowerCase();
  const type = document.getElementById('participantType').value;
  const name = document.getElementById('participantName').value.trim();
  const consent = document.getElementById('privacyConsent').checked;

  if (!type || !name) {
    showStatus('Preencha todos os campos do cadastro.', 'error');
    return;
  }
  if (!consent) {
    showStatus('É obrigatório aceitar a política de privacidade.', 'error');
    return;
  }

  showStatus('Enviando código de ativação...', 'loading');

  try {
    const res = await ApiService.solicitarCodigoAcesso(identifier, email, type, name, consent);
    hideStatus();

    if (res && res.sucesso) {
      showPublicStep('otpForm');
    } else {
      showStatus((res && res.mensagem) || 'Falha ao registrar dados.', 'error');
    }
  } catch (err) {
    console.error(err);
    showStatus('Erro de conexão com o servidor.', 'error');
  }
}

async function validateAccessCode() {
  hideStatus();
  const identifier = document.getElementById('studentId').value.trim();
  const email = document.getElementById('studentEmail').value.trim().toLowerCase();
  const codeInput = document.getElementById('otpCode');
  const code = codeInput ? codeInput.value.replace(/\D/g, '') : '';

  if (code.length !== 6) {
    showStatus('Digite o código de 6 dígitos enviado por e-mail.', 'error');
    return;
  }

  showStatus('Autenticando...', 'loading');

  try {
    const res = await ApiService.validarCodigoAcesso(identifier, email, code);
    hideStatus();

    if (res && res.sucesso) {
      persistSession({
        identifier,
        email,
        name: res.nome || document.getElementById('participantName')?.value.trim() || 'Estudante',
        type: res.tipo || document.getElementById('participantType')?.value || 'Membro',
        sessionToken: res.sessao
      });

      showCredentialScreen();
    } else {
      showStatus((res && res.mensagem) || 'Código incorreto ou expirado.', 'error');
    }
  } catch (err) {
    console.error(err);
    showStatus('Falha ao autenticar o código.', 'error');
  }
}

function returnToIdentity() {
  hideStatus();
  showPublicStep('identityForm');
}

function restartPublicFlow() {
  hideStatus();
  const id = document.getElementById('studentId');
  const email = document.getElementById('studentEmail');
  const otp = document.getElementById('otpCode');
  if (id) id.value = '';
  if (email) email.value = '';
  if (otp) otp.value = '';
  showPublicStep('identityForm');
}

// =========================================================
// REENVIO DE CÓDIGO OTP COM CONTROLE DE TEMPO
// =========================================================

let resendTimerInterval = null;

async function resendAccessCode() {
  const btn = document.getElementById('resendOtpBtn');
  if (btn && btn.disabled) return;

  hideStatus();
  const idInput = document.getElementById('studentId');
  const emailInput = document.getElementById('studentEmail');
  const identifier = idInput ? idInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';

  if (!identifier || !email) {
    showStatus('Matrícula/CPF ou e-mail ausentes. Reinicie a identificação.', 'error');
    restartPublicFlow();
    return;
  }

  showStatus('Reenviando novo código de acesso...', 'loading');
  iniciarContagemReenvio(30);

  try {
    const res = await ApiService.solicitarCodigoAcesso(identifier, email, '', '', false);
    hideStatus();

    if (res && res.sucesso) {
      showStatus('Novo código enviado! Verifique sua caixa de entrada e spam.', 'success');
      const otpInput = document.getElementById('otpCode');
      if (otpInput) {
        otpInput.value = '';
        otpInput.focus();
      }
    } else {
      showStatus((res && res.mensagem) || 'Falha ao reenviar código.', 'error');
    }
  } catch (err) {
    console.error(err);
    showStatus('Erro de conexão ao reenviar código.', 'error');
  }
}

function iniciarContagemReenvio(segundos) {
  const btn = document.getElementById('resendOtpBtn');
  if (!btn) return;

  clearInterval(resendTimerInterval);
  let tempoRestante = segundos;
  btn.disabled = true;
  btn.textContent = `⏳ Aguarde (${tempoRestante}s)`;

  resendTimerInterval = setInterval(() => {
    tempoRestante--;
    if (tempoRestante <= 0) {
      clearInterval(resendTimerInterval);
      btn.disabled = false;
      btn.textContent = '📩 Reenviar Código';
    } else {
      btn.textContent = `⏳ Aguarde (${tempoRestante}s)`;
    }
  }, 1000);
}

// =========================================================
// CONTROLE DE MODAIS
// =========================================================

function showUserCredentialModal() {
  const session = JSON.parse(localStorage.getItem(STORAGE_SESSION_KEY) || '{}');
  const modalQr = document.getElementById('modalQrImage');
  const modalMeta = document.getElementById('modalQrMeta');

  if (session && session.identifier) {
    if (modalMeta) modalMeta.textContent = `Participante: ${session.name || 'Estudante'} | ID: ${session.identifier}`;
    const qrPayload = session.sessionToken ? `LAIFT:v1:${session.sessionToken}` : `LAIFT:ID:${session.identifier}`;
    if (modalQr) modalQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=12&data=${encodeURIComponent(qrPayload)}`;
  }

  document.getElementById('credentialModal')?.classList.add('active');
}

function closeCredentialModal() {
  document.getElementById('credentialModal')?.classList.remove('active');
}

function closePreceptorModal() {
  document.getElementById('preceptorModal')?.classList.remove('active');
  transitionToDashboard();
}

// =========================================================
// EXPOSIÇÃO GLOBAL EXPLÍCITA
// =========================================================

window.transitionToDashboard = transitionToDashboard;
window.launchModule = launchModule;
window.navigateTo = navigateTo;
window.logout = logout;
window.requestAccessCode = requestAccessCode;
window.sendRegistrationCode = sendRegistrationCode;
window.validateAccessCode = validateAccessCode;
window.returnToIdentity = returnToIdentity;
window.restartPublicFlow = restartPublicFlow;
window.resetVisualMetrics = resetVisualMetrics;
window.showUserCredentialModal = showUserCredentialModal;
window.closeCredentialModal = closeCredentialModal;
window.closePreceptorModal = closePreceptorModal;
window.showStatus = showStatus;
window.hideStatus = hideStatus;
window.resendAccessCode = resendAccessCode;
window.showCredentialScreen = showCredentialScreen;

// =========================================================
// INICIALIZAÇÃO RESILIENTE
// =========================================================

function initApp() {
  if (typeof ClinicEngine !== 'undefined' && typeof ClinicEngine.init === 'function') {
    ClinicEngine.init();
  }

  document.getElementById('navHubBtn')?.addEventListener('click', transitionToDashboard);
  document.getElementById('globalLogoutBtn')?.addEventListener('click', logout);
  document.getElementById('infoBtn')?.addEventListener('click', () => {
    document.getElementById('instructionsModal')?.classList.add('active');
  });
  document.getElementById('closeModal')?.addEventListener('click', () => {
    document.getElementById('instructionsModal')?.classList.remove('active');
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
    }
  });

  const hasSession = checkExistingSession();
  if (!hasSession) {
    navigateTo('authSection');
    showPublicStep('identityForm');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
