/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Fase 0 do Laboratório: (1) nenhum agente de guerra química no catálogo da bancada, nas listas
// de reagentes adicionáveis nem no Estúdio; controlados de uso médico permanecem;
// (2) o relógio da bancada pausa com a aba oculta (visibilitychange) e retoma ao voltar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lab = path.join(root, 'frontend', 'modulos', 'laboratorio');
const read = (rel) => fs.readFileSync(path.join(lab, rel), 'utf8');

// Agentes de guerra química (nomes, siglas inequívocas, fórmulas e SMILES de agentes nervosos e vesicantes).
const NOMES_PROIBIDOS = /sarin|soman|tabun|novichok|\bVX\b|mostarda|mustard|lewisit|iperita|C4H10FO2P|C11H26NO2PS|C4H8Cl2S/i;
const SMILES_PROIBIDOS = ['CC(C)OP(C)(=O)F', 'CCOP(=O)(C)SCCN(C(C)C)C(C)C', 'ClCCSCCCl'];

function carregarCatalogo() {
  return new Function('window', `${read('data/lab-database.js')}; return LAB_DATABASE;`)({});
}

test('catálogo da bancada: nenhum agente de guerra química (chave, rótulo, fórmula ou SMILES)', () => {
  const species = carregarCatalogo().species;
  assert.ok(Object.keys(species).length > 50, 'catálogo carregou');
  for (const [chave, v] of Object.entries(species)) {
    const texto = [chave, v.label, v.formula, v.iupac, v.pubchemQuery].join(' | ');
    assert.doesNotMatch(texto, NOMES_PROIBIDOS, `agente de guerra no catálogo: ${chave}`);
    assert.ok(!SMILES_PROIBIDOS.includes(v.smiles), `SMILES de agente de guerra em ${chave}`);
  }
});

test('lista de reagentes adicionáveis e Estúdio não citam agentes de guerra', () => {
  for (const arquivo of ['js/script.js', 'studio/studio.js', 'studio/workers/indexer.worker.js', 'studio/smiles-corrigidos.js', 'data/lab-database.js']) {
    assert.doesNotMatch(read(arquivo), NOMES_PROIBIDOS, `${arquivo} ainda cita agente de guerra`);
  }
});

test('controlados de uso médico permanecem no catálogo (morfina, fenobarbital) e seus campos não mudam', () => {
  const species = carregarCatalogo().species;
  assert.equal(species.C17H19NO3_s.label, 'Morfina');
  assert.equal(species.C17H19NO3_s.molarMass, 285.34);
  assert.equal(species.C14H14N2O3_s.label, 'Fenobarbital');
  assert.match(read('js/script.js'), /\['C17H19NO3_s', 'Morfina'\]/);
});

// ---- relógio da bancada ----
const SRC = read('js/script.js').replace(/\r\n/g, '\n');

function extrairBloco() {
  const ini = SRC.indexOf('function pausarRelogioBancada()');
  const fim = SRC.indexOf("document.addEventListener('visibilitychange'");
  assert.ok(ini > 0 && fim > ini, 'bloco do relógio presente no script.js');
  const resto = SRC.slice(fim);
  const fimListener = resto.indexOf('});') + 3;
  return SRC.slice(ini, fim + fimListener);
}

function montarRelogio() {
  const intervalos = new Map();
  let proximo = 1;
  const doc = { hidden: false, handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
  const sb = {
    document: doc,
    setInterval(fn, ms) { const id = proximo++; intervalos.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervalos.delete(id); },
    loopTermico() {}, passo() {},
  };
  vm.createContext(sb);
  vm.runInContext(`
    let timerLoop = setInterval(loopTermico, 200); let timerAdd = null; let velocidadeTempo = 2;
    let pausadoPorAba = false; let adicaoPausadaPorAba = false; let passoAdicaoFn = passo;
    timerAdd = setInterval(passoAdicaoFn, 280 / velocidadeTempo);
    ${extrairBloco()}
    this.estado = () => ({ timerLoop, timerAdd, pausadoPorAba });
  `, sb);
  return { doc, intervalos, estado: sb.estado, sb };
}

test('visibilitychange: aba oculta limpa os relógios da bancada e da adição gradual', () => {
  const r = montarRelogio();
  assert.equal(r.intervalos.size, 2);
  r.doc.hidden = true;
  r.doc.handlers.visibilitychange();
  assert.equal(r.intervalos.size, 0);
  assert.equal(r.estado().timerLoop, null);
  assert.equal(r.estado().pausadoPorAba, true);
});

test('visibilitychange: ao voltar, retoma o relógio (200/velocidade) e a adição (280/velocidade) sem duplicar', () => {
  const r = montarRelogio();
  r.doc.hidden = true; r.doc.handlers.visibilitychange();
  r.doc.hidden = false; r.doc.handlers.visibilitychange();
  r.doc.handlers.visibilitychange(); // evento repetido não duplica
  // velocidade 2: relógio 200/2 = 100 ms; adição 280/2 = 140 ms
  assert.deepEqual([...r.intervalos.values()].map((x) => x.ms).sort((a, b) => a - b), [100, 140]);
  assert.equal(r.intervalos.size, 2);
});

test('script.js: registra visibilitychange e não reinicia o relógio durante a pausa', () => {
  assert.match(SRC, /document\.addEventListener\('visibilitychange'/);
  assert.match(SRC, /timerLoop = pausadoPorAba \? null : setInterval/);
  assert.match(SRC, /if \(!document\.hidden\) timerLoop = setInterval\(loopTermico, 200\)/);
});
