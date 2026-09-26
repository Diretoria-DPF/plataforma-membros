/**
 * qa-full.e2e.js — Auditoria de QA de ponta a ponta (cobertura de lacunas).
 *
 * As suítes existentes (smoke/fase2/fase3/fase4/csp/apis/parsers/rdkit/qr/
 * quiz-farmaco/atlas) cobrem bem os módulos de aprendizagem, a ponte
 * LaiftApi, o terminal fiscal, a clínica virtual/IA e a segurança estática.
 * Este arquivo cobre o que ficava sem nenhum teste automatizado: login com
 * erro, cadastro, "esqueci minha senha"/redefinição, confirmação de e-mail,
 * logout, perfil + avatar, eventos, propostas/votação, tarefas, organograma
 * e conexões, mensageria E2EE (com criptografia REAL, não simulada) e os
 * painéis administrativos (usuários, eventos, propostas, tarefas, feedback,
 * auditoria, denúncias). Também cobre o tratamento de falha de rede da
 * Worker (mensagem amigável, sem travar) e a ausência de rolagem horizontal
 * em 390 px nos painéis da própria plataforma (os módulos já são cobertos
 * a 360 px em fase2/fase4).
 *
 * Todo mock de resposta da Worker aqui foi conferido campo a campo contra o
 * handler real em worker/src/services/*.js — não apenas contra o que o
 * front-end espera.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { startApp, check } = require('./harness');

// Mesma lista das outras suítes: bibliotecas de CDN abortadas de propósito
// no ambiente de teste (sem rede) não devem contar como erro de verdade.
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;
function realErrors(app) {
  return app.errors.filter((e) => !IGNORABLE.test(e));
}

/**
 * Carrega frontend/msg-crypto.js em Node para simular o LADO DO CONTATO na
 * mensageria E2EE (gerar o par de chaves dele e cifrar uma mensagem "de
 * entrada" com a chave real de conversa) — mesmo truque de
 * frontend/scripts/verify-msg-crypto.js: o pacote não declara
 * "type":"module", então um import() direto do .js seria tratado como
 * CommonJS e falharia no `export`; copiamos o CONTEÚDO (sem alterar o
 * arquivo real) para um .mjs temporário, que o Node importa pela extensão.
 */
function loadMsgCryptoInNode() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'msg-crypto.js'), 'utf8');
  const tmpFile = path.join(os.tmpdir(), 'qa-full-msg-crypto-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(tmpFile, source, 'utf8');
  return import(pathToFileURL(tmpFile).href).finally(() => { try { fs.unlinkSync(tmpFile); } catch (err) { /* ignora */ } });
}

