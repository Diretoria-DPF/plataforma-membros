#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * fascia-rules.test.mjs — regras puras das fáscias (preferência do clique,
 * alternância, modo "somente fáscias").
 * Roda com: node frontend/scripts/atlas/fascia-rules.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = path.resolve(here, '../../modulos/anatomia-3d');
const rules = await import(pathToFileURL(path.join(mod, 'js/engine/fascia-rules.js')).href);
const { isFasciaSid, preferUnderFascia, createPickCycle, fasciaOnlyLayers, isFasciaOnly, snapshotLayers, FASCIA_DEPTH_WINDOW } = rules;

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}

const hit = (sid, distance, fascia = isFasciaSid(sid)) => ({ sid, distance, fascia });

console.log('isFasciaSid');
test('reconhece fáscia, retináculo, aponeurose e trato iliotibial', () => {
  for (const sid of [
    'za:fascia-lata-l', 'za:pectoral-fascia-r', 'za:superficial-layer-of-temporal-fascia-l',
    'za:flexor-retinaculum-of-ankle-l', 'za:lateral-patellar-retinaculum-r',
    'za:palmar-aponeurosis-l', 'za:epicranial-aponeurosis-r', 'za:iliotibial-tract-l', 'za:tendoes-fascias',
    'za:anterior-layer-of-thoracolumbar-fascia-r',
  ]) assert.equal(isFasciaSid(sid), true, sid);
});
test('não confunde músculo, osso, nervo nem fascículo com fáscia', () => {
  for (const sid of [
    'za:tensor-fasciae-latae-l', 'za:deltoid-muscle-r', 'za:femur-r', 'za:cuneate-fasciculus-l',
    'za:anterior-fasciculus-proprius', 'za:allen-parafascicular-nucleus-of-thalamus', 'za:inguinal-ligament-l', '', null,
  ]) assert.equal(isFasciaSid(sid), false, String(sid));
});
test('a regra, aplicada ao índice real, só pega o sistema muscular (e ~34 estruturas distintas ×2 lados)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(mod, 'data/atlas/index.json'), 'utf8'));
  const matched = index.filter((e) => isFasciaSid(e.sid));
  assert.ok(matched.length >= 60, `esperava dezenas de fáscias, achou ${matched.length}`);
  assert.deepEqual([...new Set(matched.map((e) => e.system))], ['muscular']);
  assert.ok(!matched.some((e) => /tensor-fasciae-latae/.test(e.sid)));
});

console.log('preferUnderFascia');
test('prefere o músculo logo atrás da fáscia; a fáscia fica em segundo', () => {
  const out = preferUnderFascia([hit('za:fascia-lata-r', 1.0), hit('za:rectus-femoris-r', 1.02), hit('za:femur-r', 1.1)]);
  assert.deepEqual(out.map((h) => h.sid), ['za:rectus-femoris-r', 'za:fascia-lata-r', 'za:femur-r']);
});
test('sem nada atrás da fáscia (dentro da janela), a fáscia continua sendo a escolha', () => {
  const far = hit('za:rectus-femoris-r', 1.0 + FASCIA_DEPTH_WINDOW + 0.2);
  const out = preferUnderFascia([hit('za:fascia-lata-r', 1.0), far]);
  assert.equal(out[0].sid, 'za:fascia-lata-r');
});
test('se o primeiro acerto não é fáscia, nada muda', () => {
  const list = [hit('za:femur-r', 1), hit('za:fascia-lata-r', 1.01)];
  assert.deepEqual(preferUnderFascia(list).map((h) => h.sid), ['za:femur-r', 'za:fascia-lata-r']);
});
test('pele translúcida NA FRENTE da fáscia nunca vira "a estrutura de baixo" (lista sólidas-depois-fracas)', () => {
  // ordem do Registry: sólidas por distância e, depois, as quase transparentes
  const list = [hit('za:fascia-lata-r', 1.0), hit('za:rectus-femoris-r', 1.03), { ...hit('za:skin', 0.9, false), faint: true }];
  assert.equal(preferUnderFascia(list)[0].sid, 'za:rectus-femoris-r');
  const onlySkin = [hit('za:fascia-lata-r', 1.0), { ...hit('za:skin', 0.9, false), faint: true }];
  assert.equal(preferUnderFascia(onlySkin)[0].sid, 'za:fascia-lata-r');
  const behindFaint = [hit('za:fascia-lata-r', 1.0), { ...hit('za:rectus-femoris-r', 1.02), faint: true }];
  assert.equal(preferUnderFascia(behindFaint)[0].sid, 'za:fascia-lata-r');
});
test('desligada (enabled:false) mantém a ordem do raio', () => {
  const out = preferUnderFascia([hit('za:fascia-lata-r', 1), hit('za:rectus-femoris-r', 1.02)], { enabled: false });
  assert.equal(out[0].sid, 'za:fascia-lata-r');
});
test('não altera a lista de entrada', () => {
  const list = [hit('za:fascia-lata-r', 1), hit('za:rectus-femoris-r', 1.02)];
  const copy = list.map((h) => ({ ...h }));
  preferUnderFascia(list);
  assert.deepEqual(list, copy);
});
test('com só fáscias visíveis (modo somente fáscias) o primeiro acerto é sempre uma fáscia', () => {
  const out = preferUnderFascia([hit('za:fascia-lata-r', 1), hit('za:crural-fascia-r', 1.03)]);
  assert.equal(out[0].sid, 'za:fascia-lata-r');
});

