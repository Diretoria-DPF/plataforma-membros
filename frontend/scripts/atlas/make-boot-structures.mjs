#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * make-boot-structures.mjs — Generate minimal boot structures file
 * Extracts only fields needed at boot time for search, navigator, and legacy linking.
 *
 * Usage: node frontend/scripts/atlas/make-boot-structures.mjs
 */

import * as fs from 'fs';
import * as path from 'path';

// Resolve file paths from this script location
const scriptDir = new URL('.', import.meta.url).pathname;
const inputFile = path.join(scriptDir, '../../modulos/anatomia-3d/data/atlas/generated/structures.json');
const outputFile = path.join(scriptDir, '../../modulos/anatomia-3d/data/atlas/generated/structures.boot.json');

console.log('Reading full structures.json...');
const fullData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
console.log(`  Loaded ${fullData.length} structures`);

// Extract only boot-needed fields
console.log('Extracting boot fields...');
const bootData = fullData.map((s) => ({
  sid: s.sid,
  englishName: s.englishName,
  latinName: s.latinName,
  system: s.system,
  layer: s.layer,
  side: s.side,
  // Nome PT (tools/atlas-content/names-pt.mjs) — só quando existe.
  ...(s.namePt ? { namePt: s.namePt } : {}),
}));

// Minify JSON (no spaces, no newlines)
const minified = JSON.stringify(bootData);

console.log('Writing structures.boot.json...');
fs.writeFileSync(outputFile, minified, 'utf8');

// Report sizes
const fullSize = fs.statSync(inputFile).size;
const bootSize = fs.statSync(outputFile).size;
const reduction = fullSize - bootSize;
const reductionPercent = ((reduction / fullSize) * 100).toFixed(1);

console.log('\nSize comparison:');
console.log(`  Full structures.json: ${(fullSize / 1024).toFixed(1)} KB`);
console.log(`  Boot structures.boot.json: ${(bootSize / 1024).toFixed(1)} KB`);
console.log(`  Reduction: ${(reduction / 1024).toFixed(1)} KB (${reductionPercent}%)`);
console.log(`\nFile written to: ${outputFile}`);
