/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';

// O resumo do Início só COMPÕE serviços que já têm testes próprios; aqui eles
// são simulados para testar apenas a composição (recorte, contagens, papéis).
jest.unstable_mockModule('../src/services/eventService.js', () => ({ listEvents: jest.fn() }));
jest.unstable_mockModule('../src/services/taskService.js', () => ({ listTasks: jest.fn() }));
jest.unstable_mockModule('../src/services/proposalService.js', () => ({ listOpenForVoting: jest.fn() }));
jest.unstable_mockModule('../src/services/learningService.js', () => ({ getMyStats: jest.fn() }));
jest.unstable_mockModule('../src/services/messageService.js', () => ({ syncMessaging: jest.fn() }));

const EventService = await import('../src/services/eventService.js');
const TaskService = await import('../src/services/taskService.js');
const ProposalService = await import('../src/services/proposalService.js');
const LearningService = await import('../src/services/learningService.js');
const MessageService = await import('../src/services/messageService.js');
const { getHomeSummary } = await import('../src/services/homeService.js');

const NOW = new Date('2026-10-10T12:00:00Z');
const member = { profileId: 'p1', role: 'member' };
const visitor = { profileId: 'p2', role: 'visitor' };

function ev(id, iso, extra) {
  return Object.assign({ id, title: 'Evento ' + id, eventDate: iso, location: 'Sala ' + id, isRegistered: false, spotsLeft: 5, description: 'texto longo', capacity: 10 }, extra || {});
}

