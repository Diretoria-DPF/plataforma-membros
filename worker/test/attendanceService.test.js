import * as AttendanceService from '../src/services/attendanceService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

// Fase 2 — Dados & Presença: QR assinado, check-in, busca, CSV e crachás.
const ADMIN = { profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin', email: 'admin@x.com', fullName: 'Admin' };
const MEMBER = { profileId: '11111111-1111-4111-8111-111111111111', role: 'member', email: 'membro@x.com', fullName: 'Membro' };
const VISITOR = { profileId: '22222222-2222-4222-8222-222222222222', role: 'visitor', email: 'visitante@x.com', fullName: 'Visitante' };
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RATE_OK = [{ attempts: 1 }];
const OPEN_EVENT = [{ id: EVENT_ID, title: 'Simpósio', status: 'in_progress' }];
const PERSON = [{ id: MEMBER.profileId, full_name: 'Ana Souza', role: 'member', status: 'active', email_confirmed_at: '2026-01-01' }];

function boundValues(sql, callIndex) {
  return sql.mock.calls[callIndex].slice(1);
}
function queryText(sql, callIndex) {
  const first = sql.mock.calls[callIndex][0];
  return Array.isArray(first) ? first.join('?') : String(first);
}
function flipChar(c) {
  return c === 'A' ? 'B' : 'A';
}

describe('QR de presença v2 (HMAC com chave derivada do pepper)', () => {
  const env = makeEnv();

  test('formato LAIFT:v2:<profileId>.<assinatura base64url de 24 caracteres>', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    expect(qr).toMatch(/^LAIFT:v2:11111111-1111-4111-8111-111111111111\.[A-Za-z0-9_-]{24}$/);
    // Determinístico: o mesmo perfil sempre gera o mesmo QR (crachá impresso continua valendo).
    expect(await AttendanceService.signAttendanceQr(env, MEMBER.profileId.toUpperCase())).toBe(qr);
  });

  test('assinatura válida → devolve o profileId', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    expect(await AttendanceService.verifyAttendanceQr(env, qr)).toBe(MEMBER.profileId);
    expect(await AttendanceService.verifyAttendanceQr(env, '  ' + qr + '\n')).toBe(MEMBER.profileId);
  });

  test('assinatura adulterada (1 caractere) → null', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const last = qr.slice(-1);
    expect(await AttendanceService.verifyAttendanceQr(env, qr.slice(0, -1) + flipChar(last))).toBeNull();
  });

  test('assinatura de uma pessoa colada no ID de outra → null', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const forged = qr.replace(MEMBER.profileId, VISITOR.profileId);
    expect(await AttendanceService.verifyAttendanceQr(env, forged)).toBeNull();
  });

  test('QR assinado com outro pepper (outro ambiente/pepper rotacionado) → null', async () => {
    const qr = await AttendanceService.signAttendanceQr(makeEnv({ SESSION_TOKEN_PEPPER: 'outro-pepper' }), MEMBER.profileId);
    expect(await AttendanceService.verifyAttendanceQr(env, qr)).toBeNull();
  });

  test.each([
    ['formato antigo por e-mail', 'LAIFT:ID:membro@x.com'],
    ['formato antigo v1', 'LAIFT:v1:' + 'a'.repeat(64)],
    ['sem assinatura', 'LAIFT:v2:' + MEMBER.profileId],
    ['assinatura curta', 'LAIFT:v2:' + MEMBER.profileId + '.abc'],
    ['lixo', 'qualquer coisa'],
    ['vazio', ''],
    ['nulo', null],
  ])('formato inválido (%s) → null', async (_label, payload) => {
    expect(await AttendanceService.verifyAttendanceQr(env, payload)).toBeNull();
  });

  test('separação de domínio: a assinatura NÃO é HMAC(pepper, mensagem) direto', async () => {
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const enc = new TextEncoder();
    const rawKey = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_TOKEN_PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const direct = new Uint8Array(await crypto.subtle.sign('HMAC', rawKey, enc.encode('LAIFT:v2:' + MEMBER.profileId))).slice(0, 18);
    const directB64 = btoa(String.fromCharCode(...direct)).replace(/\+/g, '-').replace(/\//g, '_');
    expect(qr.split('.')[1]).not.toBe(directB64);
  });

  test('getMyAttendanceQr usa a identidade da sessão', async () => {
    const res = await AttendanceService.getMyAttendanceQr(env, VISITOR);
    expect(res.success).toBe(true);
    expect(await AttendanceService.verifyAttendanceQr(env, res.qrPayload)).toBe(VISITOR.profileId);
  });
});

