#!/usr/bin/env node
/**
 * check-curated-signed.mjs — trava de publicação das fichas curadas
 * (PR 3.2, O2 — ata-revisao-3-2.md).
 *
 * Toda ficha em data/atlas/curated/*.json precisa pertencer a uma onda
 * (docs/atlas-conteudo/fichas/onda-NN.json) cuja revisão
 * (docs/atlas-conteudo/revisao-onda-NN.md) esteja assinada com
 * "Aprovação: aprovado" ou "aprovado com ressalvas". O build do front
 * (scripts/build.js) falha se houver ficha curada sem assinatura — assim uma
 * ficha de pendente/ copiada por engano nunca vai para produção.
 *
 * Uso: node scripts/atlas/check-curated-signed.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');

/** Valor de um campo "- **Campo:** valor" (sem negrito, aparado). */
function fieldValue(md, name) {
  const line = md.split('\n').find((l) => l.replace(/\*/g, '').trim().replace(/^-\s*/, '').toLowerCase().startsWith(`${name.toLowerCase()}:`));
  if (!line) return '';
  return line.replace(/\*/g, '').replace(/^\s*-\s*/, '').slice(name.length + 1).trim();
}

/** Assinada = "Aprovação" exatamente "aprovado" ou "aprovado com ressalvas" e revisor preenchido. */
export function isSigned(md) {
  if (typeof md !== 'string') return false;
  const ap = fieldValue(md, 'Aprovação').toLowerCase();
  const rev = fieldValue(md, 'Revisor');
  return (ap === 'aprovado' || ap === 'aprovado com ressalvas') && rev.length >= 3 && !rev.startsWith('_');
}

/**
 * @returns {{ errors: string[], signedOndas: number[] }}
 */
export function checkCuratedSigned({ root = ROOT } = {}) {
  const dataDir = path.join(root, 'frontend/modulos/anatomia-3d/data/atlas');
  const fichasDir = path.join(root, 'docs/atlas-conteudo/fichas');
  const revDir = path.join(root, 'docs/atlas-conteudo');
  const errors = [];
  const ondaOfSid = new Map();
  if (fs.existsSync(fichasDir)) {
    for (const f of fs.readdirSync(fichasDir).filter((x) => /^onda-\d+\.json$/.test(x))) {
      const o = JSON.parse(fs.readFileSync(path.join(fichasDir, f), 'utf8'));
      for (const l of o.lotes || []) for (const it of l.itens || []) for (const sid of [it.sid, ...(it.sids || [])]) ondaOfSid.set(sid, o.onda);
    }
  }
  const signedOndas = [];
  for (let n = 1; n <= 99; n++) {
    const p = path.join(revDir, `revisao-onda-${String(n).padStart(2, '0')}.md`);
    if (fs.existsSync(p) && isSigned(fs.readFileSync(p, 'utf8'))) signedOndas.push(n);
  }
  const curatedDir = path.join(dataDir, 'curated');
  if (fs.existsSync(curatedDir)) {
    for (const f of fs.readdirSync(curatedDir).filter((x) => x.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(curatedDir, f), 'utf8'));
      for (const sid of Object.keys(data)) {
        const onda = ondaOfSid.get(sid);
        if (!onda) errors.push(`curated/${f}: "${sid}" não pertence a nenhuma onda (docs/atlas-conteudo/fichas/onda-NN.json)`);
        else if (!signedOndas.includes(onda)) errors.push(`curated/${f}: "${sid}" é da onda ${onda}, sem revisao-onda-${String(onda).padStart(2, '0')}.md assinada (aprovado)`);
      }
    }
  }
  return { errors, signedOndas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, signedOndas } = checkCuratedSigned();
  if (errors.length) {
    console.error(`[atlas] ${errors.length} ficha(s) curada(s) sem assinatura do conselho:`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log(`[atlas] fichas curadas ok (ondas assinadas: ${signedOndas.join(', ') || 'nenhuma'}).`);
  }
}
