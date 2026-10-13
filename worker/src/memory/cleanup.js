/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/cleanup.js
 * Apagamento da memória, que mora em OUTRO banco (sem FK nem CASCADE). Quatro caminhos, todos idempotentes:
 *   1. imediato      revogação do consentimento e purga do admin tentam apagar na hora (eraseSubject);
 *   2. fila          se falhar, a pessoa entra em memory_purge_queue (sql/036) e o cron drena (drainQueue). O gatilho
 *                    AFTER DELETE ON profiles também enfileira (exclusão de conta). A linha só sai da fila DEPOIS de apagar;
 *   3. oportunista   após uma exclusão, drena um lote pequeno em segundo plano (drainSoon);
 *   4. varredura     1x por semana, apaga o que não pertence a ninguém com consentimento vigente (sweepOrphans) e,
 *                    todo dia, os itens vencidos (purgeExpiredItems). Alvo de prazo para o apagamento: 24 h.
 * Falha de limpeza nunca derruba o cron: cada tarefa roda isolada em maintenance.js. Sem DATABASE_URL_MEMORY ou sem
 * MEMORY_SUBJECT_KEY nada daqui toca em banco nenhum (a fila fica esperando).
 */
import { MEMORY } from '../constants.js';
import { createMemoryDb } from '../db.js';
import * as Store from './store.js';
import { memoryKeyConfigured, subjectIdFor } from './subject.js';
import { runInBackground } from './background.js';

/** { msql } quando há banco de memória e chave; senão null. */
export function memoryContext(env) {
  const msql = createMemoryDb(env);
  return msql && memoryKeyConfigured(env) ? { msql } : null;
}

/** Código curto e sem conteúdo para registrar a causa (nunca a mensagem do erro). */
export function errorCode(err) {
  const raw = String((err && (err.code || err.name)) || 'ERRO');
  const clean = raw.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 40);
  return clean || 'ERRO';
}

/** Coloca a pessoa na fila de apagamento. Nunca lança; devolve se entrou. */
export async function enqueuePurge(sql, profileId, reason, code) {
  try {
    await sql`
      INSERT INTO memory_purge_queue (profile_ref, reason, last_error_code, last_attempt_at)
      VALUES (${profileId}::uuid, ${reason}, ${code || null}, now())
      ON CONFLICT (profile_ref) DO UPDATE SET last_error_code = EXCLUDED.last_error_code, last_attempt_at = now()`;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Apaga a memória da pessoa agora; se não der (banco de memória fora do ar, sem URL ou sem chave), enfileira.
 * @returns {Promise<{ erased: boolean, queued: boolean, deleted: number }>}
 */
export async function eraseSubject(sql, env, profileId, reason) {
  const ctx = memoryContext(env);
  if (!ctx) return { erased: false, queued: await enqueuePurge(sql, profileId, reason, 'MEMORY_OFF'), deleted: 0 };
  try {
    const deleted = await Store.deleteAll(ctx.msql, await subjectIdFor(env, profileId));
    return { erased: true, queued: false, deleted };
  } catch (err) {
    return { erased: false, queued: await enqueuePurge(sql, profileId, reason, errorCode(err)), deleted: 0 };
  }
}

async function drainEntry(sql, env, ctx, row) {
  try {
    await Store.deleteAll(ctx.msql, await subjectIdFor(env, row.profile_ref));
    await sql`DELETE FROM memory_purge_queue WHERE profile_ref = ${row.profile_ref}::uuid`;
    return true;
  } catch (err) {
    try {
      await sql`UPDATE memory_purge_queue SET attempts = attempts + 1, last_attempt_at = now(), last_error_code = ${errorCode(err)}
                WHERE profile_ref = ${row.profile_ref}::uuid`;
    } catch (ignored) { /* a próxima drenagem tenta de novo */ }
    return false;
  }
}

/** Drena a fila: apaga a memória de cada pessoa e só então tira a linha. Devolve quantas saíram. */
export async function drainQueue(sql, env, limit = MEMORY.PURGE_DRAIN_BATCH) {
  const ctx = memoryContext(env);
  if (!ctx) return 0;
  const rows = await sql`SELECT profile_ref FROM memory_purge_queue ORDER BY enqueued_at LIMIT ${limit}::int`;
  let purged = 0;
  for (const row of rows) purged += (await drainEntry(sql, env, ctx, row)) ? 1 : 0;
  return purged;
}

/**
 * A pessoa tem apagamento pendente? Tenta concluí-lo agora. true = não há nada pendente (ou acabou de ser concluído).
 * Usado antes de um NOVO aceite: não se grava memória nova por cima de um apagamento que ainda não terminou.
 */
export async function settlePurge(sql, env, profileId) {
  const rows = await sql`SELECT 1 AS pending FROM memory_purge_queue WHERE profile_ref = ${profileId}::uuid`;
  if (!rows.length) return true;
  const ctx = memoryContext(env);
  return !!ctx && drainEntry(sql, env, ctx, { profile_ref: profileId });
}

/** Drena um lote pequeno em segundo plano (depois de uma exclusão). */
export function drainSoon(sql, env) {
  return runInBackground(env, () => drainQueue(sql, env, MEMORY.PURGE_OPPORTUNISTIC_BATCH));
}

/** Há alguém que possa ter memória (consentimento concedido) ou apagamento pendente? Evita acordar o banco à toa. */
async function mayHaveMemory(sql) {
  const rows = await sql`
    SELECT (SELECT count(*) FROM member_memory_consent WHERE status = 'granted')::int AS granted,
           (SELECT count(*) FROM memory_purge_queue)::int AS queued`;
  return Number(rows[0].granted) + Number(rows[0].queued) > 0;
}

/** Cron diário: apaga itens vencidos (180 dias sem uso / 12 meses). Pula se ninguém consentiu nem há fila. */
export async function purgeExpiredItems(sql, env) {
  const ctx = memoryContext(env);
  if (!ctx || !(await mayHaveMemory(sql))) return 0;
  return Store.purgeExpired(ctx.msql);
}

/**
 * Cron semanal (domingo, UTC): apaga os itens que não pertencem a ninguém com consentimento concedido (conta excluída
 * cuja fila falhou, consentimento revogado cuja limpeza falhou). NUNCA apaga com lista truncada: se houver mais
 * consentimentos que o teto de segurança (CPU do plano gratuito), a varredura é pulada e o aviso vai ao log.
 */
export async function sweepOrphans(sql, env, now = new Date()) {
  const ctx = memoryContext(env);
  if (!ctx || now.getUTCDay() !== MEMORY.SWEEP_WEEKDAY_UTC) return 0;
  const rows = await sql`SELECT profile_id FROM member_memory_consent WHERE status = 'granted' LIMIT ${MEMORY.SWEEP_MAX_PROFILES + 1}::int`;
  if (rows.length > MEMORY.SWEEP_MAX_PROFILES) {
    console.warn('[MEMORY_SWEEP_SKIPPED] consentimentos acima do teto da varredura; ver docs/agentic-layer.md');
    return 0;
  }
  const live = await Promise.all(rows.map((r) => subjectIdFor(env, r.profile_id)));
  return Store.purgeNotIn(ctx.msql, live);
}

/** Tarefas da memória para maintenance.js. Sem banco/chave de memória: nenhuma (e nenhuma consulta a mais). */
export function memoryTasks(sql, env, now = new Date()) {
  if (!memoryContext(env)) return {};
  return {
    memoryPurgeQueue: () => drainQueue(sql, env),
    memoryExpiredPurge: () => purgeExpiredItems(sql, env),
    memoryOrphanSweep: () => sweepOrphans(sql, env, now),
  };
}
