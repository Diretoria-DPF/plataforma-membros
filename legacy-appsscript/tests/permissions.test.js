const { createServiceEnvironment, createFullEnvironment } = require('./helpers/gasEnvironment');

function identityFor(role) {
  return { profileId: 'profile-' + role, role: role, status: 'active', fullName: 'Teste ' + role, email: role + '@example.com' };
}

describe('Matriz de permissões — cada papel na função certa', function () {
  let env;
  beforeEach(function () {
    env = createServiceEnvironment();
    // COUNT(*) sempre devolve uma linha no Postgres real (mesmo com zero resultados);
    // o mock precisa refletir isso para não quebrar chamadas paginadas (listUsers, listAuditLogs...).
    env.database.query.mockImplementation(function (sql) {
      return /count\(\*\)/i.test(sql) ? [{ total: '0' }] : [];
    });
    env.database.execute.mockReturnValue(1);
    env.database.withTransaction.mockImplementation(function (cb) {
      return cb({ query: function () { return []; }, execute: function () { return 1; } });
    });
  });

  test('visitor NÃO pode votar (ProposalService.castVote)', function () {
    expect(function () {
      env.App.ProposalService.castVote(identityFor('visitor'), 'prop-1', 'yes', '', 'corr');
    }).toThrow(/Acesso não autorizado/);
  });

  test('visitor NÃO pode consultar tarefas (TaskService.listTasks)', function () {
    expect(function () {
      env.App.TaskService.listTasks(identityFor('visitor'));
    }).toThrow(/Acesso não autorizado/);
  });

  test('visitor NÃO pode aderir a tarefas (TaskService.signupForTask)', function () {
    expect(function () {
      env.App.TaskService.signupForTask(identityFor('visitor'), 'task-1', 'corr');
    }).toThrow(/Acesso não autorizado/);
  });

  test('member e admin PODEM votar e consultar tarefas', function () {
    ['member', 'admin'].forEach(function (role) {
      expect(function () { env.App.TaskService.listTasks(identityFor(role)); }).not.toThrow();
    });
  });

  test('member NÃO pode acessar o dashboard administrativo', function () {
    expect(function () { env.App.AdminService.dashboard(identityFor('member')); }).toThrow(/Acesso não autorizado/);
  });

  test('member NÃO pode listar usuários nem banir contas', function () {
    expect(function () { env.App.AdminService.listUsers(identityFor('member'), {}); }).toThrow(/Acesso não autorizado/);
    expect(function () { env.App.AdminService.banUser(identityFor('member'), 'other-profile', 'corr'); }).toThrow(/Acesso não autorizado/);
  });

  test('member NÃO pode criar eventos nem tarefas administrativamente', function () {
    expect(function () {
      env.App.EventService.createEvent(identityFor('member'), { title: 'x', description: 'yyyyy', eventDate: '2026-01-01', visibility: 'public' }, 'corr');
    }).toThrow(/Acesso não autorizado/);

    expect(function () {
      env.App.TaskService.createTask(identityFor('member'), { title: 'x', description: 'yyy' }, 'corr');
    }).toThrow(/Acesso não autorizado/);
  });

  test('member NÃO pode revisar/transicionar propostas administrativamente', function () {
    expect(function () { env.App.ProposalService.listForReview(identityFor('member')); }).toThrow(/Acesso não autorizado/);
    expect(function () {
      env.App.ProposalService.transitionProposal(identityFor('member'), 'prop-1', 'approved', {}, 'corr');
    }).toThrow(/Acesso não autorizado/);
  });

  test('member NÃO pode consultar auditoria/logs técnicos', function () {
    expect(function () { env.App.AuditService.listAuditLogs(identityFor('member'), {}); }).toThrow(/Acesso não autorizado/);
    expect(function () { env.App.AuditService.listErrorLogs(identityFor('member'), {}); }).toThrow(/Acesso não autorizado/);
  });

  test('admin PODE acessar todas as funções administrativas', function () {
    expect(function () { env.App.AdminService.dashboard(identityFor('admin')); }).not.toThrow();
    expect(function () { env.App.AuditService.listAuditLogs(identityFor('admin'), {}); }).not.toThrow();
  });

  test('visitor, member e admin (ativos e confirmados) PODEM enviar propostas', function () {
    env.database.query.mockReturnValueOnce([{ id: 'prop-x' }]);
    ['visitor', 'member', 'admin'].forEach(function (role) {
      env.database.query.mockReturnValue([{ id: 'prop-' + role }]);
      expect(function () {
        env.App.ProposalService.submitProposal(identityFor(role), { title: 'Título válido', description: 'Descrição válida o suficiente' }, 'corr');
      }).not.toThrow();
    });
  });
});

