# L09: Integração no `assistantService` (dono único do arquivo quente)

**Objetivo.** Ligar ao fluxo da Lia o registro (L04), a seleção (L05) e a pesquisa externa (L07), cada um atrás da **sua** flag, desligada por padrão. Com as três flags desligadas, o comportamento e as respostas ficam **idênticos** aos de hoje.

**Passo 0.** Leia `worker/src/services/assistantService.js` inteiro (344 linhas): `askAi` (142), `retrieveContext` (212), `answerFromKnowledge` (268), `recordAnswer` (282), `askWithKnowledge` (299) e `chat` (311). Leia também `worker/test/assistantService.test.js` (como as flags e o banco são simulados), `researchLogService.js` (L04), `rerankService.js` e `ragService.retrieve(…, opts)` (L05), `researchService.js` (L07) e o contrato de retorno em `docs/lia/fichas/L07-pesquisa-externa.md` e `L08-interacao-front.md`. Se faltar algum desses arquivos, pare e reporte.

**Arquivos-donos.** `worker/src/services/assistantService.js` e `worker/test/assistantService.test.js`.

**Requisitos.**
1. Flags novas (constantes locais, como `FLAG_RAG`): `rag_cache_enabled`, `rag_rerank_enabled` e `research_enabled`. Leia pela `flagOn` existente, que falha fechada.
2. **Registro de respostas** (`rag_cache_enabled`), dentro de `answerFromKnowledge`, **antes** da busca e sem gastar cota:
   - só para `role === MEMBER`, `history.length === 0` e `isCacheable(message)`;
   - `ResearchLog.lookup(sql, { provider: 'kb', question: message, kbVersion })`, com `kbVersion` calculado uma vez por isolate (memorizado) a partir de `buildDocuments()`;
   - acerto `answered` → `answer({ reply, sources, source: 'ai', cached: true })`;
   - acerto `empty` → `staticKbFallback(MSG_KB_EMPTY)`, sem embedding;
   - depois da resposta: resposta `ai` não degradada e com `sources` → `record(... 'answered', { reply, sources })`; caminho `MSG_KB_EMPTY` → `record(... 'empty', {})`.
3. **Seleção** (`rag_rerank_enabled`): `retrieveContext` passa `{ rerank: true }` a `Rag.retrieve`. Se vier `answerable === false`, trate como sem trechos (`MSG_KB_EMPTY`), sem chamar o LLM.
4. **Pesquisa externa** (`research_enabled`):
   - em `chat`, com `input.research === true`, depois da validação, do limite por hora, da moderação e do filtro de injeção (a ordem atual se mantém), devolva `ResearchService.research(sql, env, identity, message, correlationId)`. Não grave em `assistant_messages`;
   - `canResearch: true` nas respostas de `askWithKnowledge` quando a flag estiver ligada para a pessoa, houver `identity`, `isCacheable(message)` e `source` for `kb` ou `ai`.
5. Nenhuma action nova, nenhuma mudança em `handlers.js` e `constants.js`, nenhum dado pessoal novo gravado. Funções com menos de 50 linhas: extraia funções auxiliares se precisar. O arquivo deve ficar abaixo de 450 linhas.
6. Testes novos:
   - flags desligadas → os testes existentes passam **sem mudança** nas expectativas;
   - cache `answered`: não chama `Rag.retrieve` nem gasta cota e devolve `cached: true`;
   - cache `empty` → `MSG_KB_EMPTY` sem busca;
   - admin e pergunta com histórico não usam o registro;
   - `answerable: false` → não chama o LLM;
   - `research: true` com a flag ligada → roteia e não grava a mensagem; com a flag desligada → resposta `disabled` do serviço;
   - `canResearch` só aparece nas condições do item 4;
   - pergunta com e-mail não é registrada.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm test -- -i test/assistantService.test.js test/handlers.test.js test/researchService.test.js test/researchLogService.test.js test/rerankService.test.js test/ragService.test.js
```

**Regras.** Sem git, sem banco de produção, sem flag e sem segredo. Não edite os arquivos de L04, L05 e L07; se algum tiver defeito, reporte o trecho. Cabeçalho mantido; LF. GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: `handlers.js` `apiAssistantChat` → `chat`; a instrução: "registrar as pesquisas… integrar outro sistema de pesquisa… escolha mais assertiva", tudo atrás de flag desligada) e repita a mesma chamada.

**Relatório (até 12 linhas).** O diff resumido por função, o número de linhas do arquivo, os testes novos, o resultado do aceite e a ordem recomendada para ligar as flags.
