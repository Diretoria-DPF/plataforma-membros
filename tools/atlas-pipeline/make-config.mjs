#!/usr/bin/env node
/**
 * make-config.mjs
 *
 * Gera `manifest.config.json` (o arquivo que `build-manifest.mjs` consome)
 * a partir do que REALMENTE foi baixado/exportado nesta execução — não do
 * `manifest.config.example.json`, que é só referência estática.
 *
 * Funciona mesmo ANTES de `systems-map.json` estar confirmado (Fase A):
 * a lista de sistemas vem dos arquivos `.glb` que de fato apareceram em
 * `--zanatomy-dir` (produzidos por `export_systems.py`, que sem
 * `--systems-map` usa o slug de cada coleção de topo como id do sistema —
 * ver SOURCES.md). Quando `systems-map.json` existe, usa a `layer`/`sex`
 * dele; senão usa um valor padrão neutro e avisa.
 *
 * Uso:
 *   node make-config.mjs \
 *     --zanatomy-dir work/models/zanatomy \
 *     --zanatomy-ref <sha do commit do Z-Anatomy> \
 *     [--systems-map systems-map.json] \
 *     [--hra-dir work/models/hra] [--hra-resolved work/hra-raw/hra-resolved.json] \
 *     --out manifest.config.generated.json
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
const ZANATOMY_DIR = args['zanatomy-dir'];
const ZANATOMY_REF = args['zanatomy-ref'] || 'desconhecido';
const SYSTEMS_MAP_PATH = args['systems-map'];
const HRA_DIR = args['hra-dir'];
const HRA_RESOLVED_PATH = args['hra-resolved'];
const OUT_PATH = args.out || 'manifest.config.generated.json';

const ZA_LICENSE = 'CC-BY-SA-4.0';
const ZA_ATTRIBUTION =
  'Z-Anatomy (Lluís Vinent e colaboradores), CC BY-SA 4.0 — https://github.com/Z-Anatomy/Models-of-human-anatomy';
const ZA_SOURCE_URL = 'https://github.com/Z-Anatomy/Models-of-human-anatomy';

const HRA_LICENSE = 'CC-BY-4.0';
const HRA_ATTRIBUTION = 'Human Reference Atlas 3D Reference Object Library (CC BY 4.0), humanatlas.io';

function loadSystemsMap() {
  if (!SYSTEMS_MAP_PATH || !fs.existsSync(SYSTEMS_MAP_PATH)) {
    console.warn(
      '[make-config] systems-map.json não informado ou ainda não existe — usando layer/sex padrão para cada sistema (Fase A ainda não confirmada, ver SOURCES.md).'
    );
    return {};
  }
  return JSON.parse(fs.readFileSync(SYSTEMS_MAP_PATH, 'utf8'));
}

function buildSystemsConfig() {
  const systemsMap = loadSystemsMap();
  const systems = {};
  if (!ZANATOMY_DIR || !fs.existsSync(ZANATOMY_DIR)) {
    console.warn(`[make-config] ${ZANATOMY_DIR} não existe — nenhum sistema do Z-Anatomy no config gerado.`);
    return systems;
  }

  const files = fs.readdirSync(ZANATOMY_DIR).filter((f) => f.endsWith('.glb'));
  const lod0Files = files.filter((f) => !f.endsWith('.lod1.glb'));

  for (const lod0File of lod0Files) {
    const systemId = lod0File.replace(/\.glb$/, '');
    const lod1File = `${systemId}.lod1.glb`;
    const hasLod1 = files.includes(lod1File);
    const cfg = systemsMap[systemId] || {};
    systems[systemId] = {
      layer: cfg.layer || systemId,
      sex: cfg.sex || 'U',
      lod0: `zanatomy/${lod0File}`,
      lod1: hasLod1 ? `zanatomy/${lod1File}` : undefined,
      license: ZA_LICENSE,
      attribution: ZA_ATTRIBUTION,
      sourceUrl: ZA_SOURCE_URL,
      sourceVersion: ZANATOMY_REF,
    };
  }
  return systems;
}

function buildOrgansConfig() {
  const organs = {};
  if (!HRA_DIR || !fs.existsSync(HRA_DIR) || !HRA_RESOLVED_PATH || !fs.existsSync(HRA_RESOLVED_PATH)) {
    return organs;
  }
  const { resolved } = JSON.parse(fs.readFileSync(HRA_RESOLVED_PATH, 'utf8'));
  // A lista original pedida (hra-organs.json) tem `system`/`layer` por key —
  // lê de novo aqui só para repassar esses dois campos (fetch.mjs não os
  // grava em hra-resolved.json, que é sobre o que foi de fato baixado).
  const wantedPath = args['hra-wanted'];
  const wanted = wantedPath && fs.existsSync(wantedPath) ? JSON.parse(fs.readFileSync(wantedPath, 'utf8')) : [];
  const wantedByKey = new Map(wanted.map((w) => [w.key, w]));

  for (const r of resolved || []) {
    const glbName = `${r.key}.glb`;
    if (!fs.existsSync(path.join(HRA_DIR, glbName))) continue;
    const want = wantedByKey.get(r.key) || {};
    organs[r.key] = {
      organId: r.organId,
      sex: r.sex,
      system: want.system || 'tegumentar',
      layer: want.layer || 'visceras',
      file: `hra/${glbName}`,
      license: HRA_LICENSE,
      attribution: HRA_ATTRIBUTION,
      sourceUrl: r.sourceUrl,
      sourceVersion: r.sourceUrl ? r.sourceUrl.split('/').slice(-2, -1)[0] || 'desconhecida' : 'desconhecida',
    };
  }
  return organs;
}

const config = {
  systems: buildSystemsConfig(),
  organs: buildOrgansConfig(),
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(config, null, 2));
console.log(
  `[make-config] ${OUT_PATH}: ${Object.keys(config.systems).length} sistema(s), ${Object.keys(config.organs).length} órgão(s) do HRA.`
);