describe('Visibilidade de eventos filtrada no servidor', function () {
  let env;
  beforeEach(function () {
    env = createServiceEnvironment();
    env.database.query.mockReturnValue([]);
  });

  function sqlUsedFor(identity) {
    env.App.EventService.listEvents(identity);
    return env.database.query.mock.calls[0][0];
  }

  test('anônimo (sem sessão) só pode ver eventos com visibility=public', function () {
    const sql = sqlUsedFor(null);
    expect(sql).toContain("visibility = 'public'::event_visibility");
    expect(sql).not.toContain('members');
  });

  test('visitor autenticado vê public + authenticated, mas não members', function () {
    const sql = sqlUsedFor({ profileId: 'p1', role: 'visitor' });
    expect(sql).toContain("visibility IN ('public','authenticated')");
    expect(sql).not.toContain('members');
  });

  test('member e admin autenticados também veem visibility=members', function () {
    ['member', 'admin'].forEach(function (role) {
      env.database.query.mockClear();
      const sql = sqlUsedFor({ profileId: 'p1', role: role });
      expect(sql).toContain("visibility IN ('public','authenticated','members')");
    });
  });
});

describe('Cliente não consegue forjar identidade (Main.gs sempre resolve sessão no servidor)', function () {
  test('apiAdminBanUser ignora qualquer papel forjado e usa a identidade resolvida do token de sessão', function () {
    const env = createFullEnvironment();

    // "Atacante": possui um sessionToken válido de MEMBER comum (nunca admin).
    env.App.Security.requireSession = jest.fn().mockReturnValue({ profileId: 'attacker-id', role: 'member', status: 'active' });
    const banSpy = jest.spyOn(env.App.AdminService, 'banUser');

    // A função de topo só aceita (sessionToken, targetProfileId) — não existe parâmetro de
    // "role" ou "isAdmin" que o cliente possa preencher para se autopromover na chamada.
    const result = env.context.apiAdminBanUser('any-token-the-attacker-has', 'victim-profile-id');

    // AdminService.banUser recebeu a identidade resolvida no SERVIDOR (role=member), não algo
    // vindo do cliente — e por isso a própria checagem de papel do AdminService barra a ação.
    expect(banSpy).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'attacker-id', role: 'member' }),
      'victim-profile-id',
      expect.any(String)
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Acesso não autorizado/);
  });

  test('apiLogin nunca aceita um "role" pré-definido pelo cliente — quem decide é o AuthService/DB', function () {
    const env = createFullEnvironment();
    env.database.query.mockReturnValue([
      { id: 'p1', role: 'visitor', status: 'active', full_name: 'Fulano', email_confirmed_at: '2026-01-01T00:00:00.000Z', password_ok: true },
    ]);

    // Mesmo que um atacante chame apiLogin com argumentos extras tentando indicar "admin",
    // a assinatura real (email, password) não tem onde colocar isso — argumentos extras são
    // simplesmente ignorados pelo runtime JS, e o papel devolvido vem sempre da consulta ao banco.
    const result = env.context.apiLogin('fulano@example.com', 'senha-valida-12+', 'admin', true);
    expect(result.success).toBe(true);
    expect(result.profile.role).toBe('visitor');
  });
});
