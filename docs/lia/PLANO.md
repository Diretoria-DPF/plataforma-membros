# Lia: base de conhecimento, registro de pesquisas, pesquisa externa e seleção (plano, 2026-10-09)

Orquestrador Opus 5.5, branch `feat/lia-conhecimento` (a partir da `main`, que já tem o blog). As fichas estão em `docs/lia/fichas/` e a ordem em `ORDEM.md`. Arquivos lidos: `worker/src/assistant/*`, `services/{rag,assistant,assistantFeedback}Service.js`, `ai/semanticCache.js`, `ai/orchestrator.js`, `maintenance.js`, `featureFlagService.js`, `sql/018–024`, `test/ragEval.test.js`, `frontend/assistant*.js`, `hero.js`, `e2e/visual-qa.e2e.js` e os documentos citados abaixo.

## 0. Urgente e sem código (sessão principal)
- A tabela `kb_chunks` está vazia com `rag_enabled` ligada. Por isso, toda pergunta aberta de membro com cota recebe "Não encontrei essa informação na base…" (`assistantService.js:268-271`): **hoje a Lia está degradada nas perguntas abertas**.
- O cron das 06:17 UTC só reindexa se `isEnabled(sql, 'rag_enabled', null)` for verdadeiro. Se a flag tiver condição de papel ou `rollout_pct` < 100, a avaliação sem identidade dá **false** (`featureFlagService.js:67-73`, `maintenance.js:183-189`), e o cron nunca preenche a tabela.
- Fazer agora: (1) conferir `conditions` e `rollout_pct` de `rag_enabled`; (2) clicar em **Reindexar** no painel (`apiAdminReindexKb`) e ler `report.total`, `embedded` e `embeddingAvailable`; (3) se `embeddingAvailable` vier `false`, conferir o binding `AI` (O20).

## 1. Diagnóstico: o que já existe e o que falta
| Pedido | Já existe | Lacuna |
|---|---|---|
| (1) Mais informação em `kb_chunks` | A base sai do código: ~24 intenções públicas (`kb.js`), 1 trecho de destinos (`targets.js`) e 4 documentos em `docs.js` (guia, privacidade, convivência e Liga, com 11 seções), ≈ 36 trechos. No golden set, o recall@4 só por trigramas é 13/24 | Não há nada sobre blog e publicações, detalhes dos módulos, perguntas frequentes de uso, avisos de saúde nem processo seletivo além do básico. Inserir à mão no banco **não adianta**: `reindex` apaga tudo o que não está no código (`ragService.js:186-188`) |
| (2) Registrar pesquisas | `ai_semantic_cache` (pergunta genérica de membro, pg_trgm, guardas de sentido, validade) e `assistant_messages` (hash por pessoa, 180 dias; não serve para reaproveitar respostas) | Com `rag_enabled` ligada, o cache semântico é **pulado** (`assistantService.js:146-150`), e cada pergunta repetida gasta embedding e LLM de novo. Não há registro de pesquisa externa nem lista de temas sem resposta para orientar o conteúdo novo |
| (3) Outro sistema de pesquisa | Nada no código. A F4, item (d), prevê PubMed, com três decisões jurídicas pendentes (`F4_DECISOES_JURIDICAS.md:103-121`) | Faltam o adaptador, o registro, os limites e o texto da Política |
| (4) "jev" (escolha mais assertiva) | Fusão RRF com piso por lista. `MIN_VECTOR_SCORE` = 0,45 sem calibração (O21, O36). O reranker está adiado no backlog (`backlog-futuro.md:47`) | Falta uma camada de seleção que reordene os trechos, corte por nota calibrada e decida se dá para responder antes de chamar o LLM |
| (5) Interação | O painel já mostra as fontes em texto, a avaliação, os estados e o humor (`assistant.js:250-262`) | O rótulo da fonte aparece cru ("kb · Eventos da liga"). Não há aviso de "resposta já pesquisada", nem botão "Pesquisar mais a fundo", nem estados de pesquisa |

