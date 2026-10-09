# L01: Bases para a pesquisa externa da Lia (viabilidade)

Acesso em 2026-10-09. **Confirmado** = página oficial lida ou endpoint testado nesta data. **Via busca** = resumo de busca ou fonte secundária. **Não confirmado** = nada encontrado.
Bloqueios: NCBI (reCAPTCHA em NBK25497), Europe PMC (403 na documentação), search.scielo.org (403). A cópia do web.archive.org foi recusada pela ferramenta. docs.openalex.org redireciona para help.openalex.org.

## Resumo e recomendação de v1

| Base | Chave | Limite grátis | Custo | Reuso | Status |
|---|---|---|---|---|---|
| PubMed E-utilities | opcional | 3 req/s sem chave; 10 com | grátis | NLM não reivindica resumos; editoras podem ter direitos | confirmado (teste) |
| Europe PMC REST | não exigida (teste sem chave) | "uso razoável", sem cifra | grátis | não confirmado na página oficial | confirmado (teste) |
| OpenAlex | chave grátis | US$ 1/dia | lista US$ 0,10 por 1.000; busca US$ 1 por 1.000 (via busca) | CC0 | confirmado |
| SciELO ArticleMeta | não exigida (teste) | não confirmado | não confirmado | não confirmado | sem busca por termo |
| BVS/LILACS + DeCS | não documentada | não confirmado | não confirmado | "todos os direitos reservados" no rodapé | sem API documentada |

**Recomendação de v1: Europe PMC, `resultType=lite`, com o filtro `SRC:MED`.** Correção ao plano: sem o filtro entram preprints. Teste: "breast cancer" dá 982.268 resultados, e 934.310 com `SRC:MED`; sem chave; `pmid` e `doi` vêm na resposta. Alternativa com chave institucional: PubMed esummary (testado). Português: na v1 não traduzir; termos em PT rendem pouco e o vazio vai para a lista de lacunas. DeCS fica para a v2.

**Hosts da lista branca de links (v1):** `pubmed.ncbi.nlm.nih.gov`, `europepmc.org`, `doi.org`. A v2 acrescenta `openalex.org`.

## 1. PubMed E-utilities (NCBI)
Fontes: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi e https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi (testados em 2026-10-09); https://www.ncbi.nlm.nih.gov/home/about/policies/ (lido); https://www.ncbi.nlm.nih.gov/books/NBK25497/ (bloqueado; limites via busca).
**1 Acervo:** cerca de 38 M no plano, não confirmado. Português não quantificado; predomina inglês. **2 Chave:** opcional. O titular é a conta NCBI que a cria (via busca); a F4 recomenda conta institucional. **3 Limite:** 3 req/s sem chave e 10 com (via busca). Estourar pode bloquear o IP; o acesso volta só com `tool` e `email` registrados na NCBI (via busca). **4 Reuso:** a política diz que a NLM não reivindica direitos sobre os resumos; pede atribuição à NLM; o aviso de direitos do NCBI deve ficar visível. **5 Endpoint:** `esearch.fcgi?db=pubmed&term=...&retmode=json&retmax=8` devolve `count` e `idlist` (testado: 593.373 para "breast cancer"). `esummary.fcgi?db=pubmed&id=<PMID>&retmode=json` devolve `title`, `source` (revista), `pubdate` e `articleids` com `idtype` `pubmed` (o PMID) e `doi` (testado com PMID 42850038, em 2026-10-09). **6 Servidor:** aceita chamada do Worker. A política diz que o NCBI coleta dados de visitas e monitora tráfego, sem citar IP. Pelo Worker, o NCBI vê o IP do Worker, não o do membro.

