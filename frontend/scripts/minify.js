/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * minify.js <entrada> <saida>
 * Só minificação (terser), sem ofuscação. Roda em processo separado porque o
 * terser é assíncrono e o build.js é síncrono (CommonJS).
 */
const fs = require('fs');
const { minify } = require('terser');

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('uso: node minify.js <entrada> <saida>');
  process.exit(2);
}
minify(fs.readFileSync(entrada, 'utf8'), { compress: true, mangle: true, format: { comments: false } })
  .then((r) => {
    if (!r.code) throw new Error(`a minificação de ${entrada} não gerou código`);
    fs.writeFileSync(saida, r.code);
  })
  .catch((e) => { console.error(`minify: ${e.message}`); process.exit(1); });