console.log('createPickCycle');
test('clicar de novo no mesmo ponto alterna: estrutura → fáscia → estrutura', () => {
  const cycle = createPickCycle();
  const raw = [hit('za:fascia-lata-r', 1), hit('za:rectus-femoris-r', 1.02)];
  const ordered = preferUnderFascia(raw);
  const p = { x: 0.2, y: 0.1 };
  assert.equal(cycle.choose(p, raw, ordered).sid, 'za:rectus-femoris-r');
  assert.equal(cycle.choose({ x: 0.205, y: 0.1 }, raw, ordered).sid, 'za:fascia-lata-r');
  assert.equal(cycle.choose(p, raw, ordered).sid, 'za:rectus-femoris-r');
});
test('o mesmo ponto 3D vale mesmo com o canvas deslocado (ficha abriu e mudou a tela)', () => {
  const cycle = createPickCycle();
  const raw = [{ ...hit('za:fascia-lata-r', 1), point: [0.1, 0.5, 0.2] }, hit('za:rectus-femoris-r', 1.02)];
  const ordered = preferUnderFascia(raw);
  assert.equal(cycle.choose({ x: 0.2, y: 0.1 }, raw, ordered).sid, 'za:rectus-femoris-r');
  const moved = [{ ...hit('za:fascia-lata-r', 1.1), point: [0.11, 0.5, 0.21] }, hit('za:rectus-femoris-r', 1.12)];
  assert.equal(cycle.choose({ x: -0.4, y: 0.3 }, moved, preferUnderFascia(moved)).sid, 'za:fascia-lata-r');
  const far = [{ ...hit('za:fascia-lata-r', 1), point: [0.5, 0.9, 0.2] }, hit('za:rectus-femoris-r', 1.02)];
  assert.equal(cycle.choose({ x: 0.2, y: 0.1 }, far, preferUnderFascia(far)).sid, 'za:rectus-femoris-r');
});
test('clicar em outro ponto reinicia a alternância', () => {
  const cycle = createPickCycle();
  const raw = [hit('za:fascia-lata-r', 1), hit('za:rectus-femoris-r', 1.02)];
  const ordered = preferUnderFascia(raw);
  cycle.choose({ x: 0.2, y: 0.1 }, raw, ordered);
  assert.equal(cycle.choose({ x: -0.5, y: 0.1 }, raw, ordered).sid, 'za:rectus-femoris-r');
});
test('sem fáscia deslocada, devolve o primeiro e não alterna', () => {
  const cycle = createPickCycle();
  const raw = [hit('za:femur-r', 1), hit('za:rectus-femoris-r', 1.2)];
  assert.equal(cycle.choose({ x: 0, y: 0 }, raw, raw).sid, 'za:femur-r');
  assert.equal(cycle.choose({ x: 0, y: 0 }, raw, raw).sid, 'za:femur-r');
});
test('lista vazia devolve null', () => {
  assert.equal(createPickCycle().choose({ x: 0, y: 0 }, [], []), null);
});

console.log('somente fáscias');
const LAYERS = {
  pele: { visible: false, opacity: 1 },
  fascias: { visible: false, opacity: 0.45 },
  musculos: { visible: true, opacity: 1 },
  esqueleto: { visible: true, opacity: 0.5 },
};
test('fasciaOnlyLayers liga só Fáscias (opaca) e preserva a opacidade das demais', () => {
  const out = fasciaOnlyLayers(LAYERS);
  assert.deepEqual(out.fascias, { visible: true, opacity: 1 });
  assert.equal(out.musculos.visible, false);
  assert.equal(out.esqueleto.opacity, 0.5);
  assert.equal(isFasciaOnly(out), true);
  assert.equal(isFasciaOnly(LAYERS), false);
});
test('não altera a entrada; snapshotLayers copia para restaurar', () => {
  const snap = snapshotLayers(LAYERS);
  fasciaOnlyLayers(LAYERS);
  assert.deepEqual(snap, LAYERS);
  assert.notEqual(snap.musculos, LAYERS.musculos);
});

if (failures) {
  console.error(`\n${failures} teste(s) falharam.`);
  process.exit(1);
}
console.log('\nfascia-rules: ok');
