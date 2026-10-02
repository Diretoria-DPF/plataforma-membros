# Agentes do Atlas 3D

Agentes fixos para executar e verificar o plano de melhoria do Atlas 3D gastando poucos tokens.
A sessão principal implementa; os agentes verificam ou produzem conteúdo em lotes.

| Agente | Modelo | Faz | Quando |
|---|---|---|---|
| `atlas-qa-mobile` | haiku | Roda unitários, validate-content e e2e (desktop + celular) e relata só falhas | Antes de cada push |
| `atlas-a11y` | haiku | Roda a suíte axe-core (WCAG 2.1 A/AA) e relata violações | Antes de cada push |
| `atlas-auditor` | haiku | Revisa o diff contra o checklist fixo (exports, CSP, LaiftDom, render sob demanda, PT, testes) | Antes de cada push |
| `atlas-tradutor-pt` | haiku | Traduz um lote `docs/atlas-traducao/lote-NN.txt` → `lote-NN.pt.tsv` | Onda 3 |
| `atlas-curador` | sonnet | Escreve ~20 fichas por lote em `content/<sistema>.json` | Onda 3 |
| `atlas-revisor-editorial` | sonnet | Revisão técnica prévia de cada lote; devolve correções (nunca aprova) | Onda 3, após cada lote |
| `atlas-quiz-autor` | sonnet | Escreve casos de quiz com sids reais | Onda 3 |

## Fluxo de cada entrega
1. Implementar na sessão principal (branch de trabalho, nunca direto na `main`).
2. `atlas-qa-mobile` → corrigir o que falhar.
3. `atlas-a11y` → corrigir violações sérias.
4. `atlas-auditor` → corrigir o que apontar.
5. Commit, push, PR; o CI `atlas-e2e` precisa ficar verde antes do merge.
6. Gate humano da onda (fora dos agentes): 3 alunos em think-aloud (20 min), 1 aparelho físico (`docs/atlas-qa/ios.md`) e, na Onda 3, revisão do conselho editorial.

Conteúdo: curador → revisor-editorial → correções → publicação com status `editorial` ("Em revisão pelo conselho editorial da LAIFT"). Só o conselho humano muda para `reviewed`.

## Regras para economizar tokens
- Agentes respondem em poucas linhas: "OK" ou `arquivo:linha — problema`.
- Nada de colar arquivos inteiros; ler só trechos com `grep`/`sed -n`.
- Conteúdo em lotes pequenos (20 fichas, 20 casos, 1 lote de nomes por chamada); vários lotes podem rodar em paralelo.
- Só escalar para a sessão principal o que falhar.

## Segurança
Nenhum agente pede, aceita ou grava chaves/tokens; segredos ficam só nos campos de segredo do GitHub/Cloudflare.
