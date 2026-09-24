const { createServiceEnvironment, createDatabaseEnvironment } = require('./helpers/gasEnvironment');

function identityFor(role, id) {
  return { profileId: id || 'profile-' + role, role: role, status: 'active', fullName: 'Teste', email: 't@example.com' };
}

describe('EventService — duplicidade e vagas (tradução de erro do Postgres)', function () {
  test('inscrição duplicada (unique_violation) vira ConflictError amigável', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: duplicate key value violates unique constraint "event_registrations_unique"');
    });

    expect(function () {
      env.App.EventService.registerForEvent(identityFor('member'), 'event-1', 'corr');
    }).toThrow(/já está inscrito/);
  });

  test('evento sem vagas (exceção do gatilho) vira ConflictError amigável', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: Evento sem vagas disponíveis.');
    });

    expect(function () {
      env.App.EventService.registerForEvent(identityFor('member'), 'event-1', 'corr');
    }).toThrow(/sem vagas ou indisponível/);
  });

  test('erro inesperado do banco NÃO é convertido em mensagem amigável — é relançado para o Code.gs tratar', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: relation "event_registrations" does not exist');
    });

    expect(function () {
      env.App.EventService.registerForEvent(identityFor('member'), 'event-1', 'corr');
    }).toThrow(/does not exist/);
  });
});

describe('EventService — transições de status administrativas', function () {
  test('só permite transições válidas (draft -> published, nunca draft -> completed)', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([{ status: 'draft' }]);

    expect(function () {
      env.App.EventService.updateEventStatus(identityFor('admin'), 'evt-1', 'completed', 'corr');
    }).toThrow(/Transição de status inválida/);
  });

  test('permite draft -> published', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([{ status: 'draft' }]);
    const res = env.App.EventService.updateEventStatus(identityFor('admin'), 'evt-1', 'published', 'corr');
    expect(res.success).toBe(true);
  });

  test('evento inexistente gera NotFoundError', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([]);
    expect(function () {
      env.App.EventService.updateEventStatus(identityFor('admin'), 'evt-inexistente', 'published', 'corr');
    }).toThrow(/não encontrado/);
  });
});

describe('ProposalService — transições e duplicidade de voto', function () {
  test('voto duplicado (unique_violation) vira ConflictError amigável', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: duplicate key value violates unique constraint "votes_unique_per_profile"');
    });

    expect(function () {
      env.App.ProposalService.castVote(identityFor('member'), 'prop-1', 'yes', '', 'corr');
    }).toThrow(/já votou/);
  });

  test('proposta só transiciona submitted -> approved/rejected, nunca direto para voting_open', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([{ status: 'submitted' }]);

    expect(function () {
      env.App.ProposalService.transitionProposal(identityFor('admin'), 'prop-1', 'voting_open', {}, 'corr');
    }).toThrow(/Transição de status inválida/);
  });

  test('abrir votação exige prazo de encerramento válido e posterior à abertura', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValue([{ status: 'approved' }]);

    expect(function () {
      env.App.ProposalService.transitionProposal(identityFor('admin'), 'prop-1', 'voting_open', { votingOpensAt: '2026-01-10T10:00', votingClosesAt: '2026-01-09T10:00' }, 'corr');
    }).toThrow(/prazo de encerramento de votação válido/);
  });

  test('resultados agregados: visitor nunca vê, member só após encerrada, admin sempre vê', function () {
    const env = createServiceEnvironment();

    env.database.query.mockReturnValueOnce([{ id: 'prop-1', title: 't', description: 'd', status: 'voting_open' }]);
    let res = env.App.ProposalService.getProposalResults(identityFor('member'), 'prop-1');
    expect(res.results).toBeUndefined();

    env.database.query.mockReturnValueOnce([{ id: 'prop-1', title: 't', description: 'd', status: 'voting_closed' }]);
    env.database.query.mockReturnValueOnce([{ choice: 'yes', total: 5 }]);
    res = env.App.ProposalService.getProposalResults(identityFor('member'), 'prop-1');
    expect(res.results).toEqual(expect.objectContaining({ yes: 5 }));

    env.database.query.mockReturnValueOnce([{ id: 'prop-1', title: 't', description: 'd', status: 'voting_open' }]);
    env.database.query.mockReturnValueOnce([{ choice: 'no', total: 2 }]);
    res = env.App.ProposalService.getProposalResults(identityFor('admin'), 'prop-1');
    expect(res.results).toEqual(expect.objectContaining({ no: 2 }));
  });
});

describe('TaskService — duplicidade de adesão', function () {
  test('adesão duplicada (unique_violation) vira ConflictError amigável', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: duplicate key value violates unique constraint "task_signups_unique"');
    });

    expect(function () {
      env.App.TaskService.signupForTask(identityFor('member'), 'task-1', 'corr');
    }).toThrow(/já aderiu/);
  });
});

describe('AdminService — proteção do último administrador ativo', function () {
  test('rebaixar o último admin ativo é bloqueado e traduzido para mensagem amigável', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: Operação bloqueada: não é possível remover, rebaixar ou banir o último administrador ativo.');
    });

    expect(function () {
      env.App.AdminService.changeUserRole(identityFor('admin'), 'last-admin-id', 'member', 'corr');
    }).toThrow(/última conta de administrador ativa/);
  });

  test('banir o último admin ativo é bloqueado e revogação de sessões não chega a ser chamada', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockImplementation(function () {
      throw new Error('ERROR: Operação bloqueada: não é possível remover, rebaixar ou banir o último administrador ativo.');
    });
    const revokeSpy = jest.spyOn(env.App.Security, 'revokeAllSessionsForProfile');

    expect(function () {
      env.App.AdminService.banUser(identityFor('admin'), 'last-admin-id', 'corr');
    }).toThrow(/última conta de administrador ativa/);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  test('banir um admin que NÃO é o último funciona normalmente e revoga as sessões', function () {
    const env = createServiceEnvironment();
    env.database.execute.mockReturnValue(1);
    const revokeSpy = jest.spyOn(env.App.Security, 'revokeAllSessionsForProfile').mockImplementation(function () {});

    const res = env.App.AdminService.banUser(identityFor('admin'), 'some-other-admin-id', 'corr');
    expect(res.success).toBe(true);
    expect(revokeSpy).toHaveBeenCalledWith('some-other-admin-id');
  });
});

