/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cópia do GitHub Pages (diretoria-dpf.github.io): fora dos buscadores e com
// canonical para o domínio oficial. Roda SÓ sobre a pasta que vai para o Pages
// (deploy-frontend.yml); o build da Cloudflare não passa por aqui.
//
// Uso: node tools/ci/pages-noindex.mjs <pasta-publicada>
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://laift.com.br';
const ROBOTS = '<meta name="robots" content="noindex">';
const ROBOTS_RE = /[ \t]*<meta\s+name=["']robots["'][^>]*>\r?\n?/gi;
const CANONICAL_RE = /[ \t]*<link\s+rel=["']canonical["'][^>]*>\r?\n?/gi;

/** Caminho relativo do arquivo -> URL pública (index.html -> "/", x.html -> "/x", d/index.html -> "/d/"). */
export function canonicalUrl(relPath) {
  const p = relPath.split(sep).join('/');
  if (p === 'index.html') return `${SITE}/`;
  if (p.endsWith('/index.html')) return `${SITE}/${p.slice(0, -'index.html'.length)}`;
  return `${SITE}/${p.replace(/\.html$/, '')}`;
}

/** Devolve o HTML com robots=noindex e canonical oficial (substitui os existentes). Sem </head>, devolve igual. */
export function injectPagesMeta(html, relPath) {
  if (!/<\/head>/i.test(html)) return html;
  const limpo = html.replace(ROBOTS_RE, '').replace(CANONICAL_RE, '');
  const bloco = `  ${ROBOTS}\n  <link rel="canonical" href="${canonicalUrl(relPath)}">\n`;
  return limpo.replace(/([ \t]*)<\/head>/i, (_m, indent) => `${bloco}${indent}</head>`);
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* htmlFiles(full);
    else if (name.endsWith('.html')) yield full;
  }
}

/** Aplica em todos os .html da pasta; devolve quantos arquivos mudaram. */
export function processDir(dir) {
  let changed = 0;
  for (const file of htmlFiles(dir)) {
    const original = readFileSync(file, 'utf8');
    const novo = injectPagesMeta(original, relative(dir, file));
    if (novo !== original) {
      writeFileSync(file, novo);
      changed += 1;
    }
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Uso: node tools/ci/pages-noindex.mjs <pasta-publicada>');
    process.exit(1);
  }
  console.log(`pages-noindex: ${processDir(dir)} arquivo(s) atualizado(s) em ${dir}`);
}
