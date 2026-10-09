# L03: Conteúdo novo da base da Lia (`kb_chunks` sai do código)

**Objetivo.** Acrescentar 25 a 40 seções de conhecimento **factual** sobre a plataforma, os módulos, o blog e as publicações, o processo seletivo, as perguntas frequentes e os avisos de saúde. A reindexação (`apiAdminReindexKb` ou cron) grava tudo em `kb_chunks`. Linha inserida à mão no banco é apagada na próxima reindexação; por isso o conteúdo mora no código.

**Passo 0.** Leia:
- `worker/src/assistant/docs.js`: formato `GUIDE_MARKDOWN`, `chunkMarkdown` (divide por `## `, `CONTENT_MAX` = 1200 com o prefixo "Título — Seção. ") e `buildDocuments`;
- `worker/src/assistant/kb.js`: não repita o que as intenções já dizem;
- `worker/src/assistant/moderationRules.js`: `looksLikeInjection`, porque trecho com cara de instrução é descartado na busca;
- as fontes de fato: `frontend/blog/conteudo/{plataforma,modulos-1,modulos-2,liga,campanhas}.json`, `docs/blog/FATOS_VERIFICADOS_2026-10-09.md` e `frontend/legal/` (ou a Política onde estiver; use Glob);
- `worker/test/fixtures/rag-eval.json`: as perguntas negativas não podem passar a achar trecho.

**Arquivos-donos.** `worker/src/assistant/docsConteudo.js` e `worker/test/docsConteudo.test.js` (novos); `worker/src/assistant/docs.js` (só o import, a concatenação e o comentário de cabeçalho).

**Requisitos.**
1. `docsConteudo.js` exporta `CONTENT_DOCS`: uma lista `{ source, markdown }` no mesmo formato de `GUIDE_MARKDOWN`, com as fontes **exatamente** `plataforma`, `modulos`, `publicacoes`, `processo`, `faq` e `saude` (L08 usa esses ids nos rótulos).
2. Cada `## Seção` tem título único **em todo o corpus** (o golden set casa por título de seção), corpo de até 1000 caracteres, frase direta e afirmativa, sem imperativo dirigido à IA ("responda", "ignore", "diga que").
3. **Só fato que esteja nas fontes do passo 0.** O que for desconhecido vira "a definir pela diretoria". Nenhum nome de pessoa; nenhum e-mail além de `laiftligauninassau@gmail.com`; telefone só de serviço público de saúde que esteja nas fontes; nenhuma data ou vaga inventada.
4. `saude`: a Lia orienta sobre a plataforma e **não** faz diagnóstico, dose nem conduta. Em emergência, procure atendimento (use os serviços citados nas fontes). Conteúdo de estudo não substitui orientação profissional. As campanhas (por exemplo, Outubro Rosa) aparecem como publicações informativas.
5. `faq`: de 8 a 12 perguntas de uso, como conta, senha, crachá, eventos, módulos, cota da Lia, privacidade e onde ficam o blog e as publicações.
6. Em `docs.js`, importe `CONTENT_DOCS` e processe `GUIDE_MARKDOWN.concat(CONTENT_DOCS)` no mesmo laço, sem outra mudança de comportamento.
7. Teste (`docsConteudo.test.js`, Jest e ESM como os vizinhos):
   - as fontes estão na lista permitida;
   - os títulos de seção são únicos em `buildDocuments()`;
   - cada `content` tem até 1200 caracteres;
   - nenhum `content` passa em `looksLikeInjection`;
   - não há e-mail fora do oficial nem sequência de 8 ou mais dígitos fora de uma lista branca explícita no teste;
   - `buildDocuments().length` aumentou em pelo menos 25.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm test -- -i test/docsConteudo.test.js test/ragEval.test.js test/assistantKb.test.js test/ragService.test.js
```
Esperado: tudo verde; `ragEval` com 0 falsos positivos (se aparecer algum, reescreva a seção culpada; não edite o golden set, que é de L06).

**Regras.** Sem git, sem banco, sem flag. Cabeçalho de copyright; LF; arquivo com menos de 800 linhas e funções com menos de 50. GateGuard: se o hook pedir fatos na primeira criação ou edição, escreva 2 linhas (quem usa: `docs.js` → `ragService.reindex` → `kb_chunks`; a instrução: "inserir informações na tabela kb_chunks, deixar mais informações prévias") e repita a mesma chamada.

**Relatório (até 12 linhas).** Número de seções por fonte, a lista de títulos (uma linha por fonte), o resultado do aceite com a linha `[ragEval] recall@4` e os fatos que ficaram "a definir".
