/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as Lab from '../src/services/labChemService.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

// O2 — proxy do Laboratório para PubChem, ChEMBL e ChEBI, atrás da flag lab_chem_proxy_enabled.

function memoryCache() {
  const store = new Map();
  return {
    store,
    match: jest.fn(async (k) => (store.has(k) ? new Response(store.get(k)) : undefined)),
    put: jest.fn(async (k, res) => { store.set(k, await res.text()); }),
  };
}
const text = (body, init) => new Response(body, Object.assign({ status: 200 }, init || {}));
const sqlFlag = (enabled) => {
  const sql = makeSql();
  sql.mockResolvedValue([{ key: Lab.FLAG_KEY, enabled, rollout_pct: 100, conditions: null }]);
  return sql;
};
const NOW = () => new Date('2026-11-05T12:00:00.000Z');

let realFetch;
beforeEach(() => {
  __resetFlagCacheForTests();
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
});
afterEach(() => { globalThis.fetch = realFetch; });

const PUBCHEM = { PropertyTable: { Properties: [{ CID: 2244, MolecularFormula: 'C9H8O4', MolecularWeight: '180.16', XLogP: 1.2, ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', IUPACName: '2-acetyloxybenzoic acid', Extra: '<script>' }] } };
const CHEMBL = { molecules: [{ molecule_chembl_id: 'CHEMBL25', pref_name: 'ASPIRIN', molecule_type: 'Small molecule', max_phase: '4.0', molecule_properties: { full_molformula: 'C9H8O4', full_mwt: '180.16', alogp: '1.31', psa: '63.60', hba: 3, hbd: 1, rtb: 2, num_ro5_violations: 0 }, molecule_structures: { canonical_smiles: 'CC(=O)Oc1ccccc1C(=O)O', standard_inchi_key: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', molfile: 'GRANDE' }, cross_references: [{ x: 1 }] }] };
const CHEBI = { entries: [
  { acc: 'CHEBI:747596', fields: { name: ['aspirin-triggered resolvin D6(1-)'], definition: [] } },
  { acc: 'CHEBI:15365', fields: { name: ['acetylsalicylic acid'], definition: ['A <b>member</b> of salicylates.'] } },
] };

describe('lookup — flag e entrada', () => {
  test('com a flag desligada responde "desligado" e nunca chama a rede', async () => {
    const res = await Lab.lookup(sqlFlag(false), { profileId: 'p1' }, { provider: 'pubchem', name: 'aspirin' }, { cache: null });
    expect(res).toEqual({ success: false, disabled: true, message: Lab.DISABLED_MESSAGE });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('sem flag cadastrada ou com falha ao ler a flag, fica fechado', async () => {
    const vazio = makeSql(); vazio.mockResolvedValue([]);
    expect(await Lab.lookup(vazio, null, { provider: 'chebi', name: 'x' }, { cache: null })).toMatchObject({ disabled: true });
    __resetFlagCacheForTests();
    const quebrado = makeSql(); quebrado.mockRejectedValue(new Error('conexão'));
    expect(await Lab.lookup(quebrado, null, { provider: 'chebi', name: 'x' }, { cache: null })).toMatchObject({ disabled: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['fonte desconhecida', { provider: 'cactus', name: 'aspirin' }],
    ['sem fonte', { name: 'aspirin' }],
    ['URL no lugar do nome', { provider: 'pubchem', name: 'https://evil.example/x' }],
    ['nome com barra', { provider: 'chembl', name: 'a/../b' }],
    ['nome longo', { provider: 'chebi', name: 'a'.repeat(81) }],
    ['CID inválido', { provider: 'pubchem', cid: -3 }],
    ['ID ChEMBL inválido', { provider: 'chembl', chemblId: 'CHEMBL25/../x' }],
  ])('entrada inválida (%s) é recusada sem chamar a rede', async (_n, input) => {
    await expect(Lab.lookup(sqlFlag(true), null, input, { cache: null })).rejects.toMatchObject({ expected: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('nome de agente de guerra nem chega ao serviço externo', async () => {
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'pubchem', name: 'Sarin' }, { cache: null });
    expect(res).toEqual({ success: false, blocked: true, message: Lab.BLOCKED_MESSAGE });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('lookup — provedores', () => {
  test('PubChem: URL fixa, só as 5 propriedades, proveniência e cache de 7 dias', async () => {
    const cache = memoryCache();
    fetch.mockResolvedValueOnce(text(JSON.stringify(PUBCHEM)));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'PubChem', name: ' Aspirin ' }, { cache, now: NOW });
    expect(fetch.mock.calls[0][0]).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/aspirin/property/MolecularFormula,MolecularWeight,XLogP,CanonicalSMILES,IUPACName/JSON');
    expect(res).toEqual({
      success: true, provider: 'pubchem', cached: false, consultado_em: '2026-11-05T12:00:00.000Z',
      fonte: { slug: 'pubchem', licenca: 'public-domain', atribuicao: 'PubChem, National Library of Medicine' },
      data: { cid: 2244, MolecularFormula: 'C9H8O4', MolecularWeight: '180.16', XLogP: 1.2, CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', IUPACName: '2-acetyloxybenzoic acid' },
    });
    const [key, put] = cache.put.mock.calls[0];
    expect(key).toBe('https://lab-chem-cache.internal/pubchem/name/aspirin');
    expect(put.headers.get('Cache-Control')).toBe('public, max-age=604800');
    const de2 = await Lab.lookup(sqlFlag(true), null, { provider: 'pubchem', name: 'aspirin' }, { cache });
    expect(de2).toMatchObject({ success: true, cached: true, consultado_em: '2026-11-05T12:00:00.000Z' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('PubChem por CID', async () => {
    fetch.mockResolvedValueOnce(text(JSON.stringify(PUBCHEM)));
    await Lab.lookup(sqlFlag(true), null, { provider: 'pubchem', cid: '2244' }, { cache: null });
    expect(fetch.mock.calls[0][0]).toContain('/compound/cid/2244/property/');
  });

  test('ChEMBL por nome: só campos escolhidos (sem molfile nem referências cruzadas)', async () => {
    fetch.mockResolvedValueOnce(text(JSON.stringify(CHEMBL)));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'chembl', name: 'Aspirin' }, { cache: null, now: NOW });
    expect(fetch.mock.calls[0][0]).toBe('https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?limit=1&q=aspirin');
    expect(res.fonte.licenca).toBe('CC-BY-SA-3.0');
    expect(res.data).toEqual({ chemblId: 'CHEMBL25', prefName: 'ASPIRIN', moleculeType: 'Small molecule', maxPhase: 4, formula: 'C9H8O4', molecularWeight: 180.16, alogp: 1.31, psa: 63.6, hba: 3, hbd: 1, rtb: 2, ro5Violations: 0, canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' });
    expect(JSON.stringify(res)).not.toContain('GRANDE');
  });

  test('ChEMBL por ID usa o endpoint da molécula', async () => {
    fetch.mockResolvedValueOnce(text(JSON.stringify(CHEMBL.molecules[0])));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'chembl', chemblId: 'chembl25' }, { cache: null });
    expect(fetch.mock.calls[0][0]).toBe('https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL25.json');
    expect(res.data.chemblId).toBe('CHEMBL25');
  });

  test('ChEBI: escolhe a correspondência exata, tira marcação e licencia CC BY 4.0', async () => {
    fetch.mockResolvedValueOnce(text(JSON.stringify(CHEBI)));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'chebi', name: 'Acetylsalicylic acid' }, { cache: null });
    expect(fetch.mock.calls[0][0]).toContain('https://www.ebi.ac.uk/ebisearch/ws/rest/chebi?format=json');
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain('name:"Acetylsalicylic acid"');
    expect(res.fonte.licenca).toBe('CC-BY-4.0');
    expect(res.data).toEqual({ chebiId: 'CHEBI:15365', nome: 'acetylsalicylic acid', definicao: 'A member of salicylates.', correspondenciaExata: true });
  });

  test('ChEBI sem definição devolve null, nunca texto inventado', async () => {
    fetch.mockResolvedValueOnce(text(JSON.stringify({ entries: [{ acc: 'CHEBI:1', fields: { name: ['x'], definition: [] } }] })));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'chebi', name: 'y' }, { cache: null });
    expect(res.data.definicao).toBeNull();
    expect(res.data.correspondenciaExata).toBe(false);
  });
});

describe('lookup — falhas', () => {
  test('404 e resposta vazia viram "não encontrado"; 500, rede, corpo grande e JSON ruim viram "indisponível"', async () => {
    const chamar = () => Lab.lookup(sqlFlag(true), null, { provider: 'pubchem', name: 'xyzol' }, { cache: null });
    fetch.mockResolvedValueOnce(text('{}', { status: 404 }));
    expect(await chamar()).toMatchObject({ success: false, notFound: true });
    fetch.mockResolvedValueOnce(text(JSON.stringify({ PropertyTable: { Properties: [] } })));
    expect(await chamar()).toMatchObject({ notFound: true });
    fetch.mockResolvedValueOnce(text('busy', { status: 503 }));
    expect(await chamar()).toEqual({ success: false, unavailable: true, message: Lab.UNAVAILABLE_MESSAGE });
    fetch.mockRejectedValueOnce(Object.assign(new Error('abort'), { name: 'AbortError' }));
    expect(await chamar()).toMatchObject({ unavailable: true });
    fetch.mockResolvedValueOnce(text('x', { headers: { 'Content-Length': String(Lab.MAX_BODY_BYTES + 1) } }));
    expect(await chamar()).toMatchObject({ unavailable: true });
    fetch.mockResolvedValueOnce(text('<html>'));
    expect(await chamar()).toMatchObject({ unavailable: true });
  });

  test('resposta com falha não entra na cache', async () => {
    const cache = memoryCache();
    fetch.mockResolvedValueOnce(text('busy', { status: 503 }));
    await Lab.lookup(sqlFlag(true), null, { provider: 'chembl', name: 'aspirin' }, { cache });
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe('handler', () => {
  test('apiLearnLabChem existe e, sem sessão válida, não chama a rede', async () => {
    expect(typeof API_REGISTRY.apiLearnLabChem).toBe('function');
    const sql = makeSql();
    sql.mockResolvedValue([]);
    const res = await API_REGISTRY.apiLearnLabChem(sql, makeEnv(), ['token-invalido', { provider: 'pubchem', name: 'aspirin' }]);
    expect(res.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('lookup — limite de taxa (F-008)', () => {
  const PUB = JSON.stringify(PUBCHEM);

  test('dentro do limite: consulta a fonte uma vez por falha de cache', async () => {
    const enforceLimit = jest.fn().mockResolvedValue(undefined);
    fetch.mockResolvedValueOnce(text(PUB));
    const res = await Lab.lookup(sqlFlag(true), { profileId: 'p1' }, { provider: 'pubchem', name: 'aspirin' }, { cache: memoryCache(), now: NOW, enforceLimit });
    expect(res.success).toBe(true);
    expect(enforceLimit).toHaveBeenCalledTimes(1);
  });

  test('fora do limite: erro padrão e a rede não é chamada', async () => {
    const { rateLimitExceeded } = await import('../src/security.js');
    const enforceLimit = jest.fn().mockRejectedValue(rateLimitExceeded());
    await expect(Lab.lookup(sqlFlag(true), { profileId: 'p1' }, { provider: 'pubchem', name: 'aspirin' }, { cache: memoryCache(), enforceLimit }))
      .rejects.toMatchObject({ expected: true, message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('cache hit não gasta o limite', async () => {
    const cache = memoryCache();
    fetch.mockResolvedValueOnce(text(PUB));
    await Lab.lookup(sqlFlag(true), { profileId: 'p1' }, { provider: 'pubchem', name: 'aspirin' }, { cache, now: NOW });
    const enforceLimit = jest.fn();
    const res = await Lab.lookup(sqlFlag(true), { profileId: 'p1' }, { provider: 'pubchem', name: 'aspirin' }, { cache, enforceLimit });
    expect(res.cached).toBe(true);
    expect(enforceLimit).not.toHaveBeenCalled();
  });

  test('flag desligada e nome bloqueado não gastam o limite', async () => {
    const enforceLimit = jest.fn();
    await Lab.lookup(sqlFlag(false), { profileId: 'p1' }, { provider: 'pubchem', name: 'aspirin' }, { cache: null, enforceLimit });
    __resetFlagCacheForTests();
    await Lab.lookup(sqlFlag(true), { profileId: 'p1' }, { provider: 'pubchem', name: 'Sarin' }, { cache: null, enforceLimit });
    expect(enforceLimit).not.toHaveBeenCalled();
  });

  test('limitador do handler: visitante tem teto menor que membro', async () => {
    const { moleculeProxyLimiter } = await import('../src/handlers.js');
    const { RATE_LIMITS } = await import('../src/constants.js');
    const v = RATE_LIMITS.MOLECULE_PROXY_VISITOR.MAX_ATTEMPTS;
    const m = RATE_LIMITS.MOLECULE_PROXY_MEMBER.MAX_ATTEMPTS;
    expect(v).toBeLessThan(m);
    const mk = (n) => jest.fn().mockResolvedValue([{ attempts: n }]);
    await expect(moleculeProxyLimiter(mk(v), 'LAB_CHEM', { role: 'visitor', profileId: 'a' })()).resolves.toBeUndefined();
    await expect(moleculeProxyLimiter(mk(v + 1), 'LAB_CHEM', { role: 'visitor', profileId: 'a' })()).rejects.toMatchObject({ expected: true });
    await expect(moleculeProxyLimiter(mk(v + 1), 'LAB_CHEM', { role: 'member', profileId: 'b' })()).resolves.toBeUndefined();
    await expect(moleculeProxyLimiter(mk(m + 1), 'LAB_CHEM', { role: 'member', profileId: 'b' })()).rejects.toMatchObject({ expected: true });
  });
});

describe('lookup — bloqueio pelo nome devolvido pela fonte (F-037)', () => {
  test('consulta por CID cujo nome devolvido é fosgênio é bloqueada e não vai à cache', async () => {
    const cache = memoryCache();
    const body = { PropertyTable: { Properties: [{ CID: 6371, MolecularFormula: 'CCl2O', IUPACName: 'carbonyl dichloride' }] } };
    fetch.mockResolvedValueOnce(text(JSON.stringify(body)));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'pubchem', cid: 6371 }, { cache, now: NOW });
    expect(res).toEqual({ success: false, blocked: true, message: Lab.BLOCKED_MESSAGE });
    expect(cache.put).not.toHaveBeenCalled();
  });

  test('consulta por ChEMBL ID cujo nome preferido é agente de guerra é bloqueada', async () => {
    const body = { molecule_chembl_id: 'CHEMBL1', pref_name: 'SARIN', molecule_properties: {}, molecule_structures: {} };
    fetch.mockResolvedValueOnce(text(JSON.stringify(body)));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'chembl', chemblId: 'CHEMBL1' }, { cache: memoryCache(), now: NOW });
    expect(res).toMatchObject({ success: false, blocked: true });
  });

  test('nome comum devolvido pela fonte segue normal', async () => {
    fetch.mockResolvedValueOnce(text(JSON.stringify(PUBCHEM)));
    const res = await Lab.lookup(sqlFlag(true), null, { provider: 'pubchem', cid: 2244 }, { cache: memoryCache(), now: NOW });
    expect(res.success).toBe(true);
  });
});