// ===========================================================================
// 1. Login, logout e falha de rede da Worker
// ===========================================================================
async function loginAndLogoutScenario() {
  let attempt = 0;
  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiLogin: () => {
        attempt++;
        if (attempt === 1) return { success: false, message: 'E-mail ou senha inválidos.' };
        if (attempt === 2) return { success: false, message: 'Sua conta foi banida. Se você acredita que isso é um engano, entre em contato com a administração.' };
        return { success: true, sessionToken: 'tok-e2e-qa', profile: { fullName: 'Ana Teste', role: 'member' } };
      },
      apiLogout: () => ({ success: true, message: 'Sessão encerrada.' }),
    },
  });
  try {
    await app.page.goto(app.baseUrl);
    await app.page.fill('#login-email', 'ana@exemplo.com');
    await app.page.fill('#login-password', 'senha-errada');
    await app.page.click('#form-login button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-login').textContent === 'E-mail ou senha inválidos.', null, { timeout: 5000 });
    check(true, 'credenciais inválidas mostram mensagem clara, sem entrar no app');
    check(await app.page.locator('#app-root.hidden').count() === 1, 'app continua na tela de login após credenciais inválidas');

    await app.page.click('#form-login button[type=submit]');
    await app.page.waitForFunction(() => /banida/.test(document.getElementById('msg-login').textContent), null, { timeout: 5000 });
    check(true, 'conta banida mostra a mensagem específica devolvida pelo servidor');

    await app.page.click('#form-login button[type=submit]');
    await app.page.waitForSelector('#app-root:not(.hidden)');
    check(true, 'login correto entra no app depois das tentativas anteriores');

    await app.page.click('#btn-logout');
    await app.page.waitForSelector('#public-shell:not(.hidden)');
    const logoutCall = app.calls.worker.find((c) => c.action === 'apiLogout');
    check(!!logoutCall && logoutCall.args[0] === 'tok-e2e-qa', 'logout chama apiLogout com o token de sessão certo');
    check((await app.page.evaluate(() => localStorage.getItem('pm_session'))) === null, 'cache local da sessão (pm_session) é apagado no logout');
    check((await app.page.locator('#screen-welcome:not(.hidden)').count()) === 1, 'logout volta para a tela de login');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (login/logout)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function workerErrorScenario() {
  const app = await startApp({ role: 'admin' });
  try {
    await app.login();

    // Simula a Worker inteira fora do ar (não só um endpoint): showPanel()
    // sempre chama refreshNavBadges() junto (3-4 chamadas concorrentes) — se
    // só UMA ação específica fosse bloqueada, as outras que tivessem sucesso
    // em paralelo derrubariam o banner de novo por causa da corrida entre
    // promises, mascarando o teste. Bloquear tudo evita essa corrida e
    // reflete melhor o cenário real de "Worker indisponível".
    let blockAll = true;
    await app.context.route('**/*', async (route) => {
      const req = route.request();
      if (blockAll && req.url().indexOf('.workers.dev') !== -1) return route.abort('failed');
      return route.fallback();
    });

    await app.page.click('#btn-enter-admin-mode');
    await app.page.waitForSelector('#api-unavailable-banner', { timeout: 5000 }).catch(() => {});
    check((await app.page.locator('#api-unavailable-banner').count()) === 1, 'falha de rede na Worker mostra o banner "Sistema indisponível" (sem travar a tela)');
    check((await app.page.locator('#admin-dashboard-stats .stat-card').count()) === 0, 'painel fica vazio, sem lançar exceção, quando a chamada falha');

    blockAll = false;
    await app.showPanel('panel-admin-dashboard');
    await app.page.waitForSelector('#admin-dashboard-stats .stat-card', { timeout: 5000 });
    await app.page.waitForSelector('#api-unavailable-banner', { state: 'detached', timeout: 5000 }).catch(() => {});
    check((await app.page.locator('#api-unavailable-banner').count()) === 0, 'banner some assim que uma chamada seguinte funciona (antes ficava preso na tela até o próximo login)');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (falha de rede simulada)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 2. Cadastro, "esqueci minha senha", redefinição e confirmação de e-mail
// ===========================================================================
async function registerScenario() {
  let attempt = 0;
  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiRegister: () => {
        attempt++;
        if (attempt === 1) return { success: false, message: 'Nome de usuário deve ter de 3 a 30 caracteres (letras, números, "_" ou ".").' };
        return { success: true, message: 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.' };
      },
    },
  });
  try {
    await app.page.goto(app.baseUrl);
    await app.page.click('[data-nav="screen-register"]');
    await app.page.waitForSelector('#screen-register:not(.hidden)');

    await app.page.setInputFiles('#reg-avatar-input', { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024, 2) });
    check((await app.page.textContent('#msg-reg-avatar')) === 'Imagem muito grande (máximo 2MB).', 'avatar grande demais no cadastro é recusado no navegador, sem chamar a Worker');
    check((await app.page.locator('#reg-avatar-preview:not(.hidden)').count()) === 0, 'nenhuma pré-visualização é exibida para o avatar recusado');

    await app.page.fill('#reg-name', 'Nova Pessoa Teste');
    await app.page.fill('#reg-username', 'a');
    await app.page.fill('#reg-email', 'nova@exemplo.com');
    await app.page.fill('#reg-phone', '11999998888');
    await app.page.fill('#reg-password', 'senha12345');
    await app.page.check('#reg-terms');
    await app.page.check('#reg-privacy');
    await app.page.click('#form-register button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-register').getAttribute('data-kind') === 'error', null, { timeout: 5000 });
    check(true, 'erro de validação devolvido pelo servidor aparece na tela de cadastro');
    check((await app.page.inputValue('#reg-name')) === 'Nova Pessoa Teste', 'formulário de cadastro NÃO é limpo depois de um erro');

    await app.page.fill('#reg-username', 'novapessoa');
    await app.page.click('#form-register button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-register').textContent === 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.', null, { timeout: 5000 });
    check((await app.page.inputValue('#reg-name')) === '', 'formulário de cadastro é limpo depois do sucesso');
    check(!(await app.page.locator('#reg-avatar-preview:not(.hidden)').count()), 'pré-visualização de avatar também é limpa depois do sucesso');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (cadastro)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function forgotResetConfirmScenario() {
  {
    const app = await startApp({
      role: 'member',
      workerHandlers: { apiRequestPasswordReset: () => ({ success: true, message: 'Se o e-mail existir em nossa base, um link de redefinição será enviado.' }) },
    });
    try {
      await app.page.goto(app.baseUrl);
      await app.page.click('[data-nav="screen-forgot"]');
      await app.page.fill('#forgot-email', 'ana@exemplo.com');
      await app.page.click('#form-forgot button[type=submit]');
      await app.page.waitForFunction(() => document.getElementById('msg-forgot').textContent === 'Se o e-mail existir em nossa base, um link de redefinição será enviado.', null, { timeout: 5000 });
      check((await app.page.inputValue('#forgot-email')) === '', '"esqueci minha senha" limpa o formulário depois do sucesso');
      const errs = realErrors(app);
      check(errs.length === 0, 'sem erros de JavaScript ("esqueci minha senha")' + (errs.length ? ': ' + errs.join(' | ') : ''));
    } finally { await app.close(); }
  }
  {
    const app = await startApp({
      role: 'member',
      workerHandlers: { apiValidateResetToken: () => ({ success: false, message: 'Este link é inválido, já foi usado ou expirou.' }) },
    });
    try {
      await app.page.goto(app.baseUrl + '?mode=reset&token=expirado123');
      await app.page.waitForSelector('#screen-reset:not(.hidden)');
      await app.page.waitForFunction(() => document.getElementById('msg-reset').textContent === 'Este link é inválido, já foi usado ou expirou.', null, { timeout: 5000 });
      check(await app.page.isDisabled('#reset-password'), 'link de redefinição inválido/expirado desabilita o formulário');
      const errs = realErrors(app);
      check(errs.length === 0, 'sem erros de JavaScript (link de redefinição inválido)' + (errs.length ? ': ' + errs.join(' | ') : ''));
    } finally { await app.close(); }
  }
  {
    const app = await startApp({
      role: 'member',
      workerHandlers: {
        apiValidateResetToken: () => ({ success: true, message: 'Link válido.' }),
        apiConfirmPasswordReset: () => ({ success: true, message: 'Senha redefinida com sucesso. Faça login novamente.' }),
      },
    });
    try {
      await app.page.goto(app.baseUrl + '?mode=reset&token=valido123');
      await app.page.waitForSelector('#screen-reset:not(.hidden)');
      await app.page.fill('#reset-password', 'novasenha123');
      await app.page.fill('#reset-password-confirm', 'outrasenha456');
      await app.page.click('#form-reset button[type=submit]');
      await app.page.waitForFunction(() => document.getElementById('msg-reset').textContent === 'As senhas não coincidem.', null, { timeout: 5000 });
      check(!app.calls.worker.some((c) => c.action === 'apiConfirmPasswordReset'), 'senhas diferentes não chegam a chamar a Worker (checado no navegador antes)');

      await app.page.fill('#reset-password-confirm', 'novasenha123');
      await app.page.click('#form-reset button[type=submit]');
      await app.page.waitForFunction(() => document.getElementById('msg-reset').textContent === 'Senha redefinida com sucesso. Faça login novamente.', null, { timeout: 5000 });
      await app.page.waitForSelector('#screen-welcome:not(.hidden)', { timeout: 3000 });
      check(true, 'depois de redefinir a senha com sucesso, a pessoa volta para a tela de login');
      const errs = realErrors(app);
      check(errs.length === 0, 'sem erros de JavaScript (redefinição de senha)' + (errs.length ? ': ' + errs.join(' | ') : ''));
    } finally { await app.close(); }
  }
  {
    const app = await startApp({
      role: 'member',
      workerHandlers: { apiConfirmEmail: () => ({ success: true, message: 'E-mail confirmado com sucesso. Você já pode entrar.' }) },
    });
    try {
      await app.page.goto(app.baseUrl + '?mode=confirm&token=abc123');
      await app.page.waitForSelector('#screen-welcome:not(.hidden)');
      await app.page.waitForFunction(() => document.getElementById('msg-login').textContent === 'E-mail confirmado com sucesso. Você já pode entrar.', null, { timeout: 5000 });
      check(true, 'confirmação de e-mail pelo link mostra a mensagem de sucesso na tela de login');
      const errs = realErrors(app);
      check(errs.length === 0, 'sem erros de JavaScript (confirmação de e-mail)' + (errs.length ? ': ' + errs.join(' | ') : ''));
    } finally { await app.close(); }
  }
}

