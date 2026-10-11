# 11 — Geração dos arquivos do backend LAIFT-Córtex

Fonte: `Plano 3.0 — Geração dos Arquivos do Backend LAIFT-Córtex.md` (1573 linhas).

**Propósito**
Registrar e planejar a geração do backend em 7 blocos. Este trecho traz o código completo do Bloco 1 (fundação) e do Bloco 2 (modelos e utilitários), a ordem dos demais blocos e o `futuros.md` como roadmap vivo.

**Módulos/arquivos propostos**
- Bloco 1: `.gitignore`, `requirements.txt` (Python >=3.11,<3.13; langgraph, crewai, pyautogen, groq, google-generativeai etc., com faixas de versão), `pyproject.toml` (`laift-cortex` 0.1.0a0; ruff, mypy strict, pytest, coverage), `.env.example`, `README.md`, `futuros.md`.
- Bloco 2: `src/__init__.py`; `src/models/` (article, translation, content; Pydantic v2); `src/utils/` (logger com structlog, cache com diskcache ou redis, rate_limiter com token bucket e limiters pré-configurados).
- Blocos 3 a 7 apenas listados (ferramentas, orquestrador, crews, debate e main, testes e docs); não estão neste trecho.

**Como roda**
- Não há processo, API nem deploy neste trecho.
- Ambiente local: `pip install -r requirements.txt` e `pip install -e ".[dev]"`, com `.env` copiado de `.env.example`.
- Hospedagem não definida. Geração feita por blocos no chat, com continuação solicitada quando o limite é atingido.

**Testes e documentação previstos**
- Nenhum teste gerado neste trecho. Pytest, ruff e mypy configurados no `pyproject.toml`.
- README e `futuros.md` ("atualize ao final de cada sessão"). Testes e docs do Bloco 7.

**APIs, serviços externos e custos**
- Citados no README e no `.env.example`: PubMed, SciELO, ANVISA, CrossRef, Groq, Google Gemini (fallback, chave vazia), NCBI, Cloudflare (KV, R2) e LAIFT (API e webhook).
- Limites no código: PubMed 3 req/s sem chave e 10 com chave; SciELO 5/s; CrossRef 10/s; Groq 30/min.
- Modelos: `llama-3.3-70b-versatile` e `llama-3.1-8b-instant`.
- Custos: nenhum preço neste trecho. Não verificado.

**Dependências e infraestrutura**
- LangGraph, LangChain, CrewAI, pyautogen, Groq SDK, google-generativeai, httpx, pydantic 2, structlog, typer, rich, diskcache, redis (opcional), pytest.
- Local: `.cache/cortex` (diskcache); logs em `logs/cortex.log`; `outputs/`.
- Cloudflare KV e R2 previstos (não implementados aqui).

**Pontos frágeis**
- `futuros.md` (2026-10-04, Sessão 1) marca blocos 2 a 7 como pendentes, mas os arquivos 09 e 10 dizem blocos 3 a 6 "concluídos" e "BACKEND 100% COMPLETO".
- Contagens inconsistentes: Bloco 2 "10 arquivos" (são 9 listados); Bloco 6 "5" depois "9"; Bloco 7 "8", "~10", "11"; total "41" e depois "52".
- Faixas de versão amplas e três frameworks de agentes juntos: conflitos de dependência não verificados.
- `CacheManager` chama diskcache (síncrono) dentro de métodos `async`: bloqueia o event loop.
- Limiters globais (`AsyncRateLimiter`) criam `asyncio.Lock` na importação: risco com múltiplos event loops (ex.: testes).
- Parâmetros de governança (`CORTEX_CONFIDENCE_THRESHOLD`, `CORTEX_MAX_DEBATE_ROUNDS`, `CORTEX_MAX_ITERATIONS`) sem validação de faixa.
- `LAIFT_API_URL` e `LAIFT_WEBHOOK_SECRET` definidos no `.env.example`, sem uso especificado; a ligação com o site LAIFT não está detalhada.
- Positivo: `.gitignore` cobre `.env`, `.dev.vars` e `outputs/`; os trechos só têm placeholders, sem chave real.
- LGPD: o README cita conformidade, mas não há mecanismo de dados pessoais neste bloco.

**Decisões abertas**
- Ordem e continuidade dos blocos 3 a 7 (o próximo é o Bloco 3, ferramentas).
- Uso do Gemini como fallback: implementado ou só previsto?
- Atualização do `futuros.md` como fonte de verdade, e a numeração de arquivos por bloco.
- Hospedagem e checkpointer (ver 10).
