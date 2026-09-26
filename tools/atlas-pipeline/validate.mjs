#!/usr/bin/env node
/**
 * validate.mjs
 *
 * Confere o manifesto gerado (build-manifest.mjs) antes do PR:
 *   1. esquema — valida models/manifest.json contra
 *      frontend/modulos/anatomia-3d/data/atlas/schema/manifest.schema.json
 *      (esquema do WP02; se ainda não existir nesta execução, avisa e pula
 *      esta etapa em vez de falhar — ver plano §3.6 e a nota do WP10 sobre
 *      não editar arquivos de outros pacotes);
 *   2. orçamento — cada asset (sistema/LOD ou órgão do HRA) dentro do
 *      limite de `budgets.json` (WP02, committed — este script só LÊ esse
 *      arquivo, nunca o edita) e o total ≤ budgets.json.total.maxBytes;
 *   3. nós mapeados — nenhum nó sem sid (100% mapeado, plano §3.6);
 *   4. licenças separadas — nenhum asset mistura CC BY (HRA) com CC BY-SA
 *      (Z-Anatomy) e, quando `--licenses-dir` é informado, os dois textos
 *      de licença existem em arquivos separados (nunca um texto só).
 *
 * O manifesto real (WP10) é um objeto `{ version, generatedAt, assets: [] }`
 * — não existe "sistema hra" separado: um asset do HRA é diferenciado de um
 * asset do Z-Anatomy pela `license` (CC-BY-4.0 vs CC-BY-SA-4.0), já que o
 * esquema usa `additionalProperties: false` na raiz e não tem um campo de
 * origem dedicado.
 *
 * Uso: node validate.mjs --manifest <models/manifest.json> [--schema <arquivo>]
 *        [--budgets <budgets.json>] [--licenses-dir <models/LICENSES>]
 * Saída: código 1 se algo falhar; sempre imprime um resumo em pt-BR.
 */

// O esquema do WP02 declara "$schema": ".../draft/2020-12/schema" — o Ajv
// básico só entende draft-07; Ajv2020 (mesmo pacote "ajv") é o que sabe
// validar 2020-12 (unevaluatedProperties etc.).
import Ajv2020 from 'ajv/dist/2020.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const MANIFEST_PATH = args.manifest;
const SCHEMA_PATH =
  args.schema ||
  path.join(__dirname, '../../frontend/modulos/anatomia-3d/data/atlas/schema/manifest.schema.json');
const BUDGETS_PATH =
  args.budgets ||
  path.join(__dirname, '../../frontend/modulos/anatomia-3d/data/atlas/schema/budgets.json');
const LICENSES_DIR = args['licenses-dir'] || null;

if (!MANIFEST_PATH) {
  console.error(
    'Uso: node validate.mjs --manifest <models/manifest.json> [--schema <arquivo>] [--budgets <budgets.json>] [--licenses-dir <dir>]'
  );
  process.exit(1);
}

const CC_BY_SA = 'CC-BY-SA-4.0';
const CC_BY = 'CC-BY-4.0';
const CC0 = 'CC0-1.0';

/** Acha o orçamento de bytes (lod0/lod1) a aplicar a um asset, a partir de
 * budgets.json (WP02): assets com licença CC-BY-4.0 (HRA) usam a categoria
 * "hra"; os demais usam `bySystem[system]` quando existir, senão "default". */
