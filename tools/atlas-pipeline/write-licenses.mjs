#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * write-licenses.mjs
 *
 * Escreve `models/LICENSES/{CC-BY-SA-4.0.txt, CC-BY-4.0.txt, ATTRIBUTION.md}`
 * — os dois textos de licença SEMPRE em arquivos separados (nunca
 * misturados; ver plano §3.6 e validate.mjs) e um `ATTRIBUTION.md` com o
 * crédito de cada fonte, montado a partir do `manifest.json` já gerado
 * (que já tem `license`/`attribution`/`sourceUrl`/`sourceVersion` por
 * asset — este script só organiza isso em texto para humanos).
 *
 * Uso: node write-licenses.mjs --manifest <models/manifest.json> \
 *        --zanatomy-license-file <work/raw/License.txt> --out-dir <models/LICENSES>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const MANIFEST_PATH = args.manifest;
const ZA_LICENSE_FILE = args['zanatomy-license-file'];
const OUT_DIR = args['out-dir'];

if (!MANIFEST_PATH || !OUT_DIR) {
  console.error('Uso: node write-licenses.mjs --manifest <models/manifest.json> --zanatomy-license-file <arquivo> --out-dir <dir>');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// 1) CC BY-SA 4.0 — texto oficial baixado do próprio repositório do
// Z-Anatomy quando disponível; senão, cai para o texto legal público da
// Creative Commons (mesma licença, fonte diferente).
const CC_BY_SA_PATH = path.join(OUT_DIR, 'CC-BY-SA-4.0.txt');
if (ZA_LICENSE_FILE && fs.existsSync(ZA_LICENSE_FILE)) {
  fs.copyFileSync(ZA_LICENSE_FILE, CC_BY_SA_PATH);
  console.log(`CC-BY-SA-4.0.txt copiado de ${ZA_LICENSE_FILE}.`);
} else {
  const res = await fetch('https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt');
  if (!res.ok) throw new Error(`Falha ao baixar o texto legal da CC BY-SA 4.0: HTTP ${res.status}`);
  fs.writeFileSync(CC_BY_SA_PATH, await res.text());
  console.log('CC-BY-SA-4.0.txt baixado de creativecommons.org (License.txt do Z-Anatomy não encontrado).');
}

// 2) CC BY 4.0 — texto legal oficial da Creative Commons (licença do HRA).
const CC_BY_PATH = path.join(OUT_DIR, 'CC-BY-4.0.txt');
const resBy = await fetch('https://creativecommons.org/licenses/by/4.0/legalcode.txt');
if (!resBy.ok) throw new Error(`Falha ao baixar o texto legal da CC BY 4.0: HTTP ${resBy.status}`);
fs.writeFileSync(CC_BY_PATH, await resBy.text());
console.log('CC-BY-4.0.txt baixado de creativecommons.org.');

// 3) ATTRIBUTION.md — crédito por asset, extraído do manifest.json real.
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];

const zaAssets = assets.filter((a) => a.license === 'CC-BY-SA-4.0');
const hraAssets = assets.filter((a) => a.license === 'CC-BY-4.0');

function line(a) {
  return `- \`${a.file}\` — versão \`${a.sourceVersion}\`${a.sourceUrl ? ` — <${a.sourceUrl}>` : ''}`;
}

const md = `# Atribuição dos modelos 3D do Atlas Anatômico

Gerado automaticamente por \`tools/atlas-pipeline/write-licenses.mjs\` a partir
de \`models/manifest.json\` (versão \`${manifest.version}\`, gerado em
${manifest.generatedAt}). Ver também \`SOURCES.md\` para o histórico de como
cada fonte foi confirmada.

## Z-Anatomy — CC BY-SA 4.0

"All the code and content shared by 'Z-Anatomy' is under Creative Commons
Attribution-ShareAlike 4.0 International License." — texto completo em
\`CC-BY-SA-4.0.txt\`.

Autor/distribuição de referência: Lluís Vinent
(<https://lluisv.itch.io/z-anatomy>), repositório
<https://github.com/Z-Anatomy/Models-of-human-anatomy>.

Assets (${zaAssets.length}):
${zaAssets.map(line).join('\n') || '(nenhum nesta execução)'}

## Human Reference Atlas (HRA) / HuBMAP — CC BY 4.0

"Human Reference Atlas 3D Reference Object Library (CC BY 4.0),
humanatlas.io" — texto completo em \`CC-BY-4.0.txt\`.

Assets (${hraAssets.length}):
${hraAssets.map(line).join('\n') || '(nenhum nesta execução)'}
`;

fs.writeFileSync(path.join(OUT_DIR, 'ATTRIBUTION.md'), md);
console.log('ATTRIBUTION.md escrito.');
