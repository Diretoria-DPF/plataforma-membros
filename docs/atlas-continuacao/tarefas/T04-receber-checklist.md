# T04 — Receber o checklist assinado e publicar o lote
**Quem faz:** você + outro chat · **Depende de:** T02 (fichas) ou T03 (quiz) e do retorno do conselho · **Estimativa:** 1 h por lote

## Objetivo
Transformar o `checklist.md` preenchido pelo conselho em conteúdo no ar, sem inventar nada.

## Arquivos
- `docs/atlas-conteudo/revisao-lote-1.md`, `revisao-lote-2.md`, `revisao-lote-3.md`, `revisao-lote-4a.md` — hoje em branco; o arquivo devolvido substitui o branco **exatamente como veio**.
- `docs/atlas-conteudo/guia-revisao.md` — regras (90%, aprovação em bloco, prazos).
- Scripts: `frontend/scripts/atlas/checklist-lote.mjs`, `aplicar-lote.mjs` (T02) ou `aplicar-quiz.mjs` (T03).

## Como fazer (repita para cada lote)
1. Salve o arquivo devolvido sobre `docs/atlas-conteudo/revisao-lote-N.md` **sem editar uma vírgula**. Commit só desse arquivo: "docs: checklist assinado do lote N (recebido do conselho)".
2. Confira: `cd frontend && node scripts/atlas/checklist-lote.mjs ../docs/atlas-conteudo/revisao-lote-N.md`. Deve mostrar `aprovado` ou `aprovado com ressalvas` e a % de aprovadas (mínimo 90%).
3. Se mostrar `reprovado` ou `não assinado`: **pare**. Peça ao conselho o checklist completo (cabeçalho, registro, data) ou a refação das fichas reprovadas.
4. `node scripts/atlas/aplicar-lote.mjs N --dry` (ou `aplicar-quiz.mjs --dry`) e leia o resumo.
5. Abra `docs/atlas-conteudo/ressalvas-lote-N.md`. Para cada ressalva com texto literal ("trocar X por Y"), aplique-a na ficha pendente (`docs/atlas-conteudo/fichas/pendente/onda-NN/lote-*.json`) com `--incluir-ressalvas` depois. Ressalva ambígua: a ficha fica fora até nova rodada.
6. Rode o script sem `--dry`, depois `bash docs/atlas-continuacao/validar.sh --e2e atlas-selos` e abra o PR "Lote N do conselho no ar".
7. Peça a **autorização de merge** ao dono do projeto. Depois do merge, confira no atlas se as fichas mostram "✓ Revisado por …".
8. Reprovadas: devolva ao curador (agente `atlas-curador`) com o motivo; elas voltam no checklist do lote seguinte.

## Não fazer
- Não preencher nem corrigir cabeçalho, assinatura, registro ou data. Não "aprovar em bloco" no lugar do conselho. Não mesclar sem autorização.

## Aceite
- [ ] `revisao-lote-N.md` é idêntico ao arquivo recebido (`diff` vazio).
- [ ] `node scripts/atlas/check-curated-signed.mjs` mostra o lote em "lotes assinados".
- [ ] No atlas, uma ficha aprovada mostra o selo ✓ com o nome e a data do checklist.

## Prompt pronto
(Etapas 4 a 6, depois de você salvar o checklist.) O checklist assinado do lote N está em `docs/atlas-conteudo/revisao-lote-N.md`. Rode `node scripts/atlas/aplicar-lote.mjs N --dry` (em `frontend/`), mostre o resumo e as ressalvas de `docs/atlas-conteudo/ressalvas-lote-N.md`. Não edite o checklist. Aplique as ressalvas literais nas fichas pendentes e rode o script sem `--dry`. Depois rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-selos` e mostre o resumo.
