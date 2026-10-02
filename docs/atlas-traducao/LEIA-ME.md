# Tradução dos nomes das estruturas (PT-BR)

- **Lotes:** `lote-01.txt` … `lote-20.txt` (≈70 nomes cada) somam os 1.382 nomes de exibição únicos de `structures.json` — sem lado e sem o prefixo HRA `VH_M_`/`VH_F_` (as versões M e F do órgão têm uma tradução só). Gerados por `node tools/atlas-content/make-lotes.mjs`, agrupados por sistema.
- **Prompt:** `prompt.md` (versionado). O agente `atlas-tradutor-pt` traduz um lote por chamada.
- **Correções:** `correcoes.tsv` (nome em inglês, PT corrigido, motivo) vence o lote. Revisão cruzada: `revisao-lotes.md`.
- **Integração:** `node tools/atlas-content/names-pt.mjs` grava `data/atlas/names-pt.json` (fonte canônica) e `namePt` em `generated/structures*.json`. Rodar de novo sempre que um `.pt.tsv`, o `correcoes.tsv` ou o `structures.json` mudar. `--check` só confere (formato, cobertura total e lint-pt).
- **Status (PR 3.1):** os 20 lotes traduzidos e integrados; 11 nomes em `names-pt.json → revisar` aguardam o conselho.
- **Resposta:** cada lote traduzido vira `lote-NN.pt.tsv`, com uma linha por nome no formato `nome em inglês<TAB>nome em português`, na mesma ordem do lote.
- **Nomes entre parênteses:** mantenha os parênteses também na tradução.

## Prompt para a IA de chat (colar antes do lote)

> Você é tradutor de anatomia humana para português do Brasil, seguindo a Terminologia Anatômica (SBA/FIPAT). Traduza cada nome abaixo. Regras: substantivo primeiro ('Posterior tibiofibular ligament' → 'Ligamento tibiofibular posterior'); use termos oficiais em PT-BR ('Músculo', 'Nervo', 'Artéria', 'Veia', 'Linfonodos', 'Giro', 'Sulco', 'Falange'); sem anglicismos; mantenha números, epônimos e parênteses. Responda SOMENTE com linhas no formato `nome em inglês<TAB>nome em português`, na mesma ordem, uma por linha, sem comentários. Se não tiver certeza, termine a linha com ` ??`.

## Conferência
- O número de linhas do `.pt.tsv` tem de ser igual ao do lote.
- Linhas terminadas em `??` precisam de revisão humana.
- Salvar sempre em branch + PR, nunca direto na `main`.
- No atlas, o nome curado do legado vence; depois vem `namePt` com o selo "Tradução assistida"; por fim o inglês.
