/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlasMoleculeService.js
 * Proxy do modo Moléculas do Atlas 3D (PR 3.2, Bloco E). O navegador não
 * fala mais com o RCSB nem com o PubChem: a CSP do atlas tirou os dois do
 * connect-src e as buscas passam por aqui, com sessão (runWithSession).
 *
 * Regras:
 *  - nunca repassa URL vinda do cliente: o id do PDB e o nome/CID do
 *    PubChem são validados e encaixados em URLs fixas;
 *  - PubChem devolve só um conjunto FIXO de propriedades;
 *  - .pdb acima de 5 MB é recusado (antes e durante a leitura);
 *  - resposta boa fica na Cache API por 7 dias (chave interna, sem sessão);
 *  - falha do serviço externo vira { success:false, unavailable:true } com
 *    mensagem fixa — o front mostra "Serviço de moléculas indisponível".
 */
import { ValidationError } from '../errors.js';

export const PDB_ID_RE = /^[0-9][A-Za-z0-9]{3}$/;
export const PDB_MAX_BYTES = 5 * 1024 * 1024;
export const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const UPSTREAM_TIMEOUT_MS = 15000;
export const UNAVAILABLE_MESSAGE = 'Serviço de moléculas indisponível.';
export const PUBCHEM_PROPS = ['MolecularFormula', 'MolecularWeight', 'XLogP', 'CanonicalSMILES', 'IUPACName'];
const PUBCHEM_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ,'()\-]{0,79}$/u;
const CACHE_ORIGIN = 'https://atlas-molecule-cache.internal';

function unavailable() {
  return { success: false, unavailable: true, message: UNAVAILABLE_MESSAGE };
}

function defaultCache() {
  return typeof caches !== 'undefined' && caches && caches.default ? caches.default : null;
}

async function cacheGet(cache, key) {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    return hit ? await hit.json() : null;
  } catch (err) {
    return null;
  }
}

async function cachePut(cache, key, payload) {
  if (!cache) return;
  try {
    await cache.put(key, new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + CACHE_TTL_SECONDS },
    }));
  } catch (err) {
    // Cache é otimização: falha aqui nunca derruba a resposta.
  }
}

async function fetchWithTimeout(url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (controller) controller.abort(); }, UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller ? controller.signal : undefined, headers: { Accept: '*/*' } });
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o corpo como texto parando em maxBytes (null se passar do limite). */
async function readTextLimited(res, maxBytes) {
  const declared = Number(res.headers && res.headers.get && res.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return new TextEncoder().encode(text).length > maxBytes ? null : text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch (e) { /* já fechado */ }
      return null;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/**
 * Arquivo .pdb de uma estrutura do RCSB.
 * @param {{ id?: string }} input
 */
export async function getPdb(input, { cache = defaultCache() } = {}) {
  const raw = input && typeof input.id === 'string' ? input.id.trim() : '';
  if (!PDB_ID_RE.test(raw)) throw ValidationError('Código PDB inválido (4 caracteres, começando por número).');
  const id = raw.toUpperCase();
  const key = CACHE_ORIGIN + '/pdb/' + id;
  const cached = await cacheGet(cache, key);
  if (cached && typeof cached.pdb === 'string') return { success: true, id, pdb: cached.pdb, cached: true };

  let res;
  try {
    res = await fetchWithTimeout('https://files.rcsb.org/download/' + id + '.pdb');
  } catch (err) {
    return unavailable();
  }
  if (res.status === 404) return { success: false, notFound: true, message: 'Estrutura ' + id + ' não encontrada no PDB.' };
  if (!res.ok) return unavailable();
  let pdb;
  try {
    pdb = await readTextLimited(res, PDB_MAX_BYTES);
  } catch (err) {
    return unavailable();
  }
  if (pdb === null) return { success: false, tooLarge: true, message: 'Estrutura grande demais para o atlas (limite de 5 MB).' };
  await cachePut(cache, key, { pdb });
  return { success: true, id, pdb, cached: false };
}

/**
 * Propriedades fixas de um composto do PubChem, por nome ou CID.
 * @param {{ name?: string, cid?: number|string }} input
 */
export async function getPubchem(input, { cache = defaultCache() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  let path;
  let keyPart;
  if (src.cid !== undefined && src.cid !== null && src.cid !== '') {
    const cid = Number(src.cid);
    if (!Number.isInteger(cid) || cid <= 0 || cid > 999999999) throw ValidationError('CID inválido.');
    path = 'cid/' + cid;
    keyPart = 'cid/' + cid;
  } else {
    const name = typeof src.name === 'string' ? src.name.trim().replace(/\s+/g, ' ') : '';
    if (!PUBCHEM_NAME_RE.test(name)) throw ValidationError('Nome de composto inválido.');
    path = 'name/' + encodeURIComponent(name.toLowerCase());
    keyPart = 'name/' + encodeURIComponent(name.toLowerCase());
  }
  const key = CACHE_ORIGIN + '/pubchem/' + keyPart;
  const cached = await cacheGet(cache, key);
  if (cached && cached.props) return { success: true, cid: cached.cid, props: cached.props, cached: true };

  let res;
  try {
    res = await fetchWithTimeout('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/' + path + '/property/' + PUBCHEM_PROPS.join(',') + '/JSON');
  } catch (err) {
    return unavailable();
  }
  if (res.status === 404) return { success: false, notFound: true, message: 'Composto não encontrado no PubChem.' };
  if (!res.ok) return unavailable();
  let row;
  try {
    const text = await readTextLimited(res, 256 * 1024);
    const data = text === null ? null : JSON.parse(text);
    row = data && data.PropertyTable && Array.isArray(data.PropertyTable.Properties) ? data.PropertyTable.Properties[0] : null;
  } catch (err) {
    return unavailable();
  }
  if (!row) return { success: false, notFound: true, message: 'Composto não encontrado no PubChem.' };
  // Desde 2025 o PubChem devolve CanonicalSMILES como ConnectivitySMILES/SMILES.
  const smiles = row.CanonicalSMILES || row.ConnectivitySMILES || row.SMILES || row.IsomericSMILES || null;
  const props = {
    MolecularFormula: typeof row.MolecularFormula === 'string' ? row.MolecularFormula : null,
    MolecularWeight: row.MolecularWeight != null ? String(row.MolecularWeight) : null,
    XLogP: typeof row.XLogP === 'number' ? row.XLogP : null,
    CanonicalSMILES: typeof smiles === 'string' ? smiles : null,
    IUPACName: typeof row.IUPACName === 'string' ? row.IUPACName : null,
  };
  const cid = Number.isInteger(row.CID) ? row.CID : null;
  await cachePut(cache, key, { cid, props });
  return { success: true, cid, props, cached: false };
}
