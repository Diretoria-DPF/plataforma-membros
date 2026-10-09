# L05: Camada de seleção ("escolha mais assertiva"): rerank e decisão de "dá para responder"

**Objetivo.** Depois da fusão RRF, reordenar os candidatos com um reranker, dar uma nota a cada trecho e decidir `answerable` (há trecho bom o bastante?). Assim a Lia corta a busca antes do LLM quando a base não cobre a pergunta. A camada é **neutra de provedor**: Workers AI agora; o Jev (TypeSafe AI) depois do OK do dono (ficha futura). Só roda com `opts.rerank === true`, que L09 liga pela flag `rag_rerank_enabled`.

**Passo 0.** Leia:
- `docs/lia/pesquisa/SELECAO.md` (de L01): o modelo, o formato de entrada e saída e a escala da nota. Se o arquivo não existir, use `@cf/baai/bge-reranker-base` com entrada `{ query, contexts: [{ text }] }` e saída `{ response: [{ id, score }] }`, e marque a hipótese no relatório;
- `worker/src/services/ragService.js` (`embedTexts` com timeout, `fuse`, `retrieve`);
- `worker/test/ragService.test.js` (como a busca é simulada);
- `docs/riscos-residuais.md` (O21, O36).

**Arquivos-donos.** O par `worker/src/services/rerankService.js` + `worker/test/rerankService.test.js` (novos) e `worker/src/services/ragService.js`.

**Requisitos.**
1. `rerankService.js`:
   - constantes locais `RERANK = { MODEL, TIMEOUT_MS: 3000, TOP_K: 4, MIN_SCORE: null, ANSWERABLE_MIN: null }`. `null` quer dizer "sem calibração: não corta", e o comentário aponta para a calibração no staging com o golden set;
   - exporta `rerank(env, query, chunks, opts = {})`, que devolve `{ chunks, answerable, provider, error }`;
   - sucesso: os chunks em ordem decrescente de nota, cada um com `rerankScore`, cortados em `TOP_K` e, se `MIN_SCORE` não for null, filtrados por ela; `answerable` é falso só se `ANSWERABLE_MIN` não for null e a maior nota ficar abaixo dele;
   - **degradação**: sem binding `AI`, tempo esgotado, saída malformada ou id fora do intervalo devolvem a ordem original cortada em `TOP_K`, com `answerable: true` e `error` curto (até 200 caracteres, sem texto da pergunta);
   - `opts.provider` aceita só `'workers-ai'`; outro valor faz o mesmo que a degradação, com `error: 'provedor indisponível'`. Não escreva código do Jev.
2. `ragService.retrieve(sql, env, question, opts = {})`: com `opts.rerank === true`, funde até `C.RAG.CANDIDATES` (em vez de `TOP_K`), chama `rerank` e devolve, além do que já devolve, `reranked: boolean` e `answerable: boolean`. **Sem `opts`, o comportamento e o retorno ficam idênticos aos de hoje** (os campos novos só aparecem com `rerank`). Não mexa em `reindex`.
3. Nenhuma constante nova em `constants.js` (arquivo quente). Se for preciso, proponha o trecho no relatório.
4. Teste com `env.AI.run` simulado:
   - a nota inverte a ordem;
   - `TOP_K` corta;
   - os três tipos de degradação;
   - `MIN_SCORE` e `ANSWERABLE_MIN` com valores de teste (injete-os por `opts.minScore` e `opts.answerableMin` para não alterar a constante);
   - `retrieve` sem `opts` igual ao de hoje e com `{ rerank: true }` usando o reranker.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm test -- -i test/rerankService.test.js test/ragService.test.js test/ragEval.test.js
```

**Regras.** Sem git, sem banco, sem flag, sem segredo. Cabeçalho de copyright; LF; funções com menos de 50 linhas; imutabilidade (não ordene a lista recebida no lugar). GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: `assistantService.retrieveContext` via `Rag.retrieve`, ligado por L09; a instrução: "possibilidade de escolha mais assertiva com a tecnologia 'jev', oferecendo uma visão mais ampla para a Lia") e repita a mesma chamada.

**Relatório (até 12 linhas).** O modelo usado e a fonte dele, a assinatura, o resultado do aceite, as hipóteses não confirmadas e o que falta para calibrar no staging.
