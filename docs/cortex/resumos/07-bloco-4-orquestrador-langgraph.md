# Resumo: Plano 3.0 — BLOCO 4 (Orquestrador LangGraph)

Fonte: `C:\Users\Administrador\Desktop\cortex\Plano 3.0 — BLOCO 4 Orquestrador (LangGraph).md` (1394 linhas).

**Propósito**
Implementar o cérebro do Córtex: um `StateGraph` do LangGraph que encadeia pesquisa, síntese, tradução, verificação, debate e finalização, com roteamento condicional entre as etapas e um estado tipado único.

**Módulos/arquivos propostos**
- `src/orchestrator/__init__.py`: exporta `CortexState`, `create_initial_state`, `build_graph`, `run_cortex`, `run_cortex_stream`.
- `src/orchestrator/state.py`: `CortexState` (TypedDict, total=False), `create_initial_state`, helpers `record_error`, `record_warning`, `add_tokens`, redutor `_merge_dicts` para `token_usage`.
- `src/orchestrator/nodes.py`: nós `research`, `synthesis`, `translation`, `verification`, `debate`, `finalization`, `error`, mais helpers de queries, substâncias e filtragem.
- `src/orchestrator/router.py`: `route_after_research/synthesis/translation/verification/debate`, `route_error_or_continue`, `should_stop`.
- `src/orchestrator/graph.py`: `build_graph` (nós, arestas, `MemorySaver`), `run_cortex`, `run_cortex_stream`, `_state_to_result`.

**APIs e serviços externos**
- Nenhuma API externa direta. Os nós chamam as ferramentas do Bloco 3 (PubMed, SciELO, ANVISA, CrossRef, Groq) e as crews do Bloco 5 (CrewAI).
- Dependência de `src.debate.orchestrator.run_debate` (AutoGen), que ainda não existe (Bloco 6).

**Dependências e infraestrutura**
- `langgraph` (`StateGraph`, `START`, `END`, `add_messages`, `langgraph.checkpoint.memory.MemorySaver`): versão não declarada, não verificada.
- `langchain_core.messages.BaseMessage`.
- Estado de execução em memória (`MemorySaver`), sem banco nem fila.
- Variáveis de ambiente: `CORTEX_CONFIDENCE_THRESHOLD` (padrão 0.85), `CORTEX_MAX_DEBATE_ROUNDS` (padrão 5).
- Limite de recursão `recursion_limit: 50` por execução. `max_iterations` padrão 3.
- Modelos de domínio (`CortexRequest`, `VerificationReport`, `ContentDraft`, `ContentFinal`, `CortexResult`, `AudienceLevel`) vêm do Bloco 2.

**Pontos frágeis**
- Ciclo `verification → debate → verification`: a saída do debate depende de `debate_rounds` crescer. Se `run_debate` devolver `rounds=0` com conteúdo resolvido, não há contagem e o ciclo só termina pelo limite de recursão (erro, não finalização controlada).
- `should_stop` e `max_iterations` estão definidos, mas nenhuma aresta do grafo os usa. A menção a timeout no docstring não tem implementação.
- `MemorySaver` como padrão: o estado não sobrevive a reinício, e `thread_id` não persiste entre processos. Apesar disso, o docstring fala em "persistência".
- `build_graph()` é recompilado a cada chamada de `run_cortex` e `run_cortex_stream`.
- `human_approved` começa `False` e nenhum nó o altera. A revisão humana prometida ("pronto para revisão humana") não está modelada no grafo.
- `run_cortex_stream` emite objetos Python (`Article`, `VerificationReport`) que não são serializáveis em JSON direto. Problema para UI web.
- Contrato de `run_debate` (chaves `rounds`, `resolved_content`, `history`) não definido antes do Bloco 6.
- `datetime.utcnow()` é usado em vários pontos (observação geral: descontinuado a partir do Python 3.12).
- O plano declara o bloco "concluído" sem testes neste bloco.

**Decisões abertas**
- Qual checkpointer durável usar em produção (o plano não escolhe).
- Ligar ou remover `should_stop`, e onde aplicar o limite de iterações.
- Como e onde entra a aprovação humana no fluxo `finalization → END`.
- Comportamento quando o debate não produz rodadas (encerrar com aviso ou falhar).
- Valores definitivos de `CORTEX_CONFIDENCE_THRESHOLD` e `CORTEX_MAX_DEBATE_ROUNDS`.
- Se o `research_crew` (Bloco 5) será chamado por algum nó ou fica como uso avançado.

**Frase central:** o grafo é linear com dois ciclos controlados por contadores, mas o controle de iterações não está ligado às arestas, o estado é só em memória e a revisão humana não aparece no fluxo.
