/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * research/scholarlyClient.js
 * Cliente da base bibliográfica externa da "Pesquisar mais a fundo" (v1: Europe PMC, REST,
 * resultType=lite, filtro SRC:MED; ver docs/lia/pesquisa/BASES.md). A chamada sai do Worker e
 * leva só os termos gerais: sem cookie, sem chave e sem dado da pessoa.
 * Devolve só metadados, ids e link. Nunca o resumo.
 *
 * Toda falha vira um Error curto e fixo, sem os termos pesquisados.
 */
const EUROPE_PMC_SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const SOURCE_FILTER = ' AND SRC:MED';
const PAGE_SIZE = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const PMID_RE = /^\d{1,10}$/;
const MSG_TIMEOUT = 'Europe PMC fora do tempo limite';
const MSG_FAILED = 'Europe PMC indisponível ou com resposta inválida';

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/** Link pelo PMID (domínio europepmc.org), senão pelo DOI (doi.org), senão nenhum. */
function articleUrl(pmid, doi) {
  if (pmid && PMID_RE.test(pmid)) return 'https://europepmc.org/article/MED/' + pmid;
  if (doi) return 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
  return null;
}

/** Um resultado do Europe PMC vira só metadados, ids e link. Campo ausente vira null. */
function mapResult(raw) {
  const pmid = text(raw.pmid);
  const doi = text(raw.doi);
  return {
    title: text(raw.title),
    journal: text(raw.journalTitle),
    year: text(raw.pubYear),
    url: articleUrl(pmid, doi),
    ids: { pmid, pmcid: text(raw.pmcid), doi },
  };
}

function extractResults(json) {
  const list = json && json.resultList && Array.isArray(json.resultList.result) ? json.resultList.result : null;
  if (!list) throw new Error(MSG_FAILED);
  return list.filter((r) => r !== null && typeof r === 'object').map(mapResult);
}

function buildUrl(query) {
  const q = encodeURIComponent(query + SOURCE_FILTER);
  return EUROPE_PMC_SEARCH + '?query=' + q + '&resultType=lite&format=json&pageSize=' + PAGE_SIZE;
}

/**
 * Busca na Europe PMC. `query` são os termos já limpos (ver researchService.buildQuery).
 * Devolve { items } ou lança Error curto: status não 2xx, tempo esgotado ou JSON inválido.
 */
export async function searchEuropePmc(query, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(buildUrl(query), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res || !res.ok) throw new Error(MSG_FAILED);
    return { items: extractResults(await res.json()) };
  } catch (err) {
    throw new Error(err && err.name === 'AbortError' ? MSG_TIMEOUT : MSG_FAILED);
  } finally {
    clearTimeout(timer);
  }
}

/** Provedores disponíveis. O PubMed direto fica para quando houver chave institucional. */
export const PROVIDERS = { europepmc: searchEuropePmc };
