# T10 — Estruturas do fígado e outras sem ficha própria
**Quem faz:** outro chat (investigar) + você (decidir) · **Depende de:** T00 · **Estimativa:** 4 h

## Objetivo
Na revisão técnica da onda 04 apareceram sids do modelo 3D que **não têm ficha** porque o nome em português deles não foi agrupado com o de nenhuma ficha escrita: `za:vh-m-right-posterosuperior-segment`, `za:vh-m-left-anterolateral-segment`, `za:vh-m-left-posterolateral-segment`, `za:vh-m-left-inferomedial-segment`, `za:vh-f-caudate-lobe-of-liver`, `za:vh-f-quadrate-lobe-of-liver` (confirmar os nomes exatos com `grep` em `frontend/modulos/anatomia-3d/data/atlas/generated/structures.json`). O aluno toca nelas e vê "sem descrição".

## Arquivos
- `frontend/modulos/anatomia-3d/js/ui/structure-groups.js` — `contentCandidates(sid, groupSids)`: decide quais sids são consultados ao abrir uma ficha.
- `frontend/modulos/anatomia-3d/js/main.js` — `getContent(sid)` usa esses candidatos (procure `contentCandidates`).
- `frontend/modulos/anatomia-3d/data/atlas/` — onde ficaria um mapa novo, por exemplo `content-alias.json` (novo).
- `frontend/scripts/atlas/structure-groups.test.mjs` — testes existentes do agrupamento.
- **Não mexer:** `docs/atlas-conteudo/prioridades.json` e `tools/atlas-content/prioridades.mjs` — a lista de 300 tem um SHA-256 registrado em `docs/atlas-conteudo/cotas.md`, e qualquer mudança exige assinatura do conselho.

## Como fazer
1. Liste, com um script de 10 linhas (Node), todos os sids de `structures.json` que estão entre os 300 de `prioridades.json` **ou** que pertencem a um grupo de uma ficha, mas para os quais `getContent` devolve vazio. Anexe a lista ao PR.
2. Para cada sid sem ficha, decida (você) se vale a ficha de outra estrutura:
   - caudado `vh-f` = ficha do segmento I (`za:posterior-segment-of-liver-i`);
   - quadrado `vh-f` = IVb (hoje coberto por `za:vh-m-quadrate-lobe-of-liver`);
   - segmentos `vh-m` de Couinaud: usar a ficha do numeral correspondente (II, III, VII).
3. Implemente como **mapa de apelidos de conteúdo**: `data/atlas/content-alias.json` `{ "<sid sem ficha>": "<sid com ficha>" }`, lido uma vez em `main.js` e aplicado em `contentCandidates` (o sid apelidado entra na lista de candidatos depois dos do próprio grupo). Teste unitário: apelido resolve; ciclo não entra em laço; sid sem apelido continua igual.
4. A ficha mostrada para um sid apelidado deve dizer, no cabeçalho, a estrutura original (nome do sid tocado) e não o da ficha — confirme em `infocard.js` que o título vem da entrada tocada.

## Não fazer
- Não regenerar `prioridades.json`. Não escrever ficha nova sem passar pelo conselho. Não apelidar entre sistemas diferentes.

## Aceite
- [ ] Os 6 sids acima abrem uma ficha (teste unitário de `getContent` com o mapa).
- [ ] `node --test frontend/scripts/atlas/structure-groups.test.mjs` e `content-store.test.mjs` passam.
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e atlas-selos` passa.

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T10-fichas-sem-sid-proprio.md`. Comece só pela etapa 1 (listar os sids sem conteúdo) e me mostre a lista antes de implementar o mapa `content-alias.json`. Não altere `prioridades.json`.
