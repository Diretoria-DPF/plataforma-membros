# 10 — Bloco 7: Testes e Documentação

Fonte: `Plano 3.0 — BLOCO 7 Testes e Documentação.md` (2244 linhas).

**Propósito**
Fechar o backend com qualidade de produção: testes (pytest), docs de arquitetura e deploy, script de validação e guia de deploy (local, Cloudflare Workers, backend Python em Container ou VPS, GitHub Actions).

**Módulos/arquivos propostos**
- `tests/`: `conftest.py`, `test_pubmed.py`, `test_scielo.py`, `test_crossref.py` (respx), `test_groq_pool.py`, `test_cache.py`, `test_state.py`, `test_graph.py` (APIs e LLMs mockados).
- `pytest.ini`, `docs/architecture.md`, `docs/deployment.md`, `scripts/validate_setup.py` (`--online` testa APIs reais).
- Trechos de deploy no guia (não gerados): `worker/` (proxy), `Dockerfile`, `src/api.py` ("a ser implementado na Fase 2"), unit systemd, `.github/workflows/ci.yml`.

**Como roda**
- Testes: `pytest tests/ -v`, sem rede.
- Produção: Container (`uvicorn src.api:app`, porta 8000) ou VPS com systemd. O Worker faz `POST /api/cortex/run` com `X-API-Key` e cache KV de 3600 s.
- CI: push em main/develop e PR para main (ruff, `mypy src/`, pytest com cobertura); deploy do Worker só em main. Sem job de backend.

**Testes e documentação previstos**
- 8 arquivos de teste cobrem PubMed, SciELO, CrossRef, GroqPool, cache, state e grafo. Sem testes para debate, ANVISA, crews, CLI, rate limiter e logger. Sem `fail_under`: a regra de 80% não é imposta.
- Docs: arquitetura (fluxo, TTLs, rate limits) e deploy (passos, checklist, rollback).

**APIs, serviços externos e custos**
- NCBI (PubMed), SciELO, CrossRef, ANVISA, Groq, Cloudflare (Workers, KV, R2, Containers), GitHub Actions, Codecov. Limites citados: PubMed 3 req/s (10 com chave), SciELO 5/s, CrossRef 10/s, Groq 30/min.
- Custos "medidos em produção" (US$0,003–0,010 por artigo): não verificado, e contradizem o `futuros.md`, que ainda prevê a primeira execução do Caso A. Preços dos testes, "100k req/dia grátis", "45–90 s" e "aprovação 70%/95%": sem fonte.

**Dependências e infraestrutura**
- Python 3.11; pytest 8.3, pytest-asyncio <0.25, respx 0.21; diskcache local; Redis opcional; KV; R2 declarado. Checkpointer `MemorySaver` em dev (produção em aberto).
- Segredos: GROQ_API_KEYS, NCBI_API_KEY, LAIFT_API_KEY (Worker); CF_API_TOKEN (GitHub).

**Pontos frágeis**
- Worker sem autenticação do chamador e com CORS `*`: qualquer origem gasta cota Groq. O `[[rate_limiting]]` é só `mode = "simulate"`.
- Worker cacheia erros por 1 h (não checa status); a chave contém o texto do usuário.
- `CORTEX_BACKEND_URL` cai para `localhost:8000` em silêncio.
- `src/api.py` não existe, mas Dockerfile e systemd o usam; `/run` não valida `X-API-Key`; VPS sem TLS nem firewall descritos.
- "BACKEND 100% COMPLETO" contradiz o `futuros.md` (2026-10-04), com blocos 2 a 7 pendentes.
- ANVISA: `architecture.md` cita bulas.med.br; `.env.example` aponta consultas.anvisa.gov.br.
- `test_graph` faz patch em `src.tools.groq_pool.get_groq_pool`: só vale se `nodes.py` importar o módulo. Não verificado.
- `pytest.raises(Exception)` genérico; cooldown com tolerância de 0,04 s (risco de flaky).
- LGPD: sem seção sobre dados pessoais, retenção de logs ou transferência a Groq e Cloudflare.
- Rollback com `docker service update` (Swarm) e `git push origin main` direto.
- Alertas citados sem implementação. Limites de tempo do Worker para 45–90 s não considerados.

**Decisões abertas**
- Hospedagem: Cloudflare Containers ou VPS; autenticação e rate limit no Worker.
- Execução síncrona ou job assíncrono para 45–90 s; cache (diskcache, Redis ou KV) e TTLs.
- Cobertura mínima de 80% e testes para debate, CLI e ANVISA.
- Checkpointer de produção e monitoramento.
- `src/api.py` antes do primeiro deploy?