function mockAll(overrides) {
  const o = overrides || {};
  EventService.listEvents.mockResolvedValue(o.events || { success: true, events: [] });
  TaskService.listTasks.mockResolvedValue(o.tasks || { success: true, tasks: [] });
  ProposalService.listOpenForVoting.mockResolvedValue(o.voting || { success: true, proposals: [] });
  LearningService.getMyStats.mockResolvedValue(o.stats || {
    success: true,
    stats: { accuracyPct: null, questionsAnswered: 0, totalActivities: 0, badges: [{ unlocked: false }, { unlocked: false }] },
  });
  MessageService.syncMessaging.mockResolvedValue(o.inbox || { success: true, unreadMessages: 0, pendingConnectionRequests: 0 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAll();
});

describe('homeService.getHomeSummary', () => {
  test('próximos eventos: só os futuros, em ordem, no máximo 3, só com os campos da tela', async () => {
    mockAll({
      events: {
        success: true,
        events: [
          ev('passado', '2026-10-01T10:00:00Z'),
          ev('e4', '2026-10-30T10:00:00Z'),
          ev('e2', '2026-10-12T10:00:00Z', { isRegistered: true }),
          ev('e3', '2026-10-20T10:00:00Z'),
          ev('e1', '2026-10-10T18:00:00Z'),
        ],
      },
    });
    const res = await getHomeSummary({}, {}, member, NOW);
    expect(res.success).toBe(true);
    const ids = res.summary.nextEvents.map((e) => e.id);
    expect(ids).toEqual(['e1', 'e2', 'e3']);
    expect(res.summary.nextEvents[1]).toEqual({
      id: 'e2', title: 'Evento e2', eventDate: '2026-10-12T10:00:00Z', location: 'Sala e2', isRegistered: true, spotsLeft: 5,
    });
  });

  test('tarefas: pendentes minhas, disponíveis e a próxima a vencer (sem prazo vai por último)', async () => {
    mockAll({
      tasks: {
        success: true,
        tasks: [
          { id: 't1', title: 'A', dueDate: null, alreadySignedUp: true, completed: false },
          { id: 't2', title: 'B', dueDate: '2026-10-20T00:00:00Z', alreadySignedUp: true, completed: false },
          { id: 't3', title: 'C', dueDate: '2026-10-15T00:00:00Z', alreadySignedUp: true, completed: false },
          { id: 't4', title: 'D', dueDate: '2026-10-11T00:00:00Z', alreadySignedUp: true, completed: true },
          { id: 't5', title: 'E', dueDate: '2026-10-12T00:00:00Z', alreadySignedUp: false, completed: false },
        ],
      },
    });
    const { tasks } = (await getHomeSummary({}, {}, member, NOW)).summary;
    expect(tasks.myPendingCount).toBe(3);
    expect(tasks.availableCount).toBe(1);
    expect(tasks.next).toEqual({ id: 't3', title: 'C', dueDate: '2026-10-15T00:00:00Z' });
  });

  test('tarefas: sem pendências, next é null', async () => {
    const { tasks } = (await getHomeSummary({}, {}, member, NOW)).summary;
    expect(tasks).toEqual({ myPendingCount: 0, availableCount: 0, next: null });
  });

  test('votações: abertas, as que faltam votar e a que fecha primeiro entre as pendentes', async () => {
    mockAll({
      voting: {
        success: true,
        proposals: [
          { id: 'v1', title: 'X', votingClosesAt: '2026-10-18T00:00:00Z', alreadyVoted: false },
          { id: 'v2', title: 'Y', votingClosesAt: '2026-10-14T00:00:00Z', alreadyVoted: false },
          { id: 'v3', title: 'Z', votingClosesAt: '2026-10-11T00:00:00Z', alreadyVoted: true },
        ],
      },
    });
    const { voting } = (await getHomeSummary({}, {}, member, NOW)).summary;
    expect(voting).toEqual({ openCount: 3, pendingCount: 2, nextClosesAt: '2026-10-14T00:00:00Z' });
  });

  test('aprendizado: acerto, questões, atividades e selos desbloqueados', async () => {
    mockAll({
      stats: {
        success: true,
        stats: {
          accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, clinicalAvgScore: 80,
          badges: [{ unlocked: true }, { unlocked: false }, { unlocked: true }],
        },
      },
    });
    const { learning } = (await getHomeSummary({}, {}, member, NOW)).summary;
    expect(learning).toEqual({ accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 3 });
  });

  test('caixa de entrada: mensagens não lidas e pedidos de conexão', async () => {
    mockAll({ inbox: { success: true, unreadMessages: 4, pendingConnectionRequests: 2 } });
    const { inbox } = (await getHomeSummary({}, {}, member, NOW)).summary;
    expect(inbox).toEqual({ unreadMessages: 4, pendingConnectionRequests: 2 });
  });

  test('visitante: recebe eventos e aprendizado; seções de membro vêm null e nem são consultadas', async () => {
    mockAll({ events: { success: true, events: [ev('e1', '2026-10-12T10:00:00Z')] } });
    const { summary } = await getHomeSummary({}, {}, visitor, NOW);
    expect(summary.nextEvents).toHaveLength(1);
    expect(summary.learning).not.toBeNull();
    expect(summary.tasks).toBeNull();
    expect(summary.voting).toBeNull();
    expect(summary.inbox).toBeNull();
    expect(TaskService.listTasks).not.toHaveBeenCalled();
    expect(ProposalService.listOpenForVoting).not.toHaveBeenCalled();
    expect(MessageService.syncMessaging).not.toHaveBeenCalled();
  });

  test('o resumo não vaza descrição, capacidade nem texto de proposta', async () => {
    mockAll({
      events: { success: true, events: [ev('e1', '2026-10-12T10:00:00Z')] },
      voting: { success: true, proposals: [{ id: 'v1', title: 'X', description: 'segredo', votingClosesAt: '2026-10-14T00:00:00Z', alreadyVoted: false }] },
    });
    const json = JSON.stringify(await getHomeSummary({}, {}, member, NOW));
    expect(json).not.toContain('texto longo');
    expect(json).not.toContain('segredo');
    expect(json).not.toContain('capacity');
  });

  test('um erro inesperado de qualquer parte se propaga (o handler responde com ref e registra)', async () => {
    TaskService.listTasks.mockRejectedValue(new Error('banco fora'));
    await expect(getHomeSummary({}, {}, member, NOW)).rejects.toThrow('banco fora');
  });

  test('todas as partes são pedidas em paralelo, uma vez cada', async () => {
    await getHomeSummary({}, {}, member, NOW);
    for (const fn of [EventService.listEvents, TaskService.listTasks, ProposalService.listOpenForVoting, LearningService.getMyStats, MessageService.syncMessaging]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
});
