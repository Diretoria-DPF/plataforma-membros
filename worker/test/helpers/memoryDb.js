/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Banco de MEMÓRIA de verdade nos testes (PGlite, em memória): aplica sql/memory/001_memory.sql e oferece um
 * adaptador com a mesma forma do driver do Neon usada pelo Worker (`sql.transaction((tx) => [tx\`...\`, ...])`).
 * Por padrão cada transação roda como o papel de execução `laift_memory_worker` (SET LOCAL ROLE), então a RLS por
 * pessoa vale de verdade; o PGlite é superusuário e, sem trocar de papel, ignoraria a RLS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { loadVectorExtension, adaptForNoVector } from '../../scripts/pgvector-shim.mjs';

const MEMORY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sql', 'memory');

export const readMemorySql = (relative) => fs.readFileSync(path.join(MEMORY_DIR, relative), 'utf8');

export async function createMemoryPglite() {
  const vectorExt = await loadVectorExtension();
  const db = new PGlite({ extensions: vectorExt ? { vector: vectorExt } : {} });
  const text = readMemorySql('001_memory.sql');
  await db.exec(vectorExt ? text : adaptForNoVector(text));
  return db;
}

const buildQuery = (strings, ...values) => ({
  text: strings.reduce((acc, part, i) => acc + part + (i < values.length ? '$' + (i + 1) : ''), ''),
  values,
});

/**
 * @param {import('@electric-sql/pglite').PGlite} db
 * @param {{ role?: string|null }} [opts]  papel da transação (padrão laift_memory_worker; null = superusuário)
 * @returns função `msql` com `.transaction`, `.fail(err, times)` (próximas N transações falham) e `.history` (textos executados)
 */
export function toMemorySql(db, opts = {}) {
  const role = opts.role === undefined ? 'laift_memory_worker' : opts.role;
  const history = [];
  let failures = [];
  const msql = () => { throw new Error('use msql.transaction'); };
  msql.history = history;
  msql.fail = (err, times = 1) => { failures = Array(times).fill(err); };
  msql.transaction = async (arg) => {
    if (failures.length) throw failures.shift();
    const queries = typeof arg === 'function' ? arg(buildQuery) : arg;
    return db.transaction(async (tx) => {
      if (role) await tx.exec('SET LOCAL ROLE ' + role);
      const out = [];
      for (const q of queries) {
        history.push(q.text);
        out.push((await tx.query(q.text, q.values)).rows);
      }
      return out;
    });
  };
  return msql;
}

/**
 * Roda `fn` com a CHECK de vocabulário de temas (memory_items_topic_chk) removida, para provar o teto de 60 itens com
 * slugs sintéticos (o vocabulário real tem menos de 60 combinações possíveis). Ao final apaga as linhas e recoloca a CHECK.
 */
export async function withoutTopicCheck(db, fn) {
  const { rows } = await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'memory_items_topic_chk'");
  await db.exec('ALTER TABLE memory_items DROP CONSTRAINT memory_items_topic_chk');
  try {
    return await fn();
  } finally {
    await db.exec('DELETE FROM memory_items');
    await db.exec('ALTER TABLE memory_items ADD CONSTRAINT memory_items_topic_chk ' + rows[0].def);
  }
}
