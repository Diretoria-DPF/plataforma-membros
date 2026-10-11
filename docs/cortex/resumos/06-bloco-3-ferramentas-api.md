# Resumo: Plano 3.0 — BLOCO 3 (Ferramentas de API)

Fonte: `C:\Users\Administrador\Desktop\cortex\Plano 3.0 — BLOCO 3 Ferramentas de API.md` (1708 linhas).

**Propósito**
Implementar, como módulos independentes e assíncronos, as integrações com serviços externos do LAIFT-Córtex: busca de artigos (PubMed, SciELO), bulas (ANVISA), validação de DOI (CrossRef) e acesso ao LLM via pool de chaves Groq.

**Módulos/arquivos propostos**
- `src/tools/__init__.py`: reexporta classes e singletons `get_*_tool()`.
- `src/tools/pubmed.py`: `PubMedTool` (ESearch + EFetch, XML convertido para `Article`).
- `src/tools/scielo.py`: `SciELOTool` (ArticleMeta API, coleção padrão `scl`).
- `src/tools/groq_pool.py`: `GroqPool` (round-robin de chaves, cooldown de 60 s em rate limit, `chat_completion`, `get_llm` para LangChain, `get_autogen_config`, `get_stats`).
- `src/tools/anvisa.py`: `AnvisaTool` (busca de bula e extração de seções por regex sobre HTML).
- `src/tools/crossref.py`: `CrossRefTool` (`validate_doi`, `get_metadata`, `verify_citation`).

**APIs e serviços externos**
- NCBI E-utilities (PubMed): ESearch/EFetch. Limite citado no código: 3 req/s sem API key, 10 req/s com key. Exige identificação (tool e email). Custo: não citado.
- SciELO ArticleMeta API (`articlemeta.scielo.org/api/v1/article/`): artigos da América Latina. Formato de resposta assumido, não verificado. Limite: não citado.
- Groq API (`api.groq.com`): LLM para geração de queries, síntese e (via CrewAI) agentes. Preços em `PRICING` são marcados como "aproximados" e não verificados. Modelos citados: llama-3.3-70b-versatile, llama-3.1-8b-instant, qwen-3-32b, llama-4-maverick (disponibilidade não verificada).
- ANVISA (`consultas.anvisa.gov.br/api`): declarada em `BASE_URL`, mas não usada no fluxo. Fonte efetiva é `bulas.med.br`, site de terceiro (não verificado: termos de uso, estabilidade, endpoint `/pesquisa`).
- CrossRef (`api.crossref.org/works/{doi}`): validação e metadados de DOI; identificação por `mailto`. Limite: não citado.

**Dependências e infraestrutura**
- Python com `httpx`, `tenacity`, `xmltodict`, `groq` (AsyncGroq), `beautifulsoup4` com parser `lxml`; `langchain-groq` opcional (só em `get_llm`).
- Módulos de bloco anterior não incluídos aqui: `src.models.article`, `src.utils.cache` (CacheManager, `get_or_set` com TTL e prefixo), `src.utils.logger`, `src.utils.rate_limiter` (limiters PubMed com/sem key, SciELO, CrossRef).
- Variáveis de ambiente: `NCBI_API_KEY`, `NCBI_EMAIL`, `NCBI_TOOL_NAME`, `SCIELO_COLLECTION`, `CROSSREF_MAILTO`, `GROQ_API_KEYS` (obrigatória), `GROQ_DEFAULT_MODEL`, `GROQ_FAST_MODEL`, `GROQ_REASONING_MODEL`, `GROQ_MAX_RETRIES`, `GROQ_TIMEOUT_SECONDS`.
- Cache: TTL de 1 dia (PubMed/SciELO), 7 dias (ANVISA), 30 dias (CrossRef). Backend do cache não está neste bloco.
- Sem banco nem fila neste bloco.

**Pontos frágeis**
- `AnvisaTool._fetch_bulas_med` tem `@retry`, mas captura todas as exceções e retorna `None`, então o retry nunca dispara.
- `GroqPool.chat_completion` tem `@retry(retry_if_exception_type(Exception))` sobre um loop interno de 3 tentativas: até 9 chamadas por requisição, e a retentativa também reexecuta `GroqPoolError`.
- Logs gravam prefixo de 12 caracteres da chave (`key[:12]`). Vazamento parcial de segredo.
- Detecção de rate limit por substring ("429", "rate limit") na mensagem de erro.
- `get_llm` e `get_autogen_config` usam sempre `keys[0]`, fora do round-robin.
- `CrossRefTool._fetch_work` concatena o DOI no path sem encoding.
- SciELO: formatos (lista ou dict com `objects`/`result`, `title` por idioma) assumidos sem verificação contra a API real.
- Email padrão `contato@laift.com.br` usado como identificador em NCBI e CrossRef: precisa confirmação.
- Texto declara "íntegros, em nível de produção" sem testes neste bloco (testes ficam no Bloco 7).

**Decisões abertas**
- Usar `bulas.med.br` (scraping) ou a API oficial da ANVISA, e com qual termo de uso.
- Corrigir o empilhamento de retries do GroqPool e o retry morto da ANVISA.
- Mascarar ou remover o prefixo de chave nos logs.
- Obrigar `get_llm`/`get_autogen_config` a usar o pool ou aceitar chave única.
- Confirmar modelos Groq e tabela de preços antes de usar em estimativa de custo.
- Definir backend do cache e valores reais dos rate limiters.

**Frase central:** o bloco entrega seis módulos de integração assíncronos, mas depende de APIs e formatos de resposta não verificados e tem dois erros de retry que tornam o comportamento de falha diferente do descrito.
