/**
 * orgChartService.js
 * Fluxograma de membros da liga: cargo de liderança e diretoria são
 * puramente organizacionais/visuais, independentes de `role`
 * (visitor/member/admin), que continua controlando só permissão de
 * acesso — ver sql/008_league_org_chart.sql.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { getCached, setCached, invalidateCached, CACHE_KEYS, CACHE_TTL_SECONDS } from '../cache.js';

const LEAGUE_POSITIONS = Object.values(C.LEAGUE_POSITION);
const DIRECTORATES = Object.values(C.DIRECTORATE);

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

export async function setMemberPosition(sql, env, identity, targetProfileId, input, correlationId) {
  assertAdmin(identity);
  const targetId = S.normalizeText(targetProfileId);
  const leaguePosition = S.normalizeText(input && input.leaguePosition) || null;
  const directorateValue = S.normalizeText(input && input.directorate) || null;

  if (leaguePosition && LEAGUE_POSITIONS.indexOf(leaguePosition) === -1) throw E.ValidationError('Cargo inválido.');
  if (directorateValue && DIRECTORATES.indexOf(directorateValue) === -1) throw E.ValidationError('Diretoria inválida.');

  // Mesma regra do CHECK constraint em profiles — validada aqui também
  // pra devolver uma mensagem amigável em vez do erro bruto do banco.
  if (leaguePosition === C.LEAGUE_POSITION.DIRETOR && !directorateValue) {
    throw E.ValidationError('O cargo de Diretor precisa estar vinculado a uma diretoria.');
  }
  if (leaguePosition && leaguePosition !== C.LEAGUE_POSITION.DIRETOR && directorateValue) {
    throw E.ValidationError('Este cargo não pode estar vinculado a uma diretoria específica.');
  }

  const targetRows = await sql`SELECT role FROM profiles WHERE id = ${targetId}::uuid`;
  if (!targetRows.length) throw E.NotFoundError('Usuário não encontrado.');
  // Visitantes ficam fora do fluxograma até serem promovidos a membro —
  // podem participar, mas não assumem cargo/diretoria ainda.
  if (['member', 'admin'].indexOf(targetRows[0].role) === -1) {
    throw E.ConflictError('Somente membros e administradores podem receber cargo ou diretoria.');
  }

  await sql`
    UPDATE profiles SET league_position = ${leaguePosition}::league_position, directorate = ${directorateValue}::directorate
    WHERE id = ${targetId}::uuid
  `;
  await invalidateCached(env, CACHE_KEYS.ORG_CHART);

  await Logging.logAudit(sql, correlationId, identity.profileId, 'SET_LEAGUE_POSITION', 'profile', targetId, 'success', {
    leaguePosition, directorate: directorateValue,
  });
  return { success: true, message: 'Cargo e diretoria atualizados.' };
}

/**
 * Fluxograma completo — só membros/admins visualizam (achado explícito
 * do pedido: "somente os usuarios que forem membros poderão
 * visualizar esse fluxograma"). Visitantes nunca aparecem nele.
 */
export async function getOrgChart(sql, env, identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);

  // Seguro cachear em bloco único (não filtrado por identidade): o
  // conteúdo do fluxograma é idêntico para qualquer membro/admin que
  // passe na checagem de papel acima — a checagem de papel roda ANTES do
  // cache, então visitante nunca alcança este ponto.
  const cached = await getCached(env, CACHE_KEYS.ORG_CHART);
  if (cached) return { success: true, chart: cached };

  const rows = await sql`
    SELECT id, full_name, username, avatar_url, league_position, directorate
    FROM profiles
    WHERE status = 'active'::account_status AND role IN ('member'::user_role, 'admin'::user_role)
    ORDER BY full_name ASC
  `;

  const toCard = (r) => ({ id: r.id, fullName: r.full_name, username: r.username, avatarUrl: r.avatar_url });

  const chart = {
    coordenacaoGeral: [],
    presidente: [],
    vicePresidente: [],
    coordenadores: [],
    directorates: {
      marketing: { diretor: null, members: [] },
      cientifico: { diretor: null, members: [] },
      administrativo: { diretor: null, members: [] },
      financeiro: { diretor: null, members: [] },
    },
    membersWithoutDirectorate: [],
  };

  rows.forEach((r) => {
    const card = toCard(r);
    if (r.league_position === 'coordenacao_geral') { chart.coordenacaoGeral.push(card); return; }
    if (r.league_position === 'presidente') { chart.presidente.push(card); return; }
    if (r.league_position === 'vice_presidente') { chart.vicePresidente.push(card); return; }
    if (r.league_position === 'coordenador') { chart.coordenadores.push(card); return; }
    if (r.league_position === 'diretor' && r.directorate && chart.directorates[r.directorate]) {
      chart.directorates[r.directorate].diretor = card;
      return;
    }
    if (r.directorate && chart.directorates[r.directorate]) {
      chart.directorates[r.directorate].members.push(card);
      return;
    }
    chart.membersWithoutDirectorate.push(card);
  });

  await setCached(env, CACHE_KEYS.ORG_CHART, chart, CACHE_TTL_SECONDS);
  return { success: true, chart };
}
