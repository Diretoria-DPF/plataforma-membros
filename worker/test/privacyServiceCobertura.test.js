/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Cobertura da exportação e da exclusão do titular (LGPD, art. 18), contra o esquema REAL (todas as migrações em PGlite).
 *
 * Percorre o catálogo do Postgres: toda coluna que aponta para profiles(id), e toda coluna chamada profile_id/profile_ref
 * sem chave estrangeira, precisa estar em COBERTAS (entra na exportação, na seção indicada) ou em EXCECOES (fica de fora
 * com motivo). Uma migração nova com coluna de perfil quebra este teste até alguém decidir onde ela entra.
 * Quem usa: `npm test -- -i privacy`.
 */
import * as Privacy from '../src/services/privacyService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const ADMIN = '88888888-8888-4888-8888-888888888881';
const ANA = '88888888-8888-4888-8888-888888888883';
const BIA = '88888888-8888-4888-8888-888888888884';
const CID = '00000000-0000-4000-8000-0000000000e1';
const admin = { profileId: ADMIN, role: 'admin', fullName: 'Diretoria Um' };
const ana = { profileId: ANA, role: 'member', fullName: 'Ana Souza Lima' };

/** tabela.coluna → seção de data na exportação. */
const COBERTAS = {
  'consents.profile_id': 'consents',
  'preferences.profile_id': 'preferences',
  'event_registrations.profile_id': 'events',
  'votes.profile_id': 'votes',
  'task_signups.profile_id': 'tasks',
  'feedback.profile_id': 'feedback',
  'proposals.author_id': 'proposalsAuthored',
  'task_comments.profile_id': 'taskComments',
  'connections.requester_id': 'connections',
  'connections.addressee_id': 'connections',
  'profile_blocks.blocker_id': 'blocks',
  'profile_reports.reporter_id': 'reportsMade',
  'message_penalties.profile_id': 'messagePenalties',
  'learning_attempts.profile_id': 'learning',
  'ai_usage_log.profile_id': 'aiUsage',
  'assistant_messages.profile_id': 'assistantMessages',
  'assistant_feedback.profile_id': 'assistantFeedback',
  'assistant_moderation.profile_id': 'assistantModeration',
  'assistant_incidents.profile_id': 'assistantIncidents',
  'library_favorites.profile_id': 'libraryFavorites',
  'library_suggestions.profile_id': 'librarySuggestions',
  'library_staff.profile_id': 'libraryStaff',
  'agent_traces.profile_id': 'agentTraces',
  'member_memory_consent.profile_id': 'memoryConsent',
  'member_roles.profile_id': 'memberRoles',
  'mentorships.mentor_id': 'mentorships',
  'mentorships.mentee_id': 'mentorships',
  'mentorships.requested_by': 'mentorships',
  'activity_days.profile_id': 'activityDays',
  'selection_applications.profile_id': 'selection',
  'account_deletion_requests.profile_id': 'deletionRequests',
  'lab_boletim_competencia.profile_id': 'labBoletim',
  'course_progress.profile_id': 'courseProgress',
  'assessment_attempts.profile_id': 'courseAttempts',
  'certificates.profile_id': 'certificates',
  'event_requirement_waivers.profile_id': 'eventWaivers',
};

const SEGREDO = 'segredo de segurança (hash, chave ou fator de autenticação): nunca sai da plataforma';
const INSTITUCIONAL = 'autoria institucional (quem criou, revisou ou decidiu um registro da liga); anonimizada na exclusão (SET NULL)';
const TERCEIRO = 'protege outra pessoa: revelaria quem bloqueou ou denunciou o titular';

