/**
 * proposalService.js — porta fiel de src/services/ProposalService.gs.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

export async function submitProposal(sql, identity, input, correlationId) {
  const title = S.normalizeText(input.title);
  const description = S.normalizeText(input.description);

  if (!S.isLengthValid(title, C.LIMITS.TITLE_MIN, C.LIMITS.TITLE_MAX)) throw E.ValidationError('Título inválido.');
  if (!S.isLengthValid(description, C.LIMITS.DESCRIPTION_MIN, C.LIMITS.DESCRIPTION_MAX)) throw E.ValidationError('Descrição inválida.');

  const rows = await sql`
    INSERT INTO proposals (title, description, author_id, status) VALUES (${title}, ${description}, ${identity.profileId}::uuid, 'submitted'::proposal_status) RETURNING id
  `;

  const id = rows[0].id;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SUBMIT_PROPOSAL', 'proposal', id, 'success', null);
  return { success: true, message: 'Proposta enviada para análise.', proposalId: id };
}

export async function listMyProposals(sql, identity) {
  const rows = await sql`SELECT id, title, description, status, created_at FROM proposals WHERE author_id = ${identity.profileId}::uuid ORDER BY created_at DESC`;
  return { success: true, proposals: rows };
}

export async function listOpenForVoting(sql, identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);

  const rows = await sql`
    SELECT p.id AS id, p.title AS title, p.description AS description,
           p.voting_opens_at AS voting_opens_at, p.voting_closes_at AS voting_closes_at,
           (v.id IS NOT NULL) AS already_voted
    FROM proposals p
    LEFT JOIN votes v ON v.proposal_id = p.id AND v.profile_id = ${identity.profileId}::uuid
    WHERE p.status = 'voting_open'::proposal_status
    ORDER BY p.voting_closes_at ASC NULLS LAST
  `;

  return {
    success: true,
    proposals: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      votingOpensAt: r.voting_opens_at,
      votingClosesAt: r.voting_closes_at,
      alreadyVoted: r.already_voted === true,
    })),
  };
}

export async function castVote(sql, identity, proposalId, choice, complementText, correlationId) {
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
    await sql`
      INSERT INTO votes (proposal_id, profile_id, choice, complement_text)
      VALUES (${id}::uuid, ${identity.profileId}::uuid, ${choiceValue}::vote_choice, ${choiceValue === C.VOTE_CHOICE.COMPLEMENT ? complement : null})
    `;
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (msg.indexOf('votes_unique_per_profile') !== -1) throw E.ConflictError('Você já votou nesta proposta.');
    if (msg.indexOf('votação') !== -1 || msg.indexOf('não autorizada') !== -1) throw E.ConflictError('Não foi possível registrar o voto: votação fechada ou indisponível.');
    await Logging.logError(sql, correlationId, 'VOTE_FAILED', 'Falha ao registrar voto.', { proposalId: id });
    throw err;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'CAST_VOTE', 'proposal', id, 'success', { choice: choiceValue });
  return { success: true, message: 'Voto registrado com sucesso.' };
}

export async function getProposalResults(sql, identity, proposalId) {
  const id = S.normalizeText(proposalId);
  const rows = await sql`SELECT id, title, description, status, voting_opens_at, voting_closes_at FROM proposals WHERE id = ${id}::uuid`;
  if (!rows.length) throw E.NotFoundError('Proposta não encontrada.');
  const proposal = rows[0];

  const canSeeAggregate = identity && (identity.role === C.ROLES.ADMIN || (identity.role === C.ROLES.MEMBER && proposal.status === C.PROPOSAL_STATUS.VOTING_CLOSED));

  const response = {
    success: true,
    proposal: { id: proposal.id, title: proposal.title, description: proposal.description, status: proposal.status },
  };

  if (canSeeAggregate) {
    const tally = await sql`SELECT choice, count(*) AS total FROM votes WHERE proposal_id = ${id}::uuid GROUP BY choice`;
    const counts = { yes: 0, no: 0, complement: 0 };
    tally.forEach((t) => { counts[t.choice] = Number(t.total); });
    response.results = counts;
  }

  return response;
}

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

export async function listForReview(sql, identity) {
  assertAdmin(identity);
  const rows = await sql`
    SELECT p.id AS id, p.title AS title, p.description AS description, p.status AS status,
           p.created_at AS created_at, pr.full_name AS author_name
    FROM proposals p LEFT JOIN profiles pr ON pr.id = p.author_id
    ORDER BY p.created_at DESC
  `;
  return { success: true, proposals: rows };
}

const PROPOSAL_TRANSITIONS = {
  submitted: ['approved', 'rejected'],
  approved: ['voting_open'],
  voting_open: ['voting_closed'],
  rejected: [],
  voting_closed: [],
};

export async function transitionProposal(sql, identity, proposalId, newStatus, extra, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(proposalId);
  const status = S.normalizeText(newStatus);

  if (Object.keys(PROPOSAL_TRANSITIONS).indexOf(status) === -1) throw E.ValidationError('Status inválido.');

  const current = await sql`SELECT status FROM proposals WHERE id = ${id}::uuid`;
  if (!current.length) throw E.NotFoundError('Proposta não encontrada.');

  const allowed = PROPOSAL_TRANSITIONS[current[0].status] || [];
  if (allowed.indexOf(status) === -1) throw E.ConflictError('Transição de status inválida.');

  if (status === C.PROPOSAL_STATUS.VOTING_OPEN) {
    const opensAt = extra && extra.votingOpensAt ? new Date(extra.votingOpensAt) : new Date();
    const closesAt = extra && extra.votingClosesAt ? new Date(extra.votingClosesAt) : null;
    if (!closesAt || isNaN(closesAt.getTime()) || closesAt <= opensAt) {
      throw E.ValidationError('Informe um prazo de encerramento de votação válido, posterior à abertura.');
    }
    await sql`
      UPDATE proposals SET status = 'voting_open'::proposal_status, voting_opens_at = ${opensAt.toISOString()}, voting_closes_at = ${closesAt.toISOString()}
      WHERE id = ${id}::uuid
    `;
  } else {
    await sql`UPDATE proposals SET status = ${status}::proposal_status WHERE id = ${id}::uuid`;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'TRANSITION_PROPOSAL', 'proposal', id, 'success', { newStatus: status });
  return { success: true, message: 'Status da proposta atualizado.' };
}
