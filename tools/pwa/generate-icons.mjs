/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Gera os ícones do PWA a partir do logo (frontend/modulos/cracha/laift-marca.png):
//   node tools/pwa/generate-icons.mjs
// Usa o `sharp` que já está instalado em worker/node_modules (ferramenta de
// desenvolvimento; os ícones gerados são commitados, o build não depende dele).
//
//  - icon-192 / icon-512: logo quase inteiro sobre fundo transparente ("any");
//  - icon-maskable-512: logo a 62% sobre fundo sólido, dentro da zona segura
//    (o Android recorta em círculo/arredondado e pode cortar até 20% da borda);
//  - apple-touch-icon: 180x180 SEM transparência (o iOS pinta de preto o que é
//    transparente);
//  - favicon-32: aba do navegador.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(root, 'worker', 'package.json'));
const sharp = require('sharp');

const SOURCE = path.join(root, 'frontend', 'modulos', 'cracha', 'laift-marca.png');
const OUT_DIR = path.join(root, 'frontend', 'icons');
const WHITE = { r: 255, g: 255, b: 255 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.94, background: TRANSPARENT, opaque: false },
  { file: 'icon-512.png', size: 512, scale: 0.94, background: TRANSPARENT, opaque: false },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.62, background: { ...WHITE, alpha: 1 }, opaque: true },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.88, background: { ...WHITE, alpha: 1 }, opaque: true },
  { file: 'favicon-32.png', size: 32, scale: 1, background: TRANSPARENT, opaque: false },
];

async function render({ file, size, scale, background, opaque }) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SOURCE).resize(inner, inner, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
  let image = sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }]);
  if (opaque) image = image.flatten({ background: WHITE }).removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(path.join(OUT_DIR, file));
  return file;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const icon of ICONS) {
  console.log('gerado', await render(icon));
}
