#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
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
 * Plano v4.0: também vale o checklist do lote assinado
 * (docs/atlas-conteudo/revisao-lote-N.md, checklist-lote.mjs). Aí a trava é
 * por ficha: só entra a ficha aprovada (com ou sem ressalva) no checklist.
 *
 * Uso: node scripts/atlas/check-curated-signed.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOTES, QUIZ_LOTE, parseChecklist } from './checklist-lote.mjs';

/** Casos de quiz que já estavam no atlas antes do lote 4a; os demais exigem checklist assinado. */
export const QUIZ_BASE_IDS = Object.freeze(["caso-organofosforado", "caso-primeira-passagem", "caso-broncoespasmo", "caso-filtro-renal", "caso-bhe-neurologia", "caso-acidez-gastrica", "caso-neuroeixo-espinhal", "caso-injecao-deltoide"]);

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
 * @returns {{ errors: string[], signedOndas: number[], signedLotes: number[] }}
 */
export function checkCuratedSigned({ root = ROOT } = {}) {
  const dataDir = path.join(root, 'frontend/modulos/anatomia-3d/data/atlas');
  const fichasDir = path.join(root, 'docs/atlas-conteudo/fichas');
  const revDir = path.join(root, 'docs/atlas-conteudo');
  const errors = [];
  const ondaOfSid = new Map();
  const mainOfSid = new Map();
  if (fs.existsSync(fichasDir)) {
    for (const f of fs.readdirSync(fichasDir).filter((x) => /^onda-\d+\.json$/.test(x))) {
      const o = JSON.parse(fs.readFileSync(path.join(fichasDir, f), 'utf8'));
      for (const l of o.lotes || []) for (const it of l.itens || []) for (const sid of [it.sid, ...(it.sids || [])]) { ondaOfSid.set(sid, o.onda); mainOfSid.set(sid, it.sid); }
    }
  }
  const signedOndas = [];
  for (let n = 1; n <= 99; n++) {
    const p = path.join(revDir, `revisao-onda-${String(n).padStart(2, '0')}.md`);
    if (fs.existsSync(p) && isSigned(fs.readFileSync(p, 'utf8'))) signedOndas.push(n);
  }
  const signedLotes = [];
  const approvedInLote = new Map(); // sid principal → lote
  for (const n of Object.keys(LOTES).map(Number)) {
    const p = path.join(revDir, `revisao-lote-${n}.md`);
    if (!fs.existsSync(p)) continue;
    const r = parseChecklist(fs.readFileSync(p, 'utf8'));
    if (!r.signed || r.lote !== n) continue;
    signedLotes.push(n);
    for (const sid of r.approvedSids) approvedInLote.set(sid, n);
  }
  const loteOfOnda = (onda) => Number(Object.keys(LOTES).find((k) => LOTES[k].includes(onda)));
  const curatedDir = path.join(dataDir, 'curated');
  if (fs.existsSync(curatedDir)) {
    for (const f of fs.readdirSync(curatedDir).filter((x) => x.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(curatedDir, f), 'utf8'));
      for (const sid of Object.keys(data)) {
        const onda = ondaOfSid.get(sid);
        if (!onda) errors.push(`curated/${f}: "${sid}" não pertence a nenhuma onda (docs/atlas-conteudo/fichas/onda-NN.json)`);
        else if (signedOndas.includes(onda)) continue;
        else if (signedLotes.includes(loteOfOnda(onda))) {
          if (approvedInLote.get(mainOfSid.get(sid)) !== loteOfOnda(onda)) errors.push(`curated/${f}: "${sid}" não foi aprovada no checklist assinado do lote ${loteOfOnda(onda)} (revisao-lote-${loteOfOnda(onda)}.md)`);
        } else errors.push(`curated/${f}: "${sid}" é da onda ${onda}, sem revisao-onda-${String(onda).padStart(2, '0')}.md assinada (aprovado) nem revisao-lote-${loteOfOnda(onda)}.md assinado`);
      }
    }
  }
  // Casos de quiz novos (lote 4a): só entram aprovados no checklist assinado.
  const quizFile = path.join(dataDir, 'quiz-cases.json');
  if (fs.existsSync(quizFile)) {
    const novos = (JSON.parse(fs.readFileSync(quizFile, 'utf8')) || []).filter((c) => c && !QUIZ_BASE_IDS.includes(c.id));
    if (novos.length) {
      const p = path.join(revDir, `revisao-lote-${QUIZ_LOTE}.md`);
      const r = fs.existsSync(p) ? parseChecklist(fs.readFileSync(p, 'utf8')) : null;
      const ok = new Set(r && r.signed && r.lote === QUIZ_LOTE ? r.approvedSids : []);
      for (const c of novos) if (!ok.has(c.id)) errors.push(`quiz-cases.json: o caso "${c.id}" não foi aprovado no checklist assinado do lote ${QUIZ_LOTE} (revisao-lote-${QUIZ_LOTE}.md)`);
    }
  }
  return { errors, signedOndas, signedLotes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, signedOndas, signedLotes } = checkCuratedSigned();
  if (errors.length) {
    console.error(`[atlas] ${errors.length} ficha(s) curada(s) sem assinatura do conselho:`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log(`[atlas] fichas curadas ok (ondas assinadas: ${signedOndas.join(', ') || 'nenhuma'}; lotes assinados: ${signedLotes.join(', ') || 'nenhum'}).`);
  }
}
