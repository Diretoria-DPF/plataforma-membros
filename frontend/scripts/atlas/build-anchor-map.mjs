#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * build-anchor-map.mjs — liga as âncoras de Fisiologia & Vias a pontos reais
 * do corpo 3D.
 * ---------------------------------------------------------------------------
 * As âncoras de data/atlas/routes.json e processes.json vieram do atlas
 * antigo (ex.: "za:espaco-epidural", "za:eixo-hpa") e não existem no modelo
 * Z-Anatomy/HRA. Sem um ponto 3D, resolvePath() (js/modes/path-anim.js)
 * descartava todas e nenhuma via tocava.
 *
 * Entrada (escrita à mão, revisável): data/atlas/anchor-spec.json
 *   {
 *     "anchors": { "<sid da âncora>": <alvo> },
 *     "steps":   { "<id do processo>:<ordem>": <alvo> }   // passo a passo
 *   }
 *   <alvo> = { "name": "Right atrium", "side"?: "l"|"r",
 *              "offset"?: [dx, dy, dz], "note"?: "..." }
 *            | { "point": [x, y, z], "note": "..." }
 *   `name` casa com o englishName de structures.json (sem diferenciar
 *   maiúsculas; nomes do HRA também sem o prefixo "VH_M_"/"VH_F_" e com "_"
 *   como espaço). `offset` (metros) aproxima estruturas que o modelo não tem
 *   (aorta, veias cavas, útero…) a partir de uma vizinha que ele tem.
 *   Referencial: metros, +y para cima, +x = lado ESQUERDO do paciente,
 *   +z = anterior (ver VIEW_PRESETS em js/engine/camera-math.js).
 *
 * Saída: data/atlas/generated/anchor-map.json
 *   { "anchors": { "<chave>": { "sid": "<sid real>"|null, "point": [x,y,z] } } }
 *   `sid` só quando a âncora É a estrutura (sem offset) — a Fisiologia a
 *   seleciona/destaca; com offset ou ponto avulso, só o ponto é usado.
 *   Passos de processo saem com a chave "<id>:<ordem>".
 *
 * Uso: node scripts/atlas/build-anchor-map.mjs   (falha se faltar âncora)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.resolve(here, '../../modulos/anatomia-3d/data/atlas');

// Mesma translação de js/engine/registry.js (alignHraNode): os órgãos do
// HRA ("za:vh-*") estão 0,81 m abaixo do corpo Z-Anatomy no arquivo.
export const HRA_SID_RE = /^za:vh-/;
export const HRA_TO_ZANATOMY_OFFSET = Object.freeze([0, 0.81, 0]);

function normName(s) {
  return String(s || '')
    .replace(/^VH_[MF]_/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Centro da bbox no referencial do corpo (aplica a translação do HRA). */
export function centerOf(structure) {
  const { min, max } = structure.bbox;
  const c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  if (HRA_SID_RE.test(structure.sid)) {
    for (let i = 0; i < 3; i++) c[i] += HRA_TO_ZANATOMY_OFFSET[i];
  }
  return c;
}

/**
 * Índice nome → estruturas. Nome exato do Z-Anatomy vence o equivalente do
 * HRA (os dois têm, p. ex., "Left ventricle").
 */
export function indexStructures(structures) {
  const byName = new Map();
  for (const s of structures) {
    if (!s.bbox) continue;
    const exact = String(s.englishName || '').trim().toLowerCase();
    const loose = normName(s.englishName);
    // Z-Anatomy (1) > HRA masculino (2, o corpo padrão) > HRA feminino (3).
    const looseRank = !HRA_SID_RE.test(s.sid) ? 1 : /^za:vh-f-/.test(s.sid) ? 3 : 2;
    for (const [key, rank] of [[exact, 0], [loose, looseRank]]) {
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ s, rank });
    }
  }
  return byName;
}

