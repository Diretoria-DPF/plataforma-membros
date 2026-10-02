# Agentes do Atlas 3D

Agentes fixos para executar e verificar o plano de melhoria do Atlas 3D gastando poucos tokens.
A sessão principal implementa; os agentes verificam ou produzem conteúdo em lotes.

| Agente | Modelo | Faz | Quando |
|---|---|---|---|
| `atlas-qa-mobile` | haiku | Roda unitários, validate-content e e2e (desktop + celular) e relata só falhas | Antes de cada push |
| `atlas-auditor` | haiku | Revisa o diff contra o checklist fixo (exports, CSP, LaiftDom, render sob demanda, PT, testes) | Antes de cada push |
| `atlas-tradutor-pt` | haiku | Traduz um lote `docs/atlas-traducao/lote-NN.txt` → `lote-NN.pt.tsv` | Onda 3 |
| `atlas-curador` | sonnet | Escreve ~20 fichas por lote em `content/<sistema>.json` | Onda 3 |
| `atlas-quiz-autor` | sonnet | Escreve casos de quiz com sids reais | Onda 3 |

## Fluxo de cada entrega
1. Implementar na sessão principal (branch de trabalho, nunca direto na `main`).
2. `atlas-qa-mobile` → corrigir o que falhar.
3. `atlas-auditor` → corrigir o que apontar.
4. Commit, push, PR; o CI `atlas-e2e` precisa ficar verde antes do merge.

## Regras para economizar tokens
- Agentes respondem em poucas linhas: "OK" ou `arquivo:linha — problema`.
- Nada de colar arquivos inteiros; ler só trechos com `grep`/`sed -n`.
- Conteúdo em lotes pequenos (20 fichas, 20 casos, 1 lote de nomes por chamada); vários lotes podem rodar em paralelo.
- Só escalar para a sessão principal o que falhar.

## Segurança
Nenhum agente pede, aceita ou grava chaves/tokens; segredos ficam só nos campos de segredo do GitHub/Cloudflare.
