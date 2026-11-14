// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// Quiz de Farmacologia: a estrutura molecular (PubChem) é buscada uma vez por fármaco na sessão.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function carregar(fetchStub) {
  const sandbox = { console, fetch: fetchStub, AbortController, setTimeout, clearTimeout, encodeURIComponent };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(frontend, 'modulos/quiz/quiz-apis.js'), 'utf8') + ';this.Motor = QuizAPIEngine', sandbox);
  return sandbox.Motor;
}

const resposta = (corpo, ok = true) => ({ ok, json: async () => corpo });
const pubchem = { PropertyTable: { Properties: [{ CID: 2244, CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', MolecularWeight: '180.16' }] } };

test('PubChem: segunda busca do mesmo fármaco sai do cache', async () => {
  let chamadas = 0;
  const motor = carregar(async () => { chamadas++; return resposta(pubchem); });
  const a = await motor.buscarEstruturaMolecular('Aspirin');
  const b = await motor.buscarEstruturaMolecular(' aspirin ');
  assert.equal(a.cid, 2244);
  assert.equal(b.cid, 2244);
  assert.equal(chamadas, 1);
});

test('PubChem: falha não fica guardada e a próxima tentativa refaz a busca', async () => {
  let chamadas = 0;
  const motor = carregar(async () => { chamadas++; return chamadas === 1 ? resposta({}, false) : resposta(pubchem); });
  assert.equal(await motor.buscarEstruturaMolecular('aspirin'), null);
  assert.equal((await motor.buscarEstruturaMolecular('aspirin')).cid, 2244);
  assert.equal(chamadas, 2);
});