// ===========================================================================
// 3. Papel visitante — o que deve ficar escondido/limitado
// ===========================================================================
async function visitorScenario() {
  const app = await startApp({ role: 'visitor' });
  try {
    await app.login();
    check(!(await app.page.locator('[data-panel="panel-tasks"]').isVisible()), 'visitante não vê "Tarefas" na navegação');
    check(!(await app.page.locator('[data-panel="panel-orgchart"]').isVisible()), 'visitante não vê "Equipe" na navegação');
    check(!(await app.page.locator('[data-panel="panel-messages"]').isVisible()), 'visitante não vê "Mensagens" na navegação');
    check(!(await app.page.locator('#btn-enter-admin-mode').isVisible()), 'visitante não vê a entrada do modo admin');

    await app.showPanel('panel-proposals');
    check((await app.page.textContent('#voting-status')) === 'Somente membros e administradores podem votar.', 'visitante recebe aviso claro em vez da lista de votação');

    await app.showPanel('panel-profile');
    await app.page.waitForSelector('#profile-metrics .stat-card');
    check((await app.page.locator('#profile-metrics .stat-card').count()) === 3, 'visitante vê só as 3 métricas relevantes no perfil');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (visitante)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 4. Perfil, avatar, preferências e feedback
// ===========================================================================
async function profileScenario() {
  const profile = { fullName: 'Ana Teste', username: 'ana', email: 'ana@exemplo.com', phone: '11999990000', education: 'Farmácia', avatarUrl: null, linkedinUrl: null, instagramHandle: null, interests: 'Farmacologia clínica' };
  const preferences = { theme: 'light', emailNotifications: true };
  let updateAttempt = 0;

  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetMyProfile: () => ({ success: true, profile, preferences }),
      apiUpdateMyProfile: (args) => {
        updateAttempt++;
        if (updateAttempt === 1) return { success: false, message: 'Este nome de usuário já está em uso.' };
        Object.assign(profile, args[1]);
        return { success: true, message: 'Perfil atualizado com sucesso.' };
      },
      apiUpdateMyAvatar: () => ({ success: true, message: 'Avatar atualizado.', avatarUrl: 'https://pub-f449f2cc117b4cc3a34c374218ac2e99.r2.dev/avatars/ana.png' }),
      apiUpdateMyPreferences: (args) => { Object.assign(preferences, args[1]); return { success: true, message: 'Preferências atualizadas.' }; },
      apiSubmitFeedback: () => ({ success: true, message: 'Obrigado! Seu feedback foi enviado.' }),
    },
  });

  try {
    await app.login();
    await app.showPanel('panel-profile');
    await app.page.waitForFunction(() => document.getElementById('profile-username').value === 'ana');
    check((await app.page.inputValue('#profile-phone')) === '11999990000', 'campos do perfil são preenchidos a partir de apiGetMyProfile');

    await app.page.setInputFiles('#profile-avatar-input', { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024, 1) });
    check((await app.page.textContent('#msg-profile-avatar')) === 'Imagem muito grande (máximo 2MB).', 'avatar grande demais no perfil é recusado no navegador');
    check(!app.calls.worker.some((c) => c.action === 'apiUpdateMyAvatar'), 'nenhuma chamada à Worker para o avatar recusado');

    await app.page.setInputFiles('#profile-avatar-input', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) });
    await app.page.waitForFunction(() => document.getElementById('msg-profile-avatar').textContent === 'Avatar atualizado.', null, { timeout: 5000 });
    const avatarSrc = await app.page.getAttribute('#profile-avatar-preview', 'src');
    check(!!avatarSrc && avatarSrc.indexOf('avatars/ana.png') !== -1, 'avatar atualizado mostra a imagem devolvida pela Worker');

    await app.page.fill('#profile-username', 'ana');
    await app.page.click('#form-profile button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-profile').textContent === 'Este nome de usuário já está em uso.', null, { timeout: 5000 });
    check(true, 'erro de validação do servidor (username em uso) aparece no perfil');

    await app.page.fill('#profile-phone', '11988887777');
    await app.page.click('#form-profile button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-profile').textContent === 'Perfil atualizado com sucesso.', null, { timeout: 5000 });
    check(profile.phone === '11988887777', 'atualização de perfil bem-sucedida chega à Worker com os campos certos');

    await app.page.uncheck('#pref-email-notif');
    await app.page.click('#form-preferences button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-preferences').textContent === 'Preferências atualizadas.', null, { timeout: 5000 });
    check(preferences.emailNotifications === false, 'preferência de notificação por e-mail é enviada corretamente');

    await app.page.fill('#feedback-message', 'Sugestão de melhoria enviada via teste E2E.');
    await app.page.click('#form-feedback button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-feedback').textContent === 'Obrigado! Seu feedback foi enviado.', null, { timeout: 5000 });
    check(true, 'envio de feedback funciona');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (perfil)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 5. Eventos
// ===========================================================================
async function eventsScenario() {
  const E1 = 'e1111111-1111-4111-8111-111111111111';
  const E2 = 'e2222222-2222-4222-8222-222222222222';
  const E3 = 'e3333333-3333-4333-8333-333333333333';
  let registered = false;

  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiListEvents: () => ({
        success: true,
        events: [
          { id: E1, title: 'Simpósio Aberto', description: 'Evento com vagas.', eventDate: '2026-10-10T18:00:00Z', visibility: 'authenticated', capacity: 10, status: 'published', imageUrl: null, location: 'Auditório 1', registeredCount: 3, spotsLeft: 7, isRegistered: registered },
          { id: E2, title: 'Encontro Lotado', description: 'Sem vagas.', eventDate: '2026-10-12T18:00:00Z', visibility: 'authenticated', capacity: 5, status: 'published', imageUrl: null, location: null, registeredCount: 5, spotsLeft: 0, isRegistered: false },
          { id: E3, title: 'Reunião de Diretoria', description: 'Só membros.', eventDate: '2026-10-15T18:00:00Z', visibility: 'members', capacity: null, status: 'in_progress', imageUrl: null, location: null, registeredCount: 2, spotsLeft: null, isRegistered: false },
        ],
      }),
      apiListRecentCompletedEvents: () => ({ success: true, events: [{ id: 'h1', title: 'Evento Passado', description: 'Já ocorreu.', eventDate: '2026-08-01T18:00:00Z', imageUrl: null, location: 'Sala 2' }] }),
      apiRegisterForEvent: (args) => {
        const id = args[1];
        if (id === E1) { registered = true; return { success: true, message: 'Inscrição confirmada.' }; }
        return { success: false, message: 'Este evento é exclusivo para membros.' };
      },
    },
  });
  try {
    await app.login();
    await app.showPanel('panel-events');
    await app.page.waitForSelector('#events-list .list-item');
    check((await app.page.locator('#events-list .list-item').count()) === 3, 'lista de eventos renderizada a partir de apiListEvents (3 itens)');
    check((await app.page.locator('#events-history-list .list-item').count()) === 1, 'histórico de eventos concluídos renderizado');

    const fullMeta = await app.page.locator('#events-list .list-item').nth(1).textContent();
    check(/Sem vagas disponíveis/.test(fullMeta), 'evento lotado não mostra botão de inscrição, só o aviso de vagas esgotadas');

    await app.page.locator('#events-list .list-item').nth(0).locator('button:has-text("Inscrever-se")').click();
    await app.page.waitForFunction(() => document.getElementById('events-status').textContent === 'Inscrição confirmada.', null, { timeout: 5000 });
    check((await app.page.locator('#events-list .list-item').nth(0).locator('.badge', { hasText: 'Inscrição confirmada' }).count()) === 1, 'inscrição bem-sucedida recarrega a lista com o badge de confirmação');

    await app.page.locator('#events-list .list-item').nth(2).locator('button:has-text("Inscrever-se")').click();
    await app.page.waitForFunction(() => document.getElementById('events-status').textContent === 'Este evento é exclusivo para membros.', null, { timeout: 5000 });
    check(true, 'erro de regra de negócio devolvido pela Worker (evento exclusivo) aparece como mensagem clara');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (eventos)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 6. Propostas e votação (membro)
// ===========================================================================
async function proposalsScenario() {
  const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  const myProposals = [];
  const votedIds = {};
  let lastVote = null;

  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiSubmitProposal: (args) => {
        const input = args[1];
        myProposals.push({ id: 'new-1', title: input.title, description: input.description, status: 'submitted', created_at: new Date().toISOString() });
        return { success: true, message: 'Proposta enviada para análise.', proposalId: 'new-1' };
      },
      apiListMyProposals: () => ({ success: true, proposals: myProposals }),
      apiListOpenProposalsForVoting: () => ({
        success: true,
        proposals: [{ id: P2, title: 'Mudar local da sede', description: 'Proposta em votação.', votingOpensAt: '2026-09-20T00:00:00Z', votingClosesAt: '2026-10-01T00:00:00Z', alreadyVoted: !!votedIds[P2] }],
      }),
      apiCastVote: (args) => {
        votedIds[args[1]] = true;
        lastVote = { id: args[1], choice: args[2], complement: args[3] };
        return { success: true, message: 'Voto registrado com sucesso.' };
      },
    },
  });

  try {
    await app.login();
    await app.showPanel('panel-proposals');
    await app.page.fill('#proposal-title', 'Trazer palestrante externo');
    await app.page.fill('#proposal-description', 'Descrição detalhada da proposta enviada em teste E2E.');
    await app.page.click('#form-proposal button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-proposal').textContent === 'Proposta enviada para análise.', null, { timeout: 5000 });
    check((await app.page.locator('#my-proposals-list .list-item').count()) === 1, 'proposta enviada aparece em "Minhas propostas"');

    await app.page.waitForSelector('#voting-list .list-item');
    await app.page.click('#voting-list .list-item button:has-text("Comentar")');
    await app.page.fill('#vote-complement-text', 'Concordo com ressalvas sobre o orçamento.');
    await app.page.click('#form-vote-complement button[type=submit]');
    await app.page.waitForFunction(() => { const b = document.querySelector('#voting-list .badge'); return b && b.textContent === 'Voto registrado'; }, null, { timeout: 5000 });
    check(!!lastVote && lastVote.choice === 'complement' && lastVote.complement === 'Concordo com ressalvas sobre o orçamento.', 'voto com comentário chama apiCastVote com choice="complement" e o texto certo');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (propostas — membro)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 7. Tarefas (membro)