/** tabela.coluna → motivo de ficar fora da exportação. */
const EXCECOES = {
  'account_tokens.profile_id': SEGREDO,
  'sessions.profile_id': SEGREDO + '; sessões são registro técnico com prazo de retenção',
  'mfa_credentials.profile_id': SEGREDO,
  'mfa_recovery_codes.profile_id': SEGREDO,
  'mfa_challenges.profile_id': SEGREDO,
  'messaging_keys.profile_id': SEGREDO + ' (material criptográfico das mensagens)',
  'conversations.participant_low': 'mensagens cifradas ponta a ponta: o servidor não consegue lê-las',
  'conversations.participant_high': 'mensagens cifradas ponta a ponta: o servidor não consegue lê-las',
  'messages.sender_id': 'mensagens cifradas ponta a ponta: o servidor não consegue lê-las',
  'message_hides.profile_id': 'marcação técnica de mensagens cifradas ocultas pela própria pessoa',
  'profile_blocks.blocked_id': TERCEIRO,
  'profile_reports.reported_profile_id': TERCEIRO,
  'profile_reports.resolved_by': INSTITUCIONAL,
  'audit_logs.actor_id': 'trilha de auditoria de segurança; anonimizada na exclusão (SET NULL)',
  'events.created_by': INSTITUCIONAL,
  'event_registrations.checked_in_by': INSTITUCIONAL,
  'tasks.created_by': INSTITUCIONAL,
  'clinical_cases.created_by': INSTITUCIONAL,
  'clinical_cases.reviewed_by': INSTITUCIONAL,
  'clinical_cases.clinical_reviewed_by': INSTITUCIONAL,
  'feature_flags.updated_by': INSTITUCIONAL,
  'library_articles.status_changed_by': INSTITUCIONAL,
  'library_articles.summary_updated_by': INSTITUCIONAL,
  'library_articles.summary_reviewed_by': INSTITUCIONAL,
  'library_articles.clinical_reviewed_by': INSTITUCIONAL,
  'library_articles.approved_by': INSTITUCIONAL,
  'library_articles.created_by': INSTITUCIONAL,
  'library_collections.created_by': INSTITUCIONAL,
  'library_suggestions.decided_by': INSTITUCIONAL,
  'library_staff.granted_by': INSTITUCIONAL,
  'library_removal_requests.requested_by': INSTITUCIONAL,
  'library_removal_requests.decided_by': INSTITUCIONAL,
  'member_roles.granted_by': INSTITUCIONAL,
  'selection_events.actor_id': INSTITUCIONAL,
  'selection_applications.decided_by': INSTITUCIONAL,
  'account_deletion_requests.processed_by': INSTITUCIONAL,
  'home_highlights.created_by': INSTITUCIONAL,
  'courses.published_by': INSTITUCIONAL,
  'certificates.revoked_by': INSTITUCIONAL,
  'event_requirements.created_by': INSTITUCIONAL,
  'event_requirement_waivers.granted_by': INSTITUCIONAL,
  'memory_purge_queue.profile_ref': 'fila técnica de apagamento da memória de estudo; a linha some quando o apagamento termina',
};

/** Colunas de perfil sem chave estrangeira: quem garante a exclusão. */
const SEM_FK_TRATADAS = {
  'account_deletion_requests.profile_id': 'zerada por completeDeletion',
  'memory_purge_queue.profile_ref': 'esvaziada pelo job de apagamento da memória',
};

let db;
let sql;
const rows = async (text, params = []) => (await db.query(text, params)).rows;

