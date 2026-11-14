/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * labChemService.js
 * Proxy do Laboratório para PubChem, ChEMBL e ChEBI (O2). Segue o padrão de atlasMoleculeService.js:
 *  - URL fixa montada no servidor; o navegador manda só nome, CID ou ID ChEMBL, validados;
 *  - PubChem devolve a lista FIXA de propriedades; ChEMBL e ChEBI, só campos escolhidos aqui;
 *  - corpo limitado (256 KB) e timeout de 15 s;
 *  - resposta boa fica 7 dias na Cache API (chave interna, sem sessão); nenhum cache novo em KV;
 *  - falha do serviço externo vira { success:false, unavailable:true } com mensagem fixa;
 *  - nomes de agentes de guerra (CBRN) nem chegam ao serviço externo (lista de bloqueio do servidor);
 *  - atrás da flag lab_chem_proxy_enabled (desligada por padrão): desligada, responde { disabled:true }
 *    e o navegador segue pelo caminho antigo.
 * Fontes permitidas: PubChem, ChEMBL, ChEBI. A resposta leva fonte, licença, atribuição e data da consulta.
 */
import { ValidationError } from '../errors.js';
import { checkSafety, isBlockedIdentifier } from '../ai/safetyBlocklist.js';
import { isEnabled } from './featureFlagService.js';
import {
  PUBCHEM_PROPS, PUBCHEM_NAME_RE, UNAVAILABLE_MESSAGE, unavailable, defaultCache, cacheGet, cachePut,
  fetchWithTimeout, readTextLimited,
} from './atlasMoleculeService.js';

export const FLAG_KEY = 'lab_chem_proxy_enabled';
export const PROVIDERS = ['pubchem', 'chembl', 'chebi'];
export const MAX_BODY_BYTES = 256 * 1024;
export const DISABLED_MESSAGE = 'Consulta de substâncias desativada.';
export const BLOCKED_MESSAGE = 'Esta substância não é consultada pelo Laboratório.';
const CACHE_ORIGIN = 'https://lab-chem-cache.internal';
const CHEMBL_ID_RE = /^CHEMBL[0-9]{1,9}$/;
const DEFINITION_MAX = 600;

export const FONTES = Object.freeze({
  pubchem: { slug: 'pubchem', licenca: 'public-domain', atribuicao: 'PubChem, National Library of Medicine' },
  chembl: { slug: 'chembl', licenca: 'CC-BY-SA-3.0', atribuicao: 'ChEMBL, EMBL-EBI' },
  chebi: { slug: 'chebi', licenca: 'CC-BY-4.0', atribuicao: 'ChEBI, EMBL-EBI' },
});

function notFound(label) {
  return { success: false, notFound: true, message: label + ' não encontrado.' };
}

function validName(src) {
  const name = typeof src.name === 'string' ? src.name.trim().replace(/\s+/g, ' ') : '';
  if (!PUBCHEM_NAME_RE.test(name)) throw ValidationError('Nome de composto inválido.');
  return name;
}

function ok(provider, data, fetchedAt, cached) {
  return { success: true, provider, data, fonte: FONTES[provider], consultado_em: fetchedAt, cached };
}

async function getJson(url) {
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    return { unavailable: true };
  }
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { unavailable: true };
  try {
    const text = await readTextLimited(res, MAX_BODY_BYTES);
    if (text === null) return { unavailable: true };
    return { json: JSON.parse(text) };
  } catch (err) {
    return { unavailable: true };
  }
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const RETURNED_NAME_FIELDS = ['IUPACName', 'prefName', 'nome'];

function returnedNameBlocked(data) {
  if (isBlockedIdentifier({ cid: data.cid, inchiKey: data.inchiKey })) return true;
  return RETURNED_NAME_FIELDS.some((f) => typeof data[f] === 'string' && checkSafety({ term: data[f] }).reason === 'cbrn');
}

