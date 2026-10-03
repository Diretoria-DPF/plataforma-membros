#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * read-discovery.mjs
 *
 * Lê out/discovery.json (escrito por discover.mjs) e imprime, em linhas
 * `chave=valor`, os poucos valores que o workflow precisa nos passos
 * seguintes (SHA do Z-Anatomy para fixar a URL do zip, versão/tarball do
 * Blender para a chave do cache). Feito num script separado, em vez de
 * JS inline no YAML, para ficar testável e legível.
 *
 * Uso: node read-discovery.mjs --in out/discovery.json >> "$GITHUB_OUTPUT"
 */
import * as fs from 'node:fs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') out.in = argv[++i];
  }
  return out;
}

const { in: inPath } = parseArgs(process.argv.slice(2));
const report = JSON.parse(fs.readFileSync(inPath || 'out/discovery.json', 'utf8'));

const za = report.sections?.['1. Z-Anatomy / Models-of-human-anatomy'] || {};
const blender = report.sections?.['4. Blender headless (download.blender.org)'] || {};

const zanatomyRef = za.headCommitSha || 'master';
const blenderVersion = blender.latest || '';
const blenderTarball = (blender.linuxTarballsEmLatest || [])[0] || '';

if (!blenderVersion || !blenderTarball) {
  console.error('AVISO: não foi possível determinar a versão/tarball do Blender a partir de out/discovery.json.');
}

console.log(`zanatomy_ref=${zanatomyRef}`);
console.log(`blender_version=${blenderVersion}`);
console.log(`blender_tarball=${blenderTarball}`);
console.log(`blender_url=https://download.blender.org/release/${blenderVersion}/${blenderTarball}`);
