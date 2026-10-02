# Post-mortem — PR 3.0 "Correções críticas" (Onda 3)

- **PRs:** #10 (hotfix C2, C1, C6, mesclado em 02/10) e #11 (C3, C5, C7–C11, A.9 e A.10, mesclado em 02/10).
- **Parte técnica:** preenchida pelo Claude no início do PR 3.1.
- **Parte humana:** campos com ___, preencher na reunião.

## 1. O que estava quebrado e por que os testes não pegavam
| Crime | Causa raiz | Por que passou pelos testes | Teste que agora pega |
|---|---|---|---|
| C2 Toque não abre a estrutura | `registry.pick(ndc)` era chamado sem a câmera e devolvia `null` (quebrado desde o WP13). O sistema também carregava o órgão HRA **no lugar** do corpo Z-Anatomy (ventrículos e estômago nunca entravam). | Os e2e selecionavam pelo barramento (`STRUCTURE_SELECT`), nunca por toque ou clique real no canvas. | `atlas-pick`: toque (390) e clique (1280) reais em 5 sistemas, e toda resposta do quiz presente no corpo. |
| C1 "Ação não permitida" | Dois `delegateActions(document, …)` com listas diferentes: cada clique passava pelos dois. | Ninguém olhava o console. | `atlas-toolbar`: clica em todos os botões e exige console sem aviso. |
| C6 Moléculas mortas | Ações `MolEngine.*` fora de qualquer lista. | Sem e2e do modo. | `atlas-toolbar` (ações de Moléculas). |
| C3 Nomes repetidos | Índice por sid, com lados e versões M/F; o nome PT legado casava só um lado. | As suítes testavam a busca por termos que não tinham par. | `atlas-labels` (busca e navegador sem repetição), `structure-groups` e `content-store`. |
| C5 Rótulos empilhados | Sobreposição estimada com 80×18 px fixos; 12 rótulos em qualquer tela. | Nenhum teste media o DOM dos rótulos. | `atlas-labels`: no máximo min(6, largura/100) rótulos, sem sobreposição medida, "Rins" 1× com E/D. |
| C7 Camadas invisíveis | Painel no `<body>` sem posição, atrás do canvas **em qualquer tela**. | Os testes liam o estado, não a tela (`elementFromPoint`). | `atlas-layers-mobile`: 4 tamanhos, nomes por cima do canvas, interruptor, × e Esc. |
| C8 404 | Não reproduzido localmente. | — | `atlas.e2e` falha com qualquer recurso ≥ 400; `atlas-prod-check` lista as URLs. |
| C9 `allowfullscreen` | Atributo junto com `allow`. | Aviso só no console. | `atlas.e2e` confere o iframe. |
| C10 CSP jsDelivr | `chart.umd.min.js` aponta para o `.map`; com o DevTools aberto vira violação de `connect-src`. | Só aparece com o DevTools aberto. | `connect-src` liberado; `atlas-prod-check` registra CSP. |
| C11 MolEngine duplo | O script chamava `init()` ao carregar e os modos chamavam de novo. | Sem e2e. | `atlas-toolbar`: carga + 3 chamadas = 1 viewer. |

## 2. Lições
1. **Teste o gesto, não o evento.** Toda interação nova ganha um e2e com toque ou clique real e leitura do DOM (`elementFromPoint`, `getBoundingClientRect`), não do estado interno.
2. **Console limpo é critério.** Os e2e falham com aviso ou erro de console e com resposta HTTP ≥ 400 do Atlas.
3. **Dado real nos unitários.** O teste de grupos roda sobre o `structures.boot.json` de verdade, não só sobre fixtures.
4. **Auditoria externa paga.** Os 10 crimes vieram da "Prova de Fogo", não da CI. Manter a revisão humana em aparelho real em todo PR.

## 3. Itens humanos (gate da v1.0)
| Verificação | Resultado |
|---|---|
| `atlas-prod-check` em produção (C8: URL do 404; C10) | ___ |
| Smoke test em aparelho real | ___ |
| 3 alunos usam sem travar | ___ |
| NVDA navega do início ao fim | ___ |

## 4. Decisão
- [ ] PR 3.1 segue · [ ] volta para corrigir (itens: ___)