## 2. Europe PMC REST (EMBL-EBI)
Fontes: https://www.ebi.ac.uk/europepmc/webservices/rest/search (testado); https://europepmc.org/RestfulWebService e https://europepmc.org/about/copyright (403).
**1 Acervo:** 982.268 resultados para "breast cancer", com PubMed/MEDLINE (`SRC:MED`), PMC e preprints (plano). Português não quantificado. **2 Chave:** não exigida no teste sem chave; a página oficial não confirmou. **3 Limite:** "uso razoável" (plano); nenhuma cifra oficial achada; comportamento no estouro não confirmado. **4 Reuso:** licença de metadados e resumos **não confirmada**. Regra interna: guardar só metadados e link, sem reproduzir resumo. **5 Endpoint:** `.../search?query=...&resultType=lite&format=json&pageSize=25`. Campos do lite testado: `id`, `source`, `pmid`, `doi`, `title`, `authorString`, `journalTitle`, `pubYear`, `pubType`, `isOpenAccess`, `inPMC`, `firstPublicationDate`. `pmcid` não aparece. **6 Servidor:** aceita chamada do Worker; retenção de logs não confirmada.

## 3. OpenAlex
Fontes: https://help.openalex.org/access/pricing (lido); https://help.openalex.org/api (lido); https://help.openalex.org/api/errors (lido); https://api.openalex.org/works (endpoint da documentação, não chamado).
**1 Acervo:** `meta.count` de 286.750.097 na página de exemplo, todas as áreas. Português não quantificado. **2 Chave:** a conta gratuita dá uma chave com US$ 1 de uso por dia, sem cartão. Sem chave, a página não é clara (US$ 0,10 ou US$ 0,01 por dia, conforme a fonte). Titular: a conta OpenAlex. **3 Limite:** o orçamento reinicia à meia-noite UTC. Orçamento esgotado ou mais de 100 req/s geram HTTP 429. Cabeçalho `X-RateLimit-Remaining`. Pré-pago só é consumido depois do grátis. Custo: lista e filtro US$ 0,10 por 1.000; busca US$ 1 por 1.000; entidade por ID grátis (via busca de help.openalex.org/access/example-costs). **4 Reuso:** "all data is CC0" (help.openalex.org/api). **5 Endpoint:** `GET https://api.openalex.org/works?search=...&per_page=25&api_key=...`; `per_page` vai até 100. `title` e `publication_year` (como filtro) confirmados. `ids` (pmid, doi) e `primary_location.source` não lidos (página /data/ fora desta leitura). `select` existe; sintaxe a confirmar. **6 Servidor:** aceita chamada do Worker. A chave vai na URL: o Worker não pode registrar a URL completa. Retenção não confirmada.

## 4. SciELO (ArticleMeta)
Fontes: https://articlemeta.scielo.org/api/v1/journal/?collection=scl (testado); https://scielo.readthedocs.io/projects/articlemeta/en/latest/ (lido); https://search.scielo.org/ (403).
**1 Acervo e português:** não quantificados. **2 Chave:** o endpoint de periódicos respondeu sem chave. **3 Limite, custo, reuso:** não confirmados; a documentação não cita termos. **4 Endpoint:** a v1 devolve periódicos (array JSON com `code`, `collection`, `issns` e campos codificados: `v100` título, `v150` título abreviado, `v400` ISSN). **Busca por termo: não confirmada.** As rotas de artigo e o site de busca não foram testados. **5 Servidor:** aceita chamada do Worker; logs não confirmados. **Conclusão:** fica fora da v1; entra na v2 só com busca por termo confirmada.

## 5. BVS/LILACS e DeCS
Fonte: https://bvsalud.org/ (lido).
**1 Acervo:** LILACS com mais de 1 milhão de artigos de mais de 900 títulos. Português não quantificado. **2 Chave e API:** a página lida não documenta API. **3 Limite e custo:** não confirmados. **4 Reuso:** rodapé com "Termos e Condições de Uso" (não lido) e "© Todos os direitos são reservados". Até confirmar o termo, não guardar nem exibir nada. **5 DeCS:** tesauro multilíngue (português, espanhol, inglês e francês); mapeamento para MeSH não confirmado. **6 Servidor:** não confirmado. **Conclusão:** v2, depois de confirmar API e termos.

## 6. Pendências para o dono
- Política, seção 5: incluir a Europe PMC (EMBL-EBI), que recebe só os termos gerais.
- Jurídico: confirmar o reuso de metadados da Europe PMC (página oficial bloqueada).
- Titular da chave NCBI: só se o PubMed direto entrar.
