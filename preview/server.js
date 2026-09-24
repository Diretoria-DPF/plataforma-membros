/**
 * preview/server.js
 *
 * Servidor LOCAL de pré-visualização — NÃO é o backend real (esse é o
 * Apps Script + Neon, ver docs/DEPLOYMENT.md). Serve a MESMA interface
 * (src/ui/*.html) com um backend simulado em memória, para navegar e testar
 * os fluxos antes do deploy real ficar pronto (que depende de login manual
 * no Apps Script). Dados aqui somem quando o processo é reiniciado.
 *
 * Não faz parte do projeto Apps Script (fora de src/, não é enviado pelo
 * clasp) e não toca no Neon nem em nenhuma credencial real.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT, 'src', 'ui');
const PORT = process.env.PORT || 4173;

// ---------------------------------------------------------------------------
// "Banco de dados" em memória
// ---------------------------------------------------------------------------
const db = {
  profiles: [],
  preferences: {}, // profileId -> {theme, density, emailNotifications}
  sessions: {}, // token -> profileId
  events: [],
  eventRegistrations: [],
  proposals: [],
  votes: [],
  tasks: [],
  taskSignups: [],
  feedback: [],
};

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function seed() {
  const adminId = uid();
  db.profiles.push({
    id: adminId,
    fullName: 'Daniel Pires Francisco',
    email: 'dpires292@gmail.com',
    password: 'preview123456',
    phone: '11999990000',
    city: 'São Paulo',
    education: 'Ensino Superior',
    role: 'admin',
    status: 'active',
    emailConfirmedAt: nowIso(),
    createdAt: nowIso(),
  });
  db.preferences[adminId] = { theme: 'system', density: 'standard', emailNotifications: true };

  const memberId = uid();
  db.profiles.push({
    id: memberId,
    fullName: 'Maria Membro Exemplo',
    email: 'membro@exemplo.com',
    password: 'preview123456',
    phone: '11988887777',
    city: 'Rio de Janeiro',
    education: null,
    role: 'member',
    status: 'active',
    emailConfirmedAt: nowIso(),
    createdAt: nowIso(),
  });
  db.preferences[memberId] = { theme: 'system', density: 'standard', emailNotifications: true };

  const in7d = new Date(Date.now() + 7 * 86400000).toISOString();
  const in14d = new Date(Date.now() + 14 * 86400000).toISOString();
  db.events.push(
    { id: uid(), title: 'Assembleia geral trimestral', description: 'Discussão de pauta financeira e eleição de novos representantes.', status: 'published', visibility: 'public', eventDate: in7d, capacity: 50, createdBy: adminId },
    { id: uid(), title: 'Encontro exclusivo de membros', description: 'Reunião de planejamento restrita a membros ativos.', status: 'published', visibility: 'members', eventDate: in14d, capacity: 20, createdBy: adminId }
  );

  const proposalOpenId = uid();
  db.proposals.push(
    { id: proposalOpenId, title: 'Ampliar horário de atendimento', description: 'Proposta para estender o horário de atendimento aos sábados.', authorId: memberId, status: 'voting_open', votingOpensAt: new Date(Date.now() - 3600000).toISOString(), votingClosesAt: new Date(Date.now() + 3 * 86400000).toISOString(), createdAt: nowIso() },
    { id: uid(), title: 'Criar comissão de comunicação', description: 'Proposta para formar uma comissão dedicada à comunicação interna.', authorId: memberId, status: 'submitted', createdAt: nowIso() }
  );

  db.tasks.push({ id: uid(), title: 'Organizar lista de presença', description: 'Preparar a lista de presença para a assembleia geral.', status: 'published', dueDate: in7d, createdBy: adminId });

  console.log('Seed: admin dpires292@gmail.com / preview123456 | membro membro@exemplo.com / preview123456');
}

seed();

// ---------------------------------------------------------------------------
// Utilitários espelhando as regras reais (Constants.gs / Security.gs)
// ---------------------------------------------------------------------------
const LIMITS = { PASSWORD_MIN_LENGTH: 12, NAME_MIN: 3, NAME_MAX: 150, PHONE_MIN: 8, PHONE_MAX: 30, TITLE_MIN: 3, TITLE_MAX: 150, DESCRIPTION_MIN: 5, DESCRIPTION_MAX: 5000, COMPLEMENT_MIN: 3, COMPLEMENT_MAX: 700, FEEDBACK_MIN: 3, FEEDBACK_MAX: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function norm(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function lenOk(v, min, max) { const l = norm(v).length; return l >= min && l <= max; }
function ok(message, extra) { return Object.assign({ success: true, message: message }, extra || {}); }
function fail(message) { return { success: false, message: message }; }

function resolveSession(token) {
  const profileId = db.sessions[norm(token)];
  if (!profileId) return null;
  const profile = db.profiles.find((p) => p.id === profileId);
  if (!profile || profile.status !== 'active' || !profile.emailConfirmedAt) return null;
  return profile;
}

function requireSession(token) {
  const p = resolveSession(token);
  if (!p) throw new Error('Sessão inválida ou expirada. Faça login novamente. (Modo de pré-visualização: qualquer sessão some ao reiniciar o servidor.)');
  return p;
}

function requireRole(profile, roles) {
  if (!roles.includes(profile.role)) throw new Error('Acesso não autorizado para este recurso.');
}

// ---------------------------------------------------------------------------
// Handlers — espelham a assinatura de src/Main.gs (mesmos nomes de função)
// ---------------------------------------------------------------------------
const handlers = {
  apiRegister(input) {
    input = input || {};
    const fullName = norm(input.fullName);
    const email = norm(input.email).toLowerCase();
    const phone = norm(input.phone);
    const password = norm(input.password);

    if (!lenOk(fullName, LIMITS.NAME_MIN, LIMITS.NAME_MAX)) return fail('Informe um nome completo válido.');
    if (!EMAIL_RE.test(email)) return fail('Informe um e-mail válido.');
    if (!lenOk(phone, LIMITS.PHONE_MIN, LIMITS.PHONE_MAX)) return fail('Informe um telefone válido.');
    if (password.length < LIMITS.PASSWORD_MIN_LENGTH) return fail('A senha deve ter pelo menos ' + LIMITS.PASSWORD_MIN_LENGTH + ' caracteres.');
    if (norm(input.validationPreference || 'email') !== 'email') return fail('No momento, apenas a confirmação por e-mail está disponível.');
    if (input.termsAccepted !== true) return fail('É necessário aceitar os Termos de Uso.');
    if (input.privacyAccepted !== true) return fail('É necessário aceitar a Política de Privacidade.');
    if (db.profiles.some((p) => p.email === email)) return fail('Já existe uma conta cadastrada com este e-mail.');

    const id = uid();
    db.profiles.push({ id, fullName, email, password, phone, city: norm(input.city) || null, education: norm(input.education) || null, role: 'visitor', status: 'active', emailConfirmedAt: nowIso(), createdAt: nowIso() });
    db.preferences[id] = { theme: 'system', density: 'standard', emailNotifications: true };
    return ok('Cadastro realizado. (Pré-visualização: confirmação de e-mail é automática, não há envio real.) Você já pode entrar.');
  },

  apiConfirmEmail() { return ok('E-mail confirmado (pré-visualização confirma automaticamente no cadastro).'); },

  apiLogin(email, password) {
    email = norm(email).toLowerCase();
    password = norm(password);
    const profile = db.profiles.find((p) => p.email === email);
    const generic = 'E-mail ou senha inválidos, ou conta ainda não confirmada.';
    if (!profile || profile.password !== password || profile.status !== 'active' || !profile.emailConfirmedAt) return fail(generic);
    const token = uid() + uid();
    db.sessions[token] = profile.id;
    return ok('Login realizado com sucesso.', { sessionToken: token, profile: { fullName: profile.fullName, role: profile.role } });
  },

  apiLogout(sessionToken) { delete db.sessions[norm(sessionToken)]; return ok('Sessão encerrada.'); },

  apiRequestPasswordReset(email) {
    console.log('[preview] Redefinição de senha solicitada para', email, '— sem envio real de e-mail neste modo.');
    return ok('Se o e-mail existir em nossa base, um link de redefinição será enviado.');
  },
  apiValidateResetToken() { return fail('Redefinição de senha não é suportada no modo de pré-visualização.'); },
  apiConfirmPasswordReset() { return fail('Redefinição de senha não é suportada no modo de pré-visualização.'); },

  apiGetMyProfile(sessionToken) {
    const p = requireSession(sessionToken);
    const prefs = db.preferences[p.id] || { theme: 'system', density: 'standard', emailNotifications: true };
    return ok('', { profile: { fullName: p.fullName, email: p.email, phone: p.phone, city: p.city, education: p.education, role: p.role, memberSince: p.createdAt }, preferences: prefs });
  },

  apiUpdateMyProfile(sessionToken, input) {
    const p = requireSession(sessionToken);
    input = input || {};
    if (!lenOk(norm(input.fullName), LIMITS.NAME_MIN, LIMITS.NAME_MAX)) return fail('Informe um nome completo válido.');
    if (!lenOk(norm(input.phone), LIMITS.PHONE_MIN, LIMITS.PHONE_MAX)) return fail('Informe um telefone válido.');
    p.fullName = norm(input.fullName);
    p.phone = norm(input.phone);
    p.city = norm(input.city) || null;
    p.education = norm(input.education) || null;
    return ok('Perfil atualizado com sucesso.');
  },

  apiUpdateMyPreferences(sessionToken, input) {
    const p = requireSession(sessionToken);
    input = input || {};
    db.preferences[p.id] = { theme: norm(input.theme) || 'system', density: norm(input.density) || 'standard', emailNotifications: input.emailNotifications === true };
    return ok('Preferências atualizadas.');
  },

  apiSubmitFeedback(sessionToken, message) {
    const p = requireSession(sessionToken);
    message = norm(message);
    if (!lenOk(message, LIMITS.FEEDBACK_MIN, LIMITS.FEEDBACK_MAX)) return fail('Mensagem inválida.');
    db.feedback.push({ id: uid(), profileId: p.id, authorName: p.fullName, message, createdAt: nowIso() });
    return ok('Obrigado! Seu feedback foi enviado.');
  },

  apiListEvents(sessionToken) {
    const identity = sessionToken ? resolveSession(sessionToken) : null;
    const visible = db.events.filter((e) => {
      if (e.status !== 'published') return false;
      if (e.visibility === 'public') return true;
      if (e.visibility === 'authenticated') return !!identity;
      if (e.visibility === 'members') return identity && (identity.role === 'member' || identity.role === 'admin');
      return false;
    });
    const events = visible.map((e) => {
      const registeredCount = db.eventRegistrations.filter((r) => r.eventId === e.id).length;
      const spotsLeft = e.capacity === null || e.capacity === undefined ? null : Math.max(e.capacity - registeredCount, 0);
      const isRegistered = !!(identity && db.eventRegistrations.some((r) => r.eventId === e.id && r.profileId === identity.id));
      return { id: e.id, title: e.title, description: e.description, eventDate: e.eventDate, visibility: e.visibility, capacity: e.capacity, registeredCount, spotsLeft, isRegistered };
    });
    return ok('', { events });
  },

  apiRegisterForEvent(sessionToken, eventId) {
    const p = requireSession(sessionToken);
    const event = db.events.find((e) => e.id === eventId);
    if (!event || event.status !== 'published') return fail('Evento indisponível.');
    if (db.eventRegistrations.some((r) => r.eventId === eventId && r.profileId === p.id)) return fail('Você já está inscrito neste evento.');
    const count = db.eventRegistrations.filter((r) => r.eventId === eventId).length;
    if (event.capacity !== null && event.capacity !== undefined && count >= event.capacity) return fail('Evento sem vagas disponíveis.');
    db.eventRegistrations.push({ eventId, profileId: p.id });
    return ok('Inscrição confirmada.');
  },

  apiSubmitProposal(sessionToken, input) {
    const p = requireSession(sessionToken);
    input = input || {};
    if (!lenOk(norm(input.title), LIMITS.TITLE_MIN, LIMITS.TITLE_MAX)) return fail('Título inválido.');
    if (!lenOk(norm(input.description), LIMITS.DESCRIPTION_MIN, LIMITS.DESCRIPTION_MAX)) return fail('Descrição inválida.');
    db.proposals.push({ id: uid(), title: norm(input.title), description: norm(input.description), authorId: p.id, status: 'submitted', createdAt: nowIso() });
    return ok('Proposta enviada para análise.');
  },

  apiListMyProposals(sessionToken) {
    const p = requireSession(sessionToken);
    const list = db.proposals.filter((pr) => pr.authorId === p.id).map((pr) => ({ id: pr.id, title: pr.title, description: pr.description, status: pr.status, created_at: pr.createdAt }));
    return ok('', { proposals: list });
  },

  apiListOpenProposalsForVoting(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['member', 'admin']);
    const list = db.proposals.filter((pr) => pr.status === 'voting_open').map((pr) => ({ id: pr.id, title: pr.title, description: pr.description, votingOpensAt: pr.votingOpensAt, votingClosesAt: pr.votingClosesAt, alreadyVoted: db.votes.some((v) => v.proposalId === pr.id && v.profileId === p.id) }));
    return ok('', { proposals: list });
  },

  apiCastVote(sessionToken, proposalId, choice, complementText) {
    const p = requireSession(sessionToken);
    requireRole(p, ['member', 'admin']);
    const proposal = db.proposals.find((pr) => pr.id === proposalId);
    if (!proposal || proposal.status !== 'voting_open') return fail('Votação indisponível.');
    if (db.votes.some((v) => v.proposalId === proposalId && v.profileId === p.id)) return fail('Você já votou nesta proposta.');
    if (!['yes', 'no', 'complement'].includes(choice)) return fail('Escolha de voto inválida.');
    if (choice === 'complement' && !lenOk(norm(complementText), LIMITS.COMPLEMENT_MIN, LIMITS.COMPLEMENT_MAX)) return fail('O complemento deve ter entre 3 e 700 caracteres.');
    db.votes.push({ id: uid(), proposalId, profileId: p.id, choice, complementText: choice === 'complement' ? norm(complementText) : null });
    return ok('Voto registrado com sucesso.');
  },

  apiGetProposalResults(sessionToken, proposalId) {
    const identity = requireSession(sessionToken);
    const proposal = db.proposals.find((pr) => pr.id === proposalId);
    if (!proposal) return fail('Proposta não encontrada.');
    const canSee = identity.role === 'admin' || (identity.role === 'member' && proposal.status === 'voting_closed');
    const res = { success: true, proposal: { id: proposal.id, title: proposal.title, description: proposal.description, status: proposal.status } };
    if (canSee) {
      const counts = { yes: 0, no: 0, complement: 0 };
      db.votes.filter((v) => v.proposalId === proposalId).forEach((v) => { counts[v.choice]++; });
      res.results = counts;
    }
    return res;
  },

  apiListTasks(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['member', 'admin']);
    const list = db.tasks.filter((t) => t.status === 'published').map((t) => ({ id: t.id, title: t.title, description: t.description, dueDate: t.dueDate, alreadySignedUp: db.taskSignups.some((s) => s.taskId === t.id && s.profileId === p.id), signupCount: db.taskSignups.filter((s) => s.taskId === t.id).length }));
    return ok('', { tasks: list });
  },

  apiSignupForTask(sessionToken, taskId) {
    const p = requireSession(sessionToken);
    requireRole(p, ['member', 'admin']);
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task || task.status !== 'published') return fail('Tarefa indisponível.');
    if (db.taskSignups.some((s) => s.taskId === taskId && s.profileId === p.id)) return fail('Você já aderiu a esta tarefa.');
    db.taskSignups.push({ taskId, profileId: p.id });
    return ok('Adesão confirmada.');
  },

  apiAdminDashboard(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', {
      indicators: {
        active_members: db.profiles.filter((x) => x.role === 'member' && x.status === 'active').length,
        active_admins: db.profiles.filter((x) => x.role === 'admin' && x.status === 'active').length,
        banned_accounts: db.profiles.filter((x) => x.status === 'banned').length,
        published_events: db.events.filter((x) => x.status === 'published').length,
        proposals_pending: db.proposals.filter((x) => x.status === 'submitted').length,
        proposals_voting: db.proposals.filter((x) => x.status === 'voting_open').length,
        tasks_open: db.tasks.filter((x) => x.status === 'published').length,
      },
    });
  },

  apiAdminListUsers(sessionToken, input) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    input = input || {};
    const search = norm(input.search).toLowerCase();
    const filtered = db.profiles.filter((x) => !search || x.fullName.toLowerCase().includes(search) || x.email.toLowerCase().includes(search));
    return ok('', { users: filtered.map((x) => ({ id: x.id, fullName: x.fullName, email: x.email, role: x.role, status: x.status, emailConfirmed: !!x.emailConfirmedAt, createdAt: x.createdAt })), page: 1, pageSize: 25, total: filtered.length });
  },

  apiAdminChangeUserRole(sessionToken, targetProfileId, newRole) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    if (!['visitor', 'member', 'admin'].includes(newRole)) return fail('Papel inválido.');
    const target = db.profiles.find((x) => x.id === targetProfileId);
    if (!target) return fail('Usuário não encontrado.');
    if (target.role === 'admin' && target.status === 'active' && newRole !== 'admin') {
      const otherActiveAdmins = db.profiles.filter((x) => x.role === 'admin' && x.status === 'active' && x.id !== target.id).length;
      if (otherActiveAdmins === 0) return fail('Esta é a última conta de administrador ativa: não é possível removê-la, rebaixá-la ou bani-la.');
    }
    target.role = newRole;
    return ok('Papel atualizado com sucesso.');
  },

  apiAdminBanUser(sessionToken, targetProfileId) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    const target = db.profiles.find((x) => x.id === targetProfileId);
    if (!target) return fail('Usuário não encontrado.');
    if (target.role === 'admin' && target.status === 'active') {
      const otherActiveAdmins = db.profiles.filter((x) => x.role === 'admin' && x.status === 'active' && x.id !== target.id).length;
      if (otherActiveAdmins === 0) return fail('Esta é a última conta de administrador ativa: não é possível removê-la, rebaixá-la ou bani-la.');
    }
    target.status = 'banned';
    Object.keys(db.sessions).forEach((tok) => { if (db.sessions[tok] === target.id) delete db.sessions[tok]; });
    return ok('Conta banida. Todas as sessões ativas foram revogadas.');
  },

  apiAdminUnbanUser(sessionToken, targetProfileId) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    const target = db.profiles.find((x) => x.id === targetProfileId);
    if (!target) return fail('Usuário não encontrado.');
    target.status = 'active';
    return ok('Conta reativada.');
  },

  apiAdminListFeedback(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', { feedback: db.feedback.map((f) => ({ id: f.id, message: f.message, created_at: f.createdAt, author_name: f.authorName })), page: 1, pageSize: 25, total: db.feedback.length });
  },

  apiAdminCreateEvent(sessionToken, input) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    input = input || {};
    if (!lenOk(norm(input.title), LIMITS.TITLE_MIN, LIMITS.TITLE_MAX)) return fail('Título inválido.');
    if (!lenOk(norm(input.description), LIMITS.DESCRIPTION_MIN, LIMITS.DESCRIPTION_MAX)) return fail('Descrição inválida.');
    if (!input.eventDate) return fail('Informe uma data válida.');
    db.events.push({ id: uid(), title: norm(input.title), description: norm(input.description), status: 'draft', visibility: norm(input.visibility) || 'authenticated', eventDate: new Date(input.eventDate).toISOString(), capacity: input.capacity || null, createdBy: p.id });
    return ok('Evento criado como rascunho.');
  },

  apiAdminUpdateEventStatus(sessionToken, eventId, newStatus) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    const event = db.events.find((e) => e.id === eventId);
    if (!event) return fail('Evento não encontrado.');
    event.status = newStatus;
    return ok('Status do evento atualizado.');
  },

  apiAdminListAllEvents(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', { events: db.events.map((e) => ({ id: e.id, title: e.title, status: e.status, visibility: e.visibility, event_date: e.eventDate, capacity: e.capacity, registered_count: db.eventRegistrations.filter((r) => r.eventId === e.id).length })) });
  },

  apiAdminListProposalsForReview(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', { proposals: db.proposals.map((pr) => ({ id: pr.id, title: pr.title, description: pr.description, status: pr.status, created_at: pr.createdAt, author_name: (db.profiles.find((x) => x.id === pr.authorId) || {}).fullName })) });
  },

  apiAdminTransitionProposal(sessionToken, proposalId, newStatus, extra) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    const proposal = db.proposals.find((pr) => pr.id === proposalId);
    if (!proposal) return fail('Proposta não encontrada.');
    if (newStatus === 'voting_open') {
      proposal.votingOpensAt = (extra && extra.votingOpensAt) ? new Date(extra.votingOpensAt).toISOString() : nowIso();
      proposal.votingClosesAt = (extra && extra.votingClosesAt) ? new Date(extra.votingClosesAt).toISOString() : null;
    }
    proposal.status = newStatus;
    return ok('Status da proposta atualizado.');
  },

  apiAdminCreateTask(sessionToken, input) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    input = input || {};
    if (!lenOk(norm(input.title), LIMITS.TITLE_MIN, LIMITS.TITLE_MAX)) return fail('Título inválido.');
    if (!lenOk(norm(input.description), 3, LIMITS.DESCRIPTION_MAX)) return fail('Descrição inválida.');
    db.tasks.push({ id: uid(), title: norm(input.title), description: norm(input.description), status: 'draft', dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null, createdBy: p.id });
    return ok('Tarefa criada como rascunho.');
  },

  apiAdminUpdateTaskStatus(sessionToken, taskId, newStatus) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return fail('Tarefa não encontrada.');
    task.status = newStatus;
    return ok('Status da tarefa atualizado.');
  },

  apiAdminListAllTasks(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', { tasks: db.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, due_date: t.dueDate, signup_count: db.taskSignups.filter((s) => s.taskId === t.id).length })) });
  },

  apiAdminListAuditLogs(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', { logs: [], page: 1, pageSize: 50, total: 0 });
  },

  apiAdminListErrorLogs(sessionToken) {
    const p = requireSession(sessionToken);
    requireRole(p, ['admin']);
    return ok('', { logs: [], page: 1, pageSize: 50, total: 0 });
  },
};

// ---------------------------------------------------------------------------
// Montagem do HTML (resolve os includes/scriptlets do Apps Script) + shim de
// google.script.run apontando para /api/<funcao>
// ---------------------------------------------------------------------------
function readUi(name) {
  return fs.readFileSync(path.join(UI_DIR, name), 'utf8');
}

function buildHtml() {
  let html = readUi('Index.html');

  html = html.replace("<?!= App.Security.toSafeInlineJson(deepLinkMode || '') ?>", '""');
  html = html.replace("<?!= App.Security.toSafeInlineJson(deepLinkToken || '') ?>", '""');
  html = html.replace('<?= termsVersion ?>', '2026-09-24 (pré-visualização)');
  html = html.replace('<?= privacyVersion ?>', '2026-09-24 (pré-visualização)');

  html = html.replace("<?!= include('src/ui/Styles'); ?>", readUi('Styles.html'));
  html = html.replace("<?!= include('src/ui/Header'); ?>", readUi('Header.html'));
  html = html.replace("<?!= include('src/ui/Navigation'); ?>", readUi('Navigation.html'));
  html = html.replace("<?!= include('src/ui/Modals'); ?>", readUi('Modals.html'));

  const shim = `
<script>
  // ---- SHIM de pré-visualização local: substitui google.script.run por
  // chamadas fetch('/api/<funcao>') neste servidor local (não é o Apps
  // Script real; ver preview/server.js). O restante da interface (todo o
  // Scripts.html abaixo) é o código REAL, sem alterações.
  function makeRunner(handlers) {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (cb) { return makeRunner(Object.assign({}, handlers, { success: cb })); };
        }
        if (prop === 'withFailureHandler') {
          return function (cb) { return makeRunner(Object.assign({}, handlers, { failure: cb })); };
        }
        return function (...args) {
          fetch('/api/' + prop, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
            .then((r) => r.json())
            .then((res) => { if (handlers.success) handlers.success(res); })
            .catch((err) => { if (handlers.failure) handlers.failure(err); else console.error(err); });
        };
      },
    });
  }
  window.google = { script: { run: makeRunner({}) } };
</script>
<div style="position:fixed;top:0;left:0;right:0;z-index:999;background:#7a4b00;color:#fff;text-align:center;font:600 11px sans-serif;padding:4px;">
  Pré-visualização local — dados fictícios. Login: dpires292@gmail.com / preview123456 (admin) ou membro@exemplo.com / preview123456 (membro).
</div>
`;

  html = html.replace("<?!= include('src/ui/Scripts'); ?>", shim + readUi('Scripts.html'));
  return html;
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildHtml());
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    const fnName = req.url.slice('/api/'.length);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let args = [];
      try { args = JSON.parse(body || '[]'); } catch (e) { /* body vazio */ }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      try {
        const handler = handlers[fnName];
        if (!handler) { res.end(JSON.stringify(fail('Função não implementada na pré-visualização: ' + fnName))); return; }
        const result = handler.apply(null, args);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.end(JSON.stringify(fail(err.message || 'Erro na pré-visualização.')));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Pré-visualização local em http://localhost:' + PORT);
});