async function profileColumns() {
  const fks = await rows(`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.confdeltype AS on_delete
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'profiles'::regclass`);
  const named = await rows(`
    SELECT table_name AS tbl, column_name AS col FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('profile_id', 'profile_ref') AND table_name <> 'profiles'`);
  return { fks, named };
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.query('DELETE FROM profiles WHERE id = ANY($1::uuid[])', [[ANA, BIA]]);
  const people = [[ADMIN, 'admin', 1, 'Diretoria Um'], [ANA, 'member', 3, 'Ana Souza Lima'], [BIA, 'member', 4, 'Bia Costa']];
  for (const [id, role, n, name] of people) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, city, status, email_confirmed_at)
       VALUES ($1, $3, 'cob${n}', 'cob${n}@exemplo.com', 'HASH-SECRETO-${n}', '1199966000${n}', $2, 'Recife', 'active', now())
       ON CONFLICT (id) DO NOTHING`,
      [id, role, name],
    );
  }
});

describe('mapa do esquema', () => {
  test('toda coluna de perfil está na exportação ou nas exceções justificadas, e nada sobra no mapa', async () => {
    const { fks, named } = await profileColumns();
    const found = new Set([...fks, ...named].map((r) => r.tbl + '.' + r.col));
    const declared = new Set([...Object.keys(COBERTAS), ...Object.keys(EXCECOES)]);
    expect([...found].filter((k) => !declared.has(k)).sort()).toEqual([]);
    expect([...declared].filter((k) => !found.has(k)).sort()).toEqual([]);
    expect(Object.keys(COBERTAS).filter((k) => k in EXCECOES)).toEqual([]);
  });

  test('toda chave estrangeira para profiles apaga em cascata ou anonimiza (nenhuma bloqueia a exclusão)', async () => {
    const { fks, named } = await profileColumns();
    expect(fks.filter((r) => !['c', 'n'].includes(r.on_delete)).map((r) => r.tbl + '.' + r.col)).toEqual([]);
    const fkSet = new Set(fks.map((r) => r.tbl + '.' + r.col));
    const semFk = named.map((r) => r.tbl + '.' + r.col).filter((k) => !fkSet.has(k)).sort();
    expect(semFk).toEqual(Object.keys(SEM_FK_TRATADAS).sort());
  });
});

async function seedAna() {
  const [task] = await rows("INSERT INTO tasks (title, description, status) VALUES ('Mutirão de cartazes', 'Descrição longa', 'draft') RETURNING id");
  await db.query("INSERT INTO task_comments (task_id, profile_id, message) VALUES ($1, $2, 'Meu comentário na tarefa'), ($1, $3, 'COMENTARIO-DA-BIA')", [task.id, ANA, BIA]);
  await db.query("INSERT INTO proposals (title, description, author_id) VALUES ('Minha proposta', 'Descrição da proposta', $1), ('PROPOSTA-DA-BIA', 'Descrição', $2)", [ANA, BIA]);
  await db.query("INSERT INTO profile_reports (reporter_id, reported_profile_id, category, details, evidence_excerpt, resolution_note) VALUES ($1, $2, 'spam', 'Meu relato', 'TRECHO-DE-TERCEIRO', 'NOTA-DA-MODERACAO')", [ANA, BIA]);
  await db.query("INSERT INTO profile_reports (reporter_id, reported_profile_id, category, details) VALUES ($1, $2, 'harassment', 'RELATO-DA-BIA-CONTRA-ANA')", [BIA, ANA]);
  await db.query("INSERT INTO message_penalties (profile_id, burst_count, mute_strikes, muted_until) VALUES ($1, 2, 1, now() + interval '1 hour')", [ANA]);
  await db.query("INSERT INTO ai_usage_log (profile_id, feature, model, key_index, prompt_tokens, completion_tokens, ok) VALUES ($1, 'chat', 'modelo-x', 3, 10, 20, true), ($2, 'chat', 'MODELO-DA-BIA', 1, 1, 1, true)", [ANA, BIA]);
  await db.query("INSERT INTO assistant_moderation (profile_id, level) VALUES ($1, 1)", [ANA]);
  await db.query("INSERT INTO assistant_incidents (profile_id, detection, level_after) VALUES ($1, 'terms', 1)", [ANA]);
  await db.query(`INSERT INTO agent_traces (trace_id, profile_id, persona, persona_version, persona_hash, feature, model, tokens_in, tokens_out, outcome, decisions)
    VALUES (gen_random_uuid(), $1, 'tutor-clinico', '1.0.0', 'abcdefabcdef', 'tutor', 'modelo-y', 5, 6, 'answered', '{"interno":"DECISAO-INTERNA"}'::jsonb)`, [ANA]);
  await db.query("INSERT INTO lab_boletim_competencia (profile_id, competencia, acertos, erros) VALUES ($1, 'diluicao', 7, 2), ($2, 'pesagem', 99, 0)", [ANA, BIA]);
  await db.query("INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at) VALUES ($1, 'granted', 'estudo-1.0', now())", [ANA]);
  await db.query("INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador')", [ANA]);
  await db.query("INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at) SELECT $1, e.enumlabel::account_token_type, 'TOKEN-HASH-SECRETO', now() + interval '1 day' FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'account_token_type' LIMIT 1", [ANA]);
  await db.query("INSERT INTO sessions (profile_id, token_hash, expires_at) VALUES ($1, 'SESSAO-HASH-SECRETO', now() + interval '1 day')", [ANA]);
  await db.query("INSERT INTO mfa_credentials (profile_id, secret_enc) VALUES ($1, 'MFA-SEGREDO-CIFRADO')", [ANA]);
  await Privacy.requestDeletion(sql, ana, { reason: 'Meu motivo' }, CID);
}

describe('seções novas da exportação', () => {
  beforeEach(async () => {
    await db.exec('TRUNCATE account_deletion_requests, rate_limit_buckets, audit_logs');
    await db.exec("DELETE FROM profile_reports; DELETE FROM proposals; DELETE FROM tasks; DELETE FROM ai_usage_log; DELETE FROM agent_traces");
  });

  test('traz só as linhas da própria pessoa, sem segredos, conteúdo de terceiros nem notas internas', async () => {
    await seedAna();
    const out = await Privacy.exportMyData(sql, ana, CID);
    const d = out.data;
    expect(d.taskComments).toEqual([expect.objectContaining({ task: 'Mutirão de cartazes', message: 'Meu comentário na tarefa' })]);
    expect(d.proposalsAuthored).toEqual([expect.objectContaining({ title: 'Minha proposta' })]);
    expect(d.reportsMade).toEqual([expect.objectContaining({ reported: 'cob4', category: 'spam', details: 'Meu relato', status: 'open' })]);
    expect(d.messagePenalties).toEqual(expect.objectContaining({ muteStrikes: 1 }));
    expect(d.aiUsage).toEqual([expect.objectContaining({ feature: 'chat', model: 'modelo-x', promptTokens: 10, completionTokens: 20, ok: true })]);
    expect(d.assistantModeration).toEqual(expect.objectContaining({ level: 1 }));
    expect(d.assistantIncidents).toEqual([expect.objectContaining({ detection: 'terms', levelAfter: 1 })]);
    expect(d.agentTraces).toEqual([expect.objectContaining({ persona: 'tutor-clinico', feature: 'tutor', outcome: 'answered', tokensIn: 5, tokensOut: 6 })]);
    expect(d.labBoletim).toEqual([expect.objectContaining({ competencia: 'diluicao', acertos: 7, erros: 2 })]);
    expect(d.memoryConsent).toEqual(expect.objectContaining({ status: 'granted', purposeVersion: 'estudo-1.0' }));
    expect(d.libraryStaff).toEqual([expect.objectContaining({ role: 'curador' })]);
    expect(d.deletionRequests).toEqual([expect.objectContaining({ status: 'requested', reason: 'Meu motivo' })]);
    const text = JSON.stringify(out);
    for (const banned of ['COMENTARIO-DA-BIA', 'PROPOSTA-DA-BIA', 'TRECHO-DE-TERCEIRO', 'NOTA-DA-MODERACAO', 'RELATO-DA-BIA-CONTRA-ANA',
      'MODELO-DA-BIA', 'DECISAO-INTERNA', 'abcdefabcdef', 'pesagem', 'TOKEN-HASH-SECRETO', 'SESSAO-HASH-SECRETO', 'MFA-SEGREDO-CIFRADO',
      'HASH-SECRETO', 'keyIndex', 'key_index', 'Bia Costa', 'cob4@exemplo.com']) expect(text).not.toContain(banned);
  });

  test('cada seção coberta existe na exportação, mesmo vazia', async () => {
    const out = await Privacy.exportMyData(sql, ana, CID);
    for (const key of new Set(Object.values(COBERTAS))) expect(out.data).toHaveProperty(key);
  });

  test('uma seção que falha é registrada só com código, sem a mensagem do banco', async () => {
    const failing = async (strings, ...values) => {
      const text = strings.join('?');
      if (/FROM task_comments/.test(text)) throw Object.assign(new Error('valor "' + ANA + '" inválido'), { code: '22P02' });
      return sql(strings, ...values);
    };
    const out = await Privacy.exportMyData(failing, ana, CID);
    expect(out.data.taskComments).toEqual([]);
    const logged = JSON.stringify(await rows('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 5'));
    expect(logged).toContain('taskComments');
    expect(logged).not.toContain(ANA);
  });
});

describe('exclusão cobre todas as colunas de perfil', () => {
  test('depois de concluir, nenhuma tabela aponta para a pessoa (exceto a fila técnica de apagamento)', async () => {
    await db.exec('TRUNCATE account_deletion_requests, rate_limit_buckets');
    await seedAna();
    const [{ id }] = await rows("SELECT id FROM account_deletion_requests WHERE status = 'requested'");
    await Privacy.completeDeletion(sql, admin, { id }, CID, { stepUp: async () => {} });
    const { fks, named } = await profileColumns();
    const all = new Map([...fks, ...named].map((r) => [r.tbl + '.' + r.col, r]));
    const restantes = [];
    for (const [key, r] of all) {
      if (key === 'memory_purge_queue.profile_ref') continue;
      const [{ n }] = await rows(`SELECT count(*)::int AS n FROM ${r.tbl} WHERE ${r.col} = $1`, [ANA]);
      if (n) restantes.push(key);
    }
    expect(restantes).toEqual([]);
    expect(await rows('SELECT 1 FROM lab_boletim_competencia WHERE profile_id = $1', [BIA])).toHaveLength(1);
  });
});
