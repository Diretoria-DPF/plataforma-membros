/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * validate-migrations.mjs
 * Valida as migrações de sql/ contra um Postgres real, em memória, sem
 * tocar no Neon: PGlite (Postgres compilado para WASM) com as mesmas
 * extensões que o schema usa (uuid-ossp e pgcrypto).
 *
 * Duas passadas completas, na ordem numérica:
 *   1) banco vazio → todas as migrações precisam aplicar sem erro;
 *   2) reaplica tudo por cima → todas precisam ser idempotentes, como o
 *      processo de deploy (migrações aplicadas à mão) exige.
 *
 * Uso:  cd worker && npm run validate:sql
 * Sai com código 1 se qualquer arquivo falhar em qualquer passada.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { loadVectorExtension, adaptForNoVector } from './pgvector-shim.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(process.argv[2] || path.join(here, '..', '..', 'sql'));

const files = fs.readdirSync(SQL_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const vectorExt = await loadVectorExtension();
if (!vectorExt) console.log('Aviso: pgvector indisponível no PGlite; validando a 020 com o shim (real[], sem HNSW).');
const db = new PGlite({ extensions: Object.assign({ pgcrypto, uuid_ossp, pg_trgm }, vectorExt ? { vector: vectorExt } : {}) });
const readSql = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return vectorExt ? text : adaptForNoVector(text);
};
let failures = 0;

for (const pass of [1, 2]) {
  const label = pass === 1 ? 'banco vazio' : 'reaplicação (idempotência)';
  console.log(`\n== Passada ${pass}: ${label}`);
  for (const file of files) {
    try {
      await db.exec(readSql(path.join(SQL_DIR, file)));
      console.log(`  ok     ${file}`);
    } catch (err) {
      failures++;
      console.log(`  FALHA  ${file}: ${err.message}`);
      // Um erro dentro de BEGIN…COMMIT deixa a sessão em transação
      // abortada; sem o ROLLBACK, todos os arquivos seguintes "falhariam"
      // em cascata e esconderiam o erro real.
      try { await db.exec('ROLLBACK'); } catch (e) { /* já fora de transação */ }
    }
  }
}

// Reversões ficam em sql/down/NNN_*.sql (nunca ao lado das migrações: o
// regex acima as aplicaria como se fossem "para frente"). Passada 3: desfaz
// na ordem inversa e aplica tudo de novo, provando que o caminho de volta
// funciona e que a migração pode ser reaplicada depois dele.
const DOWN_DIR = path.join(SQL_DIR, 'down');
const downFiles = fs.existsSync(DOWN_DIR)
  ? fs.readdirSync(DOWN_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort().reverse()
  : [];
if (downFiles.length) {
  console.log('\n== Passada 3: reversão (down) e nova aplicação');
  for (const [dir, list, tag] of [[DOWN_DIR, downFiles, 'down'], [SQL_DIR, files, 'up  ']]) {
    for (const file of list) {
      try {
        await db.exec(readSql(path.join(dir, file)));
        console.log(`  ok     ${tag} ${file}`);
      } catch (err) {
        failures++;
        console.log(`  FALHA  ${tag} ${file}: ${err.message}`);
        try { await db.exec('ROLLBACK'); } catch (e) { /* já fora de transação */ }
      }
    }
  }
}

// Passada 4: sql/ops/readonly_role.sql (não é migração). Aplica duas vezes
// (idempotência) e prova a política: o papel lê o que deve e é NEGADO nas
// colunas e tabelas sensíveis.
const OPS_FILE = path.join(SQL_DIR, 'ops', 'readonly_role.sql');
if (fs.existsSync(OPS_FILE)) {
  console.log('\n== Passada 4: papel somente leitura (ops/readonly_role.sql)');
  const expectOk = async (label, query) => {
    try { await db.exec(query); console.log(`  ok     ${label}`); } catch (err) {
      failures++; console.log(`  FALHA  ${label}: ${err.message}`);
    }
  };
  const expectDenied = async (label, query) => {
    try {
      await db.exec(query);
      failures++; console.log(`  FALHA  ${label}: deveria ser NEGADO e foi permitido`);
    } catch (err) {
      console.log(/permission denied/i.test(err.message) ? `  ok     ${label} (negado)` : `  FALHA  ${label}: erro inesperado: ${err.message}`);
      if (!/permission denied/i.test(err.message)) failures++;
    }
  };
  for (const round of [1, 2]) {
    await expectOk(`aplica o script (rodada ${round})`, fs.readFileSync(OPS_FILE, 'utf8'));
  }
  await db.exec('SET ROLE laift_readonly');
  await expectOk('lê events', 'SELECT count(*) FROM events');
  await expectOk('lê profiles (colunas permitidas)', 'SELECT id, full_name, role, status FROM profiles LIMIT 1');
  for (const col of ['email', 'password_hash', 'phone', 'phone_normalized']) {
    await expectDenied(`profiles.${col}`, `SELECT ${col} FROM profiles LIMIT 1`);
  }
  await expectDenied('SELECT * em profiles', 'SELECT * FROM profiles LIMIT 1');
  for (const table of ['sessions', 'account_tokens', 'mfa_credentials', 'mfa_recovery_codes', 'mfa_challenges', 'messages', 'messaging_keys', 'votes', 'rate_limit_buckets', 'error_logs']) {
    await expectDenied(table, `SELECT 1 FROM ${table} LIMIT 1`);
  }
  await expectDenied('escrita em events', 'UPDATE events SET title = title WHERE false');
  await db.exec('RESET ROLE');
}

const { rows } = await db.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
);
console.log(`\n${files.length} migrações, ${rows[0].n} tabelas no schema public, ${failures} falha(s).`);
await db.close();
process.exit(failures ? 1 : 0);
