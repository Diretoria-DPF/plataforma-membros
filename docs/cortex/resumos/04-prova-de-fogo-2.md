# Resumo: PROVA DE FOGO 2.0 (Análise Ampliada e Plano de Correção Estrutural)

Fonte: `C:\Users\Administrador\Desktop\cortex\PROVA DE FOGO 2.0 — Análise Ampliada e Plano de Correção Estrutural.md` (259 linhas)

**Propósito**
Segunda rodada de auditoria do Córtex. Propõe trocar APIs pagas por uma cascata de provedores gratuitos, LLM local e RAG on-device no app Flutter, e reduzir a complexidade multi-agente a um único LangGraph. Conclui que custo, latência, offline e complexidade ficam "resolvidos" no papel.

**Arquitetura e componentes**
- InferenceRouter (`src/tools/inference_router.py`): classifica complexidade e roteia em cascata NIM Tier 1, NIM Tier 2, OpenRouter, Groq e LLM local (Gemma 3 1B).
- App Flutter com 4 abas: Chat, Explorar, Praticar, Progresso.
- RAG on-device (mobile_rag_engine, HNSW + BM25) sobre base curada de 500 a 1.000 artigos, com embeddings BGE-m3 INT8.
- LLM local (flutter_local_agent_kit ou flutter_gemma); cache em SQLite/ObjectBox.
- LangGraph único com nós research, synthesis, translation, verification e finalization (~20 arquivos, antes 52).

**Serviços externos, modelos e custos citados**
- NVIDIA NIM: 9 modelos, ~360 RPM agregados, latência 0.47 a 1.76 s. Afirmação de limite "por modelo" não verificada.
- OpenRouter free: 20 RPM e 50 RPD sem créditos; 1.000 RPD com US$ 10 de crédito (citado).
- Groq: o texto diz "~6 RPM efetivos", mas o esboço de código usa rpm=30. Inconsistente.
- Citados sem verificação: Gemini API, Cloudflare Workers AI (10.000 neurons/dia), Mistral, Ollama Cloud (1M tokens), Bytez (100 créditos/mês).
- Custo por artigo: US$ 0.00 (antes US$ 0.003 a 0.010, citado da rodada 1).

**Infraestrutura exigida**
Chaves NVIDIA, OpenRouter e Groq; Flutter para iOS e Android; ~500 MB de LLM e ~300 MB de embeddings no celular; servidor local em localhost:8080 para o fallback.

**Fontes de artigos e direitos autorais/licenças**
Não tratado. Europe PMC e medical-mcp aparecem só como sincronização opcional. A base curada de 500 a 1.000 artigos não indica origem, licença nem direito de redistribuição. LGPD não é citada.

**Riscos e contradições**
- Premissa central (limite por modelo) e os números de RPM não têm fonte. "Custo zero para qualquer volume realista" é afirmação forte.
- Latência Tier 1 de 0.47 a 1.59 s não garante "primeiro token <1 s"; o texto mistura latência total e primeiro token.
- Esboço de código incompleto (`_get_cascade`, `RateLimitError`, `AllProvidersExhausted` não definidos).
- 45+ tokens/s, "<1 ms" de busca e "-60% de complexidade" são números de terceiros ou estimativas, não verificados.
- Offline é "parcial", mas o veredito o trata como resolvido; o Plano 4.0 depende de Neon e 9Drive online.
- Dados de estudantes iriam a provedores terceiros na cascata; privacidade não é discutida.
- Conteúdo de interações medicamentosas (ex.: cafeína + ciclobenzaprina) sem menção a revisão farmacêutica ou clínica.
- "Escala para 1.000 alunos" marcada como resolvida, sem cálculo de uso diário.

**Decisões abertas**
1. O projeto aceita depender de tiers gratuitos com termos mutáveis? Qual é o plano pago de contingência?
2. Dados dos alunos podem ser enviados a NVIDIA, OpenRouter e Groq? Há consentimento e análise LGPD?
3. Offline é requisito obrigatório ou desejável? Aceita 500 MB de LLM no celular?
4. Quem valida o conteúdo de interações medicamentosas?
5. Quem cura os 500 a 1.000 artigos, de quais fontes e com qual licença?
6. Aprova a remoção de CrewAI e AutoGen em favor do LangGraph?
7. Como casa este cronograma de 8 semanas com o do Plano 4.0?
