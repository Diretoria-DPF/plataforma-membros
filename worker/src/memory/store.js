/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/store.js
 * Acesso ao banco de memória (sql/memory/001). SOMENTE SQL parametrizado, e SEMPRE dentro de uma transação que
 * começa por set_config('app.subject_id', <pessoa>, true): a RLS forçada do banco só mostra/grava as linhas dessa
 * pessoa. Uma única requisição HTTP por chamada (`sql.transaction`), então o banco conta como 1 subrequisição.
 * O modo de manutenção (app.maintenance = 'on') só existe nas funções de limpeza no fim do arquivo.
 *
 * O store não decide política (consentimento, papéis): quem chama já decidiu. Erros sobem crus; o serviço os traduz.
 */
import { MEMORY } from '../constants.js';
import { toIso } from './policy.js';

function toItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    level: row.level === null || row.level === undefined ? null : Number(row.level),
    value: row.value || null,
    source: row.source,
    evidence: Number(row.evidence),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastUsedAt: toIso(row.last_used_at),
    expiresAt: toIso(row.expires_at),
  };
}

/** Executa as consultas na MESMA transação da pessoa; devolve os resultados sem o do set_config. */
async function inSubject(msql, subject, build) {
  const results = await msql.transaction((tx) => [tx`SELECT set_config('app.subject_id', ${subject}, true)`].concat(build(tx)));
  return results.slice(1);
}

/** Itens vivos da pessoa (exclui os vencidos que a limpeza ainda não apagou). */
export async function listItems(msql, subject) {
  const [rows] = await inSubject(msql, subject, (tx) => [tx`
    SELECT id, kind, slug, level, value, source, evidence, created_at, updated_at, last_used_at, expires_at
    FROM memory_items WHERE subject_id = ${subject} AND expires_at > now() ORDER BY kind, slug`]);
  return rows.map(toItem);
}

/** Tudo o que existe da pessoa, vencido ou não (exportação). */
export async function listAll(msql, subject) {
  const [rows] = await inSubject(msql, subject, (tx) => [tx`
    SELECT id, kind, slug, level, value, source, evidence, created_at, updated_at, last_used_at, expires_at
    FROM memory_items WHERE subject_id = ${subject} ORDER BY kind, slug`]);
  return rows.map(toItem);
}

/**
 * Leitura do tutor: até `limit` itens vivos, na ordem objetivo > preferência > dúvida > nível, e marca esses itens como
 * USADOS (renova o prazo de 180 dias, sempre limitado a 12 meses da criação) — tudo num único comando.
 */
export async function readForTutor(msql, subject, limit = MEMORY.READ_LIMIT) {
  const [rows] = await inSubject(msql, subject, (tx) => [tx`
    WITH picked AS (
      SELECT id FROM memory_items
      WHERE subject_id = ${subject} AND expires_at > now()
      ORDER BY CASE kind WHEN 'goal' THEN 0 WHEN 'study_pref' THEN 1 WHEN 'difficulty' THEN 2 ELSE 3 END, updated_at DESC
      LIMIT ${limit}::int
    )
    UPDATE memory_items m
    SET last_used_at = now(),
        expires_at = LEAST(now() + make_interval(days => ${MEMORY.RETENTION_UNUSED_DAYS}::int), m.created_at + make_interval(months => ${MEMORY.RETENTION_MAX_MONTHS}::int))
    FROM picked WHERE m.id = picked.id
    RETURNING m.id, m.kind, m.slug, m.level, m.value, m.source, m.evidence, m.created_at, m.updated_at, m.last_used_at, m.expires_at`]);
  return rows.map(toItem).sort((a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug));
}