/** Resolve um <alvo> do spec → { sid, point } ou lança erro legível. */
export function resolveTarget(target, byName, where) {
  if (Array.isArray(target.point)) {
    if (target.point.length !== 3 || !target.point.every(Number.isFinite)) {
      throw new Error(`${where}: "point" precisa ser [x, y, z] numérico`);
    }
    return { sid: null, point: target.point.map((v) => round(v)) };
  }
  if (!target.name) throw new Error(`${where}: alvo sem "name" nem "point"`);
  const cands = (byName.get(String(target.name).trim().toLowerCase()) || byName.get(normName(target.name)) || [])
    .filter(({ s }) => !target.side || s.side === target.side)
    .sort((a, b) => a.rank - b.rank || sideRank(a.s) - sideRank(b.s));
  if (!cands.length) {
    throw new Error(`${where}: nenhuma estrutura "${target.name}"${target.side ? ` (lado ${target.side})` : ''} em structures.json`);
  }
  const s = cands[0].s;
  const c = centerOf(s);
  const off = target.offset || [0, 0, 0];
  if (off.length !== 3 || !off.every(Number.isFinite)) throw new Error(`${where}: "offset" precisa ser [dx, dy, dz]`);
  const point = c.map((v, i) => round(v + off[i]));
  const hasOffset = off.some((v) => v !== 0);
  return { sid: hasOffset ? null : s.sid, point };
}

// Sem lado pedido: estrutura ímpar primeiro, depois a direita (convenção de
// via de acesso — deltoide, antebraço etc. — e de órgão par).
function sideRank(s) {
  return !s.side ? 0 : s.side === 'r' ? 1 : 2;
}

function round(v) {
  return Math.round(v * 10000) / 10000 || 0; // sem "-0" (some no JSON)
}

/** Todas as chaves que o atlas vai pedir (âncoras de rotas e passos). */
export function requiredKeys(routes, processes, spec) {
  const keys = new Set();
  for (const r of routes) for (const a of r.anchors || []) keys.add(a.sid);
  for (const p of processes) {
    for (const st of p.steps || []) {
      const stepKey = `${p.id}:${st.order}`;
      if (spec.steps && spec.steps[stepKey]) keys.add(stepKey);
      else for (const a of st.anchors || []) keys.add(a.sid);
    }
  }
  return keys;
}

/**
 * @returns {{ map: {anchors: Object}, errors: string[] }}
 */
export function buildAnchorMap({ spec, structures, routes, processes }) {
  const byName = indexStructures(structures);
  const realSids = new Set(structures.map((s) => s.sid));
  const bySid = new Map(structures.map((s) => [s.sid, s]));
  const anchors = {};
  const errors = [];

  const entries = [
    ...Object.entries(spec.anchors || {}),
    ...Object.entries(spec.steps || {}),
  ];
  for (const [key, target] of entries) {
    try {
      anchors[key] = resolveTarget(target, byName, key);
    } catch (e) {
      errors.push(e.message);
    }
  }

  const specKeys = new Set(entries.map(([k]) => k));
  for (const key of requiredKeys(routes, processes, spec)) {
    if (anchors[key] || specKeys.has(key)) continue; // erro do spec já anotado
    // Âncora que já é uma estrutura real (ex.: "za:liver"): usa a própria.
    if (realSids.has(key) && bySid.get(key).bbox) {
      anchors[key] = { sid: key, point: centerOf(bySid.get(key)).map(round) };
      continue;
    }
    errors.push(`${key}: âncora usada em routes/processes sem entrada em anchor-spec.json`);
  }

  // Ordena as chaves para diffs estáveis.
  const sorted = {};
  for (const k of Object.keys(anchors).sort()) sorted[k] = anchors[k];
  return { map: { anchors: sorted }, errors };
}

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ATLAS, rel), 'utf8'));
}

function main() {
  const spec = readJson('anchor-spec.json');
  const structuresRaw = readJson('generated/structures.json');
  const routesRaw = readJson('routes.json');
  const processesRaw = readJson('processes.json');
  const structures = Array.isArray(structuresRaw) ? structuresRaw : structuresRaw.structures;
  const routes = Array.isArray(routesRaw) ? routesRaw : routesRaw.routes;
  const processes = Array.isArray(processesRaw) ? processesRaw : processesRaw.processes;

  const { map, errors } = buildAnchorMap({ spec, structures, routes, processes });
  if (errors.length) {
    console.error(`build-anchor-map: ${errors.length} erro(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  const out = path.join(ATLAS, 'generated/anchor-map.json');
  // Uma âncora por linha: diffs legíveis na revisão.
  const lines = Object.entries(map.anchors).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  writeFileSync(out, `{\n "anchors": {\n${lines.join(',\n')}\n }\n}\n`, 'utf8');
  const n = Object.keys(map.anchors).length;
  const withSid = Object.values(map.anchors).filter((a) => a.sid).length;
  console.log(`build-anchor-map: ${n} âncoras → ${path.relative(process.cwd(), out)} (${withSid} ligadas a uma estrutura, ${n - withSid} por ponto)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
