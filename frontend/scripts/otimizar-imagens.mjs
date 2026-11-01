/*
 * Otimiza as imagens da interface (MOB-05). Uso (sharp não é dependência do projeto):
 *   npm i --no-save sharp && node scripts/otimizar-imagens.mjs
 * Gera modulos/cracha/laift-marca-80.png (interface, exibida a 40 px) a partir do
 * original, que permanece só no og:image/JSON-LD, e recomprime icons/icon-512.png
 * e icons/icon-maskable-512.png com paleta (PNG-8) e compressão máxima.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = { palette: true, quality: 90, effort: 10, compressionLevel: 9 };
const tam = (f) => fs.statSync(f).size;

const marca = path.join(raiz, 'modulos/cracha/laift-marca.png');
const marca80 = path.join(raiz, 'modulos/cracha/laift-marca-80.png');
await sharp(marca).resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png(png).toFile(marca80);
console.log('laift-marca-80.png', tam(marca80), 'bytes (original', tam(marca) + ')');

for (const nome of ['icon-512.png', 'icon-maskable-512.png']) {
  const f = path.join(raiz, 'icons', nome);
  const antes = tam(f);
  const buf = await sharp(f).png(png).toBuffer();
  if (buf.length < antes) fs.writeFileSync(f, buf);
  console.log(nome, antes, '->', Math.min(antes, buf.length), 'bytes');
}
