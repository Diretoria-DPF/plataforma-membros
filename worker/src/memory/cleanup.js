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
  try {
    const msql = createMemoryDb(env);
    return msql && memoryKeyConfigured(env) ? { msql } : null;
  } catch (err) {
    return null; // nunca lança (e nunca repete a URL): sem contexto = memória indisponível
  }
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
  try {
    const ctx = memoryContext(env);
    if (!ctx) return { erased: false, queued: await enqueuePurge(sql, profileId, reason, 'MEMORY_OFF'), deleted: 0 };
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

/** Tenta o lote inteiro numa transação (3 subrequisições no total); só se falhar cai para pessoa por pessoa. */
async function drainBatch(sql, env, ctx, rows) {
  try {
    const subjects = await Promise.all(rows.map((r) => subjectIdFor(env, r.profile_ref)));
    await Store.deleteMany(ctx.msql, subjects);
    const refs = JSON.stringify(rows.map((r) => r.profile_ref));
    await sql`DELETE FROM memory_purge_queue WHERE profile_ref IN (SELECT jsonb_array_elements_text(${refs}::jsonb)::uuid)`;
    return rows.length;
  } catch (err) {
    let purged = 0;
    for (const row of rows) purged += (await drainEntry(sql, env, ctx, row)) ? 1 : 0;
    return purged;
  }
}

/**
 * Drena a fila: apaga a memória das pessoas e só então tira as linhas. Devolve quantas saíram.
 * Orçamento de subrequisições (plano gratuito, ~50 por execução do cron, dividido com as demais limpezas): caminho normal
 * = 3 (leitura da fila, uma transação de apagamento em lote, uma remoção em lote); pior caso (lote falhou) = 3 + 2 por pessoa.
 * Por isso o lote padrão é pequeno (MEMORY.PURGE_DRAIN_BATCH); o resto fica para o dia seguinte.
 */
export async function drainQueue(sql, env, limit = MEMORY.PURGE_DRAIN_BATCH) {
  const ctx = memoryContext(env);
  if (!ctx) return 0;
  const rows = await sql`SELECT profile_ref FROM memory_purge_queue ORDER BY enqueued_at LIMIT ${limit}::int`;
  return rows.length ? drainBatch(sql, env, ctx, rows) : 0;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Varredura diária de quem não tem consentimento vigente (conta excluída cuja fila falhou, revogação cuja limpeza falhou,
 * gravação que chegou depois da revogação). Funciona SEM teto de pessoas, respeitando a CPU do plano gratuito (~40 µs por
 * HMAC: no máximo SWEEP_MAX_PROFILES por execução) e o orçamento de subrequisições:
 *   - até SWEEP_MAX_PROFILES consentimentos: lista completa dos vivos e apagamento imediato de quem não está nela
 *     (3 subrequisições);
 *   - acima disso: os consentimentos são divididos em fatias estáveis (hashtext do profile_id) e UMA fatia por dia é
 *     confirmada (`verified_at`); o que ficou sem confirmação por mais de 2 ciclos + 14 dias é apagado. Um órfão some em
 *     até (2 * ciclo + 14) dias; quem tem consentimento é reconfirmado a cada ciclo (ciclo = nº de fatias, em dias).
 * Uma fatia maior que o teto (hash muito torto) é pulada com aviso, nunca truncada: apagar com lista parcial perderia dado.
 */
export async function sweepOrphans(sql, env, now = new Date()) {
  const ctx = memoryContext(env);
  if (!ctx) return 0;
  const cap = Math.max(1, MEMORY.SWEEP_MAX_PROFILES);
  const total = Number((await sql`SELECT count(*)::int AS n FROM member_memory_consent WHERE status = 'granted'`)[0].n);
  const parts = total <= cap ? 1 : Math.ceil(total / (cap / 2));
  const slot = Math.floor(now.getTime() / DAY_MS) % parts;
  const rows = await sql`
    SELECT profile_id FROM member_memory_consent
    WHERE status = 'granted' AND (hashtext(profile_id::text)::bigint & 2147483647) % ${parts}::int = ${slot}::int
    ORDER BY profile_id LIMIT ${cap + 1}::int`;
  if (rows.length > cap) {
    console.warn('[MEMORY_SWEEP_SKIPPED] fatia da varredura acima do teto; ver docs/agentic-layer.md');
    return 0;
  }
  const live = await Promise.all(rows.map((r) => subjectIdFor(env, r.profile_id)));
  if (parts === 1) return Store.purgeNotIn(ctx.msql, live);
  for (let i = 0; i < live.length; i += MEMORY.SWEEP_VERIFY_CHUNK) {
    await Store.verifySubjects(ctx.msql, live.slice(i, i + MEMORY.SWEEP_VERIFY_CHUNK));
  }
  return Store.purgeUnverified(ctx.msql, 2 * parts + 14);
}

/** Há URL (qualquer texto, sem validar nem ecoar) e chave? A validação de verdade acontece DENTRO da tarefa, isolada. */
function memoryConfigured(env) {
  const hasUrl = !!env && (!!env.memorySql || (typeof env.DATABASE_URL_MEMORY === 'string' && env.DATABASE_URL_MEMORY.trim() !== ''));
  return hasUrl && memoryKeyConfigured(env);
}

/** Resolve o contexto só quando a tarefa roda: URL malformada vira UM erro genérico desta tarefa, sem derrubar as outras. */
function guarded(env, work) {
  return async () => {
    if (!memoryContext(env)) throw new Error('Memória de estudo: DATABASE_URL_MEMORY inválida ou MEMORY_SUBJECT_KEY ausente.');
    return work();
  };
}

/** Tarefas da memória para maintenance.js. Sem URL e chave: nenhuma (e nenhuma consulta a mais). Nunca lança. */
export function memoryTasks(sql, env, now = new Date()) {
  if (!memoryConfigured(env)) return {};
  return {
    memoryPurgeQueue: guarded(env, () => drainQueue(sql, env)),
    memoryExpiredPurge: guarded(env, () => purgeExpiredItems(sql, env)),
    memoryOrphanSweep: guarded(env, () => sweepOrphans(sql, env, now)),
  };
}
