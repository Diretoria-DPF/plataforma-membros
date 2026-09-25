import * as OrgChartService from '../src/services/orgChartService.js';
import { makeSql } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const ADMIN = { profileId: 'a1', role: 'admin' };
const VISITOR = { profileId: 'v1', role: 'visitor' };

describe('OrgChartService.setMemberPosition', () => {
  test('member não pode atribuir cargo (só admin)', async () => {
    const sql = makeSql();
    await expect(
      OrgChartService.setMemberPosition(sql, MEMBER, 't1', { leaguePosition: 'presidente' }, 'cid')
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('cargo "diretor" sem diretoria vinculada lança ValidationError', async () => {
    const sql = makeSql();
    await expect(
      OrgChartService.setMemberPosition(sql, ADMIN, 't1', { leaguePosition: 'diretor' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('cargo "presidente" com diretoria vinculada lança ValidationError (não deveria ter diretoria)', async () => {
    const sql = makeSql();
    await expect(
      OrgChartService.setMemberPosition(sql, ADMIN, 't1', { leaguePosition: 'presidente', directorate: 'marketing' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('visitante não pode receber cargo/diretoria', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ role: 'visitor' }]); // SELECT role do alvo
    await expect(
      OrgChartService.setMemberPosition(sql, ADMIN, 't1', { directorate: 'marketing' }, 'cid')
    ).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('atribui diretor de marketing com sucesso', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ role: 'member' }]) // SELECT role
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await OrgChartService.setMemberPosition(sql, ADMIN, 't1', { leaguePosition: 'diretor', directorate: 'marketing' }, 'cid');
    expect(res.success).toBe(true);
  });

  test('atribui só diretoria (membro comum, sem cargo de liderança)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ role: 'member' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await OrgChartService.setMemberPosition(sql, ADMIN, 't1', { directorate: 'cientifico' }, 'cid');
    expect(res.success).toBe(true);
  });

  test('limpa cargo/diretoria quando ambos vêm nulos', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ role: 'member' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await OrgChartService.setMemberPosition(sql, ADMIN, 't1', {}, 'cid');
    expect(res.success).toBe(true);
  });
});

describe('OrgChartService.getOrgChart', () => {
  test('visitante não pode ver o fluxograma', async () => {
    const sql = makeSql();
    await expect(OrgChartService.getOrgChart(sql, VISITOR)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('agrupa membros por cargo/diretoria corretamente', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { id: 'p1', full_name: 'Coord Geral', username: 'coordgeral', avatar_url: null, league_position: 'coordenacao_geral', directorate: null },
      { id: 'p2', full_name: 'Presidenta', username: 'presidenta', avatar_url: null, league_position: 'presidente', directorate: null },
      { id: 'p3', full_name: 'Diretor MKT', username: 'diretormkt', avatar_url: null, league_position: 'diretor', directorate: 'marketing' },
      { id: 'p4', full_name: 'Membro MKT', username: 'membromkt', avatar_url: null, league_position: null, directorate: 'marketing' },
      { id: 'p5', full_name: 'Ligante', username: 'ligante', avatar_url: null, league_position: null, directorate: null },
    ]);

    const res = await OrgChartService.getOrgChart(sql, MEMBER);
    expect(res.success).toBe(true);
    expect(res.chart.coordenacaoGeral).toHaveLength(1);
    expect(res.chart.presidente).toHaveLength(1);
    expect(res.chart.directorates.marketing.diretor).toMatchObject({ id: 'p3' });
    expect(res.chart.directorates.marketing.members).toHaveLength(1);
    expect(res.chart.membersWithoutDirectorate).toHaveLength(1);
    expect(res.chart.membersWithoutDirectorate[0]).toMatchObject({ id: 'p5' });
  });
});
