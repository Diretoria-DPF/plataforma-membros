#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * scripts/atlas/make-fixtures.mjs
 *
 * Gera as fixtures do Atlas Anatômico v2: GLBs minúsculos (formas geométricas
 * simples — caixas, cilindros e esferas) mais o index.json, manifest.json,
 * content/<sistema>.json, glossario-pt.json, routes.json, processes.json e
 * quiz-cases.json correspondentes, em
 * frontend/modulos/anatomia-3d/data/atlas/fixtures/.
 *
 * Objetivo: permitir que o motor 3D e a interface sejam desenvolvidos e
 * testados sem depender dos downloads reais (Z-Anatomy/HRA), que só rodam no
 * pipeline do GitHub Actions (ver plano, seção 3). Use com `?fixtures=1`.
 *
 * Determinístico: rodar este script duas vezes, sem mudar as dependências,
 * produz exatamente os mesmos bytes (nenhum timestamp, id aleatório ou
 * `Math.random()` entra nos arquivos gerados).
 *
 * Uso: node scripts/atlas/make-fixtures.mjs
 */

import { Document, NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// frontend/scripts/atlas -> frontend
const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ATLAS_DATA_DIR = path.join(FRONTEND_DIR, 'modulos', 'anatomia-3d', 'data', 'atlas');
const FIXTURES_DIR = path.join(ATLAS_DATA_DIR, 'fixtures');
const MODELS_DIR = path.join(FIXTURES_DIR, 'models');
const CONTENT_DIR = path.join(FIXTURES_DIR, 'content');

// ---------------------------------------------------------------------------
// Geometria procedural (baixo nível de detalhe de propósito — são fixtures)
// ---------------------------------------------------------------------------

/** @returns {{positions:Float32Array, normals:Float32Array, indices:Uint16Array}} */
function makeBox(sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const positions = new Float32Array([
    -hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz,
    -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, // trás
    4, 5, 6, 4, 6, 7, // frente
    0, 1, 5, 0, 5, 4, // baixo
    3, 6, 2, 3, 7, 6, // cima
    0, 4, 7, 0, 7, 3, // esquerda
    1, 2, 6, 1, 6, 5, // direita
  ]);
  // Normal aproximada: direção do centro ao vértice (barato, suficiente p/ fixture).
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i] = x / len; normals[i + 1] = y / len; normals[i + 2] = z / len;
  }
  return { positions, normals, indices };
}

