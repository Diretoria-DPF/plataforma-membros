/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * homeService.js
 * Resumo do painel "Início": UMA requisição no lugar das cinco que a tela
 * precisaria (eventos, tarefas, votações, aprendizado e caixa de entrada).
 *
 * Só COMPÕE serviços que já existem e já têm testes e cache próprios (a lista
 * de eventos é cacheada por camada, o contador de mensagens por usuário); não
 * há tabela nova nem cache novo. Devolve só o que a tela mostra — títulos,
 * datas, local, contagens e selos — nunca descrição, capacidade nem texto de
 * proposta. Visitantes não têm tarefas, votações nem mensagens: essas seções
 * vêm null e nem são consultadas.
 *
 * Um erro inesperado de qualquer parte se propaga de propósito: o handler
 * (run) o registra com correlationId e responde com a mensagem genérica, em
 * vez de entregar um Início pela metade sem ninguém saber.
 */
import * as C from '../constants.js';
import * as EventService from './eventService.js';
import * as TaskService from './taskService.js';
import * as ProposalService from './proposalService.js';
import * as LearningService from './learningService.js';
import * as MessageService from './messageService.js';

const MAX_NEXT_EVENTS = 3;

function isMemberOrAdmin(identity) {
  return identity.role === C.ROLES.MEMBER || identity.role === C.ROLES.ADMIN;
}

function time(iso) {
  // new Date(null) é 1970-01-01: sem esta guarda, "sem prazo" viraria o mais urgente.
  if (iso === null || iso === undefined || iso === '') return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Ordena por data crescente; sem data (null) vai por último. */
function byDateAscNullsLast(getIso) {
  return (a, b) => {
    const ta = time(getIso(a));
    const tb = time(getIso(b));
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  };
}

function summarizeEvents(result, now) {
  const upcoming = (result.events || []).filter((e) => {
    const t = time(e.eventDate);
    return t !== null && t >= now.getTime();
  });
  return upcoming
    .sort(byDateAscNullsLast((e) => e.eventDate))
    .slice(0, MAX_NEXT_EVENTS)
    .map((e) => ({
      id: e.id,
      title: e.title,
      eventDate: e.eventDate,
      location: e.location,
      isRegistered: e.isRegistered === true,
      spotsLeft: e.spotsLeft,
    }));
}

function summarizeTasks(result) {
  const tasks = result.tasks || [];
  const mine = tasks.filter((t) => t.alreadySignedUp && !t.completed).sort(byDateAscNullsLast((t) => t.dueDate));
  const next = mine[0] ? { id: mine[0].id, title: mine[0].title, dueDate: mine[0].dueDate } : null;
  return {
    myPendingCount: mine.length,
    availableCount: tasks.filter((t) => !t.alreadySignedUp).length,
    next,
  };
}

function summarizeVoting(result) {
  const proposals = result.proposals || [];
  const pending = proposals.filter((p) => !p.alreadyVoted).sort(byDateAscNullsLast((p) => p.votingClosesAt));
  return {
    openCount: proposals.length,
    pendingCount: pending.length,
    nextClosesAt: pending[0] && pending[0].votingClosesAt ? pending[0].votingClosesAt : null,
  };
}

function summarizeLearning(result) {
  const stats = result.stats || {};
  const badges = stats.badges || [];
  return {
    accuracyPct: stats.accuracyPct === undefined ? null : stats.accuracyPct,
    questionsAnswered: stats.questionsAnswered || 0,
    totalActivities: stats.totalActivities || 0,
    unlockedBadges: badges.filter((b) => b.unlocked).length,
    totalBadges: badges.length,
  };
}

/**
 * @param {Function} sql
 * @param {object} env
 * @param {{profileId: string, role: string}} identity  sessão já validada
 * @param {Date} [now]  injetável nos testes
 */
export async function getHomeSummary(sql, env, identity, now) {
  const current = now || new Date();
  const member = isMemberOrAdmin(identity);

  const [events, stats, tasks, voting, inbox] = await Promise.all([
    EventService.listEvents(sql, env, identity),
    LearningService.getMyStats(sql, identity),
    member ? TaskService.listTasks(sql, identity) : Promise.resolve(null),
    member ? ProposalService.listOpenForVoting(sql, identity) : Promise.resolve(null),
    member ? MessageService.syncMessaging(sql, env, identity) : Promise.resolve(null),
  ]);

  return {
    success: true,
    summary: {
      nextEvents: summarizeEvents(events, current),
      tasks: tasks ? summarizeTasks(tasks) : null,
      voting: voting ? summarizeVoting(voting) : null,
      learning: summarizeLearning(stats),
      inbox: inbox
        ? { unreadMessages: Number(inbox.unreadMessages) || 0, pendingConnectionRequests: Number(inbox.pendingConnectionRequests) || 0 }
        : null,
    },
  };
}