describe('AdminService — filtros e ordenação usam lista fechada, não texto livre do cliente', function () {
  test('sortBy/sortDir inválidos caem no padrão seguro em vez de serem concatenados como enviados', function () {
    const env = createServiceEnvironment();
    env.database.query.mockReturnValueOnce([]).mockReturnValueOnce([{ total: '0' }]);

    env.App.AdminService.listUsers(identityFor('admin'), { sortBy: 'password_hash; DROP TABLE profiles;--', sortDir: 'DESC; --' });

    const sqlUsed = env.database.query.mock.calls[0][0];
    expect(sqlUsed).toContain('ORDER BY created_at DESC');
    expect(sqlUsed).not.toContain('DROP TABLE');
  });
});

describe('Database.gs — camada JDBC (fake Jdbc, sem Postgres real)', function () {
  function makeFakeStatement(onExecuteQuery, onExecuteUpdate) {
    const setCalls = [];
    return {
      setString: function (i, v) { setCalls.push(['setString', i, v]); },
      setInt: function (i, v) { setCalls.push(['setInt', i, v]); },
      setDouble: function (i, v) { setCalls.push(['setDouble', i, v]); },
      setBoolean: function (i, v) { setCalls.push(['setBoolean', i, v]); },
      setNull: function (i, t) { setCalls.push(['setNull', i, t]); },
      executeQuery: function () { return onExecuteQuery ? onExecuteQuery() : { next: function () { return false; }, getMetaData: function () { return { getColumnCount: function () { return 0; } }; }, close: function () {} }; },
      executeUpdate: function () { return onExecuteUpdate ? onExecuteUpdate() : 1; },
      close: jest.fn(),
      _setCalls: setCalls,
    };
  }

  test('bind de parâmetros usa o setter tipado correto para string/número/booleano/null', function () {
    let capturedStatement;
    const fakeConn = {
      prepareStatement: function () {
        capturedStatement = makeFakeStatement();
        return capturedStatement;
      },
      close: jest.fn(),
    };
    const fakeJdbc = { Types: { VARCHAR: 12 }, getConnection: function () { return fakeConn; } };
    const env = createDatabaseEnvironment(fakeJdbc);

    env.App.Database.execute('UPDATE x SET a=?, b=?, c=?, d=? WHERE id=?', ['texto', 42, true, null, 3.14]);

    expect(capturedStatement._setCalls).toEqual([
      ['setString', 1, 'texto'],
      ['setInt', 2, 42],
      ['setBoolean', 3, true],
      ['setNull', 4, 12],
      ['setDouble', 5, 3.14],
    ]);
    expect(fakeConn.close).toHaveBeenCalled();
  });

  test('fecha conexão e statement mesmo quando a consulta lança exceção', function () {
    const stmt = makeFakeStatement(function () { throw new Error('falha simulada de query'); });
    const fakeConn = { prepareStatement: function () { return stmt; }, close: jest.fn() };
    const fakeJdbc = { Types: { VARCHAR: 12 }, getConnection: function () { return fakeConn; } };
    const env = createDatabaseEnvironment(fakeJdbc);

    expect(function () { env.App.Database.query('SELECT 1', []); }).toThrow(/falha simulada de query/);
    expect(stmt.close).toHaveBeenCalled();
    expect(fakeConn.close).toHaveBeenCalled();
  });

  test('withTransaction faz commit no sucesso e rollback quando o callback lança exceção', function () {
    const fakeConnOk = {
      prepareStatement: function () { return makeFakeStatement(); },
      setAutoCommit: jest.fn(), commit: jest.fn(), rollback: jest.fn(), close: jest.fn(),
    };
    const fakeJdbcOk = { Types: { VARCHAR: 12 }, getConnection: function () { return fakeConnOk; } };
    const envOk = createDatabaseEnvironment(fakeJdbcOk);
    envOk.App.Database.withTransaction(function (txn) { txn.execute('INSERT INTO x VALUES (?)', [1]); return 'ok'; });
    expect(fakeConnOk.commit).toHaveBeenCalled();
    expect(fakeConnOk.rollback).not.toHaveBeenCalled();

    const fakeConnFail = {
      prepareStatement: function () { return makeFakeStatement(); },
      setAutoCommit: jest.fn(), commit: jest.fn(), rollback: jest.fn(), close: jest.fn(),
    };
    const fakeJdbcFail = { Types: { VARCHAR: 12 }, getConnection: function () { return fakeConnFail; } };
    const envFail = createDatabaseEnvironment(fakeJdbcFail);

    expect(function () {
      envFail.App.Database.withTransaction(function () { throw new Error('regra de negócio falhou no meio da transação'); });
    }).toThrow(/regra de negócio falhou/);
    expect(fakeConnFail.rollback).toHaveBeenCalled();
    expect(fakeConnFail.commit).not.toHaveBeenCalled();
  });
});