/** UV sphere. */
function makeSphere(r, latSegs, lonSegs) {
  const positions = [];
  const normals = [];
  for (let i = 0; i <= latSegs; i++) {
    const theta = (i / latSegs) * Math.PI; // 0 (polo +Y) .. PI (polo -Y)
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let j = 0; j <= lonSegs; j++) {
      const phi = (j / lonSegs) * Math.PI * 2;
      const x = sinT * Math.cos(phi);
      const y = cosT;
      const z = sinT * Math.sin(phi);
      positions.push(r * x, r * y, r * z);
      normals.push(x, y, z);
    }
  }
  const indices = [];
  const cols = lonSegs + 1;
  for (let i = 0; i < latSegs; i++) {
    for (let j = 0; j < lonSegs; j++) {
      const a = i * cols + j;
      const b = a + cols;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

/** Cilindro com tampas, eixo Y. */
function makeCylinder(r, h, radialSegs) {
  const positions = [];
  const normals = [];
  const halfH = h / 2;
  // Anel de cima (0..radialSegs-1) e anel de baixo (radialSegs..2*radialSegs-1):
  // usados tanto para os lados quanto (reaproveitados) para as tampas.
  for (const y of [halfH, -halfH]) {
    for (let k = 0; k < radialSegs; k++) {
      const ang = (k / radialSegs) * Math.PI * 2;
      const x = Math.cos(ang), z = Math.sin(ang);
      positions.push(r * x, y, r * z);
      normals.push(x, 0, z); // normal radial (lado)
    }
  }
  const topCenter = positions.length / 3;
  positions.push(0, halfH, 0); normals.push(0, 1, 0);
  const bottomCenter = topCenter + 1;
  positions.push(0, -halfH, 0); normals.push(0, -1, 0);

  const indices = [];
  for (let k = 0; k < radialSegs; k++) {
    const k2 = (k + 1) % radialSegs;
    const aTop = k, bTop = k2;
    const aBot = radialSegs + k, bBot = radialSegs + k2;
    // lado (2 triângulos por segmento)
    indices.push(aTop, aBot, bTop, bTop, aBot, bBot);
    // tampa de cima (fan)
    indices.push(topCenter, k, k2);
    // tampa de baixo (fan, sentido invertido)
    indices.push(bottomCenter, radialSegs + k2, radialSegs + k);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

function box(x, y, z) { return { type: 'box', size: [x, y, z] }; }
function sph(r) { return { type: 'sphere', r }; }
function cyl(r, h) { return { type: 'cylinder', r, h }; }

const LOD_CONFIG = {
  lod0: { sphere: [6, 8], cylinder: [8] },
  lod1: { sphere: [3, 4], cylinder: [4] },
};

function buildGeometry(shape, lod) {
  const cfg = LOD_CONFIG[lod];
  if (shape.type === 'box') return makeBox(...shape.size);
  if (shape.type === 'sphere') return makeSphere(shape.r, ...cfg.sphere);
  if (shape.type === 'cylinder') return makeCylinder(shape.r, shape.h, ...cfg.cylinder);
  throw new Error(`Forma desconhecida: ${shape.type}`);
}

function shapeBBoxLocal(shape) {
  if (shape.type === 'box') {
    const [sx, sy, sz] = shape.size;
    return { min: [-sx / 2, -sy / 2, -sz / 2], max: [sx / 2, sy / 2, sz / 2] };
  }
  if (shape.type === 'sphere') {
    return { min: [-shape.r, -shape.r, -shape.r], max: [shape.r, shape.r, shape.r] };
  }
  if (shape.type === 'cylinder') {
    return { min: [-shape.r, -shape.h / 2, -shape.r], max: [shape.r, shape.h / 2, shape.r] };
  }
  throw new Error(`Forma desconhecida: ${shape.type}`);
}

// ---------------------------------------------------------------------------
// Dados anatômicos das fixtures
//
// Convenção de coordenadas: metros, eixo Y para cima, origem no piso entre os
// pés, corpo com ~1,75 m de altura (mesmo referencial pretendido para o
// Z-Anatomy real — ver plano, seção 3). Convenção interna de lado: +X = lado
// direito anatômico do corpo, -X = lado esquerdo (não é necessariamente a
// direita da tela; depende de para onde o modelo está de frente).
//
// sid: usamos `fma:<n>` apenas para os ids que o plano deu como confiáveis
// (coração, fígado, pulmões, encéfalo, estômago, rins, fêmur, úmero); todo o
// resto usa `za:<slug>` porque não temos certeza do id FMA correto.
// ---------------------------------------------------------------------------

/** Cria uma estrutura de fixture. */
function st(slug, sid, pt, en, la, layer, region, shape, pos, extra = {}) {
  return {
    slug, sid, pt, en, la, layer, region, shape, pos,
    side: extra.side ?? null,
    parent: extra.parent ?? null,
  };
}

const SYSTEMS = [
  {
    system: 'esqueletico', fileKey: 'esqueletico', sex: 'U',
    structures: [
      st('cranio', 'za:cranio', 'Crânio', 'Skull', 'Cranium', 'esqueleto', 'cabeca', sph(0.10), [0, 1.68, 0]),
      st('coluna-vertebral', 'za:coluna-vertebral', 'Coluna Vertebral', 'Vertebral column', 'Columna vertebralis', 'esqueleto', 'dorso', cyl(0.04, 0.65), [0, 1.15, -0.05]),
      st('esterno', 'za:esterno', 'Esterno', 'Sternum', 'Sternum', 'esqueleto', 'torax', box(0.03, 0.18, 0.02), [0, 1.35, 0.09]),
      st('costelas', 'za:costelas', 'Costelas', 'Ribs', 'Costae', 'esqueleto', 'torax', box(0.28, 0.30, 0.20), [0, 1.30, 0]),
      st('clavicula-direita', 'za:clavicula-direita', 'Clavícula Direita', 'Right clavicle', 'Clavicula dextra', 'esqueleto', 'torax', cyl(0.015, 0.15), [0.12, 1.47, 0.03], { side: 'R' }),
      st('clavicula-esquerda', 'za:clavicula-esquerda', 'Clavícula Esquerda', 'Left clavicle', 'Clavicula sinistra', 'esqueleto', 'torax', cyl(0.015, 0.15), [-0.12, 1.47, 0.03], { side: 'L' }),
      st('pelve', 'za:pelve', 'Pelve', 'Pelvis', 'Pelvis', 'esqueleto', 'pelve', box(0.30, 0.18, 0.20), [0, 0.92, 0]),
      st('femur-direito', 'fma:9611', 'Fêmur Direito', 'Right femur', 'Femur dextrum', 'esqueleto', 'membro-inferior-direito', cyl(0.025, 0.42), [0.10, 0.70, 0], { side: 'R' }),
      st('femur-esquerdo', 'za:femur-esquerdo', 'Fêmur Esquerdo', 'Left femur', 'Femur sinistrum', 'esqueleto', 'membro-inferior-esquerdo', cyl(0.025, 0.42), [-0.10, 0.70, 0], { side: 'L' }),
      st('umero-direito', 'fma:13303', 'Úmero Direito', 'Right humerus', 'Humerus dextrum', 'esqueleto', 'membro-superior-direito', cyl(0.018, 0.30), [0.20, 1.25, 0], { side: 'R' }),
      st('umero-esquerdo', 'za:umero-esquerdo', 'Úmero Esquerdo', 'Left humerus', 'Humerus sinistrum', 'esqueleto', 'membro-superior-esquerdo', cyl(0.018, 0.30), [-0.20, 1.25, 0], { side: 'L' }),
    ],
  },
  {
    system: 'muscular', fileKey: 'muscular', sex: 'U',
    structures: [
      st('trapezio', 'za:trapezio', 'Trapézio', 'Trapezius', 'Musculus trapezius', 'musculos', 'dorso', box(0.30, 0.20, 0.05), [0, 1.45, -0.06]),
      st('reto-abdominal', 'za:reto-abdominal', 'Reto do Abdome', 'Rectus abdominis', 'Musculus rectus abdominis', 'musculos', 'abdome', box(0.12, 0.25, 0.03), [0, 1.05, 0.08]),
      st('biceps-braquial-direito', 'za:biceps-braquial-direito', 'Bíceps Braquial Direito', 'Right biceps brachii', 'Musculus biceps brachii dexter', 'musculos', 'membro-superior-direito', cyl(0.03, 0.20), [0.20, 1.28, 0.03], { side: 'R' }),
      st('biceps-braquial-esquerdo', 'za:biceps-braquial-esquerdo', 'Bíceps Braquial Esquerdo', 'Left biceps brachii', 'Musculus biceps brachii sinister', 'musculos', 'membro-superior-esquerdo', cyl(0.03, 0.20), [-0.20, 1.28, 0.03], { side: 'L' }),
      st('deltoide-direito', 'za:deltoide-direito', 'Deltoide Direito', 'Right deltoid', 'Musculus deltoideus dexter', 'musculos', 'membro-superior-direito', sph(0.05), [0.21, 1.44, 0], { side: 'R' }),
      st('deltoide-esquerdo', 'za:deltoide-esquerdo', 'Deltoide Esquerdo', 'Left deltoid', 'Musculus deltoideus sinister', 'musculos', 'membro-superior-esquerdo', sph(0.05), [-0.21, 1.44, 0], { side: 'L' }),
      st('quadriceps-femoral-direito', 'za:quadriceps-femoral-direito', 'Quadríceps Femoral Direito', 'Right quadriceps femoris', 'Musculus quadriceps femoris dexter', 'musculos', 'membro-inferior-direito', cyl(0.045, 0.35), [0.10, 0.68, 0.03], { side: 'R' }),
      st('quadriceps-femoral-esquerdo', 'za:quadriceps-femoral-esquerdo', 'Quadríceps Femoral Esquerdo', 'Left quadriceps femoris', 'Musculus quadriceps femoris sinister', 'musculos', 'membro-inferior-esquerdo', cyl(0.045, 0.35), [-0.10, 0.68, 0.03], { side: 'L' }),
      st('gluteo-maximo-direito', 'za:gluteo-maximo-direito', 'Glúteo Máximo Direito', 'Right gluteus maximus', 'Musculus gluteus maximus dexter', 'musculos', 'pelve', sph(0.08), [0.10, 0.90, -0.08], { side: 'R' }),
      st('gluteo-maximo-esquerdo', 'za:gluteo-maximo-esquerdo', 'Glúteo Máximo Esquerdo', 'Left gluteus maximus', 'Musculus gluteus maximus sinister', 'musculos', 'pelve', sph(0.08), [-0.10, 0.90, -0.08], { side: 'L' }),
    ],
  },
  {
    system: 'cardiovascular', fileKey: 'cardiovascular', sex: 'U',
    structures: [
      st('coracao', 'fma:7088', 'Coração', 'Heart', 'Cor', 'visceras', 'torax', sph(0.06), [-0.02, 1.32, 0.05]),
      st('aorta', 'za:aorta', 'Aorta', 'Aorta', 'Aorta', 'vasos', 'torax', cyl(0.012, 0.40), [0, 1.20, 0]),
      st('veia-cava-superior', 'za:veia-cava-superior', 'Veia Cava Superior', 'Superior vena cava', 'Vena cava superior', 'vasos', 'torax', cyl(0.010, 0.10), [0.02, 1.42, 0.02]),
      st('veia-cava-inferior', 'za:veia-cava-inferior', 'Veia Cava Inferior', 'Inferior vena cava', 'Vena cava inferior', 'vasos', 'abdome', cyl(0.010, 0.30), [0.02, 1.05, -0.02]),
      st('arteria-carotida-comum-direita', 'za:arteria-carotida-comum-direita', 'Artéria Carótida Comum Direita', 'Right common carotid artery', 'Arteria carotis communis dextra', 'vasos', 'pescoco', cyl(0.006, 0.12), [0.03, 1.55, 0.02], { side: 'R' }),
      st('arteria-carotida-comum-esquerda', 'za:arteria-carotida-comum-esquerda', 'Artéria Carótida Comum Esquerda', 'Left common carotid artery', 'Arteria carotis communis sinistra', 'vasos', 'pescoco', cyl(0.006, 0.12), [-0.03, 1.55, 0.02], { side: 'L' }),
      st('veia-jugular-interna-direita', 'za:veia-jugular-interna-direita', 'Veia Jugular Interna Direita', 'Right internal jugular vein', 'Vena jugularis interna dextra', 'vasos', 'pescoco', cyl(0.006, 0.12), [0.04, 1.55, -0.01], { side: 'R' }),
      st('veia-jugular-interna-esquerda', 'za:veia-jugular-interna-esquerda', 'Veia Jugular Interna Esquerda', 'Left internal jugular vein', 'Vena jugularis interna sinistra', 'vasos', 'pescoco', cyl(0.006, 0.12), [-0.04, 1.55, -0.01], { side: 'L' }),
      st('arteria-femoral-direita', 'za:arteria-femoral-direita', 'Artéria Femoral Direita', 'Right femoral artery', 'Arteria femoralis dextra', 'vasos', 'membro-inferior-direito', cyl(0.007, 0.30), [0.09, 0.70, 0.02], { side: 'R' }),
      st('arteria-femoral-esquerda', 'za:arteria-femoral-esquerda', 'Artéria Femoral Esquerda', 'Left femoral artery', 'Arteria femoralis sinistra', 'vasos', 'membro-inferior-esquerdo', cyl(0.007, 0.30), [-0.09, 0.70, 0.02], { side: 'L' }),
    ],
  },
  {
    system: 'nervoso', fileKey: 'nervoso', sex: 'U',
    structures: [
      st('encefalo', 'fma:50801', 'Encéfalo', 'Brain', 'Encephalon', 'nervos', 'cabeca', sph(0.09), [0, 1.70, 0]),
      st('cerebelo', 'za:cerebelo', 'Cerebelo', 'Cerebellum', 'Cerebellum', 'nervos', 'cabeca', sph(0.04), [0, 1.66, -0.05]),
      st('medula-espinhal', 'za:medula-espinhal', 'Medula Espinhal', 'Spinal cord', 'Medulla spinalis', 'nervos', 'dorso', cyl(0.012, 0.55), [0, 1.20, -0.04]),
      st('nervo-ciatico-direito', 'za:nervo-ciatico-direito', 'Nervo Isquiático Direito', 'Right sciatic nerve', 'Nervus ischiadicus dexter', 'nervos', 'membro-inferior-direito', cyl(0.008, 0.40), [0.08, 0.55, -0.03], { side: 'R' }),
      st('nervo-ciatico-esquerdo', 'za:nervo-ciatico-esquerdo', 'Nervo Isquiático Esquerdo', 'Left sciatic nerve', 'Nervus ischiadicus sinister', 'nervos', 'membro-inferior-esquerdo', cyl(0.008, 0.40), [-0.08, 0.55, -0.03], { side: 'L' }),
      st('nervo-mediano-direito', 'za:nervo-mediano-direito', 'Nervo Mediano Direito', 'Right median nerve', 'Nervus medianus dexter', 'nervos', 'membro-superior-direito', cyl(0.004, 0.25), [0.20, 0.95, 0.02], { side: 'R' }),
      st('nervo-mediano-esquerdo', 'za:nervo-mediano-esquerdo', 'Nervo Mediano Esquerdo', 'Left median nerve', 'Nervus medianus sinister', 'nervos', 'membro-superior-esquerdo', cyl(0.004, 0.25), [-0.20, 0.95, 0.02], { side: 'L' }),
      st('nervo-vago-direito', 'za:nervo-vago-direito', 'Nervo Vago Direito', 'Right vagus nerve', 'Nervus vagus dexter', 'nervos', 'pescoco', cyl(0.003, 0.30), [0.025, 1.45, 0], { side: 'R' }),
      st('nervo-vago-esquerdo', 'za:nervo-vago-esquerdo', 'Nervo Vago Esquerdo', 'Left vagus nerve', 'Nervus vagus sinister', 'nervos', 'pescoco', cyl(0.003, 0.30), [-0.025, 1.45, 0], { side: 'L' }),
    ],
  },
  {
    system: 'respiratorio', fileKey: 'respiratorio', sex: 'U',
    structures: [
      st('pulmao-direito', 'fma:7309', 'Pulmão Direito', 'Right lung', 'Pulmo dexter', 'visceras', 'torax', box(0.10, 0.22, 0.14), [0.09, 1.32, 0.02], { side: 'R' }),
      st('pulmao-esquerdo', 'fma:7310', 'Pulmão Esquerdo', 'Left lung', 'Pulmo sinister', 'visceras', 'torax', box(0.10, 0.22, 0.14), [-0.09, 1.32, 0.02], { side: 'L' }),
      st('traqueia', 'za:traqueia', 'Traqueia', 'Trachea', 'Trachea', 'visceras', 'pescoco', cyl(0.012, 0.12), [0, 1.48, 0.03]),
      st('laringe', 'za:laringe', 'Laringe', 'Larynx', 'Larynx', 'visceras', 'pescoco', sph(0.025), [0, 1.53, 0.03]),
      st('bronquio-principal-direito', 'za:bronquio-principal-direito', 'Brônquio Principal Direito', 'Right main bronchus', 'Bronchus principalis dexter', 'visceras', 'torax', cyl(0.008, 0.06), [0.04, 1.38, 0.02], { side: 'R' }),
      st('bronquio-principal-esquerdo', 'za:bronquio-principal-esquerdo', 'Brônquio Principal Esquerdo', 'Left main bronchus', 'Bronchus principalis sinister', 'visceras', 'torax', cyl(0.008, 0.06), [-0.04, 1.38, 0.02], { side: 'L' }),
      st('diafragma', 'za:diafragma', 'Diafragma', 'Diaphragm', 'Diaphragma', 'visceras', 'torax', box(0.24, 0.02, 0.16), [0, 1.20, 0]),
    ],
  },
  {
    system: 'digestorio', fileKey: 'digestorio', sex: 'U',
    structures: [
      st('figado', 'fma:7197', 'Fígado', 'Liver', 'Hepar', 'visceras', 'abdome', box(0.18, 0.10, 0.12), [0.08, 1.10, 0.06]),
      st('estomago', 'fma:7148', 'Estômago', 'Stomach', 'Gaster', 'visceras', 'abdome', sph(0.06), [-0.06, 1.08, 0.05]),
      st('esofago', 'za:esofago', 'Esôfago', 'Esophagus', 'Oesophagus', 'visceras', 'torax', cyl(0.010, 0.30), [0, 1.30, 0]),
      st('intestino-delgado', 'za:intestino-delgado', 'Intestino Delgado', 'Small intestine', 'Intestinum tenue', 'visceras', 'abdome', sph(0.09), [0, 0.98, 0.04]),
      st('intestino-grosso', 'za:intestino-grosso', 'Intestino Grosso', 'Large intestine', 'Intestinum crassum', 'visceras', 'abdome', box(0.24, 0.10, 0.10), [0, 0.95, 0]),
      st('pancreas', 'za:pancreas', 'Pâncreas', 'Pancreas', 'Pancreas', 'visceras', 'abdome', cyl(0.02, 0.12), [0, 1.06, -0.02]),
      st('vesicula-biliar', 'za:vesicula-biliar', 'Vesícula Biliar', 'Gallbladder', 'Vesica biliaris', 'visceras', 'abdome', sph(0.02), [0.10, 1.05, 0.07]),
    ],
  },
  {
    system: 'urinario', fileKey: 'urinario', sex: 'U',
    structures: [
      st('rim-direito', 'fma:7204', 'Rim Direito', 'Right kidney', 'Ren dexter', 'visceras', 'abdome', sph(0.035), [0.08, 1.05, -0.06], { side: 'R' }),
      st('rim-esquerdo', 'fma:7205', 'Rim Esquerdo', 'Left kidney', 'Ren sinister', 'visceras', 'abdome', sph(0.035), [-0.08, 1.05, -0.06], { side: 'L' }),
      st('ureter-direito', 'za:ureter-direito', 'Ureter Direito', 'Right ureter', 'Ureter dexter', 'visceras', 'abdome', cyl(0.004, 0.25), [0.06, 0.92, -0.04], { side: 'R' }),
      st('ureter-esquerdo', 'za:ureter-esquerdo', 'Ureter Esquerdo', 'Left ureter', 'Ureter sinister', 'visceras', 'abdome', cyl(0.004, 0.25), [-0.06, 0.92, -0.04], { side: 'L' }),
      st('vesicula-urinaria', 'za:vesicula-urinaria', 'Vesícula Urinária', 'Urinary bladder', 'Vesica urinaria', 'visceras', 'pelve', sph(0.05), [0, 0.85, 0.03]),
      st('uretra', 'za:uretra', 'Uretra', 'Urethra', 'Urethra', 'visceras', 'pelve', cyl(0.005, 0.06), [0, 0.80, 0.02]),
    ],
  },
  {
    system: 'reprodutor', fileKey: 'reprodutor-m', sex: 'M',
    structures: [
      st('testiculo-direito', 'za:testiculo-direito', 'Testículo Direito', 'Right testis', 'Testis dexter', 'visceras', 'pelve', sph(0.02), [0.03, 0.72, 0.03], { side: 'R' }),
      st('testiculo-esquerdo', 'za:testiculo-esquerdo', 'Testículo Esquerdo', 'Left testis', 'Testis sinister', 'visceras', 'pelve', sph(0.02), [-0.03, 0.72, 0.03], { side: 'L' }),
      st('ducto-deferente-direito', 'za:ducto-deferente-direito', 'Ducto Deferente Direito', 'Right ductus deferens', 'Ductus deferens dexter', 'visceras', 'pelve', cyl(0.002, 0.15), [0.03, 0.80, 0.02], { side: 'R' }),
      st('ducto-deferente-esquerdo', 'za:ducto-deferente-esquerdo', 'Ducto Deferente Esquerdo', 'Left ductus deferens', 'Ductus deferens sinister', 'visceras', 'pelve', cyl(0.002, 0.15), [-0.03, 0.80, 0.02], { side: 'L' }),
      st('prostata', 'za:prostata', 'Próstata', 'Prostate', 'Prostata', 'visceras', 'pelve', sph(0.025), [0, 0.82, 0.02]),
      st('penis', 'za:penis', 'Pênis', 'Penis', 'Penis', 'visceras', 'pelve', cyl(0.015, 0.10), [0, 0.78, 0.05]),
    ],
  },
  {
    system: 'reprodutor', fileKey: 'reprodutor-f', sex: 'F',
    structures: [
      st('ovario-direito', 'za:ovario-direito', 'Ovário Direito', 'Right ovary', 'Ovarium dextrum', 'visceras', 'pelve', sph(0.015), [0.05, 0.88, 0.02], { side: 'R' }),
      st('ovario-esquerdo', 'za:ovario-esquerdo', 'Ovário Esquerdo', 'Left ovary', 'Ovarium sinistrum', 'visceras', 'pelve', sph(0.015), [-0.05, 0.88, 0.02], { side: 'L' }),
      st('tuba-uterina-direita', 'za:tuba-uterina-direita', 'Tuba Uterina Direita', 'Right uterine tube', 'Tuba uterina dextra', 'visceras', 'pelve', cyl(0.003, 0.08), [0.03, 0.89, 0.02], { side: 'R' }),
      st('tuba-uterina-esquerda', 'za:tuba-uterina-esquerda', 'Tuba Uterina Esquerda', 'Left uterine tube', 'Tuba uterina sinistra', 'visceras', 'pelve', cyl(0.003, 0.08), [-0.03, 0.89, 0.02], { side: 'L' }),
      st('utero', 'za:utero', 'Útero', 'Uterus', 'Uterus', 'visceras', 'pelve', sph(0.04), [0, 0.86, 0.03]),
      st('vagina', 'za:vagina', 'Vagina', 'Vagina', 'Vagina', 'visceras', 'pelve', cyl(0.015, 0.08), [0, 0.80, 0.03]),
    ],
  },
  {
    system: 'endocrino', fileKey: 'endocrino', sex: 'U',
    structures: [
      st('hipofise', 'za:hipofise', 'Hipófise', 'Pituitary gland', 'Hypophysis', 'visceras', 'cabeca', sph(0.006), [0, 1.63, 0.02]),
      st('tireoide', 'za:tireoide', 'Tireoide', 'Thyroid gland', 'Glandula thyroidea', 'visceras', 'pescoco', sph(0.02), [0, 1.50, 0.03]),
      st('glandula-adrenal-direita', 'za:glandula-adrenal-direita', 'Glândula Adrenal Direita', 'Right adrenal gland', 'Glandula suprarenalis dextra', 'visceras', 'abdome', sph(0.012), [0.06, 1.10, -0.05], { side: 'R' }),
      st('glandula-adrenal-esquerda', 'za:glandula-adrenal-esquerda', 'Glândula Adrenal Esquerda', 'Left adrenal gland', 'Glandula suprarenalis sinistra', 'visceras', 'abdome', sph(0.012), [-0.06, 1.10, -0.05], { side: 'L' }),
      st('paratireoide-direita', 'za:paratireoide-direita', 'Paratireoide Direita', 'Right parathyroid gland', 'Glandula parathyroidea dextra', 'visceras', 'pescoco', sph(0.004), [0.015, 1.505, 0.03], { side: 'R' }),
      st('paratireoide-esquerda', 'za:paratireoide-esquerda', 'Paratireoide Esquerda', 'Left parathyroid gland', 'Glandula parathyroidea sinistra', 'visceras', 'pescoco', sph(0.004), [-0.015, 1.505, 0.03], { side: 'L' }),
    ],
  },
  {
    system: 'linfatico', fileKey: 'linfatico', sex: 'U',
    structures: [
      st('baco', 'za:baco', 'Baço', 'Spleen', 'Splen', 'linfatico', 'abdome', sph(0.035), [-0.10, 1.10, -0.04]),
      st('ducto-toracico', 'za:ducto-toracico', 'Ducto Torácico', 'Thoracic duct', 'Ductus thoracicus', 'linfatico', 'torax', cyl(0.004, 0.30), [0.01, 1.25, -0.03]),
      st('linfonodo-cervical-direito', 'za:linfonodo-cervical-direito', 'Linfonodo Cervical Direito', 'Right cervical lymph node', 'Nodus lymphoideus cervicalis dexter', 'linfatico', 'pescoco', sph(0.008), [0.04, 1.50, -0.02], { side: 'R' }),
      st('linfonodo-cervical-esquerdo', 'za:linfonodo-cervical-esquerdo', 'Linfonodo Cervical Esquerdo', 'Left cervical lymph node', 'Nodus lymphoideus cervicalis sinister', 'linfatico', 'pescoco', sph(0.008), [-0.04, 1.50, -0.02], { side: 'L' }),
      st('linfonodo-axilar-direito', 'za:linfonodo-axilar-direito', 'Linfonodo Axilar Direito', 'Right axillary lymph node', 'Nodus lymphoideus axillaris dexter', 'linfatico', 'membro-superior-direito', sph(0.01), [0.15, 1.38, 0], { side: 'R' }),
      st('linfonodo-axilar-esquerdo', 'za:linfonodo-axilar-esquerdo', 'Linfonodo Axilar Esquerdo', 'Left axillary lymph node', 'Nodus lymphoideus axillaris sinister', 'linfatico', 'membro-superior-esquerdo', sph(0.01), [-0.15, 1.38, 0], { side: 'L' }),
      st('linfonodo-inguinal-direito', 'za:linfonodo-inguinal-direito', 'Linfonodo Inguinal Direito', 'Right inguinal lymph node', 'Nodus lymphoideus inguinalis dexter', 'linfatico', 'pelve', sph(0.01), [0.08, 0.83, 0.03], { side: 'R' }),
      st('linfonodo-inguinal-esquerdo', 'za:linfonodo-inguinal-esquerdo', 'Linfonodo Inguinal Esquerdo', 'Left inguinal lymph node', 'Nodus lymphoideus inguinalis sinister', 'linfatico', 'pelve', sph(0.01), [-0.08, 0.83, 0.03], { side: 'L' }),
    ],
  },
  {
    system: 'tegumentar', fileKey: 'tegumentar', sex: 'U',
    structures: [
      st('pele-cabeca', 'za:pele-cabeca', 'Pele da Cabeça', 'Head skin', 'Cutis capitis', 'pele', 'cabeca', sph(0.11), [0, 1.68, 0]),
      st('pele-tronco', 'za:pele-tronco', 'Pele do Tronco', 'Trunk skin', 'Cutis trunci', 'pele', 'torax', box(0.32, 0.55, 0.22), [0, 1.15, 0]),
      st('pele-membro-superior-direito', 'za:pele-membro-superior-direito', 'Pele do Membro Superior Direito', 'Right upper limb skin', 'Cutis membri superioris dextri', 'pele', 'membro-superior-direito', cyl(0.045, 0.60), [0.20, 1.15, 0], { side: 'R' }),
      st('pele-membro-superior-esquerdo', 'za:pele-membro-superior-esquerdo', 'Pele do Membro Superior Esquerdo', 'Left upper limb skin', 'Cutis membri superioris sinistri', 'pele', 'membro-superior-esquerdo', cyl(0.045, 0.60), [-0.20, 1.15, 0], { side: 'L' }),
      st('pele-membro-inferior-direito', 'za:pele-membro-inferior-direito', 'Pele do Membro Inferior Direito', 'Right lower limb skin', 'Cutis membri inferioris dextri', 'pele', 'membro-inferior-direito', cyl(0.06, 0.85), [0.10, 0.45, 0], { side: 'R' }),
      st('pele-membro-inferior-esquerdo', 'za:pele-membro-inferior-esquerdo', 'Pele do Membro Inferior Esquerdo', 'Left lower limb skin', 'Cutis membri inferioris sinistri', 'pele', 'membro-inferior-esquerdo', cyl(0.06, 0.85), [-0.10, 0.45, 0], { side: 'L' }),
      st('unha', 'za:unha', 'Unha', 'Nail', 'Unguis', 'pele', 'membro-superior-direito', box(0.01, 0.012, 0.002), [0.20, 0.75, 0.03], { side: 'R' }),
      st('cabelo', 'za:cabelo', 'Cabelo', 'Hair', 'Capillus', 'pele', 'cabeca', sph(0.115), [0, 1.70, 0]),
    ],
  },
];

// Asset "estilo HRA" de detalhe de órgão: o coração com suas câmaras e valvas.
// Cada parte é filha (parent) da estrutura "coracao" do sistema cardiovascular.
const HRA_HEART_DETAIL = {
  system: 'cardiovascular', fileKey: 'hra-heart-m', sex: 'M', isOrganDetail: true,
  structures: [
    st('atrio-direito', 'za:atrio-direito', 'Átrio Direito', 'Right atrium', 'Atrium dextrum', 'visceras', 'torax', sph(0.02), [0.02, 1.345, 0.04], { side: 'R', parent: 'fma:7088' }),
    st('atrio-esquerdo', 'za:atrio-esquerdo', 'Átrio Esquerdo', 'Left atrium', 'Atrium sinistrum', 'visceras', 'torax', sph(0.02), [-0.03, 1.345, 0.03], { side: 'L', parent: 'fma:7088' }),
    st('ventriculo-direito', 'za:ventriculo-direito', 'Ventrículo Direito', 'Right ventricle', 'Ventriculus dexter', 'visceras', 'torax', sph(0.025), [0.02, 1.30, 0.05], { side: 'R', parent: 'fma:7088' }),
    st('ventriculo-esquerdo', 'za:ventriculo-esquerdo', 'Ventrículo Esquerdo', 'Left ventricle', 'Ventriculus sinister', 'visceras', 'torax', sph(0.028), [-0.02, 1.30, 0.06], { side: 'L', parent: 'fma:7088' }),
    st('valva-mitral', 'za:valva-mitral', 'Valva Mitral', 'Mitral valve', 'Valva mitralis', 'visceras', 'torax', sph(0.008), [-0.02, 1.315, 0.045], { parent: 'fma:7088' }),
    st('valva-aortica', 'za:valva-aortica', 'Valva Aórtica', 'Aortic valve', 'Valva aortae', 'visceras', 'torax', sph(0.008), [0, 1.32, 0.03], { parent: 'fma:7088' }),
  ],
};

const ALL_GROUPS = [...SYSTEMS, HRA_HEART_DETAIL];

// ---------------------------------------------------------------------------
// Montagem dos GLBs
// ---------------------------------------------------------------------------

function unionBBox(a, b) {
  if (!a) return b;
  return {
    min: a.min.map((v, i) => Math.min(v, b.min[i])),
    max: a.max.map((v, i) => Math.max(v, b.max[i])),
  };
}

function translateBBox(local, pos) {
  return {
    min: local.min.map((v, i) => v + pos[i]),
    max: local.max.map((v, i) => v + pos[i]),
  };
}

/**
 * Constrói um Document glTF para um grupo de estruturas num dado LOD e o
 * grava como GLB. Retorna metadados para o manifesto e para o index.
 */
async function buildAndWriteAsset(group, lod, io) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Cena');
  doc.getRoot().setDefaultScene(scene);

  const nodeToSid = {};
  let triangles = 0;
  let bbox = null;

  for (const struct of group.structures) {
    const geo = buildGeometry(struct.shape, lod);
    const posAcc = doc.createAccessor().setType('VEC3').setArray(geo.positions).setBuffer(buffer);
    const normAcc = doc.createAccessor().setType('VEC3').setArray(geo.normals).setBuffer(buffer);
    const idxAcc = doc.createAccessor().setType('SCALAR').setArray(geo.indices).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL', normAcc)
      .setIndices(idxAcc);
    const mesh = doc.createMesh(struct.slug).addPrimitive(prim);
    const node = doc.createNode(struct.slug).setMesh(mesh).setTranslation(struct.pos);
    scene.addChild(node);

    nodeToSid[struct.slug] = struct.sid;
    triangles += geo.indices.length / 3;
    bbox = unionBBox(bbox, translateBBox(shapeBBoxLocal(struct.shape), struct.pos));
  }

  const suffix = group.isOrganDetail ? '' : `.${lod}`;
  const file = `models/${group.fileKey}${suffix}.glb`;
  const absPath = path.join(FIXTURES_DIR, file);
  await io.write(absPath, doc);
  const bytes = fs.statSync(absPath).size;

  return { file, system: group.system, lod, sex: group.sex, bytes, triangles, bbox, nodeToSid };
}

// ---------------------------------------------------------------------------
// Conteúdo (content/<sistema>.json) — subconjunto curado, com fontes reais
// por campo preenchido. Todo o resto das estruturas fica só no index.json;
// a ficha completa é progressiva (plano, seção 2).
// ---------------------------------------------------------------------------

function src(field, type, ref, license, url, rev) {
  const s = { field, type, ref, license, url: url ?? null };
  if (rev) s.rev = rev;
  return s;
}

const REVIEW_AUTO_DRAFT = { status: 'auto-draft', by: 'make-fixtures.mjs', date: '2026-09-26' };
const REVIEW_LEGACY = { status: 'legacy-unverified', by: 'migracao-bio-database', date: '2026-09-26' };

/** @type {Record<string, object>} sid -> registro de conteúdo */
const CONTENT = {
  'fma:9611': {
    ids: { fma: '9611', wikidata: 'Q9628' },
    summary_pt: 'O fêmur é o osso mais longo e mais resistente do corpo humano, formando o esqueleto da coxa entre o quadril e o joelho.',
    anatomy: {
      relations: 'Articula-se proximalmente com o acetábulo do osso do quadril (articulação coxofemoral) e distalmente com a tíbia e a patela (articulação do joelho).',
      vascularization: 'Suprido principalmente pela a. nutrícia (ramo da a. femoral profunda) e pelo anel vascular metafisário/epifisário.',
    },
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Fêmur — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/F%C3%A9mur'),
      src('anatomy.relations', 'textbook', "Gray's Anatomy, 42ª ed., cap. sobre membro inferior", 'proprietary'),
      src('anatomy.vascularization', 'textbook', "Gray's Anatomy, 42ª ed., cap. sobre membro inferior", 'proprietary'),
    ],
  },
  'fma:13303': {
    ids: { fma: '13303', wikidata: 'Q9648' },
    summary_pt: 'O úmero é o osso longo do braço, entre o ombro e o cotovelo, servindo de base para a inserção de vários músculos do ombro e do braço.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Úmero — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/%C3%9Amero'),
    ],
  },
  'za:cranio': {
    ids: { wikidata: 'Q34643' },
    summary_pt: 'O crânio é o conjunto de ossos que forma e protege o encéfalo, além de sustentar as estruturas da face.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Crânio — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Cr%C3%A2nio'),
    ],
  },
  'za:coluna-vertebral': {
    ids: { wikidata: 'Q133278' },
    summary_pt: 'A coluna vertebral sustenta o tronco, protege a medula espinhal e permite os movimentos de flexão, extensão e rotação do corpo.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Coluna vertebral — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Coluna_vertebral'),
    ],
  },
  'za:biceps-braquial-direito': {
    ids: { wikidata: 'Q473153' },
    summary_pt: 'O bíceps braquial é o músculo flexor do cotovelo e supinador do antebraço, com duas cabeças (curta e longa) que se originam na escápula.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Bíceps braquial — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/B%C3%ADceps_braquial'),
    ],
  },
  'za:quadriceps-femoral-direito': {
    ids: { wikidata: 'Q1130447' },
    summary_pt: 'O quadríceps femoral é o principal extensor do joelho, formado por quatro ventres musculares (reto femoral e vastos medial, lateral e intermédio).',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Quadríceps femoral — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Quadr%C3%ADceps_femoral'),
    ],
  },
  'za:trapezio': {
    ids: { wikidata: 'Q1130422' },
    summary_pt: 'O trapézio é um músculo largo e plano do dorso que eleva, retrai e roda a escápula, além de estender a cabeça e o pescoço.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Trapézio (músculo) — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Trap%C3%A9zio_(m%C3%BAsculo)'),
    ],
  },
  'fma:7088': {
    ids: { fma: '7088', uberon: 'UBERON:0000948', wikidata: 'Q1073', icd10: ['I51.9'] },
    summary_pt: 'O coração é um órgão muscular oco que bombeia o sangue por todo o corpo através de contrações rítmicas, dividido em quatro câmaras: dois átrios e dois ventrículos.',
    anatomy: {
      relations: 'Fica no mediastino médio, entre os dois pulmões, envolto pelo pericárdio; sua base volta-se posterossuperiormente e o ápice, ínfero-esquerdamente.',
      vascularization: 'Irrigado pelas aa. coronárias direita e esquerda, ramos da aorta ascendente; drenado principalmente pelo seio coronário para o átrio direito.',
      innervation: 'Inervado pelo plexo cardíaco (fibras simpáticas de T1-T4 e parassimpáticas do nervo vago), que regula a frequência e a força de contração.',
      lymph: 'A drenagem linfática segue os vasos coronários até os linfonodos traqueobronquiais e mediastinais.',
    },
    histology: {
      epithelium: 'Endocárdio: endotélio simples pavimentoso sobre tecido conjuntivo subendotelial.',
      tissues: ['Miocárdio (músculo cardíaco estriado)', 'Endocárdio', 'Pericárdio seroso'],
      cells: [
        { cl: 'CL:0000746', name_pt: 'Cardiomiócito', biomarkers: ['TNNT2', 'MYH6', 'ACTN2'] },
        { cl: 'CL:1000355', name_pt: 'Célula do nó sinoatrial', biomarkers: ['HCN4', 'SHOX2'] },
      ],
    },
    clinical: [
      'O infarto agudo do miocárdio resulta da oclusão de uma artéria coronária, levando à necrose do tecido muscular irrigado por ela.',
      'A insuficiência cardíaca ocorre quando o coração perde a capacidade de bombear sangue suficiente para as necessidades do corpo.',
    ],
    review: REVIEW_LEGACY,
    sources: [
      src('summary_pt', 'wikipedia', 'Coração — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Cora%C3%A7%C3%A3o'),
      src('anatomy.relations', 'textbook', "Gray's Anatomy, 42ª ed., cap. de tórax", 'proprietary'),
      src('anatomy.vascularization', 'wikidata', 'Q1073 (Wikidata)', 'CC0-1.0', 'https://www.wikidata.org/wiki/Q1073'),
      src('anatomy.innervation', 'textbook', "Gray's Anatomy, 42ª ed., cap. de tórax", 'proprietary'),
      src('anatomy.lymph', 'textbook', "Gray's Anatomy, 42ª ed., cap. de tórax", 'proprietary'),
      src('histology.epithelium', 'hra-asctb', 'HRA ASCT+B — Heart', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('histology.tissues', 'hra-asctb', 'HRA ASCT+B — Heart', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('histology.cells', 'hra-asctb', 'HRA ASCT+B — Heart', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('clinical', 'textbook', "Gray's Anatomy, 42ª ed., cap. de tórax", 'proprietary'),
    ],
  },
  'za:aorta': {
    ids: { wikidata: 'Q80993' },
    summary_pt: 'A aorta é a maior artéria do corpo, que leva sangue oxigenado do ventrículo esquerdo para todo o corpo através de seus ramos.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Aorta — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Aorta'),
    ],
  },
  'za:arteria-carotida-comum-direita': {
    ids: { wikidata: 'Q1066880' },
    summary_pt: 'A artéria carótida comum leva sangue à cabeça e ao pescoço, dividindo-se nas carótidas interna e externa próximo à cartilagem tireóidea.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Artéria carótida comum — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Art%C3%A9ria_car%C3%B3tida_comum'),
    ],
  },
  'fma:50801': {
    ids: { fma: '50801', uberon: 'UBERON:0000955', wikidata: 'Q1073', icd10: ['G93.9'] },
    summary_pt: 'O encéfalo é a parte do sistema nervoso central contida no crânio, responsável pelo processamento sensorial, pelo controle motor, pela cognição e pelas emoções.',
    anatomy: {
      relations: 'Formado pelo cérebro, cerebelo e tronco encefálico; contínuo caudalmente com a medula espinhal através do forame magno.',
      vascularization: 'Irrigado pelo círculo arterial do cérebro (polígono de Willis), formado pelas aa. carótidas internas e vertebrais/basilar.',
      innervation: 'Origina os 12 pares de nervos cranianos, que emergem do tronco encefálico ou diretamente do cérebro (nervo olfatório).',
    },
    histology: {
      cells: [
        { cl: 'CL:0000540', name_pt: 'Neurônio', biomarkers: ['RBFOX3', 'MAP2'] },
        { cl: 'CL:0000127', name_pt: 'Astrócito', biomarkers: ['GFAP', 'AQP4'] },
      ],
    },
    clinical: [
      'O acidente vascular cerebral (AVC) isquêmico ocorre pela interrupção do fluxo sanguíneo a uma área encefálica, causando morte neuronal.',
    ],
    review: REVIEW_LEGACY,
    sources: [
      src('summary_pt', 'wikipedia', 'Encéfalo — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Enc%C3%A9falo'),
      src('anatomy.relations', 'textbook', "Gray's Anatomy, 42ª ed., cap. de cabeça e pescoço", 'proprietary'),
      src('anatomy.vascularization', 'textbook', "Gray's Anatomy, 42ª ed., cap. de cabeça e pescoço", 'proprietary'),
      src('anatomy.innervation', 'textbook', "Gray's Anatomy, 42ª ed., cap. de cabeça e pescoço", 'proprietary'),
      src('histology.cells', 'hra-asctb', 'HRA ASCT+B — Brain', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('clinical', 'textbook', "Gray's Anatomy, 42ª ed., cap. de cabeça e pescoço", 'proprietary'),
    ],
  },
  'za:medula-espinhal': {
    ids: { wikidata: 'Q189651' },
    summary_pt: 'A medula espinhal é a porção do sistema nervoso central que se estende do forame magno até aproximadamente a 1ª/2ª vértebra lombar, conduzindo impulsos entre o encéfalo e o corpo.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Medula espinhal — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Medula_espinhal'),
    ],
  },
  'za:nervo-ciatico-direito': {
    ids: { wikidata: 'Q940479' },
    summary_pt: 'O nervo isquiático (ciático) é o maior nervo do corpo humano, formado pelo plexo lombossacral, e inerva a maior parte da pele e dos músculos da perna e do pé.',
    clinical: ['A compressão da raiz do nervo isquiático (ex.: hérnia de disco) causa a dor irradiada conhecida como ciatalgia.'],
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Nervo isquiático — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Nervo_isqui%C3%A1tico'),
      src('clinical', 'textbook', "Gray's Anatomy, 42ª ed., cap. de membro inferior", 'proprietary'),
    ],
  },
  'fma:7309': {
    ids: { fma: '7309', uberon: 'UBERON:0002048', wikidata: 'Q7886' },
    summary_pt: 'O pulmão direito é dividido em três lobos (superior, médio e inferior) e é responsável, junto ao pulmão esquerdo, pelas trocas gasosas entre o ar e o sangue.',
    anatomy: {
      vascularization: 'Recebe sangue venoso pelas aa. pulmonares (circulação funcional) e sangue arterial pelas aa. bronquiais (circulação nutridora).',
    },
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Pulmão — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Pulm%C3%A3o'),
      src('anatomy.vascularization', 'textbook', "Gray's Anatomy, 42ª ed., cap. de tórax", 'proprietary'),
    ],
  },
  'fma:7310': {
    ids: { fma: '7310', uberon: 'UBERON:0002168', wikidata: 'Q7886' },
    summary_pt: 'O pulmão esquerdo tem apenas dois lobos (superior e inferior), sendo um pouco menor que o direito por acomodar o coração na incisura cardíaca.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Pulmão — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Pulm%C3%A3o'),
    ],
  },
  'za:traqueia': {
    ids: { wikidata: 'Q9617' },
    summary_pt: 'A traqueia é um tubo cartilaginoso que conduz o ar da laringe aos brônquios principais, sustentado por anéis cartilaginosos incompletos em forma de "C".',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Traqueia — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Traqueia'),
    ],
  },
  'fma:7197': {
    ids: { fma: '7197', uberon: 'UBERON:0002107', wikidata: 'Q9368', icd10: ['K76.9'] },
    summary_pt: 'O fígado é a maior glândula do corpo, responsável pelo metabolismo de nutrientes, pela produção de bile, pela desintoxicação de substâncias e pela síntese de proteínas plasmáticas.',
    anatomy: {
      relations: 'Localizado no hipocôndrio direito e epigástrio, sob a cúpula diafragmática direita; dividido em lobos direito, esquerdo, caudado e quadrado.',
      vascularization: 'Recebe duplo suprimento: a. hepática (sangue oxigenado) e v. porta hepática (sangue rico em nutrientes do trato digestório); a drenagem venosa é feita pelas vv. hepáticas para a v. cava inferior.',
    },
    histology: {
      epithelium: 'Parênquima organizado em lóbulos hepáticos, com hepatócitos dispostos em cordões radiais em torno da veia central.',
      cells: [
        { cl: 'CL:0000182', name_pt: 'Hepatócito', biomarkers: ['ALB', 'HNF4A'] },
        { cl: 'CL:0000091', name_pt: 'Célula de Kupffer', biomarkers: ['CD68', 'CLEC4F'] },
      ],
    },
    clinical: ['A cirrose hepática é a substituição progressiva do parênquima por tecido fibroso, geralmente causada por hepatite viral crônica ou uso excessivo de álcool.'],
    review: REVIEW_LEGACY,
    sources: [
      src('summary_pt', 'wikipedia', 'Fígado — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/F%C3%ADgado'),
      src('anatomy.relations', 'textbook', "Gray's Anatomy, 42ª ed., cap. de abdome", 'proprietary'),
      src('anatomy.vascularization', 'textbook', "Gray's Anatomy, 42ª ed., cap. de abdome", 'proprietary'),
      src('histology.epithelium', 'hra-asctb', 'HRA ASCT+B — Liver', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('histology.cells', 'hra-asctb', 'HRA ASCT+B — Liver', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('clinical', 'textbook', "Gray's Anatomy, 42ª ed., cap. de abdome", 'proprietary'),
    ],
  },
  'fma:7148': {
    ids: { fma: '7148', uberon: 'UBERON:0000945', wikidata: 'Q80729', icd10: ['K25.9'] },
    summary_pt: 'O estômago é um órgão muscular oco entre o esôfago e o duodeno, responsável pela digestão química inicial dos alimentos por ácido clorídrico e enzimas.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Estômago — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Est%C3%B4mago'),
    ],
  },
  'za:intestino-delgado': {
    ids: { wikidata: 'Q9662' },
    summary_pt: 'O intestino delgado é dividido em duodeno, jejuno e íleo, sendo o principal local de digestão química e absorção de nutrientes.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Intestino delgado — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Intestino_delgado'),
    ],
  },
  'fma:7204': {
    ids: { fma: '7204', uberon: 'UBERON:0004539', wikidata: 'Q9377', icd10: ['N28.9'] },
    summary_pt: 'O rim direito é um dos dois órgãos retroperitoneais responsáveis pela filtração do sangue, formação da urina e regulação do equilíbrio hidroeletrolítico e ácido-básico.',
    anatomy: {
      vascularization: 'Irrigado pela a. renal direita, ramo direto da aorta abdominal; drenado pela v. renal direita para a v. cava inferior.',
    },
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Rim — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Rim'),
      src('anatomy.vascularization', 'textbook', "Gray's Anatomy, 42ª ed., cap. de abdome", 'proprietary'),
    ],
  },
  'fma:7205': {
    ids: { fma: '7205', uberon: 'UBERON:0004538', wikidata: 'Q9377', icd10: ['N28.9'] },
    summary_pt: 'O rim esquerdo situa-se ligeiramente mais alto que o direito (por causa do fígado) e desempenha a mesma função de filtração sanguínea e formação de urina.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Rim — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Rim'),
    ],
  },
  'za:vesicula-urinaria': {
    ids: { wikidata: 'Q7891' },
    summary_pt: 'A vesícula (bexiga) urinária é um órgão muscular oco que armazena a urina produzida pelos rins até a micção.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Bexiga urinária — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Bexiga_urin%C3%A1ria'),
    ],
  },
  'za:testiculo-direito': {
    ids: { wikidata: 'Q43649' },
    summary_pt: 'O testículo é a gônada masculina, responsável pela produção de espermatozoides e de testosterona.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Testículo — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Test%C3%ADculo'),
    ],
  },
  'za:prostata': {
    ids: { wikidata: 'Q59606', icd10: ['N40'] },
    summary_pt: 'A próstata é uma glândula exócrina masculina que envolve a uretra logo abaixo da vesícula urinária e produz parte do plasma seminal.',
    clinical: ['A hiperplasia prostática benigna é o aumento não canceroso da próstata, comum em homens acima de 50 anos, que pode obstruir o fluxo urinário.'],
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Próstata — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Pr%C3%B3stata'),
      src('clinical', 'textbook', "Gray's Anatomy, 42ª ed., cap. de pelve", 'proprietary'),
    ],
  },
  'za:ovario-direito': {
    ids: { wikidata: 'Q43105' },
    summary_pt: 'O ovário é a gônada feminina, responsável pela produção de oócitos e pela síntese de estrogênio e progesterona.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Ovário — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Ov%C3%A1rio'),
    ],
  },
  'za:utero': {
    ids: { wikidata: 'Q9048' },
    summary_pt: 'O útero é o órgão muscular oco em que ocorre a implantação e o desenvolvimento do embrião/feto durante a gestação.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Útero — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/%C3%9Atero'),
    ],
  },
  'za:tireoide': {
    ids: { wikidata: 'Q9444', icd10: ['E03.9'] },
    summary_pt: 'A tireoide é uma glândula endócrina em forma de borboleta situada na face anterior do pescoço, que produz os hormônios T3 e T4, reguladores do metabolismo.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Tireoide — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Tireoide'),
    ],
  },
  'za:hipofise': {
    ids: { wikidata: 'Q170645' },
    summary_pt: 'A hipófise (pituitária) é uma pequena glândula endócrina ligada ao hipotálamo que regula outras glândulas do corpo por meio de hormônios tróficos.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Hipófise — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Hip%C3%B3fise'),
    ],
  },
  'za:baco': {
    ids: { wikidata: 'Q9152' },
    summary_pt: 'O baço é o maior órgão linfático do corpo, responsável pela filtração sanguínea, pela remoção de eritrócitos velhos e por parte da resposta imunológica.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Baço — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Ba%C3%A7o'),
    ],
  },
  'za:linfonodo-cervical-direito': {
    ids: { wikidata: 'Q1541539' },
    summary_pt: 'Os linfonodos cervicais filtram a linfa da cabeça e do pescoço e costumam ser palpados na avaliação clínica de infecções e neoplasias dessa região.',
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Linfonodo — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Linfonodo'),
    ],
  },
  'za:pele-tronco': {
    ids: { wikidata: 'Q80831' },
    summary_pt: 'A pele é o maior órgão do corpo humano, formada por epiderme, derme e hipoderme, com funções de proteção, termorregulação e sensibilidade.',
    histology: {
      epithelium: 'Epiderme: epitélio pavimentoso estratificado queratinizado.',
      tissues: ['Epiderme', 'Derme', 'Hipoderme (tecido adiposo)'],
      cells: [
        { cl: 'CL:0000312', name_pt: 'Queratinócito', biomarkers: ['KRT14', 'KRT10'] },
        { cl: 'CL:0000148', name_pt: 'Melanócito', biomarkers: ['MLANA', 'TYR'] },
      ],
    },
    review: REVIEW_AUTO_DRAFT,
    sources: [
      src('summary_pt', 'wikipedia', 'Pele — Wikipédia', 'CC-BY-SA-4.0', 'https://pt.wikipedia.org/wiki/Pele'),
      src('histology.epithelium', 'hra-asctb', 'HRA ASCT+B — Skin', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('histology.tissues', 'hra-asctb', 'HRA ASCT+B — Skin', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
      src('histology.cells', 'hra-asctb', 'HRA ASCT+B — Skin', 'CC-BY-4.0', 'https://humanatlas.io/asctb-reporter'),
    ],
  },
};

// ---------------------------------------------------------------------------
// Rotas, processos, casos de quiz e glossário
// ---------------------------------------------------------------------------

const ROUTES = [
  {
    id: 'circulacao-pulmonar',
    system: 'cardiovascular',
    name_pt: 'Circulação Pulmonar',
    description_pt: 'Caminho do sangue venoso do coração até os pulmões para ser oxigenado e retornar ao átrio esquerdo.',
    anchors: [
      { sid: 'fma:7088', label_pt: 'Ventrículo direito ejeta o sangue' },
      { sid: 'za:bronquio-principal-direito', t: 0.2, label_pt: 'Artéria pulmonar acompanha o brônquio' },
      { sid: 'fma:7309', t: 0.6, label_pt: 'Troca gasosa nos alvéolos do pulmão direito' },
      { sid: 'fma:7088', t: 1, label_pt: 'Sangue oxigenado retorna ao átrio esquerdo' },
    ],
  },
  {
    id: 'via-piramidal-membro-inferior',
    system: 'nervoso',
    name_pt: 'Via Motora ao Membro Inferior',
    description_pt: 'Trajeto simplificado do impulso motor do encéfalo até o músculo quadríceps, via medula espinhal e nervo isquiático.',
    anchors: [
      { sid: 'fma:50801', label_pt: 'Córtex motor no encéfalo' },
      { sid: 'za:medula-espinhal', t: 0.8, label_pt: 'Trato corticospinal desce pela medula' },
      { sid: 'za:nervo-ciatico-direito', t: 0.1, label_pt: 'Nervo isquiático leva o impulso à coxa' },
      { sid: 'za:quadriceps-femoral-direito', label_pt: 'Contração do quadríceps' },
    ],
  },
];

const PROCESSES = [
  {
    id: 'ciclo-cardiaco',
    system: 'cardiovascular',
    name_pt: 'Ciclo Cardíaco',
    description_pt: 'Sequência de sístole e diástole que bombeia o sangue pelo coração em cada batimento.',
    steps: [
      { order: 1, description_pt: 'Diástole: os átrios e ventrículos se enchem de sangue com as valvas atrioventriculares abertas.', anchors: [{ sid: 'fma:7088' }] },
      { order: 2, description_pt: 'Sístole atrial: os átrios se contraem, completando o enchimento ventricular.', anchors: [{ sid: 'fma:7088', t: 0.2 }] },
      { order: 3, description_pt: 'Sístole ventricular: os ventrículos se contraem, ejetando o sangue para a aorta e para as artérias pulmonares.', anchors: [{ sid: 'fma:7088', t: 0.6 }, { sid: 'za:aorta', t: 0 }] },
    ],
  },
  {
    id: 'filtracao-glomerular',
    system: 'urinario',
    name_pt: 'Filtração Glomerular',
    description_pt: 'Processo pelo qual os rins filtram o plasma sanguíneo para formar o filtrado inicial da urina.',
    steps: [
      { order: 1, description_pt: 'O sangue chega ao rim pela artéria renal e alcança os capilares glomerulares.', anchors: [{ sid: 'fma:7204' }] },
      { order: 2, description_pt: 'A pressão hidrostática empurra água, íons e pequenas moléculas para a cápsula de Bowman, formando o filtrado.', anchors: [{ sid: 'fma:7204', t: 0.5 }] },
      { order: 3, description_pt: 'O filtrado segue pelos túbulos renais até o ureter, em direção à vesícula urinária.', anchors: [{ sid: 'za:ureter-direito' }, { sid: 'za:vesicula-urinaria' }] },
    ],
  },
];

const QUIZ_CASES = [
  {
    id: 'quiz-coracao-dor-toracica',
    system: 'cardiovascular',
    prompt_pt: 'Paciente de 58 anos chega com dor torácica opressiva irradiada para o braço esquerdo. Toque o órgão cuja irrigação está classicamente comprometida no infarto agudo do miocárdio.',
    difficulty: 'facil',
    correctSid: 'fma:7088',
    distractorSids: ['fma:7309', 'fma:7310', 'za:aorta'],
    anchors: [{ sid: 'fma:7088' }],
  },
  {
    id: 'quiz-rim-lombalgia',
    system: 'urinario',
    prompt_pt: 'Paciente relata dor lombar direita em cólica, irradiada para a virilha, sugestiva de cálculo urinário. Toque o órgão onde o cálculo provavelmente se formou.',
    difficulty: 'medio',
    correctSid: 'fma:7204',
    distractorSids: ['fma:7205', 'za:vesicula-urinaria', 'za:ureter-direito'],
    anchors: [{ sid: 'fma:7204' }],
  },
  {
    id: 'quiz-figado-icterico',
    system: 'digestorio',
    prompt_pt: 'Paciente com pele e escleras amareladas (icterícia) e histórico de hepatite crônica. Toque o órgão mais associado a esse quadro.',
    difficulty: 'facil',
    correctSid: 'fma:7197',
    distractorSids: ['fma:7148', 'za:vesicula-biliar', 'za:pancreas'],
    anchors: [{ sid: 'fma:7197' }],
  },
];

const GLOSSARY = [
  { id: 'baco', term_pt: 'Baço', term_la: 'Splen', term_en: 'Spleen', avoid: ['Spleen'], notes_pt: 'Não usar o termo em inglês; "baço" é a forma consagrada em português.' },
  { id: 'rim', term_pt: 'Rim', term_la: 'Ren', term_en: 'Kidney', avoid: ['Kidney'] },
  { id: 'figado', term_pt: 'Fígado', term_la: 'Hepar', term_en: 'Liver', avoid: ['Liver'] },
  { id: 'encefalo', term_pt: 'Encéfalo', term_la: 'Encephalon', term_en: 'Brain', avoid: ['Brain', 'Cérebro (quando se refere ao encéfalo todo)'], notes_pt: '"Cérebro" designa só uma parte do encéfalo; evitar usá-lo como sinônimo do órgão inteiro.' },
  { id: 'nervo-vago', term_pt: 'Nervo Vago', term_la: 'Nervus vagus', term_en: 'Vagus nerve', avoid: ['Nervo Vagus'], notes_pt: 'Em português, o adjetivo é "vago", não o genitivo latino "vagus".' },
  { id: 'derivacao', term_pt: 'Derivação', term_en: 'Shunt', avoid: ['Shunt'], notes_pt: 'Preferir "derivação" a "shunt" em textos voltados ao público brasileiro.' },
  { id: 'triagem', term_pt: 'Triagem', term_en: 'Screening', avoid: ['Screening'] },
  { id: 'bexiga', term_pt: 'Bexiga', term_la: 'Vesica urinaria', term_en: 'Bladder', avoid: ['Bladder'], notes_pt: 'Também aceito "vesícula urinária"; evitar o anglicismo direto.' },
  { id: 'utero', term_pt: 'Útero', term_la: 'Uterus', term_en: 'Uterus', avoid: ['Uterus (sem acentuação em textos em português)'] },
  { id: 'isquiatico', term_pt: 'Nervo Isquiático', term_la: 'Nervus ischiadicus', term_en: 'Sciatic nerve', avoid: ['Nervo Sciático'], notes_pt: 'A forma tradicional em português é "isquiático"; "sciático" é um aportuguesamento a evitar.' },
];

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  const io = new NodeIO();
  const manifestAssets = [];
  const indexEntries = [];

  for (const group of ALL_GROUPS) {
    const lods = group.isOrganDetail ? ['lod0'] : ['lod0', 'lod1'];
    let primaryFile = null;
    for (const lod of lods) {
      const asset = await buildAndWriteAsset(group, lod, io);
      if (lod === 'lod0') primaryFile = asset.file;

      manifestAssets.push({
        file: asset.file,
        system: asset.system,
        lod: asset.lod,
        sex: asset.sex,
        bytes: asset.bytes,
        triangles: asset.triangles,
        bbox: asset.bbox,
        nodeToSid: asset.nodeToSid,
        license: 'CC0-1.0',
        attribution: group.isOrganDetail
          ? 'Fixture de teste no estilo "detalhe de órgão" do Human Reference Atlas (HRA) — formas geométricas simples, sem base em modelo externo.'
          : 'Fixture de teste no estilo Z-Anatomy — formas geométricas simples, sem base em modelo externo.',
        sourceUrl: null,
        sourceVersion: 'fixture-v1',
        transform: group.isOrganDetail ? [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] : null,
        rmsError: group.isOrganDetail ? 2.3 : null,
      });
    }

    for (const struct of group.structures) {
      const local = shapeBBoxLocal(struct.shape);
      const entry = {
        sid: struct.sid,
        system: group.system,
        layer: struct.layer,
        parent: struct.parent,
        region: struct.region,
        names: { pt: struct.pt, en: struct.en, la: struct.la },
        mesh: { asset: primaryFile, nodes: [struct.slug] },
        bbox: translateBBox(local, struct.pos),
      };
      if (struct.side) entry.side = struct.side;
      indexEntries.push(entry);
    }
  }

  fs.writeFileSync(path.join(FIXTURES_DIR, 'manifest.json'), JSON.stringify({ version: 'fixture-1', assets: manifestAssets }, null, 2) + '\n');
  fs.writeFileSync(path.join(FIXTURES_DIR, 'index.json'), JSON.stringify(indexEntries, null, 2) + '\n');

  // content/<sistema>.json: agrupa os registros curados pelo sistema do sid.
  const sidToSystem = new Map(indexEntries.map((e) => [e.sid, e.system]));
  const bySystem = new Map();
  for (const [sid, record] of Object.entries(CONTENT)) {
    const system = sidToSystem.get(sid);
    if (!system) throw new Error(`content: sid desconhecido no index: ${sid}`);
    if (!bySystem.has(system)) bySystem.set(system, {});
    bySystem.get(system)[sid] = record;
  }
  for (const [system, records] of bySystem) {
    fs.writeFileSync(path.join(CONTENT_DIR, `${system}.json`), JSON.stringify(records, null, 2) + '\n');
  }

  fs.writeFileSync(path.join(FIXTURES_DIR, 'glossario-pt.json'), JSON.stringify(GLOSSARY, null, 2) + '\n');
  fs.writeFileSync(path.join(FIXTURES_DIR, 'routes.json'), JSON.stringify(ROUTES, null, 2) + '\n');
  fs.writeFileSync(path.join(FIXTURES_DIR, 'processes.json'), JSON.stringify(PROCESSES, null, 2) + '\n');
  fs.writeFileSync(path.join(FIXTURES_DIR, 'quiz-cases.json'), JSON.stringify(QUIZ_CASES, null, 2) + '\n');

  const totalBytes = manifestAssets.reduce((sum, a) => sum + a.bytes, 0);
  console.log(`[atlas] fixtures geradas em ${path.relative(FRONTEND_DIR, FIXTURES_DIR)}`);
  console.log(`[atlas] ${manifestAssets.length} assets GLB, ${indexEntries.length} estruturas no index, ${Object.keys(CONTENT).length} fichas de conteúdo.`);
  console.log(`[atlas] total de bytes dos GLBs: ${totalBytes} (${(totalBytes / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('[atlas] falha ao gerar fixtures:', err);
  process.exitCode = 1;
});
