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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(process.argv[2] || path.join(here, '..', '..', 'sql'));

const files = fs.readdirSync(SQL_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
let failures = 0;

for (const pass of [1, 2]) {
  const label = pass === 1 ? 'banco vazio' : 'reaplicação (idempotência)';
  console.log(`\n== Passada ${pass}: ${label}`);
  for (const file of files) {
    try {
      await db.exec(fs.readFileSync(path.join(SQL_DIR, file), 'utf8'));
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
        await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
        console.log(`  ok     ${tag} ${file}`);
      } catch (err) {
        failures++;
        console.log(`  FALHA  ${tag} ${file}: ${err.message}`);
        try { await db.exec('ROLLBACK'); } catch (e) { /* já fora de transação */ }
      }
    }
  }
}

const { rows } = await db.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
);
console.log(`\n${files.length} migrações, ${rows[0].n} tabelas no schema public, ${failures} falha(s).`);
await db.close();
process.exit(failures ? 1 : 0);
