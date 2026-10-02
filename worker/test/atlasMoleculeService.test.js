import { jest } from '@jest/globals';
import * as Mol from '../src/services/atlasMoleculeService.js';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

// PR 3.2 (Onda 3), Bloco E — proxy RCSB/PubChem do modo Moléculas.

function memoryCache() {
  const store = new Map();
  return {
    store,
    match: jest.fn(async (k) => (store.has(k) ? new Response(store.get(k)) : undefined)),
    put: jest.fn(async (k, res) => { store.set(k, await res.text()); }),
  };
}

function textResponse(body, init) {
  return new Response(body, Object.assign({ status: 200 }, init || {}));
}

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('getPdb', () => {
  test('busca no RCSB por URL fixa, devolve o .pdb e grava na cache por 7 dias', async () => {
    const cache = memoryCache();
    fetch.mockResolvedValueOnce(textResponse('HEADER    HYDROLASE\nATOM      1  N\n'));
    const res = await Mol.getPdb({ id: '4ey7' }, { cache });
    expect(res).toMatchObject({ success: true, id: '4EY7', cached: false });
    expect(res.pdb).toContain('HEADER');
    expect(fetch.mock.calls[0][0]).toBe('https://files.rcsb.org/download/4EY7.pdb');
    const [key, putRes] = cache.put.mock.calls[0];
    expect(key).toContain('/pdb/4EY7');
    expect(putRes.headers.get('Cache-Control')).toBe('public, max-age=604800');
  });

  test('segunda chamada sai da cache, sem rede', async () => {
    const cache = memoryCache();
    fetch.mockResolvedValueOnce(textResponse('ATOM'));
    await Mol.getPdb({ id: '1HSG' }, { cache });
    const again = await Mol.getPdb({ id: '1hsg' }, { cache });
    expect(again).toMatchObject({ success: true, cached: true, pdb: 'ATOM' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['vazio', ''],
    ['começa com letra', 'ABCD'],
    ['curto', '1AB'],
    ['longo', '1ABCD'],
    ['tentativa de caminho', '1../'],
    ['URL completa', 'https://evil.example/1abc'],
  ])('id inválido (%s) é recusado sem chamar a rede', async (_n, id) => {
    await expect(Mol.getPdb({ id }, { cache: null })).rejects.toMatchObject({ expected: true, message: expect.stringContaining('Código PDB inválido') });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('Content-Length acima de 5 MB é recusado sem ler o corpo', async () => {
    fetch.mockResolvedValueOnce(textResponse('x', { headers: { 'Content-Length': String(Mol.PDB_MAX_BYTES + 1) } }));
    const res = await Mol.getPdb({ id: '6VXX' }, { cache: null });
    expect(res).toMatchObject({ success: false, tooLarge: true });
  });

  test('corpo que passa de 5 MB durante a leitura é recusado', async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(65);
    let sent = 0;
    const body = new ReadableStream({
      pull(ctrl) { if (sent++ < 6) ctrl.enqueue(chunk); else ctrl.close(); },
    });
    fetch.mockResolvedValueOnce(new Response(body, { status: 200 }));
    const cache = memoryCache();
    const res = await Mol.getPdb({ id: '6VXX' }, { cache });
    expect(res).toMatchObject({ success: false, tooLarge: true });
    expect(cache.put).not.toHaveBeenCalled();
  });

  test('404 vira "não encontrada"; 500, timeout e rede caída viram "indisponível"', async () => {
    fetch.mockResolvedValueOnce(textResponse('nope', { status: 404 }));
    expect(await Mol.getPdb({ id: '9ZZZ' }, { cache: null })).toMatchObject({ success: false, notFound: true });
    fetch.mockResolvedValueOnce(textResponse('erro', { status: 500 }));
    expect(await Mol.getPdb({ id: '9ZZZ' }, { cache: null })).toEqual({ success: false, unavailable: true, message: Mol.UNAVAILABLE_MESSAGE });
    fetch.mockRejectedValueOnce(Object.assign(new Error('abort'), { name: 'AbortError' }));
    expect(await Mol.getPdb({ id: '9ZZZ' }, { cache: null })).toMatchObject({ unavailable: true });
  });
});

describe('getPubchem', () => {
  const OK = { PropertyTable: { Properties: [{ CID: 2244, MolecularFormula: 'C9H8O4', MolecularWeight: '180.16', XLogP: 1.2, ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', IUPACName: '2-acetyloxybenzoic acid', Extra: '<script>' }] } };

  test('por nome: URL fixa com as 5 propriedades e só elas na resposta', async () => {
    fetch.mockResolvedValueOnce(textResponse(JSON.stringify(OK)));
    const res = await Mol.getPubchem({ name: '  Aspirin ' }, { cache: memoryCache() });
    expect(fetch.mock.calls[0][0]).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/aspirin/property/MolecularFormula,MolecularWeight,XLogP,CanonicalSMILES,IUPACName/JSON');
    expect(res).toEqual({
      success: true, cid: 2244, cached: false,
      props: { MolecularFormula: 'C9H8O4', MolecularWeight: '180.16', XLogP: 1.2, CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', IUPACName: '2-acetyloxybenzoic acid' },
    });
  });

  test('por CID e com cache', async () => {
    const cache = memoryCache();
    fetch.mockResolvedValueOnce(textResponse(JSON.stringify(OK)));
    await Mol.getPubchem({ cid: 2244 }, { cache });
    expect(fetch.mock.calls[0][0]).toContain('/compound/cid/2244/property/');
    const again = await Mol.getPubchem({ cid: '2244' }, { cache });
    expect(again).toMatchObject({ success: true, cached: true, cid: 2244 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['nome vazio', { name: '' }],
    ['nome com barra', { name: 'aspirin/../../x' }],
    ['nome com ?', { name: 'aspirin?x=1' }],
    ['nome longo', { name: 'a'.repeat(81) }],
    ['CID negativo', { cid: -1 }],
    ['CID fracionário', { cid: 1.5 }],
    ['nada', {}],
  ])('entrada inválida (%s) é recusada sem chamar a rede', async (_n, input) => {
    await expect(Mol.getPubchem(input, { cache: null })).rejects.toMatchObject({ expected: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('404 e tabela vazia viram "não encontrado"; 503 vira "indisponível"', async () => {
    fetch.mockResolvedValueOnce(textResponse('{}', { status: 404 }));
    expect(await Mol.getPubchem({ name: 'xyzol' }, { cache: null })).toMatchObject({ notFound: true });
    fetch.mockResolvedValueOnce(textResponse(JSON.stringify({ PropertyTable: { Properties: [] } })));
    expect(await Mol.getPubchem({ name: 'xyzol' }, { cache: null })).toMatchObject({ notFound: true });
    fetch.mockResolvedValueOnce(textResponse('busy', { status: 503 }));
    expect(await Mol.getPubchem({ name: 'xyzol' }, { cache: null })).toMatchObject({ unavailable: true, message: Mol.UNAVAILABLE_MESSAGE });
  });
});

describe('handlers — proxy exige sessão', () => {
  test.each(['apiLearnAtlasPdb', 'apiLearnAtlasPubchem'])('%s sem sessão válida não chama a rede', async (action) => {
    const sql = makeSql();
    sql.mockResolvedValue([]);
    const res = await API_REGISTRY[action](sql, makeEnv(), ['token-invalido', { id: '4EY7', name: 'aspirin' }]);
    expect(res.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
