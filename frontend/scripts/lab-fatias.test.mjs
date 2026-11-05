/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O3: fatias extraídas do script.js (missões, rótulos, cache local) — caracterização do comportamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio');
const M = require('../modulos/laboratorio/js/lab-missoes.js');
const R = require('../modulos/laboratorio/js/lab-rotulos.js');
const C = require('../modulos/laboratorio/js/lab-cache-local.js');
const ler = (rel) => fs.readFileSync(path.join(LAB, rel), 'utf8');

function leitura(o) {
  const esp = new Map(Object.entries(o.especies || {}));
  return M.leituraDaBancada({ vol: o.vol || 0, temp: o.temp || 25, especies: esp }, () => (o.ph === undefined ? 7 : o.ph), new Set(o.reacoes || []));
}

test('missões: 10, na ordem e com os títulos de antes (o lab-guia mostra "Missão N de 10")', () => {
  assert.equal(M.MISSOES.length, 10);
  M.MISSOES.forEach((m, i) => assert.match(m.titulo, new RegExp(`^Missão ${i + 1}: `)));
  assert.ok(Object.isFrozen(M.MISSOES));
});

test('missões: cada verificação aceita o caso certo e recusa um caso vizinho', () => {
  const casos = [
    [0, { ph: 7.2, vol: 25, especies: { 'Cl-': 1, 'Na+': 1 } }, { ph: 7.2, vol: 15, especies: { 'Cl-': 1, 'Na+': 1 } }],
    [1, { especies: { PbI2_s: 0.2 } }, { especies: { PbI2_s: 0.05 } }],
    [2, { especies: { H2_g: 2 } }, { especies: { H2_g: 0.5 } }],
    [3, { temp: 100, especies: { H2O_l: 10 } }, { temp: 99, especies: { H2O_l: 10 } }],
    [4, { reacoes: ['sintese_aspirina'] }, { reacoes: [] }],
    [5, { especies: { AgCl_s: 0.2 } }, { especies: {} }],
    [6, { reacoes: ['sintese_paracetamol'] }, { reacoes: ['sintese_aspirina'] }],
    [7, { ph: 1.5, vol: 20 }, { ph: 2.5, vol: 20 }],
    [8, { reacoes: ['sintese_aroma_banana'] }, {}],
    [9, { especies: { CO2_g: 1 } }, { especies: { CO2_g: 0.4 } }]
  ];
  for (const [i, sim, nao] of casos) {
    assert.equal(M.MISSOES[i].check(leitura(sim)), true, `missão ${i + 1} sim`);
    assert.equal(M.MISSOES[i].check(leitura(nao)), false, `missão ${i + 1} não`);
  }
});

test('missões: progresso no aparelho com a mesma chave; inválido ou indisponível volta a 0', () => {
  const mem = new Map();
  const arm = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(M.CHAVE, 'laift_lab_missoes_v1');
  assert.equal(M.lerProgresso(arm), 0);
  assert.equal(M.salvarProgresso(arm, 3), true);
  assert.equal(M.lerProgresso(arm), 3);
  mem.set(M.CHAVE, '99');
  assert.equal(M.lerProgresso(arm), 0);
  assert.equal(M.lerProgresso(null), 0);
  assert.equal(M.salvarProgresso({ setItem() { throw new Error('cheio'); } }, 1), false);
});

test('rótulos: nome da base, do dicionário, nomes especiais e íons formatados; unidade por fase', () => {
  assert.equal(R.rotulo('X_s', { X_s: { label: 'Xis' } }, {}), 'Xis');
  assert.equal(R.rotulo('Y_l', {}, { Y_l: { label: 'Ípsilon' } }), 'Ípsilon');
  assert.equal(R.rotulo('H2O_l', {}, {}), 'Água');
  assert.equal(R.rotulo('SO4_2-', {}, {}), 'SO4²⁻');
  assert.equal(R.rotulo('Fe3+', {}, {}), 'Fe³⁺');
  assert.equal(R.rotulo('Na+', null, null), 'Na⁺');
  assert.equal(R.rotulo('Zn_s', null, null), 'Zn');
  assert.equal(R.unidadeDe('Zn_s', null), 'g');
  assert.equal(R.unidadeDe('Etanol_l', null), 'mL');
  assert.equal(R.unidadeDe('HCl_aq', { HCl_aq: { phase: 'aq' } }), 'mL');
  assert.equal(R.unidadeDe('CO2_g', null), '');
});

function idbFalso() {
  const lojas = {};
  const db = {
    objectStoreNames: { contains: (n) => n in lojas },
    createObjectStore: (n) => { lojas[n] = new Map(); },
    transaction: (n) => ({
      objectStore: () => ({
        get: (k) => { const req = {}; setTimeout(() => { req.result = lojas[n].get(k); req.onsuccess(); }); return req; },
        put: (v) => lojas[n].set(v.chave, v)
      })
    })
  };
  return {
    open() {
      const req = {};
      setTimeout(() => { req.onupgradeneeded({ target: { result: db } }); req.onsuccess({ target: { result: db } }); });
      return req;
    }
  };
}

test('cache local: grava e lê com chave normalizada; sem IndexedDB devolve null sem erro', async () => {
  const c = C.criarCacheLocal(idbFalso());
  await c.set('moleculas', '  Aspirina ', { cid: 2244 });
  assert.deepEqual(await c.get('moleculas', 'aspirina'), { cid: 2244 });
  assert.equal(await c.get('moleculas', 'outra'), null);
  assert.equal(await c.get('moleculas', ''), null);
  const sem = C.criarCacheLocal(null);
  assert.equal(await sem.get('moleculas', 'x'), null);
  await sem.set('moleculas', 'x', { a: 1 });
});

test('script.js usa as fatias, que carregam antes dele no index.html', () => {
  const s = ler('js/script.js');
  assert.match(s, /window\.LabCacheLocal\.criarCacheLocal/);
  assert.match(s, /window\.LabRotulos\.rotulo/);
  assert.match(s, /window\.LabMissoes\.MISSOES/);
  assert.ok(!/const missoes = \[/.test(s), 'lista de missões não é mais duplicada no script.js');
  const html = ler('index.html');
  const pos = (f) => html.indexOf(`<script src="${f}"`);
  for (const f of ['js/lab-cache-local.js', 'js/lab-rotulos.js', 'js/lab-missoes.js']) {
    assert.ok(pos(f) > 0 && pos(f) < pos('js/script.js'), f);
  }
});