function budgetFor(budgets, asset) {
  if (asset.license === CC_BY && budgets.bySystem?.hra) return budgets.bySystem.hra;
  return budgets.bySystem?.[asset.system] || budgets.bySystem?.default || null;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const errors = [];
  const warnings = [];

  // 1) Esquema do WP02, quando existir.
  if (fs.existsSync(SCHEMA_PATH)) {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validateFn = ajv.compile(schema);
    const valid = validateFn(manifest);
    if (!valid) {
      for (const e of validateFn.errors) {
        errors.push(`[esquema] ${e.instancePath || '(raiz)'} ${e.message}`);
      }
    } else {
      console.log('[esquema] manifest.json é válido contra manifest.schema.json (WP02).');
    }
  } else {
    warnings.push(
      `[esquema] ${SCHEMA_PATH} ainda não existe. Validação de esquema pulada nesta execução — repita depois que o esquema existir.`
    );
  }

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];

  // 2) Orçamento por asset e total, a partir de budgets.json (WP02).
  let totalBytes = 0;
  if (fs.existsSync(BUDGETS_PATH)) {
    const budgets = JSON.parse(fs.readFileSync(BUDGETS_PATH, 'utf8'));
    for (const asset of assets) {
      totalBytes += asset.bytes || 0;
      const budget = budgetFor(budgets, asset);
      if (!budget) continue;
      const limitBytes = budget[asset.lod];
      if (limitBytes != null && (asset.bytes || 0) > limitBytes) {
        const mb = (asset.bytes / 1024 / 1024).toFixed(2);
        const limitMB = (limitBytes / 1024 / 1024).toFixed(2);
        errors.push(
          `[orçamento] ${asset.file} (sistema "${asset.system}", ${asset.lod}) = ${mb} MB, acima do limite de ${limitMB} MB.`
        );
      }
    }
    const totalLimit = budgets.total?.maxBytes;
    if (totalLimit != null && totalBytes > totalLimit) {
      errors.push(
        `[orçamento] total = ${(totalBytes / 1024 / 1024).toFixed(2)} MB, acima do limite de ${(totalLimit / 1024 / 1024).toFixed(2)} MB (budgets.json).`
      );
    }
  } else {
    warnings.push(`[orçamento] ${BUDGETS_PATH} não existe — validação de orçamento pulada nesta execução.`);
    for (const asset of assets) totalBytes += asset.bytes || 0;
  }

  // 3) 100% dos nós mapeados para um sid.
  for (const asset of assets) {
    const nodeNames = Object.keys(asset.nodeToSid || {});
    if (nodeNames.length === 0) {
      warnings.push(`[nós] asset "${asset.file}" não tem nenhum nó mapeado.`);
    }
    for (const [nodeName, sid] of Object.entries(asset.nodeToSid || {})) {
      if (!sid) errors.push(`[nós] asset "${asset.file}", nó "${nodeName}" sem sid.`);
    }
  }

  // 4) Licenças nunca misturadas: só CC-BY-SA-4.0 (Z-Anatomy), CC-BY-4.0 (HRA)
  // ou CC0-1.0 (fixtures de teste) — e nunca uma mistura implícita disfarçada
  // de outro valor.
  for (const asset of assets) {
    if (![CC_BY_SA, CC_BY, CC0].includes(asset.license)) {
      errors.push(
        `[licença] asset "${asset.file}" tem licença "${asset.license}", esperado um de ${[CC_BY_SA, CC_BY, CC0].join(', ')}.`
      );
    }
  }

  // 4b) Quando informado, confere que models/LICENSES/ tem os textos das
  // duas licenças em arquivos SEPARADOS (nunca um texto misturado ao outro).
  if (LICENSES_DIR) {
    const ccBySaPath = path.join(LICENSES_DIR, 'CC-BY-SA-4.0.txt');
    const ccByPath = path.join(LICENSES_DIR, 'CC-BY-4.0.txt');
    const hasZAnatomyAssets = assets.some((a) => a.license === CC_BY_SA);
    const hasHraAssets = assets.some((a) => a.license === CC_BY);
    if (hasZAnatomyAssets && !fs.existsSync(ccBySaPath)) {
      errors.push(`[licença] há assets CC-BY-SA-4.0, mas ${ccBySaPath} não existe.`);
    }
    if (hasHraAssets && !fs.existsSync(ccByPath)) {
      errors.push(`[licença] há assets CC-BY-4.0, mas ${ccByPath} não existe.`);
    }
    if (fs.existsSync(ccBySaPath) && fs.existsSync(ccByPath)) {
      const a = fs.readFileSync(ccBySaPath, 'utf8');
      const b = fs.readFileSync(ccByPath, 'utf8');
      if (a.trim() === b.trim()) {
        errors.push(`[licença] ${ccBySaPath} e ${ccByPath} têm o mesmo conteúdo — as licenças não podem estar misturadas.`);
      }
    }
  }

  console.log('\n=== Resumo da validação ===');
  console.log(`Assets: ${assets.length}`);
  console.log(`Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  if (warnings.length) {
    console.log('\nAvisos:');
    for (const w of warnings) console.log(` - ${w}`);
  }

  if (errors.length) {
    console.log('\nErros:');
    for (const e of errors) console.log(` - ${e}`);
    console.log(`\nFALHOU: ${errors.length} erro(s).`);
    process.exit(1);
  }

  console.log('\nOK: nenhum erro encontrado.');
}

main();
