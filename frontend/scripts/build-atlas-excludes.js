/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * build-atlas-excludes.js — o que do Atlas NÃO vai para o dist/ (publicado).
 *
 * - modulos/anatomia-3d/dev/: harnesses de desenvolvimento (usam innerHTML e
 *   não seguem as regras de CSP das páginas reais). Para rodar o e2e
 *   `atlas-assets`, que usa um deles, o build aceita ATLAS_KEEP_DEV=1.
 * - modulos/anatomia-3d/data/bio-database.js: base antiga (4 mil linhas, 208 KB),
 *   sem referência em index.html nem em js/; só os scripts de migração
 *   (scripts/atlas/migrate-*.mjs) a leem, direto do repositório.
 */
'use strict';

const DEV_DIR = /[\\/]modulos[\\/]anatomia-3d[\\/]dev(?:[\\/]|$)/;
const LEGACY_DB = /[\\/]modulos[\\/]anatomia-3d[\\/]data[\\/]bio-database\.js$/;

/**
 * @param {string} src caminho de origem (qualquer separador)
 * @param {{ keepDev?: boolean }} [opts]
 * @returns {boolean} true quando o arquivo não deve ser copiado
 */
function isAtlasUnpublished(src, { keepDev = false } = {}) {
  if (LEGACY_DB.test(src)) return true;
  return !keepDev && DEV_DIR.test(src);
}

module.exports = { isAtlasUnpublished };
