/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Postgres de verdade (PGlite, em memória) com TODAS as migrações aplicadas e
 * um adaptador para o formato `sql\`...\`` do Worker. Serve aos testes cujo
 * valor está no SQL (similaridade pg_trgm, UPSERT das métricas, somas), que um
 * mock de `sql` não consegue provar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { loadVectorExtension, adaptForNoVector } from '../../scripts/pgvector-shim.mjs';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sql');

export async function createMigratedDb() {
  const vectorExt = await loadVectorExtension();
  const db = new PGlite({ extensions: Object.assign({ pgcrypto, uuid_ossp, pg_trgm }, vectorExt ? { vector: vectorExt } : {}) });
  const files = fs.readdirSync(SQL_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  for (const file of files) {
    const text = fs.readFileSync(path.join(SQL_DIR, file), 'utf8');
    await db.exec(vectorExt ? text : adaptForNoVector(text));
  }
  return db;
}

/** Adaptador: sql`SELECT ${x}` → db.query('SELECT $1', [x]). */
export function toSql(db) {
  return async function sql(strings, ...values) {
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? '$' + (i + 1) : ''), '');
    const res = await db.query(text, values);
    return res.rows;
  };
}