// ===========================================================================
async function tasksScenario() {
  const T1 = 'ta111111-1111-4111-8111-111111111111';
  let signedUp = false;
  let completed = false;
  const comments = [];

  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiListTasks: () => ({ success: true, tasks: [{ id: T1, title: 'Organizar cadeiras do auditório', description: 'Ajudar a montar o espaço.', dueDate: '2026-10-05T12:00:00Z', alreadySignedUp: signedUp, completed, signupCount: signedUp ? 1 : 0 }] }),
      apiSignupForTask: () => { signedUp = true; return { success: true, message: 'Adesão confirmada.' }; },
      apiMarkTaskComplete: () => { completed = true; return { success: true, message: 'Tarefa marcada como concluída.' }; },
      apiListTaskComments: () => ({ success: true, comments }),
      apiSubmitTaskComment: (args) => { comments.push({ id: comments.length + 1, message: args[2], createdAt: new Date().toISOString(), authorName: 'Ana Teste' }); return { success: true, message: 'Comentário enviado.' }; },
    },
  });

  try {
    await app.login();
    await app.showPanel('panel-tasks');
    await app.page.waitForSelector('#tasks-list .list-item');
    await app.page.click('#tasks-list .list-item button:has-text("Aderir")');
    await app.page.waitForFunction(() => document.getElementById('tasks-status').textContent === 'Adesão confirmada.', null, { timeout: 5000 });
    check((await app.page.locator('#tasks-list .badge', { hasText: 'Você aderiu' }).count()) === 1, 'aderir a uma tarefa atualiza a lista');

    await app.page.click('#tasks-list .list-item button:has-text("Marcar como concluída")');
    await app.page.waitForFunction(() => document.getElementById('tasks-status').textContent === 'Tarefa marcada como concluída.', null, { timeout: 5000 });
    check((await app.page.locator('#tasks-list .badge', { hasText: 'Concluída' }).count()) === 1, 'marcar tarefa como concluída atualiza a lista');

    await app.page.click('#tasks-list .list-item button:has-text("Comentários")');
    await app.page.waitForSelector('#tasks-list .task-comment-form textarea');
    await app.page.fill('#tasks-list .task-comment-form textarea', 'Consegui ajudar às 14h.');
    await app.page.click('#tasks-list .task-comment-form button:has-text("Enviar")');
    await app.page.waitForFunction(() => document.querySelectorAll('#tasks-list .task-comment').length === 1, null, { timeout: 5000 });
    check((await app.page.textContent('#tasks-list .task-comment p')) === 'Consegui ajudar às 14h.', 'comentário enviado aparece na lista de comentários da tarefa');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (tarefas)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 8. Organograma e conexões entre membros
// ===========================================================================
async function orgChartConnectionsScenario() {
  const BETO = 'bbbbbbb1-1111-4111-8111-111111111111';
  const CARLA = 'ccccccc1-1111-4111-8111-111111111111';
  let connections = [];
  let incoming = [{ connectionId: 'req-1', createdAt: '2026-09-20T00:00:00Z', requesterId: CARLA, fullName: 'Carla Diniz', username: 'carla', avatarUrl: null }];

  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetOrgChart: () => ({
        success: true,
        chart: {
          coordenacaoGeral: [{ id: 'cg1', fullName: 'Cid Coordenador', username: 'cid', avatarUrl: null }],
          presidente: [{ id: 'p1', fullName: 'Paula Presidente', username: 'paula', avatarUrl: null }],
          vicePresidente: [],
          coordenadores: [],
          directorates: {
            marketing: { diretor: { id: BETO, fullName: 'Beto Marketing', username: 'beto', avatarUrl: null }, members: [{ id: 'm1', fullName: '<b>Hostil</b> Membro', username: 'hostil', avatarUrl: null }] },
            cientifico: { diretor: null, members: [] },
            administrativo: { diretor: null, members: [] },
            financeiro: { diretor: null, members: [] },
          },
          membersWithoutDirectorate: [],
        },
      }),
      apiGetMemberProfile: (args) => {
        const username = args[1];
        if (username === 'beto') {
          return { success: true, profile: { id: BETO, fullName: 'Beto Marketing', username: 'beto', avatarUrl: null, education: 'Farmácia', linkedinUrl: null, instagramHandle: null, interests: null, role: 'member', memberSince: '2025-01-01', leaguePosition: 'diretor', directorate: 'marketing' }, relationship: { isSelf: false, isConnection: false, isBlockedEitherWay: false } };
        }
        return { success: true, profile: { id: 'hostil', fullName: '<b>Hostil</b> Membro', username: 'hostil', avatarUrl: null, education: null, linkedinUrl: null, instagramHandle: null, interests: null, role: 'member', memberSince: '2025-01-01', leaguePosition: null, directorate: 'marketing' }, relationship: { isSelf: false, isConnection: true, isBlockedEitherWay: false } };
      },
      apiSendConnectionRequest: () => ({ success: true, message: 'Pedido de conexão enviado.' }),
      apiListIncomingConnectionRequests: () => ({ success: true, requests: incoming }),
      apiRespondConnectionRequest: (args) => {
        const connId = args[1];
        const decision = args[2];
        incoming = incoming.filter((r) => r.connectionId !== connId);
        if (decision === 'accept') connections.push({ connectionId: 'conn-1', peerId: CARLA, fullName: 'Carla Diniz', username: 'carla', avatarUrl: null });
        return { success: true, message: decision === 'accept' ? 'Conexão aceita.' : 'Pedido de conexão recusado.' };
      },
      apiListMyConnections: () => ({ success: true, connections }),
      apiRemoveConnection: (args) => { connections = connections.filter((c) => c.connectionId !== args[1]); return { success: true, message: 'Conexão removida.' }; },
      apiReportProfile: () => ({ success: true, message: 'Denúncia enviada para análise da administração.' }),
    },
  });

  try {
    await app.login();
    await app.showPanel('panel-orgchart');
    await app.page.waitForSelector('#orgchart-tree .orgchart-card');
    check((await app.page.locator('.orgchart-name', { hasText: '<b>Hostil</b> Membro' }).count()) === 1, 'organograma renderiza nome hostil como texto puro (sem XSS)');
    check((await app.page.locator('#orgchart-tree b').count()) === 0, 'nenhum HTML é injetado a partir do nome do card');

    await app.page.locator('.orgchart-card', { hasText: 'Beto Marketing' }).click();
    await app.page.waitForSelector('#modal-member-profile:not(.hidden)');
    await app.page.waitForFunction(() => document.getElementById('modal-member-profile-title').textContent === 'Beto Marketing', null, { timeout: 5000 });
    await app.page.click('#member-profile-actions button:has-text("Adicionar")');
    await app.page.waitForFunction(() => document.getElementById('msg-member-profile').textContent === 'Pedido de conexão enviado.', null, { timeout: 5000 });
    check(true, 'enviar pedido de conexão a partir do perfil do membro funciona');
    await app.page.click('#modal-member-profile-close');

    await app.page.locator('.orgchart-card', { hasText: 'Hostil' }).click();
    await app.page.waitForSelector('#member-profile-actions button:has-text("Denunciar")');
    await app.page.click('#member-profile-actions button:has-text("Denunciar")');
    await app.page.selectOption('#member-profile-actions select', 'inappropriate_content');
    await app.page.fill('#member-profile-actions textarea', 'Comportamento inadequado no evento.');
    await app.page.click('#member-profile-actions button:has-text("Enviar denúncia")');
    await app.page.waitForFunction(() => document.getElementById('msg-member-profile').textContent === 'Denúncia enviada para análise da administração.', null, { timeout: 5000 });
    check(true, 'denunciar o perfil de outro membro funciona');
    await app.page.click('#modal-member-profile-close');

    await app.page.fill('#connection-request-value', 'novacontato');
    await app.page.click('#form-connection-request button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-connection-request').textContent === 'Pedido de conexão enviado.', null, { timeout: 5000 });
    check(true, 'formulário de "Adicionar" por nome de usuário funciona');

    await app.page.waitForSelector('#connection-requests-list .list-item');
    await app.page.click('#connection-requests-list .list-item button:has-text("Adicionar de volta")');
    await app.page.waitForFunction(() => document.querySelectorAll('#connection-requests-list .list-item').length === 0, null, { timeout: 5000 });
    check(true, 'aceitar pedido de conexão remove da lista de pendentes');
    await app.page.waitForSelector('#my-connections-list .list-item');
    check((await app.page.locator('#my-connections-list .list-item').count()) === 1, 'conexão aceita aparece em "Meus adicionados"');

    await app.page.click('#my-connections-list .list-item button:has-text("Remover")');
    await app.page.waitForFunction(() => document.querySelectorAll('#my-connections-list .list-item').length === 0, null, { timeout: 5000 });
    check(true, 'remover conexão funciona');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (organograma e conexões)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 9. Mensageria E2EE — criptografia real (não simulada) nos dois sentidos
