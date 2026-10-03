#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * fichas-lotes.mjs — divide as 300 estruturas de prioridades.json em 10
 * ondas por sistema (canary, docs/atlas-conteudo/canary.md) e, dentro de
 * cada onda, em lotes de até 20 fichas (PR 3.2, B.1).
 *
 * Grava docs/atlas-conteudo/fichas/onda-NN.json:
 *   { onda, sistema, total, lotes: [ { lote, itens: [ { sid, sids, nome_pt, nome_en } ] } ] }
 *
 * Uso: node tools/atlas-content/fichas-lotes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');

/** Ordem de risco do canary (gate 0.3). */
export const ONDAS = Object.freeze(['cardiovascular', 'nervoso', 'respiratorio', 'digestorio', 'urinario',
  'endocrino', 'linfatico', 'esqueletico', 'muscular', 'articular']);
export const LOTE_MAX = 20;

/**
 * @param {Array<{system: string, name: string, sid: string, sids: string[]}>} itens (prioridades.json → itens)
 * @param {Record<string,string>} nomesPt (names-pt.json → nomes)
 */
export function buildOndas(itens, nomesPt = {}) {
  return ONDAS.map((sistema, i) => {
    const doSistema = itens.filter((x) => x.system === sistema);
    const lotes = [];
    for (let k = 0; k < doSistema.length; k += LOTE_MAX) {
      lotes.push({
        lote: lotes.length + 1,
        itens: doSistema.slice(k, k + LOTE_MAX).map((x) => ({
          sid: x.sid, sids: x.sids, nome_pt: x.nome_pt || nomesPt[x.name] || x.name, nome_en: x.name,
          ...(x.sinonimos_pt && x.sinonimos_pt.length ? { sinonimos_pt: x.sinonimos_pt } : {}),
        })),
      });
    }
    return { onda: i + 1, sistema, total: doSistema.length, lotes };
  });
}

function main() {
  const prio = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/atlas-conteudo/prioridades.json'), 'utf8'));
  const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas/names-pt.json'), 'utf8')).nomes;
  const ondas = buildOndas(prio.itens, names);
  const out = path.join(ROOT, 'docs/atlas-conteudo/fichas');
  fs.mkdirSync(out, { recursive: true });
  for (const o of ondas) {
    fs.writeFileSync(path.join(out, `onda-${String(o.onda).padStart(2, '0')}.json`), JSON.stringify(o, null, 2) + '\n');
  }
  console.log(ondas.map((o) => `onda ${o.onda} ${o.sistema}: ${o.total} (${o.lotes.length} lote(s))`).join('\n'));
  console.log(`total: ${ondas.reduce((n, o) => n + o.total, 0)} fichas, ${ondas.reduce((n, o) => n + o.lotes.length, 0)} lotes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
