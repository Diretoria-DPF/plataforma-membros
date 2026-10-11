# APIs de metadados de artigos (DOI/PMID), verificado em 2026-10-10

Legenda: "ao vivo" = resposta real da API hoje; "doc" = página oficial lida; "resumo" = resultado de busca, página oficial bloqueada hoje; "não verificado" = não consegui confirmar.

## 1. Crossref `GET https://api.crossref.org/works/{doi}`

| Dado | Campo no JSON | Observação | Fonte |
|---|---|---|---|
| Título | `message.title[0]` | array | doc: github.com/CrossRef/rest-api-doc/blob/master/api_format.md |
| Autores | `message.author[]` (`given`, `family`, `sequence`, `ORCID`, `affiliation[].name`) | `family` obrigatório | api_format.md |
| Revista | `message.container-title[0]` | opcional | api_format.md |
| Ano | `message.issued."date-parts"[0][0]` | menor entre published-print e published-online | api_format.md |
| Abstract | `message.abstract` | opcional; texto ou JATS XML; ausente em 10.1038/nature12373 | api_format.md; ao vivo |
| Licença | `message.license[]`: `URL`, `content-version` (vor, am, tdm, unspecified), `delay-in-days`, `start` | licença declarada pelo editor; pode ser só `tdm` | api_format.md; ao vivo |
| Tipo | `message.type` | ex.: `journal-article` | api_format.md |
| Idioma | `message.language` | presente ao vivo ("en"), mas api_format.md só o lista em Review: tratar como opcional | ao vivo |

- Polite pool: "Include your email address in the `mailto` parameter or `agent` header". Use `?mailto={email}`. Formato de User-Agent: não verificado. Fonte: crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/
- Limites: pool público 5 req, concorrência 1; polite 10 req, concorrência 3; Plus 150. Unidade (por segundo) não declarada na página; conferir header `x-rate-limit-interval`. Em HTTP 429, recuar (tips-for-using-the-crossref-rest-api).
- Codificação de DOI na URL: não verificado.

## 2. PubMed E-utilities (NCBI)

Base: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` (ao vivo)

| Operação | URL (sem chave) | Resultado verificado |
|---|---|---|
| PMID para DOI/PMC | `esummary.fcgi?db=pubmed&id={pmid}&retmode=json&tool={tool}&email={email}` | JSON; `result[pmid].articleids[]` com `idtype` doi, pmc; `elocationid` vem como "doi: ..." |
| DOI para PMID | `esearch.fcgi?db=pubmed&term={doi}[AID]&retmode=json&tool=..&email=..` | JSON; `esearchresult.idlist` |
| Abstract | `efetch.fcgi?db=pubmed&id={pmid}&rettype=abstract&retmode=xml` | XML; `Abstract/AbstractText` (sem Label = não estruturado); `CopyrightInformation` |

- esummary não traz abstract; ele vem só no efetch. JSON no efetch: não verificado.
- Limites (resumo, página oficial bloqueada): 3 req/s sem `api_key`; 10 req/s com `api_key`. `tool` e `email` são obrigatórios e devem ser registrados na NCBI. Jobs grandes: fins de semana ou 21h–5h (ET).

## 3. Europe PMC REST

Exemplo (ao vivo): `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:{doi}&resultType=core&format=json`

- Campos do `resultList.result[]`: `pmid`, `pmcid`, `doi`, `title`, `authorString`, `journalInfo.journal.title` (não existe `journalTitle`), `pubYear` (string), `abstractText`, `license`, `isOpenAccess` ("Y"/"N"), `inPMC`, `hasPDF`, `fullTextUrlList`.
- Valores observados: PLOS (10.1371/journal.pone.0000308) tem `license` = "cc by" (com espaço), `isOpenAccess` = "Y". Nature (10.1038/nature12373) não tem chave `license`, `isOpenAccess` = "N".
- Limites e página de docs (`europepmc.org/RestfulWebService`): HTTP 403, não verificado.

## 4. Unpaywall e OpenAlex (status OA)

**Unpaywall** `https://api.unpaywall.org/v2/{doi}?email={email}` (ao vivo com e-mail de teste; 422 com domínio example.com)
- Campos observados: `is_oa`, `oa_status`, `journal_is_in_doaj`, `has_repository_copy`, `best_oa_location` {`license`, `version`, `host_type`, `url_for_pdf`, `url`, `url_for_landing_page`}.
- `oa_status`: closed, green, gold, hybrid, bronze (fonte secundária: support.unpaywall.org; doc oficial não lida).
- Limite: 100.000 chamadas/dia; `email` obrigatório (resumo de unpaywall.org/api/v2).

**OpenAlex** `https://api.openalex.org/works/doi:{doi}` (ao vivo)
- Campos: `title`, `publication_year`, `language`, `type` (ex.: "article"), `primary_location.source.display_name`, `authorships[]`, `open_access` {`is_oa`, `oa_status`, `oa_url`, `any_repository_has_fulltext`}, `best_oa_location` {`license`, `version`, `pdf_url`}, `abstract_inverted_index` (precisa reconstruir), `ids` (com pmid).
- `oa_status`: diamond, gold, green, hybrid, bronze, closed (help.openalex.org/api-entities/works/work-object).
- `primary_location.license`: não documentado na página; ao vivo veio "cc-by" (PLOS) e null (Nature).
- Chave: `&api_key={key}` ou header Authorization. 429 acima de 100 req/s (help.openalex.org/how-to-use-the-api/rate-limits-and-authentication). Orçamento diário: "10x" o sem chave; valor em USD não verificado. `mailto`: não mencionado.

## 5. Licenças (resumo factual, sem aconselhamento jurídico)

| Licença | Redistribuir | Adaptar | Uso comercial | Condições | Fonte |
|---|---|---|---|---|---|
| CC BY 4.0 | sim | sim | sim | atribuição; indicar mudanças | creativecommons.org/licenses/by/4.0/ |
| CC BY-NC 4.0 | sim | sim | não | atribuição; NonCommercial | creativecommons.org/licenses/by-nc/4.0/ |
| CC BY-ND 4.0 | sim, inclusive comercial | não pode distribuir versão modificada | sim | atribuição | creativecommons.org/licenses/by-nd/4.0/ |
| CC BY-SA, CC0 | não verificado | | | | creativecommons.org/licenses/ (sem os termos) |
| `tdm` (Crossref) | não é licença CC; termos do editor não verificados | | | | api_format.md |

- Unpaywall (resumo, fonte secundária): "Elsevier User License" é tratada como não-OA (bronze).
- Normalizar a licença: Crossref usa URL CC; Europe PMC usa "cc by"; Unpaywall e OpenAlex usam "cc-by".

## 6. Ordem de consulta (menor número de chamadas)

1. **Crossref** `works/{doi}?mailto={email}`: título, autores, revista, ano, tipo, licença do editor, abstract (se houver). Cobre qualquer DOI.
2. **Europe PMC** `search?query=DOI:{doi}`, só se faltar abstract ou licença CC: `abstractText`, `license`, `pmid`, `pmcid`, `isOpenAccess`. Só artigos indexados.
3. **OpenAlex** `works/doi:{doi}`: `oa_status`, `is_oa`, `best_oa_location`. Abstract só como último recurso (`abstract_inverted_index`). Unpaywall faz a mesma função; não somar as duas.
4. **PubMed** (esearch `[AID]` + efetch XML) só se precisar do abstract oficial MEDLINE. O PMID já vem no passo 2.

Total típico: 2 a 3 chamadas. Para cada DOI, guardar a URL e a data de consulta junto do registro.
