# Resumo: Plano 3.0 — BLOCO 5 (Crews CrewAI)

Fonte: `C:\Users\Administrador\Desktop\cortex\Plano 3.0 — BLOCO 5 Crews (CrewAI).md` (1169 linhas).

**Propósito**
Implementar equipes de agentes CrewAI, em pipeline sequencial, que fazem o trabalho pesado do Córtex: traduzir o conhecimento sintetizado para o público, verificar o rascunho em camadas (fatos, alucinações, citações) e, como uso opcional, fazer análise crítica de artigos.

**Módulos/arquivos propostos**
- `src/crews/__init__.py`: exporta `run_research_crew`, `run_translation_crew`, `run_verification_crew`.
- `src/crews/_llm_helper.py`: `build_crewai_llm` cria `crewai.LLM` com modelo `groq/<modelo>` e uma chave do pool.
- `src/crews/translation_crew.py`: `run_translation_crew`. Três agentes em sequência (Tradutor, Adaptador de Tom, Formatador) e três tasks. Lê saída `TITULO:`/`CORPO:`.
- `src/crews/verification_crew.py`: `run_verification_crew`. Três agentes (Verificador de Fatos, Detector de Alucinações, Auditor de Citações). Calcula `confidence_score` e `status`.
- `src/crews/research_crew.py`: `run_research_crew`. Dois agentes (Analista de Literatura, Explorador de Lacunas). Uso opcional.

**APIs e serviços externos**
- Groq, via `crewai.LLM` com prefixo `groq/`. Modelos: `pool.reasoning_model` e `pool.fast_model` (definidos no Bloco 3). Limite e custo: não citados no bloco.
- CrewAI (biblioteca, não serviço): `Agent`, `Crew`, `Process`, `Task`, `LLM`, `kickoff_async()`. Assinaturas e versão não verificadas.

**Dependências e infraestrutura**
- `crewai` (versão não declarada). Importado de forma tardia dentro das funções, com erro `CrewLLMError`/`*CrewError` se ausente.
- `GroqPool` (Bloco 3), `ContentDraft`, `VerificationReport`, `VerificationStatus`, `AudienceLevel` (Bloco 2).
- Sem banco e sem fila. `memory=False` em todas as crews.
- Temperaturas: 0.1 na verificação, 0.3–0.5 na tradução, 0.2–0.5 na pesquisa. `max_tokens` entre 1500 e 3000 por agente.

**Pontos frágeis**
- `build_crewai_llm` escolhe a chave de menor `requests_count` sem olhar `cooldown_until` e sem incrementar o contador. Contorna o round-robin e o cooldown do `GroqPool`.
- Logs gravam prefixo de 12 caracteres da chave (`key[:12]`).
- Assinaturas do CrewAI (`LLM(model, api_key, timeout)`, `Agent(max_iter, allow_delegation)`, `Crew(memory=False)`, `Task(context=...)`, `kickoff_async()`) são assumidas e não verificadas. Se diferirem da versão instalada, as três crews falham.
- Saída do LLM é lida por regex (`TITULO:`, `CORPO:`, `TOTAL_CLAIMS:`, `SEVERITY:`). Se o formato variar, há fallback que devolve o texto inteiro como corpo.
- Fórmula de `_calculate_confidence` (peso 0.45 na cobertura, base 0.55, penalidades) é arbitrária e não calibrada. Sem verificação, rascunho com cobertura zero ainda tem 0.55.
- Fallback de `total_claims` conta sentenças longas quando o LLM não informa o total. Isso distorce a cobertura.
- Limite de ±15% de palavras é só pedido no prompt; o código só verifica tamanho mínimo de 100 caracteres.
- Entrada do usuário, conteúdo sintetizado e fontes entram nos prompts sem delimitação. Risco de injeção de instruções.
- Dados ANVISA entram no prompt de pesquisa como `str(dict)[:2000]`, sem formatação.
- `_extract_list_section` está duplicado em `verification_crew.py` e `research_crew.py`, com regex diferentes.
- `research_crew` não é chamada por nenhum nó do Bloco 4.

**Decisões abertas**
- Confirmar a versão do CrewAI e validar as assinaturas usadas antes de implementar.
- Corrigir a seleção de chave para respeitar o pool (cooldown e contador), ou passar a usar o pool diretamente.
- Calibrar a fórmula de confiança com casos reais, ou trocar por critério objetivo.
- Delimitar entradas nos prompts (proteção contra injeção).
- Manter ou remover `research_crew` do escopo.
- Estimar custo e latência de três agentes sequenciais por requisição, já que o plano não traz estimativa.

**Frase central:** são três pipelines CrewAI sequenciais que dependem de assinaturas de biblioteca não verificadas, de parsing por regex de texto livre e de uma fórmula de confiança sem calibração, além de ignorar o controle de chaves do pool.
