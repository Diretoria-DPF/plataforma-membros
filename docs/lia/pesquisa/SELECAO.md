# L01: Seleção de trechos (reranker) e o "jev"

Acesso em 2026-10-09. Mesma legenda de `BASES.md`. Blogs e agregadores aparecem como "via busca".

## 1. Jev (TypeSafe AI)
Fonte: https://docs.typesafe.ai/introduction/quickstart (lido); https://console.typesafe.ai (citado pela documentação, não lido).
- **Confirmado na documentação:** `POST https://api.typesafe.ai/v1/systemone`, com `Authorization: Bearer <chave>`. O corpo tem `state` (o texto), `model` (`jev-latest` no exemplo) e `questions`, com tipos `choice`, `score` e `noul` (`instructions` e `criteria`). A resposta tem `model` (ex.: `jev-1.13.0`), `answers` (`choice` e `score` com `probabilities` e `confidence`; `noul`) e `usage`.
- **Não confirmado:** "answerability" e sinal de injeção (a página não cita; o `noul`, pergunta binária de 0 a 1, pode servir de answerability, a testar). Limite de contexto (32 mil tokens é só via busca). Preço: US$ 0,042 por milhão de tokens de entrada e saída grátis, via busca; uma fonte diz US$ 0,04.
- **Retenção e treino (via busca):** não treina com dados do cliente; retenção "pelo tempo necessário"; DPA com aviso de incidente em 72 h. Região: hospedagem nos EUA, com cláusulas padrão da UE (via busca). Termos para saúde e educação: nada encontrado.
- **Acesso:** as fontes divergem. Uma diz lista de espera (a última datada é de 30/09/2026); outra, sem lista. OpenRouter lista `typesafe/jev-latest` sem lista de espera, em beta (via busca). A Vercel AI Gateway também oferece o Jev (https://vercel.com/changelog/ai-gateway-now-supports-typesafe-clients-and-http-api-for-jev, só o título lido).
- Lançamento: 15/09/2026 (https://www.mindstudio.ai/blog/jev-reranker-rag/, via busca). Os 193× de velocidade e 444× de custo são do fornecedor.
- **Operador novo:** a pergunta sairia do Worker para a TypeSafe (EUA) ou para o OpenRouter. Precisa de OK do dono e da Política, seção 5. Antes do envio, a pergunta passa pelo `isCacheable`.
- **Pergunta ao dono "O 'jev' é o Jev da TypeSafe AI?":** a documentação confirma o produto com esse nome, para decisões e rerank. Um "sim" resolve a identidade, não o preço nem a retenção.

## 2. Rerankers na Workers AI
Fontes: https://developers.cloudflare.com/workers-ai/models/ (lido); https://developers.cloudflare.com/workers-ai/platform/pricing/ (lido); https://huggingface.co/BAAI/bge-reranker-base (lido).
- **Catálogo:** só um reranker, `@cf/baai/bge-reranker-base` (categoria "Text Classification"). Não há reranker multilíngue listado. O `bge-reranker-v2-m3` não aparece na Workers AI (busca); está em hospedagens de terceiros (DigitalOcean, Novita, Berget), o que é um operador novo.
- **Idiomas:** a página do modelo não cita português. O model card diz "Chinese and English" e a licença é MIT. **Português não confirmado.**
- **Entrada:** `env.AI.run('@cf/baai/bge-reranker-base', { query, contexts: [{ text }, ...] })`; `top_k` é opcional. A resposta referencia o índice de `contexts`, então a ordem do array importa. O schema da saída não foi lido.
- **Escala:** o score não tem limite; o model card usa `.logits`. A documentação da Cloudflare diz que dá para mapear para [0,1] com sigmoid. Na prática, comparar `sigmoid(score)` com o limiar.
- **Custo:** US$ 0,00311 por milhão de tokens de entrada, equivale a 283 neurônios por milhão (página de preview; confirmar). Franquia grátis: 10.000 neurônios por dia, o que dá cerca de 35 milhões de tokens de entrada por dia. Excedente: US$ 0,011 por 1.000 neurônios.

## 3. Ideias de apoio
- **G-Eval** (https://arxiv.org/abs/2303.16634, lido): "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment"; LLM como juiz com raciocínio em cadeia. Para a Lia, serve como juiz offline no golden set. Como exige uma chamada extra de LLM, não serve para o corte em tempo real.
- **JEPA e GEPA:** o JEPA (Meta) é de representação de visão e vídeo, fora de busca em texto (plano; não lido aqui). O GEPA (https://arxiv.org/abs/2507.19457, via busca) é um otimizador de prompt reflexivo, em Python (`dspy.GEPA`, pacote `gepa`). Fica fora do stack do Worker, em JS; só offline e se o dono aceitar Python.
- **EmbeddingGemma** (https://ai.google.dev/gemma/docs/embeddinggemma, via busca): cerca de 308 M de parâmetros, multilíngue (mais de 100 idiomas), contexto de 2K. Não confirmado na Workers AI. Trocar o embedding exige reindexar; se a dimensão mudar, exige migração.

## 4. Recomendação
- **Provedor inicial de L05: `@cf/baai/bge-reranker-base`.** Mesmo operador do embedding (`@cf/baai/bge-m3`, `docs/backlog-futuro.md:46`), custo desprezível, sem terceiro novo. Condição: o português não está documentado, então a calibração no staging precisa mostrar recall em PT. Se falhar, o plano B é o limiar sobre o cosseno do bge-m3 que já existe, sem reranker novo. Por isso o limiar é a peça crítica (O21, O36).
- **Calibração do limiar (só no staging, com `rag_rerank_enabled` desligada):**
  1. `worker/test/fixtures/rag-eval.json` tem 26 casos (`pergunta`, `secao`) e nenhum caso negativo. Antes, L06 precisa acrescentar de 10 a 15 perguntas sem resposta na base.
  2. Para cada caso, calcular `sigmoid(score)` dos candidatos e registrar o maior score e se a `secao` esperada está no top-4.
  3. Varrer o limiar em passos de 0,05 e escolher o menor valor em que nenhum negativo passa e o recall@4 não cai abaixo do piso atual (13 de 24, só com trigramas, segundo o plano). Precisão vem antes do recall.
  4. Gravar o limiar e a data neste arquivo. Não ativar a flag sem o OK do dono (O36).
- **Jev:** o adaptador é a ficha J2, depois do OK (dono, Política e operador novo).

## Fontes secundárias (via busca, acesso 2026-10-09)
- https://www.mindstudio.ai/blog/jev-reranker-rag/
- https://levelup.gitconnected.com/when-the-reranker-becomes-the-decision-layer-de7309e5efd7
- https://www.llmreference.com/provider/typesafe-ai/jev
- https://opentweet.io/jev/api-access