## 2. Opções e recomendação por pedido
**(1) Base: FAZER (L03, L06).** Criar `worker/src/assistant/docsConteudo.js` com as fontes `plataforma`, `modulos`, `publicacoes`, `processo`, `faq` e `saude` (25 a 40 seções). O conteúdo sai só de `frontend/blog/conteudo/*.json`, de `docs/blog/FATOS_VERIFICADOS_2026-10-09.md` e da Política, e o golden set é ampliado. Custo desprezível: alguns milhares de tokens de embedding por reindexação, dentro dos 10 mil neurônios grátis por dia. Risco: falso positivo nas perguntas negativas, que o teste barra. LGPD: nenhum nome de pessoa e nenhum contato além do oficial. Gerar a base a partir do JSON do blog no build fica adiado, porque acopla o worker ao frontend.

**(2) Registro: FAZER (L04, L09, L10).** Opção A (recomendada): tabela única `lia_pesquisas` (migração **026**). Ela guarda dois tipos de registro:
- provedor `kb`: a resposta da Lia com as fontes. A chave é a pergunta normalizada mais a versão da base. Como a versão muda a cada alteração de conteúdo, uma resposta antiga nunca volta;
- provedores externos: só metadados.

Cada linha tem `hits`, `outcome` (`answered` ou `empty`) e validade (30 dias para `kb`, 7 para externos). Não há `profile_id`, e só entra pergunta que passa por `isCacheable`, o mesmo filtro de dado pessoal do cache semântico. As linhas com `outcome='empty'` formam a lista de lacunas para escrever conteúdo novo. Flag: `rag_cache_enabled`. Opção B: reaproveitar `ai_semantic_cache` com `feature='assistant_rag:<versão>'`, sem migração. É mais barata, mas não guarda fontes estruturadas nem resultados externos.

**(3) Pesquisa externa: FAZER atrás de flag e LIGAR só depois do OK jurídico (L01, L07).** Prévia, a confirmar em L01:

| Base | Acervo | Chave | Limite | Custo | Observação |
|---|---|---|---|---|---|
| PubMed E-utilities (NCBI) | ~38 M citações biomédicas | opcional (falta decidir o titular) | 3 req/s sem chave, 10 com | grátis | os resumos têm direitos das editoras |
| Europe PMC REST (EMBL-EBI) | PubMed/MEDLINE + PMC + preprints | não | uso razoável | grátis | `resultType=lite` traz só metadados |
| OpenAlex | > 250 M obras, todas as áreas | sim (grátis) | US$ 1/dia de uso grátis desde fev/2026 | por uso | dados CC0 |
| SciELO e BVS/LILACS + DeCS | literatura ibero-americana, em PT | varia | a confirmar | grátis | o DeCS traduz termos de PT para MeSH |

Recomendação:
- **v1 com Europe PMC**: cobre o PubMed sem chave, e assim a decisão sobre o titular da chave deixa de ser necessária.
- A chamada sai **do Worker** e leva só termos gerais: no máximo 8, sem dado pessoal.
- Guardar e exibir só metadados e link, nunca o resumo.
- PubMed direto quando houver chave institucional. SciELO e DeCS na v2, porque pergunta em português rende pouco numa base em inglês.
- Flag `research_enabled`. Não há action nova: o pedido vai por `apiAssistantChat` com `research: true`, o que não mexe em `handlers.js`, no OpenAPI nem no `mfaGate`.

**(4) Seleção ("jev"): FAZER a camada neutra (L05); o provedor Jev só entra com OK do dono.** O `rerankService` reordena os 8 candidatos da fusão, dá uma nota a cada trecho e devolve `answerable`. Se nenhum trecho passar do limiar, a Lia responde que a informação não está na base, sem gastar LLM. O primeiro provedor é a Workers AI, o mesmo operador do embedding, sem terceiro novo. L01 escolhe o modelo: o `bge-reranker-base` foi treinado em inglês e chinês, então é preciso conferir se há opção multilíngue. O limiar só pode ser calibrado no staging, com o golden set (mesma regra do O36), e por isso a flag `rag_rerank_enabled` nasce desligada. O Jev entra depois como segundo provedor desta camada (ver §3).

**(5) Interação: FAZER (L08).**
- Rótulos de fonte legíveis.
- Aviso "resposta já pesquisada, sem gastar IA".
- Botão "Pesquisar mais a fundo" quando o servidor mandar `canResearch`.
- Estados de pesquisa: em andamento, vazio, falha e limite atingido.
- Aviso de privacidade antes da primeira pesquisa externa.
- Links só https, de domínios da lista branca.

