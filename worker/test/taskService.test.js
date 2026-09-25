import * as TaskService from '../src/services/taskService.js';
import { makeSql } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const ADMIN = { profileId: 'a1', role: 'admin' };

describe('TaskService.markTaskComplete', () => {
  test('marca como concluída quando há adesão ativa e ainda não concluída', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ id: 'signup-1' }]) // UPDATE ... RETURNING id
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await TaskService.markTaskComplete(sql, MEMBER, 'task-1', 'cid-1');
    expect(res.success).toBe(true);
  });

  test('lança ConflictError quando a pessoa nunca aderiu ou já concluiu (mensagem não distingue os dois casos)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // UPDATE não encontrou linha elegível

    await expect(TaskService.markTaskComplete(sql, MEMBER, 'task-1', 'cid-1')).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});

describe('TaskService.listTaskComments', () => {
  test('lista comentários com nome do autor, ou "Ex-membro" quando o perfil foi removido', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([
      { id: 'c1', message: 'oi', created_at: '2026-01-01', author_name: 'Fulano' },
      { id: 'c2', message: 'tchau', created_at: '2026-01-02', author_name: null },
    ]);

    const res = await TaskService.listTaskComments(sql, MEMBER, 'task-1');
    expect(res.comments).toEqual([
      { id: 'c1', message: 'oi', createdAt: '2026-01-01', authorName: 'Fulano' },
      { id: 'c2', message: 'tchau', createdAt: '2026-01-02', authorName: 'Ex-membro' },
    ]);
  });
});

describe('TaskService.submitTaskComment', () => {
  test('rejeita mensagem vazia antes de tocar o banco', async () => {
    const sql = makeSql();
    await expect(TaskService.submitTaskComment(sql, MEMBER, 'task-1', '', 'cid-1')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('membro sem adesão à tarefa é barrado (ForbiddenError)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // SELECT task_signups — não aderiu

    await expect(TaskService.submitTaskComment(sql, MEMBER, 'task-1', 'mensagem válida', 'cid-1')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });

  test('admin pode comentar mesmo sem ter aderido à tarefa', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([]) // SELECT task_signups — não aderiu
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await TaskService.submitTaskComment(sql, ADMIN, 'task-1', 'mensagem válida', 'cid-1');
    expect(res.success).toBe(true);
  });

  test('membro com adesão consegue comentar', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ id: 'signup-1' }]) // SELECT task_signups — aderiu
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await TaskService.submitTaskComment(sql, MEMBER, 'task-1', 'mensagem válida', 'cid-1');
    expect(res.success).toBe(true);
  });
});
