/**
 * ProposalService.gs
 * Propostas e votação. Qualquer conta ativa e confirmada (visitor/member/
 * admin) pode enviar propostas; somente member/admin podem votar, e somente
 * enquanto a votação estiver aberta e dentro da janela definida pelo admin.
 * O cliente nunca escreve status livremente — apenas ações específicas
 * (aprovar/rejeitar/abrir votação/encerrar) que mapeiam para transições
 * fixas, replicando no servidor a mesma regra do gatilho SQL.
 */
App.ProposalService = (function () {
  const C = App.Constants;
  const S = App.Security;
  const E = App.Errors;

  function submitProposal(identity, input, correlationId) {
    const title = S.normalizeText(input.title);
    const description = S.normalizeText(input.description);

    if (!S.isLengthValid(title, C.LIMITS.TITLE_MIN, C.LIMITS.TITLE_MAX)) throw E.ValidationError('Título inválido.');
    if (!S.isLengthValid(description, C.LIMITS.DESCRIPTION_MIN, C.LIMITS.DESCRIPTION_MAX)) throw E.ValidationError('Descrição inválida.');

    const inserted = App.Database.query(
      "INSERT INTO proposals (title, description, author_id, status) VALUES (?, ?, ?::uuid, 'submitted'::proposal_status) RETURNING id",
      [title, description, identity.profileId]
    );

    const id = inserted[0].id;
    App.Logging.logAudit(correlationId, identity.profileId, 'SUBMIT_PROPOSAL', 'proposal', id, 'success', null);
    return { success: true, message: 'Proposta enviada para análise.', proposalId: id };
  }

  function listMyProposals(identity) {
    const rows = App.Database.query(
      'SELECT id, title, description, status, created_at FROM proposals WHERE author_id = ?::uuid ORDER BY created_at DESC',
      [identity.profileId]
    );
    return { success: true, proposals: rows };
  }

  /** Propostas visíveis para votação por member/admin: somente as com votação aberta. */
  function listOpenForVoting(identity) {
    S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);

    const rows = App.Database.query(
      "SELECT p.id AS id, p.title AS title, p.description AS description, " +
        '       p.voting_opens_at AS voting_opens_at, p.voting_closes_at AS voting_closes_at, ' +
        '       (v.id IS NOT NULL) AS already_voted ' +
        'FROM proposals p ' +
        'LEFT JOIN votes v ON v.proposal_id = p.id AND v.profile_id = ?::uuid ' +
        "WHERE p.status = 'voting_open'::proposal_status " +
        'ORDER BY p.voting_closes_at ASC NULLS LAST',
      [identity.profileId]
    );

    return {
      success: true,
      proposals: rows.map(function (r) {
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          votingOpensAt: r.voting_opens_at,
          votingClosesAt: r.voting_closes_at,
          alreadyVoted: r.already_voted === true || r.already_voted === 't',
        };
      }),
    };
  }

  function castVote(identity, proposalId, choice, complementText, correlationId) {
    S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);

    const id = S.normalizeText(proposalId);
    const choiceValue = S.normalizeText(choice);
    const complement = S.normalizeText(complementText);

    if ([C.VOTE_CHOICE.YES, C.VOTE_CHOICE.NO, C.VOTE_CHOICE.COMPLEMENT].indexOf(choiceValue) === -1) {
      throw E.ValidationError('Escolha de voto inválida.');
    }
    if (choiceValue === C.VOTE_CHOICE.COMPLEMENT) {
      if (!S.isLengthValid(complement, C.LIMITS.COMPLEMENT_MIN, C.LIMITS.COMPLEMENT_MAX)) {
        throw E.ValidationError('O complemento deve ter entre ' + C.LIMITS.COMPLEMENT_MIN + ' e ' + C.LIMITS.COMPLEMENT_MAX + ' caracteres.');
      }
    } else if (complement) {
      throw E.ValidationError('Complemento só é permitido quando a escolha é "complement".');
    }

    try {
      App.Database.execute(
        'INSERT INTO votes (proposal_id, profile_id, choice, complement_text) VALUES (?::uuid, ?::uuid, ?::vote_choice, ?)',
        [id, identity.profileId, choiceValue, choiceValue === C.VOTE_CHOICE.COMPLEMENT ? complement : null]
      );
    } catch (err) {
      const msg = String(err && err.message || '');
      if (msg.indexOf('votes_unique_per_profile') !== -1) throw E.ConflictError('Você já votou nesta proposta.');
      if (msg.indexOf('votação') !== -1 || msg.indexOf('não autorizada') !== -1) throw E.ConflictError('Não foi possível registrar o voto: votação fechada ou indisponível.');
      App.Logging.logError(correlationId, 'VOTE_FAILED', 'Falha ao registrar voto.', { proposalId: id });
      throw err;
    }

    App.Logging.logAudit(correlationId, identity.profileId, 'CAST_VOTE', 'proposal', id, 'success', { choice: choiceValue });
    return { success: true, message: 'Voto registrado com sucesso.' };
  }

  /**
   * Agregados de voto só são expostos quando autorizado pelo papel/momento:
   * admin sempre pode ver; member só depois que a votação foi encerrada
   * (evita efeito manada durante a votação em aberto); visitor nunca vê
   * agregados.
   */
  function getProposalResults(identity, proposalId) {
    const id = S.normalizeText(proposalId);
    const rows = App.Database.query(
      'SELECT id, title, description, status, voting_opens_at, voting_closes_at FROM proposals WHERE id = ?::uuid',
      [id]
    );
    if (!rows.length) throw E.NotFoundError('Proposta não encontrada.');
    const proposal = rows[0];

    const canSeeAggregate = identity && (identity.role === C.ROLES.ADMIN || (identity.role === C.ROLES.MEMBER && proposal.status === C.PROPOSAL_STATUS.VOTING_CLOSED));

    const response = {
      success: true,
      proposal: { id: proposal.id, title: proposal.title, description: proposal.description, status: proposal.status },
    };

    if (canSeeAggregate) {
      const tally = App.Database.query(
        "SELECT choice, count(*) AS total FROM votes WHERE proposal_id = ?::uuid GROUP BY choice",
        [id]
      );
      const counts = { yes: 0, no: 0, complement: 0 };
      tally.forEach(function (t) { counts[t.choice] = Number(t.total); });
      response.results = counts;
    }

    return response;
  }

  // ---------------------------------------------------------------------------
  // Administração
  // ---------------------------------------------------------------------------
  function assertAdmin(identity) {
    S.requireRole(identity, [C.ROLES.ADMIN]);
  }

  function listForReview(identity) {
    assertAdmin(identity);
    const rows = App.Database.query(
      'SELECT p.id AS id, p.title AS title, p.description AS description, p.status AS status, ' +
        '       p.created_at AS created_at, pr.full_name AS author_name ' +
        'FROM proposals p LEFT JOIN profiles pr ON pr.id = p.author_id ' +
        'ORDER BY p.created_at DESC',
      []
    );
    return { success: true, proposals: rows };
  }

  const PROPOSAL_TRANSITIONS = {
    submitted: ['approved', 'rejected'],
    approved: ['voting_open'],
    voting_open: ['voting_closed'],
    rejected: [],
    voting_closed: [],
  };

  function transitionProposal(identity, proposalId, newStatus, extra, correlationId) {
    assertAdmin(identity);
    const id = S.normalizeText(proposalId);
    const status = S.normalizeText(newStatus);

    if (Object.keys(PROPOSAL_TRANSITIONS).indexOf(status) === -1) throw E.ValidationError('Status inválido.');

    const current = App.Database.query('SELECT status FROM proposals WHERE id = ?::uuid', [id]);
    if (!current.length) throw E.NotFoundError('Proposta não encontrada.');

    const allowed = PROPOSAL_TRANSITIONS[current[0].status] || [];
    if (allowed.indexOf(status) === -1) throw E.ConflictError('Transição de status inválida.');

    if (status === C.PROPOSAL_STATUS.VOTING_OPEN) {
      const opensAt = extra && extra.votingOpensAt ? new Date(extra.votingOpensAt) : new Date();
      const closesAt = extra && extra.votingClosesAt ? new Date(extra.votingClosesAt) : null;
      if (!closesAt || isNaN(closesAt.getTime()) || closesAt <= opensAt) {
        throw E.ValidationError('Informe um prazo de encerramento de votação válido, posterior à abertura.');
      }
      App.Database.execute(
        "UPDATE proposals SET status = 'voting_open'::proposal_status, voting_opens_at = ?, voting_closes_at = ? WHERE id = ?::uuid",
        [opensAt.toISOString(), closesAt.toISOString(), id]
      );
    } else {
      App.Database.execute('UPDATE proposals SET status = ?::proposal_status WHERE id = ?::uuid', [status, id]);
    }

    App.Logging.logAudit(correlationId, identity.profileId, 'TRANSITION_PROPOSAL', 'proposal', id, 'success', { newStatus: status });
    return { success: true, message: 'Status da proposta atualizado.' };
  }

  return {
    submitProposal: submitProposal,
    listMyProposals: listMyProposals,
    listOpenForVoting: listOpenForVoting,
    castVote: castVote,
    getProposalResults: getProposalResults,
    listForReview: listForReview,
    transitionProposal: transitionProposal,
  };
})();
