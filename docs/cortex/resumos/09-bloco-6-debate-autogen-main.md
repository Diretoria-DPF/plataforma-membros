# 09 — Bloco 6: Debate (AutoGen) + Main (CLI)

Fonte: `Plano 3.0 — BLOCO 6 Debate (AutoGen) + Main.md` (1323 linhas).

**Propósito**
Fechar o backend executável: agentes Crítico e de Consenso (AutoGen) refinam o conteúdo quando a verificação detecta problemas; a CLI `cortex` (Typer) orquestra a execução.

**Módulos/arquivos propostos**
- `src/debate/`: `critical_agent.py` (só aponta problemas), `consensus_agent.py` (gera "VERSÃO REVISADA:"), `orchestrator.py` (`run_debate`, `DebateResult`, extração por regex), `__init__.py`.
- `src/main.py`: comandos `run`, `validate`, `stats`, `cache`, `version`; salva .md e .json.
- `scripts/run_cortex.py`, `scripts/setup.sh`, `.pre-commit-config.yaml` (ruff 0.7.2, mypy 1.13.0).

**Como roda**
- Processo: comando `cortex` (`src.main:app`), `python -m src.main run "..."`, ou `run_cortex` como biblioteca.
- Debate: GroupChat de 2 agentes em round-robin, `max_round = 2 × max_rounds` (default 5); para em "APROVADO" ou no limite.
- Sem API HTTP, fila ou Docker neste bloco. Hospedagem não definida (local).
- Saída da CLI: 1 para público inválido ou erro; 2 quando não há sucesso.

**Testes e documentação previstos**
- Nenhum teste aqui (ficam no Bloco 7). Documentação citada: README e `futuros.md`.

**APIs, serviços externos e custos**
- Groq (modelo de raciocínio padrão `llama-3.3-70b-versatile`) e pyautogen.
- `cortex validate` chama PubMed, SciELO e CrossRef reais (consome cota).
- Custos: sem preços neste bloco; dependem do pool (Bloco 3, não incluso). Não verificado.

**Dependências e infraestrutura**
- Python >=3.11,<3.13; typer, rich, structlog, pydantic, pyautogen, groq, diskcache.
- Local: `logs/cortex.log`, `outputs/`, `.cache/cortex`. Sem banco.

**Pontos frágeis**
- Aprovação por substring: `"APROVADO" in msg.upper()` aceita "não aprovado"; a flag nunca volta a False.
- `min_rounds` está na assinatura e na docstring, mas não é usado.
- `tokens_used` vem do total do pool inteiro, não do debate.
- Crítico e Consenso usam o mesmo modelo: independência do verificador não garantida.
- Texto revisado ausente ou com menos de 50% do original: volta o original em silêncio (só log).
- API usada (`AssistantAgent`, `GroupChat`, `a_initiate_chat`) versus `pyautogen>=0.4.0,<0.5.0`: não verificado.
- `--thread-id` para retomar não funciona entre processos com checkpointer em memória (dev).
- `cache info` mostra `.cache/cortex` fixo; `cache clear` sem prefixo apaga tudo.
- `main.py` importa `run_cortex` no fim do arquivo: sinal de possível import circular.
- LGPD: `request[:100]`, rascunhos e logs vão a Groq e ao disco; retenção não tratada.

**Decisões abertas**
- Critério de aprovação estruturado e uso de `min_rounds`.
- Fallback silencioso vira erro ou aviso no `DebateResult`?
- Checkpointer persistente (Sqlite ou Postgres) para retomada.
- Modelos diferentes para Crítico e Consenso?
- Limite de tokens ou custo por debate.
