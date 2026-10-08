/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * pgvector-shim.mjs
 * A migração 020 usa a extensão `vector` (pgvector). O PGlite usado na validação
 * só a traz em versões que publicam `@electric-sql/pglite/vector`; a instalada
 * pode não ter. Então:
 *   1) tenta carregar a extensão de verdade (`loadVectorExtension`);
 *   2) se não existir, `adaptForNoVector` reescreve o SQL SÓ para validar o
 *      resto da migração: remove o CREATE EXTENSION vector e os índices `hnsw`
 *      e troca `vector(N)` por `real[]`. A sintaxe do HNSW/vector em si é
 *      conferida contra o Neon (staging) antes de produção; ver docs/AMBIENTES.md.
 */
export async function loadVectorExtension() {
  try {
    const mod = await import('@electric-sql/pglite/vector');
    return mod.vector || null;
  } catch (err) {
    return null;
  }
}

export function adaptForNoVector(sqlText) {
  return sqlText
    .replace(/CREATE EXTENSION IF NOT EXISTS vector\s*;/gi, '-- (validação) extensão vector ausente no PGlite')
    .replace(/CREATE INDEX[^;]*USING hnsw[^;]*;/gi, '-- (validação) índice hnsw omitido')
    .replace(/vector\(\s*\d+\s*\)/gi, 'real[]');
}
