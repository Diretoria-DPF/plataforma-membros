#!/usr/bin/env node
/*
 * Injeta o conteudo de lia.svg dentro de lab.html, entre os marcadores
 * <!-- LIA_SVG_START --> e <!-- LIA_SVG_END --> (dentro do <template id="lia-src">).
 * Motivo: fetch nao funciona em file://, entao o lab leva o SVG embutido.
 * Uso: node frontend/modulos/shared/lia/build-lab.mjs
 * Idempotente: rodar de novo sem mudar lia.svg nao altera lab.html.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const INICIO = '<!-- LIA_SVG_START -->';
const FIM = '<!-- LIA_SVG_END -->';

const svg = (await readFile(join(dir, 'lia.svg'), 'utf8')).replace(/^\s*<\?xml[^>]*>\s*/, '').trim();
if (!svg.startsWith('<svg') || /<script/i.test(svg) || /<\/?template/i.test(svg)) {
  throw new Error('lia.svg invalido para embutir no lab (esperado <svg>, sem <script> nem <template>).');
}

const alvo = join(dir, 'lab.html');
const html = await readFile(alvo, 'utf8');
const i = html.indexOf(INICIO);
const f = html.indexOf(FIM);
if (i < 0 || f < i) throw new Error('Marcadores LIA_SVG_START/END nao encontrados em lab.html.');

const novo = html.slice(0, i + INICIO.length) + '\n' + svg + '\n' + html.slice(f);
if (novo !== html) {
  await writeFile(alvo, novo, 'utf8');
  console.log('lab.html atualizado com lia.svg (' + Buffer.byteLength(svg, 'utf8') + ' bytes).');
} else {
  console.log('lab.html ja estava atualizado.');
}