// ===========================================================================
async function messagingScenario() {
  const MsgCryptoNode = await loadMsgCryptoInNode();
  const MY_PROFILE_ID = '10101010-1010-4010-8010-101010101010';
  const PEER_ID = '20202020-2020-4020-8020-202020202020';
  const CONV_ID = '30303030-3030-4030-8030-303030303030';
  const MY_KEY_VERSION = 1;
  const PEER_KEY_VERSION = 1;

  const peerPair = await MsgCryptoNode.generateIdentityKeyPair();
  let capturedMyPub = null;
  let incomingServed = false;

  async function buildIncomingPeerMessage(plaintext) {
    const conversationKey = await MsgCryptoNode.deriveConversationKey({
      privateKey: peerPair.privateKey,
      peerPublicKeyBase64url: capturedMyPub,
      conversationId: CONV_ID,
      selfId: PEER_ID, selfKeyVersion: PEER_KEY_VERSION,
      peerId: MY_PROFILE_ID, peerKeyVersion: MY_KEY_VERSION,
    });
    const clientMessageId = crypto.randomUUID();
    const encrypted = await MsgCryptoNode.encryptMessage({
      conversationKey,
      plaintext,
      aad: { conversationId: CONV_ID, senderId: PEER_ID, senderKeyVersion: PEER_KEY_VERSION, recipientKeyVersion: MY_KEY_VERSION, clientMessageId },
    });
    return { id: 900, senderId: PEER_ID, clientMessageId, cryptoVersion: 1, senderKeyVersion: PEER_KEY_VERSION, recipientKeyVersion: MY_KEY_VERSION, iv: encrypted.iv, ciphertext: encrypted.ciphertext, createdAt: new Date().toISOString() };
  }

  const app = await startApp({
    role: 'member',
    profile: { fullName: 'Ana Teste', username: 'ana' },
    workerHandlers: {
      apiGetMyMessagingKey: () => ({ success: true, hasKey: false, profileId: MY_PROFILE_ID }),
      apiPublishMessagingKey: (args) => { capturedMyPub = args[1].publicKey; return { success: true, message: 'Chave de mensageria publicada.', keyVersion: MY_KEY_VERSION }; },
      apiListConversations: () => ({
        success: true,
        conversations: [{ conversationId: CONV_ID, lastMessageAt: '2026-09-25T12:00:00Z', peer: { id: PEER_ID, fullName: 'Beto Peer', username: 'beto', avatarUrl: null, status: 'active' }, unreadCount: 1 }],
      }),
      apiOpenConversation: () => ({ success: true, conversationId: CONV_ID }),
      apiGetPeerMessagingKeys: () => ({ success: true, keys: [{ keyVersion: PEER_KEY_VERSION, algorithm: 'X25519', publicKey: peerPair.publicKeyBase64url, active: true }] }),
      apiListMessages: async () => {
        if (incomingServed) return { success: true, messages: [] };
        incomingServed = true;
        const msg = await buildIncomingPeerMessage('Oi! Mensagem cifrada do Beto.');
        return { success: true, messages: [msg] };
      },
      apiMarkConversationRead: () => ({ success: true }),
      apiMessagingSync: () => ({ success: true, unreadMessages: 1 }),
      apiSendMessage: () => ({ success: true, messageId: 901, createdAt: new Date().toISOString() }),
      apiHideMessageForMe: () => ({ success: true }),
      apiDeleteMessage: () => ({ success: true }),
      apiClearConversation: () => ({ success: true, message: 'Conversa limpa.' }),
    },
  });

  try {
    await app.login();
    await app.page.waitForFunction(() => { const b = document.getElementById('nav-badge-messages'); return b && !b.classList.contains('hidden'); }, null, { timeout: 5000 }).catch(() => {});
    check((await app.page.textContent('#nav-badge-messages')) === '1', 'contador de mensagens não lidas aparece sozinho, sem abrir o painel (apiMessagingSync)');

    await app.showPanel('panel-messages');
    await app.page.waitForSelector('#messaging-main-card:not(.hidden)', { timeout: 8000 });
    check((await app.page.locator('#messaging-conversations-list .chat-list-item').count()) === 1, 'lista de conversas renderizada a partir de apiListConversations');

    await app.page.click('#messaging-conversations-list .chat-list-item');
    await app.page.waitForSelector('#messaging-thread-view:not(.hidden)');
    await app.page.waitForFunction(() => document.querySelectorAll('#messaging-thread-list .chat-bubble-text').length >= 1, null, { timeout: 8000 });

    const tofuText = await app.page.textContent('#messaging-tofu-banner');
    check(/Primeira conversa com Beto Peer/.test(tofuText || ''), 'aviso de primeiro contato (TOFU) é exibido');

    const receivedText = await app.page.textContent('#messaging-thread-list .chat-row-theirs .chat-bubble-text');
    check(receivedText === 'Oi! Mensagem cifrada do Beto.', 'mensagem recebida (cifrada com a chave real do contato simulado) é decifrada corretamente no navegador');

    await app.page.fill('#messaging-send-text', 'Oi Beto, tudo bem?');
    await app.page.click('#btn-messaging-send');
    await app.page.waitForFunction(() => document.querySelectorAll('#messaging-thread-list .chat-row-mine .chat-bubble-text').length >= 1, null, { timeout: 8000 });
    const sentText = await app.page.textContent('#messaging-thread-list .chat-row-mine .chat-bubble-text');
    check(sentText === 'Oi Beto, tudo bem?', 'mensagem enviada é cifrada, mostrada otimisticamente e decifra de volta certo (ida e volta real)');

    const sendCall = app.calls.worker.filter((c) => c.action === 'apiSendMessage').pop();
    const payload = sendCall.args[2];
    check(/^[A-Za-z0-9_-]{16}$/.test(payload.iv) && /^[A-Za-z0-9_-]+$/.test(payload.ciphertext) && payload.senderKeyVersion === MY_KEY_VERSION && payload.recipientKeyVersion === PEER_KEY_VERSION,
      'apiSendMessage recebe iv/ciphertext no formato exigido pelo servidor (base64url, versões de chave certas)');
    check(JSON.stringify(sendCall).indexOf('tudo bem') === -1, 'o texto claro da mensagem nunca é enviado à Worker — só o conteúdo cifrado');

    const theirsRow = app.page.locator('#messaging-thread-list .chat-row-theirs').first();
    await theirsRow.hover();
    await theirsRow.locator('.chat-bubble-menu-btn').click();
    await theirsRow.locator('.chat-bubble-actions button').filter({ hasText: 'Apagar para mim' }).click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => document.querySelectorAll('#messaging-thread-list .chat-row-theirs').length === 0, null, { timeout: 5000 });
    check(true, '"Apagar para mim" remove a mensagem só da própria visão');

    const mineRow = app.page.locator('#messaging-thread-list .chat-row-mine').first();
    await mineRow.hover();
    await mineRow.locator('.chat-bubble-menu-btn').click();
    await mineRow.locator('.chat-bubble-actions button').filter({ hasText: 'Apagar para todos' }).click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => /mensagem apagada/.test(document.querySelector('#messaging-thread-list .chat-row-mine').textContent || ''), null, { timeout: 5000 });
    check(true, '"Apagar para todos" mostra o texto substituto no lugar do conteúdo');

    await app.page.click('#btn-messaging-clear');
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => document.getElementById('messaging-thread-list').children.length === 0, null, { timeout: 5000 });
    check((await app.page.textContent('#messaging-thread-status')) === 'Conversa limpa.', 'limpar conversa esvazia o histórico exibido');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (mensageria E2EE)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 10. Painéis administrativos
