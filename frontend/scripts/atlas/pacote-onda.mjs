#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * pacote-onda.mjs — junta os lotes de uma onda num arquivo só para o
 * conselho carregar na ferramenta de revisão (modulos/anatomia-3d/revisao/).
 * O pacote NÃO vai para o repositório nem para o site: é enviado ao revisor.
 *
 * Uso: node scripts/atlas/pacote-onda.mjs 01 [saida.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PEND = path.resolve(here, '../../../docs/atlas-conteudo/fichas/pendente');

export function buildPacote(onda, dir = PEND) {
  const nn = String(onda).padStart(2, '0');
  const ondaDir = path.join(dir, `onda-${nn}`);
  if (!fs.existsSync(ondaDir)) throw new Error(`não existe ${ondaDir}`);
  const lotes = {};
  for (const f of fs.readdirSync(ondaDir).filter((x) => /^lote-\d+\.json$/.test(x)).sort()) {
    lotes[f] = JSON.parse(fs.readFileSync(path.join(ondaDir, f), 'utf8'));
  }
  return { onda: Number(onda), gerado: new Date().toISOString().slice(0, 10), lotes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [onda, out] = process.argv.slice(2);
  if (!onda) { console.error('uso: node scripts/atlas/pacote-onda.mjs NN [saida.json]'); process.exit(1); }
  const p = buildPacote(onda);
  const dest = out || `pacote-onda-${String(onda).padStart(2, '0')}.json`;
  fs.writeFileSync(dest, JSON.stringify(p, null, 1));
  const n = Object.values(p.lotes).reduce((a, l) => a + Object.keys(l).length, 0);
  console.log(`[atlas] ${dest}: onda ${onda}, ${Object.keys(p.lotes).length} lotes, ${n} fichas`);
}