describe('AttendanceService.checkIn', () => {
  test('não-admin → ForbiddenError sem nenhuma consulta', async () => {
    const sql = makeSql();
    await expect(AttendanceService.checkIn(sql, makeEnv(), MEMBER, { eventId: EVENT_ID, method: 'manual', email: 'a@x.com' }, 'cid'))
      .rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('rate limit por admin', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 901 }]);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'manual', email: 'a@x.com' }, 'cid'))
      .rejects.toMatchObject({ name: 'RateLimitError' });
    expect(boundValues(sql, 0)).toContain('attendance_checkin');
  });

  test.each([
    ['evento inválido', { eventId: 'nao-e-uuid', method: 'manual', email: 'a@x.com' }, 'Selecione um evento válido.'],
    ['método desconhecido', { eventId: EVENT_ID, method: 'foto', email: 'a@x.com' }, 'Método de check-in inválido.'],
    ['manual sem e-mail válido', { eventId: EVENT_ID, method: 'manual', email: 'x' }, 'Informe um e-mail válido.'],
    ['manual com profileId no lugar do e-mail', { eventId: EVENT_ID, method: 'manual', profileId: MEMBER.profileId }, 'Informe um e-mail válido.'],
    ['lista sem profileId', { eventId: EVENT_ID, method: 'lista', email: 'a@x.com' }, 'Participante inválido.'],
    ['qr sem payload', { eventId: EVENT_ID, method: 'qr', profileId: MEMBER.profileId }, 'QR Code ausente ou inválido.'],
  ])('validação: %s', async (_label, input, message) => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, input, 'cid')).rejects.toMatchObject({ name: 'ValidationError', message });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('QR adulterado → recusado, com auditoria de falha e sem consultar evento/perfil', async () => {
    const env = makeEnv();
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const tampered = qr.slice(0, -1) + flipChar(qr.slice(-1));
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(undefined);
    await expect(AttendanceService.checkIn(sql, env, ADMIN, { eventId: EVENT_ID, method: 'qr', qrPayload: tampered }, 'cid'))
      .rejects.toMatchObject({ name: 'ValidationError', message: expect.stringContaining('QR Code inválido ou adulterado') });
    expect(sql).toHaveBeenCalledTimes(2);
    expect(queryText(sql, 1)).toContain('INSERT INTO audit_logs');
    expect(boundValues(sql, 1)).toContain('failure');
  });

  test('QR válido de quem já estava inscrito → marca presença (UPDATE) com admin e método', async () => {
    const env = makeEnv();
    const qr = await AttendanceService.signAttendanceQr(env, MEMBER.profileId);
    const sql = makeSql();
    sql
      .mockResolvedValueOnce(RATE_OK)
      .mockResolvedValueOnce(OPEN_EVENT)
      .mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([{ checked_in_at: '2026-09-26T12:00:00Z' }]) // UPDATE … RETURNING
      .mockResolvedValueOnce(undefined); // auditoria
    const res = await AttendanceService.checkIn(sql, env, ADMIN, { eventId: EVENT_ID, method: 'qr', qrPayload: qr }, 'cid');
    expect(res).toEqual({
      success: true,
      message: 'Presença registrada: Ana Souza.',
      participant: { profileId: MEMBER.profileId, fullName: 'Ana Souza', role: 'member', alreadyCheckedIn: false, walkIn: false, checkedInAt: '2026-09-26T12:00:00Z' },
    });
    expect(boundValues(sql, 2)).toEqual([MEMBER.profileId]); // perfil = o do QR verificado
    expect(queryText(sql, 3)).toContain('UPDATE event_registrations');
    expect(queryText(sql, 3)).toContain('checked_in_at IS NULL');
    expect(boundValues(sql, 3)).toEqual([ADMIN.profileId, 'qr', EVENT_ID, MEMBER.profileId]);
    expect(env.HOT_CACHE.delete).not.toHaveBeenCalled(); // contagem de inscritos não mudou
  });

  test('segundo check-in é idempotente → alreadyCheckedIn: true, nada é regravado', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce(RATE_OK)
      .mockResolvedValueOnce(OPEN_EVENT)
      .mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([]) // UPDATE não pega nada (já tinha presença)
      .mockResolvedValueOnce([{ checked_in_at: '2026-09-26T10:00:00Z' }]) // SELECT existente
      .mockResolvedValueOnce(undefined);
    const res = await AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid');
    expect(res.participant).toMatchObject({ alreadyCheckedIn: true, walkIn: false, checkedInAt: '2026-09-26T10:00:00Z' });
    expect(res.message).toBe('Ana Souza já estava com presença registrada neste evento.');
    expect(sql).toHaveBeenCalledTimes(6); // nenhum INSERT
    expect(JSON.parse(boundValues(sql, 5).slice(-1)[0])).toMatchObject({ alreadyCheckedIn: true });
  });

  test('quem não se inscreveu antes (entrada na porta) → cria a inscrição já com presença e invalida o cache de eventos', async () => {
    const env = makeEnv();
    const sql = makeSql();
    sql
      .mockResolvedValueOnce(RATE_OK)
      .mockResolvedValueOnce(OPEN_EVENT)
      .mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ checked_in_at: '2026-09-26T12:00:00Z' }]) // INSERT … RETURNING
      .mockResolvedValueOnce(undefined);
    const res = await AttendanceService.checkIn(sql, env, ADMIN, { eventId: EVENT_ID, method: 'manual', email: ' Ana@X.com ' }, 'cid');
    expect(boundValues(sql, 2)).toEqual(['ana@x.com']);
    expect(queryText(sql, 5)).toContain('INSERT INTO event_registrations');
    expect(boundValues(sql, 5)).toEqual([EVENT_ID, MEMBER.profileId, ADMIN.profileId, 'manual']);
    expect(res.participant).toMatchObject({ walkIn: true, alreadyCheckedIn: false });
    expect(res.message).toContain('inscrição criada na portaria');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:events:members:v2');
  });

  test.each([
    ['capacidade (gatilho)', 'Evento sem vagas disponíveis.', 'Evento lotado'],
    ['visibilidade (gatilho)', 'Este evento é exclusivo para membros.', 'Evento exclusivo para membros: Ana Souza'],
  ])('entrada na porta barrada por %s → mensagem clara ao admin + auditoria de falha', async (_label, triggerMessage, expected) => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce(RATE_OK)
      .mockResolvedValueOnce(OPEN_EVENT)
      .mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error(triggerMessage))
      .mockResolvedValueOnce(undefined);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid'))
      .rejects.toMatchObject({ name: 'ConflictError', message: expect.stringContaining(expected) });
    expect(queryText(sql, 6)).toContain('INSERT INTO audit_logs');
    expect(boundValues(sql, 6)).toContain('failure');
  });

  test('corrida (inscrição criada no mesmo instante por outro terminal) → tenta de novo o UPDATE', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce(RATE_OK)
      .mockResolvedValueOnce(OPEN_EVENT)
      .mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "event_registrations_unique"'))
      .mockResolvedValueOnce([]) // o outro terminal já registrou a presença
      .mockResolvedValueOnce(undefined);
    const res = await AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid');
    expect(res.participant.alreadyCheckedIn).toBe(true);
  });

  test('erro inesperado do banco não é mascarado como mensagem de negócio', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce(RATE_OK)
      .mockResolvedValueOnce(OPEN_EVENT)
      .mockResolvedValueOnce(PERSON)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('connection reset'));
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid'))
      .rejects.toThrow('connection reset');
  });

  test('evento inexistente → NotFoundError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([]);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid'))
      .rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test.each(['draft', 'closed', 'completed', 'archived'])('evento %s → check-in fechado', async (status) => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce([{ id: EVENT_ID, title: 'X', status }]);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid'))
      .rejects.toMatchObject({ name: 'ConflictError', message: expect.stringContaining('publicados ou em andamento') });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  test('e-mail sem conta → orienta o cadastro', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(OPEN_EVENT).mockResolvedValueOnce([]);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'manual', email: 'nova@x.com' }, 'cid'))
      .rejects.toMatchObject({ name: 'NotFoundError', message: expect.stringContaining('precisa se cadastrar') });
  });

  test.each([
    ['banida', { status: 'banned' }, 'banida'],
    ['sem e-mail confirmado', { email_confirmed_at: null }, 'não confirmou o e-mail'],
  ])('conta %s → recusada antes de gravar', async (_label, override, expected) => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(RATE_OK).mockResolvedValueOnce(OPEN_EVENT).mockResolvedValueOnce([Object.assign({}, PERSON[0], override)]);
    await expect(AttendanceService.checkIn(sql, makeEnv(), ADMIN, { eventId: EVENT_ID, method: 'lista', profileId: MEMBER.profileId }, 'cid'))
      .rejects.toMatchObject({ name: 'ConflictError', message: expect.stringContaining(expected) });
    expect(sql).toHaveBeenCalledTimes(3);
  });
});

