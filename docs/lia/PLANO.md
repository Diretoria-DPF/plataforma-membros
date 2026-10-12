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

## 7. Desenho híbrido: RAG + árvore + guarda de intenção + visitante (2026-10-12)

Flags novas, **desligadas** (migração `sql/033_lia_hibrida_flag.sql`): `lia_hibrida_enabled` e `lia_visitor_ai_enabled`. Com `lia_hibrida_enabled` desligada o comportamento é exatamente o anterior.

**O que mudou.** A Lia respondia por palavra-chave antes de entender a pergunta ("O que é a Biblioteca LAIFT?" virava o passo a passo de buscar) e o visitante nunca chegava ao acervo ("O que é a LAIFT?" dava "Ainda não sei"). O desenho híbrido separa quatro funções:

1. **RAG para recall.** A busca híbrida de sempre (pgvector + trigramas, RRF), mas devolvendo 8 candidatos em vez de 4 (`TREE.CANDIDATES`).
2. **Árvore para decidir e ler.** `worker/src/assistant/tree.js` monta, dos mesmos documentos de `buildDocuments`, uma árvore de seções (id estável `fonte/slug`, resumo de uma linha). `treeSelectService.js` faz UMA chamada curta ao modelo rápido, com o resumo da árvore (candidatas primeiro, com resumo) e a pergunta como dado. A saída é JSON estrito `{"sections":[ids],"answerable":bool}` e **nunca é confiada**: ids que não existem na árvore são descartados (máximo 4); JSON quebrado, erro ou tempo esgotado (6 s) caem nos candidatos do RRF; `answerable=false` devolve a mensagem honesta de que a base não cobre. A chamada acontece **dentro da mesma unidade de cota** da pergunta, e só quando o RAG achou ao menos um candidato.
3. **Guarda de intenção.** `questionKind(message)` classifica em `definicao`, `como-fazer`, `clinico` ou `fora-de-escopo` (esta última é também o "sem sinal": quem decide é o acervo). Pergunta de definição NÃO é respondida por intenção de passo a passo; só pelas marcadas `defines: true` em `kb.js` (eventos ao vivo, aprender, ajuda, papéis, cotas, privacidade). Pergunta clínica (dose, posologia, conduta, tratamento de paciente) recebe a resposta segura que remete a profissional e à emergência, sem IA.
4. **Visitante.** Sem login (e visitante com cota 0), a resposta é **extrativa**: o melhor trecho do acervo (até 600 caracteres, cortado em fim de frase) com fonte e `url` opcional de página pública (mapa fixo e allowlist em `publicLinks.js`). Sem nada acima do piso, uma mensagem amigável com 3 a 4 temas. Com `lia_visitor_ai_enabled`, entra antes uma **prévia de IA** (próximo parágrafo).

**Prévia de IA do visitante.** Só Workers AI (`env.AI`, modelo `LIA_VISITOR_MODEL`, padrão `@cf/google/gemma-4-26b-a4b-it`): o código do visitante não importa Groq nem orquestrador (um teste confere), para nunca reduzir a cota dos membros. Turno único, até 300 tokens, temperatura 0,2, mesmo prompt de RAG do membro, 3 melhores trechos do RRF (sem a chamada de árvore, para poupar neurons). Degraus, na ordem em que são avaliados: flag ligada -> acerto no cache compartilhado (`cache:liav:{versão do acervo}:{sha256 da pergunta}`, 7 dias, serve SEM token e sem custo) -> limite de 5 tentativas por dia por IP (rate limit do Neon, bucket `LIA_VISITOR_AI_IP`, chave = hash do IP + sal; NÃO usa o KV) -> verificação do Turnstile -> teto de neurons (`LIA_VISITOR_NEURON_CAP`, padrão 3.000/dia; e total do dia abaixo de 8.500, reserva para resumos e embeddings) -> chamada. Qualquer falha ou ausência em qualquer ponto cai no trecho extrativo, com convite para criar conta (`cta`); o visitante nunca vê erro técnico. A resposta de prévia vem com `preview: true`. Sem KV (staging) não há prévia.

