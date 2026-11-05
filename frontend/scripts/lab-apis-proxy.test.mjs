/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O2: o navegador consulta PubChem, ChEMBL e ChEBI pelo Worker (apiLearnLabChem) quando a flag está ligada;
// com a flag desligada, o caminho antigo (direto) continua igual. CACTUS e Wikidata não são chamados com o proxy ativo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const arquivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'modulos', 'laboratorio', 'js', 'lab-apis.js');
const codigo = fs.readFileSync(arquivo, 'utf8');

function montar({ api, fetchImpl }) {
  const chamadasFetch = [];
  const sandbox = {
    window: { LaiftApi: api },
    console: { warn() {}, log() {} },
    setTimeout, clearTimeout, AbortController, encodeURIComponent,
    fetch: async (url, opts) => { chamadasFetch.push(String(url)); return fetchImpl(String(url), opts); },
  };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  return { engine: sandbox.window.ChemicalAPIEngine, chamadasFetch };
}

const jsonRes = (obj, ok = true) => ({ ok, json: async () => obj, text: async () => JSON.stringify(obj) });

test('flag desligada: o Worker responde "desligado" e o navegador segue pelo caminho antigo', async () => {
  const chamadasApi = [];
  const api = { call: async (acao, input) => { chamadasApi.push([acao, input]); return { success: false, disabled: true }; } };
  const { engine, chamadasFetch } = montar({
    api,
    fetchImpl: async (url) => (url.includes('pubchem') ? jsonRes({ PropertyTable: { Properties: [{ CID: 1, MolecularFormula: 'H2O', MolecularWeight: '18.015', CanonicalSMILES: 'O', IUPACName: 'oxidane' }] } }) : jsonRes({}, false)),
  });
  const r = await engine.fetchPubChem('water');
  assert.equal(chamadasApi[0][0], 'apiLearnLabChem');
  assert.equal(chamadasApi[0][1].provider, 'pubchem');
  assert.equal(r.origem, 'PubChem PUG-REST');
  assert.ok(chamadasFetch.some((u) => u.startsWith('https://pubchem.ncbi.nlm.nih.gov/')));
  // depois de "desligado", não pergunta de novo ao Worker
  await engine.fetchPubChem('water');
  assert.equal(chamadasApi.length, 1);
});

test('flag ligada: PubChem e ChEBI vêm do Worker, sem nenhuma chamada direta', async () => {
  const api = {
    call: async (acao, input) => {
      assert.equal(acao, 'apiLearnLabChem');
      if (input.provider === 'pubchem') return { success: true, data: { cid: 2244, MolecularFormula: 'C9H8O4', MolecularWeight: '180.16', CanonicalSMILES: 'CC(=O)Oc1ccccc1C(=O)O', IUPACName: '2-acetyloxybenzoic acid' } };
      if (input.provider === 'chebi') return { success: true, data: { chebiId: 'CHEBI:15365', definicao: null } };
      if (input.provider === 'chembl') return { success: true, data: { chemblId: 'CHEMBL25', maxPhase: 4, alogp: 1.31 } };
      return { success: false };
    },
  };
  const { engine, chamadasFetch } = montar({ api, fetchImpl: async () => { throw new Error('rede direta não deveria ser usada'); } });
  const r = await engine.resolveCompleteCompound('aspirina');
  assert.deepEqual(chamadasFetch, []);
  assert.equal(r.origem, 'PubChem (via Worker)');
  assert.equal(r.molarMass, 180.16);
  assert.equal(r.formula, 'C9H8O4');
  assert.equal(r.chebiId, 'CHEBI:15365');
  assert.equal(r.chemblId, 'CHEMBL25');
  assert.equal(r.cas, '--');
  assert.equal(r.papelBiologico, 'Sem definição registrada no ChEBI.');
});

test('flag ligada e composto não encontrado: não cai para CACTUS nem Wikidata', async () => {
  const api = { call: async () => ({ success: false, notFound: true }) };
  const { engine, chamadasFetch } = montar({ api, fetchImpl: async () => { throw new Error('rede direta'); } });
  assert.equal(await engine.resolveCompleteCompound('xyzol'), null);
  assert.deepEqual(chamadasFetch, []);
});

test('sem a ponte LaiftApi, mantém o caminho antigo', async () => {
  const { engine, chamadasFetch } = montar({ api: undefined, fetchImpl: async () => jsonRes({}, false) });
  assert.equal(await engine.fetchPubChem('water'), null);
  assert.ok(chamadasFetch.length >= 1);
});

test('o texto de papel biológico não cita mais a Farmacopeia sem consultá-la', () => {
  assert.doesNotMatch(codigo, /descritas na Farmacopeia Brasileira/);
});