describe('AttendanceService.listEvents / search', () => {
  test('listEvents: só admin', async () => {
    await expect(AttendanceService.listEvents(makeSql(), VISITOR)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('listEvents: contagens numéricas e checkInOpen por status', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { id: 'e1', title: 'A', event_date: '2026-09-26', status: 'in_progress', capacity: 50, registered_count: 12, checked_in_count: 7 },
      { id: 'e2', title: 'B', event_date: '2026-09-01', status: 'completed', capacity: null, registered_count: '3', checked_in_count: '3' },
    ]);
    const res = await AttendanceService.listEvents(sql, ADMIN);
    expect(res.events).toEqual([
      { id: 'e1', title: 'A', eventDate: '2026-09-26', status: 'in_progress', capacity: 50, registeredCount: 12, checkedInCount: 7, checkInOpen: true },
      { id: 'e2', title: 'B', eventDate: '2026-09-01', status: 'completed', capacity: null, registeredCount: 3, checkedInCount: 3, checkInOpen: false },
    ]);
  });

  test('search: só admin', async () => {
    await expect(AttendanceService.search(makeSql(), MEMBER, { eventId: EVENT_ID, term: 'ana' })).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('search sem termo → lista nominal dos inscritos do evento', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'p1', full_name: 'Ana', email: 'ana@x.com', role: 'member', registration_id: 'r1', checked_in_at: null }]);
    const res = await AttendanceService.search(sql, ADMIN, { eventId: EVENT_ID, term: '' });
    expect(res.participants).toEqual([{ profileId: 'p1', fullName: 'Ana', email: 'ana@x.com', role: 'member', registered: true, checkedInAt: null }]);
    expect(queryText(sql, 0)).toContain('FROM event_registrations r');
  });

  test('search com termo curto → validação', async () => {
    await expect(AttendanceService.search(makeSql(), ADMIN, { eventId: EVENT_ID, term: 'a' })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('search escapa curingas do LIKE (nada de "%" listar todo mundo)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'p2', full_name: 'Beto', email: 'b@x.com', role: 'visitor', registration_id: null, checked_in_at: null }]);
    const res = await AttendanceService.search(sql, ADMIN, { eventId: EVENT_ID, term: '50%_a\\' });
    expect(boundValues(sql, 0)).toContain('%50\\%\\_a\\\\%');
    expect(res.participants[0]).toMatchObject({ registered: false, checkedInAt: null });
  });
});