// Item vencido e ainda não apagado é tratado como novo (zera criação e evidência); senão o prazo respeita os 12 meses.
// topic_level vindo de simulado/tutor faz média ponderada (até 9 observações); difficulty sobe 1 por recorrência.
function upsertQuery(tx, subject, item, consentVersion) {
  return tx`
    INSERT INTO memory_items AS m (subject_id, kind, slug, level, value, source, consent_version, expires_at)
    VALUES (${subject}, ${item.kind}, ${item.slug}, ${item.level}::smallint, ${item.value}, ${item.source}, ${consentVersion},
            now() + make_interval(days => ${MEMORY.RETENTION_UNUSED_DAYS}::int))
    ON CONFLICT (subject_id, kind, slug) DO UPDATE SET
      level = CASE
        WHEN m.expires_at <= now() OR EXCLUDED.source = 'member' THEN EXCLUDED.level
        WHEN m.kind = 'topic_level' THEN LEAST(5, GREATEST(1, round((m.level * LEAST(m.evidence, 9) + EXCLUDED.level)::numeric / (LEAST(m.evidence, 9) + 1))))
        WHEN m.kind = 'difficulty' THEN LEAST(5, m.level + 1)
        ELSE EXCLUDED.level END,
      value = EXCLUDED.value,
      source = EXCLUDED.source,
      evidence = CASE WHEN m.expires_at <= now() OR EXCLUDED.source = 'member' THEN 1 ELSE LEAST(m.evidence + 1, 1000) END,
      consent_version = EXCLUDED.consent_version,
      created_at = CASE WHEN m.expires_at <= now() THEN now() ELSE m.created_at END,
      updated_at = now(),
      last_used_at = now(),
      expires_at = LEAST(now() + make_interval(days => ${MEMORY.RETENTION_UNUSED_DAYS}::int),
                         (CASE WHEN m.expires_at <= now() THEN now() ELSE m.created_at END) + make_interval(months => ${MEMORY.RETENTION_MAX_MONTHS}::int))
    RETURNING m.id, m.kind, m.slug, m.level, m.value, m.source, m.evidence, m.created_at, m.updated_at, m.last_used_at, m.expires_at`;
}

/** Grava (ou atualiza) vários itens numa transação só. O gatilho do banco recusa o 61º item ('memory_items_cap'). */
export async function upsertItems(msql, subject, items, consentVersion) {
  if (!items.length) return [];
  const results = await inSubject(msql, subject, (tx) => items.map((item) => upsertQuery(tx, subject, item, consentVersion)));
  return results.map((rows) => toItem(rows[0]));
}

/** Apaga um item da pessoa. true se existia. */
export async function deleteItem(msql, subject, id) {
  const [rows] = await inSubject(msql, subject, (tx) => [tx`DELETE FROM memory_items WHERE subject_id = ${subject} AND id = ${id}::uuid RETURNING id`]);
  return rows.length > 0;
}

/** Apaga tudo da pessoa. Devolve quantos itens saíram. */
export async function deleteAll(msql, subject) {
  const [rows] = await inSubject(msql, subject, (tx) => [tx`DELETE FROM memory_items WHERE subject_id = ${subject} RETURNING id`]);
  return rows.length;
}

/** O erro é o teto de 60 itens do gatilho? */
export function isCapError(err) {
  return !!err && /memory_items_cap/.test(String(err.message || ''));
}

// ---------------------------------------------------------------------------
// Manutenção (cron): modo app.maintenance = 'on'. Enxerga e apaga tudo; NÃO grava linha de pessoa nenhuma.
// ---------------------------------------------------------------------------
async function inMaintenance(msql, build) {
  const results = await msql.transaction((tx) => [tx`SELECT set_config('app.maintenance', 'on', true)`].concat(build(tx)));
  return results.slice(1);
}

/** Apaga os itens vencidos (expires_at). Devolve quantos. */
export async function purgeExpired(msql) {
  const [rows] = await inMaintenance(msql, (tx) => [tx`DELETE FROM memory_items WHERE expires_at <= now() RETURNING id`]);
  return rows.length;
}

/**
 * Apaga os itens de quem NÃO está na lista de pessoas vivas (subject_ids com consentimento concedido). A lista vai como
 * JSON (independe do formato de array do driver). Itens muito recentes (1 hora) ficam, para não colidir com um aceite
 * que acabou de acontecer. Devolve quantos.
 */
export async function purgeNotIn(msql, liveSubjects) {
  const live = JSON.stringify(liveSubjects);
  const [rows] = await inMaintenance(msql, (tx) => [tx`
    DELETE FROM memory_items
    WHERE updated_at < now() - interval '1 hour'
      AND subject_id NOT IN (SELECT jsonb_array_elements_text(${live}::jsonb))
    RETURNING id`]);
  return rows.length;
}

/** Agregados para o painel do admin: nunca devolve subject_id nem item. */
export async function aggregateStats(msql) {
  const [totals, kinds] = await inMaintenance(msql, (tx) => [
    tx`SELECT count(*)::int AS items, count(DISTINCT subject_id)::int AS subjects FROM memory_items WHERE expires_at > now()`,
    tx`SELECT kind, count(*)::int AS items FROM memory_items WHERE expires_at > now() GROUP BY kind ORDER BY kind`,
  ]);
  const byKind = kinds.reduce((acc, r) => Object.assign(acc, { [r.kind]: Number(r.items) }), {});
  return { items: Number(totals[0].items), subjects: Number(totals[0].subjects), byKind };
}