**Livro-caixa de neurons** (`neuronLedger.js`): UMA chave por dia UTC no KV `HOT_CACHE` (`neurons:AAAA-MM-DD`, valor JSON `{total, visitor}`), aproximada e sem atomicidade. Estimado do campo `usage` das respostas do Workers AI (gemma-4-26b: 9.091 neurons por milhão de tokens de entrada e 27.273 por milhão de saída). **Gravação em lote**: o isolate acumula em memória e só grava quando o pendente chega a 5 neurons ou passou 60 s desde a última gravação; a leitura do teto usa um cache em memória de 30 s e soma o pendente. Registram nele os resumos da Biblioteca (`summaryProvider.js`) e a prévia. Os embeddings do RAG NÃO registram (custo de ~0,03 neuron por consulta).

**Orçamento de gravações no KV (o plano gratuito aceita só 1.000 por dia, e o `HOT_CACHE` já é usado por eventos, organograma, sync de mensagens por usuário, séries da Home e cooldown das chaves de IA).** O que esta mudança acrescenta, no pior caso do dia:
- consulta de RAG, embedding, resposta extrativa e limite por IP: **0** gravações (o limite por IP está no Neon);
- livro-caixa: 1 gravação por registro que passe do debounce. Cada prévia custa ~20 neurons, então o teto de 3.000 neurons/dia limita a ~150 prévias, logo **até ~150 gravações**; os resumos da Biblioteca (ação de admin, poucas por dia) somam algumas dezenas no máximo;
- cache compartilhado do visitante: 1 gravação por resposta NOVA de IA com fontes e não degradada, no máximo uma por prévia: **até ~150**; acerto de cache não grava nada;
- total acrescentado: **no máximo ~300 por dia, tipicamente bem menos (a prévia nasce desligada, e acerto de cache e extrativo não gravam)**.
O consumo que o KV já tem hoje NÃO foi medido aqui: antes de ligar `lia_visitor_ai_enabled`, confira o uso de gravações no painel da Cloudflare (Workers > KV) e deixe folga. Se faltar, baixe `LIA_VISITOR_NEURON_CAP` (reduz prévias, ledger e cache juntos) ou desligue a flag.

**Turnstile.** `turnstileService.js` valida o token no servidor (`siteverify`; ação `lia_preview`; `hostname` em `TURNSTILE_HOSTNAMES`; timeout de 10 s; qualquer falha é `false`; nunca lança nem registra token, segredo ou IP). O front (`assistant-turnstile.js`) só carrega o widget para visitante com a flag pública ligada, em modo `interaction-only`, e reinicia o token depois de cada envio (uso único). A chave do site é pública e vai no front; o segredo é só o secret `TURNSTILE_SECRET` do Worker. A CSP de `index.html` abre `https://challenges.cloudflare.com` em `script-src`, `frame-src` e `connect-src`, e em nada mais.

**PageIndex.** O índice em árvore navegado por raciocínio, planejado e nunca feito, agora existe como `tree.js` + `treeSelectService.js`. A checklist da AUDITORIA (arquivo FORA do repositório, só citado aqui) ainda o dá como pendente: a divergência é essa, e é a checklist que está defasada.

**Ordem de ativação (cada passo é do dono; nada disto foi feito pelo código):**
1. `cd worker && npx wrangler secret put TURNSTILE_SECRET` (cole o segredo do widget; ele nunca entra em arquivo, teste ou log).
2. Conferir `TURNSTILE_HOSTNAMES` em `worker/wrangler.toml` (produção `laift.com.br,www.laift.com.br`; staging `staging.laift.com.br`; localhost nunca vale).
3. No staging (migração 033 aplicada, acervo reindexado, `rag_enabled` ligada): `cd worker && node scripts/avaliar-lia.mjs` como visitante e, com `LIA_SESSION_TOKEN` de um membro, de novo; conferir o CSV (revisor humano nas colunas finais) e o resumo (taxa de "não sei", de erro de intenção e de resposta com fonte). A qualidade com embeddings reais só se mede aqui.
4. Ligar `lia_hibrida_enabled` (staging, depois produção).
5. Ligar `lia_visitor_ai_enabled` (exige o passo 1 e o KV; observe o livro-caixa). Para desligar a prévia, desligue a flag; para limitar o gasto sem mexer no código, ajuste `LIA_VISITOR_NEURON_CAP` nas variáveis do Worker.

**Riscos conhecidos.** A guarda é por regra de texto: pergunta de definição com palavra-chave de uma intenção marcada `defines` ainda cai nela. A árvore só refina quando o RAG achou candidatos; o recall de pergunta sem candidato continua dependendo dos pisos. O golden set (`worker/test/fixtures/lia-golden.json`, 89 perguntas) mede o classificador e a integração com RAG e IA simulados, não a qualidade das respostas.

