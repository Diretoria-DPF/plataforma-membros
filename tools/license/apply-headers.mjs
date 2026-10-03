#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * apply-headers.mjs — aplica o cabeçalho de copyright aos arquivos próprios.
 *
 * Uso (a partir da raiz do repositório):
 *   node tools/license/apply-headers.mjs            # simulação: lista o que mudaria
 *   node tools/license/apply-headers.mjs --check    # sai com código 1 se faltar cabeçalho
 *   node tools/license/apply-headers.mjs --write    # grava os cabeçalhos
 *   --include-modulos  também processa frontend/modulos/ (só depois de confirmar a autoria)
 *
 * Propriedades: idempotente; ignora vendor/, models/, node_modules/, dist/ e
 * arquivos minificados; não toca em arquivo que já traga copyright de terceiros;
 * preserva shebang, BOM e o tipo de quebra de linha. Enumera só arquivos
 * rastreados pelo git, então respeita o .gitignore.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HEADER_MARKER = '© 2026 Daniel Pires Francisco';

const HEADER_LINES = [
  'Plataforma de Membros LAIFT',
  `${HEADER_MARKER}. Todos os direitos reservados.`,
  'Licença proprietária: ver LICENSE na raiz do repositório.',
];

const SUPPORTED_EXTENSIONS = new Set(['js', 'mjs', 'css', 'sql']);
const EXCLUDED_SEGMENTS = new Set([
  'node_modules', 'dist', 'vendor', 'models', '.git', '.claude', '.impeccable',
]);
const MODULOS_PREFIX = 'frontend/modulos/';
const THIRD_PARTY_SCAN_LINES = 15;
const MARKER_SCAN_CHARS = 600;
const BOM = '﻿';

/** Decide se um caminho relativo (do git) deve receber cabeçalho. */
export function shouldProcess(relPath, { includeModulos = false } = {}) {
  const path = relPath.replaceAll('\\', '/');
  const extension = extname(path).slice(1);
  if (!SUPPORTED_EXTENSIONS.has(extension)) return false;
  if (path.endsWith('.min.js')) return false;
  if (path.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  if (!includeModulos && path.startsWith(MODULOS_PREFIX)) return false;
  return true;
}

function buildHeader(extension, eol) {
  if (extension === 'sql') {
    return HEADER_LINES.map((line) => `-- ${line}`).join(eol) + eol;
  }
  const body = HEADER_LINES.map((line) => ` * ${line}`).join(eol);
  return `/*${eol}${body}${eol} */${eol}`;
}

function hasForeignCopyright(content) {
  const head = content.split(/\r?\n/, THIRD_PARTY_SCAN_LINES).join('\n');
  return /copyright|©/i.test(head);
}

/** Devolve o conteúdo com o cabeçalho; devolve o mesmo conteúdo se não couber. */
export function addHeader(content, extension) {
  const markerAt = content.indexOf(HEADER_MARKER);
  if (markerAt !== -1 && markerAt < MARKER_SCAN_CHARS) return content;
  const hasBom = content.startsWith(BOM);
  const text = hasBom ? content.slice(BOM.length) : content;
  if (hasForeignCopyright(text)) return content;

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const header = buildHeader(extension, eol);
  let result;
  if (text.startsWith('#!')) {
    const newline = text.indexOf('\n');
    const splitAt = newline === -1 ? text.length : newline + 1;
    result = text.slice(0, splitAt) + header + text.slice(splitAt);
  } else {
    result = header + text;
  }
  return hasBom ? BOM + result : result;
}

function listTrackedFiles(root) {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean);
}

function run(argv) {
  const write = argv.includes('--write');
  const check = argv.includes('--check');
  const includeModulos = argv.includes('--include-modulos');
  const root = fileURLToPath(new URL('../../', import.meta.url));

  const pending = [];
  for (const relPath of listTrackedFiles(root)) {
    if (!shouldProcess(relPath, { includeModulos })) continue;
    const absolute = join(root, relPath);
    const original = readFileSync(absolute, 'utf8');
    const updated = addHeader(original, extname(relPath).slice(1));
    if (updated !== original) pending.push({ relPath, absolute, updated });
  }

  if (write) {
    for (const item of pending) writeFileSync(item.absolute, item.updated, 'utf8');
    console.log(`Cabeçalho gravado em ${pending.length} arquivo(s).`);
    return 0;
  }
  const hint = check ? '' : ' (simulação; use --write para gravar)';
  console.log(`${pending.length} arquivo(s) sem cabeçalho${hint}.`);
  return check && pending.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
