/**
 * run.js
 * Executa, em sequência, todos os cenários *.e2e.js desta pasta (ou só os
 * passados como argumento: `node scripts/e2e/run.js smoke fase2`).
 * Cada cenário exporta uma função async e usa check() do harness; o
 * processo termina com código 1 se qualquer verificação falhar.
 *
 * Uso: cd frontend && npm run e2e   (gera o build e roda tudo)
 */
const fs = require('fs');
const path = require('path');

(async () => {
  const filter = process.argv.slice(2);
  const files = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.e2e.js'))
    .filter((f) => !filter.length || filter.some((name) => f.startsWith(name)))
    .sort();
  if (!files.length) {
    console.log('Nenhum cenário *.e2e.js encontrado.');
    process.exit(1);
  }
  for (const file of files) {
    console.log(`\n▶ ${file}`);
    try {
      await require(path.join(__dirname, file))();
    } catch (err) {
      console.log(`  ✘ erro inesperado: ${err && err.stack ? err.stack : err}`);
      process.exitCode = 1;
    }
  }
  console.log(process.exitCode ? '\nE2E: há falhas.' : '\nE2E: tudo ok.');
})();