// ===========================================================================
async function adminScenario() {
  const U1 = 'u1111111-1111-4111-8111-111111111111';
  const U2 = 'u2222222-2222-4222-8222-222222222222';
  const EV1 = 'ev111111-1111-4111-8111-111111111111';
  const PR1 = 'pr111111-1111-4111-8111-111111111111';
  const TK1 = 'tk111111-1111-4111-8111-111111111111';
  const RP1 = 'rp111111-1111-4111-8111-111111111111';

  const users = [
    { id: U1, fullName: 'Carlos Ativo', email: 'carlos@exemplo.com', role: 'member', status: 'active', emailConfirmed: true, createdAt: '2026-01-01T00:00:00Z', leaguePosition: null, directorate: null },
    { id: U2, fullName: 'Bruna Nova', email: 'bruna@exemplo.com', role: 'member', status: 'active', emailConfirmed: false, createdAt: '2026-02-01T00:00:00Z', leaguePosition: null, directorate: null },
  ];
  const events = [{ id: EV1, title: 'Workshop de Farmácia Clínica', status: 'published', visibility: 'authenticated', event_date: '2026-11-01T18:00:00Z', capacity: 40, image_url: null, location: 'Auditório', registered_count: 5 }];
  const proposals = [{ id: PR1, title: 'Comprar novos equipamentos', description: 'Proposta de compra.', status: 'submitted', created_at: '2026-09-01T00:00:00Z', author_name: 'Ana Teste' }];
  const tasks = [{ id: TK1, title: 'Organizar biblioteca', status: 'published', due_date: '2026-10-01T00:00:00Z', signup_count: 2 }];
  const reports = [{ id: RP1, category: 'spam', details: 'Enviou spam no chat.', evidenceExcerpt: null, status: 'open', createdAt: '2026-09-10T00:00:00Z', resolvedAt: null, resolutionNote: null, reporterName: 'Ana Teste', reporterUsername: 'ana', reportedName: 'Carlos Ativo', reportedUsername: 'carlos' }];

  const app = await startApp({
    role: 'admin',
    workerHandlers: {
      apiAdminDashboard: () => ({ success: true, indicators: { active_members: 12, active_admins: 2, banned_accounts: 1, published_events: 3, proposals_pending: 1, proposals_voting: 1, tasks_open: 2 } }),
      apiAdminListUsers: (args) => {
        const input = args[1] || {};
        const filtered = input.search ? users.filter((u) => u.fullName.toLowerCase().indexOf(String(input.search).toLowerCase()) !== -1) : users;
        return { success: true, users: filtered, page: input.page || 1, pageSize: 25, total: filtered.length };
      },
      apiAdminChangeUserRole: (args) => { const u = users.find((x) => x.id === args[1]); if (u) u.role = args[2]; return { success: true, message: 'Papel atualizado com sucesso.' }; },
      apiAdminBanUser: (args) => { const u = users.find((x) => x.id === args[1]); if (u) u.status = 'banned'; return { success: true, message: 'Conta banida. Todas as sessões ativas foram revogadas.' }; },
      apiAdminUnbanUser: (args) => { const u = users.find((x) => x.id === args[1]); if (u) u.status = 'active'; return { success: true, message: 'Conta reativada.' }; },
      apiAdminSetLeaguePosition: (args) => { const u = users.find((x) => x.id === args[1]); if (u) { u.leaguePosition = args[2].leaguePosition; u.directorate = args[2].directorate; } return { success: true, message: 'Cargo e diretoria atualizados.' }; },
      apiAdminListAllEvents: () => ({ success: true, events }),
      apiAdminCreateEvent: (args) => {
        events.push({ id: 'ev-novo', status: 'draft', registered_count: 0, title: args[1].title, event_date: args[1].eventDate, visibility: args[1].visibility, capacity: args[1].capacity, image_url: null, location: args[1].location });
        return { success: true, message: 'Evento criado como rascunho.', eventId: 'ev-novo' };
      },
      apiAdminUpdateEventStatus: (args) => { const e = events.find((x) => x.id === args[1]); if (e) e.status = args[2]; return { success: true, message: 'Status do evento atualizado.' }; },
      apiAdminUploadEventImage: (args) => {
        const e = events.find((x) => x.id === args[1]);
        if (e) e.image_url = 'https://pub-f449f2cc117b4cc3a34c374218ac2e99.r2.dev/events/ev1.png';
        return { success: true, message: 'Imagem do evento atualizada.', imageUrl: 'https://pub-f449f2cc117b4cc3a34c374218ac2e99.r2.dev/events/ev1.png' };
      },
      apiAdminListProposalsForReview: () => ({ success: true, proposals }),
      apiAdminTransitionProposal: (args) => { const p = proposals.find((x) => x.id === args[1]); if (p) p.status = args[2]; return { success: true, message: 'Status da proposta atualizado.' }; },
      apiGetProposalResults: () => ({ success: true, proposal: { id: PR1, title: 'x', description: 'y', status: 'voting_closed' }, results: { yes: 8, no: 2, complement: 1 } }),
      apiAdminListAllTasks: () => ({ success: true, tasks }),
      apiAdminCreateTask: (args) => { tasks.push({ id: 'tk-novo', title: args[1].title, status: 'draft', due_date: args[1].dueDate, signup_count: 0 }); return { success: true, message: 'Tarefa criada como rascunho.', taskId: 'tk-novo' }; },
      apiAdminUpdateTaskStatus: (args) => { const t = tasks.find((x) => x.id === args[1]); if (t) t.status = args[2]; return { success: true, message: 'Status da tarefa atualizado.' }; },
      apiAdminListFeedback: () => ({ success: true, feedback: [{ message: 'Adorei o novo módulo de laboratório!', author_name: 'Carlos Ativo', created_at: '2026-09-15T00:00:00Z' }], page: 1, pageSize: 25, total: 1 }),
      apiAdminListAuditLogs: (args) => ({ success: true, logs: [{ id: 1, action: 'LOGIN', result: 'success', actor_name: 'Ana Teste', created_at: '2026-09-20T00:00:00Z' }], page: (args[1] && args[1].page) || 1, pageSize: 25, total: 1 }),
      apiAdminListErrorLogs: () => ({ success: true, logs: [{ id: 1, code: 'UNEXPECTED_ERROR', message: 'Falha simulada.', created_at: '2026-09-20T00:00:00Z' }], page: 1, pageSize: 25, total: 1 }),
      apiAdminListReports: (args) => {
        const input = args[1] || {};
        const filtered = input.status ? reports.filter((r) => r.status === input.status) : reports;
        return { success: true, reports: filtered, page: 1, pageSize: 25, total: filtered.length };
      },
      apiAdminResolveReport: (args) => { const r = reports.find((x) => x.id === args[1]); if (r) { r.status = args[2].status; r.resolutionNote = args[2].resolutionNote; } return { success: true, message: 'Denúncia atualizada.' }; },
    },
  });

  try {
    await app.login();
    await app.page.click('#btn-enter-admin-mode');

    // ---- Painel ----
    await app.page.waitForSelector('#admin-dashboard-stats .stat-card');
    check((await app.page.locator('#admin-dashboard-stats .stat-card').count()) === 7, 'painel administrativo mostra os 7 indicadores');

    // ---- Usuários ----
    await app.showPanel('panel-admin-users');
    await app.page.waitForFunction(() => document.querySelectorAll('#admin-users-list .list-item').length === 2, null, { timeout: 5000 });

    await app.page.fill('#user-search-input', 'Bruna');
    await app.page.click('#form-user-search button[type=submit]');
    await app.page.waitForFunction(() => document.querySelectorAll('#admin-users-list .list-item').length === 1, null, { timeout: 5000 });
    check((await app.page.textContent('#admin-users-list .list-item h4')).indexOf('Bruna Nova') !== -1, 'busca de usuários filtra pelo nome');

    await app.page.fill('#user-search-input', '');
    await app.page.click('#form-user-search button[type=submit]');
    await app.page.waitForFunction(() => document.querySelectorAll('#admin-users-list .list-item').length === 2, null, { timeout: 5000 });

    const carlosItem = app.page.locator('#admin-users-list .list-item').first();
    await carlosItem.locator('select').nth(0).selectOption('admin');
    await carlosItem.locator('button:has-text("Alterar papel")').click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => document.querySelector('#admin-users-list .list-item select').value === 'admin', null, { timeout: 5000 });
    check(true, 'alterar papel de usuário atualiza a lista');

    await carlosItem.locator('button:has-text("Banir conta")').click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => !!document.querySelector('#admin-users-list .badge.banned'), null, { timeout: 5000 });
    check(true, 'banir conta atualiza o status na lista');

    await carlosItem.locator('button:has-text("Reativar conta")').click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => !document.querySelector('#admin-users-list .badge.banned'), null, { timeout: 5000 });
    check(true, 'reativar conta atualiza o status na lista');

    await carlosItem.locator('select').nth(1).selectOption('diretor');
    await carlosItem.locator('select').nth(2).selectOption('marketing');
    await carlosItem.locator('button:has-text("Atualizar cargo")').click();
    // A lista é recarregada assim que o cargo é salvo (loadAdminUsers), o que
    // troca o cargoFeedback antigo por um novo — por isso conferimos o
    // ESTADO FINAL depois do recarregamento (selects com o cargo persistido),
    // não a mensagem transitória, que pode já ter sido substituída.
    await app.page.waitForFunction(() => {
      const sels = document.querySelectorAll('#admin-users-list .list-item select');
      return sels.length >= 3 && sels[1].value === 'diretor' && sels[2].value === 'marketing';
    }, null, { timeout: 5000 });
    check(true, 'definir cargo/diretoria de um membro funciona (persiste após recarregar a lista)');

    // ---- Eventos ----
    await app.showPanel('panel-admin-events');
    await app.page.waitForSelector('#admin-events-list .list-item');
    await app.page.fill('#event-title', 'Curso de Toxicologia Avançada');
    await app.page.fill('#event-description', 'Descrição do novo evento criado via teste E2E.');
    await app.page.fill('#event-date', '2026-12-01T18:00');
    await app.page.selectOption('#event-visibility', 'members');
    await app.page.click('#form-admin-event button[type=submit]');
    await app.page.waitForFunction(() => document.getElementById('msg-admin-event').textContent === 'Evento criado como rascunho.', null, { timeout: 5000 });
    await app.page.waitForFunction(() => document.querySelectorAll('#admin-events-list .list-item').length === 2, null, { timeout: 5000 });
    check(true, 'criar evento pelo admin adiciona à lista');

    const firstEvent = app.page.locator('#admin-events-list .list-item').first();
    await firstEvent.locator('select').selectOption('in_progress');
    await firstEvent.locator('button:has-text("Atualizar status")').click();
    await app.page.waitForFunction(() => !!document.querySelector('#admin-events-list .badge.in-progress'), null, { timeout: 5000 });
    check(true, 'atualizar status do evento funciona');

    await firstEvent.locator('input[type=file]').setInputFiles({ name: 'capa.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
    // A mensagem de sucesso é setada ANTES do recarregamento da lista
    // (uploadAdminEventImage: setStatus(...) e só depois loadAdminEvents()),
    // então esperar pela imagem direto (sem depender do texto transitório,
    // que uma ação seguinte pode sobrescrever antes do Playwright reler o
    // DOM) é o sinal confiável de que o upload realmente refletiu na lista;
    // o timeout é maior porque envolve leitura de arquivo + 2 chamadas.
    await app.page.waitForSelector('#admin-events-list .event-image', { timeout: 10000 });
    check(true, 'upload de imagem do evento é refletido na lista');

    // ---- Propostas ----
    await app.showPanel('panel-admin-proposals');
    await app.page.waitForSelector('#admin-proposals-list .list-item');
    const propItem = app.page.locator('#admin-proposals-list .list-item').first();
    await propItem.locator('button:has-text("Aprovar")').click();
    await app.page.waitForFunction(() => { const b = document.querySelector('#admin-proposals-list .badge'); return b && b.textContent === 'Aprovada'; }, null, { timeout: 5000 });
    check(true, 'aprovar proposta atualiza o status');

    await propItem.locator('input[type=datetime-local]').nth(0).fill('2026-10-01T00:00');
    await propItem.locator('input[type=datetime-local]').nth(1).fill('2026-10-15T00:00');
    await propItem.locator('button:has-text("Abrir votação")').click();
    await app.page.waitForFunction(() => { const b = document.querySelector('#admin-proposals-list .badge'); return b && b.textContent === 'Votação aberta'; }, null, { timeout: 5000 });
    check(true, 'abrir votação da proposta funciona com as datas informadas');

    await propItem.locator('button:has-text("Encerrar votação")').click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => { const b = document.querySelector('#admin-proposals-list .badge'); return b && b.textContent === 'Votação encerrada'; }, null, { timeout: 5000 });
    check(true, 'encerrar votação funciona');

    await propItem.locator('button:has-text("Ver resultados")').click();
    await app.page.waitForFunction(() => /Sim: 8/.test((document.querySelector('#admin-proposals-list .list-item p.status-msg') || {}).textContent || ''), null, { timeout: 5000 });
    check(true, 'ver resultados exibe a apuração de votos');

    // ---- Tarefas ----
    await app.showPanel('panel-admin-tasks');
    await app.page.waitForSelector('#admin-tasks-list .list-item');
    await app.page.fill('#task-title', 'Ajudar na montagem do estande');
    await app.page.fill('#task-description', 'Tarefa criada via teste E2E administrativo.');
    await app.page.click('#form-admin-task button[type=submit]');
    await app.page.waitForFunction(() => document.querySelectorAll('#admin-tasks-list .list-item').length === 2, null, { timeout: 5000 });
    check(true, 'criar tarefa pelo admin adiciona à lista');

    const firstTask = app.page.locator('#admin-tasks-list .list-item').first();
    await firstTask.locator('select').selectOption('completed');
    await firstTask.locator('button:has-text("Atualizar status")').click();
    await app.page.waitForFunction(() => { const b = document.querySelector('#admin-tasks-list .badge'); return b && b.textContent === 'Concluída'; }, null, { timeout: 5000 });
    check(true, 'atualizar status da tarefa funciona');

    // ---- Feedback ----
    await app.showPanel('panel-admin-feedback');
    await app.page.waitForSelector('#admin-feedback-list .list-item');
    check((await app.page.textContent('#admin-feedback-list .list-item p')) === 'Adorei o novo módulo de laboratório!', 'feedback dos membros é listado para o admin');

    // ---- Auditoria e logs técnicos ----
    await app.showPanel('panel-admin-audit');
    await app.page.waitForSelector('#admin-audit-list .list-item');
    check((await app.page.locator('#admin-audit-list .list-item').count()) === 1, 'logs de auditoria são listados');
    await app.page.selectOption('#audit-filter-action', 'LOGIN');
    await app.page.selectOption('#audit-filter-result', 'success');
    await app.page.click('#form-audit-filter button[type=submit]');
    await app.page.waitForFunction(() => true);
    const auditCall = app.calls.worker.filter((c) => c.action === 'apiAdminListAuditLogs').pop();
    check(auditCall.args[1].action === 'LOGIN' && auditCall.args[1].result === 'success', 'filtro de auditoria envia os critérios certos à Worker');
    check((await app.page.locator('#admin-error-list .list-item').count()) === 1, 'logs técnicos (erros) são listados');

    // ---- Denúncias ----
    await app.showPanel('panel-admin-reports');
    await app.page.waitForSelector('#admin-reports-list .list-item');
    const reportItem = app.page.locator('#admin-reports-list .list-item').first();
    await reportItem.locator('select').selectOption('resolved');
    await reportItem.locator('input[type=text]').fill('Usuário advertido por e-mail.');
    await reportItem.locator('button:has-text("Atualizar")').click();
    await app.page.waitForFunction(() => { const b = document.querySelector('#admin-reports-list .badge'); return b && b.textContent === 'Resolvida'; }, null, { timeout: 5000 });
    check(true, 'resolver denúncia atualiza o status');

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (painéis administrativos)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

// ===========================================================================
// 11. Sem rolagem horizontal em 390 px nos painéis da própria plataforma
// (os módulos de "Aprender" já são cobertos a 360 px em fase2/fase4)
// ===========================================================================
async function mobileOverflowScenario() {
  const app = await startApp({ role: 'admin', viewport: { width: 390, height: 844 } });
  try {
    await app.login();
    const memberPanels = ['panel-home', 'panel-events', 'panel-proposals', 'panel-tasks', 'panel-orgchart', 'panel-messages', 'panel-profile'];
    for (const panelId of memberPanels) {
      await app.showPanel(panelId);
      await app.page.waitForTimeout(150);
      const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, 'painel "' + panelId + '" cabe em 390 px sem rolagem horizontal (overflow=' + overflow + ')');
    }

    await app.page.click('#btn-enter-admin-mode');
    const adminPanels = ['panel-admin-dashboard', 'panel-admin-users', 'panel-admin-events', 'panel-admin-proposals', 'panel-admin-tasks', 'panel-admin-feedback', 'panel-admin-audit', 'panel-admin-reports', 'panel-admin-ai'];
    for (const panelId of adminPanels) {
      await app.showPanel(panelId);
      await app.page.waitForTimeout(150);
      const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, 'painel admin "' + panelId + '" cabe em 390 px sem rolagem horizontal (overflow=' + overflow + ')');
    }

    const errs = realErrors(app);
    check(errs.length === 0, 'sem erros de JavaScript (checagem de rolagem em 390 px)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function qaFull() {
  await loginAndLogoutScenario();
  await workerErrorScenario();
  await registerScenario();
  await forgotResetConfirmScenario();
  await visitorScenario();
  await profileScenario();
  await eventsScenario();
  await proposalsScenario();
  await tasksScenario();
  await orgChartConnectionsScenario();
  await messagingScenario();
  await adminScenario();
  await mobileOverflowScenario();
};
