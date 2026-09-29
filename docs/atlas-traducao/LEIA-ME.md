# Tradução dos nomes das estruturas (PT-BR)

- **Lotes:** `lote-01.txt` … `lote-10.txt` somam os 1.412 nomes únicos em inglês de `structures.json`, sem o sufixo de lado.
- **Resposta:** cada lote traduzido vira `lote-NN.pt.tsv`, com uma linha por nome no formato `nome em inglês<TAB>nome em português`, na mesma ordem do lote.
- **Nomes entre parênteses:** mantenha os parênteses também na tradução.

## Prompt para a IA de chat (colar antes do lote)

> Você é tradutor de anatomia humana para português do Brasil, seguindo a Terminologia Anatômica (SBA/FIPAT). Traduza cada nome abaixo. Regras: substantivo primeiro ('Posterior tibiofibular ligament' → 'Ligamento tibiofibular posterior'); use termos oficiais em PT-BR ('Músculo', 'Nervo', 'Artéria', 'Veia', 'Linfonodos', 'Giro', 'Sulco', 'Falange'); sem anglicismos; mantenha números, epônimos e parênteses. Responda SOMENTE com linhas no formato `nome em inglês<TAB>nome em português`, na mesma ordem, uma por linha, sem comentários. Se não tiver certeza, termine a linha com ` ??`.

## Conferência
- O número de linhas do `.pt.tsv` tem de ser igual ao do lote.
- Linhas terminadas em `??` precisam de revisão humana.
- Salvar sempre em branch + PR, nunca direto na `main`.
- A integração no atlas (`namePt` + selo "Tradução assistida") será feita pelo Claude.
