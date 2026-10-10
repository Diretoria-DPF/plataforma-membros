# Resumo 01: Plano 2.0 (LAIFT-Orquestra)
Fonte: cortex\Plano 2.0 — Sistema LAIFT-Orquestra Implementação Detalhada.md (724 linhas)

## Propósito
Implementar o Córtex (LangGraph + CrewAI + AutoGen) com o Caso A: artigo de 1.200–1.500 palavras sobre cafeína + ciclobenzaprina, publicado no LAIFT só após aprovação humana. Cronograma de 4 semanas.

## Arquitetura e componentes
- Grafo LangGraph: research -> synthesis -> translation -> verification -> debate (AutoGen, se confidence < 0,85) -> END.
- Crews CrewAI: pesquisa (Pesquisador, Sumarizador), tradução, produção, verificação.
- AutoGen: agente Crítico e agente Consenso, máximo 5 rodadas.
- Tools: pubmed.py (ESearch/EFetch), scielo.py (ArticleMeta), groq_pool.py (round-robin, retry), anvisa.py, crossref.py.
- Estado: CortexState (TypedDict); futuros.md como fonte de verdade do projeto.

## Serviços externos, modelos e custos citados
- Groq (pool de chaves do LAIFT): llama-3.3-70b-versatile, llama-3.1-8b-instant, Qwen3 32B, Llama 4 Maverick.
- Limites Groq (plano gratuito): 30 RPM, 14.400 RPD, 500.000 TPD. Não verificado.
- NCBI PubMed: 3 req/s sem chave, 10 req/s com chave. Não verificado.
- Fallback: Google Gemini free tier (sem números). Outras fontes: SciELO, ANVISA (bulas.med.br), Drugs.com, FDA FAERS, CrossRef, Whisper (Groq).
- Cloudflare Workers/Pages, R2 e KV (cache).
- Custo: nenhum valor por artigo estimado; meta do próprio plano: até $0.50 por artigo.

## Infraestrutura exigida
- Python 3.11+, venv, requirements (langgraph, langchain-groq, crewai, pyautogen, httpx, pydantic).
- GitHub + GitHub Actions (ruff, pytest, deploy); Cloudflare Workers ou servidor dedicado (a definir).
- Cache: Cloudflare KV ou Redis. Sem GPU e sem banco próprio citados.

## Riscos e contradições
- Meta de "Fontes ≥ 10 (PubMed + SciELO + ANVISA)", mas research_node só chama PubMed e SciELO.
- Trechos de código com funções não definidas (generate_queries, llm_synthesize, extract_key_findings, extract_final_content).
- confidence_score é autoavaliado pela LLM; limiar 0,85 sem método. Verificador e autor usam o mesmo modelo.
- Python pesado (crewai, pyautogen) em Cloudflare Workers não é analisado.
- synthesis_node assume chave "doi" em todos os resultados (risco de KeyError).
- Arquivo 03 afirma que AutoGen "entrou em manutenção"; este plano o mantém como dependência. Não verificado.

## Decisões abertas
- Repositório separado laift-cortex (Workers) ou subdiretório cortex/ no LAIFT?
- Python em Workers ou servidor dedicado?
- Manter AutoGen no debate ou simplificar a verificação?
- Qual o orçamento de tokens e o fallback Gemini?
- Quem é o titular da NCBI API key?
