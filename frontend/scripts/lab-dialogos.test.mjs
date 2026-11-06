/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Laboratório e Estúdio 3D usam LaiftDialog no lugar de alert/confirm/prompt nativos (MOB-03).
// O vendor (vendor/3dmol, smiles-drawer) não é alterado: o 3Dmol-min.js tem dois alert() ("Wrong PDB ID",
// "Wrong Compound ID") dentro de $3Dmol.download, que o código da plataforma nunca chama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const NATIVE = /(?<![\w.$])(alert|confirm|prompt)\s*\(/;

const AUTORAIS = [
  'modulos/laboratorio/js/script.js',
  'modulos/laboratorio/js/lab-apis.js',
  'modulos/laboratorio/js/lab-storage.js',
  'modulos/laboratorio/js/lab-preceptor.js',
  'modulos/laboratorio/studio/studio.js',
  'modulos/laboratorio/studio/studio-ui.js',
  'modulos/laboratorio/studio/studio-loader.js',
];

for (const rel of AUTORAIS) {
  test(`${rel} não chama diálogos nativos`, () => {
    const semComentarios = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(semComentarios, NATIVE);
  });
}

for (const [rel, prefixo] of [['modulos/laboratorio/index.html', '../shared/'], ['modulos/laboratorio/studio/index.html', '../../shared/']]) {
  test(`${rel} carrega laift-dialog.js e .css sem script inline`, () => {
    const html = read(rel);
    // A bancada carrega com defer (depois da leitura da página); o Estúdio, síncrono.
    assert.ok(html.includes(`<script src="${prefixo}laift-dialog.js"></script>`) || html.includes(`<script src="${prefixo}laift-dialog.js" defer></script>`));
    assert.ok(html.includes(`<link rel="stylesheet" href="${prefixo}laift-dialog.css">`));
    assert.ok(html.indexOf('laift-dialog.js') < html.indexOf('js/script.js') || rel.includes('studio'));
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /<script(?![^>]*\bsrc=)[^>]*>/);
  });
}

test('trocar de vidraria e adição instável aguardam LaiftDialog.confirm', () => {
  assert.match(read('modulos/laboratorio/js/script.js'), /await window\.LaiftDialog\.confirm\('Trocar de vidraria descarta a mistura atual\. Deseja prosseguir\?'/);
  assert.match(read('modulos/laboratorio/studio/studio.js'), /await window\.LaiftDialog\.confirm\(msg,/);
  assert.match(read('modulos/laboratorio/js/script.js'), /window\.LaiftDialog\.alert\("=== LAIFT: DIAGNÓSTICO/);
});
