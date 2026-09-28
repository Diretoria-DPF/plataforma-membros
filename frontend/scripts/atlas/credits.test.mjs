#!/usr/bin/env node
/**
 * credits.test.mjs — testes para groupAssets()
 * Roda com: node frontend/scripts/atlas/credits.test.mjs
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));

// Carregar o fixture manifest
const fixtureManifestPath = path.resolve(here, '../../modulos/anatomia-3d/data/atlas/fixtures/manifest.json');
const fixtureManifest = JSON.parse(fs.readFileSync(fixtureManifestPath, 'utf-8'));

// Carregamos credits.js (que precisa rodar em Node, não browser)
// Como credits.js usa LaiftDom que é global, vamos extrair groupAssets direto do arquivo
const creditsPath = path.resolve(here, '../../modulos/anatomia-3d/js/ui/credits.js');
const creditsCode = fs.readFileSync(creditsPath, 'utf-8');

// Extrair a função groupAssets (ela está no início do arquivo)
const groupAssetsMatch = creditsCode.match(/^function groupAssets\(assets\) \{[\s\S]*?\n\}/m);
assert.ok(groupAssetsMatch, 'groupAssets não encontrada em credits.js');

// Executar a função em um escopo isolado
const groupAssets = eval(`(${groupAssetsMatch[0]})`);

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

console.log('groupAssets() com fixture manifest');

test('agrupa assets por license + attribution', () => {
  const groups = groupAssets(fixtureManifest.assets);
  // Fixture tem CC0-1.0 e um CC0-1.0 (HRA heart)
  assert.ok(groups.length > 0, 'deve haver grupos');

  // Todos os assets da fixture têm license CC0-1.0
  const cc0Groups = groups.filter((g) => g.license === 'CC0-1.0');
  assert.ok(cc0Groups.length > 0, 'deve haver grupos CC0-1.0');

  // Cada grupo tem license, attribution, sourceUrl, sourceVersion, systems
  for (const group of groups) {
    assert.ok(group.license, 'license não deve ser vazio');
    assert.ok(group.attribution, 'attribution não deve ser vazio');
    assert.ok(Array.isArray(group.systems), 'systems deve ser array');
  }
});

test('systems vem em ordem alfabética dentro de cada grupo', () => {
  const groups = groupAssets(fixtureManifest.assets);
  for (const group of groups) {
    const sorted = [...group.systems].sort();
    assert.deepEqual(group.systems, sorted, `systems não está ordenado: ${group.systems.join(', ')}`);
  }
});

test('grupos ficam ordenados por license, depois attribution', () => {
  const groups = groupAssets(fixtureManifest.assets);
  for (let i = 1; i < groups.length; i++) {
    const prev = groups[i - 1];
    const curr = groups[i];
    const licenseComp = prev.license.localeCompare(curr.license);
    if (licenseComp === 0) {
      const attrComp = prev.attribution.localeCompare(curr.attribution);
      assert.ok(attrComp <= 0, `attribution não está ordenado: "${prev.attribution}" > "${curr.attribution}"`);
    } else {
      assert.ok(licenseComp <= 0, `license não está ordenado: "${prev.license}" > "${curr.license}"`);
    }
  }
});

test('sourceUrl pode ser null', () => {
  const groups = groupAssets(fixtureManifest.assets);
  // Fixture tem sourceUrl: null para a maioria
  const nullGroups = groups.filter((g) => g.sourceUrl === null);
  assert.ok(nullGroups.length > 0, 'deve haver grupos com sourceUrl null');
});

console.log('');
console.log('Manifest sintético misto (CC-BY-SA + CC-BY)');

const mixedManifest = {
  assets: [
    {
      file: 'models/z-anat.glb',
      system: 'cardiovascular',
      lod: 'lod0',
      sex: 'U',
      bytes: 1000,
      triangles: 100,
      bbox: { min: [0, 0, 0], max: [1, 1, 1] },
      nodeToSid: {},
      license: 'CC-BY-SA-4.0',
      attribution: 'Z-Anatomy',
      sourceUrl: 'https://github.com/Z-Anatomy/Models-of-human-anatomy',
      sourceVersion: 'v1.0',
      transform: null,
      rmsError: null,
    },
    {
      file: 'models/z-anat-2.glb',
      system: 'esqueletico',
      lod: 'lod0',
      sex: 'U',
      bytes: 1000,
      triangles: 100,
      bbox: { min: [0, 0, 0], max: [1, 1, 1] },
      nodeToSid: {},
      license: 'CC-BY-SA-4.0',
      attribution: 'Z-Anatomy',
      sourceUrl: 'https://github.com/Z-Anatomy/Models-of-human-anatomy',
      sourceVersion: 'v1.0',
      transform: null,
      rmsError: null,
    },
    {
      file: 'models/hra-heart.glb',
      system: 'cardiovascular',
      lod: 'lod0',
      sex: 'M',
      bytes: 1000,
      triangles: 100,
      bbox: { min: [0, 0, 0], max: [1, 1, 1] },
      nodeToSid: {},
      license: 'CC-BY-4.0',
      attribution: 'Human Reference Atlas',
      sourceUrl: 'https://humanatlas.io',
      sourceVersion: 'v1.3',
      transform: null,
      rmsError: null,
    },
    {
      file: 'models/hra-brain.glb',
      system: 'nervoso',
      lod: 'lod0',
      sex: 'F',
      bytes: 1000,
      triangles: 100,
      bbox: { min: [0, 0, 0], max: [1, 1, 1] },
      nodeToSid: {},
      license: 'CC-BY-4.0',
      attribution: 'Human Reference Atlas',
      sourceUrl: 'https://humanatlas.io',
      sourceVersion: 'v1.5',
      transform: null,
      rmsError: null,
    },
  ],
};

test('agrupa assets de licenças diferentes corretamente', () => {
  const groups = groupAssets(mixedManifest.assets);

  // Deve haver pelo menos 2 grupos (CC-BY-SA e CC-BY)
  const ccBySa = groups.filter((g) => g.license === 'CC-BY-SA-4.0');
  const ccBy = groups.filter((g) => g.license === 'CC-BY-4.0');

  assert.equal(ccBySa.length, 1, 'deve haver 1 grupo CC-BY-SA-4.0');
  assert.equal(ccBy.length, 1, 'deve haver 1 grupo CC-BY-4.0');
});

test('agrupa sistemas corretamente em cada licença', () => {
  const groups = groupAssets(mixedManifest.assets);

  const ccBySa = groups.find((g) => g.license === 'CC-BY-SA-4.0');
  const ccBy = groups.find((g) => g.license === 'CC-BY-4.0');

  // CC-BY-SA: cardiovascular, esqueletico
  assert.deepEqual(
    ccBySa.systems.sort(),
    ['cardiovascular', 'esqueletico'],
    'CC-BY-SA deve ter cardiovascular e esqueletico'
  );

  // CC-BY: cardiovascular (HRA), nervoso
  assert.deepEqual(
    ccBy.systems.sort(),
    ['cardiovascular', 'nervoso'],
    'CC-BY deve ter cardiovascular e nervoso'
  );
});

test('respeita sourceVersion distinto por grupo', () => {
  const groups = groupAssets(mixedManifest.assets);

  const ccBy = groups.find((g) => g.license === 'CC-BY-4.0');
  // ccBy tem dois assets com sourceVersion diferentes (v1.3, v1.5)
  // Deve pegar uma delas (a primeira encontrada, ou consolidar)
  assert.ok(
    ccBy.sourceVersion === 'v1.3' || ccBy.sourceVersion === 'v1.5',
    'sourceVersion deve ser uma das versões dos assets HRA'
  );
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