describe('AttendanceService.exportCsv', () => {
  const EVENT_ROW = [{ id: EVENT_ID, title: 'Simpósio de Toxicologia & Antídotos', event_date: '2026-09-26T13:00:00Z' }];
  const ROWS = [
    { full_name: '=HYPERLINK("http://mal.example")', email: '+551199@x.com', role: 'member', registered_at: '2026-09-20T12:00:00Z', checked_in_at: '2026-09-26T13:05:00Z', checkin_method: 'qr', checked_in_by_name: 'Admin' },
    { full_name: '-Traço', email: '@arroba@x.com', role: 'visitor', registered_at: '2026-09-21T12:00:00Z', checked_in_at: null, checkin_method: null, checked_in_by_name: null },
    { full_name: '\tTab "aspas"', email: 'ok@x.com', role: 'admin', registered_at: null, checked_in_at: null, checkin_method: null, checked_in_by_name: null },
  ];

  test('só admin', async () => {
    await expect(AttendanceService.exportCsv(makeSql(), MEMBER, { eventId: EVENT_ID }, 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('neutraliza injeção de fórmula e escapa aspas; RFC 4180 por padrão', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(EVENT_ROW).mockResolvedValueOnce(ROWS).mockResolvedValueOnce(undefined);
    const res = await AttendanceService.exportCsv(sql, ADMIN, { eventId: EVENT_ID }, 'cid');
    expect(res.success).toBe(true);
    expect(res.rows).toBe(3);
    expect(res.filename).toBe('presenca-simposio-de-toxicologia-antidotos-2026-09-26.csv');
    const lines = res.csv.split('\r\n');
    expect(lines[0]).toBe('"Nome","E-mail","Papel","Inscrito em","Presente","Check-in em","Método","Registrado por"');
    expect(lines[1].startsWith('"\'=HYPERLINK(""http://mal.example"")","\'+551199@x.com","Membro",')).toBe(true);
    expect(lines[1]).toContain('"Sim"');
    expect(lines[1]).toContain('"QR Code","Admin"');
    expect(lines[2].startsWith('"\'-Traço","\'@arroba@x.com","Visitante",')).toBe(true);
    expect(lines[2]).toContain('"Não","",""');
    expect(lines[3].startsWith('"\'\tTab ""aspas""","ok@x.com","Administrador",""')).toBe(true);
    expect(res.csv.charCodeAt(0)).not.toBe(0xfeff);
    // Auditoria da exportação, sem dado pessoal no detalhe.
    expect(boundValues(sql, 2)).toContain('ATTENDANCE_EXPORT_CSV');
    expect(boundValues(sql, 2).slice(-1)[0]).toBe(JSON.stringify({ rows: 3 }));
  });

  test('excel: true → BOM UTF-8 e ";" como separador', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(EVENT_ROW).mockResolvedValueOnce([ROWS[0]]).mockResolvedValueOnce(undefined);
    const res = await AttendanceService.exportCsv(sql, ADMIN, { eventId: EVENT_ID, excel: true }, 'cid');
    expect(res.csv.charCodeAt(0)).toBe(0xfeff);
    expect(res.csv.slice(1).split('\r\n')[0]).toBe('"Nome";"E-mail";"Papel";"Inscrito em";"Presente";"Check-in em";"Método";"Registrado por"');
  });

  test('evento inexistente → NotFoundError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(AttendanceService.exportCsv(sql, ADMIN, { eventId: EVENT_ID }, 'cid')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test.each([
    ['=1+1', '"\'=1+1"'], ['+1', '"\'+1"'], ['-1', '"\'-1"'], ['@SUM(A1)', '"\'@SUM(A1)"'],
    ['\r=x', '"\'\r=x"'], ['normal', '"normal"'], [null, '""'], ['a"b', '"a""b"'], ['1=1', '"1=1"'],
  ])('csvCell(%j) → %s', (input, expected) => {
    expect(AttendanceService.csvCell(input)).toBe(expected);
  });
});

describe('AttendanceService.badges', () => {
  test('só admin', async () => {
    await expect(AttendanceService.badges(makeSql(), makeEnv(), MEMBER, { profileIds: [MEMBER.profileId] }, 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test.each([
    ['lista ausente', {}, 'Selecione ao menos um participante.'],
    ['lista vazia', { profileIds: [] }, 'Selecione ao menos um participante.'],
    ['ID inválido', { profileIds: ['1 OR 1=1'] }, 'Lista de participantes inválida.'],
    ['mais de 200', { profileIds: Array.from({ length: 201 }, () => MEMBER.profileId) }, 'No máximo 200 crachás por impressão.'],
  ])('validação: %s', async (_label, input, message) => {
    const sql = makeSql();
    await expect(AttendanceService.badges(sql, makeEnv(), ADMIN, input, 'cid')).rejects.toMatchObject({ name: 'ValidationError', message });
    expect(sql).not.toHaveBeenCalled();
  });

  test('devolve nome, papel e QR v2 verificável, na ordem pedida, sem duplicatas e sem contas inexistentes', async () => {
    const env = makeEnv();
    const sql = makeSql();
    const missing = '99999999-9999-4999-8999-999999999999';
    sql
      .mockResolvedValueOnce([
        { id: VISITOR.profileId, full_name: 'Beto', role: 'visitor', league_position: null },
        { id: MEMBER.profileId, full_name: 'Ana', role: 'member', league_position: 'diretor' },
      ])
      .mockResolvedValueOnce(undefined);
    const res = await AttendanceService.badges(sql, env, ADMIN, { profileIds: [MEMBER.profileId, VISITOR.profileId.toUpperCase(), MEMBER.profileId, missing] }, 'cid');
    expect(boundValues(sql, 0)[0]).toEqual([MEMBER.profileId, VISITOR.profileId, missing]);
    expect(res.badges.map((b) => [b.profileId, b.fullName, b.role, b.leaguePosition])).toEqual([
      [MEMBER.profileId, 'Ana', 'member', 'diretor'],
      [VISITOR.profileId, 'Beto', 'visitor', null],
    ]);
    for (const b of res.badges) {
      expect(await AttendanceService.verifyAttendanceQr(env, b.qrPayload)).toBe(b.profileId);
    }
    expect(JSON.parse(boundValues(sql, 1).slice(-1)[0])).toEqual({ requested: 3, issued: 2 });
  });
});