/** Constrói URL, chave de cache e leitor de cada provedor. */
function plan(provider, src) {
  if (provider === 'pubchem') {
    let path;
    if (src.cid !== undefined && src.cid !== null && src.cid !== '') {
      const cid = Number(src.cid);
      if (!Number.isInteger(cid) || cid <= 0 || cid > 999999999) throw ValidationError('CID inválido.');
      path = 'cid/' + cid;
    } else {
      path = 'name/' + encodeURIComponent(validName(src).toLowerCase());
    }
    return {
      key: 'pubchem/' + path,
      url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/' + path + '/property/' + PUBCHEM_PROPS.join(',') + '/JSON',
      label: 'Composto',
      read(json) {
        const row = json && json.PropertyTable && Array.isArray(json.PropertyTable.Properties) ? json.PropertyTable.Properties[0] : null;
        if (!row) return null;
        const smiles = row.CanonicalSMILES || row.ConnectivitySMILES || row.SMILES || row.IsomericSMILES || null;
        return {
          cid: Number.isInteger(row.CID) ? row.CID : null,
          MolecularFormula: typeof row.MolecularFormula === 'string' ? row.MolecularFormula : null,
          MolecularWeight: row.MolecularWeight != null ? String(row.MolecularWeight) : null,
          XLogP: typeof row.XLogP === 'number' ? row.XLogP : null,
          CanonicalSMILES: typeof smiles === 'string' ? smiles : null,
          IUPACName: typeof row.IUPACName === 'string' ? row.IUPACName : null,
        };
      },
    };
  }
  if (provider === 'chembl') {
    const id = typeof src.chemblId === 'string' ? src.chemblId.trim().toUpperCase() : '';
    const byId = Boolean(id);
    if (byId && !CHEMBL_ID_RE.test(id)) throw ValidationError('ID ChEMBL inválido.');
    const name = byId ? null : validName(src);
    const url = byId
      ? 'https://www.ebi.ac.uk/chembl/api/data/molecule/' + id + '.json'
      : 'https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?limit=1&q=' + encodeURIComponent(name.toLowerCase());
    return {
      key: 'chembl/' + (byId ? id : 'name/' + encodeURIComponent(name.toLowerCase())),
      url,
      label: 'Molécula',
      read(json) {
        const m = byId ? json : (json && Array.isArray(json.molecules) ? json.molecules[0] : null);
        if (!m || typeof m.molecule_chembl_id !== 'string') return null;
        const p = m.molecule_properties || {};
        const st = m.molecule_structures || {};
        return {
          chemblId: m.molecule_chembl_id,
          prefName: typeof m.pref_name === 'string' ? m.pref_name : null,
          moleculeType: typeof m.molecule_type === 'string' ? m.molecule_type : null,
          maxPhase: num(m.max_phase),
          formula: typeof p.full_molformula === 'string' ? p.full_molformula : null,
          molecularWeight: num(p.full_mwt),
          alogp: num(p.alogp),
          psa: num(p.psa),
          hba: num(p.hba),
          hbd: num(p.hbd),
          rtb: num(p.rtb),
          ro5Violations: num(p.num_ro5_violations),
          canonicalSmiles: typeof st.canonical_smiles === 'string' ? st.canonical_smiles : null,
          inchiKey: typeof st.standard_inchi_key === 'string' ? st.standard_inchi_key : null,
        };
      },
    };
  }
  const name = validName(src);
  return {
    key: 'chebi/name/' + encodeURIComponent(name.toLowerCase()),
    url: 'https://www.ebi.ac.uk/ebisearch/ws/rest/chebi?format=json&fields=name,definition&size=5&query=' + encodeURIComponent('name:"' + name.replace(/"/g, '') + '"'),
    label: 'Entrada ChEBI',
    read(json) {
      const entries = json && Array.isArray(json.entries) ? json.entries : [];
      if (!entries.length) return null;
      const alvo = name.toLowerCase();
      const exato = entries.find((e) => e && e.fields && Array.isArray(e.fields.name) && e.fields.name.some((n) => String(n).toLowerCase() === alvo));
      const hit = exato || entries[0];
      const f = hit.fields || {};
      const definicao = Array.isArray(f.definition) && f.definition[0]
        ? String(f.definition[0]).replace(/<[^>]*>?/g, '').trim().slice(0, DEFINITION_MAX) : null;
      return {
        chebiId: typeof hit.acc === 'string' ? hit.acc : null,
        nome: Array.isArray(f.name) && typeof f.name[0] === 'string' ? f.name[0] : null,
        definicao: definicao || null,
        correspondenciaExata: Boolean(exato),
      };
    },
  };
}

/**
 * Consulta um provedor permitido (pubchem, chembl ou chebi).
 * @param {Function} sql  usado só para ler a flag
 * @param {object} identity
 * @param {{ provider?: string, name?: string, cid?: number|string, chemblId?: string }} input
 * @param {{ enforceLimit?: Function }} opts  enforceLimit roda só antes de ir à fonte (cache hit não conta)
 */
export async function lookup(sql, identity, input, { cache = defaultCache(), now = () => new Date(), enforceLimit = null } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const provider = typeof src.provider === 'string' ? src.provider.trim().toLowerCase() : '';
  if (!PROVIDERS.includes(provider)) throw ValidationError('Fonte de consulta inválida.');

  let ligada = false;
  try {
    ligada = await isEnabled(sql, FLAG_KEY, identity);
  } catch (err) {
    ligada = false; // sem flag legível, o proxy fica fechado
  }
  if (!ligada) return { success: false, disabled: true, message: DISABLED_MESSAGE };

  const p = plan(provider, src);
  if (typeof src.name === 'string' && checkSafety({ term: src.name }).reason === 'cbrn') {
    return { success: false, blocked: true, message: BLOCKED_MESSAGE };
  }
  // Consulta por CID: o identificador é conferido antes do cache e da rede.
  if (provider === 'pubchem' && isBlockedIdentifier({ cid: src.cid })) {
    return { success: false, blocked: true, message: BLOCKED_MESSAGE };
  }

  const key = CACHE_ORIGIN + '/' + p.key;
  const cached = await cacheGet(cache, key);
  if (cached && cached.data) return ok(provider, cached.data, cached.fetchedAt, true);

  if (enforceLimit) await enforceLimit();
  const res = await getJson(p.url);
  if (res.notFound) return notFound(p.label);
  if (res.unavailable) return unavailable();
  const data = p.read(res.json);
  if (!data) return notFound(p.label);
  // Consulta por cid ou chemblId não traz nome na entrada: o nome devolvido pela fonte também passa pela lista.
  if (returnedNameBlocked(data)) return { success: false, blocked: true, message: BLOCKED_MESSAGE };
  const fetchedAt = now().toISOString();
  await cachePut(cache, key, { data, fetchedAt });
  return ok(provider, data, fetchedAt, false);
}

export { UNAVAILABLE_MESSAGE };