## 3. "jev": candidatos e evidências
1. **Jev, da TypeSafe AI (o mais provável).** Modelo "sem texto", lançado em setembro de 2026, para decisões calibradas.
   - Recebe a pergunta e os trechos num único pedido e devolve uma probabilidade para cada trecho, se dá para responder e um sinal de injeção.
   - É usado como reranker em RAG; um relato mostra top-1 de 21% para 54% sobre BM25.
   - Custa ~US$ 0,042 por milhão de tokens de entrada, com saída grátis. Contexto de 32 mil tokens. Está em acesso antecipado, com lista de espera, e também é servido por OpenRouter e Vercel AI Gateway.
   - Para a Lia: limiar calibrado (resolve O21 e O36), corte "não está na base" antes do LLM e roteamento de fontes (base → registro → Europe PMC). LGPD: a pergunta sai para um operador novo, nos EUA.
   - Fontes, todas secundárias (nenhuma página oficial lida): mindstudio.ai/blog/jev-reranker-rag; hindsight.vectorize.io/blog/2026/09/24/adding-jev-reranker-what-we-learned; fourweekmba.com/ai-typesafe-jev-444x-cheaper-193x-faster-claim; llmreference.com/model/jev/typesafe-ai.
2. **G-Eval ("ji-eval")**: LLM como juiz, que escolhe a resposta ou a fonte por nota. Encaixa no item "avaliação contínua" do backlog, ao custo de uma segunda chamada de LLM.
3. **JEPA e GEPA (pronúncia "jépa")**: o JEPA (Meta; o V-JEPA trata de visão) não se aplica a busca em texto. O GEPA (otimizador de prompt do DSPy) exigiria Python, fora do stack.
4. **Gemini e EmbeddingGemma ("jêmini")**: troca do modelo de embedding, que exige reindexar e, se a dimensão mudar, nova migração.

**PERGUNTAR AO DONO:** "O 'jev' é o Jev da TypeSafe AI?" (mostrar o link 1). Nada fica parado por isso: L05 entrega a camada de seleção, e o adaptador do Jev será uma ficha futura (J2), depois do OK.

## 4. Ordem de ativação
Ondas e fichas: `docs/lia/fichas/ORDEM.md`. Ordem: código → migração 026 → reindexação → flags, uma de cada vez: `rag_cache_enabled`; `rag_rerank_enabled` depois da calibração no staging; `research_enabled` depois do OK jurídico e da Política atualizada.

## 5. Precisa do OK do dono
- **Migração 026** (`lia_pesquisas`), aplicada pela sessão principal. Numeração: a 025 é o rascunho da F4 (`feat/v5-f4-acervo`), mas o `TIME_CONTRATO.md` (Rodada 3) diz que a F4 passa para a 026. Proposta: Lia = 026 e F4 = 025 (ou 027); corrigir o contrato.
- **Flags novas**, todas desligadas: `rag_cache_enabled`, `rag_rerank_enabled` e `research_enabled`.
- **Jurídico**:
  - Política, seção 5 (terceiros): incluir a Europe PMC (EMBL-EBI, que recebe só os termos) e, se aprovado, TypeSafe e OpenRouter;
  - Termos: cláusula de conteúdo de terceiros (minuta da F4, item d);
  - prazos de retenção do registro (30 e 7 dias);
  - não reproduzir resumos.
- **Jev**: confirmar o nome, aceitar o operador novo, entrar na lista de espera, e o dono digita a chave como segredo do Worker.
- **Custos**: Workers AI dentro da cota grátis (L01 confirma); OpenAlex só se for adotado.

## 6. Riscos e adiamentos
- O teste do golden set só mede trigramas (o PGlite não tem pgvector). A calibração híbrida e a do reranker exigem o staging (O36).
- Termos em português rendem pouco na Europe PMC. Na v2, traduzir pelo DeCS.
- O registro de respostas só vale para **membro** sem histórico: a resposta de admin depende do papel, como no cache semântico.
- Abuso da pesquisa externa: limite por pessoa (10 por hora), além do teto do chat (60 por hora).
- Adiados: painel de lacunas no admin (lê `lia_pesquisas` com `outcome='empty'`), adaptador do Jev (J2), PubMed direto, SciELO e DeCS, e a avaliação contínua (G-Eval/RAGAS).
